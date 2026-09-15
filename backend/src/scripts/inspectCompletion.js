// backend/src/scripts/inspectCompletion.js
//
// Read-only diagnostic: prints the rehabPlan.exercises[].gameType values for a
// patient's current day next to the actual Session.gameType values on record,
// so a naming mismatch (e.g. "cloud_reach" vs "cloudReach") is easy to spot.
// Doesn't write anything.
//
// Usage (from backend/ directory):
//   node src/scripts/inspectCompletion.js GH-64273

require("dotenv").config();
const mongoose = require("mongoose");
const Patient = require("../models/Patient");
const Session = require("../models/Session");

async function main() {
  const patientId = process.argv[2];
  if (!patientId) {
    console.error("Usage: node src/scripts/inspectCompletion.js <patientId e.g. GH-64273>");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  await mongoose.connect(uri);
  console.log("Connected to MongoDB.\n");

  const patient = await Patient.findOne({ patientId });
  if (!patient) {
    console.error(`No patient found with patientId ${patientId}`);
    process.exit(1);
  }

  console.log(`Patient: ${patient.name} (${patient.patientId})`);
  console.log(`currentDay: ${patient.currentDay}\n`);

  for (const dayPlan of patient.rehabPlan || []) {
    console.log(`── Day ${dayPlan.day} ── isCompleted: ${dayPlan.isCompleted}`);
    for (const ex of dayPlan.exercises || []) {
      console.log(
        `   exercise: gameType=${JSON.stringify(ex.gameType)}  exerciseId=${JSON.stringify(ex.exerciseId)}  name=${JSON.stringify(ex.name)}  isCompleted=${ex.isCompleted}`
      );
    }
  }

  console.log(`\n── Sessions for this patient ──`);
  const sessions = await Session.find({ patientId: patient._id }).sort({ createdAt: 1 });
  for (const s of sessions) {
    console.log(
      `   day=${s.day}  gameType=${JSON.stringify(s.gameType)}  status=${s.status}  accuracy=${s.accuracy}`
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});