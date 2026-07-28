// frontend/src/hooks/useMediaPipePose.js
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
} = {}) {
  const internalVideoRef = useRef(null);
  const videoRef = externalVideoRef || internalVideoRef;
  const poseRef = useRef(null);
  const cameraRef = useRef(null);
  const mountedRef = useRef(true);
  const isInitializedRef = useRef(false);

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

  const initCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      return stream;
    } catch (err) {
      console.error('[useMediaPipePose] Camera error:', err);
      setError(err.message || 'Camera access denied');
      onErrorRef.current?.(err);
      return null;
    }
  }, [videoRef]);

  const setupPose = useCallback(async () => {
    try {
      await loadScript('https://unpkg.com/@mediapipe/pose@0.5.1675469404/pose.js');
      await loadScript('https://unpkg.com/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js');

      if (!mountedRef.current) return;

      const Pose = window.Pose;
      const Camera = window.Camera;

      if (!Pose || !Camera) {
        throw new Error('MediaPipe Pose modules not loaded.');
      }

      const pose = new Pose({
        locateFile: (file) =>
          `https://unpkg.com/@mediapipe/pose@0.5.1675469404/${file}`,
      });

      pose.setOptions({
        modelComplexity,
        smoothLandmarks,
        minDetectionConfidence,
        minTrackingConfidence,
        selfieMode: true,
      });

      pose.onResults((results) => {
        if (!mountedRef.current) return;
        if (results.poseLandmarks) {
          const lm = results.poseLandmarks;
          setLandmarks(lm);
          const kp = extractKeypoints(lm, videoRef.current);
          setKeypoints(kp);
          onPoseUpdateRef.current?.(kp, lm);
        }
      });

      poseRef.current = pose;

      // Start camera if we have a video element
      if (videoRef.current) {
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (!mountedRef.current || !poseRef.current || !videoRef.current) return;
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
        cameraRef.current = camera;
        setIsActive(true);
      }

      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('[useMediaPipePose] Setup error:', err);
      setError(err.message || 'Failed to initialize pose tracking');
      onErrorRef.current?.(err);
      setIsLoading(false);
      return false;
    }
    // NOTE: onPoseUpdate/onError intentionally excluded — they're read via
    // refs (onPoseUpdateRef/onErrorRef) above so passing a new inline
    // function each render does not tear down and reload the model.
  }, [loadScript, modelComplexity, smoothLandmarks, minDetectionConfidence, minTrackingConfidence, videoRef]);

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
            // Average the samples for calibration
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

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (samples.length > 5) {
          // Use whatever samples we have
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
    if (!enabled || isInitializedRef.current) return;
    isInitializedRef.current = true;
    mountedRef.current = true;

    const init = async () => {
      // NOTE: we intentionally do NOT call initCamera() here. MediaPipe's own
      // Camera utility (created inside setupPose, via `new Camera(videoRef.current, ...)`)
      // calls getUserMedia() itself. Calling getUserMedia twice on the same
      // <video> element causes the second call to silently hang forever with
      // no error — producing an infinite "Loading..." state. (Same bug that
      // was already fixed in useMediaPipeUpperBody.js.)
      const setupTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Pose-tracking model setup timed out. This usually means MediaPipe could not fetch its model files from the CDN.')), 15000)
      );
      try {
        await Promise.race([setupPose(), setupTimeout]);
      } catch (err) {
        console.error('[useMediaPipePose] Setup timeout:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      isInitializedRef.current = false;
      if (cameraRef.current) {
        try { cameraRef.current.stop(); } catch (_) {}
      }
      if (poseRef.current) {
        try { poseRef.current.close(); } catch (_) {}
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [enabled, initCamera, setupPose]);

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