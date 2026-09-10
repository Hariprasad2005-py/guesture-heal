require("dotenv").config();
const mongoose = require("mongoose");
const Session = require("../models/Session");

async function migrate() {
    await mongoose.connect(process.env.MONGODB_URI);

    const result = await Session.updateMany(
        { gameType: "precision_reach", level: { $ne: null } },
        { $set: { level: null } }
    );

    console.log(`Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);

    await mongoose.disconnect();
}

migrate().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});