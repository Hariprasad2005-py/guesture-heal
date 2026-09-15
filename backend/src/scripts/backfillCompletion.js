// backend/scripts/backfillCompletion.js
//
// One-off backfill: recomputes dayPlan.isCompleted and dayPlan.exercises[].isCompleted
// for every patient/day, using the same evaluateDayCompletion logic sessionController
// now runs live on every session completion. Needed because that logic only runs when
// a session completes/deletes -- it does NOT retroactively fix sessions that were
// completed before the fix was deployed.
//
// Usage (from backend/ directory):
//   node scripts/backfillCompletion.js
//
// Safe to re-run any number of times -- it's idempotent, just recomputing from the
// Session collection each time.

require("dotenv").config();
const mongoose = require("mongoose");
const Patient = require("../models/Patient");
const { evaluateDayCompletion } = require("../controllers/sessionController");

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Set MONGODB_URI (or MONGO_URI) in your .env before running this.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB.");

  const patients = await Patient.find({});
  console.log(`Found ${patients.length} patient(s). Recomputing day completion...`);

  let patientsChanged = 0;

  for (const patient of patients) {
    const before = JSON.stringify(patient.rehabPlan);

    for (const dayPlan of patient.rehabPlan || []) {
      await evaluateDayCompletion(patient, dayPlan.day);
    }

    const after = JSON.stringify(patient.rehabPlan);

    if (before !== after) {
      await patient.save();
      patientsChanged++;
      console.log(`  Updated ${patient.patientId} (${patient.name})`);
    }
  }

  console.log(`Done. ${patientsChanged} patient(s) had their plan updated.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});