import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShoppingBasket, ChevronLeft, Pause, Play, RotateCcw, Settings, X, CheckCircle2, AlertCircle, Apple, Grape, Cherry, Banana } from 'lucide-react';
import SkeletonOverlay from '../components/rehab/SkeletonOverlay';
import { useMediaPipeUpperBody } from '../hooks/useMediaPipeUpperBody';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { useGameEngine, GAME_STATES } from '../hooks/useGameEngine';
import { useRehabSession } from '../hooks/useRehabSession';
import { useSessionTelemetry } from '../hooks/useSessionTelemetry';
import { useAudioFeedback } from '../hooks/useAudioFeedback';
import { usePostureGuidance } from '../hooks/usePostureGuidance';

const FALLING_ITEMS = [
  { icon: Apple, color: 'text-red-500', bg: 'bg-red-50' },
  { icon: Grape, color: 'text-purple-500', bg: 'bg-purple-50' },
  { icon: Cherry, color: 'text-rose-500', bg: 'bg-rose-50' },
  { icon: Banana, color: 'text-yellow-500', bg: 'bg-yellow-50' },
];

export default function CatchAndFlex({ onBack, onSessionEnd }) {
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

  const [items, setItems] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [streak, setStreak] = useState(0);
  const [basketFill, setBasketFill] = useState(0);

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
    restInterval: 500,
    onRepComplete: (success) => {
      telemetry.recordRep(success);
      if (success) {
        playSuccess();
        setStreak(s => s + 1);
        setBasketFill(prev => Math.min(100, prev + 5));
      } else {
        playMiss();
        setStreak(0);
      }
    },
    onSessionComplete: () => {
      telemetry.endSession(100);
    }
  });

  // Spawn logic for multiple items
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;

    const spawnRate = difficulty === 'Beginner' ? 3000 : difficulty === 'Intermediate' ? 2000 : 1200;
    const timer = setInterval(() => {
      const randomItem = FALLING_ITEMS[Math.floor(Math.random() * FALLING_ITEMS.length)];
      const newItem = {
        id: Date.now(),
        ...randomItem,
        x: 10 + Math.random() * 80,
        y: -10,
        speed: (difficulty === 'Beginner' ? 0.3 : difficulty === 'Intermediate' ? 0.5 : 0.7) + Math.random() * 0.2,
        size: 80,
        requiredOrientation: Math.random() < 0.3 ? 'palm_up' : 'any'
      };
      setItems(prev => [...prev, newItem]);
    }, spawnRate);

    return () => clearInterval(timer);
  }, [gameState, isPaused, difficulty]);

  // Movement and Collision logic
  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused) return;

    const gameLoop = setInterval(() => {
      setItems(prev => {
        const nextItems = [];
        for (const item of prev) {
          const nextY = item.y + item.speed;
          const basketY = 85;
          const basketWidth = 18; 
          const basketX = position.x;
          
          // Collision check
          if (nextY >= basketY - 3 && nextY <= basketY + 3) {
            if (Math.abs(item.x - basketX) < basketWidth / 2) {
              completeRep(true);
              continue; // Caught
            }
          }
          
          // Miss check
          if (nextY > 105) {
            completeRep(false);
            continue; // Missed
          }
          
          nextItems.push({ ...item, y: nextY });
        }
        return nextItems;
      });
    }, 16);

    return () => clearInterval(gameLoop);
  }, [position, gameState, isPaused, completeRep]);

  const handleStart = () => {
    telemetry.startTracking();
    setItems([]);
    setStreak(0);
    setBasketFill(0);
    startSession();
  };

  const handleExit = () => {
    if (onSessionEnd && gameState === GAME_STATES.COMPLETE) {
      onSessionEnd({
        ...telemetry.metrics,
        customMetrics: {
          catchRate: telemetry.metrics.accuracy,
          maxStreak: streak,
          coordinationScore: Math.round(telemetry.metrics.successfulReps * (difficulty === 'Advanced' ? 1.5 : 1))
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
            <div className="w-20 h-20 bg-purple-50 text-purple-600 rounded-3xl flex items-center justify-center shadow-sm">
              <ShoppingBasket size={40} />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-slate-900">Catch & Flex</h2>
              <p className="text-slate-500 font-medium">Therapy Benefit: Improves hand-arm coordination, motor planning, and reactive control.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Session Guidance</h3>
              <ul className="space-y-4 text-slate-600">
                <li className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-purple-50 text-purple-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">1</span>
                  <div>
                    <p className="font-bold text-slate-900">Starting Posture</p>
                    <p>Sit upright with your hand ready to move the basket horizontally.</p>
                  </div>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-purple-50 text-purple-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">2</span>
                  <div>
                    <p className="font-bold text-slate-900">Movement Required</p>
                    <p>Move your hand left and right to position the basket under items.</p>
                  </div>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-purple-50 text-purple-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">3</span>
                  <div>
                    <p className="font-bold text-slate-900">Coordination</p>
                    <p>As you progress, multiple items will fall. Stay focused!</p>
                  </div>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-purple-50 text-purple-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">4</span>
                  <div>
                    <p className="font-bold text-slate-900">Success Condition</p>
                    <p>Catch as many items as possible before they hit the ground.</p>
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
                        ? 'bg-purple-50 border-purple-200 text-purple-700' 
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
          <p className="text-slate-500 mb-10">Excellent work! You've completed your coordination exercises.</p>
          
          <div className="grid grid-cols-2 gap-4 mb-10">
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Catch Rate</p>
              <p className="text-3xl font-black text-slate-900">{telemetry.metrics.accuracy}%</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Total Caught</p>
              <p className="text-3xl font-black text-slate-900">{telemetry.metrics.successfulReps}</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Max Streak</p>
              <p className="text-3xl font-black text-slate-900">{streak}</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Coordination</p>
              <p className="text-3xl font-black text-slate-900">{Math.round(telemetry.metrics.successfulReps * 1.2)}</p>
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
              <span className="text-slate-400 text-xs font-bold uppercase tracking-widest mr-3">Streak</span>
              <span className="text-purple-600 font-black text-lg">{streak}</span>
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

        {gameState === GAME_STATES.ACTIVE && (
          <>
            {/* Basket Fill Meter */}
            <div className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-64 bg-slate-100 rounded-full border border-slate-200 overflow-hidden">
              <div 
                className="absolute bottom-0 left-0 right-0 bg-purple-500 transition-all duration-500"
                style={{ height: `${basketFill}%` }}
              />
            </div>

            {items.map(item => (
              <div 
                key={item.id}
                className="absolute transition-all duration-75 flex items-center justify-center"
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
              </div>
            ))}

            <div 
              className="absolute bottom-[10%] transition-all duration-75 flex flex-col items-center"
              style={{ 
                left: `${position.x}%`,
                width: '160px',
                transform: 'translateX(-50%)'
              }}
            >
              <div className="w-full h-24 bg-purple-600 rounded-b-[40px] rounded-t-xl shadow-2xl flex items-center justify-center border-t-8 border-purple-500 relative overflow-hidden">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
                <ShoppingBasket size={48} className="text-purple-200" />
              </div>
              <div className="w-16 h-2 bg-slate-900/10 rounded-full mt-4 blur-sm" />
            </div>
          </>
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
          <div className="w-full h-full rounded-full border-4 border-purple-500 bg-white/30 backdrop-blur-sm shadow-xl flex items-center justify-center">
            <div className="w-2 h-2 bg-purple-600 rounded-full" />
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
                  <span className="text-purple-600 font-bold">{settings.sessionLength || 1}m</span>
                </div>
                <input 
                  type="range" min="1" max="5" value={settings.sessionLength || 1} 
                  onChange={(e) => updateSettings({ sessionLength: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
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
