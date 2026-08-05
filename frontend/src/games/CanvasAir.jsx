// frontend/src/games/CanvasAir.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";

import useMediaPipeUpperBody from "../hooks/useMediaPipeUpperBody";
import useHandTracking from "../hooks/useHandTracking";
import usePoseDetection from "../hooks/usePoseDetection";
import usePostureGuidance from "../hooks/usePostureGuidance";
import useFacialPainDetection from "../hooks/useFacialPainDetection";
import useAdaptiveDifficulty from "../hooks/useAdaptiveDifficulty";
import { useGameEngine, GAME_STATES } from "../hooks/useGameEngine";
import { useSessionTelemetry } from "../hooks/useSessionTelemetry";
import { useAudioFeedback } from "../hooks/useAudioFeedback";
import { samplePath, createPathCoverageTracker } from "../utils/svgPathSampler";
import SkeletonOverlay from "../components/rehab/SkeletonOverlay";
import SessionSummary from "../components/rehab/SessionSummary";
import MetricsEngine from "../utils/metricsEngine";

const SESSION_SECONDS = 120;
const SHAPE_COMPLETE_THRESHOLD = 85; // % of path that must be traced
const TRACE_TOLERANCE_UNITS = 5; // how close to the line counts as "on it" (0-100 viewBox)
const MIN_TRACE_TOLERANCE_UNITS = 2.5; // floor for precision-mode tightening
const SHAPE_TIME_LIMIT_SECONDS = 15; // time allowed per shape before it counts as missed
const SPARKLE_LIFETIME_MS = 700;

const SHAPES = {
  Beginner: [
    { path: "M20 50 L80 50", name: "Line" },
    { path: "M20 20 L80 80", name: "Diagonal" },
    { path: "M50 20 L50 80", name: "Vertical" },
    { path: "M20 80 L80 20", name: "Diagonal" },
  ],
  Intermediate: [
    { path: "M25 25 L75 25 L75 75 L25 75 Z", name: "Square" },
    { path: "M50 15 A35 35 0 1 1 49.99 15", name: "Circle" },
    { path: "M20 80 L50 20 L80 80 Z", name: "Triangle" },
    { path: "M25 50 L50 25 L75 50 L50 75 Z", name: "Diamond" },
  ],
  Advanced: [
    { path: "M50 15 A35 35 0 1 1 49.99 15", name: "Circle" },
    { path: "M20 80 L35 20 L65 20 L80 80 L50 60 Z", name: "Star" },
    { path: "M20 50 Q50 0 80 50 Q50 80 20 50", name: "Heart" },
    { path: "M25 25 L75 25 L50 75 Z", name: "Triangle" },
  ],
};

// Color-coded biofeedback bands (Enhancement #3). Pure function, no
// component state, so it's safe to call from anywhere during render.
// `pulse` is the animation-duration in seconds for the shape's pulse
// effect — faster pulse = better form, matching the "heart-rate-like"
// feedback spec.
function getAccuracyBand(pct) {
  if (pct >= 90) return { label: "Smooth, controlled", stroke: "#22c55e", text: "text-green-400", pulse: 0.7 };
  if (pct >= 70) return { label: "Steady improvement", stroke: "#3b82f6", text: "text-blue-400", pulse: 1.1 };
  if (pct >= 50) return { label: "Needs focus", stroke: "#f97316", text: "text-orange-400", pulse: 1.6 };
  return { label: "Slow down, be deliberate", stroke: "#ef4444", text: "text-red-400", pulse: 2.4 };
}

