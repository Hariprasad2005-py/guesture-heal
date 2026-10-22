// src/pages/GameEngine.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import PrecisionReach from '../games/PrecisionReach';
import RehabSlicer from '../games/RehabSlicer';
import CatchAndFlex from '../games/CatchAndFlex';
import CanvasAir from '../games/CanvasAir';
import CloudReach from '../games/CloudReach';
import PushWall from '../games/PushWall';
import Breathe from '../games/Breathe';
import Summit from '../games/Summit';
import WindowWiper from '../games/WindowWiper';
import CrossRally from '../games/CrossRally';
import Pendulum from '../games/Pendulum';
import Regatta from '../games/Regatta';
import DailyTasks from '../games/DailyTasks';
import RhythmStudio from '../games/RhythmStudio';
import { GAME_IDS, GAME_DISPLAY_NAMES } from '../constants/games';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { preloadPoseAssets } from '../utils/preloadPose';
import { ConfirmReplayModal, DoneForTodayModal } from '../components/rehab/ReplayModals';
import {
  MAX_PLAYS_PER_GAME_PER_DAY,
  getPlaysToday,
  recordPlay,
  beginAttempt,
  getCurrentAttempt,
} from '../utils/dailyPlays';

const GAME_COMPONENTS = {
  [GAME_IDS.PRECISION_REACH]: PrecisionReach,
  [GAME_IDS.REHAB_SLICER]: RehabSlicer,
  [GAME_IDS.CATCH_FLEX]: CatchAndFlex,
  [GAME_IDS.CANVAS_AIR]: CanvasAir,
  [GAME_IDS.CLOUD_REACH]: CloudReach,
  [GAME_IDS.PUSH_WALL]: PushWall,
  [GAME_IDS.BREATHE]: Breathe,
  [GAME_IDS.SUMMIT]: Summit,
  [GAME_IDS.WINDOW_WIPER]: WindowWiper,
  [GAME_IDS.CROSS_RALLY]: CrossRally,
  [GAME_IDS.PENDULUM]: Pendulum,
  [GAME_IDS.REGATTA]: Regatta,
  [GAME_IDS.DAILY_TASKS]: DailyTasks,
  [GAME_IDS.RHYTHM_STUDIO]: RhythmStudio,
};

class GameErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return (
      <div style={{ padding: 24, color: '#fff', background: '#0f172a', minHeight: '100vh' }}>
        <h2 style={{ fontWeight: 800, fontSize: 20 }}>This game hit a problem</h2>
        <p style={{ opacity: 0.8, margin: '8px 0' }}>Please send this message to Laksh/Hari:</p>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#1e293b', padding: 12, borderRadius: 8 }}>{String(this.state.err?.stack || this.state.err)}</pre>
      </div>
    );
    return this.props.children;
  }
}

const GameEngine = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user, token, currentPatient, publicPatientId } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  // 'checking' -> 'open' (first play), 'confirm' (played before today) or 'blocked' (limit reached)
  const [gate, setGate] = useState('checking');
  const [playedToday, setPlayedToday] = useState(0);
  const recordedRef = React.useRef(false);

  // TEST MODE — set when the URL contains ?test=1. Passed down to the
  // game so it can skip telemetry/reports and reset state between runs.
  const isTestMode = new URLSearchParams(window.location.search).get('test') === '1';

  const GameComponent = GAME_COMPONENTS[gameId];
  const gameName = GAME_DISPLAY_NAMES[gameId] || gameId;

  const patientId = currentPatient?.patientId || publicPatientId || user?.patientId || null;

  useEffect(() => {
    if (!gameId || !GameComponent) {
      setError(`Game "${gameId || 'undefined'}" not found`);
      setIsLoading(false);
      return;
    }

    if (!patientId && !token) {
      setError('Please login or register as a patient first');
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
  }, [gameId, GameComponent, patientId, token]);

  // Start downloading the hand-tracking files right away.
  useEffect(() => {
    preloadPoseAssets();
  }, []);

  // Replay rules: the 1st play opens straight away, later plays ask first,
  // and after the daily limit the game stays closed. Test mode skips this.
  useEffect(() => {
    if (!gameId || !GameComponent) return;
    if (isTestMode) {
      setGate('open');
      return;
    }
    const pid = patientId || 'guest';
    const markedDone = new URLSearchParams(window.location.search).get('replay') === '1';
    const plays = Math.max(getPlaysToday(pid, gameId), markedDone ? 1 : 0);
    setPlayedToday(plays);
    if (plays >= MAX_PLAYS_PER_GAME_PER_DAY) setGate('blocked');
    else if (plays >= 1) setGate('confirm');
    else {
      beginAttempt(pid, gameId);
      setGate('open');
    }
  }, [gameId, GameComponent, patientId, isTestMode]);

  const confirmReplay = useCallback(() => {
    beginAttempt(patientId || 'guest', gameId);
    setGate('open');
  }, [patientId, gameId]);

  const showToast = useCallback((message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const handleSessionEnd = useCallback(
    (data) => {
      const { currentSession } = useAppStore.getState();
      const sessionId = currentSession?._id || currentSession?.sessionId || null;

      // Count this finished session toward today's plays of this game (once).
      if (!isTestMode && !recordedRef.current) {
        recordedRef.current = true;
        recordPlay(patientId || 'guest', gameId, sessionId || data?.sessionId);
      }
      const attempt = getCurrentAttempt(gameId);

      navigate('/session-report', {
        state: {
          gameName,
          gameId,
          patientId,
          sessionId,
          attemptNumber: attempt?.attemptNumber ?? null,
          maxAttempts: attempt?.maxAttempts ?? MAX_PLAYS_PER_GAME_PER_DAY,
          ...data,
        },
      });
    },
    [gameId, gameName, navigate, patientId, isTestMode]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-teal-400 animate-spin" />
          <p className="text-slate-400 font-medium">Loading game...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 rounded-2xl p-8 border border-slate-700 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-white mb-2">Something went wrong</h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/games')}
            className="px-6 py-3 bg-teal-600 hover:bg-teal-500 rounded-xl font-bold text-white transition"
          >
            Back to Games
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-950 flex flex-col">      <div className="flex-shrink-0 bg-slate-900/95 border-b border-slate-800 px-4 py-3 flex items-center gap-4 z-50">
        <button
          onClick={() => navigate('/games')}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-white">{gameName || 'Game'}</h1>
          <p className="text-xs text-slate-500">
            Patient: {currentPatient?.name || user?.name || 'Guest'}
          </p>
        </div>
      </div>

      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl font-medium text-white shadow-lg transition-all duration-300 ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-teal-600'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex-1 min-h-0 relative overflow-y-auto overflow-x-hidden">
        {gate === 'confirm' && (
          <ConfirmReplayModal
            gameName={gameName}
            playedToday={playedToday}
            attemptNumber={playedToday + 1}
            maxAttempts={MAX_PLAYS_PER_GAME_PER_DAY}
            onYes={confirmReplay}
            onNo={() => navigate('/games')}
          />
        )}
        {gate === 'blocked' && (
          <DoneForTodayModal
            gameName={gameName}
            maxAttempts={MAX_PLAYS_PER_GAME_PER_DAY}
            onBack={() => navigate('/games')}
          />
        )}
        {gate === 'open' && <GameErrorBoundary><GameComponent
          onSessionEnd={handleSessionEnd}
          onBack={() => navigate('/games')}
          patientId={patientId || 'guest'}
          gameId={gameId}
          isTestMode={isTestMode}
        /></GameErrorBoundary>}
      </div>
    </div>
  );
};

export default GameEngine;