// backend/src/controllers/sessionController.js

const mongoose = require("mongoose");
const Session = require("../models/Session");
const Patient = require("../models/Patient");
const reportController = require("./reportController");

// ─────────────────────────────────────────────────────────────
// THERAPIST SESSION ENDPOINTS
// ─────────────────────────────────────────────────────────────

exports.getSessionsByPatient = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    const isAdmin = req.user.role === "admin";
    const isTherapist = req.user.role === "therapist";

    // Build the patient-lookup query. Admins and therapists can look up any
    // patient by ID; other roles are restricted to their own assigned patients.
    // Previously therapists had { therapistId: req.user._id } applied here,
    // which caused findOne() to return null (and a 404) for self-registered
    // patients whose therapistId field is null or set to a different therapist.
    const query = (isAdmin || isTherapist) ? {} : { therapistId: req.user._id };

    if (patientId.startsWith("GH-")) {
      query.patientId = patientId;
    } else {
      if (!mongoose.Types.ObjectId.isValid(patientId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid patient ID format.",
        });
      }

      query._id = patientId;
    }

    const patient = await Patient.findOne(query);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found.",
      });
    }

    const sessions = await Session.find({ patientId: patient._id })
      .sort({ createdAt: -1 })
      .populate("reportId", "reportNumber");

    res.json({
      success: true,
      sessions,
    });
  } catch (err) {
    next(err);
  }
};

exports.getSession = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid session ID format.",
      });
    }

    const session = await Session.findById(req.params.id)
      .populate("patientId", "name patientId age gender condition surgeryType surgeryDate goals painLevel therapistId")
      .populate("reportId");

    if (
      !session ||
      String(session.therapistId) !== String(req.user._id)
    ) {
      return res.status(404).json({
        success: false,
        message: "Session not found.",
      });
    }

    // If repData is nested in gameSpecific, extract it to root level
    let formattedSession = session.toObject();

    // Extract repData from gameSpecific if it exists and root repData is empty
    if (
      formattedSession.gameSpecific?.fullMetrics?.repData &&
      (!formattedSession.repData || formattedSession.repData.length === 0)
    ) {
      formattedSession.repData = formattedSession.gameSpecific.fullMetrics.repData;
    }

    // Also extract other metrics if needed
    if (formattedSession.gameSpecific?.fullMetrics) {
      const metrics = formattedSession.gameSpecific.fullMetrics;

      // Populate missing fields from gameSpecific metrics
      if (!formattedSession.smoothness && metrics.smoothness) {
        formattedSession.smoothness = metrics.smoothness;
      }
      if (!formattedSession.accuracy && metrics.accuracy) {
        formattedSession.accuracy = metrics.accuracy;
      }
      if (!formattedSession.score && metrics.total) {
        formattedSession.score = metrics.total;
      }

      // Add ROM data if available
      if (metrics.maximumReachDistance && !formattedSession.romData) {
        formattedSession.romData = {
          shoulder: {
            flexion: metrics.maximumReachDistance || 0,
            extension: 0
          },
          elbow: { flexion: 0, extension: 0 },
          wrist: { flexion: 0, extension: 0, rotation: 0 }
        };
      }
    }

    res.json({
      success: true,
      session: formattedSession,
    });
  } catch (err) {
    next(err);
  }
};

exports.startSession = async (req, res, next) => {
  try {
    const { patientId, day, gameType } = req.body;

    const query = {
      therapistId: req.user._id,
    };

    if (patientId.startsWith("GH-")) {
      query.patientId = patientId;
    } else {
      if (!mongoose.Types.ObjectId.isValid(patientId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid patient ID format.",
        });
      }

      query._id = patientId;
    }

    const patient = await Patient.findOne(query);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found.",
      });
    }

    await Session.updateMany(
      {
        patientId: patient._id,
        status: "in_progress",
      },
      {
        status: "abandoned",
      }
    );

    const session = await Session.create({
      patientId: patient._id,
      patientIdRef: patient.patientId,
      therapistId: req.user._id,
      day: day || patient.currentDay || 1,
      gameType: gameType || "rehab_slicer",
      status: "in_progress",
      startedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      session,
    });
  } catch (err) {
    next(err);
  }
};

