// frontend/src/hooks/useMediaPipeUpperBody.js
import { useCallback, useEffect, useRef, useState } from "react";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

const LANDMARKS = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftIndex: 19,
  rightIndex: 20,
};

function calcAngle(a, b, c) {
  if (!a || !b || !c) return 0;
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magnitude = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  if (!magnitude) return 0;
  const cosine = Math.min(1, Math.max(-1, dot / magnitude));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function calcFlexionAngle(shoulder, elbow) {
  if (!shoulder || !elbow) return 0;
  const se = {
    x: elbow.x - shoulder.x,
    y: elbow.y - shoulder.y,
    z: (elbow.z ?? 0) - (shoulder.z ?? 0),
  };
  const up = { x: 0, y: -1, z: 0 };
  const dot = se.x * up.x + se.y * up.y + se.z * up.z;
  const mag = Math.hypot(se.x, se.y, se.z);
  if (!mag) return 0;
  const cosine = Math.min(1, Math.max(-1, dot / mag));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function pointFromLandmarks(landmarks, index) {
  const point = landmarks[index];
  return {
    x: point?.x ?? 0,
    y: point?.y ?? 0,
    z: point?.z ?? 0,
    visibility: point?.visibility ?? 0,
  };
}

/**
 * Tracks upper-body pose (shoulders/elbows/wrists) from the webcam feed.
 *
 * IMPORTANT: this hook intentionally has NO synthetic/mock data fallback.
 * If the camera or the pose model fails to initialize, `error` is set and
 * `isActive` stays false — callers must block "Start Session" on that
 * instead of silently letting the patient play against fake pose data.
 */
export function useMediaPipeUpperBody({ videoRef, onPoseUpdate, enabled = true } = {}) {
  const [isActive, setIsActive] = useState(false);
  const [calibrationData, setCalibrationData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const runningRef = useRef(false);
  const callbackRef = useRef(onPoseUpdate);
  const calibrationRef = useRef(null);
  const initAttemptedRef = useRef(false);

  callbackRef.current = onPoseUpdate;

  const calibrate = useCallback(() => {
    return new Promise((resolve) => {
      calibrationRef.current = { resolve, done: false };
    });
  }, []);

  useEffect(() => {
    if (!enabled || !videoRef?.current || initAttemptedRef.current) {
      return undefined;
    }

    initAttemptedRef.current = true;
    let cancelled = false;

    const stop = () => {
      runningRef.current = false;
      setIsActive(false);

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (landmarkerRef.current) {
        try {
          landmarkerRef.current.close?.();
        } catch {
          /* noop */
        }
        landmarkerRef.current = null;
      }
    };

    async function initialize() {
      try {
        setIsLoading(true);
        setError(null);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          stop();
          return;
        }

        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          stop();
          return;
        }

        streamRef.current = stream;
        video.srcObject = stream;
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;

        await new Promise((resolve) => {
          const onLoaded = () => {
            video.removeEventListener("loadedmetadata", onLoaded);
            resolve();
          };
          video.addEventListener("loadedmetadata", onLoaded);
          if (video.readyState >= 1) {
            video.removeEventListener("loadedmetadata", onLoaded);
            resolve();
          }
        });

        await video.play();

        // NOTE: no try/catch-and-fallback here on purpose. If the model
        // fails to load, we surface a real error instead of switching to
        // fake pose data — a clinical tool must never silently pretend it
        // is tracking someone when it isn't.
        const vision = await import("@mediapipe/tasks-vision");
        const { PoseLandmarker, FilesetResolver } = vision;
        const filesetResolver = await FilesetResolver.forVisionTasks(WASM_URL);

        const landmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });

        if (cancelled) {
          try {
            landmarker.close?.();
          } catch {
            /* noop */
          }
          stop();
          return;
        }

        landmarkerRef.current = landmarker;
        runningRef.current = true;
        setIsActive(true);
        setIsLoading(false);

        const detect = () => {
          if (!runningRef.current || cancelled) return;

          const currentVideo = videoRef.current;
          const currentLandmarker = landmarkerRef.current;

          if (
            currentVideo &&
            currentLandmarker &&
            currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          ) {
            try {
              const result = currentLandmarker.detectForVideo(currentVideo, performance.now());
              const landmarks = result?.landmarks?.[0];

              if (landmarks) {
                const raw = Object.fromEntries(
                  Object.entries(LANDMARKS).map(([name, index]) => [
                    name,
                    pointFromLandmarks(landmarks, index),
                  ])
                );

                const midChest = {
                  x: (raw.leftShoulder.x + raw.rightShoulder.x) / 2,
                  y: (raw.leftShoulder.y + raw.rightShoulder.y) / 2,
                  z: (raw.leftShoulder.z + raw.rightShoulder.z) / 2,
                  visibility: Math.min(raw.leftShoulder.visibility, raw.rightShoulder.visibility),
                };

                const leftFlexion = calcFlexionAngle(raw.leftShoulder, raw.leftElbow);
                const rightFlexion = calcFlexionAngle(raw.rightShoulder, raw.rightElbow);

                const data = {
                  raw,
                  midChest,
                  leftShoulderAngle: calcAngle(raw.leftHip, raw.leftShoulder, raw.leftElbow),
                  rightShoulderAngle: calcAngle(raw.rightHip, raw.rightShoulder, raw.rightElbow),
                  leftFlexion,
                  rightFlexion,
                  leftElbowAngle: calcAngle(raw.leftShoulder, raw.leftElbow, raw.leftWrist),
                  rightElbowAngle: calcAngle(raw.rightShoulder, raw.rightElbow, raw.rightWrist),
                  maxShoulderAngle: Math.max(leftFlexion, rightFlexion),
                  timestamp: performance.now(),
                };

                if (calibrationRef.current && !calibrationRef.current.done) {
                  calibrationRef.current.done = true;
                  const baseline = {
                    leftRestAngle: leftFlexion,
                    rightRestAngle: rightFlexion,
                    baselineMidChestY: midChest.y,
                    timestamp: Date.now(),
                  };
                  setCalibrationData(baseline);
                  calibrationRef.current.resolve(baseline);
                  calibrationRef.current = null;
                }

                callbackRef.current?.(data);
              }
            } catch (err) {
              if (import.meta.env.DEV) {
                console.debug("[useMediaPipeUpperBody] Inference error:", err.message);
              }
            }
          }

          animationFrameRef.current = requestAnimationFrame(detect);
        };

        animationFrameRef.current = requestAnimationFrame(detect);
      } catch (err) {
        console.error("[useMediaPipeUpperBody] Initialization failed:", err);
        setError(
          err?.message ||
            "Could not start pose tracking. Check camera permissions and your connection, then retry."
        );
        setIsActive(false);
        setIsLoading(false);
        stop();
      }
    }

    initialize();

    return () => {
      cancelled = true;
      stop();
      initAttemptedRef.current = false;
    };
  }, [enabled, videoRef]);

  return { isActive, isLoading, error, calibrate, calibrationData };
}

export default useMediaPipeUpperBody;