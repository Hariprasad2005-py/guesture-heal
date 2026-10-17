// Detects a two-armed "push" from a stream of shoulder-elevation angles.
//
// Angle convention (degrees): 0 = arm hanging at the side, ~90 = arm raised to
// shoulder height, ~180 = overhead. A push is the RAISING stroke: it fires
// once, early in the stroke, when the average elevation passes `fireAngle`
// while still rising fast. It cannot fire again until the arms have come back
// below `rearmAngle` (so lowering the arms never counts as a push).
//
// Pure functions only (no React / DOM) so it can be unit-tested.
export const PUSH_DEFAULTS = {
  fireAngle: 55,        // fire when avg elevation passes this on the way up
  rearmAngle: 30,       // arms must drop below this before the next push
  minVelocity: 90,      // deg/s of avg elevation required at the moment of firing
  velocityWindowMs: 120, // short window = fast response
  minGapMs: 250,
  gapWindowMs: 200,     // window used to average the left/right difference
};

export function createPushDetector(options = {}) {
  const cfg = { ...PUSH_DEFAULTS, ...options };
  let history = []; // { t, e, gap }
  let armed = true;
  let lastFireAt = -Infinity;
  let peak = 0;

  return {
    config: cfg,
    reset() {
      history = [];
      armed = true;
      lastFireAt = -Infinity;
      peak = 0;
    },
    // left / right: elevation in degrees for each arm; t: ms timestamp.
    update(t, left, right) {
      const e = (left + right) / 2;
      const gap = Math.abs(left - right);
      history.push({ t, e, gap });
      const keep = Math.max(cfg.velocityWindowMs, cfg.gapWindowMs) + 100;
      while (history.length && t - history[0].t > keep) history.shift();

      const out = { fired: false, rearmed: false, angle: e, peak, velocity: 0, gapDeg: gap, force: 0 };

      // velocity over the short window
      let start = history[0];
      for (const h of history) {
        if (t - h.t <= cfg.velocityWindowMs) { start = h; break; }
      }
      const dt = (t - start.t) / 1000;
      const velocity = dt >= 0.04 ? (e - start.e) / dt : 0;
      out.velocity = velocity;

      if (!armed) {
        peak = Math.max(peak, e);
        out.peak = peak;
        if (e < cfg.rearmAngle) {
          armed = true;
          out.rearmed = true;
        }
        return out;
      }

      if (e >= cfg.fireAngle && velocity >= cfg.minVelocity && t - lastFireAt >= cfg.minGapMs) {
        armed = false;
        lastFireAt = t;
        peak = e;
        const win = history.filter((h) => t - h.t <= cfg.gapWindowMs);
        out.gapDeg = win.reduce((a, h) => a + h.gap, 0) / Math.max(1, win.length);
        out.force = Math.max(0, Math.min(1, velocity / (cfg.minVelocity * 3)));
        out.fired = true;
        out.peak = peak;
      }
      return out;
    },
  };
}

// 1 = arms perfectly even, 0 = at or beyond the tolerance (degrees).
export function symmetryFromGap(gapDeg, toleranceDeg) {
  return Math.max(0, Math.min(1, 1 - gapDeg / Math.max(1, toleranceDeg)));
}
