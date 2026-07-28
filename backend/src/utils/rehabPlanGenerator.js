const EXERCISE_LIBRARY = {
  "sh_flexion": {
    exerciseId: "sh_flexion",
    name: "Shoulder Flexion",
    category: "shoulder",
    description: "Raise your arm forward and upward, keeping elbow straight.",
    targetRom: 160,
    sets: 3,
    reps: 10,
    holdSeconds: 0,
    mediapipeKey: "shoulder_flexion",
  },
  "sh_abduction": {
    exerciseId: "sh_abduction",
    name: "Shoulder Abduction",
    category: "shoulder",
    description: "Raise your arm out to the side until parallel to the ground.",
    targetRom: 120,
    sets: 3,
    reps: 10,
    holdSeconds: 0,
    mediapipeKey: "shoulder_abduction",
  },
  "sh_er": {
    exerciseId: "sh_er",
    name: "Shoulder External Rotation",
    category: "shoulder",
    description: "With elbow bent 90°, rotate forearm away from body.",
    targetRom: 60,
    sets: 3,
    reps: 10,
    holdSeconds: 2,
    mediapipeKey: "shoulder_external_rotation",
  },
  "sh_pendulum": {
    exerciseId: "sh_pendulum",
    name: "Pendulum Circles",
    category: "shoulder",
    description: "Lean forward, let arm hang, make small circles (clockwise then counterclockwise).",
    targetRom: 45,
    sets: 2,
    reps: 15,
    holdSeconds: 0,
    mediapipeKey: "pendulum",
  },
  "kn_extension": {
    exerciseId: "kn_extension",
    name: "Knee Extension",
    category: "knee",
    description: "Seated, straighten your knee fully and hold.",
    targetRom: 0,
    sets: 3,
    reps: 10,
    holdSeconds: 3,
    mediapipeKey: "knee_extension",
  },
  "kn_flexion": {
    exerciseId: "kn_flexion",
    name: "Knee Flexion",
    category: "knee",
    description: "Bend knee as far as comfortable, hold briefly.",
    targetRom: 120,
    sets: 3,
    reps: 10,
    holdSeconds: 2,
    mediapipeKey: "knee_flexion",
  },
  "kn_squat": {
    exerciseId: "kn_squat",
    name: "Mini Squat",
    category: "knee",
    description: "Stand and bend knees to 30–45°, keeping weight even.",
    targetRom: 45,
    sets: 3,
    reps: 10,
    holdSeconds: 0,
    mediapipeKey: "squat",
  },
  "kn_slr": {
    exerciseId: "kn_slr",
    name: "Straight Leg Raise",
    category: "knee",
    description: "Lying flat, raise straight leg to 45° and lower slowly.",
    targetRom: 45,
    sets: 3,
    reps: 12,
    holdSeconds: 0,
    mediapipeKey: "straight_leg_raise",
  },
  "hip_abduction": {
    exerciseId: "hip_abduction",
    name: "Hip Abduction",
    category: "hip",
    description: "Stand, raise leg sideways keeping toes forward.",
    targetRom: 40,
    sets: 3,
    reps: 12,
    holdSeconds: 0,
    mediapipeKey: "hip_abduction",
  },
  "hip_flexion": {
    exerciseId: "hip_flexion",
    name: "Hip Flexion March",
    category: "hip",
    description: "Stand and march in place, lifting knees to hip height.",
    targetRom: 90,
    sets: 3,
    reps: 15,
    holdSeconds: 0,
    mediapipeKey: "hip_flexion",
  },
  "hip_bridge": {
    exerciseId: "hip_bridge",
    name: "Glute Bridge",
    category: "hip",
    description: "Lying on back, feet flat, push hips up and squeeze glutes.",
    targetRom: 30,
    sets: 3,
    reps: 12,
    holdSeconds: 2,
    mediapipeKey: "bridge",
  },
  "el_flexion": {
    exerciseId: "el_flexion",
    name: "Elbow Flexion",
    category: "elbow",
    description: "Curl forearm toward shoulder and lower slowly.",
    targetRom: 140,
    sets: 3,
    reps: 12,
    holdSeconds: 0,
    mediapipeKey: "elbow_flexion",
  },
  "el_extension": {
    exerciseId: "el_extension",
    name: "Elbow Extension",
    category: "elbow",
    description: "Straighten arm fully from a bent position.",
    targetRom: 0,
    sets: 3,
    reps: 10,
    holdSeconds: 2,
    mediapipeKey: "elbow_extension",
  },
  "wr_flexion_ext": {
    exerciseId: "wr_flexion_ext",
    name: "Wrist Flexion / Extension",
    category: "wrist",
    description: "Bend wrist up and down through full range.",
    targetRom: 70,
    sets: 3,
    reps: 15,
    holdSeconds: 0,
    mediapipeKey: "wrist_flexion",
  },
  "balance_stand": {
    exerciseId: "balance_stand",
    name: "Single Leg Balance",
    category: "balance",
    description: "Stand on one leg with eyes open, maintain for hold duration.",
    targetRom: 0,
    sets: 3,
    reps: 1,
    holdSeconds: 20,
    mediapipeKey: "single_leg_stand",
  },
  "trunk_rotation": {
    exerciseId: "trunk_rotation",
    name: "Seated Trunk Rotation",
    category: "trunk",
    description: "Seated, rotate torso left and right with arms crossed.",
    targetRom: 45,
    sets: 3,
    reps: 10,
    holdSeconds: 0,
    mediapipeKey: "trunk_rotation",
  },
};

