import { useCallback, useEffect, useRef, useState } from "react";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const FRAME_SKIP = 4;
const PAIN_THRESHOLD = 6;
const PAIN_CONFIRMATION_MS = 2000;

function maximum(categories, names) {
  return Math.max(
    ...names.map(
      (name) =>
        categories.find((category) => category.categoryName === name)
          ?.score || 0
    ),
    0
  );
}

function getPainLevel(score) {
  if (score > 8) return "severe";
  if (score > 6) return "moderate";
  if (score > 3.5) return "mild";
  return "none";
}

export function useFacialPainDetection({
  videoRef,
  enabled = true,
} = {}) {
  const [papsScore, setPapsScore] = useState(0);
  const [isPainDetected, setIsPainDetected] = useState(false);
  const [painLevel, setPainLevel] = useState("none");

  const landmarkerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const frameRef = useRef(0);
  const painStartedAtRef = useRef(null);
  const runningRef = useRef(false);

  const resetPainState = useCallback(() => {
    painStartedAtRef.current = null;
    setIsPainDetected(false);
  }, []);

  useEffect(() => {
    if (!enabled || !videoRef?.current) return undefined;

    let cancelled = false;

    async function initialize() {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const { FaceLandmarker, FilesetResolver } = vision;

        const resolver = await FilesetResolver.forVisionTasks(WASM_URL);

        const landmarker = await FaceLandmarker.createFromOptions(
          resolver,
          {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
          }
        );

        if (cancelled) {
          landmarker.close?.();
          return;
        }

        landmarkerRef.current = landmarker;
        runningRef.current = true;

        const loop = () => {
          if (cancelled || !runningRef.current) return;

          frameRef.current += 1;

          const video = videoRef.current;

          if (
            frameRef.current % FRAME_SKIP === 0 &&
            video &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          ) {
            try {
              const result = landmarker.detectForVideo(
                video,
                performance.now()
              );

              const categories =
                result?.faceBlendshapes?.[0]?.categories || [];

              if (categories.length) {
                const browDown = maximum(categories, [
                  "browDownLeft",
                  "browDownRight",
                ]);

                const cheekSquint = maximum(categories, [
                  "cheekSquintLeft",
                  "cheekSquintRight",
                ]);

                const eyeSquint = maximum(categories, [
                  "eyeSquintLeft",
                  "eyeSquintRight",
                ]);

                const noseSneer = maximum(categories, [
                  "noseSneerLeft",
                  "noseSneerRight",
                ]);

                const upperLip = maximum(categories, [
                  "mouthUpperUpLeft",
                  "mouthUpperUpRight",
                ]);

                const eyeClose = maximum(categories, [
                  "eyeBlinkLeft",
                  "eyeBlinkRight",
                ]);

                const raw =
                  browDown * 2 +
                  cheekSquint * 1.2 +
                  eyeSquint * 1.2 +
                  noseSneer * 1.5 +
                  upperLip * 0.8 +
                  eyeClose * 0.3;

                const score = Math.min(10, raw * 3.2);
                const roundedScore = Math.round(score);

                setPapsScore(roundedScore);
                setPainLevel(getPainLevel(score));

                if (score > PAIN_THRESHOLD) {
                  if (!painStartedAtRef.current) {
                    painStartedAtRef.current = performance.now();
                  }

                  if (
                    performance.now() - painStartedAtRef.current >=
                    PAIN_CONFIRMATION_MS
                  ) {
                    setIsPainDetected(true);
                  }
                } else {
                  painStartedAtRef.current = null;
                  setIsPainDetected(false);
                }
              }
            } catch {
              // Keep detection loop alive after transient inference errors.
            }
          }

          animationFrameRef.current = requestAnimationFrame(loop);
        };

        animationFrameRef.current = requestAnimationFrame(loop);
      } catch {
        // Facial pain detection is best effort and must not block rehabilitation.
      }
    }

    initialize();

    return () => {
      cancelled = true;
      runningRef.current = false;

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      landmarkerRef.current?.close?.();
      landmarkerRef.current = null;
    };
  }, [enabled, videoRef]);

  return {
    papsScore,
    isPainDetected,
    painLevel,
    resetPainState,
  };
}

export default useFacialPainDetection;