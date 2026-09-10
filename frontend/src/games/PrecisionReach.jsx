// frontend/src/games/PrecisionReach.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, X, Wifi, WifiOff } from "lucide-react";

import useMediaPipeUpperBody from "../hooks/useMediaPipeUpperBody";
import usePoseDetection from "../hooks/usePoseDetection";
import usePostureGuidance from "../hooks/usePostureGuidance";
import useFacialPainDetection from "../hooks/useFacialPainDetection";
import useAdaptiveDifficulty from "../hooks/useAdaptiveDifficulty";
import { useGameEngine, GAME_STATES } from "../hooks/useGameEngine";
import { useSessionTelemetry } from "../hooks/useSessionTelemetry";
import { useAudioFeedback } from "../hooks/useAudioFeedback";
import SkeletonOverlay from "../components/rehab/SkeletonOverlay";
import SessionSummary from "../components/rehab/SessionSummary";
// Safety-net only. The REAL session-completion condition is finishing all
// SESSION_TARGET_COUNT targets — see the targetIndex effect below. This
// timer only protects against a session that somehow never resolves
// (e.g. patient walks away).
const SESSION_SECONDS = 120;

// The session is exactly 5 targets, always. Not configurable by
// difficulty — difficulty affects target size/distance/hold time, never
// the count.
const SESSION_TARGET_COUNT = 5;

const HOLD_DURATION_MS = {
  Beginner: 1000,
  Intermediate: 2000,
  Advanced: 3000,
};

const TARGET_SIZE_PERCENT = {
  Beginner: 22,
  Intermediate: 15,
  Advanced: 9,
};

// Single fixed spawn distance from HOME per difficulty (% of arena's
// shorter side), replacing the old randomized min/max range — targets
// now sit at deliberate, fixed directional positions (see
// TARGET_DIRECTIONS) rather than random angles.
const TARGET_DISTANCE_PERCENT = {
  Beginner: 18,
  Intermediate: 29,
  Advanced: 39,
};

// The 5 fixed reach directions for the session, in order. Chosen to
// cover up/left/right/down/diagonal so the session exercises ROM in
// multiple directions, and to keep target 5 (diagonal) clear of the
// webcam panel, which floats top-right.
const TARGET_DIRECTIONS = [
  { label: "Up", angleDeg: -90 },
  { label: "Left", angleDeg: 180 },
  { label: "Right", angleDeg: 0 },
  { label: "Down", angleDeg: 90 },
  { label: "Upper-Left", angleDeg: -135 },
];

// One distinct color per target index. Deliberately never reused — the
// wrist cursor is always white, so color is reserved entirely for "this
// is the target," per spec.
const TARGET_COLORS = [
  { name: "cyan", hex: "#22d3ee", rgb: "34,211,238" },
  { name: "purple", hex: "#a78bfa", rgb: "167,139,250" },
  { name: "orange", hex: "#fb923c", rgb: "251,146,60" },
  { name: "green", hex: "#4ade80", rgb: "74,222,128" },
  { name: "pink", hex: "#f472b6", rgb: "244,114,182" },
];

const DIFFICULTY_COLOR = {
  Beginner: { text: "text-emerald-400", bg: "bg-emerald-500/20", border: "border-emerald-500/50" },
  Intermediate: { text: "text-amber-400", bg: "bg-amber-500/20", border: "border-amber-500/50" },
  Advanced: { text: "text-rose-400", bg: "bg-rose-500/20", border: "border-rose-500/50" },
};

// ─── PAPS (Pain-Adjusted Performance Score) ───────────────────────────────
// No standalone papsService.js exists in this game — PrecisionReach.jsx
// computed a placeholder (`paps = accuracy`, optionally *0.8 for pain)
// directly inline. Replacing that placeholder with a real composite score
// built from the metrics this game actually captures: accuracy, ROM,
// response time, and rep-to-rep consistency, weighted and then pain-
// adjusted exactly once at the end (never compounded).
const PAPS_WEIGHTS = {
  accuracy: 0.40,
  rom: 0.25,
  responseTime: 0.20,
  consistency: 0.15,
};

// Rewards attempting/completing the session at a harder difficulty,
// applied to the weighted composite before the final pain adjustment.
const DIFFICULTY_PAPS_MULTIPLIER = {
  Beginner: 1.0,
  Intermediate: 1.08,
  Advanced: 1.15,
};

// Degrees of shoulder-angle excursion considered a "full" reach for the
// ROM component of PAPS — reps averaging at/above this score 100 on this
// component; below it scales down linearly.
const PAPS_TARGET_ROM_DEGREES = 90;

// Response-time component: at/under CEILING scores 100, at/over FLOOR
// scores 0, linear in between. Widened from an initial 1.5s/6s pass —
// rehab patients reaching deliberately (not racing) were landing at
// ~5-7s and getting a full 0 on this component, which is punitive for
// controlled, correct movement. 2.5s/10s better reflects a realistic
// deliberate-but-successful reach.
const PAPS_RESPONSE_CEILING_SECONDS = 2.5;
const PAPS_RESPONSE_FLOOR_SECONDS = 10;

function computePapsRomComponent(reps) {
  if (!reps.length) return 0;
  const validRoms = reps
    .map((r) => r.romDegrees)
    .filter((v) => typeof v === "number" && Number.isFinite(v));

  if (!validRoms.length) return 0;

  const avgRom =
    validRoms.reduce((a, b) => a + b, 0) / validRoms.length;
  return Math.min(100, (avgRom / PAPS_TARGET_ROM_DEGREES) * 100);
}

function computePapsResponseTimeComponent(reps) {
  if (!reps.length) return 0;
  const avgSeconds = reps.reduce((a, r) => a + (r.responseTimeSeconds || 0), 0) / reps.length;
  if (avgSeconds <= PAPS_RESPONSE_CEILING_SECONDS) return 100;
  if (avgSeconds >= PAPS_RESPONSE_FLOOR_SECONDS) return 0;
  const range = PAPS_RESPONSE_FLOOR_SECONDS - PAPS_RESPONSE_CEILING_SECONDS;
  return Math.max(0, 100 * (1 - (avgSeconds - PAPS_RESPONSE_CEILING_SECONDS) / range));
}

function computePapsConsistencyComponent(reps) {
  // Movement smoothness/performance proxy: low rep-to-rep ROM variance
  // (coefficient of variation) indicates controlled, repeatable motion
  // rather than one lucky big reach among mostly-flat attempts.
  if (reps.length < 2) return reps.length ? 100 : 0;
  const roms = reps
    .map((r) => r.romDegrees)
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  const mean = roms.reduce((a, b) => a + b, 0) / roms.length;
  if (mean === 0) return 0;
  const variance = roms.reduce((a, r) => a + (r - mean) ** 2, 0) / roms.length;
  const coefficientOfVariation = Math.sqrt(variance) / mean;
  return Math.max(0, 100 * (1 - coefficientOfVariation / 0.6));
}

// Computes the full PAPS score from actual session metrics. Returns 0
// until at least one rep has been completed (no fabricated starting
// value like 100).
function computePaps({ accuracy, reps, difficulty, painDetected }) {
  if (!reps.length) return 0;
  const romComponent = computePapsRomComponent(reps);
  const responseTimeComponent = computePapsResponseTimeComponent(reps);
  const consistencyComponent = computePapsConsistencyComponent(reps);

  const rawComposite =
    accuracy * PAPS_WEIGHTS.accuracy +
    romComponent * PAPS_WEIGHTS.rom +
    responseTimeComponent * PAPS_WEIGHTS.responseTime +
    consistencyComponent * PAPS_WEIGHTS.consistency;

  const difficultyMultiplier = DIFFICULTY_PAPS_MULTIPLIER[difficulty] || 1;
  const painMultiplier = painDetected ? 0.8 : 1;

  return Math.round(Math.min(100, rawComposite * difficultyMultiplier) * painMultiplier);
}

const HOME_POSITION = { x: 50, y: 50 };
const MISS_FLASH_MS = 500;
const ADAPT_INTERVAL_MS = 10000;
const PARTICLE_COUNT = 8;
const DIFFICULTY_TOAST_MS = 2200;

