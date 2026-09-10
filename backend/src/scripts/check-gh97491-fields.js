// READ-ONLY DIAGNOSTIC — no writes. Prints only non-secret patient fields.
const path = require("path");
require("dotenv").config();
const mongoose = require("mongoose");

const Patient = require(path.join(__dirname, "..", "models", "Patient"));

const PATIENT_PUBLIC_ID = "GH-97491";

async function main() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.log("ABORT: MONGODB_URI not set.");
        return;
    }
    await mongoose.connect(uri);

    try {
        const patient = await Patient.findOne({ patientId: PATIENT_PUBLIC_ID }).select(
            "patientId therapistId currentDay condition"
        );
        if (!patient) {
            console.log(`No patient found with patientId ${PATIENT_PUBLIC_ID}`);
            return;
        }

        console.log("_id:", String(patient._id));
        console.log("patientId:", patient.patientId);
        console.log("therapistId:", patient.therapistId ? String(patient.therapistId) : "null / unassigned");
        console.log("currentDay:", patient.currentDay);
        console.log("condition:", patient.condition);
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});