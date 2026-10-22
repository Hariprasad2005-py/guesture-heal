// Full-hand tracking (all 21 points per hand) for the hand games.
// Unlike useHandTracking (fingertip only) this hands every frame's landmarks to a callback,
// so games get finger curl, wrist tilt and so on without re-rendering React every frame.
//
//   useHandLandmarks({ videoRef, enabled, onHands })
//   onHands(hands, dims)  hands = [{ lm: [21 points], label: "left" | "right" | null }]
//                         label is the PERSON'S own hand (the model's label is mirrored for a normal camera)
//   returns { isReady, error }
import { useEffect, useRef, useState } from "react";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export default function useHandLandmarks({ videoRef, enabled = true, onHands } = {}) {
  const [isReady, setReady] = useState(false);
  const [error, setError] = useState(null);
  const cb = useRef(onHands);
  cb.current = onHands;

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false, raf = null, landmarker = null, lastVideoTime = -1;

    const start = async () => {
      try {
        const { HandLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const resolver = await FilesetResolver.forVisionTasks(WASM_URL);
        const make = (delegate) => HandLandmarker.createFromOptions(resolver, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.35,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
        });
        try { landmarker = await make("GPU"); } catch { landmarker = await make("CPU"); }
        if (cancelled) { landmarker.close?.(); return; }
        setReady(true); setError(null);

        const loop = () => {
          if (cancelled) return;
          const video = videoRef?.current;
          // only look at a camera frame once (the picture changes about 30 times a second)
          if (video && video.readyState >= 2 && video.videoWidth > 0 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            try {
              const res = landmarker.detectForVideo(video, performance.now());
              const sets = res?.landmarks || [];
              const labels = res?.handedness || res?.handednesses || [];
              const hands = sets.map((lm, i) => {
                const raw = labels[i]?.[0]?.categoryName;
                return { lm, label: raw === "Left" ? "right" : raw === "Right" ? "left" : null };
              });
              cb.current?.(hands, { w: video.videoWidth, h: video.videoHeight });
            } catch (e) { /* a dropped frame is fine */ }
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch (e) {
        if (!cancelled) { setError(e?.message || "Hand tracking could not start"); setReady(false); }
      }
    };
    start();
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      try { landmarker?.close?.(); } catch { /* noop */ }
    };
  }, [enabled, videoRef]);

  return { isReady, error };
}
