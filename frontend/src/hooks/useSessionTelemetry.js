import { useState, useCallback, useRef } from 'react';

/**
 * useSessionTelemetry.js
 * Records per-rep and per-session metrics in local state.
 */
export function useSessionTelemetry() {
  const [metrics, setMetrics] = useState({
    reps: [],
    accuracy: 0,
    completionPercentage: 0,
    totalDistance: 0,
    successfulReps: 0,
    totalReps: 0,
    startTime: null,
    endTime: null,
    totalTime: 0
  });

  const lastPosition = useRef(null);

  const startTracking = useCallback(() => {
    setMetrics({
      reps: [],
      accuracy: 0,
      completionPercentage: 0,
      totalDistance: 0,
      successfulReps: 0,
      totalReps: 0,
      startTime: Date.now(),
      endTime: null,
      totalTime: 0
    });
    lastPosition.current = null;
  }, []);

  const trackMovement = useCallback((pos) => {
    if (lastPosition.current && pos) {
      const dx = pos.x - lastPosition.current.x;
      const dy = pos.y - lastPosition.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      setMetrics(prev => ({
        ...prev,
        totalDistance: prev.totalDistance + dist
      }));
    }
    lastPosition.current = pos;
  }, []);

  const recordRep = useCallback((success, data = {}) => {
    setMetrics(prev => {
      const newReps = [...prev.reps, { success, timestamp: Date.now(), ...data }];
      const successful = newReps.filter(r => r.success).length;
      return {
        ...prev,
        reps: newReps,
        successfulReps: successful,
        totalReps: newReps.length,
        accuracy: Math.round((successful / newReps.length) * 100),
      };
    });
  }, []);

  const endSession = useCallback((targetReps) => {
    setMetrics(prev => {
      const endTime = Date.now();
      const totalTime = Math.round((endTime - prev.startTime) / 1000);
      return {
        ...prev,
        endTime,
        totalTime,
        completionPercentage: Math.round((prev.reps.length / targetReps) * 100)
      };
    });
  }, []);

  return {
    metrics,
    startTracking,
    trackMovement,
    recordRep,
    endSession
  };
}
