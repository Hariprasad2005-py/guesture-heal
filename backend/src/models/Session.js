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
      enum: ["rehab_slicer", "cloud_reach", "catch_flex", "precision_reach", "canvas_air"],
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
  },
  { timestamps: true }
);

sessionSchema.index({ patientId: 1, createdAt: -1 });
sessionSchema.index({ patientIdRef: 1, createdAt: -1 });
sessionSchema.index({ therapistId: 1 });
sessionSchema.index({ status: 1 });

module.exports = mongoose.model("Session", sessionSchema);