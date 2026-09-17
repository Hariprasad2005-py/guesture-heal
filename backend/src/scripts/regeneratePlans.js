// backend/scripts/regeneratePlans.js
require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const { generateRehabPlan } = require('../utils/rehabPlanGenerator');

async function regeneratePlans() {
  await mongoose.connect(process.env.MONGODB_URI);

  const patients = await Patient.find({});
  for (const p of patients) {
    p.rehabPlan = generateRehabPlan(p.condition, p.painLevel, p.affectedSide);
    await p.save();
  }

  console.log(`Regenerated plans for ${patients.length} patients`);
  await mongoose.disconnect();
}

regeneratePlans().catch((err) => {
  console.error(err);
  process.exit(1);
});