exports.completeSession = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid session ID format.",
      });
    }

    const {
      score,
      level,
      accuracy,
      combo,
      maxCombo,
      stars,
      exerciseResults,
      durationSeconds,
      notes,
      gameType,
      romData,
      smoothness,
      stability,
      missedActions,
      painFluctuations,
    } = req.body;

    const session = await Session.findById(req.params.id);

    if (
      !session ||
      String(session.therapistId) !== String(req.user._id)
    ) {
      return res.status(404).json({
        success: false,
        message: "Session not found.",
      });
    }

    if (session.status !== "in_progress") {
      return res.status(400).json({
        success: false,
        message: "Session is not in progress.",
      });
    }

    session.score = score || 0;
    session.level = level || 1;
    session.accuracy = accuracy || 0;
    session.combo = combo || 0;
    session.maxCombo = maxCombo || combo || 0;
    session.stars = stars || 0;
    session.exerciseResults = exerciseResults || [];
    session.durationSeconds = durationSeconds || 0;
    session.notes = notes || "";
    session.gameType =
      gameType || session.gameType || "rehab_slicer";

    // Ensure repData is saved even when nested in gameSpecific
    if (req.body.gameSpecific?.fullMetrics?.repData) {
      session.repData = req.body.gameSpecific.fullMetrics.repData;
    } else if (req.body.gameSpecific?.repData) {
      session.repData = req.body.gameSpecific.repData;
    } else if (req.body.repData) {
      session.repData = req.body.repData;
    }

    session.status = "completed";
    session.completedAt = new Date();

    if (romData) session.romData = romData;
    if (smoothness !== undefined) session.smoothness = smoothness;
    if (stability !== undefined) session.stability = stability;
    if (missedActions !== undefined) {
      session.missedActions = missedActions;
    }
    if (painFluctuations) {
      session.painFluctuations = painFluctuations;
    }

    await session.save();

    const patient = await Patient.findById(session.patientId);

    if (patient) {
      patient.totalSessions += 1;
      patient.totalScore += score || 0;

      const prevTotal = patient.totalSessions - 1;

      patient.averageAccuracy = Math.round(
        ((patient.averageAccuracy * prevTotal) +
          (accuracy || 0)) /
        patient.totalSessions
      );

      if (level > patient.currentLevel) {
        patient.currentLevel = level;
      }

      const dayPlan = patient.rehabPlan.find(
        (d) => d.day === session.day
      );

      if (dayPlan) {
        dayPlan.isCompleted = true;
        dayPlan.completedAt = new Date();
      }

      if (
        session.day === patient.currentDay &&
        patient.currentDay < 7
      ) {
        patient.currentDay += 1;
      }

      await patient.save();

      // Automatically generate report
      try {
        await reportController.buildReportForSession(
          session,
          patient,
          req.user._id
        );
      } catch (reportErr) {
        console.warn(
          "[completeSession] Failed to auto-generate report:",
          reportErr
        );
      }
    }

    res.json({
      success: true,
      session,
    });
  } catch (err) {
    next(err);
  }
};

exports.saveRepData = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid session ID format.",
      });
    }

    const {
      exerciseId,
      exerciseName,
      repNumber,
      rom,
      confidence,
      isCorrect,
    } = req.body;

    const session = await Session.findById(req.params.id);

    if (
      !session ||
      String(session.therapistId) !== String(req.user._id)
    ) {
      return res.status(404).json({
        success: false,
        message: "Session not found.",
      });
    }

    if (session.status !== "in_progress") {
      return res.status(400).json({
        success: false,
        message: "Session is not in progress.",
      });
    }

    session.repData.push({
      exerciseId,
      exerciseName,
      repNumber,
      rom,
      confidence,
      isCorrect: isCorrect !== false,
      timestamp: new Date(),
    });

    await session.save();

    res.json({
      success: true,
      message: "Rep data saved.",
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// PUBLIC SESSION ENDPOINTS
// No authentication — patientId (GH-XXXX) is used
// ─────────────────────────────────────────────────────────────

exports.startPublicSession = async (req, res, next) => {
  try {
    const { patientId, gameType } = req.body;

    if (
      !patientId ||
      !String(patientId).startsWith("GH-")
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid patientId (GH-XXXX) is required.",
      });
    }

    const patient = await Patient.findOne({
      patientId: String(patientId),
      isActive: true,
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found.",
      });
    }

    // Abandon any previous public session still in progress
    await Session.updateMany(
      {
        patientId: patient._id,
        status: "in_progress",
        mode: "public",
      },
      {
        status: "abandoned",
      }
    );

    const session = await Session.create({
      patientId: patient._id,
      patientIdRef: patient.patientId,
      therapistId: null,
      mode: "public",
      day: patient.currentDay || 1,
      gameType: gameType || "rehab_slicer",
      status: "in_progress",
      startedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      session,
    });
  } catch (err) {
    next(err);
  }
};

exports.updatePublicSession = async (req, res, next) => {
  try {
    const {
      patientId,
      sessionId,
      metrics,
    } = req.body;

    if (
      !patientId ||
      !String(patientId).startsWith("GH-") ||
      !sessionId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid patientId and sessionId are required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid session ID format.",
      });
    }

    const session = await Session.findById(sessionId);

    if (
      !session ||
      session.patientIdRef !== String(patientId)
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Session not found for this patient.",
      });
    }

    if (session.mode !== "public") {
      return res.status(403).json({
        success: false,
        message: "Not a public session.",
      });
    }

    if (session.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Session already completed.",
      });
    }

    if (metrics) {
      if (typeof metrics.score === "number") {
        session.score = metrics.score;
      }

      if (typeof metrics.accuracy === "number") {
        session.accuracy = metrics.accuracy;
      }

      if (typeof metrics.combo === "number") {
        session.combo = metrics.combo;
      }

      if (typeof metrics.maxCombo === "number") {
        session.maxCombo = metrics.maxCombo;
      }

      if (typeof metrics.level === "number") {
        session.level = metrics.level;
      }

      if (typeof metrics.durationSeconds === "number") {
        session.durationSeconds =
          metrics.durationSeconds;
      }

      if (typeof metrics.missedActions === "number") {
        session.missedActions =
          metrics.missedActions;
      }
    }

    await session.save();

    res.json({
      success: true,
      session,
    });
  } catch (err) {
    next(err);
  }
};

