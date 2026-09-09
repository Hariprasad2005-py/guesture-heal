// frontend/src/hooks/usePoseDetection.js
import { useCallback, useEffect, useRef, useState } from "react";

const SMOOTHING_ALPHA = 0.3;
const VISIBILITY_THRESHOLD = 0.4;
const LOST_TIMEOUT_MS = 1200;
const NEVER_TRACKED_STATUS = "never_tracked";

// Hysteresis for switching which hand drives the cursor/basket/trace.
// Both these guards must be satisfied before we commit to a switch, so a
// momentary crossing of the two wrists' heights doesn't cause jitter.
const SIDE_SWITCH_HEIGHT_DELTA = 0.08; // 8% of frame height difference required
const SIDE_SWITCH_SUSTAIN_FRAMES = 4; // must hold for this many consecutive frames

// Throttle debug logging — matches useMediaPipeUpperBody's rate so the
// two checkpoints can be compared frame-for-frame in the console.
const LOG_EVERY_N_FRAMES = 15;

// Defensive clamp — a landmark extrapolated outside the visible frame can
// report x/y outside [0,1]. Even though such landmarks are filtered out
// below by the confidence gate, this guarantees that IF a value ever does
// reach the percentage conversion, it can never push the cursor off-canvas.
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function usePoseDetection(poseData, { hasCamera = true } = {}) {
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [velocity, setVelocity] = useState(0);
  const [shoulderAngle, setShoulderAngle] = useState(0);
  const [activeSide, setActiveSide] = useState("left");
  const [status, setStatus] = useState(hasCamera ? NEVER_TRACKED_STATUS : "no_camera");
  const [isMouseMode, setIsMouseMode] = useState(!hasCamera);
  const [rawAngle, setRawAngle] = useState(0);
  const [smoothAngle, setSmoothAngle] = useState(0);
  // true only once a real, confident wrist position has been used to set
  // `position` at least once. UI must use this (not just checking
  // position !== initial) to tell "genuinely tracked at 50/50" apart from
  // "never acquired, still showing the placeholder default."
  const [hasTrackedOnce, setHasTrackedOnce] = useState(false);

  const [leftShoulderAngle, setLeftShoulderAngle] = useState(null);
  const [rightShoulderAngle, setRightShoulderAngle] = useState(null);

  const lastPositionRef = useRef({ x: 50, y: 50 });
  const lastTimestampRef = useRef(performance.now());
  const lastPoseTimestampRef = useRef(0);
  const angleHistoryRef = useRef([]);
  const leftAngleHistoryRef = useRef([]);
  const rightAngleHistoryRef = useRef([]);

  const activeSideRef = useRef("left");
  const switchCandidateRef = useRef({ side: null, frames: 0 });

  const frameCounterRef = useRef(0);
  const effectRunCounterRef = useRef(0);

  const handleMouseMove = useCallback(
    (event) => {
      if (!isMouseMode) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const next = {
        x: Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
        y: Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)),
      };

      lastPositionRef.current = next;
      setPosition(next);
      setStatus("tracking");
      console.log("[MP-PIPELINE][3-position] source=MOUSE (isMouseMode=true)", next);
    },
    [isMouseMode]
  );

  // Decides which wrist should drive the cursor this frame, only actually
  // switching once the height gap has been sustained for several frames.
  const resolveActiveSide = useCallback((raw, leftVisible, rightVisible) => {
    if (leftVisible && !rightVisible) {
      switchCandidateRef.current = { side: null, frames: 0 };
      activeSideRef.current = "left";
      return "left";
    }
    if (!leftVisible && rightVisible) {
      switchCandidateRef.current = { side: null, frames: 0 };
      activeSideRef.current = "right";
      return "right";
    }

    const diff = raw.leftWrist.y - raw.rightWrist.y; // negative => left is higher
    if (Math.abs(diff) < SIDE_SWITCH_HEIGHT_DELTA) {
      switchCandidateRef.current = { side: null, frames: 0 };
      return activeSideRef.current;
    }

    const candidateSide = diff < 0 ? "left" : "right";
    if (candidateSide === activeSideRef.current) {
      switchCandidateRef.current = { side: null, frames: 0 };
      return activeSideRef.current;
    }

    if (switchCandidateRef.current.side === candidateSide) {
      switchCandidateRef.current.frames += 1;
    } else {
      switchCandidateRef.current = { side: candidateSide, frames: 1 };
    }

    if (switchCandidateRef.current.frames >= SIDE_SWITCH_SUSTAIN_FRAMES) {
      activeSideRef.current = candidateSide;
      switchCandidateRef.current = { side: null, frames: 0 };
    }

    return activeSideRef.current;
  }, []);

  useEffect(() => {
    effectRunCounterRef.current += 1;
    const shouldLogEffect = effectRunCounterRef.current % LOG_EVERY_N_FRAMES === 0;

    if (isMouseMode) return;

    // [DEBUG-A] poseData received — logged every time this effect runs,
    // i.e. every time `poseData` (or isMouseMode/resolveActiveSide)
    // changed identity. If this stops incrementing/logging while you're
    // moving your hand, poseData isn't reaching this hook at all — the
    // bug is upstream (parent state wiring), not in this file.
    if (shouldLogEffect) {
      console.log("[DEBUG-A] poseData received", {
        effectRun: effectRunCounterRef.current,
        timestamp: poseData?.timestamp,
        leftWrist: poseData?.raw?.leftWrist,
        rightWrist: poseData?.raw?.rightWrist,
        isMouseMode,
      });
    }

    if (!poseData?.raw) {
      if (
        lastPoseTimestampRef.current &&
        performance.now() - lastPoseTimestampRef.current > LOST_TIMEOUT_MS
      ) {
        setStatus("lost");
      }
      return;
    }

    const { raw } = poseData;

    // FIX (root cause of cursor stuck at 50/50 despite vis=0.992):
    // the previous gate was Math.min(visibility, presence) > THRESHOLD.
    // PoseLandmarker's image-space `landmarks` array does not reliably
    // populate `presence` in every model/runtime configuration — it
    // frequently comes back `undefined`, which pointFromLandmarks()
    // coerces to 0 via `?? 0`. Math.min(0.992, 0) = 0, which is NOT
    // > VISIBILITY_THRESHOLD, so the "both invisible" branch below fired
    // on every frame regardless of how confident visibility actually was.
    // `visibility` has now been proven reliable and correctly-changing
    // across two independent debug sessions (including the earlier
    // legitimate off-screen case, where low visibility alone was already
    // sufficient to reject it). Gate on visibility only; presence is
    // still logged for diagnostics but no longer vetoes a confident
    // visibility reading.
    const leftVisibility = raw.leftWrist?.visibility ?? 0;
    const rightVisibility = raw.rightWrist?.visibility ?? 0;
    const leftVisible = leftVisibility > VISIBILITY_THRESHOLD;
    const rightVisible = rightVisibility > VISIBILITY_THRESHOLD;

    frameCounterRef.current += 1;
    const shouldLog = frameCounterRef.current % LOG_EVERY_N_FRAMES === 0;

    // [DEBUG-B] after visibility check
    if (shouldLog) {
      console.log("[DEBUG-B] after visibility check", {
        leftVisibility: leftVisibility.toFixed(3),
        leftPresence: raw.leftWrist?.presence, // logged only, not gated on
        leftVisible,
        rightVisibility: rightVisibility.toFixed(3),
        rightPresence: raw.rightWrist?.presence, // logged only, not gated on
        rightVisible,
        threshold: VISIBILITY_THRESHOLD,
      });
    }

  if (!leftVisible && !rightVisible) {
      if (shouldLog) {
        console.log("[DEBUG-C] after side resolution", { selected: "none — both below threshold" });
      }
      // Apply the SAME grace period as the "no poseData.raw at all"
      // branch above, instead of instantly declaring "lost". A single
      // frame of visibility dipping just under VISIBILITY_THRESHOLD —
      // very common right as a reaching arm approaches an edge target —
      // was previously freezing the cursor AND disabling hit detection
      // (PrecisionReach only evaluates hits while status === "tracking")
      // on that one frame alone. Now status only flips to "lost" — and
      // position only stops updating — after LOST_TIMEOUT_MS of
      // sustained low confidence, matching the other loss path.
      if (
        lastPoseTimestampRef.current &&
        performance.now() - lastPoseTimestampRef.current > LOST_TIMEOUT_MS
      ) {
        setStatus((prev) => (hasTrackedOnce ? "lost" : NEVER_TRACKED_STATUS));
      }
      return;
    }

    const side = resolveActiveSide(raw, leftVisible, rightVisible);
    const wrist = side === "left" ? raw.leftWrist : raw.rightWrist;
    const clampedWrist = { x: clamp01(wrist.x), y: clamp01(wrist.y) };

    // [DEBUG-C] after side resolution
    if (shouldLog) {
      console.log("[DEBUG-C] after side resolution", {
        selected: side,
        raw: { x: wrist.x.toFixed(3), y: wrist.y.toFixed(3) },
        clamped: { x: clampedWrist.x.toFixed(3), y: clampedWrist.y.toFixed(3) },
      });
    }

    // Mirror x for front-facing camera
    const target = {
      x: (1 - clampedWrist.x) * 100,
      y: clampedWrist.y * 100,
    };

    const previous = lastPositionRef.current;
    const now = performance.now();
    const dt = Math.max((now - lastTimestampRef.current) / 1000, 1 / 60);

    const smoothed = {
      x: previous.x + (target.x - previous.x) * SMOOTHING_ALPHA,
      y: previous.y + (target.y - previous.y) * SMOOTHING_ALPHA,
    };

    // [DEBUG-D] before setPosition
    if (shouldLog) {
      console.log("[DEBUG-D] before setPosition", {
        target: { x: target.x.toFixed(2), y: target.y.toFixed(2) },
        previous: { x: previous.x.toFixed(2), y: previous.y.toFixed(2) },
        smoothed: { x: smoothed.x.toFixed(2), y: smoothed.y.toFixed(2) },
      });
    }

    const distance = Math.hypot(smoothed.x - previous.x, smoothed.y - previous.y);

    lastPositionRef.current = smoothed;
    lastTimestampRef.current = now;
    lastPoseTimestampRef.current = now;

    if (!hasTrackedOnce) setHasTrackedOnce(true);
    setPosition(smoothed);
    setVelocity((distance / dt) * 60);
    setActiveSide(side);
    setStatus("tracking");

    const angle = poseData.maxShoulderAngle || 0;
    setRawAngle(angle);

    angleHistoryRef.current = [...angleHistoryRef.current, angle].slice(-5);
    const avgAngle =
      angleHistoryRef.current.reduce((a, b) => a + b, 0) / angleHistoryRef.current.length;
    setSmoothAngle(avgAngle);
    setShoulderAngle(avgAngle);

    if (typeof poseData.leftShoulderAngle === "number") {
      leftAngleHistoryRef.current = [...leftAngleHistoryRef.current, poseData.leftShoulderAngle].slice(-5);
      const avgLeft =
        leftAngleHistoryRef.current.reduce((a, b) => a + b, 0) / leftAngleHistoryRef.current.length;
      setLeftShoulderAngle(avgLeft);
    }
    if (typeof poseData.rightShoulderAngle === "number") {
      rightAngleHistoryRef.current = [...rightAngleHistoryRef.current, poseData.rightShoulderAngle].slice(-5);
      const avgRight =
        rightAngleHistoryRef.current.reduce((a, b) => a + b, 0) / rightAngleHistoryRef.current.length;
      setRightShoulderAngle(avgRight);
    }
  }, [poseData, isMouseMode, resolveActiveSide, hasTrackedOnce]);

  // [DEBUG-E] after state/render — runs once React has actually committed
  // a new `position`, so this proves (or disproves) that the value this
  // hook RETURNS is the one that changed, as opposed to some local
  // variable inside the effect that never made it out via state.
  const debugERunCounterRef = useRef(0);
  useEffect(() => {
    debugERunCounterRef.current += 1;
    if (debugERunCounterRef.current % LOG_EVERY_N_FRAMES === 0) {
      console.log("[DEBUG-E] after state/render — returned position", {
        x: position.x.toFixed(2),
        y: position.y.toFixed(2),
      });
    }
  }, [position]);

  const toggleMouseMode = useCallback((value) => {
    setIsMouseMode((current) => (typeof value === "boolean" ? value : !current));
  }, []);

  return {
    position,
    velocity,
    shoulderAngle,
    smoothAngle,
    rawAngle,
    activeSide,
    status,
    hasTrackedOnce,
    isMouseMode,
    toggleMouseMode,
    handleMouseMove,
    leftShoulderAngle,
    rightShoulderAngle,
  };
}

export default usePoseDetection;