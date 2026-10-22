// Turns MediaPipe hand landmarks (21 points per hand) into easy numbers for the hand games.
//
//   createHandInput({ fast }).update(hands, { arm, poseRaw, dims }) ->
//   {
//     present, side,                 // is the chosen hand visible; "left" | "right" (the person's own hand)
//     lm,                            // the 21 points of the chosen hand (raw, un-mirrored) for drawing
//     curl: {thumb,index,middle,ring,pinky}  // 0 = finger straight, 1 = fully curled
//     grip,                          // 0 = hand wide open, 1 = tight fist
//     tilt,                          // hand angle in degrees, 0 = fingers straight up, + = leaning to the right of the mirrored picture
//     tip,                           // index fingertip on screen in percent (mirrored like the camera picture)
//     palm,                          // palm centre in percent (mirrored)
//     palmPct,                       // palm length as percent of the picture width
//     pinch,                         // 0 = thumb and index tip apart, 1 = touching
//     tremor,                        // shake of the index fingertip, in percent of palm length (about 0.5 = steady, 3+ = shaky)
//     speed                          // fingertip speed, percent of the picture per second
//     aspect                         // picture width / height (for drawing the hand)
//   }
//
// Finger curl is measured in 3D (wrist to fingertip compared with wrist to knuckle), so a finger
// bending toward the camera still reads as curled.
import { OneEuro } from "./oneEuro";

