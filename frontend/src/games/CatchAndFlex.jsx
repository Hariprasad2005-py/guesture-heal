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
import GameShell, { StageTopBar, CameraPip } from "../components/rehab/GameShell";
import { OneEuro } from "../utils/oneEuro";
import ArmPicker from "../components/rehab/ArmPicker";
import { OrchardBackdrop } from "../components/rehab/GameBackdrops";
import LevelBanner from "../components/rehab/LevelBanner";
import SessionSummary from "../components/rehab/SessionSummary";
import SessionCheckpoint from "../components/rehab/SessionCheckpoint";
import HowToPlay from "../components/rehab/HowToPlay";
import MetricsEngine from "../utils/metricsEngine";

// ============================================================
// CONSTANTS
// ============================================================
const SESSION_SECONDS = 120;

// Everything in the game canvas uses a 0–100 percentage coordinate
// system on both axes. Fruit, hand, basket, and collision all share it.

const CATCH_ZONE_MIN = 78;
const CATCH_ZONE_MAX = 94;

// The basket starts small and shrinks as the level goes up (% of board width).
const BASKET_WIDTHS = [17, 15.5, 14, 12, 10];
const BASKET_HALF = BASKET_WIDTHS[0] / 2;

// Two-basket mode (both arms): each hand moves its own basket on its own
// side of the board. These are the screen-x ranges the hand sweeps.
const LEFT_HAND_RANGE = [10, 55];
const RIGHT_HAND_RANGE = [45, 90];
const HAND_COLOR = { left: "#22d3ee", right: "#fb923c" };
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
const BASKET_LERP = 0.85;

// The hand only has to travel the middle part of the camera picture to
// cover the whole board, so a smaller sweep reaches the edges.
const REACH_MIN = 12;
const REACH_MAX = 88;

// Five levels, picked by how many objects have been caught.
const LEVELS = [
  { minCaught: 0, gestureMix: 0, speedMul: 0.9, radiusMul: 1.15, spawnMul: 1.1, text: "Level 1: catch the fruit" },
  { minCaught: 6, gestureMix: 0.35, speedMul: 1.0, radiusMul: 1.05, spawnMul: 1.0, text: "Level 2: open and closed hand" },
  { minCaught: 14, gestureMix: 0.5, speedMul: 1.1, radiusMul: 1.0, spawnMul: 0.95, text: "Level 3: more shapes" },
  { minCaught: 24, gestureMix: 0.55, speedMul: 1.25, radiusMul: 0.88, spawnMul: 0.9, text: "Level 4: faster, smaller basket" },
  { minCaught: 36, gestureMix: 0.6, speedMul: 1.4, radiusMul: 0.78, spawnMul: 0.8, text: "Level 5: top speed" },
];

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

function difficultyToRadiusMultiplier(label) {
  if (label === "Advanced") return 0.8;
  if (label === "Intermediate") return 0.95;
  return 1.15;
}

