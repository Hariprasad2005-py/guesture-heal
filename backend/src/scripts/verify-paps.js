require("dotenv").config();
const mongoose = require("mongoose");
const Session = require("../models/Session");

// ── Exact copy of PrecisionReach.jsx's PAPS formula — nothing altered ──
const PAPS_WEIGHTS = {
    accuracy: 0.40,
    rom: 0.25,
    responseTime: 0.20,
    consistency: 0.15,
};

const DIFFICULTY_PAPS_MULTIPLIER = {
    Beginner: 1.0,
    Intermediate: 1.08,
    Advanced: 1.15,
};

const PAPS_TARGET_ROM_DEGREES = 90;
const PAPS_RESPONSE_CEILING_SECONDS = 2.5;
const PAPS_RESPONSE_FLOOR_SECONDS = 10;

function computePapsRomComponent(reps) {
    if (!reps.length) return 0;
    const validRoms = reps
        .map((r) => r.romDegrees)
        .filter((v) => typeof v === "number" && Number.isFinite(v));
    if (!validRoms.length) return 0;
    const avgRom = validRoms.reduce((a, b) => a + b, 0) / validRoms.length;
    return Math.min(100, (avgRom / PAPS_TARGET_ROM_DEGREES) * 100);
}

function computePapsResponseTimeComponent(reps) {
    if (!reps.length) return 0;
    const avgSeconds = reps.reduce((a, r) => a + (r.responseTimeSeconds || 0), 0) / reps.length;
    if (avgSeconds <= PAPS_RESPONSE_CEILING_SECONDS) return 100;
    if (avgSeconds >= PAPS_RESPONSE_FLOOR_SECONDS) return 0;
    const range = PAPS_RESPONSE_FLOOR_SECONDS - PAPS_RESPONSE_CEILING_SECONDS;
    return Math.max(0, 100 * (1 - (avgSeconds - PAPS_RESPONSE_CEILING_SECONDS) / range));
}

function computePapsConsistencyComponent(reps) {
    if (reps.length < 2) return reps.length ? 100 : 0;
    const roms = reps
        .map((r) => r.romDegrees)
        .filter((v) => typeof v === "number" && Number.isFinite(v));
    const mean = roms.reduce((a, b) => a + b, 0) / roms.length;
    if (mean === 0) return 0;
    const variance = roms.reduce((a, r) => a + (r - mean) ** 2, 0) / roms.length;
    const coefficientOfVariation = Math.sqrt(variance) / mean;
    return Math.max(0, 100 * (1 - coefficientOfVariation / 0.6));
}

function computePaps({ accuracy, reps, difficulty, painDetected }) {
    if (!reps.length) return 0;
    const romComponent = computePapsRomComponent(reps);
    const responseTimeComponent = computePapsResponseTimeComponent(reps);
    const consistencyComponent = computePapsConsistencyComponent(reps);

    const rawComposite =
        accuracy * PAPS_WEIGHTS.accuracy +
        romComponent * PAPS_WEIGHTS.rom +
        responseTimeComponent * PAPS_WEIGHTS.responseTime +
        consistencyComponent * PAPS_WEIGHTS.consistency;

    const difficultyMultiplier = DIFFICULTY_PAPS_MULTIPLIER[difficulty] || 1;
    const painMultiplier = painDetected ? 0.8 : 1;

    return {
        romComponent,
        responseTimeComponent,
        consistencyComponent,
        rawComposite,
        difficultyMultiplier,
        painMultiplier,
        finalPaps: Math.round(Math.min(100, rawComposite * difficultyMultiplier) * painMultiplier),
    };
}
// ── End exact copy ──

async function verify() {
    await mongoose.connect(process.env.MONGODB_URI);

    const sessionId = "6aa1873a6c8ac27c12c7d7ff";
    const session = await Session.findById(sessionId).lean();

    if (!session) {
        console.log("Session not found.");
        await mongoose.disconnect();
        return;
    }

    const repData = session.repData || [];
    const accuracy =
        typeof session.gameSpecific?.rawAccuracy === "number"
            ? session.gameSpecific.rawAccuracy
            : session.accuracy;
    const difficulty = session.gameSpecific?.difficulty || "Beginner";
    const painDetected = !!session.gameSpecific?.painAdjusted;

    console.log("── Raw session fields ──");
    console.log("accuracy used:", accuracy);
    console.log("difficulty:", difficulty);
    console.log("painDetected:", painDetected);
    console.log("repData count:", repData.length);
    console.log("repData:", JSON.stringify(repData, null, 2));

    console.log("\n── Stored values ──");
    console.log("session.gameSpecific?.paps:", session.gameSpecific?.paps);
    console.log("session.smoothness:", session.smoothness);
    console.log("session.stability:", session.stability);

    console.log("\n── Recomputed PAPS (exact same formula) ──");
    const result = computePaps({ accuracy, reps: repData, difficulty, painDetected });
    console.log(JSON.stringify(result, null, 2));

    await mongoose.disconnect();
}

verify().catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
});