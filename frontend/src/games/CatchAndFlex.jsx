// frontend/src/games/CatchAndFlex.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, X, ShoppingBasket, Zap, Target, Flame, Timer, Activity } from "lucide-react";

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
import MetricsEngine from "../utils/metricsEngine";

// ============================================================
// CONSTANTS
// ============================================================
const SESSION_SECONDS = 120;

// Everything in the game canvas uses a 0–100 percentage coordinate
// system on both axes. Fruit, hand, basket, and collision all share it.

const CATCH_ZONE_MIN = 78;
const CATCH_ZONE_MAX = 94;

const BASKET_WIDTH_PERCENT = 26;
const BASKET_HALF = BASKET_WIDTH_PERCENT / 2;
const BASKET_BOTTOM_PERCENT = 2;
const BASKET_ICON_SIZE_PX = 140;

const BASKET_TRAIL_LENGTH = 6;
const MAX_OBJECTS_ON_SCREEN = 7;

const MIN_OBJECT_SIZE = 48;
const MAX_OBJECT_SIZE = 84;
const DEFAULT_OBJECT_SIZE = 64;

const MIN_SPEED = 0.22;
const MAX_SPEED = 0.95;

const GESTURE_OPEN_RATIO = 0.85;
const GESTURE_CLOSED_RATIO = 0.55;

// Basket lerp factor per pose-frame. Higher = snappier, lower = smoother.
// 0.65 feels nearly 1:1 with the hand while still smoothing out
// MediaPipe landmark noise. This is tuned for the full-width game board.
const BASKET_LERP = 0.5;

// State sync throttle — we only push ref values into React state at ~30 fps
// and only if they actually changed. Prevents the RAF loop from causing
// 60 setState/sec on every frame.
const STATE_SYNC_MS = 33;

const FRUITS = ["🍎", "🍊", "🍋", "🍇", "🍉", "🍓", "🥝", "🍑", "🍒", "🍌", "🥭", "🍍"];

const OBJECT_TYPES = [
  { type: "green_ball", emoji: "🟢", requiredGesture: "open" },
  { type: "red_ball", emoji: "🔴", requiredGesture: "closed" },
  { type: "star", emoji: "⭐", requiredGesture: "open" },
  { type: "cup", emoji: "🥤", requiredGesture: "closed" },
  { type: "fruit", emoji: null, requiredGesture: "any" },
];

// ============================================================
// HELPERS
// ============================================================
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function makeLocalTestId() {
  const uuid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `test-catch-flex-${uuid}`;
}

function difficultyToRadiusMultiplier(label) {
  if (label === "Advanced") return 0.8;
  if (label === "Intermediate") return 0.95;
  return 1.15;
}

function spawnObject({ speed, sizePx, difficultyLabel, gestureAvailable }) {
  let pool;
  if (!gestureAvailable || difficultyLabel === "Beginner") {
    pool = OBJECT_TYPES.filter((t) => t.requiredGesture === "any");
  } else if (difficultyLabel === "Intermediate") {
    pool = OBJECT_TYPES.filter(
      (t) => t.requiredGesture === "any" || Math.random() < 0.4
    );
  } else {
    pool = OBJECT_TYPES;
  }
  const selected = pool[Math.floor(Math.random() * pool.length)] || OBJECT_TYPES[4];
  const emoji = selected.emoji || FRUITS[Math.floor(Math.random() * FRUITS.length)];

  const x = 12 + Math.random() * 76;

  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    x,
    y: -12,
    speed: clamp(speed || 0.35, MIN_SPEED, MAX_SPEED),
    emoji,
    type: selected.type,
    requiredGesture: selected.requiredGesture,
    sizePx: clamp(sizePx || DEFAULT_OBJECT_SIZE, MIN_OBJECT_SIZE, MAX_OBJECT_SIZE),
    spawnTime: performance.now(),
    caught: false,
    missed: false,
  };
}

