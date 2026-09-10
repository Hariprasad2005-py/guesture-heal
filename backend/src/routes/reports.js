const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const { protect } = require("../middleware/auth");

// ─── Public (no-token) routes ──────────────────────────────────────────
router.get("/public/:patientId", reportController.getPublicReportsByPatient);
router.post('/public/generate/:sessionId', reportController.generatePublicReport);
router.post('/public/regenerate-report/:sessionId', reportController.regeneratePublicReport);

// ─── PUBLIC ROUTE FOR PATIENTS (NO AUTH) ──────────────────────────────
// MUST be placed before router.use(protect)!
router.get("/:id", reportController.getReport);

// ─── All routes below this line require authentication ────────────────
router.use(protect);

router.get("/", reportController.getReportsByTherapist);
router.get("/patient/:patientId", reportController.getReportsByPatient);
router.post("/generate/:sessionId", reportController.generateReport);
router.post(
  "/regenerate-report/:sessionId",
  reportController.regenerateReport
);
router.put("/:id/notes", reportController.updateTherapistNotes);
router.delete("/:id", reportController.deleteReport);

module.exports = router;