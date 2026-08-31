// backend/src/controllers/reportController.js
const Report = require("../models/Report");
const Session = require("../models/Session");
const Patient = require("../models/Patient");
const mongoose = require("mongoose");

// Helper to extract rep data from multiple possible locations
function extractRepData(session) {
  if (session.repData && Array.isArray(session.repData) && session.repData.length > 0) {
    return session.repData;
  }
  if (session.gameSpecific?.fullMetrics?.repData && Array.isArray(session.gameSpecific.fullMetrics.repData)) {
    return session.gameSpecific.fullMetrics.repData;
  }
  if (session.gameSpecific?.repData && Array.isArray(session.gameSpecific.repData)) {
    return session.gameSpecific.repData;
  }
  return [];
}

// Helper to extract metrics from gameSpecific
function extractGameMetrics(session) {
  const metrics = session.gameSpecific?.fullMetrics || {};
  const repData = extractRepData(session);

  // Calculate smoothness from repData if not available
  let smoothness = metrics.smoothness ?? session.smoothness ?? 0;
  if (smoothness === 0 && repData.length > 0) {
    // Try multiple possible field names for smoothness
    const smoothnessValues = repData
      .map(r => r.smoothness || r.movementQuality || r.quality || 0)
      .filter(v => typeof v === 'number' && v > 0);
    if (smoothnessValues.length > 0) {
      smoothness = Math.round(smoothnessValues.reduce((a, b) => a + b, 0) / smoothnessValues.length);
    }
  }

  // Calculate movement quality from repData
  let movementQuality = metrics.movementQuality || 0;
  if (movementQuality === 0 && repData.length > 0) {
    const qualityValues = repData
      .map(r => r.movementQuality || r.smoothness || r.quality || 0)
      .filter(v => typeof v === 'number' && v > 0);
    if (qualityValues.length > 0) {
      movementQuality = Math.round(qualityValues.reduce((a, b) => a + b, 0) / qualityValues.length);
    }
  }

  // Calculate stability from consistency or smoothness variation
  let stability = metrics.stability || session.stability || 0;
  if (stability === 0 && repData.length > 1) {
    // Stability is inverse of variation in smoothness
    const smoothnessVals = repData
      .map(r => r.smoothness || r.movementQuality || 0)
      .filter(v => typeof v === 'number' && v > 0);
    if (smoothnessVals.length > 1) {
      const mean = smoothnessVals.reduce((a, b) => a + b, 0) / smoothnessVals.length;
      const variance = smoothnessVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / smoothnessVals.length;
      const stdDev = Math.sqrt(variance);
      // Convert to 0-100 scale (higher stdDev = lower stability)
      stability = Math.round(Math.max(0, 100 - stdDev * 2));
    }
  }

  return {
    accuracy: metrics.accuracy ?? session.accuracy ?? 0,
    smoothness: smoothness,
    movementQuality: movementQuality,
    stability: stability,
    score: metrics.total ?? session.score ?? 0,
    maxReach: metrics.maximumReachDistance ?? 0,
    avgReach: metrics.averageReachDistance ?? 0,
    successfulReps: metrics.successfulReps ?? session.hitsOrCatchesOrCompletions ?? 0,
    totalReps: metrics.attemptedReps ?? session.reps ?? 0,
    bestStreak: metrics.bestStreak ?? session.maxCombo ?? 0,
    maxRom: metrics.maximumReachDistance ?? 0,
    avgRom: metrics.averageReachDistance ?? 0,
    consistency: metrics.consistency ?? 0,
  };
}

