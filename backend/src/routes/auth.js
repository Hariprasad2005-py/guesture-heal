// backend/src/routes/auth.js
const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const authController = require("../controllers/authController");
const { protect } = require("../middleware/auth");

router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  authController.register
);

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  authController.login
);

// ─── NEW: Patient Login Route ──────────────────────────────────────────────
router.post(
  "/patient-login",
  [
    body("patientId").notEmpty().withMessage("Patient ID is required"),
  ],
  authController.patientLogin
);
// ─── NEW: Therapist self-registration & login ──────────────────────────
router.post(
  "/therapist-register",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone").trim().notEmpty().withMessage("Phone number is required"),
  ],
  authController.therapistRegister
);

router.post(
  "/therapist-login",
  [body("therapistId").notEmpty().withMessage("Therapist ID is required")],
  authController.therapistLogin
);
router.get("/me", protect, authController.getMe);
router.post("/logout", protect, authController.logout);
router.put("/profile", protect, authController.updateProfile);
router.put("/change-password", protect, authController.changePassword);

module.exports = router;