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

export function useAdaptiveDifficulty(initialDifficulty = "Beginner") {
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
    } = {}) => {
      let index = difficultyIndexRef.current;

      if (papsScore > 7) {
        index = 0;
      } else if (
        accuracy > 85 &&
        papsScore < 3 &&
        combo > 3
      ) {
        index = Math.min(
          DIFFICULTY_LEVELS.length - 1,
          index + 1
        );
      } else if (accuracy < 45 || papsScore > 5) {
        index = Math.max(0, index - 1);
      }

      if (index !== difficultyIndexRef.current) {
        difficultyIndexRef.current = index;
        setCurrentDifficulty(DIFFICULTY_LEVELS[index]);
      }

      return DIFFICULTY_LEVELS[index];
    },
    []
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