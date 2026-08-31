// backend/update-report.js
const mongoose = require('mongoose');
require('dotenv').config();

async function updateReportPatient() {
    try {
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gestureheal_db';
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Get the patient first to get fresh data
        const Patient = mongoose.model('Patient', new mongoose.Schema({}, { strict: false }));
        const patient = await Patient.findOne({ patientId: "GH-97491" });

        if (!patient) {
            console.log('❌ Patient not found');
            process.exit(1);
        }

        console.log('✅ Found patient:', patient.name || 'Unknown');

        // Update the report's patientSnapshot
        const Report = mongoose.model('Report', new mongoose.Schema({}, { strict: false }));
        const result = await Report.updateOne(
            { sessionId: new mongoose.Types.ObjectId("6a95bbdd0769b34f7087d93c") },
            {
                $set: {
                    "patientSnapshot.name": patient.name || "Unknown Patient",
                    "patientSnapshot.age": patient.age || null,
                    "patientSnapshot.gender": patient.gender || "Not recorded",
                    "patientSnapshot.condition": patient.condition || "Not recorded",
                    "patientSnapshot.goals": patient.goals || "Not recorded",
                    "patientSnapshot.painLevel": patient.painLevel || null,
                    "patientSnapshot.surgeryType": patient.surgeryType || "Not recorded",
                    "patientSnapshot.surgeryDate": patient.surgeryDate || null
                }
            }
        );

        if (result.modifiedCount > 0) {
            console.log('✅ Report patient data updated successfully!');
        } else if (result.matchedCount > 0) {
            console.log('⚠️ Report found but no changes made (data already up to date)');
        } else {
            console.log('❌ Report not found with session ID: 6a95bbdd0769b34f7087d93c');
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        await mongoose.disconnect();
        process.exit(1);
    }
}

updateReportPatient();