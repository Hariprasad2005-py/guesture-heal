// frontend/src/hooks/usePostureGuidance.js
import { useMemo } from "react";

export function usePostureGuidance(poseData, calibrationData) {
  return useMemo(() => {
    console.log("[usePostureGuidance] 📊 poseData received:", poseData ? "✅ has data" : "❌ null");

    if (!poseData) {
      return {
        isReady: false,
        message: "Waiting for camera and pose detection...",
        overallStatus: "severe",
        flags: { noPose: true },
      };
    }

    const { raw, midChest } = poseData;
    
    if (!raw) {
      return {
        isReady: false,
        message: "Waiting for pose data...",
        overallStatus: "severe",
        flags: { noPose: true },
      };
    }

    const leftVisible = raw.leftShoulder?.visibility > 0.3;
    const rightVisible = raw.rightShoulder?.visibility > 0.3;
    const shouldersVisible = leftVisible && rightVisible;
    const flags = {};

    if (!shouldersVisible) {
      flags.shouldersHidden = true;
      return {
        isReady: false,
        message: "Adjust position to show your shoulders fully",
        overallStatus: "severe",
        flags,
      };
    }

    if (Math.abs(raw.leftShoulder.y - raw.rightShoulder.y) > 0.12) {
      flags.unevenShoulders = true;
      return {
        isReady: false,
        message: "Level your shoulders",
        overallStatus: "minor",
        flags,
      };
    }

    const baselineY = calibrationData?.baselineMidChestY;
    const slouchDrift = baselineY != null ? midChest.y - baselineY : null;
    const isSlouching = slouchDrift != null ? slouchDrift > 0.1 : midChest.y > 0.92;

    if (midChest && isSlouching) {
      flags.slouching = true;
      return {
        isReady: false,
        message: "Sit up straight",
        overallStatus: "minor",
        flags,
      };
    }

    return {
      isReady: true,
      message: "Posture good, ready to start!",
      overallStatus: "ok",
      flags,
    };
  }, [poseData, calibrationData]);
}

// ✅ ADD DEFAULT EXPORT
export default usePostureGuidance;