// ============================================================
// COMPONENT
// ============================================================
export default function CatchAndFlex({
  onSessionEnd,
  patientId,
  gameId = "catch-flex",
  isTestMode = false,
}) {
  const videoRef = useRef(null);
  const [poseData, setPoseData] = useState(null);

  // ---- React state (rendering only) ----
  const [fruits, setFruits] = useState([]);
  const [caught, setCaught] = useState(0);
  const [missed, setMissed] = useState(0);
  const [spawned, setSpawned] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState(null);
  const [basketTrail, setBasketTrail] = useState([]);
  const [repData, setRepData] = useState([]);
  const [reactionTimes, setReactionTimes] = useState([]);
  const [gestureStats, setGestureStats] = useState({ correct: 0, total: 0 });
  const [handGestureLabel, setHandGestureLabel] = useState("unknown");
  const [basketCenterX, setBasketCenterX] = useState(50);
  const [isHandVisible, setIsHandVisible] = useState(false);
  const [testSessionId, setTestSessionId] = useState(() =>
    isTestMode ? makeLocalTestId() : null
  );

  // ---- High-frequency refs (RAF reads only these; no setState per frame) ----
  const smoothedHandXRef = useRef(50);
  const basketCenterXRef = useRef(50);
  const fruitsRef = useRef([]);
  const basketTrailRef = useRef([]);
  const handGestureRef = useRef("unknown");
  const caughtRef = useRef(0);
  const missedRef = useRef(0);
  const spawnedRef = useRef(0);
  const streakRef = useRef(0);
  const bestStreakRef = useRef(0);
  const scoreRef = useRef(0);
  const reactionTimesRef = useRef([]);
  const gestureStatsRef = useRef({ correct: 0, total: 0 });
  const catchRadiusRef = useRef(BASKET_HALF * 1.05);
  const papsScoreRef = useRef(0);
  const currentDifficultyRef = useRef("Beginner");
  const shoulderAngleRef = useRef(0);
  const flashRef = useRef(null);
  const poseStatusRef = useRef("never_tracked");

  const minAngleRef = useRef(null);
  const maxAngleRef = useRef(0);
  const hasEndedRef = useRef(false);
  const gameLoopRef = useRef(null);
  const spawnTimerRef = useRef(null);
  const adaptTimerRef = useRef(null);
  const telemetryTimerRef = useRef(null);
  const painPausedRef = useRef(false);
  const metricsEngine = useRef(new MetricsEngine());

  // ============================================================
  // HOOKS
  // ============================================================
  const { isActive } = useMediaPipeUpperBody({
    videoRef,
    onPoseUpdate: setPoseData,
  });

  const { position, shoulderAngle, activeSide, status: poseStatus } =
    usePoseDetection(poseData);
  const guidance = usePostureGuidance(poseData);
  const { papsScore, isPainDetected, resetPainState } = useFacialPainDetection({
    videoRef,
  });
  const { currentDifficulty, settings, adapt } = useAdaptiveDifficulty();
  const telemetry = useSessionTelemetry(patientId, gameId);
  const audio = useAudioFeedback(true);

  // ============================================================
  // HAND → SMOOTHED BASKET X (per pose-frame, not per RAF frame)
  // ============================================================
  // Two jobs:
  //   1) lerp the raw hand X to damp MediaPipe jitter.
  //   2) clamp so the basket never leaves the canvas.
  useEffect(() => {
    // `position.x` from usePoseDetection is ALREADY in the correct
    // screen-space coordinate: the hook computes (1 - rawWristX) * 100,
    // which matches the mirrored video preview you see on the tile.
    // Do NOT invert here — that produces a basket on the opposite side
    // from your hand.
    const target = clamp(position.x, 0, 100);

    const prev = smoothedHandXRef.current;
    const isInitialising = prev === 50 && smoothedHandXRef.current === 50;

    const next = isInitialising
      ? target
      : prev + (target - prev) * BASKET_LERP;

    smoothedHandXRef.current = next;
    basketCenterXRef.current = clamp(next, BASKET_HALF, 100 - BASKET_HALF);
  }, [position.x]);

  // Basket is only shown when the hand is actively tracked. When the
  // hand leaves the frame, hide it; when it returns, snap instantly to
  // the new position so the basket doesn't slide in from the old spot.
  useEffect(() => {
    const visible = poseStatus === "tracking";
    setIsHandVisible(visible);
    if (visible) {
      // Snap on reacquire so the basket doesn't glide from its last spot.
      const target = clamp(position.x, 0, 100);
      smoothedHandXRef.current = target;
      basketCenterXRef.current = clamp(target, BASKET_HALF, 100 - BASKET_HALF);
      setBasketCenterX(basketCenterXRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poseStatus]);

  // Sync cheap, low-frequency refs.
  useEffect(() => {
    papsScoreRef.current = papsScore || 0;
  }, [papsScore]);

  useEffect(() => {
    currentDifficultyRef.current = currentDifficulty;
  }, [currentDifficulty]);

  useEffect(() => {
    shoulderAngleRef.current = shoulderAngle;
  }, [shoulderAngle]);

  useEffect(() => {
    poseStatusRef.current = poseStatus;
  }, [poseStatus]);

  // Push basketCenterX into state at low frequency for the React render.
  // The RAF loop reads basketCenterXRef directly, so movement is instant.
  useEffect(() => {
    let raf;
    let last = 0;
    const tick = (t) => {
      if (t - last >= STATE_SYNC_MS) {
        last = t;
        setBasketCenterX((prev) =>
          Math.abs(prev - basketCenterXRef.current) > 0.15
            ? basketCenterXRef.current
            : prev
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ============================================================
  // GESTURE DETECTION (from pose landmarks)
  // ============================================================
  useEffect(() => {
    if (!poseData?.raw) {
      handGestureRef.current = "unknown";
      setHandGestureLabel("unknown");
      return;
    }
    const raw = poseData.raw;
    const { leftWrist, rightWrist, leftIndex, rightIndex, leftShoulder, rightShoulder } = raw;

    const leftVis = (leftWrist?.visibility ?? 0) + (leftIndex?.visibility ?? 0);
    const rightVis = (rightWrist?.visibility ?? 0) + (rightIndex?.visibility ?? 0);

    const useLeft = leftVis >= rightVis;
    const wrist = useLeft ? leftWrist : rightWrist;
    const index = useLeft ? leftIndex : rightIndex;
    const shoulder = useLeft ? leftShoulder : rightShoulder;

    if (
      !wrist || !index || !shoulder ||
      (wrist.visibility ?? 0) < 0.4 ||
      (index.visibility ?? 0) < 0.4
    ) {
      handGestureRef.current = "unknown";
      setHandGestureLabel("unknown");
      return;
    }

    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const reference = dist(wrist, shoulder);
    if (reference < 1e-4) {
      handGestureRef.current = "unknown";
      setHandGestureLabel("unknown");
      return;
    }
    const ratio = dist(wrist, index) / reference;

    let label = "unknown";
    if (ratio >= GESTURE_OPEN_RATIO) label = "open";
    else if (ratio <= GESTURE_CLOSED_RATIO) label = "closed";

    if (label !== handGestureRef.current) {
      handGestureRef.current = label;
      setHandGestureLabel(label);
    }
  }, [poseData]);

  // ============================================================
  // DERIVED METRICS
  // ============================================================
  const totalAttempts = caught + missed;
  const accuracy =
    totalAttempts > 0
      ? Math.round((caught / totalAttempts) * 100)
      : 100;

  const avgReactionTime = useMemo(() => {
    if (reactionTimes.length === 0) return 0;
    return reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length;
  }, [reactionTimes]);

  const romDegrees = useMemo(() => {
    if (minAngleRef.current === null) return 0;
    return Math.max(0, Math.round(maxAngleRef.current - minAngleRef.current));
  }, [shoulderAngle]);

  // ============================================================
  // GAME ENGINE
  // ============================================================
  const engine = useGameEngine({
    sessionLength: SESSION_SECONDS,
    onRepComplete: (success) => {
      telemetry.recordRep(success);
      if (success) audio.playSuccess();
      else audio.playMiss();
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

  // ============================================================
  // CATCH RADIUS — derived from visual basket
  // ============================================================
  useEffect(() => {
    const base = BASKET_HALF * 1.05;
    const mult = difficultyToRadiusMultiplier(currentDifficulty);
    const papsBonus = 1 + (papsScore || 0) / 200;
    catchRadiusRef.current = clamp(base * mult * papsBonus, 8, 22);
  }, [currentDifficulty, papsScore]);

  // ============================================================
  // ROM TRACKING
  // ============================================================
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    const repResult = metricsEngine.current?.trackAngle?.(
      shoulderAngle,
      performance.now()
    );
    if (repResult) setRepData((prev) => [...prev, repResult]);
  }, [gameState, isPaused, shoulderAngle]);

  // ============================================================
  // GAME LOOP
  // ============================================================
  // Reads only refs. No state dependency, so it's created once per active
  // session and never recreated on pose updates.
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = null;
      }
      return;
    }

    let lastTime = performance.now();
    let lastSync = 0;

    const gameLoop = (timestamp) => {
      const delta = Math.min((timestamp - lastTime) / 16, 3);
      lastTime = timestamp;

      const handVisible = poseStatusRef.current === "tracking";
      const handX = basketCenterXRef.current;
      const gesture = handGestureRef.current;
      const gestureAvailable = gesture !== "unknown";
      const catchRadius = catchRadiusRef.current;

      // ---- Basket trail: mutate ref only, no setState ----
      const trail = basketTrailRef.current;
      trail.push({ x: handX });
      if (trail.length > BASKET_TRAIL_LENGTH) trail.shift();

      // ---- Fruit physics: mutate ref array in place ----
      const list = fruitsRef.current;
      let changed = false;
      for (let i = 0; i < list.length; i++) {
        const fruit = list[i];
        if (fruit.caught || fruit.missed) continue;

        const newY = fruit.y + fruit.speed * delta;
        const inCatchZone = newY >= CATCH_ZONE_MIN && newY <= CATCH_ZONE_MAX;
        const dx = Math.abs(fruit.x - handX);
        const inRange = dx <= catchRadius;
        const gestureSatisfied =
          !gestureAvailable ||
          fruit.requiredGesture === "any" ||
          fruit.requiredGesture === gesture;

        if (handVisible && inCatchZone && inRange && gestureSatisfied) {
          // CATCH
          fruit.caught = true;
          caughtRef.current += 1;
          const rt = timestamp - fruit.spawnTime;
          reactionTimesRef.current = [...reactionTimesRef.current, rt];
          if (gestureAvailable && fruit.requiredGesture !== "any") {
            gestureStatsRef.current = {
              correct: gestureStatsRef.current.correct + 1,
              total: gestureStatsRef.current.total + 1,
            };
          }
          streakRef.current += 1;
          if (streakRef.current > bestStreakRef.current) {
            bestStreakRef.current = streakRef.current;
          }
          scoreRef.current += 10;
          flashRef.current = { type: "catch", key: fruit.id };
          completeRep(true);
          changed = true;
          continue;
        }

        if (newY > 105) {
          // MISS
          fruit.missed = true;
          missedRef.current += 1;
          streakRef.current = 0;
          if (
            gestureAvailable &&
            fruit.requiredGesture !== "any" &&
            inCatchZone &&
            inRange
          ) {
            gestureStatsRef.current = {
              correct: gestureStatsRef.current.correct,
              total: gestureStatsRef.current.total + 1,
            };
          }
          flashRef.current = { type: "miss", key: fruit.id };
          completeRep(false);
          changed = true;
          continue;
        }

        fruit.y = newY;
      }

      // Remove fruits that were caught or missed this frame.
      if (list.some((f) => f.caught || f.missed)) {
        fruitsRef.current = list.filter((f) => !f.caught && !f.missed);
        changed = true;
      }

      // ---- Throttled React state sync (30 fps, only if changed) ----
      if (timestamp - lastSync >= STATE_SYNC_MS) {
        lastSync = timestamp;

        setFruits(fruitsRef.current.slice());
        setCaught(caughtRef.current);
        setMissed(missedRef.current);
        setStreak(streakRef.current);
        setBestStreak(bestStreakRef.current);
        setScore(scoreRef.current);
        setReactionTimes(reactionTimesRef.current.slice());
        setGestureStats({ ...gestureStatsRef.current });
        setBasketTrail(basketTrailRef.current.slice());

        if (flashRef.current) {
          setFlash(flashRef.current);
          flashRef.current = null;
        }
      }

      // ROM min/max tracking (from shoulder angle only, never from fruit).
      const ang = shoulderAngleRef.current;
      if (
        minAngleRef.current === null ||
        (ang > 0 && ang < minAngleRef.current)
      ) {
        minAngleRef.current = ang > 0 ? ang : 0;
      }
      if (ang > maxAngleRef.current) maxAngleRef.current = ang;

      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = null;
      }
    };
  }, [gameState, isPaused, completeRep]);

  // ============================================================
  // TELEMETRY SAMPLING
  // ============================================================
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) {
      if (telemetryTimerRef.current) {
        clearInterval(telemetryTimerRef.current);
        telemetryTimerRef.current = null;
      }
      return;
    }
    telemetryTimerRef.current = setInterval(() => {
      telemetry.trackMovement({ x: basketCenterXRef.current, y: 50 });
      telemetry.trackAngle(shoulderAngleRef.current);
    }, 100);
    return () => {
      if (telemetryTimerRef.current) {
        clearInterval(telemetryTimerRef.current);
        telemetryTimerRef.current = null;
      }
    };
  }, [gameState, isPaused, telemetry]);

  // ============================================================
  // SPAWN FRUIT
  // ============================================================
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) {
      if (spawnTimerRef.current) {
        clearInterval(spawnTimerRef.current);
        spawnTimerRef.current = null;
      }
      return;
    }
    const interval = settings.spawnRate || 2200;

    spawnTimerRef.current = setInterval(() => {
      const active = fruitsRef.current.filter(
        (f) => !f.caught && !f.missed
      ).length;
      if (active >= MAX_OBJECTS_ON_SCREEN) return;

      const obj = spawnObject({
        speed: settings.speed,
        sizePx: settings.objectSize,
        difficultyLabel: currentDifficultyRef.current,
        gestureAvailable: handGestureRef.current !== "unknown",
      });
      fruitsRef.current = [...fruitsRef.current, obj];
      spawnedRef.current += 1;
    }, interval);

    return () => {
      if (spawnTimerRef.current) {
        clearInterval(spawnTimerRef.current);
        spawnTimerRef.current = null;
      }
    };
  }, [
    gameState,
    isPaused,
    settings.spawnRate,
    settings.speed,
    settings.objectSize,
  ]);

  // ============================================================
  // FLASH CLEAR
  // ============================================================
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 500);
    return () => clearTimeout(t);
  }, [flash]);

  // ============================================================
  // ADAPTIVE DIFFICULTY
  // ============================================================
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) {
      if (adaptTimerRef.current) {
        clearInterval(adaptTimerRef.current);
        adaptTimerRef.current = null;
      }
      return;
    }
    adaptTimerRef.current = setInterval(() => {
      const total = caughtRef.current + missedRef.current;
      const acc = total ? (caughtRef.current / total) * 100 : 100;
      const recentMissRate = total
        ? (missedRef.current / total) * 100
        : 0;
      adapt({
        accuracy: acc,
        papsScore: papsScoreRef.current,
        combo: bestStreakRef.current,
        maxFlexionAngle: maxAngleRef.current,
        missRate: recentMissRate,
      });
    }, 10000);
    return () => {
      if (adaptTimerRef.current) {
        clearInterval(adaptTimerRef.current);
        adaptTimerRef.current = null;
      }
    };
  }, [gameState, isPaused, adapt]);

  // ============================================================
  // PAIN DETECTION
  // ============================================================
  useEffect(() => {
    if (!isPainDetected || gameState !== GAME_STATES.ACTIVE) {
      painPausedRef.current = false;
      return;
    }
    if (painPausedRef.current) return;
    painPausedRef.current = true;
    pauseSession();
    telemetry.trackPain(papsScore);
  }, [isPainDetected, gameState, pauseSession, telemetry, papsScore]);

  // ============================================================
  // TEST MODE RESET
  // ============================================================
  const resetTestState = useCallback(() => {
    setFruits([]);
    setCaught(0);
    setMissed(0);
    setSpawned(0);
    setStreak(0);
    setBestStreak(0);
    setScore(0);
    setFlash(null);
    setBasketTrail([]);
    setRepData([]);
    setReactionTimes([]);
    setGestureStats({ correct: 0, total: 0 });
    setHandGestureLabel("unknown");
    setBasketCenterX(50);

    smoothedHandXRef.current = 50;
    basketCenterXRef.current = 50;
    fruitsRef.current = [];
    basketTrailRef.current = [];
    handGestureRef.current = "unknown";
    caughtRef.current = 0;
    missedRef.current = 0;
    spawnedRef.current = 0;
    streakRef.current = 0;
    bestStreakRef.current = 0;
    scoreRef.current = 0;
    reactionTimesRef.current = [];
    gestureStatsRef.current = { correct: 0, total: 0 };
    catchRadiusRef.current = BASKET_HALF * 1.05;
    flashRef.current = null;

    minAngleRef.current = null;
    maxAngleRef.current = 0;
    hasEndedRef.current = false;
    painPausedRef.current = false;

    metricsEngine.current = new MetricsEngine();
    setTestSessionId(makeLocalTestId());
  }, []);

  useEffect(() => {
    if (!isTestMode) return;
    if (gameState === GAME_STATES.INSTRUCTIONS) {
      resetTestState();
    }
  }, [isTestMode, gameState, resetTestState]);

  // ============================================================
  // SESSION FINALIZATION
  // ============================================================
  const finalizeTelemetry = useCallback(() => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;

    if (isTestMode) {
      console.info("[CatchAndFlex][TEST MODE] endSession skipped.");
      return;
    }

    const sessionStats = metricsEngine.current?.getSessionStats?.() || {};
    const rt = reactionTimesRef.current;
    const avgRT = rt.length ? rt.reduce((a, b) => a + b, 0) / rt.length : 0;
    const fastestRT = rt.length ? Math.min(...rt) : 0;
    const slowestRT = rt.length ? Math.max(...rt) : 0;
    const g = gestureStatsRef.current;
    const gestureAccuracy = g.total
      ? Math.round((g.correct / g.total) * 100)
      : 100;
    const total = caughtRef.current + missedRef.current;
    const finalAccuracy = total
      ? Math.round((caughtRef.current / total) * 100)
      : 100;

    telemetry.endSession({
      gameName: "Catch & Flex",
      score: scoreRef.current,
      caught: caughtRef.current,
      missed: missedRef.current,
      accuracy: finalAccuracy,
      bestStreak: bestStreakRef.current,
      romDegrees: sessionStats.averageRom || romDegrees,
      papsScore: papsScoreRef.current,
      difficulty: currentDifficultyRef.current,
      gameSpecific: {
        objectsSpawned: spawnedRef.current,
        objectsCaught: caughtRef.current,
        objectsMissed: missedRef.current,
        catchRate: finalAccuracy,
        averageReactionTimeMs: Math.round(avgRT),
        fastestReactionTimeMs: Math.round(fastestRT),
        slowestReactionTimeMs: Math.round(slowestRT),
        bestStreak: bestStreakRef.current,
        gestureAccuracy,
        catchRadius: catchRadiusRef.current,
        repData: sessionStats.reps || repData,
      },
    });
  }, [telemetry, romDegrees, repData, isTestMode]);

  useEffect(() => {
    if (gameState === GAME_STATES.COMPLETE) finalizeTelemetry();
  }, [gameState, finalizeTelemetry]);

  // ============================================================
  // SESSION DATA
  // ============================================================
  const buildSessionData = useCallback(() => {
    const sessionStats = metricsEngine.current?.getSessionStats?.() || {};
    const rt = reactionTimesRef.current;
    const avgRT = rt.length ? rt.reduce((a, b) => a + b, 0) / rt.length : 0;
    const fastestRT = rt.length ? Math.min(...rt) : 0;
    const slowestRT = rt.length ? Math.max(...rt) : 0;
    const g = gestureStatsRef.current;
    const gestureAccuracy = g.total
      ? Math.round((g.correct / g.total) * 100)
      : 100;
    const total = caughtRef.current + missedRef.current;
    const finalAccuracy = total
      ? Math.round((caughtRef.current / total) * 100)
      : 100;

    const base = {
      sessionId: isTestMode
        ? testSessionId || makeLocalTestId()
        : telemetry.sessionId,
      gameId,
      patientId,
      date: new Date().toISOString(),
      durationSeconds: SESSION_SECONDS - timeLeft,
      score: scoreRef.current,
      accuracyPercent: finalAccuracy,
      romData: {
        averageRomDegrees: romDegrees || 0,
        maxRomDegrees: maxAngleRef.current || 0,
        perRep: repData.map((r, i) => ({
          rep: i + 1,
          romDegrees: r.romDegrees || 0,
          success: r.success !== false,
        })),
      },
      reps: total,
      hitsOrCatchesOrCompletions: caughtRef.current,
      missesOrDrops: missedRef.current,
      gameSpecificMetrics: {
        objectsSpawned: spawnedRef.current,
        objectsCaught: caughtRef.current,
        objectsMissed: missedRef.current,
        catchRate: finalAccuracy,
        averageReactionTimeMs: Math.round(avgRT),
        fastestReactionTimeMs: Math.round(fastestRT),
        slowestReactionTimeMs: Math.round(slowestRT),
        bestStreak: bestStreakRef.current,
        gestureAccuracy,
        catchRadius: catchRadiusRef.current,
        difficulty: currentDifficultyRef.current,
      },
    };

    if (isTestMode) {
      return {
        ...base,
        isTestMode: true,
        sessionType: "test",
        _note: "Test mode — not persisted to patient progress.",
      };
    }
    return base;
  }, [
    isTestMode,
    testSessionId,
    telemetry.sessionId,
    gameId,
    patientId,
    timeLeft,
    romDegrees,
    repData,
  ]);

  // ============================================================
  // SHARED UI PRIMITIVES
  // ============================================================
  const TestModeBanner = () =>
    isTestMode ? (
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 shadow-sm">
        🧪 Test Mode — this session will not affect patient progress.
      </div>
    ) : null;

  const MetricChip = ({ icon: Icon, label, value, tone = "slate" }) => {
    const toneClasses = {
      slate: "bg-slate-50 text-slate-700 border-slate-200",
      cyan: "bg-cyan-50 text-cyan-700 border-cyan-200",
      emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
      red: "bg-red-50 text-red-700 border-red-200",
      amber: "bg-amber-50 text-amber-700 border-amber-200",
      blue: "bg-blue-50 text-blue-700 border-blue-200",
    }[tone];
    return (
      <div
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${toneClasses}`}
      >
        <Icon size={16} strokeWidth={2.4} />
        <div className="leading-tight">
          <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">
            {label}
          </div>
          <div className="text-sm font-extrabold tabular-nums">{value}</div>
        </div>
      </div>
    );
  };

  // ============================================================
  // RENDER: INSTRUCTIONS
  // ============================================================
  if (gameState === GAME_STATES.INSTRUCTIONS) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-slate-50 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 pb-24">
          <TestModeBanner />

          <div className="mb-6">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              🧺 Catch & Flex
            </h1>
            <p className="mt-2 text-slate-600">
              Move your hand left and right to guide the basket. Catch the
              falling objects — the basket follows your hand in real time.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                Open Hand
              </div>
              <div className="mt-1 text-2xl">✋</div>
              <div className="mt-1 text-sm text-emerald-800">
                Catch 🟢 green balls and ⭐ stars
              </div>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-red-700">
                Closed Hand
              </div>
              <div className="mt-1 text-2xl">✊</div>
              <div className="mt-1 text-sm text-red-800">
                Catch 🔴 red balls and 🥤 cups
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Any Pose
              </div>
              <div className="mt-1 text-2xl">🤚</div>
              <div className="mt-1 text-sm text-slate-700">
                Catch 🍎 fruits freely
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
              <div className="absolute left-3 top-3 rounded-lg bg-white/90 px-3 py-1.5 font-mono text-xs text-slate-700 shadow-sm">
                {Math.round(shoulderAngle)}° · {activeSide} · PAPS {papsScore}
              </div>
              <div className="absolute right-3 top-3 rounded-lg bg-white/90 px-3 py-1.5 font-mono text-xs text-slate-700 shadow-sm">
                Hand: {handGestureLabel}
              </div>
            </div>

            <div className="flex flex-col justify-between gap-4">
              <div
                className={`rounded-2xl border p-4 shadow-sm ${
                  guidance.overallStatus === "ok"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <div className="text-xs font-bold uppercase tracking-wide opacity-80">
                  Posture Guidance
                </div>
                <div className="mt-1 text-sm font-medium">
                  {guidance.message}
                </div>
              </div>

              <button
                onClick={() => {
                  telemetry.startTracking();
                  if (isTestMode) resetTestState();
                  startSession();
                }}
                disabled={!guidance.isReady || !isActive}
                className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 px-8 py-4 text-base font-bold text-white shadow-md shadow-cyan-200 transition hover:from-cyan-400 hover:to-teal-400 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
              >
                {isTestMode ? "Start Test Session" : "Start Session"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER: COMPLETE
  // ============================================================
  if (gameState === GAME_STATES.COMPLETE) {
    const sessionData = buildSessionData();
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-slate-50 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 pb-24">
          <TestModeBanner />
          <SessionSummary
            sessionData={sessionData}
            gameName="Catch & Flex"
            gameId={gameId}
            onSaveReport={async () => {
              if (isTestMode) {
                return { ok: true, localOnly: true, isTestMode: true };
              }
              return await telemetry.saveReport(sessionData);
            }}
            onFinish={() => {
              onSessionEnd?.(sessionData);
            }}
          />
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER: ACTIVE GAME
  // ============================================================
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-slate-50 overflow-y-auto">
      <div className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 lg:px-8 pb-12">
        <TestModeBanner />

        {/* ============== TOP STATUS BAR (light theme) ============== */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <MetricChip icon={Timer} label="Time" value={`${timeLeft}s`} tone="cyan" />
              <MetricChip icon={Target} label="Caught" value={caught} tone="emerald" />
              <MetricChip icon={X} label="Missed" value={missed} tone="red" />
              <MetricChip icon={Activity} label="Accuracy" value={`${accuracy}%`} tone="blue" />
              <MetricChip icon={Flame} label="Streak" value={streak} tone="amber" />
              <MetricChip
                icon={Zap}
                label="Avg React"
                value={
                  avgReactionTime > 0
                    ? `${(avgReactionTime / 1000).toFixed(2)}s`
                    : "—"
                }
                tone="slate"
              />
              <MetricChip icon={Activity} label="ROM" value={`${romDegrees}°`} tone="cyan" />
              <MetricChip
                icon={Target}
                label="Difficulty"
                value={currentDifficulty}
                tone="slate"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => (isPaused ? resumeSession() : pauseSession())}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                aria-label={isPaused ? "Resume" : "Pause"}
              >
                {isPaused ? <Play size={16} /> : <Pause size={16} />}
                <span className="hidden sm:inline">
                  {isPaused ? "Resume" : "Pause"}
                </span>
              </button>
              <button
                onClick={endSession}
                className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 shadow-sm transition hover:bg-red-100"
                aria-label="End session"
              >
                <X size={16} />
                <span className="hidden sm:inline">End</span>
              </button>
            </div>
          </div>
        </div>

        {/* ============== COUNTDOWN OVERLAY ============== */}
        {gameState === GAME_STATES.COUNTDOWN && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/85 backdrop-blur-sm">
            <div className="text-[10rem] font-black text-cyan-600 drop-shadow-sm">
              {countdown || "GO"}
            </div>
          </div>
        )}

        {/* ============== PAIN OVERLAY (light theme) ============== */}
        {isPainDetected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-2xl">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-3xl">
                ⚠️
              </div>
              <h2 className="mb-2 text-xl font-bold text-slate-900">
                Discomfort Detected
              </h2>
              <p className="mb-6 text-sm text-slate-600">
                Take a short rest before resuming. The session is paused.
              </p>
              <button
                onClick={() => {
                  resetPainState();
                  painPausedRef.current = false;
                  resumeSession();
                }}
                className="w-full rounded-2xl bg-cyan-500 px-6 py-3 font-bold text-white shadow-md shadow-cyan-200 transition hover:bg-cyan-400"
              >
                Resume When Ready
              </button>
            </div>
          </div>
        )}

        {/* ============== MAIN LAYOUT ==============
            The game board takes the full width. The camera preview is a
            small floating tile pinned to the top-right corner of the
            board (see below). */}
        <div className="relative">
          {/* GAME BOARD CARD (full width) */}
          <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-sky-50/60 via-white to-sky-50/60 shadow-sm">
            <div className="relative h-[520px] sm:h-[560px] lg:h-[calc(100vh-260px)] lg:min-h-[520px]">
              {/* Catch zone band */}
              <div
                className="pointer-events-none absolute left-0 right-0 border-y border-dashed border-cyan-300/60 bg-cyan-100/25"
                style={{
                  top: `${CATCH_ZONE_MIN}%`,
                  height: `${CATCH_ZONE_MAX - CATCH_ZONE_MIN}%`,
                }}
              >
                <div className="absolute left-2 top-1 text-[10px] font-bold uppercase tracking-wide text-cyan-600/70">
                  Catch Zone
                </div>
              </div>

              {/* Flash feedback */}
              {flash && (
                <div
                  key={flash.key}
                  className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
                  style={{ animation: "catch-flash 500ms ease-out forwards" }}
                >
                  <div
                    className={`rounded-3xl px-8 py-5 text-4xl font-black shadow-2xl ${
                      flash.type === "catch"
                        ? "bg-emerald-500/95 text-white"
                        : "bg-red-500/95 text-white"
                    }`}
                  >
                    {flash.type === "catch" ? "🎯 CAUGHT!" : "💨 MISSED"}
                  </div>
                </div>
              )}

              {/* Basket trail */}
              <svg
                viewBox="0 0 100 100"
                className="pointer-events-none absolute inset-0 h-full w-full"
                preserveAspectRatio="none"
              >
                {basketTrail.map((p, i) => {
                  const age = basketTrail.length - 1 - i;
                  return (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={92}
                      r={3 - age * 0.35}
                      fill={`rgba(6,182,212,${Math.max(
                        0,
                        0.45 - age * 0.07
                      )})`}
                    />
                  );
                })}
              </svg>

              {/* Falling fruit */}
              {fruits.map(
                (fruit) =>
                  !fruit.caught &&
                  !fruit.missed && (
                    <div
                      key={fruit.id}
                      className="absolute select-none"
                      style={{
                        left: `${fruit.x}%`,
                        top: `${fruit.y}%`,
                        transform: "translate(-50%, -50%)",
                        fontSize: `${fruit.sizePx}px`,
                        lineHeight: 1,
                        filter: "drop-shadow(0 4px 8px rgba(15,23,42,0.18))",
                        willChange: "top, left",
                      }}
                    >
                      {fruit.emoji}
                      {fruit.requiredGesture !== "any" && (
                        <div
                          className={`absolute left-1/2 -translate-x-1/2 text-[14px] font-bold whitespace-nowrap rounded-md px-1.5 py-0.5 shadow-sm ${
                            fruit.requiredGesture === "open"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          }`}
                          style={{
                            top: `-${Math.round(fruit.sizePx * 0.4)}px`,
                          }}
                        >
                          {fruit.requiredGesture === "open" ? "✋" : "✊"}
                        </div>
                      )}
                    </div>
                  )
              )}

              {/* Hand cursor + basket — rendered ONLY when the hand is
                  actively tracked. When the hand leaves the frame, both
                  the cursor and the basket disappear. */}
              {isHandVisible && (
              <div
                className="pointer-events-none absolute z-30 transition-opacity duration-150"
                style={{
                  left: `${basketCenterX}%`,
                  bottom: `${BASKET_BOTTOM_PERCENT}%`,
                  transform: "translateX(-50%)",
                  width: `${BASKET_WIDTH_PERCENT}%`,
                  willChange: "left",
                }}
              >
                {/* Hand cursor */}
                <div
                  className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center"
                  style={{ bottom: "100%" }}
                >
                  <div
                    className={`rounded-full border px-3 py-1 text-3xl shadow-md transition-colors duration-150 ${
                      handGestureLabel === "open"
                        ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                        : handGestureLabel === "closed"
                        ? "border-red-300 bg-red-100 text-red-700"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                    title={`Tracked hand: ${handGestureLabel}`}
                  >
                    {handGestureLabel === "open"
                      ? "✋"
                      : handGestureLabel === "closed"
                      ? "✊"
                      : "🤚"}
                  </div>
                  <div className="mt-1 h-3 w-px bg-slate-300" />
                </div>

                {/* Basket icon */}
                <div
                  className={`relative flex items-end justify-center ${
                    handGestureLabel === "open"
                      ? "text-emerald-500"
                      : handGestureLabel === "closed"
                      ? "text-red-500"
                      : "text-cyan-500"
                  }`}
                >
                  <ShoppingBasket
                    size={BASKET_ICON_SIZE_PX}
                    strokeWidth={1.6}
                    className="drop-shadow-[0_8px_16px_rgba(6,182,212,0.25)]"
                    style={{ width: "100%", height: "auto" }}
                  />
                  <div className="pointer-events-none absolute -bottom-3 left-1/2 h-4 w-4/5 -translate-x-1/2 rounded-full bg-cyan-300/30 blur-2xl" />
                </div>
              </div>
              )}

              {/* Score card */}
              <div className="absolute right-3 top-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-2 text-right shadow-sm">
                <div className="text-lg font-black text-amber-500">
                  ⭐ {score}
                </div>
                <div className="text-xs font-semibold text-slate-500">
                  Streak: {streak}
                </div>
                {gestureStats.total > 0 && (
                  <div className="mt-0.5 text-[11px] font-semibold text-cyan-600">
                    Gesture:{" "}
                    {Math.round(
                      (gestureStats.correct / gestureStats.total) * 100
                    )}
                    %
                  </div>
                )}
              </div>

              {/* ============== FLOATING CAMERA TILE (top-right) ============== */}
              <div className="pointer-events-none absolute right-3 top-20 z-20 w-[180px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md sm:w-[220px] lg:w-[260px]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="aspect-video w-full scale-x-[-1] object-cover"
                />
                <SkeletonOverlay
                  poseData={poseData}
                  overallStatus={guidance.overallStatus}
                  shoulderAngle={shoulderAngle}
                />
                <div className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700 shadow-sm">
                  {Math.round(shoulderAngle)}° · {activeSide}
                </div>
                <div className="absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700 shadow-sm">
                  Hand:{" "}
                  <span
                    className={
                      handGestureLabel === "open"
                        ? "text-emerald-600"
                        : handGestureLabel === "closed"
                        ? "text-red-600"
                        : "text-slate-500"
                    }
                  >
                    {handGestureLabel}
                  </span>
                </div>
                {isTestMode && (
                  <div className="absolute bottom-2 right-2 rounded-md bg-white/90 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700 shadow-sm">
                    PAPS {papsScore}
                  </div>
                )}
              </div>

              {/* Debug info — only in Test Mode */}
              {isTestMode && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900/80 px-2 py-1 font-mono text-[10px] text-white">
                  radius {Math.round(catchRadiusRef.current)} · hand{" "}
                  {Math.round(basketCenterX)} · fruits {fruits.length}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes catch-flash {
          0%   { opacity: 0; transform: scale(0.85); }
          25%  { opacity: 1; transform: scale(1.08); }
          100% { opacity: 0; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}