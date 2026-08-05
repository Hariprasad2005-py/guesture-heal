// backend/src/controllers/reportController.js
const Report = require("../models/Report");
const Session = require("../models/Session");
const Patient = require("../models/Patient");
const mongoose = require("mongoose");

exports.getReportsByPatient = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.patientId)) {
      return res.status(400).json({ success: false, message: "Invalid patient ID format." });
    }

    const patient = await Patient.findOne({ _id: req.params.patientId, therapistId: req.user._id });
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }

    const reports = await Report.find({ patientId: req.params.patientId })
      .sort({ createdAt: -1 })
      .select("-patientSnapshot");

    res.json({ success: true, reports });
  } catch (err) {
    next(err);
  }
};

exports.getReport = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid report ID format." });
    }

    const report = await Report.findById(req.params.id)
      .populate("patientId", "name condition")
      .populate("sessionId", "day score accuracy");

    if (!report || String(report.therapistId) !== String(req.user._id)) {
      return res.status(404).json({ success: false, message: "Report not found." });
    }

    res.json({ success: true, report });
  } catch (err) {
    next(err);
  }
};

// Shared report-building logic, deliberately kept free of req/res/req.user
// so it can run both from the authenticated POST /reports/generate/:sessionId
// route AND automatically from public (no-token) session completion in
// sessionController.finishPublicSession. `therapistId` is optional --
// public sessions have none, so it falls back to the patient's assigned
// therapist (if any) or null.
exports.buildReportForSession = async (session, patient, therapistId = null) => {
  const existing = await Report.findOne({ sessionId: session._id });
  if (existing) return { report: existing, alreadyExisted: true };

  const romAnalysis = (session.exerciseResults || []).map((ex) => {
    const dayPlan = patient.rehabPlan?.find((d) => d.day === session.day);
    const planEx = dayPlan?.exercises?.find((e) => e.exerciseId === ex.exerciseId);
    const targetRom = planEx?.targetRom || 90;
    return {
      exerciseName: ex.name,
      averageRom: ex.averageRom,
      maxRom: ex.maxRom,
      targetRom,
      percentageAchieved: targetRom > 0 ? Math.round((ex.maxRom / targetRom) * 100) : 0,
    };
  });

  const avgAccuracy = session.accuracy || 0;
  const observations = buildObservations(avgAccuracy, session.score, romAnalysis);
  const recommendations = buildRecommendations(avgAccuracy, patient.painLevel, session.day);

  const report = await Report.create({
    patientId: patient._id,
    patientIdRef: patient.patientId,
    sessionId: session._id,
    therapistId: therapistId || patient.therapistId || null,
    patientSnapshot: {
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      condition: patient.condition,
      surgeryType: patient.surgeryType,
      surgeryDate: patient.surgeryDate,
      goals: patient.goals,
      painLevel: patient.painLevel,
    },
    performance: {
      day: session.day,
      score: session.score,
      level: session.level,
      accuracy: session.accuracy,
      combo: session.combo,
      stars: session.stars,
      durationSeconds: session.durationSeconds,
      exercisesCompleted: session.exerciseResults?.length || 0,
      totalReps: session.exerciseResults?.reduce((sum, e) => sum + e.repsCompleted, 0) || 0,
    },
    romAnalysis,
    observations,
    recommendations,
  });

  session.reportId = report._id;
  await session.save();

  return { report, alreadyExisted: false };
};

