export class SessionLogger {
  constructor({ patientId, gameId, mode }) {
    this.patientId = patientId;
    this.gameId = gameId;
    this.mode = mode;
    this.startedAt = Date.now();
    this.endedAt = null;

    this.papsTrend = [];
    this.postureEvents = [];
    this.difficultyLog = [];
    this.repetitions = [];
    this.checkIns = [];
    this.therapistAlerts = [];
    this.shapeHistory = [];
    this.movementEvents = [];
  }

  recordPAPS(score) {
    this.papsTrend.push({ t: Date.now(), score });
  }

  recordPostureEvent(joint, severity, angleDeviation = null) {
    this.postureEvents.push({ t: Date.now(), joint, severity, angleDeviation });
  }

  recordDifficultyChange(entry) {
    this.difficultyLog.push(entry);
  }

  recordRepetition({ success, romAchieved = null, targetROM = null, holdMs = null }) {
    this.repetitions.push({ t: Date.now(), success, romAchieved, targetROM, holdMs });
  }

  recordCheckIn(papsAtCheckIn, patientResponse = null) {
    this.checkIns.push({ t: Date.now(), papsAtCheckIn, patientResponse });
  }

  recordTherapistAlert(papsScore, note = 'Severe pain detected — session paused') {
    this.therapistAlerts.push({ t: Date.now(), papsScore, note });
  }

  recordShapeTrace({ shapeName, accuracy, durationMs }) {
    this.shapeHistory.push({ t: Date.now(), shapeName, accuracy, durationMs });
  }

  recordMovementEvent({ type, severity, details = {} }) {
    this.movementEvents.push({ t: Date.now(), type, severity, details });
  }

  finish() {
    this.endedAt = Date.now();
  }

  summarize(targetRepetitions = null) {
    const successCount = this.repetitions.filter((r) => r.success).length;
    const romValues = this.repetitions
      .filter((r) => r.romAchieved != null && r.targetROM)
      .map((r) => r.romAchieved / r.targetROM);
    const avgROMPct = romValues.length
      ? Math.round((romValues.reduce((a, b) => a + b, 0) / romValues.length) * 100)
      : null;
    const accuracyPct = this.repetitions.length
      ? Math.round((successCount / this.repetitions.length) * 100)
      : 0;
    const completionPct = targetRepetitions
      ? Math.round((this.repetitions.length / targetRepetitions) * 100)
      : null;
    const maxPAPS = this.papsTrend.length ? Math.max(...this.papsTrend.map((p) => p.score)) : 0;
    const avgPAPS = this.papsTrend.length
      ? Math.round((this.papsTrend.reduce((a, p) => a + p.score, 0) / this.papsTrend.length) * 10) / 10
      : 0;
    const severePostureEvents = this.postureEvents.filter((e) => e.severity === 'severe').length;

    const avgShapeAccuracy = this.shapeHistory.length
      ? Math.round(
          (this.shapeHistory.reduce((a, s) => a + s.accuracy, 0) / this.shapeHistory.length) * 100
        ) / 100
      : null;
    const severeMovementEvents = this.movementEvents.filter((e) => e.severity === 'severe').length;

    return {
      durationMs: (this.endedAt || Date.now()) - this.startedAt,
      successfulReps: successCount,
      totalReps: this.repetitions.length,
      accuracyPct,
      avgROMPct,
      completionPct,
      maxPAPS,
      avgPAPS,
      severePostureEvents,
      minorPostureEvents: this.postureEvents.filter((e) => e.severity === 'minor').length,
      difficultyChangeCount: this.difficultyLog.length,
      therapistAlertCount: this.therapistAlerts.length,
      shapeCount: this.shapeHistory.length,
      avgShapeAccuracy,
      movementEventCount: this.movementEvents.length,
      severeMovementEvents,
    };
  }

  export() {
    return {
      patientId: this.patientId,
      gameId: this.gameId,
      mode: this.mode,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      papsTrend: this.papsTrend,
      postureEvents: this.postureEvents,
      difficultyLog: this.difficultyLog,
      repetitions: this.repetitions,
      checkIns: this.checkIns,
      therapistAlerts: this.therapistAlerts,
      shapeHistory: this.shapeHistory,
      movementEvents: this.movementEvents,
      summary: this.summarize(),
    };
  }
}

const STORAGE_KEY = 'rehab_session_history_v1';

export function persistSessionLocally(sessionExport) {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    existing.push(sessionExport);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.slice(-100)));
  } catch (_) {
    // best-effort only
  }
}

export function loadSessionHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (_) {
    return [];
  }
}