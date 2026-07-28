// frontend/src/games/RehabSlicer.jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMediaPipeHands, HAND_LANDMARKS } from '../hooks/useMediaPipeUpperBody';
import { useGameEngine, GAME_STATES } from '../hooks/useGameEngine.js';
import { useAudioFeedback } from '../hooks/useAudioFeedback.js';

const CONFIG = {
  SWIPE_VELOCITY_THRESHOLD: 2,
  OBJECT_TIMEOUT: {
    easy: 8000,
    medium: 6000,
    hard: 4000,
  },
  DIFFICULTY: {
    easy: {
      speed: 2,
      objectSize: 50,
    },
    medium: {
      speed: 3.5,
      objectSize: 40,
    },
    hard: {
      speed: 5,
      objectSize: 30,
    },
  },
};

const OBJECT_TYPES = [
  { id: 'therapy_ball', label: '⚽', color: '#3B82F6', points: 10 },
  { id: 'capsule', label: '💊', color: '#10B981', points: 15 },
  { id: 'bandage', label: '🩹', color: '#F59E0B', points: 20 },
  { id: 'star', label: '⭐', color: '#8B5CF6', points: 25 },
];

const HAZARD_TYPES = [
  { id: 'warning', label: '⚠️', color: '#EF4444', points: -10 },
  { id: 'red_zone', label: '🔴', color: '#DC2626', points: -15 },
];

export default function RehabSlicer({ onSessionEnd, patientId, gameId = 'rehab-slicer' }) {
  // ===== State =====
  const [currentObject, setCurrentObject] = useState(null);
  const [objectIndex, setObjectIndex] = useState(0);
  const [slices, setSlices] = useState([]);
  const [swipeTrail, setSwipeTrail] = useState([]);
  const [isSwiping, setIsSwiping] = useState(false);
  const [calibrationData, setCalibrationData] = useState(null);
  const [difficulty, setDifficulty] = useState('easy');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackType, setFeedbackType] = useState('info');
  const [comboCount, setComboCount] = useState(0);
  const [particles, setParticles] = useState([]);
