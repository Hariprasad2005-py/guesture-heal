// backend/fix-everything.js
const mongoose = require('mongoose');
require('dotenv').config();

async function fixEverything() {
    try {
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gestureheal_db';
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected');

        const Patient = mongoose.model('Patient', new mongoose.Schema({}, { strict: false }));
        const Session = mongoose.model('Session', new mongoose.Schema({}, { strict: false }));
        const Report = mongoose.model('Report', new mongoose.Schema({}, { strict: false }));

        // Get the patient
        const patient = await Patient.findOne({ patientId: "GH-97491" });
        if (!patient) {
            console.log('❌ Patient not found');
            process.exit(1);
        }

        console.log('✅ Found patient:', patient.name);

        // 1. Delete ALL reports for this patient (force fresh generation)
        const deletedReports = await Report.deleteMany({ patientIdRef: "GH-97491" });
        console.log(`✅ Deleted ${deletedReports.deletedCount} old reports`);

        // 2. Update ALL sessions to use the correct patient ObjectId
        const updatedSessions = await Session.updateMany(
            { patientIdRef: "GH-97491" },
            { $set: { patientId: patient._id } }
        );
        console.log(`✅ Updated ${updatedSessions.modifiedCount} sessions`);

        console.log('\n🎉 DONE! Now run a NEW session and the report will have the correct data.');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        await mongoose.disconnect();
        process.exit(1);
    }
}

fixEverything();