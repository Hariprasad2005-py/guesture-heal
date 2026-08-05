// frontend/src/hooks/useHandTracking.js
import { useEffect, useRef, useState } from "react";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// MediaPipe Hands landmark indices
const INDEX_FINGERTIP = 8;
const WRIST = 0;
const SMOOTHING_ALPHA = 0.4; // lower = smoother but more visual lag; 0.3–0.5 is a good range

/**
 * Tracks one or more hands' index fingertips in normalized [0,1] video space.
 *
 * This does NOT request the camera itself — it expects `videoRef` to
 * already have an active stream (owned by useMediaPipeUpperBody), and just
 * reads frames from it the same way useFacialPainDetection does.
 *
 * BACKWARD COMPATIBILITY: `numHands` defaults to 1. `fingertip` is still
 * returned exactly as before — the first detected hand, `null` when no
 * hand is confidently detected. Every existing single-hand caller
 * (RehabSlicer, PrecisionReach, CloudReach, CatchFlex, and CanvasAir's
 * own single-hand mode) needs ZERO changes.
 *
 * NEW: pass `numHands: 2` to also get a `hands` array, where each entry
 * is `{ x, y, z, visibility, handedness }`. `handedness` is
 * "Left" | "Right" | null, and is already flipped to match the MIRRORED
 * video feed shown on screen — i.e. it matches what the patient sees,
 * the same mirroring convention already used everywhere else in this
 * codebase (`(1 - x) * 100`). MediaPipe's raw handedness label is
 * computed against the unflipped camera frame, so without this flip
 * "Left" would actually mean the patient's real right hand.
 *
 * `leftHand` / `rightHand` are convenience lookups into `hands` by that
 * (already-flipped) label. They are `null` whenever that hand isn't
 * currently detected — callers must treat null as "unknown", never
 * substitute a stale or synthetic position.
 */
export function useHandTracking({ videoRef, enabled = true, numHands = 1 } = {}) {
  const [fingertip, setFingertip] = useState(null); // {x,y,z,visibility} | null — unchanged, back-compat
  const [hands, setHands] = useState([]); // NEW — [{x,y,z,visibility,handedness}]
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);
  const smoothRef = useRef({}); // keyed by handedness (or index), holds last smoothed {x,y,z}

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
    if (!enabled || !videoRef?.current) return undefined;

    let cancelled = false;

    async function init() {
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

        const loop = () => {
          if (!runningRef.current || cancelled) return;
          const video = videoRef.current;

          if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            try {
              const result = landmarker.detectForVideo(video, performance.now());
              const landmarkSets = result?.landmarks || [];
              // NOTE: verify this key against your installed
              // @mediapipe/tasks-vision version — the HandLandmarker
              // result exposes per-hand handedness as `result.handedness`
              // (array of arrays of {categoryName, score}) as of the
              // versions this was written against. If your build differs,
              // log `result` once and adjust this line.
              const handednessSets = result?.handedness || result?.handednesses || [];

              if (landmarkSets.length > 0) {
                const nextHands = landmarkSets
                  .map((hand, i) => {
                    const tip = hand[INDEX_FINGERTIP];
                    const wrist = hand[WRIST];
                    if (!tip) return null;

                    const rawLabel = handednessSets[i]?.[0]?.categoryName || null;
                    // Flip to match the mirrored video feed (see doc comment above).
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
              } else {
                setHands([]);
                setFingertip(null);
                smoothRef.current = {}; // reset so a reappearing hand doesn't ease in from a stale position
              }
            } catch {
              // Keep the loop alive after a transient inference error; do
              // not fabricate a position.
            }
          }

          rafRef.current = requestAnimationFrame(loop);
        };

        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Hand tracking failed to initialize");
          setIsReady(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        landmarkerRef.current?.close?.();
      } catch {
        /* noop */
      }
      landmarkerRef.current = null;
    };
    // numHands is intentionally in the dependency array: switching it
    // re-initializes the landmarker. Callers should only change numHands
    // between sessions (e.g. a mode toggle on an instructions screen),
    // not mid-session, to avoid a visible re-init hiccup.
  }, [enabled, videoRef, numHands]);

  const leftHand = hands.find((h) => h.handedness === "Left") || null;
  const rightHand = hands.find((h) => h.handedness === "Right") || null;

  return { fingertip, hands, leftHand, rightHand, isReady, error };
}

export default useHandTracking;