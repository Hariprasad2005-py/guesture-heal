// frontend/src/games/CanvasAir.jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMediaPipeHands, HAND_LANDMARKS } from '../hooks/useMediaPipeUpperBody';
import { useGameEngine, GAME_STATES } from '../hooks/useGameEngine.js';
import { useAudioFeedback } from '../hooks/useAudioFeedback.js';

const CONFIG = {
  SHAPE_DURATION: 15, // seconds per shape
  SHAPE_TIMEOUT: {
    easy: 10000,
    medium: 8000,
    hard: 6000,
  },
  DIFFICULTY: {
    easy: {
      shapeTier: 0, // lines
      accuracyThreshold: 0.5,
    },
    medium: {
      shapeTier: 1, // shapes
      accuracyThreshold: 0.6,
    },
    hard: {
      shapeTier: 2, // complex
      accuracyThreshold: 0.7,
    },
  },
};

const SHAPES = [
  // Tier 0: Lines (Easy)
  [
    { id: 'horizontal', name: 'Horizontal Line', points: [{ x: 0.15, y: 0.5 }, { x: 0.85, y: 0.5 }] },
    { id: 'vertical', name: 'Vertical Line', points: [{ x: 0.5, y: 0.15 }, { x: 0.5, y: 0.85 }] },
    { id: 'diagonal', name: 'Diagonal Line', points: [{ x: 0.15, y: 0.15 }, { x: 0.85, y: 0.85 }] },
    { id: 'zigzag', name: 'Zigzag', points: [{ x: 0.15, y: 0.3 }, { x: 0.35, y: 0.7 }, { x: 0.5, y: 0.3 }, { x: 0.65, y: 0.7 }, { x: 0.85, y: 0.3 }] },
  ],
  // Tier 1: Shapes (Medium)
  [
    { id: 'circle', name: 'Circle', points: Array.from({ length: 30 }, (_, i) => ({
      x: 0.5 + 0.3 * Math.cos(i / 30 * Math.PI * 2),
      y: 0.5 + 0.3 * Math.sin(i / 30 * Math.PI * 2),
    })) },
    { id: 'square', name: 'Square', points: [
      { x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.75 }, { x: 0.25, y: 0.75 },
      { x: 0.25, y: 0.25 },
    ] },
    { id: 'triangle', name: 'Triangle', points: [
      { x: 0.5, y: 0.15 }, { x: 0.85, y: 0.85 },
      { x: 0.15, y: 0.85 }, { x: 0.5, y: 0.15 },
    ] },
  ],
  // Tier 2: Complex (Hard)
  [
    { id: 'spiral', name: 'Spiral', points: Array.from({ length: 40 }, (_, i) => {
      const t = i / 40;
      const r = 0.05 + t * 0.3;
      const angle = t * Math.PI * 6;
      return { x: 0.5 + r * Math.cos(angle), y: 0.5 + r * Math.sin(angle) };
    }) },
    { id: 'star', name: 'Star', points: [
      { x: 0.5, y: 0.1 }, { x: 0.65, y: 0.4 }, { x: 0.95, y: 0.4 },
      { x: 0.7, y: 0.6 }, { x: 0.8, y: 0.9 }, { x: 0.5, y: 0.7 },
      { x: 0.2, y: 0.9 }, { x: 0.3, y: 0.6 }, { x: 0.05, y: 0.4 },
      { x: 0.35, y: 0.4 }, { x: 0.5, y: 0.1 },
    ] },
    { id: 'figure8', name: 'Figure 8', points: Array.from({ length: 40 }, (_, i) => {
      const t = i / 40;
      const angle = t * Math.PI * 4;
      return {
        x: 0.5 + 0.3 * Math.sin(angle),
        y: 0.5 + 0.2 * Math.sin(angle * 2),
      };
    }) },
  ],
];

