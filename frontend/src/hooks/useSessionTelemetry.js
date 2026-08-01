// frontend/src/hooks/useSessionTelemetry.js
//
// Creates the backend session record at START_SESSION time (before the
// first instruction card), stores it in appStore, and gives each game 3
// functions: startSession, saveRep, finishSession.
//
// Branches therapist-vs-public routing on actual role (isTherapist), not
// on token presence, since a logged-in PATIENT also carries a token
// (patient JWT) and must NOT hit the therapist-only routes.
//
// ASSUMPTION TO VERIFY: this assumes sessionApi.start()/publicStart() return
// either the session object directly, or { session: {...} } / { data: {...} }.
// If your backend returns a different shape, adjust the `normalized` line
// below — that's the only place session-shape assumptions live.
//
// ASSUMPTION TO VERIFY: publicStart/publicUpdate/publicFinish expect
// `patientId` in the payload to identify the session owner (no auth header
// is sent for these — see apiService.js, they still get a bearer token if
// one exists, but the backend public routes presumably don't require it).
// If your public routes need a different shape (e.g. sessionId+patientId
// composite key), adjust publicUpdate/publicFinish payloads below.

import { useCallback } from 'react';
import { sessionApi } from '../utils/apiService';
import { useAppStore } from '../store/appStore';


export function useSessionTelemetry({ gameId, gameName }) {
  const { token, user, currentSession, setCurrentSession } = useAppStore();
  const useTherapistRoutes = !!token && user?.role === 'therapist';

  const startSession = useCallback(
    async (patientId) => {
      try {
        const payload = {
          patientId,
          gameId,
          gameName,
          startedAt: new Date().toISOString(),
        };
        const res = useTherapistRoutes
          ? await sessionApi.start(payload)
          : await sessionApi.publicStart(payload);

        const normalized = res?.session || res?.data || res;
        if (normalized && (normalized._id || normalized.sessionId)) {
          // Public routes key sessions by sessionId+patientId; keep patientId
          // on the object so saveRep/finishSession can send it if the
          // backend needs it (see publicUpdate/publicFinish below).
          setCurrentSession({ ...normalized, patientId });
          return normalized;
        }
        console.warn(
          `[Telemetry] ${gameId}: session-start response had no recognizable id — per-rep saves will be skipped this session.`,
          res
        );
        return null;
      } catch (err) {
        console.error(`[Telemetry] ${gameId}: failed to start session:`, err);
        return null;
      }
    },
    [useTherapistRoutes, gameId, gameName, setCurrentSession]
  );

  const saveRep = useCallback(
    async (repPayload) => {
      const sessionId = currentSession?._id || currentSession?.sessionId;
      if (!sessionId) {
        console.warn(`[Telemetry] ${gameId}: no active session, rep not saved.`, repPayload);
        return;
      }
      try {
        if (useTherapistRoutes) {
          await sessionApi.saveRep(sessionId, repPayload);
        } else {
          await sessionApi.publicUpdate({
            sessionId,
            patientId: currentSession?.patientId,
            ...repPayload,
          });
        }
      } catch (err) {
        console.error(`[Telemetry] ${gameId}: failed to save rep:`, err);
      }
    },
    [currentSession, useTherapistRoutes, gameId]
  );

  const finishSession = useCallback(
    async (summary) => {
      const sessionId = currentSession?._id || currentSession?.sessionId;
      if (!sessionId) return null;
      try {
        const res = useTherapistRoutes
          ? await sessionApi.complete(sessionId, summary)
          : await sessionApi.publicFinish({
              sessionId,
              patientId: currentSession?.patientId,
              ...summary,
            });

        // FIX: previously the completed session was never written back to
        // the store, so anything reading currentSession after finish still
        // saw the stale "in_progress" object from startSession. Games call
        // finishSession() without awaiting it (fire-and-forget) then
        // immediately call onSessionEnd -> navigate('/session-report', ...)
        // so SessionReportPage needs a way to eventually see the real,
        // completed session — not just whatever was in the store at
        // start-of-session time.
        const normalized = res?.session || res?.data || res;
        if (normalized && (normalized._id || normalized.sessionId)) {
          setCurrentSession({ ...normalized, patientId: currentSession?.patientId });
        }
        return normalized;
      } catch (err) {
        console.error(`[Telemetry] ${gameId}: failed to finish session:`, err);
        return null;
      }
    },
    [currentSession, useTherapistRoutes, gameId, setCurrentSession]
  );

  return { startSession, saveRep, finishSession, currentSession };
}