// frontend/src/games/PrecisionReach.jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMediaPipePose, calculateAngle, calculateDistance } from '../hooks/usePoseDetection';
import { useGameEngine, GAME_STATES } from '../hooks/useGameEngine.js';
import { useAudioFeedback } from '../hooks/useAudioFeedback.js';

// Configuration
const CONFIG = {
  TARGET_RADIUS: 40,
  HOLD_DURATION: {
    easy: 1.0,
    medium: 1.5,
    hard: 2.0,
  },
  TARGET_TIMEOUT: {
    easy: 8000,
    medium: 6000,
    hard: 4000,
  },
  MAX_REACH_DISTANCE: 300,
  MIN_REACH_DISTANCE: 100,
  DIFFICULTY: {
    easy: {
      radius: 50,
      moveSpeed: 1,
      heightRange: [0.3, 0.6],
    },
    medium: {
      radius: 40,
      moveSpeed: 1.5,
      heightRange: [0.2, 0.8],
    },
    hard: {
      radius: 30,
      moveSpeed: 2,
      heightRange: [0.1, 1.0],
    },
  },
};

const PRECISION_REACH_COLORS = {
  target: '#4F46E5',
  targetGlow: 'rgba(79, 70, 229, 0.3)',
  success: '#10B981',
  miss: '#EF4444',
  progress: '#8B5CF6',
};

