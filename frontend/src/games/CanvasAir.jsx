// frontend/src/games/CanvasAir.jsx
import React, { useReducer, useRef, useEffect, useCallback, useState } from 'react';
import { useMediaPipeHands, HAND_LANDMARKS } from '../hooks/useMediaPipeUpperBody';
import { useAudioFeedback } from '../hooks/useAudioFeedback.js';
import { useSessionTelemetry } from '../hooks/useSessionTelemetry';

/**
 * THERAPIST CONFIG: sessionLength, restInterval (delay before next shape),
 * accuracyThreshold, and maxReps are DEFAULTS per tier below. A
 * therapistConfig prop (see component) can override any of them per patient.
 */
const CONFIG = {
  SHAPE_TIMEOUT: { BEGINNER: 10000, INTERMEDIATE: 8000, ADVANCED: 6000 },
  DIFFICULTY: {
    BEGINNER: { shapeTier: 0, accuracyThreshold: 0.5, sessionLength: 60, restInterval: 1000, maxReps: null },
    INTERMEDIATE: { shapeTier: 1, accuracyThreshold: 0.6, sessionLength: 60, restInterval: 800, maxReps: null },
    ADVANCED: { shapeTier: 2, accuracyThreshold: 0.7, sessionLength: 60, restInterval: 600, maxReps: null },
  },
};

const DIFFICULTY_LEVEL_NUMBER = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };

const SHAPES = [
  // Tier 0: Lines (Beginner)
  [
    { id: 'horizontal', name: 'Horizontal Line', points: [{ x: 0.15, y: 0.5 }, { x: 0.85, y: 0.5 }] },
    { id: 'vertical', name: 'Vertical Line', points: [{ x: 0.5, y: 0.15 }, { x: 0.5, y: 0.85 }] },
    { id: 'diagonal', name: 'Diagonal Line', points: [{ x: 0.15, y: 0.15 }, { x: 0.85, y: 0.85 }] },
    { id: 'zigzag', name: 'Zigzag', points: [{ x: 0.15, y: 0.3 }, { x: 0.35, y: 0.7 }, { x: 0.5, y: 0.3 }, { x: 0.65, y: 0.7 }, { x: 0.85, y: 0.3 }] },
  ],
  // Tier 1: Shapes (Intermediate)
  [
    { id: 'circle', name: 'Circle', points: Array.from({ length: 30 }, (_, i) => ({
      x: 0.5 + 0.3 * Math.cos((i / 30) * Math.PI * 2),
      y: 0.5 + 0.3 * Math.sin((i / 30) * Math.PI * 2),
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
  // Tier 2: Complex (Advanced)
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
      return { x: 0.5 + 0.3 * Math.sin(angle), y: 0.5 + 0.2 * Math.sin(angle * 2) };
    }) },
  ],
];

const GAME_STATES = {
  IDLE: 'IDLE',
  INSTRUCTIONS: 'INSTRUCTIONS',
  COUNTDOWN: 'COUNTDOWN',
  SHAPE_INTRO: 'SHAPE_INTRO', // per-shape "trace the X" beat (constraint: only one shape at a time)
  TRACING: 'TRACING',
  RESOLVED: 'RESOLVED', // brief pause showing success/timeout feedback before next shape
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
};

function SettingSlider({ label, value, min, max, step, onChange, display }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-bold text-slate-400 mb-2"><span>{label}</span><span className="text-slate-200">{display}</span></div>
      <input type="range" min={min} max={max} step={step} value={value || ''} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-current" />
    </div>
  );
}

const initialState = {
  status: GAME_STATES.IDLE,
  score: 0,
  reps: 0,
  successes: 0,
  misses: 0,
  timeRemaining: 60,
  difficulty: 'BEGINNER',
  countdown: 3,
  shapeIndex: 0,
  currentShapeDef: null, // { id, name, points } — un-scaled (0..1), scaled at render time
  drawingPath: [],
  accuracy: 0,
  isDrawing: false,
  feedback: null, // { message, type }
  accuracyHistory: [],
};

function pickShape(tier) {
  const shapes = SHAPES[Math.min(tier, SHAPES.length - 1)] || SHAPES[0];
  return shapes[Math.floor(Math.random() * shapes.length)];
}

