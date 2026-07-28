// backend/src/utils/migrateAdminFields.js
// One-time migration: backfills the new admin-dashboard fields onto existing
// Patient documents. Safe to re-run — only touches documents missing `status`.
//
// Run with: node src/utils/migrateAdminFields.js

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const Patient = require("../models/Patient");

// Simple, transparent starting heuristic for riskScore — NOT clinical advice,
// just a reasonable default so the admin dashboard has real numbers instead
// of zeros. Weighted: pain level (40%), inverse accuracy (30%), inactivity (30%).
function computeRiskScore(patient) {
  const painComponent = (patient.painLevel || 0) / 10; // 0–1
  const accuracyComponent = 1 - (patient.averageAccuracy || 0) / 100; // 0–1, higher = worse
  const daysSinceLastSession = patient.updatedAt
    ? (Date.now() - new Date(patient.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    : 0;
  const inactivityComponent = Math.min(daysSinceLastSession / 14, 1); // caps at 14 days

  const score =
    painComponent * 40 + accuracyComponent * 30 + inactivityComponent * 30;

  return Math.round(Math.min(Math.max(score, 0), 100));
}

function deriveStatus(patient) {
  if (!patient.isActive) return "discharged";
  const riskScore = computeRiskScore(patient);
  if (riskScore >= 65) return "at-risk";
  return "active";
}

async function migrate() {
  console.log("\n🔧 Starting admin-fields migration...");

  try {
    await connectDB();
    console.log("✅ Connected to MongoDB");

    // Only patients that haven't been migrated yet (no `status` field set).
    const patients = await Patient.find({ status: { $exists: false } });
    console.log(`   Found ${patients.length} patient(s) needing migration`);

    let updated = 0;
    for (const patient of patients) {
      const riskScore = computeRiskScore(patient);
      patient.status = deriveStatus(patient);
      patient.registrationMethod = patient.isSelfRegistered
        ? "self-registered"
        : "clinical-referral";
      patient.careTeam = patient.therapistId ? [patient.therapistId] : [];
      patient.consentStatus = "signed"; // existing patients were already onboarded
      patient.consentSignedAt = patient.createdAt;
      patient.riskScore = riskScore;
      patient.riskScoreUpdatedAt = new Date();
      patient.lastSessionAt = patient.updatedAt;

      await patient.save({ validateBeforeSave: false });
      updated++;
    }

    console.log(`\n✨ Migration complete — ${updated} patient(s) updated.\n`);
  } catch (err) {
    console.error("❌ Migration error:", err.message);
    process.exit(1);
  } finally {
    try {
      await mongoose.disconnect();
      console.log("✅ MongoDB disconnected.");
    } catch (err) {
      console.error("❌ Error disconnecting:", err);
    }
    process.exit(0);
  }
}

migrate();