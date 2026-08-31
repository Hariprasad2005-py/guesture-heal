// backend/src/controllers/patientController.js
const { validationResult } = require("express-validator");
const mongoose = require("mongoose"); // ← Make sure this is here
const Patient = require("../models/Patient");
const { generateRehabPlan } = require("../utils/rehabPlanGenerator");

// ... rest of the code ...

exports.getAllPatients = async (req, res, next) => {
  try {
    const { search, condition, page = 1, limit = 20 } = req.query;
    const isAdmin = req.user.role === "admin";
    const filter = isAdmin
      ? { isActive: true }
      : { therapistId: req.user._id, isActive: true };

    if (search) {
      const s = String(search);
      filter.$or = [
        { name: { $regex: s, $options: "i" } },
        { patientId: { $regex: s, $options: "i" } },
        { condition: { $regex: s, $options: "i" } },
      ];
    }
    if (condition) filter.condition = { $regex: String(condition), $options: "i" };

    const skip = (Number(page) - 1) * Number(limit);

    const [patients, total] = await Promise.all([
      Patient.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Patient.countDocuments(filter),
    ]);

    res.json({
      success: true,
      patients,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getPatient = async (req, res, next) => {
  try {
    // Prevent NoSQL injection by validating ObjectId
    if (!req.params.id.startsWith("GH-") && !mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid patient ID format." });
    }

    const query = { therapistId: req.user._id };
    if (req.params.id.startsWith("GH-")) {
      query.patientId = req.params.id;
    } else {
      query._id = req.params.id;
    }

    const patient = await Patient.findOne(query);
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }
    res.json({ success: true, patient });
  } catch (err) {
    next(err);
  }
};

exports.createPatient = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { contact, ...rest } = req.body;
    const patientData = {
      ...rest,
      contactNumber: contact,
      therapistId: req.user._id,
      isSelfRegistered: false,
    };

    const patient = new Patient(patientData);
    patient.rehabPlan = generateRehabPlan(patient.condition, patient.painLevel, patient.affectedSide);
    await patient.save();

    res.status(201).json({ success: true, patient });
  } catch (err) {
    next(err);
  }
};

exports.updatePatient = async (req, res, next) => {
  try {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid patient ID format." });
    }

    const patient = await Patient.findOneAndUpdate(
      { _id: req.params.id, therapistId: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }
    res.json({ success: true, patient });
  } catch (err) {
    next(err);
  }
};

exports.deletePatient = async (req, res, next) => {
  try {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid patient ID format." });
    }

    const patient = await Patient.findOneAndUpdate(
      { _id: req.params.id, therapistId: req.user._id },
      { isActive: false },
      { new: true }
    );
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }
    res.json({ success: true, message: "Patient deleted successfully." });
  } catch (err) {
    next(err);
  }
};

exports.regeneratePlan = async (req, res, next) => {
  try {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid patient ID format." });
    }

    const patient = await Patient.findOne({ _id: req.params.id, therapistId: req.user._id });
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }

    patient.rehabPlan = generateRehabPlan(patient.condition, patient.painLevel, patient.affectedSide);
    patient.currentDay = 1;
    await patient.save();

    res.json({ success: true, rehabPlan: patient.rehabPlan });
  } catch (err) {
    next(err);
  }
};

exports.getRehabPlan = async (req, res, next) => {
  try {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid patient ID format." });
    }

    const patient = await Patient.findOne(
      { _id: req.params.id, therapistId: req.user._id },
      "name rehabPlan currentDay patientId"
    );
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }
    res.json({ success: true, rehabPlan: patient.rehabPlan, currentDay: patient.currentDay });
  } catch (err) {
    next(err);
  }
};

// backend/src/controllers/patientController.js
// ... existing code ...

exports.selfRegister = async (req, res, next) => {
  try {
    const { firstName, lastName, age, gender, phone, email, address, condition, injuryType, emergencyContact } = req.body;

    if (!firstName || !lastName || !age || !condition) {
      return res.status(400).json({ success: false, message: "Name, age and condition are required" });
    }

    const contactNumber = phone || email || "";
    if (!contactNumber) {
      return res.status(400).json({ success: false, message: "Phone or email is required" });
    }

    // Prevent duplicate self-registrations: same contact + still active = same person re-submitting
    const existingPatient = await Patient.findOne({ contactNumber, isActive: true });
    if (existingPatient) {
      return res.status(200).json({
        success: true,
        patient: existingPatient,
        patientId: existingPatient.patientId,
        message: "You're already registered — returning your existing profile.",
      });
    }

    // Create patient WITHOUT setting patientId - let the pre-save hook generate it
    const patient = new Patient({
      name: `${firstName} ${lastName}`,
      age: Number(age),
      gender: gender || "Other",
      contactNumber,
      condition,
      surgeryType: injuryType || "",
      goals: "Patient self-registered — goals to be set by therapist",
      painLevel: 5,
      notes: `Address: ${address || ""} | Emergency: ${emergencyContact || ""}`,
      therapistId: null,
      isSelfRegistered: true,
      isActive: true,
    });

    // Generate rehab plan
    patient.rehabPlan = generateRehabPlan(patient.condition, patient.painLevel, "");

    // Save - this will trigger the pre-save hook and generate patientId
    await patient.save();

    res.status(201).json({
      success: true,
      patient,
      patientId: patient.patientId
    });
  } catch (err) {
    // Handle duplicate key error
    if (err.code === 11000 && err.keyPattern?.patientId) {
      // Retry with a new ID
      try {
        const retryPatient = new Patient({
          name: `${firstName} ${lastName}`,
          age: Number(age),
          gender: gender || "Other",
          contactNumber: phone || email || "",
          condition,
          surgeryType: injuryType || "",
          goals: "Patient self-registered — goals to be set by therapist",
          painLevel: 5,
          notes: `Address: ${address || ""} | Emergency: ${emergencyContact || ""}`,
          therapistId: null,
          isSelfRegistered: true,
          isActive: true,
        });
        retryPatient.rehabPlan = generateRehabPlan(retryPatient.condition, retryPatient.painLevel, "");
        await retryPatient.save();

        return res.status(201).json({
          success: true,
          patient: retryPatient,
          patientId: retryPatient.patientId
        });
      } catch (retryErr) {
        return next(retryErr);
      }
    }
    next(err);
  }
};

exports.getPublicPatient = async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ patientId: req.params.id, isActive: true })
      .select("-therapistId -__v");
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }
    res.json({ success: true, patient });
  } catch (err) {
    next(err);
  }
};