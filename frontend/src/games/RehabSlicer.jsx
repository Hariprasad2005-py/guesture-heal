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
const HIT_RADIUS = 12;
const SLICE_VELOCITY_THRESHOLD = 0.8;
const NEXT_BALL_DELAY_MS = 600;
const FRUIT_EMOJI = ["🍎", "🍊", "🍋", "🍇", "🍉", "🍓", "🥝", "🍑"];

function spawnBall(speed, difficulty) {
  const sizeMap = { Beginner: 50, Intermediate: 40, Advanced: 30 };
  const size = sizeMap[difficulty] || 40;
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    x: 15 + Math.random() * 70,
    y: -10,
    speed: speed || 0.4,
    emoji: FRUIT_EMOJI[Math.floor(Math.random() * FRUIT_EMOJI.length)],
    sliced: false,
    size: size,
  };
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

  const accuracy = useMemo(() => {
    const attempts = hits + misses;
    return attempts ? Math.round((hits / attempts) * 100) : 100;
  }, [hits, misses]);

  const romDegrees = useMemo(() => {
    if (minAngleRef.current === null) return 0;
    return Math.max(0, Math.round(maxAngleRef.current - minAngleRef.current));
  }, [shoulderAngle]);

  const engine = useGameEngine({
    sessionLength: SESSION_SECONDS,
    onRepComplete: (success) => {
      telemetry.recordRep(success);
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

  const clearSpawnTimer = useCallback(() => {
    if (nextSpawnTimerRef.current) {
      clearTimeout(nextSpawnTimerRef.current);
      nextSpawnTimerRef.current = null;
    }
  }, []);

  const spawnNextBall = useCallback(() => {
    clearSpawnTimer();
    setBall(spawnBall(settings.speed || 0.4, currentDifficulty));
  }, [clearSpawnTimer, settings.speed, currentDifficulty]);

  // Track ROM with metrics engine
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    
    const repResult = metricsEngine.current.trackAngle(shoulderAngle, performance.now());
    if (repResult) {
      setRepData(prev => [...prev, repResult]);
    }
  }, [gameState, isPaused, shoulderAngle]);

  // Main game loop
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

      setTrail((current) => [...current.slice(-9), { ...position }]);

      setBall((current) => {
        if (!current || current.sliced) return current;

        const nextY = current.y + current.speed * delta;
        const distance = Math.hypot(position.x - current.x, position.y - nextY);
        const isSliced = distance < HIT_RADIUS && velocity > SLICE_VELOCITY_THRESHOLD;

        if (isSliced) {
          setHits((h) => h + 1);
          setScore((s) => s + 10 + combo * 2);
          setCombo((c) => {
            const next = c + 1;
            setBestCombo((best) => Math.max(best, next));
            return next;
          });
          completeRep(true);
          setFlash({ type: "hit", key: current.id });
          
          setTimeout(() => {
            if (gameState === GAME_STATES.ACTIVE && !isPaused) {
              spawnNextBall();
            }
          }, NEXT_BALL_DELAY_MS);
          
          return { ...current, sliced: true, y: nextY };
        }

        if (nextY > 105) {
          setMisses((m) => m + 1);
          setCombo(0);
          completeRep(false);
          setFlash({ type: "miss", key: current.id });
          
          setTimeout(() => {
            if (gameState === GAME_STATES.ACTIVE && !isPaused) {
              spawnNextBall();
            }
          }, NEXT_BALL_DELAY_MS);
          
          return null;
        }

        return { ...current, y: nextY };
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
  }, [gameState, isPaused, position, velocity, shoulderAngle, completeRep, telemetry, spawnNextBall, combo]);

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

  // Adaptive difficulty
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return undefined;
    const timer = setInterval(() => {
      adapt({ accuracy, papsScore, combo: bestCombo });
    }, 10000);
    return () => clearInterval(timer);
  }, [gameState, isPaused, adapt, accuracy, papsScore, bestCombo]);

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
      bestCombo,
      romDegrees: sessionStats.averageRom || romDegrees,
      papsScore,
      difficulty: currentDifficulty,
      gameSpecific: {
        avgSwipeSpeed: score / ((hits + misses) || 1),
        longestHitStreak: bestCombo,
        totalSwipes: hits + misses,
        repData: sessionStats.reps || repData,
      },
    });
  }, [telemetry, score, hits, misses, accuracy, bestCombo, romDegrees, papsScore, currentDifficulty, repData]);

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
              {flash.type === "hit" ? "💥 SLICED!" : "❌ MISSED"}
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
              className="absolute select-none transition-transform drop-shadow-[0_0_12px_rgba(255,255,255,.35)]"
              style={{
                left: `${ball.x}%`,
                top: `${ball.y}%`,
                transform: "translate(-50%, -50%)",
                fontSize: `${ball.size}px`,
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