// How aggressively the displayed/hit-tested cursor eases toward the raw
// MediaPipe wrist reading each frame. Lower = smoother but laggier,
// higher = snappier but jittery. 0.3 removes most frame-to-frame
// tracking noise without feeling sluggish.
const CURSOR_SMOOTHING = 0.3;

// How long (ms) the cursor must stay OUTSIDE the target zone while a
// hold is in progress before that attempt is counted as a MISS. A
// single jittery tracking frame at the target's edge should not fail
// the attempt outright.
const ZONE_EXIT_GRACE_MS = 150;

// ─── Precision-Reach-only session history ────────────────────────────────
// Scoped strictly to this file/game. There is no shared session-history
// store visible from this component, and no report-generation file is
// being touched here — so history is persisted locally (per patient) and
// handed to the report payload this file already builds (`sessionData` /
// `telemetry.saveReport`), rather than inventing a second, separate
// reporting pipeline. A React component instance is created fresh each
// time the patient starts a new Precision Reach session (they navigate
// away to "Games" and back in between), so plain component state alone
// would NOT survive across sessions — localStorage is what makes
// "Session 1 history still there after Session 2 completes" true.
const PRECISION_REACH_HISTORY_KEY_PREFIX = "precisionReachSessionHistory:";

function precisionReachHistoryStorageKey(patientId) {
  return `${PRECISION_REACH_HISTORY_KEY_PREFIX}${patientId || "guest"}`;
}

function loadPrecisionReachHistory(patientId) {
  try {
    const raw = window.localStorage.getItem(precisionReachHistoryStorageKey(patientId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Private-browsing / storage-disabled / corrupt JSON: fail safe to an
    // empty history rather than crash the game. The CURRENT session's
    // data is unaffected either way — this only limits carrying PAST
    // sessions forward.
    return [];
  }
}

function savePrecisionReachHistory(patientId, history) {
  try {
    window.localStorage.setItem(precisionReachHistoryStorageKey(patientId), JSON.stringify(history));
  } catch {
    // Same fail-safe reasoning as above — never let persistence failures
    // block the session-complete flow.
  }
}

// Pure function: no computation here that resembles a formula. This is a
// dumb reader of PrecisionReach.jsx's OWN already-computed session
// figures (accuracy, ROM, PAPS, etc.) — nothing here recalculates or
// overrides any of those values, it only packages them into one immutable
// historical record per completed session.
function buildPrecisionReachSessionRecord({
  sessionNumber,
  score,
  accuracy,
  hits,
  misses,
  repData,
  averageRomDegrees,
  maxRomDegrees,
  avgResponseSeconds,
  paps,
  painAdjusted,
  difficulty,
  durationSeconds,
  bestStreak,
  targetCount,
}) {
  return {
    sessionNumber,
    // NOTE: "session day" in the old aggregated report referred to a
    // rehab-PROGRAM day, which requires a program start date this
    // component is never given as a prop — inventing one would violate
    // "do not invent values". sessionNumber (the Nth Precision Reach
    // session this patient has completed) is the accurate substitute
    // available from data this file actually has.
    completedAt: new Date().toISOString(),
    score,
    accuracy,
    hits,
    misses,
    totalReps: repData.length,
    avgRomDegrees: averageRomDegrees,
    maxRomDegrees,
    avgResponseTimeSeconds: Math.round(avgResponseSeconds * 100) / 100,
    paps,
    painAdjusted,
    difficulty,
    durationSeconds,
    bestStreak,
    targetsCompleted: `${repData.length}/${targetCount}`,
    // Per-rep breakdown for the "SESSION N — REP DETAILS" table — reuses
    // the exact fields already recorded per rep by registerHit/
    // registerMiss (direction, result, romDegrees, responseTimeSeconds),
    // nothing recomputed or renamed to a different meaning.
    repData: repData.map((r) => ({
      rep: r.rep,
      direction: r.direction,
      result: r.result,
      romDegrees: typeof r.romDegrees === "number" ? r.romDegrees : null,
      responseTimeSeconds: r.responseTimeSeconds || 0,
    })),
  };
}

// Pure function: target position/color/label for a given index + current
// difficulty. Deliberately has no internal timestamp — spawnedAtRef
// (below) owns "when did this target appear," so difficulty changing
// mid-attempt can reposition/resize the target without resetting the
// response-time clock.
function computeTarget(index, difficulty) {
  const dir = TARGET_DIRECTIONS[index] || TARGET_DIRECTIONS[0];
  const color = TARGET_COLORS[index] || TARGET_COLORS[0];
  const radius = TARGET_DISTANCE_PERCENT[difficulty] ?? TARGET_DISTANCE_PERCENT.Beginner;
  const rad = (dir.angleDeg * Math.PI) / 180;
  const x = Math.min(88, Math.max(12, HOME_POSITION.x + radius * Math.cos(rad)));
  const y = Math.min(85, Math.max(15, HOME_POSITION.y + radius * Math.sin(rad)));
  return { x, y, color, directionLabel: dir.label };
}

// ─── Particle Burst ──────────────────────────────────────────────────────────
function ParticleBurst({ x, y, active, colorHex }) {
  if (!active) return null;
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * 360;
    return (
      <div
        key={i}
        className="absolute w-2 h-2 rounded-full pointer-events-none"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          transform: "translate(-50%, -50%)",
          background: i % 2 === 0 ? colorHex : "#ffffff",
          animation: `particleBurst 0.55s ease-out forwards`,
          animationDelay: `${i * 0.02}s`,
          "--angle": `${angle}deg`,
          "--dist": `${45 + Math.random() * 30}px`,
        }}
      />
    );
  });
  return <>{particles}</>;
}

// ─── Difficulty Toast ─────────────────────────────────────────────────────────
function DifficultyToast({ message, visible }) {
  return (
    <div
      className={`absolute top-4 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 pointer-events-none ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
        }`}
    >
      <div className="flex items-center gap-2 rounded-full border border-cyan-500/60 bg-slate-900/95 px-5 py-2 text-sm font-bold text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.3)] backdrop-blur">
        <span className="text-base">🎯</span>
        {message}
      </div>
    </div>
  );
}

