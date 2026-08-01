// frontend/src/games/CatchFlex.jsx
import React, { useReducer, useRef, useEffect, useCallback, useState } from 'react';
import Phaser from 'phaser';
import { useMediaPipePose } from '../hooks/usePoseDetection';
import { useAudioFeedback } from '../hooks/useAudioFeedback.js';
import { useSessionTelemetry } from '../hooks/useSessionTelemetry';

/**
 * 5. CONFIG-DRIVEN DIFFICULTY (Constraint 5)
 * Per constraint 7, fall speed MUST come from here (not hardcoded) — this
 * is the one game where object motion itself is time-pressured, so the
 * pressure has to be difficulty-documented rather than an arbitrary miss
 * timer.
 *
 * THERAPIST CONFIG: sessionLength, restInterval, catchRadius, and maxReps
 * below are DEFAULTS. A `therapistConfig` prop (see component below) can
 * override any of them per-patient without touching this table — the table
 * still defines the beginner/intermediate/advanced baselines the spec asks
 * for; therapistConfig is the per-patient adjustment layer on top.
 */
const GAME_CONFIG = {
  BEGINNER: {
    itemSize: 70,
    fallSpeed: 1.2,
    catchRadius: 90,
    points: 10,
    restInterval: 500,
    instructionDuration: 1200,
    sessionLength: 60,
    maxReps: null, // null = no rep cap, time-limited only
  },
  INTERMEDIATE: {
    itemSize: 50,
    fallSpeed: 2.2,
    catchRadius: 70,
    points: 20,
    restInterval: 400,
    instructionDuration: 1000,
    sessionLength: 60,
    maxReps: null,
  },
  ADVANCED: {
    itemSize: 36,
    fallSpeed: 3.5,
    catchRadius: 55,
    points: 35,
    restInterval: 300,
    instructionDuration: 800,
    sessionLength: 60,
    maxReps: null,
  },
};

const ITEM_TYPES = [
  { id: 'apple', label: '🍎', points: 10 },
  { id: 'ball', label: '⚽', points: 12 },
  { id: 'star', label: '⭐', points: 15 },
  { id: 'heart', label: '❤️', points: 20 },
  { id: 'diamond', label: '💎', points: 25 },
];

const GAME_STATES = {
  IDLE: 'IDLE',
  INSTRUCTIONS: 'INSTRUCTIONS', // NEW: session-level patient instructions, pre-play
  INSTRUCTION: 'INSTRUCTION', // per-object "close your hand" card (unchanged)
  AWAITING_MOVEMENT: 'AWAITING_MOVEMENT',
  SUCCESS: 'SUCCESS',
  TIMEOUT: 'TIMEOUT',
  COMPLETED: 'COMPLETED',
};

const DIFFICULTY_LEVEL_NUMBER = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };

const initialState = {
  status: GAME_STATES.IDLE,
  score: 0,
  reps: 0,
  successes: 0,
  misses: 0,
  maxCombo: 0,
  combo: 0,
  timeRemaining: 60,
  difficulty: 'BEGINNER',
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'START_SESSION':
      return { ...state, status: GAME_STATES.INSTRUCTION, timeRemaining: action.sessionLength };
    case 'SHOW_OBJECT':
      return { ...state, status: GAME_STATES.AWAITING_MOVEMENT };
    case 'RESOLVE_SUCCESS': {
      const combo = state.combo + 1;
      return {
        ...state,
        status: GAME_STATES.SUCCESS,
        score: state.score + action.points,
        reps: state.reps + 1,
        successes: state.successes + 1,
        combo,
        maxCombo: Math.max(state.maxCombo, combo),
      };
    }
    case 'RESOLVE_TIMEOUT':
      return {
        ...state,
        status: GAME_STATES.TIMEOUT,
        reps: state.reps + 1,
        misses: state.misses + 1,
        combo: 0,
      };
    case 'NEXT_OBJECT':
      return { ...state, status: GAME_STATES.INSTRUCTION };
    case 'TICK':
      if (state.timeRemaining <= 0) return { ...state, status: GAME_STATES.COMPLETED };
      return { ...state, timeRemaining: state.timeRemaining - 1 };
    case 'REP_CAP_REACHED':
      return { ...state, status: GAME_STATES.COMPLETED };
    case 'SET_DIFFICULTY':
      return { ...state, difficulty: action.difficulty };
    case 'RESET':
      return { ...initialState, difficulty: state.difficulty };
    default:
      return state;
  }
}