function gameReducer(state, action) {
  switch (action.type) {
    case 'START_SESSION':
      return { ...state, status: GAME_STATES.COUNTDOWN, countdown: 3, timeRemaining: action.sessionLength };
    case 'COUNTDOWN_TICK': {
      if (state.countdown <= 1) {
        return { ...state, status: GAME_STATES.SHAPE_INTRO, countdown: 0, currentShapeDef: action.shape, shapeIndex: state.shapeIndex + 1, drawingPath: [], accuracy: 0, isDrawing: false };
      }
      return { ...state, countdown: state.countdown - 1 };
    }
    case 'SHAPE_READY': // intro card dismissed -> start accepting input
      return { ...state, status: GAME_STATES.TRACING };
    case 'DRAW_POINT':
      return { ...state, drawingPath: action.path, accuracy: action.accuracy, isDrawing: true };
    case 'STOP_DRAWING':
      return { ...state, isDrawing: false };
    case 'RESOLVE_SUCCESS':
      return {
        ...state,
        status: GAME_STATES.RESOLVED,
        score: state.score + action.points,
        reps: state.reps + 1,
        successes: state.successes + 1,
        accuracyHistory: [...state.accuracyHistory, action.accuracy],
        feedback: { message: `+${action.points} 🎨`, type: 'success' },
      };
    case 'RESOLVE_TIMEOUT':
      return {
        ...state,
        status: GAME_STATES.RESOLVED,
        reps: state.reps + 1,
        misses: state.misses + 1,
        accuracyHistory: [...state.accuracyHistory, state.accuracy],
        feedback: { message: 'Shape timed out', type: 'miss' },
      };
    case 'NEXT_SHAPE':
      return {
        ...state,
        status: GAME_STATES.SHAPE_INTRO,
        currentShapeDef: action.shape,
        shapeIndex: state.shapeIndex + 1,
        drawingPath: [],
        accuracy: 0,
        isDrawing: false,
        feedback: null,
      };
    case 'TICK':
      if (state.timeRemaining <= 0) return { ...state, status: GAME_STATES.COMPLETED };
      return { ...state, timeRemaining: state.timeRemaining - 1 };
    case 'REP_CAP_REACHED':
      return { ...state, status: GAME_STATES.COMPLETED };
    case 'PAUSE':
      return { ...state, status: GAME_STATES.PAUSED };
    case 'RESUME':
      return { ...state, status: GAME_STATES.TRACING };
    case 'SET_DIFFICULTY':
      return { ...state, difficulty: action.difficulty };
    case 'RESET':
      return { ...initialState, difficulty: state.difficulty };
    default:
      return state;
  }
}

const DIFFICULTY_LEVEL_NUMBER_LOOKUP = DIFFICULTY_LEVEL_NUMBER;

/**
 * therapistConfig (optional overrides): sessionLength (s), restInterval (ms,
 * pause between shapes), accuracyThreshold (0-1, how closely the traced path
 * must match), maxReps (number | null).
 */
