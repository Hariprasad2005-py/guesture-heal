// frontend/src/pages/GameEngine.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { sessionApi } from '../utils/apiService';
import PrecisionReach from '../games/PrecisionReach';
import RehabSlicer from '../games/RehabSlicer';
import CloudReach from '../games/CloudReach';
import CatchFlex from '../games/CatchFlex';
import CanvasAir from '../games/CanvasAir';
import { ArrowLeft, Loader2 } from 'lucide-react';

const GAME_COMPONENTS = {
  'precision-reach': PrecisionReach,
  'rehab-slicer': RehabSlicer,
  'cloud-reach': CloudReach,
  'catch-flex': CatchAndFlex,
  'canvas-air': CanvasAir,
};

const GAME_NAMES = {
  'precision-reach': 'Precision Reach',
  'rehab-slicer': 'Rehab Slicer',
  'cloud-reach': 'Cloud Reach',
  'catch-flex': 'Catch & Flex',
  'canvas-air': 'Canvas Air',
};

const GameEngine = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const GameComponent = GAME_COMPONENTS[gameId];
  const gameName = GAME_NAMES[gameId];
  const patientId = user?._id;

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

  const showToast = useCallback((message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const handleSessionEnd = useCallback(async (data) => {
    try {
      const payload = {
        patientId,
        gameId,
        ...data,
        timestamp: new Date().toISOString(),
      };

      if (token) {
        await sessionApi.start(payload);
      }

      navigate('/session-report', {
        state: {
          gameName,
          gameId,
          ...data,
        },
      });
    } catch (err) {
      console.error('Failed to save session:', err);
      showToast('Failed to save session results. Please try again.', 'error');
      navigate('/session-report', {
        state: {
          gameName,
          gameId,
          ...data,
          _saveError: err.message,
        },
      });
    }
  }, [patientId, gameId, gameName, navigate, token, showToast]);

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
    <div className="fixed inset-0 bg-slate-950 flex flex-col">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-slate-900/95 border-b border-slate-800 px-4 py-3 flex items-center gap-4 z-50">
        <button
          onClick={() => navigate('/games')}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-white">{gameName || 'Game'}</h1>
          <p className="text-xs text-slate-500">
            Patient: {user?.name || 'Guest'}
          </p>
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl font-medium text-white shadow-lg transition-all duration-300 ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-teal-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Game component */}
      <div className="flex-1 relative overflow-hidden">
        <GameComponent
          onSessionEnd={handleSessionEnd}
          patientId={patientId || 'guest'}
          gameId={gameId}
        />
      </div>
    </div>
  );
};

export default GameEngine;