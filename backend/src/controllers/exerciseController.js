const { EXERCISE_LIBRARY, getExercisesForCondition } = require("../utils/rehabPlanGenerator");

exports.getAllExercises = async (req, res, next) => {
  try {
    const { condition, category } = req.query;

    let exercises = Object.values(EXERCISE_LIBRARY);

    if (condition) {
      exercises = getExercisesForCondition(condition);
    }

    if (category) {
      exercises = exercises.filter(
        (ex) => ex.category?.toLowerCase() === category.toLowerCase()
      );
    }

    res.json({ success: true, exercises, total: exercises.length });
  } catch (err) {
    next(err);
  }
};

exports.getExercise = async (req, res, next) => {
  try {
    const exercise = EXERCISE_LIBRARY[req.params.id];
    if (!exercise) {
      return res.status(404).json({ success: false, message: "Exercise not found." });
    }
    res.json({ success: true, exercise });
  } catch (err) {
    next(err);
  }
};

exports.getPatientDayExercises = async (req, res, next) => {
  try {
    const Patient = require("../models/Patient");
    const { patientId, day } = req.params;

    const patient = await Patient.findOne({ _id: patientId, therapistId: req.user._id });
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }

    const dayPlan = patient.rehabPlan.find((d) => d.day === Number(day));
    if (!dayPlan) {
      return res.status(404).json({ success: false, message: `Day ${day} not found in plan.` });
    }

    res.json({ success: true, day: Number(day), exercises: dayPlan.exercises, isCompleted: dayPlan.isCompleted });
  } catch (err) {
    next(err);
  }
};