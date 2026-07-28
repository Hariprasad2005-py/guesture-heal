import { useState, useEffect, useCallback, useRef } from 'react';

export const GAME_STATES = {
  IDLE: 'idle',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
};

export const useGameEngine = ({
  gameId = 'game',
  duration = 60,
  onComplete = null,
} = {}) => {
  const [state, setState] = useState(GAME_STATES.IDLE);
  const [score, setScore] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(duration);
  const [countdown, setCountdown] = useState(3);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [successes, setSuccesses] = useState(0);
  const [misses, setMisses] = useState(0);
  const [reactionTimes, setReactionTimes] = useState([]);
  const [romValues, setRomValues] = useState([]);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  // Add score
  const addScore = useCallback((points) => {
    setScore((prev) => prev + points);
  }, []);

  // Record attempt
  const recordAttempt = useCallback((success, rom = null, reactionTime = null) => {
    setAttempts((prev) => prev + 1);
    if (success) {
      setSuccesses((prev) => prev + 1);
    } else {
      setMisses((prev) => prev + 1);
    }
    if (rom !== null) {
      setRomValues((prev) => [...prev, rom]);
    }
    if (reactionTime !== null) {
      setReactionTimes((prev) => [...prev, reactionTime]);
    }
  }, []);

  // Complete calibration
  const completeCalibration = useCallback(() => {
    setIsCalibrated(true);
  }, []);

  // Start countdown
  const startCountdown = useCallback(() => {
    setState(GAME_STATES.COUNTDOWN);
    setCountdown(3);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          setState(GAME_STATES.PLAYING);
          setTimeRemaining(duration);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [duration]);

  // Pause game
  const pauseGame = useCallback(() => {
    setState(GAME_STATES.PAUSED);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Resume game
  const resumeGame = useCallback(() => {
    setState(GAME_STATES.PLAYING);
  }, []);

  // Reset game
  const resetGame = useCallback(() => {
    setState(GAME_STATES.IDLE);
    setScore(0);
    setTimeRemaining(duration);
    setCountdown(3);
    setAttempts(0);
    setSuccesses(0);
    setMisses(0);
    setReactionTimes([]);
    setRomValues([]);
    setIsCalibrated(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, [duration]);

  // Game timer
  useEffect(() => {
    if (state !== GAME_STATES.PLAYING) return;

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setState(GAME_STATES.COMPLETED);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  // Handle game completion
  useEffect(() => {
    if (state === GAME_STATES.COMPLETED) {
      const metrics = {
        score,
        accuracy: attempts > 0 ? Math.round((successes / attempts) * 100) : 0,
        attempts,
        successes,
        misses,
        reactionTimes,
        romValues,
        duration,
      };
      onComplete?.(metrics);
    }
  }, [state, score, attempts, successes, misses, reactionTimes, romValues, duration, onComplete]);

  // Calculate progress
  const progress = Math.round(((duration - timeRemaining) / duration) * 100);

  // Calculate metrics
  const metrics = {
    score,
    accuracy: attempts > 0 ? Math.round((successes / attempts) * 100) : 0,
    attempts,
    successes,
    misses,
    reactionTimes,
    romValues,
    duration,
  };

  return {
    state,
    score,
    addScore,
    timeRemaining,
    progress,
    metrics,
    isCalibrated,
    countdown,
    startCountdown,
    pauseGame,
    resumeGame,
    resetGame,
    recordAttempt,
    completeCalibration,
  };
};
