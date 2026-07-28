const express = require("express");
const router = express.Router();
const sessionController = require("../controllers/sessionController");
const { protect } = require("../middleware/auth");

// ─── Public session routes (no auth — patientId only) ─────────────────────
router.post("/public/start", sessionController.startPublicSession);
router.post("/public/update", sessionController.updatePublicSession);
router.post("/public/finish", sessionController.finishPublicSession);
router.get("/public/:sessionId", sessionController.getPublicSession);

// ─── Protected session routes (require JWT) ──────────────────────────────
router.use(protect);

router.get("/patient/:patientId", sessionController.getSessionsByPatient);
router.get("/:id", sessionController.getSession);
router.post("/start", sessionController.startSession);
router.put("/:id/complete", sessionController.completeSession);
router.post("/:id/rep", sessionController.saveRepData);
router.delete("/:id", sessionController.deleteSession);

module.exports = router;