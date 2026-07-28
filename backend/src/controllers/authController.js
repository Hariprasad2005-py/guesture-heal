// backend/src/controllers/authController.js
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const User = require("../models/User");
const Patient = require("../models/Patient"); // Add this import

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: "Email already registered." });
    }

    const user = await User.create({ name, email, password, role: role || "therapist" });
    const token = signToken(user._id);

    res.status(201).json({ success: true, token, user });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Account is deactivated." });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user._id);
    res.json({ success: true, token, user });
  } catch (err) {
    next(err);
  }
};

// ─── NEW: Patient Login with Patient ID ─────────────────────────────────────
exports.patientLogin = async (req, res, next) => {
  try {
    const { patientId } = req.body;

    if (!patientId || !String(patientId).startsWith("GH-")) {
      return res.status(400).json({ 
        success: false, 
        message: "Valid Patient ID (GH-XXXXX) is required." 
      });
    }

    // Find the patient by their patientId
    const patient = await Patient.findOne({ 
      patientId: String(patientId).toUpperCase(), 
      isActive: true 
    });

    if (!patient) {
      return res.status(404).json({ 
        success: false, 
        message: "Patient not found. Please check your Patient ID." 
      });
    }

    // Generate a JWT token for the patient
    const token = signToken(patient._id);

    res.json({ 
      success: true, 
      token, 
      patient: {
        id: patient._id,
        patientId: patient.patientId,
        name: patient.name,
        condition: patient.condition,
        currentDay: patient.currentDay,
        totalSessions: patient.totalSessions,
        averageAccuracy: patient.averageAccuracy,
        rehabPlan: patient.rehabPlan,
        painLevel: patient.painLevel,
        goals: patient.goals,
        age: patient.age,
        gender: patient.gender,
        surgeryDate: patient.surgeryDate,
        surgeryType: patient.surgeryType,
        affectedSide: patient.affectedSide,
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res) => {
  res.json({ success: true, message: "Logged out successfully." });
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { name } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name },
      { new: true, runValidators: true }
    );
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};
// ─── NEW: Therapist Self-Registration ───────────────────────────────────
exports.therapistRegister = async (req, res, next) => {
  try {
    const {
      name, gender, phone, email,
      qualification, specialization, yearsOfExperience,
      hospitalOrClinicName, department, bio,
      conditionsTreated, therapyAreas,
      workingDays, workingHours,
    } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name, email and phone are required.",
      });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: "Email already registered." });
    }

    const therapist = new User({
      name,
      gender,
      phone,
      email,
      role: "therapist",
      isSelfRegistered: true,
      qualification,
      specialization,
      yearsOfExperience: yearsOfExperience ? Number(yearsOfExperience) : undefined,
      hospitalOrClinicName,
      department,
      bio,
      conditionsTreated: Array.isArray(conditionsTreated) ? conditionsTreated : [],
      therapyAreas: Array.isArray(therapyAreas) ? therapyAreas : [],
      workingDays: Array.isArray(workingDays) ? workingDays : [],
      workingHours: {
        start: workingHours?.start || "",
        end: workingHours?.end || "",
      },
    });

    await therapist.save();

    res.status(201).json({
      success: true,
      therapistId: therapist.therapistId,
      therapist,
      message: `Registration successful. Your Therapist ID is ${therapist.therapistId} — use it to log in.`,
    });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.therapistId) {
      // Extremely rare collision — retry once with a timestamp-based ID.
      try {
        req.body.__retry = true;
        const retryId = `TH-${Date.now().toString().slice(-5)}`;
        const therapist = new User({ ...req.body, role: "therapist", isSelfRegistered: true, therapistId: retryId });
        await therapist.save();
        return res.status(201).json({ success: true, therapistId: therapist.therapistId, therapist });
      } catch (retryErr) {
        return next(retryErr);
      }
    }
    next(err);
  }
};

// ─── NEW: Therapist Login with Therapist ID ─────────────────────────────
exports.therapistLogin = async (req, res, next) => {
  try {
    const { therapistId } = req.body;

    if (!therapistId || !String(therapistId).toUpperCase().startsWith("TH-")) {
      return res.status(400).json({
        success: false,
        message: "Valid Therapist ID (TH-XXXXX) is required.",
      });
    }

    const therapist = await User.findOne({
      therapistId: String(therapistId).toUpperCase(),
      role: "therapist",
      isActive: true,
    });

    if (!therapist) {
      return res.status(404).json({
        success: false,
        message: "Therapist not found. Please check your Therapist ID.",
      });
    }

    therapist.lastLogin = new Date();
    await therapist.save({ validateBeforeSave: false });

    const token = signToken(therapist._id);

    res.json({ success: true, token, therapist });
  } catch (err) {
    next(err);
  }
};
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select("+password");
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ success: false, message: "Current password is incorrect." });
    }

    user.password = newPassword;
    await user.save();

    const token = signToken(user._id);
    res.json({ success: true, token, message: "Password updated successfully." });
  } catch (err) {
    next(err);
  }
};