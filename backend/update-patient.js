// backend/update-patient.js
// One-time script to fill in missing fields for patient John Doe (GH-97491)
const mongoose = require('mongoose');
require('dotenv').config();

async function updatePatient() {
    try {
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gestureheal_db';
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        const result = await db.collection('patients').updateOne(
            { _id: new mongoose.Types.ObjectId('6a9448d6b74c23107d4a1f78') },
            {
                $set: {
                    age: 45,
                    gender: 'Male',
                    surgeryType: 'Arthroscopic Shoulder Decompression',
                    surgeryDate: new Date('2026-07-15'),
                    painLevel: 3,
                    goals: 'Restore full shoulder range of motion and reduce pain'
                }
            }
        );

        if (result.modifiedCount > 0) {
            console.log('✅ Patient updated successfully!');
        } else if (result.matchedCount > 0) {
            console.log('⚠️ Patient found but no changes made (fields already set)');
        } else {
            console.log('❌ Patient not found with _id 6a9448d6b74c23107d4a1f78');
        }

        // Verify the update
        const patient = await db.collection('patients').findOne(
            { _id: new mongoose.Types.ObjectId('6a9448d6b74c23107d4a1f78') },
            { projection: { name: 1, age: 1, gender: 1, surgeryType: 1, surgeryDate: 1, painLevel: 1, goals: 1 } }
        );
        console.log('\n📋 Updated patient data:');
        console.log(JSON.stringify(patient, null, 2));

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        await mongoose.disconnect();
        process.exit(1);
    }
}

updatePatient();
