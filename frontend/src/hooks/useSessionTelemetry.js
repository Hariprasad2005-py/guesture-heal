// frontend/src/hooks/useSessionTelemetry.js
import { useState, useCallback, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { sessionApi, reportApi } from '../utils/apiService';
import { sessionDB, reportDB } from '../utils/sessionStore';
import MetricsEngine from '../utils/metricsEngine';

const GAME_TYPE_MAP = {
  'precision-reach': 'precision_reach',
  'rehab-slicer': 'rehab_slicer',
  'catch-flex': 'catch_flex',
  'canvas-air': 'canvas_air',
};

const INITIAL_METRICS = {
  reps: [],
  accuracy: 0,
  completionPercentage: 0,
  totalDistance: 0,
  successfulReps: 0,
  totalReps: 0,
  startTime: null,
  endTime: null,
  totalTime: 0,
  minAngle: null,
  maxAngle: null,
  romRange: 0,
  painFluctuations: [],
  gameSpecific: {},
};

export function useSessionTelemetry(patientId, gameId) {
  const { token, user, currentPatient, setCurrentSession } = useAppStore();
  const [metrics, setMetrics] = useState(INITIAL_METRICS);
  const [isSaving, setIsSaving] = useState(false);

  const lastPosition = useRef(null);
  const sessionIdRef = useRef(null);
  const metricsEngineRef = useRef(new MetricsEngine());
  const repAnglesRef = useRef([]);

  // Get actual patient ID from store if not provided
  const actualPatientId = patientId || currentPatient?.patientId || user?.patientId || 'guest';
  
  // Check if user is authenticated
  const isTherapistMode = !!token && user?.role === 'therapist';
  const isPatientMode = !!token && user?.role === 'patient';
  const isPublicMode = !isTherapistMode && !isPatientMode && actualPatientId !== 'guest';

  const startTracking = useCallback(async () => {
    setMetrics({ ...INITIAL_METRICS, startTime: Date.now() });
    lastPosition.current = null;
    sessionIdRef.current = null;
    repAnglesRef.current = [];
    metricsEngineRef.current = new MetricsEngine();

    const gameType = GAME_TYPE_MAP[gameId] || 'rehab_slicer';
    
    // Guest mode - use local session only
    if (actualPatientId === 'guest') {
      sessionIdRef.current = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return;
    }

    try {
      let res = null;
      if (isTherapistMode) {
        res = await sessionApi.start({ 
          patientId: actualPatientId, 
          gameType 
        });
      } else if (isPatientMode || isPublicMode) {
        res = await sessionApi.publicStart({ 
          patientId: actualPatientId, 
          gameType 
        });
      }
      
      const session = res?.session;
      if (session) {
        sessionIdRef.current = session._id;
        setCurrentSession(session);
      } else {
        // Fallback to local session
        sessionIdRef.current = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
    } catch (err) {
      console.warn('[useSessionTelemetry] Failed to start session:', err);
      // Fallback to local session
      sessionIdRef.current = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }, [actualPatientId, gameId, isTherapistMode, isPatientMode, isPublicMode, setCurrentSession]);

  const trackMovement = useCallback((pos) => {
    if (!pos) return;
    if (lastPosition.current && pos) {
      const dx = pos.x - lastPosition.current.x;
      const dy = pos.y - lastPosition.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      setMetrics((prev) => ({ ...prev, totalDistance: prev.totalDistance + dist }));
    }
    lastPosition.current = pos;
  }, []);

  const trackAngle = useCallback((angleDeg) => {
    if (typeof angleDeg !== 'number' || Number.isNaN(angleDeg)) return;
    
    setMetrics((prev) => {
      const minAngle = prev.minAngle === null ? angleDeg : Math.min(prev.minAngle, angleDeg);
      const maxAngle = prev.maxAngle === null ? angleDeg : Math.max(prev.maxAngle, angleDeg);
      return { ...prev, minAngle, maxAngle, romRange: Math.round(maxAngle - minAngle) };
    });

    repAnglesRef.current.push(angleDeg);
    if (repAnglesRef.current.length > 100) {
      repAnglesRef.current = repAnglesRef.current.slice(-100);
    }
  }, []);

  const trackPain = useCallback((papsScore) => {
    setMetrics(prev => ({
      ...prev,
      painFluctuations: [...prev.painFluctuations, { papsScore, timestamp: Date.now() }]
    }));
  }, []);

  const recordRep = useCallback((success, data = {}) => {
    const repAngles = repAnglesRef.current;
    const repRom = repAngles.length > 0 ? 
      Math.max(...repAngles) - Math.min(...repAngles) : 0;
    
    repAnglesRef.current = [];

    setMetrics((prev) => {
      const newReps = [...prev.reps, { 
        success, 
        timestamp: Date.now(), 
        rom: repRom,
        angles: repAngles,
        ...data 
      }];
      const successful = newReps.filter((r) => r.success).length;
      return {
        ...prev,
        reps: newReps,
        successfulReps: successful,
        totalReps: newReps.length,
        accuracy: Math.round((successful / newReps.length) * 100),
        completionPercentage: Math.round((successful / Math.max(prev.totalReps, 1)) * 100),
      };
    });
  }, []);

  const saveReport = useCallback(async (reportData) => {
    setIsSaving(true);
    try {
      const endTime = Date.now();
      const totalTime = metrics.startTime ? Math.round((endTime - metrics.startTime) / 1000) : 0;
      
      const finalMetrics = { ...metrics, endTime, totalTime };
      
      const payload = {
        sessionId: sessionIdRef.current || `local_${Date.now()}`,
        gameId: gameId,
        patientId: actualPatientId,
        patientName: currentPatient?.name || user?.name || 'Guest',
        date: new Date().toISOString(),
        durationSeconds: totalTime,
        score: reportData.score || 0,
        accuracyPercent: finalMetrics.accuracy || 0,
        romData: {
          averageRomDegrees: finalMetrics.romRange || 0,
          maxRomDegrees: finalMetrics.maxAngle || 0,
          minRomDegrees: finalMetrics.minAngle || 0,
          perRep: finalMetrics.reps.map((r, i) => ({ 
            rep: i + 1, 
            romDegrees: r.rom || 0,
            success: r.success,
            timestamp: r.timestamp,
          })),
        },
        reps: finalMetrics.totalReps || 0,
        hitsOrCatchesOrCompletions: finalMetrics.successfulReps || 0,
        missesOrDrops: (finalMetrics.totalReps || 0) - (finalMetrics.successfulReps || 0),
        gameSpecificMetrics: reportData.gameSpecific || {},
        painFluctuations: finalMetrics.painFluctuations,
        ...reportData,
      };

      // Save locally first (always)
      await sessionDB.saveSession(payload);
      await reportDB.saveReport(payload);

      // Try to save to backend if possible
      let savedToBackend = false;
      if (sessionIdRef.current && actualPatientId !== 'guest') {
        try {
          const gameType = GAME_TYPE_MAP[gameId] || 'rehab_slicer';
          const completePayload = {
            score: payload.score,
            level: reportData.level || 1,
            accuracy: payload.accuracyPercent,
            combo: reportData.combo || 0,
            maxCombo: reportData.maxCombo || 0,
            stars: reportData.stars || 0,
            exerciseResults: [
              {
                exerciseId: gameId,
                name: reportData.gameName || gameId,
                setsCompleted: 1,
                repsCompleted: payload.reps,
                averageRom: payload.romData.averageRomDegrees,
                maxRom: payload.romData.maxRomDegrees,
                accuracy: payload.accuracyPercent,
                score: payload.score,
              },
            ],
            durationSeconds: payload.durationSeconds,
            gameType,
            romData: payload.romData,
            missedActions: payload.missesOrDrops,
            painFluctuations: finalMetrics.painFluctuations,
            notes: '',
          };

          let finish;
          if (isTherapistMode) {
            finish = sessionApi.complete(sessionIdRef.current, completePayload);
          } else if (isPatientMode || isPublicMode) {
            finish = sessionApi.publicFinish({ 
              patientId: actualPatientId, 
              sessionId: sessionIdRef.current, 
              ...completePayload 
            });
          }

          if (finish) {
            const res = await finish;
            if (res?.session) {
              setCurrentSession(res.session);
              savedToBackend = true;
            }
          }
        } catch (err) {
          console.warn('[useSessionTelemetry] Failed to save to backend:', err);
        }
      }

      return { 
        success: true, 
        sessionId: sessionIdRef.current, 
        savedToBackend,
        reportId: payload.reportId || payload.sessionId,
      };
    } catch (err) {
      console.error('[useSessionTelemetry] Failed to save report:', err);
      return { success: false, error: err.message };
    } finally {
      setIsSaving(false);
    }
  }, [metrics, actualPatientId, gameId, isTherapistMode, isPatientMode, isPublicMode, setCurrentSession, currentPatient, user]);

  const endSession = useCallback(async (customMetrics = {}) => {
    return await saveReport(customMetrics);
  }, [saveReport]);

  return {
    metrics,
    startTracking,
    trackMovement,
    trackAngle,
    trackPain,
    recordRep,
    endSession,
    saveReport,
    isSaving,
    get sessionId() {
      return sessionIdRef.current;
    },
    get patientId() {
      return actualPatientId;
    },
  };
}

export default useSessionTelemetry;