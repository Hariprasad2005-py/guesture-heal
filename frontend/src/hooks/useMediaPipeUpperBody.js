import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useMediaPipeUpperBody.js
 * Initializes MediaPipe Pose on the webcam video stream.
 * Returns raw upper-body landmarks each frame.
 */
export function useMediaPipeUpperBody({
  enabled = true,
  onPoseUpdate,
  onError,
  videoRef: externalVideoRef,
} = {}) {
  const internalVideoRef = useRef(null);
  const videoRef = externalVideoRef || internalVideoRef;
  const poseRef = useRef(null);
  const cameraRef = useRef(null);
  const mountedRef = useRef(true);

  const [isLoading, setIsLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState(null);

  const onPoseUpdateRef = useRef(onPoseUpdate);
  const onErrorRef = useRef(onError);
  useEffect(() => { onPoseUpdateRef.current = onPoseUpdate; }, [onPoseUpdate]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const loadScript = useCallback((src) => {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.crossOrigin = 'anonymous';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load: ${src}`));
      document.head.appendChild(script);
    });
  }, []);

  const setupPose = useCallback(async (isCancelled) => {
    try {
      await loadScript('https://unpkg.com/@mediapipe/pose@0.5.1675469404/pose.js');
      if (isCancelled()) return false;
      await loadScript('https://unpkg.com/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js');
      if (isCancelled()) return false;

      const Pose = window.Pose;
      const Camera = window.Camera;

      if (!Pose || !Camera) throw new Error('MediaPipe Pose modules not loaded.');

      const pose = new Pose({
        locateFile: (file) => `https://unpkg.com/@mediapipe/pose@0.5.1675469404/${file}`,
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        selfieMode: true,
      });

      pose.onResults((results) => {
        if (isCancelled() || !mountedRef.current || !results.poseLandmarks) return;
        
        // Extract upper body landmarks
        // 11: L shoulder, 12: R shoulder, 13: L elbow, 14: R elbow, 15: L wrist, 16: R wrist
        // Midpoint of shoulders as chest/torso midpoint
        const lm = results.poseLandmarks;
        const upperBody = {
          leftShoulder: lm[11],
          rightShoulder: lm[12],
          leftElbow: lm[13],
          rightElbow: lm[14],
          leftWrist: lm[15],
          rightWrist: lm[16],
          nose: lm[0],
          leftHip: lm[23],
          rightHip: lm[24],
          midChest: {
            x: (lm[11].x + lm[12].x) / 2,
            y: (lm[11].y + lm[12].y) / 2,
            z: (lm[11].z + lm[12].z) / 2,
            visibility: (lm[11].visibility + lm[12].visibility) / 2
          },
          raw: lm
        };
        
        onPoseUpdateRef.current?.(upperBody);
      });

      poseRef.current = pose;

      if (videoRef.current) {
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (isCancelled() || !mountedRef.current || !poseRef.current || !videoRef.current) return;
            try {
              await poseRef.current.send({ image: videoRef.current });
            } catch (_) {}
          },
          width: 640,
          height: 480,
        });
        await camera.start();
        cameraRef.current = camera;
        setIsActive(true);
      }

      setIsLoading(false);
      return true;
    } catch (err) {
      if (isCancelled()) return false;
      setError(err.message);
      onErrorRef.current?.(err);
      setIsLoading(false);
      return false;
    }
  }, [loadScript, videoRef]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    mountedRef.current = true;
    setupPose(isCancelled);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (cameraRef.current) cameraRef.current.stop();
      if (poseRef.current) poseRef.current.close();
    };
  }, [enabled, setupPose]);

  return { videoRef, isLoading, isActive, error };
}
