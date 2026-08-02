import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Cloud, ChevronLeft, Pause, Play, RotateCcw, Settings, X, CheckCircle2, AlertCircle } from 'lucide-react';
import SkeletonOverlay from '../components/rehab/SkeletonOverlay';
import { useMediaPipeUpperBody } from '../hooks/useMediaPipeUpperBody';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { useGameEngine, GAME_STATES } from '../hooks/useGameEngine';
import { useRehabSession } from '../hooks/useRehabSession';
import { useSessionTelemetry } from '../hooks/useSessionTelemetry';
import { useAudioFeedback } from '../hooks/useAudioFeedback';
import { usePostureGuidance } from '../hooks/usePostureGuidance';

export default function CloudReach({ onBack, onSessionEnd }) {
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

  const [balloon, setBalloon] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [feedback, setFeedback] = useState(null);
  
  // Cloud Reach Specific Metrics
  const [elevationStats, setElevationStats] = useState({
    maxElevation: 100, // 0 is top
    sessionBest: 100,
    fatigueIndicator: 0 // Change in elevation over time
  });

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
    restInterval: (settings.restInterval || 1) * 1000,
    onRepComplete: (success) => {
      telemetry.recordRep(success);
      if (success) playSuccess();
      else playMiss();
    },
    onSessionComplete: () => {
      telemetry.endSession(100);
    }
  });

  // Adaptive Elevation Logic
  const [targetElevation, setTargetElevation] = useState(60); // Starting target Y

  const spawnBalloon = useCallback(() => {
    // Progressive elevation: spawn higher (lower Y) as session continues
    const progressFactor = (60 - timeLeft) / 60;
    const baseElevation = 60 - (progressFactor * 40); // Move from 60 down to 20
    
    setBalloon({
      x: 20 + Math.random() * 60,
      y: 110, // Start below screen
      speed: difficulty === 'Beginner' ? 0.3 : difficulty === 'Intermediate' ? 0.5 : 0.8,
      targetY: Math.max(10, baseElevation - Math.random() * 10),
      size: 140,
      isHighValue: Math.random() < 0.2
    });
    setFeedback(null);
  }, [difficulty, timeLeft]);

  useEffect(() => {
    if (gameState === GAME_STATES.ACTIVE && !balloon) {
      spawnBalloon();
    }
  }, [gameState, balloon, spawnBalloon]);

  useEffect(() => {
    if (gameState !== GAME_STATES.ACTIVE || isPaused || !balloon) return;

    // Balloon drifts upward
    setBalloon(prev => {
      if (!prev) return null;
      const nextY = prev.y - prev.speed;
      
      // If balloon floats off screen
      if (nextY < -20) {
        completeRep(false);
        return null;
      }
      return { ...prev, y: nextY };
    });

    // Pop logic
    const dx = position.x - balloon.x;
    const dy = position.y - balloon.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const hitRadius = (balloon.size / (containerRef.current?.clientWidth || 1000)) * 100 * 0.6; 
    
    if (distance < hitRadius) {
      setFeedback('pop');
      setElevationStats(prev => ({
        ...prev,
        maxElevation: Math.min(prev.maxElevation, position.y),
        sessionBest: Math.min(prev.sessionBest, position.y)
      }));
      setTimeout(() => {
        completeRep(true);
        setBalloon(null);
      }, 400);
    }

    telemetry.trackMovement(position);
  }, [position, balloon, gameState, isPaused, completeRep, telemetry]);

  const handleStart = () => {
    telemetry.startTracking();
    setElevationStats({ maxElevation: 100, sessionBest: 100, fatigueIndicator: 0 });
    startSession();
  };

  const handleExit = () => {
    if (onSessionEnd && gameState === GAME_STATES.COMPLETE) {
      onSessionEnd({
        ...telemetry.metrics,
        customMetrics: {
          maxElevation: 100 - elevationStats.sessionBest,
          balloonsPopped: telemetry.metrics.successfulReps,
          consistency: telemetry.metrics.accuracy
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
            <div className="w-20 h-20 bg-green-50 text-green-600 rounded-3xl flex items-center justify-center shadow-sm">
              <Cloud size={40} />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-slate-900">Cloud Reach</h2>
              <p className="text-slate-500 font-medium">Therapy Benefit: Improves arm elevation, overhead reach, and shoulder flexibility.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Session Guidance</h3>
              <ul className="space-y-4 text-slate-600">
                <li className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-green-50 text-green-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">1</span>
                  <div>
                    <p className="font-bold text-slate-900">Starting Posture</p>
                    <p>Sit upright and keep your hand at shoulder height to start.</p>
                  </div>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-green-50 text-green-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">2</span>
                  <div>
                    <p className="font-bold text-slate-900">Movement Required</p>
                    <p>Raise your arm to "pop" balloons as they drift upward.</p>
                  </div>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-green-50 text-green-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">3</span>
                  <div>
                    <p className="font-bold text-slate-900">Progressive Challenge</p>
                    <p>Balloons will spawn higher as you succeed. Reach for your best!</p>
                  </div>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-green-50 text-green-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">4</span>
                  <div>
                    <p className="font-bold text-slate-900">Success Condition</p>
                    <p>Pop the balloon before it floats off the top of the screen.</p>
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
                        ? 'bg-green-50 border-green-200 text-green-700' 
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
          <p className="text-slate-500 mb-10">Excellent work! You've completed your reaching exercises.</p>
          
          <div className="grid grid-cols-2 gap-4 mb-10">
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Balloons Popped</p>
              <p className="text-3xl font-black text-slate-900">{telemetry.metrics.successfulReps}</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Max Elevation</p>
              <p className="text-3xl font-black text-slate-900">{Math.round(100 - elevationStats.sessionBest)}%</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Accuracy</p>
              <p className="text-3xl font-black text-slate-900">{telemetry.metrics.accuracy}%</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Duration</p>
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
              <span className="text-slate-400 text-xs font-bold uppercase tracking-widest mr-3">Popped</span>
              <span className="text-green-600 font-black text-lg">{telemetry.metrics.successfulReps}</span>
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
            {/* Elevation Progress Bar */}
            <div className="absolute left-8 top-1/2 -translate-y-1/2 w-4 h-64 bg-slate-100 rounded-full border border-slate-200 overflow-hidden">
              <div 
                className="absolute bottom-0 left-0 right-0 bg-green-500 transition-all duration-300"
                style={{ height: `${100 - position.y}%` }}
              />
              <div 
                className="absolute bottom-0 left-0 right-0 border-t-2 border-green-700 w-full"
                style={{ height: `${100 - elevationStats.sessionBest}%` }}
              />
            </div>

            {balloon && (
              <div 
                className={`absolute transition-all duration-75 flex items-center justify-center ${feedback === 'pop' ? 'scale-150 opacity-0' : 'scale-100 opacity-100'}`}
                style={{ 
                  left: `${balloon.x}%`, 
                  top: `${balloon.y}%`,
                  width: `${balloon.size}px`,
                  height: `${balloon.size * 1.2}px`,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <div className={`w-full h-full rounded-[50%] flex items-center justify-center shadow-xl border-4 border-white relative ${balloon.isHighValue ? 'bg-amber-400' : 'bg-blue-400'}`}>
                   <Cloud size={balloon.size * 0.5} className="text-white/80" />
                   <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-1 h-8 bg-slate-400/50" />
                </div>
              </div>
            )}
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
          <div className="w-full h-full rounded-full border-4 border-green-500 bg-white/30 backdrop-blur-sm shadow-xl flex items-center justify-center">
            <div className="w-2 h-2 bg-green-600 rounded-full" />
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
                  <span className="text-green-600 font-bold">{settings.sessionLength || 1}m</span>
                </div>
                <input 
                  type="range" min="1" max="5" value={settings.sessionLength || 1} 
                  onChange={(e) => updateSettings({ sessionLength: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-green-600"
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
