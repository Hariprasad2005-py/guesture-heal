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
  import MetricsEngine from "../utils/metricsEngine";

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
    { minHits: 0, directions: ["horizontal"] },
    { minHits: 5, directions: ["horizontal", "vertical"] },
    { minHits: 12, directions: ["horizontal", "vertical", "diagonal"] },
  ];

  const FRUIT_EMOJI = ["🍎", "🍊", "🍋", "🍇", "🍉", "🍓", "🥝", "🍑"];

  function pickSliceDirection(allowedDirections) {
    const pool = allowedDirections && allowedDirections.length ? allowedDirections : ["horizontal"];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function spawnBall(speed, difficulty, allowedDirections, hitboxScale = OBJECT_HITBOX_SCALE) {
    const sizeMap = { Beginner: 110, Intermediate: 100, Advanced: 90 };
    const size = sizeMap[difficulty] || 40;
    const requiredDirection = pickSliceDirection(allowedDirections);
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      x: 15 + Math.random() * 70,
      y: -10,
      speed: speed || 0.4,
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
    const [trail, setTrail] = useState([]);
    const [score, setScore] = useState(0);
    const [repData, setRepData] = useState([]);
    const [movementStage, setMovementStage] = useState(MOVEMENT_STAGES[0].directions);

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

    const { position, velocity, shoulderAngle, activeSide } = usePoseDetection(poseData);
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
      setBall(
        spawnBall(
          settings.speed || 0.4,
          currentDifficulty,
          movementStage,
          settings.hitboxScale || OBJECT_HITBOX_SCALE
        )
      );
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
      const stage = [...MOVEMENT_STAGES].reverse().find((s) => hits >= s.minHits);
      setMovementStage((stage || MOVEMENT_STAGES[0]).directions);
    }, [hits]);

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
            <p className="mb-6 text-slate-400">
              Slice the falling fruit with your hand movement! Each fruit must be sliced
              before it falls off screen. One fruit at a time — accuracy matters!
            </p>

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
              className="mt-6 rounded-xl bg-cyan-500 px-8 py-3 font-bold text-white hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500"
            >
              Start Session
            </button>
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
        durationSeconds: SESSION_SECONDS - timeLeft,
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

    // Active game state
    return (
      <div className="min-h-screen bg-[#0B1120] p-8 pt-24 text-white">
        {gameState === GAME_STATES.COUNTDOWN && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 text-8xl font-black text-cyan-400">
            {countdown || "GO"}
          </div>
        )}

        {isPainDetected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
            <div className="rounded-2xl bg-slate-900 p-8 text-center max-w-md">
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

        {/* Top bar */}
        <div className="fixed left-0 right-0 top-0 z-40 flex justify-between border-b border-slate-800 bg-slate-950/90 px-8 py-4 backdrop-blur">
          <div className="flex gap-5 font-mono text-sm overflow-x-auto">
            <span>⏱ {timeLeft}s</span>
            <span>🎯 Score: {score}</span>
            <span>✅ Hits: {hits}</span>
            <span>❌ Misses: {misses}</span>
            <span>🔥 Combo: {combo}</span>
            <span>📊 Acc: {accuracy}%</span>
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

        {/* Game area */}
        <div className="flex h-[calc(100vh-140px)] gap-6">
          {/* Camera view */}
          <div className="relative w-[38%] overflow-hidden rounded-2xl border-4 border-slate-800 flex-shrink-0">
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
            <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-2 font-mono text-sm">
              {Math.round(shoulderAngle)}° | {activeSide}
            </div>
          </div>

          {/* Game canvas */}
          <div className="relative w-[62%] overflow-hidden rounded-2xl border-4 border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900">
                      {flash && (
              <div
                key={flash.key}
                className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-4xl font-black ${
                  flash.type === "hit" ? "text-emerald-400" : "text-red-400"
                }`}
                style={{ animation: "slicer-flash 450ms ease-out forwards" }}
              >
                {flash.type === "hit"
                  ? flash.label === "GREAT"
                    ? "🔥 GREAT!"
                    : "✅ GOOD!"
                  : "❌ MISS"}
              </div>
            )}

            <svg
              viewBox="0 0 100 100"
              className="pointer-events-none absolute inset-0 w-full h-full"
              preserveAspectRatio="none"
            >
              <polyline
                points={trail.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#22d3ee"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.6"
              />
            </svg>

            {ball && !ball.sliced && (
              <div
                className="absolute select-none transition-transform"
                style={{
                  left: `${ball.x}%`,
                  top: `${ball.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontSize: `${ball.size}px`,
                  filter: ball.missed
                    ? "grayscale(1) sepia(1) saturate(6) hue-rotate(-40deg) brightness(0.85)"
                    : "drop-shadow(0 0 12px rgba(255,255,255,.35))",
                  opacity: ball.missed ? 0.7 : 1,
                }}
              >
                {ball.emoji}
              </div>
            )}

            <div
              className="absolute w-6 h-6 rounded-full border-4 border-cyan-400 bg-cyan-200/40 shadow-[0_0_14px_4px_rgba(34,211,238,.4)] pointer-events-none"
              style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
                transform: "translate(-50%, -50%)",
                transition: "left 0.05s, top 0.05s",
              }}
            />

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-slate-500 text-xs">
              Move your hand to slice the fruit
            </div>
          </div>
        </div>

        <style>{`
          @keyframes slicer-flash {
            0% { opacity: 0; transform: scale(0.8); }
            25% { opacity: 1; transform: scale(1.1); }
            100% { opacity: 0; transform: scale(1); }
          }
        `}</style>
      </div>
    );
  }