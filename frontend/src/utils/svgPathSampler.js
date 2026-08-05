// frontend/src/utils/svgPathSampler.js
//
// Samples an SVG path `d` string into points and tracks how much of that
// path a moving point (fingertip) has actually covered. This replaces any
// "is the point somewhere inside the canvas" check with a real distance-to-
// path test, which is what a tracing game needs to score correctly.

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Samples an SVG path `d` string into an array of {x, y, length} points in
 * the same coordinate space the shape is drawn in (here, a 0-100 viewBox).
 * Uses a real (offscreen, unattached) SVGPathElement so curves/arcs are
 * sampled exactly via getPointAtLength(), not approximated by hand.
 */
export function samplePath(d, sampleCount = 150) {
  if (!d || typeof document === "undefined") return [];

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);

  const totalLength = path.getTotalLength();
  if (!totalLength || Number.isNaN(totalLength)) return [];

  const points = [];
  for (let i = 0; i <= sampleCount; i++) {
    const length = (totalLength * i) / sampleCount;
    const { x, y } = path.getPointAtLength(length);
    points.push({ x, y, length });
  }
  return points;
}

/** Closest sampled point to `point`, its index, and the distance to it. */
export function closestPointOnPath(point, sampledPoints) {
  let closestIndex = -1;
  let closestDist = Infinity;

  for (let i = 0; i < sampledPoints.length; i++) {
    const p = sampledPoints[i];
    const dist = Math.hypot(p.x - point.x, p.y - point.y);
    if (dist < closestDist) {
      closestDist = dist;
      closestIndex = i;
    }
  }

  return { index: closestIndex, distance: closestDist };
}

/**
 * Tracks how much of a sampled path a moving point has covered over time.
 *
 * Call `.update(point)` on every tracked frame; it returns whether the
 * point is currently "on" the path (within tolerance) and how far off it
 * is. Call `.getCoverage()` for a 0-100 percentage of the path covered so
 * far. Call `.reset()` when starting a new shape.
 *
 * @param sampledPoints  output of samplePath()
 * @param toleranceUnits how close (in viewBox units) counts as "on path"
 */
export function createPathCoverageTracker(sampledPoints, toleranceUnits = 5) {
  const covered = new Array(sampledPoints.length).fill(false);
  let coveredCount = 0;

  return {
    update(point) {
      if (!point || sampledPoints.length === 0) {
        return { onPath: false, distance: Infinity, index: -1 };
      }

      const { index, distance } = closestPointOnPath(point, sampledPoints);
      if (index === -1 || distance > toleranceUnits) {
        return { onPath: false, distance, index: -1 };
      }

      // Mark a small neighborhood around the closest sample as covered so
      // normal frame-to-frame motion between poll intervals doesn't leave
      // false "gaps" in an otherwise continuous trace.
      const spread = 2;
      const from = Math.max(0, index - spread);
      const to = Math.min(sampledPoints.length - 1, index + spread);
      for (let i = from; i <= to; i++) {
        if (!covered[i]) {
          covered[i] = true;
          coveredCount++;
        }
      }

      return { onPath: true, distance, index };
    },

    getCoverage() {
      return sampledPoints.length ? (coveredCount / sampledPoints.length) * 100 : 0;
    },

    reset() {
      covered.fill(false);
      coveredCount = 0;
    },
  };
}

export default { samplePath, closestPointOnPath, createPathCoverageTracker };