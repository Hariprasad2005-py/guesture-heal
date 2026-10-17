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

// Adaptive session length. Shortly before the timer ends, the game pauses and
// asks the patient how they feel. The PATIENT decides: add time, carry on, or
// finish now. Nothing is changed automatically.
export const CHECKPOINT = {
  atSecondsLeft: 10,   // ask when this many seconds remain
  extendSeconds: 30,   // time added by "I feel good"
  maxExtensions: 2,    // at most this many extensions per session
  minSessionSeconds: 40, // very short sessions (tests, warm-ups) are not interrupted
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

  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [extendedSeconds, setExtendedSeconds] = useState(0);
  const [moodChoice, setMoodChoice] = useState(null); // 'good' | 'ok' | 'tired' | null
  const timeLeftRef = useRef(sessionLength);
  const extensionsRef = useRef(0);
  const checkpointDoneRef = useRef(false);

  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const repTimerRef = useRef(null);

  // Keep latest callbacks in refs so endSession/completeRep stay stable
  // across renders — CanvasAir (and other callers) pass inline arrow
  // functions that change identity every render, which was previously
  // causing the countdown effect below to restart its interval before
  // it ever ticked a full second.
  const endSessionRef = useRef(null);
  const checkpointOpenRef = useRef(false);
  const sessionLengthRef = useRef(sessionLength);
  const onRepCompleteRef = useRef(onRepComplete);
  const onSessionCompleteRef = useRef(onSessionComplete);

  useEffect(() => {
    onRepCompleteRef.current = onRepComplete;
  }, [onRepComplete]);

  useEffect(() => {
    onSessionCompleteRef.current = onSessionComplete;
  }, [onSessionComplete]);

  // One-second tick shared by the first start and every resume.
  const tick = useCallback(() => {
    const next = timeLeftRef.current - 1;
    timeLeftRef.current = Math.max(0, next);
    setTimeLeft(Math.max(0, next));
    if (next <= 0) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      endSessionRef.current?.();
      return;
    }
    if (
      next === CHECKPOINT.atSecondsLeft &&
      !checkpointDoneRef.current &&
      extensionsRef.current < CHECKPOINT.maxExtensions &&
      sessionLengthRef.current >= CHECKPOINT.minSessionSeconds
    ) {
      checkpointDoneRef.current = true;
      clearInterval(timerRef.current);
      timerRef.current = null;
      setIsPaused(true);
      setCheckpointOpen(true);
    }
  }, []);

  const startSession = useCallback(() => {
    setGameState(GAME_STATES.COUNTDOWN);
    setCountdown(3);
    setTimeLeft(sessionLength);
    timeLeftRef.current = sessionLength;
    sessionLengthRef.current = sessionLength;
    extensionsRef.current = 0;
    checkpointDoneRef.current = false;
    setExtendedSeconds(0);
    setMoodChoice(null);
    setCheckpointOpen(false);
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
    if (checkpointOpenRef.current) return; // the checkpoint buttons decide, not Resume
    setIsPaused(false);
    setGameState(GAME_STATES.ACTIVE);
    // Restart timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    timerRef.current = setInterval(tick, 1000);
  }, []);

  const endSession = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setGameState(GAME_STATES.COMPLETE);
    setCheckpointOpen(false);
    onSessionCompleteRef.current?.();
  }, []);
  endSessionRef.current = endSession;

  useEffect(() => { checkpointOpenRef.current = checkpointOpen; }, [checkpointOpen]);

  // Checkpoint answers ---------------------------------------------------
  const closeCheckpointAndResume = useCallback(() => {
    checkpointOpenRef.current = false;
    setCheckpointOpen(false);
    setIsPaused(false);
    setGameState(GAME_STATES.ACTIVE);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(tick, 1000);
  }, [tick]);

  const checkpointExtend = useCallback(() => {
    setMoodChoice('good');
    extensionsRef.current += 1;
    checkpointDoneRef.current = false; // may ask again after this extension
    timeLeftRef.current += CHECKPOINT.extendSeconds;
    setTimeLeft(timeLeftRef.current);
    setExtendedSeconds(x => x + CHECKPOINT.extendSeconds);
    closeCheckpointAndResume();
  }, [closeCheckpointAndResume]);

  const checkpointContinue = useCallback(() => {
    setMoodChoice('ok');
    closeCheckpointAndResume();
  }, [closeCheckpointAndResume]);

  const checkpointFinish = useCallback(() => {
    setMoodChoice('tired');
    endSession();
  }, [endSession]);

  const completeRep = useCallback((success, data = {}) => {
    if (gameState !== GAME_STATES.ACTIVE) return;
    
    onRepCompleteRef.current?.(success, data);
    
    const isRepMode = totalReps > 0;

    if (isRepMode) {
      if (currentRep >= totalReps) {
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
    }
    // Continuous/timer-driven games (totalReps <= 0, e.g. Rehab Slicer)
    // deliberately stay in ACTIVE here — completeRep() is only used for
    // telemetry/audio callbacks in that mode, and the game's own loop
    // (not this rep state machine) paces spawning, movement and misses.
    // Bouncing gameState to FEEDBACK/REST on every hit/miss, as the old
    // unconditional branch did, killed RehabSlicer's requestAnimationFrame
    // loop (gated on gameState === ACTIVE) for ~800ms + restInterval after
    // every single slice or miss — which is why no fruit ever appeared to
    // be falling: the loop was being stopped and restarted almost
    // continuously.
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
            timerRef.current = setInterval(tick, 1000);
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
  }, [gameState, endSession, tick]);

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
    // Seconds actually played, including any time the patient added.
    elapsedSeconds: Math.max(0, sessionLength + extendedSeconds - timeLeft),
    extendedSeconds,
    moodChoice,
    checkpoint: {
      open: checkpointOpen,
      secondsLeft: timeLeft,
      extendSeconds: CHECKPOINT.extendSeconds,
      onExtend: checkpointExtend,
      onContinue: checkpointContinue,
      onFinish: checkpointFinish,
    },
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