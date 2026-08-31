const mongoose = require("mongoose");

// Mirrors Session's repDataSchema (backend/src/models/Session.js) field-for-
// field. Duplicated here rather than imported because Session.js does not
// export its sub-schemas — if Session's repDataSchema ever changes, this
// must be updated to match.
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

// Mirrors Session's inline romData shape (shoulder/elbow/wrist
// flexion/extension/rotation) so joint-specific ROM captured during the
// session survives onto the report instead of being discarded.
const romDataSchema = new mongoose.Schema(
  {
    shoulder: { flexion: { type: Number, default: 0 }, extension: { type: Number, default: 0 } },
    elbow: { flexion: { type: Number, default: 0 }, extension: { type: Number, default: 0 } },
    wrist: { flexion: { type: Number, default: 0 }, extension: { type: Number, default: 0 }, rotation: { type: Number, default: 0 } },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    reportNumber: {
      type: String,
      unique: true,
      index: true,
      default: function () {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `RPT-${dateStr}-${randomPart}`;
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
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },
    therapistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Copied directly from Session.gameType (same enum values) so the
    // report records which game produced this session.
    gameType: {
      type: String,
      enum: ["rehab_slicer", "catch_flex", "precision_reach", "canvas_air", "cloud_reach"],
    },
    generatedAt: { type: Date, default: Date.now },
    patientSnapshot: {
      name: String,
      age: Number,
      gender: String,
      condition: String,
      surgeryType: String,
      surgeryDate: Date,
      goals: String,
      painLevel: Number,
    },
    performance: {
      day: Number,
      score: Number,
      level: Number,
      accuracy: Number,
      combo: Number,
      // Copied from Session.maxCombo — a separate peak-combo figure the
      // session already tracks, distinct from the final `combo` value.
      maxCombo: Number,
      stars: Number,
      durationSeconds: Number,
      exercisesCompleted: Number,
      totalReps: Number,
      // Real session clock times, copied from Session.startedAt /
      // Session.completedAt. Distinct from `generatedAt` above, which is
      // when this Report document itself was created.
      startedAt: Date,
      completedAt: Date,
    },
    romAnalysis: [
      {
        exerciseName: String,
        averageRom: Number,
        maxRom: Number,
        targetRom: Number,
        percentageAchieved: Number,
      },
    ],
    // Per-rep data copied directly from Session.repData (identical
    // sub-schema: exerciseId, exerciseName, repNumber, rom, confidence,
    // isCorrect, timestamp). This is the real per-rep ROM and per-rep
    // confidence data the session already captured — previously discarded
    // when the report was generated.
    repData: [repDataSchema],
    // Joint-specific ROM (shoulder/elbow/wrist) copied directly from
    // Session.romData — previously discarded when the report was
    // generated, leaving only the coarser per-exercise romAnalysis above.
    romData: romDataSchema,
    // Copied directly from Session.smoothness / Session.stability.
    smoothness: { type: Number, default: 0 },
    stability: { type: Number, default: 0 },
    observations: { type: String, default: "" },
    recommendations: { type: String, default: "" },
    therapistNotes: { type: String, default: "" },
  },
  { timestamps: true }
);

reportSchema.index({ patientId: 1, createdAt: -1 });
reportSchema.index({ patientIdRef: 1, createdAt: -1 });
reportSchema.index({ sessionId: 1 }, { unique: true });

module.exports =
  mongoose.models.Report || mongoose.model("Report", reportSchema);