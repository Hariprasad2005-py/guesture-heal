// One Euro filter: smooths jitter when a value is nearly still, but follows
// quickly when it moves fast, so it adds very little lag during real movement
// (Casiez et al., 2012). Used for joint angles.
//
//   minCutoff  Hz  - smoothing at rest (lower = steadier when still)
//   beta           - how fast the cutoff rises with speed (higher = less lag in motion)
//   dCutoff    Hz  - smoothing of the speed estimate itself
//   resetGapMs ms  - after a tracking gap this long, restart instead of blending old data
export class OneEuro {
  constructor(minCutoff = 1.5, beta = 0.04, dCutoff = 1.0, resetGapMs = 300) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.resetGapMs = resetGapMs;
    this.reset();
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }

  static alpha(cutoff, dtSec) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dtSec);
  }

  filter(value, tMs) {
    if (!Number.isFinite(value)) return value;
    if (this.t === null || tMs - this.t > this.resetGapMs || tMs <= this.t) {
      this.x = value;
      this.dx = 0;
      this.t = tMs;
      return value;
    }
    const dt = (tMs - this.t) / 1000;
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x);
    this.t = tMs;
    return this.x;
  }
}
