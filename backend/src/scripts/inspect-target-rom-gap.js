// READ-ONLY DIAGNOSTIC — makes no writes of any kind.
// Confirms whether patient GH-97491's rehabPlan contains an exercise entry
// matching the Precision Reach session's gameType.

const path = require("path");
require("dotenv").config();
const mongoose = require("mongoose");

const Patient = require(path.join(__dirname, "..", "models", "Patient"));
const Session = require(path.join(__dirname, "..", "models", "Session"));

const TARGET_SESSION_ID = "6aa25b3cec7efc96a4bea843";
const PATIENT_PUBLIC_ID = "GH-97491";

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.log("ABORT: MONGODB_URI not set.");
    return;
  }
  await mongoose.connect(uri);
  console.log("Connected.\n");

  try {
    const session = await Session.findById(TARGET_SESSION_ID);
    if (!session) {
      console.log(`Session ${TARGET_SESSION_ID} not found.`);
      return;
    }
    console.log("=== SESSION ===");
    console.log("session.gameType:", JSON.stringify(session.gameType));
    console.log("session.day:", session.day);

    const patient = await Patient.findOne({ patientId: PATIENT_PUBLIC_ID });
    if (!patient) {
      console.log(`Patient ${PATIENT_PUBLIC_ID} not found.`);
      return;
    }
    console.log("\n=== PATIENT ===");
    console.log("condition:", patient.condition);
    console.log("rehabPlan day count:", Array.isArray(patient.rehabPlan) ? patient.rehabPlan.length : "n/a");

    const dayPlan = patient.rehabPlan?.find((d) => Number(d.day) === Number(session.day));
    console.log("\n=== DAY PLAN FOR SESSION.DAY =", session.day, "===");
    if (!dayPlan) {
      console.log("No day plan found for this day number.");
    } else {
      console.log("exercises in this day's plan:");
      dayPlan.exercises.forEach((e) => {
        console.log(`  exerciseId=${JSON.stringify(e.exerciseId)}  gameType=${JSON.stringify(e.gameType)}  targetRom=${e.targetRom}`);
      });
    }

    const planEx = dayPlan?.exercises?.find(
      (e) => e.exerciseId === session.gameType || e.gameType === session.gameType
    );
    console.log("\n=== MATCH RESULT ===");
    console.log("planEx found:", planEx ? JSON.stringify(planEx) : "undefined (NO MATCH)");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});