const wristHistoryRef = useRef([]);
  const [showInstructions, setShowInstructions] = useState(true);

  // ===== Refs =====
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animationRef = useRef(null);
  const objectTimeoutRef = useRef(null);

  // ===== Hooks =====
  const {
    videoRef,
    landmarks,
    gesture,
    isLoading: handsLoading,
    error: handsError,
  } = useMediaPipeHands({
    enabled: true,
    onHandsUpdate: handleHandsUpdate,
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
    if (!landmarks || landmarks.length === 0) return null;
    const wrist = landmarks[HAND_LANDMARKS.WRIST];
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return {
      x: (1 - wrist.x) * rect.width,
      y: wrist.y * rect.height,
    };
  }, [landmarks]);

  const getHandSpeed = useCallback(() => {
    const pos = getWristPosition();
    if (!pos) return 0;
    const history = wristHistoryRef.current;
    history.push({ ...pos, time: Date.now() });
    if (history.length > 10) history.shift();
    if (history.length < 2) return 0;
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    const dt = (last.time - prev.time) / 1000;
    if (dt === 0) return 0;
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    return Math.sqrt(dx * dx + dy * dy) / dt;
  }, [getWristPosition]);

  // ===== Object Management =====
  const spawnObject = useCallback(() => {
    if (state !== GAME_STATES.PLAYING) return;

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const difficultyConfig = CONFIG.DIFFICULTY[difficulty] || CONFIG.DIFFICULTY.easy;
    const isHazard = Math.random() < 0.2 && difficulty !== 'easy';
    const typePool = isHazard ? HAZARD_TYPES : OBJECT_TYPES;
    const type = typePool[Math.floor(Math.random() * typePool.length)];

    const size = difficultyConfig.objectSize;
    const x = size + Math.random() * (rect.width - size * 2);
    const y = -size;

    const newObject = {
      id: `obj-${Date.now()}-${objectIndex}`,
      x,
      y,
      size,
      type,
      speed: difficultyConfig.speed * (0.8 + Math.random() * 0.4),
      rotation: 0,
      rotationSpeed: (Math.random() - 0.5) * 0.05,
      isHazard,
      isSliced: false,
    };

    setCurrentObject(newObject);
    setObjectIndex((prev) => prev + 1);

    // Set timeout for this object
    clearTimeout(objectTimeoutRef.current);
    const timeoutDuration = CONFIG.OBJECT_TIMEOUT[difficulty] || CONFIG.OBJECT_TIMEOUT.easy;
    objectTimeoutRef.current = setTimeout(() => {
      if (!newObject.isSliced) {
        missObject(newObject);
      }
    }, timeoutDuration);
  }, [state, difficulty, objectIndex]);

  const sliceObject = useCallback((obj) => {
    if (obj.isSliced) return;

    // Mark as sliced
    obj.isSliced = true;

    // Spawn particles
    spawnParticles(obj.x, obj.y, obj.type.color, 30);

    if (obj.isHazard) {
      // Hit a hazard - lose points
      const penalty = obj.type.points || 10;
      addScore(penalty);
      setComboCount(0);
      audio.playMiss();
      setFeedbackMessage(`⚠️ ${obj.type.label} hit! -${Math.abs(penalty)}`);
      setFeedbackType('miss');
    } else {
      // Successful slice
      const points = obj.type.points || 10;
      const comboBonus = Math.floor(comboCount / 3) * 5;
      const totalPoints = points + comboBonus;
      addScore(totalPoints);
      setComboCount((prev) => prev + 1);
      audio.playSuccess();
      setFeedbackMessage(`+${totalPoints} 🎯`);
      setFeedbackType('success');

      // Record the slice
      recordAttempt(true, null, null);
    }

    // Spawn next object after delay
    clearTimeout(objectTimeoutRef.current);
    objectTimeoutRef.current = setTimeout(() => {
      if (state === GAME_STATES.PLAYING) {
        spawnObject();
      }
    }, 800);
  }, [comboCount, audio, recordAttempt, state, spawnObject, addScore]);

  const missObject = useCallback((obj) => {
    if (obj.isSliced) return;

    obj.isSliced = true;
    recordAttempt(false);
    setComboCount(0);
    audio.playMiss();
    setFeedbackMessage('Missed!');
    setFeedbackType('miss');

    // Spawn next object after delay
    clearTimeout(objectTimeoutRef.current);
    objectTimeoutRef.current = setTimeout(() => {
      if (state === GAME_STATES.PLAYING) {
        spawnObject();
      }
    }, 1500);
  }, [audio, recordAttempt, state, spawnObject]);

  const spawnParticles = useCallback((x, y, color, count = 20) => {
    const newParticles = Array.from({ length: count }, () => ({
      x,
      y,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      life: 1,
      decay: 0.01 + Math.random() * 0.02,
      radius: 2 + Math.random() * 4,
      color,
    }));
    setParticles((prev) => [...prev, ...newParticles]);
  }, []);

  // ===== Hand Update Handler =====
  function handleHandsUpdate({ gesture, landmarks }) {
    if (state !== GAME_STATES.PLAYING) return;

    const wrist = getWristPosition();
    if (!wrist) return;

    // Add to swipe trail
    setSwipeTrail((prev) => {
      const newTrail = [...prev, { x: wrist.x, y: wrist.y, time: Date.now() }];
      if (newTrail.length > 20) newTrail.shift();
      return newTrail;
    });

    // Detect swipe based on speed
    const speed = getHandSpeed();

    if (speed > CONFIG.SWIPE_VELOCITY_THRESHOLD && !isSwiping) {
      setIsSwiping(true);

      // Check if swipe intersects current object
      if (currentObject && !currentObject.isSliced) {
        const dist = Math.sqrt(Math.pow(wrist.x - currentObject.x, 2) + Math.pow(wrist.y - currentObject.y, 2));
        if (dist < currentObject.size + 30) {
          sliceObject(currentObject);
        }
      }

      // Reset swiping after a short delay
      setTimeout(() => setIsSwiping(false), 200);
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
      maxCombo: comboCount,
      slices: metrics.successes,
    });
  }

  const handleStartGame = useCallback(() => {
    if (!isCalibrated) {
      setFeedbackMessage('Calibrating...');
      setFeedbackType('info');
      // Simple calibration - collect wrist positions
      const calData = { timestamp: Date.now() };
      setCalibrationData(calData);
      completeCalibration();
      audio.playCalibrationComplete();
      setFeedbackMessage('Calibration complete!');
      setTimeout(() => setFeedbackMessage(''), 1000);
      setShowInstructions(false);
      startCountdown();
    } else {
      setShowInstructions(false);
      startCountdown();
    }
  }, [isCalibrated, completeCalibration, startCountdown, audio]);

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

    // Draw current object
    if (currentObject && !currentObject.isSliced) {
      const obj = currentObject;

      if (obj.isSliced) {
        ctx.globalAlpha = 0.3;
      }

      ctx.save();
      ctx.translate(obj.x, obj.y);
      ctx.rotate(obj.rotation);

      // Object shadow
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 20;

      // Object body
      const radius = obj.size / 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = obj.isHazard ? obj.type.color : obj.type.color + '33';
      ctx.fill();
      ctx.strokeStyle = obj.type.color;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.shadowBlur = 0;

      // Object label
      ctx.font = `${obj.size * 0.6}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(obj.type.label, 0, 0);

      ctx.restore();
      ctx.globalAlpha = 1;

      // Update object position
      obj.y += obj.speed;
      obj.rotation += obj.rotationSpeed || 0;

      // Remove if off screen
      if (obj.y > h + obj.size) {
        if (!obj.isHazard && !obj.isSliced) {
          // Missed object
          missObject(obj);
        }
      }
    }

    // Draw swipe trail
    if (swipeTrail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(swipeTrail[0].x, swipeTrail[0].y);
      for (let i = 1; i < swipeTrail.length; i++) {
        ctx.lineTo(swipeTrail[i].x, swipeTrail[i].y);
      }
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(251, 191, 36, 0.3)';
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.shadowBlur = 0;
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

    // Draw combo counter
    if (comboCount > 2) {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
      ctx.font = 'bold 24px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`🔥 x${comboCount}`, w / 2, 80);
    }

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
  }, [currentObject, swipeTrail, feedbackMessage, feedbackType, comboCount, getWristPosition]);

  // ===== Effects =====
  useEffect(() => {
    if (state === GAME_STATES.PLAYING) {
      spawnObject();
      audio.playGameStart();
    }
  }, [state, spawnObject, audio]);

  useEffect(() => {
    renderCanvas();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (objectTimeoutRef.current) {
        clearTimeout(objectTimeoutRef.current);
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
          <div className="text-6xl mb-6">🔪</div>
          <h2 className="text-3xl font-bold text-white mb-4">Rehab Slicer</h2>
          
          <div className="max-w-md mb-6">
            <p className="text-slate-400 text-center mb-6">
              Slice medical items with controlled movements to improve shoulder and wrist coordination.
            </p>
            
            <div className="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-700">
              <h3 className="text-sm font-semibold text-teal-400 mb-3">📋 Patient Instructions</h3>
              <div className="space-y-2 text-sm text-slate-300">
                <p><strong>Starting Posture:</strong> Sit or stand comfortably with good posture</p>
                <p><strong>Arm Position:</strong> Start with your hand near your waist</p>
                <p><strong>Movement:</strong> Perform one smooth slicing motion across each object</p>
                <p><strong>Return:</strong> Return your hand to the starting position</p>
                <p><strong>Timing:</strong> One object at a time – focus on controlled movements</p>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-sm font-semibold text-blue-400 mb-3">💪 Therapy Benefits</h3>
              <div className="space-y-1 text-sm text-slate-300">
                <p>• Shoulder Flexion & Wrist Extension</p>
                <p>• Coordination & Range of Motion</p>
                <p>• Controlled Movement Practice</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleStartGame}
            disabled={handsLoading}
            className="mt-8 px-8 py-4 bg-teal-600 hover:bg-teal-500 rounded-xl font-bold text-white text-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {handsLoading ? 'Loading...' : 'Start Session'}
          </button>
          {handsError && (
            <p className="mt-4 text-red-400 text-sm">{handsError}</p>
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
              <div className="text-xs text-slate-400">Slices</div>
              <div className="text-2xl font-bold text-teal-400">{metrics.successes}</div>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-4 text-center">
              <div className="text-xs text-slate-400">Accuracy</div>
              <div className="text-2xl font-bold text-blue-400">{metrics.accuracy}%</div>
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
