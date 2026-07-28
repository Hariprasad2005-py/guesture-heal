import { useCallback, useEffect, useRef, useState } from 'react';
import { AdaptiveDifficultyEngine } from '../engine/AdaptiveDifficultyEngine';
import { SessionLogger, persistSessionLocally } from '../engine/SessionLogger';
import { useFacialPainDetection } from './useFacialPainDetection';
import { usePostureGuidance } from './usePostureGuidance';

const REST_PERIOD_MS = 8000;

export function useRehabSession({ gameId, patientId, postureRules = [], therapistOverrides = {} }) {
  const videoRef = useRef(null);
  const engineRef = useRef(null);
  const loggerRef = useRef(null);
  const restTimeoutRef = useRef(null);

  const [phase, setPhase] = useState('instructions');
  const [mode, setMode] = useState('beginner');
  const [canResumeAfterRest, setCanResumeAfterRest] = useState(false);
  const [tickSignal, setTickSignal] = useState(0);

  const sensingEnabled = phase !== 'instructions' && phase !== 'difficulty';

  const handleAdjustment = useCallback((entry) => {
    loggerRef.current?.recordDifficultyChange(entry);
    setTickSignal((t) => t + 1);
  }, []);

  const handleCheckIn = useCallback(() => {
    setPhase((p) => (p === 'playing' ? 'moderateCheckIn' : p));
  }, []);

  const handleSeverePain = useCallback((papsScore) => {
    loggerRef.current?.recordTherapistAlert(papsScore);
    setCanResumeAfterRest(false);
    setPhase('severeRest');
    if (restTimeoutRef.current) clearTimeout(restTimeoutRef.current);
    restTimeoutRef.current = setTimeout(() => setCanResumeAfterRest(true), REST_PERIOD_MS);
  }, []);

  const handlePostureFlag = useCallback((detail) => {
    loggerRef.current?.recordPostureEvent('upper_body', detail.status);
  }, []);

  const face = useFacialPainDetection({
    enabled: sensingEnabled,
    videoRef,
    onPAPSUpdate: (score) => {
      loggerRef.current?.recordPAPS(score);
      engineRef.current?.updatePAPS(score);
    },
  });

  const posture = usePostureGuidance({
    enabled: sensingEnabled,
    videoRef,
    postureRules,
  });

  useEffect(() => {
    if (phase !== 'playing' || !engineRef.current) return;
    engineRef.current.updatePosture(posture.overallStatus);
  }, [posture.overallStatus, phase]);

  const selectDifficulty = useCallback((tier) => {
    setMode(tier);
    loggerRef.current = new SessionLogger({ patientId, gameId, mode: tier });
    engineRef.current = new AdaptiveDifficultyEngine({
      mode: tier,
      therapistOverrides,
      onAdjustment: handleAdjustment,
      onCheckIn: handleCheckIn,
      onSeverePain: handleSeverePain,
      onPostureFlag: handlePostureFlag,
    });
    setPhase('calibration');
  }, [patientId, gameId, therapistOverrides, handleAdjustment, handleCheckIn, handleSeverePain, handlePostureFlag]);

  const completeCalibration = useCallback(() => {
    setPhase('playing');
  }, []);

  const acknowledgeCheckIn = useCallback(() => {
    engineRef.current?.acknowledgeCheckIn();
    loggerRef.current?.recordCheckIn(face.paps, 'continue');
    setPhase('playing');
  }, [face.paps]);

  const stopFromCheckIn = useCallback((onSessionEnd) => {
    loggerRef.current?.recordCheckIn(face.paps, 'stop');
    finish(onSessionEnd);
  }, [face.paps]);

  const resumeFromRest = useCallback(() => {
    if (!canResumeAfterRest) return;
    engineRef.current?.resume();
    setPhase('playing');
  }, [canResumeAfterRest]);

  const recordRepetition = useCallback(({ success, romAchieved = null, targetROM = null, holdMs = null }) => {
    engineRef.current?.recordAccuracy(success);
    engineRef.current?.recordRepetitionComplete();
    loggerRef.current?.recordRepetition({ success: success >= 0.5, romAchieved, targetROM, holdMs });
    engineRef.current?.evaluateTick();
    setTickSignal((t) => t + 1);
  }, []);

  const getLiveSummary = useCallback(() => loggerRef.current?.summarize(), []);

  const finish = useCallback((onSessionEnd, extra = {}) => {
    if (restTimeoutRef.current) clearTimeout(restTimeoutRef.current);
    loggerRef.current?.finish();
    const exported = loggerRef.current?.export();
    if (exported) persistSessionLocally(exported);
    setPhase('complete');
    onSessionEnd?.({
      ...extra,
      clinicalSummary: exported?.summary,
      difficultyMode: mode,
      sessionLog: exported,
    });
  }, [mode]);

  useEffect(() => {
    return () => {
      if (restTimeoutRef.current) clearTimeout(restTimeoutRef.current);
    };
  }, []);

  return {
    videoRef,
    phase,
    mode,
    face,
    posture,
    engine: engineRef,
    tickSignal,
    canResumeAfterRest,
    selectDifficulty,
    completeCalibration,
    acknowledgeCheckIn,
    stopFromCheckIn,
    resumeFromRest,
    recordRepetition,
    finish,
    getLiveSummary,
  };
}
