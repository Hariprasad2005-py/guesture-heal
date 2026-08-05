// frontend/src/hooks/usePoseDetection.js
import { useCallback, useEffect, useRef, useState } from "react";

const SMOOTHING_ALPHA = 0.3;
const VISIBILITY_THRESHOLD = 0.4;
const LOST_TIMEOUT_MS = 1200;

// Hysteresis for switching which hand drives the cursor/basket/trace.
// Both these guards must be satisfied before we commit to a switch, so a
// momentary crossing of the two wrists' heights doesn't cause jitter.
const SIDE_SWITCH_HEIGHT_DELTA = 0.08; // 8% of frame height difference required
const SIDE_SWITCH_SUSTAIN_FRAMES = 4; // must hold for this many consecutive frames

export function usePoseDetection(poseData, { hasCamera = true } = {}) {
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [velocity, setVelocity] = useState(0);
  const [shoulderAngle, setShoulderAngle] = useState(0);
  const [activeSide, setActiveSide] = useState("left");
  const [status, setStatus] = useState(hasCamera ? "tracking" : "no_camera");
  const [isMouseMode, setIsMouseMode] = useState(!hasCamera);
  const [rawAngle, setRawAngle] = useState(0);
  const [smoothAngle, setSmoothAngle] = useState(0);

  // NEW — bilateral shoulder angles, tracked independently of `activeSide`.
  // `activeSide`/`shoulderAngle` above are still the single "whichever
  // wrist is driving the cursor" value used by every existing game;
  // nothing about that behavior changes.
  //
  // IMPORTANT: these ONLY populate if `poseData.leftShoulderAngle` /
  // `poseData.rightShoulderAngle` are supplied upstream. As of the
  // useMediaPipeUpperBody.js this hook was paired with at the time of
  // writing, poseData only exposes a single `maxShoulderAngle` (already
  // the max of both sides) — not the two sides separately. So until
  // useMediaPipeUpperBody is extended to also emit per-side angles, these
  // two values will stay `null`. Callers MUST treat null as "not
  // available yet" and never substitute 0 — 0 would misrepresent as "no
  // range of motion" rather than "not measured."
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

    // Both visible: only reconsider if the height gap is large enough to
    // matter, and only commit after several consecutive frames agree.
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
    if (isMouseMode) return;

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

    const leftVisible = raw.leftWrist?.visibility > VISIBILITY_THRESHOLD;
    const rightVisible = raw.rightWrist?.visibility > VISIBILITY_THRESHOLD;

    if (!leftVisible && !rightVisible) {
      setStatus("lost");
      return;
    }

    const side = resolveActiveSide(raw, leftVisible, rightVisible);
    const wrist = side === "left" ? raw.leftWrist : raw.rightWrist;

    // Mirror x for front-facing camera
    const target = {
      x: (1 - wrist.x) * 100,
      y: wrist.y * 100,
    };

    const previous = lastPositionRef.current;
    const now = performance.now();
    const dt = Math.max((now - lastTimestampRef.current) / 1000, 1 / 60);

    const smoothed = {
      x: previous.x + (target.x - previous.x) * SMOOTHING_ALPHA,
      y: previous.y + (target.y - previous.y) * SMOOTHING_ALPHA,
    };

    const distance = Math.hypot(smoothed.x - previous.x, smoothed.y - previous.y);

    lastPositionRef.current = smoothed;
    lastTimestampRef.current = now;
    lastPoseTimestampRef.current = now;

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

    // NEW — additive only. Same 5-frame smoothing pattern as the primary
    // angle above, applied independently per side, and only when upstream
    // actually supplies the raw per-side values.
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
  }, [poseData, isMouseMode, resolveActiveSide]);

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
    isMouseMode,
    toggleMouseMode,
    handleMouseMove,
    // NEW
    leftShoulderAngle,
    rightShoulderAngle,
  };
}

export default usePoseDetection;