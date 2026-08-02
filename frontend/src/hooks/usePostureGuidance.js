import { useState, useEffect } from 'react';

/**
 * usePostureGuidance.js
 * Monitors posture and provides feedback based on raw upper body landmarks.
 */
export function usePostureGuidance(upperBodyData) {
  const [guidance, setGuidance] = useState({
    isReady: false,
    message: 'Initializing...',
    flags: {
      shouldersLevel: true,
      seatedStraight: true,
      inFrame: false
    }
  });

  useEffect(() => {
    if (!upperBodyData || !upperBodyData.leftShoulder || !upperBodyData.rightShoulder) {
      setGuidance(prev => ({ ...prev, isReady: false, message: 'Please step into the camera view.' }));
      return;
    }

    const { leftShoulder, rightShoulder, midChest } = upperBodyData;
    
    // Check if landmarks are visible enough
    const inFrame = (leftShoulder.visibility || 0) > 0.5 && (rightShoulder.visibility || 0) > 0.5;
    
    // Check if shoulders are level (y-coordinates should be close)
    const shoulderDiff = Math.abs(leftShoulder.y - rightShoulder.y);
    const isLevel = shoulderDiff < 0.05;
    
    // Check if seated straight (chest not too low in frame)
    const seatedStraight = midChest.y < 0.8;
    
    let message = 'Ready to start!';
    let isReady = true;

    if (!inFrame) {
      message = 'Adjust position to show your shoulders.';
      isReady = false;
    } else if (!isLevel) {
      message = 'Please level your shoulders.';
      isReady = false;
    } else if (!seatedStraight) {
      message = 'Sit up straight.';
      isReady = false;
    }

    setGuidance({
      isReady,
      message,
      flags: {
        shouldersLevel: isLevel,
        seatedStraight,
        inFrame
      }
    });
  }, [upperBodyData]);

  return guidance;
}
