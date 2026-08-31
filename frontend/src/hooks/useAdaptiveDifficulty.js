import { useCallback, useMemo, useRef, useState } from "react";

export const DIFFICULTY_LEVELS = [
  "Beginner",
  "Intermediate",
  "Advanced",
];

export const DIFFICULTY_SETTINGS = {
  Beginner: {
    spawnRate: 3500,
    objectSize: 150,
    speed: 0.35,
    holdDuration: 900,
    tolerance: 10,
  },
  Intermediate: {
    spawnRate: 2200,
    objectSize: 115,
    speed: 0.6,
    holdDuration: 600,
    tolerance: 6,
  },
  Advanced: {
    spawnRate: 1300,
    objectSize: 85,
    speed: 0.9,
    holdDuration: 350,
    tolerance: 4,
  },
};

// Minimum sustained shoulder-flexion ROM (degrees) required to advance
// INTO the level at that array index. Index 0 (Beginner) has no gate.
// These are reasonable clinical defaults, not a substitute for a
// therapist-set threshold — override via the `romThresholds` option if
// your care team gives you specific numbers.
export const DEFAULT_ROM_THRESHOLDS = [0, 60, 100];

export function useAdaptiveDifficulty(initialDifficulty = "Beginner", options = {}) {
  const romThresholds = options.romThresholds || DEFAULT_ROM_THRESHOLDS;

  const initial = DIFFICULTY_LEVELS.includes(initialDifficulty)
    ? initialDifficulty
    : "Beginner";

  const [currentDifficulty, setCurrentDifficulty] = useState(initial);
  const difficultyIndexRef = useRef(
    DIFFICULTY_LEVELS.indexOf(initial)
  );

  const adapt = useCallback(
    ({
      accuracy = 0,
      papsScore = 0,
      combo = 0,
      // Best sustained shoulder-flexion angle observed so far this
      // session. null/undefined means "not measured yet" — treated as
      // not meeting any ROM gate, never as 0 degrees.
      maxFlexionAngle = null,
    } = {}) => {
      let index = difficultyIndexRef.current;

      if (papsScore > 7) {
        // Pain always wins: drop back to the safest level regardless of
        // ROM or accuracy.
        index = 0;
      } else if (accuracy > 85 && papsScore < 3 && combo > 3) {
        const nextIndex = Math.min(DIFFICULTY_LEVELS.length - 1, index + 1);
        const romNeeded = romThresholds[nextIndex] ?? 0;
        const romMet = typeof maxFlexionAngle === "number" && maxFlexionAngle >= romNeeded;
        // Only advance once the patient has actually demonstrated the ROM
        // the next level asks for — performance alone isn't enough,
        // matching the spec's "cloud height increases as ROM improves."
        if (romMet) index = nextIndex;
      } else if (accuracy < 45 || papsScore > 5) {
        index = Math.max(0, index - 1);
      }

      if (index !== difficultyIndexRef.current) {
        difficultyIndexRef.current = index;
        setCurrentDifficulty(DIFFICULTY_LEVELS[index]);
      }

      return DIFFICULTY_LEVELS[index];
    },
    [romThresholds]
  );

  const settings = useMemo(
    () => DIFFICULTY_SETTINGS[currentDifficulty],
    [currentDifficulty]
  );

  return {
    currentDifficulty,
    settings,
    adapt,
  };
}

export default useAdaptiveDifficulty;