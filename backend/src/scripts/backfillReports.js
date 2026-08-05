// backend/src/scripts/backfillReports.js
//
// One-off migration: finds every completed Session with no reportId yet
// and generates a Report for it, using the exact same buildReportForSession
// logic that now runs automatically for new sessions. Safe to re-run --
// buildReportForSession already checks for an existing report per session
// and skips it if one exists.
//
// Usage (from the backend/ directory):
//   node src/scripts/backfillReports.js
//
// Make sure your .env / environment has the same MONGODB_URI (or whatever
// your connection var is called) as production if you're backfilling the
// deployed database, or point it at production explicitly, e.g.:
//   MONGODB_URI="<production connection string>" node src/scripts/backfillReports.js

require("dotenv").config();
const mongoose = require("mongoose");
const Session = require("../models/Session");
const Patient = require("../models/Patient");
const reportController = require("../controllers/reportController");

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("No MONGODB_URI/MONGO_URI found in environment. Aborting.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB.");

  const sessions = await Session.find({
    status: "completed",
    $or: [{ reportId: { $exists: false } }, { reportId: null }],
  }).populate("patientId");

  console.log(`Found ${sessions.length} completed session(s) with no report.`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const session of sessions) {
    const patient = session.patientId;
    if (!patient) {
      console.warn(`  Session ${session._id}: no patient found, skipping.`);
      skipped++;
      continue;
    }

    try {
      const { report, alreadyExisted } = await reportController.buildReportForSession(
        session,
        patient,
        session.therapistId || null
      );
      if (alreadyExisted) {
        console.log(`  Session ${session._id}: report already existed (${report._id}), skipped.`);
        skipped++;
      } else {
        console.log(`  Session ${session._id}: created report ${report._id} for patient ${patient.patientId}.`);
        created++;
      }
    } catch (err) {
      console.error(`  Session ${session._id}: FAILED — ${err.message}`);
      failed++;
    }
  }

  console.log("\nDone.");
  console.log(`  Created: ${created}`);
  console.log(`  Skipped (already existed / no patient): ${skipped}`);
  console.log(`  Failed: ${failed}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});