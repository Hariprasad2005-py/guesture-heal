// frontend/src/games/CanvasAir.jsx
//
// Canvas Air — air-painting rehabilitation game.
//
// The patient traces a target outline with their index fingertip. The
// stroke is rendered live and colored by how close it is to the target:
// green inside tight tolerance, amber near the edge, red outside.
// Accuracy is a movement-weighted proportion of the trace that stayed
// inside tolerance; completion is the proportion of the target path
// actually covered. Both come from the same tracker.
//
// Design constraints enforced by this file:
//   * Only INDEX_FINGER_TIP is used. useHandTracking has no `landmark`
//     prop, so a "Wrist" UI option would be inert.
//   * papsScore from useFacialPainDetection is 0-10. Pain is active at
//     papsScore >= 6, matching the hook's own PAIN_THRESHOLD.
//   * useAdaptiveDifficulty.adapt() accepts
//     { accuracy, papsScore, combo, maxFlexionAngle }. maxFlexionAngle
//     must be `null` when unmeasured — passing 0 closes the ROM gate
//     forever, because 0 is a real measurement to that hook.
//   * useGameEngine is used for countdown / pause / resume / endSession
//     only. completeRep is never called.
//   * No fabricated cursor. If useHandTracking returns no fingertip,
//     the canvas shows a clear "show your hand" state.
//   * Each shape's 15-second timer starts on the first valid filtered
//     fingertip sample for that shape, and is computed from real
//     elapsed timestamps, not by accumulating setTimeout ticks.
//   * Per-attempt geometry (scale, tolerance, sampled path) is frozen
//     at the moment the attempt starts.
//   * Trace, cursor, and motion/smoothness all use the SAME filtered
//     fingertip sample.
//
// FINGERTIP SMOOTHING
//   useHandTracking already applies an EMA (alpha = 0.4) to raw
//   MediaPipe landmarks before emitting. Canvas Air layers a One Euro
//   filter on top of that, tuned for an already-smoothed input:
//     minCutoff = 0.4   (heavier low-pass when stationary)
//     beta      = 0.02  (release faster on fast motion, less lag)
//     dCutoff   = 1.0
//   A short sub-pixel deadband on the cursor prevents visible jitter
//   when the patient holds still. The filter is only reset when the
//   hand is gone for more than FILTER_RESET_GAP_MS, so a one-frame
//   dropout at the edge of a reach does not produce a stutter.
//
// DEBUG TRACKING HUD
//   Append ?debugTracking to the page URL to render a small dev-only
//   overlay showing raw / mirrored / filtered / mapped fingertip values
//   plus on-path/distance, so a real mismatch can be diagnosed from
//   actual numbers instead of guesswork. It never renders unless that
//   query param is present, and it never gates or alters any game
//   logic — it only reads values that are already being computed.
//
// Metrics are game metrics, not validated clinical scores. PAPS is a
// facial-expression-derived discomfort indicator, not a diagnosis.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  Pause,
  Play,
  RefreshCw,
  Shuffle,
  X,
} from "lucide-react";

import useMediaPipeUpperBody from "../hooks/useMediaPipeUpperBody";
import useHandTracking from "../hooks/useHandTracking";
import usePoseDetection from "../hooks/usePoseDetection";
import usePostureGuidance from "../hooks/usePostureGuidance";
import useFacialPainDetection from "../hooks/useFacialPainDetection";
import useAdaptiveDifficulty from "../hooks/useAdaptiveDifficulty";
import { useGameEngine, GAME_STATES } from "../hooks/useGameEngine";
import { useSessionTelemetry } from "../hooks/useSessionTelemetry";
import { useAudioFeedback } from "../hooks/useAudioFeedback";
import {
  samplePath,
  createPathCoverageTracker,
} from "../utils/svgPathSampler";
import SkeletonOverlay from "../components/rehab/SkeletonOverlay";
import SessionSummary from "../components/rehab/SessionSummary";

// ============================================================
// CONSTANTS
// ============================================================

const SHAPE_TIME_LIMIT_SECONDS = 15;
const SHAPE_ADVANCE_DELAY_MS = 1800;

const SHAPES_PER_SESSION = {
  Beginner: 3,
  Intermediate: 4,
  Advanced: 5,
};

const FEEDBACK_COLORS = {
  onPath: "#10b981",
  edge: "#f59e0b",
  off: "#ef4444",
};

const PAPS_PAIN_THRESHOLD = 6;

// Minimum frame-to-frame movement (viewBox units) that counts as real
// "movement" for movement-weighted accuracy and smoothness.
const MIN_MOVEMENT_UNITS = 0.15;

// Smoothness is only meaningful after enough real movement has been
// observed. Below this cumulative path length (viewBox units) we report
// null instead of an invented number.
const MIN_PATH_LENGTH_FOR_SMOOTHNESS = 40;

// --- Smoothing constants ---

// One Euro parameters. Tuned for input that useHandTracking has already
// EMA-smoothed. Lower minCutoff than the raw-landmark defaults because
// the noise floor is already reduced; higher beta so fast motion is not
// dragged behind by excessive low-pass.
const ONE_EURO_MIN_CUTOFF = 0.4;
const ONE_EURO_BETA = 0.02;
const ONE_EURO_D_CUTOFF = 1.0;

// If the fingertip is gone for less than this, we do NOT reset the
// filter — we just stretch the filter's internal dt across the gap so
// the first sample back is treated as "resumed", not "restarted". This
// avoids the visible stutter caused by a single dropped frame.
const FILTER_RESET_GAP_MS = 250;

// Deadband on the cursor. Sub-0.3-unit moves (0.3% of the canvas) do
// not reposition the cursor. This removes idle jitter without making
// real motion lag, because any movement above this threshold moves the
// cursor immediately and exactly.
const CURSOR_DEADBAND_UNITS = 0.3;

// A filtered point slightly outside [0,1] is still tracked; only a
// genuinely-off-frame hand (beyond these margins) is treated as
// "not visible". No clamping is applied — the point is either used
// verbatim or the sample is dropped.
const OFF_FRAME_MARGIN = 0.02;

// The webcam frame is much wider than a user's comfortable seated reach,
// and where that reach sits (centered, upper-right, etc.) varies by
// person, seating position, and camera angle. A fixed guess for the
// reachable box is wrong for most users. Instead we auto-calibrate:
// expand a running min/max of the ACTUAL mirrored fingertip positions
// seen during the session, and remap through that observed box (with
// a little padding) once it's wide enough to trust. Until then we fall
// back to a generous default so the game is usable from frame one.
const DEFAULT_HAND_RANGE_X = [0.25, 0.75];
const DEFAULT_HAND_RANGE_Y = [0.2, 0.8];
const HAND_RANGE_PADDING = 0.05; // extra slack around the observed reach
const HAND_RANGE_MIN_SPAN = 0.15; // below this observed span, don't trust it yet

function remapNormalized(v, [lo, hi]) {
  if (hi <= lo) return 0.5;
  const t = (v - lo) / (hi - lo);
  return Math.max(0, Math.min(1, t));
}

// Dev-only tracking HUD. Enabled by adding ?debugTracking to the URL —
// never shown to a patient by default, never toggled by any app state.
const DEBUG_TRACKING =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("debugTracking");

// ============================================================
// TOLERANCE (viewBox units)
// ============================================================
const TOLERANCE_BY_DIFFICULTY = {
  Beginner: 6.0,
  Intermediate: 4.5,
  Advanced: 3.5,
};
const MIN_TOLERANCE_FLOOR = 2.5;
const MAX_TOLERANCE_CEIL = 7.0;

function getBaseTolerance(difficulty) {
  return (
    TOLERANCE_BY_DIFFICULTY[difficulty] ?? TOLERANCE_BY_DIFFICULTY.Beginner
  );
}

// ============================================================
// SHAPES
// ============================================================
const SIMPLE_DIFFICULTY_MAX = 3;

const SHAPES = [
  { path: "M15 50 A35 35 0 1 1 85 50 A35 35 0 1 1 15 50 Z", name: "Circle", icon: "●", difficulty: 1 },
  { path: "M25 25 L75 25 L75 75 L25 75 Z", name: "Square", icon: "▢", difficulty: 1 },
  { path: "M50 15 L85 80 L15 80 Z", name: "Triangle", icon: "△", difficulty: 1 },
  { path: "M50 15 L80 50 L50 85 L20 50 Z", name: "Diamond", icon: "◇", difficulty: 2 },
  { path: "M20 50 L35 20 L65 20 L80 50 L65 80 L35 80 Z", name: "Hexagon", icon: "⬡", difficulty: 3 },
  { path: "M50 15 L83.3 39.2 L70.6 78.3 L29.4 78.3 L16.7 39.2 Z", name: "Pentagon", icon: "⬟", difficulty: 3 },
  { path: "M30 50 C30 32 42 32 50 50 C58 68 70 68 70 50 C70 32 58 32 50 50 C42 68 30 68 30 50 Z", name: "Figure-8", icon: "∞", difficulty: 4 },
  { path: "M50 10 L58 42 L90 50 L58 58 L50 90 L42 58 L10 50 L42 42 Z", name: "Sparkle", icon: "✦", difficulty: 4 },
  { path: "M50 20 L65 40 L90 40 L70 55 L80 80 L50 65 L20 80 L30 55 L10 40 L35 40 Z", name: "Star", icon: "★", difficulty: 4 },
  { path: "M50 50 C50 35 65 35 65 50 C65 68 35 68 35 45 C35 20 78 20 78 55", name: "Spiral", icon: "🌀", difficulty: 5 },
];