exports.finishPublicSession = async (req, res, next) => {
  try {
    const {
      patientId,
      sessionId,
      score,
      level,
      accuracy,
      combo,
      maxCombo,
      stars,
      exerciseResults,
      durationSeconds,
      notes,
      gameType,
      romData,
      smoothness,
      stability,
      missedActions,
      painFluctuations,
    } = req.body;

    if (
      !patientId ||
      !String(patientId).startsWith("GH-") ||
      !sessionId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid patientId and sessionId are required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid session ID format.",
      });
    }

    const session = await Session.findById(sessionId);

    if (
      !session ||
      session.patientIdRef !== String(patientId)
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Session not found for this patient.",
      });
    }

    if (session.mode !== "public") {
      return res.status(403).json({
        success: false,
        message: "Not a public session.",
      });
    }

    if (session.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Session already completed.",
      });
    }

    // Save session metrics
    session.score = score || 0;
    session.level = level || 1;
    session.accuracy = accuracy || 0;
    session.combo = combo || 0;
    session.maxCombo = maxCombo || combo || 0;
    session.stars = stars || 0;
    session.exerciseResults = exerciseResults || [];
    session.durationSeconds = durationSeconds || 0;
    session.notes = notes || "";
    session.gameType =
      gameType || session.gameType || "rehab_slicer";

    // Ensure repData is saved even when nested in gameSpecific
    if (req.body.gameSpecific?.fullMetrics?.repData) {
      session.repData = req.body.gameSpecific.fullMetrics.repData;
    } else if (req.body.gameSpecific?.repData) {
      session.repData = req.body.gameSpecific.repData;
    } else if (req.body.repData) {
      session.repData = req.body.repData;
    }
    session.status = "completed";
    session.completedAt = new Date();

    if (romData) {
      session.romData = romData;
    }

    if (smoothness !== undefined) {
      session.smoothness = smoothness;
    }

    if (stability !== undefined) {
      session.stability = stability;
    }

    if (missedActions !== undefined) {
      session.missedActions = missedActions;
    }

    if (painFluctuations) {
      session.painFluctuations = painFluctuations;
    }

    await session.save();

    // Update patient statistics
    const patient = await Patient.findOne({
      patientId: String(patientId),
    });

    if (patient) {
      patient.totalSessions += 1;
      patient.totalScore += score || 0;

      const prevTotal =
        patient.totalSessions - 1;

      patient.averageAccuracy = Math.round(
        ((patient.averageAccuracy * prevTotal) +
          (accuracy || 0)) /
        patient.totalSessions
      );

      if (level > patient.currentLevel) {
        patient.currentLevel = level;
      }

      const dayPlan = patient.rehabPlan.find(
        (d) => d.day === session.day
      );

      if (dayPlan) {
        dayPlan.isCompleted = true;
        dayPlan.completedAt = new Date();
      }

      if (
        session.day === patient.currentDay &&
        patient.currentDay < 7
      ) {
        patient.currentDay += 1;
      }

      await patient.save();

      // Automatically generate report
      try {
        await reportController.buildReportForSession(
          session,
          patient,
          patient.therapistId || null
        );
      } catch (reportErr) {
        console.error(
          "[finishPublicSession] Failed to auto-generate report:",
          reportErr
        );

        // Do not fail the completed session if report
        // generation itself fails.
      }
    }

    res.json({
      success: true,
      session,
    });
  } catch (err) {
    next(err);
  }
};

exports.getPublicSession = async (req, res, next) => {
  try {
    const patientId =
      req.query.patientId ||
      req.body?.patientId;

    const { sessionId } = req.params;

    if (!sessionId || !patientId) {
      return res.status(400).json({
        success: false,
        message:
          "sessionId and patientId are required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid session ID format.",
      });
    }

    const session = await Session.findById(
      sessionId
    ).populate("reportId", "reportNumber");

    if (
      !session ||
      session.patientIdRef !== String(patientId)
    ) {
      return res.status(404).json({
        success: false,
        message: "Session not found.",
      });
    }

    if (session.mode !== "public") {
      return res.status(403).json({
        success: false,
        message: "Not a public session.",
      });
    }

    res.json({
      success: true,
      session,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE SESSION
// ─────────────────────────────────────────────────────────────

exports.deleteSession = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid session ID format.",
      });
    }

    const session = await Session.findOneAndDelete({
      _id: req.params.id,
      therapistId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found.",
      });
    }

    res.json({
      success: true,
      message: "Session deleted.",
    });
  } catch (err) {
    next(err);
  }
};