exports.generateReport = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.sessionId)) {
      return res.status(400).json({ success: false, message: "Invalid session ID format." });
    }

    const session = await Session.findById(req.params.sessionId).populate("patientId");
    if (!session || String(session.therapistId) !== String(req.user._id)) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    if (session.status !== "completed") {
      return res.status(400).json({ success: false, message: "Cannot generate report for incomplete session." });
    }

    const patient = session.patientId;
    const { report, alreadyExisted } = await exports.buildReportForSession(session, patient, req.user._id);

    if (alreadyExisted) {
      return res.json({ success: true, report, message: "Report already exists." });
    }

    res.status(201).json({ success: true, report });
  } catch (err) {
    next(err);
  }
};
exports.getReportsByTherapist = async (req, res, next) => {
  try {
    const { patientId } = req.query;
    const filter = { therapistId: req.user._id };

    if (patientId) {
      if (!mongoose.Types.ObjectId.isValid(patientId)) {
        return res.status(400).json({ success: false, message: "Invalid patient ID format." });
      }
      filter.patientId = patientId;
    }

    const reports = await Report.find(filter)
      .populate("patientId", "name patientId condition")
      .sort({ createdAt: -1 })
      .select("-patientSnapshot");

    res.json({ success: true, reports });
  } catch (err) {
    next(err);
  }
};
exports.updateTherapistNotes = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid report ID format." });
    }

    const { therapistNotes } = req.body;
    const report = await Report.findOneAndUpdate(
      { _id: req.params.id, therapistId: req.user._id },
      { therapistNotes },
      { new: true }
    );
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found." });
    }
    res.json({ success: true, report });
  } catch (err) {
    next(err);
  }
};
exports.getPublicReportsByPatient = async (req, res, next) => {
  try {
    const { patientId } = req.params; // e.g. "GH-72358"

    if (!patientId || !patientId.startsWith("GH-")) {
      return res.status(400).json({ success: false, message: "Invalid patient ID format." });
    }

    const patient = await Patient.findOne({ patientId, isActive: true });
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }

    // No therapistId scoping here — this is the public/no-token lookup path.
    // Strip therapistId and patientSnapshot so we don't leak therapist identity or extra PII.
    const reports = await Report.find({ patientIdRef: patientId })
      .sort({ createdAt: -1 })
      .select("-patientSnapshot -therapistId");

    res.json({ success: true, reports });
  } catch (err) {
    next(err);
  }
};
exports.deleteReport = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid report ID format." });
    }

    const report = await Report.findOneAndDelete({ _id: req.params.id, therapistId: req.user._id });
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found." });
    }
    res.json({ success: true, message: "Report deleted." });
  } catch (err) {
    next(err);
  }
};

function buildObservations(accuracy, score, romAnalysis) {
  const lines = [];
  if (accuracy >= 85) {
    lines.push("Patient demonstrated excellent form and consistency throughout the session.");
  } else if (accuracy >= 65) {
    lines.push("Patient showed satisfactory performance with some inconsistency in form.");
  } else {
    lines.push("Patient required guidance and showed difficulty maintaining proper form.");
  }

  const avgRomPct = romAnalysis.length
    ? romAnalysis.reduce((s, r) => s + r.percentageAchieved, 0) / romAnalysis.length
    : 0;

  if (avgRomPct >= 90) {
    lines.push("Range of motion is approaching or exceeding target thresholds.");
  } else if (avgRomPct >= 70) {
    lines.push("Range of motion is progressing well but has not yet reached target values.");
  } else {
    lines.push("Range of motion remains below target; continued focused rehabilitation is recommended.");
  }

  return lines.join(" ");
}

function buildRecommendations(accuracy, painLevel, day) {
  const lines = [];
  if (accuracy < 65) {
    lines.push("Consider revisiting current day exercises before progressing.");
  } else {
    lines.push("Patient may progress to the next session as scheduled.");
  }

  if (painLevel >= 7) {
    lines.push("Pain levels are high; consult physician before advancing exercise intensity.");
  } else if (painLevel >= 4) {
    lines.push("Monitor pain levels closely and adjust exercise intensity as needed.");
  } else {
    lines.push("Pain levels are well-controlled; continue current rehabilitation protocol.");
  }

  if (day >= 5) {
    lines.push("Patient is in the final phase of the 7-day plan; evaluate for extended program.");
  }

  return lines.join(" ");
}