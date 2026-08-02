import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * useGameEngine.js
 * Shared game-loop/state-machine for rehab games.
 * Supports both repetition-based and time-based (60s) sessions.
 */
export const GAME_STATES = {
  IDLE: 'idle',
  INSTRUCTIONS: 'instructions',
  COUNTDOWN: 'countdown',
  ACTIVE: 'active',
  PAUSED: 'paused',
  FEEDBACK: 'feedback',
  REST: 'rest',
  COMPLETE: 'complete'
};

export function useGameEngine({
  totalReps = 10,
  restInterval = 2000,
  sessionLength = 60, // Default 60 seconds per spec
  onRepComplete,
  onSessionComplete
} = {}) {
  const [gameState, setGameState] = useState(GAME_STATES.INSTRUCTIONS);
  const [currentRep, setCurrentRep] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(sessionLength);
  const [isPaused, setIsPaused] = useState(false);

  const startSession = useCallback(() => {
    setGameState(GAME_STATES.COUNTDOWN);
    setCountdown(3);
    setTimeLeft(sessionLength);
    setCurrentRep(1);
  }, [sessionLength]);

  const pauseSession = useCallback(() => {
    setIsPaused(true);
    setGameState(GAME_STATES.PAUSED);
  }, []);

  const resumeSession = useCallback(() => {
    setIsPaused(false);
    setGameState(GAME_STATES.ACTIVE);
  }, []);

  const endSession = useCallback(() => {
    setGameState(GAME_STATES.COMPLETE);
    onSessionComplete?.();
  }, [onSessionComplete]);

  const completeRep = useCallback((success, data = {}) => {
    if (gameState !== GAME_STATES.ACTIVE) return;
    
    onRepComplete?.(success, data);
    
    // In timed mode, we just increment reps and move to next object
    // In rep mode, we check against totalReps
    const isRepMode = totalReps > 0;
    
    if (isRepMode && currentRep >= totalReps) {
      endSession();
    } else {
      setGameState(GAME_STATES.FEEDBACK);
      setTimeout(() => {
        if (gameState === GAME_STATES.COMPLETE) return;
        setGameState(GAME_STATES.REST);
        setTimeout(() => {
          if (gameState === GAME_STATES.COMPLETE) return;
          setCurrentRep(prev => prev + 1);
          setGameState(GAME_STATES.ACTIVE);
        }, restInterval);
      }, 800);
    }
  }, [gameState, currentRep, totalReps, restInterval, onRepComplete, endSession]);

  // Countdown logic
  useEffect(() => {
    if (gameState === GAME_STATES.COUNTDOWN) {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setGameState(GAME_STATES.ACTIVE);
      }
    }
  }, [gameState, countdown]);

  // Global Session Timer (60s)
  useEffect(() => {
    if (gameState === GAME_STATES.ACTIVE && !isPaused) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            endSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState, isPaused, endSession]);

  return {
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
  };
}