export const FINGER_NAMES = ["thumb", "index", "middle", "ring", "pinky"];
const TIP = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
const MCP = { index: 5, middle: 9, ring: 13, pinky: 17 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const EMPTY = Object.freeze({
  present: false, side: null, lm: null,
  curl: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
  grip: 0, tilt: 0, tip: null, palm: null, palmPct: 0, pinch: 0, tremor: 0, speed: 0, aspect: 4 / 3,
});
export const EMPTY_HAND = EMPTY;

function d3(a, b, dims) {
  return Math.hypot((a.x - b.x) * dims.w, (a.y - b.y) * dims.h, ((a.z || 0) - (b.z || 0)) * dims.w);
}

// Which detected hand is the one the player chose? The pose wrist is the best clue; the
// left/right label from the hand model is the fallback (its label is mirrored for a normal camera).
export function pickHand(hands, arm, poseRaw) {
  if (!hands || !hands.length) return null;
  const want = arm === "left" ? "left" : "right";
  const pw = poseRaw?.[`${want}Wrist`];
  if (pw && pw.visibility > 0.4) {
    let best = null, bd = 0.22;
    hands.forEach((h) => { const w = h.lm[0]; const d = Math.hypot(w.x - pw.x, w.y - pw.y); if (d < bd) { bd = d; best = h; } });
    if (best) return { hand: best, side: want };
  }
  const labelled = hands.find((h) => h.label === want);
  if (labelled) return { hand: labelled, side: want };
  if (hands.length === 1 && !hands[0].label) return { hand: hands[0], side: want };
  // only one hand in view and the label points at the other hand: do not guess
  return null;
}

export function createHandInput({ fast = false } = {}) {
  const f = {
    tipX: new OneEuro(fast ? 2.0 : 1.0, fast ? 0.7 : 0.1), tipY: new OneEuro(fast ? 2.0 : 1.0, fast ? 0.7 : 0.1),
    tilt: new OneEuro(fast ? 2.0 : 1.0, fast ? 0.7 : 0.1),
  };
  const sm = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0, grip: 0, pinch: 0 };
  // adaptive range of the curl ratio: starts at typical values and only widens
  const OPEN0 = { index: 1.75, middle: 1.75, ring: 1.75, pinky: 1.7, thumb: 1.2 }, CLOSED0 = { index: 1.1, middle: 1.1, ring: 1.1, pinky: 1.1, thumb: 0.6 };
  const rng = { open: { ...OPEN0 }, closed: { ...CLOSED0 } };
  const trail = []; // {t, x, y}
  let last = null;

  return {
    reset() { f.tipX.reset(); f.tipY.reset(); f.tilt.reset(); trail.length = 0; last = null; },
    update(hands, { arm = "right", poseRaw = null, dims = { w: 640, h: 480 } } = {}) {
      const picked = pickHand(hands, arm, poseRaw);
      if (!picked) { if (last) this.reset(); return EMPTY; }
      const lm = picked.hand.lm;
      const t = performance.now();
      const palmLen = d3(lm[0], lm[9], dims) || 1;
      const alpha = fast ? 0.7 : 0.5;
      const curl = {};
      FINGER_NAMES.forEach((n) => {
        let r;
        if (n === "thumb") r = d3(lm[4], lm[17], dims) / palmLen;
        else r = d3(lm[TIP[n]], lm[0], dims) / Math.max(1, d3(lm[MCP[n]], lm[0], dims));
        // widen the range slowly if this hand opens wider / closes tighter than the defaults
        rng.open[n] = Math.max(rng.open[n] * 0.9995 + OPEN0[n] * 0.0005, r);
        rng.closed[n] = Math.min(rng.closed[n] * 0.9995 + CLOSED0[n] * 0.0005, r);
        const c = clamp((rng.open[n] - r) / Math.max(0.2, rng.open[n] - rng.closed[n]), 0, 1);
        sm[n] += (c - sm[n]) * alpha;
        curl[n] = sm[n];
      });
      const g = (curl.index + curl.middle + curl.ring + curl.pinky) / 4 * 0.85 + curl.thumb * 0.15;
      sm.grip += (g - sm.grip) * alpha;
      // tilt: angle of wrist -> middle knuckle from straight up, in the mirrored picture
      const ux = -(lm[9].x - lm[0].x) * dims.w, uy = -(lm[9].y - lm[0].y) * dims.h;
      const tilt = f.tilt.filter((Math.atan2(ux, uy) * 180) / Math.PI, t);
      const tipRaw = lm[8];
      const x = f.tipX.filter((1 - tipRaw.x) * 100, t), y = f.tipY.filter(tipRaw.y * 100, t);
      trail.push({ t, x: (1 - tipRaw.x) * 100, y: tipRaw.y * 100 }); // raw (unsmoothed) so tremor is not filtered away
      while (trail.length && t - trail[0].t > 1000) trail.shift();
      let speed = 0;
      if (trail.length > 2) { const a = trail[trail.length - 3], b = trail[trail.length - 1]; speed = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(0.001, (b.t - a.t) / 1000); }
      // tremor: how far the fingertip wobbles around its own slow drift
      let tremor = 0;
      if (trail.length > 8) {
        const n = trail.length, mx = trail.reduce((s, p) => s + p.x, 0) / n, my = trail.reduce((s, p) => s + p.y, 0) / n;
        // remove the slow drift with a short running mean
        let acc = 0;
        for (let i = 2; i < n - 2; i++) {
          const sx = (trail[i - 2].x + trail[i - 1].x + trail[i].x + trail[i + 1].x + trail[i + 2].x) / 5;
          const sy = (trail[i - 2].y + trail[i - 1].y + trail[i].y + trail[i + 1].y + trail[i + 2].y) / 5;
          acc += (trail[i].x - sx) ** 2 + (trail[i].y - sy) ** 2;
        }
        void mx; void my;
        const palmPct0 = Math.max(1, (palmLen / dims.w) * 100);
        tremor = (Math.sqrt(acc / Math.max(1, n - 4)) / palmPct0) * 100;
      }
      const pinchD = d3(lm[4], lm[8], dims) / palmLen;
      sm.pinch += (clamp(1 - pinchD / 0.8, 0, 1) - sm.pinch) * alpha;
      const cx = (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5, cy = (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5;
      last = {
        present: true, side: picked.side, lm, curl, grip: sm.grip, tilt, tip: { x, y }, palm: { x: (1 - cx) * 100, y: cy * 100 },
        palmPct: (palmLen / dims.w) * 100, pinch: sm.pinch, tremor, speed, aspect: dims.w / dims.h,
      };
      return last;
    },
  };
}
