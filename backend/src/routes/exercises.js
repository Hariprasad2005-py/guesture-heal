const express = require("express");
const router = express.Router();
const exerciseController = require("../controllers/exerciseController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.get("/", exerciseController.getAllExercises);
router.get("/for-patient/:patientId/day/:day", exerciseController.getPatientDayExercises);
router.get("/:id", exerciseController.getExercise);

module.exports = router;