export default function CanvasAir({ onSessionEnd, patientId, gameId = 'canvas-air', therapistConfig = {}, qaAdapterRef } = {}) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [therapistSettings, setTherapistSettings] = useState({
    maxReps: null,
    shapeTimeoutMs: null,
    accuracyThreshold: null,
    sessionLength: null,
    restInterval: null,
  });
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animationRef = useRef(null);
  const particlesRef = useRef([]);
  const shapeTimeoutRef = useRef(null);
  const repCounterRef = useRef(0);
  const sessionStartRef = useRef(null);
  // Mirrors of state that the MediaPipe callback (registered once, reads
  // stale closures otherwise) needs on every frame.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const audio = useAudioFeedback();
  const { startSession, saveRep, finishSession } = useSessionTelemetry({ gameId, gameName: 'Canvas Air' });

  const effectiveConfig = {
    ...CONFIG.DIFFICULTY[state.difficulty],
    ...therapistConfig,
    ...(therapistSettings.maxReps != null ? { maxReps: therapistSettings.maxReps } : {}),
    ...(therapistSettings.shapeTimeoutMs != null ? { shapeTimeoutMs: therapistSettings.shapeTimeoutMs } : {}),
    ...(therapistSettings.accuracyThreshold != null ? { accuracyThreshold: therapistSettings.accuracyThreshold } : {}),
    ...(therapistSettings.sessionLength != null ? { sessionLength: therapistSettings.sessionLength } : {}),
    ...(therapistSettings.restInterval != null ? { restInterval: therapistSettings.restInterval } : {}),
  };
  const shapeTimeout = effectiveConfig.shapeTimeoutMs
    || CONFIG.SHAPE_TIMEOUT[state.difficulty]
    || CONFIG.SHAPE_TIMEOUT.BEGINNER;

  // ===== Scaled shape points (0..1 -> container px), recomputed on resize =====
  const getScaledPoints = useCallback((shapeDef) => {
    const container = containerRef.current;
    if (!container || !shapeDef) return [];
    const rect = container.getBoundingClientRect();
    return shapeDef.points.map((p) => ({ x: p.x * rect.width, y: p.y * rect.height }));
  }, []);

  // ===== Fingertip position in container px =====
  const getFingertipPosition = useCallback((landmarks) => {
    if (!landmarks || landmarks.length === 0) return null;
    const tip = landmarks[HAND_LANDMARKS.INDEX_FINGER_TIP];
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return { x: (1 - tip.x) * rect.width, y: tip.y * rect.height };
  }, []);

  // ===== Accuracy: how well the traced path covers the target shape =====
  const calculateAccuracy = useCallback((path, targetPoints) => {
    if (path.length < 5 || targetPoints.length === 0) return 0;
    const sampledPath = path.filter((_, i) => i % 3 === 0);
    let totalDist = 0;
    for (const tp of targetPoints) {
      let minDist = Infinity;
      for (const sp of sampledPath) {
        const dist = Math.hypot(tp.x - sp.x, tp.y - sp.y);
        if (dist < minDist) minDist = dist;
      }
      totalDist += minDist;
    }
    const avgDist = totalDist / targetPoints.length;
    return Math.round(Math.max(0, Math.min(1, 1 - avgDist / 80)) * 100) / 100;
  }, []);

  // ===== Resolve current shape (success or timeout) =====
  const resolveShape = useCallback((success) => {
    clearTimeout(shapeTimeoutRef.current);
    const s = stateRef.current;
    if (!s.currentShapeDef) return;

    repCounterRef.current += 1;
    const repNumber = repCounterRef.current;
    const accuracyValue = s.accuracy;

    if (success) {
      audio.playSuccess();
      const points = 10 + Math.round(accuracyValue * 20);
      dispatch({ type: 'RESOLVE_SUCCESS', points, accuracy: accuracyValue });
      const scaled = getScaledPoints(s.currentShapeDef);
      spawnParticles(scaled[scaled.length - 1]?.x || 0, scaled[scaled.length - 1]?.y || 0, '#8B5CF6', 30);
    } else {
      audio.playMiss();
      dispatch({ type: 'RESOLVE_TIMEOUT' });
    }

    // Telemetry: emitted per shape resolution, matching the per-rep save
    // pattern used by the other games (previously CanvasAir had NO
    // per-rep saveRep calls at all, and no startSession/finishSession
    // calls either — sessions were only reported via onSessionEnd, which
    // never reached the backend).
    saveRep({
      exerciseId: gameId,
      exerciseName: 'Canvas Air',
      repNumber,
      rom: 0, // tracing accuracy, not a joint-angle exercise
      confidence: accuracyValue,
      isCorrect: success,
    });

    const restInterval = effectiveConfig.restInterval;
    shapeTimeoutRef.current = setTimeout(() => {
      if (stateRef.current.status === GAME_STATES.COMPLETED) return;
      const nextTier = effectiveConfig.shapeTier;
      dispatch({ type: 'NEXT_SHAPE', shape: pickShape(nextTier) });
    }, restInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio, saveRep, gameId, getScaledPoints, effectiveConfig.restInterval, effectiveConfig.shapeTier]);

  const spawnParticles = (x, y, color, count = 20) => {
    const newParticles = Array.from({ length: count }, () => ({
      x, y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6 - 1,
      life: 1,
      decay: 0.01 + Math.random() * 0.02,
      radius: 2 + Math.random() * 3,
      color,
    }));
    particlesRef.current = [...particlesRef.current, ...newParticles];
  };

  // ===== Hand update: only meaningful while TRACING a shape =====
  const handleHandsUpdate = useCallback(({ landmarks }) => {
    const s = stateRef.current;
    if (s.status !== GAME_STATES.TRACING || !s.currentShapeDef) return;

    const fingertip = getFingertipPosition(landmarks);
    if (!fingertip) return;

    const scaledPoints = getScaledPoints(s.currentShapeDef);
    const isNearShape = scaledPoints.some((p) => Math.hypot(fingertip.x - p.x, fingertip.y - p.y) < 40);

    if (isNearShape) {
      // FIX: the original computed accuracy from `drawingPath` (React
      // state) BEFORE appending the current point — i.e. always one frame
      // behind, and never included the point that just triggered the
      // completion check. Build the new path array first, then measure
      // accuracy against THAT array.
      const newPath = [...s.drawingPath, fingertip];
      if (newPath.length > 200) newPath.shift();
      const accuracyValue = calculateAccuracy(newPath, scaledPoints);

      dispatch({ type: 'DRAW_POINT', path: newPath, accuracy: accuracyValue });

      if (accuracyValue > effectiveConfig.accuracyThreshold && newPath.length > 20) {
        resolveShape(true);
      }
    } else if (s.isDrawing) {
      dispatch({ type: 'STOP_DRAWING' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getFingertipPosition, getScaledPoints, calculateAccuracy, effectiveConfig.accuracyThreshold, resolveShape]);

  // FIX: was `state.status !== IDLE && !== COMPLETED && !== PAUSED` — i.e.
  // disabled during IDLE, which is exactly the screen the "Start Session"
  // button lives on. useMediaPipeHands' isLoading starts `true` and only
  // updates once its setup effect actually runs, which requires `enabled`
  // to already be true. That's a deadlock: the Start button stays disabled
  // until handsLoading resolves, but handsLoading can never resolve while
  // still on the IDLE screen the button lives on. Enabling from mount all
  // the way through until COMPLETED lets the model/camera load in the
  // background while the patient reads the IDLE screen, so it's normally
  // ready by the time they tap Start.
  const mpEnabled = state.status !== GAME_STATES.COMPLETED;

  const { videoRef, isLoading: handsLoading, error: handsError } = useMediaPipeHands({
    enabled: mpEnabled,
    silent: true, // ref-driven rendering below, no per-frame React state churn
    onHandsUpdate: handleHandsUpdate,
  });

  useEffect(() => {
    if (!import.meta.env.DEV || !qaAdapterRef) return;
    qaAdapterRef.current = {
      startSession: () => handleStart(),
      pauseSession: () => dispatch({ type: 'PAUSE' }),
      resumeSession: () => dispatch({ type: 'RESUME' }),
      endSession: () => dispatch({ type: 'PAUSE' }),
      restartSession: () => dispatch({ type: 'RESET' }),
      injectLandmarks: (landmarks) => handleHandsUpdate({ landmarks }),
      injectPointer: (pt) => dispatch({ type: 'DRAW_POINT', path: [...stateRef.current.drawingPath, pt], accuracy: calculateAccuracy([...stateRef.current.drawingPath, pt], getScaledPoints(stateRef.current.currentShapeDef)) }),
      simulateSuccess: () => resolveShape(true),
      simulateFailure: () => resolveShape(false),
      getState: () => ({ state: stateRef.current }),
      cleanup: () => { clearTimeout(shapeTimeoutRef.current); cancelAnimationFrame(animationRef.current); },
    };
    return () => { if (qaAdapterRef) qaAdapterRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qaAdapterRef]);

  // ===== Countdown =====
  useEffect(() => {
    if (state.status !== GAME_STATES.COUNTDOWN) return;
    const timer = setInterval(() => {
      dispatch({ type: 'COUNTDOWN_TICK', shape: pickShape(effectiveConfig.shapeTier) });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  // ===== Shape intro -> tracing, with the timeout armed only once tracing starts =====
  useEffect(() => {
    if (state.status !== GAME_STATES.SHAPE_INTRO) return;
    audio.playTone(440, 0.05);
    const t = setTimeout(() => {
      dispatch({ type: 'SHAPE_READY' });
      shapeTimeoutRef.current = setTimeout(() => resolveShape(false), shapeTimeout);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.shapeIndex]);

  // ===== Session countdown timer =====
  useEffect(() => {
    if (state.status === GAME_STATES.TRACING || state.status === GAME_STATES.SHAPE_INTRO || state.status === GAME_STATES.RESOLVED) {
      const timer = setInterval(() => dispatch({ type: 'TICK' }), 1000);
      return () => clearInterval(timer);
    }
  }, [state.status]);

  // Rep-cap enforcement
  useEffect(() => {
    const cap = effectiveConfig.maxReps;
    if (cap && state.reps >= cap && state.status !== GAME_STATES.COMPLETED) {
      clearTimeout(shapeTimeoutRef.current);
      dispatch({ type: 'REP_CAP_REACHED' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.reps]);

  // ===== Session completion: real telemetry + schema-correct summary =====
  useEffect(() => {
    if (state.status !== GAME_STATES.COMPLETED) return;
    audio.playGameEnd();

    const avgAccuracy = state.accuracyHistory.length > 0
      ? state.accuracyHistory.reduce((a, b) => a + b, 0) / state.accuracyHistory.length
      : 0;
    const accuracyPct = Math.round(avgAccuracy * 100);
    const durationSeconds = sessionStartRef.current
      ? Math.round((Date.now() - sessionStartRef.current) / 1000)
      : effectiveConfig.sessionLength - state.timeRemaining;
    const stars = accuracyPct >= 85 ? 3 : accuracyPct >= 60 ? 2 : accuracyPct > 0 ? 1 : 0;

    const summary = {
      score: state.score,
      level: DIFFICULTY_LEVEL_NUMBER_LOOKUP[state.difficulty] || 1,
      accuracy: accuracyPct,
      combo: 0,
      maxCombo: 0,
      stars,
      exerciseResults: [{
        exerciseId: gameId,
        name: 'Canvas Air',
        setsCompleted: 1,
        repsCompleted: state.reps,
        averageRom: 0,
        maxRom: 0,
        accuracy: accuracyPct,
        score: state.score,
      }],
      durationSeconds,
      notes: '',
      gameType: gameId,
      missedActions: state.misses,
    };

    finishSession(summary);
    onSessionEnd?.(summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  // ===== Canvas rendering loop (unchanged visuals, now reads refs not state) =====
  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const ctx = canvas.getContext('2d');
        const rect = container.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
        ctx.clearRect(0, 0, rect.width, rect.height);

        const s = stateRef.current;
        if (s.currentShapeDef && (s.status === GAME_STATES.TRACING || s.status === GAME_STATES.SHAPE_INTRO)) {
          const points = getScaledPoints(s.currentShapeDef);
          ctx.shadowColor = 'rgba(139, 92, 246, 0.2)';
          ctx.shadowBlur = 30;
          ctx.setLineDash([8, 8]);
          ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.shadowBlur = 0;

          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.font = '14px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`Trace the ${s.currentShapeDef.name}`, rect.width / 2, 30);

          const tierLabel = ['Beginner', 'Intermediate', 'Advanced'][effectiveConfig.shapeTier] || 'Beginner';
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.font = '10px Inter, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(tierLabel, rect.width - 20, 30);

          const shapeProgress = s.drawingPath.length / points.length;
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.fillRect(20, 20, 100, 4);
          ctx.fillStyle = '#8B5CF6';
          ctx.fillRect(20, 20, 100 * Math.min(shapeProgress, 1), 4);
        }

        if (s.drawingPath.length > 1) {
          ctx.shadowColor = 'rgba(139, 92, 246, 0.3)';
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.moveTo(s.drawingPath[0].x, s.drawingPath[0].y);
          s.drawingPath.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
          ctx.strokeStyle = '#8B5CF6';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        particlesRef.current = particlesRef.current
          .map((p) => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - p.decay, vy: p.vy + 0.1 }))
          .filter((p) => p.life > 0);
        particlesRef.current.forEach((p) => {
          ctx.globalAlpha = p.life;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
        });
        ctx.globalAlpha = 1;

        if (s.feedback) {
          ctx.fillStyle = s.feedback.type === 'success' ? '#10B981' : '#EF4444';
          ctx.font = 'bold 24px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(s.feedback.message, rect.width / 2, rect.height - 30);
        }
      }
      animationRef.current = requestAnimationFrame(render);
    };
    render();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      clearTimeout(shapeTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = () => {
    repCounterRef.current = 0;
    sessionStartRef.current = Date.now();
    dispatch({ type: 'START_SESSION', sessionLength: effectiveConfig.sessionLength });
    startSession(patientId);
  };

  const isPlaying = state.status === GAME_STATES.TRACING || state.status === GAME_STATES.SHAPE_INTRO
    || state.status === GAME_STATES.RESOLVED || state.status === GAME_STATES.COUNTDOWN;
  const isPaused = state.status === GAME_STATES.PAUSED;
  const isCompleted = state.status === GAME_STATES.COMPLETED;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-slate-950 overflow-hidden">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay style={{ transform: 'scaleX(-1)' }} />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-10">
        <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10 min-w-[80px]">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Score</div>
          <div className="text-3xl font-bold text-amber-400">{state.score}</div>
        </div>
        <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 text-center border border-white/10 min-w-[80px]">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Time</div>
          <div className={`text-3xl font-bold ${state.timeRemaining <= 10 ? 'text-red-400' : 'text-white'}`}>{state.timeRemaining}s</div>
        </div>
        <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 text-center border border-white/10 min-w-[80px]">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Accuracy</div>
          <div className="text-3xl font-bold text-teal-400">{Math.round(state.accuracy * 100)}%</div>
        </div>
      </div>

      {state.status === GAME_STATES.COUNTDOWN && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-slate-950/80 backdrop-blur-sm">
          <div className="text-8xl font-bold text-white animate-pulse">{state.countdown > 0 ? state.countdown : 'GO!'}</div>
        </div>
      )}

      {state.status === GAME_STATES.IDLE && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-950/90 backdrop-blur-sm p-8">
          <div className="text-6xl mb-6">🎨</div>
          <h2 className="text-3xl font-bold text-white mb-4">Canvas Air</h2>

          <div className="grid grid-cols-3 gap-3 mb-6 w-full max-w-sm">
            {['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((d) => (
              <button key={d} onClick={() => dispatch({ type: 'SET_DIFFICULTY', difficulty: d })}
                className={`py-3 rounded-xl text-xs font-black tracking-widest transition-all border ${
                  state.difficulty === d ? 'bg-purple-600 border-purple-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}
              > {d} </button>
            ))}
          </div>
          <div className="max-w-md mb-6">
            <div className="bg-slate-800/50 rounded-lg p-4 mb-4 border border-slate-700">
              <h3 className="text-sm font-semibold text-teal-400 mb-3">📋 Patient Instructions</h3>
              <div className="space-y-2 text-sm text-slate-300">
                <p><strong>Starting Posture:</strong> Sit or stand comfortably, raise your hand in front of the camera.</p>
                <p><strong>Arm Position:</strong> Keep your arm at a comfortable, relaxed height.</p>
                <p><strong>Movement Required:</strong> Trace the shape slowly in the air with your index finger.</p>
                <p><strong>Success Condition:</strong> Trace closely enough to the outline, given time, to complete it.</p>
                <p><strong>Therapy Benefit:</strong> Wrist extension, elbow flexion, fine motor control, hand stability.</p>
              </div>
            </div>

            <button onClick={() => setSettingsOpen((s) => !s)} className="w-full py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm font-bold text-slate-300 mb-3">
              Therapist Settings {settingsOpen ? '▲ Hide' : '▼ Show'}
            </button>
            {settingsOpen && (
              <div className="mt-2 bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-4 text-left">
                <SettingSlider label="Repetitions (max)" value={therapistSettings.maxReps ?? ''} min={0} max={50} step={1} onChange={(v) => setTherapistSettings(s => ({ ...s, maxReps: v }))} display={`${therapistSettings.maxReps ?? 'auto'}`} />
                <SettingSlider label="Shape timeout (ms)" value={therapistSettings.shapeTimeoutMs ?? ''} min={2000} max={20000} step={500} onChange={(v) => setTherapistSettings(s => ({ ...s, shapeTimeoutMs: v }))} display={`${therapistSettings.shapeTimeoutMs ?? 'default'} ms`} />
                <SettingSlider label="Accuracy threshold" value={therapistSettings.accuracyThreshold ?? effectiveConfig.accuracyThreshold} min={0.3} max={0.95} step={0.05} onChange={(v) => setTherapistSettings(s => ({ ...s, accuracyThreshold: Number(v) }))} display={`${Math.round((therapistSettings.accuracyThreshold ?? effectiveConfig.accuracyThreshold) * 100)}%`} />
                <SettingSlider label="Session length" value={therapistSettings.sessionLength ?? effectiveConfig.sessionLength} min={30} max={600} step={30} onChange={(v) => setTherapistSettings(s => ({ ...s, sessionLength: v }))} display={`${Math.round((therapistSettings.sessionLength ?? effectiveConfig.sessionLength) / 60)} min`} />
                <SettingSlider label="Rest interval" value={therapistSettings.restInterval ?? effectiveConfig.restInterval} min={200} max={3000} step={100} onChange={(v) => setTherapistSettings(s => ({ ...s, restInterval: v }))} display={`${therapistSettings.restInterval ?? effectiveConfig.restInterval} ms`} />
              </div>
            )}
          </div>

          <button
            onClick={handleStart}
            disabled={handsLoading}
            className="mt-2 px-8 py-4 bg-teal-600 hover:bg-teal-500 rounded-xl font-bold text-white text-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {handsLoading ? 'Loading...' : 'Start Session'}
          </button>
          {handsError && <p className="mt-4 text-red-400 text-sm">{handsError}</p>}
        </div>
      )}

      {isPaused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-950/80 backdrop-blur-sm">
          <div className="text-6xl mb-4">⏸</div>
          <h2 className="text-2xl font-bold text-white mb-2">Paused</h2>
          <button onClick={() => dispatch({ type: 'RESUME' })} className="px-6 py-3 bg-teal-600 hover:bg-teal-500 rounded-xl font-bold text-white text-lg transition">Resume</button>
        </div>
      )}

      {isCompleted && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-950/90 backdrop-blur-sm p-8">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-3xl font-bold text-white mb-2">Session Complete!</h2>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-slate-800/80 rounded-xl p-4 text-center">
              <div className="text-xs text-slate-400">Score</div>
              <div className="text-2xl font-bold text-amber-400">{state.score}</div>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-4 text-center">
              <div className="text-xs text-slate-400">Shapes</div>
              <div className="text-2xl font-bold text-teal-400">{state.successes}</div>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-4 text-center">
              <div className="text-xs text-slate-400">Accuracy</div>
              <div className="text-2xl font-bold text-blue-400">
                {state.accuracyHistory.length > 0
                  ? Math.round((state.accuracyHistory.reduce((a, b) => a + b, 0) / state.accuracyHistory.length) * 100)
                  : 0}%
              </div>
            </div>
          </div>
          <button onClick={() => dispatch({ type: 'RESET' })} className="mt-6 px-6 py-3 bg-teal-600 hover:bg-teal-500 rounded-xl font-bold text-white text-lg transition">Play Again</button>
        </div>
      )}

      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {isPlaying && <button onClick={() => dispatch({ type: 'PAUSE' })} className="p-2 bg-black/70 hover:bg-black/90 rounded-lg text-white transition">⏸</button>}
        {isPaused && <button onClick={() => dispatch({ type: 'RESUME' })} className="p-2 bg-black/70 hover:bg-black/90 rounded-lg text-white transition">▶</button>}
        {(isPlaying || isPaused) && <button onClick={() => dispatch({ type: 'RESET' })} className="p-2 bg-black/70 hover:bg-black/90 rounded-lg text-white transition">⟳</button>}
      </div>
    </div>
  );
}