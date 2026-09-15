// backend/src/scripts/recalcRehabPlanCompletion.js
//
// One-time backfill for the day-completion sync bug: the old
// completeSession/finishPublicSession logic set
// `rehabPlan[day].isCompleted = true` (and advanced currentDay) the
// instant ANY session for that day was saved, regardless of whether
// every assigned game was played, and regardless of accuracy. That
// left already-persisted patients (e.g. GH-97491 -- "Day 7/7",
// Day 7 badge COMPLETED off a single game) with stale/incorrect
// completion state baked into MongoDB.
//
// This script does NOT trust the existing isCompleted/currentDay
// fields. For every patient, it re-derives both from their actual
// persisted Session records using the same isDayCompleted() /
// recalcRehabProgress() function the live completion endpoints now
// use, so historical data ends up consistent with the corrected rule:
//   dayCompleted = every assigned game has a completed session >=75% accuracy
//
// It never fabricates sessions, never deletes data, and never marks a
// day complete beyond what the real session records support -- days
// with genuinely insufficient session data are simply left/ set
// NOT COMPLETED rather than guessed at.
//
// Usage (from the backend/ directory):
//   node src/scripts/recalcRehabPlanCompletion.js
//   node src/scripts/recalcRehabPlanCompletion.js --dry-run
//
//   MONGODB_URI="<production connection string>" node src/scripts/recalcRehabPlanCompletion.js

require("dotenv").config();
const mongoose = require("mongoose");
const Patient = require("../models/Patient");
const Session = require("../models/Session");
const { recalcRehabProgress } = require("../utils/rehabProgress");

const DRY_RUN = process.argv.includes("--dry-run");

async function run() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/gestureheal";
  await mongoose.connect(uri);
  console.log(`[recalcRehabPlanCompletion] Connected to ${uri}${DRY_RUN ? " (dry run)" : ""}`);

  const patients = await Patient.find({});
  console.log(`[recalcRehabPlanCompletion] Checking ${patients.length} patient(s)...`);

  let changed = 0;
  const changes = [];

  for (const patient of patients) {
    const before = {
      currentDay: patient.currentDay,
      days: patient.rehabPlan.map((d) => ({ day: d.day, isCompleted: d.isCompleted })),
    };

    await recalcRehabProgress(patient, Session);

    const after = {
      currentDay: patient.currentDay,
      days: patient.rehabPlan.map((d) => ({ day: d.day, isCompleted: d.isCompleted })),
    };

    const diff =
      before.currentDay !== after.currentDay ||
      before.days.some((d, i) => d.isCompleted !== after.days[i].isCompleted);

    if (diff) {
      changed += 1;
      changes.push({ patientId: patient.patientId, name: patient.name, before, after });
      if (!DRY_RUN) {
        await patient.save();
      }
    }
  }

  console.log(
    `[recalcRehabPlanCompletion] ${changed} of ${patients.length} patient(s) had incorrect completion state${DRY_RUN ? " (not written -- dry run)" : " (fixed)"}.`
  );
  changes.forEach((c) => {
    console.log(`  - ${c.patientId} (${c.name}): currentDay ${c.before.currentDay} -> ${c.after.currentDay}`);
    c.before.days.forEach((d, i) => {
      const a = c.after.days[i];
      if (d.isCompleted !== a.isCompleted) {
        console.log(`      Day ${d.day}: isCompleted ${d.isCompleted} -> ${a.isCompleted}`);
      }
    });
  });

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("[recalcRehabPlanCompletion] Failed:", err);
  process.exit(1);
});