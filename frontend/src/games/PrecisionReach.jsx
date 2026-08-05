// frontend/src/games/PrecisionReach.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, X, Rocket } from "lucide-react";

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
const BASE_ANGLE = 10;
const LAUNCH_ANGLE = 145;
const ATTEMPT_START_ANGLE = 60;
const ATTEMPT_FAIL_ANGLE = 30;
const CHECKPOINTS = [30, 60, 90, 120];

export default function PrecisionReach({
  onSessionEnd,
  patientId,
  gameId = "precision-reach",
}) {
  const videoRef = useRef(null);
  const launchTimerRef = useRef(null);
  const resetTimerRef = useRef(null);
  const hasEndedRef = useRef(false);
  const metricsEngine = useRef(new MetricsEngine());

  const [poseData, setPoseData] = useState(null);
  const [launches, setLaunches] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [maxAngle, setMaxAngle] = useState(0);
  const [minAngle, setMinAngle] = useState(null);
  const [isLaunched, setIsLaunched] = useState(false);
  const [attemptInProgress, setAttemptInProgress] = useState(false);
  const [stars, setStars] = useState(0);
  const [showLaunchEffect, setShowLaunchEffect] = useState(false);
  const [score, setScore] = useState(0);
  const [repData, setRepData] = useState([]);
  const [checkpointsReached, setCheckpointsReached] = useState([]);

  const attemptStateRef = useRef("idle");

  const { isActive } = useMediaPipeUpperBody({
    videoRef,
    onPoseUpdate: setPoseData,
  });

  const { shoulderAngle, activeSide } = usePoseDetection(poseData);
  const guidance = usePostureGuidance(poseData);
  const { papsScore, isPainDetected, resetPainState } = useFacialPainDetection({ videoRef });
  const { currentDifficulty, adapt } = useAdaptiveDifficulty();
  const telemetry = useSessionTelemetry(patientId, gameId);
  const audio = useAudioFeedback(true);

  const attempts = launches + failedAttempts;
  const accuracy = attempts ? Math.round((launches / attempts) * 100) : 100;
  const romDegrees = minAngle === null ? 0 : Math.max(0, Math.round(maxAngle - minAngle));

  const rocketProgress = useMemo(
    () => Math.min(100, Math.max(0, ((shoulderAngle - BASE_ANGLE) / (LAUNCH_ANGLE - BASE_ANGLE)) * 100)),
    [shoulderAngle]
  );

  const engine = useGameEngine({
    sessionLength: SESSION_SECONDS,
    onRepComplete: (success) => {
      telemetry.recordRep(success);
      if (success) {
        audio.playSuccess();
        setStars((s) => Math.min(5, s + 1));
        setShowLaunchEffect(true);
        setTimeout(() => setShowLaunchEffect(false), 800);
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

  // Track ROM with metrics engine
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    
    const repResult = metricsEngine.current.trackAngle(shoulderAngle, performance.now());
    if (repResult) {
      setRepData(prev => [...prev, repResult]);
    }
  }, [gameState, isPaused, shoulderAngle]);

  // Checkpoint detection
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    
    CHECKPOINTS.forEach(cp => {
      if (shoulderAngle >= cp && !checkpointsReached.includes(cp)) {
        setCheckpointsReached(prev => [...prev, cp]);
        setScore(s => s + 10);
        // Play a subtle sound for checkpoint
      }
    });
  }, [gameState, isPaused, shoulderAngle, checkpointsReached]);

  // Game logic
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;

    telemetry.trackAngle(shoulderAngle);
    telemetry.trackMovement({
      x: poseData?.raw?.leftWrist?.x || 0,
      y: poseData?.raw?.leftWrist?.y || 0,
    });

    setMaxAngle((v) => Math.max(v, shoulderAngle));
    setMinAngle((v) => {
      if (v === null && shoulderAngle > 0) return shoulderAngle;
      if (shoulderAngle > 0 && shoulderAngle < v) return shoulderAngle;
      return v;
    });

    // Attempt state machine
    if (attemptStateRef.current === "idle" && shoulderAngle >= ATTEMPT_START_ANGLE) {
      attemptStateRef.current = "attempting";
      setAttemptInProgress(true);
    }

    if (attemptStateRef.current === "attempting" && shoulderAngle < ATTEMPT_FAIL_ANGLE && !isLaunched) {
      attemptStateRef.current = "idle";
      setAttemptInProgress(false);
      setFailedAttempts((v) => v + 1);
      completeRep(false);
    }

    // Launch detection with hold timer
    if (shoulderAngle > LAUNCH_ANGLE && !isLaunched) {
      if (!launchTimerRef.current) {
        launchTimerRef.current = setTimeout(() => {
          setIsLaunched(true);
          setLaunches((v) => v + 1);
          setScore((s) => s + 25);
          attemptStateRef.current = "idle";
          setAttemptInProgress(false);
          completeRep(true);

          resetTimerRef.current = setTimeout(() => {
            setIsLaunched(false);
            launchTimerRef.current = null;
          }, 1200);
        }, 400);
      }
    }

    if (shoulderAngle <= LAUNCH_ANGLE && launchTimerRef.current) {
      clearTimeout(launchTimerRef.current);
      launchTimerRef.current = null;
    }
  }, [gameState, isPaused, shoulderAngle, isLaunched, completeRep, poseData, telemetry]);

  // Adaptive difficulty
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;
    const timer = setInterval(() => {
      adapt({ accuracy, papsScore, combo: launches });
    }, 10000);
    return () => clearInterval(timer);
  }, [gameState, isPaused, adapt, accuracy, papsScore, launches]);

  // Pain detection
  useEffect(() => {
    if (!isPainDetected || gameState !== GAME_STATES.ACTIVE) return;
    pauseSession();
    telemetry.trackPain(papsScore);
  }, [isPainDetected, gameState, pauseSession, telemetry, papsScore]);

  useEffect(() => () => {
    if (launchTimerRef.current) clearTimeout(launchTimerRef.current);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  const finalizeTelemetry = useCallback(() => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
    const sessionStats = metricsEngine.current.getSessionStats();
    telemetry.endSession({
      gameName: "Precision Reach",
      score: score,
      launches,
      failedAttempts,
      accuracy,
      romDegrees: sessionStats.averageRom || romDegrees,
      maxAngle: Math.round(maxAngle),
      papsScore,
      difficulty: currentDifficulty,
      stars,
      gameSpecific: {
        targetAngleDegrees: LAUNCH_ANGLE,
        avgTimeToReachTarget: sessionStats.totalDuration / (launches || 1),
        checkpointsReached: checkpointsReached.length,
        repData: sessionStats.reps || repData,
      },
    });
  }, [telemetry, score, launches, failedAttempts, accuracy, romDegrees, maxAngle, papsScore, currentDifficulty, stars, checkpointsReached, repData]);

  // ========== RENDER ==========

  if (gameState === GAME_STATES.INSTRUCTIONS) {
    return (
      <div className="min-h-screen bg-[#0B1120] p-8 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-2 text-3xl font-black">🚀 Precision Reach</h1>
          <p className="mb-6 text-slate-400">
            Raise your arm to launch a rocket into space! The rocket climbs with your
            shoulder movement. Hold at the top to launch!
          </p>

          <div className="relative overflow-hidden rounded-2xl border-4 border-slate-800 bg-slate-900 aspect-video">
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
              {Math.round(shoulderAngle)}° | PAPS: {papsScore}
            </div>
          </div>

          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
              style={{ width: `${rocketProgress}%` }}
            />
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
      durationSeconds: SESSION_SECONDS - timeLeft,
      score: score,
      accuracyPercent: accuracy,
      romData: {
        averageRomDegrees: romDegrees || 0,
        maxRomDegrees: maxAngle || 0,
        perRep: repData.map((r, i) => ({ 
          rep: i + 1, 
          romDegrees: r.romDegrees || 0, 
          success: r.success !== false 
        })),
      },
      reps: launches + failedAttempts,
      hitsOrCatchesOrCompletions: launches,
      missesOrDrops: failedAttempts,
      gameSpecificMetrics: {
        targetAngleDegrees: LAUNCH_ANGLE,
        avgTimeToReachTarget: repData.length ? repData.reduce((sum, r) => sum + (r.durationSeconds || 0), 0) / repData.length : 0,
        checkpointsReached: checkpointsReached.length,
        stars: stars,
      },
    };

    return (
      <SessionSummary
        sessionData={sessionData}
        gameName="Precision Reach"
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
    <div className="relative min-h-screen bg-[#0B1120] p-8 pt-24 text-white overflow-hidden">
      {/* Stars background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 150 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: Math.random() * 2 + 1 + "px",
              height: Math.random() * 2 + 1 + "px",
              left: Math.random() * 100 + "%",
              top: Math.random() * 100 + "%",
              opacity: Math.random() * 0.8 + 0.2,
              animation: `twinkle ${Math.random() * 3 + 2}s infinite alternate`,
              animationDelay: `${Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {gameState === GAME_STATES.COUNTDOWN && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <span className="text-8xl font-black text-cyan-400">{countdown || "GO"}</span>
        </div>
      )}

      {isPainDetected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="max-w-md rounded-2xl border border-red-800 bg-slate-900 p-8 text-center">
            <h2 className="mb-3 text-xl font-bold text-red-400">Discomfort Detected</h2>
            <p className="mb-6 text-slate-300">Take a rest before continuing.</p>
            <button
              onClick={() => {
                resetPainState();
                resumeSession();
              }}
              className="rounded-lg bg-cyan-500 px-6 py-2 font-bold hover:bg-cyan-400"
            >
              I'm OK, Resume
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="fixed left-0 right-0 top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-8 py-4 backdrop-blur">
        <div className="flex gap-5 font-mono text-sm overflow-x-auto">
          <span>⏱ {timeLeft}s</span>
          <span>📐 {Math.round(shoulderAngle)}°</span>
          <span>🚀 Launches: {launches}</span>
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
          <button onClick={endSession} className="rounded-lg bg-red-950 p-2 text-red-300 hover:bg-red-900">
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

        {/* Space Launch View */}
        <div className="relative flex w-[62%] items-end justify-center overflow-hidden rounded-2xl border-4 border-slate-800 bg-gradient-to-b from-[#0a0a2e] via-[#1a1a4e] to-[#2a1a3e]">
          {/* Launch pad */}
          <div className="absolute bottom-6 left-1/2 h-2 w-32 -translate-x-1/2 rounded-full bg-slate-600 shadow-lg" />
          <div className="absolute bottom-8 left-1/2 h-4 w-20 -translate-x-1/2 rounded-full bg-slate-700/50" />

          {/* Target line */}
          <div className="absolute left-6 right-6 top-8 border-t border-dashed border-cyan-500/40">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs text-cyan-500/60 font-mono">LAUNCH</span>
          </div>

          {/* Altitude bar */}
          <div className="absolute bottom-6 right-6 top-6 w-4 overflow-hidden rounded-full bg-slate-800/80">
            <div
              className={`absolute bottom-0 w-full transition-all duration-150 ${
                attemptInProgress ? "bg-gradient-to-t from-orange-500 to-yellow-300" : "bg-gradient-to-t from-cyan-500 to-blue-400"
              }`}
              style={{ height: `${rocketProgress}%` }}
            />
          </div>

          {/* Checkpoint markers */}
          <div className="absolute left-4 top-12 flex flex-col gap-1">
            {CHECKPOINTS.map((cp, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className={`text-[8px] font-mono ${
                  checkpointsReached.includes(cp) ? 'text-yellow-400' : 'text-slate-600'
                }`}>
                  {cp}°
                </span>
                <div className={`w-2 h-2 rounded-full ${
                  checkpointsReached.includes(cp) ? 'bg-yellow-400' : 'bg-slate-600'
                }`} />
              </div>
            ))}
          </div>

          {/* Rocket */}
          <div
            className="transition-all duration-150 relative"
            style={{ marginBottom: `${rocketProgress * 0.8}%` }}
          >
            {isLaunched ? (
              <div className="relative">
                <span className="text-8xl animate-pulse">🚀</span>
                {showLaunchEffect && (
                  <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-4xl">
                    💫✨
                  </div>
                )}
              </div>
            ) : (
              <div className="relative">
                <Rocket
                  size={80}
                  className={attemptInProgress ? "text-amber-400 animate-bounce" : "text-slate-500"}
                />
                {attemptInProgress && (
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-amber-400/60 font-mono whitespace-nowrap">
                    LIFTING OFF...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status info */}
          <div className="absolute left-4 top-4 rounded-lg bg-black/60 px-3 py-2 font-mono text-xs">
            <div className="text-cyan-400">{Math.round(rocketProgress)}% to launch</div>
            <div className="text-slate-400">Missed: {failedAttempts}</div>
          </div>

          {/* Stars rating */}
          <div className="absolute left-4 bottom-16 flex gap-1 text-xl">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={i < stars ? "text-yellow-400" : "text-slate-600"}>
                ★
              </span>
            ))}
          </div>

          {/* Angle indicator */}
          <div className="absolute right-4 bottom-16 text-right">
            <div className="text-xs text-slate-400">Shoulder Angle</div>
            <div className="text-2xl font-bold text-cyan-400">{Math.round(shoulderAngle)}°</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes twinkle {
          0% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.2); }
          100% { opacity: 0.2; transform: scale(1); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce {
          animation: bounce 0.8s infinite;
        }
      `}</style>
    </div>
  );
}