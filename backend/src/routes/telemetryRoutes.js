// backend/src/routes/telemetryRoutes.js
const express = require("express");
const router = express.Router();
const Telemetry = require("../models/Telemetry");
const Patient = require("../models/Patient");
const Session = require("../models/Session");

router.post("/", async (req, res) => {
    try {
        const { patientId, gameId, events, isFinal, sessionSummary } = req.body;

        if (!patientId || !gameId || !Array.isArray(events)) {
            return res.status(400).json({
                success: false,
                message: "patientId, gameId, and events[] are required.",
            });
        }

        // Frontend sends the public "GH-xxxxx" ID, so resolve the real Patient
        // _id the same way sessionController/patientController do.
        const patient = await Patient.findOne({ patientId: String(patientId) });
        if (!patient) {
            return res.status(404).json({ success: false, message: "Patient not found." });
        }

        const doc = await Telemetry.create({
            patientId: patient._id,
            patientIdRef: patient.patientId,
            gameId,
            events,
            isFinal: !!isFinal,
            sessionSummary: sessionSummary || null,
        });

        console.log(
            `[Telemetry] Saved ${events.length} events for patient ${patient.patientId} in ${gameId}${isFinal ? " (final batch)" : ""}`
        );

        res.status(200).json({ success: true, message: "Telemetry saved successfully", id: doc._id });
    } catch (err) {
        console.error("[Telemetry] Save failed:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get("/:patientId/dashboard", async (req, res) => {
    try {
        const { patientId } = req.params; // "GH-xxxxx"

        const patient = await Patient.findOne({ patientId: String(patientId) });
        if (!patient) {
            return res.status(404).json({ success: false, message: "Patient not found." });
        }

        // Real stats come from Session, not Telemetry (telemetry is raw event
        // logs, not scored outcomes) -- matches point 5 of the request.
        const [sessionsCompleted, accuracyAgg] = await Promise.all([
            Session.countDocuments({ patientId: patient._id, status: "completed" }),
            Session.aggregate([
                { $match: { patientId: patient._id, status: "completed" } },
                { $group: { _id: null, avgAccuracy: { $avg: "$accuracy" } } },
            ]),
        ]);

        const averagePapsScore = accuracyAgg[0]?.avgAccuracy
            ? Math.round(accuracyAgg[0].avgAccuracy * 10) / 10
            : 0;

        // Bonus real telemetry-derived numbers, since the raw event log is
        // there and otherwise unused by this endpoint.
        const [totalTelemetryBatches, lastTelemetry] = await Promise.all([
            Telemetry.countDocuments({ patientIdRef: patient.patientId }),
            Telemetry.findOne({ patientIdRef: patient.patientId }).sort({ createdAt: -1 }),
        ]);

        res.status(200).json({
            success: true,
            data: {
                averagePapsScore,
                sessionsCompleted,
                totalTelemetryBatches,
                lastEventAt: lastTelemetry?.createdAt || null,
            },
        });
    } catch (err) {
        console.error("[Telemetry] Dashboard query failed:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;