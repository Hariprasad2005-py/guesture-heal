// backend/src/models/Patient.js
const mongoose = require("mongoose");

const clinicalScoreSchema = new mongoose.Schema(
  {
    instrument: { type: String, enum: ["PHQ-9", "GAD-7"], required: true },
    score: { type: Number, required: true },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const patientSchema = new mongoose.Schema(
  {
    patientId: {
      type: String,
      unique: true,
      index: true,
      // Remove 'required: true' - it will be auto-generated
    },
    name: {
      type: String,
      required: [true, "Patient name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    age: {
      type: Number,
      required: [true, "Age is required"],
      min: [1, "Age must be positive"],
      max: [120, "Age seems invalid"],
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      required: [true, "Gender is required"],
    },
    contactNumber: {
      type: String,
      trim: true,
    },
    condition: {
      type: String,
      required: [true, "Condition is required"],
      trim: true,
    },
    surgeryType: {
      type: String,
      trim: true,
      default: "",
    },
    surgeryDate: {
      type: Date,
    },
    affectedSide: {
      type: String,
      enum: ["Left", "Right", "Both", ""],
      default: "",
    },
    goals: {
      type: String,
      required: [true, "Rehab goals are required"],
      trim: true,
    },
    painLevel: {
      type: Number,
      required: [true, "Pain level is required"],
      min: 0,
      max: 10,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    rehabPlan: [
      {
        day: { type: Number, required: true },
        exercises: [
          {
            exerciseId: { type: String, required: true },
            name: { type: String, required: true },
            sets: { type: Number, default: 3 },
            reps: { type: Number, default: 10 },
            holdSeconds: { type: Number, default: 0 },
            targetRom: { type: Number },
            description: { type: String },
            videoUrl: { type: String, default: "" },
          },
        ],
        isCompleted: { type: Boolean, default: false },
        completedAt: { type: Date },
      },
    ],
    totalSessions: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
    averageAccuracy: { type: Number, default: 0 },
    currentLevel: { type: Number, default: 1 },
    currentDay: { type: Number, default: 1 },
    therapistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isSelfRegistered: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    // ─── NEW: Premium admin dashboard fields ─────────────────────────────
    status: {
      type: String,
      enum: ["active", "inactive", "at-risk", "discharged"],
      default: "active",
      index: true,
    },
    registrationMethod: {
      type: String,
      enum: ["self-registered", "clinical-referral", "employer-referral"],
      default: "clinical-referral",
    },
    careTeam: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    consentStatus: {
      type: String,
      enum: ["pending", "signed", "expired"],
      default: "pending",
    },
    consentSignedAt: { type: Date },
    // 0-100. Derived score, not user-entered — see riskScoreCalculator.js (Phase 2).
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    riskScoreUpdatedAt: { type: Date },
    clinicalScores: [clinicalScoreSchema],
    lastSessionAt: { type: Date },
  },
  { timestamps: true }
);

// ─── PRE-SAVE: Auto-generate patientId ─────────────────────────────────────
patientSchema.pre("save", async function (next) {
  // Only generate if patientId is not already set
  if (!this.patientId) {
    let unique = false;
    let attempts = 0;
    let newId = "";
    
    // Keep trying until we get a unique ID (max 10 attempts)
    while (!unique && attempts < 10) {
      attempts++;
      const randomDigits = Math.floor(10000 + Math.random() * 90000);
      newId = `GH-${randomDigits}`;
      
      // Check if this ID already exists
      const existing = await mongoose.model("Patient").findOne({ patientId: newId });
      if (!existing) {
        unique = true;
      }
    }
    
    if (!unique) {
      // Fallback: use timestamp-based ID
      const timestamp = Date.now().toString().slice(-5);
      newId = `GH-${timestamp}`;
    }
    
    this.patientId = newId;
  }
  next();
});

// ─── INDEXES ──────────────────────────────────────────────────────────────────
patientSchema.index({ therapistId: 1, createdAt: -1 });
patientSchema.index({ isActive: 1 });
patientSchema.index({ patientId: 1 }, { unique: true });
patientSchema.index({ status: 1 });
patientSchema.index({ riskScore: -1 });

module.exports = mongoose.model("Patient", patientSchema);