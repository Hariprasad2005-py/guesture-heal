const Patient = require("../models/Patient");
const Session = require("../models/Session");
const Report = require("../models/Report");

exports.getDashboardStats = async (req, res, next) => {
  try {
    const therapistId = req.user._id;

    const [totalPatients, totalSessions, recentSessions, recentPatients] = await Promise.all([
      Patient.countDocuments({ therapistId, isActive: true }),
      Session.countDocuments({ therapistId, status: "completed" }),
      Session.find({ therapistId, status: "completed" })
        .sort({ completedAt: -1 })
        .limit(5)
        .populate("patientId", "name condition"),
      Patient.find({ therapistId, isActive: true })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name condition currentDay totalSessions averageAccuracy createdAt"),
    ]);

    const accuracyAgg = await Session.aggregate([
      { $match: { therapistId, status: "completed" } },
      { $group: { _id: null, avgAccuracy: { $avg: "$accuracy" }, avgScore: { $avg: "$score" } } },
    ]);

    const avgAccuracy = accuracyAgg[0]?.avgAccuracy ? Math.round(accuracyAgg[0].avgAccuracy) : 0;
    const avgScore = accuracyAgg[0]?.avgScore ? Math.round(accuracyAgg[0].avgScore) : 0;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sessionTrend = await Session.aggregate([
      { $match: { therapistId, status: "completed", completedAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } },
          count: { $sum: 1 },
          avgAccuracy: { $avg: "$accuracy" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const activePatientIds = await Session.distinct("patientId", {
      therapistId,
      completedAt: { $gte: threeDaysAgo },
    });

    res.json({
      success: true,
      stats: {
        totalPatients,
        totalSessions,
        avgAccuracy,
        avgScore,
        activePatients: activePatientIds.length,
      },
      recentSessions,
      recentPatients,
      sessionTrend,
    });
  } catch (err) {
    next(err);
  }
};

exports.getPatientProgress = async (req, res, next) => {
  try {
    const patient = await Patient.findOne({
      _id: req.params.patientId,
      therapistId: req.user._id,
    });
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }

    const sessions = await Session.find({
      patientId: req.params.patientId,
      status: "completed",
    }).sort({ completedAt: 1 });

    const progressData = sessions.map((s, idx) => ({
      session: idx + 1,
      day: s.day,
      score: s.score,
      accuracy: s.accuracy,
      combo: s.combo,
      level: s.level,
      date: s.completedAt,
    }));

    const romTrend = {};
    sessions.forEach((s) => {
      s.exerciseResults.forEach((ex) => {
        if (!romTrend[ex.name]) romTrend[ex.name] = [];
        romTrend[ex.name].push(ex.averageRom);
      });
    });

    res.json({
      success: true,
      patient: {
        name: patient.name,
        condition: patient.condition,
        currentDay: patient.currentDay,
        currentLevel: patient.currentLevel,
        totalSessions: patient.totalSessions,
        averageAccuracy: patient.averageAccuracy,
        rehabPlan: patient.rehabPlan.map((d) => ({
          day: d.day,
          isCompleted: d.isCompleted,
          completedAt: d.completedAt,
          exerciseCount: d.exercises.length,
        })),
      },
      progressData,
      romTrend,
    });
  } catch (err) {
    next(err);
  }
};