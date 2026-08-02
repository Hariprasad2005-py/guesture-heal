import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Target, ChevronLeft, Pause, Play, RotateCcw, Settings, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { useMediaPipeUpperBody } from '../hooks/useMediaPipeUpperBody';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { useGameEngine, GAME_STATES } from '../hooks/useGameEngine';
import { useRehabSession } from '../hooks/useRehabSession';
import { useSessionTelemetry } from '../hooks/useSessionTelemetry';
import { useAudioFeedback } from '../hooks/useAudioFeedback';
import { usePostureGuidance } from '../hooks/usePostureGuidance';

export default function PrecisionReach({ onBack, onSessionEnd }) {
  const videoRef = useRef(null);
  const [poseData, setPoseData] = useState(null);
  
  const { isLoading, isActive } = useMediaPipeUpperBody({ 
    videoRef,
    onPoseUpdate: (data) => setPoseData(data)
  });

  const { position, handleMouseMove, isMouseMode, toggleMouseMode } = usePoseDetection(poseData);
  const { difficulty, settings, changeDifficulty, updateSettings } = useRehabSession();
  const { playSuccess, playMiss } = useAudioFeedback(true);
  const telemetry = useSessionTelemetry();
  const guidance = usePostureGuidance(poseData);

  const {
    gameState,
    setGameState,
    currentRep,
    countdown,
    isPaused,
    startSession,
    pauseSession,
    resumeSession,
    completeRep
  } = useGameEngine({
    totalReps: settings.reps,
    restInterval: settings.restInterval,
    onRepComplete: (success) => {
      telemetry.recordRep(success);
      if (success) playSuccess();
      else playMiss();
    },
    onSessionComplete: () => {
      telemetry.endSession(settings.reps);
    }
  });

  const [target, setTarget] = useState(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Generate new target when rep changes
  useEffect(() => {
    if (gameState === GAME_STATES.ACTIVE) {
      const newTarget = {
        x: 20 + Math.random() * 60,
        y: difficulty === 'Beginner' ? 60 + Math.random() * 20 : 20 + Math.random() * 60,
        size: difficulty === 'Beginner' ? 120 : difficulty === 'Intermediate' ? 100 : 80
      };
      setTarget(newTarget);
      setHoldProgress(0);
      setFeedback(null);
    }
  }, [gameState, currentRep, difficulty]);

  // Main game loop
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused || !target) return;

    const dx = position.x - target.x;
    const dy = position.y - target.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const hitRadius = (target.size / window.innerWidth) * 100 * 0.8; 
    
    if (distance < hitRadius) {
      const increment = 100 / (settings.holdDuration * 60); 
      setHoldProgress(prev => {
        if (prev + increment >= 100) {
          setFeedback('success');
          setTimeout(() => completeRep(true), 500);
          return 100;
        }
        return prev + increment;
      });
    } else {
      setHoldProgress(prev => Math.max(0, prev - 0.5));
    }

    telemetry.trackMovement(position);
  }, [position, target, gameState, isPaused, settings.holdDuration, completeRep, telemetry]);

  const handleStart = () => {
    telemetry.startTracking();
    startSession();
  };

  const handleExit = () => {
    if (onSessionEnd && gameState === GAME_STATES.COMPLETE) {
      onSessionEnd(telemetry.metrics);
    } else {
      onBack();
    }
  };

  // Instruction Screen
  if (gameState === GAME_STATES.INSTRUCTIONS) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-8 flex flex-col items-center justify-center font-sans">
        <div className="max-w-2xl w-full bg-white rounded-[32px] p-10 shadow-sm border border-slate-100">
          <button onClick={onBack} className="flex items-center text-slate-400 mb-8 hover:text-slate-600 transition-colors group">
            <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">Back to Games</span>
          </button>
          
          <div className="flex items-center gap-6 mb-10">
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center shadow-sm">
              <Target size={40} />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-slate-900">Precision Reach</h2>
              <p className="text-slate-500">Improve shoulder stability and arm reach.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Instructions</h3>
              <ul className="space-y-3 text-slate-600">
                <li className="flex gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0 flex items-center justify-center font-bold text-[10px]">1</span>
                  <span>Sit up straight with shoulders level.</span>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0 flex items-center justify-center font-bold text-[10px]">2</span>
                  <span>Move your hand to the blue target.</span>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0 flex items-center justify-center font-bold text-[10px]">3</span>
                  <span>Hold steady until the ring fills up.</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Difficulty</h3>
              <div className="flex flex-col gap-2">
                {['Beginner', 'Intermediate', 'Advanced'].map(level => (
                  <button
                    key={level}
                    onClick={() => changeDifficulty(level)}
                    className={`w-full py-3 px-4 rounded-xl text-left font-medium transition-all border-2 ${
                      difficulty === level 
                        ? 'bg-blue-50 border-blue-200 text-blue-700' 
                        : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-3xl p-6 mb-10 border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Setup Guidance</h3>
              <span className={`text-xs font-bold px-2 py-1 rounded-md ${guidance.isReady ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {guidance.isReady ? 'READY' : 'ADJUSTING'}
              </span>
            </div>
            <div className="aspect-video bg-slate-200 rounded-2xl relative overflow-hidden mb-3 shadow-inner">
              <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" autoPlay playsInline muted />
              {!isActive && <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm text-white text-sm font-medium">Initializing tracking...</div>}
            </div>
            <p className="text-sm text-slate-600 flex items-center gap-2">
              {guidance.isReady ? <CheckCircle2 size={16} className="text-green-500" /> : <AlertCircle size={16} className="text-amber-500" />}
              {guidance.message}
            </p>
          </div>

          <button
            onClick={handleStart}
            disabled={!guidance.isReady && !isMouseMode}
            className="w-full bg-[#0F172A] text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-slate-200"
          >
            <Play size={20} fill="currentColor" />
            Start Session
            <ChevronLeft size={20} className="rotate-180" />
          </button>
          
          <button 
            onClick={() => toggleMouseMode(!isMouseMode)}
            className="w-full mt-6 text-slate-400 text-xs font-medium hover:text-slate-600 transition-colors"
          >
            {isMouseMode ? "Switch to Hand Tracking" : "Use Mouse Input (Alternative)"}
          </button>
        </div>
      </div>
    );
  }

  // Summary Screen
  if (gameState === GAME_STATES.COMPLETE) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-8 flex flex-col items-center justify-center font-sans">
        <div className="max-w-2xl w-full bg-white rounded-[32px] p-10 shadow-sm border border-slate-100 text-center">
          <div className="w-20 h-20 bg-green-50 text-green-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Session Complete</h2>
          <p className="text-slate-500 mb-10">Excellent work! You've completed your precision exercises.</p>
          
          <div className="grid grid-cols-2 gap-4 mb-10">
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Accuracy</p>
              <p className="text-3xl font-black text-slate-900">{telemetry.metrics.accuracy}%</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Completion</p>
              <p className="text-3xl font-black text-slate-900">{telemetry.metrics.successfulReps} / {settings.reps}</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Duration</p>
              <p className="text-3xl font-black text-slate-900">{telemetry.metrics.totalTime}s</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Range</p>
              <p className="text-3xl font-black text-slate-900">{Math.round(telemetry.metrics.totalDistance / 100)}</p>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleExit}
              className="flex-1 bg-slate-100 text-slate-900 py-5 rounded-2xl font-bold hover:bg-slate-200 transition-all"
            >
              Exit to Menu
            </button>
            <button
              onClick={() => setGameState(GAME_STATES.INSTRUCTIONS)}
              className="flex-1 bg-[#0F172A] text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
            >
              <RotateCcw size={20} />
              Restart Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] relative overflow-hidden font-sans select-none" onMouseMove={isMouseMode ? handleMouseMove : undefined}>
      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center z-20">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-sm text-slate-500 hover:text-slate-900 transition-all border border-white">
            <ChevronLeft size={24} />
          </button>
          <div className="bg-white/80 backdrop-blur-md px-6 py-3 rounded-2xl shadow-sm border border-white">
            <span className="text-slate-400 text-xs font-bold uppercase tracking-widest mr-3">Progress</span>
            <span className="text-slate-900 font-black text-lg">{currentRep} <span className="text-slate-300 mx-1">/</span> {settings.reps}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => isPaused ? resumeSession() : pauseSession()}
            className="bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-sm text-slate-500 hover:text-slate-900 transition-all border border-white"
          >
            {isPaused ? <Play size={24} fill="currentColor" /> : <Pause size={24} fill="currentColor" />}
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className="bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-sm text-slate-500 hover:text-slate-900 transition-all border border-white"
          >
            <Settings size={24} />
          </button>
          <button 
            onClick={() => setGameState(GAME_STATES.COMPLETE)}
            className="bg-red-50/80 backdrop-blur-md p-3 rounded-2xl shadow-sm text-red-500 hover:text-red-700 transition-all border border-red-100"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Game Canvas */}
      <div className="w-full h-screen relative flex items-center justify-center">
        {gameState === GAME_STATES.COUNTDOWN && (
          <div className="text-[160px] font-black text-slate-900 animate-pulse">{countdown}</div>
        )}

        {gameState === GAME_STATES.ACTIVE && target && (
          <div 
            className={`absolute transition-all duration-500 flex items-center justify-center ${feedback === 'success' ? 'scale-110' : 'scale-100'}`}
            style={{ 
              left: `${target.x}%`, 
              top: `${target.y}%`,
              width: `${target.size}px`,
              height: `${target.size}px`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <div className={`absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-10 ${feedback === 'success' ? 'hidden' : ''}`} />
            <div className={`w-full h-full rounded-full border-4 flex items-center justify-center bg-white shadow-2xl transition-colors duration-300 ${feedback === 'success' ? 'border-green-500' : 'border-blue-600'}`}>
              <div className={`w-1/3 h-1/3 rounded-full transition-colors duration-300 ${feedback === 'success' ? 'bg-green-500' : 'bg-blue-600'}`} />
            </div>
            <svg className="absolute inset-[-8px] w-[calc(100%+16px)] h-[calc(100%+16px)] -rotate-90">
              <circle
                cx="50%" cy="50%" r="48%"
                fill="none" stroke="#E2E8F0" strokeWidth="4"
              />
              <circle
                cx="50%" cy="50%" r="48%"
                fill="none" stroke={feedback === 'success' ? '#22C55E' : '#3B82F6'}
                strokeWidth="4" strokeDasharray="301.6"
                strokeDashoffset={301.6 - (301.6 * holdProgress) / 100}
                strokeLinecap="round"
                className="transition-all duration-75"
              />
            </svg>
          </div>
        )}

        {/* Hand Tracker Cursor */}
        <div 
          className="absolute w-12 h-12 pointer-events-none z-50 transition-all duration-75"
          style={{ 
            left: `${position.x}%`, 
            top: `${position.y}%`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div className="w-full h-full rounded-full border-4 border-slate-900 bg-white/30 backdrop-blur-sm shadow-xl flex items-center justify-center">
            <div className="w-2 h-2 bg-slate-900 rounded-full" />
          </div>
        </div>

        {/* Posture Guidance Toast */}
        {!guidance.isReady && !isPaused && gameState === GAME_STATES.ACTIVE && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md border border-amber-200 px-8 py-4 rounded-[24px] shadow-2xl flex items-center gap-4 animate-bounce z-30">
            <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-slate-900 font-bold">{guidance.message}</span>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-2xl font-bold text-slate-900">Therapist Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={28} />
              </button>
            </div>
            <div className="p-8 space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Repetitions</label>
                  <span className="text-blue-600 font-bold">{settings.reps}</span>
                </div>
                <input 
                  type="range" min="1" max="20" value={settings.reps} 
                  onChange={(e) => updateSettings({ reps: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Hold Duration (s)</label>
                  <span className="text-blue-600 font-bold">{settings.holdDuration}s</span>
                </div>
                <input 
                  type="range" min="1" max="5" step="0.5" value={settings.holdDuration} 
                  onChange={(e) => updateSettings({ holdDuration: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            </div>
            <div className="p-8 bg-slate-50">
              <button 
                onClick={() => setShowSettings(false)}
                className="w-full bg-[#0F172A] text-white py-5 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
