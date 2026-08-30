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
import useAdaptiveDifficulty from "../hooks/useAdaptiveDifficulty";
import { useGameEngine, GAME_STATES } from "../hooks/useGameEngine";
import { useSessionTelemetry } from "../hooks/useSessionTelemetry";
import { useAudioFeedback } from "../hooks/useAudioFeedback";
import SkeletonOverlay from "../components/rehab/SkeletonOverlay";
import SessionSummary from "../components/rehab/SessionSummary";
import MetricsEngine from "../utils/metricsEngine";

// ==================================================================
// THERAPIST-CONFIGURABLE SETTINGS
// ==================================================================
const DEFAULT_ROM_CONFIG = {
  minHeightPercent: 20,
  maxHeightPercent: 60,
  leftBoundaryPercent: 15,
  rightBoundaryPercent: 85,
  neutralZoneRadiusPercent: 8,
  neutralX: 50,
  neutralY: 65,
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

const TARGET_HIT_RADIUS_PERCENT = 9;
const CLOUD_LIFETIME_SECONDS = 12;
const REST_INTERVAL_MS = 1500;
const MIN_REACH_MOVEMENT = 4;
const MAX_SAFE_SPEED = 55;
const TRAIL_SAMPLE_MS = 90;
const STABLE_START_MS = 700;

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

function zoneToPosition(zone, rom) {
  const height = rom.maxHeightPercent - rom.minHeightPercent;
  const width = rom.rightBoundaryPercent - rom.leftBoundaryPercent;
  return {
    x: clamp(rom.leftBoundaryPercent + width * zone.xFrac, rom.leftBoundaryPercent, rom.rightBoundaryPercent),
    y: clamp(rom.minHeightPercent + height * zone.yFrac, rom.minHeightPercent, rom.maxHeightPercent),
  };
}

function spawnCloud(difficulty, rom, forceCenter) {
  const settings = DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.Beginner;

  let pool;
  if (forceCenter) {
    pool = REACH_ZONES.filter((z) => z.id === "center" || z.id === "upper-center");
  } else {
    pool = REACH_ZONES.filter((z) => settings.zonePool.includes(z.id));
  }

  const zone = pool[Math.floor(Math.random() * pool.length)] || REACH_ZONES[0];
  const pos = zoneToPosition(zone, rom);

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    x: pos.x,
    y: pos.y,
    size: settings.cloudSize,
    dwellMs: settings.dwellMs,
    zoneId: zone.id,
    zoneLabel: zone.label,
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

function CloudSVG({ sizePx, active }) {
  const glowColor = "rgb(15,118,110)"; // single clinical teal accent

  return (
    <svg width={sizePx} height={sizePx * 0.62} viewBox="0 0 100 62" style={{ overflow: "visible" }}>
      {active && <ellipse cx="50" cy="34" rx="46" ry="26" fill={glowColor} opacity="0.18" />}

      <g filter="url(#cloud-shadow)">
        <ellipse cx="30" cy="38" rx="20" ry="16" fill={active ? "#E0F2F1" : "#ffffff"} />
        <ellipse cx="55" cy="30" rx="24" ry="20" fill={active ? "#E0F2F1" : "#ffffff"} />
        <ellipse cx="76" cy="40" rx="17" ry="14" fill={active ? "#E0F2F1" : "#ffffff"} />
        <ellipse cx="50" cy="46" rx="34" ry="14" fill={active ? "#E0F2F1" : "#ffffff"} />
      </g>

      {active && <circle cx="50" cy="31" r="46" fill="none" stroke={glowColor} strokeWidth="2" opacity="0.6" />}

      <defs>
        <filter id="cloud-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.18" />
        </filter>
      </defs>
    </svg>
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
}) {
  const videoRef = useRef(null);
  const [poseData, setPoseData] = useState(null);

  const ROM = useMemo(() => ({ ...DEFAULT_ROM_CONFIG, ...romConfig }), [romConfig]);
  const SESSION = useMemo(() => ({ ...DEFAULT_SESSION_CONFIG, ...sessionConfig }), [sessionConfig]);

  const [flow, setFlow] = useState(FLOW.READY_CHECK);
  const [showDebug, setShowDebug] = useState(debugModeDefault);
  const [findStartMsg, setFindStartMsg] = useState("Place your hand in the starting area.");
  const [cloud, setCloud] = useState(null);
  const [repPhase, setRepPhase] = useState(REP_PHASE.WAITING);
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
  const HAND_LOST_PAUSE_FRAMES = 20;
  const stableFrameStartRef = useRef(null);
  const prevHandForStabilityRef = useRef(null);
  const minAngleRef = useRef(null);
  const maxAngleRef = useRef(0);
  const totalRomRef = useRef(0);
  const romCountRef = useRef(0);
  const hasEndedRef = useRef(false);
  const restTimerRef = useRef(null);
  const expiryTimerRef = useRef(null);
  const mainTimerRef = useRef(null);
  const metricsEngine = useRef(new MetricsEngine());
  const lastSlowdownNoticeRef = useRef(0);
  const sessionStartTimeRef = useRef(null);
  const sessionEndTimeRef = useRef(null);

  const { isActive } = useMediaPipeUpperBody({ videoRef, onPoseUpdate: setPoseData });

  const { fingertip, isReady: handTrackingReady, error: handTrackingError } = useHandTracking({
    videoRef,
    numHands: 1,
    debug: debugHandTracking,
    enabled: flow !== FLOW.DONE,
  });

  const { shoulderAngle, activeSide } = usePoseDetection(poseData);
  const guidance = usePostureGuidance(poseData);
  const { papsScore, isPainDetected, resetPainState } = useFacialPainDetection({ videoRef });
  const { currentDifficulty, adapt } = useAdaptiveDifficulty();
  const telemetry = useSessionTelemetry(patientId, gameId);
  const audio = useAudioFeedback(true);

  const engine = useGameEngine({
    sessionLength: SESSION.mainSeconds,
    onRepComplete: () => {},
    onSessionComplete: () => finishSession(),
  });
  const { gameState, countdown, isPaused, startSession, pauseSession, resumeSession } = engine;

  // ==================================================================
  // HAND POSITION
  // ==================================================================
  const getHandPosition = useCallback(() => {
    if (!fingertip || !handTrackingReady) return null;
    return {
      x: (1 - fingertip.x) * 100,
      y: fingertip.y * 100,
      confidence: typeof fingertip.confidence === "number" ? fingertip.confidence : null,
    };
  }, [fingertip, handTrackingReady]);

  useEffect(() => {
    const pos = getHandPosition();
    const valid = pos && pos.x >= 0 && pos.x <= 100 && pos.y >= 0 && pos.y <= 100;
    if (valid) {
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

  useEffect(() => {
    if (flow !== FLOW.PLAYING) return;
    if (handLostPause && !isPaused) pauseSession();
    else if (!handLostPause && isPaused && repPhase !== REP_PHASE.RESTING) resumeSession();
  }, [handLostPause, flow]);

  // ==================================================================
  // FIND_START
  // ==================================================================
  useEffect(() => {
    if (flow !== FLOW.FIND_START) return;
    if (!handPosition || !isHandVisible) {
      stableFrameStartRef.current = null;
      setFindStartMsg("Place your hand in the starting area.");
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

      const progress = Math.min(100, (secs / SESSION.mainSeconds) * 100);
      setBiometrics((prev) => ({
        ...prev,
        sessionProgress: progress,
      }));

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

      if (secs >= SESSION.mainSeconds) clearInterval(mainTimerRef.current);
    }, 1000);
    return () => clearInterval(mainTimerRef.current);
  }, [flow, SESSION.mainSeconds, repData]);

  useEffect(() => {
    if (flow !== FLOW.PLAYING) return;
    if (elapsedMain >= SESSION.mainSeconds || repetitionsCompleted >= SESSION.targetReps) {
      finishSession();
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
    if (repResult && shoulderAngle > 0 && isHandVisible) {
      if (minAngleRef.current === null || shoulderAngle < minAngleRef.current) minAngleRef.current = shoulderAngle;
      if (shoulderAngle > maxAngleRef.current) maxAngleRef.current = shoulderAngle;
    }
  }, [flow, isPaused, shoulderAngle, isHandVisible]);

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
      setRepData((prev) => [...prev, entry]);
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

  // ==================================================================
  // HANDLE REP COMPLETION
  // ==================================================================
  const handleRepSuccess = useCallback(
    (cloudRef) => {
      clearExpiryTimer();
      cloudRef.popped = true;
      setCloud({ ...cloudRef });
      setRepPhase(REP_PHASE.COMPLETED);

      setPopped((p) => p + 1);
      setTotalAttempts((a) => a + 1);
      setCombo((c) => {
        const next = c + 1;
        setBestCombo((best) => Math.max(best, next));
        if (next === 5 || next === 10 || next === 20) {
          audio.playSuccess();
        }
        return next;
      });

      setStreakCount((prev) => {
        const newStreak = prev + 1;
        setBestStreak((best) => Math.max(best, newStreak));
        return newStreak;
      });

      audio.playSuccess();

      const celebrationMsg = ENCOURAGEMENT[Math.floor(Math.random() * ENCOURAGEMENT.length)];
      showMilestone(celebrationMsg);
      recordRep("success", cloudRef);
      setRepetitionsCompleted((r) => r + 1);

      setTimeout(() => {
        setCloud(null);
        startRest();
      }, 500);
    },
    [clearExpiryTimer, recordRep, audio, showMilestone]
  );

  const startRest = useCallback(() => {
    setRepPhase(REP_PHASE.RESTING);
    setCloud(null);
    setHoldProgress(0);
    clearExpiryTimer();
    setRestTimer(REST_INTERVAL_MS);
    restTimerRef.current = setInterval(() => {
      setRestTimer((prev) => {
        if (prev <= 100) {
          clearInterval(restTimerRef.current);
          setRepPhase(REP_PHASE.WAITING);
          return 0;
        }
        return prev - 100;
      });
    }, 100);
  }, [clearExpiryTimer]);

  // ==================================================================
  // SPAWN TARGET
  // ==================================================================
  const spawnNextTarget = useCallback(
    (firstTarget = false) => {
      if (repetitionsCompleted >= SESSION.targetReps) {
        finishSession();
        return;
      }

      trajectoryRef.current = [];
      setTrail([]);
      startPositionRef.current = handPosition ? { ...handPosition } : startPositionRef.current;

      const newCloud = spawnCloud(currentDifficulty, ROM, firstTarget);

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
        setFlash({ type: "miss", key: Date.now() });
        setTimeout(() => setFlash(null), 400);
        setFeedbackMsg("No rush — let's try the next one.");
        setRepetitionsCompleted((r) => r + 1);
        startRest();
      }, CLOUD_LIFETIME_SECONDS * 1000);
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
    const inZone = distToCloud < TARGET_HIT_RADIUS_PERCENT;

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
  }, [flow, isPaused, cloud, handPosition, isHandVisible, repPhase, handleRepSuccess]);

  useEffect(() => {
    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
      if (mainTimerRef.current) clearInterval(mainTimerRef.current);
      clearExpiryTimer();
    };
  }, [clearExpiryTimer]);

  // ==================================================================
  // ADAPTIVE DIFFICULTY
  // ==================================================================
  useEffect(() => {
    if (flow !== FLOW.PLAYING || isPaused) return;
    const timer = setInterval(() => {
      adapt({
        accuracy,
        papsScore,
        combo: bestCombo,
        smoothness: recentSmoothness,
        fatigueLevel: biometrics.fatigueLevel,
      });
    }, 12000);
    return () => clearInterval(timer);
  }, [flow, isPaused, adapt, accuracy, papsScore, bestCombo, recentSmoothness, biometrics.fatigueLevel]);

  useEffect(() => {
    if (!isPainDetected || flow !== FLOW.PLAYING) return;
    pauseSession();
    telemetry.trackPain(papsScore);
    setFeedbackMsg("Let's pause for a moment.");
  }, [isPainDetected, flow, pauseSession, telemetry, papsScore]);

  // ==================================================================
  // COMPUTE SESSION METRICS
  // ==================================================================
  const computeSessionMetrics = useCallback(() => {
    const completed = repData.filter((r) => r.isCorrect);
    const missedTimeouts = repData.filter((r) => !r.isCorrect && !r.incompleteTarget);
    const incomplete = repData.filter((r) => r.incompleteTarget);
    const attemptedReps = repData.length;
    const successfulReps = completed.length;
    const successRate = attemptedReps > 0 ? successfulReps / attemptedReps : 0;

    const accuracyValues = repData.map((r) => r.accuracy);
    const smoothnessValues = repData.map((r) => r.smoothness);
    const pathEfficiencyValues = repData.map((r) => r.pathEfficiency);
    const movementQualityValues = repData.map((r) => r.movementQuality);
    const confidenceValues = repData.map((r) => r.confidence).filter((c) => typeof c === "number");

    const averageAccuracy = average(accuracyValues);
    const averageSmoothness = average(smoothnessValues);
    const averagePathEfficiency = average(pathEfficiencyValues);
    const averageMovementQuality = average(movementQualityValues);

    const consistencyFrom = (values, spread = 40) => (values.length < 2 ? 100 : clamp(100 - (stdDev(values) / spread) * 100, 0, 100));
    const consistency = average([
      consistencyFrom(accuracyValues),
      consistencyFrom(smoothnessValues),
      consistencyFrom(repData.map((r) => r.plannedReachDistance), 20),
    ]);

    const sessionScoreTotal = Math.round(averageAccuracy * 0.4 + averageSmoothness * 0.3 + averagePathEfficiency * 100 * 0.2 + consistency * 0.1);

    sessionEndTimeRef.current = sessionEndTimeRef.current || Date.now();
    const totalSessionDuration = sessionStartTimeRef.current ? Math.round((sessionEndTimeRef.current - sessionStartTimeRef.current) / 1000) : elapsedMain;

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
      averageReachDistance: Math.round(average(repData.map((r) => r.plannedReachDistance)) * 10) / 10,
      averageActualPathLength: Math.round(average(repData.map((r) => r.actualPathLength)) * 10) / 10,
      averagePathEfficiency: Math.round(averagePathEfficiency * 100) / 100,
      averageMovementDuration: Math.round(average(repData.map((r) => r.movementDuration)) * 100) / 100,
      maximumReachDistance: repData.length ? Math.max(...repData.map((r) => r.maximumReachDistance)) : 0,
      maximumVerticalReach: repData.length ? Math.max(...repData.map((r) => r.peakVerticalReach)) : 0,
      maximumHorizontalReach: repData.length ? Math.max(...repData.map((r) => r.peakHorizontalReach)) : 0,
      averageTrackingConfidence: confidenceValues.length > 0 ? Math.round(average(confidenceValues)) : null,
      consistency: Math.round(consistency),
      totalSessionDuration,
      total: sessionScoreTotal,
      accuracy: Math.round(averageAccuracy),
      smoothness: Math.round(averageSmoothness),
      reachQuality: Math.round(clamp((average(repData.map((r) => r.plannedReachDistance)) / 35) * 100, 0, 100)),
      bestStreak,
      mode: EXERCISE_MODE_ID,
    };
  }, [repData, elapsedMain, bestStreak]);

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
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
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
        attemptedReps: repData.length,
        successfulReps: repData.filter((r) => r.isCorrect).length,
        missedReps: 0,
        incompleteReps: 0,
        averageReachDistance: 0,
        maximumReachDistance: 0,
        averageMovementDuration: 0,
        totalSessionDuration: elapsedMain,
        bestStreak: 0,
        mode: EXERCISE_MODE_ID,
      };
    }
    setSessionScore(metrics);

    try {
      telemetry.endSession({
        gameName: "Cloud Reach",
        score: metrics.total,
        popped: metrics.successfulReps,
        missed: metrics.missedReps,
        accuracy: metrics.accuracy,
        bestCombo,
        // FIX (spec #20.1): SessionSummary reads `longestHitStreak`; this
        // game has always tracked the identical concept as `bestCombo`.
        // Both keys carry the same value so nothing downstream breaks.
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
        gameSpecific: {
          totalAttempts: metrics.attemptedReps,
          incompleteReps: metrics.incompleteReps,
          completionRate: SESSION.targetReps > 0 ? Math.round((metrics.successfulReps / SESSION.targetReps) * 100) : 0,
          repData,
          scoreBreakdown: { total: metrics.total, accuracy: metrics.accuracy, smoothness: metrics.smoothness, reachQuality: metrics.reachQuality, consistency: metrics.consistency },
          fullMetrics: metrics,
          romConfig: ROM,
          sessionStartTime: sessionStartTimeRef.current,
          sessionEndTime: sessionEndTimeRef.current,
          exerciseMode: EXERCISE_MODE_ID,
          bestStreak: metrics.bestStreak,
        },
      });
    } catch (err) {
      console.error("[CloudReach] telemetry.endSession failed:", err);
    }

    setFlow(FLOW.DONE);
  }

  const handleEndSessionClick = useCallback(() => {
    if (endingSession || hasEndedRef.current) return;
    setEndingSession(true);
    finalizeInProgressTarget();
    finishSession();
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
    setFindStartMsg("Place your hand in the starting area.");
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
  // RENDER
  // ==================================================================
  const cameraLarge = flow === FLOW.READY_CHECK || flow === FLOW.FIND_START || flow === FLOW.COUNTDOWN;
  const repLabel = `Rep ${String(Math.min(repetitionsCompleted + 1, SESSION.targetReps)).padStart(2, "0")} / ${String(SESSION.targetReps).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 bg-[#F8FAFC] text-[#0F172A] overflow-hidden">
      {/* PERSISTENT CAMERA */}
      <div
        className={
          cameraLarge
            ? "absolute inset-x-0 top-0 mx-auto mt-4 sm:mt-8 w-[92%] sm:w-[640px] max-w-full aspect-video rounded-2xl overflow-hidden border border-[#E2E8F0] shadow-sm z-10"
            : "absolute top-14 sm:top-16 right-2 sm:right-4 w-24 h-16 sm:w-40 sm:h-28 rounded-lg overflow-hidden border border-[#E2E8F0] shadow-md z-30"
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
        <div className="absolute inset-0 flex flex-col items-center pt-[calc(4rem+min(52vw,360px))] sm:pt-[26rem] px-4">
          <h1 className="mb-1 text-2xl font-bold text-[#0F172A]">Cloud Reach Therapy</h1>
          <p className="mb-4 max-w-md text-center text-sm text-[#64748B]">
            Reach up and hold each target when you're ready to begin. This is an exercise tool, not a medical device.
          </p>

          <div
            className={`mb-4 max-w-md rounded-xl border px-4 py-2 text-center text-sm ${
              guidance.overallStatus === "ok" ? "border-[#16A34A]/30 bg-[#16A34A]/10 text-[#166534]" : "border-[#D97706]/30 bg-[#D97706]/10 text-[#92400E]"
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
          {handPosition && (
            <div
              className="fixed w-7 h-7 rounded-full border-4 border-[#2563EB] bg-[#2563EB]/15 shadow-sm pointer-events-none z-20"
              style={{ left: `${handPosition.x}%`, top: `${handPosition.y}%`, transform: "translate(-50%, -50%)", transition: "left 0.05s, top 0.05s" }}
            />
          )}
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

          {/* END SESSION */}
          <div className="absolute z-40 flex items-center right-[6.75rem] sm:right-[11.25rem]" style={{ top: "3.75rem", height: "4rem" }}>
            <button
              onClick={handleEndSessionClick}
              disabled={endingSession}
              title="End Session"
              aria-label="End Session"
              className="flex items-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2.5 sm:px-5 sm:py-3 text-white hover:bg-[#B91C1C] active:bg-[#991B1B] disabled:opacity-60 text-sm sm:text-base font-semibold shadow-sm border border-[#DC2626]/30"
            >
              <LogOut size={20} className="sm:w-6 sm:h-6" />
              <span>End Session</span>
            </button>
          </div>

          {/* TOP HEADER */}
          <div className="absolute top-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-b border-[#E2E8F0] px-3 sm:px-6 py-2 sm:py-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm sm:text-lg font-semibold text-[#0F172A] truncate">Cloud Reach Therapy</div>
                <div className="text-[10px] sm:text-xs text-[#64748B]">
                  {repLabel} · {formatTime(Math.max(0, SESSION.mainSeconds - elapsedMain))}
                  <span className="ml-2 text-[#0F766E] font-medium">{(DIFFICULTY_SETTINGS[currentDifficulty] || DIFFICULTY_SETTINGS.Beginner).label}</span>
                  {streakCount >= 3 && <span className="ml-2 text-[#D97706] font-medium">Streak {streakCount}</span>}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setShowDebug((d) => !d)}
                  className={`rounded-lg p-2 border ${showDebug ? "bg-[#0F766E]/10 border-[#0F766E]/30 text-[#0F766E]" : "bg-white border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]"}`}
                  title="Toggle debug"
                >
                  <Bug size={16} />
                </button>
                <button onClick={() => (isPaused ? resumeSession() : pauseSession())} className="rounded-lg bg-white border border-[#E2E8F0] p-2 text-[#475569] hover:bg-[#F1F5F9]">
                  {isPaused ? <Play size={16} /> : <Pause size={16} />}
                </button>
              </div>
            </div>

            <BiometricsPanel />
          </div>

          {/* GAME AREA */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#EFF6FF] via-[#E0F2FE] to-[#F8FAFC]">
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

            <div
              className="absolute rounded-full border border-[#0F766E]/25 bg-[#0F766E]/5 pointer-events-none"
              style={{
                left: `${startPositionRef.current?.x ?? ROM.neutralX}%`,
                top: `${startPositionRef.current?.y ?? ROM.neutralY}%`,
                width: `${ROM.neutralZoneRadiusPercent * 2}%`,
                height: `${ROM.neutralZoneRadiusPercent * 2}%`,
                transform: "translate(-50%, -50%)",
              }}
            />

            {cloud && repPhase !== REP_PHASE.RESTING && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 4 }}>
                <line
                  x1={`${startPositionRef.current.x}%`}
                  y1={`${startPositionRef.current.y}%`}
                  x2={`${cloud.x}%`}
                  y2={`${cloud.y}%`}
                  stroke="rgba(15,23,42,0.15)"
                  strokeWidth={2}
                  strokeDasharray="4 6"
                />
              </svg>
            )}

            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
              {trail.length > 1 &&
                trail.slice(1).map((p, i) => {
                  const prev = trail[i];
                  const opacity = ((i + 1) / trail.length) * 0.5;
                  return <line key={i} x1={`${prev.x}%`} y1={`${prev.y}%`} x2={`${p.x}%`} y2={`${p.y}%`} stroke="#2563EB" strokeWidth={2} strokeOpacity={opacity} strokeLinecap="round" />;
                })}
              {repPhase !== REP_PHASE.WAITING && startPositionRef.current && (
                <circle cx={`${startPositionRef.current.x}%`} cy={`${startPositionRef.current.y}%`} r={5} fill="none" stroke="rgba(15,23,42,0.35)" strokeWidth={2} />
              )}
            </svg>

            {cloud && !cloud.popped && repPhase !== REP_PHASE.RESTING && (
              <div
                className="absolute select-none"
                style={{
                  left: `${cloud.x}%`,
                  top: `${cloud.y}%`,
                  transform: "translate(-50%, -50%)",
                  zIndex: 8,
                }}
              >
                <CloudSVG sizePx={cloud.size} active={!!cloud.holdStart} />
                {cloud.holdStart && (
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-1.5 bg-[#0F766E]/15 rounded-full overflow-hidden">
                    <div className="h-full bg-[#0F766E] rounded-full transition-all duration-100" style={{ width: `${Math.min(100, holdProgress)}%` }} />
                  </div>
                )}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-medium text-[#64748B] whitespace-nowrap bg-white/80 px-1.5 py-0.5 rounded">
                  {cloud.zoneLabel}
                </div>
              </div>
            )}

            {handPosition && isHandVisible && (
              <div
                className="absolute pointer-events-none"
                style={{ left: `${handPosition.x}%`, top: `${handPosition.y}%`, transform: "translate(-50%, -50%)", transition: "left 0.05s, top 0.05s", zIndex: 9 }}
              >
                <div
                  className={`rounded-full border-4 ${repPhase === REP_PHASE.DWELLING ? "border-[#0F766E] bg-[#0F766E]/20" : "border-[#2563EB] bg-[#2563EB]/15"}`}
                  style={{ width: 28, height: 28, boxShadow: repPhase === REP_PHASE.DWELLING ? "0 0 14px 4px rgba(15,118,110,.25)" : "0 0 10px 3px rgba(37,99,235,.2)" }}
                />
              </div>
            )}

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center px-4 max-w-[92%] z-10">
              <div className="text-sm sm:text-base text-[#0F172A]/90 bg-white/80 backdrop-blur rounded-lg px-3 py-1.5 border border-[#E2E8F0]">{feedbackMsg}</div>
              {handLostPause && <div className="mt-1 text-xs text-[#D97706]">{NO_HAND_MESSAGE}</div>}
            </div>
          </div>

          <DebugPanel />
        </>
      )}

      {/* DONE */}
      {flow === FLOW.DONE &&
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

          const sessionData = {
            sessionId: telemetry.sessionId,
            gameId,
            patientId,
            date: new Date().toISOString(),
            durationSeconds: metrics.totalSessionDuration,
            score: metrics.total,
            accuracyPercent: metrics.accuracy,
            facialPainSignal: papsScore ?? null,
            romData: {
              averageRomDegrees: romDegrees || 0,
              maxRomDegrees: maxAngleRef.current || 0,
              averageReachDistance: metrics.averageReachDistance,
              maxReachDistance: metrics.maximumReachDistance,
              perRep: repData.map((r) => ({ rep: r.repNumber, reachDirection: r.reachDirection, smoothness: r.smoothness, success: r.isCorrect, incomplete: !!r.incompleteTarget })),
            },
            reps: metrics.attemptedReps,
            hitsOrCatchesOrCompletions: metrics.successfulReps,
            missesOrDrops: metrics.missedReps,
            gameSpecificMetrics: {
              totalAttempts: metrics.attemptedReps,
              incompleteReps: metrics.incompleteReps,
              bestCombo,
              longestHitStreak: bestCombo,
              bestStreak: metrics.bestStreak,
              exerciseMode: EXERCISE_MODE_ID,
              avgMovementDurationMs: Math.round(metrics.averageMovementDuration * 1000),
              biometrics: {
                averageSmoothness: metrics.averageSmoothness,
                maxFatigue: Math.round(biometrics.fatigueLevel),
                maxReach: metrics.maximumReachDistance,
              },
              scoreBreakdown: { total: metrics.total, accuracy: metrics.accuracy, smoothness: metrics.smoothness, reachQuality: metrics.reachQuality, consistency: metrics.consistency },
              fullMetrics: metrics,
            },
          };

          return (
            <SessionSummaryErrorBoundary
              fallback={
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#F8FAFC] px-6 text-center">
                  <div className="text-xl font-semibold text-[#0F172A]">
                    Session complete — {metrics.successfulReps}/{SESSION.targetReps} reps
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

      <style>{`
        @keyframes cloud-flash {
          0% { opacity: 0; transform: scale(0.9); }
          30% { opacity: 1; transform: scale(1.03); }
          100% { opacity: 0; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .cloud-flash, [style*="cloud-flash"] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}