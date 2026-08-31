// frontend/src/hooks/useUnifiedMediaPipe.js
import { useEffect, useRef, useState } from "react";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export function useUnifiedMediaPipe({ videoRef, enabled = true }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(null);

  // We store the absolute latest results in refs so the game loop (requestAnimationFrame)
  // can poll them without triggering React re-renders.
  const resultsRef = useRef({
    pose: null,
    face: null,
    timestamp: 0,
    painScore: 0,
    painDetected: false,
    activeSide: "left", // 'left' or 'right' based on visibility
  });

  const poseLandmarkerRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const runningRef = useRef(false);
  const painStartedAtRef = useRef(null);

  useEffect(() => {
    if (!enabled || !videoRef?.current) return;

    let cancelled = false;

    async function initializeModels() {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const { PoseLandmarker, FaceLandmarker, FilesetResolver } = vision;

        const resolver = await FilesetResolver.forVisionTasks(WASM_URL);

        const [poseLandmarker, faceLandmarker] = await Promise.all([
          PoseLandmarker.createFromOptions(resolver, {
            baseOptions: {
              modelAssetPath: POSE_MODEL_URL,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
            outputSegmentationMasks: false,
          }),
          FaceLandmarker.createFromOptions(resolver, {
            baseOptions: {
              modelAssetPath: FACE_MODEL_URL,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
          }),
        ]);

        if (cancelled) {
          poseLandmarker.close();
          faceLandmarker.close();
          return;
        }

        poseLandmarkerRef.current = poseLandmarker;
        faceLandmarkerRef.current = faceLandmarker;
        setIsLoaded(true);
        runningRef.current = true;

        const detectLoop = () => {
          if (cancelled || !runningRef.current) return;
          const video = videoRef.current;

          if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const now = performance.now();
            try {
              const poseResult = poseLandmarker.detectForVideo(video, now);
              const faceResult = faceLandmarker.detectForVideo(video, now);

              const newResults = {
                pose: poseResult,
                face: faceResult,
                timestamp: now,
                painScore: resultsRef.current.painScore,
                painDetected: resultsRef.current.painDetected,
                activeSide: resultsRef.current.activeSide,
              };

              // Process FaceMesh for pain immediately so it's available to game loop
              if (faceResult?.faceBlendshapes?.[0]?.categories) {
                const categories = faceResult.faceBlendshapes[0].categories;
                function getScore(names) {
                  return Math.max(...names.map(n => categories.find(c => c.categoryName === n)?.score || 0), 0);
                }
                const browDown = getScore(["browDownLeft", "browDownRight"]);
                const cheekSquint = getScore(["cheekSquintLeft", "cheekSquintRight"]);
                const eyeSquint = getScore(["eyeSquintLeft", "eyeSquintRight"]);
                const noseSneer = getScore(["noseSneerLeft", "noseSneerRight"]);
                const upperLip = getScore(["mouthUpperUpLeft", "mouthUpperUpRight"]);
                const eyeClose = getScore(["eyeBlinkLeft", "eyeBlinkRight"]);

                const raw = browDown * 2 + cheekSquint * 1.2 + eyeSquint * 1.2 + noseSneer * 1.5 + upperLip * 0.8 + eyeClose * 0.3;
                const score = Math.min(10, raw * 3.2);
                newResults.painScore = Math.round(score);
                
                if (score > 6) { // PAIN THRESHOLD
                  if (!painStartedAtRef.current) painStartedAtRef.current = now;
                  if (now - painStartedAtRef.current >= 1500) newResults.painDetected = true;
                } else {
                  painStartedAtRef.current = null;
                  newResults.painDetected = false;
                }
              }

              // Process Pose for Active Side
              if (poseResult?.landmarks?.[0]) {
                const lm = poseResult.landmarks[0];
                const leftWrist = lm[15]; // left
                const rightWrist = lm[16]; // right
                
                const leftVisible = leftWrist.visibility > 0.4;
                const rightVisible = rightWrist.visibility > 0.4;

                if (leftVisible && !rightVisible) newResults.activeSide = 'left';
                else if (!leftVisible && rightVisible) newResults.activeSide = 'right';
                else if (leftVisible && rightVisible) {
                  // Switch if one is significantly higher
                  if (leftWrist.y < rightWrist.y - 0.08) newResults.activeSide = 'left';
                  else if (rightWrist.y < leftWrist.y - 0.08) newResults.activeSide = 'right';
                }
              }

              // Write back to ref locklessly
              resultsRef.current = newResults;
            } catch (err) {
              console.error("Inference Error:", err);
            }
          }

          animationFrameRef.current = requestAnimationFrame(detectLoop);
        };

        animationFrameRef.current = requestAnimationFrame(detectLoop);
      } catch (err) {
        console.error("Failed to init MediaPipe:", err);
        setError(err);
      }
    }

    initializeModels();

    return () => {
      cancelled = true;
      runningRef.current = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (poseLandmarkerRef.current) poseLandmarkerRef.current.close();
      if (faceLandmarkerRef.current) faceLandmarkerRef.current.close();
    };
  }, [enabled, videoRef]);

  return { isLoaded, error, resultsRef };
}
