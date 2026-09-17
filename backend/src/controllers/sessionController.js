// backend/src/controllers/sessionController.js

const mongoose = require("mongoose");
const Session = require("../models/Session");
const Patient = require("../models/Patient");
const reportController = require("./reportController");

// ─────────────────────────────────────────────────────────────
// REP CORRECTNESS NORMALIZATION
// ─────────────────────────────────────────────────────────────
// Session.js's repDataSchema declares `isCorrect: { type: Boolean,
// default: true }`. Exercise-based games (RehabSlicer, CatchFlex) send
// `isCorrect` explicitly, so the default never applies to them. Target-
// based games (Precision Reach) never send `isCorrect` at all -- they
// send `success` -- so on every save Mongoose backfills isCorrect: true
// for every one of their reps regardless of the real outcome: schema
// defaults apply to any declared field missing from the input, whether
// or not the schema is `strict: false`. Every downstream consumer
// (reportController.extractRepData, reportGenerator.js, ReportsPage.jsx)
// falls back to `success` only when `isCorrect` is `undefined`, but a
// saved/reloaded document's isCorrect is never actually undefined --
// masking every real failure as a success (this is why a session with
// 40% accuracy could still show 5/0 correct-incorrect per rep).
//
// This runs on the incoming payload BEFORE it's assigned to the Mongoose
// document path, so an explicit `isCorrect: false` here overrides the
// schema default (defaults only apply when the field is entirely absent
// from the input). Reps that already specify `isCorrect` -- every other
// game -- pass through completely untouched. A rep with neither field
// is also left untouched; nothing here fabricates a value that was
// never actually sent.
// ─────────────────────────────────────────────────────────────
// DAY COMPLETION
// ─────────────────────────────────────────────────────────────
// A day is only "done" when every game assigned to it (dayPlan.exercises,
// one entry per gameType) has at least one COMPLETED session at >=75%
// accuracy. Previously this was a single unconditional write --
// `dayPlan.isCompleted = true` ran as soon as ANY one session for that
// day finished, with no check on accuracy or on which games had
// actually been played. That meant e.g. finishing Cloud Reach alone
// would silently mark a 3-game day complete, and immediately advance
// currentDay, without Precision Reach or Rehab Slicer ever being
// touched. This recomputes the day's true state from persisted
// sessions every time one finishes, instead of trusting a one-shot
// flag flip.
//
// Recomputed (not just set-true-and-forget) so a day that later loses
// a qualifying session (e.g. a bad session gets deleted, see
// deleteSession) doesn't stay stuck showing complete: isCompleted
// always reflects what's actually in the Session collection right now.
const DAY_COMPLETION_ACCURACY_THRESHOLD = Number(process.env.DAY_COMPLETION_ACCURACY_THRESHOLD ?? 0);

async function evaluateDayCompletion(patient, day) {
  const dayPlan = patient.rehabPlan?.find((d) => d.day === day);
  if (!dayPlan) return;

  // The set of games this day actually requires. gameType may be
  // missing on legacy/hand-edited plan entries -- skip those rather
  // than letting an unresolvable requirement block completion forever.
  const requiredGameTypes = [
    ...new Set(
      (dayPlan.exercises || [])
        .map((ex) => ex.gameType)
        .filter(Boolean)
    ),
  ];

  const qualifyingGameTypes = requiredGameTypes.length
    ? await Session.distinct("gameType", {
        patientId: patient._id,
        day,
        status: "completed",
        accuracy: { $gte: DAY_COMPLETION_ACCURACY_THRESHOLD },
      })
    : [];

  const wasCompleted = dayPlan.isCompleted;
  const nowCompleted =
    requiredGameTypes.length > 0 &&
    requiredGameTypes.every((gt) => qualifyingGameTypes.includes(gt));

  dayPlan.isCompleted = nowCompleted;

  // Mirror the same per-game qualifying check onto each exercise entry.
  // Without this, GameSelectPage.jsx's "already completed today" popup
  // (which reads dayPlan.exercises[i].isCompleted) never fires, even
  // for games that individually hit the accuracy threshold -- only the
  // day-level flag above was ever being recomputed.
  (dayPlan.exercises || []).forEach((ex) => {
    if (ex.gameType) {
      ex.isCompleted = qualifyingGameTypes.includes(ex.gameType);
    }
  });
  patient.markModified("rehabPlan");

  if (nowCompleted && !wasCompleted) {
    dayPlan.completedAt = new Date();
    if (day === patient.currentDay && patient.currentDay < 7) {
      patient.currentDay += 1;
    }
  } else if (!nowCompleted) {
    // Don't leave a stale completedAt on a day that no longer
    // qualifies (e.g. after a qualifying session was deleted).
    dayPlan.completedAt = null;
  }
}