function getShapePoolForDifficulty(difficulty) {
  if (difficulty === "Advanced") return SHAPES;
  if (difficulty === "Intermediate") {
    return SHAPES.filter(
      (s) => s.difficulty <= SIMPLE_DIFFICULTY_MAX || s.name === "Figure-8"
    );
  }
  return SHAPES.filter((s) => s.difficulty <= SIMPLE_DIFFICULTY_MAX);
}

function shuffleArray(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickSessionShapes(difficulty, count) {
  const eligible = getShapePoolForDifficulty(difficulty);
  const n = Math.min(count, eligible.length);
  return shuffleArray(eligible).slice(0, n);
}

function pickReplacementShape(difficulty, usedNames) {
  const pool = getShapePoolForDifficulty(difficulty);
  const fresh = pool.filter((s) => !usedNames.includes(s.name));
  const source = fresh.length > 0 ? fresh : pool;
  return source[Math.floor(Math.random() * source.length)];
}

// ============================================================
// FEEDBACK / BANDS
// ============================================================
function classifyFeedback(distance, tolerance) {
  if (distance == null || !Number.isFinite(distance)) return "off";
  if (distance <= tolerance * 0.6) return "onPath";
  if (distance <= tolerance) return "edge";
  return "off";
}

function getAccuracyBand(pct) {
  if (pct >= 90) return { label: "Smooth, controlled", stroke: "#10b981", text: "text-emerald-600", pulse: 0.7 };
  if (pct >= 70) return { label: "Steady improvement", stroke: "#3b82f6", text: "text-blue-600", pulse: 1.1 };
  if (pct >= 50) return { label: "Needs focus", stroke: "#f97316", text: "text-orange-600", pulse: 1.6 };
  return { label: "Slow down, be deliberate", stroke: "#ef4444", text: "text-red-600", pulse: 2.4 };
}

// ============================================================
// SMOOTHNESS
// ============================================================
function computeSmoothness(velocities, accelerations, pathLength) {
  if (
    !velocities ||
    velocities.length < 5 ||
    !accelerations ||
    accelerations.length < 4 ||
    pathLength < MIN_PATH_LENGTH_FOR_SMOOTHNESS
  ) {
    return null;
  }

  const meanSpeed = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  if (meanSpeed <= 0.5) return null;

  const meanAbsAccel =
    accelerations.reduce((a, b) => a + Math.abs(b), 0) / accelerations.length;

  const ratio = meanAbsAccel / meanSpeed;
  const score = Math.max(0, Math.min(100, 100 - ratio * 33.3));
  return Math.round(score * 100) / 100;
}

// ============================================================
// ONE EURO FILTER
//
// Same math as before, but with an added `filterWithGap()` entry point
// that stretches internal dt across a short dropout instead of
// resetting. This is what removes the stutter when a single frame is
// missed near the edge of the frame.
// ============================================================
class OneEuroFilter1D {
  constructor(minCutoff = 0.8, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  /**
   * @param {number} x
   * @param {number} tMs   current performance.now()
   * @param {number} [forcedDtSec]  when resuming after a short gap,
   *   the caller can force a dt so the internal velocity estimate does
   *   not spike. If omitted, dt is derived from tMs - tPrev.
   */
  filter(x, tMs, forcedDtSec) {
    if (this.tPrev === null) {
      this.tPrev = tMs;
      this.xPrev = x;
      this.dxPrev = 0;
      return x;
    }
    const dt =
      typeof forcedDtSec === "number" && forcedDtSec > 0
        ? forcedDtSec
        : Math.max(0.001, (tMs - this.tPrev) / 1000);
    const dx = (x - this.xPrev) / dt;
    const aD = OneEuroFilter1D.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuroFilter1D.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.tPrev = tMs;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }
  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

class PointOneEuroFilter {
  constructor(minCutoff = 0.8, beta = 0.007, dCutoff = 1.0) {
    this.fx = new OneEuroFilter1D(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter1D(minCutoff, beta, dCutoff);
  }
  filter(point, tMs, forcedDtSec) {
    return {
      x: this.fx.filter(point.x, tMs, forcedDtSec),
      y: this.fy.filter(point.y, tMs, forcedDtSec),
    };
  }
  reset() {
    this.fx.reset();
    this.fy.reset();
  }
}

// ============================================================
// MOTION TRACKING
// ============================================================
function emptyMotionTrack() {
  return {
    lastPoint: null,
    lastTime: null,
    lastVelocity: null,
    lastVelocityTime: null,
    velocities: [],
    accelerations: [],
    pathLength: 0,
  };
}

function recordMotionSample(track, point, tMs) {
  if (track.lastPoint && track.lastTime !== null) {
    const dt = Math.max(0.001, (tMs - track.lastTime) / 1000);
    const d = Math.hypot(
      point.x - track.lastPoint.x,
      point.y - track.lastPoint.y
    );

    if (d >= MIN_MOVEMENT_UNITS) {
      track.pathLength += d;
      const v = d / dt;
      track.velocities.push(v);

      if (track.lastVelocity !== null && track.lastVelocityTime !== null) {
        const dtA = Math.max(0.001, (tMs - track.lastVelocityTime) / 1000);
        track.accelerations.push((v - track.lastVelocity) / dtA);
      }
      track.lastVelocity = v;
      track.lastVelocityTime = tMs;

      track.lastPoint = point;
      track.lastTime = tMs;
      return { moved: true, distance: d };
    }
    track.lastPoint = point;
    track.lastTime = tMs;
    return { moved: false, distance: d };
  }
  track.lastPoint = point;
  track.lastTime = tMs;
  return { moved: false, distance: 0 };
}

// ============================================================
// MOVEMENT-WEIGHTED ACCURACY
// ============================================================
function emptyMovementStats() {
  return { movedDistance: 0, onPathDistance: 0 };
}

function updateMovementStats(stats, distance, onPath) {
  if (distance < MIN_MOVEMENT_UNITS) return stats;
  return {
    movedDistance: stats.movedDistance + distance,
    onPathDistance: stats.onPathDistance + (onPath ? distance : 0),
  };
}

function getMovementAccuracy(stats) {
  if (!stats.movedDistance || stats.movedDistance <= 0) return null;
  return (stats.onPathDistance / stats.movedDistance) * 100;
}

// ============================================================
// ROM-ADAPTIVE SHAPE SCALING
// ============================================================
function getShapeScaleForROM(romDegrees, shapeDifficulty) {
  if (typeof romDegrees !== "number" || !Number.isFinite(romDegrees) || romDegrees <= 0) {
    return 1.0;
  }
  let scale;
  if (romDegrees < 30) scale = 0.6;
  else if (romDegrees < 60) scale = 0.78;
  else if (romDegrees < 90) scale = 0.95;
  else if (romDegrees < 120) scale = 1.08;
  else scale = 1.2;
  if (shapeDifficulty >= 4) scale *= 0.92;
  return Math.round(scale * 100) / 100;
}

function scalePathPoints(points, scale) {
  if (scale === 1) return points;
  return points.map((p) => ({
    x: 50 + (p.x - 50) * scale,
    y: 50 + (p.y - 50) * scale,
    length: p.length,
  }));
}

function getShapeTransform(scale) {
  return `translate(50 50) scale(${scale}) translate(-50 -50)`;
}

// ============================================================
// COMPONENT
// ============================================================
export default function CanvasAir({
  onSessionEnd,
  patientId,
  gameId = "canvas-air",
}) {
  const videoRef = useRef(null);
  const [poseData, setPoseData] = useState(null);

  const { currentDifficulty, adapt } = useAdaptiveDifficulty();

  const engine = useGameEngine({
    sessionLength: 600,
    totalReps: 0,
    onRepComplete: undefined,
    onSessionComplete: () => finalizeSessionRef.current?.(),
  });

  const {
    gameState,
    countdown,
    timeLeft,
    isPaused,
    sessionStartTime,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
  } = engine;

  const telemetry = useSessionTelemetry(patientId, gameId);
  const audio = useAudioFeedback(true);

  const initialShapeCount =
    SHAPES_PER_SESSION[currentDifficulty] ?? SHAPES_PER_SESSION.Beginner;
  const [sessionShapes, setSessionShapes] = useState(() =>
    pickSessionShapes(currentDifficulty, initialShapeCount)
  );

  const totalShapes = sessionShapes.length;

  const [currentShapeIndex, setCurrentShapeIndex] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [missed, setMissed] = useState(0);
  const [abandoned, setAbandoned] = useState(0);
  const [score, setScore] = useState(0);
  const [shapeProgress, setShapeProgress] = useState(0);
  const [tracingAccuracy, setTracingAccuracy] = useState(null);
  const [averageDeviation, setAverageDeviation] = useState(0);
  const [showShapeComplete, setShowShapeComplete] = useState(false);
  const [showShapeMissed, setShowShapeMissed] = useState(false);
  const [showShapeAbandoned, setShowShapeAbandoned] = useState(false);
  const [lastShapeMetrics, setLastShapeMetrics] = useState(null);
  const [shapeMetricsHistory, setShapeMetricsHistory] = useState([]);
  const [showGallery, setShowGallery] = useState(false);
  const [trace, setTrace] = useState([]);
  const [sparkles, setSparkles] = useState([]);
  const [shapeTimeLeft, setShapeTimeLeft] = useState(SHAPE_TIME_LIMIT_SECONDS);
  const [calibrated, setCalibrated] = useState(false);

  const [frozenAttempt, setFrozenAttempt] = useState(null);

  // ---- Cursor DOM state (no React re-render per frame) ----
  const cursorElRef = useRef(null);
  const cursorPosRef = useRef({ x: 50, y: 50, visible: false });
  const [cursorVisible, setCursorVisible] = useState(false);

  // ---- Debug HUD (dev-only, see DEBUG_TRACKING) ----
  // Written every frame from the same code paths that already compute
  // these values; a separate rAF loop below reads it so the HUD never
  // triggers a React re-render.
  const debugElRef = useRef(null);
  const debugSnapshotRef = useRef({
    raw: null,
    mirrored: null,
    filtered: null,
    mapped: null,
    onPath: null,
    distance: null,
    valid: false,
  });

  const {
    isActive,
    error: poseError,
    calibrate,
    calibrationData,
  } = useMediaPipeUpperBody({
    videoRef,
    onPoseUpdate: setPoseData,
  });

  const {
    fingertip,
    isReady: handReady,
    error: handError,
  } = useHandTracking({
    videoRef,
    numHands: 1,
  });

  const { shoulderAngle } = usePoseDetection(poseData);
  const guidance = usePostureGuidance(poseData, calibrationData);
  const { papsScore, isPainDetected, resetPainState } =
    useFacialPainDetection({ videoRef });

  const currentShape = sessionShapes[currentShapeIndex] || null;
  const currentShapePath = currentShape?.path || SHAPES[0].path;
  const currentShapeLabel = currentShape
    ? `${currentShape.icon || ""} ${currentShape.name || ""}`.trim()
    : "";

  const baseTolerance = getBaseTolerance(currentDifficulty);
  const dynamicTolerance = useMemo(
    () =>
      Math.max(
        MIN_TOLERANCE_FLOOR,
        Math.min(MAX_TOLERANCE_CEIL, baseTolerance)
      ),
    [baseTolerance]
  );

  const romDegrees = useMemo(() => {
    if (!poseData) return null;
    const v = poseData.maxShoulderAngle;
    return typeof v === "number" && Number.isFinite(v) && v > 0
      ? Math.round(v)
      : null;
  }, [poseData]);

  const totalAttempted = completed + missed + abandoned;
  const accuracyBand = getAccuracyBand(tracingAccuracy ?? 0);

  // Moved here (before the `if (isComplete) return ...` below) because
  // useMemo is a Hook: calling it after a conditional early return means
  // this component calls a different number of hooks depending on
  // gameState, which violates React's Rules of Hooks and throws
  // "Rendered fewer hooks than expected" the moment a session completes.
  const contiguousGroups = useMemo(() => {
    const groups = { onPath: [], edge: [], off: [] };
    if (trace.length === 0) return groups;

    let current = null;
    let buffer = [];
    const flush = () => {
      if (buffer.length >= 2 && current) groups[current].push(buffer.slice());
      buffer = [];
    };

    for (const p of trace) {
      const cls = p.cls || "off";
      if (cls !== current) {
        flush();
        current = cls;
      }
      buffer.push(p);
    }
    flush();
    return groups;
  }, [trace]);

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

  // ---- Fingertip filtering ----
  //
  // Runs whenever useHandTracking emits a new fingertip. The FILTERED
  // point is what the rest of the component reads. The filter is only
  // reset when the hand has been gone for FILTER_RESET_GAP_MS; a
  // one-frame dropout stretches the filter's internal dt instead of
  // starting over, so the cursor does not stutter at the edge of a
  // reach.
  const filteredFingertipRef = useRef(null);
  const filteredTimestampRef = useRef(0);
  const fingertipFilterRef = useRef(
    new PointOneEuroFilter(
      ONE_EURO_MIN_CUTOFF,
      ONE_EURO_BETA,
      ONE_EURO_D_CUTOFF
    )
  );
  const lastFingertipSeenMsRef = useRef(0);

  // Running min/max of mirrored fingertip.x/y actually seen this session.
  // Expand-only: we want the box to grow to cover real reach, not shrink
  // and clip a user out again after they've proven they can reach further.
  const observedRangeRef = useRef({ minX: null, maxX: null, minY: null, maxY: null });

  function getEffectiveHandRange() {
    const obs = observedRangeRef.current;
    const spanX = obs.maxX != null ? obs.maxX - obs.minX : 0;
    const spanY = obs.maxY != null ? obs.maxY - obs.minY : 0;
    const rangeX =
      spanX >= HAND_RANGE_MIN_SPAN
        ? [Math.max(0, obs.minX - HAND_RANGE_PADDING), Math.min(1, obs.maxX + HAND_RANGE_PADDING)]
        : DEFAULT_HAND_RANGE_X;
    const rangeY =
      spanY >= HAND_RANGE_MIN_SPAN
        ? [Math.max(0, obs.minY - HAND_RANGE_PADDING), Math.min(1, obs.maxY + HAND_RANGE_PADDING)]
        : DEFAULT_HAND_RANGE_Y;
    return { rangeX, rangeY };
  }

  useEffect(() => {
    const now = performance.now();

    // No fingertip this render.
    if (
      !fingertip ||
      !Number.isFinite(fingertip.x) ||
      !Number.isFinite(fingertip.y)
    ) {
      if (DEBUG_TRACKING) {
        debugSnapshotRef.current.raw = null;
        debugSnapshotRef.current.valid = false;
      }
      const lastSeen = lastFingertipSeenMsRef.current;
      if (lastSeen === 0 || now - lastSeen > FILTER_RESET_GAP_MS) {
        fingertipFilterRef.current.reset();
        filteredFingertipRef.current = null;
        filteredTimestampRef.current = 0;
      }
      // If the gap is short, keep the last filtered point in the ref.
      // The tracing effect will still see `fingertip === null` and skip,
      // but the filter state survives so the next sample is smooth.
      return;
    }

    // useHandTracking emits normalized (0..1) coordinates in the raw
    // camera frame. The <video> is mirrored with scale-x-[-1], so we
    // flip x here before filtering. This is the ONLY place x is flipped.
    const mirrored = { x: 1 - fingertip.x, y: fingertip.y };

    const obs = observedRangeRef.current;
    obs.minX = obs.minX == null ? mirrored.x : Math.min(obs.minX, mirrored.x);
    obs.maxX = obs.maxX == null ? mirrored.x : Math.max(obs.maxX, mirrored.x);
    obs.minY = obs.minY == null ? mirrored.y : Math.min(obs.minY, mirrored.y);
    obs.maxY = obs.maxY == null ? mirrored.y : Math.max(obs.maxY, mirrored.y);

    if (DEBUG_TRACKING) {
      debugSnapshotRef.current.raw = { x: fingertip.x, y: fingertip.y };
      debugSnapshotRef.current.mirrored = mirrored;
      debugSnapshotRef.current.valid = true;
    }

    const lastSeen = lastFingertipSeenMsRef.current;
    const gapMs = lastSeen === 0 ? 0 : now - lastSeen;
    const isResuming = gapMs > 0 && gapMs < FILTER_RESET_GAP_MS;

    let filtered;
    if (isResuming) {
      // Stretch dt across the gap. Use the previous frame's nominal dt
      // (~1/60s) as the forced dt so the One Euro does not see a huge
      // instantaneous velocity on the first sample back.
      const forcedDt = 1 / 60;
      filtered = fingertipFilterRef.current.filter(mirrored, now, forcedDt);
    } else {
      filtered = fingertipFilterRef.current.filter(mirrored, now);
    }

    filteredFingertipRef.current = filtered;
    filteredTimestampRef.current = now;
    lastFingertipSeenMsRef.current = now;
    if (DEBUG_TRACKING) {
      debugSnapshotRef.current.filtered = filtered;
    }
  }, [fingertip]);

  // ---- Cursor rAF ----
  // Reads cursorPosRef, which is written by the tracing effect. If the
  // tracing effect hasn't written for a while (paused, show overlay),
  // the cursor keeps its last position and its last visibility flag.
  useEffect(() => {
    let rafId;
    const tick = () => {
      const el = cursorElRef.current;
      const pos = cursorPosRef.current;
      if (el) {
        if (!pos.visible) {
          if (el.style.display !== "none") el.style.display = "none";
        } else {
          if (el.style.display !== "block") el.style.display = "block";
          el.style.left = `${pos.x}%`;
          el.style.top = `${pos.y}%`;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // ---- Debug HUD rAF (dev-only) ----
  // Reads debugSnapshotRef, which is written inline by the filtering
  // and tracing effects above. Kept as its own rAF loop so it never
  // causes a React re-render, matching the cursor loop's approach.
  useEffect(() => {
    if (!DEBUG_TRACKING) return undefined;
    let rafId;
    const tick = () => {
      const el = debugElRef.current;
      const s = debugSnapshotRef.current;
      if (el) {
        const fmt = (p) =>
          p ? `${p.x.toFixed(3)}, ${p.y.toFixed(3)}` : "—";
        el.textContent =
          `valid:     ${s.valid}\n` +
          `raw:       ${fmt(s.raw)}\n` +
          `mirrored:  ${fmt(s.mirrored)}\n` +
          `filtered:  ${fmt(s.filtered)}\n` +
          `mapped:    ${
            s.mapped ? `${s.mapped.x.toFixed(2)}, ${s.mapped.y.toFixed(2)}` : "—"
          }\n` +
          `onPath:    ${s.onPath}\n` +
          `distance:  ${s.distance == null ? "—" : s.distance.toFixed(3)}`;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setSparkles((prev) =>
        prev.filter((s) => Date.now() - s.createdAt < 700)
      );
    }, 250);
    return () => clearInterval(id);
  }, []);

  // ---- Per-attempt refs ----
  const movementStatsRef = useRef(emptyMovementStats());
  const averageDeviationRef = useRef(0);
  const motionRef = useRef(emptyMotionTrack());
  const attemptStartMsRef = useRef(null);
  const attemptIdRef = useRef(0);
  const attemptShapeIndexRef = useRef(null);
  const attemptStateRef = useRef("NOT_STARTED");
  const finalizedAttemptsRef = useRef(new Set());
  const hasEndedRef = useRef(false);
  const finalizeSessionRef = useRef(null);
  const shapeMetricsHistoryRef = useRef([]);

  useEffect(() => {
    shapeMetricsHistoryRef.current = shapeMetricsHistory;
  }, [shapeMetricsHistory]);

  // ---- Attempt lifecycle ----
  const beginAttempt = useCallback(
    (shapeIndex, shapeDef) => {
      if (!shapeDef) return;

      const scale = getShapeScaleForROM(romDegrees, shapeDef.difficulty);

      const sampleCount = shapeDef.path.length > 80 ? 600 : 400;
      const rawPoints = samplePath(shapeDef.path, sampleCount);
      const sampledPath = scalePathPoints(rawPoints, scale);
      const tracker = createPathCoverageTracker(sampledPath, dynamicTolerance);

      // Freeze the hand->canvas remap range for this whole attempt, same
      // as scale/tolerance/sampledPath just above. observedRangeRef keeps
      // growing in the background from every raw fingertip sample (see
      // the filtering effect), but reading it fresh every frame DURING
      // tracing means the mapping itself shifts mid-stroke whenever the
      // box expands — the same physical fingertip position lands on a
      // different canvas point than a moment ago. That produces exactly
      // the teleporting, disconnected-dot trace seen in testing. Freezing
      // it here removes the mid-attempt jump; the range still improves
      // from attempt to attempt as more of the user's reach is observed.
      const handRange = getEffectiveHandRange();

      attemptIdRef.current += 1;
      attemptShapeIndexRef.current = shapeIndex;
      attemptStateRef.current = "ACTIVE";
      attemptStartMsRef.current = null;
      movementStatsRef.current = emptyMovementStats();
      averageDeviationRef.current = 0;
      motionRef.current = emptyMotionTrack();

      // Reset the fingertip filter so the new attempt starts from a
      // clean state. Without this, a stale filtered value from the last
      // attempt could momentarily place the cursor somewhere unexpected.
      fingertipFilterRef.current.reset();
      filteredFingertipRef.current = null;
      filteredTimestampRef.current = 0;
      lastFingertipSeenMsRef.current = 0;

      setFrozenAttempt({
        attemptId: attemptIdRef.current,
        shape: shapeDef,
        shapeIndex,
        scale,
        tolerance: dynamicTolerance,
        sampledPath,
        tracker,
        handRange,
      });

      setTrace([]);
      setShapeProgress(0);
      setTracingAccuracy(null);
      setAverageDeviation(0);
      setShowShapeComplete(false);
      setShowShapeMissed(false);
      setShowShapeAbandoned(false);
      setLastShapeMetrics(null);
      setShapeTimeLeft(SHAPE_TIME_LIMIT_SECONDS);
      cursorPosRef.current = { x: 50, y: 50, visible: false };
      setCursorVisible(false);
    },
    [dynamicTolerance, romDegrees]
  );

  useEffect(() => {
    if (!currentShape) return;
    if (
      frozenAttempt &&
      frozenAttempt.shapeIndex === currentShapeIndex &&
      frozenAttempt.shape === currentShape &&
      attemptStateRef.current === "ACTIVE"
    ) {
      return;
    }
    beginAttempt(currentShapeIndex, currentShape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShapeIndex, currentShape]);

  // ---- Finalize an attempt and record it ----
  const finalizeAttempt = useCallback(
    (reason) => {
      const attempt = frozenAttempt;
      if (!attempt) return null;
      if (attemptStateRef.current === "FINALIZED") return null;
      if (finalizedAttemptsRef.current.has(attempt.attemptId)) return null;

      attemptStateRef.current = "FINALIZED";
      finalizedAttemptsRef.current.add(attempt.attemptId);

      const elapsedSeconds =
        attemptStartMsRef.current != null
          ? (performance.now() - attemptStartMsRef.current) / 1000
          : 0;

      const stats = movementStatsRef.current;
      const accuracy = getMovementAccuracy(stats);
      const smoothness = computeSmoothness(
        motionRef.current.velocities,
        motionRef.current.accelerations,
        motionRef.current.pathLength
      );

      const coverage = attempt.tracker.getCoverage();

      const painActive = papsScore >= PAPS_PAIN_THRESHOLD;
      const safeSmoothness = smoothness ?? 0;
      const rawScore =
        reason === "completed"
          ? Math.round(safeSmoothness / 10) + attempt.shape.difficulty
          : 0;
      const painAdjustedScore =
        reason === "completed" && painActive
          ? attempt.shape.difficulty + 3
          : rawScore;

      const metrics = {
        attemptId: attempt.attemptId,
        shapeName: attempt.shape.name,
        shapeDifficulty: attempt.shape.difficulty,
        shapeScaleApplied: attempt.scale,
        outcome: reason,
        completed: reason === "completed",
        abandoned: reason === "abandoned",
        coveragePercent: Math.round(coverage * 100) / 100,
        tracingAccuracyPercent:
          accuracy == null ? null : Math.round(accuracy * 100) / 100,
        averageDeviationUnits:
          Math.round(averageDeviationRef.current * 1000) / 1000,
        completionTimeSeconds: Math.round(elapsedSeconds * 100) / 100,
        smoothnessScore: smoothness,
        movedDistanceUnits: Math.round(stats.movedDistance * 100) / 100,
        toleranceUsed: Math.round(attempt.tolerance * 100) / 100,
        papsScore,
        painAdjusted: painActive,
      };

      setLastShapeMetrics(metrics);
      setShapeMetricsHistory((prev) => {
        const next = prev.concat(metrics);
        shapeMetricsHistoryRef.current = next;
        return next;
      });

      if (reason === "completed") {
        setCompleted((v) => v + 1);
        setScore((s) => s + painAdjustedScore);
        setShowShapeComplete(true);
        if (safeSmoothness >= 70 || painActive) audio.playSuccess();
      } else if (reason === "timeout") {
        setMissed((m) => m + 1);
        setShowShapeMissed(true);
        audio.playMiss();
      } else {
        setAbandoned((a) => a + 1);
      }

      telemetry.recordRep(reason === "completed", {
        accuracy: metrics.tracingAccuracyPercent,
        coverage: metrics.coveragePercent,
        deviation: metrics.averageDeviationUnits,
        timeToComplete: metrics.completionTimeSeconds,
        shapeName: metrics.shapeName,
        shapeDifficulty: metrics.shapeDifficulty,
        shapeScaleApplied: metrics.shapeScaleApplied,
        smoothness: metrics.smoothnessScore,
        toleranceUsed: metrics.toleranceUsed,
        papsScore: metrics.papsScore,
        painAdjusted: metrics.painAdjusted,
        outcome: metrics.outcome,
      });

      return metrics;
    },
    [frozenAttempt, papsScore, telemetry, audio]
  );

  const advanceShape = useCallback(() => {
    const next = currentShapeIndex + 1;
    if (next >= totalShapes) return;

    const history = shapeMetricsHistoryRef.current;
    const recent = history.slice(-3);
    const recentAcc =
      recent.length > 0
        ? recent
            .map((m) => m.tracingAccuracyPercent ?? 0)
            .reduce((a, b) => a + b, 0) / recent.length
        : 0;

    const newDifficulty = adapt({
      accuracy: recentAcc,
      papsScore,
      combo: completed,
      maxFlexionAngle: romDegrees,
    });

    setSessionShapes((prev) => {
      const nextList = prev.slice();
      const usedNames = nextList.map((s) => s.name);
      const replacement = pickReplacementShape(newDifficulty, usedNames);
      nextList[next] = replacement;
      return nextList;
    });

    setCurrentShapeIndex(next);
  }, [
    currentShapeIndex,
    totalShapes,
    adapt,
    completed,
    papsScore,
    romDegrees,
  ]);

  useEffect(() => {
    if (!showShapeComplete && !showShapeMissed) return undefined;
    const t = setTimeout(() => {
      setShowShapeComplete(false);
      setShowShapeMissed(false);
      setLastShapeMetrics(null);
      advanceShape();
    }, SHAPE_ADVANCE_DELAY_MS);
    return () => clearTimeout(t);
  }, [showShapeComplete, showShapeMissed, advanceShape]);

  // ---- Tracing ----
  //
  // The tracing effect is the SINGLE writer of cursorPosRef. The rAF
  // loop above only reads. This guarantees the cursor and the trace
  // never disagree by a frame.
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    if (showShapeComplete || showShapeMissed) return;
    if (!frozenAttempt) return;
    if (!fingertip) return;

    const filtered = filteredFingertipRef.current;
    if (!filtered) return;
    if (!Number.isFinite(filtered.x) || !Number.isFinite(filtered.y)) return;

    // Reject genuinely off-frame samples. A small margin is allowed so
    // a filtered value just past the edge of the frame is still used,
    // but nothing is ever clamped — a point outside the box is either
    // used verbatim or dropped.
    if (
      filtered.x < -OFF_FRAME_MARGIN ||
      filtered.x > 1 + OFF_FRAME_MARGIN ||
      filtered.y < -OFF_FRAME_MARGIN ||
      filtered.y > 1 + OFF_FRAME_MARGIN
    ) {
      cursorPosRef.current = { ...cursorPosRef.current, visible: false };
      if (cursorVisible) setCursorVisible(false);
      return;
    }

    if (attemptStartMsRef.current == null) {
      attemptStartMsRef.current = performance.now();
    }

    const { rangeX, rangeY } = frozenAttempt.handRange;
    const nx = remapNormalized(filtered.x, rangeX);
    const ny = remapNormalized(filtered.y, rangeY);
    const point = { x: nx * 100, y: ny * 100 };
    const nowMs = performance.now();

    // Cursor position — deadbanded against sub-pixel jitter.
    const prevCursor = cursorPosRef.current;
    if (prevCursor.visible) {
      const dx = Math.abs(prevCursor.x - point.x);
      const dy = Math.abs(prevCursor.y - point.y);
      if (dx < CURSOR_DEADBAND_UNITS && dy < CURSOR_DEADBAND_UNITS) {
        // Keep the last position; do not update left/top.
      } else {
        cursorPosRef.current = { x: point.x, y: point.y, visible: true };
      }
    } else {
      cursorPosRef.current = { x: point.x, y: point.y, visible: true };
    }
    if (!cursorVisible) setCursorVisible(true);

    const { distance } = recordMotionSample(motionRef.current, point, nowMs);

    const result = frozenAttempt.tracker.update(point);

    movementStatsRef.current = updateMovementStats(
      movementStatsRef.current,
      distance,
      result.onPath
    );
    const acc = getMovementAccuracy(movementStatsRef.current);
    setTracingAccuracy(acc);

    if (Number.isFinite(result.distance)) {
      const prev = averageDeviationRef.current;
      averageDeviationRef.current = prev + (result.distance - prev) * 0.05;
      setAverageDeviation(averageDeviationRef.current);
    }

    const cls = classifyFeedback(result.distance, frozenAttempt.tolerance);

    if (DEBUG_TRACKING) {
      debugSnapshotRef.current.mapped = point;
      debugSnapshotRef.current.onPath = result.onPath;
      debugSnapshotRef.current.distance = result.distance;
    }

    setTrace((cur) => {
      const next = cur.concat({ x: point.x, y: point.y, cls });
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });

    if (cls === "onPath" && Math.random() < 0.06) {
      setSparkles((prev) => {
        const next = prev.concat({
          id: `${Date.now()}-${Math.random()}`,
          x: point.x,
          y: point.y,
          color: FEEDBACK_COLORS.onPath,
          createdAt: Date.now(),
        });
        return next.length > 16 ? next.slice(next.length - 16) : next;
      });
    }

    setShapeProgress(frozenAttempt.tracker.getCoverage());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gameState,
    isPaused,
    showShapeComplete,
    showShapeMissed,
    frozenAttempt,
    fingertip,
  ]);

  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    if (showShapeComplete || showShapeMissed || showShapeAbandoned) return;
    if (!frozenAttempt) return;
    if (attemptStateRef.current !== "ACTIVE") return;

    const threshold =
      currentDifficulty === "Advanced"
        ? 90
        : currentDifficulty === "Intermediate"
        ? 85
        : 80;

    if (shapeProgress < threshold) return;
    if (frozenAttempt.tracker.getCoverage() < threshold) return;

    finalizeAttempt("completed");
  }, [
    shapeProgress,
    gameState,
    isPaused,
    showShapeComplete,
    showShapeMissed,
    showShapeAbandoned,
    frozenAttempt,
    currentDifficulty,
    finalizeAttempt,
  ]);

  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    if (showShapeComplete || showShapeMissed || showShapeAbandoned) return;
    if (!frozenAttempt) return;
    if (attemptStartMsRef.current == null) return;
    if (attemptStateRef.current !== "ACTIVE") return;

    let rafId;
    const tick = () => {
      const start = attemptStartMsRef.current;
      if (start == null) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const elapsed = (performance.now() - start) / 1000;
      const remaining = Math.max(
        0,
        Math.ceil(SHAPE_TIME_LIMIT_SECONDS - elapsed)
      );
      setShapeTimeLeft((prev) => (prev === remaining ? prev : remaining));
      if (remaining > 0 && attemptStateRef.current === "ACTIVE") {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    gameState,
    isPaused,
    showShapeComplete,
    showShapeMissed,
    showShapeAbandoned,
    frozenAttempt,
  ]);

  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    if (showShapeComplete || showShapeMissed || showShapeAbandoned) return;
    if (!frozenAttempt) return;
    if (attemptStartMsRef.current == null) return;
    if (attemptStateRef.current !== "ACTIVE") return;
    if (shapeTimeLeft > 0) return;
    finalizeAttempt("timeout");
  }, [
    shapeTimeLeft,
    gameState,
    isPaused,
    showShapeComplete,
    showShapeMissed,
    showShapeAbandoned,
    frozenAttempt,
    finalizeAttempt,
  ]);

  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE) return undefined;
    if (completed + missed + abandoned < totalShapes) return undefined;
    const t = setTimeout(() => {
      endSession();
    }, SHAPE_ADVANCE_DELAY_MS + 200);
    return () => clearTimeout(t);
  }, [completed, missed, abandoned, totalShapes, gameState, endSession]);

  useEffect(() => {
    if (!isPainDetected || gameState !== GAME_STATES.ACTIVE) return;
    pauseSession();
    telemetry.trackPain(papsScore);
  }, [isPainDetected, gameState, pauseSession, telemetry, papsScore]);

  const finalizeSession = useCallback(() => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;

    if (attemptStateRef.current === "ACTIVE" && frozenAttempt) {
      const remaining = frozenAttempt;
      const stats = movementStatsRef.current;
      const accuracy = getMovementAccuracy(stats);
      const smoothness = computeSmoothness(
        motionRef.current.velocities,
        motionRef.current.accelerations,
        motionRef.current.pathLength
      );
      const elapsedSeconds =
        attemptStartMsRef.current != null
          ? (performance.now() - attemptStartMsRef.current) / 1000
          : 0;
      const trailing = {
        attemptId: remaining.attemptId,
        shapeName: remaining.shape.name,
        shapeDifficulty: remaining.shape.difficulty,
        shapeScaleApplied: remaining.scale,
        outcome: "abandoned",
        completed: false,
        abandoned: true,
        coveragePercent: Math.round(remaining.tracker.getCoverage() * 100) / 100,
        tracingAccuracyPercent:
          accuracy == null ? null : Math.round(accuracy * 100) / 100,
        averageDeviationUnits:
          Math.round(averageDeviationRef.current * 1000) / 1000,
        completionTimeSeconds: Math.round(elapsedSeconds * 100) / 100,
        smoothnessScore: smoothness,
        movedDistanceUnits: Math.round(stats.movedDistance * 100) / 100,
        toleranceUsed: Math.round(remaining.tolerance * 100) / 100,
        papsScore,
        painAdjusted: papsScore >= PAPS_PAIN_THRESHOLD,
      };
      if (!finalizedAttemptsRef.current.has(trailing.attemptId)) {
        finalizedAttemptsRef.current.add(trailing.attemptId);
        attemptStateRef.current = "FINALIZED";
        shapeMetricsHistoryRef.current = shapeMetricsHistoryRef.current.concat(trailing);
        telemetry.recordRep(false, {
          accuracy: trailing.tracingAccuracyPercent,
          coverage: trailing.coveragePercent,
          deviation: trailing.averageDeviationUnits,
          timeToComplete: trailing.completionTimeSeconds,
          shapeName: trailing.shapeName,
          shapeDifficulty: trailing.shapeDifficulty,
          shapeScaleApplied: trailing.shapeScaleApplied,
          smoothness: trailing.smoothnessScore,
          toleranceUsed: trailing.toleranceUsed,
          papsScore: trailing.papsScore,
          painAdjusted: trailing.painAdjusted,
          outcome: "abandoned",
        });
        setAbandoned((a) => a + 1);
      }
    }

    const history = shapeMetricsHistoryRef.current;

    const accuracies = history
      .map((m) => m.tracingAccuracyPercent)
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    const smoothnesses = history
      .map((m) => m.smoothnessScore)
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    const coverages = history
      .map((m) => m.coveragePercent)
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    const times = history
      .map((m) => m.completionTimeSeconds)
      .filter((v) => typeof v === "number" && Number.isFinite(v));

    const mean = (arr) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const avgAccuracyRaw = mean(accuracies);
    const avgSmoothnessRaw = mean(smoothnesses);
    const avgCoverageRaw = mean(coverages);
    const avgCompletionTimeRaw = mean(times);

    const avgAccuracy =
      avgAccuracyRaw == null ? null : Math.round(avgAccuracyRaw * 100) / 100;
    const avgSmoothness =
      avgSmoothnessRaw == null
        ? null
        : Math.round(avgSmoothnessRaw * 100) / 100;
    const avgCoverage =
      avgCoverageRaw == null ? null : Math.round(avgCoverageRaw * 100) / 100;
    const avgCompletionTime =
      avgCompletionTimeRaw == null
        ? null
        : Math.round(avgCompletionTimeRaw * 100) / 100;

    const abandonedCount = history.filter((m) => m.abandoned).length;
    const completedCount = history.filter(
      (m) => m.outcome === "completed"
    ).length;
    const missedCount = history.filter((m) => m.outcome === "timeout").length;

    const durationSeconds =
      sessionStartTime != null
        ? Math.max(0, Math.round((Date.now() - sessionStartTime) / 1000))
        : null;

    const completionRatio =
      history.length > 0
        ? Math.round((completedCount / history.length) * 100)
        : 0;
    const summaryAccuracyPercent = avgAccuracy ?? completionRatio;

    telemetry.endSession({
      gameName: "Canvas Air",
      score,
      accuracy: summaryAccuracyPercent,
      accuracyPercent: summaryAccuracyPercent,
      smoothness: avgSmoothness,
      difficulty: currentDifficulty,
      paps: papsScore,
      durationSeconds,
      reps: completedCount,
      hitsOrCatchesOrCompletions: completedCount,
      missesOrDrops: missedCount,
      gameSpecific: {
        paps: papsScore,
        painAdjusted: papsScore >= PAPS_PAIN_THRESHOLD,
        shapesCompleted: completedCount,
        shapesMissed: missedCount,
        shapesAbandoned: abandonedCount,
        totalShapes,
        sessionShapeNames: sessionShapes.map((s) => s.name),
        accuracyPercent: summaryAccuracyPercent,
        averageTracingAccuracyPercent: avgAccuracy,
        averageSmoothness: avgSmoothness,
        averageCoveragePercent: avgCoverage,
        averageCompletionTimeSeconds: avgCompletionTime,
        averageDeviationUnits:
          history.length > 0
            ? Math.round(
                mean(
                  history
                    .map((m) => m.averageDeviationUnits)
                    .filter((v) => typeof v === "number" && Number.isFinite(v))
                ) * 1000
              ) / 1000
            : null,
        painAdjustedShapes: history.filter((m) => m.painAdjusted).length,
        brushJoint: "INDEX_FINGER_TIP",
        shapeMetricsHistory: history,
      },
      romData: null,
    });
  }, [
    telemetry,
    score,
    papsScore,
    currentDifficulty,
    totalShapes,
    sessionShapes,
    frozenAttempt,
    sessionStartTime,
  ]);

  finalizeSessionRef.current = finalizeSession;

  const handleEndSession = useCallback(() => {
    endSession();
  }, [endSession]);

  const handleRestartSession = useCallback(() => {
    hasEndedRef.current = false;
    finalizedAttemptsRef.current = new Set();
    attemptStateRef.current = "NOT_STARTED";
    attemptStartMsRef.current = null;
    attemptShapeIndexRef.current = null;

    fingertipFilterRef.current.reset();
    filteredFingertipRef.current = null;
    filteredTimestampRef.current = 0;
    lastFingertipSeenMsRef.current = 0;
    observedRangeRef.current = { minX: null, maxX: null, minY: null, maxY: null };

    setFrozenAttempt(null);
    setCompleted(0);
    setMissed(0);
    setAbandoned(0);
    setScore(0);
    setShapeMetricsHistory([]);
    shapeMetricsHistoryRef.current = [];
    setCurrentShapeIndex(0);
    setTrace([]);
    setSparkles([]);
    setShapeProgress(0);
    setTracingAccuracy(null);
    setAverageDeviation(0);
    setShowShapeComplete(false);
    setShowShapeMissed(false);
    setShowShapeAbandoned(false);
    setLastShapeMetrics(null);
    cursorPosRef.current = { x: 50, y: 50, visible: false };
    setCursorVisible(false);

    const freshCount =
      SHAPES_PER_SESSION[currentDifficulty] ?? SHAPES_PER_SESSION.Beginner;
    setSessionShapes(pickSessionShapes(currentDifficulty, freshCount));

    telemetry.startTracking();
    startSession();
  }, [telemetry, startSession, currentDifficulty]);

  const navigateToShapeIndex = useCallback(
    (targetIndex, { reshuffle = false } = {}) => {
      if (totalShapes === 0) return;
      const normalized =
        ((targetIndex % totalShapes) + totalShapes) % totalShapes;

      const isLiveAttempt =
        attemptStateRef.current === "ACTIVE" &&
        attemptStartMsRef.current != null &&
        frozenAttempt != null;

      if (isLiveAttempt) {
        finalizeAttempt("abandoned");
      } else if (attemptStateRef.current === "ACTIVE" && frozenAttempt) {
        attemptStateRef.current = "FINALIZED";
        finalizedAttemptsRef.current.add(frozenAttempt.attemptId);
      }

      if (reshuffle) {
        const freshCount =
          SHAPES_PER_SESSION[currentDifficulty] ?? SHAPES_PER_SESSION.Beginner;
        setSessionShapes(pickSessionShapes(currentDifficulty, freshCount));
        setCurrentShapeIndex(0);
        return;
      }

      if (normalized === currentShapeIndex) {
        // Re-selecting the shape already on screen: currentShapeIndex and
        // currentShape don't change, so the effect that normally starts a
        // fresh attempt on shape change won't re-fire. Start it directly
        // here instead of just clearing it, or this shape is left with
        // no tracker and can never be completed.
        beginAttempt(normalized, sessionShapes[normalized]);
        return;
      }

      setCurrentShapeIndex(normalized);
    },
    [
      totalShapes,
      frozenAttempt,
      currentShapeIndex,
      currentDifficulty,
      finalizeAttempt,
      beginAttempt,
      sessionShapes,
    ]
  );

  const handleRandomShape = useCallback(() => {
    if (totalShapes === 0) return;
    const target = Math.floor(Math.random() * totalShapes);
    navigateToShapeIndex(target);
  }, [navigateToShapeIndex, totalShapes]);

  const handleReshuffle = useCallback(() => {
    navigateToShapeIndex(0, { reshuffle: true });
  }, [navigateToShapeIndex]);

  const isInstructions = gameState === GAME_STATES.INSTRUCTIONS;
  const isComplete = gameState === GAME_STATES.COMPLETE;
  const isActiveScreen = !isInstructions && !isComplete;
  const canStart =
    isActive && handReady && !poseError && !handError && calibrated;

  if (isComplete) {
    const history = shapeMetricsHistoryRef.current;
    const accuracies = history
      .map((m) => m.tracingAccuracyPercent)
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    const smoothnesses = history
      .map((m) => m.smoothnessScore)
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    const coverages = history
      .map((m) => m.coveragePercent)
      .filter((v) => typeof v === "number" && Number.isFinite(v));

    const mean = (arr) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const completedCount = history.filter(
      (m) => m.outcome === "completed"
    ).length;
    const missedCount = history.filter((m) => m.outcome === "timeout").length;
    const abandonedCount = history.filter((m) => m.abandoned).length;
    const avgAcc = mean(accuracies);
    const avgSm = mean(smoothnesses);
    const avgCov = mean(coverages);
    const completionRatio =
      history.length > 0
        ? Math.round((completedCount / history.length) * 100)
        : 0;
    const summaryAccuracy =
      avgAcc == null ? completionRatio : Math.round(avgAcc * 100) / 100;

    const durationSeconds =
      sessionStartTime != null
        ? Math.max(0, Math.round((Date.now() - sessionStartTime) / 1000))
        : 0;

    const sessionData = {
      sessionId: telemetry.sessionId,
      gameId,
      patientId,
      date: new Date().toISOString(),
      durationSeconds,
      score,
      accuracyPercent: summaryAccuracy,
      reps: completedCount,
      hitsOrCatchesOrCompletions: completedCount,
      missesOrDrops: missedCount,
      romData: {
        averageRomDegrees: romDegrees ?? 0,
        maxRomDegrees: romDegrees ?? 0,
        minRomDegrees: 0,
        perRep: [],
      },
      gameSpecificMetrics: {
        paps: papsScore,
        painAdjusted: papsScore >= PAPS_PAIN_THRESHOLD,
        shapesCompleted: completedCount,
        shapesMissed: missedCount,
        shapesAbandoned: abandonedCount,
        totalShapes,
        sessionShapeNames: sessionShapes.map((s) => s.name),
        accuracyPercent: summaryAccuracy,
        averageAccuracyPercent:
          avgAcc == null ? null : Math.round(avgAcc * 100) / 100,
        averageSmoothness:
          avgSm == null ? null : Math.round(avgSm * 100) / 100,
        averageCoveragePercent:
          avgCov == null ? null : Math.round(avgCov * 100) / 100,
        brushJoint: "INDEX_FINGER_TIP",
        shapeMetricsHistory: history,
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
        onRestart={handleRestartSession}
      />
    );
  }

  const galleryPanel = (
    <div className="absolute right-0 top-14 z-30 max-h-96 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
          This Session ({sessionShapes.length})
        </span>
        <button
          onClick={() => setShowGallery(false)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close shape gallery"
        >
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {sessionShapes.map((s, i) => (
          <button
            key={`${s.name}-${i}`}
            onClick={() => {
              setShowGallery(false);
              navigateToShapeIndex(i);
            }}
            className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-colors ${
              i === currentShapeIndex
                ? "border-teal-500 bg-teal-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <span className="text-xl leading-none">{s.icon}</span>
            <span className="text-[10px] leading-tight text-slate-700">
              {s.name}
            </span>
            <span className="text-[9px] text-amber-500">
              {"★".repeat(s.difficulty)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  const formatClock = (s) => {
    const safe = Math.max(0, Math.floor(s));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
  };

  const liveSmoothness = computeSmoothness(
    motionRef.current.velocities,
    motionRef.current.accelerations,
    motionRef.current.pathLength
  );

  const frozenScale = frozenAttempt?.scale ?? 1.0;
  const frozenTolerance = frozenAttempt?.tolerance ?? dynamicTolerance;

  return (
    <div className="min-h-full w-full bg-slate-50 text-slate-800">
      <style>{`
        @keyframes canvasAirPulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.9; }
        }
        @keyframes canvasAirSparkle {
          0% { opacity: 0.9; transform: scale(1); }
          100% { opacity: 0; transform: scale(2.2); }
        }
        @keyframes canvasAirComplete {
          0% { transform: scale(0.85); opacity: 0; }
          60% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes canvasAirShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
      `}</style>

      {isActiveScreen && gameState === GAME_STATES.COUNTDOWN && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 text-8xl font-black text-teal-600">
          {countdown || "GO"}
        </div>
      )}

      {isActiveScreen && isPainDetected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
          <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-2xl">
            <h2 className="mb-3 text-xl font-bold text-red-600">
              Discomfort Detected
            </h2>
            <p className="mb-6 text-slate-600">Please rest before continuing.</p>
            <button
              onClick={() => {
                resetPainState();
                resumeSession();
              }}
              className="rounded-lg bg-teal-600 px-6 py-2 font-bold text-white hover:bg-teal-500"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {isActiveScreen && (
        <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-sm text-slate-700">
              <span
                className={`inline-flex items-center gap-1.5 ${
                  shapeTimeLeft <= 5 && !showShapeComplete && !showShapeMissed
                    ? "text-red-600"
                    : ""
                }`}
              >
                <span className="text-slate-400">Shape time</span>
                <span className="font-semibold">{shapeTimeLeft}s</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-slate-400">Session</span>
                <span className="font-semibold">{formatClock(timeLeft)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-slate-400">Shapes</span>
                <span className="font-semibold">
                  {completed}/{totalShapes}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-slate-400">Coverage</span>
                <span className="font-semibold">
                  {shapeProgress.toFixed(1)}%
                </span>
              </span>
              <span
                className={`inline-flex items-center gap-1.5 font-semibold ${accuracyBand.text}`}
              >
                <span className="font-normal text-slate-400">Accuracy</span>
                {tracingAccuracy == null ? "—" : `${tracingAccuracy.toFixed(1)}%`}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-slate-400">Smoothness</span>
                <span className="font-semibold">
                  {liveSmoothness == null ? "—" : liveSmoothness.toFixed(0)}
                </span>
              </span>
              <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                {currentDifficulty}
              </span>
              {papsScore > 0 && (
                <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">
                  PAPS {papsScore}
                  {papsScore >= PAPS_PAIN_THRESHOLD ? " · pain-adjusted" : ""}
                </span>
              )}
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                Score {score}
              </span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <button
                onClick={() =>
                  navigateToShapeIndex(currentShapeIndex - 1)
                }
                title="Previous shape"
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() =>
                  navigateToShapeIndex(currentShapeIndex + 1)
                }
                title="Next shape"
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100"
              >
                <ChevronRight size={18} />
              </button>
              <button
                onClick={() => setShowGallery((v) => !v)}
                title="Choose shape"
                className={`rounded-lg border p-2 ${
                  showGallery
                    ? "border-teal-500 bg-teal-50 text-teal-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Grid3x3 size={18} />
              </button>
              <button
                onClick={() => (isPaused ? resumeSession() : pauseSession())}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100"
              >
                {isPaused ? <Play size={18} /> : <Pause size={18} />}
              </button>
              <button
                onClick={handleEndSession}
                title="End session"
                className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 hover:bg-red-100"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {isActiveScreen && showGallery && (
        <div className="fixed right-6 top-20 z-40">{galleryPanel}</div>
      )}

      <div
        className={
          isActiveScreen
            ? "mx-auto flex max-w-[1400px] flex-col gap-5 p-5 lg:flex-row"
            : "mx-auto max-w-5xl p-6 pb-16"
        }
      >
        <div className={isActiveScreen ? "" : "w-full"}>
          {isInstructions && (
            <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h1 className="mb-2 text-3xl font-black text-slate-800">
                Canvas <span className="text-teal-600">Air</span>
              </h1>
              <p className="mb-5 leading-relaxed text-slate-600">
                Trace each shape by moving your index fingertip in the air.
                The stroke is drawn in real time: green when it is on the
                outline, red when it is far off. Your session has{" "}
                <span className="font-semibold text-slate-800">
                  {sessionShapes.length} shapes
                </span>{" "}
                at the {currentDifficulty.toLowerCase()} level. Each shape
                has {SHAPE_TIME_LIMIT_SECONDS} seconds, counted from the
                first moment your hand is actually tracked — so camera
                warm-up does not cost you any of it.
              </p>

              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    Brush
                  </span>
                  <span>Index fingertip</span>
                </span>
                <button
                  onClick={() => setShowGallery((v) => !v)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                    showGallery
                      ? "bg-teal-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <Grid3x3 size={16} className="mr-1 inline" />
                  Session Shapes
                </button>
                <button
                  onClick={handleReshuffle}
                  className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  <RefreshCw size={16} className="mr-1 inline" />
                  Reshuffle
                </button>
                <button
                  onClick={handleRandomShape}
                  className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  <Shuffle size={16} className="mr-1 inline" />
                  Random
                </button>
              </div>

              {showGallery && <div className="relative mb-5">{galleryPanel}</div>}

              <div className="flex items-start gap-5">
                <div className="h-40 w-40 flex-shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <svg viewBox="0 0 100 100" className="h-full w-full">
                    <g transform={getShapeTransform(frozenScale)}>
                      <path
                        d={currentShapePath}
                        fill="none"
                        stroke="#0d9488"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  </svg>
                </div>
                <div className="pt-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-lg font-bold text-slate-800">
                      {currentShape?.name}
                    </span>
                    <span className="text-amber-500">
                      {"★".repeat(currentShape?.difficulty || 1)}
                    </span>
                  </div>
                  <div className="space-y-0.5 text-xs text-slate-500">
                    <div>
                      Shape {currentShapeIndex + 1} of {sessionShapes.length}
                    </div>
                    <div>
                      Target scale:{" "}
                      <span className="font-mono font-semibold text-teal-700">
                        {frozenScale.toFixed(2)}×
                      </span>
                    </div>
                    <div>
                      Tolerance:{" "}
                      <span className="font-mono font-semibold">
                        {frozenTolerance.toFixed(1)}u ({currentDifficulty})
                      </span>
                    </div>
                    <div>
                      Per-shape time:{" "}
                      <span className="font-mono font-semibold">
                        {SHAPE_TIME_LIMIT_SECONDS}s
                      </span>
                    </div>
                    <div>
                      Brush joint:{" "}
                      <span className="font-mono font-semibold">
                        Index fingertip
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div
            className={
              isActiveScreen
                ? "relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:w-72 lg:flex-shrink-0"
                : "relative aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            }
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full scale-x-[-1] object-cover"
            />
            <SkeletonOverlay
              poseData={poseData}
              overallStatus={guidance.overallStatus}
              shoulderAngle={shoulderAngle}
            />
            {isInstructions && (
              <div className="absolute left-3 top-3 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 font-mono text-xs text-slate-700 shadow-sm">
                {Math.round(shoulderAngle)}° · PAPS {papsScore} · Tip
              </div>
            )}
            {isActiveScreen && (
              <div
                className={`absolute bottom-3 left-3 rounded-lg border px-3 py-1.5 font-mono text-xs shadow-sm ${
                  cursorVisible
                    ? "border-slate-200 bg-white/90 text-slate-700"
                    : "border-amber-300 bg-amber-50 text-amber-800"
                }`}
              >
                {cursorVisible
                  ? "Fingertip tracking ✓"
                  : "Fingertip not visible — show your hand to the camera"}
              </div>
            )}
          </div>

          {isInstructions && (
            <>
              <div
                className={`mt-4 rounded-xl border p-4 text-sm ${
                  guidance.overallStatus === "ok"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                {guidance.message}
              </div>

              {(poseError || handError) && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {poseError || handError}. Check camera permissions and
                  connection, then reload.
                </div>
              )}

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                <div className="mb-2 font-semibold text-slate-700">
                  How the brush stroke is scored
                </div>
                <ul className="space-y-1 text-xs leading-relaxed">
                  <li>
                    ·{" "}
                    <span className="font-semibold text-emerald-600">
                      Green
                    </span>{" "}
                    — on the outline (inside the tight tolerance band).
                  </li>
                  <li>
                    ·{" "}
                    <span className="font-semibold text-amber-600">Amber</span>{" "}
                    — drifting, but still inside the loose band.
                  </li>
                  <li>
                    · <span className="font-semibold text-red-600">Red</span>{" "}
                    — outside tolerance, off the outline.
                  </li>
                  <li>
                    · Accuracy is measured over your actual movement: how
                    much of the distance you travelled stayed on the
                    outline. Holding still does not change it either way.
                  </li>
                  <li>
                    · Coverage is the proportion of the outline you
                    actually visited. These are two different things.
                  </li>
                  <li>
                    · Smoothness is scored from the{" "}
                    <span className="font-semibold">acceleration</span> of
                    your stroke, normalized against its speed, and only
                    after you have moved enough to measure it.
                  </li>
                  <li>
                    · Each shape has {SHAPE_TIME_LIMIT_SECONDS} seconds. If
                    time runs out before coverage reaches the target, the
                    shape is recorded as{" "}
                    <span className="font-semibold">not completed</span>.
                  </li>
                </ul>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 font-mono text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  90–100% Optimal
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  70–89% Good
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-orange-500" />
                  50–69% Needs focus
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  &lt;50% Slow down
                </span>
              </div>

              <button
                onClick={handleRestartSession}
                disabled={!guidance.isReady || !canStart}
                className="mt-6 rounded-xl bg-teal-600 px-8 py-3 font-bold text-white shadow-sm hover:bg-teal-500 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {canStart
                  ? "Start Session"
                  : isActive && !calibrated
                  ? "Hold still — calibrating…"
                  : "Waiting for camera tracking…"}
              </button>
            </>
          )}
        </div>

        {isActiveScreen && (
          <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <svg
              viewBox="0 0 100 100"
              className="h-full w-full"
              preserveAspectRatio="none"
            >
              <text
                x="50"
                y="9"
                textAnchor="middle"
                fontSize="4.5"
                fontWeight="700"
                fill="#334155"
              >
                {currentShapeLabel}
              </text>
              <text x="97" y="9" textAnchor="end" fontSize="4" fill="#f59e0b">
                {"★".repeat(currentShape?.difficulty || 1)}
              </text>

              <g transform={getShapeTransform(frozenScale)}>
                <path
                  d={currentShapePath}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="2.5"
                  strokeDasharray="4 4"
                  style={{
                    animation: `canvasAirPulse ${accuracyBand.pulse}s ease-in-out infinite`,
                  }}
                />
              </g>

              {contiguousGroups.onPath.map((seg, i) => (
                <polyline
                  key={`onPath-${i}`}
                  points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={FEEDBACK_COLORS.onPath}
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {contiguousGroups.edge.map((seg, i) => (
                <polyline
                  key={`edge-${i}`}
                  points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={FEEDBACK_COLORS.edge}
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {contiguousGroups.off.map((seg, i) => (
                <polyline
                  key={`off-${i}`}
                  points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={FEEDBACK_COLORS.off}
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {sparkles.map((s) => (
                <circle
                  key={s.id}
                  cx={s.x}
                  cy={s.y}
                  r="2"
                  fill={s.color}
                  style={{
                    animation: "canvasAirSparkle 0.7s ease-out forwards",
                  }}
                />
              ))}

              <text
                x="50"
                y="95"
                textAnchor="middle"
                fontSize="4"
                fontWeight="500"
                fill="#94a3b8"
              >
                {currentShape?.name} · {currentDifficulty} ·{" "}
                {shapeProgress.toFixed(1)}% · scale {frozenScale.toFixed(2)}× ·{" "}
                tol {frozenTolerance.toFixed(1)}u
              </text>
            </svg>

            {!cursorVisible && (
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-sm text-slate-500">
                <div className="font-semibold text-slate-700">
                  Show your hand to the camera
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  The shape timer starts as soon as your fingertip is tracked.
                </div>
              </div>
            )}

            <div
              className={`absolute right-4 top-4 rounded-full border px-3 py-1 font-mono text-xs shadow-sm ${
                shapeTimeLeft <= 5 && !showShapeComplete && !showShapeMissed
                  ? "border-red-200 bg-red-50 text-red-600"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {shapeTimeLeft}s
            </div>

            <div className="absolute right-4 top-16 flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm">
              <div className="relative h-12 w-12">
                <svg className="h-12 w-12 -rotate-90">
                  <circle
                    cx="24"
                    cy="24"
                    r="18"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="3"
                  />
                  <circle
                    cx="24"
                    cy="24"
                    r="18"
                    fill="none"
                    stroke={accuracyBand.stroke}
                    strokeWidth="3"
                    strokeDasharray={`${2 * Math.PI * 18 * (shapeProgress / 100)} ${
                      2 * Math.PI * 18
                    }`}
                    style={{
                      transition: "stroke-dasharray 0.3s, stroke 0.3s",
                    }}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700">
                  {Math.round(shapeProgress)}%
                </span>
              </div>
            </div>

            <div className="absolute left-4 bottom-4 text-sm font-bold text-teal-700">
              Score: {score}
            </div>

            {showShapeComplete && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 text-center"
                style={{
                  animation: "canvasAirComplete 0.5s ease-out forwards",
                }}
              >
                <div className="text-5xl font-black text-emerald-500">
                  Shape Complete
                </div>
                {lastShapeMetrics && (
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl border border-slate-200 bg-white px-6 py-3 font-mono text-sm text-slate-700 shadow-sm">
                    <span className="text-slate-500">Coverage</span>
                    <span className="text-right">
                      {lastShapeMetrics.coveragePercent.toFixed(1)}%
                    </span>
                    <span className="text-slate-500">Accuracy</span>
                    <span className="text-right">
                      {lastShapeMetrics.tracingAccuracyPercent == null
                        ? "—"
                        : `${lastShapeMetrics.tracingAccuracyPercent.toFixed(1)}%`}
                    </span>
                    <span className="text-slate-500">Avg. deviation</span>
                    <span className="text-right">
                      {lastShapeMetrics.averageDeviationUnits.toFixed(3)} u
                    </span>
                    <span className="text-slate-500">Completion time</span>
                    <span className="text-right">
                      {lastShapeMetrics.completionTimeSeconds.toFixed(2)}s
                    </span>
                    <span className="text-slate-500">Smoothness</span>
                    <span className="text-right">
                      {lastShapeMetrics.smoothnessScore == null
                        ? "—"
                        : lastShapeMetrics.smoothnessScore.toFixed(1)}
                    </span>
                    {lastShapeMetrics.painAdjusted && (
                      <>
                        <span className="text-red-500">Pain-adjusted</span>
                        <span className="text-right text-red-500">
                          PAPS {lastShapeMetrics.papsScore}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {showShapeMissed && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90 text-center"
                style={{ animation: "canvasAirShake 0.45s ease-in-out" }}
              >
                <div className="text-5xl font-black text-red-500">
                  Time's up
                </div>
                {lastShapeMetrics && (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl border border-slate-200 bg-white px-6 py-3 font-mono text-sm text-slate-700 shadow-sm">
                    <span className="text-slate-500">Coverage</span>
                    <span className="text-right">
                      {lastShapeMetrics.coveragePercent.toFixed(1)}%
                    </span>
                    <span className="text-slate-500">Accuracy</span>
                    <span className="text-right">
                      {lastShapeMetrics.tracingAccuracyPercent == null
                        ? "—"
                        : `${lastShapeMetrics.tracingAccuracyPercent.toFixed(1)}%`}
                    </span>
                    <span className="text-slate-500">Recorded as</span>
                    <span className="text-right text-red-600 font-bold">
                      completed: false
                    </span>
                  </div>
                )}
              </div>
            )}

            <div
              ref={cursorElRef}
              className="pointer-events-none absolute h-5 w-5 rounded-full border-2 border-teal-500 bg-teal-200/60 shadow"
              style={{
                display: "none",
                transform: "translate(-50%, -50%)",
                willChange: "left, top",
              }}
            />
            {DEBUG_TRACKING && (
              <pre
                ref={debugElRef}
                className="pointer-events-none absolute left-4 top-4 z-40 whitespace-pre rounded-lg bg-black/80 px-3 py-2 font-mono text-[10px] leading-tight text-emerald-300"
              >
                loading…
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}