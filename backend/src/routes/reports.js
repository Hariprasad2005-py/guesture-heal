const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const { protect } = require("../middleware/auth");

// ─── Public (no-token) route ───────────────────────────────────────────
router.get("/public/:patientId", reportController.getPublicReportsByPatient);

router.use(protect);

router.get("/", reportController.getReportsByTherapist);
router.get("/patient/:patientId", reportController.getReportsByPatient);
router.get("/:id", reportController.getReport);
router.post("/generate/:sessionId", reportController.generateReport);
// Public report generation (no auth required)
router.post('/public/generate/:sessionId', reportController.generatePublicReport);
router.put("/:id/notes", reportController.updateTherapistNotes);
router.delete("/:id", reportController.deleteReport);

module.exports = router;