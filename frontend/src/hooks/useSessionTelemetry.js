// frontend/src/hooks/useSessionTelemetry.js
import { useState, useCallback, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { sessionApi, reportApi } from '../utils/apiService';
import { sessionDB, reportDB } from '../utils/sessionStore';
import MetricsEngine from '../utils/metricsEngine';
import { GAME_TYPE_MAP } from '../constants/games';

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

// Hard ceiling for saveReport(), independent of any per-request timeout
// inside apiService. Defense-in-depth: even if a future change adds an
// unbounded await somewhere in the save path, this guarantees isSaving
// still resolves and every caller gets a definite result instead of the
// "Saving..." UI hanging indefinitely.
const SAVE_REPORT_HARD_TIMEOUT_MS = 60000;

export function useSessionTelemetry(patientId, gameId) {
  const { token, user, currentPatient, setCurrentSession } = useAppStore();
  const [metrics, setMetrics] = useState(INITIAL_METRICS);
  const [isSaving, setIsSaving] = useState(false);

  const lastPosition = useRef(null);
  const sessionIdRef = useRef(null);
  const metricsEngineRef = useRef(new MetricsEngine());
  const repAnglesRef = useRef([]);
  // True only when sessionIdRef points at a real backend session (not the
  // local_ fallback id). Read at save time to decide whether we need to
  // retry creating the backend session before trying to complete it.
  const backendSessionCreatedRef = useRef(false);
  // Dedup guard for saveReport(). CloudReach.jsx calls into this from up
  // to three independent places for the SAME session — finishSession's
  // endSession(), the DONE-flow auto-save effect, and the "Save & View
  // Report" button in SessionSummary. Without this, all three fire
  // concurrent, non-idempotent network calls that race on sessionIdRef /
  // backendSessionCreatedRef, can each attempt to create a duplicate
  // backend session, and can pile up enough simultaneous requests that
  // later ones sit queued behind earlier ones for minutes — exactly what
  // produced a request stuck in "(pending)" in devtools even though every
  // individual fetch has its own bounded timeout.
  const saveReportInFlightRef = useRef(null);
  const saveReportResultRef = useRef(null);

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
    // New session: a prior session's dedup state must not leak forward,
    // or this session's first real saveReport() call would incorrectly
    // short-circuit to the previous session's cached/in-flight result.
    saveReportInFlightRef.current = null;
    saveReportResultRef.current = null;

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
        backendSessionCreatedRef.current = true;
        setCurrentSession(session);
      } else {
        // Fallback to local session
        sessionIdRef.current = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        backendSessionCreatedRef.current = false;
      }
    } catch (err) {
      console.warn('[useSessionTelemetry] Failed to start session:', err);
      // Fallback to local session
      sessionIdRef.current = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      backendSessionCreatedRef.current = false;
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

  const performSave = useCallback(async (reportData) => {
    try {
      const endTime = Date.now();
      const totalTime = metrics.startTime ? Math.round((endTime - metrics.startTime) / 1000) : 0;

      const finalMetrics = { ...metrics, endTime, totalTime };

      const payload = {
        ...reportData,
        // These computed fields must win over anything (even undefined
        // keys) coming from reportData -- sessionId in particular is the
        // IndexedDB keyPath, so if it ends up undefined here the local
        // save throws DataError and the backend save below never runs.
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
      };

      // Save locally first (always) -- best-effort only. A local
      // IndexedDB failure must never block the backend save below; it
      // used to, because this wasn't wrapped and any throw here skipped
      // straight to the outer catch, meaning sessionApi.publicFinish and
      // reportApi.generate never even ran.
      try {
        await sessionDB.saveSession(payload);
        await reportDB.saveReport(payload);
      } catch (localErr) {
        console.warn('[useSessionTelemetry] Local IndexedDB save failed (non-fatal):', localErr);
      }

      // Try to save to backend if possible
      let savedToBackend = false;
      if (actualPatientId !== 'guest') {
        try {
          const gameType = GAME_TYPE_MAP[gameId] || 'rehab_slicer';

          // The session may have fallen back to a local_ id if start()
          // failed earlier — that id doesn't exist on the backend, so
          // completing against it silently 404s. Retry creating the
          // real backend session now, right before completing, instead
          // of permanently losing this session's data.
          if (!backendSessionCreatedRef.current) {
            try {
              let startRes = null;
              if (isTherapistMode) {
                startRes = await sessionApi.start({ patientId: actualPatientId, gameType });
              } else if (isPatientMode || isPublicMode) {
                startRes = await sessionApi.publicStart({ patientId: actualPatientId, gameType });
              }
              if (startRes?.session) {
                sessionIdRef.current = startRes.session._id;
                backendSessionCreatedRef.current = true;
                setCurrentSession(startRes.session);
              }
            } catch (retryErr) {
              console.warn('[useSessionTelemetry] Retry to create backend session before save failed:', retryErr);
            }
          }

          if (!backendSessionCreatedRef.current) {
            console.warn('[useSessionTelemetry] No backend session available — report saved locally only.');
            throw new Error('no-backend-session');
          }
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

              try {
                await reportApi.generatePublicReport(sessionIdRef.current, actualPatientId);
              } catch (genErr) {
                console.warn('[useSessionTelemetry] Failed to generate backend report:', genErr);
              }
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
        // Lets the UI tell the user "saved locally, will sync later"
        // instead of silently pretending everything reached the server —
        // this is the case a slow/cold backend produces most often.
        backendMessage: savedToBackend
          ? null
          : "Saved on this device. We couldn't reach the server just now — your report will still be here, and syncing will retry automatically.",
      };
    } catch (err) {
      console.error('[useSessionTelemetry] Failed to save report:', err);
      return { success: false, error: err.message };
    }
  }, [metrics, actualPatientId, gameId, isTherapistMode, isPatientMode, isPublicMode, setCurrentSession, currentPatient, user]);

  const saveReport = useCallback(async (reportData) => {
    // A save already completed for this session — every later caller
    // (auto-save effect, manual "Save & View Report" click, etc.) just
    // gets that same result instead of re-hitting the network.
    if (saveReportResultRef.current) {
      return saveReportResultRef.current;
    }
    // A save is already running — join it instead of starting a second,
    // concurrent one against the same backend session.
    if (saveReportInFlightRef.current) {
      return saveReportInFlightRef.current;
    }

    setIsSaving(true);

    const timeoutFallback = new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: false,
          error: 'save-timed-out',
          sessionId: sessionIdRef.current,
          savedToBackend: false,
          backendMessage:
            "Saved on this device. We couldn't reach the server in time — your report will still be here, and syncing will retry automatically.",
        });
      }, SAVE_REPORT_HARD_TIMEOUT_MS);
    });

    const runPromise = (async () => {
      try {
        const result = await Promise.race([performSave(reportData), timeoutFallback]);
        // Only cache/reuse genuine outcomes. A hard-timeout result means
        // performSave() may still be running in the background (it isn't
        // cancelled, just no longer awaited) — don't let a later, real
        // completion get shadowed by a stale cached timeout, and don't
        // prevent a future call from trying again.
        if (result.error !== 'save-timed-out') {
          saveReportResultRef.current = result;
        }
        return result;
      } finally {
        setIsSaving(false);
        saveReportInFlightRef.current = null;
      }
    })();

    saveReportInFlightRef.current = runPromise;
    return runPromise;
  }, [performSave]);

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