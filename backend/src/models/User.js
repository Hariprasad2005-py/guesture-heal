// backend/src/models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const CONDITIONS_TREATED = [
  "Stroke Rehabilitation",
  "Hand Surgery Recovery",
  "Fracture Recovery",
  "Nerve Injury Rehabilitation",
  "Wrist Rehabilitation",
  "Parkinson's",
  "Rotator Cuff",
];

const THERAPY_AREAS = [
  "Upper Limb Rehabilitation",
  "Hand Therapy",
  "Neurological Rehabilitation",
];

const WORKING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const userSchema = new mongoose.Schema(
  {
    // ─── Identity ───────────────────────────────────────────────────────
    therapistId: {
      type: String,
      unique: true,
      sparse: true, // only therapists get one; admins don't need it
      index: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
      // Self-registered therapists log in with their TH-ID, not a password.
      required: [
        function () {
          return !this.isSelfRegistered;
        },
        "Password is required",
      ],
    },
    role: {
      type: String,
      enum: ["therapist", "admin"],
      default: "therapist",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isApproved: {
      // Lets admin review self-registered therapists before they show up
      // in patient assignment lists, without blocking their login.
      type: Boolean,
      default: function () {
        return !this.isSelfRegistered;
      },
    },
    isSelfRegistered: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
    },

    // ─── Professional Information ──────────────────────────────────────
    qualification: {
      type: String, // e.g. "BPT", "MPT", "DPT"
      trim: true,
    },
    specialization: {
      type: String,
      trim: true,
    },
    yearsOfExperience: {
      type: Number,
      min: 0,
      max: 60,
    },
    hospitalOrClinicName: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [1000, "Bio cannot exceed 1000 characters"],
    },

    // ─── Rehabilitation Expertise ───────────────────────────────────────
    conditionsTreated: {
      type: [String],
      enum: CONDITIONS_TREATED,
      default: [],
    },
    therapyAreas: {
      type: [String],
      enum: THERAPY_AREAS,
      default: [],
    },

    // ─── Availability ───────────────────────────────────────────────────
    workingDays: {
      type: [String],
      enum: WORKING_DAYS,
      default: [],
    },
    workingHours: {
      start: { type: String, default: "" }, // "09:00"
      end: { type: String, default: "" },   // "18:00"
    },
  },
  { timestamps: true }
);

// ─── PRE-SAVE: hash password (if present) ──────────────────────────────
userSchema.pre("save", async function (next) {
  if (this.isModified("password") && this.password) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

// ─── PRE-SAVE: Auto-generate therapistId for therapists ───────────────
userSchema.pre("save", async function (next) {
  if (this.role === "therapist" && !this.therapistId) {
    let unique = false;
    let attempts = 0;
    let newId = "";

    while (!unique && attempts < 10) {
      attempts++;
      const randomDigits = Math.floor(10000 + Math.random() * 90000);
      newId = `TH-${randomDigits}`;
      const existing = await mongoose.model("User").findOne({ therapistId: newId });
      if (!existing) unique = true;
    }

    if (!unique) {
      newId = `TH-${Date.now().toString().slice(-5)}`;
    }

    this.therapistId = newId;
  }
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

userSchema.index({ therapistId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("User", userSchema);
module.exports.CONDITIONS_TREATED = CONDITIONS_TREATED;
module.exports.THERAPY_AREAS = THERAPY_AREAS;
module.exports.WORKING_DAYS = WORKING_DAYS;