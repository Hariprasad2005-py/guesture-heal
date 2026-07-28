export const PAPS_BANDS = {
  MILD_MAX: 3,      // 0-3 Mild/None
  MODERATE_MAX: 6,  // 4-6 Moderate
  // 7-10 Severe
};

export const DIFFICULTY_TIERS = ['beginner', 'intermediate', 'advanced'];

// Baseline tuning per tier. Games scale their own object-specific fields
// (target radius, balloon height, fall speed, etc.) off of `speedFactor`,
// `holdDurationMs`, `distanceFactor`, and `restIntervalMs`.
const TIER_DEFAULTS = {
  beginner: {
    speedFactor: 0.6,
    distanceFactor: 0.7,
    holdDurationMs: 3000,
    repetitionTarget: 8,
    restIntervalMs: 4000,
  },
  intermediate: {
    speedFactor: 1.0,
    distanceFactor: 1.0,
    holdDurationMs: 4000,
    repetitionTarget: 12,
    restIntervalMs: 3000,
  },
  advanced: {
    speedFactor: 1.4,
    distanceFactor: 1.3,
    holdDurationMs: 5000,
    repetitionTarget: 16,
    restIntervalMs: 2000,
  },
};

// Bounds so the engine never auto-adjusts a param outside safe physiotherapy ranges.
const PARAM_BOUNDS = {
  speedFactor: [0.35, 2.0],
  distanceFactor: [0.5, 1.6],
  holdDurationMs: [1500, 8000],
  restIntervalMs: [1200, 6000],
};

function clamp(v, [min, max]) {
  return Math.max(min, Math.min(max, v));
}

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export class AdaptiveDifficultyEngine {
  /**
   * @param {Object} opts
   * @param {'beginner'|'intermediate'|'advanced'} opts.mode
   * @param {Object} [opts.therapistOverrides] - therapist-configured param values/locks
   * @param {(entry:Object)=>void} [opts.onAdjustment] - fired whenever a param changes
   * @param {(paps:number)=>void} [opts.onCheckIn] - fired on PAPS 4-6 ("are you okay?")
   * @param {(paps:number)=>void} [opts.onSeverePain] - fired on PAPS 7-10 (pause + alert)
   * @param {(deviation:Object)=>void} [opts.onPostureFlag] - fired on posture red flag
   */
  constructor({
    mode = 'beginner',
    therapistOverrides = {},
    onAdjustment = () => {},
    onCheckIn = () => {},
    onSeverePain = () => {},
    onPostureFlag = () => {},
  } = {}) {
    this.mode = DIFFICULTY_TIERS.includes(mode) ? mode : 'beginner';
    this.locks = therapistOverrides.locks || {};
    this.params = { ...TIER_DEFAULTS[this.mode], ...(therapistOverrides.params || {}) };

    this.onAdjustment = onAdjustment;
    this.onCheckIn = onCheckIn;
    this.onSeverePain = onSeverePain;
    this.onPostureFlag = onPostureFlag;

    this.accuracyHistory = [];
    this.postureRedFlagStreak = 0;
    this.lastPAPS = 0;
    this.paused = false;
    this.pauseReason = null;
    this.log = [];
    this.repetitionsCompleted = 0;
  }

  // ---------- Public API used by games ----------

  /** Call once per repetition/hit/miss. `score` is 0..1 (1 = perfect). */
  recordAccuracy(score) {
    this.accuracyHistory.push(clamp(score, [0, 1]));
    if (this.accuracyHistory.length > 8) this.accuracyHistory.shift();
  }

  recordRepetitionComplete() {
    this.repetitionsCompleted += 1;
  }

  /** Feed a posture status for the current frame/rep: 'ok' | 'minor' | 'severe'. */
  updatePosture(status, detail = {}) {
    if (status === 'severe') {
      this.postureRedFlagStreak += 1;
      this.onPostureFlag({ status, streak: this.postureRedFlagStreak, ...detail });
    } else if (status === 'ok') {
      this.postureRedFlagStreak = 0;
    }
  }

  /** Feed the latest PAPS score (0-10). Pain ALWAYS overrides other logic. */
  updatePAPS(score) {
    this.lastPAPS = score;

    if (score > PAPS_BANDS.MODERATE_MAX) {
      if (!this.paused) {
        this.paused = true;
        this.pauseReason = 'severe_pain';
        this._logAdjustment({
          type: 'pause',
          field: 'session',
          from: 'running',
          to: 'paused',
          reason: `PAPS ${score} (severe, >6) — patient guided to rest, therapist alert logged`,
        });
      }
      this.onSeverePain(score);
      return 'pause';
    }

    if (score > PAPS_BANDS.MILD_MAX) {
      this._reduceIntensity(`PAPS ${score} (moderate, 4-6) — reducing intensity`);
      this.onCheckIn(score);
      return 'reduce';
    }

    return 'continue';
  }

  acknowledgeCheckIn() {
    return true;
  }

  resume() {
    this.paused = false;
    this.pauseReason = null;
    this._logAdjustment({
      type: 'resume',
      field: 'session',
      from: 'paused',
      to: 'running',
      reason: 'Session resumed after rest / therapist clearance',
    });
  }

  evaluateTick() {
    if (this.paused) return 'paused';
    if (this.lastPAPS > PAPS_BANDS.MILD_MAX) return 'holding_for_pain';

    const recentAccuracy = average(this.accuracyHistory);
    const posturePenalty = this.postureRedFlagStreak >= 3;

    if (posturePenalty) {
      this._reduceIntensity('Repeated posture red flags — re-triggering posture guidance before increasing difficulty');
      this.postureRedFlagStreak = 0;
      return 'posture_correction';
    }

    if (this.accuracyHistory.length >= 4 && recentAccuracy >= 0.8) {
      this._increaseIntensity(`High accuracy (${Math.round(recentAccuracy * 100)}%), low pain, good posture — advancing difficulty`);
      return 'increased';
    }

    if (this.accuracyHistory.length >= 4 && recentAccuracy < 0.4) {
      return 'holding_steady';
    }

    return 'no_change';
  }

  getParams() {
    return { ...this.params };
  }

  getSnapshot() {
    return {
      mode: this.mode,
      params: this.getParams(),
      lastPAPS: this.lastPAPS,
      paused: this.paused,
      pauseReason: this.pauseReason,
      recentAccuracy: average(this.accuracyHistory),
      postureRedFlagStreak: this.postureRedFlagStreak,
      repetitionsCompleted: this.repetitionsCompleted,
    };
  }

  getLog() {
    return [...this.log];
  }

  // ---------- Internal ----------

  _reduceIntensity(reason) {
    this._scaleParam('speedFactor', 0.85, reason);
    this._scaleParam('distanceFactor', 0.85, reason);
    this._scaleParam('holdDurationMs', 0.85, reason);
    this._scaleParam('restIntervalMs', 1.2, reason);
  }

  _increaseIntensity(reason) {
    this._scaleParam('speedFactor', 1.1, reason);
    this._scaleParam('distanceFactor', 1.08, reason);
    this._scaleParam('restIntervalMs', 0.92, reason);
  }

  _scaleParam(field, factor, reason) {
    if (this.locks[field]) return;
    const bounds = PARAM_BOUNDS[field];
    if (!bounds) return;
    const from = this.params[field];
    const to = clamp(Math.round(from * factor), bounds);
    if (to === from) return;
    this.params[field] = to;
    this._logAdjustment({ type: 'auto_adjust', field, from, to, reason });
  }

  _logAdjustment(entry) {
    const full = { t: Date.now(), ...entry };
    this.log.push(full);
    this.onAdjustment(full);
  }
}
