// backend/src/controllers/adminController.js
const mongoose = require("mongoose");
const User = require("../models/User");
const Patient = require("../models/Patient");
const Session = require("../models/Session");
const Report = require("../models/Report");

// ─── GET /api/admin/stats ──────────────────────────────────────────────────
exports.getStats = async (req, res, next) => {
  try {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const [
      totalPatients,
      activePatients,
      totalTherapists,
      totalSessions,
      totalReports,
      sessionsThisWeek,
    ] = await Promise.all([
      Patient.countDocuments({}),
      Patient.countDocuments({ isActive: true }),
      User.countDocuments({ role: "therapist" }),
      Session.countDocuments({}),
      Report.countDocuments({}),
      Session.countDocuments({ createdAt: { $gte: startOfWeek } }),
    ]);

    res.json({
      success: true,
      stats: {
        totalPatients,
        activePatients,
        inactivePatients: totalPatients - activePatients,
        totalTherapists,
        totalSessions,
        totalReports,
        sessionsThisWeek,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/therapists ─────────────────────────────────────────────
exports.getTherapists = async (req, res, next) => {
  try {
    const therapists = await User.find({ role: "therapist" }).sort({ createdAt: -1 });

    const counts = await Patient.aggregate([
      { $match: { therapistId: { $ne: null } } },
      { $group: { _id: "$therapistId", count: { $sum: 1 } } },
    ]);
    const countMap = counts.reduce((acc, c) => {
      acc[String(c._id)] = c.count;
      return acc;
    }, {});

    const therapistsWithCounts = therapists.map((t) => ({
      ...t.toJSON(),
      patientCount: countMap[String(t._id)] || 0,
    }));

    res.json({ success: true, therapists: therapistsWithCounts });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/therapists/:id ─────────────────────────────────────────
exports.getTherapistDetail = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid therapist ID format." });
    }

    const therapist = await User.findOne({ _id: req.params.id, role: "therapist" });
    if (!therapist) {
      return res.status(404).json({ success: false, message: "Therapist not found." });
    }

    const patients = await Patient.find({ therapistId: therapist._id }).sort({ createdAt: -1 });

    res.json({ success: true, therapist, patients });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/admin/therapists/:id/status ──────────────────────────────────
exports.updateTherapistStatus = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid therapist ID format." });
    }

    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ success: false, message: "isActive (boolean) is required." });
    }

    const therapist = await User.findOneAndUpdate(
      { _id: req.params.id, role: "therapist" },
      { isActive },
      { new: true }
    );
    if (!therapist) {
      return res.status(404).json({ success: false, message: "Therapist not found." });
    }

    res.json({ success: true, therapist });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/patients ───────────────────────────────────────────────
exports.getAllPatients = async (req, res, next) => {
  try {
    const { search, condition, therapistId, isActive, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (search) {
      const s = String(search);
      filter.$or = [
        { name: { $regex: s, $options: "i" } },
        { patientId: { $regex: s, $options: "i" } },
        { condition: { $regex: s, $options: "i" } },
      ];
    }
    if (condition) filter.condition = { $regex: String(condition), $options: "i" };
    if (therapistId) {
      if (!mongoose.Types.ObjectId.isValid(therapistId)) {
        return res.status(400).json({ success: false, message: "Invalid therapist ID format." });
      }
      filter.therapistId = therapistId;
    }
    // Unlike the therapist-facing endpoint, admin can see inactive patients too.
    // Only filter on isActive if explicitly requested.
    if (isActive === "true") filter.isActive = true;
    if (isActive === "false") filter.isActive = false;

    const skip = (Number(page) - 1) * Number(limit);

    const [patients, total] = await Promise.all([
      Patient.find(filter)
        .populate("therapistId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
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

// ─── PUT /api/admin/patients/:id/assign-therapist ──────────────────────────
// Admin-only: assign or unassign a therapist for a patient. Pass therapistId
// as null (or omit it) to unassign, leaving the patient self-managed.
exports.assignTherapist = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid patient ID format." });
    }

    const { therapistId } = req.body;
    if (therapistId) {
      if (!mongoose.Types.ObjectId.isValid(therapistId)) {
        return res.status(400).json({ success: false, message: "Invalid therapist ID format." });
      }
      const therapist = await User.findOne({ _id: therapistId, role: "therapist" });
      if (!therapist) {
        return res.status(404).json({ success: false, message: "Therapist not found." });
      }
    }

    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      { therapistId: therapistId || null },
      { new: true }
    ).populate("therapistId", "name email");

    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }

    res.json({ success: true, patient });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/patients/:id ───────────────────────────────────────────
exports.getPatientDetail = async (req, res, next) => {
  try {
    const idParam = req.params.id;
    if (!idParam.startsWith("GH-") && !mongoose.Types.ObjectId.isValid(idParam)) {
      return res.status(400).json({ success: false, message: "Invalid patient ID format." });
    }

    const query = idParam.startsWith("GH-") ? { patientId: idParam } : { _id: idParam };
    const patient = await Patient.findOne(query).populate("therapistId", "name email");
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }

    const [sessions, reports] = await Promise.all([
      Session.find({ patientId: patient._id }).sort({ createdAt: -1 }),
      Report.find({ patientId: patient._id }).sort({ createdAt: -1 }).select("-patientSnapshot"),
    ]);

    res.json({ success: true, patient, sessions, reports });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/reports ────────────────────────────────────────────────
exports.getAllReports = async (req, res, next) => {
  try {
    const { patientId, therapistId, startDate, endDate, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (patientId) {
      if (!mongoose.Types.ObjectId.isValid(patientId)) {
        return res.status(400).json({ success: false, message: "Invalid patient ID format." });
      }
      filter.patientId = patientId;
    }
    if (therapistId) {
      if (!mongoose.Types.ObjectId.isValid(therapistId)) {
        return res.status(400).json({ success: false, message: "Invalid therapist ID format." });
      }
      filter.therapistId = therapistId;
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .populate("patientId", "name patientId age gender condition surgeryType surgeryDate goals painLevel therapistId")
        .populate("therapistId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Report.countDocuments(filter),
    ]);

    res.json({
      success: true,
      reports,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/sessions ───────────────────────────────────────────────
exports.getAllSessions = async (req, res, next) => {
  try {
    const { patientId, therapistId, status, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (patientId) {
      if (!mongoose.Types.ObjectId.isValid(patientId)) {
        return res.status(400).json({ success: false, message: "Invalid patient ID format." });
      }
      filter.patientId = patientId;
    }
    if (therapistId) {
      if (!mongoose.Types.ObjectId.isValid(therapistId)) {
        return res.status(400).json({ success: false, message: "Invalid therapist ID format." });
      }
      filter.therapistId = therapistId;
    }
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [sessions, total] = await Promise.all([
      Session.find(filter)
        .populate("patientId", "name patientId age gender condition surgeryType surgeryDate goals painLevel therapistId")
        .populate("therapistId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Session.countDocuments(filter),
    ]);

    res.json({
      success: true,
      sessions,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};
// ─── ADDITIONS to backend/src/controllers/adminController.js ──────────────
// Append these exports to your existing adminController.js (after getAllSessions).
// Requires: const Patient = require("../models/Patient"); (already imported)
//           const Session = require("../models/Session"); (already imported)
//           const Report = require("../models/Report");   (already imported)

// ─── GET /api/admin/analytics/engagement?days=30 ───────────────────────────
// Line chart: daily active patients + session volume + engagement rate,
// derived from real Session documents (no mock data).
exports.getEngagementTrends = async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const [dailyStats, totalActivePatients] = await Promise.all([
      Session.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            sessionsCount: { $sum: 1 },
            activePatientIds: { $addToSet: "$patientId" },
          },
        },
        {
          $project: {
            _id: 0,
            date: "$_id",
            sessionsCount: 1,
            activePatients: { $size: "$activePatientIds" },
          },
        },
        { $sort: { date: 1 } },
      ]),
      Patient.countDocuments({ isActive: true }),
    ]);

    // Fill in zero-days so the chart doesn't have gaps for days with no sessions.
    const statsByDate = new Map(dailyStats.map((d) => [d.date, d]));
    const series = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const existing = statsByDate.get(dateStr);
      const activePatients = existing?.activePatients || 0;
      series.push({
        date: dateStr,
        sessionsCount: existing?.sessionsCount || 0,
        activePatients,
        engagementRate: totalActivePatients
          ? Math.round((activePatients / totalActivePatients) * 1000) / 10
          : 0,
      });
    }

    res.json({ success: true, series, totalActivePatients });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/analytics/dau-sessions?days=14 ─────────────────────────
// Bar chart: Daily Active Users vs total session count, per day.
// Same underlying aggregation as engagement trends but returned in the
// day/dau/sessions shape a bar chart component expects.
exports.getDauVsSessions = async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 60);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const dailyStats = await Session.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          sessions: { $sum: 1 },
          dauIds: { $addToSet: "$patientId" },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          sessions: 1,
          dau: { $size: "$dauIds" },
        },
      },
      { $sort: { date: 1 } },
    ]);

    const statsByDate = new Map(dailyStats.map((d) => [d.date, d]));
    const series = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const existing = statsByDate.get(dateStr);
      series.push({
        date: dateStr,
        dau: existing?.dau || 0,
        sessions: existing?.sessions || 0,
      });
    }

    res.json({ success: true, series });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/analytics/completion-rates ─────────────────────────────
// Donut chart: completion rate per game type, based on real Session.status.
exports.getCompletionRates = async (req, res, next) => {
  try {
    const results = await Session.aggregate([
      {
        $group: {
          _id: "$gameType",
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          gameType: "$_id",
          total: 1,
          completed: 1,
          completionRate: {
            $cond: [
              { $eq: ["$total", 0] },
              0,
              { $round: [{ $multiply: [{ $divide: ["$completed", "$total"] }, 100] }, 1] },
            ],
          },
        },
      },
      { $sort: { total: -1 } },
    ]);

    res.json({ success: true, gameTypes: results });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/analytics/at-risk?limit=10 ─────────────────────────────
// Priority list of at-risk patients, sorted by riskScore. Real field on
// Patient (see Phase 1 migration) — not derived on the fly here, since
// riskScore is meant to be a persisted, periodically-recomputed value.
exports.getAtRiskPatients = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

    const patients = await Patient.find({
      status: { $in: ["at-risk", "active"] },
      isActive: true,
    })
      .populate("therapistId", "name email")
      .sort({ riskScore: -1 })
      .limit(limit)
      .select("name patientId condition riskScore status painLevel averageAccuracy currentDay therapistId lastSessionAt");

    res.json({ success: true, patients });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/analytics/heatmap?days=90 ──────────────────────────────
// Calendar heatmap: session count per day, for GitHub-contributions-style view.
exports.getSessionHeatmap = async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 365);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const results = await Session.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, date: "$_id", count: 1 } },
      { $sort: { date: 1 } },
    ]);

    res.json({ success: true, days: results });
  } catch (err) {
    next(err);
  }
};