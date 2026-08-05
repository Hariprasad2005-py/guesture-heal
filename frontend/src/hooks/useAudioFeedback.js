
import { useCallback, useRef } from 'react';

/**
 * useAudioFeedback.js
 * Simple AudioContext beeps for success/miss events.
 */
export function useAudioFeedback(enabled = true) {
  const audioCtxRef = useRef(null);

  const playTone = useCallback((frequency, duration) => {
    if (!enabled) return;

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
      
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + duration);
    } catch (err) {
      console.warn('Audio feedback failed', err);
    }
  }, [enabled]);

  const playSuccess = useCallback(() => playTone(880, 0.1), [playTone]);
  const playMiss = useCallback(() => playTone(220, 0.2), [playTone]);

  return { playSuccess, playMiss };
}


