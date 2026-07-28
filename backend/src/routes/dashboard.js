const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.get("/", dashboardController.getDashboardStats);
router.get("/patient/:patientId/progress", dashboardController.getPatientProgress);

module.exports = router;