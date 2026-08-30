// frontend/src/games/CanvasAir.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, X, RefreshCw, ChevronLeft, ChevronRight, Shuffle, Grid3x3 } from "lucide-react";

import useMediaPipeUpperBody from "../hooks/useMediaPipeUpperBody";
import useHandTracking from "../hooks/useHandTracking";
import usePoseDetection from "../hooks/usePoseDetection";
import usePostureGuidance from "../hooks/usePostureGuidance";
import useFacialPainDetection from "../hooks/useFacialPainDetection";
import useAdaptiveDifficulty from "../hooks/useAdaptiveDifficulty";
import { useGameEngine, GAME_STATES } from "../hooks/useGameEngine";
import { useSessionTelemetry } from "../hooks/useSessionTelemetry";
import { useAudioFeedback } from "../hooks/useAudioFeedback";
import { samplePath, createPathCoverageTracker, closestPointOnPath } from "../utils/svgPathSampler";
import SkeletonOverlay from "../components/rehab/SkeletonOverlay";
import SessionSummary from "../components/rehab/SessionSummary";
import MetricsEngine from "../utils/metricsEngine";

// --- CONSTANTS ---
const SESSION_SECONDS = 120;
const TRACE_TOLERANCE_UNITS = 5;
const MIN_TRACE_TOLERANCE_UNITS = 2.5;
const SHAPE_TIME_LIMIT_SECONDS = 30;
const SPARKLE_LIFETIME_MS = 700;
const DEVIATION_PENALTY_FACTOR = 0.5;
const MAX_ALLOWED_DEVIATION = 15;

// How many shapes make up a single session. A random count of 4 or 5 is
// picked once per session, then that many *distinct* shapes are drawn from
// the full collection. The session ends once every one of those shapes has
// been either completed or missed — it's a fixed, finite set, not an
// endless cycle through all 19 shapes.
const SESSION_SHAPE_MIN = 4;
const SESSION_SHAPE_MAX = 5;

// Sample density used for the reference path polyline. Curved shapes (Circle,
// Heart, Spiral, ...) get more samples so the polyline hugs the true SVG
// curve tightly enough that our sub-pixel projection below is meaningful —
// with too few samples, "sub-pixel accuracy against the polyline" would
// still be a coarse approximation of the real path.
const PATH_SAMPLE_COUNT_SIMPLE = 400;
const PATH_SAMPLE_COUNT_COMPLEX = 600;

// Difficulty-specific completion thresholds (based on the *adaptive* difficulty
// tier, which only affects how forgiving the coverage requirement is —
// it no longer gates which shapes are selectable).
const DIFFICULTY_THRESHOLDS = {
  Beginner: 80,
  Intermediate: 85,
  Advanced: 90,
};

const getShapeCompleteThreshold = (difficulty) => {
  return DIFFICULTY_THRESHOLDS[difficulty] || 80;
};

// ===== UNIFIED SHAPE COLLECTION =====
// Every shape is available from the very start, regardless of the player's
// adaptive difficulty tier. `difficulty` (1-5) is used ONLY to weight scoring
// (harder shapes award more points) — it never locks a shape away.
// All paths are centered and scaled for a 100x100 viewBox.
const SHAPES = [
  {
    path: "M25 25 L75 25 L75 75 L25 75 Z",
    name: "Square",
    icon: "▢",
    difficulty: 2,
  },
  {
    path: "M50 15 A35 35 0 1 1 49.99 15",
    name: "Circle",
    icon: "●",
    difficulty: 2,
  },
  {
    path: "M50 15 L85 80 L15 80 Z",
    name: "Triangle",
    icon: "△",
    difficulty: 2,
  },
  {
    path: "M50 15 L80 50 L50 85 L20 50 Z",
    name: "Diamond",
    icon: "◇",
    difficulty: 2,
  },
  {
    path: "M20 50 Q50 0 80 50 Q50 80 20 50",
    name: "Heart",
    icon: "♥",
    difficulty: 3,
  },
  {
    path: "M50 10 L58 42 L90 50 L58 58 L50 90 L42 58 L10 50 L42 42 Z",
    name: "Sparkle",
    icon: "✦",
    difficulty: 3,
  },
  {
    path: "M50 20 L65 40 L90 40 L70 55 L80 80 L50 65 L20 80 L30 55 L10 40 L35 40 Z",
    name: "Star",
    icon: "★",
    difficulty: 4,
  },
  {
    path: "M20 20 C40 10 60 10 80 20 C90 40 90 60 80 80 C60 90 40 90 20 80 C10 60 10 40 20 20",
    name: "Apple",
    icon: "🍎",
    difficulty: 4,
  },
  {
    path: "M20 50 L35 20 L65 20 L80 50 L65 80 L35 80 Z",
    name: "Hexagon",
    icon: "⬡",
    difficulty: 3,
  },
  {
    path: "M20 50 L40 20 L60 20 L80 50 L60 80 L40 80 Z",
    name: "House",
    icon: "🏠",
    difficulty: 3,
  },
  {
    path: "M60 20 A30 30 0 1 0 60 80 A22 22 0 1 1 60 20 Z",
    name: "Moon",
    icon: "🌙",
    difficulty: 3,
  },
  {
    path: "M10 40 L55 40 L55 25 L90 50 L55 75 L55 60 L10 60 Z",
    name: "Arrow",
    icon: "➜",
    difficulty: 2,
  },
  {
    path: "M30 50 C30 35 45 35 50 50 C55 65 70 65 70 50 C70 35 55 35 50 50 C45 65 30 65 30 50 Z",
    name: "Infinity",
    icon: "∞",
    difficulty: 4,
  },
  {
    path: "M50 50 C50 40 60 40 60 50 C60 65 40 65 40 45 C40 25 65 25 65 50 C65 75 30 75 30 45",
    name: "Spiral",
    icon: "🌀",
    difficulty: 5,
  },
  {
    path: "M50 15 L83.3 39.2 L70.6 78.3 L29.4 78.3 L16.7 39.2 Z",
    name: "Pentagon",
    icon: "⬟",
    difficulty: 3,
  },
  {
    path: "M25 65 Q15 65 15 55 Q15 45 25 45 Q25 30 40 30 Q50 20 62 28 Q75 25 80 38 Q90 40 88 52 Q90 65 78 65 Z",
    name: "Cloud",
    icon: "☁",
    difficulty: 3,
  },
  {
    path: "M55 10 L30 55 L45 55 L35 90 L70 45 L52 45 Z",
    name: "Lightning",
    icon: "⚡",
    difficulty: 3,
  },
  {
    path: "M50 50 C35 50 35 20 50 20 C65 20 65 50 50 50 C50 65 80 65 80 50 C80 35 50 35 50 50 C65 50 65 80 50 80 C35 80 35 50 50 50 C50 35 20 35 20 50 C20 65 50 65 50 50 Z",
    name: "Flower",
    icon: "🌸",
    difficulty: 4,
  },
];

// Randomly select 4 or 5 *distinct* shapes for a single session. Called once
// per mount (i.e. once per session) via useState's lazy initializer.
function pickSessionShapes() {
  const count =
    SESSION_SHAPE_MIN +
    Math.floor(Math.random() * (SESSION_SHAPE_MAX - SESSION_SHAPE_MIN + 1));
  const pool = SHAPES.map((_, i) => i);
  const chosenIndices = [];
  while (chosenIndices.length < count && pool.length > 0) {
    const pick = Math.floor(Math.random() * pool.length);
    chosenIndices.push(pool.splice(pick, 1)[0]);
  }
  return chosenIndices.map((i) => SHAPES[i]);
}

