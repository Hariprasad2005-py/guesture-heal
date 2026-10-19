import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bug,
  Pause,
  Play,
  LogOut,
  Activity,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

import useMediaPipeUpperBody from "../hooks/useMediaPipeUpperBody";
import useHandTracking from "../hooks/useHandTracking";
import usePoseDetection from "../hooks/usePoseDetection";
import usePostureGuidance from "../hooks/usePostureGuidance";
import useFacialPainDetection from "../hooks/useFacialPainDetection";
import useComfortEase from "../hooks/useComfortEase";
import { useGameEngine, GAME_STATES } from "../hooks/useGameEngine";
import { useSessionTelemetry } from "../hooks/useSessionTelemetry";
import { useAudioFeedback } from "../hooks/useAudioFeedback";
import { healthApi } from "../utils/apiService";
import SkeletonOverlay from "../components/rehab/SkeletonOverlay";
import SessionSummary from "../components/rehab/SessionSummary";
import SessionCheckpoint from "../components/rehab/SessionCheckpoint";
import HowToPlay from "../components/rehab/HowToPlay";
import { createCloudReachGame } from "./cloudReachScene";
import { OneEuro } from "../utils/oneEuro";
import MetricsEngine from "../utils/metricsEngine";
import ROMDisplay from "../components/rehab/ROMDisplay";
import PainScoreIndicator from "../components/rehab/PainScoreIndicator";
import SessionProgress from "../components/rehab/SessionProgress";

// ==================================================================
// THERAPIST-CONFIGURABLE SETTINGS
// ==================================================================
const DEFAULT_ROM_CONFIG = {
  minHeightPercent: 14,
  maxHeightPercent: 76,
  leftBoundaryPercent: 8,
  rightBoundaryPercent: 84,
  neutralZoneRadiusPercent: 7,
  neutralX: 50,
  neutralY: 68,
};

const DEFAULT_SESSION_CONFIG = { mainSeconds: 180, targetReps: 15 };

// Fixed exercise identity — the multi-mode system has been removed; this
// game always plays a single "standard reach" pattern.
const EXERCISE_MODE_ID = "standard";

// ==================================================================
// REACH ZONES
// ==================================================================
const REACH_ZONES = [
  { id: "center", label: "Forward Reach", xFrac: 0.5, yFrac: 0.55 },
  { id: "upper-center", label: "Upward Reach", xFrac: 0.5, yFrac: 0.15 },
  { id: "upper-left", label: "Upper-Left Reach", xFrac: 0.22, yFrac: 0.2 },
  { id: "upper-right", label: "Upper-Right Reach", xFrac: 0.78, yFrac: 0.2 },
  { id: "left", label: "Left Reach", xFrac: 0.1, yFrac: 0.55 },
  { id: "right", label: "Right Reach", xFrac: 0.9, yFrac: 0.55 },
  { id: "lower-left", label: "Lower-Left Reach", xFrac: 0.2, yFrac: 0.8 },
  { id: "lower-right", label: "Lower-Right Reach", xFrac: 0.8, yFrac: 0.8 },
  { id: "top-center", label: "High Reach", xFrac: 0.5, yFrac: 0.05 },
  { id: "bottom-center", label: "Low Reach", xFrac: 0.5, yFrac: 0.9 },
];

// ==================================================================
// DIFFICULTY SETTINGS — progressive challenge
// ==================================================================
const DIFFICULTY_SETTINGS = {
  Beginner: {
    cloudSize: 90,
    dwellMs: 400,
    zonePool: ["center", "upper-center", "left", "right"],
    label: "Level 1",
  },
  Intermediate: {
    cloudSize: 74,
    dwellMs: 450,
    zonePool: ["center", "upper-center", "upper-left", "upper-right", "left", "right"],
    label: "Level 2",
  },
  Advanced: {
    cloudSize: 60,
    dwellMs: 500,
    zonePool: REACH_ZONES.map((z) => z.id),
    label: "Level 3",
  },
};

// Five levels. The patient moves up after 3 reaches in a row and down after
// 2 misses in a row. Each level also changes the backdrop (see THEMES).
const LEVELS = [
  { key: "L1", name: "Level 1", arc: 0.6, cloudSize: 100, dwellMs: 400, lifetimeMs: 12000, zonePool: ["center", "upper-center", "left", "right"] },
  { key: "L2", name: "Level 2", arc: 0.75, cloudSize: 86, dwellMs: 450, lifetimeMs: 11000, zonePool: ["center", "upper-center", "upper-left", "upper-right", "left", "right"] },
  { key: "L3", name: "Level 3", arc: 0.9, cloudSize: 74, dwellMs: 500, lifetimeMs: 10000, zonePool: ["center", "upper-center", "upper-left", "upper-right", "left", "right", "lower-left", "lower-right"] },
  { key: "L4", name: "Level 4", arc: 1.0, cloudSize: 62, dwellMs: 600, lifetimeMs: 9000, zonePool: "ALL" },
  { key: "L5", name: "Level 5", arc: 1.1, cloudSize: 52, dwellMs: 700, lifetimeMs: 8000, zonePool: "ALL" },
];
const CONTINUE_EXTRA_REPS = 5;
const CONTINUE_EXTRA_SECONDS = 60;
const MAX_EXTENSIONS = 2;
const TARGET_HIT_RADIUS_PERCENT = 9;
const CLOUD_LIFETIME_SECONDS = 11;
const REST_INTERVAL_MS = 1500;
const MIN_REACH_MOVEMENT = 4;
const MAX_SAFE_SPEED = 55;
const TRAIL_SAMPLE_MS = 90;
const STABLE_START_MS = 700;
const MIN_FORWARD_REACH_DEPTH = 0.04; // normalized MediaPipe z-units; wrist forward of shoulder plane

const ENCOURAGEMENT = [
  "Great reach.",
  "Excellent, nice and controlled.",
  "Great movement.",
  "Nice and smooth.",
  "Well done.",
  "Good form.",
  "Keep going.",
  "Excellent control.",
];
const SLOW_DOWN_MESSAGE = "Try moving a little slower.";
const NO_HAND_MESSAGE = "Show your hand to the camera";
const REACH_PROMPT = "Reach toward the highlighted target and hold your position.";

const DEBUG = false;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function average(values) {
  const valid = (values || []).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (valid.length === 0) return 0;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function stdDev(values) {
  const valid = (values || []).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (valid.length < 2) return 0;
  const mean = average(valid);
  const variance = valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length;
  return Math.sqrt(variance);
}

function directionFromVector(dx, dy) {
  if (Math.hypot(dx, dy) < 0.5) return "none";
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const a = (angle + 360) % 360;
  if (a >= 337.5 || a < 22.5) return "right";
  if (a < 67.5) return "upper-right";
  if (a < 112.5) return "up";
  if (a < 157.5) return "upper-left";
  if (a < 202.5) return "left";
  if (a < 247.5) return "lower-left";
  if (a < 292.5) return "down";
  return "lower-right";
}

// Minimum distance, in percent, that any element's visible edge must stay
// from the game area's boundary — applied consistently to clouds and the
// neutral-zone ring so nothing ever clips on any screen size, regardless
// of how tall/short the header ends up being on that device.
const EDGE_SAFE_MARGIN_PERCENT = 6;

function zoneToPosition(zone, rom) {
  const height = rom.maxHeightPercent - rom.minHeightPercent;
  const width = rom.rightBoundaryPercent - rom.leftBoundaryPercent;
  const safeLeft = Math.max(rom.leftBoundaryPercent, EDGE_SAFE_MARGIN_PERCENT);
  const safeRight = Math.min(rom.rightBoundaryPercent, 100 - EDGE_SAFE_MARGIN_PERCENT);
  const safeTop = Math.max(rom.minHeightPercent, EDGE_SAFE_MARGIN_PERCENT);
  const safeBottom = Math.min(rom.maxHeightPercent, 100 - EDGE_SAFE_MARGIN_PERCENT);
  return {
    x: clamp(rom.leftBoundaryPercent + width * zone.xFrac, safeLeft, safeRight),
    y: clamp(rom.minHeightPercent + height * zone.yFrac, safeTop, safeBottom),
  };
}

// Which zones can appear at this level. With one arm selected, only the
// clouds on that arm's side (plus the middle) are used.
function levelPool(levelIndex, armChoice, forceCenter) {
  const lv = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, levelIndex))];
  const ids = lv.zonePool === "ALL" ? REACH_ZONES.map((z) => z.id) : lv.zonePool;
  let pool = forceCenter
    ? REACH_ZONES.filter((z) => z.id === "center" || z.id === "upper-center")
    : REACH_ZONES.filter((z) => ids.includes(z.id));
  if (armChoice === "left") pool = pool.filter((z) => z.xFrac <= 0.52);
  if (armChoice === "right") pool = pool.filter((z) => z.xFrac >= 0.48);
  return pool.length ? pool : [REACH_ZONES[0]];
}

// Higher levels stretch the clouds further from the resting hand, so the arc
// of movement gets wider (level 1 = short, level 5 = full and then some).
function scaledPosition(zone, rom, scale) {
  const p = zoneToPosition(zone, rom);
  const nx = rom.neutralX;
  const ny = rom.neutralY;
  return {
    x: clamp(nx + (p.x - nx) * scale, EDGE_SAFE_MARGIN_PERCENT, 100 - EDGE_SAFE_MARGIN_PERCENT),
    y: clamp(ny + (p.y - ny) * scale, EDGE_SAFE_MARGIN_PERCENT, 100 - EDGE_SAFE_MARGIN_PERCENT),
  };
}

function spawnCloud(levelIndex, rom, forceCenter, armChoice = "both", lastHand = "right") {
  const lv = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, levelIndex))];
  const pool = levelPool(levelIndex, armChoice, forceCenter);
  const zone = pool[Math.floor(Math.random() * pool.length)] || REACH_ZONES[0];
  const pos = scaledPosition(zone, rom, lv.arc);
  // Which hand must be used for this cloud.
  let hand;
  if (armChoice === "left" || armChoice === "right") hand = armChoice;
  else if (pos.x < 44) hand = "left";
  else if (pos.x > 56) hand = "right";
  else hand = lastHand === "left" ? "right" : "left";

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    x: pos.x,
    y: pos.y,
    size: lv.cloudSize,
    dwellMs: lv.dwellMs,
    lifetimeMs: lv.lifetimeMs,
    zoneId: zone.id,
    zoneLabel: zone.label,
    hand,
    popped: false,
    holdStart: null,
    createdAt: Date.now(),
  };
}

const REP_PHASE = {
  WAITING: "WAITING",
  TARGET_VISIBLE: "TARGET_VISIBLE",
  REACHING: "REACHING",
  DWELLING: "DWELLING",
  COMPLETED: "COMPLETED",
  RESTING: "RESTING",
};

const FLOW = {
  READY_CHECK: "READY_CHECK",
  FIND_START: "FIND_START",
  COUNTDOWN: "COUNTDOWN",
  PLAYING: "PLAYING",
  DONE: "DONE",
};