const EMA_ALPHA = 0.45;

class CatchFlexScene extends Phaser.Scene {
  constructor() {
    super('CatchFlexScene');
    this.fallingItem = null;
    this.activeObjectCount = 0;
    this.emaWrist = null;
  }

  init(data) {
    this.reactData = data;
    this.config = data.effectiveConfig;
  }

  create() {
    this.graphics = this.add.graphics();
    const { width, height } = this.cameras.main;

    this.fpsText = this.add.text(width - 150, height - 60, 'FPS: 60', {
      fontSize: '14px', fill: '#00ff00', backgroundColor: '#000000aa', padding: { x: 6, y: 4 },
    }).setDepth(1000);
    this.objectCounter = this.add.text(width - 150, height - 30, 'Active Objects: 0', {
      fontSize: '14px', fill: '#ffffff', backgroundColor: '#000000aa', padding: { x: 6, y: 4 },
    }).setDepth(1000);

    this.instructionOverlay = this.add.container(width / 2, height / 2).setDepth(2000).setVisible(false);
    const bg = this.add.rectangle(0, 0, 450, 120, 0x1e293b, 0.95).setOrigin(0.5);
    const text = this.add.text(0, 0, 'MOVE YOUR HAND TO CATCH!', {
      fontSize: '22px', fill: '#2dd4bf', fontStyle: 'bold', fontFamily: 'Inter, sans-serif',
    }).setOrigin(0.5);
    this.instructionOverlay.add([bg, text]);

    this.events.on('state-update', (state) => {
      this.gameState = state;
      this.handleStateTransition(state);
    });
  }

  handleStateTransition(state) {
    if (state.status === GAME_STATES.INSTRUCTION) {
      this.showInstruction();
    } else if (state.status === GAME_STATES.AWAITING_MOVEMENT) {
      if (!this.fallingItem) this.spawnItem();
    } else if (state.status === GAME_STATES.COMPLETED) {
      this.cleanup();
    }
  }

  showInstruction() {
    if (this.instructionOverlay.visible) return;
    this.instructionOverlay.setVisible(true);
    this.time.delayedCall(this.config.instructionDuration, () => {
      this.instructionOverlay.setVisible(false);
      this.reactData.dispatch({ type: 'SHOW_OBJECT' });
    });
  }

  // 1. SINGLE-OBJECT INVARIANT
  spawnItem() {
    if (this.fallingItem) {
      console.assert(this.activeObjectCount === 0, '[CatchFlex] Invariant Violation');
      this.fallingItem.destroy();
      this.fallingItem = null;
      this.activeObjectCount = 0;
    }

    const { width } = this.cameras.main;
    const { itemSize } = this.config;
    const type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];

    const x = Phaser.Math.Between(itemSize, width - itemSize);
    const y = -itemSize;

    this.fallingItem = this.add.container(x, y).setDepth(500);
    const g = this.add.graphics();
    g.lineStyle(3, 0x3b82f6, 0.9);
    g.strokeCircle(0, 0, itemSize / 2);
    g.fillStyle(0x3b82f6, 0.15);
    g.fillCircle(0, 0, itemSize / 2);
    const label = this.add.text(0, 0, type.label, { fontSize: `${itemSize * 0.65}px` }).setOrigin(0.5);
    this.fallingItem.add([g, label]);
    this.fallingItem.setData('size', itemSize);
    this.fallingItem.setData('points', type.points);
    this.fallingItem.setData('startTime', this.time.now);

