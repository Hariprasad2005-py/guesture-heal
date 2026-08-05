// frontend/src/hooks/useGameEngine.js
import { useState, useCallback, useEffect, useRef } from 'react';

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
  sessionLength = 60,
  onRepComplete,
  onSessionComplete,
  autoStart = false
} = {}) {
  const [gameState, setGameState] = useState(GAME_STATES.INSTRUCTIONS);
  const [currentRep, setCurrentRep] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(sessionLength);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const repTimerRef = useRef(null);

  // Keep latest callbacks in refs so endSession/completeRep stay stable
  // across renders — CanvasAir (and other callers) pass inline arrow
  // functions that change identity every render, which was previously
  // causing the countdown effect below to restart its interval before
  // it ever ticked a full second.
  const onRepCompleteRef = useRef(onRepComplete);
  const onSessionCompleteRef = useRef(onSessionComplete);

  useEffect(() => {
    onRepCompleteRef.current = onRepComplete;
  }, [onRepComplete]);

  useEffect(() => {
    onSessionCompleteRef.current = onSessionComplete;
  }, [onSessionComplete]);

  const startSession = useCallback(() => {
    setGameState(GAME_STATES.COUNTDOWN);
    setCountdown(3);
    setTimeLeft(sessionLength);
    setCurrentRep(1);
    setElapsedTime(0);
    setSessionStartTime(Date.now());
  }, [sessionLength]);

  const pauseSession = useCallback(() => {
    setIsPaused(true);
    setGameState(GAME_STATES.PAUSED);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resumeSession = useCallback(() => {
    setIsPaused(false);
    setGameState(GAME_STATES.ACTIVE);
    // Restart timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          endSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const endSession = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setGameState(GAME_STATES.COMPLETE);
    onSessionCompleteRef.current?.();
  }, []);

  const completeRep = useCallback((success, data = {}) => {
    if (gameState !== GAME_STATES.ACTIVE) return;
    
    onRepCompleteRef.current?.(success, data);
    
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
  }, [gameState, currentRep, totalReps, restInterval, endSession]);

  // Countdown logic
  useEffect(() => {
    if (gameState === GAME_STATES.COUNTDOWN) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
      
      countdownRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
            setGameState(GAME_STATES.ACTIVE);
            // Start timer
            timerRef.current = setInterval(() => {
              setTimeLeft(prev => {
                if (prev <= 1) {
                  clearInterval(timerRef.current);
                  timerRef.current = null;
                  endSession();
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      
      return () => {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      };
    }
  }, [gameState, endSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  return {
    gameState,
    setGameState,
    currentRep,
    countdown,
    timeLeft,
    isPaused,
    sessionStartTime,
    elapsedTime,
    startSession,
    pauseSession,
    resumeSession,
    completeRep,
    endSession,
    // Helper
    isActive: gameState === GAME_STATES.ACTIVE,
    isComplete: gameState === GAME_STATES.COMPLETE,
    isCountingDown: gameState === GAME_STATES.COUNTDOWN,
  };
}

export default useGameEngine;