import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMediaPipePose } from '../hooks/usePoseDetection';
import { useSessionTelemetry } from '../hooks/useSessionTelemetry';

/**
 * PrecisionReach
 * A single target appears; the patient moves their pointer to it and holds
 * still inside it for a set duration to succeed. Only one target at a time.
 */

const DIFFICULTY = {
  BEGINNER: { label: 'Beginner', radius: 70, holdMs: 3000, timeoutMs: 12000, heightRange: [0.55, 0.75] },
  INTERMEDIATE: { label: 'Intermediate', radius: 55, holdMs: 4000, timeoutMs: 9000, heightRange: [0.3, 0.75] },
  ADVANCED: { label: 'Advanced', radius: 42, holdMs: 5000, timeoutMs: 7000, heightRange: [0.12, 0.85] },
};

const DIFFICULTY_LEVEL_NUMBER = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };

const DEFAULT_SETTINGS = {
  reps: 8,
  holdDuration: 3000, // ms, overrides difficulty default when changed
  movementRange: 0.5, // 0..1 horizontal spread from center
  sessionLength: 180,
  restInterval: 800,
};

const PHASES = {
  INSTRUCTIONS: 'instructions',
  INTRO: 'intro',
  AWAITING: 'awaiting',
  HOLDING: 'holding',
  RESOLVED: 'resolved',
  PAUSED: 'paused',
  COMPLETED: 'completed',
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export default function PrecisionReach({ gameName = 'Precision Reach', onSessionEnd, patientId, gameId = 'precision-reach', qaAdapterRef } = {}) {
  const [phase, setPhase] = useState(PHASES.INSTRUCTIONS);
  const [difficultyKey, setDifficultyKey] = useState('BEGINNER');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [target, setTarget] = useState(null); // { x, y, radius }
  const [holdProgress, setHoldProgress] = useState(0); // 0..1
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });
  const [feedback, setFeedback] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(DEFAULT_SETTINGS.sessionLength);

  const [reps, setReps] = useState(0);
  const [successes, setSuccesses] = useState(0);
  const [misses, setMisses] = useState(0);
  const [romTotal, setRomTotal] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);
  const [sessionEndedAt, setSessionEndedAt] = useState(null);

  const areaRef = useRef(null);
  const rafRef = useRef(null);
  const timeoutRef = useRef(null);
  const restTimerRef = useRef(null);
  const holdStartRef = useRef(0);
  const phaseRef = useRef(phase);
  const cursorRef = useRef(cursor);
  const targetRef = useRef(target);
  const prevCursorRef = useRef(null);
  const videoContainerRef = useRef(null);

  // Telemetry: mirrors CanvasAir/CatchFlex/CloudReach — start on click,
  // saveRep per resolved target, finishSession on completion. Previously
  // this game only called onSessionEnd with a locally-shaped summary and
  // never touched the backend Session document at all, so no session was
  // ever created/persisted and SessionReportPage had nothing to refresh
  // against (sessionId always null from GameEngine's perspective).
  const { startSession, saveRep, finishSession } = useSessionTelemetry({ gameId, gameName });
  const repCounterRef = useRef(0);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { targetRef.current = target; }, [target]);

  const diff = DIFFICULTY[difficultyKey];
  const holdMs = settings.holdDuration || diff.holdMs;

  const mpEnabled = ![PHASES.INSTRUCTIONS, PHASES.PAUSED, PHASES.COMPLETED].includes(phase);

  // Wrist tracking: prefer whichever wrist MediaPipe Pose currently reports
  // as visible. Pose keypoints come back in pixel space relative to the
  // video's native resolution (and already mirrored for selfie view), so we
  // normalize by the video's own dimensions rather than the container's —
  // that stays correct even before the container has laid out.
  const getWristPosition = useCallback((keypoints, video) => {
    if (!keypoints) return null;
    const wrist = keypoints.rightWrist?.visible ? keypoints.rightWrist
      : keypoints.leftWrist?.visible ? keypoints.leftWrist
      : null;
    if (!wrist) return null;
    const vw = video?.videoWidth || 640;
    const vh = video?.videoHeight || 480;
    return { x: clamp(wrist.x / vw, 0, 1), y: clamp(wrist.y / vh, 0, 1) };
  }, []);

  const wristDetectedRef = useRef(false);
  const [wristDetected, setWristDetected] = useState(false);
  const videoRefForPose = useRef(null);

  const handlePoseUpdate = useCallback((keypoints) => {
    const pos = getWristPosition(keypoints, videoRefForPose.current);
    const detected = !!pos;
    // Only trigger a re-render on state transitions, not every frame.
    if (detected !== wristDetectedRef.current) {
      wristDetectedRef.current = detected;
      setWristDetected(detected);
    }
    if (!pos) return;
    setCursor({ x: pos.x, y: pos.y });
  }, [getWristPosition]);

  const { videoRef, isLoading: poseLoading, error: poseError } = useMediaPipePose({ enabled: mpEnabled, silent: true, onPoseUpdate: handlePoseUpdate, videoRef: videoRefForPose });

  useEffect(() => {
    if (!import.meta.env.DEV || !qaAdapterRef) return;
    qaAdapterRef.current = {
      startSession: handleStart,
      pauseSession: handlePauseToggle,
      resumeSession: () => setPhase(PHASES.AWAITING),
      endSession: handleEndSession,
      restartSession: handleRestart,
      getState: () => ({ phase, target, holdProgress, reps, successes }),
      // QA injection now speaks the pose-keypoint shape (leftWrist/rightWrist
      // objects with {x, y, visible} in video-pixel space), matching what
      // handlePoseUpdate expects from useMediaPipePose — not raw hand
      // landmark arrays.
      injectPointer: (pt) => handlePoseUpdate({ rightWrist: { x: pt.x, y: pt.y, visible: true } }),
      injectLandmarks: (kp) => handlePoseUpdate(kp),
      simulateSuccess: () => resolveTarget(true),
      simulateFailure: () => resolveTarget(false),
      cleanup: () => { clearTimeout(timeoutRef.current); clearTimeout(restTimerRef.current); cancelAnimationFrame(rafRef.current); },
    };
    return () => { if (qaAdapterRef) qaAdapterRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qaAdapterRef, phase, target, holdProgress, reps, successes]);

  const updatePointer = useCallback((clientX, clientY) => {
    const el = areaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((clientY - rect.top) / rect.height, 0, 1);
    setCursor({ x, y });
  }, []);
  const handleMouseMove = (e) => updatePointer(e.clientX, e.clientY);
  const handleTouchMove = (e) => {
    if (e.touches && e.touches[0]) { updatePointer(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
  };

  const spawnTarget = useCallback(() => {
    console.debug('[PrecisionReach] spawnTarget invoked');
    const spread = settings.movementRange;
    const x = clamp(0.5 + (Math.random() * 2 - 1) * spread * 0.5, 0.15, 0.85);
    const [yMin, yMax] = diff.heightRange;
    const y = yMin + Math.random() * (yMax - yMin);
    setTarget({ x, y, radius: diff.radius });
    setHoldProgress(0);
    setPhase(PHASES.AWAITING);

    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (phaseRef.current === PHASES.AWAITING || phaseRef.current === PHASES.HOLDING) resolveTarget(false);
    }, diff.timeoutMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff, settings.movementRange]);

  const resolveTarget = useCallback((success) => {
    clearTimeout(timeoutRef.current);
    setTarget(null);
    setHoldProgress(0);
    setFeedback(success
      ? { type: 'success', text: 'Held steady — great control!' }
      : { type: 'miss', text: 'Almost there — try again next rep.' });
    if (success) setSuccesses((s) => s + 1); else setMisses((m) => m + 1);
    setPhase(PHASES.RESOLVED);

    // Telemetry: emitted per target resolution, matching the per-rep save
    // pattern used by the other games. Previously PrecisionReach had NO
    // per-rep saveRep calls at all.
    repCounterRef.current += 1;
    saveRep({
      exerciseId: gameId,
      exerciseName: gameName,
      repNumber: repCounterRef.current,
      rom: 0, // hold-and-target game, not a joint-angle exercise
      confidence: success ? 1 : 0,
      isCorrect: success,
    });

    restTimerRef.current = setTimeout(() => {
      setFeedback(null);
      setReps((r) => {
        const next = r + 1;
        if (next >= settings.reps) { finishSessionAndReport(); }
        else { setPhase(PHASES.INTRO); setTimeout(() => spawnTarget(), 600); }
        return next;
      });
    }, settings.restInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.reps, settings.restInterval, spawnTarget, saveRep, gameId, gameName]);

  // main loop: hover/hold detection + ROM tracking
  useEffect(() => {
    const loop = (now) => {
      const ph = phaseRef.current;
      const cur = cursorRef.current;
      const prev = prevCursorRef.current;
      const t = targetRef.current;

      if (prev && (ph === PHASES.AWAITING || ph === PHASES.HOLDING)) {
        const el = areaRef.current;
        const rect = el ? el.getBoundingClientRect() : { width: 1, height: 1 };
        const p0 = { x: prev.x * rect.width, y: prev.y * rect.height };
        const p1 = { x: cur.x * rect.width, y: cur.y * rect.height };
        const d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        if (d > 0) setRomTotal((r) => r + d);
      }

      if (t && (ph === PHASES.AWAITING || ph === PHASES.HOLDING)) {
        const el = areaRef.current;
        const rect = el ? el.getBoundingClientRect() : { width: 1, height: 1 };
        const dist = Math.hypot((cur.x - t.x) * rect.width, (cur.y - t.y) * rect.height);
        const inside = dist < t.radius;

        if (inside && ph === PHASES.AWAITING) {
          holdStartRef.current = now;
          setPhase(PHASES.HOLDING);
        } else if (inside && ph === PHASES.HOLDING) {
          const elapsed = now - holdStartRef.current;
          const pct = clamp(elapsed / holdMs, 0, 1);
          setHoldProgress(pct);
          if (pct >= 1) resolveTarget(true);
        } else if (!inside && ph === PHASES.HOLDING) {
          setPhase(PHASES.AWAITING);
          setHoldProgress(0);
        }
      }

      prevCursorRef.current = cur;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [holdMs, resolveTarget]);

  useEffect(() => {
    if ([PHASES.PAUSED, PHASES.INSTRUCTIONS, PHASES.COMPLETED].includes(phase)) return;
    const t = setInterval(() => {
      setTimeRemaining((s) => { if (s <= 1) { finishSessionAndReport(); return 0; } return s - 1; });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const finishSessionAndReport = useCallback(() => {
    clearTimeout(timeoutRef.current);
    clearTimeout(restTimerRef.current);
    setTarget(null);
    setSessionEndedAt(Date.now());
    setPhase(PHASES.COMPLETED);
  }, []);

  useEffect(() => {
    if (phase !== PHASES.COMPLETED) return;
    const backendSummary = buildBackendSummary();
    finishSession(backendSummary);
    onSessionEnd?.(backendSummary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // On-screen summary (kept for SummaryScreen — descriptive, not schema-bound)
  function buildSummary() {
    const durationSec = sessionStartedAt ? Math.round(((sessionEndedAt || Date.now()) - sessionStartedAt) / 1000) : 0;
    return {
      completionPercentage: settings.reps > 0 ? Math.min(100, Math.round((reps / settings.reps) * 100)) : 100,
      accuracy: reps > 0 ? Math.round((successes / reps) * 100) : 0,
      approxRangeOfMotionPx: Math.round(romTotal),
      durationSeconds: durationSec,
      successfulReps: successes,
      missedReps: misses,
    };
  }

  // Backend-shaped summary — matches the Session schema fields the other
  // games send (score/level/accuracy/combo/maxCombo/stars/exerciseResults/
  // durationSeconds/notes/gameType/missedActions), rather than the
  // free-form {completionPercentage, successfulReps, missedReps, ...}
  // shape buildSummary() returns for on-screen display only.
  function buildBackendSummary() {
    const durationSec = sessionStartedAt ? Math.round(((sessionEndedAt || Date.now()) - sessionStartedAt) / 1000) : 0;
    const accuracy = reps > 0 ? Math.round((successes / reps) * 100) : 0;
    const score = successes * 10;
    const stars = accuracy >= 85 ? 3 : accuracy >= 60 ? 2 : accuracy > 0 ? 1 : 0;
    return {
      score,
      level: DIFFICULTY_LEVEL_NUMBER[difficultyKey] || 1,
      accuracy,
      combo: 0,
      maxCombo: 0,
      stars,
      exerciseResults: [{
        exerciseId: gameId,
        name: gameName,
        setsCompleted: 1,
        repsCompleted: reps,
        averageRom: 0,
        maxRom: Math.round(romTotal),
        accuracy,
        score,
      }],
      durationSeconds: durationSec,
      notes: '',
      gameType: gameId,
      missedActions: misses,
    };
  }

  const handleStart = () => {
    console.debug('[PrecisionReach] handleStart invoked');
    setReps(0); setSuccesses(0); setMisses(0); setRomTotal(0);
    setTimeRemaining(settings.sessionLength);
    setSessionStartedAt(Date.now()); setSessionEndedAt(null);
    setFeedback(null);
    repCounterRef.current = 0;
    setPhase(PHASES.INTRO);
    startSession(patientId);
    setTimeout(() => spawnTarget(), 600);
  };

  const handlePauseToggle = () => setPhase((p) => (p === PHASES.PAUSED ? PHASES.AWAITING : PHASES.PAUSED));
  const handleEndSession = () => finishSessionAndReport();
  const handleRestart = () => setPhase(PHASES.INSTRUCTIONS);

  const isPlaying = [PHASES.INTRO, PHASES.AWAITING, PHASES.HOLDING, PHASES.RESOLVED].includes(phase);

  return (
    <div className="w-full h-full min-h-[640px] bg-slate-950 text-white font-sans flex flex-col">
      {phase === PHASES.INSTRUCTIONS && (
        <InstructionsScreen
          icon="🎯" title="Precision Reach"
          tagline="Reach out to each target and hold your position steadily until it's full."
          fields={[
            ['Starting posture', 'Sit upright in a stable, supported position.'],
            ['Arm position', 'Keep your arm relaxed until a target appears.'],
            ['Movement required', 'Move your pointer or finger to the target and hold still.'],
            ['Success condition', 'Stay inside the target until the ring fills completely.'],
            ['Therapy benefit', 'Improves shoulder flexion, stability, and controlled movement.'],
          ]}
          accent="sky"
          difficultyKey={difficultyKey} setDifficultyKey={setDifficultyKey}
          settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen}
          settings={settings} setSettings={setSettings}
          holdLabel
          onStart={handleStart}
        />
      )}

      {/* Always render video element; it's hidden when not playing to satisfy QA while camera only starts when mpEnabled is true */}
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay style={{ transform: 'scaleX(-1)', display: isPlaying ? 'block' : 'none' }} />
      {isPlaying && (
        <div ref={areaRef} onMouseMove={handleMouseMove} onTouchMove={handleTouchMove} className="relative flex-1 w-full overflow-hidden touch-none select-none">
          <TopHud accent="sky" score={successes} scoreLabel="Holds" time={timeRemaining} reps={reps} repsTarget={settings.reps} />
          <PlayControls onPause={handlePauseToggle} onEnd={handleEndSession} />

          {target && (
            <div className="absolute" style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%`, width: target.radius * 2, height: target.radius * 2, transform: 'translate(-50%, -50%)' }}>
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <circle cx="50" cy="50" r="42" fill="rgba(56,189,248,0.15)" stroke="#38bdf8" strokeWidth="4" />
                <circle
                  cx="50" cy="50" r="42" fill="none" stroke="#22c55e" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${holdProgress * 264} 264`} transform="rotate(-90 50 50)"
                />
                <circle cx="50" cy="50" r="6" fill="#38bdf8" />
              </svg>
            </div>
          )}

          <div className="absolute w-5 h-5 rounded-full bg-amber-400 border-2 border-white/70 pointer-events-none shadow-lg"
            style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%`, transform: 'translate(-50%, -50%)' }} />

          {feedback && <FeedbackBanner feedback={feedback} />}
          {phase === PHASES.INTRO && <CenterPrompt text="Get ready — a target will appear shortly" />}
          {!wristDetected && <WristStatusBanner />}
        </div>
      )}

      {phase === PHASES.PAUSED && <PausedScreen onResume={handlePauseToggle} onEnd={handleEndSession} accent="sky" />}

      {phase === PHASES.COMPLETED && (
        <SummaryScreen
          title="Session Complete" accent="sky"
          metrics={[
            ['Completion', `${buildSummary().completionPercentage}%`],
            ['Accuracy', `${buildSummary().accuracy}%`],
            ['Approx. ROM', `${buildSummary().approxRangeOfMotionPx}px`],
            ['Time taken', `${buildSummary().durationSeconds}s`],
            ['Successful reps', `${successes}`],
            ['Missed reps', `${misses}`],
          ]}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}

/* shared presentational pieces */

function InstructionsScreen({ icon, title, tagline, fields, accent, difficultyKey, setDifficultyKey, settingsOpen, setSettingsOpen, settings, setSettings, onStart, holdLabel }) {
  const accentBtn = { red: 'bg-red-600 border-red-500', teal: 'bg-teal-600 border-teal-500', sky: 'bg-sky-600 border-sky-500', amber: 'bg-amber-600 border-amber-500', violet: 'bg-violet-600 border-violet-500' }[accent];
  const accentText = { red: 'text-red-400', teal: 'text-teal-400', sky: 'text-sky-400', amber: 'text-amber-400', violet: 'text-violet-400' }[accent];
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 overflow-y-auto text-center">
      <div className="text-6xl mb-4">{icon}</div>
      <h1 className="text-4xl font-black mb-2 tracking-tight">{title}</h1>
      <p className="text-slate-400 max-w-md mb-8 leading-relaxed">{tagline}</p>

      <div className="w-full max-w-lg text-left space-y-3 mb-8">
        {fields.map(([label, text]) => (
          <div key={label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className={`text-[11px] font-black uppercase tracking-widest mb-1 ${accentText}`}>{label}</div>
            <div className="text-sm text-slate-300 leading-relaxed">{text}</div>
          </div>
        ))}
      </div>

      <div className="w-full max-w-lg mb-6">
        <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Difficulty</div>
        <div className="grid grid-cols-3 gap-3">
          {['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((d) => (
            <button key={d} onClick={() => setDifficultyKey(d)}
              className={`py-4 rounded-xl text-sm font-black tracking-wide border-2 transition-all ${difficultyKey === d ? `${accentBtn} text-white` : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
              {d.charAt(0) + d.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-lg mb-8">
        <button onClick={() => setSettingsOpen((o) => !o)} className="w-full flex items-center justify-between px-5 py-4 bg-slate-900 border border-slate-800 rounded-xl text-sm font-bold text-slate-300">
          <span>Therapist Settings</span>
          <span className="text-slate-500">{settingsOpen ? '▲ Hide' : '▼ Show'}</span>
        </button>
        {settingsOpen && (
          <div className="mt-3 bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-5 text-left">
            <SettingSlider label={holdLabel ? 'Hold duration' : 'Hold duration'} value={settings.holdDuration} min={1500} max={7000} step={250} onChange={(v) => setSettings((s) => ({ ...s, holdDuration: v }))} display={`${(settings.holdDuration / 1000).toFixed(1)}s`} />
            <SettingSlider label="Repetitions" value={settings.reps} min={3} max={20} step={1} onChange={(v) => setSettings((s) => ({ ...s, reps: v }))} display={`${settings.reps} reps`} />
            <SettingSlider label="Movement range" value={settings.movementRange} min={0.1} max={0.9} step={0.05} onChange={(v) => setSettings((s) => ({ ...s, movementRange: v }))} display={`${Math.round(settings.movementRange * 100)}%`} />
            <SettingSlider label="Session length" value={settings.sessionLength} min={30} max={600} step={30} onChange={(v) => setSettings((s) => ({ ...s, sessionLength: v }))} display={`${Math.round(settings.sessionLength / 60)} min`} />
            <SettingSlider label="Rest interval" value={settings.restInterval} min={300} max={3000} step={100} onChange={(v) => setSettings((s) => ({ ...s, restInterval: v }))} display={`${settings.restInterval}ms`} />
          </div>
        )}
      </div>

      <button onClick={onStart} className={`w-full max-w-xs py-5 ${accentBtn} rounded-[2rem] font-black text-white text-xl shadow-2xl active:scale-95 transition-transform`}>
        START SESSION
      </button>
    </div>
  );
}

function SettingSlider({ label, value, min, max, step, onChange, display }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-bold text-slate-400 mb-2"><span>{label}</span><span className="text-slate-200">{display}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-current" />
    </div>
  );
}

function TopHud({ accent, score, scoreLabel, time, reps, repsTarget }) {
  const accentText = { red: 'text-red-400', teal: 'text-teal-400', sky: 'text-sky-400', amber: 'text-amber-400', violet: 'text-violet-400' }[accent];
  return (
    <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-20 pointer-events-none">
      <div className="bg-black/70 backdrop-blur-md rounded-2xl px-5 py-3 border border-white/10 min-w-[110px]">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{scoreLabel}</div>
        <div className={`text-2xl font-black ${accentText}`}>{score}</div>
      </div>
      <div className="bg-black/70 backdrop-blur-md rounded-2xl px-5 py-3 border border-white/10 text-center min-w-[110px]">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rep</div>
        <div className="text-2xl font-black text-white">{reps}/{repsTarget}</div>
      </div>
      <div className="bg-black/70 backdrop-blur-md rounded-2xl px-5 py-3 border border-white/10 text-center min-w-[110px]">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Time</div>
        <div className={`text-2xl font-black ${time <= 10 ? 'text-red-400 animate-pulse' : 'text-white'}`}>{time}s</div>
      </div>
    </div>
  );
}

function PlayControls({ onPause, onEnd }) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 z-20">
      <button onClick={onPause} className="px-6 py-3 bg-slate-800/90 hover:bg-slate-700 border border-white/10 rounded-xl font-black text-sm tracking-wide">⏸ PAUSE</button>
      <button onClick={onEnd} className="px-6 py-3 bg-red-900/80 hover:bg-red-800 border border-red-700/50 rounded-xl font-black text-sm tracking-wide">■ END SESSION</button>
    </div>
  );
}

function WristStatusBanner() {
  return (
    <div className="absolute inset-x-0 bottom-24 flex justify-center z-20 pointer-events-none">
      <div className="px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider border bg-red-500/20 border-red-500/30 text-red-400 animate-pulse">
        ⚠ No Hand Detected
      </div>
    </div>
  );
}

function CenterPrompt({ text }) {
  return (
    <div className="absolute inset-x-0 top-10 flex justify-center z-20 pointer-events-none">
      <div className="bg-slate-900/90 border border-slate-700 rounded-xl px-6 py-3 text-sm font-bold text-slate-200 shadow-xl">{text}</div>
    </div>
  );
}

function FeedbackBanner({ feedback }) {
  const ok = feedback.type === 'success';
  return (
    <div className="absolute inset-x-0 top-1/3 flex justify-center z-20 pointer-events-none">
      <div className={`px-8 py-4 rounded-2xl border-2 text-lg font-black shadow-2xl ${ok ? 'bg-emerald-600/90 border-emerald-400 text-white' : 'bg-slate-700/90 border-slate-500 text-slate-100'}`}>
        {ok ? '✓ ' : '· '}{feedback.text}
      </div>
    </div>
  );
}

function PausedScreen({ onResume, onEnd, accent }) {
  const accentBtn = { red: 'bg-red-600', teal: 'bg-teal-600', sky: 'bg-sky-600', amber: 'bg-amber-600', violet: 'bg-violet-600' }[accent];
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="text-6xl mb-4">⏸</div>
      <h2 className="text-3xl font-black mb-8">Session Paused</h2>
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button onClick={onResume} className={`py-4 ${accentBtn} rounded-2xl font-black text-lg`}>RESUME</button>
        <button onClick={onEnd} className="py-4 bg-slate-800 border border-slate-700 rounded-2xl font-black text-lg">END SESSION</button>
      </div>
    </div>
  );
}

function SummaryScreen({ title, accent, metrics, onRestart }) {
  const accentBtn = { red: 'bg-red-600', teal: 'bg-teal-600', sky: 'bg-sky-600', amber: 'bg-amber-600', violet: 'bg-violet-600' }[accent];
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="text-6xl mb-4">🏆</div>
      <h2 className="text-3xl font-black mb-8">{title}</h2>
      <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-10">
        {metrics.map(([label, value]) => (
          <div key={label} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{label}</div>
            <div className="text-2xl font-black text-white">{value}</div>
          </div>
        ))}
      </div>
      <button onClick={onRestart} className={`px-12 py-4 ${accentBtn} rounded-2xl font-black text-lg`}>RESTART</button>
    </div>
  );
}