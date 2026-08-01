import React, { useReducer, useRef, useEffect, useCallback, useState } from 'react';
import Phaser from 'phaser';
import { useMediaPipePose } from '../hooks/usePoseDetection';
import { useAudioFeedback } from '../hooks/useAudioFeedback.js';
import { useSessionTelemetry } from '../hooks/useSessionTelemetry';

/**
 * 5. CONFIG-DRIVEN DIFFICULTY (Constraint 5)
 */
const GAME_CONFIG = {
  BEGINNER: {
    cloudRadius: 80,
    timeout: 10000,
    holdDuration: 400,
    heightRange: [0.3, 0.6],
    speed: 1,
    points: 10,
    restInterval: 500,
    instructionDuration: 1200,
  },
  INTERMEDIATE: {
    cloudRadius: 55,
    timeout: 7000,
    holdDuration: 800,
    heightRange: [0.4, 0.8],
    speed: 1.5,
    points: 20,
    restInterval: 400,
    instructionDuration: 1000,
  },
  ADVANCED: {
    cloudRadius: 40,
    timeout: 5000,
    holdDuration: 1200,
    heightRange: [0.5, 0.95],
    speed: 2.5,
    points: 35,
    restInterval: 300,
    instructionDuration: 800,
  },
};
// NOTE: removed the unused `spawnInterval` key that was left in each
// difficulty tier from the earlier setInterval-based multi-cloud design.
// Spawning is now purely resolve -> restInterval -> instructionDuration
// driven (single-object invariant), so a spawn interval has no effect.

const GAME_STATES = {
  IDLE: 'IDLE',
  INSTRUCTION: 'INSTRUCTION',
  AWAITING_MOVEMENT: 'AWAITING_MOVEMENT',
  HOLD_VALIDATE: 'HOLD_VALIDATE',
  SUCCESS: 'SUCCESS',
  TIMEOUT: 'TIMEOUT',
  NEXT: 'NEXT',
  COMPLETED: 'COMPLETED',
};

const initialState = {
  status: GAME_STATES.IDLE,
  score: 0,
  reps: 0,
  successes: 0,
  misses: 0,
  maxReach: 0,
  timeRemaining: 60,
  difficulty: 'BEGINNER',
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'START_SESSION':
      return { ...state, status: GAME_STATES.INSTRUCTION, timeRemaining: 60 };
    case 'SHOW_OBJECT':
      return { ...state, status: GAME_STATES.AWAITING_MOVEMENT };
    case 'RESOLVE_SUCCESS':
      return {
        ...state,
        status: GAME_STATES.SUCCESS,
        score: state.score + action.points,
        reps: state.reps + 1,
        successes: state.successes + 1,
      };
    case 'RESOLVE_TIMEOUT':
      return {
        ...state,
        status: GAME_STATES.TIMEOUT,
        reps: state.reps + 1,
        misses: state.misses + 1,
      };
    case 'NEXT_OBJECT':
      return { ...state, status: GAME_STATES.INSTRUCTION };
    case 'TICK':
      if (state.timeRemaining <= 0) return { ...state, status: GAME_STATES.COMPLETED };
      return { ...state, timeRemaining: state.timeRemaining - 1 };
    case 'UPDATE_MAX_REACH':
      return { ...state, maxReach: Math.max(state.maxReach, action.reach) };
    case 'SET_DIFFICULTY':
      return { ...state, difficulty: action.difficulty };
    case 'RESET':
      return { ...initialState, difficulty: state.difficulty };
    default:
      return state;
  }
}

const EMA_ALPHA = 0.4;

class CloudReachScene extends Phaser.Scene {
  constructor() {
    super('CloudReachScene');
    this.cloudObject = null;
    this.activeObjectCount = 0;
    this.emaWrist = null;
    this.emaShoulder = null;
  }