// Color-coded biofeedback bands
function getAccuracyBand(pct) {
  if (pct >= 90) return { label: "Smooth, controlled", stroke: "#22c55e", text: "text-green-400", pulse: 0.7 };
  if (pct >= 70) return { label: "Steady improvement", stroke: "#3b82f6", text: "text-blue-400", pulse: 1.1 };
  if (pct >= 50) return { label: "Needs focus", stroke: "#f97316", text: "text-orange-400", pulse: 1.6 };
  return { label: "Slow down, be deliberate", stroke: "#ef4444", text: "text-red-400", pulse: 2.4 };
}

// Pick a readable SVG font-size (in viewBox units) so the icon+name label
// never overflows/clips inside the 100-wide canvas, regardless of name length.
function getLabelFontSize(label) {
  const len = label.length;
  if (len <= 8) return 6.5;
  if (len <= 12) return 5.5;
  if (len <= 16) return 4.5;
  return 3.8;
}

// Helper to calculate distance between two points
function distance(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

// ===== Sub-pixel accurate path distance =====
// The old implementation only measured distance to the *nearest sampled
// vertex*, which is only as accurate as the sample spacing (with 150 points
// on a 100x100 canvas that's ~1-2 units of quantization error even when the
// finger is exactly on the curve). This instead projects the point onto
// every polyline *segment* (not just its endpoints) and keeps the true
// perpendicular distance, which is accurate independent of sample density —
// i.e. sub-pixel, not sample-pixel.
function closestPointOnPolyline(point, pathPoints) {
  let minDist = Infinity;
  let bestPoint = pathPoints[0] || point;
  let bestIndex = 0;

  for (let i = 0; i < pathPoints.length - 1; i++) {
    const a = pathPoints[i];
    const b = pathPoints[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    let t = lenSq > 0 ? ((point.x - a.x) * abx + (point.y - a.y) * aby) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + abx * t;
    const projY = a.y + aby * t;
    const d = Math.hypot(point.x - projX, point.y - projY);
    if (d < minDist) {
      minDist = d;
      bestPoint = { x: projX, y: projY };
      bestIndex = i;
    }
  }

  return { closest: bestPoint, distance: minDist, index: bestIndex };
}

// ===== Motion tracking for smoothness scoring =====
// Tracks instantaneous speed (units/sec) between consecutive samples for a
// single tracing "side" (the lone hand, or the left/right hand in symmetry
// mode). A jittery, jerky trace has high variance in speed relative to its
// mean (high coefficient of variation); a smooth, controlled trace has low
// variance. That ratio — not the raw speed — is what we score, so a
// deliberately slow-but-steady trace and a fast-but-steady trace both score
// well, while a trace that stutters/overshoots does not.
function emptyMotionTrack() {
  return { lastPoint: null, lastTime: null, velocities: [] };
}

function recordMotionSample(track, point, tMs) {
  if (track.lastPoint && track.lastTime !== null) {
    const dtSeconds = Math.max(0.001, (tMs - track.lastTime) / 1000);
    const d = Math.hypot(point.x - track.lastPoint.x, point.y - track.lastPoint.y);
    track.velocities.push(d / dtSeconds);
  }
  track.lastPoint = point;
  track.lastTime = tMs;
}

function computeSmoothnessScore(velocities) {
  if (!velocities || velocities.length < 3) return 100;
  const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  if (mean <= 0) return 100;
  const variance =
    velocities.reduce((a, b) => a + (b - mean) * (b - mean), 0) / velocities.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / mean;
  const score = 100 - coefficientOfVariation * 40;
  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
}

// Rewards finishing close to (or a little under) the time budget for the
// shape; penalizes taking much longer than expected. Deliberately does not
// reward finishing *instantly*, since an implausibly fast "completion" is
// more likely a tracking artifact than a clean rep.
function computeSpeedScore(actualSeconds, expectedSeconds) {
  if (!expectedSeconds || expectedSeconds <= 0 || actualSeconds <= 0) return 100;
  const ratio = actualSeconds / expectedSeconds;
  let score;
  if (ratio <= 1) {
    score = 70 + ratio * 30; // 70 (instant) -> 100 (used the full budget well)
  } else {
    score = 100 - (ratio - 1) * 60; // penalize overruns
  }
  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
}

// Single formula combining all four required signals. Weights sum to 1 so
// the result stays in [0, 100]. Coverage and deviation are weighted highest
// since they most directly capture "did they actually trace the shape,
// accurately" — speed and smoothness are secondary quality signals.
function computeQualityScore({ coverage, avgDeviation, speedScore, smoothnessScore }) {
  const coverageScore = Math.max(0, Math.min(100, coverage));
  const deviationScore = Math.max(0, Math.min(100, 100 - avgDeviation * DEVIATION_PENALTY_FACTOR));
  const raw =
    coverageScore * 0.4 +
    deviationScore * 0.3 +
    speedScore * 0.15 +
    smoothnessScore * 0.15;
  return Math.round(raw * 100) / 100;
}

// ===== One Euro Filter =====
// Adaptive low-pass filter for noisy landmark streams (Casiez et al.). Unlike a
// fixed-alpha EMA or a CSS transition, the cutoff frequency adapts to the
// signal's speed: slow/still fingertip -> heavy smoothing (kills jitter),
// fast fingertip -> cutoff opens up so the filter tracks almost 1:1 with
// near-zero added lag. minCutoff controls jitter-at-rest, beta controls how
// aggressively lag is cut during fast motion.
class OneEuroFilter1D {
  constructor(minCutoff = 1.1, beta = 0.35, dCutoff = 1.0) {
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

  filter(x, tMs) {
    if (this.tPrev === null) {
      this.tPrev = tMs;
      this.xPrev = x;
      this.dxPrev = 0;
      return x;
    }
    const dt = Math.max(0.001, (tMs - this.tPrev) / 1000);
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

// 2D wrapper: filters x and y independently, same timestamp for both.
class PointOneEuroFilter {
  constructor(minCutoff = 1.1, beta = 0.35, dCutoff = 1.0) {
    this.fx = new OneEuroFilter1D(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter1D(minCutoff, beta, dCutoff);
  }

  filter(point, tMs) {
    return {
      x: this.fx.filter(point.x, tMs),
      y: this.fy.filter(point.y, tMs),
    };
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
  }
}

export default function CanvasAir({ onSessionEnd, patientId, gameId = "canvas-air" }) {
  const videoRef = useRef(null);
  const [poseData, setPoseData] = useState(null);

  // ---- This session's fixed set of 4-5 shapes (chosen once per mount) ----
  const [sessionShapes] = useState(() => pickSessionShapes());

  // ---- Existing single-hand state ----
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

  // ---- Enhanced tracking state ----
  const [averageDeviation, setAverageDeviation] = useState(0);
  const [missedSegments, setMissedSegments] = useState([]);
  const [timeToComplete, setTimeToComplete] = useState(0);
  const shapeStartTimeRef = useRef(null);
  const [pathCoverage, setPathCoverage] = useState([]);
  const [totalPathPoints, setTotalPathPoints] = useState(0);

  // ---- Per-shape / per-session precision metrics ----
  const [lastShapeMetrics, setLastShapeMetrics] = useState(null);
  const [shapeMetricsHistory, setShapeMetricsHistory] = useState([]);
  const motionRef = useRef({
    single: emptyMotionTrack(),
    left: emptyMotionTrack(),
    right: emptyMotionTrack(),
  });

  // ---- hand mode ----
  const [handMode, setHandMode] = useState("single");

  // ---- shape gallery ----
  const [showGallery, setShowGallery] = useState(false);

  // ---- symmetry-mode state ----
  const [traceLeft, setTraceLeft] = useState([]);
  const [traceRight, setTraceRight] = useState([]);
  const [shapeProgressLeft, setShapeProgressLeft] = useState(0);
  const [shapeProgressRight, setShapeProgressRight] = useState(0);
  const [tracingAccuracyLeft, setTracingAccuracyLeft] = useState(0);
  const [tracingAccuracyRight, setTracingAccuracyRight] = useState(0);
  const [isTracingLeft, setIsTracingLeft] = useState(false);
  const [isTracingRight, setIsTracingRight] = useState(false);
  const [guidePointsRight, setGuidePointsRight] = useState([]);

  // ---- streak / combo / precision-mode ----
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [celebrateStreak, setCelebrateStreak] = useState(null);
  const [dynamicTolerance, setDynamicTolerance] = useState(TRACE_TOLERANCE_UNITS);
  const [sparkles, setSparkles] = useState([]);
  const comboMultiplierRef = useRef(1);

  const minAngleRef = useRef(null);
  const maxAngleRef = useRef(0);
  const leftMinAngleRef = useRef(null);
  const leftMaxAngleRef = useRef(0);
  const rightMinAngleRef = useRef(null);
  const rightMaxAngleRef = useRef(0);

  const hasEndedRef = useRef(false);
  const metricsEngine = useRef(new MetricsEngine());

  const sampledPathRef = useRef([]);
  const trackerRef = useRef(null);
  const tracingStatsRef = useRef({ totalSamples: 0, onPathSamples: 0 });
  const pathCoverageRef = useRef(new Set());

  const trackerLeftRef = useRef(null);
  const trackerRightRef = useRef(null);
  const statsLeftRef = useRef({ totalSamples: 0, onPathSamples: 0 });
  const statsRightRef = useRef({ totalSamples: 0, onPathSamples: 0 });

  // ---- Cursor smoothing (One Euro Filter) ----
  // Filters run on every raw hand-tracking sample, independent of game state,
  // so the on-screen cursor and the path-tracing math always agree and stay
  // responsive even while paused/between reps.
  const fingertipFilterRef = useRef(new PointOneEuroFilter());
  const leftHandFilterRef = useRef(new PointOneEuroFilter());
  const rightHandFilterRef = useRef(new PointOneEuroFilter());
  const [smoothedFingertip, setSmoothedFingertip] = useState(null);
  const [smoothedLeftHand, setSmoothedLeftHand] = useState(null);
  const [smoothedRightHand, setSmoothedRightHand] = useState(null);

  // ---- Raw (unfiltered) cursor tracking ----
  // The `smoothed*` state above still feeds the tracing/scoring math (kept
  // filtered for measurement stability). The on-screen cursor dot(s), by
  // contrast, read straight from these raw refs every animation frame with
  // zero smoothing/interpolation, so the dot is a direct 1:1 mirror of the
  // fingertip with no added lag — see the rAF loop below.
  const rawFingertipRef = useRef(null);
  const rawLeftHandRef = useRef(null);
  const rawRightHandRef = useRef(null);
  const cursorElRef = useRef(null);
  const leftCursorElRef = useRef(null);
  const rightCursorElRef = useRef(null);

  const { isActive, error: poseError, calibrate, calibrationData } = useMediaPipeUpperBody({
    videoRef,
    onPoseUpdate: setPoseData,
  });

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

  // Smooth the raw fingertip/hand landmarks on every incoming sample, as soon
  // as it arrives — this runs regardless of gameState/pause so the cursor
  // never freezes or snaps stale, and it's the single source of truth both
  // the rendered cursor and the tracing loops read from below.
  useEffect(() => {
    if (!fingertip) {
      fingertipFilterRef.current.reset();
      setSmoothedFingertip(null);
      rawFingertipRef.current = null;
      return;
    }
    // Raw ref updates immediately and unfiltered — the cursor rAF loop
    // reads this directly, independent of the filtered value below.
    rawFingertipRef.current = fingertip;
    setSmoothedFingertip(fingertipFilterRef.current.filter(fingertip, performance.now()));
  }, [fingertip]);

  useEffect(() => {
    if (!leftHand) {
      leftHandFilterRef.current.reset();
      setSmoothedLeftHand(null);
      rawLeftHandRef.current = null;
      return;
    }
    rawLeftHandRef.current = leftHand;
    setSmoothedLeftHand(leftHandFilterRef.current.filter(leftHand, performance.now()));
  }, [leftHand]);

  useEffect(() => {
    if (!rightHand) {
      rightHandFilterRef.current.reset();
      setSmoothedRightHand(null);
      rawRightHandRef.current = null;
      return;
    }
    rawRightHandRef.current = rightHand;
    setSmoothedRightHand(rightHandFilterRef.current.filter(rightHand, performance.now()));
  }, [rightHand]);

  // ===== Cursor render loop (requestAnimationFrame) =====
  // Writes the fingertip/hand cursor position directly to the DOM via refs,
  // every animation frame, bypassing React state + re-render entirely for
  // this specific value. Each tick reads whatever the latest *raw* sample
  // is (no filtering, no interpolation between samples) and maps it 1:1 to
  // the cursor position, so the dot tracks the finger at the display's
  // native refresh rate (typically 60fps) with no added lag or smoothing.
  // Combined with the absence of any CSS transition on these elements
  // (never add one — a transition would just reintroduce lag), this is a
  // direct, immediate mapping from tracked position to rendered position.
  useEffect(() => {
    let rafId;

    const place = (el, raw) => {
      if (!el) return;
      if (!raw) {
        el.style.display = "none";
        return;
      }
      el.style.display = "block";
      el.style.left = `${(1 - raw.x) * 100}%`;
      el.style.top = `${raw.y * 100}%`;
    };

    const tick = () => {
      place(cursorElRef.current, rawFingertipRef.current);
      place(leftCursorElRef.current, rawLeftHandRef.current);
      place(rightCursorElRef.current, rawRightHandRef.current);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const { shoulderAngle, leftShoulderAngle, rightShoulderAngle } = usePoseDetection(poseData);
  const guidance = usePostureGuidance(poseData, calibrationData);
  const { papsScore, isPainDetected, resetPainState } = useFacialPainDetection({ videoRef });
  const { currentDifficulty, adapt } = useAdaptiveDifficulty();
  const telemetry = useSessionTelemetry(patientId, gameId);
  const audio = useAudioFeedback(true);

  // This session's fixed shape list (4-5 shapes, chosen once above).
  // Adaptive difficulty no longer filters which shapes can be selected — it
  // only tunes the coverage threshold and the score bonus below.
  const shapeList = sessionShapes;
  const currentShape = shapeList[currentShapeIndex % shapeList.length];
  const shapePath = currentShape?.path || SHAPES[0].path;
  const totalShapes = shapeList.length;
  const shapeLabel = `${currentShape?.icon || ""} ${currentShape?.name || ""}`.trim();
  const shapeLabelFontSize = getLabelFontSize(shapeLabel);

  const romDegrees =
    minAngleRef.current === null ? 0 : Math.max(0, Math.round(maxAngleRef.current - minAngleRef.current));
  const leftROM =
    leftMinAngleRef.current === null ? null : Math.max(0, Math.round(leftMaxAngleRef.current - leftMinAngleRef.current));
  const rightROM =
    rightMinAngleRef.current === null ? null : Math.max(0, Math.round(rightMaxAngleRef.current - rightMinAngleRef.current));

  const symmetryScore =
    leftROM !== null && rightROM !== null && leftROM > 0 && rightROM > 0
      ? Math.round((Math.min(leftROM, rightROM) / Math.max(leftROM, rightROM)) * 100)
      : null;
  const symmetryFlag = symmetryScore !== null && symmetryScore < 80;

  const totalAttempted = completed + missed;
  const shapeAccuracy = totalAttempted > 0 ? Math.round((completed / totalAttempted) * 100) : 100;
  const sessionShapesRemaining = Math.max(0, shapeList.length - totalAttempted);

  // Precise (unrounded) progress/accuracy — rounding only ever happens at
  // display time or when a value is persisted into a metrics record, never
  // in the running calculation itself, so error can't accumulate across a
  // multi-minute session.
  const displayShapeProgress =
    handMode === "symmetry" ? (shapeProgressLeft + shapeProgressRight) / 2 : shapeProgress;
  const displayTracingAccuracy =
    handMode === "symmetry" ? (tracingAccuracyLeft + tracingAccuracyRight) / 2 : tracingAccuracy;
  const displayIsTracing = handMode === "symmetry" ? isTracingLeft || isTracingRight : isTracing;
  const accuracyBand = getAccuracyBand(displayTracingAccuracy);
  const comboMultiplier = streak >= 10 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;

  useEffect(() => {
    comboMultiplierRef.current = comboMultiplier;
  }, [comboMultiplier]);

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
    totalReps: 0,
    onRepComplete: (success) => {
      telemetry.recordRep(success);
      if (success) {
        audio.playSuccess();
        setStars((s) => Math.min(5, s + 1));
        setStreak((prev) => {
          const next = prev + 1;
          setBestStreak((b) => Math.max(b, next));
          if (next === 3 || next === 5 || next === 10) {
            setCelebrateStreak(next);
            setTimeout(() => setCelebrateStreak(null), 1500);
          }
          return next;
        });
        setDynamicTolerance((t) => Math.max(MIN_TRACE_TOLERANCE_UNITS, t - 0.2));
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

  // ---- Shape navigation helpers (free choice among this session's 4-5 shapes) ----
  const resetShapeUiState = useCallback(() => {
    setShowShapeComplete(false);
    setShowShapeMissed(false);
    setLastShapeMetrics(null);
    setTrace([]);
    setTraceLeft([]);
    setTraceRight([]);
    pathCoverageRef.current = new Set();
    setPathCoverage([]);
  }, []);

  const goToNextShape = useCallback(() => {
    resetShapeUiState();
    setCurrentShapeIndex((i) => (i + 1) % shapeList.length);
  }, [resetShapeUiState, shapeList.length]);

  const goToPrevShape = useCallback(() => {
    resetShapeUiState();
    setCurrentShapeIndex((i) => (i - 1 + shapeList.length) % shapeList.length);
  }, [resetShapeUiState, shapeList.length]);

  const goToRandomShape = useCallback(() => {
    resetShapeUiState();
    setCurrentShapeIndex((i) => {
      if (shapeList.length <= 1) return i;
      let next = i;
      while (next === i) {
        next = Math.floor(Math.random() * shapeList.length);
      }
      return next;
    });
  }, [resetShapeUiState, shapeList.length]);

  const selectShape = useCallback(
    (index) => {
      resetShapeUiState();
      setCurrentShapeIndex(index);
      setShowGallery(false);
    },
    [resetShapeUiState]
  );

  // ===== Enhanced shape-reset effect: SINGLE-HAND mode =====
  useEffect(() => {
    // Denser sampling for curved/complex shapes so the polyline we project
    // onto for deviation/coverage tracks the true SVG curve tightly.
    const sampleCount = shapePath.length > 80 ? PATH_SAMPLE_COUNT_COMPLEX : PATH_SAMPLE_COUNT_SIMPLE;
    const points = samplePath(shapePath, sampleCount);
    sampledPathRef.current = points;
    trackerRef.current = createPathCoverageTracker(points, dynamicTolerance);
    tracingStatsRef.current = { totalSamples: 0, onPathSamples: 0 };
    pathCoverageRef.current = new Set();
    motionRef.current.single = emptyMotionTrack();
    setPathCoverage([]);
    setTotalPathPoints(points.length);
    setTrace([]);
    setShapeProgress(0);
    setTracingAccuracy(0);
    setShapeTimeLeft(SHAPE_TIME_LIMIT_SECONDS + Math.floor((currentShape?.difficulty || 1) * 2));
    setShowShapeMissed(false);
    setAverageDeviation(0);
    setMissedSegments([]);
    shapeStartTimeRef.current = Date.now();
  }, [shapePath, dynamicTolerance, currentShape]);

  // ===== Shape-reset effect: SYMMETRY mode =====
  useEffect(() => {
    if (handMode !== "symmetry") return undefined;
    const sampleCount = shapePath.length > 80 ? PATH_SAMPLE_COUNT_COMPLEX : PATH_SAMPLE_COUNT_SIMPLE;
    const leftPoints = samplePath(shapePath, sampleCount);
    const rightPoints = leftPoints.map((p) => ({ x: 100 - p.x, y: p.y }));
    trackerLeftRef.current = createPathCoverageTracker(leftPoints, dynamicTolerance);
    trackerRightRef.current = createPathCoverageTracker(rightPoints, dynamicTolerance);
    statsLeftRef.current = { totalSamples: 0, onPathSamples: 0 };
    statsRightRef.current = { totalSamples: 0, onPathSamples: 0 };
    motionRef.current.left = emptyMotionTrack();
    motionRef.current.right = emptyMotionTrack();
    setGuidePointsRight(rightPoints);
    setTraceLeft([]);
    setTraceRight([]);
    setShapeProgressLeft(0);
    setShapeProgressRight(0);
    setTracingAccuracyLeft(0);
    setTracingAccuracyRight(0);
    setAverageDeviation(0);
    setMissedSegments([]);
    shapeStartTimeRef.current = Date.now();
  }, [shapePath, handMode, dynamicTolerance]);

  // Track ROM with metrics engine
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    const repResult = metricsEngine.current.trackAngle(shoulderAngle, performance.now());
    if (repResult) {
      setRepData((prev) => [...prev, repResult]);
    }
  }, [gameState, isPaused, shoulderAngle]);

  // Per-side ROM tracking
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

  // ===== Enhanced main tracing loop: SINGLE-HAND mode =====
  useEffect(() => {
    if (handMode !== "single") return undefined;
    if (gameState !== GAME_STATES.ACTIVE || isPaused || showShapeComplete || showShapeMissed) return undefined;

    if (!smoothedFingertip) {
      setIsTracing(false);
      return undefined;
    }

    const point = { x: (1 - smoothedFingertip.x) * 100, y: smoothedFingertip.y * 100 };
    const tracker = trackerRef.current;
    if (!tracker) return undefined;

    const nowMs = performance.now();
    recordMotionSample(motionRef.current.single, point, nowMs);

    const { onPath } = tracker.update(point);

    tracingStatsRef.current.totalSamples += 1;
    if (onPath) tracingStatsRef.current.onPathSamples += 1;

    const stats = tracingStatsRef.current;
    // High-precision accuracy — kept as a float throughout; only rounded
    // for display or when written into a persisted metrics record.
    const accuracy = stats.totalSamples
      ? (stats.onPathSamples / stats.totalSamples) * 100
      : 0;
    setTracingAccuracy(accuracy);

    // Sub-pixel deviation: project onto path *segments*, not just the
    // nearest sampled vertex, so accuracy doesn't depend on sample spacing.
    const { closest, distance: dist, index } = closestPointOnPolyline(point, sampledPathRef.current);
    if (dist < MAX_ALLOWED_DEVIATION && index !== -1) {
      const totalSamples = stats.totalSamples || 1;
      setAverageDeviation((prev) => (prev * (totalSamples - 1) + dist) / totalSamples);

      // Track path coverage more granularly
      if (onPath && index !== -1) {
        // Mark coverage for nearby path points
        const coverageRadius = 3;
        for (let i = Math.max(0, index - coverageRadius); i < Math.min(sampledPathRef.current.length, index + coverageRadius); i++) {
          pathCoverageRef.current.add(i);
        }
        setPathCoverage(Array.from(pathCoverageRef.current));
      }
    }

    setIsTracing(onPath);
    if (onPath) {
      setTrace((current) => [...current.slice(-199), point]);
      if (Math.random() < 0.12) {
        setSparkles((prev) => [
          ...prev.slice(-14),
          { id: `${Date.now()}-${Math.random()}`, x: point.x, y: point.y, color: getAccuracyBand(accuracy).stroke, side: "single", createdAt: Date.now() },
        ]);
      }
    }

    // High-precision coverage: fraction of unique path samples visited,
    // kept as a float (e.g. 87.34%) instead of rounded to a whole percent —
    // with 400-600 samples per shape, each point is worth ~0.17-0.25%, so
    // this is precise well beyond a single integer percentage point.
    const coverage = pathCoverageRef.current.size > 0
      ? Math.min(100, (pathCoverageRef.current.size / (sampledPathRef.current.length || 1)) * 100)
      : tracker.getCoverage();
    setShapeProgress(coverage);

    // Difficulty-specific completion with quality scoring
    const difficultyThreshold = getShapeCompleteThreshold(currentDifficulty);
    if (coverage >= difficultyThreshold && !showShapeComplete) {
      setShowShapeComplete(true);
      setCompleted((v) => v + 1);

      const timeToCompleteSeconds = shapeStartTimeRef.current
        ? (Date.now() - shapeStartTimeRef.current) / 1000
        : 0;
      const expectedSeconds = SHAPE_TIME_LIMIT_SECONDS + (currentShape?.difficulty || 1) * 2;
      const speedScore = computeSpeedScore(timeToCompleteSeconds, expectedSeconds);
      const smoothnessScore = computeSmoothnessScore(motionRef.current.single.velocities);
      const qualityScore = computeQualityScore({
        coverage,
        avgDeviation: averageDeviation,
        speedScore,
        smoothnessScore,
      });

      // Bonus for complex shapes (difficulty rating only affects scoring)
      const shapeBonus = currentShape?.difficulty || 1;

      // Update score based on quality
      const basePoints = Math.round((qualityScore / 10) * shapeBonus);
      const difficultyBonus = currentDifficulty === 'Advanced' ? 3 :
                             currentDifficulty === 'Intermediate' ? 2 : 1;
      const finalPoints = (basePoints + difficultyBonus) * comboMultiplierRef.current;
      setScore((s) => s + finalPoints);

      // Detailed, precise metrics for this single shape completion.
      const shapeMetrics = {
        shapeName: currentShape?.name,
        shapeDifficulty: currentShape?.difficulty,
        coveragePercent: Math.round(coverage * 100) / 100,
        tracingAccuracyPercent: Math.round(accuracy * 100) / 100,
        averageDeviationUnits: Math.round(averageDeviation * 1000) / 1000,
        timeToCompleteSeconds: Math.round(timeToCompleteSeconds * 100) / 100,
        expectedSeconds,
        speedScore,
        smoothnessScore,
        qualityScore,
        pointsAwarded: finalPoints,
      };
      setLastShapeMetrics(shapeMetrics);
      setShapeMetricsHistory((prev) => [...prev, shapeMetrics]);

      // Record the shape completion
      completeRep(true, {
        accuracy,
        coverage,
        deviation: averageDeviation,
        timeToComplete: timeToCompleteSeconds,
        shapeName: currentShape?.name,
        shapeDifficulty: currentShape?.difficulty,
        qualityScore,
      });

      setTimeout(() => {
        setShowShapeComplete(false);
        setLastShapeMetrics(null);
        // Only advance to another shape if the session isn't already done —
        // the session-completion effect below handles ending it.
        setCurrentShapeIndex((i) => (i + 1) % shapeList.length);
      }, 1800);
    }

    telemetry.trackAngle(shoulderAngle);

    if (minAngleRef.current === null || (shoulderAngle > 0 && shoulderAngle < minAngleRef.current)) {
      minAngleRef.current = shoulderAngle > 0 ? shoulderAngle : 0;
    }
    if (shoulderAngle > maxAngleRef.current) {
      maxAngleRef.current = shoulderAngle;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handMode, smoothedFingertip, gameState, isPaused, showShapeComplete, showShapeMissed, shoulderAngle, currentDifficulty, averageDeviation, currentShape, shapeList.length]);

  // ===== Main tracing loop: SYMMETRY mode =====
  useEffect(() => {
    if (handMode !== "symmetry") return undefined;
    if (gameState !== GAME_STATES.ACTIVE || isPaused || showShapeComplete || showShapeMissed) return undefined;

    const trackerL = trackerLeftRef.current;
    const trackerR = trackerRightRef.current;
    if (!trackerL || !trackerR) return undefined;

    let leftCoverage = shapeProgressLeft;
    let rightCoverage = shapeProgressRight;
    let leftAcc = 0;
    let rightAcc = 0;
    const nowMs = performance.now();

    if (smoothedLeftHand) {
      const pointL = { x: (1 - smoothedLeftHand.x) * 100, y: smoothedLeftHand.y * 100 };
      recordMotionSample(motionRef.current.left, pointL, nowMs);
      const { onPath } = trackerL.update(pointL);
      statsLeftRef.current.totalSamples += 1;
      if (onPath) statsLeftRef.current.onPathSamples += 1;
      leftAcc = statsLeftRef.current.totalSamples
        ? (statsLeftRef.current.onPathSamples / statsLeftRef.current.totalSamples) * 100
        : 0;
      setTracingAccuracyLeft(leftAcc);
      setIsTracingLeft(onPath);
      if (onPath) {
        setTraceLeft((cur) => [...cur.slice(-199), pointL]);
        if (Math.random() < 0.12) {
          setSparkles((prev) => [
            ...prev.slice(-14),
            { id: `${Date.now()}-${Math.random()}-l`, x: pointL.x, y: pointL.y, color: getAccuracyBand(leftAcc).stroke, side: "left", createdAt: Date.now() },
          ]);
        }
      }
      leftCoverage = trackerL.getCoverage();
      setShapeProgressLeft(leftCoverage);
    } else {
      setIsTracingLeft(false);
    }

    if (smoothedRightHand) {
      const pointR = { x: (1 - smoothedRightHand.x) * 100, y: smoothedRightHand.y * 100 };
      recordMotionSample(motionRef.current.right, pointR, nowMs);
      const { onPath } = trackerR.update(pointR);
      statsRightRef.current.totalSamples += 1;
      if (onPath) statsRightRef.current.onPathSamples += 1;
      rightAcc = statsRightRef.current.totalSamples
        ? (statsRightRef.current.onPathSamples / statsRightRef.current.totalSamples) * 100
        : 0;
      setTracingAccuracyRight(rightAcc);
      setIsTracingRight(onPath);
      if (onPath) {
        setTraceRight((cur) => [...cur.slice(-199), pointR]);
        if (Math.random() < 0.12) {
          setSparkles((prev) => [
            ...prev.slice(-14),
            { id: `${Date.now()}-${Math.random()}-r`, x: pointR.x, y: pointR.y, color: getAccuracyBand(rightAcc).stroke, side: "right", createdAt: Date.now() },
          ]);
        }
      }
      rightCoverage = trackerR.getCoverage();
      setShapeProgressRight(rightCoverage);
    } else {
      setIsTracingRight(false);
    }

    telemetry.trackAngle(shoulderAngle);

    const difficultyThreshold = getShapeCompleteThreshold(currentDifficulty);
    if (leftCoverage >= difficultyThreshold && rightCoverage >= difficultyThreshold && !showShapeComplete) {
      setShowShapeComplete(true);
      setCompleted((v) => v + 1);

      const avgAccuracy = (leftAcc + rightAcc) / 2;
      const avgCoverage = (leftCoverage + rightCoverage) / 2;
      const avgDeviation = averageDeviation || 0;
      const timeToCompleteSeconds = shapeStartTimeRef.current
        ? (Date.now() - shapeStartTimeRef.current) / 1000
        : 0;
      const expectedSeconds = SHAPE_TIME_LIMIT_SECONDS + (currentShape?.difficulty || 1) * 2;
      const speedScore = computeSpeedScore(timeToCompleteSeconds, expectedSeconds);
      const combinedVelocities = [
        ...motionRef.current.left.velocities,
        ...motionRef.current.right.velocities,
      ];
      const smoothnessScore = computeSmoothnessScore(combinedVelocities);
      const qualityScore = computeQualityScore({
        coverage: avgCoverage,
        avgDeviation,
        speedScore,
        smoothnessScore,
      });

      const shapeBonus = currentShape?.difficulty || 1;
      const basePoints = Math.round((qualityScore / 10) * shapeBonus);
      const difficultyBonus = currentDifficulty === 'Advanced' ? 3 :
                             currentDifficulty === 'Intermediate' ? 2 : 1;
      const finalPoints = (basePoints + difficultyBonus) * comboMultiplierRef.current;
      setScore((s) => s + finalPoints);

      const shapeMetrics = {
        shapeName: currentShape?.name,
        shapeDifficulty: currentShape?.difficulty,
        coveragePercent: Math.round(avgCoverage * 100) / 100,
        coveragePercentLeft: Math.round(leftCoverage * 100) / 100,
        coveragePercentRight: Math.round(rightCoverage * 100) / 100,
        tracingAccuracyPercent: Math.round(avgAccuracy * 100) / 100,
        averageDeviationUnits: Math.round(avgDeviation * 1000) / 1000,
        timeToCompleteSeconds: Math.round(timeToCompleteSeconds * 100) / 100,
        expectedSeconds,
        speedScore,
        smoothnessScore,
        qualityScore,
        pointsAwarded: finalPoints,
      };
      setLastShapeMetrics(shapeMetrics);
      setShapeMetricsHistory((prev) => [...prev, shapeMetrics]);

      completeRep(true, {
        accuracy: avgAccuracy,
        coverage: avgCoverage,
        deviation: avgDeviation,
        timeToComplete: timeToCompleteSeconds,
        shapeName: currentShape?.name,
        shapeDifficulty: currentShape?.difficulty,
        qualityScore,
      });

      setTimeout(() => {
        setShowShapeComplete(false);
        setLastShapeMetrics(null);
        setCurrentShapeIndex((i) => (i + 1) % shapeList.length);
      }, 1800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handMode, smoothedLeftHand, smoothedRightHand, gameState, isPaused, showShapeComplete, showShapeMissed, shoulderAngle, currentDifficulty, averageDeviation, currentShape, shapeList.length]);

  // Per-shape countdown
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused || showShapeComplete || showShapeMissed) {
      return undefined;
    }

    if (shapeTimeLeft <= 0) {
      setShowShapeMissed(true);
      setMissed((m) => m + 1);

      // Even on a miss, the user traced *something* — measure it instead of
      // throwing it away. Use whatever coverage/accuracy/deviation was
      // accumulated up to the timeout (partial credit is still real data).
      const coverageAtMiss = handMode === "symmetry"
        ? (shapeProgressLeft + shapeProgressRight) / 2
        : shapeProgress;
      const accuracyAtMiss = handMode === "symmetry"
        ? (tracingAccuracyLeft + tracingAccuracyRight) / 2
        : tracingAccuracy;
      const timeToCompleteSeconds = shapeStartTimeRef.current
        ? (Date.now() - shapeStartTimeRef.current) / 1000
        : 0;
      const expectedSeconds = SHAPE_TIME_LIMIT_SECONDS + (currentShape?.difficulty || 1) * 2;
      const speedScore = computeSpeedScore(timeToCompleteSeconds, expectedSeconds);
      const velocitiesAtMiss = handMode === "symmetry"
        ? [...motionRef.current.left.velocities, ...motionRef.current.right.velocities]
        : motionRef.current.single.velocities;
      const smoothnessScore = computeSmoothnessScore(velocitiesAtMiss);
      const qualityScore = computeQualityScore({
        coverage: coverageAtMiss,
        avgDeviation: averageDeviation,
        speedScore,
        smoothnessScore,
      });

      const shapeMetrics = {
        shapeName: currentShape?.name,
        shapeDifficulty: currentShape?.difficulty,
        completed: false,
        coveragePercent: Math.round(coverageAtMiss * 100) / 100,
        tracingAccuracyPercent: Math.round(accuracyAtMiss * 100) / 100,
        averageDeviationUnits: Math.round(averageDeviation * 1000) / 1000,
        timeToCompleteSeconds: Math.round(timeToCompleteSeconds * 100) / 100,
        expectedSeconds,
        speedScore,
        smoothnessScore,
        qualityScore,
        pointsAwarded: 0,
      };
      setLastShapeMetrics(shapeMetrics);
      setShapeMetricsHistory((prev) => [...prev, shapeMetrics]);

      completeRep(false, {
        accuracy: accuracyAtMiss,
        coverage: coverageAtMiss,
        deviation: averageDeviation,
        timeToComplete: timeToCompleteSeconds,
        shapeName: currentShape?.name,
        shapeDifficulty: currentShape?.difficulty,
        qualityScore,
      });

      // IMPORTANT: this setTimeout is deliberately NOT returned as this
      // effect's cleanup. setShowShapeMissed(true) above triggers a
      // re-render, and showShapeMissed is one of this effect's own
      // dependencies — so React would immediately re-run this effect,
      // invoke the *previous* run's cleanup first, and cancel the timer
      // before it ever fired. That's exactly what left the game frozen on
      // "Time's Up" until the outer session clock ran out. Letting this
      // timer live outside the cleanup lifecycle (same pattern as the
      // shape-complete path above) guarantees it actually advances the
      // shape once, regardless of how many times this effect re-runs.
      setTimeout(() => {
        setShowShapeMissed(false);
        setLastShapeMetrics(null);
        setCurrentShapeIndex((i) => (i + 1) % shapeList.length);
      }, 1800);
      return undefined;
    }

    const tick = setTimeout(() => {
      setShapeTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearTimeout(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, isPaused, showShapeComplete, showShapeMissed, shapeTimeLeft, completeRep, shapeList.length, handMode, currentShape]);

  // ===== Session-complete watchdog =====
  // The session has exactly `shapeList.length` shapes (4 or 5). Once every
  // one of them has been either completed or missed, end the session — no
  // more looping back through the same shapes. The short delay lets the
  // completion/miss overlay (and per-shape metrics card) finish showing
  // before the session summary takes over.
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE) return undefined;
    if (completed + missed < shapeList.length) return undefined;
    const t = setTimeout(() => {
      finalizeTelemetry();
      endSession();
    }, 1900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, missed, shapeList.length, gameState]);

  // Adaptive difficulty (tunes coverage threshold / scoring bonus only)
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    const timer = setInterval(() => {
      adapt({ accuracy: displayTracingAccuracy, papsScore, combo: completed });
    }, 15000);
    return () => clearInterval(timer);
  }, [gameState, isPaused, adapt, displayTracingAccuracy, papsScore, completed]);

  // Pain detection
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
        pathCoveragePercent: Math.round(displayShapeProgress * 100) / 100,
        shapesCompleted: completed,
        shapesMissed: missed,
        shapeSuccessRatePercent: shapeAccuracy,
        totalShapes,
        sessionShapeNames: shapeList.map((s) => s.name),
        tracingAccuracyPercent: Math.round(displayTracingAccuracy * 100) / 100,
        averageDeviation: Math.round(averageDeviation * 1000) / 1000,
        qualityScore: Math.max(
          0,
          Math.round((displayTracingAccuracy - averageDeviation * DEVIATION_PENALTY_FACTOR) * 100) / 100
        ),
        shapeMetricsHistory,
        repData: sessionStats.reps || repData,
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
    shapeList,
    displayTracingAccuracy,
    romDegrees,
    papsScore,
    currentDifficulty,
    stars,
    displayShapeProgress,
    shapeMetricsHistory,
    repData,
    handMode,
    streak,
    bestStreak,
    leftROM,
    rightROM,
    symmetryScore,
    symmetryFlag,
    averageDeviation,
  ]);

  const canStart = isActive && handReady && !poseError && !handError && calibrated;

  // Ending the session manually (the header X button) should behave exactly
  // like a natural session completion: finalize telemetry first so the report
  // has real data, then flip the game engine into COMPLETE so the screen
  // below renders the session summary/report. finalizeTelemetry is guarded
  // by hasEndedRef, so this is safe even if the engine also fires its own
  // onSessionComplete callback.
  const handleEndSession = useCallback(() => {
    finalizeTelemetry();
    endSession();
  }, [finalizeTelemetry, endSession]);

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
      accuracyPercent: Math.round(displayTracingAccuracy * 100) / 100,
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
        pathCoveragePercent: Math.round(displayShapeProgress * 100) / 100,
        shapesCompleted: completed,
        shapesMissed: missed,
        shapeSuccessRatePercent: shapeAccuracy,
        totalShapes,
        sessionShapeNames: shapeList.map((s) => s.name),
        stars,
        handMode,
        bestStreak,
        averageDeviation: Math.round(averageDeviation * 1000) / 1000,
        qualityScore: Math.max(
          0,
          Math.round((displayTracingAccuracy - averageDeviation * DEVIATION_PENALTY_FACTOR) * 100) / 100
        ),
        shapeMetricsHistory,
        averageQualityScore:
          shapeMetricsHistory.length > 0
            ? Math.round(
                (shapeMetricsHistory.reduce((a, m) => a + m.qualityScore, 0) / shapeMetricsHistory.length) * 100
              ) / 100
            : 0,
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

  const ShapeGalleryPanel = (
    <div className="absolute right-0 top-14 z-30 max-h-96 w-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
          This Session ({shapeList.length})
        </span>
        <button
          onClick={() => setShowGallery(false)}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {shapeList.map((s, i) => (
          <button
            key={s.name}
            onClick={() => selectShape(i)}
            className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-colors ${
              i === currentShapeIndex % shapeList.length
                ? "border-cyan-400 bg-cyan-950/60"
                : "border-slate-800 bg-slate-900 hover:border-slate-600"
            }`}
          >
            <span className="text-xl leading-none">{s.icon}</span>
            <span className="text-[10px] leading-tight text-slate-300">{s.name}</span>
            <span className="text-[9px] text-yellow-500">{"⭐".repeat(s.difficulty)}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <style>{`
        @keyframes canvasAirPulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        @keyframes canvasAirSparkle {
          0% { opacity: 0.9; transform: scale(1); }
          100% { opacity: 0; transform: scale(2.2); }
        }
        @keyframes canvasAirComplete {
          0% { transform: scale(0.8) rotate(-10deg); opacity: 0; }
          50% { transform: scale(1.2) rotate(5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes canvasAirShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }
        .shape-complete-anim {
          animation: canvasAirComplete 0.6s ease-out forwards;
        }
        .shape-missed-anim {
          animation: canvasAirShake 0.5s ease-in-out;
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
            <span>✅ {completed}/{totalShapes}</span>
            <span>🎯 {displayShapeProgress.toFixed(2)}%</span>
            <span className={accuracyBand.text}>🖊️ {displayTracingAccuracy.toFixed(2)}%</span>
            <span>💪 {romDegrees}°</span>
            {streak > 0 && <span className="text-amber-400">🔥 {streak}x{comboMultiplier}</span>}
            {isSymmetry && (
              <span className={symmetryFlag ? "text-red-400" : "text-slate-300"}>
                ⚖️ {symmetryScore !== null ? `${symmetryScore}%` : "—"}
              </span>
            )}
            <span className="text-cyan-400">{currentDifficulty}</span>
            <span className="text-purple-400">⭐ {score}</span>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={goToPrevShape}
              title="Previous shape"
              className="rounded-lg bg-slate-800 p-2 hover:bg-slate-700"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={goToNextShape}
              title="Next shape"
              className="rounded-lg bg-slate-800 p-2 hover:bg-slate-700"
            >
              <ChevronRight size={18} />
            </button>
            <button
              onClick={goToRandomShape}
              title="Random shape"
              className="rounded-lg bg-slate-800 p-2 hover:bg-slate-700"
            >
              <Shuffle size={18} />
            </button>
            <button
              onClick={() => setShowGallery((v) => !v)}
              title="Choose shape"
              className={`rounded-lg p-2 ${showGallery ? "bg-cyan-600" : "bg-slate-800 hover:bg-slate-700"}`}
            >
              <Grid3x3 size={18} />
            </button>
            <button
              onClick={() => (isPaused ? resumeSession() : pauseSession())}
              className="rounded-lg bg-slate-800 p-2 hover:bg-slate-700"
            >
              {isPaused ? <Play size={18} /> : <Pause size={18} />}
            </button>
            <button onClick={handleEndSession} title="End session" className="rounded-lg bg-red-950 p-2 hover:bg-red-900">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {isActiveScreen && showGallery && <div className="fixed right-8 top-20 z-40">{ShapeGalleryPanel}</div>}

      <div className={isActiveScreen ? `flex h-[calc(100vh-140px)] gap-6 p-8 pt-24` : "p-8"}>
        <div className={isActiveScreen ? "max-w-none" : "max-w-4xl mx-auto w-full"}>
          {isInstructions && (
            <>
              <h1 className="mb-2 text-3xl font-black">🎨 Canvas Air</h1>
              <p className="mb-4 text-slate-400">
                Trace the shape with your fingertip. Complete the shape to earn points!
                This session has {shapeList.length} shapes, randomly picked from the
                full collection — trace or miss all of them and the session wraps up
                automatically. Difficulty only changes how many points a shape is worth.
              </p>

              <div className="mb-4 flex flex-wrap gap-2">
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
                  Symmetry Mode
                </button>
                <button
                  onClick={goToPrevShape}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold hover:bg-slate-700 transition-colors"
                  title="Previous shape"
                >
                  <ChevronLeft size={16} className="inline" />
                </button>
                <button
                  onClick={goToNextShape}
                  className="rounded-lg bg-purple-800 px-4 py-2 text-sm font-semibold hover:bg-purple-700 transition-colors"
                >
                  <RefreshCw size={16} className="inline mr-1" />
                  Next Shape
                </button>
                <button
                  onClick={goToRandomShape}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700 transition-colors"
                >
                  <Shuffle size={16} className="inline mr-1" />
                  Random
                </button>
                <button
                  onClick={() => setShowGallery((v) => !v)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                    showGallery ? "bg-cyan-600 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <Grid3x3 size={16} className="inline mr-1" />
                  This Session's Shapes
                </button>
              </div>

              {showGallery && <div className="relative mb-4">{ShapeGalleryPanel}</div>}

              {/* Shape preview — name, difficulty and icon live in the caption
                  under the box itself instead of a separate text line above it */}
              <div className="mb-1 w-40 h-40 rounded-xl border-2 border-slate-800 bg-white p-2">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <path d={shapePath} fill="none" stroke="#0891b2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="mb-4 flex items-center gap-2 text-xs text-slate-400">
                <span className="text-cyan-400 font-bold">{currentShape?.name}</span>
                <span className="text-yellow-500">{'⭐'.repeat(currentShape?.difficulty || 1)}</span>
                <span className="text-slate-500">
                  Shape {(currentShapeIndex % shapeList.length) + 1} of {shapeList.length}
                </span>
              </div>

              {handMode === "symmetry" && (
                <p className="mb-4 text-xs text-slate-500">
                  Traces a mirrored copy of the shape with each hand at once. Symmetry score compares
                  left vs. right shoulder range of motion.
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
                <span>🟢 90-100% Perfect</span>
                <span>🔵 70-89% Good</span>
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
              {/* Shape name and icon at top — font size scales down for long names so nothing clips */}
              <text
                x="50"
                y="9"
                textAnchor="middle"
                fontSize={shapeLabelFontSize}
                fontWeight="700"
                fill="#334155"
              >
                {shapeLabel}
              </text>

              {/* Shape difficulty indicator (informational — never gates selection) */}
              <text x="97" y="9" textAnchor="end" fontSize="4" fill="#eab308">
                {'⭐'.repeat(currentShape?.difficulty || 1)}
              </text>

              {/* Path outline with pulse animation */}
              <path
                d={shapePath}
                fill="none"
                stroke="#334155"
                strokeWidth="2.5"
                strokeDasharray="4 4"
                style={{ animation: `canvasAirPulse ${accuracyBand.pulse}s ease-in-out infinite` }}
              />

              {/* Highlight covered path segments */}
              {pathCoverage.length > 0 && (
                <path
                  d={shapePath}
                  fill="none"
                  stroke={accuracyBand.stroke}
                  strokeWidth="4"
                  strokeDasharray="2 4"
                  opacity="0.3"
                  style={{
                    strokeDashoffset: `${(1 - (pathCoverage.length / (sampledPathRef.current.length || 1))) * 100}%`,
                    transition: "stroke-dashoffset 0.3s"
                  }}
                />
              )}

              {/* User's trace */}
              <polyline
                points={trace.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={isTracing ? accuracyBand.stroke : "#94a3b8"}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transition: "stroke 0.3s" }}
              />

              {/* Sparkles */}
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

              {/* Bottom info */}
              <text x="50" y="95" textAnchor="middle" fontSize="4" fontWeight="500" fill="#64748b">
                {currentShape?.name} • {currentDifficulty} • {shapeProgress.toFixed(2)}% covered
              </text>
            </svg>

            {!smoothedFingertip && (
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
              <div className="shape-complete-anim absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-center">
                <div className="text-6xl font-black text-emerald-400">✨ COMPLETE!</div>
                {lastShapeMetrics && (
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-black/50 px-6 py-3 font-mono text-sm text-slate-100">
                    <span>Coverage</span>
                    <span className="text-right">{lastShapeMetrics.coveragePercent.toFixed(2)}%</span>
                    <span>Accuracy</span>
                    <span className="text-right">{lastShapeMetrics.tracingAccuracyPercent.toFixed(2)}%</span>
                    <span>Avg. deviation</span>
                    <span className="text-right">{lastShapeMetrics.averageDeviationUnits.toFixed(3)} u</span>
                    <span>Time</span>
                    <span className="text-right">{lastShapeMetrics.timeToCompleteSeconds.toFixed(2)}s</span>
                    <span>Smoothness</span>
                    <span className="text-right">{lastShapeMetrics.smoothnessScore.toFixed(1)}</span>
                    <span>Speed score</span>
                    <span className="text-right">{lastShapeMetrics.speedScore.toFixed(1)}</span>
                    <span className="font-bold text-emerald-300">Quality</span>
                    <span className="text-right font-bold text-emerald-300">{lastShapeMetrics.qualityScore.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {showShapeMissed && (
              <div className="shape-missed-anim absolute inset-0 flex items-center justify-center bg-black/60 text-5xl font-black text-red-400">
                ⏰ Time's Up
              </div>
            )}

            <div
              ref={cursorElRef}
              className="absolute w-5 h-5 rounded-full border-2 border-pink-500 bg-pink-200/30 shadow-lg pointer-events-none"
              style={{
                display: "none",
                transform: "translate(-50%, -50%)",
                willChange: "left, top",
                // left/top are written directly every animation frame by the
                // rAF loop above, from the raw (unfiltered) fingertip
                // position — no CSS transition, no interpolation, 1:1.
              }}
            />
          </div>
        )}

        {isActiveScreen && isSymmetry && (
          <div className="flex w-[74%] gap-4">
            <div className="relative w-1/2 overflow-hidden rounded-2xl border-4 border-slate-800 bg-white">
              <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                <text x="50" y="9" textAnchor="middle" fontSize={Math.min(shapeLabelFontSize, 5.5)} fontWeight="700" fill="#334155">
                  {shapeLabel}
                </text>
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
                <text x="50" y="95" textAnchor="middle" fontSize="4" fontWeight="500" fill="#64748b">
                  Left • {shapeProgressLeft.toFixed(2)}%
                </text>
              </svg>
              <div
                ref={leftCursorElRef}
                className="absolute w-4 h-4 rounded-full border-2 border-pink-500 bg-pink-200/30 shadow-lg pointer-events-none"
                style={{ display: "none", transform: "translate(-50%, -50%)", willChange: "left, top" }}
              />
            </div>

            <div className="relative w-1/2 overflow-hidden rounded-2xl border-4 border-slate-800 bg-white">
              <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                <text x="50" y="9" textAnchor="middle" fontSize={Math.min(shapeLabelFontSize, 5.5)} fontWeight="700" fill="#334155">
                  {shapeLabel}
                </text>
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
                <text x="50" y="95" textAnchor="middle" fontSize="4" fontWeight="500" fill="#64748b">
                  Right • {shapeProgressRight.toFixed(2)}%
                </text>
              </svg>
              <div
                ref={rightCursorElRef}
                className="absolute w-4 h-4 rounded-full border-2 border-pink-500 bg-pink-200/30 shadow-lg pointer-events-none"
                style={{ display: "none", transform: "translate(-50%, -50%)", willChange: "left, top" }}
              />
            </div>

            <div className="absolute right-4 top-4 rounded-lg bg-black/70 px-3 py-1 text-xs font-mono text-white">
              ⏱ {shapeTimeLeft}s
            </div>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs text-slate-500">
              {((shapeProgressLeft + shapeProgressRight) / 2).toFixed(2)}% combined
            </div>
            {showShapeComplete && (
              <div className="shape-complete-anim pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-center">
                <div className="text-5xl font-black text-emerald-400">✨ COMPLETE!</div>
                {lastShapeMetrics && (
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-black/50 px-6 py-3 font-mono text-sm text-slate-100">
                    <span>Coverage (avg)</span>
                    <span className="text-right">{lastShapeMetrics.coveragePercent.toFixed(2)}%</span>
                    <span>Avg. deviation</span>
                    <span className="text-right">{lastShapeMetrics.averageDeviationUnits.toFixed(3)} u</span>
                    <span>Time</span>
                    <span className="text-right">{lastShapeMetrics.timeToCompleteSeconds.toFixed(2)}s</span>
                    <span className="font-bold text-emerald-300">Quality</span>
                    <span className="text-right font-bold text-emerald-300">{lastShapeMetrics.qualityScore.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
            {showShapeMissed && (
              <div className="shape-missed-anim pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 text-4xl font-black text-red-400">
                ⏰ Time's Up
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}