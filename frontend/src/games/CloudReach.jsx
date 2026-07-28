// frontend/src/games/CloudReach.jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMediaPipePose, calculateAngle, calculateDistance } from '../hooks/usePoseDetection';
import { useGameEngine, GAME_STATES } from '../hooks/useGameEngine.js';
import { useAudioFeedback } from '../hooks/useAudioFeedback.js';

const CONFIG = {
  CLOUD_RADIUS: 45,
  CLOUD_TIMEOUT: {
    easy: 8000,
    medium: 6000,
    hard: 4000,
  },
  DIFFICULTY: {
    easy: {
      speed: 1,
      heightMultiplier: 0.6,
    },
    medium: {
      speed: 1.5,
      heightMultiplier: 0.8,
    },
    hard: {
      speed: 2.5,
      heightMultiplier: 1.0,
    },
  },
};

const CLOUD_TYPES = [
  { id: 'green', label: '🟢', color: '#10B981', points: 10, height: 0.6 },
  { id: 'blue', label: '🔵', color: '#3B82F6', points: 15, height: 0.8 },
  { id: 'gold', label: '🌟', color: '#F59E0B', points: 25, height: 1.0 },
];

export default function CloudReach({ onSessionEnd, patientId, gameId = 'cloud-reach' }) {
  // ===== State =====
  const [currentCloud, setCurrentCloud] = useState(null);
  const [cloudIndex, setCloudIndex] = useState(0);
  const [maxReachHeight, setMaxReachHeight] = useState(0);
  const [calibrationData, setCalibrationData] = useState(null);
  const [difficulty, setDifficulty] = useState('easy');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackType, setFeedbackType] = useState('info');
  const [particles, setParticles] = useState([]);
  const [reachHistory, setReachHistory] = useState([]);
  const [shoulderAngleHistory, setShoulderAngleHistory] = useState([]);
  const [showInstructions, setShowInstructions] = useState(true);

  // ===== Refs =====
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animationRef = useRef(null);
  const cloudTimeoutRef = useRef(null);
  const cloudSpawnRef = useRef(null);

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

  const getReachHeight = useCallback(() => {
    const wrist = getWristPosition();
    const shoulder = getShoulderPosition();
    if (!wrist || !shoulder) return 0;
    return Math.max(0, shoulder.y - wrist.y);
  }, [getWristPosition, getShoulderPosition]);

  const getShoulderAngle = useCallback(() => {
    const wrist = getWristPosition();
    const shoulder = getShoulderPosition();
    const hip = keypoints?.leftHip?.visible ? keypoints.leftHip :
                keypoints?.rightHip?.visible ? keypoints.rightHip : null;
    if (!wrist || !shoulder || !hip) return 0;
    return calculateAngle(wrist, shoulder, hip);
  }, [getWristPosition, getShoulderPosition, keypoints]);

  // ===== Cloud Management =====
  const spawnCloud = useCallback(() => {
    if (state !== GAME_STATES.PLAYING) return;

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const difficultyConfig = CONFIG.DIFFICULTY[difficulty] || CONFIG.DIFFICULTY.easy;

    // Choose cloud type based on difficulty
    const maxType = difficulty === 'hard' ? 2 : difficulty === 'medium' ? 1 : 0;
    const typeIndex = Math.floor(Math.random() * (maxType + 1));
    const type = CLOUD_TYPES[typeIndex];

    const height = type.height * difficultyConfig.heightMultiplier;
    const y = rect.height * (0.1 + height * 0.7);
    const x = CONFIG.CLOUD_RADIUS + Math.random() * (rect.width - CONFIG.CLOUD_RADIUS * 2);

    const cloud = {
      id: `cloud-${Date.now()}-${cloudIndex}`,
      x,
      y,
      radius: CONFIG.CLOUD_RADIUS,
      type,
      speed: difficultyConfig.speed * (0.8 + Math.random() * 0.4),
      isPopped: false,
      opacity: 1,
      floatOffset: Math.random() * Math.PI * 2,
      floatSpeed: 0.5 + Math.random() * 0.5,
    };

    setCurrentCloud(cloud);
    setCloudIndex((prev) => prev + 1);

    // Set timeout for this cloud
    clearTimeout(cloudTimeoutRef.current);
    const timeoutDuration = CONFIG.CLOUD_TIMEOUT[difficulty] || CONFIG.CLOUD_TIMEOUT.easy;
    cloudTimeoutRef.current = setTimeout(() => {
      if (state === GAME_STATES.PLAYING && currentCloud && !currentCloud.isPopped) {
        popCloud(cloud, false);
      }
    }, timeoutDuration);
  }, [state, difficulty, cloudIndex]);

  const popCloud = useCallback((cloud, success = true) => {
    if (cloud.isPopped) return;

    cloud.isPopped = true;

    // Spawn particles
    spawnParticles(cloud.x, cloud.y, cloud.type.color, 30);

    if (success) {
      // Update score
      const points = cloud.type.points || 10;
      addScore(points);
      audio.playSuccess();

      // Track reach height
      const reachHeight = getReachHeight();
      if (reachHeight > maxReachHeight) {
        setMaxReachHeight(reachHeight);
      }

      // Record attempt
      const shoulderAngle = getShoulderAngle();
      recordAttempt(true, shoulderAngle, null);

      setFeedbackMessage(`+${points} 🌟`);
      setFeedbackType('success');
    } else {
      audio.playMiss();
      setFeedbackMessage('⏱ Timeout');
      setFeedbackType('miss');
      recordAttempt(false);
    }

    // Spawn next cloud after delay
    clearTimeout(cloudTimeoutRef.current);
    cloudTimeoutRef.current = setTimeout(() => {
      if (state === GAME_STATES.PLAYING) {
        spawnCloud();
      }
    }, success ? 800 : 1500);
  }, [audio, getReachHeight, getShoulderAngle, recordAttempt, state, spawnCloud, addScore]);

  const spawnParticles = useCallback((x, y, color, count = 20) => {
    const newParticles = Array.from({ length: count }, () => ({
      x,
      y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8 - 2,
      life: 1,
      decay: 0.01 + Math.random() * 0.02,
      radius: 2 + Math.random() * 4,
      color,
    }));
    setParticles((prev) => [...prev, ...newParticles]);
  }, []);

  // ===== Pose Update Handler =====
  function handlePoseUpdate(kp, lm) {
    if (state !== GAME_STATES.PLAYING) return;

    const wrist = getWristPosition();
    if (!wrist || !currentCloud || currentCloud.isPopped) return;

    // Track reach height
    const height = getReachHeight();
    setReachHistory((prev) => {
      const newHistory = [...prev, height];
      if (newHistory.length > 60) newHistory.shift();
      return newHistory;
    });

    // Track shoulder angle
    const angle = getShoulderAngle();
    setShoulderAngleHistory((prev) => {
      const newHistory = [...prev, angle];
      if (newHistory.length > 60) newHistory.shift();
      return newHistory;
    });

    // Check if wrist is inside cloud
    const dist = calculateDistance(wrist, currentCloud);
    if (dist < currentCloud.radius + 15) {
      popCloud(currentCloud, true);
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
      duration: metrics.duration,
      maxReach: maxReachHeight,
      averageReach: reachHistory.length > 0 ? reachHistory.reduce((a, b) => a + b, 0) / reachHistory.length : 0,
      maxShoulderAngle: shoulderAngleHistory.length > 0 ? Math.max(...shoulderAngleHistory) : 0,
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

    // Draw sky gradient
    const skyGradient = ctx.createLinearGradient(0, 0, 0, h);
    skyGradient.addColorStop(0, 'rgba(30, 58, 138, 0.3)');
    skyGradient.addColorStop(1, 'rgba(15, 23, 42, 0.1)');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, w, h);

    // Draw reach height indicator
    const reachHeight = getReachHeight();
    const maxHeight = h * 0.8;
    const reachPct = Math.min(reachHeight / maxHeight, 1);

    // Draw max reach line
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h - maxHeight);
    ctx.lineTo(w, h - maxHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw current reach bar
    const barX = w - 30;
    const barW = 10;
    const barH = h * 0.6;
    const barY = (h - barH) / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.roundRect(barX - 4, barY - 4, barW + 8, barH + 8, 6);
    ctx.fill();

    const fillH = reachPct * barH;
    const grad = ctx.createLinearGradient(0, barY + barH, 0, barY);
    grad.addColorStop(0, '#10B981');
    grad.addColorStop(0.5, '#F59E0B');
    grad.addColorStop(1, '#EF4444');
    ctx.fillStyle = grad;
    ctx.roundRect(barX, barY + barH - fillH, barW, fillH, 4);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.round(reachPct * 100)}%`, barX + barW / 2, barY - 8);

    // Draw current cloud
    if (currentCloud && !currentCloud.isPopped) {
      const time = Date.now() / 1000;
      const floatY = Math.sin(time * currentCloud.floatSpeed + currentCloud.floatOffset) * 8;
      const x = currentCloud.x;
      const y = currentCloud.y + floatY;

      ctx.globalAlpha = currentCloud.opacity;

      // Glow
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, currentCloud.radius * 1.5);
      gradient.addColorStop(0, currentCloud.type.color + '40');
      gradient.addColorStop(1, currentCloud.type.color + '00');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, currentCloud.radius * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Cloud body
      ctx.shadowColor = currentCloud.type.color;
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(x, y, currentCloud.radius, 0, Math.PI * 2);
      ctx.fillStyle = currentCloud.type.color + '33';
      ctx.fill();
      ctx.strokeStyle = currentCloud.type.color;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Cloud label
      ctx.font = `${currentCloud.radius * 0.7}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(currentCloud.type.label, x, y);

      ctx.globalAlpha = 1;
    }

    // Draw wrist position
    const wrist = getWristPosition();
    if (wrist) {
      // Wrist glow
      const gradient = ctx.createRadialGradient(
        wrist.x, wrist.y, 0,
        wrist.x, wrist.y, 30
      );
      gradient.addColorStop(0, 'rgba(251, 191, 36, 0.4)');
      gradient.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(wrist.x, wrist.y, 30, 0, Math.PI * 2);
      ctx.fill();

      // Wrist dot
      ctx.beginPath();
      ctx.arc(wrist.x, wrist.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#FBBF24';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Shoulder-wrist line
      const shoulder = getShoulderPosition();
      if (shoulder) {
        ctx.beginPath();
        ctx.moveTo(shoulder.x, shoulder.y);
        ctx.lineTo(wrist.x, wrist.y);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.2)';
        ctx.lineWidth = 2;
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
          vy: p.vy + 0.05,
        }))
        .filter((p) => p.life > 0);

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
                      feedbackType === 'miss' ? '#EF4444' : 'rgba(255,255,255,0.8)';
      ctx.font = 'bold 24px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(feedbackMessage, w / 2, h - 30);
    }

    animationRef.current = requestAnimationFrame(renderCanvas);
  }, [currentCloud, feedbackMessage, feedbackType, getWristPosition, getShoulderPosition, getReachHeight]);

  // ===== Effects =====
  useEffect(() => {
    if (state === GAME_STATES.PLAYING) {
      spawnCloud();
      audio.playGameStart();
    }
  }, [state, spawnCloud, audio]);

  useEffect(() => {
    renderCanvas();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (cloudTimeoutRef.current) {
        clearTimeout(cloudTimeoutRef.current);
      }
      if (cloudSpawnRef.current) {
        clearTimeout(cloudSpawnRef.current);
      }
    };
  }, [renderCanvas]);

  // ===== UI Render =====
  const isPlaying = state === GAME_STATES.PLAYING || state === GAME_STATES.COUNTDOWN;
  const isPaused = state === GAME_STATES.PAUSED;
  const isCompleted = state === GAME_STATES.COMPLETED;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-slate-950 overflow-hidden">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        autoPlay
        style={{ transform: 'scaleX(-1)' }}
      />

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
          <div className="text-6xl mb-6">☁️</div>
          <h2 className="text-3xl font-bold text-white mb-4">Cloud Reach</h2>
          
          <div className="max-w-md mb-6">
            <p className="text-slate-400 text-center mb-6">
              Reach up and pop clouds to improve shoulder elevation and overhead mobility.
            </p>
            
            <div className="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-700">
              <h3 className="text-sm font-semibold text-teal-400 mb-3">📋 Patient Instructions</h3>
              <div className="space-y-2 text-sm text-slate-300">
                <p><strong>Starting Posture:</strong> Start with both hands resting at your sides</p>
                <p><strong>Arm Position:</strong> Keep your arm relaxed and ready to move</p>
                <p><strong>Movement:</strong> Reach toward the cloud and touch it to pop it</p>
                <p><strong>Return:</strong> Lower your arm back down after popping</p>
                <p><strong>Timing:</strong> One cloud at a time – focus on one movement at a time</p>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-sm font-semibold text-blue-400 mb-3">💪 Therapy Benefits</h3>
              <div className="space-y-1 text-sm text-slate-300">
                <p>• Shoulder Flexion & Abduction</p>
                <p>• Arm Elevation & Reach</p>
                <p>• Reaction Time Improvement</p>
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
              <div className="text-xs text-slate-400">Clouds</div>
              <div className="text-2xl font-bold text-teal-400">{metrics.successes}</div>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-4 text-center">
              <div className="text-xs text-slate-400">Max Reach</div>
              <div className="text-2xl font-bold text-blue-400">{Math.round(maxReachHeight)}px</div>
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

      {/* Hand status */}
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
