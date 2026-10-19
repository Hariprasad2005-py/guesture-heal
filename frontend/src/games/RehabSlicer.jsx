  // frontend/src/games/RehabSlicer.jsx
  import { useCallback, useEffect, useMemo, useRef, useState } from "react";
  import { Pause, Play, X } from "lucide-react";

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
import SessionCheckpoint from "../components/rehab/SessionCheckpoint";
import HowToPlay from "../components/rehab/HowToPlay";
import GameShell, { StageTopBar, CameraPip, HandBanner } from "../components/rehab/GameShell";
import ArmPicker from "../components/rehab/ArmPicker";
import { InkBackdrop } from "../components/rehab/GameBackdrops";
import LevelBanner from "../components/rehab/LevelBanner";
import useComfortEase from "../hooks/useComfortEase";
  import MetricsEngine from "../utils/metricsEngine";
  import { researchLogger } from "../utils/researchLogger";

  const SESSION_SECONDS = 120;

  // --- Rehab Slicer configuration -------------------------------------------
  // Base hitbox radius (% units, same scale as ball.x/ball.y). Multiply by
  // OBJECT_HITBOX_SCALE to make slicing more forgiving for limited-ROM
  // patients. Wire OBJECT_HITBOX_SCALE up to a per-patient setting (e.g.
  // settings.hitboxScale from useAdaptiveDifficulty, or a profile field)
  // wherever that value is meant to live long-term.
  const BASE_HIT_RADIUS = 12;
  const OBJECT_HITBOX_SCALE = 1;

  // Minimum wrist velocity (derived from a short position history, not a
  // single frame) required for a swipe to count as deliberate.
  const SWIPE_VELOCITY_THRESHOLD = 0.8;

  // How closely the wrist's movement direction must match the object's
  // required slice direction. 1 = perfect alignment, 0 = perpendicular.
  // Kept generous per spec ("do not make direction detection unnecessarily
  // strict for rehabilitation use").
  const DIRECTION_ALIGNMENT_THRESHOLD = 0.45;

  // How many recent wrist samples to keep for direction/velocity estimation.
  const WRIST_HISTORY_LENGTH = 6;

  const NEXT_BALL_DELAY_MS = 600;

  // Movement-complexity progression: which slice directions are in play at
  // each stage of the session, keyed by cumulative successful slices.
  const MOVEMENT_STAGES = [
    { minHits: 0, directions: ["horizontal"], sizeMul: 1.15, speedMul: 0.95, text: "Level 1: side to side" },
    { minHits: 4, directions: ["horizontal", "vertical"], sizeMul: 1.0, speedMul: 1.1, text: "Level 2: up and down too" },
    { minHits: 10, directions: ["horizontal", "vertical", "diagonal"], sizeMul: 0.95, speedMul: 1.25, text: "Level 3: diagonals" },
    { minHits: 17, directions: ["horizontal", "vertical", "diagonal"], sizeMul: 0.85, speedMul: 1.4, text: "Level 4: faster fruit" },
    { minHits: 25, directions: ["horizontal", "vertical", "diagonal"], sizeMul: 0.78, speedMul: 1.6, text: "Level 5: smaller and faster" },
    { minHits: 34, directions: ["horizontal", "vertical", "diagonal"], sizeMul: 0.72, speedMul: 1.8, text: "Level 6: fast lane" },
    { minHits: 45, directions: ["horizontal", "vertical", "diagonal"], sizeMul: 0.68, speedMul: 2.05, text: "Level 7: lightning fruit" },
    { minHits: 58, directions: ["horizontal", "vertical", "diagonal"], sizeMul: 0.64, speedMul: 2.3, text: "Level 8: master slicer" },
    { minHits: 72, directions: ["horizontal", "vertical", "diagonal"], sizeMul: 0.6, speedMul: 2.6, text: "Level 9: blur" },
    { minHits: 88, directions: ["horizontal", "vertical", "diagonal"], sizeMul: 0.56, speedMul: 2.9, text: "Level 10: legend" },
  ];

  // Eight levels. Each one is harder: more slice directions, faster, smaller.
  const LEVELS = [
    { minHits: 0, directions: ["horizontal"], sizeMul: 1.15, speedMul: 0.9, text: "Level 1: side to side" },
    { minHits: 5, directions: ["horizontal", "vertical"], sizeMul: 1.0, speedMul: 1.0, text: "Level 2: up and down too" },
    { minHits: 12, directions: ["horizontal", "vertical", "diagonal"], sizeMul: 0.95, speedMul: 1.1, text: "Level 3: diagonals" },
    { minHits: 20, directions: ["horizontal", "vertical", "diagonal"], sizeMul: 0.85, speedMul: 1.25, text: "Level 4: faster fruit" },
    { minHits: 30, directions: ["horizontal", "vertical", "diagonal"], sizeMul: 0.75, speedMul: 1.4, text: "Level 5: smaller and faster" },
    { minHits: 42, directions: ["horizontal", "vertical", "diagonal"], sizeMul: 0.7, speedMul: 1.6, text: "Level 6: fast lane" },
    { minHits: 56, directions: ["horizontal", "vertical", "diagonal"], sizeMul: 0.66, speedMul: 1.8, text: "Level 7: lightning fruit" },
    { minHits: 72, directions: ["horizontal", "vertical", "diagonal"], sizeMul: 0.62, speedMul: 2.05, text: "Level 8: master slicer" },
  ];

  const DIRECTION_HINT = {
    horizontal: { arrow: "↔", text: "Swipe side to side" },
    vertical: { arrow: "↕", text: "Swipe up and down" },
    diagonal: { arrow: "⤢", text: "Swipe across, diagonally" },
  };

  // Which hand each fruit asks for when both arms are in use.
  function assignHand(x, armChoice, last) {
    if (armChoice === "left" || armChoice === "right") return armChoice;
    if (x < 44) return "left";
    if (x > 56) return "right";
    return last === "left" ? "right" : "left";
  }

  const FRUIT_EMOJI = ["🍎", "🍊", "🍋", "🍇", "🍉", "🍓", "🥝", "🍑"];

  // Juice colour for the splash when each fruit is sliced.
  const JUICE = {
    "🍎": "#ef4444", "🍊": "#fb923c", "🍋": "#facc15", "🍇": "#a855f7",
    "🍉": "#f43f5e", "🍓": "#fb7185", "🥝": "#84cc16", "🍑": "#fdba74",
  };

  // The two halves of a sliced fruit fly apart along the cut line.
  // cut = angle of the blade (deg): horizontal swipe = flat cut, etc.
  const CUT_ANGLE = { horizontal: 0, vertical: 90, diagonal: 45 };
  function halfClip(angleDeg, side) {
    // a big half-plane through the centre, rotated by the cut angle
    const a = (angleDeg * Math.PI) / 180;
    const nx = -Math.sin(a), ny = Math.cos(a); // normal to the cut line
    const sgn = side === 0 ? 1 : -1;
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
      .map(([x, y]) => [x, y]);
    // build polygon of points on the chosen side of the line (in -1..1 space)
    const out = [];
    const L = 3;
    const dx = Math.cos(a), dy = Math.sin(a);
    out.push([-dx * L, -dy * L], [dx * L, dy * L], [dx * L + sgn * nx * L, dy * L + sgn * ny * L], [-dx * L + sgn * nx * L, -dy * L + sgn * ny * L]);
    void pts;
    return `polygon(${out.map(([x, y]) => `${50 + x * 50}% ${50 + y * 50}%`).join(",")})`;
  }

  function pickSliceDirection(allowedDirections) {
    const pool = allowedDirections && allowedDirections.length ? allowedDirections : ["horizontal"];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function spawnBall(speed, difficulty, allowedDirections, hitboxScale = OBJECT_HITBOX_SCALE, sizeMul = 1, speedMul = 1, armChoice = "both", lastHand = "right") {
    const sizeMap = { Beginner: 110, Intermediate: 100, Advanced: 90 };
    const size = Math.round((sizeMap[difficulty] || 40) * sizeMul);
    const spawnX = 15 + Math.random() * 70;
    const requiredDirection = pickSliceDirection(allowedDirections);
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      x: spawnX,
      y: -10,
      hand: assignHand(spawnX, armChoice, lastHand),
      speed: (speed || 0.4) * speedMul,
      emoji: FRUIT_EMOJI[Math.floor(Math.random() * FRUIT_EMOJI.length)],
      sliced: false,
      missed: false,
      size: size,
      requiredDirection,
      hitRadius: BASE_HIT_RADIUS * hitboxScale,
    };
  }

  // Classifies a wrist displacement as horizontal / vertical / diagonal.
  function classifySwipeDirection(dx, dy) {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX < 0.5 && absY < 0.5) return null; // negligible movement
    const ratio = absX / (absY || 0.001);
    if (ratio > 1.8) return "horizontal";
    if (ratio < 0.55) return "vertical";
    return "diagonal";
  }

  // Generous alignment score between the patient's actual swipe direction
  // and the object's required direction.
  function directionAlignment(actualDirection, requiredDirection) {
    if (!actualDirection) return 0;
    if (actualDirection === requiredDirection) return 1;
    if (requiredDirection === "diagonal" && actualDirection !== "diagonal") return 0.5;
    if (actualDirection === "diagonal") return 0.5;
    return 0;
  }

  // Derives swipe speed + direction from a short wrist position history.
  function getSwipeFromHistory(history) {
    if (history.length < 2) return { speed: 0, direction: null };
    const first = history[0];
    const last = history[history.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const speed = Math.max(...history.map((h) => h.v));
    return { speed, direction: classifySwipeDirection(dx, dy) };
  }

  export default function RehabSlicer({
    onSessionEnd,
    patientId,
    gameId = "rehab-slicer",
  }) {
    const videoRef = useRef(null);
    const [poseData, setPoseData] = useState(null);
    const [ball, setBall] = useState(null);
    const [hits, setHits] = useState(0);
    const [misses, setMisses] = useState(0);
    const [combo, setCombo] = useState(0);
    const [bestCombo, setBestCombo] = useState(0);
    const [flash, setFlash] = useState(null);
    const [effects, setEffects] = useState([]);
    const lastPointsRef = useRef(10);
    const [trail, setTrail] = useState([]);
    const [score, setScore] = useState(0);
    const [repData, setRepData] = useState([]);
    const [movementStage, setMovementStage] = useState(MOVEMENT_STAGES[0].directions);
    const [armChoice, setArmChoice] = useState("both");
    const [levelBanner, setLevelBanner] = useState({ visible: false, text: "" });
    const lastHandRef = useRef("right");
    const armChoiceRef = useRef("both");
    armChoiceRef.current = armChoice;
    const rawLevelIndex = LEVELS.reduce((acc, l, i) => (hits >= l.minHits ? i : acc), 0);
    const levelRef = useRef(0);

    const wristHistoryRef = useRef([]);
    const sliceVelocitiesRef = useRef([]);

    const minAngleRef = useRef(null);
    const maxAngleRef = useRef(0);
    const nextSpawnTimerRef = useRef(null);
    const hasEndedRef = useRef(false);
    const gameLoopRef = useRef(null);
    const metricsEngine = useRef(new MetricsEngine());

    const { isActive } = useMediaPipeUpperBody({
      videoRef,
      onPoseUpdate: setPoseData,
    });

    const forcedSide = armChoice !== "both" ? armChoice : ball && !ball.sliced ? ball.hand : "auto";
    const { position, velocity, shoulderAngle, activeSide } = usePoseDetection(poseData, { preferredSide: forcedSide });
    const guidance = usePostureGuidance(poseData);
    const { papsScore, isPainDetected, resetPainState } = useFacialPainDetection({ videoRef });
    const { currentDifficulty, settings, adapt } = useAdaptiveDifficulty();
    const telemetry = useSessionTelemetry(patientId, gameId);
    const audio = useAudioFeedback(true);

    // A session with zero attempts (hits=0, misses=0) has no measurable
    // accuracy -- 0/0 is mathematically undefined, not "perfect." The
    // previous `: 100` fallback fabricated a passing score for a patient
    // who never actually attempted a slice, letting a zero-attempt session
    // silently satisfy both the report's "valid" bucket and the 5-games/day
    // completion count. null follows this app's existing "not recorded"
    // convention (see Session.js/reportController.js's extensive
    // `typeof x === "number"` null-safety), and is deliberately NOT the
    // same as a real 0% (a real 0% means "attempted and missed every one" --
    // a true, valid, low-accuracy result; null means "never attempted").
    const accuracy = useMemo(() => {
      const attempts = hits + misses;
      return attempts ? Math.round((hits / attempts) * 100) : null;
    }, [hits, misses]);

    const missRate = useMemo(() => {
      const attempts = hits + misses;
      return attempts ? Math.round((misses / attempts) * 100) : 0;
    }, [hits, misses]);

    const avgSliceVelocity = useMemo(() => {
      const samples = sliceVelocitiesRef.current;
      if (!samples.length) return 0;
      const total = samples.reduce((sum, v) => sum + v, 0);
      return Number((total / samples.length).toFixed(2));
    }, [hits, misses]);

    const romDegrees = useMemo(() => {
      if (minAngleRef.current === null) return 0;
      return Math.max(0, Math.round(maxAngleRef.current - minAngleRef.current));
    }, [shoulderAngle]);

    const engine = useGameEngine({
      sessionLength: SESSION_SECONDS,
      // Rehab Slicer is a continuous, timer-driven game, not a turn-based
      // rep game: fruit spawns and misses are paced by its own
      // requestAnimationFrame loop, not by useGameEngine's FEEDBACK/REST
      // rep cycle. totalReps: 0 tells useGameEngine to keep gameState at
      // ACTIVE across completeRep() calls instead of detouring through
      // FEEDBACK -> REST -> ACTIVE on every single hit/miss (which was
      // killing this component's game loop, since that loop is gated on
      // gameState === ACTIVE). completeRep() is still called for every
      // hit/miss purely to drive telemetry + audio via onRepComplete below.
      totalReps: 0,
      onRepComplete: (success, data) => {
        telemetry.recordRep(success, data);
        if (success) audio.playSuccess();
        else audio.playMiss();
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

    // Looks uncomfortable for a few seconds -> drop a level; calm again -> back up.
    const { easeSteps, notice: comfortNotice } = useComfortEase({
      papsScore,
      isPainDetected,
      active: gameState === GAME_STATES.ACTIVE,
    });
    const levelIndex = Math.max(0, rawLevelIndex - easeSteps);
    levelRef.current = levelIndex;

    // --- Latest-value refs ----------------------------------------------------
    // The main rAF game loop below must stay alive for the whole ACTIVE
    // session — it must NOT be torn down and recreated every time MediaPipe
    // emits a new pose (which happens far more often than once per animation
    // frame). Previously position/velocity/shoulderAngle/combo/papsScore/
    // isPainDetected/completeRep/telemetry/spawnNextBall were all listed as
    // effect dependencies, so the effect's cleanup (cancelAnimationFrame) and
    // re-run (a brand new requestAnimationFrame(gameLoop)) fired on almost
    // every pose update — faster than the browser's paint cadence — so the
    // scheduled rAF callback was cancelled before it ever got to execute.
    // The fruit's y therefore never advanced past its spawn value (-10, i.e.
    // just above the visible 0-100 area), which is exactly why nothing
    // appeared on screen. Keeping "latest value" refs, updated on every
    // render (cheap — no effect needed), lets the loop read fresh data every
    // frame without being part of its dependency array.
    const positionRef = useRef(position);
    const velocityRef = useRef(velocity);
    const shoulderAngleRef = useRef(shoulderAngle);
    const comboRef = useRef(combo);
    const papsScoreRef = useRef(papsScore);
    const isPainDetectedRef = useRef(isPainDetected);
    const spawnNextBallRef = useRef(null);
    const completeRepRef = useRef(completeRep);
    const telemetryRef = useRef(telemetry);
    const gameStateRef = useRef(gameState);
    const isPausedRef = useRef(isPaused);

    const poseDataRef = useRef(poseData);
    poseDataRef.current = poseData;

    positionRef.current = position;
    velocityRef.current = velocity;
    shoulderAngleRef.current = shoulderAngle;
    comboRef.current = combo;
    papsScoreRef.current = papsScore;
    isPainDetectedRef.current = isPainDetected;
    completeRepRef.current = completeRep;
    telemetryRef.current = telemetry;
    gameStateRef.current = gameState;
    isPausedRef.current = isPaused;

    const clearSpawnTimer = useCallback(() => {
      if (nextSpawnTimerRef.current) {
        clearTimeout(nextSpawnTimerRef.current);
        nextSpawnTimerRef.current = null;
      }
    }, []);

    const spawnNextBall = useCallback(() => {
      clearSpawnTimer();
      const lvl = LEVELS[levelRef.current] || LEVELS[0];
      const nextBall = spawnBall(
        settings.speed || 0.4,
        currentDifficulty,
        lvl.directions,
        settings.hitboxScale || OBJECT_HITBOX_SCALE,
        lvl.sizeMul,
        lvl.speedMul,
        armChoiceRef.current,
        lastHandRef.current
      );
      lastHandRef.current = nextBall.hand;
      // a new fruit may mean a different hand: forget the old swipe path
      wristHistoryRef.current = [];
      setBall(nextBall);
      // settings.hitboxScale falls back to the constant above until
      // useAdaptiveDifficulty (not attached) is extended to expose a
      // per-patient value, e.g. for limited-ROM profiles.
    }, [clearSpawnTimer, settings.speed, settings.hitboxScale, currentDifficulty, movementStage]);

    spawnNextBallRef.current = spawnNextBall;

    // Track ROM with metrics engine
    useEffect(() => {
      if (gameState !== GAME_STATES.ACTIVE || isPaused) return;

      const repResult = metricsEngine.current.trackAngle(shoulderAngle, performance.now());
      if (repResult) {
        setRepData((prev) => [...prev, repResult]);
      }
    }, [gameState, isPaused, shoulderAngle]);

    // Maintain a short history of wrist positions so swipe direction/velocity
    // can be derived locally, using only what usePoseDetection already
    // exposes (position, velocity) — no changes to that hook required.
    useEffect(() => {
      if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
      wristHistoryRef.current = [
        ...wristHistoryRef.current.slice(-(WRIST_HISTORY_LENGTH - 1)),
        { x: position.x, y: position.y, v: velocity, t: performance.now() },
      ];
    }, [gameState, isPaused, position, velocity]);

    // Movement-complexity progression: unlock vertical/diagonal slice
    // requirements as the patient accumulates successful hits, per spec
    // ("do not introduce complex movements immediately").
    useEffect(() => {
      setMovementStage(LEVELS[levelIndex].directions);
    }, [levelIndex]);

    useEffect(() => {
      if (levelIndex === 0) return undefined;
      setLevelBanner({ visible: true, text: LEVELS[levelIndex].text });
      const t = setTimeout(() => setLevelBanner((b) => ({ ...b, visible: false })), 2600);
      return () => clearTimeout(t);
    }, [levelIndex]);

    // --- Main game loop ---------------------------------------------------
    // This effect now depends ONLY on [gameState, isPaused, clearSpawnTimer]
    // (clearSpawnTimer is a stable useCallback with an empty dep array, so
    // in practice this only starts/stops when the session actually starts,
    // pauses, resumes, or ends — exactly the intended behavior). Everything
    // else the loop needs is read from the latest-value refs above, so a
    // fresh pose frame never tears the rAF chain down.
    useEffect(() => {
      if (gameState !== GAME_STATES.ACTIVE || isPaused) {
        if (gameLoopRef.current) {
          cancelAnimationFrame(gameLoopRef.current);
          gameLoopRef.current = null;
        }
        return;
      }

      let lastTime = performance.now();

      const gameLoop = (timestamp) => {
        const delta = Math.min((timestamp - lastTime) / 16, 3);
        lastTime = timestamp;

        // Research instrumentation (no-op unless ?research=1): this is the
        // moment the game first reads the newest pose frame.
        if (poseDataRef.current?.frameId) researchLogger.completeFrame(poseDataRef.current.frameId);

        const pos = positionRef.current;

        setTrail((current) => [...current.slice(-9), { ...pos }]);

        setBall((current) => {
          if (!current || current.sliced || current.missed) return current;

          const nextY = current.y + current.speed * delta;
          const distance = Math.hypot(pos.x - current.x, pos.y - nextY);
          const withinHitbox = distance < (current.hitRadius ?? BASE_HIT_RADIUS);

          // Slice = hitbox overlap AND a deliberate, direction-aligned swipe.
          // Both conditions are required per spec — path intersection alone,
          // or a fast but misdirected movement, should not count.
          const { speed: swipeSpeed, direction: swipeDirection } = getSwipeFromHistory(
            wristHistoryRef.current
          );
          const alignment = directionAlignment(swipeDirection, current.requiredDirection);
          const isDeliberateSwipe = swipeSpeed > SWIPE_VELOCITY_THRESHOLD;
          const isAligned = alignment >= DIRECTION_ALIGNMENT_THRESHOLD;
          const isSliced = withinHitbox && isDeliberateSwipe && isAligned;

          if (isSliced) {
            sliceVelocitiesRef.current = [...sliceVelocitiesRef.current.slice(-49), swipeSpeed];

            // Pain-Adjusted Performance Score: reduce the effective combo
            // multiplier (not zero it out) while discomfort is reported, to
            // discourage over-exertion without erasing progress.
            // NOTE: papsScore from useFacialPainDetection is 0–10, not a
            // percentage — isPainDetected is that hook's own debounced
            // (2s-confirmed) boolean and is the correct signal here, matching
            // how RehabSlicer already gates the pain-pause overlay elsewhere.
            const multiplier = isPainDetectedRef.current
              ? Math.max(1, comboRef.current * 0.6)
              : comboRef.current;
            const pointsEarned = 10 + Math.round(multiplier * 2);
            lastPointsRef.current = pointsEarned;

            setHits((h) => h + 1);
            setScore((s) => s + pointsEarned);
            setCombo((c) => {
              const next = c + 1;
              comboRef.current = next;
              setBestCombo((best) => Math.max(best, next));
              return next;
            });
            // completeRep(true) already triggers audio.playSuccess() via the
            // existing useGameEngine onRepComplete callback — not duplicated
            // here. The second argument is new telemetry data (swipe speed +
            // direction), forwarded end-to-end via onRepComplete → recordRep.
            completeRepRef.current(true, {
              swipeSpeed,
              direction: swipeDirection,
              requiredDirection: current.requiredDirection,
            });

            const feedbackLabel = swipeSpeed > SWIPE_VELOCITY_THRESHOLD * 1.6 ? "GREAT" : "GOOD";
            setFlash({ type: "hit", key: current.id, label: feedbackLabel });

            // Single controlled spawn mechanism: always clear any pending
            // timer before scheduling a new one, and always store the new
            // timer's id in nextSpawnTimerRef so it can be cancelled on
            // pause/end/unmount. Re-check gameState/isPaused via refs at
            // fire time so a pause or end that happens during the delay
            // isn't overridden by a stale closure.
            clearSpawnTimer();
            nextSpawnTimerRef.current = setTimeout(() => {
              nextSpawnTimerRef.current = null;
              if (gameStateRef.current === GAME_STATES.ACTIVE && !isPausedRef.current) {
                spawnNextBallRef.current();
              }
            }, NEXT_BALL_DELAY_MS);

            return { ...current, sliced: true, y: nextY };
          }

          if (nextY > 105) {
            setMisses((m) => m + 1);
            setCombo(0);
            comboRef.current = 0;
            // completeRep(false) already triggers audio.playMiss() via
            // useGameEngine onRepComplete — not duplicated here.
            completeRepRef.current(false, { requiredDirection: current.requiredDirection });
            setFlash({ type: "miss", key: current.id, label: "MISS" });

            // Object turns red/desaturated for one beat before it's cleared
            // and the next ball spawns, per the miss-feedback spec.
            clearSpawnTimer();
            nextSpawnTimerRef.current = setTimeout(() => {
              nextSpawnTimerRef.current = null;
              setBall((b) => (b && b.id === current.id ? null : b));
              if (gameStateRef.current === GAME_STATES.ACTIVE && !isPausedRef.current) {
                spawnNextBallRef.current();
              }
            }, NEXT_BALL_DELAY_MS);

            return { ...current, missed: true, y: nextY };
          }

          return { ...current, y: nextY };
        });

        const currentShoulderAngle = shoulderAngleRef.current;
        telemetryRef.current.trackMovement(pos);
        telemetryRef.current.trackAngle(currentShoulderAngle);

        if (
          minAngleRef.current === null ||
          (currentShoulderAngle > 0 && currentShoulderAngle < minAngleRef.current)
        ) {
          minAngleRef.current = currentShoulderAngle > 0 ? currentShoulderAngle : 0;
        }
        if (currentShoulderAngle > maxAngleRef.current) {
          maxAngleRef.current = currentShoulderAngle;
        }

        gameLoopRef.current = requestAnimationFrame(gameLoop);
      };

      gameLoopRef.current = requestAnimationFrame(gameLoop);

      return () => {
        if (gameLoopRef.current) {
          cancelAnimationFrame(gameLoopRef.current);
          gameLoopRef.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState, isPaused, clearSpawnTimer]);

    // Spawn first ball when game becomes active
    useEffect(() => {
      if (gameState === GAME_STATES.ACTIVE && !ball && !nextSpawnTimerRef.current && !isPaused) {
        spawnNextBall();
      }
    }, [gameState, ball, isPaused, spawnNextBall]);

    // Slice effects: two fruit halves, juice splash and a points popup.
    useEffect(() => {
      if (!ball || !ball.sliced) return undefined;
      const id = `fx-${ball.id}`;
      const fx = {
        id, x: ball.x, y: ball.y, size: ball.size, emoji: ball.emoji,
        color: JUICE[ball.emoji] || "#fde047",
        cut: CUT_ANGLE[ball.requiredDirection] ?? 0,
        points: lastPointsRef.current,
        drops: Array.from({ length: 10 }, (_, i) => ({
          a: (i / 10) * 360 + Math.random() * 25,
          d: 40 + Math.random() * 70,
          r: 4 + Math.random() * 7,
        })),
      };
      setEffects((list) => [...list.slice(-3), fx]);
      setTimeout(() => setEffects((list) => list.filter((e) => e.id !== id)), 900);
      return undefined;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ball?.id, ball?.sliced]);

    // Clear flash after animation
    useEffect(() => {
      if (!flash) return undefined;
      const timer = setTimeout(() => setFlash(null), 450);
      return () => clearTimeout(timer);
    }, [flash]);

    // Adaptive difficulty — speed/frequency ramp up gradually with accuracy,
    // combo, and demonstrated ROM, and ease back down as pain or missRate
    // rises. IMPORTANT: useAdaptiveDifficulty's level-up branch requires
    // maxFlexionAngle to meet a ROM threshold before it will advance a
    // level at all — omitting it here (as the previous version of this
    // file did) meant difficulty could only ever decrease, never increase.
    // missRate is now read by useAdaptiveDifficulty.js (see the companion
    // find/replace for that file) as an additional step-down trigger,
    // independent of accuracy.
    useEffect(() => {
      if (gameState !== GAME_STATES.ACTIVE || isPaused) return undefined;
      const timer = setInterval(() => {
        adapt({
          accuracy,
          papsScore,
          combo: bestCombo,
          missRate,
          maxFlexionAngle: maxAngleRef.current,
        });
      }, 10000);
      return () => clearInterval(timer);
    }, [gameState, isPaused, adapt, accuracy, papsScore, bestCombo, missRate]);

    // Pain detection
    useEffect(() => {
      if (!isPainDetected || gameState !== GAME_STATES.ACTIVE) return;
      pauseSession();
      telemetry.trackPain(papsScore);
    }, [isPainDetected, gameState, pauseSession, telemetry, papsScore]);

    useEffect(() => () => clearSpawnTimer(), [clearSpawnTimer]);

    const finalizeTelemetry = useCallback(() => {
      if (hasEndedRef.current) return;
      hasEndedRef.current = true;
      const sessionStats = metricsEngine.current.getSessionStats();
      telemetry.endSession({
        gameName: "Rehab Slicer",
        score: score,
        hits,
        misses,
        accuracy,
        missRate,
        bestCombo,
        currentCombo: combo,
        romDegrees: sessionStats.averageRom || romDegrees,
        papsScore,
        difficulty: currentDifficulty,
        gameSpecific: {
          avgSwipeSpeed: score / ((hits + misses) || 1),
          avgMovementVelocity: avgSliceVelocity,
          totalSuccessfulSlices: hits,
          longestHitStreak: bestCombo,
          totalSwipes: hits + misses,
          movementStagesUnlocked: movementStage,
          repData: sessionStats.reps || repData,
        },
      });
    }, [
      telemetry,
      score,
      hits,
      misses,
      accuracy,
      missRate,
      bestCombo,
      combo,
      romDegrees,
      papsScore,
      currentDifficulty,
      avgSliceVelocity,
      movementStage,
      repData,
    ]);

    // ========== RENDER ==========

    if (gameState === GAME_STATES.INSTRUCTIONS) {
      return (
        <div className="min-h-screen bg-[#0B1120] p-8 text-white">
          <div className="max-w-4xl mx-auto">
            <h1 className="mb-2 text-3xl font-black">🍉 Rehab Slicer</h1>
            <p className="mb-6 text-slate-400">Slice each falling fruit with a quick swipe of your hand.</p>
            <HowToPlay
              variant="slice"
              caption="Swipe through the fruit"
              steps={[
                "Sit back so your shoulders show on the camera.",
                "A fruit falls. Swipe your hand quickly through it.",
                "Slice it before it drops off the screen. One fruit at a time.",
              ]}
              scoring={[
                "Each slice scores 10 points plus a bonus that grows with your streak.",
                "A missed fruit resets your streak.",
                "A slow wave does not count. Use a quick, clear swipe toward the fruit.",
              ]}
              trains="shoulder and arm movement, and speed control."
            />

            <div className="mb-4 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div>
                <div className="mb-1.5 text-sm font-semibold text-slate-200">Which arm will you use?</div>
                <ArmPicker value={armChoice} onChange={setArmChoice} />
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border-4 border-slate-800 aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full scale-x-[-1] object-cover"
              />
              <SkeletonOverlay
                poseData={poseData}
                overallStatus={guidance.overallStatus}
                shoulderAngle={shoulderAngle}
              />
              <div className="absolute left-4 top-4 rounded-lg bg-black/60 px-3 py-2 font-mono text-sm">
                {Math.round(shoulderAngle)}° | {activeSide} | PAPS {papsScore}
              </div>
            </div>

            <div className={`mt-4 rounded-xl border p-4 ${
              guidance.overallStatus === 'ok' 
                ? 'border-green-800 bg-green-950/30 text-green-300' 
                : 'border-amber-800 bg-amber-950/30 text-amber-300'
            }`}>
              {guidance.message}
            </div>

            <button
              onClick={() => {
                telemetry.startTracking();
                startSession();
              }}
              disabled={!guidance.isReady || !isActive}
              className="mt-6 rounded-xl bg-cyan-500 px-8 py-3 font-bold text-white hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
            >
              Start Session
            </button>
            {(!guidance.isReady || !isActive) && (
              <p className="mt-3 text-sm text-amber-300" role="status">
                Start is locked: {!isActive ? "the camera is still starting." : guidance.message}
              </p>
            )}
          </div>
        </div>
      );
    }

    if (gameState === GAME_STATES.COMPLETE) {
      const sessionData = {
        sessionId: telemetry.sessionId,
        gameId: gameId,
        patientId: patientId,
        date: new Date().toISOString(),
        durationSeconds: engine.elapsedSeconds,
      moodChoice: engine.moodChoice,
        score: score,
        accuracyPercent: accuracy,
        romData: {
          averageRomDegrees: romDegrees || 0,
          maxRomDegrees: maxAngleRef.current || 0,
          perRep: repData.map((r, i) => ({ 
            rep: i + 1, 
            romDegrees: r.romDegrees || 0, 
            success: r.success !== false 
          })),
        },
        reps: hits + misses,
        hitsOrCatchesOrCompletions: hits,
        missesOrDrops: misses,
        gameSpecificMetrics: {
          avgSwipeSpeed: score / ((hits + misses) || 1),
          avgMovementVelocity: avgSliceVelocity,
          totalSuccessfulSlices: hits,
          missRate,
          longestHitStreak: bestCombo,
          totalSwipes: hits + misses,
        },
      };

      return (
        <SessionSummary
          sessionData={sessionData}
          gameName="Rehab Slicer"
          gameId={gameId}
          onSaveReport={async () => {
            const result = await telemetry.saveReport(sessionData);
            return result;
          }}
          onFinish={() => {
            onSessionEnd?.(sessionData);
          }}
        />
      );
    }

    // Active game state — full-screen themed stage
    const lightTheme = true;
    const hint = ball ? DIRECTION_HINT[ball.requiredDirection] : null;
    const fruitHand = armChoice === "both" && ball && !ball.sliced ? ball.hand : null;
    return (
      <GameShell backdrop={<InkBackdrop level={levelIndex} />}>
        <SessionCheckpoint {...engine.checkpoint} />
        {gameState === GAME_STATES.COUNTDOWN && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 text-8xl font-black text-cyan-300">
            {countdown || "GO"}
          </div>
        )}

        {isPainDetected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
            <div className="max-w-md rounded-2xl bg-slate-900 p-8 text-center">
              <h2 className="mb-3 text-xl font-bold text-red-400">Discomfort Detected</h2>
              <p className="mb-6 text-slate-300">Please rest before resuming.</p>
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

        <StageTopBar
          isPaused={isPaused}
          onPause={pauseSession}
          onResume={resumeSession}
          onEnd={endSession}
        >
          {[
            ["⏱", `${timeLeft}s`, ""],
            ["🎯", score, "text-yellow-200"],
            ["✅", hits, "text-emerald-200"],
            ["❌", misses, "text-rose-200"],
            ["🔥", combo, "text-orange-200"],
          ].map(([ic, v, c]) => (
            <span key={ic} className={`inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1 ${c}`}>
              <span>{ic}</span>
              <span className="tabular-nums">{v}</span>
            </span>
          ))}
          <span className="rounded-full bg-amber-400 px-3 py-1 font-black text-slate-900">Level {levelIndex + 1}</span>
        </StageTopBar>

        <LevelBanner text={levelBanner.text} visible={levelBanner.visible} />
        <LevelBanner text={comfortNotice.text} visible={comfortNotice.visible} />
        <HandBanner hand={fruitHand} />

        {flash && (
          <div
            key={flash.key}
            className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-5xl font-black drop-shadow-[0_2px_0_rgba(255,255,255,.8)] ${
              flash.type === "hit" ? "text-emerald-600" : "text-red-600"
            }`}
            style={{ animation: "slicer-flash 450ms ease-out forwards" }}
          >
            {flash.type === "hit" ? (flash.label === "GREAT" ? "🔥 GREAT!" : "✅ GOOD!") : "❌ MISS"}
          </div>
        )}

        {/* soft vignette so the fruit pops */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(2,6,23,0.28) 100%)" }} />

        {/* glowing blade trail: older points are thinner and fainter */}
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
          {trail.slice(1).map((pt, k) => {
            const prev = trail[k];
            const f = (k + 1) / trail.length;
            const col = fruitHand === "left" ? "#0e7490" : fruitHand === "right" ? "#c2410c" : "#be123c";
            return (
              <g key={k} opacity={0.15 + f * 0.8}>
                <line x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y} stroke={col} strokeWidth={3 + f * 10} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <line x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y} stroke="#fff" strokeWidth={1 + f * 4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </svg>

        {ball && !ball.sliced && (
          <div
            className="absolute select-none"
            style={{ left: `${ball.x}%`, top: `${ball.y}%`, transform: "translate(-50%, -50%)" }}
          >
            {/* soft glow + ground shadow */}
            <div
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{
                width: ball.size * 1.5, height: ball.size * 1.5, transform: "translate(-50%, -50%)",
                background: `radial-gradient(circle, ${JUICE[ball.emoji] || "#fde047"}55 0%, transparent 65%)`,
              }}
            />
            <div
              style={{
                position: "relative",
                fontSize: `${ball.size}px`,
                lineHeight: 1,
                transform: `rotate(${Math.round(ball.y * 3.2) % 360}deg)`,
                filter: ball.missed
                  ? "grayscale(1) brightness(0.8)"
                  : "drop-shadow(0 10px 12px rgba(0,0,0,.35)) drop-shadow(0 0 10px rgba(255,255,255,.5))",
                opacity: ball.missed ? 0.55 : 1,
                transition: "opacity .3s",
              }}
            >
              {ball.emoji}
            </div>
            {hint && !ball.missed && (
              <div
                className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-white/80 px-3 py-0.5 font-black text-white shadow-lg"
                style={{
                  top: "100%",
                  marginTop: 4,
                  fontSize: Math.max(18, Math.round(ball.size * 0.3)),
                  background: fruitHand === "left" ? "#0891b2" : fruitHand === "right" ? "#ea580c" : "#334155",
                }}
              >
                {hint.arrow}
              </div>
            )}
          </div>
        )}

        {/* slice effects: halves, juice, points */}
        {effects.map((fx) => (
          <div key={fx.id} className="pointer-events-none absolute" style={{ left: `${fx.x}%`, top: `${fx.y}%`, width: 0, height: 0 }}>
            {[0, 1].map((side) => (
              <div
                key={side}
                style={{
                  position: "absolute",
                  left: -fx.size / 2, top: -fx.size / 2, width: fx.size, height: fx.size,
                  fontSize: fx.size, lineHeight: 1, textAlign: "center",
                  clipPath: halfClip(fx.cut, side),
                  animation: `slicer-half-${side} 800ms cubic-bezier(.2,.7,.4,1) forwards`,
                  "--cut": `${fx.cut}deg`,
                  filter: "drop-shadow(0 6px 8px rgba(0,0,0,.35))",
                }}
              >
                {fx.emoji}
              </div>
            ))}
            {/* blade flash along the cut */}
            <div
              style={{
                position: "absolute", left: -fx.size, top: -2, width: fx.size * 2, height: 4, borderRadius: 4,
                background: "linear-gradient(90deg, transparent, #fff, transparent)",
                transform: `rotate(${fx.cut}deg)`, animation: "slicer-blade 360ms ease-out forwards",
              }}
            />
            {fx.drops.map((d, k) => (
              <span
                key={k}
                style={{
                  position: "absolute", left: -d.r / 2, top: -d.r / 2, width: d.r, height: d.r, borderRadius: "50%",
                  background: fx.color, boxShadow: `0 0 8px ${fx.color}`,
                  "--dx": `${Math.cos((d.a * Math.PI) / 180) * d.d}px`,
                  "--dy": `${Math.sin((d.a * Math.PI) / 180) * d.d + 20}px`,
                  animation: "slicer-drop 700ms ease-out forwards",
                }}
              />
            ))}
            <div
              style={{
                position: "absolute", left: 0, top: -fx.size * 0.6, transform: "translateX(-50%)",
                fontWeight: 900, fontSize: 28, color: "#fff", whiteSpace: "nowrap",
                textShadow: `0 2px 0 ${fx.color}, 0 0 14px ${fx.color}`,
                animation: "slicer-points 900ms ease-out forwards",
              }}
            >
              +{fx.points}
            </div>
          </div>
        ))}

        <div
          className="pointer-events-none absolute h-8 w-8 rounded-full border-4 bg-white/50"
          style={{
            left: `${position.x}%`,
            top: `${position.y}%`,
            transform: "translate(-50%, -50%)",
            borderColor: fruitHand === "left" ? "#22d3ee" : fruitHand === "right" ? "#f97316" : "#22d3ee",
            boxShadow: "0 0 14px 4px rgba(255,255,255,.45)",
          }}
        />

        <div
          className={`pointer-events-none absolute bottom-3 left-3 max-w-[55%] rounded-lg px-3 py-1.5 text-xs font-semibold sm:text-sm ${
            lightTheme ? "bg-slate-900/70 text-white" : "bg-black/50 text-white"
          }`}
        >
          {hint ? `${hint.arrow} ${hint.text} through the fruit` : "Slice the fruit with a quick swipe"}
        </div>

        <CameraPip
          videoRef={videoRef}
          poseData={poseData}
          guidance={guidance}
          shoulderAngle={shoulderAngle}
          label={`${Math.round(shoulderAngle)}° ${activeSide}`}
        />

        <style>{`
          @keyframes slicer-flash {
            0% { opacity: 0; transform: scale(0.8); }
            25% { opacity: 1; transform: scale(1.1); }
            100% { opacity: 0; transform: scale(1); }
          }
          @keyframes slicer-half-0 {
            0% { transform: translate(0,0) rotate(0deg); opacity: 1; }
            100% { transform: translate(-26px, -70px) rotate(-38deg); opacity: 0; }
          }
          @keyframes slicer-half-1 {
            0% { transform: translate(0,0) rotate(0deg); opacity: 1; }
            100% { transform: translate(26px, 70px) rotate(38deg); opacity: 0; }
          }
          @keyframes slicer-blade {
            0% { opacity: 1; transform: scaleX(.2) rotate(var(--cut, 0deg)); }
            100% { opacity: 0; transform: scaleX(1.2) rotate(var(--cut, 0deg)); }
          }
          @keyframes slicer-drop {
            0% { transform: translate(0,0) scale(1); opacity: 1; }
            100% { transform: translate(var(--dx), var(--dy)) scale(.2); opacity: 0; }
          }
          @keyframes slicer-points {
            0% { transform: translate(-50%, 0) scale(.6); opacity: 0; }
            20% { transform: translate(-50%, -8px) scale(1.15); opacity: 1; }
            100% { transform: translate(-50%, -60px) scale(1); opacity: 0; }
          }
        `}</style>
      </GameShell>
    );
  }
