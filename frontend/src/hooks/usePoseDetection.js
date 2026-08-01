// frontend/src/hooks/usePoseDetection.js
import { useEffect, useRef, useState, useCallback } from 'react';

export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
};

export function useMediaPipePose({
  enabled = true,
  onPoseUpdate,
  onError,
  modelComplexity = 1,
  smoothLandmarks = true,
  minDetectionConfidence = 0.5,
  minTrackingConfidence = 0.5,
  videoRef: externalVideoRef,
  silent = false, // If true, avoids setLandmarks/setKeypoints state updates
} = {}) {
  const internalVideoRef = useRef(null);
  const videoRef = externalVideoRef || internalVideoRef;
  const poseRef = useRef(null);
  const cameraRef = useRef(null);
  const mountedRef = useRef(true);

  const [isLoading, setIsLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState(null);
  const [landmarks, setLandmarks] = useState(null);
  const [keypoints, setKeypoints] = useState(null);

  // Keep the latest callbacks in refs so an inline (non-memoized) function
  // passed by the caller doesn't change setupPose's identity and re-trigger
  // the init effect — that was tearing down and reloading the whole
  // MediaPipe Pose model on every render.
  const onPoseUpdateRef = useRef(onPoseUpdate);
  const onErrorRef = useRef(onError);
  useEffect(() => { onPoseUpdateRef.current = onPoseUpdate; }, [onPoseUpdate]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const loadScript = useCallback((src) => {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timed out loading script (check network/CDN access): ${src}`));
      }, 10000);
      const script = document.createElement('script');
      script.src = src;
      script.crossOrigin = 'anonymous';
      script.async = true;
      script.onload = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to load: ${src}`));
      };
      document.head.appendChild(script);
    });
  }, []);

  const extractKeypoints = useCallback((lm, video) => {
    const w = video?.videoWidth || 640;
    const h = video?.videoHeight || 480;

    const toPx = (idx) => {
      if (!lm[idx]) return null;
      return {
        x: (1 - lm[idx].x) * w,
        y: lm[idx].y * h,
        z: lm[idx].z,
        visibility: lm[idx].visibility || 1,
        visible: (lm[idx].visibility || 1) > 0.4,
      };
    };

    return {
      nose: toPx(POSE_LANDMARKS.NOSE),
      leftEye: toPx(POSE_LANDMARKS.LEFT_EYE),
      rightEye: toPx(POSE_LANDMARKS.RIGHT_EYE),
      leftShoulder: toPx(POSE_LANDMARKS.LEFT_SHOULDER),
      rightShoulder: toPx(POSE_LANDMARKS.RIGHT_SHOULDER),
      leftElbow: toPx(POSE_LANDMARKS.LEFT_ELBOW),
      rightElbow: toPx(POSE_LANDMARKS.RIGHT_ELBOW),
      leftWrist: toPx(POSE_LANDMARKS.LEFT_WRIST),
      rightWrist: toPx(POSE_LANDMARKS.RIGHT_WRIST),
      leftHip: toPx(POSE_LANDMARKS.LEFT_HIP),
      rightHip: toPx(POSE_LANDMARKS.RIGHT_HIP),
      leftKnee: toPx(POSE_LANDMARKS.LEFT_KNEE),
      rightKnee: toPx(POSE_LANDMARKS.RIGHT_KNEE),
      leftAnkle: toPx(POSE_LANDMARKS.LEFT_ANKLE),
      rightAnkle: toPx(POSE_LANDMARKS.RIGHT_ANKLE),
    };
  }, []);

  // FIX: setupPose now takes an `isCancelled` check and calls it after every
  // await, plus immediately after creating the Pose/Camera instances. Root
  // cause of the bug this replaces: React.StrictMode runs this effect's
  // cleanup SYNCHRONOUSLY while init() is still mid-await (loading scripts).
  // The old code's `isInitializedRef` guard didn't help, because cleanup
  // reset it to false before the in-flight init() had assigned poseRef/
  // cameraRef — so cleanup found nothing to stop, a second mount started a
  // second full init (second getUserMedia call, second Pose instance,
  // second Camera loop), and the FIRST mount's init eventually finished too,
  // leaving two live camera+pose pipelines both calling pose.send() on every
  // frame forever. That's what produced ~270 console errors and single-digit
  // FPS. Fix: a per-invocation `cancelled` flag, not a shared ref, checked
  // at every resumption point, with immediate teardown of anything created
  // after cancellation was signalled.
  const setupPose = useCallback(async (isCancelled) => {
    try {
      await loadScript('https://unpkg.com/@mediapipe/pose@0.5.1675469404/pose.js');
      if (isCancelled()) return false;
      await loadScript('https://unpkg.com/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js');
      if (isCancelled()) return false;

      const Pose = window.Pose;
      const Camera = window.Camera;

      if (!Pose || !Camera) {
        throw new Error('MediaPipe Pose modules not loaded.');
      }

      const pose = new Pose({
        locateFile: (file) =>
          `https://unpkg.com/@mediapipe/pose@0.5.1675469404/${file}`,
      });

      if (isCancelled()) {
        try { pose.close(); } catch (_) {}
        return false;
      }

      pose.setOptions({
        modelComplexity,
        smoothLandmarks,
        minDetectionConfidence,
        minTrackingConfidence,
        selfieMode: true,
      });

      pose.onResults((results) => {
        if (isCancelled() || !mountedRef.current) return;
        if (results.poseLandmarks) {
          const lm = results.poseLandmarks;
          if (!silent) {
            setLandmarks(lm);
          }
          const kp = extractKeypoints(lm, videoRef.current);
          if (!silent) {
            setKeypoints(kp);
          }
          onPoseUpdateRef.current?.(kp, lm);
        }
      });

      poseRef.current = pose;

      if (videoRef.current) {
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (isCancelled() || !mountedRef.current || !poseRef.current || !videoRef.current) return;
            try {
              await poseRef.current.send({ image: videoRef.current });
            } catch (_) {
              // Silently handle frame drops
            }
          },
          width: 640,
          height: 480,
        });

        await camera.start();

        if (isCancelled()) {
          // This mount was cleaned up while the camera was starting —
          // stop it immediately instead of leaving it running unassigned.
          try { camera.stop(); } catch (_) {}
          try { pose.close(); } catch (_) {}
          if (videoRef.current?.srcObject) {
            videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
            videoRef.current.srcObject = null;
          }
          return false;
        }

        cameraRef.current = camera;
        setIsActive(true);
      }

      setIsLoading(false);
      return true;
    } catch (err) {
      if (isCancelled()) return false;
      console.error('[useMediaPipePose] Setup error:', err);
      setError(err.message || 'Failed to initialize pose tracking');
      onErrorRef.current?.(err);
      setIsLoading(false);
      return false;
    }
    // NOTE: onPoseUpdate/onError intentionally excluded — they're read via
    // refs (onPoseUpdateRef/onErrorRef) above so passing a new inline
    // function each render does not tear down and reload the model.
  }, [loadScript, modelComplexity, smoothLandmarks, minDetectionConfidence, minTrackingConfidence, videoRef, silent, extractKeypoints]);

  const calibrate = useCallback(() => {
    return new Promise((resolve) => {
      // Simple calibration: wait for stable landmarks
      let samples = [];
      const maxSamples = 30;
      const checkInterval = setInterval(() => {
        if (keypoints && keypoints.leftShoulder?.visible) {
          samples.push({
            leftShoulder: { ...keypoints.leftShoulder },
            rightShoulder: { ...keypoints.rightShoulder },
            leftWrist: { ...keypoints.leftWrist },
            rightWrist: { ...keypoints.rightWrist },
          });
          if (samples.length >= maxSamples) {
            clearInterval(checkInterval);
            const avg = (key) => {
              const values = samples.map((s) => s[key]);
              return {
                x: values.reduce((sum, v) => sum + v.x, 0) / values.length,
                y: values.reduce((sum, v) => sum + v.y, 0) / values.length,
                z: values.reduce((sum, v) => sum + v.z, 0) / values.length,
                visibility: values.reduce((sum, v) => sum + v.visibility, 0) / values.length,
                visible: true,
              };
            };
            resolve({
              leftShoulder: avg('leftShoulder'),
              rightShoulder: avg('rightShoulder'),
              leftWrist: avg('leftWrist'),
              rightWrist: avg('rightWrist'),
            });
          }
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        if (samples.length > 5) {
          const avg = (key) => {
            const values = samples.map((s) => s[key]);
            return {
              x: values.reduce((sum, v) => sum + v.x, 0) / values.length,
              y: values.reduce((sum, v) => sum + v.y, 0) / values.length,
              z: values.reduce((sum, v) => sum + v.z, 0) / values.length,
              visibility: values.reduce((sum, v) => sum + v.visibility, 0) / values.length,
              visible: true,
            };
          };
          resolve({
            leftShoulder: avg('leftShoulder'),
            rightShoulder: avg('rightShoulder'),
            leftWrist: avg('leftWrist'),
            rightWrist: avg('rightWrist'),
          });
        } else {
          resolve(null);
        }
      }, 5000);
    });
  }, [keypoints]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const isCancelled = () => cancelled;
    mountedRef.current = true;

    const init = async () => {
      // Development-time mock support: if a mock provider is present, use
      // it instead of initializing the real MediaPipe pose model.
      const mock = typeof window !== 'undefined' && window.__mockMediaPipe;
      if (import.meta.env.DEV && mock && typeof mock.getCurrent === 'function') {
        setIsLoading(false);
        setIsActive(true);
        const fps = mock.frameRate || 30;
        const interval = Math.max(16, Math.round(1000 / fps));
        let lastTime = Date.now();
        const timer = setInterval(() => {
          if (isCancelled() || !mountedRef.current) return clearInterval(timer);
          const lm = mock.getCurrent();
          const now = Date.now();
          const dt = (now - lastTime) / 1000;
          lastTime = now;
          if (lm && lm.length > 0) {
            if (!silent) setLandmarks(lm);
            const kp = extractKeypoints(lm, videoRef.current);
            if (!silent) setKeypoints(kp);
            onPoseUpdateRef.current?.(kp, lm);
          } else {
            if (!silent) { setLandmarks(null); setKeypoints(null); }
          }
        }, interval);
        return;
      }

    const setupTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Pose-tracking model setup timed out. This usually means MediaPipe could not fetch its model files from the CDN.')), 15000)
      );
      try {
        await Promise.race([setupPose(isCancelled), setupTimeout]);
      } catch (err) {
        if (isCancelled()) return;
        console.error('[useMediaPipePose] Setup timeout:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (cameraRef.current) {
        try { cameraRef.current.stop(); } catch (_) {}
        cameraRef.current = null;
      }
      if (poseRef.current) {
        try { poseRef.current.close(); } catch (_) {}
        poseRef.current = null;
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [enabled, setupPose]);

  return {
    videoRef,
    isLoading,
    isActive,
    error,
    landmarks,
    keypoints,
    calibrate,
    getLandmark: (idx) => landmarks?.[idx] || null,
    getKeypoint: (name) => keypoints?.[name] || null,
  };
}

// Utility functions for pose calculations
export function calculateAngle(a, b, c) {
  if (!a || !b || !c) return 0;
  const radians = Math.atan2(c.y - b.y, c.x - b.x) -
                  Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return Math.round(angle);
}

export function calculateDistance(a, b) {
  if (!a || !b) return 0;
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

export function calculateVelocity(prev, curr, dt) {
  if (!prev || !curr || dt === 0) return 0;
  return calculateDistance(prev, curr) / dt;
}