// backend/src/utils/seed.js
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const User = require("../models/User");
const Patient = require("../models/Patient");
const Session = require("../models/Session");
const Report = require("../models/Report");
const { generateRehabPlan } = require("./rehabPlanGenerator");

const DEMO_THERAPIST = {
  name: "Dr. Hari Prasad",
  email: "demo@gestureheal.com",
  password: "demo1234",
  role: "therapist",
};

const DEMO_PATIENTS = [
  {
    name: "Ravi Kumar",
    age: 34,
    gender: "Male",
    contactNumber: "9876543210",
    condition: "Rotator Cuff Repair",
    surgeryType: "Arthroscopic Rotator Cuff Repair",
    surgeryDate: new Date("2024-05-01"),
    affectedSide: "right",
    goals: "Regain full shoulder mobility and return to cricket.",
    painLevel: 5,
    notes: "Post-operative, progressing well.",
  },
  {
    name: "Priya Sharma",
    age: 28,
    gender: "Female",
    contactNumber: "9123456789",
    condition: "ACL Reconstruction",
    surgeryType: "ACL Reconstruction (Patellar Graft)",
    surgeryDate: new Date("2024-04-15"),
    affectedSide: "left",
    goals: "Return to running and sports activities.",
    painLevel: 3,
    notes: "Highly motivated patient.",
  },
];

async function seed() {
  console.log("\n🌱 Starting seed...");

  try {
    await connectDB();
    console.log("✅ Connected to MongoDB");

    const existingUser = await User.findOne({ email: DEMO_THERAPIST.email });
    if (existingUser) {
      await Patient.deleteMany({ therapistId: existingUser._id });
      await Session.deleteMany({ therapistId: existingUser._id });
      await Report.deleteMany({ therapistId: existingUser._id });
      await User.deleteOne({ _id: existingUser._id });
      console.log("   ♻️  Cleaned existing demo data");
    }

    const therapist = await User.create(DEMO_THERAPIST);
    console.log(`   ✅ Therapist created: ${therapist.email}`);

    for (const data of DEMO_PATIENTS) {
      const rehabPlan = generateRehabPlan(data.condition, data.painLevel, data.affectedSide);
      const patient = await Patient.create({
        ...data,
        therapistId: therapist._id,
        rehabPlan,
      });

      for (let day = 1; day <= 2; day++) {
        const dayPlan = rehabPlan[day - 1];
        const exerciseResults = dayPlan.exercises.map((ex) => ({
          exerciseId: ex.exerciseId,
          name: ex.name,
          setsCompleted: ex.sets,
          repsCompleted: ex.reps,
          averageRom: Math.round(ex.targetRom * 0.75),
          maxRom: Math.round(ex.targetRom * 0.85),
          accuracy: 70 + day * 5,
          score: 200 + day * 80,
        }));

        const session = await Session.create({
          patientId: patient._id,
          patientIdRef: patient.patientId,
          therapistId: therapist._id,
          day,
          status: "completed",
          score: 300 + day * 100,
          level: day,
          accuracy: 72 + day * 4,
          combo: 5 + day * 2,
          stars: day >= 2 ? 3 : 2,
          exerciseResults,
          durationSeconds: 600 + day * 120,
          startedAt: new Date(Date.now() - (3 - day) * 24 * 60 * 60 * 1000),
          completedAt: new Date(Date.now() - (3 - day) * 24 * 60 * 60 * 1000 + 700_000),
        });

        rehabPlan[day - 1].isCompleted = true;
        rehabPlan[day - 1].completedAt = session.completedAt;
      }

      patient.rehabPlan = rehabPlan;
      patient.currentDay = 3;
      patient.totalSessions = 2;
      patient.averageAccuracy = 76;
      patient.currentLevel = 2;
      await patient.save();

      console.log(`   ✅ Patient created: ${patient.name} (${patient.condition})`);
    }

    console.log("\n✨ Seed complete!\n");
    console.log("   Demo login:");
    console.log(`   Email:    ${DEMO_THERAPIST.email}`);
    console.log(`   Password: ${DEMO_THERAPIST.password}\n`);
  } catch (err) {
    console.error("❌ Seed error:", err.message);
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

seed();