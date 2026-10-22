// Turns one pose frame into easy numbers for the arm games:
//  - leftElev / rightElev: arm height in degrees (0 = arm down, ~90 = shoulder height, 180 = overhead),
//    calibrated so "arms resting" reads 0
//  - left / right: hand position on screen in percent (0..100), already mirrored like the camera picture,
//    or null when that hand is not visible
import { OneEuro } from "./oneEuro";

// fast: less smoothing, for games where reaction time matters (Table Rally)
export function createArmInput({ fast = false } = {}) {
  const rest = { left: null, right: null };
  const filt = {
    left: { x: new OneEuro(fast ? 1.6 : 0.6, fast ? 0.6 : 0.05), y: new OneEuro(fast ? 1.6 : 0.6, fast ? 0.6 : 0.05), last: null },
    right: { x: new OneEuro(fast ? 1.6 : 0.6, fast ? 0.6 : 0.05), y: new OneEuro(fast ? 1.6 : 0.6, fast ? 0.6 : 0.05), last: null },
  };

  const learnRest = (side, v) => {
    if (v >= 50) return;
    if (rest[side] === null || v < rest[side]) rest[side] = v;
    else rest[side] += 0.01 * (v - rest[side]);
  };
  const adjust = (v, r) => {
    const base = Math.min(35, r ?? 0);
    const a = Math.max(0, ((v - base) * 90) / (90 - base));
    return a < 5 ? 0 : Math.min(180, a);
  };
  const steady = (pct, f) => {
    if (!pct) { f.x.reset(); f.y.reset(); f.last = null; return null; }
    const t = performance.now();
    const x = f.x.filter(pct.x, t);
    const y = f.y.filter(pct.y, t);
    if (!fast && f.last && Math.hypot(x - f.last.x, y - f.last.y) < 0.35) return f.last;
    f.last = { x, y };
    return f.last;
  };

  return {
    update(poseData) {
      const raw = poseData?.raw;
      if (!raw) return null;
      const lRaw = typeof poseData.leftElevation === "number" ? poseData.leftElevation : 180 - poseData.leftFlexion;
      const rRaw = typeof poseData.rightElevation === "number" ? poseData.rightElevation : 180 - poseData.rightFlexion;
      learnRest("left", lRaw);
      learnRest("right", rRaw);
      const leftPct = raw.leftWrist?.visibility > 0.4 ? { x: (1 - raw.leftWrist.x) * 100, y: raw.leftWrist.y * 100 } : null;
      const rightPct = raw.rightWrist?.visibility > 0.4 ? { x: (1 - raw.rightWrist.x) * 100, y: raw.rightWrist.y * 100 } : null;
      return {
        leftElev: adjust(lRaw, rest.left),
        rightElev: adjust(rRaw, rest.right),
        left: steady(leftPct, filt.left),
        right: steady(rightPct, filt.right),
      };
    },
  };
}
