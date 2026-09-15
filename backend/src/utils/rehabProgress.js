// backend/src/utils/rehabProgress.js
//
// SINGLE SOURCE OF TRUTH for rehab-plan day completion.
//
// Root cause this file fixes: sessionController.js used to set
// `dayPlan.isCompleted = true` (and advance `patient.currentDay`)
// the instant ANY session for that day was completed, regardless of
// whether every game assigned to the day had actually been played,
// and regardless of performance. That's how a patient could reach
// "Day 7/7" with a "COMPLETED" badge on Day 7 after playing a single
// game at any accuracy.
//
// Every place that needs to know "is this day done / what day is the
// patient on" must call recalcRehabProgress() (or isDayCompleted()
// directly) instead of writing those fields by hand.
//
// Completion rule (per product spec):
//   dayCompleted = everyAssignedGameHasResult && everyAssignedGamePerformance >= 75%
// Never averaged.

const PASS_THRESHOLD = 75;

/**
 * Was a single exercise/game on a given plan day actually completed
 * at or above the required performance threshold?
 *
 * Matches on gameType (== exercise.exerciseId, per rehabPlanGenerator.js)
 * plus day, so results are never borrowed from another day or another
 * plan's exercise. Only "completed" sessions with a real numeric
 * accuracy count as evidence -- a missing/undefined accuracy is
 * treated as "not enough data", never as a pass.
 */
function isExerciseCompleted(exercise, sessionsForDay) {
  return sessionsForDay.some(
    (s) =>
      s.gameType === exercise.exerciseId &&
      typeof s.accuracy === "number" &&
      s.accuracy >= PASS_THRESHOLD
  );
}

/**
 * Is a plan day COMPLETED? Every assigned game must have at least one
 * completed session at >=75% accuracy. A day with no exercises can
 * never be "completed" (nothing to guess from), and one missing or
 * sub-75% game keeps the whole day incomplete -- never averaged.
 */
function isDayCompleted(dayPlan, sessionsForPatient) {
  if (!dayPlan?.exercises?.length) return false;

  const sessionsForDay = sessionsForPatient.filter(
    (s) => s.day === dayPlan.day && s.status === "completed"
  );

  return dayPlan.exercises.every((exercise) =>
    isExerciseCompleted(exercise, sessionsForDay)
  );
}

/**
 * Recompute isCompleted/completedAt for every day of a patient's plan,
 * and derive currentDay from that same recomputed state, all from the
 * patient's actual persisted session records -- never from frontend
 * state, a hardcoded value, or "latest session played".
 *
 * Mutates `patient` in place (caller is responsible for patient.save()).
 * Does not touch totalSessions/averageAccuracy/totalScore -- those
 * remain running aggregates updated where the session is recorded.
 *
 * currentDay = the first NOT-completed day (the day the patient should
 * work on next), or 7 once every day is completed. This replaces the
 * old "advance whenever any session matching currentDay finishes"
 * logic, which could advance/mark-complete on a single sub-75% game.
 */
async function recalcRehabProgress(patient, SessionModel) {
  if (!patient?.rehabPlan?.length) return;

  const sessions = await SessionModel.find({
    patientId: patient._id,
    status: "completed",
  })
    .select("day gameType accuracy status")
    .lean();

  let firstIncompleteDay = null;

  patient.rehabPlan.forEach((dayPlan) => {
    const completed = isDayCompleted(dayPlan, sessions);

    if (completed) {
      if (!dayPlan.isCompleted) {
        dayPlan.completedAt = new Date();
      }
    } else {
      dayPlan.completedAt = null;
      if (firstIncompleteDay === null) {
        firstIncompleteDay = dayPlan.day;
      }
    }

    dayPlan.isCompleted = completed;
  });

  patient.currentDay = firstIncompleteDay !== null ? firstIncompleteDay : 7;
}

module.exports = {
  PASS_THRESHOLD,
  isExerciseCompleted,
  isDayCompleted,
  recalcRehabProgress,
};