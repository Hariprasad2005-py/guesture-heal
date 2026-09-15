// backend/src/utils/migrateRehabPlans.js
//
// One-off migration: regenerates rehabPlan for every existing patient using
// the current generateRehabPlan() (now game-based, via GAMES_LIBRARY),
// replacing whatever exercise-based plan they were originally created with.
// isCompleted/completedAt are carried over per-day by day number, so
// existing progress isn't lost just because the exercise LIST for that
// day changed under them.
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const Patient = require("../models/Patient");
const { generateRehabPlan } = require("./rehabPlanGenerator");

async function migrate() {
  console.log("\n🔧 Starting rehabPlan migration...");
  try {
    await connectDB();
    console.log("✅ Connected to MongoDB");

    const patients = await Patient.find({});
    console.log(`   Found ${patients.length} patient(s)`);

    for (const patient of patients) {
      const oldPlan = patient.rehabPlan || [];
      const newPlan = generateRehabPlan(
        patient.condition,
        patient.painLevel,
        patient.affectedSide
      );

      // Preserve completion status per day number where it existed before.
      for (const day of newPlan) {
        const oldDay = oldPlan.find((d) => d.day === day.day);
        if (oldDay) {
          day.isCompleted = oldDay.isCompleted;
          day.completedAt = oldDay.completedAt;
        }
      }

      patient.rehabPlan = newPlan;
      await patient.save();
      console.log(`   ✅ Migrated: ${patient.name} (${patient.patientId})`);
    }

    console.log("\n✨ Migration complete!\n");
  } catch (err) {
    console.error("❌ Migration error:", err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("✅ MongoDB disconnected.");
    process.exit(0);
  }
}

migrate();