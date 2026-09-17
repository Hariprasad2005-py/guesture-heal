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

// Helper to extract metrics from gameSpecific.
// IMPORTANT: every field here uses `typeof x === "number"` checks, never
// `?? 0` / `|| 0`. A missing metric must resolve to `null`, not 0 -- 0 is a
// real, distinct clinical value. Downstream code relies on `typeof === "number"`
// to distinguish "recorded" from "not recorded", so a stray `?? 0` here would
// silently defeat every null-safety check that consumes this object.
function extractGameMetrics(session) {
  const metrics = session.gameSpecific?.fullMetrics || {};
  const repData = extractRepData(session);

  // Smoothness: prefer explicit numeric fields, then derive from repData.
  let smoothness = null;
  if (typeof metrics.smoothness === "number") {
    smoothness = metrics.smoothness;
  } else if (typeof session.smoothness === "number") {
    smoothness = session.smoothness;
  }
  if (smoothness == null && repData.length > 0) {
    const smoothnessValues = repData
      .map((r) => {
        if (typeof r.smoothness === "number") return r.smoothness;
        if (typeof r.movementQuality === "number") return r.movementQuality;
        if (typeof r.quality === "number") return r.quality;
        return null;
      })
      .filter((v) => v != null && v > 0);
    if (smoothnessValues.length > 0) {
      smoothness = Math.round(smoothnessValues.reduce((a, b) => a + b, 0) / smoothnessValues.length);
    }
  }

  // Movement quality: same pattern.
  let movementQuality = typeof metrics.movementQuality === "number" ? metrics.movementQuality : null;
  if (movementQuality == null && repData.length > 0) {
    const qualityValues = repData
      .map((r) => {
        if (typeof r.movementQuality === "number") return r.movementQuality;
        if (typeof r.smoothness === "number") return r.smoothness;
        if (typeof r.quality === "number") return r.quality;
        return null;
      })
      .filter((v) => v != null && v > 0);
    if (qualityValues.length > 0) {
      movementQuality = Math.round(qualityValues.reduce((a, b) => a + b, 0) / qualityValues.length);
    }
  }

  // Stability: prefer explicit numeric fields, then derive from variance
  // in per-rep smoothness as a proxy for consistency.
  let stability = null;
  if (typeof metrics.stability === "number") {
    stability = metrics.stability;
  } else if (typeof session.stability === "number") {
    stability = session.stability;
  }
  if (stability == null && repData.length > 1) {
    const smoothnessVals = repData
      .map((r) => {
        if (typeof r.smoothness === "number") return r.smoothness;
        if (typeof r.movementQuality === "number") return r.movementQuality;
        return null;
      })
      .filter((v) => v != null && v > 0);
    if (smoothnessVals.length > 1) {
      const mean = smoothnessVals.reduce((a, b) => a + b, 0) / smoothnessVals.length;
      const variance = smoothnessVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / smoothnessVals.length;
      const stdDev = Math.sqrt(variance);
      stability = Math.round(Math.max(0, 100 - stdDev * 2));
    }
  }

  return {
    accuracy: typeof metrics.accuracy === "number"
      ? metrics.accuracy
      : (typeof session.accuracy === "number" ? session.accuracy : null),
    smoothness,
    movementQuality,
    stability,
    score: typeof metrics.total === "number"
      ? metrics.total
      : (typeof session.score === "number" ? session.score : null),
    maxReach: typeof metrics.maximumReachDistance === "number" ? metrics.maximumReachDistance : null,
    avgReach: typeof metrics.averageReachDistance === "number" ? metrics.averageReachDistance : null,
    successfulReps: typeof metrics.successfulReps === "number"
      ? metrics.successfulReps
      : (typeof session.hitsOrCatchesOrCompletions === "number" ? session.hitsOrCatchesOrCompletions : null),
    totalReps: typeof metrics.attemptedReps === "number"
      ? metrics.attemptedReps
      : (typeof session.reps === "number" ? session.reps : null),
    bestStreak: typeof metrics.bestStreak === "number"
      ? metrics.bestStreak
      : (typeof session.maxCombo === "number" ? session.maxCombo : null),
    maxRom: typeof metrics.maximumReachDistance === "number" ? metrics.maximumReachDistance : null,
    avgRom: typeof metrics.averageReachDistance === "number" ? metrics.averageReachDistance : null,
    consistency: typeof metrics.consistency === "number" ? metrics.consistency : null,
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
    // ─────────────────────────────────────────────────────────────
    // 50% ACCURACY VALIDITY FILTER
    // ─────────────────────────────────────────────────────────────
    // Applies to EXISTING stored reports, not just new ones. A report
    // whose session scored below 50% must not appear in any report
    // list, regardless of when it was generated. performance.accuracy
    // is null when accuracy was never recorded (a distinct case from
    // "recorded but failing") -- null is intentionally NOT excluded
    // here, only accuracy values that are present and below 50.
    const reportFilter = {
      patientId: req.params.patientId,
      $or: [
        { "performance.accuracy": { $gte: 50 } },
        { "performance.accuracy": null },
        { "performance.accuracy": { $exists: false } },
      ],
    };
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

    // Direct-link guard: the dashboard list can hide a <50% report, but
    // a user (or a bookmarked/shared link) can still hit this route by
    // ID directly. Without this check that would expose an invalid
    // report as if it were a valid completed one -- the exact gap you
    // flagged. Uses the report's own stored performance.accuracy, the
    // same field the list endpoints now filter on, so a report can
    // never be visible in one place and blocked in the other.
    if (
      typeof report.performance?.accuracy === "number" &&
      report.performance.accuracy < 50
    ) {
      return res.status(404).json({
        success: false,
        message: "Report not found.",
      });
    }

    const reportObj = report.toObject();

    // Direct Patient lookup so we can attach a *current* patient object for
    // display fields (e.g. contact info) that should reflect the live
    // record. This must NOT be used to overwrite `patientSnapshot`: that
    // snapshot was captured at report-generation time and is the
    // historical clinical record for this report. Replacing it with live
    // patient data would silently rewrite history (e.g. a patient's age,
    // condition, or pain level as of *today* attached to a report from
    // weeks ago). Only synthesize a snapshot as a fallback if the report
    // genuinely has none stored.
    const livePatient = await Patient.findById(report.patientId);
    if (livePatient) {
      if (!reportObj.patientSnapshot) {
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
      }
      // Attach the live patient object separately (e.g. for contact info,
      // navigation to the current chart) without touching the historical
      // clinical snapshot above.
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
      fullPatient = (await Patient.findById(session.patientId || patient._id || patient)) || patient;
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

  /*
   * ---------------------------------------------------------------
   * ROM ANALYSIS
   * ---------------------------------------------------------------
   */
  let romAnalysis = [];

  // If we have game metrics for reach distance, create a ROM analysis
  // entry from them. targetRom must come from this patient's actual
  // rehab plan for this session's day -- never a hardcoded clinical
  // number, and never fall back to 0/90 when it's genuinely absent.
  if (typeof gameMetrics.maxReach === "number" || typeof gameMetrics.avgReach === "number") {
    const dayPlan = patient.rehabPlan?.find((d) => Number(d.day) === Number(session.day));
    const planEx = dayPlan?.exercises?.find(
      (e) => e.exerciseId === session.gameType || e.gameType === session.gameType
    );
    const targetRom = typeof planEx?.targetRom === "number" && planEx.targetRom > 0 ? planEx.targetRom : null;
    const maxRom = typeof gameMetrics.maxReach === "number" ? gameMetrics.maxReach : null;
    const avgRom = typeof gameMetrics.avgReach === "number" ? gameMetrics.avgReach : null;

    const percentageAchieved =
      targetRom != null && avgRom != null ? Math.round((avgRom / targetRom) * 100) : null;

    let clinicalStatus = null;
    if (percentageAchieved != null) {
      clinicalStatus = "Within target parameters";
      if (percentageAchieved < 90) clinicalStatus = "Below target parameters";
      else if (percentageAchieved > 110) clinicalStatus = "Above target parameters";
    }

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
      const targetRom = typeof planEx?.targetRom === "number" && planEx.targetRom > 0 ? planEx.targetRom : null;
      const averageRom = typeof ex.averageRom === "number" ? ex.averageRom : null;
      const maxRom = typeof ex.maxRom === "number" ? ex.maxRom : averageRom;
      const percentageAchieved =
        targetRom != null && averageRom != null ? Math.round((averageRom / targetRom) * 100) : null;

      let clinicalStatus = null;
      if (percentageAchieved != null) {
        clinicalStatus = "Within target parameters";
        if (percentageAchieved < 90) clinicalStatus = "Below target parameters";
        else if (percentageAchieved > 110) clinicalStatus = "Above target parameters";
      }

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
  const accuracy =
    typeof session.accuracy === "number"
      ? session.accuracy
      : (typeof gameMetrics.accuracy === "number" ? gameMetrics.accuracy : null);
  const score =
    typeof session.score === "number"
      ? session.score
      : (typeof gameMetrics.score === "number" ? gameMetrics.score : null);
  const maxCombo =
    typeof session.maxCombo === "number"
      ? session.maxCombo
      : (typeof gameMetrics.bestStreak === "number" ? gameMetrics.bestStreak : null);

  const level = typeof session.level === "number" ? session.level : null;
  const combo = typeof session.combo === "number" ? session.combo : null;
  const stars = typeof session.stars === "number" ? session.stars : null;
  const durationSeconds = typeof session.durationSeconds === "number" ? session.durationSeconds : null;

  // totalReps: check every legitimate source in priority order. A source
  // is only used if it actually holds a number -- an empty/absent source
  // must never collapse to 0.
  let totalReps = null;
  if (typeof gameMetrics.totalReps === "number") {
    totalReps = gameMetrics.totalReps;
  } else if (typeof session.reps === "number") {
    totalReps = session.reps;
  } else if (Array.isArray(session.exerciseResults) && session.exerciseResults.length > 0) {
    const repCounts = session.exerciseResults
      .map((exercise) => (typeof exercise.repsCompleted === "number" ? exercise.repsCompleted : null))
      .filter((v) => v != null);
    if (repCounts.length > 0) {
      totalReps = repCounts.reduce((sum, v) => sum + v, 0);
    }
  } else if (repData.length > 0) {
    totalReps = repData.length;
  }

  /*
   * ---------------------------------------------------------------
   * SMOOTHNESS & STABILITY
   * ---------------------------------------------------------------
   * extractGameMetrics() already derives these from every legitimate
   * source (explicit session/metric fields, then repData) with proper
   * null-safety -- do not recompute them a second time here. Prefer an
   * explicit session-level field first, then the derived gameMetrics
   * value. null = "not recorded", never a stand-in clinical number.
   * Only clamp a value that actually exists.
   */
  let smoothnessValue = null;
  if (typeof session.smoothness === "number") {
    smoothnessValue = session.smoothness;
  } else if (typeof gameMetrics.smoothness === "number") {
    smoothnessValue = gameMetrics.smoothness;
  }

  let stabilityValue = null;
  if (typeof session.stability === "number") {
    stabilityValue = session.stability;
  } else if (typeof gameMetrics.stability === "number") {
    stabilityValue = gameMetrics.stability;
  }

  if (smoothnessValue != null) smoothnessValue = Math.max(0, Math.min(100, smoothnessValue));
  if (stabilityValue != null) stabilityValue = Math.max(0, Math.min(100, stabilityValue));

  /*
   * ---------------------------------------------------------------
   * CLINICAL TEXT
   * ---------------------------------------------------------------
   */
  const observations = buildObservations(accuracy, score, romAnalysis);
  const recommendations = buildRecommendations(accuracy, patientSnapshot.painLevel, session.day, patient.rehabPlan);

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
      day: typeof session.day === "number" ? session.day : null,
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
    // Use the session's own recorded romData when it exists. Never
    // fabricate joint-specific ROM (e.g. mapping generic reach distance
    // onto "shoulder flexion") -- that is a clinical claim the session
    // never actually made. When nothing was recorded, this is null, and
    // the UI/PDF must render "Not recorded" per joint rather than 0deg.
    romData: session.romData && typeof session.romData === "object" ? session.romData : null,
    // No hardcoded target (90) and no fabricated 0s. targetRom comes only
    // from the patient's actual rehab plan for this session's day/exercise.
    romDataRaw: (() => {
      const avgRom = typeof gameMetrics.avgReach === "number" ? gameMetrics.avgReach : null;
      const maxRom = typeof gameMetrics.maxReach === "number" ? gameMetrics.maxReach : null;

      const dayPlan = patient.rehabPlan?.find((d) => Number(d.day) === Number(session.day));
      const planEx = dayPlan?.exercises?.find(
        (e) => e.exerciseId === session.gameType || e.gameType === session.gameType
      );
      const targetRom = typeof planEx?.targetRom === "number" && planEx.targetRom > 0 ? planEx.targetRom : null;

      const percentageAchieved =
        targetRom != null && avgRom != null ? Math.round((avgRom / targetRom) * 100) : null;

      let clinicalStatus = null;
      if (percentageAchieved != null) {
        clinicalStatus = "Within target parameters";
        if (percentageAchieved < 90) clinicalStatus = "Below target parameters";
        else if (percentageAchieved > 110) clinicalStatus = "Above target parameters";
      }

      return {
        averageRom: avgRom,
        maxRom: maxRom,
        targetRom: targetRom,
        percentageAchieved: percentageAchieved,
        clinicalStatus: clinicalStatus,
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
   * This always recomputes reportData from the *current* canonical
   * session/patient data and writes it, whether the report already
   * existed or not -- so a re-generated report never preserves stale
   * values from a previous run. `alreadyExisted` is only used to choose
   * the right response message/status (see generateReport below), never
   * to skip recomputation.
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

    // buildReportForSession() always recomputes and overwrites the report
    // from the current session data -- an existing report is *updated*,
    // not left untouched -- so the response must say so instead of
    // implying nothing happened.
    return res.status(alreadyExisted ? 200 : 201).json({
      success: true,
      report,
      message: alreadyExisted ? "Report updated with the latest session data." : "Report created.",
    });
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

    // Same 50% validity filter as getReportsByPatient -- this is the
    // endpoint the Reports Dashboard most likely calls when no specific
    // patient is selected, so it's the most probable source of the
    // "Total Reports: 3" / "Avg Accuracy: 90%" figures you're seeing.
    filter.$or = [
      { "performance.accuracy": { $gte: 50 } },
      { "performance.accuracy": null },
      { "performance.accuracy": { $exists: false } },
    ];

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

    const reports = await Report.find({
      patientIdRef: patientId,
      $or: [
        { "performance.accuracy": { $gte: 50 } },
        { "performance.accuracy": null },
        { "performance.accuracy": { $exists: false } },
      ],
    })
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

    return res.status(alreadyExisted ? 200 : 201).json({
      success: true,
      report,
      message: alreadyExisted ? "Report updated with the latest session data." : "Report created.",
    });
  } catch (err) {
    next(err);
  }
};

// Regenerate an existing report from the current session data, for a
// public (patient, no-login) caller. Mirrors generatePublicReport's
// ownership check via session.patientIdRef -- there is no req.user here,
// so this must never assume admin/therapist access like the authenticated
// regenerateReport below does.
exports.regeneratePublicReport = async (req, res, next) => {
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
      return res.status(400).json({ success: false, message: "Cannot regenerate report for incomplete session." });
    }

    const patient = session.patientId;
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found for this session." });
    }

    const therapistId = session.therapistId || patient.therapistId || null;

    const { report } = await exports.buildReportForSession(session, patient, therapistId);

    return res.status(200).json({
      success: true,
      report,
      message: "Report regenerated successfully from the latest session data.",
    });
  } catch (err) {
    next(err);
  }
};

// Regenerate an existing report from the current session data.
// This overwrites the existing report instead of creating a duplicate.
exports.regenerateReport = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid session ID format.",
      });
    }

    const session = await Session.findById(sessionId).populate("patientId");

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found.",
      });
    }

    if (session.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot regenerate report for incomplete session.",
      });
    }

    const isAdmin = req.user?.role === "admin";
    const isTherapist = req.user?.role === "therapist";

    // Admins can regenerate any report.
    // Therapists can regenerate sessions belonging to them,
    // or sessions for patients assigned to them.
    if (!isAdmin && !isTherapist) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    if (
      isTherapist &&
      session.therapistId &&
      String(session.therapistId) !== String(req.user._id)
    ) {
      const patient = await Patient.findById(session.patientId);

      if (
        !patient ||
        !patient.therapistId ||
        String(patient.therapistId) !== String(req.user._id)
      ) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to regenerate this report.",
        });
      }
    }

    const patient = session.patientId;

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found for this session.",
      });
    }

    const therapistId =
      isTherapist
        ? req.user._id
        : session.therapistId || patient.therapistId || null;

    const { report } = await exports.buildReportForSession(
      session,
      patient,
      therapistId
    );

    return res.status(200).json({
      success: true,
      report,
      message: "Report regenerated successfully from the latest session data.",
    });
  } catch (err) {
    next(err);
  }
};
// accuracy/romAnalysis may legitimately be missing -- null is a valid input,
// not an error case, and must never be treated as "poor performance".
function buildObservations(accuracy, score, romAnalysis) {
  const lines = [];

  if (typeof accuracy !== "number") {
    lines.push("Movement accuracy was not recorded for this session.");
  } else if (accuracy >= 85) {
    lines.push("Patient demonstrated excellent form and consistency throughout the session.");
  } else if (accuracy >= 65) {
    lines.push("Patient showed satisfactory performance with some inconsistency in form.");
  } else {
    lines.push("Patient required guidance and showed difficulty maintaining proper form.");
  }

  // Only evaluate ROM against target if at least one exercise actually has
  // a calculated percentageAchieved -- i.e. both a real target and a real
  // measured value existed. Never treat "no target" as "below target".
  const validRom = romAnalysis.filter((r) => typeof r.percentageAchieved === "number");
  if (validRom.length > 0) {
    const avgRomPct = validRom.reduce((s, r) => s + r.percentageAchieved, 0) / validRom.length;
    if (avgRomPct >= 90) {
      lines.push("Range of motion is approaching or exceeding target thresholds.");
    } else if (avgRomPct >= 70) {
      lines.push("Range of motion is progressing well but has not yet reached target values.");
    } else {
      lines.push("Range of motion remains below target; continued focused rehabilitation is recommended.");
    }
  } else {
    lines.push("No target range of motion was on record for this session, so range-of-motion progress could not be evaluated against a target.");
  }

  return lines.join(" ");
}

