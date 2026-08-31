const express = require("express");
const router = express.Router();

const sessionController = require("../controllers/sessionController");
const { protect } = require("../middleware/auth");

// ─── AUTHENTICATED SESSION ROUTES ─────────────────────────────

router.get(
  "/patient/:patientId",
  protect,
  sessionController.getSessionsByPatient
);

router.get(
  "/:id",
  protect,
  sessionController.getSession
);

router.post(
  "/start",
  protect,
  sessionController.startSession
);

router.put(
  "/:id/complete",
  protect,
  sessionController.completeSession
);

router.post(
  "/:id/rep",
  protect,
  sessionController.saveRepData
);

router.delete(
  "/:id",
  protect,
  sessionController.deleteSession
);

// ─── PUBLIC SESSION ROUTES ────────────────────────────────────

router.post(
  "/public/start",
  sessionController.startPublicSession
);

router.post(
  "/public/update",
  sessionController.updatePublicSession
);

router.post(
  "/public/finish",
  sessionController.finishPublicSession
);

router.get(
  "/public/:sessionId",
  sessionController.getPublicSession
);

module.exports = router;