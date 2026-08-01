// frontend/src/hooks/useMediaPipeUpperBody.js
//
// PATCHED: added an opt-in `silent` option (default false, so existing
// callers are unaffected) that skips setLandmarks/setGesture/setHandedness
// React state updates on every hand-tracking frame — mirroring the
// `silent` option already present in usePoseDetection.js. Without this,
// every hand-tracking game re-renders on every MediaPipe Hands result,
// which is a live, currently-reproducing source of dropped frames.
// Callers that want the ref-based, zero-re-render path should pass
// `silent: true` and read data via onHandsUpdate into a ref, same pattern
// as usePoseDetection.js.
//
// PATCHED (2): setupHands now takes an `isCancelled` check and calls it
// after every await, plus immediately after creating the Hands/Camera
// instances — same fix already applied to usePoseDetection.js's
// setupPose. Root cause this replaces: React.StrictMode runs this effect's
// cleanup SYNCHRONOUSLY while init() is still mid-await (loading scripts).
// The old `isInitializedRef` guard didn't help, because cleanup reset it to
// false before the in-flight init() had assigned handsRef/cameraRef — so
// cleanup found nothing to stop, a second mount started a second full init
// (second getUserMedia call, second Hands instance, second Camera loop),
// and the FIRST mount's init eventually finished too, leaving two live
// camera+hands pipelines both calling hands.send() on every frame forever.
// Fix: a per-invocation `cancelled` flag, not a shared ref, checked at
// every resumption point, with immediate teardown of anything created
// after cancellation was signalled — identical shape to usePoseDetection.
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
  silent = false, // if true, avoids setLandmarks/setGesture/setHandedness state updates
} = {}) {
  const internalVideoRef = useRef(null);
  const videoRef = externalVideoRef || internalVideoRef;
  const handsRef = useRef(null);
  const cameraRef = useRef(null);
  const mountedRef = useRef(true);

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

    if (indexExtended && middleExtended && ringExtended && pinkyExtended && thumbExtended) {
      return 'open';
    }
    if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return 'fist';
    }
    if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return 'point';
    }
    if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
      return 'peace';
    }
    if (thumbExtended && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return 'thumbs_up';
    }

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

    if (velocity < 0.5) return null;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx > absDy * 1.5) {
      return dx > 0 ? 'right' : 'left';
    } else if (absDy > absDx * 1.5) {
      return dy > 0 ? 'down' : 'up';
    }
    return null;
  }, []);

  // NOTE: MediaPipe's own Camera utility (created below, via
  // `new Camera(videoRef.current, ...)`) calls getUserMedia() itself.
  // There is intentionally no separate initCamera()/getUserMedia() call
  // in this hook — calling getUserMedia twice on the same <video> element
  // causes the second call to silently hang forever with no error, which
  // previously caused an infinite "Loading..." state.

  const setupHands = useCallback(async (isCancelled) => {
    try {
      await loadScript('https://unpkg.com/@mediapipe/hands@0.4.1675469240/hands.js');
      if (isCancelled()) return false;
      await loadScript('https://unpkg.com/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js');
      if (isCancelled()) return false;

      const Hands = window.Hands;
      const Camera = window.Camera;

      if (!Hands || !Camera) {
        throw new Error('MediaPipe Hands modules not loaded.');
      }

      const hands = new Hands({
        locateFile: (file) =>
          `https://unpkg.com/@mediapipe/hands@0.4.1675469240/${file}`,
      });

      if (isCancelled()) {
        try { hands.close(); } catch (_) {}
        return false;
      }

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
        if (isCancelled() || !mountedRef.current) return;

        const multiHandLandmarks = results.multiHandLandmarks;
        const multiHandedness = results.multiHandedness;

        if (multiHandLandmarks && multiHandLandmarks.length > 0) {
          const lm = multiHandLandmarks[0];
          if (!silent) setLandmarks(lm);

          const gestureResult = detectGesture(lm);
          if (!silent) setGesture(gestureResult);

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

          if (multiHandedness && multiHandedness.length > 0 && !silent) {
            setHandedness(multiHandedness[0].label);
          }

          onHandsUpdateRef.current?.({ gesture: gestureResult, landmarks: lm, handedness: multiHandedness?.[0]?.label });
        } else {
          if (!silent) {
            setLandmarks(null);
            setGesture('none');
          }
        }
      });

      handsRef.current = hands;

      if (videoRef.current) {
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (isCancelled() || !mountedRef.current || !handsRef.current || !videoRef.current) return;
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

        if (isCancelled()) {
          // This mount was cleaned up while the camera was starting —
          // stop it immediately instead of leaving it running unassigned.
          try { camera.stop(); } catch (_) {}
          try { hands.close(); } catch (_) {}
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
      console.error('[useMediaPipeHands] Setup error:', err);
      setError(err.message || 'Failed to initialize hand tracking');
      onErrorRef.current?.(err);
      setIsLoading(false);
      return false;
    }
    // NOTE: onHandsUpdate/onError intentionally excluded — read via refs above.
  }, [loadScript, maxNumHands, modelComplexity, minDetectionConfidence, minTrackingConfidence, videoRef, detectGesture, detectSwipe, silent]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const isCancelled = () => cancelled;
    mountedRef.current = true;

    const init = async () => {
      // Development-time mock support: if a mock provider is present, use
      // it instead of initializing the real MediaPipe model. This enables
      // deterministic, hardware-free testing in headless environments.
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
            const gestureResult = detectGesture(lm);
            if (!silent) setGesture(gestureResult);
            onHandsUpdateRef.current?.({ gesture: gestureResult, landmarks: lm });
          } else {
            if (!silent) { setLandmarks(null); setGesture('none'); }
          }
        }, interval);
        return;
      }

      const setupTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Hand-tracking model setup timed out. This usually means MediaPipe could not fetch its model files from the CDN — check network access to unpkg.com.')), 15000)
      );
      try {
        await Promise.race([setupHands(isCancelled), setupTimeout]);
      } catch (err) {
        if (isCancelled()) return;
        console.error('[useMediaPipeHands] Setup timeout:', err);
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
      if (handsRef.current) {
        try { handsRef.current.close(); } catch (_) {}
        handsRef.current = null;
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [enabled, setupHands]);

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