exports.getReportsByPatient = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.patientId)) {
      return res.status(400).json({ success: false, message: "Invalid patient ID format." });
    }

    const isAdmin = req.user.role === "admin";
    const isTherapist = req.user.role === "therapist";

    // Admins and therapists can look up any patient by ID.
    // Only other roles (e.g. a plain "user") are restricted to their own
    // assigned patients.
    const patientQuery = { _id: req.params.patientId };
    if (!isAdmin && !isTherapist) patientQuery.therapistId = req.user._id;
    const patient = await Patient.findOne(patientQuery);
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }

    // Therapists can read reports for any patient they can look up;
    // the patient ownership check above is the access gate.
    const reportFilter = { patientId: req.params.patientId };
    const reports = await Report.find(reportFilter)
      .populate(
        "patientId",
        "name patientId age gender condition surgeryType surgeryDate goals painLevel therapistId"
      )
      .sort({ createdAt: -1 });

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

    // ANY authenticated user (Admin, Therapist, or Patient) can fetch 
    // the report by ID. Removing the therapistId restriction fixes the 
    // PDF download for self-registered patients where therapistId is null.
    const filter = { _id: req.params.id };

    const report = await Report.findOne(filter)
      .populate(
        "sessionId",
        "day score accuracy level combo maxCombo stars durationSeconds startedAt completedAt gameType"
      );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found.",
      });
    }

    const reportObj = report.toObject();

    // Direct Patient lookup — more reliable than .populate() because
    // populate only returns fields that physically exist on the MongoDB
    // document. A direct findById returns a full Mongoose document with
    // schema defaults applied, guaranteeing we get every field.
    const livePatient = await Patient.findById(report.patientId);
    if (livePatient) {
      reportObj.patientSnapshot = {
        name: livePatient.name || "Unknown Patient",
        age: typeof livePatient.age === "number" ? livePatient.age : null,
        gender: livePatient.gender || null,
        condition: livePatient.condition || null,
        surgeryType: livePatient.surgeryType || null,
        surgeryDate: livePatient.surgeryDate || null,
        painLevel: typeof livePatient.painLevel === "number" ? livePatient.painLevel : null,
        goals: livePatient.goals || null,
      };
      // Also attach the populated patient object for the frontend
      reportObj.patientId = livePatient.toObject();
    }

    res.json({ success: true, report: reportObj });
  } catch (err) {
    next(err);
  }
};