const CONDITION_EXERCISES = {
  "rotator cuff":    ["sh_pendulum", "sh_er", "sh_flexion", "sh_abduction", "el_flexion"],
  "shoulder":        ["sh_pendulum", "sh_flexion", "sh_abduction", "sh_er", "el_flexion"],
  "acl":             ["kn_extension", "kn_slr", "kn_squat", "hip_abduction", "hip_bridge"],
  "knee":            ["kn_extension", "kn_flexion", "kn_slr", "kn_squat", "hip_bridge"],
  "hip":             ["hip_abduction", "hip_flexion", "hip_bridge", "kn_slr", "balance_stand"],
  "elbow":           ["el_flexion", "el_extension", "wr_flexion_ext", "sh_flexion"],
  "wrist":           ["wr_flexion_ext", "el_flexion", "el_extension"],
  "balance":         ["balance_stand", "hip_abduction", "kn_squat", "trunk_rotation"],
  "default":         ["sh_flexion", "kn_extension", "hip_bridge", "el_flexion", "trunk_rotation"],
};

// Kept for the standalone /api/exercises browsing route (exerciseController.js).
// Not used by generateRehabPlan anymore — that now pulls from GAMES_LIBRARY below.
function getExercisesForCondition(condition = "") {
  const lower = condition.toLowerCase();
  for (const [key, ids] of Object.entries(CONDITION_EXERCISES)) {
    if (lower.includes(key)) {
      return ids.map((id) => EXERCISE_LIBRARY[id]).filter(Boolean);
    }
  }
  return CONDITION_EXERCISES.default.map((id) => EXERCISE_LIBRARY[id]).filter(Boolean);
}

// ─── Games catalog ──────────────────────────────────────────────────────────
// gameId values match the keys in frontend/src/games/GameEngine.jsx's
// GAME_COMPONENTS / GAME_NAMES exactly, so these can be used directly as
// route params (e.g. /games/:gameId) as well as rehab-plan entries.
const GAMES_LIBRARY = {
  "precision-reach": {
    gameId: "precision-reach",
    name: "Precision Reach",
    description: "Hold your fingertip inside moving targets to build controlled reach and shoulder mobility.",
  },
  "canvas-air": {
    gameId: "canvas-air",
    name: "Canvas Air",
    description: "Trace shapes in the air to build fine motor control and precision.",
  },
  "catch-flex": {
    gameId: "catch-flex",
    name: "Catch & Flex",
    description: "Move your hand to catch falling items, building hand-eye coordination and arm control.",
  },
  "cloud-reach": {
    gameId: "cloud-reach",
    name: "Cloud Reach",
    description: "Reach upward to pop balloons, building shoulder elevation and arm strength.",
  },
  "rehab-slicer": {
    gameId: "rehab-slicer",
    name: "Rehab Slicer",
    description: "Swipe through falling objects to build wrist/forearm mobility and coordination.",
  },
};

// Condition -> recommended games (per current clinical mapping).
const CONDITION_GAMES = {
  "hand surgery recovery":       ["precision-reach", "canvas-air", "catch-flex"],
  "stroke rehabilitation":       ["precision-reach", "cloud-reach", "catch-flex"],
  "fracture recovery":           ["precision-reach", "cloud-reach", "canvas-air"],
  "nerve injury rehabilitation": ["canvas-air", "catch-flex", "precision-reach"],
  "wrist rehabilitation":        ["rehab-slicer", "canvas-air", "catch-flex"],
  "parkinson's":                 ["catch-flex", "canvas-air", "cloud-reach"],
  "rotator cuff":                ["cloud-reach", "precision-reach", "rehab-slicer"],
  "default":                     ["precision-reach", "canvas-air", "catch-flex"],
};

function getGamesForCondition(condition = "") {
  const lower = condition.toLowerCase();
  for (const [key, ids] of Object.entries(CONDITION_GAMES)) {
    if (key === "default") continue;
    if (lower.includes(key)) {
      return ids.map((id) => GAMES_LIBRARY[id]).filter(Boolean);
    }
  }
  return CONDITION_GAMES.default.map((id) => GAMES_LIBRARY[id]).filter(Boolean);
}

function adjustForPain(sessionSeconds, painLevel) {
  if (painLevel >= 8) return Math.max(30, Math.round(sessionSeconds * 0.6));
  if (painLevel >= 5) return Math.max(40, Math.round(sessionSeconds * 0.8));
  return sessionSeconds;
}

function progressionMultiplier(day) {
  if (day <= 2) return 1.0;
  if (day <= 4) return 1.15;
  return 1.3;
}

// Builds the 7-day plan using games. Keeps the same "exercises" array shape
// the Patient schema / dashboard expect (exerciseId, name, sets, reps,
// holdSeconds, description, videoUrl) — exerciseId here IS the gameId, so it
// can be used directly to route into GameEngine (/games/:gameId).
function generateRehabPlan(condition = "", painLevel = 3, affectedSide = "n/a") {
  // Get exercises for the condition
  const exercises = getExercisesForCondition(condition);
  const plan = [];

  for (let day = 1; day <= 7; day++) {
    const dayExercises = exercises.map((ex) => ({
      exerciseId: ex.exerciseId,  // ← Use exercise ID
      name: ex.name,              // ← Use exercise name
      sets: ex.sets || 3,
      reps: ex.reps || 10,
      holdSeconds: ex.holdSeconds || 0,
      targetRom: ex.targetRom || 90,
      description: ex.description || "",
      videoUrl: ex.videoUrl || "",
    }));

    plan.push({
      day,
      exercises: dayExercises,
      isCompleted: false,
      completedAt: null,
    });
  }

  return plan;
}

module.exports = {
  EXERCISE_LIBRARY,
  CONDITION_EXERCISES,
  getExercisesForCondition,
  GAMES_LIBRARY,
  CONDITION_GAMES,
  getGamesForCondition,
  generateRehabPlan,
};