export default function CanvasAir({ onSessionEnd, patientId, gameId = "canvas-air" }) {
  const videoRef = useRef(null);
  const [poseData, setPoseData] = useState(null);

  // ---- Existing single-hand state (UNCHANGED) ----
  const [trace, setTrace] = useState([]);
  const [completed, setCompleted] = useState(0);
  const [currentShapeIndex, setCurrentShapeIndex] = useState(0);
  const [shapeProgress, setShapeProgress] = useState(0);
  const [showShapeComplete, setShowShapeComplete] = useState(false);
  const [isTracing, setIsTracing] = useState(false);
  const [stars, setStars] = useState(0);
  const [score, setScore] = useState(0);
  const [repData, setRepData] = useState([]);
  const [tracingAccuracy, setTracingAccuracy] = useState(0);
  const [missed, setMissed] = useState(0);
  const [showShapeMissed, setShowShapeMissed] = useState(false);
  const [shapeTimeLeft, setShapeTimeLeft] = useState(SHAPE_TIME_LIMIT_SECONDS);
  const [calibrated, setCalibrated] = useState(false);

  // ---- NEW: hand mode. Locked to whatever it was when the session
  // started (only changeable from the instructions screen) so switching
  // it never re-initializes the hand landmarker mid-session. ----
  const [handMode, setHandMode] = useState("single"); // "single" | "symmetry"

  // ---- NEW: symmetry-mode state (parallel to the single-hand state
  // above, only ever touched when handMode === "symmetry") ----
  const [traceLeft, setTraceLeft] = useState([]);
  const [traceRight, setTraceRight] = useState([]);
  const [shapeProgressLeft, setShapeProgressLeft] = useState(0);
  const [shapeProgressRight, setShapeProgressRight] = useState(0);
  const [tracingAccuracyLeft, setTracingAccuracyLeft] = useState(0);
  const [tracingAccuracyRight, setTracingAccuracyRight] = useState(0);
  const [isTracingLeft, setIsTracingLeft] = useState(false);
  const [isTracingRight, setIsTracingRight] = useState(false);
  const [guidePointsRight, setGuidePointsRight] = useState([]);

  // ---- NEW: streak / combo / precision-mode / sparkle trail (apply to
  // both modes, driven centrally from onRepComplete below) ----
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [celebrateStreak, setCelebrateStreak] = useState(null);
  const [dynamicTolerance, setDynamicTolerance] = useState(TRACE_TOLERANCE_UNITS);
  const [sparkles, setSparkles] = useState([]);
  const comboMultiplierRef = useRef(1);

  const minAngleRef = useRef(null);
  const maxAngleRef = useRef(0);
  // NEW: per-side ROM, only ever populated if usePoseDetection is able to
  // supply leftShoulderAngle/rightShoulderAngle (see that hook's doc
  // comment — depends on useMediaPipeUpperBody exposing them).
  const leftMinAngleRef = useRef(null);
  const leftMaxAngleRef = useRef(0);
  const rightMinAngleRef = useRef(null);
  const rightMaxAngleRef = useRef(0);

  const hasEndedRef = useRef(false);
  const metricsEngine = useRef(new MetricsEngine());

  const sampledPathRef = useRef([]);
  const trackerRef = useRef(null);
  const tracingStatsRef = useRef({ totalSamples: 0, onPathSamples: 0 });

  // NEW: symmetry-mode trackers
  const trackerLeftRef = useRef(null);
  const trackerRightRef = useRef(null);
  const statsLeftRef = useRef({ totalSamples: 0, onPathSamples: 0 });
  const statsRightRef = useRef({ totalSamples: 0, onPathSamples: 0 });

  const { isActive, error: poseError, calibrate, calibrationData } = useMediaPipeUpperBody({
    videoRef,
    onPoseUpdate: setPoseData,
  });

  // numHands only switches between session attempts (see useHandTracking's
  // doc comment on why this must not change mid-session). handMode is only
  // editable from the instructions screen below, so this is safe.
  const {
    fingertip,
    leftHand,
    rightHand,
    isReady: handReady,
    error: handError,
  } = useHandTracking({ videoRef, numHands: handMode === "symmetry" ? 2 : 1 });

  useEffect(() => {
    if (!isActive || calibrated) return undefined;
    let cancelled = false;
    calibrate().then(() => {
      if (!cancelled) setCalibrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isActive, calibrated, calibrate]);

  const { shoulderAngle, leftShoulderAngle, rightShoulderAngle } = usePoseDetection(poseData);
  const guidance = usePostureGuidance(poseData, calibrationData);
  const { papsScore, isPainDetected, resetPainState } = useFacialPainDetection({ videoRef });
  const { currentDifficulty, adapt } = useAdaptiveDifficulty();
  const telemetry = useSessionTelemetry(patientId, gameId);
  const audio = useAudioFeedback(true);

  const shapeList = useMemo(() => SHAPES[currentDifficulty] || SHAPES.Beginner, [currentDifficulty]);
  const currentShape = shapeList[currentShapeIndex % shapeList.length];
  const shapePath = currentShape?.path || "M20 50 L80 50";
  const totalShapes = shapeList.length;

  const romDegrees =
    minAngleRef.current === null ? 0 : Math.max(0, Math.round(maxAngleRef.current - minAngleRef.current));
  const leftROM =
    leftMinAngleRef.current === null ? null : Math.max(0, Math.round(leftMaxAngleRef.current - leftMinAngleRef.current));
  const rightROM =
    rightMinAngleRef.current === null ? null : Math.max(0, Math.round(rightMaxAngleRef.current - rightMinAngleRef.current));

  // Symmetry score: (smaller ROM / larger ROM) * 100, flagged below 80%.
  // Stays null until leftROM/rightROM are both measurable.
  const symmetryScore =
    leftROM !== null && rightROM !== null && leftROM > 0 && rightROM > 0
      ? Math.round((Math.min(leftROM, rightROM) / Math.max(leftROM, rightROM)) * 100)
      : null;
  const symmetryFlag = symmetryScore !== null && symmetryScore < 80;

  const totalAttempted = completed + missed;
  const shapeAccuracy = totalAttempted > 0 ? Math.round((completed / totalAttempted) * 100) : 100;

  // Unified display values so the header/session-report don't need to
  // know which mode produced them.
  const displayShapeProgress =
    handMode === "symmetry" ? Math.round((shapeProgressLeft + shapeProgressRight) / 2) : shapeProgress;
  const displayTracingAccuracy =
    handMode === "symmetry" ? Math.round((tracingAccuracyLeft + tracingAccuracyRight) / 2) : tracingAccuracy;
  const displayIsTracing = handMode === "symmetry" ? isTracingLeft || isTracingRight : isTracing;
  const accuracyBand = getAccuracyBand(displayTracingAccuracy);
  const comboMultiplier = streak >= 10 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;

  useEffect(() => {
    comboMultiplierRef.current = comboMultiplier;
  }, [comboMultiplier]);

  // Prune expired sparkles. Only calls setState when something actually
  // needs removing, so this doesn't force a re-render 5x/sec while idle.
  useEffect(() => {
    const id = setInterval(() => {
      setSparkles((prev) => {
        const next = prev.filter((s) => Date.now() - s.createdAt < SPARKLE_LIFETIME_MS);
        return next.length === prev.length ? prev : next;
      });
    }, 200);
    return () => clearInterval(id);
  }, []);

  const engine = useGameEngine({
    sessionLength: SESSION_SECONDS,
    totalReps: 0, // Canvas Air is continuous shape-tracing, not discrete reps —
                   // disables useGameEngine's FEEDBACK/REST cycling and the
                   // 10-rep auto-end, both of which were stealing ~2.8s of
                   // active tracking time after every single shape attempt.
    onRepComplete: (success) => {
      telemetry.recordRep(success);
      if (success) {
        audio.playSuccess();
        setStars((s) => Math.min(5, s + 1));
        setScore((s) => s + Math.round(20 * comboMultiplierRef.current));
        setStreak((prev) => {
          const next = prev + 1;
          setBestStreak((b) => Math.max(b, next));
          if (next === 3 || next === 5 || next === 10) {
            setCelebrateStreak(next);
            setTimeout(() => setCelebrateStreak(null), 1500);
          }
          return next;
        });
        // Precision mode: tighten tolerance slightly on every clean
        // completion, floor at MIN_TRACE_TOLERANCE_UNITS. Takes effect at
        // the next shape boundary (see the tracker-rebuild effects below).
        setDynamicTolerance((t) => Math.max(MIN_TRACE_TOLERANCE_UNITS, t - 0.3));
      } else {
        setStreak(0);
        setDynamicTolerance(TRACE_TOLERANCE_UNITS);
      }
    },
    onSessionComplete: () => {
      finalizeTelemetry();
    },
  });

  const {
    gameState,
    countdown,
    timeLeft,
    isPaused,
    startSession,
    pauseSession,
    resumeSession,
    completeRep,
    endSession,
  } = engine;

  // ===== Shape-reset effect: SINGLE-HAND mode (unchanged behavior) =====
  useEffect(() => {
    sampledPathRef.current = samplePath(shapePath, 150);
    trackerRef.current = createPathCoverageTracker(sampledPathRef.current, dynamicTolerance);
    tracingStatsRef.current = { totalSamples: 0, onPathSamples: 0 };
    setTrace([]);
    setShapeProgress(0);
    setShapeTimeLeft(SHAPE_TIME_LIMIT_SECONDS);
    setShowShapeMissed(false);
  }, [shapePath, dynamicTolerance]);

  // ===== NEW: shape-reset effect for SYMMETRY mode. Builds a mirrored
  // guide + tracker for the right hand by mirroring the same sampled
  // points used for the left/primary shape (rather than trying to mirror
  // the raw SVG path string, which would need to parse arcs/curves). =====
  useEffect(() => {
    if (handMode !== "symmetry") return undefined;
    const leftPoints = samplePath(shapePath, 150);
    const rightPoints = leftPoints.map((p) => ({ x: 100 - p.x, y: p.y }));
    trackerLeftRef.current = createPathCoverageTracker(leftPoints, dynamicTolerance);
    trackerRightRef.current = createPathCoverageTracker(rightPoints, dynamicTolerance);
    statsLeftRef.current = { totalSamples: 0, onPathSamples: 0 };
    statsRightRef.current = { totalSamples: 0, onPathSamples: 0 };
    setGuidePointsRight(rightPoints);
    setTraceLeft([]);
    setTraceRight([]);
    setShapeProgressLeft(0);
    setShapeProgressRight(0);
  }, [shapePath, handMode, dynamicTolerance]);

  // Track ROM with metrics engine (unchanged)
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    const repResult = metricsEngine.current.trackAngle(shoulderAngle, performance.now());
    if (repResult) {
      setRepData((prev) => [...prev, repResult]);
    }
  }, [gameState, isPaused, shoulderAngle]);

  // NEW: per-side ROM tracking, additive, only runs when the values exist.
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    if (typeof leftShoulderAngle === "number") {
      if (leftMinAngleRef.current === null || (leftShoulderAngle > 0 && leftShoulderAngle < leftMinAngleRef.current)) {
        leftMinAngleRef.current = leftShoulderAngle > 0 ? leftShoulderAngle : 0;
      }
      if (leftShoulderAngle > leftMaxAngleRef.current) leftMaxAngleRef.current = leftShoulderAngle;
    }
    if (typeof rightShoulderAngle === "number") {
      if (rightMinAngleRef.current === null || (rightShoulderAngle > 0 && rightShoulderAngle < rightMinAngleRef.current)) {
        rightMinAngleRef.current = rightShoulderAngle > 0 ? rightShoulderAngle : 0;
      }
      if (rightShoulderAngle > rightMaxAngleRef.current) rightMaxAngleRef.current = rightShoulderAngle;
    }
  }, [gameState, isPaused, leftShoulderAngle, rightShoulderAngle]);

  // ===== Main tracing loop: SINGLE-HAND mode. Identical to the original
  // implementation, gated behind a mode check at the top so symmetry mode
  // never runs this. =====
  useEffect(() => {
    if (handMode !== "single") return undefined;
    if (gameState !== GAME_STATES.ACTIVE || isPaused || showShapeComplete || showShapeMissed) return undefined;

    if (!fingertip) {
      setIsTracing(false);
      return undefined;
    }

    const point = { x: (1 - fingertip.x) * 100, y: fingertip.y * 100 };
    const tracker = trackerRef.current;
    if (!tracker) return undefined;

    const { onPath } = tracker.update(point);

    tracingStatsRef.current.totalSamples += 1;
    if (onPath) tracingStatsRef.current.onPathSamples += 1;

    const stats = tracingStatsRef.current;
    const accuracy = stats.totalSamples
      ? Math.round((stats.onPathSamples / stats.totalSamples) * 100)
      : 0;
    setTracingAccuracy(accuracy);

    setIsTracing(onPath);
    if (onPath) {
      setTrace((current) => [...current.slice(-199), point]);
      // NEW: sparkle trail, throttled so it doesn't flood state updates.
      if (Math.random() < 0.12) {
        setSparkles((prev) => [
          ...prev.slice(-14),
          { id: `${Date.now()}-${Math.random()}`, x: point.x, y: point.y, color: getAccuracyBand(accuracy).stroke, side: "single", createdAt: Date.now() },
        ]);
      }
    }

    const coverage = tracker.getCoverage();
    setShapeProgress(coverage);

    if (coverage >= SHAPE_COMPLETE_THRESHOLD && !showShapeComplete) {
      setShowShapeComplete(true);
      setCompleted((v) => v + 1);
      setCurrentShapeIndex((i) => i + 1);
      completeRep(true);
      setTimeout(() => setShowShapeComplete(false), 1200);
    }

    telemetry.trackAngle(shoulderAngle);

    if (minAngleRef.current === null || (shoulderAngle > 0 && shoulderAngle < minAngleRef.current)) {
      minAngleRef.current = shoulderAngle > 0 ? shoulderAngle : 0;
    }
    if (shoulderAngle > maxAngleRef.current) {
      maxAngleRef.current = shoulderAngle;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handMode, fingertip, gameState, isPaused, showShapeComplete, showShapeMissed, shoulderAngle]);

  // ===== NEW: main tracing loop for SYMMETRY mode. Parallel structure to
  // the single-hand loop above, driving two independent trackers off
  // leftHand / rightHand. Both sides must clear SHAPE_COMPLETE_THRESHOLD
  // before the shape is marked complete. =====
  useEffect(() => {
    if (handMode !== "symmetry") return undefined;
    if (gameState !== GAME_STATES.ACTIVE || isPaused || showShapeComplete || showShapeMissed) return undefined;

    const trackerL = trackerLeftRef.current;
    const trackerR = trackerRightRef.current;
    if (!trackerL || !trackerR) return undefined;

    let leftCoverage = shapeProgressLeft;
    let rightCoverage = shapeProgressRight;

    if (leftHand) {
      const pointL = { x: (1 - leftHand.x) * 100, y: leftHand.y * 100 };
      const { onPath } = trackerL.update(pointL);
      statsLeftRef.current.totalSamples += 1;
      if (onPath) statsLeftRef.current.onPathSamples += 1;
      const accL = statsLeftRef.current.totalSamples
        ? Math.round((statsLeftRef.current.onPathSamples / statsLeftRef.current.totalSamples) * 100)
        : 0;
      setTracingAccuracyLeft(accL);
      setIsTracingLeft(onPath);
      if (onPath) {
        setTraceLeft((cur) => [...cur.slice(-199), pointL]);
        if (Math.random() < 0.12) {
          setSparkles((prev) => [
            ...prev.slice(-14),
            { id: `${Date.now()}-${Math.random()}-l`, x: pointL.x, y: pointL.y, color: getAccuracyBand(accL).stroke, side: "left", createdAt: Date.now() },
          ]);
        }
      }
      leftCoverage = trackerL.getCoverage();
      setShapeProgressLeft(leftCoverage);
    } else {
      setIsTracingLeft(false);
    }

    if (rightHand) {
      const pointR = { x: (1 - rightHand.x) * 100, y: rightHand.y * 100 };
      const { onPath } = trackerR.update(pointR);
      statsRightRef.current.totalSamples += 1;
      if (onPath) statsRightRef.current.onPathSamples += 1;
      const accR = statsRightRef.current.totalSamples
        ? Math.round((statsRightRef.current.onPathSamples / statsRightRef.current.totalSamples) * 100)
        : 0;
      setTracingAccuracyRight(accR);
      setIsTracingRight(onPath);
      if (onPath) {
        setTraceRight((cur) => [...cur.slice(-199), pointR]);
        if (Math.random() < 0.12) {
          setSparkles((prev) => [
            ...prev.slice(-14),
            { id: `${Date.now()}-${Math.random()}-r`, x: pointR.x, y: pointR.y, color: getAccuracyBand(accR).stroke, side: "right", createdAt: Date.now() },
          ]);
        }
      }
      rightCoverage = trackerR.getCoverage();
      setShapeProgressRight(rightCoverage);
    } else {
      setIsTracingRight(false);
    }

    telemetry.trackAngle(shoulderAngle);

    if (leftCoverage >= SHAPE_COMPLETE_THRESHOLD && rightCoverage >= SHAPE_COMPLETE_THRESHOLD && !showShapeComplete) {
      setShowShapeComplete(true);
      setCompleted((v) => v + 1);
      setCurrentShapeIndex((i) => i + 1);
      completeRep(true);
      setTimeout(() => setShowShapeComplete(false), 1200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handMode, leftHand, rightHand, gameState, isPaused, showShapeComplete, showShapeMissed, shoulderAngle]);

  // Per-shape countdown (unchanged — shared across both modes)
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused || showShapeComplete || showShapeMissed) {
      return undefined;
    }

    if (shapeTimeLeft <= 0) {
      setShowShapeMissed(true);
      setMissed((m) => m + 1);
      completeRep(false);
      setCurrentShapeIndex((i) => i + 1);
      const clearFlash = setTimeout(() => setShowShapeMissed(false), 1200);
      return () => clearTimeout(clearFlash);
    }

    const tick = setTimeout(() => {
      setShapeTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearTimeout(tick);
  }, [gameState, isPaused, showShapeComplete, showShapeMissed, shapeTimeLeft, completeRep]);

  // Adaptive difficulty (unchanged)
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    const timer = setInterval(() => {
      adapt({ accuracy: displayTracingAccuracy, papsScore, combo: completed });
    }, 15000);
    return () => clearInterval(timer);
  }, [gameState, isPaused, adapt, displayTracingAccuracy, papsScore, completed]);

  // Pain detection (unchanged)
  useEffect(() => {
    if (!isPainDetected || gameState !== GAME_STATES.ACTIVE) return;
    pauseSession();
    telemetry.trackPain(papsScore);
  }, [isPainDetected, gameState, pauseSession, telemetry, papsScore]);

  const finalizeTelemetry = useCallback(() => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
    const sessionStats = metricsEngine.current.getSessionStats();
    telemetry.endSession({
      gameName: "Canvas Air",
      score,
      completed,
      totalShapes,
      accuracy: shapeAccuracy,
      romDegrees: sessionStats.averageRom || romDegrees,
      papsScore,
      difficulty: currentDifficulty,
      stars,
      gameSpecific: {
        pathCoveragePercent: displayShapeProgress,
        shapesCompleted: completed,
        shapesMissed: missed,
        shapeSuccessRatePercent: shapeAccuracy,
        totalShapes,
        tracingAccuracyPercent: displayTracingAccuracy,
        repData: sessionStats.reps || repData,
        // NEW fields — additive, existing consumers of this object are
        // unaffected by extra keys.
        handMode,
        streak,
        bestStreak,
        leftROM,
        rightROM,
        symmetryScore,
        symmetryFlag,
      },
    });
  }, [
    telemetry,
    score,
    completed,
    missed,
    shapeAccuracy,
    totalShapes,
    displayTracingAccuracy,
    romDegrees,
    papsScore,
    currentDifficulty,
    stars,
    displayShapeProgress,
    repData,
    handMode,
    streak,
    bestStreak,
    leftROM,
    rightROM,
    symmetryScore,
    symmetryFlag,
  ]);

  const canStart = isActive && handReady && !poseError && !handError && calibrated;

  // ========== RENDER ==========

  const isInstructions = gameState === GAME_STATES.INSTRUCTIONS;
  const isComplete = gameState === GAME_STATES.COMPLETE;
  const isActiveScreen = !isInstructions && !isComplete;
  const isSymmetry = handMode === "symmetry";

  if (isComplete) {
    const sessionData = {
      sessionId: telemetry.sessionId,
      gameId,
      patientId,
      date: new Date().toISOString(),
      durationSeconds: SESSION_SECONDS - timeLeft,
      score,
      accuracyPercent: displayTracingAccuracy,
      romData: {
        averageRomDegrees: romDegrees || 0,
        maxRomDegrees: maxAngleRef.current || 0,
        perRep: repData.map((r, i) => ({
          rep: i + 1,
          romDegrees: r.romDegrees || 0,
          success: r.success !== false,
        })),
        leftRomDegrees: leftROM,
        rightRomDegrees: rightROM,
        symmetryScorePercent: symmetryScore,
      },
      reps: completed + missed,
      hitsOrCatchesOrCompletions: completed,
      missesOrDrops: missed,
      gameSpecificMetrics: {
        pathCoveragePercent: Math.round(displayShapeProgress),
        shapesCompleted: completed,
        shapesMissed: missed,
        shapeSuccessRatePercent: shapeAccuracy,
        totalShapes,
        stars,
        handMode,
        bestStreak,
      },
    };

    return (
      <SessionSummary
        sessionData={sessionData}
        gameName="Canvas Air"
        gameId={gameId}
        patientId={patientId}
        onSaveReport={async () => await telemetry.saveReport(sessionData)}
        onFinish={() => onSessionEnd?.(sessionData)}
      />
    );
  }

  const cameraFeed = (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="w-full h-full scale-x-[-1] object-cover"
    />
  );

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      {/* Pulse-effect keyframes, defined once. Duration is set per-element
          via inline style based on the current accuracy band. */}
      <style>{`
        @keyframes canvasAirPulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        @keyframes canvasAirSparkle {
          0% { opacity: 0.9; transform: scale(1); }
          100% { opacity: 0; transform: scale(2.2); }
        }
      `}</style>

      {isActiveScreen && gameState === GAME_STATES.COUNTDOWN && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 text-8xl font-black text-cyan-400">
          {countdown || "GO"}
        </div>
      )}

      {isActiveScreen && isPainDetected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="rounded-2xl bg-slate-900 p-8 text-center max-w-md">
            <h2 className="mb-3 text-xl font-bold text-red-400">Discomfort Detected</h2>
            <p className="mb-6 text-slate-300">Please rest before continuing.</p>
            <button
              onClick={() => {
                resetPainState();
                resumeSession();
              }}
              className="rounded-lg bg-cyan-500 px-6 py-2 font-bold hover:bg-cyan-400"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {isActiveScreen && celebrateStreak && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="rounded-2xl bg-black/70 px-10 py-6 text-center animate-pulse">
            <div className="text-5xl font-black text-amber-400">🔥 Streak {celebrateStreak}!</div>
            <div className="mt-1 text-sm text-amber-200">x{comboMultiplier} score multiplier</div>
          </div>
        </div>
      )}

      {isActiveScreen && (
        <div className="fixed left-0 right-0 top-0 z-40 flex justify-between border-b border-slate-800 bg-slate-950/90 px-8 py-4 backdrop-blur">
          <div className="flex gap-5 font-mono text-sm overflow-x-auto">
            <span>⏱ {timeLeft}s</span>
            <span>📐 {Math.round(shoulderAngle)}°</span>
            <span>✅ Shapes: {completed}/{totalShapes}</span>
            <span>🎯 Progress: {Math.round(displayShapeProgress)}%</span>
            <span className={accuracyBand.text}>🖊️ Trace Accuracy: {displayTracingAccuracy}%</span>
            <span>✅❌ {completed}/{totalAttempted} ({shapeAccuracy}%)</span>
            <span>💪 ROM: {romDegrees}°</span>
            {streak > 0 && <span className="text-amber-400">🔥 Streak: {streak} (x{comboMultiplier})</span>}
            {isSymmetry && (
              <span className={symmetryFlag ? "text-red-400" : "text-slate-300"}>
                ⚖️ Symmetry: {symmetryScore !== null ? `${symmetryScore}%` : "—"}
              </span>
            )}
            <span className="text-cyan-400">{currentDifficulty}</span>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => (isPaused ? resumeSession() : pauseSession())}
              className="rounded-lg bg-slate-800 p-2 hover:bg-slate-700"
            >
              {isPaused ? <Play size={18} /> : <Pause size={18} />}
            </button>
            <button onClick={endSession} className="rounded-lg bg-red-950 p-2 hover:bg-red-900">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className={isActiveScreen ? `flex h-[calc(100vh-140px)] gap-6 p-8 pt-24` : "p-8"}>
        <div className={isActiveScreen ? "max-w-none" : "max-w-4xl mx-auto w-full"}>
          {isInstructions && (
            <>
              <h1 className="mb-2 text-3xl font-black">🎨 Canvas Air</h1>
              <p className="mb-6 text-slate-400">
                Trace the outlined shape with your fingertip. Progress is measured against how much of
                the actual line you've traced, not just where your hand is on screen.
              </p>

              <div className="mb-4 flex gap-2">
                <button
                  onClick={() => setHandMode("single")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                    handMode === "single" ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Single Hand
                </button>
                <button
                  onClick={() => setHandMode("symmetry")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                    handMode === "symmetry" ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Symmetry Mode (Both Hands)
                </button>
              </div>
              {handMode === "symmetry" && (
                <p className="mb-4 text-xs text-slate-500">
                  Traces a mirrored copy of the shape with each hand at once. Symmetry score compares
                  left vs. right shoulder range of motion and needs both to register during the session.
                </p>
              )}
            </>
          )}

          <div
            className={
              isActiveScreen
                ? `relative overflow-hidden rounded-2xl border-4 border-slate-800 flex-shrink-0 ${isSymmetry ? "w-[24%]" : "w-[38%]"}`
                : "relative overflow-hidden rounded-2xl border-4 border-slate-800 aspect-video"
            }
          >
            {cameraFeed}
            <SkeletonOverlay poseData={poseData} overallStatus={guidance.overallStatus} shoulderAngle={shoulderAngle} />
            {isInstructions && (
              <div className="absolute left-4 top-4 rounded-lg bg-black/60 px-3 py-2 font-mono text-sm">
                {Math.round(shoulderAngle)}° | PAPS {papsScore} | Hand {handReady ? (fingertip ? "✅" : "🔍") : "⏳"}
              </div>
            )}
            {isActiveScreen && (
              <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-2 font-mono text-sm">
                {isSymmetry
                  ? `L ${leftHand ? "✓" : "…"}  R ${rightHand ? "✓" : "…"}`
                  : `${Math.round(shoulderAngle)}° ${fingertip ? "" : "| hand not visible"}`}
              </div>
            )}
            {isSymmetry && (
              <div className="absolute right-3 top-3 flex flex-col gap-1 text-xs font-mono">
                <span className={`rounded px-2 py-0.5 ${leftHand ? "bg-cyan-900/80 text-cyan-300" : "bg-slate-800/80 text-slate-500"}`}>
                  L {leftHand ? "✓" : "…"}
                </span>
                <span className={`rounded px-2 py-0.5 ${rightHand ? "bg-cyan-900/80 text-cyan-300" : "bg-slate-800/80 text-slate-500"}`}>
                  R {rightHand ? "✓" : "…"}
                </span>
              </div>
            )}
          </div>

          {isInstructions && (
            <>
              <div
                className={`mt-4 rounded-xl border p-4 ${
                  guidance.overallStatus === "ok"
                    ? "border-green-800 bg-green-950/30 text-green-300"
                    : "border-amber-800 bg-amber-950/30 text-amber-300"
                }`}
              >
                {guidance.message}
              </div>

              {(poseError || handError) && (
                <div className="mt-4 rounded-xl border border-red-800 bg-red-950/30 p-4 text-red-300">
                  {poseError || handError}. Check camera permissions and connection, then reload.
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-3 text-xs font-mono text-slate-400">
                <span>🟢 90-100% Smooth control</span>
                <span>🔵 70-89% Steady</span>
                <span>🟠 50-69% Needs focus</span>
                <span>🔴 &lt;50% Slow down</span>
              </div>

              <button
                onClick={() => {
                  telemetry.startTracking();
                  startSession();
                }}
                disabled={!guidance.isReady || !canStart}
                className="mt-6 rounded-xl bg-cyan-500 px-8 py-3 font-bold hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500"
              >
                {canStart
                  ? "Start Session"
                  : isActive && !calibrated
                  ? "Hold still, calibrating…"
                  : "Waiting for hand + pose tracking…"}
              </button>
            </>
          )}
        </div>

        {isActiveScreen && !isSymmetry && (
          <div className="relative w-[62%] overflow-hidden rounded-2xl border-4 border-slate-800 bg-white">
            <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
              <path
                d={shapePath}
                fill="none"
                stroke="#334155"
                strokeWidth="2.5"
                strokeDasharray="4 4"
                style={{ animation: `canvasAirPulse ${accuracyBand.pulse}s ease-in-out infinite` }}
              />

              <polyline
                points={trace.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={isTracing ? accuracyBand.stroke : "#94a3b8"}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transition: "stroke 0.3s" }}
              />

              {sparkles
                .filter((s) => s.side === "single")
                .map((s) => (
                  <circle
                    key={s.id}
                    cx={s.x}
                    cy={s.y}
                    r="2.2"
                    fill={s.color}
                    style={{ animation: "canvasAirSparkle 0.7s ease-out forwards" }}
                  />
                ))}

              <text x="50" y="95" textAnchor="middle" className="text-xs font-medium text-slate-500">
                {currentShape?.name || "Trace"} • {currentDifficulty}
              </text>
            </svg>

            {!fingertip && (
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-slate-400">
                Show your hand to the camera
              </div>
            )}

            <div className="absolute right-4 top-20 rounded-lg bg-black/70 px-3 py-1 text-xs font-mono text-white">
              ⏱ {shapeTimeLeft}s
            </div>

            <div className="absolute right-4 top-4 flex h-14 w-14 items-center justify-center rounded-full bg-black/70">
              <div className="relative h-12 w-12">
                <svg className="h-12 w-12 -rotate-90">
                  <circle cx="24" cy="24" r="18" fill="none" stroke="#2d3748" strokeWidth="3" />
                  <circle
                    cx="24"
                    cy="24"
                    r="18"
                    fill="none"
                    stroke={isTracing ? accuracyBand.stroke : "#94a3b8"}
                    strokeWidth="3"
                    strokeDasharray={`${2 * Math.PI * 18 * (shapeProgress / 100)} ${2 * Math.PI * 18}`}
                    style={{ transition: "stroke-dasharray 0.3s, stroke 0.3s" }}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                  {Math.round(shapeProgress)}%
                </span>
              </div>
            </div>

            <div className="absolute left-4 top-4 flex gap-1">
              {Array.from({ length: Math.min(5, completed) }).map((_, i) => (
                <span key={i} className="text-yellow-400 text-lg">⭐</span>
              ))}
            </div>

            <div className="absolute left-4 bottom-4 text-sm font-bold text-cyan-400">Score: {score}</div>

            {showShapeComplete && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-6xl font-black text-emerald-400 animate-pulse">
                ✨ COMPLETE!
              </div>
            )}

            {showShapeMissed && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-5xl font-black text-red-400 animate-pulse">
                ⏰ Time's Up
              </div>
            )}

            {fingertip && (
              <div
                className="absolute w-5 h-5 rounded-full border-2 border-pink-500 bg-pink-200/30 shadow-lg pointer-events-none"
                style={{
                  left: `${(1 - fingertip.x) * 100}%`,
                  top: `${fingertip.y * 100}%`,
                  transform: "translate(-50%, -50%)",
                  transition: "left 0.05s, top 0.05s",
                }}
              />
            )}
          </div>
        )}

        {isActiveScreen && isSymmetry && (
          <div className="flex w-[74%] gap-4">
            {/* Left-hand panel */}
            <div className="relative w-1/2 overflow-hidden rounded-2xl border-4 border-slate-800 bg-white">
              <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                <path
                  d={shapePath}
                  fill="none"
                  stroke="#334155"
                  strokeWidth="2.5"
                  strokeDasharray="4 4"
                  style={{ animation: `canvasAirPulse ${getAccuracyBand(tracingAccuracyLeft).pulse}s ease-in-out infinite` }}
                />
                <polyline
                  points={traceLeft.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={isTracingLeft ? getAccuracyBand(tracingAccuracyLeft).stroke : "#94a3b8"}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transition: "stroke 0.3s" }}
                />
                {sparkles
                  .filter((s) => s.side === "left")
                  .map((s) => (
                    <circle key={s.id} cx={s.x} cy={s.y} r="2.2" fill={s.color} style={{ animation: "canvasAirSparkle 0.7s ease-out forwards" }} />
                  ))}
                <text x="50" y="95" textAnchor="middle" className="text-xs font-medium text-slate-500">
                  Left hand • {Math.round(shapeProgressLeft)}%
                </text>
              </svg>
              {leftHand && (
                <div
                  className="absolute w-4 h-4 rounded-full border-2 border-pink-500 bg-pink-200/30 shadow-lg pointer-events-none"
                  style={{
                    left: `${(1 - leftHand.x) * 100}%`,
                    top: `${leftHand.y * 100}%`,
                    transform: "translate(-50%, -50%)",
                    transition: "left 0.05s, top 0.05s",
                  }}
                />
              )}
            </div>

            {/* Right-hand panel — mirrored shape */}
            <div className="relative w-1/2 overflow-hidden rounded-2xl border-4 border-slate-800 bg-white">
              <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                <polyline
                  points={guidePointsRight.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="#334155"
                  strokeWidth="2.5"
                  strokeDasharray="4 4"
                  style={{ animation: `canvasAirPulse ${getAccuracyBand(tracingAccuracyRight).pulse}s ease-in-out infinite` }}
                />
                <polyline
                  points={traceRight.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={isTracingRight ? getAccuracyBand(tracingAccuracyRight).stroke : "#94a3b8"}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transition: "stroke 0.3s" }}
                />
                {sparkles
                  .filter((s) => s.side === "right")
                  .map((s) => (
                    <circle key={s.id} cx={s.x} cy={s.y} r="2.2" fill={s.color} style={{ animation: "canvasAirSparkle 0.7s ease-out forwards" }} />
                  ))}
                <text x="50" y="95" textAnchor="middle" className="text-xs font-medium text-slate-500">
                  Right hand (mirrored) • {Math.round(shapeProgressRight)}%
                </text>
              </svg>
              {rightHand && (
                <div
                  className="absolute w-4 h-4 rounded-full border-2 border-pink-500 bg-pink-200/30 shadow-lg pointer-events-none"
                  style={{
                    left: `${(1 - rightHand.x) * 100}%`,
                    top: `${rightHand.y * 100}%`,
                    transform: "translate(-50%, -50%)",
                    transition: "left 0.05s, top 0.05s",
                  }}
                />
              )}
            </div>

            <div className="absolute right-4 top-4 rounded-lg bg-black/70 px-3 py-1 text-xs font-mono text-white">
              ⏱ {shapeTimeLeft}s
            </div>
            {showShapeComplete && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 text-5xl font-black text-emerald-400 animate-pulse">
                ✨ COMPLETE!
              </div>
            )}
            {showShapeMissed && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 text-4xl font-black text-red-400 animate-pulse">
                ⏰ Time's Up
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}