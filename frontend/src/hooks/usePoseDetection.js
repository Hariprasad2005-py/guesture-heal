import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * usePoseDetection.js
 * Consumes raw landmarks and exposes a clean API for game interaction.
 * Includes fallback to mouse coordinates.
 */
export function usePoseDetection(upperBodyData) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [status, setStatus] = useState('no_camera'); // 'tracking', 'lost', 'no_camera'
  const [confidence, setConfidence] = useState(0);
  const [isMouseMode, setIsMouseMode] = useState(false);

  // Smooth position updates
  const lastPos = useRef({ x: 0, y: 0 });
  const alpha = 0.3; // Smoothing factor

  useEffect(() => {
    if (!upperBodyData) {
      if (!isMouseMode) setStatus('no_camera');
      return;
    }

    const { leftWrist, rightWrist } = upperBodyData;
    
    // Choose the wrist with higher visibility/confidence
    const wrist = (leftWrist?.visibility || 0) > (rightWrist?.visibility || 0) ? leftWrist : rightWrist;
    
    if (wrist && wrist.visibility > 0.5) {
      // Map MediaPipe (0-1) to screen (0-100)
      // MediaPipe is mirrored in our setup, but X is already 0-1 from left to right in camera view
      // Since we use selfieMode: true, x=0 is the right side of the person (left side of screen)
      const targetX = wrist.x * 100;
      const targetY = wrist.y * 100;

      const smoothedX = lastPos.current.x + alpha * (targetX - lastPos.current.x);
      const smoothedY = lastPos.current.y + alpha * (targetY - lastPos.current.y);

      lastPos.current = { x: smoothedX, y: smoothedY };
      
      if (!isMouseMode) {
        setPosition({ x: smoothedX, y: smoothedY });
        setConfidence(wrist.visibility);
        setStatus('tracking');
      }
    } else if (!isMouseMode) {
      setStatus('lost');
    }
  }, [upperBodyData, isMouseMode]);

  const handleMouseMove = useCallback((e) => {
    if (isMouseMode) {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      setPosition({ x, y });
      setStatus('tracking');
      setConfidence(1.0);
    }
  }, [isMouseMode]);

  const toggleMouseMode = useCallback((enabled) => {
    setIsMouseMode(enabled);
    if (enabled) setStatus('tracking');
  }, []);

  return {
    position,
    status,
    confidence,
    isMouseMode,
    toggleMouseMode,
    handleMouseMove
  };
}
