// frontend/src/games/CatchFlex.jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMediaPipeHands, HAND_LANDMARKS } from '../hooks/useMediaPipeUpperBody';
import { useGameEngine, GAME_STATES } from '../hooks/useGameEngine.js';
import { useAudioFeedback } from '../hooks/useAudioFeedback.js';

const CONFIG = {
  BASKET_WIDTH: 100,
  BASKET_HEIGHT: 60,
  ITEM_TIMEOUT: {
    easy: 8000,
    medium: 6000,
    hard: 4000,
  },
  DIFFICULTY: {
    easy: {
      fallSpeed: 2,
      itemSize: 40,
    },
    medium: {
      fallSpeed: 3.5,
      itemSize: 35,
    },
    hard: {
      fallSpeed: 5,
      itemSize: 28,
    },
  },
};

const ITEM_TYPES = [
  { id: 'apple', label: '🍎', color: '#EF4444', points: 10 },
  { id: 'ball', label: '⚽', color: '#3B82F6', points: 12 },
  { id: 'star', label: '⭐', color: '#F59E0B', points: 15 },
  { id: 'heart', label: '❤️', color: '#EC4899', points: 20 },
  { id: 'diamond', label: '💎', color: '#8B5CF6', points: 25 },
];

export default function CatchFlex({ onSessionEnd, patientId, gameId = 'catch-flex' }) {
  // ===== State =====
  const [currentItem, setCurrentItem] = useState(null);
  const [itemIndex, setItemIndex] = useState(0);
  const [basketX, setBasketX] = useState(0);
  const [calibrationData, setCalibrationData] = useState(null);
  const [difficulty, setDifficulty] = useState('easy');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackType, setFeedbackType] = useState('info');
  const [comboCount, setComboCount] = useState(0);
  const [particles, setParticles] = useState([]);
  const [catchHistory, setCatchHistory] = useState([]);
  const [reactionTimes, setReactionTimes] = useState([]);
  const [showInstructions, setShowInstructions] = useState(true);

  // ===== Refs =====
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animationRef = useRef(null);
  const itemTimeoutRef = useRef(null);
  const itemStartTimeRef = useRef(null);

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

  const isHandClosed = useCallback(() => {
    return gesture === 'fist' || gesture === 'closed';
  }, [gesture]);

  // ===== Item Management =====
  const spawnItem = useCallback(() => {
    if (state !== GAME_STATES.PLAYING) return;

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const difficultyConfig = CONFIG.DIFFICULTY[difficulty] || CONFIG.DIFFICULTY.easy;
    const type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];

    const size = difficultyConfig.itemSize;
    const x = size + Math.random() * (rect.width - size * 2);
    const y = -size;

    const newItem = {
      id: `item-${Date.now()}-${itemIndex}`,
      x,
      y,
      size,
      type,
      speed: difficultyConfig.fallSpeed * (0.8 + Math.random() * 0.4),
      rotation: 0,
      rotationSpeed: (Math.random() - 0.5) * 0.03,
      isCaught: false,
    };

    setCurrentItem(newItem);
    setItemIndex((prev) => prev + 1);
    itemStartTimeRef.current = Date.now();

    // Set timeout for this item
    clearTimeout(itemTimeoutRef.current);
    const timeoutDuration = CONFIG.ITEM_TIMEOUT[difficulty] || CONFIG.ITEM_TIMEOUT.easy;
    itemTimeoutRef.current = setTimeout(() => {
      if (state === GAME_STATES.PLAYING && currentItem && !currentItem.isCaught) {
        missItem(newItem);
      }
    }, timeoutDuration);
  }, [state, difficulty, itemIndex]);

  const catchItem = useCallback((item) => {
    if (item.isCaught) return;

    item.isCaught = true;

    // Spawn particles
    spawnParticles(item.x, item.y, item.type.color, 30);

    // Calculate reaction time
    const reactionTime = itemStartTimeRef.current ? (Date.now() - itemStartTimeRef.current) / 1000 : null;
    if (reactionTime) {
      setReactionTimes((prev) => [...prev, reactionTime]);
    }

    // Update score
    const points = item.type.points || 10;
    const comboBonus = Math.floor(comboCount / 3) * 5;
    const totalPoints = points + comboBonus;
    addScore(totalPoints);
    setComboCount((prev) => prev + 1);
    audio.playSuccess();

    // Record attempt
    recordAttempt(true);

    setFeedbackMessage(`+${totalPoints} 🎯`);
    setFeedbackType('success');

    // Track catch history
    setCatchHistory((prev) => [...prev, { time: Date.now(), type: item.type.id }]);

    // Spawn next item after delay
    clearTimeout(itemTimeoutRef.current);
    itemTimeoutRef.current = setTimeout(() => {
      if (state === GAME_STATES.PLAYING) {
        spawnItem();
      }
    }, 800);
  }, [comboCount, audio, recordAttempt, state, spawnItem, addScore]);

  const missItem = useCallback((item) => {
    if (item.isCaught) return;

    item.isCaught = true;
    recordAttempt(false);
    setComboCount(0);
    audio.playMiss();
    setFeedbackMessage('Missed!');
    setFeedbackType('miss');

    // Spawn next item after delay
    clearTimeout(itemTimeoutRef.current);
    itemTimeoutRef.current = setTimeout(() => {
      if (state === GAME_STATES.PLAYING) {
        spawnItem();
      }
    }, 1500);
  }, [audio, recordAttempt, state, spawnItem]);

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

  // ===== Hand Update Handler =====
  function handleHandsUpdate({ gesture, landmarks }) {
    if (state !== GAME_STATES.PLAYING) return;

    const wrist = getWristPosition();
    if (!wrist) return;

    // Update basket position
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const newX = Math.max(0, Math.min(rect.width - CONFIG.BASKET_WIDTH, wrist.x - CONFIG.BASKET_WIDTH / 2));
      setBasketX(newX);
    }

    // Check if current item is in the basket
    if (currentItem && !currentItem.isCaught) {
      const basketCenterX = wrist.x;
      const basketTop = wrist.y - 20;
      const basketBottom = wrist.y + 20;

      if (currentItem.y + currentItem.size > basketTop && currentItem.y < basketBottom) {
        if (Math.abs(currentItem.x - basketCenterX) < CONFIG.BASKET_WIDTH / 2) {
          // Check if hand is closed to catch
          if (isHandClosed()) {
            catchItem(currentItem);
          }
        }
      }
    }
  }

  // ===== Game Handlers =====
  function handleGameComplete(metrics) {
    audio.playGameEnd();
    const avgReactionTime = reactionTimes.length > 0
      ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length
      : 0;

    onSessionEnd?.({
      gameId,
      score: metrics.score,
      accuracy: metrics.accuracy,
      attempts: metrics.attempts,
      successes: metrics.successes,
      misses: metrics.misses,
      duration: metrics.duration,
      maxCombo: comboCount,
      avgReactionTime,
      catches: metrics.successes,
    });
  }

  const handleStartGame = useCallback(() => {
    if (!isCalibrated) {
      setFeedbackMessage('Calibrating...');
      setFeedbackType('info');
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

    // Draw current item
    if (currentItem && !currentItem.isCaught) {
      const item = currentItem;

      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rotation);

      // Glow
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, item.size * 1.2);
      gradient.addColorStop(0, item.type.color + '40');
      gradient.addColorStop(1, item.type.color + '00');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, item.size * 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Item body
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(0, 0, item.size / 2, 0, Math.PI * 2);
      ctx.fillStyle = item.type.color + '33';
      ctx.fill();
      ctx.strokeStyle = item.type.color;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Item label
      ctx.font = `${item.size * 0.6}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(item.type.label, 0, 0);

      ctx.restore();

      // Update item position
      item.y += item.speed;
      item.rotation += item.rotationSpeed || 0;

      // Check if off screen
      if (item.y > h + item.size) {
        if (!item.isCaught) {
          missItem(item);
        }
      }
    }

    // Draw basket
    const basketY = h - 80;
    const basketXPos = basketX;

    // Basket shadow
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 20;

    // Basket body
    ctx.beginPath();
    ctx.moveTo(basketXPos, basketY);
    ctx.quadraticCurveTo(basketXPos - 20, basketY + CONFIG.BASKET_HEIGHT, basketXPos, basketY + CONFIG.BASKET_HEIGHT);
    ctx.quadraticCurveTo(basketXPos + CONFIG.BASKET_WIDTH / 2, basketY + CONFIG.BASKET_HEIGHT + 10, basketXPos + CONFIG.BASKET_WIDTH, basketY + CONFIG.BASKET_HEIGHT);
    ctx.quadraticCurveTo(basketXPos + CONFIG.BASKET_WIDTH + 20, basketY + CONFIG.BASKET_HEIGHT, basketXPos + CONFIG.BASKET_WIDTH, basketY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(45, 212, 191, 0.2)';
    ctx.fill();
    ctx.strokeStyle = '#2DD4BF';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Basket inner glow
    const innerGradient = ctx.createLinearGradient(basketXPos, basketY, basketXPos, basketY + CONFIG.BASKET_HEIGHT);
    innerGradient.addColorStop(0, 'rgba(45, 212, 191, 0.1)');
    innerGradient.addColorStop(1, 'rgba(45, 212, 191, 0.3)');
    ctx.fillStyle = innerGradient;
    ctx.beginPath();
    ctx.moveTo(basketXPos + 10, basketY + 5);
    ctx.quadraticCurveTo(basketXPos + CONFIG.BASKET_WIDTH / 2, basketY + CONFIG.BASKET_HEIGHT, basketXPos + CONFIG.BASKET_WIDTH - 10, basketY + 5);
    ctx.fill();

    // Basket label
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('🖐', basketXPos + CONFIG.BASKET_WIDTH / 2, basketY - 10);

    // Draw wrist position
    const wrist = getWristPosition();
    if (wrist) {
      // Wrist glow
      const gradient = ctx.createRadialGradient(
        wrist.x, wrist.y, 0,
        wrist.x, wrist.y, 25
      );
      gradient.addColorStop(0, 'rgba(251, 191, 36, 0.4)');
      gradient.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(wrist.x, wrist.y, 25, 0, Math.PI * 2);
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
  }, [currentItem, basketX, feedbackMessage, feedbackType, comboCount, getWristPosition]);

  // ===== Effects =====
  useEffect(() => {
    if (state === GAME_STATES.PLAYING) {
      spawnItem();
      audio.playGameStart();
    }
  }, [state, spawnItem, audio]);

  useEffect(() => {
    renderCanvas();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (itemTimeoutRef.current) {
        clearTimeout(itemTimeoutRef.current);
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
          <div className="text-6xl mb-6">🧺</div>
          <h2 className="text-3xl font-bold text-white mb-4">Catch & Flex</h2>
          
          <div className="max-w-md mb-6">
            <p className="text-slate-400 text-center mb-6">
              Catch falling objects to improve reaction time and hand coordination.
            </p>
            
            <div className="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-700">
              <h3 className="text-sm font-semibold text-teal-400 mb-3">📋 Patient Instructions</h3>
              <div className="space-y-2 text-sm text-slate-300">
                <p><strong>Starting Posture:</strong> Sit or stand comfortably with good posture</p>
                <p><strong>Arm Position:</strong> Hold your hand at the center of the screen</p>
                <p><strong>Movement:</strong> Move your hand to position the basket under falling objects</p>
                <p><strong>Catch:</strong> Close your hand (make a fist) to catch each object</p>
                <p><strong>Timing:</strong> One object at a time – focus on each catch</p>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-sm font-semibold text-blue-400 mb-3">💪 Therapy Benefits</h3>
              <div className="space-y-1 text-sm text-slate-300">
                <p>• Elbow Flexion & Shoulder Abduction</p>
                <p>• Coordination & Motor Planning</p>
                <p>• Reaction Time Improvement</p>
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
              <div className="text-xs text-slate-400">Catches</div>
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
