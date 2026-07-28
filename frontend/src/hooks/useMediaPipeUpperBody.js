// frontend/src/hooks/useMediaPipeHands.js
import { useEffect, useRef, useState, useCallback } from 'react';

export const HAND_LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_FINGER_MCP: 5,
  INDEX_FINGER_PIP: 6,
  INDEX_FINGER_DIP: 7,
  INDEX_FINGER_TIP: 8,
  MIDDLE_FINGER_MCP: 9,
  MIDDLE_FINGER_PIP: 10,
  MIDDLE_FINGER_DIP: 11,
  MIDDLE_FINGER_TIP: 12,
  RING_FINGER_MCP: 13,
  RING_FINGER_PIP: 14,
  RING_FINGER_DIP: 15,
  RING_FINGER_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
};

export function useMediaPipeHands({
  enabled = true,
  onHandsUpdate,
  onError,
  maxNumHands = 1,
  modelComplexity = 1,
  minDetectionConfidence = 0.5,
  minTrackingConfidence = 0.5,
  videoRef: externalVideoRef,
} = {}) {
  const internalVideoRef = useRef(null);
  const videoRef = externalVideoRef || internalVideoRef;
  const handsRef = useRef(null);
  const cameraRef = useRef(null);
  const mountedRef = useRef(true);
  const isInitializedRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState(null);
  const [landmarks, setLandmarks] = useState(null);
  const [handedness, setHandedness] = useState(null);
  const [gesture, setGesture] = useState('none');

  // Keep the latest callbacks in refs so that a caller passing an inline
  // (non-memoized) function does NOT cause setupHands/the init effect to
  // change identity and re-run — that was tearing down and reloading the
  // whole MediaPipe model on every render (visible as repeated
  // hands_solution_packed_assets.data fetches in the Network tab).
  const onHandsUpdateRef = useRef(onHandsUpdate);
  const onErrorRef = useRef(onError);
  useEffect(() => { onHandsUpdateRef.current = onHandsUpdate; }, [onHandsUpdate]);
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

  const detectGesture = useCallback((lm) => {
    if (!lm || lm.length === 0) return 'none';

    // Check if fingers are extended
    const isExtended = (tip, pip) => tip.y < pip.y;

    const thumbTip = lm[HAND_LANDMARKS.THUMB_TIP];
    const thumbIP = lm[HAND_LANDMARKS.THUMB_IP];
    const indexTip = lm[HAND_LANDMARKS.INDEX_FINGER_TIP];
    const indexPIP = lm[HAND_LANDMARKS.INDEX_FINGER_PIP];
    const middleTip = lm[HAND_LANDMARKS.MIDDLE_FINGER_TIP];
    const middlePIP = lm[HAND_LANDMARKS.MIDDLE_FINGER_PIP];
    const ringTip = lm[HAND_LANDMARKS.RING_FINGER_TIP];
    const ringPIP = lm[HAND_LANDMARKS.RING_FINGER_PIP];
    const pinkyTip = lm[HAND_LANDMARKS.PINKY_TIP];
    const pinkyPIP = lm[HAND_LANDMARKS.PINKY_PIP];

    const thumbExtended = thumbTip.x < thumbIP.x;
    const indexExtended = isExtended(indexTip, indexPIP);
    const middleExtended = isExtended(middleTip, middlePIP);
    const ringExtended = isExtended(ringTip, ringPIP);
    const pinkyExtended = isExtended(pinkyTip, pinkyPIP);

    // Open hand: all fingers extended
    if (indexExtended && middleExtended && ringExtended && pinkyExtended && thumbExtended) {
      return 'open';
    }

    // Fist: all fingers closed
    if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return 'fist';
    }

    // Point: only index extended
    if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return 'point';
    }

    // Peace: index and middle extended
    if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
      return 'peace';
    }

    // Thumbs up
    if (thumbExtended && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return 'thumbs_up';
    }

    // Pinch: thumb and index close together
    const thumbIndexDist = Math.sqrt(
      Math.pow(thumbTip.x - indexTip.x, 2) +
      Math.pow(thumbTip.y - indexTip.y, 2)
    );
    if (thumbIndexDist < 0.05) {
      return 'pinch';
    }

    return 'none';
  }, []);

  const detectSwipe = useCallback((prevPos, currPos, dt) => {
    if (!prevPos || !currPos || dt === 0) return null;
    const dx = currPos.x - prevPos.x;
    const dy = currPos.y - prevPos.y;
    const velocity = Math.sqrt(dx * dx + dy * dy) / dt;

    if (velocity < 0.5) return null; // Too slow to be a swipe

    // Determine direction
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx > absDy * 1.5) {
      return dx > 0 ? 'right' : 'left';
    } else if (absDy > absDx * 1.5) {
      return dy > 0 ? 'down' : 'up';
    }
    return null;
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
      console.error('[useMediaPipeHands] Camera error:', err);
      let message = err.message || 'Camera access denied';
      if (err.name === 'NotReadableError') {
        message = 'Camera is already in use by another tab or application. Close other apps/tabs using the camera and reload.';
      } else if (err.name === 'NotAllowedError') {
        message = 'Camera permission was denied. Please allow camera access in your browser settings and reload.';
      } else if (err.name === 'NotFoundError') {
        message = 'No camera was found on this device.';
      }
      setError(message);
      onErrorRef.current?.(err);
      return null;
    }
  }, [videoRef]);

  const setupHands = useCallback(async () => {
    try {
      await loadScript('https://unpkg.com/@mediapipe/hands@0.4.1675469240/hands.js');
await loadScript('https://unpkg.com/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js');

      if (!mountedRef.current) return;

      const Hands = window.Hands;
      const Camera = window.Camera;

      if (!Hands || !Camera) {
        throw new Error('MediaPipe Hands modules not loaded.');
      }

      const hands = new Hands({
  locateFile: (file) =>
    `https://unpkg.com/@mediapipe/hands@0.4.1675469240/${file}`,
});

      hands.setOptions({
        maxNumHands,
        modelComplexity,
        minDetectionConfidence,
        minTrackingConfidence,
        selfieMode: true,
      });

      let prevWristPos = null;
      let lastTime = Date.now();

      hands.onResults((results) => {
        if (!mountedRef.current) return;

        const multiHandLandmarks = results.multiHandLandmarks;
        const multiHandedness = results.multiHandedness;

        if (multiHandLandmarks && multiHandLandmarks.length > 0) {
          const lm = multiHandLandmarks[0];
          setLandmarks(lm);

          // Detect gesture
          const gestureResult = detectGesture(lm);
          setGesture(gestureResult);

          // Detect swipe
          const wrist = lm[HAND_LANDMARKS.WRIST];
          const now = Date.now();
          const dt = (now - lastTime) / 1000;

          if (prevWristPos) {
            const swipeDir = detectSwipe(prevWristPos, wrist, dt);
            if (swipeDir) {
              onHandsUpdateRef.current?.({ gesture: gestureResult, swipe: swipeDir, landmarks: lm });
            }
          }

          prevWristPos = { x: wrist.x, y: wrist.y };
          lastTime = now;

          // Set handedness
          if (multiHandedness && multiHandedness.length > 0) {
            setHandedness(multiHandedness[0].label);
          }

          onHandsUpdateRef.current?.({ gesture: gestureResult, landmarks: lm, handedness: multiHandedness?.[0]?.label });
        } else {
          setLandmarks(null);
          setGesture('none');
        }
      });

      handsRef.current = hands;

      if (videoRef.current) {
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (!mountedRef.current || !handsRef.current || !videoRef.current) return;
            try {
              await handsRef.current.send({ image: videoRef.current });
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
      console.error('[useMediaPipeHands] Setup error:', err);
      setError(err.message || 'Failed to initialize hand tracking');
      onErrorRef.current?.(err);
      setIsLoading(false);
      return false;
    }
    // NOTE: onHandsUpdate/onError intentionally excluded — they're read via
    // refs (onHandsUpdateRef/onErrorRef) above so that passing a new inline
    // function each render does not tear down and reload the model.
  }, [loadScript, maxNumHands, modelComplexity, minDetectionConfidence, minTrackingConfidence, videoRef, detectGesture, detectSwipe]);

  useEffect(() => {
    if (!enabled || isInitializedRef.current) return;
    isInitializedRef.current = true;
    mountedRef.current = true;

    const init = async () => {
      // NOTE: we intentionally do NOT call initCamera() here. MediaPipe's own
      // Camera utility (created inside setupHands, via `new Camera(videoRef.current, ...)`)
      // calls getUserMedia() itself. Calling getUserMedia twice on the same
      // <video> element causes the second call to silently hang forever with
      // no error — which is what was causing the infinite "Loading..." state.
      const setupTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Hand-tracking model setup timed out. This usually means MediaPipe could not fetch its model files from the CDN — check network access to unpkg.com.')), 15000)
      );
      try {
        await Promise.race([setupHands(), setupTimeout]);
      } catch (err) {
        console.error('[useMediaPipeHands] Setup timeout:', err);
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
      if (handsRef.current) {
        try { handsRef.current.close(); } catch (_) {}
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [enabled, initCamera, setupHands]);

  return {
    videoRef,
    isLoading,
    isActive,
    error,
    landmarks,
    handedness,
    gesture,
    getLandmark: (idx) => landmarks?.[idx] || null,
  };
}