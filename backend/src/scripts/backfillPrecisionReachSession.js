// backend/scripts/backfillPrecisionReachSession.js
//
// ONE-TIME BACKFILL — repairs the isCorrect field on a single, specific,
// pre-fix Precision Reach session whose repData was corrupted by the
// isCorrect:{default:true} bug (fixed in sessionController.js's
// normalizeRepCorrectness, applied to writes going forward only).
//
// This script does NOT modify sessionController.js, the frontend, or the
// fix already deployed. It repairs exactly one historical row of data
// that was written before that fix existed.
//
// SCOPE, HARD-CODED, NOT CONFIGURABLE VIA ARGS:
//   session:  6aa25b3cec7efc96a4bea843
//   report:   RPT-20260910-ZWXXKU
// No other session or report is ever loaded, queried, or written by this
// script. There is no code path that accepts an alternate session id.
//
// USAGE:
//   node backfillPrecisionReachSession.js            # dry run (default) — reads only, writes nothing
//   node backfillPrecisionReachSession.js --apply     # performs the actual update + report regeneration
//
// ADJUST BEFORE RUNNING:
//   - MONGODB_URI below assumes the same env var your app already uses.
//     If your project connects differently (a config/db.js module, a
//     different env var name, etc.), swap the connect() call for that
//     instead — don't introduce a second, divergent way of connecting.
//   - The require() paths for Session/Patient/reportController assume
//     this file lives at backend/scripts/ alongside backend/src/. Adjust
//     if your actual layout differs.

const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config();
const Session = require(path.join(__dirname, "..", "models", "Session"));
const Patient = require(path.join(__dirname, "..", "models", "Patient"));
const reportController = require(path.join(__dirname, "..", "controllers", "reportController"));
const Report = require(path.join(__dirname, "..", "models", "Report"));

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

// ── Hard-coded scope. Not derived from argv, not overridable. ─────────────
const TARGET_SESSION_ID = "6aa25b3cec7efc96a4bea843";
const EXPECTED_REPORT_NUMBER = "RPT-20260910-ZWXXKU";
const EXPECTED_GAME_TYPE = "precision_reach";

const APPLY = process.argv.includes("--apply");

function log(...args) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

// Determines the authoritative outcome for a single rep WITHOUT ever
// reading the already-corrupted `isCorrect` field, and WITHOUT
// defaulting an unknown outcome to true.
//
// Priority:
//   1. rep.success (boolean)         — Precision Reach's primary field
//   2. rep.result === "hit"/"miss"   — secondary, string-based outcome
//   3. neither present               — UNKNOWN. Caller must abort.
function resolveAuthoritativeOutcome(rep) {
  if (typeof rep.success === "boolean") {
    return { known: true, outcome: rep.success, source: "success" };
  }
  if (rep.result === "hit") {
    return { known: true, outcome: true, source: "result" };
  }
  if (rep.result === "miss") {
    return { known: true, outcome: false, source: "result" };
  }
  return { known: false, outcome: null, source: null };
}