    this.activeObjectCount = 1;
    this.updateObjectCounter();
  }

  updateObjectCounter() {
    this.objectCounter.setText(`Active Objects: ${this.activeObjectCount}`);
    this.objectCounter.setColor(this.activeObjectCount > 1 ? '#ef4444' : '#ffffff');
  }

  resolveItem(success) {
    if (!this.fallingItem) return;

    const startTime = this.fallingItem.getData('startTime');
    const timeTaken = this.time.now - startTime;
    const points = success ? this.fallingItem.getData('points') : 0;

    this.reactData.onObjectResolution({
      success,
      timeTaken,
      accuracy: success ? 100 : 0,
      points,
    });

    if (success) this.reactData.audio.playSuccess();
    else this.reactData.audio.playMiss();

    this.fallingItem.destroy();
    this.fallingItem = null;
    this.activeObjectCount = 0;
    this.updateObjectCounter();

    this.reactData.dispatch({ type: success ? 'RESOLVE_SUCCESS' : 'RESOLVE_TIMEOUT', points });

    this.time.delayedCall(this.config.restInterval, () => {
      if (this.gameState?.status !== GAME_STATES.COMPLETED) {
        this.reactData.dispatch({ type: 'NEXT_OBJECT' });
      }
    });
  }

  update(time, delta) {
    this.fpsText.setText(`FPS: ${Math.round(this.game.loop.actualFps)}`);

    // NOTE: switched from MediaPipe Hands (fingertip/gesture landmarks) to
    // MediaPipe Pose (body keypoints, wrist only). Pose tracking has no
    // per-finger data, so the "close your hand into a fist" catch gate is
    // gone — catching is now purely proximity-based (wrist within
    // catchRadius of the falling item), same mechanic CloudReach already
    // uses for popping clouds.
    const keypoints = this.reactData.landmarksRef.current;
    if (keypoints) {
      const wrist = keypoints.rightWrist?.visible ? keypoints.rightWrist
        : (keypoints.leftWrist?.visible ? keypoints.leftWrist : null);
      if (wrist) {
        const { width, height } = this.cameras.main;
        const wristPos = { x: wrist.x, y: wrist.y };
        if (!this.emaWrist) {
          this.emaWrist = wristPos;
        } else {
          this.emaWrist.x = this.emaWrist.x + EMA_ALPHA * (wristPos.x - this.emaWrist.x);
          this.emaWrist.y = this.emaWrist.y + EMA_ALPHA * (wristPos.y - this.emaWrist.y);
        }
      }
    }

    if (this.fallingItem) {
      // CONSTRAINT 7 / BUG-FIX: fall speed comes purely from GAME_CONFIG
      // (merged with therapistConfig), scaled by delta so it's frame-rate
      // independent rather than a fixed per-frame pixel step.
      this.fallingItem.y += this.config.fallSpeed * (delta / 16.6667);

      // Natural miss condition: item exits the bottom of the play area.
      if (this.fallingItem.y > this.cameras.main.height + this.config.itemSize) {
        this.resolveItem(false);
      }
    }

    this.draw();

    // SUCCESS CONDITION: wrist intercepts the item's position before it
    // exits the bottom.
    if (this.fallingItem && this.emaWrist) {
      const dist = Phaser.Math.Distance.Between(this.emaWrist.x, this.emaWrist.y, this.fallingItem.x, this.fallingItem.y);
      if (dist < this.config.catchRadius) {
        this.resolveItem(true);
      }
    }
  }

  draw() {
    this.graphics.clear();

    if (this.emaWrist) {
      this.graphics.lineStyle(4, 0xfbbf24, 0.9);
      this.graphics.strokeCircle(this.emaWrist.x, this.emaWrist.y, this.config.catchRadius);
      this.graphics.fillStyle(0xfbbf24, 0.9);
      this.graphics.fillCircle(this.emaWrist.x, this.emaWrist.y, 10);
    }
  }

  cleanup() {
    if (this.fallingItem) {
      this.fallingItem.destroy();
      this.fallingItem = null;
      this.activeObjectCount = 0;
    }
  }
}

