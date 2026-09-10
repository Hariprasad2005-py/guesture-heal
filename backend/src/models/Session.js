const mongoose = require("mongoose");

// repData is shared across every game, but games don't all record reps
// the same way. RehabSlicer/CatchFlex-style games log a rep against a
// named exercise (exerciseId/exerciseName/rom/confidence/isCorrect).
// Precision Reach logs a rep against a spawned target (rep/direction/
// result/romDegrees/responseTimeSeconds/success) -- it has no concept of
// exerciseId. exerciseId being `required: true` silently failed subdoc
// validation for every Precision Reach rep (missing required field),
// which is why repData persisted as [] even though 5 real reps were
// sent -- and because the schema was strict, Precision Reach's actual
// fields were being dropped during casting regardless. Making
// exerciseId optional and declaring Precision Reach's own fields (plus
// disabling strict mode as a safety net for any other game-specific
// shape) fixes this without changing the shape any existing game relies
// on -- every field already in use by other games is untouched.
const repDataSchema = new mongoose.Schema(
  {
    exerciseId: { type: String },
    exerciseName: { type: String },
    repNumber: { type: Number },
    rom: { type: Number },
    confidence: { type: Number },
    isCorrect: { type: Boolean, default: true },
    timestamp: { type: Date, default: Date.now },
    // Precision Reach rep fields (target-based, not exercise-based)
    rep: { type: Number },
    direction: { type: String },
    result: { type: String },
    romDegrees: { type: Number },
    responseTimeSeconds: { type: Number },
    success: { type: Boolean },
  },
  { _id: false, strict: false }
);

const exerciseResultSchema = new mongoose.Schema(
  {
    exerciseId: { type: String, required: true },
    name: { type: String, required: true },
    setsCompleted: { type: Number, default: null },
repsCompleted: { type: Number, default: null },
averageRom: { type: Number, default: null },
maxRom: { type: Number, default: null },
accuracy: { type: Number, default: null },
score: { type: Number, default: null },
  },
  { _id: false }
);

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
      enum: ["rehab_slicer", "catch_flex", "precision_reach", "canvas_air", "cloud_reach"],
      default: "rehab_slicer",
    },
    // score/accuracy/combo: every game has a genuine, always-meaningful
    // 0 for these (0% accuracy, 0 combo so far, 0 score) -- default 0 is
    // correct and stays.
    score: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    combo: { type: Number, default: 0 },
    // level: Precision Reach hardcodes this to 1 in its frontend
    // finalize step -- it has no real leveling concept, so `1` was never
    // a measured value for that game. Other games may genuinely level
    // up. null = "not supplied by this game", same reasoning as before;
    // a game that *does* compute a real level continues to write a real
    // number over this default.
    level: { type: Number, default: null },
    // maxCombo/stars ARE real, computed metrics for every game that
    // reports them (e.g. Precision Reach's bestStreak / accuracy-tiered
    // stars) -- confirmed by reading PrecisionReach.jsx's
    // finalizeTelemetry. 0 is a genuine, meaningful value here (a
    // real "no streak yet" or "below 50% accuracy"), so these keep
    // their original defaults.
    maxCombo: { type: Number, default: 0 },
    stars: { type: Number, default: 0, min: 0, max: 3 },
    exerciseResults: [exerciseResultSchema],
    repData: [repDataSchema],
    romData: {
  shoulder: {
    flexion: { type: Number, default: null },
    extension: { type: Number, default: null },
  },
  elbow: {
    flexion: { type: Number, default: null },
    extension: { type: Number, default: null },
  },
  wrist: {
    flexion: { type: Number, default: null },
    extension: { type: Number, default: null },
    rotation: { type: Number, default: null },
  },
},
smoothness: { type: Number, default: null },
stability: { type: Number, default: null },
missedActions: { type: Number, default: null },
    painFluctuations: { type: [Number], default: [] },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    durationSeconds: { type: Number, default: 0 },
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Report",
    },
    notes: { type: String, trim: true, default: "" },
    calibrationData: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Free-form, per-game metrics that don't have a dedicated top-level
    // field (e.g. Precision Reach's PAPS composite score, bestCombo,
    // longestHitStreak, romPerRep). Shape varies by game, so this is
    // intentionally Mixed rather than a fixed sub-schema -- same
    // reasoning as calibrationData above. Previously undeclared here,
    // so even where the controller assigned it, Mongoose's default
    // strict mode would have silently stripped it on save.
    gameSpecific: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

sessionSchema.index({ patientId: 1, createdAt: -1 });
sessionSchema.index({ patientIdRef: 1, createdAt: -1 });
sessionSchema.index({ therapistId: 1 });
sessionSchema.index({ status: 1 });

module.exports =
  mongoose.models.Session || mongoose.model("Session", sessionSchema);