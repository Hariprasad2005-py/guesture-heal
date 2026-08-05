
import { useState, useCallback } from 'react';

/**
 * useRehabSession.js
 * Owns session-level state: difficulty, therapist settings, and control flags.
 */
export function useRehabSession() {
  const [difficulty, setDifficulty] = useState('Beginner'); // Beginner, Intermediate, Advanced
  const [settings, setSettings] = useState({
    reps: 10,
    holdDuration: 3, // seconds
    movementRange: 50, // percentage of screen
    sessionLength: 60, // seconds
    restInterval: 2000, // milliseconds
  });
  const [isPaused, setIsPaused] = useState(false);

  const updateSettings = useCallback((newSettings) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const changeDifficulty = useCallback((level) => {
    setDifficulty(level);
    // Adjust settings based on difficulty
    if (level === 'Beginner') {
      updateSettings({ holdDuration: 3, movementRange: 40, restInterval: 3000 });
    } else if (level === 'Intermediate') {
      updateSettings({ holdDuration: 4, movementRange: 60, restInterval: 2000 });
    } else if (level === 'Advanced') {
      updateSettings({ holdDuration: 5, movementRange: 80, restInterval: 1500 });
    }
  }, [updateSettings]);

  const togglePause = useCallback(() => setIsPaused(p => !p), []);

  return {
    difficulty,
    settings,
    isPaused,
    changeDifficulty,
    updateSettings,
    togglePause,
    setIsPaused
  };
}