function spawnObject({ speed, sizePx, gestureMix = 0, gestureAvailable, armChoice = "both", lastHand = "right" }) {
  const wantGesture = gestureAvailable && Math.random() < gestureMix;
  const pool = OBJECT_TYPES.filter((t) =>
    wantGesture ? t.requiredGesture !== "any" : t.requiredGesture === "any"
  );
  const selected = pool[Math.floor(Math.random() * pool.length)] || OBJECT_TYPES[4];
  const emoji = selected.emoji || FRUITS[Math.floor(Math.random() * FRUITS.length)];

  // both arms: fruit alternates sides, left-side fruit is for the left hand
  const hand = armChoice === "both" ? (lastHand === "left" ? "right" : "left") : armChoice;
  const x =
    armChoice === "both"
      ? hand === "left"
        ? 10 + Math.random() * 36
        : 54 + Math.random() * 36
      : 12 + Math.random() * 76;

  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    x,
    hand,
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
  const [baskets, setBaskets] = useState({
    left: { x: 25, vis: false, g: "unknown" },
    right: { x: 75, vis: false, g: "unknown" },
  });
  const [armChoice, setArmChoice] = useState("both");
  const [levelBanner, setLevelBanner] = useState({ visible: false, text: "" });

  // ---- High-frequency refs (RAF reads only these; no setState per frame) ----
  const basketsRef = useRef({
    left: { x: 25, vis: false, gesture: "unknown" },
    right: { x: 75, vis: false, gesture: "unknown" },
  });
  const sideFiltersRef = useRef({ left: new OneEuro(1.4, 0.09), right: new OneEuro(1.4, 0.09) });
  const armChoiceRef = useRef("both");
  const lastHandRef = useRef("right");
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

  const { shoulderAngle, activeSide } = usePoseDetection(poseData, {
    preferredSide: armChoice === "both" ? "auto" : armChoice,
  });
  armChoiceRef.current = armChoice;
  const guidance = usePostureGuidance(poseData);
  const { papsScore, isPainDetected, resetPainState } = useFacialPainDetection({
    videoRef,
  });
  const { currentDifficulty, settings, adapt } = useAdaptiveDifficulty();
  const telemetry = useSessionTelemetry(patientId, gameId);
  const audio = useAudioFeedback(true);

  // ============================================================
  // HANDS → BASKETS (per pose frame)
  // ============================================================
  // Each hand drives its own basket. With "Both arms" the left hand moves the
  // left basket and the right hand moves the right basket; with one arm
  // there is a single full-width basket. The hand shape (open / closed) is
  // read from the same hand that moves that basket.
  useEffect(() => {
    const raw = poseData?.raw;
    const now = performance.now();
    const next = { left: null, right: null };
    for (const side of ["left", "right"]) {
      const enabled = armChoice === "both" || armChoice === side;
      const w = raw?.[`${side}Wrist`];
      const idx = raw?.[`${side}Index`];
      const sh = raw?.[`${side}Shoulder`];
      const prev = basketsRef.current[side];
      if (!enabled || !w || (w.visibility ?? 0) < 0.4) {
        next[side] = { ...prev, vis: false, gesture: "unknown" };
        if (!enabled || !w) sideFiltersRef.current[side].reset();
        continue;
      }
      const screenX = (1 - w.x) * 100; // mirrored like the camera picture
      let mapped;
      if (armChoice === "both") {
        const [lo, hi] = side === "left" ? LEFT_HAND_RANGE : RIGHT_HAND_RANGE;
        const t = clamp((screenX - lo) / (hi - lo), 0, 1);
        mapped = side === "left" ? t * 60 : 40 + t * 60;
      } else {
        mapped = clamp(((screenX - REACH_MIN) / (REACH_MAX - REACH_MIN)) * 100, 0, 100);
      }
      const half = BASKET_WIDTHS[levelRef.current] / 2;
      const x = clamp(sideFiltersRef.current[side].filter(mapped, now), half, 100 - half);

      let gesture = "unknown";
      if (idx && sh && (idx.visibility ?? 0) >= 0.4) {
        const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
        const ref = d(w, sh);
        if (ref > 1e-4) {
          const ratio = d(w, idx) / ref;
          if (ratio >= GESTURE_OPEN_RATIO) gesture = "open";
          else if (ratio <= GESTURE_CLOSED_RATIO) gesture = "closed";
        }
      }
      next[side] = { x, vis: true, gesture };
    }
    basketsRef.current = next;
    // one "any hand shape" value for the spawner and the labels
    const first = armChoice === "right" ? next.right : next.left.vis ? next.left : next.right;
    const label = first?.gesture || "unknown";
    if (label !== handGestureRef.current) {
      handGestureRef.current = label;
      setHandGestureLabel(label);
    }
  }, [poseData, armChoice]);

  // Push the basket positions into React state ~30 times a second. The game
  // loop reads basketsRef directly, so catching is instant.
  useEffect(() => {
    let raf;
    let last = 0;
    const tick = (t) => {
      if (t - last >= STATE_SYNC_MS) {
        last = t;
        const b = basketsRef.current;
        setBaskets((prev) => {
          const same = ["left", "right"].every(
            (k) =>
              prev[k].vis === b[k].vis &&
              prev[k].g === b[k].gesture &&
              Math.abs(prev[k].x - b[k].x) <= 0.15
          );
          return same
            ? prev
            : {
                left: { x: b.left.x, vis: b.left.vis, g: b.left.gesture },
                right: { x: b.right.x, vis: b.right.vis, g: b.right.gesture },
              };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

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

  const levelIndex = LEVELS.reduce((acc, l, i) => (caught >= l.minCaught ? i : acc), 0);
  const levelRef = useRef(0);
  levelRef.current = levelIndex;
  useEffect(() => {
    if (levelIndex === 0) return undefined;
    setLevelBanner({ visible: true, text: LEVELS[levelIndex].text });
    const t = setTimeout(() => setLevelBanner((b) => ({ ...b, visible: false })), 2600);
    return () => clearTimeout(t);
  }, [levelIndex]);

  // ============================================================
  // CATCH RADIUS — derived from visual basket
  // ============================================================
  useEffect(() => {
    const base = (BASKET_WIDTHS[levelIndex] / 2) * 1.05;
    const mult = difficultyToRadiusMultiplier(currentDifficulty);
    const papsBonus = 1 + (papsScore || 0) / 200;
    catchRadiusRef.current = clamp(base * mult * papsBonus, 5, 22);
  }, [currentDifficulty, papsScore, levelIndex]);

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

      const catchRadius = catchRadiusRef.current;
      const B = basketsRef.current;
      const firstBasket = armChoiceRef.current === "right" ? B.right : B.left.vis ? B.left : B.right;

      // ---- Basket trail: mutate ref only, no setState ----
      const trail = basketTrailRef.current;
      trail.push({ x: firstBasket.x });
      if (trail.length > BASKET_TRAIL_LENGTH) trail.shift();

      // ---- Fruit physics: mutate ref array in place ----
      const list = fruitsRef.current;
      let changed = false;
      for (let i = 0; i < list.length; i++) {
        const fruit = list[i];
        if (fruit.caught || fruit.missed) continue;

        // each fruit belongs to ONE hand: its own basket must catch it
        const bk = armChoiceRef.current === "both" ? B[fruit.hand] || B.left : firstBasket;
        const handVisible = bk.vis;
        const handX = bk.x;
        const gesture = bk.gesture;
        const gestureAvailable = gesture !== "unknown";

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
      telemetry.trackMovement({ x: (basketsRef.current.left.vis ? basketsRef.current.left.x : basketsRef.current.right.x), y: 50 });
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
    const lvl = LEVELS[levelIndex];
    const interval = Math.round((settings.spawnRate || 2200) * lvl.spawnMul);

    spawnTimerRef.current = setInterval(() => {
      const active = fruitsRef.current.filter(
        (f) => !f.caught && !f.missed
      ).length;
      if (active >= (armChoiceRef.current === "both" ? 4 : MAX_OBJECTS_ON_SCREEN)) return;

      const lv = LEVELS[levelRef.current];
      const obj = spawnObject({
        speed: (settings.speed || 0.35) * lv.speedMul,
        sizePx: settings.objectSize,
        gestureMix: lv.gestureMix,
        gestureAvailable: handGestureRef.current !== "unknown",
        armChoice: armChoiceRef.current,
        lastHand: lastHandRef.current,
      });
      lastHandRef.current = obj.hand;
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
    levelIndex,
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
  // SESSION FINALIZATION
  // ============================================================
  const finalizeTelemetry = useCallback(() => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;

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
  }, [telemetry, romDegrees, repData]);

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

    return {
      sessionId: telemetry.sessionId,
      gameId,
      patientId,
      date: new Date().toISOString(),
      durationSeconds: engine.elapsedSeconds,
      moodChoice: engine.moodChoice,
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
  }, [
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
          <div className="mb-6">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              🧺 Catch & Flex
            </h1>
            <p className="mt-2 text-slate-600">Guide the basket with your hand and catch what falls.</p>
          </div>

          <HowToPlay
            theme="light"
            variant="catch"
            caption="The basket follows your hand"
            steps={[
              "Sit back so your shoulders show on the camera.",
              "Move your hand left and right so the basket sits under the falling object.",
              "Match your hand shape to the object (see below).",
            ]}
            scoring={[
              "Every catch scores points, and catches in a row build a streak.",
              "Objects that hit the floor count as a miss.",
              "The wrong hand shape does not count as a catch.",
            ]}
            trains="shoulder and arm control, plus hand opening and closing."
          />

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

          <div className="mb-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <div className="mb-1.5 text-sm font-semibold text-slate-700">Which arm will you use?</div>
              <ArmPicker value={armChoice} onChange={setArmChoice} dark={false} hint={false} />
              <p className="mt-1 text-xs text-slate-500">With both arms, the arm you raise moves the basket.</p>
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
                  startSession();
                }}
                disabled={!guidance.isReady || !isActive}
                className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 px-8 py-4 text-base font-bold text-white shadow-md shadow-cyan-200 transition hover:from-cyan-400 hover:to-teal-400 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
              >
                Start Session
              </button>
              {(!guidance.isReady || !isActive) && (
                <p className="mt-3 text-center text-sm text-amber-600" role="status">
                  Start is locked: {!isActive ? "the camera is still starting." : guidance.message}
                </p>
              )}
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
          <SessionSummary
            sessionData={sessionData}
            gameName="Catch & Flex"
            gameId={gameId}
            onSaveReport={async () => await telemetry.saveReport(sessionData)}
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
    <GameShell backdrop={<OrchardBackdrop />}>
      <SessionCheckpoint {...engine.checkpoint} />

      <StageTopBar isPaused={isPaused} onPause={pauseSession} onResume={resumeSession} onEnd={endSession}>
        <span>⏱ {timeLeft}s</span>
        <span>🎯 {score}</span>
        <span>✅ {caught}</span>
        <span>❌ {missed}</span>
        <span>🔥 {streak}</span>
        <span className="text-amber-300">Level {levelIndex + 1}</span>
      </StageTopBar>

      <LevelBanner text={levelBanner.text} visible={levelBanner.visible} />

      {gameState === GAME_STATES.COUNTDOWN && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="text-[10rem] font-black text-cyan-300">{countdown || "GO"}</div>
        </div>
      )}

      {isPainDetected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-8 text-center text-slate-900 shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-3xl">⚠️</div>
            <h2 className="mb-2 text-xl font-bold">Discomfort Detected</h2>
            <p className="mb-6 text-sm text-slate-600">Take a short rest before resuming. The session is paused.</p>
            <button
              onClick={() => {
                resetPainState();
                painPausedRef.current = false;
                resumeSession();
              }}
              className="w-full rounded-2xl bg-cyan-500 px-6 py-3 font-bold text-white hover:bg-cyan-400"
            >
              Resume When Ready
            </button>
          </div>
        </div>
      )}

      {/* Catch zone band */}
      <div
        className="pointer-events-none absolute left-0 right-0 border-y border-dashed border-white/60 bg-white/15"
        style={{ top: `${CATCH_ZONE_MIN}%`, height: `${CATCH_ZONE_MAX - CATCH_ZONE_MIN}%` }}
      >
        <div className="absolute left-2 top-1 text-[10px] font-bold uppercase tracking-wide text-white/80">Catch zone</div>
      </div>

      {flash && (
        <div
          key={flash.key}
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          style={{ animation: "catch-flash 500ms ease-out forwards" }}
        >
          <div
            className={`rounded-3xl px-8 py-5 text-4xl font-black shadow-2xl ${
              flash.type === "catch" ? "bg-emerald-500/95 text-white" : "bg-red-500/95 text-white"
            }`}
          >
            {flash.type === "catch" ? "🎯 CAUGHT!" : "💨 MISSED"}
          </div>
        </div>
      )}

      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {basketTrail.map((p, i) => {
          const age = basketTrail.length - 1 - i;
          return <circle key={i} cx={p.x} cy={92} r={3 - age * 0.35} fill={`rgba(255,255,255,${Math.max(0, 0.5 - age * 0.08)})`} />;
        })}
      </svg>

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
                filter: "drop-shadow(0 4px 8px rgba(15,23,42,0.3))",
                willChange: "top, left",
              }}
            >
              {fruit.emoji}
              {armChoice === "both" && (
                <div
                  className="absolute -right-2 -top-1 rounded-full px-1.5 text-[13px] font-black text-white shadow"
                  style={{ background: HAND_COLOR[fruit.hand] === "#22d3ee" ? "#0891b2" : "#ea580c" }}
                >
                  {fruit.hand === "left" ? "L" : "R"}
                </div>
              )}
              {fruit.requiredGesture !== "any" && (
                <div
                  className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-0.5 text-[18px] font-bold shadow-md ${
                    fruit.requiredGesture === "open" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                  }`}
                  style={{ top: `-${Math.round(fruit.sizePx * 0.45)}px` }}
                >
                  {fruit.requiredGesture === "open" ? "✋ open" : "✊ close"}
                </div>
              )}
            </div>
          )
      )}

      {["left", "right"].map((side) => {
        const bk = baskets[side];
        if (!bk.vis) return null;
        if (armChoice !== "both" && armChoice !== side) return null;
        const tint = armChoice === "both" ? HAND_COLOR[side] : null;
        const g = bk.g;
        return (
          <div
            key={side}
            className="pointer-events-none absolute z-30 transition-opacity duration-150"
            style={{
              left: `${bk.x}%`,
              bottom: `${BASKET_BOTTOM_PERCENT}%`,
              transform: "translateX(-50%)",
              width: `${BASKET_WIDTHS[levelIndex]}%`,
              willChange: "left",
            }}
          >
            <div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ bottom: "100%" }}>
              <div
                className={`rounded-full border px-2 py-0.5 text-2xl shadow-md transition-colors duration-150 ${
                  g === "open"
                    ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                    : g === "closed"
                    ? "border-red-300 bg-red-100 text-red-700"
                    : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                {g === "open" ? "✋" : g === "closed" ? "✊" : "🤚"}
              </div>
              <div className="mt-1 h-3 w-px bg-white/70" />
            </div>
            <div className="relative flex items-end justify-center" style={{ color: tint || (g === "open" ? "#6ee7b7" : g === "closed" ? "#fca5a5" : "#ffffff") }}>
              <ShoppingBasket size={BASKET_ICON_SIZE_PX} strokeWidth={1.6} className="drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)]" style={{ width: "100%", height: "auto" }} />
              {tint && (
                <span className="absolute text-sm font-black text-white drop-shadow" style={{ bottom: "26%" }}>{side === "left" ? "L" : "R"}</span>
              )}
            </div>
          </div>
        );
      })}

      <div className="pointer-events-none absolute bottom-3 left-3 max-w-[45%] rounded-lg bg-black/50 px-3 py-1.5 text-xs font-semibold text-white sm:text-sm">
        {armChoice === "both"
          ? "Left hand catches cyan L fruit · right hand catches orange R fruit"
          : levelIndex === 0
          ? "Move your hand left and right to catch the fruit"
          : "✋ open hand = green and ⭐ · ✊ closed hand = red and cups"}
      </div>

      <CameraPip
        corner="tr"
        videoRef={videoRef}
        poseData={poseData}
        guidance={guidance}
        shoulderAngle={shoulderAngle}
        label={`${Math.round(shoulderAngle)}° ${activeSide} · ${handGestureLabel}`}
      />

      <style>{`
        @keyframes catch-flash {
          0%   { opacity: 0; transform: scale(0.85); }
          25%  { opacity: 1; transform: scale(1.08); }
          100% { opacity: 0; transform: scale(1); }
        }
      `}</style>
    </GameShell>
  );
}