/**
 * therapistConfig (optional): lets a therapist override the per-patient
 * session shape without touching GAME_CONFIG's beginner/intermediate/
 * advanced baselines. All fields optional — anything omitted falls back to
 * the difficulty tier's default.
 *   sessionLength: number (seconds) — overall session time cap
 *   restInterval: number (ms) — pause between items
 *   catchRadius: number (px) — hand-catch tolerance ("movement angle"
 *     equivalent for this game — a tighter radius demands more precise
 *     positioning, a looser one is more forgiving for limited mobility)
 *   maxReps: number | null — if set, session also ends after this many
 *     resolved items (success or miss), independent of the time cap
 */
export default function CatchFlex({ onSessionEnd, patientId, gameId = 'catch-flex', therapistConfig = {}, qaAdapterRef } = {}) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const landmarksRef = useRef(null); // { gesture, landmarks }
  const audio = useAudioFeedback();
  const { startSession, saveRep, finishSession } = useSessionTelemetry({ gameId, gameName: 'Catch & Flex' });

  // FIX (stale closure): the previous version read `state.reps` inside
  // handleObjectResolution and used `state.reps + 1` as repNumber. But
  // handleObjectResolution is handed to Phaser exactly once, inside the
  // mount effect below (`[]` deps) — so Phaser always held the FIRST
  // render's closure, where state.reps was permanently 0. Every rep this
  // game ever saved was recorded as repNumber 1. A ref-based counter,
  // incremented at the moment of resolution, isn't subject to that.
  const repCounterRef = useRef(0);
  const sessionStartRef = useRef(null);

  const effectiveConfig = { ...GAME_CONFIG[state.difficulty], ...therapistConfig };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [therapistSettings, setTherapistSettings] = useState({
    sessionLength: null,
    restInterval: null,
    catchRadius: null,
    maxReps: null,
  });

  // Merge therapistSettings into effectiveConfig when provided
  Object.assign(effectiveConfig, {
    ...(therapistSettings.sessionLength != null ? { sessionLength: therapistSettings.sessionLength } : {}),
    ...(therapistSettings.restInterval != null ? { restInterval: therapistSettings.restInterval } : {}),
    ...(therapistSettings.catchRadius != null ? { catchRadius: therapistSettings.catchRadius } : {}),
    ...(therapistSettings.maxReps != null ? { maxReps: therapistSettings.maxReps } : {}),
  });

  // FIX: was `state.status !== IDLE && !== COMPLETED && !== PAUSED` — i.e.
  // disabled during IDLE, which is exactly the screen the "view
  // instructions" / "begin session" flow lives on. useMediaPipePose's
  // isLoading starts `true` and only updates once its setup effect
  // actually runs, which requires `enabled` to already be true. That's a
  // deadlock: the button in InstructionsGate stays disabled until
  // poseLoading resolves, but poseLoading can never resolve while still on
  // the IDLE screen the button lives on. Enabling from mount all the way
  // through until COMPLETED lets the model/camera load in the background
  // while the patient is on the IDLE screen, so it's normally ready by the
  // time they tap through to Begin Session.
  const mpEnabled = state.status !== GAME_STATES.COMPLETED;

  const { videoRef, isLoading: poseLoading } = useMediaPipePose({
    enabled: mpEnabled,
    silent: true, // no React re-renders on pose-tracking updates
    onPoseUpdate: (keypoints) => {
      landmarksRef.current = keypoints;
    },
  });

  useEffect(() => {
    if (!import.meta.env.DEV || !qaAdapterRef) return;
    qaAdapterRef.current = {
      startSession: () => handleStart(),
      spawnItem: () => { if (gameRef.current?.scene?.keys['CatchFlexScene']) gameRef.current.scene.keys['CatchFlexScene'].spawnItem(); },
      injectLandmarks: (payload) => { landmarksRef.current = payload; },
      simulateSuccess: () => { if (gameRef.current?.scene?.keys['CatchFlexScene']) gameRef.current.scene.keys['CatchFlexScene'].resolveItem(true); },
      simulateFailure: () => { if (gameRef.current?.scene?.keys['CatchFlexScene']) gameRef.current.scene.keys['CatchFlexScene'].resolveItem(false); },
      getState: () => ({ state, scene: gameRef.current ? gameRef.current.scene.keys['CatchFlexScene'] : null }),
      restartSession: () => dispatch({ type: 'RESET' }),
      cleanup: () => { if (gameRef.current) { try { gameRef.current.destroy(true); } catch (_) {} } },
    };
    return () => { if (qaAdapterRef) qaAdapterRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qaAdapterRef, state]);

  const handleObjectResolution = useCallback(async (telemetry) => {
    repCounterRef.current += 1;
    await saveRep({
      exerciseId: gameId,
      exerciseName: 'Catch & Flex',
      repNumber: repCounterRef.current,
      rom: 0, // this game tracks catch precision, not joint ROM
      confidence: telemetry.accuracy / 100,
      isCorrect: telemetry.success,
    });
  }, [saveRep, gameId]);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    const initPhaser = () => {
      const width = containerRef.current ? containerRef.current.clientWidth : 640;
      const height = containerRef.current ? containerRef.current.clientHeight : 480;
      if (width === 0) { setTimeout(initPhaser, 100); return; }
      const config = {
        type: Phaser.AUTO, parent: containerRef.current, width, height, transparent: true,
        scene: CatchFlexScene, physics: { default: 'arcade' }, fps: { target: 60, forceSetTimeOut: true },
      };
      const game = new Phaser.Game(config);
      gameRef.current = game;
      game.scene.start('CatchFlexScene', {
        dispatch, landmarksRef, audio, onObjectResolution: handleObjectResolution,
        effectiveConfig,
      });
    };
    initPhaser();
    return () => { if (gameRef.current) { gameRef.current.destroy(true); gameRef.current = null; } };
    // Intentionally mount-only: effectiveConfig/difficulty are locked in at
    // START_SESSION time (see handleStart), same as the other games —
    // changing difficulty mid-session isn't a supported flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (gameRef.current) gameRef.current.events.emit('state-update', state);
  }, [state]);

  useEffect(() => {
    if (state.status === GAME_STATES.AWAITING_MOVEMENT || state.status === GAME_STATES.INSTRUCTION) {
      const timer = setInterval(() => dispatch({ type: 'TICK' }), 1000);
      return () => clearInterval(timer);
    }
  }, [state.status]);

  // Rep-cap enforcement: therapistConfig.maxReps ends the session early,
  // independent of the time cap, once that many items have been resolved.
  useEffect(() => {
    const cap = effectiveConfig.maxReps;
    if (cap && state.reps >= cap && state.status !== GAME_STATES.COMPLETED) {
      dispatch({ type: 'REP_CAP_REACHED' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.reps]);

  useEffect(() => {
    if (state.status === GAME_STATES.COMPLETED) {
      const accuracy = state.reps > 0 ? Math.round((state.successes / state.reps) * 100) : 0;
      const durationSeconds = sessionStartRef.current
        ? Math.round((Date.now() - sessionStartRef.current) / 1000)
        : effectiveConfig.sessionLength - state.timeRemaining;
      const stars = accuracy >= 85 ? 3 : accuracy >= 60 ? 2 : accuracy > 0 ? 1 : 0;

      // Rebuilt to match the backend Session schema (sessionController.js
      // completeSession/finishPublicSession) — the original sent
      // {score, accuracy, reps, successes, misses, maxCombo}, none of which
      // besides score/accuracy/maxCombo are real schema fields, so
      // durationSeconds/missedActions/exerciseResults were silently dropped.
      const summary = {
        score: state.score,
        level: DIFFICULTY_LEVEL_NUMBER[state.difficulty] || 1,
        accuracy,
        combo: state.combo,
        maxCombo: state.maxCombo,
        stars,
        exerciseResults: [{
          exerciseId: gameId,
          name: 'Catch & Flex',
          setsCompleted: 1,
          repsCompleted: state.reps,
          averageRom: 0,
          maxRom: 0,
          accuracy,
          score: state.score,
        }],
        durationSeconds,
        notes: '',
        gameType: gameId,
        missedActions: state.misses,
      };
      finishSession(summary);
      onSessionEnd?.(summary);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  const handleStart = () => {
    repCounterRef.current = 0;
    sessionStartRef.current = Date.now();
    dispatch({ type: 'START_SESSION', sessionLength: effectiveConfig.sessionLength });
    audio.playGameStart();
    startSession(patientId);
  };

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden font-sans">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} autoPlay muted playsInline />
      <div ref={containerRef} className="absolute inset-0 w-full h-full z-10" />

      <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none z-20">
        <div className="flex gap-4">
          <StatCard label="Score" value={state.score} color="text-amber-400" />
          <StatCard label="Catches" value={`${state.successes}`} color="text-teal-400" />
          {state.combo > 2 && <StatCard label="Combo" value={`x${state.combo}`} color="text-orange-400" />}
        </div>
        <div className="bg-black/80 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/10 text-center min-w-[120px]">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Time Remaining</div>
          <div className={`text-3xl font-black ${state.timeRemaining <= 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
            {state.timeRemaining}s
          </div>
        </div>
      </div>

      {state.status === GAME_STATES.IDLE && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-slate-950/90 backdrop-blur-xl p-8 text-center">
          <div className="text-6xl mb-6">🧺</div>
          <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Catch & Flex</h1>
          <p className="text-slate-400 mb-10 max-w-sm">
            Catch falling objects by moving your hand to meet them as they reach you — improves reaction time and coordination.
          </p>
          <div className="grid grid-cols-3 gap-3 mb-10 w-full max-w-sm">
            {['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((d) => (
              <button key={d} onClick={() => dispatch({ type: 'SET_DIFFICULTY', difficulty: d })}
                className={`py-3 rounded-xl text-xs font-black tracking-widest transition-all border ${
                  state.difficulty === d ? 'bg-teal-600 border-teal-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}
              > {d} </button>
            ))}
          </div>
            <div className="max-w-md mb-6 w-full">
              <button onClick={() => setSettingsOpen((s) => !s)} className="w-full py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm font-bold text-slate-300 mb-4">
                Therapist Settings {settingsOpen ? '▲ Hide' : '▼ Show'}
              </button>
              {settingsOpen && (
                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-4 text-left">
                  <SettingSlider label="Repetitions (max)" value={therapistSettings.maxReps ?? ''} min={0} max={50} step={1} onChange={(v) => setTherapistSettings(s => ({ ...s, maxReps: v }))} display={`${therapistSettings.maxReps ?? 'auto'}`} />
                  <SettingSlider label="Catch radius" value={therapistSettings.catchRadius ?? effectiveConfig.catchRadius} min={30} max={200} step={5} onChange={(v) => setTherapistSettings(s => ({ ...s, catchRadius: v }))} display={`${therapistSettings.catchRadius ?? effectiveConfig.catchRadius}px`} />
                  <SettingSlider label="Session length" value={therapistSettings.sessionLength ?? effectiveConfig.sessionLength} min={30} max={600} step={30} onChange={(v) => setTherapistSettings(s => ({ ...s, sessionLength: v }))} display={`${Math.round((therapistSettings.sessionLength ?? effectiveConfig.sessionLength) / 60)} min`} />
                  <SettingSlider label="Rest interval" value={therapistSettings.restInterval ?? effectiveConfig.restInterval} min={100} max={2000} step={50} onChange={(v) => setTherapistSettings(s => ({ ...s, restInterval: v }))} display={`${therapistSettings.restInterval ?? effectiveConfig.restInterval} ms`} />
                </div>
              )}
            </div>

            <InstructionsGate
              poseLoading={poseLoading}
              onBegin={handleStart}
            />
        </div>
      )}

      {state.status === GAME_STATES.COMPLETED && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-slate-950/95 backdrop-blur-2xl p-8 text-center text-white">
          <div className="text-6xl mb-6">🏆</div>
          <h2 className="text-4xl font-black mb-2">Session Complete!</h2>
          <div className="grid grid-cols-2 gap-4 w-full max-w-sm my-10">
            <ResultCard label="Score" value={state.score} />
            <ResultCard label="Catches" value={state.successes} />
            <ResultCard label="Accuracy" value={`${state.reps > 0 ? Math.round((state.successes / state.reps) * 100) : 0}%`} />
            <ResultCard label="Max Combo" value={state.maxCombo} />
          </div>
          <button onClick={() => dispatch({ type: 'RESET' })} className="px-12 py-4 bg-teal-600 text-white rounded-2xl font-black text-lg"> TRY AGAIN </button>
        </div>
      )}
    </div>
  );
}

