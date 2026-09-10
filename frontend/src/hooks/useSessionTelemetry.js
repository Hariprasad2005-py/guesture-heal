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

const SAVE_REPORT_HARD_TIMEOUT_MS = 60000;

const isNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value);

const firstNumber = (...values) => {
  for (const value of values) {
    if (isNumber(value)) return value;
  }
  return 0;
};

// For metrics a game may genuinely never compute (smoothness, stability,
// maxCombo, stars, level where the game has no real leveling concept).
// Falling back to 0 fabricates a measured clinical value where none
// exists -- 0 is indistinguishable from "measured and zero". null means
// "not supplied"; the Session schema, buildReportForSession, and the
// ReportsPage UI's existing `?? "Not recorded"` pattern already know how
// to render that correctly, as long as it isn't turned into 0 here first.
const firstNumberOrNull = (...values) => {
  for (const value of values) {
    if (isNumber(value)) return value;
  }
  return null;
};

export function useSessionTelemetry(patientId, gameId) {
  const { token, user, currentPatient, setCurrentSession } = useAppStore();

  const [metrics, setMetrics] = useState(INITIAL_METRICS);
  const [isSaving, setIsSaving] = useState(false);

  const lastPosition = useRef(null);
  const sessionIdRef = useRef(null);
  const metricsEngineRef = useRef(new MetricsEngine());
  const repAnglesRef = useRef([]);

  const backendSessionCreatedRef = useRef(false);

  const saveReportInFlightRef = useRef(null);
  const saveReportResultRef = useRef(null);

  const actualPatientId =
    patientId ||
    currentPatient?.patientId ||
    user?.patientId ||
    'guest';

  const isTherapistMode = !!token && user?.role === 'therapist';
  const isPatientMode = !!token && user?.role === 'patient';
  const isPublicMode =
    !isTherapistMode &&
    !isPatientMode &&
    actualPatientId !== 'guest';

  const startTracking = useCallback(async () => {
    setMetrics({
      ...INITIAL_METRICS,
      startTime: Date.now(),
    });

    lastPosition.current = null;
    sessionIdRef.current = null;
    repAnglesRef.current = [];
    metricsEngineRef.current = new MetricsEngine();

    // IMPORTANT: reset backend state for every new session.
    backendSessionCreatedRef.current = false;

    saveReportInFlightRef.current = null;
    saveReportResultRef.current = null;

    const gameType =
      GAME_TYPE_MAP[gameId] || 'rehab_slicer';

    if (actualPatientId === 'guest') {
      sessionIdRef.current =
        `local_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

      return;
    }

    try {
      let res = null;

      if (isTherapistMode) {
        res = await sessionApi.start({
          patientId: actualPatientId,
          gameType,
        });
      } else if (isPatientMode || isPublicMode) {
        res = await sessionApi.publicStart({
          patientId: actualPatientId,
          gameType,
        });
      }

      const session = res?.session;

      if (session) {
        sessionIdRef.current = session._id;
        backendSessionCreatedRef.current = true;
        setCurrentSession(session);
      } else {
        sessionIdRef.current =
          `local_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;

        backendSessionCreatedRef.current = false;
      }
    } catch (err) {
      console.warn(
        '[useSessionTelemetry] Failed to start session:',
        err
      );

      sessionIdRef.current =
        `local_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

      backendSessionCreatedRef.current = false;
    }
  }, [
    actualPatientId,
    gameId,
    isTherapistMode,
    isPatientMode,
    isPublicMode,
    setCurrentSession,
  ]);

  const trackMovement = useCallback((pos) => {
    if (!pos) return;

    if (lastPosition.current) {
      const dx = pos.x - lastPosition.current.x;
      const dy = pos.y - lastPosition.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      setMetrics((prev) => ({
        ...prev,
        totalDistance: prev.totalDistance + dist,
      }));
    }

    lastPosition.current = pos;
  }, []);

  const trackAngle = useCallback((angleDeg) => {
    if (!isNumber(angleDeg)) return;

    setMetrics((prev) => {
      const minAngle =
        prev.minAngle === null
          ? angleDeg
          : Math.min(prev.minAngle, angleDeg);

      const maxAngle =
        prev.maxAngle === null
          ? angleDeg
          : Math.max(prev.maxAngle, angleDeg);

      return {
        ...prev,
        minAngle,
        maxAngle,
        romRange: Math.round(maxAngle - minAngle),
      };
    });

    repAnglesRef.current.push(angleDeg);

    if (repAnglesRef.current.length > 100) {
      repAnglesRef.current =
        repAnglesRef.current.slice(-100);
    }
  }, []);

  const trackPain = useCallback((papsScore) => {
    if (!isNumber(papsScore)) return;

    setMetrics((prev) => ({
      ...prev,
      painFluctuations: [
        ...prev.painFluctuations,
        {
          papsScore,
          timestamp: Date.now(),
        },
      ],
    }));
  }, []);

  const recordRep = useCallback((success, data = {}) => {
    const repAngles = [...repAnglesRef.current];

    const repRom =
      repAngles.length > 0
        ? Math.max(...repAngles) - Math.min(...repAngles)
        : 0;

    repAnglesRef.current = [];

    setMetrics((prev) => {
      const newReps = [
        ...prev.reps,
        {
          success: !!success,
          timestamp: Date.now(),
          rom: repRom,
          angles: repAngles,
          ...data,
        },
      ];

      const successful = newReps.filter(
        (r) => r.success
      ).length;

      const total = newReps.length;

      return {
        ...prev,
        reps: newReps,
        successfulReps: successful,
        totalReps: total,
        accuracy:
          total > 0
            ? Math.round((successful / total) * 100)
            : 0,
        completionPercentage:
          total > 0
            ? Math.round((successful / total) * 100)
            : 0,
      };
    });
  }, []);

  const performSave = useCallback(
    async (reportData = {}) => {
      try {
        const endTime = Date.now();

        const totalTime = metrics.startTime
          ? Math.max(
            0,
            Math.round(
              (endTime - metrics.startTime) / 1000
            )
          )
          : 0;

        const finalMetrics = {
          ...metrics,
          endTime,
          totalTime,
        };

        /*
         * IMPORTANT:
         * Values supplied by the actual game are preferred.
         * Generic telemetry is only a fallback.
         */

        const actualAccuracy = firstNumber(
          reportData.accuracy,
          reportData.accuracyPercent,
          finalMetrics.accuracy
        );

        const actualScore = firstNumber(
          reportData.score
        );

        const actualLevel = firstNumberOrNull(
          reportData.level
        );

        const actualCombo = firstNumber(
          reportData.combo
        );

        const actualMaxCombo = firstNumberOrNull(
          reportData.maxCombo
        );

        const actualStars = firstNumberOrNull(
          reportData.stars
        );

        const actualSmoothness = firstNumberOrNull(
          reportData.smoothness,
          reportData.movementSmoothness,
          reportData.movementQuality
        );

        const actualStability = firstNumberOrNull(
          reportData.stability,
          reportData.movementStability
        );

        /*
         * Prefer game-generated exercise results.
         * Only construct a fallback result when the game didn't provide one.
         */
        const suppliedExerciseResults =
          Array.isArray(reportData.exerciseResults)
            ? reportData.exerciseResults
            : null;

        const fallbackExerciseResult = {
          exerciseId: gameId,
          name:
            reportData.gameName ||
            reportData.exerciseName ||
            gameId,
          setsCompleted: 1,
          repsCompleted: finalMetrics.totalReps,
          averageRom: finalMetrics.romRange,
          maxRom:
            finalMetrics.maxAngle !== null
              ? finalMetrics.maxAngle
              : 0,
          accuracy: actualAccuracy,
          score: actualScore,
        };

        const exerciseResults =
          suppliedExerciseResults &&
            suppliedExerciseResults.length > 0
            ? suppliedExerciseResults
            : [fallbackExerciseResult];

        /*
         * Prefer game-provided ROM data.
         * Generic telemetry is fallback only.
         */
        const actualRomData =
          reportData.romData &&
            typeof reportData.romData === 'object'
            ? reportData.romData
            : {
              averageRomDegrees: finalMetrics.romRange,
              maxRomDegrees:
                finalMetrics.maxAngle !== null
                  ? finalMetrics.maxAngle
                  : 0,
              minRomDegrees:
                finalMetrics.minAngle !== null
                  ? finalMetrics.minAngle
                  : 0,
              perRep: finalMetrics.reps.map((r, i) => ({
                rep: i + 1,
                romDegrees: isNumber(r.rom)
                  ? r.rom
                  : 0,
                success: !!r.success,
                timestamp: r.timestamp,
              })),
            };

        const actualRepData =
          Array.isArray(reportData.repData)
            ? reportData.repData
            : Array.isArray(reportData.gameSpecific?.repData)
              ? reportData.gameSpecific.repData
              : Array.isArray(reportData.gameSpecific?.fullMetrics?.repData)
                ? reportData.gameSpecific.fullMetrics.repData
                : finalMetrics.reps;

        // Precision Reach backend validation requires exerciseId on every rep.
        // Add it only for Precision Reach so other games keep their existing
        // telemetry structure untouched.
        const normalizedRepData =
          gameId === 'precision-reach'
            ? actualRepData.map((rep) => ({
              ...rep,
              exerciseId: rep.exerciseId || gameId,
            }))
            : actualRepData;

        const actualPainFluctuations =
          Array.isArray(reportData.painFluctuations)
            ? reportData.painFluctuations
            : finalMetrics.painFluctuations;

        const gameSpecific =
          reportData.gameSpecific &&
            typeof reportData.gameSpecific === 'object'
            ? reportData.gameSpecific
            : {};

        const payload = {
          ...reportData,

          sessionId:
            sessionIdRef.current ||
            `local_${Date.now()}`,

          gameId,
          patientId: actualPatientId,

          patientName:
            currentPatient?.name ||
            user?.name ||
            'Guest',

          date: new Date().toISOString(),

          durationSeconds:
            isNumber(reportData.durationSeconds)
              ? reportData.durationSeconds
              : totalTime,

          score: actualScore,

          accuracyPercent: actualAccuracy,

          level: actualLevel,

          combo: actualCombo,

          maxCombo: actualMaxCombo,

          stars: actualStars,

          smoothness: actualSmoothness,

          stability: actualStability,

          exerciseResults,

          romData: actualRomData,

          reps:
            Array.isArray(actualRepData)
              ? actualRepData.length
              : firstNumber(
                reportData.reps,
                finalMetrics.totalReps
              ),

          hitsOrCatchesOrCompletions:
            firstNumber(
              reportData.hitsOrCatchesOrCompletions,
              reportData.successfulReps,
              finalMetrics.successfulReps
            ),

          missesOrDrops:
            firstNumber(
              reportData.missesOrDrops,
              reportData.missedActions,
              Math.max(
                0,
                firstNumber(
                  reportData.reps,
                  finalMetrics.totalReps
                ) -
                firstNumber(
                  reportData.hitsOrCatchesOrCompletions,
                  reportData.successfulReps,
                  finalMetrics.successfulReps
                )
              )
            ),

          repData: normalizedRepData,

          gameSpecific,

          gameSpecificMetrics: gameSpecific,

          painFluctuations: actualPainFluctuations,
        };

        /*
         * Local persistence is best effort.
         */
        try {
          await sessionDB.saveSession(payload);
          await reportDB.saveReport(payload);
        } catch (localErr) {
          console.warn(
            '[useSessionTelemetry] Local IndexedDB save failed:',
            localErr
          );
        }

        let savedToBackend = false;

        if (actualPatientId !== 'guest') {
          try {
            const gameType =
              GAME_TYPE_MAP[gameId] ||
              'rehab_slicer';

            /*
             * Re-create backend session if the initial start failed.
             */
            if (!backendSessionCreatedRef.current) {
              try {
                let startRes = null;

                if (isTherapistMode) {
                  startRes = await sessionApi.start({
                    patientId: actualPatientId,
                    gameType,
                  });
                } else if (
                  isPatientMode ||
                  isPublicMode
                ) {
                  startRes =
                    await sessionApi.publicStart({
                      patientId: actualPatientId,
                      gameType,
                    });
                }

                if (startRes?.session) {
                  sessionIdRef.current =
                    startRes.session._id;

                  backendSessionCreatedRef.current =
                    true;

                  setCurrentSession(
                    startRes.session
                  );
                }
              } catch (retryErr) {
                console.warn(
                  '[useSessionTelemetry] Failed to recreate backend session:',
                  retryErr
                );
              }
            }

            if (!backendSessionCreatedRef.current) {
              throw new Error(
                'no-backend-session'
              );
            }

            /*
             * THIS is the important backend payload.
             * Do not manufacture gameplay values here.
             */
            const completePayload = {
              score: actualScore,

              level: actualLevel,

              accuracy: actualAccuracy,

              combo: actualCombo,

              maxCombo: actualMaxCombo,

              stars: actualStars,

              smoothness: actualSmoothness,

              stability: actualStability,

              exerciseResults,

              durationSeconds:
                payload.durationSeconds,

              gameType,

              romData: actualRomData,

              repData: normalizedRepData,

              missedActions:
                payload.missesOrDrops,

              painFluctuations:
                actualPainFluctuations,

              gameSpecific,

              notes:
                typeof reportData.notes === 'string'
                  ? reportData.notes
                  : '',
            };

            let finish;

            if (isTherapistMode) {
              finish = sessionApi.complete(
                sessionIdRef.current,
                completePayload
              );
            } else if (
              isPatientMode ||
              isPublicMode
            ) {
              finish =
                sessionApi.publicFinish({
                  patientId: actualPatientId,
                  sessionId:
                    sessionIdRef.current,
                  ...completePayload,
                });
            }

            if (finish) {
              const res = await finish;

              if (res?.session) {
                setCurrentSession(res.session);
                savedToBackend = true;

                /*
                 * Generate report ONLY after the final session
                 * has been successfully saved.
                 */
                try {
                  await reportApi.regeneratePublic(
                    sessionIdRef.current,
                    actualPatientId
                  );
                } catch (genErr) {
                  console.warn(
                    '[useSessionTelemetry] Failed to generate backend report:',
                    genErr
                  );
                }
              }
            }
          } catch (err) {
            console.warn(
              '[useSessionTelemetry] Failed to save to backend:',
              err
            );
          }
        }

        return {
          success: true,
          sessionId: sessionIdRef.current,
          savedToBackend,
          reportId:
            payload.reportId ||
            payload.sessionId,

          backendMessage: savedToBackend
            ? null
            : "Saved on this device. We couldn't reach the server just now — your report will still be here, and syncing will retry automatically.",
        };
      } catch (err) {
        console.error(
          '[useSessionTelemetry] Failed to save report:',
          err
        );

        return {
          success: false,
          error: err.message,
        };
      }
    },
    [
      metrics,
      actualPatientId,
      gameId,
      isTherapistMode,
      isPatientMode,
      isPublicMode,
      setCurrentSession,
      currentPatient,
      user,
    ]
  );

  const saveReport = useCallback(
    async (reportData = {}) => {
      if (saveReportResultRef.current) {
        return saveReportResultRef.current;
      }

      if (saveReportInFlightRef.current) {
        return saveReportInFlightRef.current;
      }

      setIsSaving(true);

      const timeoutFallback = new Promise(
        (resolve) => {
          setTimeout(() => {
            resolve({
              success: false,
              error: 'save-timed-out',
              sessionId:
                sessionIdRef.current,
              savedToBackend: false,
              backendMessage:
                "Saved on this device. We couldn't reach the server in time — your report will still be here, and syncing will retry automatically.",
            });
          }, SAVE_REPORT_HARD_TIMEOUT_MS);
        }
      );

      const runPromise = (async () => {
        try {
          const result = await Promise.race([
            performSave(reportData),
            timeoutFallback,
          ]);

          if (
            result.error !== 'save-timed-out'
          ) {
            saveReportResultRef.current =
              result;
          }

          return result;
        } finally {
          setIsSaving(false);
          saveReportInFlightRef.current = null;
        }
      })();

      saveReportInFlightRef.current =
        runPromise;

      return runPromise;
    },
    [performSave]
  );

  const endSession = useCallback(
    async (customMetrics = {}) => {
      return await saveReport(customMetrics);
    },
    [saveReport]
  );

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