export default function CanvasAir({ onSessionEnd, patientId, gameId = 'canvas-air' }) {
  // ===== State =====
  const [currentShape, setCurrentShape] = useState(null);
  const [shapeIndex, setShapeIndex] = useState(0);
  const [shapeTier, setShapeTier] = useState(0);
  const [drawingPath, setDrawingPath] = useState([]);
  const [accuracy, setAccuracy] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [calibrationData, setCalibrationData] = useState(null);
  const [difficulty, setDifficulty] = useState('easy');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackType, setFeedbackType] = useState('info');
  const [particles, setParticles] = useState([]);
  const [pathHistory, setPathHistory] = useState([]);
  const [accuracyHistory, setAccuracyHistory] = useState([]);
  const [showInstructions, setShowInstructions] = useState(true);

  // ===== Refs =====
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animationRef = useRef(null);
  const shapeStartTimeRef = useRef(null);
  const shapeTimeoutRef = useRef(null);
  const frameRef = useRef(0);

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
  const getFingertipPosition = useCallback(() => {
    if (!landmarks || landmarks.length === 0) return null;
    const tip = landmarks[HAND_LANDMARKS.INDEX_FINGER_TIP];
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return {
      x: (1 - tip.x) * rect.width,
      y: tip.y * rect.height,
    };
  }, [landmarks]);

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

  // ===== Shape Management =====
  const getShapesForTier = useCallback((tier) => {
    return SHAPES[Math.min(tier, SHAPES.length - 1)] || SHAPES[0];
  }, []);

  const spawnShape = useCallback(() => {
    if (state !== GAME_STATES.PLAYING) return;

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const difficultyConfig = CONFIG.DIFFICULTY[difficulty] || CONFIG.DIFFICULTY.easy;
    const tier = difficultyConfig.shapeTier;
    const shapes = getShapesForTier(tier);

    if (shapes.length === 0) return;

    const shape = shapes[Math.floor(Math.random() * shapes.length)];

    // Scale points to canvas size
    const scaledPoints = shape.points.map((p) => ({
      x: p.x * rect.width,
      y: p.y * rect.height,
    }));

    setCurrentShape({
      id: `shape-${Date.now()}-${shapeIndex}`,
      name: shape.name,
      points: scaledPoints,
      tier: tier,
      isComplete: false,
    });

    setShapeIndex((prev) => prev + 1);
    setDrawingPath([]);
    setAccuracy(0);
    setIsDrawing(false);
    shapeStartTimeRef.current = Date.now();

    // Audio cue for new shape
    audio.playTone(440, 0.05);

    // Set timeout for this shape
    clearTimeout(shapeTimeoutRef.current);
    const timeoutDuration = CONFIG.SHAPE_TIMEOUT[difficulty] || CONFIG.SHAPE_TIMEOUT.easy;
    shapeTimeoutRef.current = setTimeout(() => {
      if (state === GAME_STATES.PLAYING && currentShape && !currentShape.isComplete) {
        completeShape(false);
      }
    }, timeoutDuration);
  }, [state, difficulty, getShapesForTier, shapeIndex, audio]);

  const completeShape = useCallback((success) => {
    if (!currentShape) return;

    setCurrentShape((prev) => ({
      ...prev,
      isComplete: success,
    }));

    const accuracyValue = accuracy;
    if (success) {
      audio.playSuccess();
      const points = 10 + Math.round(accuracyValue * 20);
      addScore(points);
      setFeedbackMessage(`+${points} 🎨`);
      setFeedbackType('success');
      spawnParticles(
        currentShape.points[currentShape.points.length - 1]?.x || 0,
        currentShape.points[currentShape.points.length - 1]?.y || 0,
        '#8B5CF6', 30
      );
      recordAttempt(true, accuracyValue, null);
    } else {
      audio.playMiss();
      setFeedbackMessage('Shape timed out');
      setFeedbackType('miss');
      recordAttempt(false);
    }

    // Track accuracy history
    setAccuracyHistory((prev) => [...prev, accuracyValue]);

    // Spawn next shape after delay
    clearTimeout(shapeTimeoutRef.current);
    shapeTimeoutRef.current = setTimeout(() => {
      if (state === GAME_STATES.PLAYING) {
        spawnShape();
      }
    }, success ? 1000 : 2000);
  }, [currentShape, accuracy, audio, recordAttempt, state, spawnShape, addScore]);

  const spawnParticles = useCallback((x, y, color, count = 20) => {
    const newParticles = Array.from({ length: count }, () => ({
      x,
      y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6 - 1,
      life: 1,
      decay: 0.01 + Math.random() * 0.02,
      radius: 2 + Math.random() * 3,
      color,
    }));
    setParticles((prev) => [...prev, ...newParticles]);
  }, []);

  // ===== Hand Update Handler =====
  function handleHandsUpdate({ landmarks }) {
    if (state !== GAME_STATES.PLAYING || !currentShape || currentShape.isComplete) return;

    const fingertip = getFingertipPosition();
    if (!fingertip) return;

    // Check if fingertip is near the shape
    const isNearShape = currentShape.points.some((p) => {
      const dist = Math.sqrt(Math.pow(fingertip.x - p.x, 2) + Math.pow(fingertip.y - p.y, 2));
      return dist < 40;
    });

    if (isNearShape) {
      setIsDrawing(true);
      // Add point to drawing path
      setDrawingPath((prev) => {
        const newPath = [...prev, { x: fingertip.x, y: fingertip.y }];
        if (newPath.length > 200) newPath.shift();
        return newPath;
      });

      // Calculate accuracy
      const accuracyValue = calculateAccuracy(drawingPath, currentShape.points);
      setAccuracy(accuracyValue);

      // Check if shape is complete
      if (accuracyValue > CONFIG.DIFFICULTY[difficulty].accuracyThreshold && drawingPath.length > 20) {
        completeShape(true);
      }
    } else if (isDrawing) {
      // Lost contact with shape
      setIsDrawing(false);
    }
  }

  // ===== Accuracy Calculation =====
  const calculateAccuracy = useCallback((path, targetPoints) => {
    if (path.length < 5 || targetPoints.length === 0) return 0;

    // Sample path points
    const sampledPath = path.filter((_, i) => i % 3 === 0);

    let totalDist = 0;
    let matchedPoints = 0;

    for (const tp of targetPoints) {
      let minDist = Infinity;
      for (const sp of sampledPath) {
        const dist = Math.sqrt(Math.pow(tp.x - sp.x, 2) + Math.pow(tp.y - sp.y, 2));
        if (dist < minDist) minDist = dist;
      }
      totalDist += minDist;
      if (minDist < 30) matchedPoints++;
    }

    const avgDist = totalDist / targetPoints.length;
    const accuracyValue = Math.max(0, Math.min(1, 1 - avgDist / 80));
    return Math.round(accuracyValue * 100) / 100;
  }, []);

  // ===== Game Handlers =====
  function handleGameComplete(metrics) {
    audio.playGameEnd();
    const avgAccuracy = accuracyHistory.length > 0
      ? accuracyHistory.reduce((a, b) => a + b, 0) / accuracyHistory.length
      : 0;

    onSessionEnd?.({
      gameId,
      score: metrics.score,
      accuracy: Math.round(avgAccuracy * 100),
      attempts: metrics.attempts,
      successes: metrics.successes,
      misses: metrics.misses,
      duration: metrics.duration,
      shapesDrawn: metrics.successes,
      avgAccuracy: Math.round(avgAccuracy * 100),
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

    // Draw current shape
    if (currentShape && !currentShape.isComplete) {
      const { points, name } = currentShape;

      // Shape glow
      ctx.shadowColor = 'rgba(139, 92, 246, 0.2)';
      ctx.shadowBlur = 30;

      // Draw shape outline (dashed)
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        if (i === 0) ctx.moveTo(points[i].x, points[i].y);
        else ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // Draw shape name
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`Trace the ${name}`, w / 2, 30);

      // Draw shape difficulty indicator
      const tierLabel = ['Easy', 'Medium', 'Hard'][shapeTier] || 'Easy';
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(tierLabel, w - 20, 30);

      // Draw shape progress
      const shapeProgress = drawingPath.length / points.length;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(20, 20, 100, 4);
      ctx.fillStyle = '#8B5CF6';
      ctx.fillRect(20, 20, 100 * Math.min(shapeProgress, 1), 4);
    }

    // Draw drawing path
    if (drawingPath.length > 1) {
      ctx.shadowColor = 'rgba(139, 92, 246, 0.3)';
      ctx.shadowBlur = 20;

      // Main path
      ctx.beginPath();
      ctx.moveTo(drawingPath[0].x, drawingPath[0].y);
      for (let i = 1; i < drawingPath.length; i++) {
        ctx.lineTo(drawingPath[i].x, drawingPath[i].y);
      }
      ctx.strokeStyle = '#8B5CF6';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Glow trail
      ctx.shadowBlur = 40;
      ctx.shadowColor = 'rgba(139, 92, 246, 0.2)';
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.2)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(drawingPath[0].x, drawingPath[0].y);
      for (let i = 1; i < drawingPath.length; i++) {
        ctx.lineTo(drawingPath[i].x, drawingPath[i].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
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
  }, [currentShape, drawingPath, accuracy, feedbackMessage, feedbackType, getFingertipPosition]);

  // ===== Effects =====
  useEffect(() => {
    if (state === GAME_STATES.PLAYING) {
      setTimeout(spawnShape, 1000);
      audio.playGameStart();
    }
  }, [state, spawnShape, audio]);

  useEffect(() => {
    renderCanvas();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (shapeTimeoutRef.current) {
        clearTimeout(shapeTimeoutRef.current);
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
          <div className="text-3xl font-bold text-teal-400">{Math.round(accuracy * 100)}%</div>
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
          <div className="text-6xl mb-6">🎨</div>
          <h2 className="text-3xl font-bold text-white mb-4">Canvas Air</h2>
          
          <div className="max-w-md mb-6">
            <p className="text-slate-400 text-center mb-6">
              Trace shapes in the air to improve fine motor control and hand stability.
            </p>
            
            <div className="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-700">
              <h3 className="text-sm font-semibold text-teal-400 mb-3">📋 Patient Instructions</h3>
              <div className="space-y-2 text-sm text-slate-300">
                <p><strong>Starting Posture:</strong> Raise your hand comfortably in front of the camera</p>
                <p><strong>Arm Position:</strong> Keep your arm at a comfortable height</p>
                <p><strong>Movement:</strong> Trace the shape slowly in the air using your index finger</p>
                <p><strong>Accuracy:</strong> Focus on smooth and accurate movement rather than speed</p>
                <p><strong>Completion:</strong> Complete the shape before the next one appears</p>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-sm font-semibold text-blue-400 mb-3">💪 Therapy Benefits</h3>
              <div className="space-y-1 text-sm text-slate-300">
                <p>• Wrist Extension & Elbow Flexion</p>
                <p>• Fine Motor Control & Hand Stability</p>
                <p>• Coordination & Precision</p>
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
              <div className="text-xs text-slate-400">Shapes</div>
              <div className="text-2xl font-bold text-teal-400">{metrics.successes}</div>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-4 text-center">
              <div className="text-xs text-slate-400">Accuracy</div>
              <div className="text-2xl font-bold text-blue-400">{Math.round(accuracy * 100)}%</div>
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
            getFingertipPosition()
              ? 'bg-teal-500/20 border-teal-500/30 text-teal-400'
              : 'bg-red-500/20 border-red-500/30 text-red-400 animate-pulse'
          }`}>
            {getFingertipPosition() ? '👆 Finger Detected' : '⚠️ No Finger Detected'}
          </div>
        </div>
      )}

      {/* Gesture indicator */}
      {isPlaying && gesture && gesture !== 'none' && (
        <div className="absolute bottom-36 left-1/2 -translate-x-1/2 z-10">
          <div className="px-3 py-1 bg-slate-800/80 rounded-full text-xs text-slate-400">
            Gesture: {gesture}
          </div>
        </div>
      )}
    </div>
  );
}
