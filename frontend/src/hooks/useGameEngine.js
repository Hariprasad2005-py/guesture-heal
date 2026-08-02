import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * useGameEngine.js
 * Shared game-loop/state-machine for rehab games.
 * States: idle, instructions, countdown, active, feedback, rest, complete
 */
export const GAME_STATES = {
  IDLE: 'idle',
  INSTRUCTIONS: 'instructions',
  COUNTDOWN: 'countdown',
  ACTIVE: 'active',
  FEEDBACK: 'feedback',
  REST: 'rest',
  COMPLETE: 'complete'
};

export function useGameEngine({
  totalReps = 10,
  restInterval = 2000,
  onRepComplete,
  onSessionComplete
} = {}) {
  const [gameState, setGameState] = useState(GAME_STATES.INSTRUCTIONS);
  const [currentRep, setCurrentRep] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);

  const startSession = useCallback(() => {
    setGameState(GAME_STATES.COUNTDOWN);
    setCountdown(3);
    setSessionStartTime(Date.now());
  }, []);

  const pauseSession = useCallback(() => setIsPaused(true), []);
  const resumeSession = useCallback(() => setIsPaused(false), []);

  const completeRep = useCallback((success) => {
    if (gameState !== GAME_STATES.ACTIVE) return;
    
    onRepComplete?.(success);
    
    if (currentRep >= totalReps) {
      setGameState(GAME_STATES.COMPLETE);
      onSessionComplete?.();
    } else {
      setGameState(GAME_STATES.FEEDBACK);
      setTimeout(() => {
        setGameState(GAME_STATES.REST);
        setTimeout(() => {
          setCurrentRep(prev => prev + 1);
          setGameState(GAME_STATES.ACTIVE);
        }, restInterval);
      }, 1000);
    }
  }, [gameState, currentRep, totalReps, restInterval, onRepComplete, onSessionComplete]);

  useEffect(() => {
    if (gameState === GAME_STATES.COUNTDOWN) {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setCurrentRep(1);
        setGameState(GAME_STATES.ACTIVE);
      }
    }
  }, [gameState, countdown]);

  return {
    gameState,
    setGameState,
    currentRep,
    countdown,
    isPaused,
    startSession,
    pauseSession,
    resumeSession,
    completeRep,
    sessionStartTime
  };
}
