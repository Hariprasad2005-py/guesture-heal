// frontend/src/games/CatchAndFlex.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, X, ShoppingBasket } from "lucide-react";

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

const FRUITS = ["🍎", "🍊", "🍋", "🍇", "🍉", "🍓", "🥝", "🍑", "🍒", "🍌", "🥭", "🍍"];

function spawnFruit(speed, size) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    x: 5 + Math.random() * 90,
    y: -10,
    speed: speed || 0.35,
    emoji: FRUITS[Math.floor(Math.random() * FRUITS.length)],
    size: size || 32,
    caught: false,
  };
}

export default function CatchAndFlex({
  onSessionEnd,
  patientId,
  gameId = "catch-flex",
}) {
  const videoRef = useRef(null);
  const [poseData, setPoseData] = useState(null);
  const [fruits, setFruits] = useState([]);
  const [caught, setCaught] = useState(0);
  const [missed, setMissed] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [flash, setFlash] = useState(null);
  const [score, setScore] = useState(0);
  const [basketTrail, setBasketTrail] = useState([]);
  const [repData, setRepData] = useState([]);

  const minAngleRef = useRef(null);
  const maxAngleRef = useRef(0);
  const hasEndedRef = useRef(false);
  const gameLoopRef = useRef(null);
  const metricsEngine = useRef(new MetricsEngine());

  const { isActive } = useMediaPipeUpperBody({
    videoRef,
    onPoseUpdate: setPoseData,
  });

  const { position, shoulderAngle, activeSide } = usePoseDetection(poseData);
  const guidance = usePostureGuidance(poseData);
  const { papsScore, isPainDetected, resetPainState } = useFacialPainDetection({ videoRef });
  const { currentDifficulty, settings, adapt } = useAdaptiveDifficulty();
  const telemetry = useSessionTelemetry(patientId, gameId);
  const audio = useAudioFeedback(true);

  const totalAttempts = caught + missed;
  const accuracy = totalAttempts ? Math.round((caught / totalAttempts) * 100) : 100;
  const romDegrees = useMemo(() => {
    if (minAngleRef.current === null) return 0;
    return Math.max(0, Math.round(maxAngleRef.current - minAngleRef.current));
  }, [shoulderAngle]);

  const engine = useGameEngine({
    sessionLength: 120,
    onRepComplete: (success) => {
      telemetry.recordRep(success);
      if (success) {
        audio.playSuccess();
        setScore((s) => s + 10);
      } else {
        audio.playMiss();
      }
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

  const basketWidth = 70;
  const basketX = position.x - basketWidth / 2;

  // Track ROM with metrics engine
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    
    const repResult = metricsEngine.current.trackAngle(shoulderAngle, performance.now());
    if (repResult) {
      setRepData(prev => [...prev, repResult]);
    }
  }, [gameState, isPaused, shoulderAngle]);

  // Game loop
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

      setBasketTrail((current) => [...current.slice(-5), { x: position.x }]);

      setFruits((current) => {
        const next = [];
        let caughtThisFrame = 0;
        let missedThisFrame = 0;

        current.forEach((fruit) => {
          if (fruit.caught) return;

          const newY = fruit.y + fruit.speed * delta;

          const isCaught = newY >= 80 && newY <= 92 && 
            Math.abs(fruit.x - position.x) < basketWidth / 2 - 8;

          if (isCaught) {
            caughtThisFrame++;
            setCaught((c) => c + 1);
            setStreak((s) => {
              const next = s + 1;
              setBestStreak((best) => Math.max(best, next));
              return next;
            });
            completeRep(true);
            setFlash({ type: "catch", key: fruit.id });
            return;
          }

          if (newY > 105) {
            missedThisFrame++;
            setMissed((m) => m + 1);
            setStreak(0);
            completeRep(false);
            setFlash({ type: "miss", key: fruit.id });
            return;
          }

          next.push({ ...fruit, y: newY });
        });

        return next;
      });

      telemetry.trackMovement(position);
      telemetry.trackAngle(shoulderAngle);

      if (minAngleRef.current === null || (shoulderAngle > 0 && shoulderAngle < minAngleRef.current)) {
        minAngleRef.current = shoulderAngle > 0 ? shoulderAngle : 0;
      }
      if (shoulderAngle > maxAngleRef.current) {
        maxAngleRef.current = shoulderAngle;
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
  }, [gameState, isPaused, position, shoulderAngle, completeRep, telemetry]);

  // Spawn fruits
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;

    const spawnTimer = setInterval(() => {
      setFruits((current) => {
        if (current.filter(f => !f.caught).length > 8) return current;
        return [...current, spawnFruit(settings.speed || 0.35, settings.objectSize || 32)];
      });
    }, settings.spawnRate || 2200);

    return () => clearInterval(spawnTimer);
  }, [gameState, isPaused, settings.spawnRate, settings.speed]);

  // Clear flash
  useEffect(() => {
    if (!flash) return undefined;
    const timer = setTimeout(() => setFlash(null), 400);
    return () => clearTimeout(timer);
  }, [flash]);

  // Adaptive difficulty
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    const timer = setInterval(() => {
      adapt({ accuracy, papsScore, combo: bestStreak });
    }, 10000);
    return () => clearInterval(timer);
  }, [gameState, isPaused, adapt, accuracy, papsScore, bestStreak]);

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
      gameName: "Catch & Flex",
      score: score,
      caught,
      missed,
      accuracy,
      bestStreak,
      romDegrees: sessionStats.averageRom || romDegrees,
      papsScore,
      difficulty: currentDifficulty,
      gameSpecific: {
        fruitsPerMinute: (caught + missed) / ((SESSION_SECONDS - timeLeft) / 60) || 0,
        maxSimultaneousFruitsOnScreen: 8,
        repData: sessionStats.reps || repData,
      },
    });
  }, [telemetry, score, caught, missed, accuracy, bestStreak, romDegrees, papsScore, currentDifficulty, timeLeft, repData]);

  // ========== RENDER ==========

  if (gameState === GAME_STATES.INSTRUCTIONS) {
    return (
      <div className="min-h-screen bg-[#0B1120] p-8 text-white">
        <div className="max-w-4xl mx-auto">
          <h1 className="mb-2 text-3xl font-black">🧺 Catch & Flex</h1>
          <p className="mb-6 text-slate-400">
            Move your hand to control the basket and catch falling fruit!
            The basket follows your hand position. Catch as many as you can!
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
            className="mt-6 rounded-xl bg-cyan-500 px-8 py-3 font-bold hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500"
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
      durationSeconds: 120 - timeLeft,
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
      reps: caught + missed,
      hitsOrCatchesOrCompletions: caught,
      missesOrDrops: missed,
      gameSpecificMetrics: {
        fruitsPerMinute: (caught + missed) / ((120 - timeLeft) / 60) || 0,
        maxSimultaneousFruitsOnScreen: 8,
        bestStreak: bestStreak,
      },
    };

    return (
      <SessionSummary
        sessionData={sessionData}
        gameName="Catch & Flex"
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
          <span>🧺 Caught: {caught}</span>
          <span>❌ Missed: {missed}</span>
          <span>🔥 Streak: {streak}</span>
          <span>🎯 Acc: {accuracy}%</span>
          <span>💪 ROM: {romDegrees}°</span>
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
                flash.type === "catch" ? "text-emerald-400" : "text-red-400"
              }`}
              style={{ animation: "catch-flash 400ms ease-out forwards" }}
            >
              {flash.type === "catch" ? "🎯 CAUGHT!" : "💨 MISSED"}
            </div>
          )}

          <svg
            viewBox="0 0 100 100"
            className="pointer-events-none absolute inset-0 w-full h-full"
            preserveAspectRatio="none"
          >
            {basketTrail.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={90}
                r={4 - i * 0.5}
                fill="rgba(251,191,36,0.3)"
              />
            ))}
          </svg>

          {fruits.map((fruit) => (
            !fruit.caught && (
              <div
                key={fruit.id}
                className="absolute select-none transition-transform drop-shadow-lg"
                style={{
                  left: `${fruit.x}%`,
                  top: `${fruit.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontSize: `${fruit.size}px`,
                }}
              >
                {fruit.emoji}
              </div>
            )
          ))}

          <div
            className="absolute transition-all duration-100"
            style={{
              left: `${basketX}%`,
              bottom: "2%",
              width: `${basketWidth}%`,
              height: "16%",
            }}
          >
            <div className="relative w-full h-full flex items-end justify-center">
              <ShoppingBasket
                size={80}
                className="text-amber-400 drop-shadow-[0_0_30px_rgba(251,191,36,0.2)]"
                style={{ width: "100%", height: "auto", maxHeight: "100%" }}
              />
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3/4 h-1 rounded-full bg-amber-400/20 blur-xl" />
            </div>
          </div>

          <div className="absolute right-4 top-4 rounded-lg bg-black/60 px-4 py-2 text-right font-mono text-sm">
            <div className="text-amber-400 font-bold text-lg">⭐ {score}</div>
            <div className="text-slate-400">Streak: {streak}</div>
          </div>

          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-slate-500 text-xs whitespace-nowrap">
            Move your hand to catch falling fruit
          </div>
        </div>
      </div>

      <style>{`
        @keyframes catch-flash {
          0% { opacity: 0; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1.1); }
          100% { opacity: 0; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}