exports.evaluateDayCompletion = evaluateDayCompletion;

function normalizeRepCorrectness(repData) {
  if (!Array.isArray(repData)) return repData;
  return repData.map((rep) => {
    if (
      rep &&
      typeof rep === "object" &&
      rep.isCorrect === undefined &&
      typeof rep.success === "boolean"
    ) {
      return { ...rep, isCorrect: rep.success };
    }
    return rep;
  });
}

// ─────────────────────────────────────────────────────────────
// THERAPIST SESSION ENDPOINTS
// ─────────────────────────────────────────────────────────────

exports.getSessionsByPatient = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    const isAdmin = req.user.role === "admin";
    const isTherapist = req.user.role === "therapist";

    const query =
      isAdmin || isTherapist
        ? {}
        : { therapistId: req.user._id };

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

    const sessions = await Session.find({
      patientId: patient._id,
    })
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
      .populate(
        "patientId",
        "name patientId age gender condition surgeryType surgeryDate goals painLevel therapistId rehabPlan"
      )
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

    const formattedSession = session.toObject();

    const fullMetrics =
      formattedSession.gameSpecific?.fullMetrics || null;

    // Only fill values that are genuinely missing.
    // Never replace a valid 0 with another value.
    if (fullMetrics) {
      if (
        (!Array.isArray(formattedSession.repData) ||
          formattedSession.repData.length === 0) &&
        Array.isArray(fullMetrics.repData)
      ) {
        formattedSession.repData = fullMetrics.repData;
      }

      if (
        formattedSession.smoothness == null &&
        typeof fullMetrics.smoothness === "number"
      ) {
        formattedSession.smoothness = fullMetrics.smoothness;
      }

      if (
        formattedSession.stability == null &&
        typeof fullMetrics.stability === "number"
      ) {
        formattedSession.stability = fullMetrics.stability;
      }

      if (
        formattedSession.accuracy == null &&
        typeof fullMetrics.accuracy === "number"
      ) {
        formattedSession.accuracy = fullMetrics.accuracy;
      }

      if (
        formattedSession.score == null &&
        typeof fullMetrics.total === "number"
      ) {
        formattedSession.score = fullMetrics.total;
      }

      if (
        formattedSession.maxCombo == null &&
        typeof fullMetrics.maxCombo === "number"
      ) {
        formattedSession.maxCombo = fullMetrics.maxCombo;
      }

      if (
        formattedSession.combo == null &&
        typeof fullMetrics.combo === "number"
      ) {
        formattedSession.combo = fullMetrics.combo;
      }

      if (
        formattedSession.level == null &&
        typeof fullMetrics.level === "number"
      ) {
        formattedSession.level = fullMetrics.level;
      }

      if (
        formattedSession.durationSeconds == null &&
        typeof fullMetrics.durationSeconds === "number"
      ) {
        formattedSession.durationSeconds =
          fullMetrics.durationSeconds;
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
      day:
        typeof day === "number"
          ? day
          : patient.currentDay || 1,
      gameType:
        gameType || "rehab_slicer",
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
      repData,
      gameSpecific,
    } = req.body;

    // Atomically claim this session for completion. Previously this was a
    // plain findById + a status check on the READ result, with the actual
    // status="completed" write happening much later (after building up
    // session fields). Two near-simultaneous completion requests (retry,
    // double-fire from the frontend, etc.) could both read status
    // "in_progress" before either write landed, both pass the check, and
    // both go on to increment patient.totalSessions -- a real race that
    // produced a cached totalSessions higher than the actual session/report
    // count. Flipping status atomically here means only ONE concurrent
    // request can ever win this transition; a loser gets null back and
    // exits before any patient stats are touched.
    const session = await Session.findOneAndUpdate(
      { _id: req.params.id, therapistId: req.user._id, status: "in_progress" },
      { $set: { status: "completed", completedAt: new Date() } },
      { new: false } // old doc, so all its pre-completion fields are still readable below
    );

    if (!session) {
      const exists = await Session.findById(req.params.id);
      if (!exists || String(exists.therapistId) !== String(req.user._id)) {
        return res.status(404).json({
          success: false,
          message: "Session not found.",
        });
      }
      return res.status(400).json({
        success: false,
        message: "Session is not in progress.",
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 50% ACCURACY COMPLETION THRESHOLD
    // ─────────────────────────────────────────────────────────────
    // Authoritative gate. accuracy >= 50 keeps and completes the
    // session (session was already flipped to "completed" by the
    // atomic claim above). accuracy < 50 deletes this session
    // document outright -- it must not count as completed, must not
    // touch patient.totalSessions/averageAccuracy, must not feed
    // evaluateDayCompletion, and must not generate a report. Exactly
    // 50 must pass (>=, not >). Comparison is against the raw numeric
    // request value, not a rounded/stored copy, so 49.9 stays < 50.
    if (typeof accuracy === "number" && accuracy < 50) {
      await Session.findByIdAndDelete(session._id);
      return res.status(422).json({
        success: false,
        discarded: true,
        accuracy,
        message:
          "Session not saved because accuracy was below the 50% completion threshold.",
      });
    }

    /*
     * IMPORTANT:
     * Do not use `value || fallback`.
     * That converts legitimate values such as 0 into defaults.
     */

    if (typeof score === "number") {
      session.score = score;
    }

    if (typeof level === "number") {
      session.level = level;
    }

    if (typeof accuracy === "number") {
      session.accuracy = accuracy;
    }

    if (typeof combo === "number") {
      session.combo = combo;
    }

    if (typeof maxCombo === "number") {
      session.maxCombo = maxCombo;
    } else if (typeof combo === "number") {
      session.maxCombo = combo;
    }

    if (typeof stars === "number") {
      session.stars = Math.max(0, Math.min(3, stars));
    }

    if (Array.isArray(exerciseResults)) {
      session.exerciseResults = exerciseResults;
    }

    if (typeof durationSeconds === "number") {
      session.durationSeconds = durationSeconds;
    }

    if (typeof notes === "string") {
      session.notes = notes;
    }

    if (gameType) {
      session.gameType = gameType;
    }

    /*
     * Save repData from the actual payload.
     */
    const suppliedRepData =
      Array.isArray(repData)
        ? repData
        : Array.isArray(gameSpecific?.fullMetrics?.repData)
          ? gameSpecific.fullMetrics.repData
          : Array.isArray(gameSpecific?.repData)
            ? gameSpecific.repData
            : null;

    if (suppliedRepData) {
      session.repData = normalizeRepCorrectness(suppliedRepData);
    }

    /*
     * Save actual clinical metrics only when supplied.
     */
    if (romData && typeof romData === "object") {
      session.romData = romData;
    }

    if (typeof smoothness === "number") {
      session.smoothness = smoothness;
    }

    if (typeof stability === "number") {
      session.stability = stability;
    }

    if (typeof missedActions === "number") {
      session.missedActions = missedActions;
    }

    if (Array.isArray(painFluctuations)) {
      session.painFluctuations = painFluctuations;
    }

    // gameSpecific was previously read (for the repData fallback above)
    // but never assigned to the session document -- every game's
    // gameSpecific payload (e.g. Precision Reach's PAPS score,
    // bestCombo, longestHitStreak) was silently discarded on save.
    if (gameSpecific && typeof gameSpecific === "object") {
      session.gameSpecific = gameSpecific;
    }

    await session.save();

    /*
     * Re-read the saved session so the report is generated
     * from exactly what MongoDB contains.
     */
    const savedSession = await Session.findById(session._id);

    const patient = await Patient.findById(
      savedSession.patientId
    );

    if (patient) {
      const actualScore =
        typeof savedSession.score === "number"
          ? savedSession.score
          : 0;

      const actualAccuracy =
        typeof savedSession.accuracy === "number"
          ? savedSession.accuracy
          : null;

      const actualLevel =
        typeof savedSession.level === "number"
          ? savedSession.level
          : null;

      patient.totalSessions += 1;
      patient.totalScore += actualScore;

      const prevTotal = patient.totalSessions - 1;

      if (actualAccuracy != null) {
        patient.averageAccuracy = Math.round(
          (
            patient.averageAccuracy * prevTotal +
            actualAccuracy
          ) / patient.totalSessions
        );
      }

      if (
        actualLevel != null &&
        actualLevel > patient.currentLevel
      ) {
        patient.currentLevel = actualLevel;
      }

      await evaluateDayCompletion(patient, savedSession.day);

      await patient.save();

      /*
       * Generate/update the report AFTER the session has
       * been completely saved and reloaded.
       */
      try {
        await reportController.buildReportForSession(
          savedSession,
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

    /*
     * Return the actual saved session.
     */
    res.json({
      success: true,
      session: savedSession,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// REP DATA
// ─────────────────────────────────────────────────────────────

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

    // Atomically claim this session for completion. Previously this was a
    // plain findById + a status check on the READ result, with the actual
    // status="completed" write happening much later (after building up
    // session fields). Two near-simultaneous completion requests (retry,
    // double-fire from the frontend, etc.) could both read status
    // "in_progress" before either write landed, both pass the check, and
    // both go on to increment patient.totalSessions -- a real race that
    // produced a cached totalSessions higher than the actual session/report
    // count. Flipping status atomically here means only ONE concurrent
    // request can ever win this transition; a loser gets null back and
    // exits before any patient stats are touched.
    const session = await Session.findOneAndUpdate(
      { _id: req.params.id, therapistId: req.user._id, status: "in_progress" },
      { $set: { status: "completed", completedAt: new Date() } },
      { new: false } // old doc, so all its pre-completion fields are still readable below
    );

    if (!session) {
      const exists = await Session.findById(req.params.id);
      if (!exists || String(exists.therapistId) !== String(req.user._id)) {
        return res.status(404).json({
          success: false,
          message: "Session not found.",
        });
      }
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

      if (typeof metrics.stars === "number") {
        session.stars = Math.max(
          0,
          Math.min(3, metrics.stars)
        );
      }

      if (typeof metrics.durationSeconds === "number") {
        session.durationSeconds =
          metrics.durationSeconds;
      }

      if (typeof metrics.missedActions === "number") {
        session.missedActions =
          metrics.missedActions;
      }

      if (typeof metrics.smoothness === "number") {
        session.smoothness = metrics.smoothness;
      }

      if (typeof metrics.stability === "number") {
        session.stability = metrics.stability;
      }

      if (
        Array.isArray(metrics.exerciseResults)
      ) {
        session.exerciseResults =
          metrics.exerciseResults;
      }

      if (
        metrics.romData &&
        typeof metrics.romData === "object"
      ) {
        session.romData = metrics.romData;
      }

      if (Array.isArray(metrics.repData)) {
        session.repData = metrics.repData;
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
      repData,
      gameSpecific,
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

    // Same race-condition fix as completeSession above: atomically claim
    // the in_progress -> completed transition so a duplicate/retried
    // finish request can't both pass the status check and both increment
    // patient stats.
    const session = await Session.findOneAndUpdate(
      { _id: sessionId, patientIdRef: String(patientId), mode: "public", status: "in_progress" },
      { $set: { status: "completed", completedAt: new Date() } },
      { new: false }
    );

    if (!session) {
      const exists = await Session.findById(sessionId);
      if (!exists || exists.patientIdRef !== String(patientId)) {
        return res.status(404).json({
          success: false,
          message: "Session not found for this patient.",
        });
      }
      if (exists.mode !== "public") {
        return res.status(403).json({
          success: false,
          message: "Not a public session.",
        });
      }
      return res.status(400).json({
        success: false,
        message: "Session already completed.",
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 50% ACCURACY COMPLETION THRESHOLD (public/self-serve path)
    // ─────────────────────────────────────────────────────────────
    // Same rule and same reasoning as completeSession: accuracy >= 50
    // keeps/completes; accuracy < 50 deletes the session document and
    // returns a non-success response before any patient/report side
    // effects run.
    if (typeof accuracy === "number" && accuracy < 50) {
      await Session.findByIdAndDelete(session._id);
      return res.status(422).json({
        success: false,
        discarded: true,
        accuracy,
        message:
          "Session not saved because accuracy was below the 50% completion threshold.",
      });
    }

    if (typeof score === "number") {
      session.score = score;
    }

    if (typeof level === "number") {
      session.level = level;
    }

    if (typeof accuracy === "number") {
      session.accuracy = accuracy;
    }

    if (typeof combo === "number") {
      session.combo = combo;
    }

    if (typeof maxCombo === "number") {
      session.maxCombo = maxCombo;
    } else if (typeof combo === "number") {
      session.maxCombo = combo;
    }

    if (typeof stars === "number") {
      session.stars = Math.max(0, Math.min(3, stars));
    }

    if (Array.isArray(exerciseResults)) {
      session.exerciseResults = exerciseResults;
    }

    if (typeof durationSeconds === "number") {
      session.durationSeconds = durationSeconds;
    }

    if (typeof notes === "string") {
      session.notes = notes;
    }

    if (gameType) {
      session.gameType = gameType;
    }

    const suppliedRepData =
      Array.isArray(repData)
        ? repData
        : Array.isArray(gameSpecific?.fullMetrics?.repData)
          ? gameSpecific.fullMetrics.repData
          : Array.isArray(gameSpecific?.repData)
            ? gameSpecific.repData
            : null;

    if (suppliedRepData) {
      session.repData = normalizeRepCorrectness(suppliedRepData);
    }

    if (romData && typeof romData === "object") {
      session.romData = romData;
    }

    if (typeof smoothness === "number") {
      session.smoothness = smoothness;
    }

    if (typeof stability === "number") {
      session.stability = stability;
    }

    if (typeof missedActions === "number") {
      session.missedActions = missedActions;
    }

    if (Array.isArray(painFluctuations)) {
      session.painFluctuations = painFluctuations;
    }

    // Same missing assignment as completeSession above -- gameSpecific
    // was read for the repData fallback but never persisted.
    if (gameSpecific && typeof gameSpecific === "object") {
      session.gameSpecific = gameSpecific;
    }

    await session.save();

    const savedSession = await Session.findById(session._id);

    const patient = await Patient.findOne({
      patientId: String(patientId),
    });

    if (patient) {
      const actualScore =
        typeof savedSession.score === "number"
          ? savedSession.score
          : 0;

      const actualAccuracy =
        typeof savedSession.accuracy === "number"
          ? savedSession.accuracy
          : null;

      const actualLevel =
        typeof savedSession.level === "number"
          ? savedSession.level
          : null;

      patient.totalSessions += 1;
      patient.totalScore += actualScore;

      const prevTotal =
        patient.totalSessions - 1;

      if (actualAccuracy != null) {
        patient.averageAccuracy = Math.round(
          (
            patient.averageAccuracy * prevTotal +
            actualAccuracy
          ) / patient.totalSessions
        );
      }

      if (
        actualLevel != null &&
        actualLevel > patient.currentLevel
      ) {
        patient.currentLevel = actualLevel;
      }

      await evaluateDayCompletion(patient, savedSession.day);

      await patient.save();

      try {
        await reportController.buildReportForSession(
          savedSession,
          patient,
          patient.therapistId || null
        );
      } catch (reportErr) {
        console.error(
          "[finishPublicSession] Failed to auto-generate report:",
          reportErr
        );
      }
    }

    res.json({
      success: true,
      session: savedSession,
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

    // Deleting a session can remove the only qualifying (>=75%) record
    // for one of the day's required games -- recompute so isCompleted
    // doesn't keep claiming a day is done when its evidence is gone.
    const patient = await Patient.findById(session.patientId);
    if (patient) {
      await evaluateDayCompletion(patient, session.day);
      await patient.save();
    }

    res.json({
      success: true,
      message: "Session deleted.",
    });
  } catch (err) {
    next(err);
  }
};