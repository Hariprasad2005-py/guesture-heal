import { useCallback, useRef } from 'react';

export const useAudioFeedback = () => {
  const audioContextRef = useRef(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const playTone = useCallback((frequency = 440, duration = 0.1, volume = 0.3) => {
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = frequency;
      gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (err) {
      console.warn('Audio playback failed:', err);
    }
  }, [getAudioContext]);

  const playSuccess = useCallback(() => {
    // Play ascending tone sequence
    playTone(523.25, 0.1, 0.3); // C5
    setTimeout(() => playTone(659.25, 0.1, 0.3), 100); // E5
    setTimeout(() => playTone(783.99, 0.2, 0.3), 200); // G5
  }, [playTone]);

  const playMiss = useCallback(() => {
    // Play descending tone
    playTone(349.23, 0.1, 0.2); // F4
    setTimeout(() => playTone(293.66, 0.2, 0.2), 100); // D4
  }, [playTone]);

  const playGameStart = useCallback(() => {
    playTone(440, 0.15, 0.3);
    setTimeout(() => playTone(440, 0.15, 0.3), 150);
  }, [playTone]);

  const playGameEnd = useCallback(() => {
    playTone(523.25, 0.2, 0.3);
    setTimeout(() => playTone(659.25, 0.2, 0.3), 200);
    setTimeout(() => playTone(783.99, 0.3, 0.3), 400);
  }, [playTone]);

  const playCalibrationComplete = useCallback(() => {
    playTone(440, 0.1, 0.25);
    setTimeout(() => playTone(523.25, 0.1, 0.25), 100);
    setTimeout(() => playTone(659.25, 0.15, 0.25), 200);
  }, [playTone]);

  return {
    playTone,
    playSuccess,
    playMiss,
    playGameStart,
    playGameEnd,
    playCalibrationComplete,
  };
};
