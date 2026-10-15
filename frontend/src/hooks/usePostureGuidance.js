// frontend/src/hooks/usePostureGuidance.js
//
// Decides whether the patient is positioned well enough to start, and tells
// them in plain words what to change. Shared by all games that use it.
//
// Return shape is unchanged for existing callers (isReady, message,
// overallStatus, flags). New: `blockedBy` (machine-readable reason) so the UI
// can show why Start is locked.
//
// Landmark coordinates are normalised 0..1 (y = 0 top, 1 bottom). "left" and
// "right" are the PERSON's left and right.
import { useMemo } from "react";

const SHOULDER_VIS_MIN = 0.3;     // below this a shoulder counts as not seen
const LEVEL_TOLERANCE = 0.12;     // max shoulder height difference
const CHEST_LOW_LIMIT = 0.92;     // chest centre lower than this = cut off at the bottom
const TOO_FAR_WIDTH = 0.12;       // shoulder span (fraction of image width) below this = too far
const TOO_CLOSE_WIDTH = 0.7;      // above this = too close
const SLOUCH_DRIFT = 0.1;         // with a calibration baseline

const blocked = (blockedBy, message, overallStatus, flags = {}) => ({
  isReady: false,
  blockedBy,
  message,
  overallStatus,
  flags,
});

export function usePostureGuidance(poseData, calibrationData) {
  return useMemo(() => {
    if (!poseData || !poseData.raw) {
      return blocked("loading", "Waiting for camera and pose detection...", "severe", { noPose: true });
    }

    const { raw, midChest } = poseData;
    const ls = raw.leftShoulder;
    const rs = raw.rightShoulder;
    const leftSeen = (ls?.visibility ?? 0) > SHOULDER_VIS_MIN;
    const rightSeen = (rs?.visibility ?? 0) > SHOULDER_VIS_MIN;

    if (!leftSeen && !rightSeen) {
      return blocked("shoulders",
        "I can't see your shoulders. Sit so your head and both shoulders are in the picture, with light on your face.",
        "severe", { shouldersHidden: true });
    }
    if (!leftSeen || !rightSeen) {
      const side = !leftSeen ? "left" : "right";
      return blocked("shoulders",
        `Your ${side} shoulder isn't visible. Move toward the centre of the picture or turn to face the camera.`,
        "severe", { shouldersHidden: true, hiddenSide: side });
    }

    const width = Math.abs(ls.x - rs.x);
    if (width < TOO_FAR_WIDTH) {
      return blocked("too_far", "You're too far from the camera. Move a little closer.", "minor", { tooFar: true });
    }
    if (width > TOO_CLOSE_WIDTH) {
      return blocked("too_close", "You're too close to the camera. Move back a little so your arms fit in the picture.", "minor", { tooClose: true });
    }

    const diff = ls.y - rs.y; // positive => left shoulder LOWER than right
    if (Math.abs(diff) > LEVEL_TOLERANCE) {
      const higher = diff > 0 ? "right" : "left";
      return blocked("level",
        `Your ${higher} shoulder is higher. Level your shoulders, or tilt the camera if the screen is angled.`,
        "minor", { unevenShoulders: true });
    }

    const baselineY = calibrationData?.baselineMidChestY;
    if (midChest) {
      if (baselineY != null) {
        if (midChest.y - baselineY > SLOUCH_DRIFT) {
          return blocked("posture", "Sit up straight.", "minor", { slouching: true });
        }
      } else if (midChest.y > CHEST_LOW_LIMIT) {
        // No calibration: the chest is at the very bottom of the picture. That
        // is a camera-framing problem, not necessarily slouching.
        return blocked("framing",
          "Your shoulders are at the bottom of the picture. Move back, or tilt the camera up, so your shoulders sit in the middle.",
          "minor", { chestLow: true });
      }
    }

    return { isReady: true, blockedBy: null, message: "Posture good, ready to start!", overallStatus: "ok", flags: {} };
  }, [poseData, calibrationData]);
}

export default usePostureGuidance;
