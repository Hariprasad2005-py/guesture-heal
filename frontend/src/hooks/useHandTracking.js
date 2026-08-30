// frontend/src/hooks/useHandTracking.js
//
// UNCHANGED tracking implementation. The only change from the original is
// that per-frame console logging is now gated behind an explicit `debug`
// flag (default false), so a normal "no hand visible right now" frame is
// never logged as if it were an error, and production consoles stay quiet.

import { useEffect, useRef, useState } from "react";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const INDEX_FINGERTIP = 8;
const WRIST = 0;
const SMOOTHING_ALPHA = 0.4;
const DEBUG_LOG_EVERY_N_FRAMES = 120; // only used when debug === true

export function useHandTracking({ videoRef, enabled = true, numHands = 1, debug = false } = {}) {
  const [fingertip, setFingertip] = useState(null);
  const [hands, setHands] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);
  const smoothRef = useRef({});
  const initAttemptsRef = useRef(0);
  const maxInitAttempts = 10;
  const frameCountRef = useRef(0);
  const noHandFramesRef = useRef(0);
  const hadHandRef = useRef(false); // tracks state transitions, not per-frame state

  function log(...args) {
    if (debug) console.log(...args);
  }

  function smooth(key, raw) {
    const prev = smoothRef.current[key];
    if (!prev) {
      smoothRef.current[key] = { x: raw.x, y: raw.y, z: raw.z };
      return raw;
    }
    const next = {
      x: prev.x + SMOOTHING_ALPHA * (raw.x - prev.x),
      y: prev.y + SMOOTHING_ALPHA * (raw.y - prev.y),
      z: prev.z + SMOOTHING_ALPHA * (raw.z - prev.z),
    };
    smoothRef.current[key] = next;
    return next;
  }

  useEffect(() => {
    if (!enabled) {
      log("[HandTracking] Disabled");
      return undefined;
    }

    let cancelled = false;
    let initTimeout = null;

    const initHandTracking = async () => {
      const video = videoRef?.current;
      if (!video) {
        if (initAttemptsRef.current < maxInitAttempts) {
          initAttemptsRef.current += 1;
          initTimeout = setTimeout(initHandTracking, 500);
        } else {
          console.warn("[HandTracking] Max init attempts reached, video not available");
          setError("Video element not available");
        }
        return;
      }

      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        if (initAttemptsRef.current < maxInitAttempts) {
          initAttemptsRef.current += 1;
          initTimeout = setTimeout(initHandTracking, 500);
        } else {
          console.warn("[HandTracking] Max init attempts reached, video metadata not loaded");
          setError("Video metadata not available");
        }
        return;
      }

      if (!video.srcObject && !video.src) {
        if (initAttemptsRef.current < maxInitAttempts) {
          initAttemptsRef.current += 1;
          initTimeout = setTimeout(initHandTracking, 500);
        } else {
          console.warn("[HandTracking] Max init attempts reached, no video source");
          setError("No video source available");
        }
        return;
      }

      log("[HandTracking] Video ready, initializing...", {
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        srcObject: !!video.srcObject,
      });

      try {
        const vision = await import("@mediapipe/tasks-vision");
        const { HandLandmarker, FilesetResolver } = vision;

        const resolver = await FilesetResolver.forVisionTasks(WASM_URL);

        const landmarker = await HandLandmarker.createFromOptions(resolver, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands,
        });

        if (cancelled) {
          landmarker.close?.();
          return;
        }

        landmarkerRef.current = landmarker;
        runningRef.current = true;
        setIsReady(true);
        setError(null);
        log("[HandTracking] Successfully initialized");

        const loop = () => {
          if (!runningRef.current || cancelled) return;
          const video = videoRef?.current;

          if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            try {
              frameCountRef.current += 1;

              if (debug && frameCountRef.current % DEBUG_LOG_EVERY_N_FRAMES === 0) {
                log("[HandTracking] Frame", frameCountRef.current, "still running");
              }

              const result = landmarker.detectForVideo(video, performance.now());
              const landmarkSets = result?.landmarks || [];
              const handednessSets = result?.handedness || result?.handednesses || [];

              // An empty result just means "no hand visible this frame" — this
              // is a normal, expected state, not an error. It is only logged
              // (in debug mode) on the transition into/out of that state.
              if (landmarkSets.length > 0) {
                noHandFramesRef.current = 0;

                const nextHands = landmarkSets
                  .map((hand, i) => {
                    const tip = hand[INDEX_FINGERTIP];
                    const wrist = hand[WRIST];
                    if (!tip) return null;

                    const rawLabel = handednessSets[i]?.[0]?.categoryName || null;
                    const handedness =
                      rawLabel === "Left" ? "Right" : rawLabel === "Right" ? "Left" : null;

                    const smoothed = smooth(handedness || `idx-${i}`, {
                      x: tip.x,
                      y: tip.y,
                      z: tip.z ?? 0,
                    });

                    return {
                      x: smoothed.x,
                      y: smoothed.y,
                      z: smoothed.z,
                      visibility: wrist ? 1 : 0.5,
                      handedness,
                    };
                  })
                  .filter(Boolean);

                setHands(nextHands);
                setFingertip(nextHands[0] || null);

                if (!hadHandRef.current) {
                  hadHandRef.current = true;
                  log("[HandTracking] Hand detected");
                }
              } else {
                noHandFramesRef.current += 1;
                if (hadHandRef.current) {
                  hadHandRef.current = false;
                  log("[HandTracking] Hand lost");
                }
                setHands((prev) => (prev.length > 0 ? [] : prev));
                setFingertip((prev) => (prev !== null ? null : prev));
                if (noHandFramesRef.current === 1) {
                  smoothRef.current = {};
                }
              }
            } catch (err) {
              // Real errors are always logged, regardless of debug flag.
              console.warn("[HandTracking] detectForVideo error:", err);
            }
          }

          rafRef.current = requestAnimationFrame(loop);
        };

        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        console.error("[HandTracking] Initialization error:", err);
        if (!cancelled) {
          setError(err?.message || "Hand tracking failed to initialize");
          setIsReady(false);
          if (initAttemptsRef.current < maxInitAttempts) {
            initAttemptsRef.current += 1;
            initTimeout = setTimeout(initHandTracking, 1000);
          }
        }
      }
    };

    initAttemptsRef.current = 0;
    initHandTracking();

    return () => {
      cancelled = true;
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (initTimeout) clearTimeout(initTimeout);
      try {
        landmarkerRef.current?.close?.();
      } catch {
        /* noop */
      }
      landmarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, videoRef, numHands, debug]);

  const leftHand = hands.find((h) => h.handedness === "Left") || null;
  const rightHand = hands.find((h) => h.handedness === "Right") || null;

  return { fingertip, hands, leftHand, rightHand, isReady, error };
}

export default useHandTracking;