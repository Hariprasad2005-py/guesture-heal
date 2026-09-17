// frontend/src/hooks/useFacialPainDetection.js
//
// Facial pain detection via MediaPipe Face Landmarker.
//
// Lifecycle states (`status`):
//   "loading"   — model is being fetched/initialized. PAPS reads as 0.
//   "ready"     — model loaded and running. Face may or may not be present.
//   "no_face"   — model loaded, but no face detected in the last N frames.
//                 This is NOT a failure — the patient may be off-camera.
//   "error"     — model failed to load or the camera stream died.
//
// Consumers should treat only `status === "error"` as "the PAPS safety
// net is off". `no_face` is expected during setup and must not raise a
// warning banner.

import { useCallback, useEffect, useRef, useState } from "react";

// Number of consecutive frames with no detected face before we flip
// status to "no_face". Prevents flicker when the patient blinks or
// briefly turns away.
const NO_FACE_FRAMES_THRESHOLD = 30;

// How often (ms) to re-evaluate the "no_face" status while running.
const STATUS_TICK_MS = 500;

export default function useFacialPainDetection({ videoRef }) {
  const [papsScore, setPapsScore] = useState(0);
  const [isPainDetected, setIsPainDetected] = useState(false);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  const faceLandmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const noFaceCountRef = useRef(0);
  const lastFaceSeenMsRef = useRef(0);
  const mountedRef = useRef(true);

  // ---- Model init ----
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function init() {
      try {
        const { FaceLandmarker, FilesetResolver } = await import(
          "@mediapipe/tasks-vision"
        );
        const fileset = await FilesetResolver.forVisionTasks(
          // Adjust to wherever your wasm assets are served from.
          "/mediapipe/wasm"
        );
        const landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: "/mediapipe/models/face_landmarker.task",
            delegate: "GPU",
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        });
        if (cancelled || !mountedRef.current) {
          landmarker.close?.();
          return;
        }
        faceLandmarkerRef.current = landmarker;
        setStatus("ready");
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        console.error("[facialPain] model init failed:", err);
        setError(err?.message || "Facial pain model failed to load");
        setStatus("error");
      }
    }

    init();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        faceLandmarkerRef.current?.close?.();
      } catch {
        /* ignore */
      }
      faceLandmarkerRef.current = null;
    };
  }, []);

  // ---- Inference loop ----
  useEffect(() => {
    if (status !== "ready" && status !== "no_face") return undefined;

    const landmarker = faceLandmarkerRef.current;
    const video = videoRef?.current;
    if (!landmarker || !video) return undefined;

    let lastVideoTime = -1;
    let lastStatusCheck = 0;

    const tick = () => {
      if (!mountedRef.current) return;

      const now = performance.now();

      if (
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTime
      ) {
        lastVideoTime = video.currentTime;

        let result = null;
        try {
          result = landmarker.detectForVideo(video, now);
        } catch (err) {
          // Inference errors are transient (e.g. resolution change).
          // Don't tear down the hook — just skip this frame.
          console.warn("[facialPain] inference error:", err);
        }

        const faces = result?.faceLandmarks || [];
        if (faces.length > 0) {
          noFaceCountRef.current = 0;
          lastFaceSeenMsRef.current = now;

          const blendshapes = result?.faceBlendshapes?.[0]?.categories || [];
          const score = computePapsFromBlendshapes(blendshapes);
          setPapsScore(score);
          setIsPainDetected(score >= 6);
        } else {
          noFaceCountRef.current += 1;
          // Decay PAPS while no face is visible so a stale pain reading
          // doesn't linger after the patient leaves the frame.
          if (noFaceCountRef.current > NO_FACE_FRAMES_THRESHOLD) {
            setPapsScore(0);
            setIsPainDetected(false);
          }
        }
      }

      // Periodically reconcile status with face presence.
      if (now - lastStatusCheck > STATUS_TICK_MS) {
        lastStatusCheck = now;
        if (noFaceCountRef.current > NO_FACE_FRAMES_THRESHOLD) {
          setStatus((s) => (s === "no_face" ? s : "no_face"));
        } else {
          setStatus((s) => (s === "ready" ? s : "ready"));
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [status, videoRef]);

  const resetPainState = useCallback(() => {
    setIsPainDetected(false);
    setPapsScore(0);
  }, []);

  // Derived flags. Consumers should generally read `status` directly;
  // these are conveniences for JSX conditionals.
  const isAvailable = status === "ready" || status === "no_face";
  const isWarmingUp = status === "loading";
  const hasFailed = status === "error";

  return {
    papsScore,
    isPainDetected,
    resetPainState,
    // ---- lifecycle surface ----
    status,           // "loading" | "ready" | "no_face" | "error"
    error,            // string | null
    isAvailable,      // true once model is loaded (face may be absent)
    isWarmingUp,      // true while model is loading
    hasFailed,        // true only on genuine load/stream failure
  };
}

// ------------------------------------------------------------
// PAPS scoring from blendshapes.
//
// Replace this with your existing scoring logic if you already
// have one. This is a minimal placeholder that maps a few
// pain-relevant blendshape coefficients to a 0–10 scale.
// ------------------------------------------------------------
function computePapsFromBlendshapes(categories) {
  const get = (name) => {
    const c = categories.find((x) => x.categoryName === name);
    return c ? c.score : 0;
  };

  // Weighted sum of pain-relevant facial actions.
  // Weights are illustrative; tune against your clinical data.
  const browDown = get("browDownLeft") + get("browDownRight");
  const eyeSquint = get("eyeSquintLeft") + get("eyeSquintRight");
  const mouthFrown = get("mouthFrownLeft") + get("mouthFrownRight");
  const noseSneer = get("noseSneerLeft") + get("noseSneerRight");
  const jawClench = get("jawClose");

  const raw =
    0.9 * browDown +
    0.8 * eyeSquint +
    0.7 * mouthFrown +
    0.6 * noseSneer +
    0.5 * jawClench;

  // Map [0, ~6] → [0, 10] and clamp.
  const score = Math.max(0, Math.min(10, (raw / 6) * 10));
  return Math.round(score * 10) / 10;
}