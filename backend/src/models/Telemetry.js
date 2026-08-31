// backend/src/models/Telemetry.js
const mongoose = require("mongoose");

const telemetryEventSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    eventType: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const telemetrySchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    // Kept alongside patientId (ObjectId) the same way Session/Report do
    // with patientIdRef, since the frontend sends the public "GH-xxxxx"
    // string, not the Mongo _id.
    patientIdRef: {
      type: String,
      required: true,
      index: true,
    },
    gameId: {
      type: String,
      required: true,
    },
    events: {
      type: [telemetryEventSchema],
      default: [],
    },
    isFinal: {
      type: Boolean,
      default: false,
    },
    sessionSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true } // gives createdAt/updatedAt automatically
);

telemetrySchema.index({ patientIdRef: 1, createdAt: -1 });
telemetrySchema.index({ gameId: 1 });

module.exports = mongoose.model("Telemetry", telemetrySchema);