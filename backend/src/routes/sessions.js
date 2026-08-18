const mongoose = require("mongoose");

const repDataSchema = new mongoose.Schema(
  {
    exerciseId: { type: String, required: true },
    exerciseName: { type: String },
    repNumber: { type: Number },
    rom: { type: Number },
    confidence: { type: Number },
    isCorrect: { type: Boolean, default: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const exerciseResultSchema = new mongoose.Schema(
  {
    exerciseId: { type: String, required: true },
    name: { type: String, required: true },
    setsCompleted: { type: Number, default: 0 },
    repsCompleted: { type: Number, default: 0 },
    averageRom: { type: Number, default: 0 },
    maxRom: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
  },
  { _id: false }
);

// ─── Pain telemetry (PAPS) ──────────────────────────────────────────────────
// A single sampled pain reading captured during a session, produced by
// useFacialPainDetection on the client. Kept as a real subdocument (not a
// bare Number) so we preserve *when* each reading happened, not just the
// score. PAPS is a prototype/research pain-assessment score, not a
// medically validated diagnostic value.
const painEventSchema = new mongoose.Schema(
  {
    papsScore: { type: Number, required: true, min: 0, max: 10 },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

// Normalizes whatever the client/caller sends into a clean array of
// { papsScore, timestamp } subdocuments *before* Mongoose casts it against
// painEventSchema. This is what makes the field crash-proof:
//  - legacy bare-number entries (the old [Number] shape) are upgraded
//  - malformed / out-of-range / non-numeric entries are dropped, not thrown
//  - a single bad entry can never fail the whole session save
// Runs both on hydration from MongoDB (for any older documents) and on any
// in-app assignment (session.painFluctuations = ...).
function normalizePainFluctuations(value) {
  if (!Array.isArray(value)) return [];

  const normalized = [];

  for (const entry of value) {
    if (entry === null || entry === undefined) continue;

    let rawScore;
    let rawTimestamp;

    if (typeof entry === "number") {
      // Legacy shape: a bare PAPS number with no timestamp.
      rawScore = entry;
      rawTimestamp = undefined;
    } else if (typeof entry === "object") {
      // Current shape: { papsScore, timestamp }.
      rawScore = entry.papsScore;
      rawTimestamp = entry.timestamp;
    } else {
      // Unknown/malformed entry (string, boolean, etc.) — skip it rather
      // than let it reach schema casting and fail the whole document.
      continue;
    }

    const score = Number(rawScore);
    if (!Number.isFinite(score)) continue;
    const clampedScore = Math.min(10, Math.max(0, score));

    const date = rawTimestamp ? new Date(rawTimestamp) : new Date();
    const validDate = Number.isNaN(date.getTime()) ? new Date() : date;

    normalized.push({ papsScore: clampedScore, timestamp: validDate });
  }

  return normalized;
}

const sessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      unique: true,
      default: function() {
        return `SES-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      },
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    patientIdRef: {
      type: String,
      required: true,
      index: true,
    },
    therapistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    mode: {
      type: String,
      enum: ["therapist", "public"],
      default: "therapist",
    },
    day: { type: Number, required: true, min: 1, max: 7 },
    status: {
      type: String,
      enum: ["in_progress", "completed", "abandoned"],
      default: "in_progress",
    },
    gameType: {
      type: String,
      enum: ["rehab_slicer", "catch_flex", "precision_reach", "canvas_air"],
      default: "rehab_slicer",
    },
    score: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    accuracy: { type: Number, default: 0 },
    combo: { type: Number, default: 0 },
    maxCombo: { type: Number, default: 0 },
    stars: { type: Number, default: 0, min: 0, max: 3 },
    exerciseResults: [exerciseResultSchema],
    repData: [repDataSchema],
    romData: {
      shoulder: { flexion: { type: Number, default: 0 }, extension: { type: Number, default: 0 } },
      elbow: { flexion: { type: Number, default: 0 }, extension: { type: Number, default: 0 } },
      wrist: { flexion: { type: Number, default: 0 }, extension: { type: Number, default: 0 }, rotation: { type: Number, default: 0 } },
    },
    smoothness: { type: Number, default: 0 },
    stability: { type: Number, default: 0 },
    missedActions: { type: Number, default: 0 },
    // Structured pain timeline: [{ papsScore: 0-10, timestamp: Date }, ...].
    // `set` sanitizes/normalizes every assignment (including hydration of
    // any pre-existing documents saved under the old [Number] shape) so a
    // malformed or legacy entry can never throw a CastError and block the
    // whole session from saving.
    painFluctuations: {
      type: [painEventSchema],
      default: [],
      set: normalizePainFluctuations,
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    durationSeconds: { type: Number, default: 0 },
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Report",
    },
    notes: { type: String, trim: true, default: "" },
    calibrationData: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

sessionSchema.index({ patientId: 1, createdAt: -1 });
sessionSchema.index({ patientIdRef: 1, createdAt: -1 });
sessionSchema.index({ therapistId: 1 });
sessionSchema.index({ status: 1 });

module.exports = mongoose.model("Session", sessionSchema);