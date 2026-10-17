// Rest-calibrated arm elevation, shared by every game.
//
// The camera never reads exactly 0 deg with the arm hanging down (usually
// 10-30 deg off). This learns each arm's lowest steady reading ("rest") and
// subtracts it, then rescales so shoulder height still reads about 90 deg.
//   0 = arm down, 90 = shoulder height, 180 = overhead.
export function createRestCalibrator() {
  const rest = { left: null, right: null };
  return {
    rest,
    reset() { rest.left = null; rest.right = null; },
    // Call every frame with the filtered raw elevation. Returns adjusted degrees.
    update(side, raw) {
      if (!Number.isFinite(raw)) return 0;
      if (raw < 50) {
        if (rest[side] === null || raw < rest[side]) rest[side] = raw;
        else rest[side] += 0.01 * (raw - rest[side]);
      }
      const base = Math.min(35, rest[side] ?? 0);
      const a = Math.max(0, ((raw - base) * 90) / (90 - base));
      return a < 5 ? 0 : Math.min(180, a);
    },
  };
}
