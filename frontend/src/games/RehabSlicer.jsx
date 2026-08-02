import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sword, ChevronLeft, Pause, Play, RotateCcw, Settings, X, CheckCircle2, AlertCircle, Pill, Stethoscope, Thermometer, Activity, AlertTriangle } from 'lucide-react';
import SkeletonOverlay from '../components/rehab/SkeletonOverlay';
import { useMediaPipeUpperBody } from '../hooks/useMediaPipeUpperBody';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { useGameEngine, GAME_STATES } from '../hooks/useGameEngine';
import { useRehabSession } from '../hooks/useRehabSession';
import { useSessionTelemetry } from '../hooks/useSessionTelemetry';
import { useAudioFeedback } from '../hooks/useAudioFeedback';
import { usePostureGuidance } from '../hooks/usePostureGuidance';

const MEDICAL_ITEMS = [
  { icon: Pill, color: 'text-pink-500', bg: 'bg-pink-50', type: 'target' },
  { icon: Stethoscope, color: 'text-blue-500', bg: 'bg-blue-50', type: 'target' },
  { icon: Thermometer, color: 'text-amber-500', bg: 'bg-amber-50', type: 'target' },
  { icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-50', type: 'target' },
  { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50', type: 'avoid' },
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

  const [item, setItem] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [isReturnToWaist, setIsReturnToWaist] = useState(true);
  const [combo, setCombo] = useState(0);

  const {
    gameState,
    setGameState,
    currentRep,
    countdown,
    timeLeft,
    isPaused,
    startSession,
    pauseSession,
    resumeSession,
    completeRep,
    endSession
  } = useGameEngine({
    totalReps: 0,
    sessionLength: settings.sessionLength * 60 || 60,
    restInterval: (settings.restInterval || 0.5) * 1000,
    onRepComplete: (success) => {
      telemetry.recordRep(success);
      if (success) {
        playSuccess();
        setCombo(c => c + 1);
      } else {
        playMiss();
        setCombo(0);
      }
    },
    onSessionComplete: () => {
      telemetry.endSession(100);
    }
  });

  const spawnItem = useCallback(() => {
    const isAvoid = Math.random() < 0.2; // 20% chance for avoid objects
    const itemType = isAvoid ? MEDICAL_ITEMS[4] : MEDICAL_ITEMS[Math.floor(Math.random() * 4)];
    
    // Random direction: 0 = L->R, 1 = R->L, 2 = T->B, 3 = B->T
    const direction = Math.floor(Math.random() * 4);
    let x, y, vx, vy;
    const speed = (difficulty === 'Beginner' ? 0.4 : difficulty === 'Intermediate' ? 0.7 : 1.1);

    if (direction === 0) { x = -10; y = 20 + Math.random() * 60; vx = speed; vy = (Math.random() - 0.5) * 0.2; }
    else if (direction === 1) { x = 110; y = 20 + Math.random() * 60; vx = -speed; vy = (Math.random() - 0.5) * 0.2; }
    else if (direction === 2) { x = 20 + Math.random() * 60; y = -10; vx = (Math.random() - 0.5) * 0.2; vy = speed; }
    else { x = 20 + Math.random() * 60; y = 110; vx = (Math.random() - 0.5) * 0.2; vy = -speed; }

    setItem({
      ...itemType,
      x, y, vx, vy,
      size: difficulty === 'Beginner' ? 160 : difficulty === 'Intermediate' ? 130 : 100,
      angle: Math.atan2(vy, vx) * (180 / Math.PI)
    });
    setFeedback(null);
    setIsReturnToWaist(true);
  }, [difficulty]);

  useEffect(() => {
    if (gameState === GAME_STATES.ACTIVE && !item) {
      spawnItem();
    }
  }, [gameState, item, spawnItem]);

  const lastPos = useRef(null);
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused || !item) return;

    // Movement logic
    setItem(prev => {
      if (!prev) return null;
      const nextX = prev.x + prev.vx;
      const nextY = prev.y + prev.vy;
      
      // Miss condition
      if (nextX < -20 || nextX > 120 || nextY < -20 || nextY > 120) {
        if (prev.type === 'target') completeRep(false);
        else completeRep(true); // Successfully avoided
        return null;
      }
      return { ...prev, x: nextX, y: nextY };
    });

    // Collision detection
    const dx = position.x - item.x;
    const dy = position.y - item.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const hitRadius = (item.size / (containerRef.current?.clientWidth || 1000)) * 100 * 0.7; 
    
    if (distance < hitRadius) {
      if (item.type === 'avoid') {
        setFeedback('error');
        setTimeout(() => {
          completeRep(false);
          setItem(null);
        }, 300);
      } else {
        // Successful slice
        setFeedback('success');
        setTimeout(() => {
          completeRep(true);
          setItem(null);
        }, 300);
      }
    }

    telemetry.trackMovement(position);
  }, [position, item, gameState, isPaused, completeRep, telemetry]);

  const handleStart = () => {
    telemetry.startTracking();
    setCombo(0);
    startSession();
  };

  const handleExit = () => {
    if (onSessionEnd && gameState === GAME_STATES.COMPLETE) {
      onSessionEnd({
        ...telemetry.metrics,
        customMetrics: {
          slices: telemetry.metrics.successfulReps,
          combo: combo,
          accuracy: telemetry.metrics.accuracy
        }
      });
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
              <p className="text-slate-500 font-medium">Therapy Benefit: Improves wrist rotation, multi-planar shoulder mobility, and reaction time.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Session Guidance</h3>
              <ul className="space-y-4 text-slate-600">
                <li className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-pink-50 text-pink-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">1</span>
                  <div>
                    <p className="font-bold text-slate-900">Starting Posture</p>
                    <p>Sit upright with your arm relaxed and ready to swipe.</p>
                  </div>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-pink-50 text-pink-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">2</span>
                  <div>
                    <p className="font-bold text-slate-900">Movement Required</p>
                    <p>Swipe through medical items as they fly across the screen.</p>
                  </div>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-pink-50 text-pink-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">3</span>
                  <div>
                    <p className="font-bold text-slate-900">Precision Control</p>
                    <p>Avoid red hazard icons! Swiping them will reduce your score.</p>
                  </div>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-pink-50 text-pink-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">4</span>
                  <div>
                    <p className="font-bold text-slate-900">Success Condition</p>
                    <p>Successfully slice targets while maintaining a high combo.</p>
                  </div>
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
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Slices</p>
              <p className="text-3xl font-black text-slate-900">{telemetry.metrics.successfulReps}</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Max Combo</p>
              <p className="text-3xl font-black text-slate-900">{combo}</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Accuracy</p>
              <p className="text-3xl font-black text-slate-900">{telemetry.metrics.accuracy}%</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Time</p>
              <p className="text-3xl font-black text-slate-900">{telemetry.metrics.totalTime}s</p>
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
    <div ref={containerRef} className="min-h-screen bg-[#F8FAFC] relative overflow-auto font-sans select-none" onMouseMove={isMouseMode ? handleMouseMove : undefined}>
      <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center z-20">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-sm text-slate-500 hover:text-slate-900 transition-all border border-white">
            <ChevronLeft size={24} />
          </button>
          <div className="bg-white/80 backdrop-blur-md px-6 py-3 rounded-2xl shadow-sm border border-white flex items-center gap-4">
            <div>
              <span className="text-slate-400 text-xs font-bold uppercase tracking-widest mr-3">Time</span>
              <span className="text-slate-900 font-black text-lg">{timeLeft}s</span>
            </div>
            <div className="w-px h-6 bg-slate-200" />
            <div>
              <span className="text-slate-400 text-xs font-bold uppercase tracking-widest mr-3">Combo</span>
              <span className="text-pink-600 font-black text-lg">{combo}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={() => isPaused ? resumeSession() : pauseSession()} className="bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-sm text-slate-500 hover:text-slate-900 transition-all border border-white">
            {isPaused ? <Play size={24} fill="currentColor" /> : <Pause size={24} fill="currentColor" />}
          </button>
          <button onClick={() => setShowSettings(true)} className="bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-sm text-slate-500 hover:text-slate-900 transition-all border border-white">
            <Settings size={24} />
          </button>
          <button onClick={endSession} className="bg-red-50/80 backdrop-blur-md p-3 rounded-2xl shadow-sm text-red-500 hover:text-red-700 transition-all border border-red-100">
            <X size={24} />
          </button>
        </div>
      </div>

      <div className="w-full h-screen relative flex items-center justify-center overflow-hidden">
        {gameState === GAME_STATES.COUNTDOWN && (
          <div className="text-[160px] font-black text-slate-900 animate-pulse">{countdown}</div>
        )}

        {gameState === GAME_STATES.ACTIVE && item && (
          <div 
            className={`absolute transition-all duration-75 flex items-center justify-center ${feedback === 'success' ? 'scale-150 opacity-0' : feedback === 'error' ? 'animate-shake' : 'scale-100 opacity-100'}`}
            style={{ 
              left: `${item.x}%`, 
              top: `${item.y}%`,
              width: `${item.size}px`,
              height: `${item.size}px`,
              transform: `translate(-50%, -50%) rotate(${item.angle}deg)`
            }}
          >
            <div className={`w-full h-full rounded-3xl flex items-center justify-center shadow-xl border-4 border-white ${item.bg}`}>
              <item.icon size={item.size * 0.6} className={item.color} />
            </div>
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
          <div className="w-full h-full rounded-full border-4 border-pink-500 bg-white/30 backdrop-blur-sm shadow-xl flex items-center justify-center">
            <Sword size={24} className="text-pink-600 -rotate-45" />
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
            <div className="p-8 space-y-6 overflow-y-auto max-h-[60vh]">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Session Length (min)</label>
                  <span className="text-pink-600 font-bold">{settings.sessionLength || 1}m</span>
                </div>
                <input 
                  type="range" min="1" max="5" value={settings.sessionLength || 1} 
                  onChange={(e) => updateSettings({ sessionLength: parseInt(e.target.value) })}
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