  init(data) {
    this.reactData = data;
    this.config = GAME_CONFIG[data.difficulty || 'BEGINNER'];
    console.log('[Phaser] Scene initialized with difficulty:', data.difficulty);
  }

  create() {
    this.graphics = this.add.graphics();

    const { width, height } = this.cameras.main;
    this.fpsText = this.add.text(width - 150, height - 60, 'FPS: 60', {
      fontSize: '14px',
      fill: '#00ff00',
      backgroundColor: '#000000aa',
      padding: { x: 6, y: 4 },
    }).setDepth(1000);

    this.objectCounter = this.add.text(width - 150, height - 30, 'Active Objects: 0', {
      fontSize: '14px',
      fill: '#ffffff',
      backgroundColor: '#000000aa',
      padding: { x: 6, y: 4 },
    }).setDepth(1000);

    this.instructionOverlay = this.add.container(width / 2, height / 2).setDepth(2000).setVisible(false);
    const bg = this.add.rectangle(0, 0, 400, 100, 0x1e293b, 0.95).setOrigin(0.5);
    const text = this.add.text(0, 0, 'REACH FOR THE CLOUD!', {
      fontSize: '24px',
      fill: '#38bdf8',
      fontStyle: 'bold',
      fontFamily: 'Inter, sans-serif',
    }).setOrigin(0.5);
    this.instructionOverlay.add([bg, text]);

    this.events.on('state-update', (state) => {
      this.gameState = state;
      this.handleStateTransition(state);
    });

    console.log('[Phaser] Scene created. Canvas size:', width, 'x', height);
  }