const IN_PROGRESS_PHASES = new Set([REP_PHASE.TARGET_VISIBLE, REP_PHASE.REACHING, REP_PHASE.DWELLING]);

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.max(0, totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function movementQualityLabel(recentSmoothness) {
  if (recentSmoothness >= 85) return "Excellent";
  if (recentSmoothness >= 65) return "Good";
  if (recentSmoothness >= 40) return "Fair";
  return "Needs focus";
}

class SessionSummaryErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("[CloudReach] SessionSummary crashed:", error, info);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function CloudSVG({ sizePx, active, holdProgress = 0 }) {
  // Always-visible outline so the cloud reads clearly against the light
  // sky gradient, regardless of hold state.
  const outlineColor = "rgb(37,99,235)"; // #2563EB — matches the app's blue
  const glowColor = "rgb(15,118,110)";

  const t = clamp(holdProgress / 100, 0, 1);
  const fillColor = active
    ? `rgb(${Math.round(224 + (245 - 224) * t)}, ${Math.round(242 + (158 - 242) * t)}, ${Math.round(241 + (11 - 241) * t)})`
    : "#FFFFFF";

  return (
    <svg
      width={sizePx}
      height={sizePx * 0.62}
      viewBox="0 0 100 62"
      style={{ overflow: "visible" }}
      className={active ? undefined : "cloud-pulse"}
    >
      {active && <ellipse cx="50" cy="34" rx="46" ry="26" fill={glowColor} opacity="0.22" />}

      <g filter="url(#cloud-shadow)">
        <ellipse cx="30" cy="38" rx="20" ry="16" fill={fillColor} stroke={outlineColor} strokeWidth="1.5" strokeOpacity="0.55" />
        <ellipse cx="55" cy="30" rx="24" ry="20" fill={fillColor} stroke={outlineColor} strokeWidth="1.5" strokeOpacity="0.55" />
        <ellipse cx="76" cy="40" rx="17" ry="14" fill={fillColor} stroke={outlineColor} strokeWidth="1.5" strokeOpacity="0.55" />
        <ellipse cx="50" cy="46" rx="34" ry="14" fill={fillColor} stroke={outlineColor} strokeWidth="1.5" strokeOpacity="0.55" />
      </g>

      {/* Always-on target reticle so the cloud reads as "tappable" even
          before the patient starts reaching toward it. */}
      <circle cx="50" cy="31" r="46" fill="none" stroke={outlineColor} strokeWidth="2" strokeDasharray={active ? "none" : "4 4"} opacity={active ? 0.6 : 0.35} />

      <defs>
        <filter id="cloud-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.32" />
        </filter>
      </defs>
    </svg>
  );
}

// ==================================================================
// SESSION COMPLETION POPUP
// Shown the instant the target rep count is reached, before the
// heavier SessionSummary report renders. Auto-dismisses to the full
// report after 2s, or immediately on "View Report" click.
// ==================================================================
function SessionCompletionPopup({ metrics, targetReps, onViewReport }) {
  useEffect(() => {
    const timer = setTimeout(() => onViewReport(), 2000);
    return () => clearTimeout(timer);
  }, [onViewReport]);

  if (!metrics) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white border border-[#E2E8F0] shadow-lg p-6 text-center">
        <div className="text-xl font-bold text-[#16A34A] mb-1">Session Complete</div>
        <div className="text-sm text-[#64748B] mb-5">
          {metrics.successfulReps} / {targetReps} reps completed
        </div>
        <div className="grid grid-cols-2 gap-3 mb-5 text-left">
          <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2">
            <div className="text-xs text-[#64748B]">Hits</div>
            <div className="text-lg font-semibold text-[#16A34A]">{metrics.successfulReps}</div>
          </div>
          <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2">
            <div className="text-xs text-[#64748B]">Misses</div>
            <div className="text-lg font-semibold text-[#DC2626]">{metrics.missedReps}</div>
          </div>
          <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2">
            <div className="text-xs text-[#64748B]">Accuracy</div>
            <div className="text-lg font-semibold text-[#2563EB]">{metrics.accuracy}%</div>
          </div>
          <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2">
            <div className="text-xs text-[#64748B]">Comfort</div>
            <div className="text-lg font-semibold text-[#0F766E]">
              {metrics.averageComfort != null ? `${metrics.averageComfort}/10` : "—"}
            </div>
          </div>
        </div>
        <button
          onClick={onViewReport}
          className="w-full rounded-xl bg-[#2563EB] px-6 py-3 font-semibold text-white hover:bg-[#1D4ED8]"
        >
          View Report
        </button>
      </div>
    </div>
  );
}

// ==================================================================
// MAIN COMPONENT
// ==================================================================
export default function CloudReach({
  onSessionEnd,
  patientId,
  gameId = "cloud-reach",
  romConfig,
  sessionConfig,
  therapistView = false,
  debugHandTracking = false,
  debugModeDefault = false,
  // Height, in px, of the shell/parent app's own header (back button,
  // patient name, etc.) that sits above this component. This component
  // fills the full viewport by default, so without this offset its
  // content starts at the very top and collides with that outer header,
  // as seen in your screenshot. Adjust this number — or better, pass the
  // shell header's real measured height as a prop — until it clears.
  shellHeaderOffset = 100,
}) {
  const videoRef = useRef(null);
  const [poseData, setPoseData] = useState(null);
  const [headerHeight, setHeaderHeight] = useState(64);
  const headerObserverRef = useRef(null);

  // Warm up a possibly-sleeping Render free-tier backend the moment this
  // screen mounts -- well before the ~3+ minute session ends and saveReport
  // actually needs the backend to be responsive. Fire-and-forget: nevera
  // awaited, no loading state, no UI indicator.
  useEffect(() => {
    healthApi.ping();
  }, []);

  // Callback ref instead of a plain ref: this runs every time the header
  // element actually mounts/unmounts (e.g. when `flow` switches to/away
  // from PLAYING), so the observer always attaches to the real node —
  // unlike a one-shot `useEffect(..., [])`, which ran before the header
  // existed and silently never attached anything.
  const headerRef = useCallback((el) => {
    if (headerObserverRef.current) {
      headerObserverRef.current.disconnect();
      headerObserverRef.current = null;
    }
    if (!el || typeof ResizeObserver === "undefined") return;
    setHeaderHeight(Math.ceil(el.getBoundingClientRect().height));
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setHeaderHeight(Math.ceil(entry.contentRect.height));
    });
    observer.observe(el);
    headerObserverRef.current = observer;
  }, []);

  const ROM = useMemo(() => ({ ...DEFAULT_ROM_CONFIG, ...romConfig }), [romConfig]);
  const SESSION = useMemo(() => ({ ...DEFAULT_SESSION_CONFIG, ...sessionConfig }), [sessionConfig]);
  // The patient can choose to keep going at the end (see requestFinish).
  const [extraReps, setExtraReps] = useState(0);
  const [extraSeconds, setExtraSeconds] = useState(0);
  const targetReps = SESSION.targetReps + extraReps;
  const mainSeconds = SESSION.mainSeconds + extraSeconds;
  const [level, setLevel] = useState(1);
  const levelRef = useRef(1);
  const okStreakRef = useRef(0);
  const missStreakRef = useRef(0);
  const [continuePrompt, setContinuePrompt] = useState(false);
  const promptOpenRef = useRef(false);
  const promptStartedAtRef = useRef(0);
  const extensionsRef = useRef(0);
  const stageSizeRef = useRef({ w: 800, h: 600 });

  const [flow, setFlow] = useState(FLOW.READY_CHECK);
  const [showDebug, setShowDebug] = useState(debugModeDefault);
  const [findStartMsg, setFindStartMsg] = useState("Show your arm and hand to the camera.");
  const [cloud, setCloud] = useState(null);
  const [repPhase, setRepPhase] = useState(REP_PHASE.WAITING);
  // (kept in a ref so the stage can be updated without waiting for a re-render)
  const [popped, setPopped] = useState(0);
  const [missed, setMissed] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [flash, setFlash] = useState(null);
  const [feedbackMsg, setFeedbackMsg] = useState(REACH_PROMPT);
  const [holdProgress, setHoldProgress] = useState(0);
  const [restTimer, setRestTimer] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [repetitionsCompleted, setRepetitionsCompleted] = useState(0);
  const [repData, setRepData] = useState([]);
  const [trail, setTrail] = useState([]);
  const [handPosition, setHandPosition] = useState(null);
  const [isHandVisible, setIsHandVisible] = useState(false);
  const [handLostPause, setHandLostPause] = useState(false);
  const [sessionScore, setSessionScore] = useState(null);
  const [elapsedMain, setElapsedMain] = useState(0);
  const [endingSession, setEndingSession] = useState(false);
  const [streakCount, setStreakCount] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  // Shown the instant finishSession() computes metrics — before the
  // full SessionSummary report renders.
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);

  // ==================================================================
  // Clinical progress metrics — unchanged calculations, just no emoji rendering.
  // ==================================================================
  const [biometrics, setBiometrics] = useState({
    heartRate: null,
    fatigueLevel: 0,
    smoothness: 100,
    rangeOfMotion: 0,
    reactionTime: 0,
    stabilityScore: 100,
    sessionProgress: 0,
  });

  // Session milestone toast — a short-lived text message in the feedback
  // strip, no extra overlay or particles.
  const [milestoneTimer, setMilestoneTimer] = useState(null);

  const startPositionRef = useRef({ x: ROM.neutralX, y: ROM.neutralY });
  const trajectoryRef = useRef([]);
  const lastTrailPushRef = useRef(0);
  const repStartTimeRef = useRef(null);
  const handLostFramesRef = useRef(0);
  const HAND_LOST_PAUSE_FRAMES = 75; // about 2.5 seconds without any usable reading
  const stableFrameStartRef = useRef(null);
  const prevHandForStabilityRef = useRef(null);
  const minAngleRef = useRef(null);
  const maxAngleRef = useRef(0);
  const totalRomRef = useRef(0);
  const romCountRef = useRef(0);
  const peakReachDepthRef = useRef(0);
  const hasEndedRef = useRef(false);
  const restTimerRef = useRef(null);
  const restEndTimeRef = useRef(null);
  const expiryTimerRef = useRef(null);
  const nextTargetTimeoutRef = useRef(null);
  const mainTimerRef = useRef(null);
  const metricsEngine = useRef(new MetricsEngine());
  const lastSlowdownNoticeRef = useRef(0);
  const sessionStartTimeRef = useRef(null);
  const sessionEndTimeRef = useRef(null);
  // Mirrors repData state synchronously, in the same tick as the rep
  // event — not on React's next render. computeSessionMetrics reads from
  // this ref, not the repData state variable, so a report requested
  // immediately after the final rep (same call stack) always includes
  // that final rep instead of being one entry stale.
  const repDataRef = useRef([]);
  // Mirrors papsScore on every change, so the once-per-second sampler
  // below always reads the current value.
  const papsScoreRef = useRef(0);
  const papsHistoryRef = useRef([]);
  // Always holds the latest finishSession closure. finishSession is a
  // plain function re-created every render (not useCallback), so any
  // memoized callback that doesn't list it as a dependency — like
  // handleEndSessionClick — would otherwise call a stale, out-of-date
  // closure instead of one reflecting current state. Routing every call
  // through this ref guarantees "End Session" (and every other trigger)
  // always runs against current data.
  const finishSessionRef = useRef(() => { });
  const requestFinishRef = useRef(() => { });
  // True when the session was ended via the "End Session" button rather
  // than by completing all reps / running out of time. Read inside
  // finishSession() to skip the celebratory completion popup and go
  // straight to the full report — there's nothing to celebrate on an
  // early exit, and the report should show immediately based on
  // whatever reps were actually recorded.
  const manualEndRef = useRef(false);
  const reportSavedRef = useRef(false);
  // Built once, inside finishSession() (an event/effect callback — never
  // during render), and read by the DONE screen. This is what lets the
  // DONE-screen render stay a pure read with no side effects of its own.
  const sessionDataRef = useRef(null);
  // True while the session is paused specifically because of a pain
  // detection event, so the auto-resume effect below only fires for
  // pain-triggered pauses — never overrides a manual pause.
  const pausedByPainRef = useRef(false);

  const { isActive } = useMediaPipeUpperBody({ videoRef, onPoseUpdate: setPoseData });

  // The separate finger-tracking model was removed: it ran a second model on
  // every frame (extra lag) and mapped the raw camera frame to the screen, so
  // the dot did not line up with the clouds. The dot now comes from the pose
  // wrist, measured relative to the shoulder (see getHandPosition).
  const { error: handTrackingError } = useHandTracking({
    videoRef,
    numHands: 1,
    debug: debugHandTracking,
    enabled: false,
  });

  const { shoulderAngle, activeSide } = usePoseDetection(poseData);
  const handTrackingReady = isActive;
  const guidance = usePostureGuidance(poseData);

  // WRIST relative to SHOULDER, per spec. Positive dz = wrist is forward
  // of the shoulder plane (reaching forward, not just flat/lateral).
  // Returns null (never 0) when pose isn't confidently tracked, so callers
  // don't mistake "not measured" for "no forward reach."
  const wristRelative = useMemo(() => {
    if (!poseData?.raw) return null;
    const wristKey = activeSide === "left" ? "leftWrist" : "rightWrist";
    const shoulderKey = activeSide === "left" ? "leftShoulder" : "rightShoulder";
    const wrist = poseData.raw[wristKey];
    const shoulder = poseData.raw[shoulderKey];
    if (!wrist || !shoulder || wrist.visibility < 0.4 || shoulder.visibility < 0.4) return null;
    return {
      dx: wrist.x - shoulder.x,
      dy: shoulder.y - wrist.y, // + = wrist above shoulder
      dz: shoulder.z - wrist.z, // + = wrist forward of shoulder (reaching forward)
    };
  }, [poseData, activeSide]);
  const { papsScore, isPainDetected, resetPainState } = useFacialPainDetection({ videoRef });
  useEffect(() => {
    papsScoreRef.current = papsScore;
  }, [papsScore]);
  const currentDifficulty = level <= 2 ? "Beginner" : level === 3 ? "Intermediate" : "Advanced";
  const telemetry = useSessionTelemetry(patientId, gameId);
  const audio = useAudioFeedback(true);

  const engine = useGameEngine({
    // The game runs its own clock (mainSeconds) and its own "keep going?"
    // prompt, so the engine timer is just a long safety net.
    sessionLength: 3600,
    adaptiveCheckpoint: false,
    onRepComplete: () => { },
    onSessionComplete: () => finishSessionRef.current(),
  });
  const { gameState, countdown, isPaused, startSession, pauseSession, resumeSession } = engine;

  // ==================================================================
  // HAND POSITION
  // ==================================================================
  // Shoulder-relative reach mapping. The wrist's offset from its own shoulder
  // is divided by the shoulder width, so it does not matter how far from the
  // camera the patient sits or where they sit in the frame: reaching up and
  // out always lands on the clouds. x is mirrored like the camera preview.
  const handFilterRef = useRef({
    x: new OneEuro(1.2, 0.1), y: new OneEuro(1.2, 0.1),
    ex: new OneEuro(1.2, 0.1), ey: new OneEuro(1.2, 0.1),
  });
  const armRef = useRef(null);
  const repPhaseRef = useRef(REP_PHASE.WAITING);
  repPhaseRef.current = repPhase;
  const [armChoice, setArmChoice] = useState("both"); // which arm(s) the patient plays with
  const armChoiceRef = useRef("both");
  armChoiceRef.current = armChoice;
  const sideLockRef = useRef(null); // locks the reaching arm while a reach is under way
  const activeSideRef = useRef("left");
  activeSideRef.current = activeSide;
  if (repPhase === REP_PHASE.REACHING || repPhase === REP_PHASE.DWELLING) {
    if (!sideLockRef.current) sideLockRef.current = activeSideRef.current;
  } else {
    sideLockRef.current = null;
  }
  const lastHandRef = useRef("right");
  const assignedHandRef = useRef(null); // the hand the current cloud asks for
  const usedSideRef = useRef("left");
  const lastGoodRef = useRef(null); // last good hand reading, used to coast through short dropouts
  // Sitting too close crops the arms out of the picture (wrist and elbow fall off the frame).
  const sittingTooClose = useMemo(() => {
    const r = poseData?.raw;
    if (!r?.leftShoulder || !r?.rightShoulder) return false;
    return Math.abs(r.leftShoulder.x - r.rightShoulder.x) > 0.36;
  }, [poseData]);
  const getHandPosition = useCallback(() => {
    const raw = poseData?.raw;
    if (!raw) return null;
    const choice = armChoiceRef.current;
    const side =
      choice === "left" || choice === "right"
        ? choice
        : assignedHandRef.current || sideLockRef.current || activeSide;
    usedSideRef.current = side;
    const wrist = raw[side === "left" ? "leftWrist" : "rightWrist"];
    const elbow = raw[side === "left" ? "leftElbow" : "rightElbow"];
    const sh = raw[side === "left" ? "leftShoulder" : "rightShoulder"];
    const lS = raw.leftShoulder;
    const rS = raw.rightShoulder;
    if (!sh || !lS || !rS || (sh.visibility ?? 0) < 0.25) return coast();
    // PREFERRED: 3D body positions (metres). Unlike picture coordinates they are
    // still estimated when the wrist or elbow is outside the camera picture, and
    // they do not depend on how close the patient sits.
    const W3 = poseData.world;
    const wsh = W3?.[side === "left" ? "leftShoulder" : "rightShoulder"];
    const wwr = W3?.[side === "left" ? "leftWrist" : "rightWrist"];
    const wel = W3?.[side === "left" ? "leftElbow" : "rightElbow"];
    const wl = W3?.leftShoulder;
    const wr = W3?.rightShoulder;
    const whipL = W3?.leftHip;
    const whipR = W3?.rightHip;
    let dx;
    let dy;
    let edx = null;
    let edy = null;
    let wristOk = false;
    let elbowOk = false;
    if (wsh && wwr && wl && wr) {
      // Which way is "left" and "down" in world space? Take it from the picture.
      const signX = Math.sign((wl.x - wr.x) * (lS.x - rS.x)) || 1;
      let signY = 1;
      if (whipL && whipR) signY = Math.sign((whipL.y + whipR.y) / 2 - (wl.y + wr.y) / 2) || 1;
      const shoulderWidth = Math.max(0.15, Math.hypot(wl.x - wr.x, wl.y - wr.y, wl.z - wr.z));
      dx = (signX * (wwr.x - wsh.x)) / shoulderWidth;
      dy = (signY * (wwr.y - wsh.y)) / shoulderWidth;
      wristOk = true;
      if (wel) {
        elbowOk = true;
        edx = (signX * (wel.x - wsh.x)) / shoulderWidth;
        edy = (signY * (wel.y - wsh.y)) / shoulderWidth;
      }
    } else {
      // FALLBACK: picture coordinates.
      const wristVis = wrist && (wrist.visibility ?? 0) >= 0.12;
      const elbowVis = elbow && (elbow.visibility ?? 0) >= 0.25;
      let wx;
      let wy;
      if (wristVis) {
        wx = wrist.x; wy = wrist.y;
      } else if (elbowVis) {
        wx = elbow.x + (elbow.x - sh.x) * 0.9;
        wy = elbow.y + (elbow.y - sh.y) * 0.9;
      } else {
        return coast();
      }
      const v = videoRef.current;
      const aspect = v?.videoWidth && v?.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
      const unit = Math.max(0.05, Math.abs(lS.x - rS.x)) * aspect;
      dx = ((wx - sh.x) * aspect) / unit;
      dy = (wy - sh.y) / unit;
      wristOk = wristVis;
      if (elbowVis) {
        elbowOk = true;
        edx = ((elbow.x - sh.x) * aspect) / unit;
        edy = (elbow.y - sh.y) / unit;
      }
    }
    // Wider reach range: a comfortable reach (about 1.2 shoulder widths out, or
    // about 0.9 up) already reaches the edge clouds. Up and down use separate gains.
    const mapY = (d) => 40 + (d < 0 ? d * 26 : d * 16);
    const now = performance.now();
    const x = handFilterRef.current.x.filter(clamp(50 - dx * 30, 0, 100), now);
    const y = handFilterRef.current.y.filter(clamp(mapY(dy), 0, 100), now);
    if (elbowOk) {
      armRef.current = {
        shoulder: { x: 50, y: 40 },
        elbow: {
          x: handFilterRef.current.ex.filter(clamp(50 - edx * 30, 0, 100), now),
          y: handFilterRef.current.ey.filter(clamp(mapY(edy), 0, 100), now),
        },
      };
    } else {
      armRef.current = { shoulder: { x: 50, y: 40 }, elbow: { x: (50 + x) / 2, y: (40 + y) / 2 + 6 } };
    }
    const out = { x, y, confidence: wristOk ? 0.9 : 0.3 };
    lastGoodRef.current = { pos: out, t: now };
    return out;

    // Short dropouts (under 0.4 s) keep the last good position instead of
    // flagging the hand as lost.
    function coast() {
      const g = lastGoodRef.current;
      if (g && performance.now() - g.t < 400) return g.pos;
      return null;
    }
  }, [poseData, activeSide]);

  useEffect(() => {
    const pos = getHandPosition();
    const valid = pos && pos.x >= 0 && pos.x <= 100 && pos.y >= 0 && pos.y <= 100;
    if (valid) {
      // Update the stage immediately (before React re-renders) for the lowest delay.
      stageSceneRef.current?.setArm?.(armRef.current);
      stageSceneRef.current?.setHand?.(pos, repPhaseRef.current === REP_PHASE.DWELLING, usedSideRef.current);
      setHandPosition(pos);
      setIsHandVisible(true);
      handLostFramesRef.current = 0;
      if (handLostPause) {
        setHandLostPause(false);
        setFeedbackMsg(REACH_PROMPT);
      }

      const now = performance.now();
      trajectoryRef.current.push({ x: pos.x, y: pos.y, t: now, confidence: pos.confidence });
      while (trajectoryRef.current.length > 1 && now - trajectoryRef.current[0].t > 6000) trajectoryRef.current.shift();

      if (now - lastTrailPushRef.current > TRAIL_SAMPLE_MS) {
        lastTrailPushRef.current = now;
        setTrail((prev) => {
          const next = [...prev, { x: pos.x, y: pos.y }];
          return next.length > 18 ? next.slice(next.length - 18) : next;
        });
      }
    } else {
      setIsHandVisible(false);
      handLostFramesRef.current += 1;
      if (handLostFramesRef.current === HAND_LOST_PAUSE_FRAMES && !handLostPause) {
        setHandLostPause(true);
        setFeedbackMsg(NO_HAND_MESSAGE);
      }
    }
  }, [getHandPosition, handLostPause]);

  useEffect(() => {
    if (handTrackingError && DEBUG) console.warn("[CloudReach] Hand tracking error:", handTrackingError);
  }, [handTrackingError]);

  const pauseReasonsRef = useRef(new Set());
  const requestPause = useCallback(
    (reason) => {
      if (pauseReasonsRef.current.has(reason)) return;
      pauseReasonsRef.current.add(reason);
      pauseSession();
    },
    [pauseSession]
  );
  const releasePause = useCallback(
    (reason) => {
      if (!pauseReasonsRef.current.has(reason)) return;
      pauseReasonsRef.current.delete(reason);
      if (pauseReasonsRef.current.size === 0) resumeSession();
    },
    [resumeSession]
  );

  useEffect(() => {
    if (flow !== FLOW.PLAYING) return;
    if (handLostPause) requestPause("hand-lost");
    else releasePause("hand-lost");
  }, [handLostPause, flow, requestPause, releasePause]);

  // ==================================================================
  // FIND_START
  // ==================================================================
  useEffect(() => {
    if (flow !== FLOW.FIND_START) return;
    if (!handPosition || !isHandVisible) {
      stableFrameStartRef.current = null;
      setFindStartMsg("Show your arm and hand to the camera.");
      return;
    }
    const prev = prevHandForStabilityRef.current;
    prevHandForStabilityRef.current = handPosition;
    const movedSincePrev = prev ? Math.hypot(handPosition.x - prev.x, handPosition.y - prev.y) : 999;

    if (movedSincePrev > 1.2) {
      stableFrameStartRef.current = performance.now();
      setFindStartMsg("Hold still...");
      return;
    }
    if (!stableFrameStartRef.current) stableFrameStartRef.current = performance.now();

    const heldFor = performance.now() - stableFrameStartRef.current;
    if (heldFor >= STABLE_START_MS) {
      startPositionRef.current = { ...handPosition };
      setFindStartMsg("Ready!");
      setFlow(FLOW.COUNTDOWN);
      startSession();
    }
  }, [flow, handPosition, isHandVisible, startSession]);

  // ==================================================================
  // GAME FLOW
  // ==================================================================
  useEffect(() => {
    if (flow === FLOW.COUNTDOWN && gameState === GAME_STATES.ACTIVE) {
      sessionStartTimeRef.current = Date.now();
      setFlow(FLOW.PLAYING);
      setFeedbackMsg(REACH_PROMPT);
      spawnNextTarget(true);
    }
  }, [flow, gameState]);

  useEffect(() => {
    if (flow !== FLOW.PLAYING) return undefined;
    mainTimerRef.current = setInterval(() => {
      if (!sessionStartTimeRef.current) return;
      const secs = Math.floor((Date.now() - sessionStartTimeRef.current) / 1000);
      setElapsedMain(secs);

      const progress = Math.min(100, (secs / mainSeconds) * 100);
      setBiometrics((prev) => ({
        ...prev,
        sessionProgress: progress,
      }));

      // Sample comfort/PAPS once per second for the report's "average
      // comfort" figure — otherwise the report only ever reflects
      // whatever the score happened to be at the exact moment it ended.
      papsHistoryRef.current.push(papsScoreRef.current);

      // Fatigue heuristic: if the fingertip's average displacement stalls
      // for a sustained period, nudge the fatigue indicator up. This is a
      // coaching cue, not a clinical fatigue measurement.
      if (secs > 60 && secs % 30 === 0) {
        const avgSpeed =
          trajectoryRef.current.length > 0
            ? trajectoryRef.current.reduce(
              (s, p) => s + Math.hypot(p.x - (trajectoryRef.current[0]?.x || p.x), p.y - (trajectoryRef.current[0]?.y || p.y)),
              0
            ) / trajectoryRef.current.length
            : 0;
        if (avgSpeed < 2 && repData.length > 0) {
          setBiometrics((prev) => ({
            ...prev,
            fatigueLevel: Math.min(100, prev.fatigueLevel + 5),
          }));
        }
      }

    }, 1000);
    return () => clearInterval(mainTimerRef.current);
  }, [flow, mainSeconds, repData]);

  useEffect(() => {
    if (flow !== FLOW.PLAYING) return;
    if (elapsedMain >= mainSeconds || repetitionsCompleted >= targetReps) {
      requestFinishRef.current();
      // Safety net: finishSession should reach setFlow(FLOW.DONE)
      // synchronously, but if anything inside it ever hangs, this
      // guarantees the screen can't stay stuck on PLAYING indefinitely.
      // The functional setState form reads the live flow value, so it's
      // a no-op if the screen has genuinely already moved on.
      const safetyTimer = setTimeout(() => {
        setFlow((current) => (current === FLOW.PLAYING ? FLOW.DONE : current));
      }, 5000);
      return () => clearTimeout(safetyTimer);
    }
  }, [elapsedMain, repetitionsCompleted, flow]);

  // ==================================================================
  // ANALYZE TRAJECTORY
  // ==================================================================
  function analyzeTrajectory(points) {
    if (points.length < 2) return { pathLength: 0, smoothness: 100, peakSpeed: 0 };
    let pathLength = 0;
    let peakSpd = 0;
    let headingChangeSum = 0;
    let headingSamples = 0;
    let prevHeading = null;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const dist = Math.hypot(dx, dy);
      pathLength += dist;
      const dt = Math.max(1, points[i].t - points[i - 1].t) / 1000;
      peakSpd = Math.max(peakSpd, dist / dt);

      if (dist > 0.15) {
        const heading = Math.atan2(dy, dx);
        if (prevHeading !== null) {
          let delta = Math.abs(heading - prevHeading);
          if (delta > Math.PI) delta = 2 * Math.PI - delta;
          headingChangeSum += delta;
          headingSamples += 1;
        }
        prevHeading = heading;
      }
    }
    const avgHeadingChange = headingSamples > 0 ? headingChangeSum / headingSamples : 0;
    const smoothness = clamp(Math.round(100 - (avgHeadingChange / Math.PI) * 100), 0, 100);
    return { pathLength, smoothness, peakSpeed: peakSpd };
  }

  useEffect(() => {
    if (repPhase !== REP_PHASE.REACHING) return;
    const { peakSpeed } = analyzeTrajectory(trajectoryRef.current.slice(-6));
    const now = performance.now();
    if (peakSpeed > MAX_SAFE_SPEED && now - lastSlowdownNoticeRef.current > 2500) {
      lastSlowdownNoticeRef.current = now;
      setFeedbackMsg(SLOW_DOWN_MESSAGE);
    }
  }, [handPosition, repPhase]);

  useEffect(() => {
    if (flow !== FLOW.PLAYING || isPaused) return;
    const repResult = metricsEngine.current.trackAngle(shoulderAngle, performance.now());
    // Pain-Adjusted Performance Score: don't let a pain-driven, potentially
    // unsafe overreach count toward the "valid" max ROM used for scoring.
    if (repResult && shoulderAngle > 0 && isHandVisible && !isPainDetected) {
      if (minAngleRef.current === null || shoulderAngle < minAngleRef.current) minAngleRef.current = shoulderAngle;
      if (shoulderAngle > maxAngleRef.current) maxAngleRef.current = shoulderAngle;
    }
  }, [flow, isPaused, shoulderAngle, isHandVisible, isPainDetected]);

  const romDegrees = useMemo(() => {
    if (romCountRef.current > 0) return Math.round(totalRomRef.current / romCountRef.current);
    if (minAngleRef.current !== null && maxAngleRef.current > 0) return Math.max(0, Math.round(maxAngleRef.current - minAngleRef.current));
    return 0;
  }, [shoulderAngle]);

  const accuracy = totalAttempts > 0 ? Math.round((popped / totalAttempts) * 100) : 0;
  const recentSmoothness = repData.length > 0 ? average(repData.slice(-4).map((r) => r.smoothness)) : 100;
  const qualityLabel = movementQualityLabel(recentSmoothness);

  // ==================================================================
  // REP STATE MACHINE
  // ==================================================================
  const clearExpiryTimer = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  const buildRepRecord = useCallback(
    (outcome, cloudRef) => {
      const points = trajectoryRef.current;
      const start = points[0] || startPositionRef.current;
      const end = points[points.length - 1] || start;
      const target = cloudRef ? { x: cloudRef.x, y: cloudRef.y } : end;

      const plannedReachDistance = Math.hypot(target.x - start.x, target.y - start.y);
      const { pathLength: actualPathLength, smoothness } = analyzeTrajectory(points);
      const pathEfficiency = actualPathLength > 0.01 ? clamp(plannedReachDistance / actualPathLength, 0, 1) : plannedReachDistance < 0.5 ? 1 : 0;

      let maximumReachDistance = 0;
      let peakVerticalReach = 0;
      let peakHorizontalReach = 0;
      for (const p of points) {
        maximumReachDistance = Math.max(maximumReachDistance, Math.hypot(p.x - start.x, p.y - start.y));
        peakVerticalReach = Math.max(peakVerticalReach, start.y - p.y);
        peakHorizontalReach = Math.max(peakHorizontalReach, Math.abs(p.x - start.x));
      }
      peakVerticalReach = Math.max(0, peakVerticalReach);

      const reachDirection = directionFromVector(target.x - start.x, target.y - start.y);
      const isCorrect = outcome === "success";
      const isIncomplete = outcome === "incomplete";
      const finalDistToTarget = Math.hypot(end.x - target.x, end.y - target.y);
      const accuracyScore = clamp(100 - (finalDistToTarget / TARGET_HIT_RADIUS_PERCENT) * 100, 0, 100);
      const duration = repStartTimeRef.current ? (performance.now() - repStartTimeRef.current) / 1000 : 0;
      const movementQuality = Math.round(accuracyScore * 0.5 + smoothness * 0.3 + pathEfficiency * 100 * 0.2);
      const confidenceSamples = points.map((p) => p.confidence).filter((c) => typeof c === "number");
      const confidence = confidenceSamples.length > 0 ? Math.round(average(confidenceSamples)) : null;

      return {
        exerciseId: "cloud-reach",
        exerciseName: "Cloud Reach",
        repNumber: repetitionsCompleted + 1,
        targetId: cloudRef?.id || null,
        startX: Math.round(start.x * 10) / 10,
        startY: Math.round(start.y * 10) / 10,
        targetX: cloudRef ? Math.round(cloudRef.x * 10) / 10 : null,
        targetY: cloudRef ? Math.round(cloudRef.y * 10) / 10 : null,
        reachDirection,
        plannedReachDistance: Math.round(plannedReachDistance * 10) / 10,
        actualPathLength: Math.round(actualPathLength * 10) / 10,
        pathEfficiency: Math.round(pathEfficiency * 100) / 100,
        movementDuration: Math.round(duration * 100) / 100,
        accuracy: Math.round(accuracyScore),
        smoothness,
        movementQuality: clamp(movementQuality, 0, 100),
        maximumReachDistance: Math.round(maximumReachDistance * 10) / 10,
        peakVerticalReach: Math.round(peakVerticalReach * 10) / 10,
        peakHorizontalReach: Math.round(peakHorizontalReach * 10) / 10,
        confidence,
        isCorrect,
        incompleteTarget: isIncomplete || undefined,
        holdDurationMs: cloudRef?.holdDurationMs ?? null,
        reachDepth: Math.round(peakReachDepthRef.current * 1000) / 1000,
        mode: EXERCISE_MODE_ID,
        timestamp: new Date().toISOString(),
      };
    },
    [repetitionsCompleted]
  );

  const recordRep = useCallback(
    (outcome, cloudRef) => {
      const entry = buildRepRecord(outcome, cloudRef);
      const lastPoint = trajectoryRef.current[trajectoryRef.current.length - 1];
      // Update the ref synchronously — this is what makes an immediate,
      // same-stack finishSession() call safe: repDataRef.current is
      // already correct before finishSession runs, unlike repData state.
      repDataRef.current = [...repDataRef.current, entry];
      setRepData(repDataRef.current);
      telemetry.recordRep(entry.isCorrect);
      telemetry.trackMovement(lastPoint ? { x: lastPoint.x, y: lastPoint.y } : { x: entry.startX, y: entry.startY });
      telemetry.trackAngle(shoulderAngle);
      if (entry.plannedReachDistance > 0) {
        totalRomRef.current += entry.plannedReachDistance;
        romCountRef.current += 1;
      }
      return entry;
    },
    [buildRepRecord, shoulderAngle, telemetry]
  );

  // ==================================================================
  // MILESTONE MESSAGING
  // A brief clinical message in the existing feedback strip — no extra
  // overlay, no particles.
  // ==================================================================
  const showMilestone = useCallback((text) => {
    setFeedbackMsg(text);
  }, []);

  // Looks uncomfortable for a few seconds -> drop a level; calm again -> back up.
  const { easeSteps } = useComfortEase({
    papsScore,
    isPainDetected,
    active: gameState === GAME_STATES.ACTIVE,
  });
  const prevEaseRef = useRef(0);
  useEffect(() => {
    const prev = prevEaseRef.current;
    if (easeSteps === prev) return;
    prevEaseRef.current = easeSteps;
    if (easeSteps > prev) {
      if (levelRef.current > 1) {
        levelRef.current -= 1;
        setLevel(levelRef.current);
      }
      showMilestone("Taking it a little easier");
    } else {
      if (levelRef.current < LEVELS.length) {
        levelRef.current += 1;
        setLevel(levelRef.current);
      }
      showMilestone("Feeling good? Stepping back up");
    }
  }, [easeSteps, showMilestone]);

  // ==================================================================
  // HANDLE REP COMPLETION
  // ==================================================================
  const handleRepSuccess = useCallback(
    (cloudRef) => {
      clearExpiryTimer();
      cloudRef.popped = true;
      cloudRef.holdDurationMs = cloudRef.holdStart ? Date.now() - cloudRef.holdStart : 0;
      setCloud({ ...cloudRef });
      setRepPhase(REP_PHASE.COMPLETED);

      setPopped((p) => p + 1);
      setTotalAttempts((a) => a + 1);
      setCombo((c) => {
        const next = c + 1;
        setBestCombo((best) => Math.max(best, next));
        if (next === 5 || next === 10 || next === 20) {
          try { audio.playSuccess(); } catch (err) { console.error("[CloudReach] audio failed:", err); }
        }
        return next;
      });

      setStreakCount((prev) => {
        const newStreak = prev + 1;
        setBestStreak((best) => Math.max(best, newStreak));
        return newStreak;
      });

      try { audio.playSuccess(); } catch (err) { console.error("[CloudReach] audio failed:", err); }

      stageSceneRef.current?.popAt?.(cloudRef.x, cloudRef.y);
      missStreakRef.current = 0;
      okStreakRef.current += 1;
      if (okStreakRef.current >= 3 && levelRef.current < LEVELS.length && (papsScoreRef.current ?? 0) < 3) {
        okStreakRef.current = 0;
        levelRef.current += 1;
        setLevel(levelRef.current);
        stageSceneRef.current?.levelUp?.(`Level ${levelRef.current}: wider reach!`);
      }
      setFlash({ type: "pop", key: Date.now() });
      setTimeout(() => setFlash(null), 400);

      const celebrationMsg = ENCOURAGEMENT[Math.floor(Math.random() * ENCOURAGEMENT.length)];
      showMilestone(celebrationMsg);
      recordRep("success", cloudRef);
      setRepetitionsCompleted((r) => r + 1);

      // Zero-delay completion: repDataRef.current is already correct at
      // this line (recordRep updated it above, synchronously), so this
      // ends the session in the same call stack as the final rep —
      // no setTimeout, no waiting for the next render.
      if (repDataRef.current.length >= targetReps) {
        requestFinishRef.current();
        return;
      }

      if (nextTargetTimeoutRef.current) clearTimeout(nextTargetTimeoutRef.current);
      nextTargetTimeoutRef.current = setTimeout(() => {
        nextTargetTimeoutRef.current = null;
        // Guard against a session that already ended, or the flow moving
        // away from PLAYING, by the time this fires.
        if (hasEndedRef.current || flow !== FLOW.PLAYING) return;
        setCloud(null);
        startRest();
      }, 500);
    },
    [clearExpiryTimer, recordRep, audio, showMilestone, SESSION, flow]
  );

  const startRest = useCallback(() => {
    setRepPhase(REP_PHASE.RESTING);
    setCloud(null);
    setHoldProgress(0);
    clearExpiryTimer();
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    // Wall-clock deadline instead of a tick counter: if the tab gets
    // throttled in the background (browsers slow setInterval when
    // unfocused), the very next tick still computes the correct real
    // remaining time and transitions immediately, instead of silently
    // drifting or appearing to freeze at "1s".
    restEndTimeRef.current = Date.now() + REST_INTERVAL_MS;
    setRestTimer(REST_INTERVAL_MS);
    restTimerRef.current = setInterval(() => {
      const remaining = restEndTimeRef.current - Date.now();
      if (remaining <= 0) {
        clearInterval(restTimerRef.current);
        restTimerRef.current = null;
        setRestTimer(0);
        setRepPhase(REP_PHASE.WAITING);
        return;
      }
      setRestTimer(remaining);
    }, 100);
  }, [clearExpiryTimer]);

  // ==================================================================
  // SPAWN TARGET
  // ==================================================================
  const spawnNextTarget = useCallback(
    (firstTarget = false) => {
      if (repetitionsCompleted >= targetReps) {
        requestFinishRef.current();
        return;
      }

      trajectoryRef.current = [];
      setTrail([]);
      peakReachDepthRef.current = 0;
      startPositionRef.current = handPosition ? { ...handPosition } : startPositionRef.current;

      const newCloud = spawnCloud(levelRef.current - 1, ROM, firstTarget, armChoiceRef.current, lastHandRef.current);
      lastHandRef.current = newCloud.hand;
      assignedHandRef.current = newCloud.hand;

      setCloud(newCloud);
      setRepPhase(REP_PHASE.TARGET_VISIBLE);
      setFeedbackMsg(REACH_PROMPT);
      repStartTimeRef.current = performance.now();

      clearExpiryTimer();
      expiryTimerRef.current = setTimeout(() => {
        setMissed((m) => m + 1);
        setTotalAttempts((a) => a + 1);
        setCombo(0);
        setStreakCount(0);
        recordRep("missed", newCloud);
        stageSceneRef.current?.missPuff?.();
        okStreakRef.current = 0;
        missStreakRef.current += 1;
        if (missStreakRef.current >= 2 && levelRef.current > 1) {
          missStreakRef.current = 0;
          levelRef.current -= 1;
          setLevel(levelRef.current);
          showMilestone("A little easier. Take your time.");
        }
        setFlash({ type: "miss", key: Date.now() });
        setTimeout(() => setFlash(null), 400);
        setFeedbackMsg("No rush — let's try the next one.");
        setRepetitionsCompleted((r) => r + 1);

        if (repDataRef.current.length >= targetReps) {
          requestFinishRef.current();
          return;
        }
        startRest();
      }, newCloud.lifetimeMs || CLOUD_LIFETIME_SECONDS * 1000);
    },
    [repetitionsCompleted, SESSION, currentDifficulty, ROM, handPosition, clearExpiryTimer, recordRep, startRest]
  );

  useEffect(() => {
    if (flow === FLOW.PLAYING && repPhase === REP_PHASE.WAITING && !cloud) {
      spawnNextTarget(false);
    }
  }, [flow, repPhase, cloud, spawnNextTarget]);

  // ==================================================================
  // CORE REACH DETECTION
  // ==================================================================
  useEffect(() => {
    if (flow !== FLOW.PLAYING || isPaused || !cloud || cloud.popped) return;
    if (!isHandVisible || !handPosition) return;
    if (repPhase === REP_PHASE.RESTING || repPhase === REP_PHASE.COMPLETED) return;

    const start = startPositionRef.current;
    const distFromStart = Math.hypot(handPosition.x - start.x, handPosition.y - start.y);

    if (repPhase === REP_PHASE.TARGET_VISIBLE) {
      if (distFromStart >= MIN_REACH_MOVEMENT) setRepPhase(REP_PHASE.REACHING);
      return;
    }

    const distToCloud = Math.hypot(handPosition.x - cloud.x, handPosition.y - cloud.y);
    const stage = stageSizeRef.current;
    const inZone =
      Math.hypot(((handPosition.x - cloud.x) * stage.w) / 100, ((handPosition.y - cloud.y) * stage.h) / 100) <
      cloud.size * 0.8 * (stage.h / 600);

    if (wristRelative && wristRelative.dz > peakReachDepthRef.current) {
      peakReachDepthRef.current = wristRelative.dz;
    }

    const requiredHoldMs = cloud.dwellMs;

    if (repPhase === REP_PHASE.REACHING) {
      if (inZone && !cloud.holdStart) {
        cloud.holdStart = Date.now();
        setCloud({ ...cloud });
        setRepPhase(REP_PHASE.DWELLING);
      }
      return;
    }

    if (repPhase === REP_PHASE.DWELLING) {
      if (!inZone) {
        cloud.holdStart = null;
        setCloud({ ...cloud });
        setHoldProgress(0);
        setRepPhase(REP_PHASE.REACHING);
        return;
      }
      const elapsed = Date.now() - cloud.holdStart;
      setHoldProgress(Math.min(100, (elapsed / requiredHoldMs) * 100));

      if (elapsed >= requiredHoldMs) {
        handleRepSuccess(cloud);
      }
    }
  }, [flow, isPaused, cloud, handPosition, isHandVisible, repPhase, handleRepSuccess, wristRelative]);

  useEffect(() => {
    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
      if (mainTimerRef.current) clearInterval(mainTimerRef.current);
      if (nextTargetTimeoutRef.current) clearTimeout(nextTargetTimeoutRef.current);
      clearExpiryTimer();
    };
  }, [clearExpiryTimer]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!restTimerRef.current || !restEndTimeRef.current) return;
      const remaining = restEndTimeRef.current - Date.now();
      if (remaining <= 0) {
        clearInterval(restTimerRef.current);
        restTimerRef.current = null;
        setRestTimer(0);
        setRepPhase(REP_PHASE.WAITING);
      } else {
        setRestTimer(remaining);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (flow !== FLOW.PLAYING) return;
    if (isPainDetected) {
      requestPause("pain");
      telemetry.trackPain(papsScore);
      setFeedbackMsg("Let's pause for a moment.");
    } else {
      releasePause("pain");
      resetPainState();
      setFeedbackMsg(REACH_PROMPT);
    }
  }, [isPainDetected, flow, requestPause, releasePause, telemetry, papsScore, resetPainState]);

  // ==================================================================
  // COMPUTE SESSION METRICS
  // ==================================================================
  const computeSessionMetrics = useCallback(() => {
    // Reads from the ref, not repData state — see the note on
    // repDataRef above. This is what makes it safe to call this
    // function synchronously, in the same tick as the final rep.
    const data = repDataRef.current;

    const completed = data.filter((r) => r.isCorrect);
    const missedTimeouts = data.filter((r) => !r.isCorrect && !r.incompleteTarget);
    const incomplete = data.filter((r) => r.incompleteTarget);
    const attemptedReps = data.length;
    const successfulReps = completed.length;
    const successRate = attemptedReps > 0 ? successfulReps / attemptedReps : 0;

    const accuracyValues = data.map((r) => r.accuracy);
    const smoothnessValues = data.map((r) => r.smoothness);
    const pathEfficiencyValues = data.map((r) => r.pathEfficiency);
    const movementQualityValues = data.map((r) => r.movementQuality);
    const confidenceValues = data.map((r) => r.confidence).filter((c) => typeof c === "number");

    const averageAccuracy = average(accuracyValues);
    const averageSmoothness = average(smoothnessValues);
    const averagePathEfficiency = average(pathEfficiencyValues);
    const averageMovementQuality = average(movementQualityValues);

    const consistencyFrom = (values, spread = 40) => (values.length < 2 ? 100 : clamp(100 - (stdDev(values) / spread) * 100, 0, 100));
    const consistency = average([
      consistencyFrom(accuracyValues),
      consistencyFrom(smoothnessValues),
      consistencyFrom(data.map((r) => r.plannedReachDistance), 20),
    ]);

    const sessionScoreTotal = Math.round(averageAccuracy * 0.4 + averageSmoothness * 0.3 + averagePathEfficiency * 100 * 0.2 + consistency * 0.1);

    sessionEndTimeRef.current = sessionEndTimeRef.current || Date.now();
    const totalSessionDuration = sessionStartTimeRef.current ? Math.round((sessionEndTimeRef.current - sessionStartTimeRef.current) / 1000) : elapsedMain;

    // Average comfort, expressed as 10 - PAPS (higher = more comfortable,
    // matching the "Comfortable"/"Some discomfort" language in the UI).
    const comfortSamples = papsHistoryRef.current.length > 0 ? papsHistoryRef.current : [papsScoreRef.current];
    const averagePapsScore = average(comfortSamples);
    const averageComfort = Math.round(clamp(10 - averagePapsScore, 0, 10));

    // Forward Reach is the "center" zone (see REACH_ZONES) — the primary
    // anchor movement, reported separately.
    const forwardReachReps = data.filter((r) => r.zoneId === "center");
    const forwardReachHits = forwardReachReps.filter((r) => r.isCorrect);
    const forwardReach = {
      attempts: forwardReachReps.length,
      hits: forwardReachHits.length,
      accuracy: forwardReachReps.length ? Math.round((forwardReachHits.length / forwardReachReps.length) * 100) : 0,
      averageHoldTimeMs: (() => {
        const holds = forwardReachReps.map((r) => r.holdDurationMs).filter((v) => typeof v === "number");
        return holds.length ? Math.round(average(holds)) : 0;
      })(),
      averageReachDistance: Math.round(average(forwardReachReps.map((r) => r.plannedReachDistance)) * 10) / 10,
    };

    return {
      totalReps: attemptedReps,
      successfulReps,
      missedReps: missedTimeouts.length,
      incompleteReps: incomplete.length,
      attemptedReps,
      successRate: Math.round(successRate * 100),
      averageAccuracy: Math.round(averageAccuracy),
      averageSmoothness: Math.round(averageSmoothness),
      averageMovementQuality: Math.round(averageMovementQuality),
      averageReachDistance: Math.round(average(data.map((r) => r.plannedReachDistance)) * 10) / 10,
      averageActualPathLength: Math.round(average(data.map((r) => r.actualPathLength)) * 10) / 10,
      averagePathEfficiency: Math.round(averagePathEfficiency * 100) / 100,
      averageMovementDuration: Math.round(average(data.map((r) => r.movementDuration)) * 100) / 100,
      maximumReachDistance: data.length ? Math.max(...data.map((r) => r.maximumReachDistance)) : 0,
      maximumVerticalReach: data.length ? Math.max(...data.map((r) => r.peakVerticalReach)) : 0,
      maximumHorizontalReach: data.length ? Math.max(...data.map((r) => r.peakHorizontalReach)) : 0,
      averageTrackingConfidence: confidenceValues.length > 0 ? Math.round(average(confidenceValues)) : null,
      averageHoldTimeMs: (() => {
        const holds = data.map((r) => r.holdDurationMs).filter((v) => typeof v === "number");
        return holds.length ? Math.round(average(holds)) : 0;
      })(),
      averageReachDepth: Math.round(average(data.map((r) => r.reachDepth || 0)) * 1000) / 1000,
      maximumReachDepth: data.length ? Math.max(...data.map((r) => r.reachDepth || 0)) : 0,
      consistency: Math.round(consistency),
      totalSessionDuration,
      total: sessionScoreTotal,
      // Headline accuracy = actual hit rate (hits ÷ attempts), matching
      // what the live in-game header shows. `movementAccuracy` keeps the
      // old distance-to-target quality score for anything that wants it
      // (e.g. the score breakdown), but it should never be the number
      // the therapist sees as "Accuracy %" — that quality score dilutes
      // toward 0 on every miss/incomplete rep even if the hit rate is high.
      accuracy: attemptedReps > 0 ? Math.round((successfulReps / attemptedReps) * 100) : 0,
      movementAccuracy: Math.round(averageAccuracy),
      smoothness: Math.round(averageSmoothness),
      reachQuality: Math.round(clamp((average(data.map((r) => r.plannedReachDistance)) / 35) * 100, 0, 100)),
      averageComfort,
      forwardReach,
      bestStreak,
      mode: EXERCISE_MODE_ID,
    };
  }, [elapsedMain, bestStreak]);

  // ==================================================================
  // FINISH SESSION
  // ==================================================================
  const finalizeInProgressTarget = useCallback(() => {
    if (cloud && IN_PROGRESS_PHASES.has(repPhase) && !cloud.popped) {
      clearExpiryTimer();
      recordRep("incomplete", cloud);
      setCloud(null);
    }
  }, [cloud, repPhase, clearExpiryTimer, recordRep]);

  function finishSession() {
    if (hasEndedRef.current) {
      // A previous call already ran (or attempted to run) finishSession.
      // Don't re-run the heavy body below — but also don't silently
      // no-op. If that earlier call threw before reaching
      // setFlow(FLOW.DONE), this is what unsticks the screen instead of
      // leaving it frozen on PLAYING forever.
      setFlow(FLOW.DONE);
      return;
    }
    hasEndedRef.current = true;
    // The entire body below is wrapped in try/finally so setFlow(FLOW.DONE)
    // ALWAYS runs, no matter what throws inside — even something not
    // individually try/catched. Without this, hasEndedRef.current is
    // already true (set above) by the time anything could throw, so a
    // single uncaught error here permanently freezes the screen on
    // FLOW.PLAYING AND blocks every future call to finishSession — including
    // a manual "End Session" click — via the early-return guard above.
    // That's the exact bug that produced the stuck screen: rep 15 fired,
    // hasEndedRef flipped true, something threw, DONE was never reached,
    // and "End Session" became a permanent no-op.
    try {
      sessionEndTimeRef.current = Date.now();
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    if (mainTimerRef.current) clearInterval(mainTimerRef.current);
    clearExpiryTimer();

    let metrics;
    try {
      metrics = computeSessionMetrics();
    } catch (err) {
      console.error("[CloudReach] computeSessionMetrics failed:", err);
      metrics = {
        total: 0,
        accuracy: 0,
        smoothness: 0,
        reachQuality: 0,
        consistency: 0,
        attemptedReps: repDataRef.current.length,
        successfulReps: repDataRef.current.filter((r) => r.isCorrect).length,
        missedReps: 0,
        incompleteReps: 0,
        averageReachDistance: 0,
        maximumReachDistance: 0,
        averageMovementDuration: 0,
        totalSessionDuration: elapsedMain,
        averageComfort: null,
        forwardReach: null,
        bestStreak: 0,
        mode: EXERCISE_MODE_ID,
      };
    }
    setSessionScore(metrics);
    // On a manual "End Session" click there's nothing to celebrate —
    // skip the completion popup and show the full report right away.
    // The automatic completion path (hitting the target rep count)
    // still gets the popup, shown in the same synchronous call stack
    // as the triggering rep — no setTimeout gates that step.
    if (!manualEndRef.current) {
      setShowCompletionPopup(true);
    }

    // Build sessionData HERE — inside finishSession, a plain callback
    // invoked from event handlers / effects — never inside the render
    // path. This is the one and only place it's constructed; the DONE
    // screen just reads sessionDataRef.current. Wrapped in try/catch so
    // a bad field (e.g. a NaN from an edge-case metrics run) can't stop
    // us from reaching setFlow(FLOW.DONE) below.
    try {
      sessionDataRef.current = {
        sessionId: telemetry.sessionId,
        gameId,
        patientId,
        date: new Date().toISOString(),
        durationSeconds: metrics.totalSessionDuration,
        score: metrics.total,
        accuracyPercent: metrics.accuracy,
        facialPainSignal: papsScore ?? null,
        averageComfort: metrics.averageComfort ?? null,
        forwardReach: metrics.forwardReach ?? null,
        romData: {
          averageRomDegrees: romDegrees || 0,
          maxRomDegrees: maxAngleRef.current || 0,
          averageReachDistance: metrics.averageReachDistance,
          maxReachDistance: metrics.maximumReachDistance,
          perRep: repDataRef.current.map((r) => ({
            rep: r.repNumber,
            reachDirection: r.reachDirection,
            smoothness: r.smoothness,
            reachDistance: r.plannedReachDistance,
            success: r.isCorrect,
            incomplete: !!r.incompleteTarget,
          })),
        },
        reps: metrics.attemptedReps,
        hitsOrCatchesOrCompletions: metrics.successfulReps,
        missesOrDrops: metrics.missedReps,
        gameSpecificMetrics: {
          totalAttempts: metrics.attemptedReps,
          incompleteReps: metrics.incompleteReps,
          targetReps: targetReps,
          bestCombo,
          longestHitStreak: bestCombo,
          bestStreak: metrics.bestStreak,
          exerciseMode: EXERCISE_MODE_ID,
          avgMovementDurationMs: Math.round(metrics.averageMovementDuration * 1000),
          averageComfort: metrics.averageComfort ?? null,
          forwardReach: metrics.forwardReach ?? null,
          biometrics: {
            averageSmoothness: metrics.averageSmoothness,
            maxFatigue: Math.round(biometrics.fatigueLevel),
            maxReach: metrics.maximumReachDistance,
          },
          scoreBreakdown: {
            total: metrics.total,
            accuracy: metrics.accuracy,
            smoothness: metrics.smoothness,
            reachQuality: metrics.reachQuality,
            consistency: metrics.consistency,
          },
          fullMetrics: metrics,
        },
      };
    } catch (err) {
      console.error("[CloudReach] building sessionData failed:", err);
      sessionDataRef.current = null;
    }

    try {
  telemetry.endSession({
    gameName: "Cloud Reach",
    score: metrics.total,
    popped: metrics.successfulReps,
    missed: metrics.missedReps,
    accuracy: metrics.accuracy,
    bestCombo,
    longestHitStreak: bestCombo,
    romDegrees,
    papsScore,
    difficulty: currentDifficulty,
    mode: EXERCISE_MODE_ID,
    biometrics: {
      averageSmoothness: metrics.averageSmoothness,
      fatigueLevel: biometrics.fatigueLevel,
      bestStreak: metrics.bestStreak,
      maxReach: metrics.maximumReachDistance,
    },
    repData: repDataRef.current,
    gameSpecific: {
      totalAttempts: metrics.attemptedReps,
      incompleteReps: metrics.incompleteReps,
      targetReps: targetReps,
      bestCombo,
      longestHitStreak: bestCombo,
      bestStreak: metrics.bestStreak,
      exerciseMode: EXERCISE_MODE_ID,
      avgMovementDurationMs: Math.round(metrics.averageMovementDuration * 1000),
      averageComfort: metrics.averageComfort ?? null,
      forwardReach: metrics.forwardReach ?? null,
      biometrics: {
        averageSmoothness: metrics.averageSmoothness,
        maxFatigue: Math.round(biometrics.fatigueLevel),
        maxReach: metrics.maximumReachDistance,
      },
      scoreBreakdown: {
        total: metrics.total,
        accuracy: metrics.accuracy,
        smoothness: metrics.smoothness,
        reachQuality: metrics.reachQuality,
        consistency: metrics.consistency,
      },
      fullMetrics: {
        ...metrics,
        repData: repDataRef.current,
      },
      romConfig: ROM,
      sessionStartTime: sessionStartTimeRef.current,
      sessionEndTime: sessionEndTimeRef.current,
      exerciseMode: EXERCISE_MODE_ID,
      bestStreak: metrics.bestStreak,
    }
  });
      } catch (err) {
        console.error("[CloudReach] telemetry.endSession failed:", err);
      }
    } finally {
      // Runs unconditionally — this is what makes the DONE transition
      // permanent regardless of any error above.
      setFlow(FLOW.DONE);
    }
  }
  // Keep the ref pointed at this render's closure so every caller —
  // including memoized callbacks below — always invokes the version of
  // finishSession that closes over the current state.
  finishSessionRef.current = finishSession;

  // Permanent home for the auto-save. This is a real effect, not a
  // side-effect-during-render call: it re-runs only when flow reaches
  // DONE (or sessionData is (re)built), it's async-safe, and a
  // component unmount / fast re-entry into a new session can't cause a
  // stale save to land — `cancelled` guards that.
  useEffect(() => {
    if (flow !== FLOW.DONE) return;
    if (reportSavedRef.current) return;
    if (!sessionDataRef.current) return;

    let cancelled = false;
    reportSavedRef.current = true;

    (async () => {
      try {
        await telemetry.saveReport(sessionDataRef.current);
      } catch (err) {
        if (!cancelled) console.error("[CloudReach] auto saveReport failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [flow, telemetry]);

  const handleEndSessionClick = useCallback(() => {
    if (hasEndedRef.current) {
      // finishSession already ran (or got stuck). Force the transition
      // instead of leaving the button as a permanent no-op.
      setFlow(FLOW.DONE);
      return;
    }
    if (endingSession) return;
    manualEndRef.current = true;
    setEndingSession(true);
    try {
      finalizeInProgressTarget();
    } catch (err) {
      console.error("[CloudReach] finalizeInProgressTarget failed:", err);
    } finally {
      // finishSessionRef.current() must always run, even if finalizing
      // the in-progress target threw — otherwise setEndingSession(true)
      // above leaves the button permanently disabled with the screen
      // stuck on FLOW.PLAYING.
      try {
        finishSessionRef.current();
      } catch (err) {
        console.error("[CloudReach] finishSession failed:", err);
        setEndingSession(false);
      }
    }
  }, [endingSession, finalizeInProgressTarget]);

  function resetForNewSession() {
    setPopped(0);
    setMissed(0);
    setTotalAttempts(0);
    setCombo(0);
    setBestCombo(0);
    setCloud(null);
    setRepPhase(REP_PHASE.WAITING);
    setHoldProgress(0);
    setRepetitionsCompleted(0);
    setRepData([]);
    setTrail([]);
    setHandPosition(null);
    setIsHandVisible(false);
    setHandLostPause(false);
    setSessionScore(null);
    setElapsedMain(0);
    setEndingSession(false);
    setFeedbackMsg(REACH_PROMPT);
    setFindStartMsg("Show your arm and hand to the camera.");
    setStreakCount(0);
    setBestStreak(0);
    setBiometrics({
      heartRate: null,
      fatigueLevel: 0,
      smoothness: 100,
      rangeOfMotion: 0,
      reactionTime: 0,
      stabilityScore: 100,
      sessionProgress: 0,
    });
    minAngleRef.current = null;
    maxAngleRef.current = 0;
    totalRomRef.current = 0;
    romCountRef.current = 0;
    hasEndedRef.current = false;
    trajectoryRef.current = [];
    stableFrameStartRef.current = null;
    prevHandForStabilityRef.current = null;
    sessionStartTimeRef.current = null;
    sessionEndTimeRef.current = null;
    repDataRef.current = [];
    papsHistoryRef.current = [];
    manualEndRef.current = false;
    reportSavedRef.current = false;
    sessionDataRef.current = null;
    if (nextTargetTimeoutRef.current) clearTimeout(nextTargetTimeoutRef.current);
    setShowCompletionPopup(false);
    clearExpiryTimer();
    telemetry.startTracking();
    setFlow(FLOW.FIND_START);
  }

  // ==================================================================
  // CLINICAL PROGRESS PANEL
  // ==================================================================
  const BiometricsPanel = () => (
    <div className="mt-2 flex flex-wrap gap-2 text-xs">
      <div className="flex items-center gap-1.5 bg-[#F8FAFC] rounded-lg px-2 py-1 border border-[#E2E8F0]">
        <Activity size={14} className="text-[#0F766E]" />
        <span>Smoothness {Math.round(biometrics.smoothness)}%</span>
      </div>
      <div className="flex items-center gap-1.5 bg-[#F8FAFC] rounded-lg px-2 py-1 border border-[#E2E8F0]">
        <TrendingUp size={14} className="text-[#2563EB]" />
        <span>ROM {romDegrees}°</span>
      </div>
      <div className="flex items-center gap-1.5 bg-[#F8FAFC] rounded-lg px-2 py-1 border border-[#E2E8F0]">
        <Target size={14} className="text-[#2563EB]" />
        <span>Accuracy {accuracy}%</span>
      </div>
      <div className="flex items-center gap-1.5 bg-[#F8FAFC] rounded-lg px-2 py-1 border border-[#E2E8F0]">
        <Zap size={14} className="text-[#D97706]" />
        <span>Fatigue {Math.round(biometrics.fatigueLevel)}%</span>
      </div>
      <div className="flex items-center gap-1.5 bg-[#F8FAFC] rounded-lg px-2 py-1 border border-[#E2E8F0]">
        <span>Session progress {Math.round(biometrics.sessionProgress)}%</span>
      </div>
    </div>
  );

  // ==================================================================
  // DEBUG PANEL
  // ==================================================================
  const distToCloud = cloud && handPosition ? Math.hypot(handPosition.x - cloud.x, handPosition.y - cloud.y) : null;
  const DebugPanel = () =>
    !showDebug ? null : (
      <div className="absolute bottom-2 left-2 z-40 rounded-lg bg-[#0F172A]/90 px-3 py-2 font-mono text-[10px] leading-tight text-[#5EEAD4] max-w-[220px]">
        <div>Hand: {isHandVisible ? "YES" : "NO"}</div>
        <div>Fingertip: {fingertip ? `${fingertip.x.toFixed(2)}, ${fingertip.y.toFixed(2)}` : "—"}</div>
        <div>Pos: {handPosition ? `${handPosition.x.toFixed(1)}, ${handPosition.y.toFixed(1)}` : "—"}</div>
        <div>Target: {cloud ? `${cloud.x.toFixed(1)}, ${cloud.y.toFixed(1)}` : "—"}</div>
        <div>Dist: {distToCloud !== null ? `${distToCloud.toFixed(1)}%` : "—"}</div>
        <div>Phase: {repPhase}</div>
        <div>Flow: {flow}</div>
        <div>Reps: {repData.length}</div>
        <div>Streak: {streakCount}</div>
      </div>
    );

  // ==================================================================
  // "KEEP GOING?" PROMPT
  // ==================================================================
  // When the planned reps or time run out, ask the patient instead of just
  // stopping. They can add 5 clouds and 1 minute (up to twice), or finish.
  requestFinishRef.current = () => {
    if (hasEndedRef.current || promptOpenRef.current) return;
    if (extensionsRef.current >= MAX_EXTENSIONS) {
      finishSessionRef.current();
      return;
    }
    promptOpenRef.current = true;
    promptStartedAtRef.current = Date.now();
    clearExpiryTimer();
    setContinuePrompt(true);
    requestPause("continue");
  };

  const handleContinueYes = () => {
    extensionsRef.current += 1;
    // the wall clock kept running while the prompt was open: give that time back
    if (sessionStartTimeRef.current) sessionStartTimeRef.current += Date.now() - promptStartedAtRef.current;
    promptOpenRef.current = false;
    setExtraReps((r) => r + CONTINUE_EXTRA_REPS);
    setExtraSeconds((x) => x + CONTINUE_EXTRA_SECONDS);
    setContinuePrompt(false);
    releasePause("continue");
    setCloud(null);
    startRest();
  };

  const handleContinueNo = () => {
    promptOpenRef.current = false;
    setContinuePrompt(false);
    releasePause("continue");
    finishSessionRef.current();
  };

  // ==================================================================
  // PHASER STAGE BRIDGE
  // ==================================================================
  const stageGameRef = useRef(null);
  const stageSceneRef = useRef(null);
  const attachStage = useCallback((el) => {
    if (!el) {
      if (stageGameRef.current) {
        stageGameRef.current.destroy(true);
        stageGameRef.current = null;
        stageSceneRef.current = null;
      }
      return;
    }
    if (stageGameRef.current) return;
    const game = createCloudReachGame(el);
    stageGameRef.current = game;
    game.events.once("ready", () => {
      const sc = game.scene.keys["CloudReachScene"];
      stageSceneRef.current = sc;
      sc.onSize = (w, h) => { stageSizeRef.current = { w, h }; };
      stageSizeRef.current = { w: sc.scale.width, h: sc.scale.height };
    });
  }, []);
  useEffect(() => () => {
    if (stageGameRef.current) { stageGameRef.current.destroy(true); stageGameRef.current = null; stageSceneRef.current = null; }
  }, []);

  useEffect(() => {
    const sc = stageSceneRef.current;
    if (!sc?.setTarget) return;
    const sp = startPositionRef.current;
    sc.setTheme?.(levelRef.current - 1);
    sc.setHome(sp.x, sp.y, ROM.neutralZoneRadiusPercent);
    const show = cloud && !cloud.popped && repPhase !== REP_PHASE.RESTING;
    sc.setTarget(show ? { x: cloud.x, y: cloud.y, size: cloud.size, label: cloud.zoneLabel, hand: cloud.hand, holding: !!cloud.holdStart } : null);
    // The reach arc for this level
    sc.setArc?.(
      { x: 50, y: 40 },
      levelPool(levelRef.current - 1, armChoiceRef.current, false).map((z) => scaledPosition(z, ROM, LEVELS[levelRef.current - 1].arc))
    );
    sc.setHold(show ? holdProgress : 0);
  });

  useEffect(() => {
    const sc = stageSceneRef.current;
    if (!sc?.setHand) return;
    sc.setHand(handPosition && isHandVisible ? handPosition : null, repPhase === REP_PHASE.DWELLING, usedSideRef.current);
  }, [handPosition, isHandVisible, repPhase]);

  useEffect(() => {
    stageSceneRef.current?.setPaused?.(isPaused);
  }, [isPaused]);

  // ==================================================================
  // RENDER
  // ==================================================================
  const cameraLarge = flow === FLOW.READY_CHECK || flow === FLOW.FIND_START || flow === FLOW.COUNTDOWN;
  const repLabel = `Rep ${String(Math.min(repetitionsCompleted + 1, targetReps)).padStart(2, "0")} / ${String(targetReps).padStart(2, "0")}`;

  return (
    <div
      className="fixed inset-0 bg-[#F8FAFC] text-[#0F172A] overflow-hidden"
      style={{
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <SessionCheckpoint
        open={continuePrompt}
        title="Great reaching! Want to keep going?"
        subtitle={`${popped} clouds reached so far. You choose.`}
        extendLabel={`😊 Yes, ${CONTINUE_EXTRA_REPS} more clouds`}
        continueLabel={null}
        finishLabel="✅ I'm done for today"
        onExtend={handleContinueYes}
        onFinish={handleContinueNo}
      />
      {/* This wrapper is itself absolutely positioned and offset by
          shellHeaderOffset — it becomes the real containing block for
          every top-0/inset-0 child below, which padding could never do. */}
      <div className="absolute inset-0" style={{ top: shellHeaderOffset }}>
        {/* PERSISTENT CAMERA */}
        <div
          className={
            flow === FLOW.READY_CHECK
              ? "absolute left-3 top-3 w-[92%] md:w-[44%] aspect-video rounded-2xl overflow-hidden border border-[#E2E8F0] shadow-sm z-10"
              : cameraLarge
              ? "absolute inset-x-0 top-0 mx-auto mt-4 sm:mt-8 w-[92%] sm:w-[640px] max-w-full aspect-video rounded-2xl overflow-hidden border border-[#E2E8F0] shadow-sm z-10"
              : "absolute right-2 bottom-2 sm:right-4 sm:bottom-4 w-36 h-24 sm:w-52 sm:h-36 rounded-xl overflow-hidden border-2 border-white/80 shadow-lg z-40"
          }
        >
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full scale-x-[-1] object-cover" />
          <SkeletonOverlay poseData={poseData} overallStatus={guidance.overallStatus} shoulderAngle={shoulderAngle} />
          <div className="absolute top-1 right-1 rounded bg-white/90 border border-[#E2E8F0] px-1.5 py-0.5 font-mono text-[9px] sm:text-xs text-[#0F172A]">
            {handTrackingReady ? "● Tracking" : "⚠ Initializing"}
          </div>
          {!cameraLarge && (
            <div className="absolute bottom-0.5 right-0.5 flex gap-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isHandVisible ? "bg-[#16A34A]" : "bg-[#D97706]"}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${guidance.overallStatus === "ok" ? "bg-[#16A34A]" : "bg-[#D97706]"}`} />
            </div>
          )}
          {therapistView && (
            <div className="absolute top-1 left-1 rounded bg-[#0F172A]/80 text-white px-1 text-[8px] sm:text-[10px] font-mono leading-tight">
              {Math.round(shoulderAngle)}° {activeSide} · PAPS {papsScore}
            </div>
          )}
        </div>

        {/* READY_CHECK */}
        {flow === FLOW.READY_CHECK && (
          <div className="absolute inset-y-0 right-0 left-0 md:left-[47%] flex flex-col items-center overflow-y-auto pb-24 pt-[calc(4rem+min(52vw,360px))] md:pt-6 px-4">
            <h1 className="mb-1 text-2xl font-bold text-[#0F172A]">Cloud Reach Therapy</h1>
            <p className="mb-4 max-w-md text-center text-sm text-[#64748B]">
              Reach to each cloud and pop it. This is an exercise tool, not a medical device.
            </p>
            <div className="mb-4 w-full max-w-2xl">
              <HowToPlay
                theme="light"
                variant="reach"
                caption="Reach the cloud and hold"
                steps={[
                  "Sit back so your shoulders and hand show on the camera.",
                  "A cloud appears and tells you which hand to use (blue = left, orange = right). Reach to it and hold still until it pops.",
                  "Bring your hand back to the middle circle. The next cloud appears.",
                ]}
                scoring={[
                  "Hold your hand on the cloud for about half a second to pop it.",
                  "A cloud fades after 7 seconds if you do not reach it.",
                  "Move smoothly. If you move too fast, the game asks you to slow down.",
                  "Each level widens the arc: clouds appear further up, down and out, and get smaller.",
                ]}
                trains="reaching in all directions, control and smooth movement."
              />
            </div>

            <div className="mb-4 flex flex-col items-center gap-2">
              <div className="text-sm font-semibold text-[#334155]">Which arm will you use?</div>
              <div className="inline-flex overflow-hidden rounded-xl border border-[#CBD5E1] bg-white shadow-sm">
                {[["both", "Both arms"], ["left", "Left arm only"], ["right", "Right arm only"]].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setArmChoice(id)}
                    className={`px-4 py-2 text-sm font-semibold ${armChoice === id ? "bg-[#0F766E] text-white" : "text-[#334155] hover:bg-[#F1F5F9]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="max-w-xs text-center text-xs text-[#64748B]">With both arms, each cloud tells you which hand to use. Pick one arm if you only use one.</div>
            </div>
            <div
              className={`mb-4 max-w-md rounded-xl border px-4 py-2 text-center text-sm ${guidance.overallStatus === "ok" ? "border-[#16A34A]/30 bg-[#16A34A]/10 text-[#166534]" : "border-[#D97706]/30 bg-[#D97706]/10 text-[#92400E]"
                }`}
            >
              {guidance.message || "Place your hand in view of the camera to begin."}
            </div>
            <button
              onClick={resetForNewSession}
              disabled={!guidance.isReady || !isActive || !handTrackingReady}
              className="rounded-xl bg-[#2563EB] px-8 py-3 font-semibold text-white shadow-sm hover:bg-[#1D4ED8] disabled:bg-[#E2E8F0] disabled:text-[#94A3B8]"
            >
              {!handTrackingReady ? "Initializing hand tracking..." : guidance.isReady && isActive ? "Start Session" : "Waiting for camera..."}
            </button>
          </div>
        )}

        {/* FIND_START */}
        {flow === FLOW.FIND_START && (
          <div className="absolute inset-0 flex flex-col items-center pt-[calc(4rem+min(52vw,360px))] sm:pt-[26rem] px-4">
            <div className={`text-xl font-semibold mb-2 ${findStartMsg === "Ready!" ? "text-[#16A34A]" : "text-[#0F766E]"}`}>{findStartMsg}</div>
            <div className="mt-1 max-w-md text-center text-sm text-[#64748B]">Rest your arm comfortably in front of you. Your starting spot is saved when you hold still.</div>
          </div>
        )}

        {/* COUNTDOWN */}
        {flow === FLOW.COUNTDOWN && (
          <div className="absolute inset-0 flex items-end justify-center pb-12 z-20 pointer-events-none">
            <div className="text-7xl sm:text-8xl font-bold text-[#0F766E]">{countdown || "GO!"}</div>
          </div>
        )}

        {/* PLAYING */}
        {flow === FLOW.PLAYING && (
          <>
            {isPainDetected && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40">
                <div className="rounded-2xl bg-white border border-[#E2E8F0] shadow-lg p-8 text-center max-w-md mx-4">
                  <h2 className="mb-3 text-xl font-semibold text-[#DC2626]">Discomfort Detected</h2>
                  <p className="mb-6 text-[#475569]">Please rest before resuming.</p>
                  <button
                    onClick={() => {
                      resetPainState();
                      resumeSession();
                    }}
                    className="rounded-lg bg-[#2563EB] px-6 py-2 font-semibold text-white hover:bg-[#1D4ED8]"
                  >
                    Resume
                  </button>
                </div>
              </div>
            )}

            {/* SLIM TOP BAR: floats over the stage so the game gets the whole screen */}
            <div ref={headerRef} className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
              <div className="pointer-events-auto flex flex-wrap items-center gap-2 text-xs sm:text-sm font-semibold">
                <span className="rounded-full bg-white/90 px-3 py-1.5 text-[#0F172A] shadow-sm border border-[#E2E8F0]">☁️ Cloud Reach</span>
                <span className="rounded-full bg-[#0F766E] px-3 py-1.5 text-white shadow-sm">{LEVELS[level - 1].name}</span>
                <span className="rounded-full bg-white/90 px-3 py-1.5 text-[#0F172A] shadow-sm border border-[#E2E8F0]">{repLabel}</span>
                <span className="rounded-full bg-white/90 px-3 py-1.5 font-mono text-[#0F172A] shadow-sm border border-[#E2E8F0]">⏱ {formatTime(Math.max(0, mainSeconds - elapsedMain))}</span>
                <span className="rounded-full bg-white/90 px-3 py-1.5 shadow-sm border border-[#E2E8F0]">
                  <span className="text-[#16A34A]">✓ {popped}</span>
                  <span className="mx-1 text-[#CBD5E1]">|</span>
                  <span className="text-[#DC2626]">✗ {missed}</span>
                </span>
                <span className="rounded-full bg-white/90 px-3 py-1.5 text-[#0F172A] shadow-sm border border-[#E2E8F0]">
                  {papsScore < 3 ? "😊 Comfortable" : papsScore < 7 ? "😐 Take care" : "😣 Rest"}
                </span>
                {streakCount >= 3 && <span className="rounded-full bg-[#FEF3C7] px-3 py-1.5 text-[#92400E] shadow-sm border border-[#FDE68A]">🔥 Streak {streakCount}</span>}
              </div>
              <div className="pointer-events-auto flex flex-shrink-0 gap-2">
                <button
                  onClick={handleEndSessionClick}
                  disabled={endingSession}
                  title="End Session"
                  aria-label="End Session"
                  className="flex items-center gap-1.5 rounded-full bg-[#DC2626] px-3 py-2 text-white shadow-sm hover:bg-[#B91C1C] disabled:opacity-60 text-xs sm:text-sm font-semibold"
                >
                  <LogOut size={16} />
                  <span className="hidden sm:inline">End</span>
                </button>
                <button onClick={() => setShowDebug((d) => !d)} className={`rounded-full p-2 shadow-sm border ${showDebug ? "bg-[#0F766E]/10 border-[#0F766E]/30 text-[#0F766E]" : "bg-white/90 border-[#E2E8F0] text-[#475569]"}`} title="Toggle debug">
                  <Bug size={16} />
                </button>
                <button onClick={() => (isPaused ? resumeSession() : pauseSession())} className="rounded-full bg-white/90 border border-[#E2E8F0] p-2 text-[#475569] shadow-sm hover:bg-white">
                  {isPaused ? <Play size={16} /> : <Pause size={16} />}
                </button>
              </div>
            </div>

            {/* GAME AREA */}
            <div
              className="absolute inset-0 overflow-hidden bg-gradient-to-b from-[#EFF6FF] via-[#E0F2FE] to-[#F8FAFC]"
            >
              {flash && (
                <div
                  key={flash.key}
                  className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-2xl sm:text-4xl font-semibold ${flash.type === "pop" ? "text-[#16A34A]" : "text-[#DC2626]"}`}
                  style={{ animation: "cloud-flash 400ms ease-out forwards" }}
                >
                  {flash.type === "pop" ? "✓ Target reached" : "Missed — that's okay"}
                </div>
              )}

              {repPhase === REP_PHASE.RESTING && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
                  <div className="text-center px-4">
                    <div className="text-xl sm:text-2xl font-semibold text-[#92400E]">Take a moment</div>
                    <div className="text-3xl sm:text-4xl font-mono mt-2 text-[#0F172A]">{Math.round(restTimer / 1000)}s</div>
                  </div>
                </div>
              )}

              {/* Phaser stage: sky, clouds, hand cursor, hold ring, pop effects */}
              <div ref={attachStage} className="absolute inset-0" style={{ zIndex: 1 }} />

              <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 text-center px-4 max-w-[92%] z-10">
                <div className="text-sm sm:text-base text-[#0F172A]/90 bg-white/80 backdrop-blur rounded-lg px-3 py-1.5 border border-[#E2E8F0]">{feedbackMsg}</div>
                {cloud && !cloud.popped && repPhase !== REP_PHASE.RESTING && cloud.hand && (
                  <div
                    className="mb-1 inline-block rounded-full px-4 py-1.5 text-sm sm:text-base font-extrabold text-white shadow-md"
                    style={{ background: cloud.hand === "left" ? "#0891B2" : "#EA580C" }}
                  >
                    {cloud.hand === "left" ? "✋ Use your LEFT hand" : "Use your RIGHT hand ✋"}
                  </div>
                )}
                {handLostPause && <div className="mt-1 text-xs text-[#D97706]">{NO_HAND_MESSAGE}</div>}
                {sittingTooClose && !handLostPause && (
                  <div className="mt-1 rounded-lg bg-[#FEF3C7] px-3 py-1 text-xs font-semibold text-[#92400E] border border-[#FDE68A]">
                    Sit a little further back so your arms stay in the camera picture.
                  </div>
                )}
              </div>
            </div>

            <DebugPanel />
          </>
        )}

        {/* DONE — completion popup shown first, zero-delay */}
        {flow === FLOW.DONE && showCompletionPopup && (
          <SessionCompletionPopup
            metrics={sessionScore}
            targetReps={targetReps}
            onViewReport={() => setShowCompletionPopup(false)}
          />
        )}

        {/* DONE — full report, revealed after the popup */}
        {flow === FLOW.DONE && !showCompletionPopup &&
          (() => {
            let metrics;
            try {
              metrics = sessionScore || computeSessionMetrics();
            } catch (err) {
              console.error("[CloudReach] DONE screen metrics failed:", err);
              return (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#F8FAFC] px-6 text-center">
                  <div className="text-xl font-semibold text-[#0F172A]">Session ended</div>
                  <div className="text-sm text-[#64748B] max-w-sm">
                    We couldn't build the full results screen, but your completed reps were recorded.
                  </div>
                  <button onClick={() => onSessionEnd?.(null)} className="rounded-lg bg-[#2563EB] px-6 py-2 font-semibold text-white hover:bg-[#1D4ED8]">
                    Continue
                  </button>
                </div>
              );
            }

            // sessionData was already built once, inside finishSession()
            // (a plain callback — never during render); see sessionDataRef
            // above. Render only reads it here — it is never rebuilt and
            // saveReport is never called from render. The actual save
            // happens in the dedicated useEffect above, keyed on
            // flow === FLOW.DONE. If sessionDataRef is somehow empty
            // (finishSession's own try/catch caught an error while
            // building it), fall back to a minimal shape so the summary
            // can still render instead of crashing.
            const sessionData = sessionDataRef.current || {
              sessionId: telemetry.sessionId,
              gameId,
              patientId,
              date: new Date().toISOString(),
              durationSeconds: metrics.totalSessionDuration,
              score: metrics.total,
              accuracyPercent: metrics.accuracy,
              reps: metrics.attemptedReps,
              hitsOrCatchesOrCompletions: metrics.successfulReps,
              missesOrDrops: metrics.missedReps,
              gameSpecificMetrics: { fullMetrics: metrics },
            };

          return (
              <SessionSummaryErrorBoundary
                fallback={
                  <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#F8FAFC] px-6 text-center">
                    <div className="text-xl font-semibold text-[#0F172A]">
                      Session complete — {metrics.successfulReps}/{targetReps} reps
                    </div>
                    <div className="text-sm text-[#64748B] max-w-sm">The detailed report couldn't be displayed.</div>
                    <button onClick={() => onSessionEnd?.(sessionData)} className="rounded-lg bg-[#2563EB] px-6 py-2 font-semibold text-white hover:bg-[#1D4ED8]">
                      Continue
                    </button>
                  </div>
                }
              >
                <div className="absolute inset-0 z-40 overflow-y-auto bg-[#F8FAFC]">
                  <SessionSummary
                    sessionData={sessionData}
                    gameName="Cloud Reach"
                    gameId={gameId}
                    onSaveReport={async () => telemetry.saveReport(sessionData)}
                    onFinish={() => onSessionEnd?.(sessionData)}
                  />
                </div>
              </SessionSummaryErrorBoundary>
            );
          })()}

      </div>

      <style>{`
        @keyframes cloud-flash {
          0% { opacity: 0; transform: scale(0.9); }
          30% { opacity: 1; transform: scale(1.03); }
          100% { opacity: 0; transform: scale(1); }
        }
        @keyframes cloud-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.035); opacity: 0.92; }
        }
        .cloud-pulse {
          animation: cloud-pulse 2.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .cloud-flash, .cloud-pulse, [style*="cloud-flash"] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
} 