// Session-level patient instructions — the 5 required fields (starting
// posture, arm position, movement, success condition, therapy benefit) —
// shown once before Phaser initializes, matching the treatment given to
// RehabSlicer and CloudReach. Separated into its own component only to
// keep the IDLE-state JSX above readable.
function InstructionsGate({ poseLoading, onBegin }) {
  const [open, setOpen] = React.useState(false); // eslint-disable-line react-hooks/rules-of-hooks
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={poseLoading}
        className="w-full max-w-xs py-5 bg-white rounded-[2rem] font-black text-slate-950 text-xl shadow-2xl active:scale-95 disabled:opacity-50"
      >
        {poseLoading ? "LOADING AI..." : "VIEW INSTRUCTIONS"}
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-6">
      <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 text-left">
        <h3 className="text-xl font-black text-white mb-4 text-center">Patient Instructions</h3>
        <div className="space-y-3 text-sm text-slate-300">
          <p><strong className="text-teal-400">Starting Posture:</strong> Sit or stand comfortably, back straight, hold the virtual basket centered in front of you.</p>
          <p><strong className="text-teal-400">Arm Position:</strong> Elbow bent, forearm roughly level — relaxed, not locked out.</p>
          <p><strong className="text-teal-400">Movement Required:</strong> Move your arm in a controlled way to bring the basket under each falling object.</p>
          <p><strong className="text-teal-400">Success Condition:</strong> Move your hand to meet the object as it reaches the basket to catch it.</p>
          <p><strong className="text-teal-400">Therapy Benefit:</strong> Elbow flexion, shoulder abduction, coordination, and motor planning.</p>
        </div>
        <button
          onClick={onBegin}
          className="mt-6 w-full py-4 bg-teal-600 hover:bg-teal-500 rounded-xl font-black text-white text-lg transition"
        >
          BEGIN SESSION
        </button>
      </div>
    </div>
  );
}

const StatCard = ({ label, value, color }) => (
  <div className="bg-black/80 backdrop-blur-md rounded-2xl px-5 py-4 border border-white/10 min-w-[120px]">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{label}</div>
    <div className={`text-3xl font-black ${color}`}>{value}</div>
  </div>
);

const ResultCard = ({ label, value }) => (
  <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{label}</div>
    <div className="text-2xl font-black text-white">{value}</div>
  </div>
);

function SettingSlider({ label, value, min, max, step, onChange, display }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-bold text-slate-400 mb-2"><span>{label}</span><span className="text-slate-200">{display}</span></div>
      <input type="range" min={min} max={max} step={step} value={value || ''} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-current" />
    </div>
  );
}