export default function PrecisionReach({ onSessionEnd, patientId, gameId = 'precision-reach' }) {
  // ===== State =====
  const [currentTarget, setCurrentTarget] = useState(null);
  const [targetIndex, setTargetIndex] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [calibrationData, setCalibrationData] = useState(null);
  const [difficulty, setDifficulty] = useState('easy');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackType, setFeedbackType] = useState('info');
  const [particles, setParticles] = useState([]);
  const [reachHistory, setReachHistory] = useState([]);
  const [reachDistanceHistory, setReachDistanceHistory] = useState([]);
  const [showInstructions, setShowInstructions] = useState(true);

  // ===== Refs =====
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animationRef = useRef(null);
  const holdStartTimeRef = useRef(null);
  const targetTimeoutRef = useRef(null);
  const targetSpawnRef = useRef(null);

  // ===== Hooks =====
  const {
    videoRef,
    keypoints,
    isLoading: poseLoading,
    error: poseError,
    calibrate: calibratePose,
  } = useMediaPipePose({
    enabled: true,
    onPoseUpdate: handlePoseUpdate,
  });

  const {
    state,
    score,
    addScore,
    timeRemaining,
    progress,
    metrics,
    isCalibrated,
    countdown,
    startCountdown,
    pauseGame,
    resumeGame,
    resetGame,
    recordAttempt,
    completeCalibration,
  } = useGameEngine({
    gameId,
    duration: 60,
    onComplete: handleGameComplete,
  });

  const audio = useAudioFeedback();

  // ===== Helpers =====
  const getWristPosition = useCallback(() => {
    const wrist = keypoints?.leftWrist?.visible ? keypoints.leftWrist :
                 keypoints?.rightWrist?.visible ? keypoints.rightWrist : null;
    return wrist;
  }, [keypoints]);

  const getShoulderPosition = useCallback(() => {
    const shoulder = keypoints?.leftShoulder?.visible ? keypoints.leftShoulder :
                    keypoints?.rightShoulder?.visible ? keypoints.rightShoulder : null;
    return shoulder;
  }, [keypoints]);

  const getReachDistance = useCallback(() => {
    const wrist = getWristPosition();
    const shoulder = getShoulderPosition();
    if (!wrist || !shoulder) return 0;
    return calculateDistance(wrist, shoulder);
  }, [getWristPosition, getShoulderPosition]);

  const getShoulderAngle = useCallback(() => {
    const wrist = getWristPosition();
    const shoulder = getShoulderPosition();
    const hip = keypoints?.leftHip?.visible ? keypoints.leftHip :
               keypoints?.rightHip?.visible ? keypoints.rightHip : null;
    if (!wrist || !shoulder || !hip) return 0;
    return calculateAngle(wrist, shoulder, hip);
  }, [getWristPosition, getShoulderPosition, keypoints]);

  // ===== Target Management =====
  const generateTarget = useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    const difficultyConfig = CONFIG.DIFFICULTY[difficulty] || CONFIG.DIFFICULTY.easy;
    const radius = difficultyConfig.radius;

    // Generate target position within reachable area
    const margin = radius + 20;
    const [minHeight, maxHeight] = difficultyConfig.heightRange;
    const x = margin + Math.random() * (w - margin * 2);
    const y = h * (minHeight + Math.random() * (maxHeight - minHeight));

    return {
      id: `target-${Date.now()}-${targetIndex}`,
      x,
      y,
      radius,
      progress: 0,
      isActive: true,
      isCompleted: false,
    };
  }, [targetIndex, difficulty]);

  const spawnTarget = useCallback(() => {
    if (state !== GAME_STATES.PLAYING) return;

    const newTarget = generateTarget();
    if (newTarget) {
      setCurrentTarget(newTarget);
      setTargetIndex((prev) => prev + 1);
      setHoldProgress(0);
      setIsHolding(false);
      holdStartTimeRef.current = null;
      setFeedbackMessage('Reach the target');
      setFeedbackType('info');

      // Set timeout for this target
      clearTimeout(targetTimeoutRef.current);
      const timeoutDuration = CONFIG.TARGET_TIMEOUT[difficulty] || CONFIG.TARGET_TIMEOUT.easy;
      targetTimeoutRef.current = setTimeout(() => {
        if (state === GAME_STATES.PLAYING && currentTarget) {
          completeTarget(false);
        }
      }, timeoutDuration);
    }
  }, [state, generateTarget, difficulty]);

  const completeTarget = useCallback((success) => {
    if (!currentTarget) return;

    setCurrentTarget((prev) => ({
      ...prev,
      isActive: false,
      isCompleted: success,
    }));

    // Record attempt
    const wrist = getWristPosition();
    const shoulder = getShoulderPosition();
    const rom = wrist && shoulder ? calculateAngle(wrist, shoulder, keypoints?.leftHip || keypoints?.rightHip) : 0;
    const reactionTime = holdStartTimeRef.current ? (Date.now() - holdStartTimeRef.current) / 1000 : null;

    recordAttempt(success, rom, reactionTime);

    if (success) {
      try { addScore(10); } catch (_) {}
      audio.playSuccess();
      setFeedbackMessage('🎯 Target reached!');
      setFeedbackType('success');
      spawnParticles(currentTarget.x, currentTarget.y, '#10B981', 30);
    } else {
      audio.playMiss();
      setFeedbackMessage('⏱ Timeout');
      setFeedbackType('miss');
      spawnParticles(currentTarget.x, currentTarget.y, '#EF4444', 15);
    }

    // Spawn next target after delay
    clearTimeout(targetTimeoutRef.current);
    targetTimeoutRef.current = setTimeout(() => {
      if (state === GAME_STATES.PLAYING) {
        spawnTarget();
      }
    }, success ? 800 : 1500);
  }, [currentTarget, recordAttempt, audio, state, spawnTarget, getWristPosition, getShoulderPosition, keypoints, addScore]);

  const spawnParticles = useCallback((x, y, color, count = 20) => {
    const newParticles = Array.from({ length: count }, () => ({
      x,
      y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 1,
      decay: 0.01 + Math.random() * 0.02,
      radius: 2 + Math.random() * 4,
      color,
    }));
    setParticles((prev) => [...prev, ...newParticles]);
  }, []);

  // ===== Pose Update Handler =====
  function handlePoseUpdate(kp, lm) {
    if (state !== GAME_STATES.PLAYING && state !== GAME_STATES.COUNTDOWN) return;

    const wrist = kp?.leftWrist?.visible ? kp.leftWrist :
                  kp?.rightWrist?.visible ? kp.rightWrist : null;

    if (!wrist || !currentTarget || !currentTarget.isActive) return;

    // Calculate distance to target
    const dist = calculateDistance(wrist, currentTarget);

    // Check if wrist is inside target
    if (dist < currentTarget.radius) {
      // Start holding
      if (!isHolding) {
        setIsHolding(true);
        holdStartTimeRef.current = Date.now();
        setFeedbackMessage('Hold position...');
        setFeedbackType('info');
        audio.playTone(440, 0.05);
      }

      // Update hold progress
      const holdDuration = CONFIG.HOLD_DURATION[difficulty] || CONFIG.HOLD_DURATION.easy;
      const elapsed = (Date.now() - holdStartTimeRef.current) / 1000;
      const progressValue = Math.min(elapsed / holdDuration, 1);
      setHoldProgress(progressValue);

      // Update target visual
      setCurrentTarget((prev) => ({
        ...prev,
        progress: progressValue,
      }));

      // Check if hold is complete
      if (progressValue >= 1 && !currentTarget.isCompleted) {
        completeTarget(true);
      }
    } else {
      // Reset hold if wrist leaves target
      if (isHolding) {
        setIsHolding(false);
        holdStartTimeRef.current = null;
        setHoldProgress(0);
        setFeedbackMessage('Reach the target');
        setFeedbackType('info');
      }
    }
  }

  // ===== Game Handlers =====
  function handleGameComplete(metrics) {
    audio.playGameEnd();
    onSessionEnd?.({
      gameId,
      score: metrics.score,
      accuracy: metrics.accuracy,
      attempts: metrics.attempts,
      successes: metrics.successes,
      misses: metrics.misses,
      reactionTimes: metrics.reactionTimes,
      romValues: metrics.romValues,
      duration: metrics.duration,
      maxReach: Math.max(...reachDistanceHistory, 0),
      averageReach: reachDistanceHistory.length > 0 ? reachDistanceHistory.reduce((a, b) => a + b, 0) / reachDistanceHistory.length : 0,
    });
  }

  const handleStartGame = useCallback(async () => {
    if (!isCalibrated) {
      setFeedbackMessage('Calibrating pose...');
      setFeedbackType('info');
      const calData = await calibratePose();
      if (calData) {
        setCalibrationData(calData);
        completeCalibration();
        audio.playCalibrationComplete();
        setFeedbackMessage('Calibration complete!');
        setTimeout(() => setFeedbackMessage(''), 1000);
        setShowInstructions(false);
        startCountdown();
      } else {
        setFeedbackMessage('Calibration failed. Please try again.');
        setFeedbackType('error');
      }
    } else {
      setShowInstructions(false);
      startCountdown();
    }
  }, [isCalibrated, calibratePose, completeCalibration, startCountdown, audio]);

  // ===== Canvas Rendering =====
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    // Draw reachable area
    const wrist = getWristPosition();
    if (wrist && calibrationData) {
      const shoulder = getShoulderPosition();
      if (shoulder) {
        const maxReach = CONFIG.MAX_REACH_DISTANCE;
        const minReach = CONFIG.MIN_REACH_DISTANCE;

        // Draw reach range indicator
        ctx.beginPath();
        ctx.arc(shoulder.x, shoulder.y, maxReach, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(79, 70, 229, 0.1)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(shoulder.x, shoulder.y, minReach, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(79, 70, 229, 0.05)';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw current target
    if (currentTarget && currentTarget.isActive) {
      const { x, y, radius, progress } = currentTarget;

      // Glow
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.5);
      gradient.addColorStop(0, PRECISION_REACH_COLORS.targetGlow);
      gradient.addColorStop(1, 'rgba(79, 70, 229, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Target circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(79, 70, 229, 0.15)';
      ctx.fill();
      ctx.strokeStyle = progress > 0 ? '#10B981' : PRECISION_REACH_COLORS.target;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Progress ring
      if (progress > 0) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Progress percentage
        ctx.fillStyle = '#10B981';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(progress * 100)}%`, x, y + radius + 30);
      }

      // Target center dot
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      // Target label
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`Target ${targetIndex}`, x, y - radius - 15);
    }

    // Draw wrist position
    const wristPos = getWristPosition();
    if (wristPos) {
      // Wrist glow
      const gradient = ctx.createRadialGradient(
        wristPos.x, wristPos.y, 0,
        wristPos.x, wristPos.y, 20
      );
      gradient.addColorStop(0, 'rgba(251, 191, 36, 0.4)');
      gradient.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(wristPos.x, wristPos.y, 20, 0, Math.PI * 2);
      ctx.fill();

      // Wrist dot
      ctx.beginPath();
      ctx.arc(wristPos.x, wristPos.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#FBBF24';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Shoulder-wrist line
      const shoulder = getShoulderPosition();
      if (shoulder) {
        ctx.beginPath();
        ctx.moveTo(shoulder.x, shoulder.y);
        ctx.lineTo(wristPos.x, wristPos.y);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw particles
    setParticles((prev) => {
      const updated = prev
        .map((p) => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          life: p.life - p.decay,
          vy: p.vy + 0.1,
        }))
        .filter((p) => p.life > 0);

      // Render particles
      updated.forEach((p) => {
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      return updated;
    });

    // Draw feedback message
    if (feedbackMessage) {
      ctx.fillStyle = feedbackType === 'success' ? '#10B981' :
                      feedbackType === 'miss' ? '#EF4444' :
                      feedbackType === 'error' ? '#EF4444' : 'rgba(255,255,255,0.8)';
      ctx.font = 'bold 20px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(feedbackMessage, w / 2, h - 30);
    }

    animationRef.current = requestAnimationFrame(renderCanvas);
  }, [currentTarget, targetIndex, reachHistory, feedbackMessage, feedbackType, getWristPosition, getShoulderPosition]);

  // ===== Effects =====
  useEffect(() => {
    if (state === GAME_STATES.PLAYING) {
      // Start target spawning
      clearTimeout(targetSpawnRef.current);
      targetSpawnRef.current = setTimeout(spawnTarget, 1000);
      audio.playGameStart();
    }
  }, [state, spawnTarget, audio]);

  useEffect(() => {
    // Track reach distance for history
    if (state === GAME_STATES.PLAYING) {
      const wrist = getWristPosition();
      const shoulder = getShoulderPosition();
      if (wrist) {
        setReachHistory((prev) => {
          const newHistory = [...prev, { x: wrist.x, y: wrist.y }];
          if (newHistory.length > 100) newHistory.shift();
          return newHistory;
        });
      }
      if (wrist && shoulder) {
        setReachDistanceHistory((prev) => {
          const newHistory = [...prev, calculateDistance(wrist, shoulder)];
          if (newHistory.length > 100) newHistory.shift();
          return newHistory;
        });
      }
    }
  }, [state, getWristPosition, getShoulderPosition]);

  useEffect(() => {
    // Start render loop
    renderCanvas();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      clearTimeout(targetTimeoutRef.current);
      clearTimeout(targetSpawnRef.current);
    };
  }, [renderCanvas]);

  // ===== UI Render =====
  const isPlaying = state === GAME_STATES.PLAYING || state === GAME_STATES.COUNTDOWN;
  const isPaused = state === GAME_STATES.PAUSED;
  const isCompleted = state === GAME_STATES.COMPLETED;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-slate-950 overflow-hidden">
      {/* Video overlay */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        autoPlay
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* Canvas overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* HUD */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-10">
        <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10 min-w-[80px]">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Score</div>
          <div className="text-3xl font-bold text-amber-400">{score}</div>
        </div>
        <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 text-center border border-white/10 min-w-[80px]">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Time</div>
          <div className={`text-3xl font-bold ${timeRemaining <= 10 ? 'text-red-400' : 'text-white'}`}>
            {timeRemaining}s
          </div>
        </div>
        <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 text-center border border-white/10 min-w-[80px]">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Accuracy</div>
          <div className="text-3xl font-bold text-teal-400">{metrics.accuracy}%</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-16 left-4 right-4 z-10">
        <div className="bg-black/70 backdrop-blur-sm rounded-full h-2 overflow-hidden border border-white/10">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Countdown overlay */}
      {state === GAME_STATES.COUNTDOWN && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-slate-950/80 backdrop-blur-sm">
          <div className="text-8xl font-bold text-white animate-pulse">
            {countdown > 0 ? countdown : 'GO!'}
          </div>
        </div>
      )}

      {/* Instructions overlay */}
      {state === GAME_STATES.IDLE && showInstructions && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-950/90 backdrop-blur-sm p-8">
          <div className="text-6xl mb-6">🎯</div>
          <h2 className="text-3xl font-bold text-white mb-4">Precision Reach</h2>
          
          <div className="max-w-md mb-6">
            <p className="text-slate-400 text-center mb-6">
              Reach and hold targets to improve shoulder mobility and arm coordination.
            </p>
            
            <div className="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-700">
              <h3 className="text-sm font-semibold text-teal-400 mb-3">📋 Patient Instructions</h3>
              <div className="space-y-2 text-sm text-slate-300">
                <p><strong>Starting Posture:</strong> Sit upright with good posture</p>
                <p><strong>Arm Position:</strong> Keep your arm relaxed at your side</p>
                <p><strong>Movement:</strong> Slowly raise your arm until your hand reaches the target</p>
                <p><strong>Hold:</strong> Hold the position for {CONFIG.HOLD_DURATION[difficulty]}–{CONFIG.HOLD_DURATION[difficulty] + 0.5} seconds</p>
                <p><strong>Return:</strong> Lower your arm back to the resting position</p>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-sm font-semibold text-blue-400 mb-3">💪 Therapy Benefits</h3>
              <div className="space-y-1 text-sm text-slate-300">
                <p>• Shoulder Flexion & Abduction</p>
                <p>• Stability & Controlled Movements</p>
                <p>• Range of Motion Improvement</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleStartGame}
            disabled={poseLoading}
            className="mt-8 px-8 py-4 bg-teal-600 hover:bg-teal-500 rounded-xl font-bold text-white text-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {poseLoading ? 'Loading...' : 'Start Session'}
          </button>
          {poseError && (
            <p className="mt-4 text-red-400 text-sm">{poseError}</p>
          )}
        </div>
      )}

      {/* Pause overlay */}
      {isPaused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-950/80 backdrop-blur-sm">
          <div className="text-6xl mb-4">⏸</div>
          <h2 className="text-2xl font-bold text-white mb-2">Paused</h2>
          <button
            onClick={resumeGame}
            className="px-6 py-3 bg-teal-600 hover:bg-teal-500 rounded-xl font-bold text-white text-lg transition"
          >
            Resume
          </button>
        </div>
      )}

      {/* Complete overlay */}
      {isCompleted && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-950/90 backdrop-blur-sm p-8">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-3xl font-bold text-white mb-2">Session Complete!</h2>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-slate-800/80 rounded-xl p-4 text-center">
              <div className="text-xs text-slate-400">Score</div>
              <div className="text-2xl font-bold text-amber-400">{score}</div>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-4 text-center">
              <div className="text-xs text-slate-400">Accuracy</div>
              <div className="text-2xl font-bold text-teal-400">{metrics.accuracy}%</div>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-4 text-center">
              <div className="text-xs text-slate-400">Reaches</div>
              <div className="text-2xl font-bold text-blue-400">{metrics.successes}</div>
            </div>
          </div>
          <button
            onClick={resetGame}
            className="mt-6 px-6 py-3 bg-teal-600 hover:bg-teal-500 rounded-xl font-bold text-white text-lg transition"
          >
            Play Again
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {isPlaying && (
          <button
            onClick={pauseGame}
            className="p-2 bg-black/70 hover:bg-black/90 rounded-lg text-white transition"
          >
            ⏸
          </button>
        )}
        {isPaused && (
          <button
            onClick={resumeGame}
            className="p-2 bg-black/70 hover:bg-black/90 rounded-lg text-white transition"
          >
            ▶
          </button>
        )}
        {(isPlaying || isPaused) && (
          <button
            onClick={resetGame}
            className="p-2 bg-black/70 hover:bg-black/90 rounded-lg text-white transition"
          >
            ⟳
          </button>
        )}
      </div>

      {/* Wrist status */}
      {isPlaying && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10">
          <div className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
            getWristPosition()
              ? 'bg-teal-500/20 border-teal-500/30 text-teal-400'
              : 'bg-red-500/20 border-red-500/30 text-red-400 animate-pulse'
          }`}>
            {getWristPosition() ? '🖐 Hand Detected' : '⚠️ No Hand Detected'}
          </div>
        </div>
      )}
    </div>
  );
}
