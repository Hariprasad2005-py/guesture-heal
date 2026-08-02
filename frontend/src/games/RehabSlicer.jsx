import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sword, ChevronLeft, Pause, Play, RotateCcw, Settings, X, CheckCircle2, AlertCircle, Pill, Stethoscope, Thermometer, Activity } from 'lucide-react';
import SkeletonOverlay from '../components/rehab/SkeletonOverlay';
import { useMediaPipeUpperBody } from '../hooks/useMediaPipeUpperBody';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { useGameEngine, GAME_STATES } from '../hooks/useGameEngine';
import { useRehabSession } from '../hooks/useRehabSession';
import { useSessionTelemetry } from '../hooks/useSessionTelemetry';
import { useAudioFeedback } from '../hooks/useAudioFeedback';
import { usePostureGuidance } from '../hooks/usePostureGuidance';

const MEDICAL_ITEMS = [
  { icon: Pill, color: 'text-pink-500', bg: 'bg-pink-50', name: 'Medicine' },
  { icon: Stethoscope, color: 'text-blue-500', bg: 'bg-blue-50', name: 'Stethoscope' },
  { icon: Thermometer, color: 'text-amber-500', bg: 'bg-amber-50', name: 'Thermometer' },
  { icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-50', name: 'Monitor' },
];

export default function RehabSlicer({ onBack, onSessionEnd }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
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

  const [item, setItem] = useState(null);
  const [sliceProgress, setSliceProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [isReturnToWaist, setIsReturnToWaist] = useState(true);

  useEffect(() => {
    if (gameState === GAME_STATES.ACTIVE) {
      const randomItem = MEDICAL_ITEMS[Math.floor(Math.random() * MEDICAL_ITEMS.length)];
      const newItem = {
        ...randomItem,
        x: 30 + Math.random() * 40,
        y: 20 + Math.random() * 30,
        size: difficulty === 'Beginner' ? 160 : difficulty === 'Intermediate' ? 130 : 100,
      };
      setItem(newItem);
      setSliceProgress(0);
      setFeedback(null);
      setIsReturnToWaist(true);
    }
  }, [gameState, currentRep, difficulty]);

  const lastPos = useRef(null);
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused || !item) return;

    if (isReturnToWaist) {
      const waistZoneY = 80;
      if (position.y > waistZoneY) {
        setIsReturnToWaist(false);
      }
      return;
    }

    const dx = position.x - item.x;
    const dy = position.y - item.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const hitRadius = (item.size / window.innerWidth) * 100 * 0.7; 
    
    if (distance < hitRadius) {
      if (lastPos.current) {
        const moveDist = Math.sqrt(
          Math.pow(position.x - lastPos.current.x, 2) + 
          Math.pow(position.y - lastPos.current.y, 2)
        );
        
        const speedMultiplier = difficulty === 'Beginner' ? 2.5 : difficulty === 'Intermediate' ? 1.8 : 1.2;
        
        setSliceProgress(prev => {
          const next = prev + moveDist * speedMultiplier;
          if (next >= 100) {
            setFeedback('success');
            setTimeout(() => completeRep(true), 600);
            return 100;
          }
          return next;
        });
      }
    }

    lastPos.current = { ...position };
    telemetry.trackMovement(position);
  }, [position, item, gameState, isPaused, difficulty, completeRep, telemetry, isReturnToWaist]);

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

  if (gameState === GAME_STATES.INSTRUCTIONS) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-8 flex flex-col items-center justify-center font-sans">
        <div className="max-w-2xl w-full bg-white rounded-[32px] p-10 shadow-sm border border-slate-100">
          <button onClick={onBack} className="flex items-center text-slate-400 mb-8 hover:text-slate-600 transition-colors group">
            <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">Back to Games</span>
          </button>
          
          <div className="flex items-center gap-6 mb-10">
            <div className="w-20 h-20 bg-pink-50 text-pink-600 rounded-3xl flex items-center justify-center shadow-sm">
              <Sword size={40} />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-slate-900">Rehab Slicer</h2>
              <p className="text-slate-500">Swipe medical objects to improve mobility.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Instructions</h3>
              <ul className="space-y-3 text-slate-600">
                <li className="flex gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-pink-50 text-pink-600 flex-shrink-0 flex items-center justify-center font-bold text-[10px]">1</span>
                  <span>Start with your hand at your waist.</span>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-pink-50 text-pink-600 flex-shrink-0 flex items-center justify-center font-bold text-[10px]">2</span>
                  <span>Swipe through the items as they appear.</span>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-pink-50 text-pink-600 flex-shrink-0 flex items-center justify-center font-bold text-[10px]">3</span>
                  <span>Return to start position after each slice.</span>
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
                        ? 'bg-pink-50 border-pink-200 text-pink-700' 
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

  if (gameState === GAME_STATES.COMPLETE) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-8 flex flex-col items-center justify-center font-sans">
        <div className="max-w-2xl w-full bg-white rounded-[32px] p-10 shadow-sm border border-slate-100 text-center">
          <div className="w-20 h-20 bg-green-50 text-green-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Session Complete</h2>
          <p className="text-slate-500 mb-10">Excellent work! You've completed your slicing exercises.</p>
          
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
    <div ref={containerRef} className="min-h-screen bg-[#F8FAFC] relative overflow-hidden font-sans select-none" onMouseMove={isMouseMode ? handleMouseMove : undefined}>
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
          <button onClick={() => isPaused ? resumeSession() : pauseSession()} className="bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-sm text-slate-500 hover:text-slate-900 transition-all border border-white">
            {isPaused ? <Play size={24} fill="currentColor" /> : <Pause size={24} fill="currentColor" />}
          </button>
          <button onClick={() => setShowSettings(true)} className="bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-sm text-slate-500 hover:text-slate-900 transition-all border border-white">
            <Settings size={24} />
          </button>
          <button onClick={() => setGameState(GAME_STATES.COMPLETE)} className="bg-red-50/80 backdrop-blur-md p-3 rounded-2xl shadow-sm text-red-500 hover:text-red-700 transition-all border border-red-100">
            <X size={24} />
          </button>
        </div>
      </div>

      <div className="w-full h-screen relative flex items-center justify-center">
        {gameState === GAME_STATES.COUNTDOWN && (
          <div className="text-[160px] font-black text-slate-900 animate-pulse">{countdown}</div>
        )}

        {gameState === GAME_STATES.ACTIVE && item && (
          <>
            {isReturnToWaist && (
              <div className="absolute bottom-0 left-0 right-0 h-40 bg-pink-50/50 border-t-4 border-pink-100 flex flex-col items-center justify-center animate-pulse z-10">
                <div className="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center text-pink-500 mb-2">
                  <RotateCcw size={32} />
                </div>
                <span className="text-pink-600 font-black uppercase tracking-[0.2em] text-sm">Return hand to waist</span>
              </div>
            )}

            <div 
              className={`absolute transition-all duration-300 flex items-center justify-center ${feedback === 'success' ? 'scale-150 opacity-0' : 'scale-100 opacity-100'}`}
              style={{ 
                left: `${item.x}%`, 
                top: `${item.y}%`,
                width: `${item.size}px`,
                height: `${item.size}px`,
                transform: 'translate(-50%, -50%)'
              }}
            >
              <div className={`w-full h-full rounded-2xl flex items-center justify-center shadow-lg border-2 border-white ${item.bg}`}>
                <item.icon size={item.size * 0.6} className={item.color} />
              </div>
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="50%" cy="50%" r="48%"
                  fill="none" stroke="white" strokeWidth="6" strokeOpacity="0.3"
                />
                <circle
                  cx="50%" cy="50%" r="48%"
                  fill="none" stroke="white" strokeWidth="6"
                  strokeDasharray="301.6"
                  strokeDashoffset={301.6 - (301.6 * sliceProgress) / 100}
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </>
        )}

        <div 
          className="absolute w-12 h-12 pointer-events-none z-50 transition-all duration-75"
          style={{ 
            left: `${position.x}%`, 
            top: `${position.y}%`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div className="w-full h-full rounded-full border-4 border-slate-900 bg-white/30 backdrop-blur-sm shadow-xl flex items-center justify-center">
            <Sword size={24} className="text-slate-900 -rotate-45" />
          </div>
        </div>

        {/* Skeleton Overlay */}
        {gameState === GAME_STATES.ACTIVE && !isMouseMode && (
          <SkeletonOverlay 
            containerRef={containerRef}
            keypoints={poseData?.raw}
            overallStatus={guidance.isReady ? 'ok' : 'minor'}
          />
        )}

        {!guidance.isReady && !isPaused && gameState === GAME_STATES.ACTIVE && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md border border-amber-200 px-8 py-4 rounded-[24px] shadow-2xl flex items-center gap-4 animate-bounce z-30">
            <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-slate-900 font-bold">{guidance.message}</span>
          </div>
        )}
      </div>

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
                  <span className="text-pink-600 font-bold">{settings.reps}</span>
                </div>
                <input 
                  type="range" min="1" max="20" value={settings.reps} 
                  onChange={(e) => updateSettings({ reps: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-pink-600"
                />
              </div>
            </div>
            <div className="p-8 bg-slate-50">
              <button onClick={() => setShowSettings(false)} className="w-full bg-[#0F172A] text-white py-5 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg">Save Configuration</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
