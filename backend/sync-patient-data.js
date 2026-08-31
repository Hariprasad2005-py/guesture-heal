// backend/sync-patient-data.js
const mongoose = require('mongoose');
require('dotenv').config();

async function syncPatientData() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gestureheal_db';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get the patient
    const Patient = mongoose.model('Patient', new mongoose.Schema({}, { strict: false }));
    const patient = await Patient.findOne({ patientId: "GH-97491" });
    
    if (!patient) {
      console.log('❌ Patient not found!');
      process.exit(1);
    }

    console.log(`\n📋 Patient Data:`);
    console.log(`   Name: ${patient.name || 'Unknown'}`);
    console.log(`   Age: ${patient.age || 'Not recorded'}`);
    console.log(`   Gender: ${patient.gender || 'Not recorded'}`);
    console.log(`   Condition: ${patient.condition || 'Not recorded'}`);
    console.log(`   Goals: ${patient.goals || 'Not recorded'}`);
    console.log(`   Pain Level: ${patient.painLevel || 'Not recorded'}`);
    console.log(`   Surgery: ${patient.surgeryType || 'Not recorded'}`);
    console.log(`   Surgery Date: ${patient.surgeryDate || 'Not recorded'}`);

    // Update ALL sessions to use the correct patient reference
    const Session = mongoose.model('Session', new mongoose.Schema({}, { strict: false }));
    const sessionResult = await Session.updateMany(
      { patientIdRef: "GH-97491" },
      { $set: { patientId: patient._id } }
    );
    console.log(`\n✅ Updated ${sessionResult.modifiedCount} session(s)`);

    // Update ALL reports with the latest patient data
    const Report = mongoose.model('Report', new mongoose.Schema({}, { strict: false }));
    const reportResult = await Report.updateMany(
      { patientIdRef: "GH-97491" },
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
    console.log(`✅ Updated ${reportResult.modifiedCount} report(s)`);

    console.log('\n🎉 All synced! Run a new session and the report will show the correct patient data.');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

syncPatientData();