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
      // where the body is on screen (percent, mirrored like the camera picture): used by games
      // that need "hand at mouth / hair / shelf" relative to the player's own body
      const ls = raw.leftShoulder, rs = raw.rightShoulder;
      const body = ls && rs
        ? { x: (1 - (ls.x + rs.x) / 2) * 100, y: ((ls.y + rs.y) / 2) * 100, w: Math.max(8, Math.abs(ls.x - rs.x) * 100) }
        : null;
      const nose = raw.nose && raw.nose.visibility > 0.3 ? { x: (1 - raw.nose.x) * 100, y: raw.nose.y * 100 } : null;
      // how far each hand is from its own shoulder, in metres when the 3D pose is available
      // (not fooled by an arm pointing at the camera), otherwise a rough 2D estimate
      const reachOf = (side) => {
        const ws = poseData.world?.[`${side}Shoulder`], ww = poseData.world?.[`${side}Wrist`];
        if (ws && ww) return Math.hypot(ww.x - ws.x, ww.y - ws.y, ww.z - ws.z);
        const s2 = raw[`${side}Shoulder`], w2 = raw[`${side}Wrist`];
        if (!s2 || !w2 || !ls || !rs) return null;
        return (Math.hypot(w2.x - s2.x, w2.y - s2.y) / Math.max(0.05, Math.abs(ls.x - rs.x))) * 0.38;
      };
      return {
        leftReach: reachOf("left"),
        rightReach: reachOf("right"),
        body,
        nose,
        leftElbow: typeof poseData.leftElbowAngle === "number" ? poseData.leftElbowAngle : null,
        rightElbow: typeof poseData.rightElbowAngle === "number" ? poseData.rightElbowAngle : null,
        leftElev: adjust(lRaw, rest.left),
        rightElev: adjust(rRaw, rest.right),
        left: steady(leftPct, filt.left),
        right: steady(rightPct, filt.right),
      };
    },
  };
}
