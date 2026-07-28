// backend/src/routes/admin.js
const express = require("express");
const router = express.Router();
const { protect, adminOnly } = require("../middleware/auth");
const adminController = require("../controllers/adminController");

router.use(protect);
router.use(adminOnly);

router.get("/stats", adminController.getStats);

router.get("/therapists", adminController.getTherapists);
router.get("/therapists/:id", adminController.getTherapistDetail);
router.put("/therapists/:id/status", adminController.updateTherapistStatus);

router.get("/patients", adminController.getAllPatients);
router.get("/patients/:id", adminController.getPatientDetail);
router.put("/patients/:id/assign-therapist", adminController.assignTherapist);

router.get("/reports", adminController.getAllReports);

router.get("/sessions", adminController.getAllSessions);
// ─── ADDITIONS to backend/src/routes/admin.js ──────────────────────────────
// Add these 5 lines wherever your other router.get("/...") calls live,
// alongside the existing protect + adminOnly middleware you already have.

router.get("/analytics/engagement", protect, adminOnly, adminController.getEngagementTrends);
router.get("/analytics/dau-sessions", protect, adminOnly, adminController.getDauVsSessions);
router.get("/analytics/completion-rates", protect, adminOnly, adminController.getCompletionRates);
router.get("/analytics/at-risk", protect, adminOnly, adminController.getAtRiskPatients);
router.get("/analytics/heatmap", protect, adminOnly, adminController.getSessionHeatmap);
module.exports = router;