  handleStateTransition(state) {
    if (state.status === GAME_STATES.INSTRUCTION) {
      this.showInstruction();
    } else if (state.status === GAME_STATES.AWAITING_MOVEMENT) {
      if (!this.cloudObject) {
        console.log('[FSM] Status is AWAITING_MOVEMENT. Spawning cloud...');
        this.spawnCloud();
      }
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
  spawnCloud() {
    if (this.cloudObject) {
      console.assert(this.activeObjectCount === 0, '[CloudReach] Invariant Violation: spawnCloud called with an existing object.');
      console.warn('[Phaser] spawnCloud called but object already exists. Destroying old one.');
      this.cloudObject.destroy();
      this.cloudObject = null;
      this.activeObjectCount = 0;
    }

    const { width, height } = this.cameras.main;
    const { cloudRadius, heightRange } = this.config;

    const x = Phaser.Math.Between(150, width - 150);
    const y = height * Phaser.Math.FloatBetween(heightRange[0], heightRange[1]);

    this.cloudObject = this.add.container(x, y).setDepth(500);

    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(0, 0, cloudRadius);
    g.fillCircle(-cloudRadius * 0.6, 0, cloudRadius * 0.7);
    g.fillCircle(cloudRadius * 0.6, 0, cloudRadius * 0.7);
    g.fillCircle(0, -cloudRadius * 0.5, cloudRadius * 0.8);
    g.lineStyle(4, 0x3b82f6, 1);
    g.strokeCircle(0, 0, cloudRadius);

    const label = this.add.text(0, 0, '☁️', { fontSize: `${cloudRadius}px` }).setOrigin(0.5);

    this.cloudObject.add([g, label]);
    this.cloudObject.setData('radius', cloudRadius);
    this.cloudObject.setData('startTime', this.time.now);

    this.activeObjectCount = 1;
    this.updateObjectCounter();

    console.log(`[Phaser] Cloud spawned at (${Math.round(x)}, ${Math.round(y)}) with radius ${cloudRadius}.`);

    this.cloudTimer = this.time.delayedCall(this.config.timeout, () => {
      if (this.cloudObject) {
        console.log('[Phaser] Cloud timed out.');
        this.resolveCloud(false);
      }
    });
  }

  updateObjectCounter() {
    this.objectCounter.setText(`Active Objects: ${this.activeObjectCount}`);
    this.objectCounter.setColor(this.activeObjectCount > 1 ? '#ef4444' : '#ffffff');
  }

  resolveCloud(success) {
    if (!this.cloudObject) return;

    const startTime = this.cloudObject.getData('startTime');
    const timeTaken = this.time.now - startTime;
    const y = this.cloudObject.y;

    let currentROM = 0;
    if (this.emaWrist && this.emaShoulder) {
      currentROM = Math.max(0, this.emaShoulder.y - this.emaWrist.y);
    } else {
      currentROM = Math.round(this.cameras.main.height - y);
    }

    this.reactData.onObjectResolution({
      success,
      timeTaken,
      accuracy: success ? 100 : 0,
      rom: currentROM,
      points: success ? this.config.points : 0,
    });

    if (success) {
      this.reactData.audio.playSuccess();
    } else {
      this.reactData.audio.playMiss();
    }

    this.cloudObject.destroy();
    this.cloudObject = null;
    this.activeObjectCount = 0;
    this.updateObjectCounter();
    if (this.cloudTimer) this.cloudTimer.remove();

    this.reactData.dispatch({
      type: success ? 'RESOLVE_SUCCESS' : 'RESOLVE_TIMEOUT',
      points: success ? this.config.points : 0,
    });

    this.reactData.dispatch({ type: 'UPDATE_MAX_REACH', reach: currentROM });

    this.time.delayedCall(this.config.restInterval, () => {
      if (this.gameState?.status !== GAME_STATES.COMPLETED) {
        this.reactData.dispatch({ type: 'NEXT_OBJECT' });
      }
    });
  }

  update(time, delta) {
    this.fpsText.setText(`FPS: ${Math.round(this.game.loop.actualFps)}`);

    const landmarks = this.reactData.landmarksRef.current;
    if (landmarks) {
      const wrist = landmarks.leftWrist?.visible ? landmarks.leftWrist :
        (landmarks.rightWrist?.visible ? landmarks.rightWrist : null);
      const shoulder = landmarks.leftShoulder?.visible ? landmarks.leftShoulder :
        (landmarks.rightShoulder?.visible ? landmarks.rightShoulder : null);

      if (wrist && wrist.visible) {
        if (!this.emaWrist) {
          this.emaWrist = { x: wrist.x, y: wrist.y };
        } else {
          this.emaWrist.x = this.emaWrist.x + EMA_ALPHA * (wrist.x - this.emaWrist.x);
          this.emaWrist.y = this.emaWrist.y + EMA_ALPHA * (wrist.y - this.emaWrist.y);
        }
      }
      if (shoulder && shoulder.visible) {
        if (!this.emaShoulder) {
          this.emaShoulder = { x: shoulder.x, y: shoulder.y };
        } else {
          this.emaShoulder.x = this.emaShoulder.x + EMA_ALPHA * (shoulder.x - this.emaShoulder.x);
          this.emaShoulder.y = this.emaShoulder.y + EMA_ALPHA * (shoulder.y - this.emaShoulder.y);
        }
      }
    }

    this.draw();

    if (this.gameState?.status === GAME_STATES.AWAITING_MOVEMENT && this.cloudObject && this.emaWrist) {
      const radius = this.cloudObject.getData('radius');
      const dist = Phaser.Math.Distance.Between(this.emaWrist.x, this.emaWrist.y, this.cloudObject.x, this.cloudObject.y);
      if (dist < radius + 30) {
        console.log('[Phaser] Cloud popped by user!');
        this.resolveCloud(true);
      }
    }
  }

  draw() {
    this.graphics.clear();

    if (this.emaWrist) {
      this.graphics.fillStyle(0xfbbf24, 0.9);
      this.graphics.fillCircle(this.emaWrist.x, this.emaWrist.y, 12);
      this.graphics.lineStyle(3, 0xffffff, 0.6);
      this.graphics.strokeCircle(this.emaWrist.x, this.emaWrist.y, 20);

      if (this.emaShoulder) {
        this.graphics.lineStyle(3, 0xfbbf24, 0.3);
        this.graphics.beginPath();
        this.graphics.moveTo(this.emaShoulder.x, this.emaShoulder.y);
        this.graphics.lineTo(this.emaWrist.x, this.emaWrist.y);
        this.graphics.strokePath();
      }
    }

    if (this.cloudObject) {
      const radius = this.cloudObject.getData('radius');
      const startTime = this.cloudObject.getData('startTime');
      const elapsed = this.time.now - startTime;
      const timeRemainingPct = Math.max(0, 1 - (elapsed / this.config.timeout));

      this.graphics.lineStyle(6, 0x3b82f6, 1);
      this.graphics.beginPath();
      this.graphics.arc(this.cloudObject.x, this.cloudObject.y, radius + 12, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * timeRemainingPct));
      this.graphics.strokePath();
    }
  }

  cleanup() {
    if (this.cloudObject) {
      this.cloudObject.destroy();
      this.cloudObject = null;
      this.activeObjectCount = 0;
    }
    if (this.cloudTimer) this.cloudTimer.remove();
  }
}

export default function CloudReach({ onSessionEnd, patientId, gameId = 'cloud-reach', qaAdapterRef } = {}) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const landmarksRef = useRef(null);
  const audio = useAudioFeedback();
  const { startSession, saveRep, finishSession } = useSessionTelemetry({ gameId, gameName: 'Cloud Reach' });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [therapistSettings, setTherapistSettings] = useState({
    sessionLength: null,
    restInterval: null,
    cloudRadius: null,
    maxReps: null,
  });

