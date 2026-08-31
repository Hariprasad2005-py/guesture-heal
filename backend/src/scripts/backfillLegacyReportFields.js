// backend/src/scripts/backfillLegacyReportFields.js
//
// Companion to backfillReports.js. That script creates Reports for
// sessions with NO report yet. This script fixes the opposite case:
// Reports that already exist (session.reportId is already set, so
// buildReportForSession's existing-check skips them) but were created
// under an older schema/version of buildReportForSession, before
// gameType/performance/repData/romData/smoothness/stability/romAnalysis
// existed. It backfills those fields in place, from the linked Session,
// without touching any Report that's already complete.
//
// Never invents data: if a Report's sessionId points to a Session that no
// longer exists, that Report is left untouched and listed at the end for
// manual review.
//
// Usage (from the backend/ directory):
//   node src/scripts/backfillLegacyReportFields.js
//   node src/scripts/backfillLegacyReportFields.js --dry-run
//
//   MONGODB_URI="<production connection string>" node src/scripts/backfillLegacyReportFields.js

require("dotenv").config();
const mongoose = require("mongoose");
const Report = require("../models/Report");
const Session = require("../models/Session");
// Required even though this script never calls Patient.find() directly --
// Report.find().populate("patientId") needs the "Patient" model registered
// on this connection to resolve the ref, or Mongoose throws
// MissingSchemaError at populate time.
const Patient = require("../models/Patient");

const DRY_RUN = process.argv.includes("--dry-run");

function buildPerformanceFromSession(session) {
    return {
        day: session.day,
        score: session.score,
        level: session.level,
        accuracy: session.accuracy,
        combo: session.combo,
        maxCombo: session.maxCombo,
        stars: session.stars,
        durationSeconds: session.durationSeconds,
        exercisesCompleted: session.exerciseResults?.length || 0,
        totalReps: session.exerciseResults?.reduce((sum, e) => sum + (e.repsCompleted || 0), 0) || 0,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
    };
}

function buildRomAnalysisFromSession(session, patient) {
    return (session.exerciseResults || []).map((ex) => {
        const dayPlan = patient?.rehabPlan?.find((d) => d.day === session.day);
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
}

async function run() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error("No MONGODB_URI/MONGO_URI found in environment. Aborting.");
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log(`Connected to MongoDB.${DRY_RUN ? " (DRY RUN — no writes will be made)" : ""}`);

    const legacyReports = await Report.find({
        $or: [
            { gameType: { $exists: false } },
            { gameType: null },
            { performance: { $exists: false } },
        ],
    }).populate("patientId");

    console.log(`Found ${legacyReports.length} legacy report(s) missing current-schema fields.`);

    let updated = 0;
    let skippedNoSession = 0;
    let skippedAlreadyComplete = 0;
    const skippedSessionMissing = [];

    for (const report of legacyReports) {
        const session = await Session.findById(report.sessionId);

        if (!session) {
            skippedNoSession++;
            skippedSessionMissing.push({
                reportId: report._id.toString(),
                reportNumber: report.reportNumber,
                sessionId: report.sessionId?.toString(),
            });
            console.warn(`  SKIP report ${report._id} (${report.reportNumber}) -- session ${report.sessionId} no longer exists.`);
            continue;
        }

        let changed = false;

        if (!report.gameType && session.gameType) {
            report.gameType = session.gameType;
            changed = true;
        }
        if (!report.performance) {
            report.performance = buildPerformanceFromSession(session);
            changed = true;
        }
        if ((!report.repData || report.repData.length === 0) && session.repData?.length) {
            report.repData = session.repData;
            changed = true;
        }
        if (!report.romData && session.romData) {
            report.romData = session.romData;
            changed = true;
        }
        if ((report.smoothness === undefined || report.smoothness === null) && session.smoothness !== undefined) {
            report.smoothness = session.smoothness;
            changed = true;
        }
        if ((report.stability === undefined || report.stability === null) && session.stability !== undefined) {
            report.stability = session.stability;
            changed = true;
        }
        if ((!report.romAnalysis || report.romAnalysis.length === 0) && session.exerciseResults?.length) {
            report.romAnalysis = buildRomAnalysisFromSession(session, report.patientId);
            changed = true;
        }

        if (!changed) {
            skippedAlreadyComplete++;
            continue;
        }

        console.log(
            `  ${DRY_RUN ? "[DRY RUN] Would update" : "UPDATE"} report ${report._id} (${report.reportNumber}) -- ` +
            `gameType=${report.gameType}, score=${report.performance?.score}, accuracy=${report.performance?.accuracy}, reps=${report.performance?.totalReps}`
        );

        if (!DRY_RUN) {
            await report.save();
        }
        updated++;
    }

    console.log("\n─── Backfill summary ─────────────────────────────");
    console.log(`  Total legacy reports found:   ${legacyReports.length}`);
    console.log(`  Updated:                      ${updated}${DRY_RUN ? " (dry run, not written)" : ""}`);
    console.log(`  Skipped (session missing):    ${skippedNoSession}`);
    console.log(`  Skipped (already complete):   ${skippedAlreadyComplete}`);
    if (skippedSessionMissing.length) {
        console.log("\n  Reports with no matching Session (needs manual review, NOT auto-filled):");
        skippedSessionMissing.forEach((s) =>
            console.log(`    - ${s.reportId} (${s.reportNumber}) -> sessionId ${s.sessionId}`)
        );
    }
    console.log("────────────────────────────────────────────────────\n");

    await mongoose.disconnect();
    process.exit(0);
}

run().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});