const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reportNumber: {
      type: String,
      unique: true,
      default: function() {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        return `GH-${dateStr}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
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
      required: true,
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
      stars: Number,
      durationSeconds: Number,
      exercisesCompleted: Number,
      totalReps: Number,
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
    observations: { type: String, default: "" },
    recommendations: { type: String, default: "" },
    therapistNotes: { type: String, default: "" },
  },
  { timestamps: true }
);

reportSchema.index({ patientId: 1, createdAt: -1 });
reportSchema.index({ patientIdRef: 1, createdAt: -1 });
reportSchema.index({ sessionId: 1 });

module.exports = mongoose.model("Report", reportSchema);