// painLevel here is the patient's baseline/profile value, not a live
// session measurement -- it must be labeled as such and must never be
// asserted as clinically "well-controlled" on that basis alone.
// rehabPlan is the patient's actual plan; plan length must never be
// assumed to be a fixed number of days.
function buildRecommendations(accuracy, painLevel, day, rehabPlan) {
  const lines = [];

  if (typeof accuracy !== "number") {
    lines.push("Movement accuracy was not recorded for this session, so a progression recommendation could not be based on accuracy.");
  } else if (accuracy < 65) {
    lines.push("Consider revisiting current day exercises before progressing.");
  } else {
    lines.push("Patient may progress to the next session as scheduled.");
  }

  if (typeof painLevel !== "number") {
    lines.push("No pain level is on record for this patient.");
  } else if (painLevel >= 7) {
    lines.push("Pain level recorded in the patient record is high; consult physician before advancing exercise intensity.");
  } else if (painLevel >= 4) {
    lines.push("Pain level recorded in the patient record; monitor closely and adjust exercise intensity as needed.");
  } else {
    lines.push("Pain level recorded in the patient record; no live session pain measurement was captured.");
  }

  const planLength = Array.isArray(rehabPlan) ? rehabPlan.length : null;
  if (typeof day === "number" && planLength != null && planLength > 0 && day >= planLength) {
    lines.push(`Patient is in the final phase of the ${planLength}-day plan; evaluate for extended program.`);
  }

  return lines.join(" ");
}