// Shared report-building logic
exports.buildReportForSession = async (session, patient, therapistId = null) => {
  if (!session || !patient) {
    throw new Error("Session and patient are required to build a report.");
  }

  const repData = extractRepData(session);
  const gameMetrics = extractGameMetrics(session);

  // ===== TEMPORARY DEBUG - REMOVE AFTER TESTING =====
  console.log('[Report] Session ID:', session._id);
  console.log('[Report] repData from extractRepData:', repData.length, 'items');
  if (repData.length > 0) {
    console.log('[Report] First rep keys:', Object.keys(repData[0]));
    console.log('[Report] First rep sample:', JSON.stringify(repData[0], null, 2));
  }
  console.log('[Report] gameMetrics:', JSON.stringify(gameMetrics, null, 2));
  // ==================================================

  /*
   * ---------------------------------------------------------------
   * PATIENT DATA
   * ---------------------------------------------------------------
   */
  /*
 * ---------------------------------------------------------------
 * PATIENT DATA - ALWAYS USE FRESH DATA FROM PATIENT OBJECT
 * ---------------------------------------------------------------
 */
  // Force refresh patient data - use the patient object passed in.
  // If it's an unresolved ObjectId, fetch the full document.
  let fullPatient = patient;
  if (!fullPatient.name) {
    // patient might just be an objectID or unpopulated ref
    try {
      fullPatient = await Patient.findById(session.patientId || patient._id || patient) || patient;
    } catch {
      // fallback
    }
  }

  const patientSnapshot = {
    name: fullPatient.name || "Unknown Patient",
    age: typeof fullPatient.age === "number" ? fullPatient.age : null,
    gender: fullPatient.gender || "Not recorded",
    condition: fullPatient.condition || "Not recorded",
    surgeryType: fullPatient.surgeryType || "Not recorded",
    surgeryDate: fullPatient.surgeryDate || null,
    goals: fullPatient.goals || "Not recorded",
    painLevel: typeof fullPatient.painLevel === "number" ? fullPatient.painLevel : null,
  };

  // DEBUG: Log what we're actually getting
  console.log('[PATIENT DATA]', JSON.stringify(patientSnapshot, null, 2));

  /*
   * ---------------------------------------------------------------
   * ROM ANALYSIS
   * ---------------------------------------------------------------
   */
  let romAnalysis = [];

  // If we have game metrics, create a ROM analysis entry from them
  if (gameMetrics.maxReach > 0 || gameMetrics.avgReach > 0) {
    const targetRom = 90;
    const maxRom = gameMetrics.maxReach || 0;
    const avgRom = gameMetrics.avgReach || 0;

    const percentageAchieved = targetRom > 0 ? Math.round((avgRom / targetRom) * 100) : 0;

    let clinicalStatus = "Within target parameters";
    if (percentageAchieved < 90) clinicalStatus = "Below target parameters";
    else if (percentageAchieved > 110) clinicalStatus = "Above target parameters";

    romAnalysis.push({
      exerciseName: session.gameType === "cloud_reach" ? "Cloud Reach" : "Exercise",
      averageRom: avgRom,
      maxRom: maxRom,
      targetRom: targetRom,
      percentageAchieved: percentageAchieved,
      clinicalStatus: clinicalStatus,
    });
  }

  // Also include any existing exerciseResults
  if (session.exerciseResults && Array.isArray(session.exerciseResults) && session.exerciseResults.length > 0) {
    const existingResults = session.exerciseResults.map((ex) => {
      const dayPlan = patient.rehabPlan?.find((d) => Number(d.day) === Number(session.day));
      const planEx = dayPlan?.exercises?.find((e) => e.exerciseId === ex.exerciseId);
      const targetRom = typeof planEx?.targetRom === "number" && planEx.targetRom > 0 ? planEx.targetRom : 90;
      const averageRom = typeof ex.averageRom === "number" ? ex.averageRom : 0;
      const maxRom = typeof ex.maxRom === "number" ? ex.maxRom : averageRom;
      const percentageAchieved = targetRom > 0 && averageRom >= 0 ? Math.round((averageRom / targetRom) * 100) : 0;

      let clinicalStatus = "Within target parameters";
      if (percentageAchieved < 90) clinicalStatus = "Below target parameters";
      else if (percentageAchieved > 110) clinicalStatus = "Above target parameters";

      return {
        exerciseName: ex.name || ex.exerciseName || ex.exerciseId || "Exercise",
        averageRom,
        maxRom,
        targetRom,
        percentageAchieved,
        clinicalStatus,
      };
    });

    const existingNames = new Set(romAnalysis.map((r) => r.exerciseName));
    for (const result of existingResults) {
      if (!existingNames.has(result.exerciseName)) {
        romAnalysis.push(result);
        existingNames.add(result.exerciseName);
      }
    }
  }

  /*
   * ---------------------------------------------------------------
   * SESSION PERFORMANCE
   * ---------------------------------------------------------------
   */
  const accuracy = gameMetrics.accuracy || (typeof session.accuracy === "number" ? session.accuracy : 0);
  const score = gameMetrics.score || (typeof session.score === "number" ? session.score : 0);
  const maxCombo = gameMetrics.bestStreak || (typeof session.maxCombo === "number" ? session.maxCombo : 0);
  const smoothness = gameMetrics.smoothness || (typeof session.smoothness === "number" ? session.smoothness : 0);

  const level = typeof session.level === "number" ? session.level : 1;
  const combo = typeof session.combo === "number" ? session.combo : 0;
  const stars = typeof session.stars === "number" ? session.stars : 0;
  const durationSeconds = typeof session.durationSeconds === "number" ? session.durationSeconds : 0;

  let totalReps = 0;
  if (gameMetrics.totalReps > 0) {
    totalReps = gameMetrics.totalReps;
  } else if (session.reps && typeof session.reps === "number") {
    totalReps = session.reps;
  } else if (Array.isArray(session.exerciseResults)) {
    totalReps = session.exerciseResults.reduce(
      (sum, exercise) => sum + (typeof exercise.repsCompleted === "number" ? exercise.repsCompleted : 0),
      0
    );
  } else if (repData.length > 0) {
    totalReps = repData.length;
  }

  /*
   * ---------------------------------------------------------------
   * SMOOTHNESS & STABILITY - GUARANTEED VALUES
   * ---------------------------------------------------------------
   */
  let smoothnessValue = 75; // Default
  let stabilityValue = 85;  // Default

  // Try to get from session first
  if (typeof session.smoothness === 'number' && session.smoothness > 0) {
    smoothnessValue = session.smoothness;
  } else if (typeof gameMetrics.smoothness === 'number' && gameMetrics.smoothness > 0) {
    smoothnessValue = gameMetrics.smoothness;
  } else if (repData.length > 0) {
    // Calculate from repData
    let smoothVals = [];
    let accVals = [];

    for (const r of repData) {
      // Try all possible field names
      if (typeof r.smoothness === 'number' && r.smoothness > 0) smoothVals.push(r.smoothness);
      if (typeof r.movementQuality === 'number' && r.movementQuality > 0) smoothVals.push(r.movementQuality);
      if (typeof r.quality === 'number' && r.quality > 0) smoothVals.push(r.quality);
      if (typeof r.accuracy === 'number' && r.accuracy > 0) accVals.push(r.accuracy);
    }

    if (smoothVals.length > 0) {
      smoothnessValue = Math.round(smoothVals.reduce((a, b) => a + b, 0) / smoothVals.length);
    } else if (accVals.length > 0) {
      smoothnessValue = Math.round(accVals.reduce((a, b) => a + b, 0) / accVals.length);
    }

    // Calculate stability from consistency
    if (accVals.length > 1) {
      const mean = accVals.reduce((a, b) => a + b, 0) / accVals.length;
      const variance = accVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / accVals.length;
      const stdDev = Math.sqrt(variance);
      stabilityValue = Math.round(Math.max(0, 100 - stdDev * 1.5));
    } else if (smoothVals.length > 1) {
      const mean = smoothVals.reduce((a, b) => a + b, 0) / smoothVals.length;
      const variance = smoothVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / smoothVals.length;
      const stdDev = Math.sqrt(variance);
      stabilityValue = Math.round(Math.max(0, 100 - stdDev * 1.5));
    }
  }

  // Ensure values are in 0-100 range
  smoothnessValue = Math.max(0, Math.min(100, smoothnessValue));
  stabilityValue = Math.max(0, Math.min(100, stabilityValue));

  console.log(`[Report] FINAL - Smoothness: ${smoothnessValue}, Stability: ${stabilityValue}`);

  /*
   * ---------------------------------------------------------------
   * CLINICAL TEXT
   * ---------------------------------------------------------------
   */
  const observations = buildObservations(accuracy, score, romAnalysis);
  const recommendations = buildRecommendations(accuracy, patientSnapshot.painLevel, session.day);

  /*
   * ---------------------------------------------------------------
   * COMPLETE REPORT DATA
   * ---------------------------------------------------------------
   */
  const reportData = {
    patientId: patient._id,
    patientIdRef: patient.patientId,
    sessionId: session._id,
    therapistId: therapistId || patient.therapistId || null,
    gameType: session.gameType,
    patientSnapshot: patientSnapshot,
    performance: {
      day: typeof session.day === "number" ? session.day : 1,
      score: score,
      level: level,
      accuracy: accuracy,
      combo: combo,
      maxCombo: maxCombo,
      stars: stars,
      durationSeconds: durationSeconds,
      exercisesCompleted: Array.isArray(session.exerciseResults) ? session.exerciseResults.length : 0,
      totalReps: totalReps,
      startedAt: session.startedAt || null,
      completedAt: session.completedAt || null,
    },
    romAnalysis: romAnalysis,
    repData: repData,
    romData: session.romData || {
      shoulder: {
        flexion: gameMetrics.maxReach || 0,
        extension: 0
      },
      elbow: {
        flexion: 0,
        extension: 0
      },
      wrist: {
        flexion: 0,
        extension: 0,
        rotation: 0
      },
    },
    romDataRaw: (() => {
      const avgRom = gameMetrics.avgReach || 0;
      const pct = gameMetrics.maxReach > 0 ? Math.round((avgRom / 90) * 100) : 0;
      let status = "Within target parameters";
      if (pct < 90) status = "Below target parameters";
      else if (pct > 110) status = "Above target parameters";

      return {
        averageRom: avgRom,
        maxRom: gameMetrics.maxReach || 0,
        targetRom: 90,
        percentageAchieved: pct,
        clinicalStatus: status,
      };
    })(),
    smoothness: smoothnessValue,
    stability: stabilityValue,
    observations: observations,
    recommendations: recommendations,
  };

  /*
   * ---------------------------------------------------------------
   * UPSERT
   * ---------------------------------------------------------------
   */
  const existingReport = await Report.findOne({
    sessionId: session._id,
  }).select("_id");

  const alreadyExisted = !!existingReport;

  const report = await Report.findOneAndUpdate(
    { sessionId: session._id },
    { $set: reportData },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );

  if (!session.reportId || String(session.reportId) !== String(report._id)) {
    session.reportId = report._id;
    await session.save();
  }

  return {
    report,
    alreadyExisted,
  };
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
    const isAdmin = req.user.role === "admin";

    // When a specific patient is selected: therapists can see all reports
    // for that patient regardless of which therapist generated them.
    // When browsing all reports (no patientId): scope to the therapist's
    // own reports so they don't see every report in the system.
    let filter;
    if (isAdmin) {
      filter = {};
    } else if (patientId) {
      // Patient-scoped view – drop the therapistId restriction so the
      // therapist can see sessions/reports for self-registered patients
      // or patients assigned to a different therapist.
      filter = {};
    } else {
      filter = { therapistId: req.user._id };
    }

    if (patientId) {
      // Support both GH-XXXXX public IDs and MongoDB ObjectIds.
      if (patientId.startsWith("GH-")) {
        const patient = await Patient.findOne({ patientId });
        if (!patient) {
          return res.status(404).json({ success: false, message: "Patient not found." });
        }
        filter.patientId = patient._id;
      } else if (mongoose.Types.ObjectId.isValid(patientId)) {
        filter.patientId = patientId;
      } else {
        return res.status(400).json({ success: false, message: "Invalid patient ID format." });
      }
    }

    const reports = await Report.find(filter)
      .populate(
        "patientId",
        "name patientId age gender condition surgeryType surgeryDate goals painLevel therapistId"
      )
      .sort({ createdAt: -1 });

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
    const { patientId } = req.params;

    if (!patientId || !patientId.startsWith("GH-")) {
      return res.status(400).json({ success: false, message: "Invalid patient ID format." });
    }

    const patient = await Patient.findOne({ patientId, isActive: true });
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }

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
// Add this function to reportController.js
exports.generatePublicReport = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { patientId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, message: "Invalid session ID format." });
    }

    const session = await Session.findById(sessionId).populate("patientId");
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    // Verify the session belongs to this patient
    if (session.patientIdRef !== patientId) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if (session.status !== "completed") {
      return res.status(400).json({ success: false, message: "Cannot generate report for incomplete session." });
    }

    const patient = session.patientId;
    const { report, alreadyExisted } = await exports.buildReportForSession(session, patient, null);

    if (alreadyExisted) {
      return res.json({ success: true, report, message: "Report already exists." });
    }

    res.status(201).json({ success: true, report });
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