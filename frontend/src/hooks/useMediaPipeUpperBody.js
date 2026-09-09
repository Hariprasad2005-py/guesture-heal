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

// After this many *consecutive* detectForVideo failures, stop silently
// swallowing and surface a real error instead — previously the catch
// block below would eat errors forever with just a DEV console.debug,
// so if inference started throwing on every frame (e.g. a non-advancing
// or non-monotonic timestamp passed to detectForVideo), poseData would
// freeze on the last successful frame permanently while isActive stayed
// true, with zero signal that anything was wrong. That is the exact
// "loads successfully, skeleton/dot frozen" symptom.
const MAX_CONSECUTIVE_INFERENCE_ERRORS = 20;

// Throttle debug logging so it doesn't flood the console at 30-60fps.
// Set to 1 to log every frame while actively debugging.
const LOG_EVERY_N_FRAMES = 15;

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
    // presence: PoseLandmarker's likelihood the landmark exists within
    // the frame at all, distinct from visibility (occluded vs not, given
    // it IS present). For a landmark whose x/y sit outside [0,1] — i.e.
    // extrapolated beyond the visible image — presence is the more
    // direct "is this even in the shot" signal.
    presence: point?.presence ?? 0,
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

  // NEW — pipeline health tracking, see MAX_CONSECUTIVE_INFERENCE_ERRORS.
  const lastVideoTimeRef = useRef(-1);
  const consecutiveErrorsRef = useRef(0);
  // Tracks which <video> DOM node currently has the live MediaStream
  // attached. Callers that render this element inside conditionally-
  // mounted JSX branches (e.g. an "Instructions" screen vs an "Active
  // game" screen, each with its own <video ref={videoRef} .../>) will
  // get a brand-new DOM node when React switches branches — the init
  // effect above only runs once and attaches the stream to whichever
  // node existed at that time, so the new node is left with no source.
  const attachedVideoElRef = useRef(null);
  const frameCounterRef = useRef(0);
  const framesDeliveredRef = useRef(0);

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
        attachedVideoElRef.current = video;

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

        console.log("[MP-PIPELINE][1-init] PoseLandmarker ready, detect loop starting");

        const detect = () => {
          if (!runningRef.current || cancelled) return;

          const currentVideo = videoRef.current;
          const currentLandmarker = landmarkerRef.current;

          // Re-attach the live stream if the caller's <video> DOM node
          // changed identity since we last attached it (see
          // attachedVideoElRef above). Cheap reference check, no-op for
          // any caller whose video element stays mounted the whole time.
          if (
            currentVideo &&
            currentVideo !== attachedVideoElRef.current &&
            streamRef.current
          ) {
            attachedVideoElRef.current = currentVideo;
            currentVideo.srcObject = streamRef.current;
            currentVideo.muted = true;
            currentVideo.autoplay = true;
            currentVideo.playsInline = true;
            currentVideo.play().catch(() => {
              /* Autoplay can be transiently rejected right at the swap;
                 harmless — this block retries every frame the node
                 hasn't started yet. */
            });
          }

          const videoReady =
            currentVideo &&
            currentLandmarker &&
            currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

          // FIX: only run inference when a genuinely new video frame is
          // available. Calling detectForVideo repeatedly against the same
          // (unchanged) frame, or with a timestamp the model doesn't
          // consider strictly newer than the last call, is what triggers
          // the repeated-throw freeze this hook was silently swallowing.
          const isNewFrame = videoReady && currentVideo.currentTime !== lastVideoTimeRef.current;

          if (isNewFrame) {
            lastVideoTimeRef.current = currentVideo.currentTime;

            try {
              const result = currentLandmarker.detectForVideo(currentVideo, performance.now());
              const landmarks = result?.landmarks?.[0];

              consecutiveErrorsRef.current = 0;

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

                // CHECKPOINT 1: raw landmark output, right before it leaves
                // this hook. If x/y/visibility here are NOT changing while
                // you move your hand, the problem is upstream of React
                // entirely (camera feed, model, or landmark indices) —
                // nothing downstream can fix it.
                framesDeliveredRef.current += 1;
                frameCounterRef.current += 1;
                if (frameCounterRef.current % LOG_EVERY_N_FRAMES === 0) {
                  console.log("[MP-PIPELINE][1-raw-landmark] wrist raw", {
                    frame: framesDeliveredRef.current,
                    leftWrist: { x: raw.leftWrist.x.toFixed(3), y: raw.leftWrist.y.toFixed(3), vis: raw.leftWrist.visibility.toFixed(2) },
                    rightWrist: { x: raw.rightWrist.x.toFixed(3), y: raw.rightWrist.y.toFixed(3), vis: raw.rightWrist.visibility.toFixed(2) },
                  });

                  console.log("[MP-DIAG] video frame", {
                    videoCurrentTime: currentVideo.currentTime.toFixed(3),
                    videoWidth: currentVideo.videoWidth,
                    videoHeight: currentVideo.videoHeight,
                  });
                  console.log("[MP-DIAG] left wrist", {
                    x: raw.leftWrist.x.toFixed(3),
                    y: raw.leftWrist.y.toFixed(3),
                    inFrame: raw.leftWrist.x >= 0 && raw.leftWrist.x <= 1 && raw.leftWrist.y >= 0 && raw.leftWrist.y <= 1,
                  });
                  console.log("[MP-DIAG] right wrist", {
                    x: raw.rightWrist.x.toFixed(3),
                    y: raw.rightWrist.y.toFixed(3),
                    inFrame: raw.rightWrist.x >= 0 && raw.rightWrist.x <= 1 && raw.rightWrist.y >= 0 && raw.rightWrist.y <= 1,
                  });
                  console.log("[MP-DIAG] confidence/presence", {
                    leftVisibility: raw.leftWrist.visibility.toFixed(3),
                    leftPresence: raw.leftWrist.presence.toFixed(3),
                    rightVisibility: raw.rightWrist.visibility.toFixed(3),
                    rightPresence: raw.rightWrist.presence.toFixed(3),
                  });
                }

                callbackRef.current?.(data);
              }
            } catch (err) {
              consecutiveErrorsRef.current += 1;
              if (import.meta.env.DEV) {
                console.debug(
                  `[MP-PIPELINE][1-error] Inference error (${consecutiveErrorsRef.current} in a row):`,
                  err?.message
                );
              }
              // FIX: previously this failure mode was invisible forever.
              // Surface it once it's clearly not transient, so isActive/
              // error reflect reality instead of a silently frozen feed.
              if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_INFERENCE_ERRORS) {
                setError(
                  "Pose tracking stalled (repeated inference errors) — please restart the session."
                );
                setIsActive(false);
                runningRef.current = false;
                return;
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