  // FIX: was `state.status !== IDLE && !== COMPLETED && !== PAUSED` — i.e.
  // disabled during IDLE, which is exactly the screen showing the "start"
  // button. useMediaPipePose's isLoading starts `true` and only updates
  // once its setup effect actually runs, which requires `enabled` to
  // already be true. That's a deadlock: the Start button stays disabled
  // until poseLoading resolves, but poseLoading can never resolve while
  // still on the IDLE screen the button lives on. Enabling from mount
  // (i.e. as soon as this component exists, all the way through until the
  // session is COMPLETED) lets the model/camera load in the background
  // while the patient reads the IDLE screen, so it's normally ready by
  // the time they tap Start.
  const mpEnabled = state.status !== GAME_STATES.COMPLETED;

  const { videoRef, isLoading: poseLoading } = useMediaPipePose({
    enabled: mpEnabled,
    silent: true, // BUG A FIX: no React re-renders on pose updates
    onPoseUpdate: (kp) => {
      landmarksRef.current = kp;
    },
  });

  useEffect(() => {
    if (!import.meta.env.DEV || !qaAdapterRef) return;
    qaAdapterRef.current = {
      startSession: () => dispatch({ type: 'START_SESSION' }),
      pauseSession: () => dispatch({ type: 'PAUSE' }),
      resumeSession: () => dispatch({ type: 'SHOW_OBJECT' }),
      endSession: () => dispatch({ type: 'NEXT_OBJECT' }),
      restartSession: () => dispatch({ type: 'RESET' }),
      spawnCloud: () => { if (gameRef.current?.scene?.keys['CloudReachScene']) gameRef.current.scene.keys['CloudReachScene'].spawnCloud(); },
      popCloud: () => { if (gameRef.current?.scene?.keys['CloudReachScene']) gameRef.current.scene.keys['CloudReachScene'].resolveCloud(true); },
      injectLandmarks: (pose) => { landmarksRef.current = pose; },
      getState: () => ({ state, scene: gameRef.current ? gameRef.current.scene.keys['CloudReachScene']?.cloudObject : null }),
      simulateSuccess: () => { if (gameRef.current?.scene?.keys['CloudReachScene']) gameRef.current.scene.keys['CloudReachScene'].resolveCloud(true); },
      simulateFailure: () => { if (gameRef.current?.scene?.keys['CloudReachScene']) gameRef.current.scene.keys['CloudReachScene'].resolveCloud(false); },
      cleanup: () => { if (gameRef.current) { try { gameRef.current.destroy(true); } catch (_) {} } },
    };
    return () => { if (qaAdapterRef) qaAdapterRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qaAdapterRef, state]);

  const handleObjectResolution = useCallback(async (telemetry) => {
    // 6. TELEMETRY: emitted immediately per object resolution, not batched.
    await saveRep({
      exerciseId: gameId,
      exerciseName: 'Cloud Reach',
      repNumber: state.reps + 1,
      rom: telemetry.rom,
      confidence: telemetry.accuracy / 100,
      isCorrect: telemetry.success,
    });
  }, [saveRep, gameId, state.reps]);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const initPhaser = () => {
      const width = containerRef.current ? containerRef.current.clientWidth : 640;
      const height = containerRef.current ? containerRef.current.clientHeight : 480;

      if (width === 0 || height === 0) {
        console.warn('[Phaser] Container size is 0, retrying...');
        setTimeout(initPhaser, 100);
        return;
      }

      const config = {
        type: Phaser.AUTO,
        parent: containerRef.current,
        width,
        height,
        transparent: true,
        scene: CloudReachScene,
        physics: { default: 'arcade' },
        fps: { target: 60, forceSetTimeOut: true },
      };

      const game = new Phaser.Game(config);
      gameRef.current = game;

      game.scene.start('CloudReachScene', {
        dispatch,
        landmarksRef,
        audio,
        onObjectResolution: handleObjectResolution,
        difficulty: state.difficulty,
      });

      console.log('[Phaser] Game initialized with size:', width, 'x', height);
    };

    initPhaser();

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.events.emit('state-update', state);
    }
  }, [state]);

  useEffect(() => {
    if (state.status === GAME_STATES.AWAITING_MOVEMENT || state.status === GAME_STATES.INSTRUCTION) {
      const timer = setInterval(() => dispatch({ type: 'TICK' }), 1000);
      return () => clearInterval(timer);
    }
  }, [state.status]);

  useEffect(() => {
    if (state.status === GAME_STATES.COMPLETED) {
      const summary = {
        score: state.score,
        accuracy: state.reps > 0 ? Math.round((state.successes / state.reps) * 100) : 0,
        reps: state.reps,
        successes: state.successes,
        misses: state.misses,
        maxReach: state.maxReach,
      };
      finishSession(summary);
      onSessionEnd?.(summary);
    }
  }, [state.status, onSessionEnd, finishSession, state.score, state.reps, state.successes, state.misses, state.maxReach]);

  const handleStart = () => {
    console.debug('[CloudReach] handleStart invoked');
    dispatch({ type: 'START_SESSION' });
    audio.playGameStart();
    // Fire-and-forget: don't block the instruction card on the network call.
    startSession(patientId);
  };

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden font-sans">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        autoPlay
        style={{ transform: 'scaleX(-1)' }}
      />

      <div ref={containerRef} className="absolute inset-0 w-full h-full z-10" />

      {/* HUD */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none z-20">
        <div className="flex gap-4">
          <StatCard label="Score" value={state.score} color="text-amber-400" />
          <StatCard label="Progress" value={`${state.successes} reps`} color="text-teal-400" />
        </div>
        <div className="bg-black/80 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/10 text-center min-w-[120px]">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Time Remaining</div>
          <div className={`text-3xl font-black ${state.timeRemaining <= 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
            {state.timeRemaining}s
          </div>
        </div>
      </div>

      {state.status === GAME_STATES.IDLE && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-slate-950/90 backdrop-blur-xl p-8">
          <div className="w-24 h-24 bg-teal-500/20 rounded-full flex items-center justify-center mb-6 border border-teal-500/30">
            <span className="text-5xl">☁️</span>
          </div>
          <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Cloud Reach</h1>
          <p className="text-slate-400 text-center mb-10 max-w-sm leading-relaxed">
            Improve shoulder mobility by reaching for virtual clouds. Focus on smooth, controlled movements.
          </p>

          <div className="grid grid-cols-3 gap-3 mb-10 w-full max-w-sm">
            {['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((d) => (
              <button
                key={d}
                onClick={() => dispatch({ type: 'SET_DIFFICULTY', difficulty: d })}
                className={`py-3 rounded-xl text-xs font-black tracking-widest transition-all border ${
                  state.difficulty === d
                    ? 'bg-teal-600 border-teal-500 text-white shadow-lg shadow-teal-900/40'
                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="max-w-md mb-6 w-full">
            <button onClick={() => setSettingsOpen((s) => !s)} className="w-full py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm font-bold text-slate-300 mb-4">
              Therapist Settings {settingsOpen ? '▲ Hide' : '▼ Show'}
            </button>
            {settingsOpen && (
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-4 text-left">
                <SettingSlider label="Repetitions (max)" value={therapistSettings.maxReps ?? ''} min={0} max={50} step={1} onChange={(v) => setTherapistSettings(s => ({ ...s, maxReps: v }))} display={`${therapistSettings.maxReps ?? 'auto'}`} />
                <SettingSlider label="Cloud radius" value={therapistSettings.cloudRadius ?? GAME_CONFIG[state.difficulty].cloudRadius} min={30} max={160} step={5} onChange={(v) => setTherapistSettings(s => ({ ...s, cloudRadius: v }))} display={`${therapistSettings.cloudRadius ?? GAME_CONFIG[state.difficulty].cloudRadius}px`} />
                <SettingSlider label="Session length" value={therapistSettings.sessionLength ?? GAME_CONFIG[state.difficulty].sessionLength} min={30} max={600} step={30} onChange={(v) => setTherapistSettings(s => ({ ...s, sessionLength: v }))} display={`${Math.round((therapistSettings.sessionLength ?? GAME_CONFIG[state.difficulty].sessionLength) / 60)} min`} />
                <SettingSlider label="Rest interval" value={therapistSettings.restInterval ?? GAME_CONFIG[state.difficulty].restInterval} min={100} max={2000} step={50} onChange={(v) => setTherapistSettings(s => ({ ...s, restInterval: v }))} display={`${therapistSettings.restInterval ?? GAME_CONFIG[state.difficulty].restInterval} ms`} />
              </div>
            )}
          </div>

          <button
            onClick={handleStart}
            disabled={poseLoading}
            className="w-full max-w-xs py-5 bg-white hover:bg-slate-100 rounded-[2rem] font-black text-slate-950 text-xl transition-all shadow-2xl disabled:opacity-50 active:scale-95"
          >
            {poseLoading ? 'INITIALIZING...' : 'START SESSION'}
          </button>
        </div>
      )}

      {state.status === GAME_STATES.COMPLETED && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-slate-950/95 backdrop-blur-2xl p-8 text-center">
          <div className="text-6xl mb-6">🏆</div>
          <h2 className="text-4xl font-black text-white mb-2">Session Finished!</h2>
          <p className="text-slate-500 mb-8">Excellent work on your recovery today.</p>

          <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-10">
            <ResultCard label="Score" value={state.score} />
            <ResultCard label="Accuracy" value={`${state.reps > 0 ? Math.round((state.successes / state.reps) * 100) : 0}%`} />
            <ResultCard label="Reps" value={state.successes} />
            <ResultCard label="Max Reach" value={`${Math.round(state.maxReach)}px`} />
          </div>

          <button
            onClick={() => dispatch({ type: 'RESET' })}
            className="px-12 py-4 bg-teal-600 hover:bg-teal-500 text-white rounded-2xl font-black text-lg transition-all"
          >
            TRY AGAIN
          </button>
        </div>
      )}
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