// ─── Pill HUD Badge ───────────────────────────────────────────────────────────
function Pill({ label, value, colorClass = "text-slate-300", bgClass = "bg-slate-800/80", icon }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-mono font-semibold ${bgClass} border border-white/10`}>
      {icon && <span className="text-sm leading-none">{icon}</span>}
      <span className="text-slate-500">{label}</span>
      <span className={colorClass}>{value}</span>
    </div>
  );
}

function PapsPill({ paps }) {
  const color =
    paps >= 75 ? "text-emerald-400" : paps >= 50 ? "text-amber-400" : "text-rose-400";
  const bg =
    paps >= 75 ? "bg-emerald-500/10" : paps >= 50 ? "bg-amber-500/10" : "bg-rose-500/10";
  return <Pill label="PAPS" value={paps} colorClass={color} bgClass={bg} icon="⭐" />;
}

export default function PrecisionReach({
  onSessionEnd,
  patientId,
  gameId = "precision-reach",
}) {
  const videoRef = useRef(null);
  const hasEndedRef = useRef(false);
  const holdStartRef = useRef(null);
  // Guards a single target from ever being resolved (hit or miss) more
  // than once. Without this, a hold completing on one frame and a
  // zone-exit on the very next frame (before targetIndex's state update
  // has propagated back into this effect's closure) could fire both
  // registerHit AND registerMiss for the same target — desyncing
  // hits+misses from targetIndex and eventually leaving the arena with
  // no valid target to render.
  const targetResolvedRef = useRef(false);
  // Timestamp of when the cursor most recently left the target zone
  // while a hold was in progress. Used to debounce the miss: a single
  // noisy frame near the target's edge should NOT immediately fail the
  // attempt (that was the "unexpected red X" bug) — only a sustained
  // exit counts.
  const zoneExitTimeRef = useRef(null);
  // Per-attempt shoulder-angle range, used to compute "ROM for this rep".
  // Reset whenever targetIndex changes — see the reset effect below.
  const attemptMinAngleRef = useRef(null);
  const attemptMaxAngleRef = useRef(0);
  const missFlashTimerRef = useRef(null);
  const painDetectedDuringSessionRef = useRef(false);
  const [arenaEl, setArenaEl] = useState(null);
  const arenaRef = useCallback((node) => setArenaEl(node), []);
  const [arenaSize, setArenaSize] = useState({ width: 0, height: 0 });

  // ── LIVE board rect ──────────────────────────────────────────────────────
  // arenaSize (from ResizeObserver contentRect) is only updated on resize
  // and does not account for page scroll, flex reflow, or layout shifts.
  // This ref is refreshed every animation frame from the actual DOM node
  // via getBoundingClientRect(), and is the single source of truth for
  // converting normalized MediaPipe wrist coordinates into board-relative
  // pixels. Both cursor rendering, proximity, and hit detection read it.
  const arenaRectRef = useRef({ left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    if (!arenaEl) return undefined;
    const rect = arenaEl.getBoundingClientRect();
    setArenaSize({ width: rect.width, height: rect.height });
    arenaRectRef.current = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setArenaSize({ width, height });
    });
    observer.observe(arenaEl);
    return () => observer.disconnect();
  }, [arenaEl]);

  // Refresh the live board rect every animation frame. Scroll, layout
  // shifts, and flex reflow all change getBoundingClientRect without
  // firing the ResizeObserver — this keeps conversion accurate.
  useEffect(() => {
    let rafId;
    const tick = () => {
      const el = arenaEl;
      if (el) {
        const r = el.getBoundingClientRect();
        arenaRectRef.current = {
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
        };
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [arenaEl]);

  // Convert a normalized MediaPipe wrist reading (0..1) into board-relative
  // CSS pixels, using the LIVE board rectangle. Handles:
  //   - webcam mirroring (see note below)
  //   - board offset within the viewport (via live getBoundingClientRect)
  //   - clamping to the playable area
  //
  // Mirroring: the <video> element is CSS-mirrored with scale-x-[-1], and
  // usePoseDetection emits position.x already in DISPLAY (mirrored) space
  // — that is what makes the on-screen skeleton line up with the mirrored
  // video. The game board itself is NOT mirrored, so we must apply the
  // SAME mirror transform the video applies, otherwise the cursor moves
  // opposite to the patient's hand. In other words: the hook's 0..1 x is
  // display-space left→right; the board is also left→right, so we can
  // use normX directly *only if* the hook already undid the camera flip.
  // The current hook contract (per usePoseDetection consumers in this
  // codebase) emits raw camera-normalized x, where x=0 is the patient's
  // right side on a non-mirrored camera. Since we want the cursor to
  // track the patient's physical hand motion as seen in the mirrored
  // preview, we mirror here: x_board = 1 - normX.
  //
  // If after applying this the cursor moves OPPOSITE to the hand, flip
  // the single line marked MIRROR below.
  const wristToBoardPx = useCallback((normX, normY) => {
    const rect = arenaRectRef.current;
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    const mirroredX = normX; // MIRROR — flip to `normX` if direction is inverted
    const clampedX = Math.min(1, Math.max(0, mirroredX));
    const clampedY = Math.min(1, Math.max(0, normY));
    return {
      x: clampedX * rect.width,
      y: clampedY * rect.height,
    };
  }, []);

  const [poseData, setPoseData] = useState(null);

  // ── 5-target session progression ─────────────────────────────────────────
  // targetIndex is the single source of truth for "which of the 5 targets
  // is active." 0..4 during play; reaching SESSION_TARGET_COUNT means the
  // session is over (handled by the effect below).
  const [targetIndex, setTargetIndex] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [showMissFlash, setShowMissFlash] = useState(false);
  const [missFlashPos, setMissFlashPos] = useState({ x: 50, y: 50 });
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [repData, setRepData] = useState([]);
  const [maxAngle, setMaxAngle] = useState(0);
  const [minAngle, setMinAngle] = useState(null);

  const [particleBurst, setParticleBurst] = useState({ active: false, x: 0, y: 0, colorHex: "#22d3ee" });
  const particleTimerRef = useRef(null);

  const [diffToast, setDiffToast] = useState({ visible: false, message: "" });
  const diffToastTimerRef = useRef(null);
  const prevDifficultyRef = useRef("Beginner");

  const pauseStartRef = useRef(null);
  const pausedMsSinceSpawnRef = useRef(0);
  const sessionStartTimeRef = useRef(null);
  // When each attempt actually started, independent of difficulty
  // recomputation — see computeTarget's docblock.
  const spawnedAtRef = useRef(performance.now());

  const { isActive } = useMediaPipeUpperBody({ videoRef, onPoseUpdate: setPoseData });
  const { position, shoulderAngle, activeSide, status, hasTrackedOnce } = usePoseDetection(poseData);
  const guidance = usePostureGuidance(poseData);
  const { papsScore: painScore, isPainDetected, resetPainState } = useFacialPainDetection({ videoRef });
  const { currentDifficulty, adapt } = useAdaptiveDifficulty();
  const telemetry = useSessionTelemetry(patientId, gameId);
  const audio = useAudioFeedback(true);

  // Smoothed cursor position. usePoseDetection's `position` updates directly
  // off raw MediaPipe landmarks, which jitters frame to frame — we ease
  // toward it here (exponential moving average) instead of snapping, and
  // use this smoothed value for BOTH rendering and hit-testing so what the
  // patient sees matches what triggers a hold/hit exactly.
  const smoothedPosRef = useRef({ x: HOME_POSITION.x, y: HOME_POSITION.y });
  const [smoothPosition, setSmoothPosition] = useState({ x: HOME_POSITION.x, y: HOME_POSITION.y });

  // Latest raw wrist reading, kept in a ref so the rAF loop below can read
  // it every frame without restarting itself each time MediaPipe emits a
  // new sample.
  const latestPositionRef = useRef({ x: HOME_POSITION.x, y: HOME_POSITION.y });
  useEffect(() => {
    latestPositionRef.current = { x: position.x, y: position.y };
  }, [position.x, position.y]);

  // Ease the rendered cursor toward the raw wrist position every animation
  // frame — not just when a new MediaPipe sample arrives — so the dot
  // glides at display refresh rate instead of stepping between sparse
  // detections.
  useEffect(() => {
    let rafId;
    const tick = () => {
      const raw = latestPositionRef.current;
      smoothedPosRef.current = {
        x: smoothedPosRef.current.x + (raw.x - smoothedPosRef.current.x) * CURSOR_SMOOTHING,
        y: smoothedPosRef.current.y + (raw.y - smoothedPosRef.current.y) * CURSOR_SMOOTHING,
      };
      setSmoothPosition({ x: smoothedPosRef.current.x, y: smoothedPosRef.current.y });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Snap (don't ease) the very first time a hand is detected, and any time
  // tracking is re-acquired after being lost — otherwise the cursor visibly
  // glides in from HOME/its last spot, which reads as a tracking glitch
  // rather than intentional smoothing.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const wasTracking = prevStatusRef.current === "tracking";
    prevStatusRef.current = status;
    if (status === "tracking" && !wasTracking) {
      smoothedPosRef.current = { x: position.x, y: position.y };
      setSmoothPosition({ x: position.x, y: position.y });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Current target — derived, not stored. Recomputes automatically (new
  // position/size/color) if currentDifficulty changes mid-session, without
  // resetting spawnedAtRef or the attempt count.
  const target = useMemo(
    () => computeTarget(targetIndex, currentDifficulty),
    [targetIndex, currentDifficulty]
  );

  const attempts = hits + misses;
  const accuracy = attempts ? Math.round((hits / attempts) * 100) : 0;
  const romValues = repData
    .map((r) => r.romDegrees)
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  const averageRomDegrees = romValues.length
    ? Math.round(romValues.reduce((a, b) => a + b, 0) / romValues.length)
    : 0;
  const maxRomDegrees = romValues.length ? Math.max(...romValues) : 0;
  const responseValues = repData
    .map((r) => r.responseTimeSeconds)
    .filter((v) => typeof v === "number" && Number.isFinite(v));

  const avgResponseSeconds = responseValues.length
    ? responseValues.reduce((a, b) => a + b, 0) / responseValues.length
    : 0;
  // BUGFIX: SessionSummary.jsx reads gameSpecificMetrics.bestCombo (or
  // .longestHitStreak) but nothing here ever computed or sent either
  // field, so it always fell through to SessionSummary's `?? 0` default
  // — that's why Best Streak always showed 0 regardless of real hits.
  // Derived the same way the other stats above are: from repData's
  // ordered, already-committed `success` flags (longest run of
  // consecutive hits), not from hit COUNT.
  const bestStreak = repData.reduce(
    (acc, r) => {
      if (r.success) {
        acc.current += 1;
        acc.best = Math.max(acc.best, acc.current);
      } else {
        acc.current = 0;
      }
      return acc;
    },
    { current: 0, best: 0 }
  ).best;
  // Score mirrors accuracy for this 5-target precision game so it can
  // never disagree with the hit/miss result shown next to it.
  const score = accuracy;

  useEffect(() => {
    if (isPainDetected) painDetectedDuringSessionRef.current = true;
  }, [isPainDetected]);
  // BUGFIX: this used to be `Math.round(accuracy * (pain ? 0.8 : 1))` —
  // i.e. PAPS was literally just accuracy (with an optional pain
  // discount), which is why PAPS always equaled Accuracy in the UI.
  // Now derived from the actual composite formula above: accuracy, ROM,
  // response time, and consistency, difficulty-weighted, pain-adjusted
  // once at the end. Returns 0 until reps exist — no fake starting 100.
  const paps = computePaps({
    accuracy,
    reps: repData,
    difficulty: currentDifficulty,
    painDetected: painDetectedDuringSessionRef.current,
  });

  const targetSizePercent = TARGET_SIZE_PERCENT[currentDifficulty] || TARGET_SIZE_PERCENT.Beginner;
  const holdDurationMs = HOLD_DURATION_MS[currentDifficulty] || HOLD_DURATION_MS.Beginner;
  const arenaMinSide = Math.min(arenaSize.width, arenaSize.height) || 0;
  const targetSizePx = (targetSizePercent / 100) * arenaMinSide;

  useEffect(() => {
    if (prevDifficultyRef.current === currentDifficulty) return;
    const prev = prevDifficultyRef.current;
    prevDifficultyRef.current = currentDifficulty;
    const LEVEL_ORDER = ["Beginner", "Intermediate", "Advanced"];
    const dir = LEVEL_ORDER.indexOf(currentDifficulty) > LEVEL_ORDER.indexOf(prev) ? "Increased" : "Decreased";
    if (diffToastTimerRef.current) clearTimeout(diffToastTimerRef.current);
    setDiffToast({ visible: true, message: `Difficulty ${dir} to ${currentDifficulty}` });
    diffToastTimerRef.current = setTimeout(() => setDiffToast((t) => ({ ...t, visible: false })), DIFFICULTY_TOAST_MS);
  }, [currentDifficulty]);

  // useGameEngine now only owns: instructions → countdown → active → paused
  // → complete, plus the SESSION_SECONDS safety timer. It does NOT own
  // rep-by-rep progression (its built-in FEEDBACK/REST cycle assumes a
  // different flow than "advance immediately"), so onRepComplete is
  // intentionally omitted — recordRep/audio are called directly from
  // registerHit/registerMiss below instead.
  const engine = useGameEngine({
    totalReps: 0,
    sessionLength: SESSION_SECONDS,
    onSessionComplete: () => finalizeTelemetry(),
  });

  const { gameState, countdown, timeLeft, isPaused, startSession, pauseSession, resumeSession, endSession } = engine;

  useEffect(() => {
    if (isPaused) {
      pauseStartRef.current = performance.now();
    } else if (pauseStartRef.current !== null) {
      pausedMsSinceSpawnRef.current += performance.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
  }, [isPaused]);

  // Reset per-attempt state whenever the target index changes (new attempt
  // started) — but NOT when only currentDifficulty changes the derived
  // `target`'s position/size mid-attempt.
  //
  // NOTE on ordering: this effect is declared BEFORE the reach-and-hold
  // effect below, and React runs effects in declaration order, so on the
  // frame a new targetIndex lands, these refs are reset before the reach
  // loop can touch them for the new target. attemptMaxAngleRef starts at
  // 0 (not null) and attemptMinAngleRef starts at null so a rep with no
  // detected angle records 0 (no valid ROM), not a stale value from the
  // previous rep.
  useEffect(() => {
    if (targetIndex >= SESSION_TARGET_COUNT) return;
    spawnedAtRef.current = performance.now();
    pausedMsSinceSpawnRef.current = 0;
    pauseStartRef.current = null;
    holdStartRef.current = null;
    zoneExitTimeRef.current = null;
    targetResolvedRef.current = false;
    attemptMinAngleRef.current = null;
    attemptMaxAngleRef.current = 0;
    setIsHolding(false);
    setHoldProgress(0);
    // eslint-disable-next-line no-console
    console.log(`[TARGET] ${targetIndex + 1}/${SESSION_TARGET_COUNT} spawned`);
  }, [targetIndex]);

  // Session ends the moment all 5 targets have been attempted — this is
  // the PRIMARY completion condition, not the 120s timer.
  useEffect(() => {
    if (targetIndex >= SESSION_TARGET_COUNT && gameState === GAME_STATES.ACTIVE) {
      // eslint-disable-next-line no-console
      console.log("[SESSION] COMPLETE");
      endSession();
    }
  }, [targetIndex, gameState, endSession]);

  const advanceTarget = useCallback(() => {
    setTargetIndex((v) => v + 1);
  }, []);

  const registerMiss = useCallback(() => {
    if (targetResolvedRef.current) return;
    targetResolvedRef.current = true;
    const missedTarget = target;
    // eslint-disable-next-line no-console
    console.log(`[TARGET] ${targetIndex + 1}/${SESSION_TARGET_COUNT} MISS`);
    setMisses((v) => v + 1); telemetry.recordRep(false);
    audio.playMiss();
    setMissFlashPos({ x: missedTarget.x, y: missedTarget.y });
    setShowMissFlash(true);
    if (missFlashTimerRef.current) clearTimeout(missFlashTimerRef.current);
    missFlashTimerRef.current = setTimeout(() => setShowMissFlash(false), MISS_FLASH_MS);

    const attemptRom = attemptMinAngleRef.current === null
      ? 0
      : Math.max(0, Math.round(attemptMaxAngleRef.current - attemptMinAngleRef.current));
    const elapsedMs = performance.now() - spawnedAtRef.current - pausedMsSinceSpawnRef.current;
    setRepData((prev) => [...prev, {
      rep: targetIndex + 1,
      direction: missedTarget.directionLabel,
      result: "miss",
      romDegrees: attemptRom,
      responseTimeSeconds: Math.round((Math.max(0, elapsedMs) / 1000) * 100) / 100,
      success: false,
    }]);
    advanceTarget();
  }, [target, telemetry, audio, advanceTarget, targetIndex]);

  const registerHit = useCallback(() => {
    if (targetResolvedRef.current) return;
    targetResolvedRef.current = true;
    const rawResponseMs = performance.now() - spawnedAtRef.current - pausedMsSinceSpawnRef.current;
    const responseSeconds = Math.max(0, rawResponseMs) / 1000;
    const attemptRom = attemptMinAngleRef.current === null
      ? 0
      : Math.max(0, Math.round(attemptMaxAngleRef.current - attemptMinAngleRef.current));

    // eslint-disable-next-line no-console
    console.log(`[TARGET] ${targetIndex + 1}/${SESSION_TARGET_COUNT} HIT`);
    setHits((v) => v + 1); telemetry.recordRep(true);
    audio.playSuccess();

    // Every completed target — hit or miss — writes exactly one repData
    // entry here, so a session always ends with exactly
    // SESSION_TARGET_COUNT records, never more, never fewer.
    setRepData((prev) => [...prev, {
      rep: targetIndex + 1,
      direction: target.directionLabel,
      result: "hit",
      romDegrees: attemptRom,
      responseTimeSeconds: Math.round(responseSeconds * 100) / 100,
      success: true,
    }]);

    setParticleBurst({ active: true, x: target.x, y: target.y, colorHex: target.color.hex });
    if (particleTimerRef.current) clearTimeout(particleTimerRef.current);
    particleTimerRef.current = setTimeout(() => setParticleBurst((p) => ({ ...p, active: false })), 600);

    advanceTarget();
  }, [target, telemetry, audio, advanceTarget, targetIndex]);

  // Proximity between the DRAWN cursor and the target, in the same live
  // board-pixel coordinate system used for hit detection below. Drives
  // cursor glow only; it never moves the cursor toward the target.
  const proximityRatio = useMemo(() => {
    const rect = arenaRectRef.current;
    if (!rect.width || !rect.height) return 1;
    const cursorPx = wristToBoardPx(smoothPosition.x / 100, smoothPosition.y / 100);
    const targetPx = { x: (target.x / 100) * rect.width, y: (target.y / 100) * rect.height };
    const dist = Math.hypot(cursorPx.x - targetPx.x, cursorPx.y - targetPx.y);
    const maxDist = Math.hypot(rect.width, rect.height) * 0.5;
    return Math.min(1, dist / maxDist);
  }, [smoothPosition.x, smoothPosition.y, target.x, target.y, wristToBoardPx]);

  // Core reach-and-hold loop. Hit testing uses the SAME smoothed position
  // that is drawn, converted through the LIVE board rectangle, so what the
  // patient sees is exactly what is tested. ROM refs are updated from the
  // SAME live shoulderAngle that drives the HUD readout, and are updated
  // BEFORE the hit/miss branches so a resolving frame always sees the
  // current rep's true min/max.
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    if (!arenaRectRef.current.width || !arenaRectRef.current.height) return;
    if (status !== "tracking") return;
    if (targetIndex >= SESSION_TARGET_COUNT) return;
    // Once this target has already been resolved (hit or miss), ignore
    // any further detection frames for it — the target-index update and
    // the reset effect that clears this flag haven't necessarily landed
    // yet, so without this guard a second frame can slip through and
    // resolve the SAME target a second time.
    if (targetResolvedRef.current) return;

    telemetry.trackAngle(shoulderAngle);
    telemetry.trackMovement({ x: position.x, y: position.y });

    setMaxAngle((v) => Math.max(v, shoulderAngle));
    setMinAngle((v) => {
      if (v === null && shoulderAngle > 0) return shoulderAngle;
      if (shoulderAngle > 0 && shoulderAngle < v) return shoulderAngle;
      return v;
    });

    // Per-rep ROM tracking — OUTSIDE any hit/miss branch. Refs are written
    // synchronously every tracked frame from the live shoulderAngle, so by
    // the time registerHit()/registerMiss() runs later in this same effect
    // execution (same animation frame), these values are already current.
    // This is what makes each rep record its ACTUAL maximum ROM instead of
    // a stale 0 or the previous rep's leftover value.
    if (shoulderAngle > 0) {
      if (attemptMinAngleRef.current === null || shoulderAngle < attemptMinAngleRef.current) {
        attemptMinAngleRef.current = shoulderAngle;
      }
      if (shoulderAngle > attemptMaxAngleRef.current) {
        attemptMaxAngleRef.current = shoulderAngle;
      }
    }

    // Hit test in board pixels, using the DRAWN (smoothed) cursor and the
    // LIVE board rectangle. wristToBoardPx expects normalized 0..1, and
    // smoothPosition is 0..100, so divide by 100 at the call site.
    const rect = arenaRectRef.current;
    const cursorPx = wristToBoardPx(smoothPosition.x / 100, smoothPosition.y / 100);
    const targetPx = { x: (target.x / 100) * rect.width, y: (target.y / 100) * rect.height };
    const dist = Math.hypot(cursorPx.x - targetPx.x, cursorPx.y - targetPx.y);
    const inZone = dist <= targetSizePx / 2;

    if (inZone) {
      zoneExitTimeRef.current = null;
      if (holdStartRef.current === null) holdStartRef.current = performance.now();
      const elapsed = performance.now() - holdStartRef.current;
      setIsHolding(true);
      setHoldProgress(Math.min(1, elapsed / holdDurationMs));
      if (elapsed >= holdDurationMs) registerHit();
    } else if (holdStartRef.current !== null) {
      // Debounced miss: don't fail the attempt on the very first frame
      // the cursor drifts outside the zone (tracking jitter near the
      // edge) — only once it has stayed outside continuously for
      // ZONE_EXIT_GRACE_MS do we count it as a real miss. This is what
      // was producing the false/unexpected red X while the cursor was
      // still effectively on the target.
      if (zoneExitTimeRef.current === null) {
        zoneExitTimeRef.current = performance.now();
      } else if (performance.now() - zoneExitTimeRef.current >= ZONE_EXIT_GRACE_MS) {
        holdStartRef.current = null;
        zoneExitTimeRef.current = null;
        setIsHolding(false);
        setHoldProgress(0);
        registerMiss();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gameState, isPaused, status,
    position.x, position.y,
    smoothPosition.x, smoothPosition.y,
    target, targetSizePx, holdDurationMs, shoulderAngle,
    targetIndex, wristToBoardPx,
  ]);

  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    const timer = setInterval(() => {
      adapt({ accuracy, papsScore: painScore, combo: hits, maxFlexionAngle: maxAngle });
    }, ADAPT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [gameState, isPaused, adapt, accuracy, painScore, hits, maxAngle]);

  useEffect(() => {
    if (!isPainDetected || gameState !== GAME_STATES.ACTIVE) return;
    pauseSession();
    telemetry.trackPain(painScore);
  }, [isPainDetected, gameState, pauseSession, telemetry, painScore]);

  useEffect(
    () => () => {
      if (missFlashTimerRef.current) clearTimeout(missFlashTimerRef.current);
      if (particleTimerRef.current) clearTimeout(particleTimerRef.current);
      if (diffToastTimerRef.current) clearTimeout(diffToastTimerRef.current);
    },
    []
  );

  const finalizeTelemetry = useCallback(() => {
    if (hasEndedRef.current) return;

    hasEndedRef.current = true;

    const finalRepData = [...repData];

    const finalAccuracy =
      finalRepData.length > 0
        ? Math.round(
          (finalRepData.filter((r) => r.success).length /
            finalRepData.length) *
          100
        )
        : 0;

    const finalRomValues = finalRepData
      .map((r) => r.romDegrees)
      .filter(
        (v) =>
          typeof v === "number" &&
          Number.isFinite(v)
      );

    const finalAverageRom =
      finalRomValues.length > 0
        ? Math.round(
          finalRomValues.reduce((a, b) => a + b, 0) /
          finalRomValues.length
        )
        : 0;

    const finalMaxRom =
      finalRomValues.length > 0
        ? Math.max(...finalRomValues)
        : 0;

    const finalResponseValues = finalRepData
      .map((r) => r.responseTimeSeconds)
      .filter(
        (v) =>
          typeof v === "number" &&
          Number.isFinite(v)
      );

    const finalAvgResponse =
      finalResponseValues.length > 0
        ? finalResponseValues.reduce(
          (a, b) => a + b,
          0
        ) / finalResponseValues.length
        : 0;

    const finalBestStreak = finalRepData.reduce(
      (acc, r) => {
        if (r.success) {
          acc.current += 1;
          acc.best = Math.max(
            acc.best,
            acc.current
          );
        } else {
          acc.current = 0;
        }

        return acc;
      },
      { current: 0, best: 0 }
    ).best;

    const finalPaps = computePaps({
      accuracy: finalAccuracy,
      reps: finalRepData,
      difficulty: currentDifficulty,
      painDetected:
        painDetectedDuringSessionRef.current,
    });

    const finalDurationSeconds =
      sessionStartTimeRef.current
        ? Math.max(
          0,
          Math.round(
            (Date.now() -
              sessionStartTimeRef.current) /
            1000
          )
        )
        : 0;

    const finalGameSpecific = {
      paps: finalPaps,
      rawAccuracy: finalAccuracy,

      avgResponseTimeSeconds:
        Math.round(finalAvgResponse * 100) / 100,

      totalReps: finalRepData.length,

      hits: finalRepData.filter(
        (r) => r.success
      ).length,

      misses: finalRepData.filter(
        (r) => !r.success
      ).length,

      bestCombo: finalBestStreak,
      longestHitStreak: finalBestStreak,

      difficulty: currentDifficulty,

      painAdjusted:
        painDetectedDuringSessionRef.current,

      romDegrees: finalAverageRom,
      maxRomDegrees: finalMaxRom,

      romPerRep: finalRepData.map((r) => ({
        rep: r.rep,
        direction: r.direction,
        result: r.result,
        romDegrees:
          typeof r.romDegrees === "number" &&
            Number.isFinite(r.romDegrees)
            ? r.romDegrees
            : null,
        responseTimeSeconds:
          typeof r.responseTimeSeconds === "number" &&
            Number.isFinite(r.responseTimeSeconds)
            ? r.responseTimeSeconds
            : null,
      })),

      repData: finalRepData,
    };

    const finalExerciseResult = {
      exerciseId: gameId,
      name: "Precision Reach",
      setsCompleted: 1,
      repsCompleted: finalRepData.length,
      averageRom: finalAverageRom,
      maxRom: finalMaxRom,
      accuracy: finalAccuracy,
      score: finalAccuracy,
    };

    telemetry.endSession({
      gameName: "Precision Reach",

      score: finalAccuracy,
      accuracy: finalAccuracy,

      hits: finalGameSpecific.hits,
      misses: finalGameSpecific.misses,

      // Precision Reach has no leveling concept -- there is nothing
      // here that increments a level. `level: 1` was a hardcoded
      // placeholder masquerading as a measured value; omit the field
      // entirely so the backend's null-safety treats it as genuinely
      // not tracked, exactly like smoothness/stability were fixed
      // earlier in this session.
      combo: finalBestStreak,
      maxCombo: finalBestStreak,

      stars:
        finalAccuracy >= 90
          ? 3
          : finalAccuracy >= 70
            ? 2
            : finalAccuracy >= 50
              ? 1
              : 0,

      difficulty: currentDifficulty,

      paps: finalPaps,

      durationSeconds: finalDurationSeconds,

      romData: {
        averageRomDegrees: finalAverageRom,
        maxRomDegrees: finalMaxRom,
        minRomDegrees:
          finalRepData.length > 0
            ? Math.min(
              ...finalRepData
                .map((r) => r.romDegrees)
                .filter(
                  (v) =>
                    typeof v === "number" &&
                    Number.isFinite(v)
                )
            )
            : 0,

        perRep: finalRepData.map((r) => ({
          rep: r.rep,
          romDegrees:
            typeof r.romDegrees === "number" &&
              Number.isFinite(r.romDegrees)
              ? r.romDegrees
              : null,
          success: r.success === true,
        })),
      },

      reps: finalRepData.length,

      hitsOrCatchesOrCompletions:
        finalGameSpecific.hits,

      missesOrDrops:
        finalGameSpecific.misses,

      // Precision Reach does not independently measure movement
      // smoothness or postural stability -- it only tracks accuracy,
      // ROM, response time, and rep-to-rep consistency (all folded into
      // PAPS, a composite performance score, not a smoothness/stability
      // reading). Previously this duplicated PAPS into both fields,
      // which misrepresented one performance number as two distinct
      // clinical measurements. null = "not measured by this game";
      // PAPS itself is unchanged and still reported separately via
      // gameSpecific.paps.
      smoothness: null,
      stability: null,

      exerciseResults: [
        finalExerciseResult,
      ],

      repData: finalRepData,

      painFluctuations:
        telemetry.metrics.painFluctuations,

      gameSpecific: finalGameSpecific,
    });
  }, [
    telemetry,
    gameId,
    currentDifficulty,
    repData,
  ]);

  // Cursor is ALWAYS white — proximity no longer changes its hue, only
  // its glow intensity, so it stays visually distinct from every
  // colored target.
  const cursorGlow = useMemo(() => {
    if (isHolding) return "0 0 22px 8px rgba(255,255,255,0.85)";
    if (proximityRatio < 0.15) return "0 0 18px 6px rgba(255,255,255,0.7)";
    return "0 0 12px 4px rgba(255,255,255,0.45)";
  }, [isHolding, proximityRatio]);

  const ringRadius = targetSizePx / 2 + 12;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringSvgSize = (ringRadius + 8) * 2;

  // ─── INSTRUCTIONS SCREEN ──────────────────────────────────────────────────
  if (gameState === GAME_STATES.INSTRUCTIONS) {
    return (
      <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-[#060d1a] text-white">
        <style>{`
          @keyframes pulse-ring { 0%,100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.18); opacity: 1; } }
          @keyframes float-hero { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
          @keyframes shimmer-border {
            0%   { box-shadow: 0 0 0 0 rgba(34,211,238,0.0), inset 0 0 24px rgba(34,211,238,0.05); }
            50%  { box-shadow: 0 0 32px 4px rgba(34,211,238,0.25), inset 0 0 40px rgba(34,211,238,0.08); }
            100% { box-shadow: 0 0 0 0 rgba(34,211,238,0.0), inset 0 0 24px rgba(34,211,238,0.05); }
          }
          @keyframes particleBurst {
            0%   { opacity: 1; transform: translate(-50%,-50%) rotate(var(--angle)) translateX(0); }
            100% { opacity: 0; transform: translate(-50%,-50%) rotate(var(--angle)) translateX(var(--dist)); }
          }
        `}</style>

        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="relative mb-5" style={{ animation: "float-hero 3s ease-in-out infinite" }}>
              <div className="absolute inset-0 rounded-full blur-2xl" style={{ background: "rgba(34,211,238,0.25)", animation: "pulse-ring 2.5s ease-in-out infinite" }} />
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-cyan-400/60 bg-gradient-to-br from-cyan-900/60 to-slate-900">
                <span className="text-5xl">🎯</span>
              </div>
            </div>
            <h1 className="mb-2 text-4xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">Precision Reach</span>
            </h1>
            <p className="max-w-lg text-slate-400">
              Move your WHITE wrist dot into each colored target and hold steady until it locks in.
              Five targets, five directions — testing your reach in every direction.
            </p>
          </div>

          <div className="mb-8 grid grid-cols-3 gap-4">
            {[
              { icon: "✋", step: "1 · Move", desc: "Guide your white wrist dot to the colored target using real arm motion." },
              { icon: "⏱", step: "2 · Hold", desc: "Keep your hand steady inside the target until the ring fills completely." },
              { icon: "🏆", step: "3 · Repeat ×5", desc: "Five targets total, one direction at a time. Accuracy and PAPS tracked throughout." },
            ].map(({ icon, step, desc }) => (
              <div key={step} className="flex flex-col items-center gap-3 rounded-2xl border border-cyan-500/20 bg-slate-900/60 p-5 text-center backdrop-blur">
                <span className="text-4xl">{icon}</span>
                <div className="text-sm font-bold text-cyan-300">{step}</div>
                <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mb-8 grid grid-cols-2 gap-6">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Camera Preview & Skeleton</p>
              <div className="relative overflow-hidden rounded-2xl border-2 aspect-video" style={{ animation: "shimmer-border 3s ease-in-out infinite", borderColor: "rgba(34,211,238,0.4)" }}>
                <video ref={videoRef} autoPlay playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
                <SkeletonOverlay poseData={poseData} overallStatus={guidance.overallStatus} shoulderAngle={shoulderAngle} />
                <div className="absolute left-3 bottom-3">
                  {hasTrackedOnce ? (
                    <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/50 px-3 py-1 text-xs font-semibold text-emerald-300">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#4ade80]" />
                      Hand detected · {Math.round(shoulderAngle)}°
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-500/50 px-3 py-1 text-xs font-semibold text-amber-300">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Hand not detected
                    </div>
                  )}
                </div>
              </div>
              <div className={`mt-3 rounded-xl border p-3 text-xs ${guidance.overallStatus === "ok" ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300" : "border-amber-800/60 bg-amber-950/30 text-amber-300"}`}>
                {guidance.message}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">The 5 Targets</p>
              <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 overflow-hidden text-sm">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700/60">
                      <th className="py-3 pl-4 text-left text-xs text-slate-500 font-semibold">#</th>
                      <th className="py-3 text-left text-xs text-slate-500 font-semibold">Direction</th>
                      <th className="py-3 pr-4 text-center text-xs text-slate-500 font-semibold">Color</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TARGET_DIRECTIONS.map((dir, i) => (
                      <tr key={dir.label} className="border-b border-slate-800/60 last:border-0">
                        <td className="py-3 pl-4 font-bold text-slate-300">{i + 1}</td>
                        <td className="py-3 text-slate-300">{dir.label}</td>
                        <td className="py-3 pr-4 text-center">
                          <span className="inline-block h-4 w-4 rounded-full" style={{ background: TARGET_COLORS[i].hex, boxShadow: `0 0 8px ${TARGET_COLORS[i].hex}` }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 rounded-xl border border-slate-700/40 bg-slate-900/40 p-3 text-xs text-slate-400 leading-relaxed">
                <span className="font-semibold text-violet-300">PAPS</span> — Pain-Adjusted Performance Score.
                If discomfort is detected, the session pauses and your final score is adjusted to 80% of raw accuracy.
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => {
                sessionStartTimeRef.current = Date.now();
                telemetry.startTracking();
                startSession();
              }}
              disabled={!hasTrackedOnce || !isActive}
              className="relative overflow-hidden rounded-2xl px-12 py-4 font-black text-lg tracking-wide transition-all disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              style={hasTrackedOnce && isActive ? { background: "linear-gradient(135deg, #06b6d4, #7c3aed)", boxShadow: "0 0 32px rgba(34,211,238,0.4)" } : {}}
            >
              {hasTrackedOnce && isActive ? "▶ Start Session" : "Waiting for hand detection…"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── SESSION COMPLETE ─────────────────────────────────────────────────────
  if (gameState === GAME_STATES.COMPLETE) {
    const sessionData = {
      sessionId: telemetry.sessionId,
      gameId,
      patientId,
      date: new Date().toISOString(),
      durationSeconds: sessionStartTimeRef.current
        ? Math.max(0, Math.round((Date.now() - sessionStartTimeRef.current) / 1000))
        : null,
      score,
      accuracyPercent: accuracy,
      romData: {
        averageRomDegrees,
        maxRomDegrees,
        perRep: repData.map((r) => ({ rep: r.rep, romDegrees: typeof r.romDegrees === "number" ? r.romDegrees : null, success: r.success !== false })),
      },
      reps: repData.length,
      hitsOrCatchesOrCompletions: hits,
      missesOrDrops: misses,
      gameSpecificMetrics: {
        paps,
        rawAccuracy: accuracy,
        avgResponseTimeSeconds: Math.round(avgResponseSeconds * 100) / 100,
        totalReps: repData.length,
        hits,
        misses,
        bestCombo: bestStreak,
        difficulty: currentDifficulty,
        painAdjusted: painDetectedDuringSessionRef.current,
        romDegrees: averageRomDegrees,
        maxRomDegrees,
        romPerRep: repData.map((r) => ({
          rep: r.rep,
          romDegrees:
            typeof r.romDegrees === "number" && Number.isFinite(r.romDegrees)
              ? r.romDegrees
              : null,
        })),
      },
    };

    return (
      <>
        <style>{`
          @keyframes particleBurst {
            0%   { opacity: 1; transform: translate(-50%,-50%) rotate(var(--angle)) translateX(0); }
            100% { opacity: 0; transform: translate(-50%,-50%) rotate(var(--angle)) translateX(var(--dist)); }
          }
        `}</style>
        <SessionSummary
          sessionData={sessionData}
          gameName="Precision Reach"
          gameId={gameId}
          patientId={patientId}
          onSaveReport={async () => telemetry.saveReport(sessionData)}
          onFinish={() => onSessionEnd?.(sessionData)}
        />
      </>
    );
  }

  // ─── ACTIVE GAME ──────────────────────────────────────────────────────────
  const diffColors = DIFFICULTY_COLOR[currentDifficulty] || DIFFICULTY_COLOR.Beginner;
  const displayedTargetNumber = Math.min(targetIndex + 1, SESSION_TARGET_COUNT);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#060d1a] text-white overflow-hidden">
      <style>{`
        @keyframes pulse-ring { 0%,100% { transform: scale(1) translate(-50%,-50%); opacity: 0.5; } 50% { transform: scale(1.22) translate(-50%,-50%); opacity: 0.9; } }
        @keyframes particleBurst {
          0%   { opacity: 1; transform: translate(-50%,-50%) rotate(var(--angle)) translateX(0); }
          100% { opacity: 0; transform: translate(-50%,-50%) rotate(var(--angle)) translateX(var(--dist)); }
        }
        @keyframes holdRingPulse { 0%,100%{ opacity:0.6; } 50%{ opacity:1; } }
        @keyframes lockOnPulse { 0%,100% { box-shadow: 0 0 18px 6px rgba(255,255,255,0.35); } 50% { box-shadow: 0 0 34px 12px rgba(255,255,255,0.55); } }
        @keyframes targetFloat { 0%,100% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-50%,-50%) scale(1.04); } }
        @keyframes gridPulse { 0%,100% { opacity: 0.03; } 50% { opacity: 0.06; } }
      `}</style>

      {isPainDetected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur">
          <div className="max-w-md w-full rounded-2xl border border-rose-700/60 bg-slate-900 p-8 text-center shadow-[0_0_48px_rgba(244,63,94,0.3)]">
            <div className="mb-3 text-5xl">😣</div>
            <h2 className="mb-2 text-xl font-bold text-rose-400">Discomfort Detected</h2>
            <p className="mb-6 text-slate-300 text-sm">Take a rest. Your session is paused. PAPS score has been adjusted.</p>
            <button
              onClick={() => { resetPainState(); resumeSession(); }}
              className="rounded-xl bg-cyan-500 px-8 py-3 font-bold hover:bg-cyan-400 transition-colors"
            >
              I'm OK – Resume
            </button>
          </div>
        </div>
      )}

      {/* ── Pill-based HUD top bar ─────────────────────────────────────── */}
      <div className="flex-shrink-0 z-40 flex flex-wrap items-center justify-between gap-y-2 border-b border-slate-800/80 bg-slate-950/90 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Pill
            label="Target"
            value={`${displayedTargetNumber} / ${SESSION_TARGET_COUNT}`}
            colorClass="text-cyan-300"
            icon="🎯"
          />
          <Pill label="Time" value={`${timeLeft}s`} colorClass={timeLeft <= 15 ? "text-rose-400" : "text-white"} icon="⏱" />
          <Pill label="ROM" value={`${Math.round(shoulderAngle)}°`} colorClass="text-violet-300" icon="📐" />
          <Pill label="Hits" value={hits} colorClass="text-emerald-400" icon="✓" />
          <Pill label="Miss" value={misses} colorClass="text-rose-400" icon="✕" />
          <Pill label="Acc" value={`${accuracy}%`} colorClass={accuracy >= 70 ? "text-emerald-400" : "text-amber-400"} icon="📊" />
          <PapsPill paps={paps} />
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-mono font-semibold border ${diffColors.bg} ${diffColors.border}`}>
            <span className={diffColors.text}>{currentDifficulty}</span>
          </div>
          {status === "tracking" ? (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-400">
              <Wifi size={11} /> Tracking
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-400 animate-pulse">
              <WifiOff size={11} /> {status === "lost" ? "Lost" : "No hand"}
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => (isPaused ? resumeSession() : pauseSession())} className="rounded-lg bg-slate-800 p-2 hover:bg-slate-700 transition-colors">
            {isPaused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button onClick={endSession} className="rounded-lg bg-rose-950/80 p-2 text-rose-300 hover:bg-rose-900 transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Game area ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 px-4 py-3">
        <div
          ref={arenaRef}
          className="relative w-full h-full overflow-hidden rounded-2xl border-2 border-slate-700/40"
          style={{ background: "radial-gradient(ellipse 70% 70% at 50% 50%, rgba(6,20,50,0.9) 0%, rgba(6,13,26,1) 100%)" }}
        >
          <div
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              backgroundImage: "linear-gradient(rgba(34,211,238,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.06) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              animation: "gridPulse 4s ease-in-out infinite",
            }}
          />

          <DifficultyToast message={diffToast.message} visible={diffToast.visible} />

          {/* Countdown — centered on the ARENA, not the browser viewport. */}
          {gameState === GAME_STATES.COUNTDOWN && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
              <div className="text-center">
                <span
                  className="block text-9xl font-black bg-gradient-to-b from-cyan-300 to-cyan-600 bg-clip-text text-transparent"
                  style={{ filter: "drop-shadow(0 0 24px rgba(34,211,238,0.8))" }}
                >
                  {countdown || "GO!"}
                </span>
              </div>
            </div>
          )}

          {isPaused && !isPainDetected && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="text-center">
                <div className="text-5xl font-black text-slate-300 mb-2">⏸ Paused</div>
                <p className="text-slate-500 text-sm">Press play to continue</p>
              </div>
            </div>
          )}

          {/* Home position marker */}
          <div
            className="absolute rounded-full border border-dashed border-slate-600/50 pointer-events-none"
            style={{ left: `${HOME_POSITION.x}%`, top: `${HOME_POSITION.y}%`, width: `${arenaMinSide * 0.08}px`, height: `${arenaMinSide * 0.08}px`, transform: "translate(-50%, -50%)" }}
          />
          <div
            className="absolute rounded-full bg-slate-600/40 pointer-events-none"
            style={{ left: `${HOME_POSITION.x}%`, top: `${HOME_POSITION.y}%`, width: 8, height: 8, transform: "translate(-50%, -50%)" }}
          />

          {/* ── Colored target orb ───────────────────────────────────── */}
          {!showMissFlash && targetIndex < SESSION_TARGET_COUNT && (
            <>
              {!isHolding && (
                <div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    left: `${target.x}%`,
                    top: `${target.y}%`,
                    width: `${targetSizePx * 1.45}px`,
                    height: `${targetSizePx * 1.45}px`,
                    background: `radial-gradient(circle, rgba(${target.color.rgb},0.18) 0%, transparent 70%)`,
                    transform: "translate(-50%, -50%)",
                    animation: "pulse-ring 2s ease-in-out infinite",
                  }}
                />
              )}

              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  left: `${target.x}%`,
                  top: `${target.y}%`,
                  width: `${targetSizePx}px`,
                  height: `${targetSizePx}px`,
                  transform: "translate(-50%, -50%)",
                  background: isHolding
                    ? `radial-gradient(circle, rgba(${target.color.rgb},0.5) 0%, rgba(${target.color.rgb},0.12) 70%)`
                    : `radial-gradient(circle, rgba(${target.color.rgb},0.35) 0%, rgba(${target.color.rgb},0.1) 70%)`,
                  border: `2px solid rgba(${target.color.rgb},${isHolding ? 1 : 0.7})`,
                  boxShadow: isHolding
                    ? `0 0 30px 10px rgba(${target.color.rgb},0.6), inset 0 0 18px rgba(${target.color.rgb},0.3)`
                    : `0 0 16px 5px rgba(${target.color.rgb},0.35)`,
                  animation: isHolding ? "lockOnPulse 0.8s ease-in-out infinite" : "targetFloat 3s ease-in-out infinite",
                }}
              />

              {isHolding && arenaSize.width > 0 && (
                <svg
                  className="absolute pointer-events-none"
                  style={{
                    left: `${target.x}%`,
                    top: `${target.y}%`,
                    width: `${ringSvgSize}px`,
                    height: `${ringSvgSize}px`,
                    transform: "translate(-50%, -50%) rotate(-90deg)",
                    filter: `drop-shadow(0 0 6px rgba(${target.color.rgb},0.7))`,
                  }}
                  viewBox={`0 0 ${ringSvgSize} ${ringSvgSize}`}
                >
                  <circle cx={ringSvgSize / 2} cy={ringSvgSize / 2} r={ringRadius} fill="none" stroke={`rgba(${target.color.rgb},0.15)`} strokeWidth="5" />
                  <circle
                    cx={ringSvgSize / 2}
                    cy={ringSvgSize / 2}
                    r={ringRadius}
                    fill="none"
                    stroke={holdProgress > 0.85 ? "#4ade80" : target.color.hex}
                    strokeWidth="5"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringCircumference * (1 - holdProgress)}
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </>
          )}

          {/* Miss flash */}
          {showMissFlash && (
            <div
              className="absolute rounded-full flex items-center justify-center pointer-events-none"
              style={{
                left: `${missFlashPos.x}%`,
                top: `${missFlashPos.y}%`,
                width: `${targetSizePx}px`,
                height: `${targetSizePx}px`,
                transform: "translate(-50%, -50%)",
                border: "2px solid rgba(244,63,94,0.9)",
                background: "radial-gradient(circle, rgba(244,63,94,0.3) 0%, transparent 70%)",
                boxShadow: "0 0 24px 8px rgba(244,63,94,0.45)",
              }}
            >
              <span style={{ fontSize: Math.max(16, targetSizePx * 0.45), color: "#f43f5e", fontWeight: 900, lineHeight: 1 }}>✕</span>
            </div>
          )}

          <ParticleBurst x={particleBurst.x} y={particleBurst.y} active={particleBurst.active} colorHex={particleBurst.colorHex} />

          {/* ── WHITE wrist cursor — color never changes ────────────── */}
          {hasTrackedOnce ? (
            <div
              className="absolute pointer-events-none"
              style={{ left: `${smoothPosition.x}%`, top: `${smoothPosition.y}%`, transform: "translate(-50%, -50%)" }}
            >
              <div
                className="absolute rounded-full"
                style={{ width: 28, height: 28, top: "50%", left: "50%", transform: "translate(-50%, -50%)", border: "2px solid #ffffff", opacity: 0.6, boxShadow: cursorGlow }}
              />
              <div
                className="relative rounded-full"
                style={{ width: 12, height: 12, margin: "auto", background: "#ffffff", boxShadow: cursorGlow }}
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="rounded-xl bg-black/70 px-4 py-2 text-sm text-amber-300 border border-amber-500/30 backdrop-blur">
                Move your hand into the camera to begin tracking
              </div>
            </div>
          )}

          {/* Arena status overlay */}
          <div className="absolute left-4 bottom-4 rounded-lg bg-black/60 px-3 py-2 font-mono text-xs space-y-0.5 backdrop-blur pointer-events-none">
            {isHolding && <div style={{ color: target.color.hex }} className="font-bold">Locking… {Math.round(holdProgress * 100)}%</div>}
            <div className="text-slate-500">Avg response: {avgResponseSeconds.toFixed(1)}s</div>
          </div>

          {/* Webcam overlay */}
          <div
            className="absolute top-4 right-4 z-20 overflow-hidden rounded-xl border-2 border-cyan-500/40 bg-black/60 shadow-[0_0_20px_rgba(34,211,238,0.25)] backdrop-blur"
            style={{ width: "clamp(200px, 24vw, 300px)", aspectRatio: "4 / 3" }}
          >
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
            <SkeletonOverlay poseData={poseData} overallStatus={guidance.overallStatus} shoulderAngle={shoulderAngle} />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 px-2 py-1">
              <span className="font-mono text-[10px] text-slate-200">{Math.round(shoulderAngle)}° · {activeSide || "—"}</span>
              {status === "tracking" ? <Wifi size={10} className="text-emerald-400" /> : <WifiOff size={10} className="text-amber-400" />}
            </div>
            {isPainDetected && (
              <div className="absolute top-1 left-1 rounded bg-rose-900/80 px-1.5 py-0.5 text-[9px] font-semibold text-rose-300 border border-rose-700">Pain</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}