async function main() {
  if (!MONGODB_URI) {
    log("ABORT: MONGODB_URI (or MONGO_URI) is not set. Refusing to guess a connection string.");
    process.exitCode = 1;
    return;
  }

  log(`Mode: ${APPLY ? "APPLY (will write to the database)" : "DRY RUN (read-only, nothing will be written)"}`);
  log(`Target session (hard-coded, not configurable): ${TARGET_SESSION_ID}`);
  log(`Expected report number (verified, not assumed): ${EXPECTED_REPORT_NUMBER}`);
  log("");

  await mongoose.connect(MONGODB_URI);
  log("Connected to MongoDB.");

  try {
    // ── 1. Load ONLY the target session ──────────────────────────────────
    const session = await Session.findById(TARGET_SESSION_ID);

    if (!session) {
      log(`ABORT: Session ${TARGET_SESSION_ID} not found. Nothing modified.`);
      return;
    }

    // Defense in depth: even though the query already scoped to this one
    // id, verify the loaded document actually is the expected id/game
    // before doing anything else.
    if (String(session._id) !== TARGET_SESSION_ID) {
      log("ABORT: Loaded session id does not match TARGET_SESSION_ID. This should be impossible. Nothing modified.");
      return;
    }

    if (session.gameType !== EXPECTED_GAME_TYPE) {
      log(`ABORT: Session gameType is "${session.gameType}", expected "${EXPECTED_GAME_TYPE}". ` +
        `Refusing to backfill a non-Precision-Reach session. Nothing modified.`);
      return;
    }

    // Verify the report we intend to regenerate later is really the one
    // named in this task, before touching anything.
    const existingReport = await Report.findOne({ sessionId: session._id }).select("reportNumber");
    if (!existingReport) {
      log(`ABORT: No report found for session ${TARGET_SESSION_ID}. Nothing modified.`);
      return;
    }
    if (existingReport.reportNumber !== EXPECTED_REPORT_NUMBER) {
      log(`ABORT: Report linked to this session is "${existingReport.reportNumber}", ` +
        `expected "${EXPECTED_REPORT_NUMBER}". Refusing to proceed. Nothing modified.`);
      return;
    }

    // ── 2. Print current repData BEFORE any modification ────────────────
    log("\n=== CURRENT repData (before any change) ===");
    log(JSON.stringify(session.repData, null, 2));

    if (!Array.isArray(session.repData) || session.repData.length === 0) {
      log("\nABORT: session.repData is empty or missing. There is nothing to backfill from. " +
        "The old report cannot be safely backfilled — its underlying rep-level data does not exist.");
      return;
    }

    // ── 3. Determine the authoritative outcome for every rep ────────────
    const resolved = session.repData.map((rep, i) => {
      const r = resolveAuthoritativeOutcome(rep.toObject ? rep.toObject() : rep);
      return { index: i, rep, ...r };
    });

    const unknownReps = resolved.filter((r) => !r.known);
    if (unknownReps.length > 0) {
      log(`\nABORT: ${unknownReps.length} of ${resolved.length} rep(s) have neither a boolean ` +
        `'success' field nor a 'result' of "hit"/"miss". There is no authoritative outcome to ` +
        `use for ${unknownReps.length} rep(s) (indices: ${unknownReps.map((r) => r.index).join(", ")}). ` +
        `Per instructions, this script will NOT guess or default to true. ` +
        `The old report cannot be safely backfilled as-is.`);
      return;
    }

    log("\n=== Resolved authoritative outcome per rep (source shown, isCorrect NOT consulted) ===");
    resolved.forEach(({ index, outcome, source, rep }) => {
      log(`  rep[${index}]: outcome=${outcome}  (source: ${source})  ` +
        `stored isCorrect(old, ignored)=${rep.isCorrect}  romDegrees=${rep.romDegrees ?? rep.rom ?? "n/a"}`);
    });

    // ── 4. Reconstruct isCorrect = authoritative outcome ─────────────────
    // Every OTHER field on each rep (success, result, romDegrees,
    // responseTimeSeconds, rep, direction, exerciseId, timestamp) is left
    // completely untouched — only isCorrect is being corrected.
    const correctedRepData = session.repData.map((rep, i) => {
      const plain = rep.toObject ? rep.toObject() : rep;
      return { ...plain, isCorrect: resolved[i].outcome };
    });

    // ── 8. Validate against the session's own recorded accuracy ─────────
    const correctCount = correctedRepData.filter((r) => r.isCorrect === true).length;
    const incorrectCount = correctedRepData.length - correctCount;
    const recalculatedAccuracy = Math.round((correctCount / correctedRepData.length) * 100);
    const storedAccuracy = typeof session.accuracy === "number" ? session.accuracy : null;

    log("\n=== Validation against session.accuracy ===");
    log(`  Corrected Correct/Incorrect: ${correctCount} / ${incorrectCount}`);
    log(`  Recalculated accuracy from corrected reps: ${recalculatedAccuracy}%`);
    log(`  Session's stored accuracy field: ${storedAccuracy}%`);

    const accuracyMatches = storedAccuracy !== null && recalculatedAccuracy === storedAccuracy;
    if (!accuracyMatches) {
      log(`\nABORT: Recalculated accuracy (${recalculatedAccuracy}%) does not match the session's ` +
        `stored accuracy (${storedAccuracy}%). Refusing to write inconsistent data. ` +
        `This needs human review before proceeding — it may mean the authoritative fields ` +
        `themselves don't agree with the recorded accuracy, which is a different problem than ` +
        `this script is meant to fix.`);
      return;
    }
    log("  MATCH — corrected per-rep outcomes agree with the session's recorded accuracy.");

    if (!APPLY) {
      log("\n=== DRY RUN COMPLETE — no database writes were made ===");
      log("Rerun with --apply to write this correction and regenerate the report.");
      log("\nWould write this repData:");
      log(JSON.stringify(correctedRepData, null, 2));
      return;
    }

    // ── 6. Apply — update ONLY this session's repData ────────────────────
    session.repData = correctedRepData;
    session.markModified("repData");
    await session.save();

    const savedSession = await Session.findById(TARGET_SESSION_ID);

    // ── 7. Print the resulting repData ───────────────────────────────────
    log("\n=== repData AFTER update (re-read from DB) ===");
    log(JSON.stringify(savedSession.repData, null, 2));

    // ── Regenerate the report using the EXISTING mechanism ──────────────
    // Mirrors reportController.regeneratePublicReport's own logic exactly
    // (same lookup for patient/therapistId), rather than reimplementing
    // report construction here.
    const patient = await Patient.findById(savedSession.patientId);
    if (!patient) {
      log(`\nABORT (post-save): Patient not found for session ${TARGET_SESSION_ID}. ` +
        `Session repData WAS corrected and saved, but the report was NOT regenerated. ` +
        `Investigate and regenerate manually via the existing API once the patient record issue is resolved.`);
      return;
    }
    const therapistId = savedSession.therapistId || patient.therapistId || null;

    const { report } = await reportController.buildReportForSession(savedSession, patient, therapistId);

    // ── Verify the regenerated report ────────────────────────────────────
    const reportRepData = Array.isArray(report.repData) ? report.repData : [];
    const reportCorrect = reportRepData.filter((r) => (r.isCorrect !== undefined ? r.isCorrect : r.success) === true).length;
    const reportIncorrect = reportRepData.length - reportCorrect;

    log("\n=== Regenerated report verification ===");
    log(`  Report number: ${report.reportNumber}`);
    log(`  Overall Accuracy (performance.accuracy): ${report.performance?.accuracy}%`);
    log(`  Total Reps (performance.totalReps): ${report.performance?.totalReps}`);
    log(`  Correct / Incorrect (recomputed same way the UI does): ${reportCorrect} / ${reportIncorrect}`);
    log(`  Per-rep data (report.repData): ${JSON.stringify(reportRepData, null, 2)}`);

    const romAnalysis = Array.isArray(report.romAnalysis) ? report.romAnalysis : [];
    const precisionReachRom = romAnalysis.find((r) => r.exerciseName === "Precision Reach") || romAnalysis[0];
    log(`  Average ROM: ${precisionReachRom?.averageRom ?? "Not recorded"}`);
    log(`  Max ROM: ${precisionReachRom?.maxRom ?? "Not recorded"}`);
    log(`  Target ROM: ${precisionReachRom?.targetRom ?? "Not recorded"}`);
    log(`  % Achieved (ROM Attainment): ${precisionReachRom?.percentageAchieved ?? "Not recorded"}`);

    if (precisionReachRom?.targetRom != null) {
      log(`\n  WARNING: targetRom is populated (${precisionReachRom.targetRom}). Confirm this came from ` +
        `a real rehab-plan target and NOT Precision Reach's LAUNCH_ANGLE (145°) or any other gameplay constant.`);
    }

    log("\n=== DONE. Only session " + TARGET_SESSION_ID + " and report " + EXPECTED_REPORT_NUMBER + " were touched. ===");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Backfill script failed:", err);
  process.exitCode = 1;
});