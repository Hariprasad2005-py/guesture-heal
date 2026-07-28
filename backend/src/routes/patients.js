const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const patientController = require("../controllers/patientController");
const { protect } = require("../middleware/auth");

router.post("/self-register", patientController.selfRegister);
router.get("/public/:id", patientController.getPublicPatient);

router.use(protect);

const intakeValidation = [
  body("name").trim().notEmpty().withMessage("Patient name is required"),
  body("age").isInt({ min: 1, max: 120 }).withMessage("Valid age is required"),
  body("gender").isIn(["Male", "Female", "Other"]).withMessage("Valid gender is required"),
  body("condition").trim().notEmpty().withMessage("Condition is required"),
  body("goals").trim().notEmpty().withMessage("Rehab goals are required"),
  body("painLevel").isInt({ min: 0, max: 10 }).withMessage("Pain level must be 0–10"),
];

router.get("/", patientController.getAllPatients);
router.post("/", intakeValidation, patientController.createPatient);
router.get("/:id", patientController.getPatient);
router.put("/:id", patientController.updatePatient);
router.delete("/:id", patientController.deletePatient);
router.get("/:id/plan", patientController.getRehabPlan);
router.post("/:id/regenerate-plan", patientController.regeneratePlan);

module.exports = router;