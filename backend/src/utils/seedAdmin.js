require("dotenv").config();
const connectDB = require("../config/database");
const User = require("../models/User");
const mongoose = require("mongoose");

async function run() {
  await connectDB();
  const email = "admin@gestureheal.com";
  const existing = await User.findOne({ email });
  if (existing) {
    console.log("Admin already exists:", email);
  } else {
    const admin = await User.create({
      name: "Amit",
      email,
      password: "admin1234",
      role: "admin",
    });
    console.log("✅ Admin created:", admin.email, "/ admin1234");
  }
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });