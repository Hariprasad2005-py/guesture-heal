import { useCallback, useEffect, useRef, useState } from 'react';

const CALIBRATION_MS = 4000;
const SMOOTHING_WINDOW = 6;

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

const LM = {
  leftBrow: 65,
  leftBrowInner: 55,
  rightBrow: 295,
  rightBrowInner: 285,
  leftEyeTop: 159,
  leftEyeBottom: 145,
  rightEyeTop: 386,
  rightEyeBottom: 374,
  leftEyeOuter: 33,
  rightEyeOuter: 263,
  noseBridge: 6,
  noseTip: 1,
  leftNoseWing: 98,
  rightNoseWing: 327,
  mouthLeft: 61,
  mouthRight: 291,
  upperLip: 13,
  lowerLip: 14,
  leftEyeInner: 133,
  rightEyeInner: 362,
};

function computeRawFeatures(lm) {
  const iod = dist(lm[LM.leftEyeOuter], lm[LM.rightEyeOuter]) || 1;

  const browEyeL = dist(lm[LM.leftBrow], lm[LM.leftEyeTop]) / iod;
  const browEyeR = dist(lm[LM.rightBrow], lm[LM.rightEyeTop]) / iod;
  const browLower = (browEyeL + browEyeR) / 2;

  const eyeApertureL = dist(lm[LM.leftEyeTop], lm[LM.leftEyeBottom]) / iod;
  const eyeApertureR = dist(lm[LM.rightEyeTop], lm[LM.rightEyeBottom]) / iod;
  const eyeAperture = (eyeApertureL + eyeApertureR) / 2;

  const noseWidth = dist(lm[LM.leftNoseWing], lm[LM.rightNoseWing]) / iod;

  const mouthWidth = dist(lm[LM.mouthLeft], lm[LM.mouthRight]) / iod;
  const lipGap = dist(lm[LM.upperLip], lm[LM.lowerLip]) / iod;

  return { browLower, eyeAperture, noseWidth, mouthWidth, lipGap };
}

export function useFacialPainDetection({ enabled = true, videoRef: externalVideoRef, onPAPSUpdate } = {}) {
  const internalVideoRef = useRef(null);
  const videoRef = externalVideoRef || internalVideoRef;
  const faceMeshRef = useRef(null);
  const cameraRef = useRef(null);
  const mountedRef = useRef(true);
  const isInitializingRef = useRef(false);

  const baselineRef = useRef(null);
  const scoreHistoryRef = useRef([]);
  const calibrationSamplesRef = useRef([]);
  const calibratingRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [paps, setPaps] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);

  const loadScript = useCallback((src) => {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.crossOrigin = 'anonymous';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load: ${src}`));
      document.head.appendChild(s);
    });
  }, []);

  const onResults = useCallback((results) => {
    if (!mountedRef.current) return;
    const faces = results.multiFaceLandmarks;

    if (!faces || faces.length === 0) {
      setIsFaceDetected(false);
      return;
    }
    setIsFaceDetected(true);
    const lm = faces[0];
    const feats = computeRawFeatures(lm);

    if (calibratingRef.current) {
      calibrationSamplesRef.current.push(feats);
      return;
    }

    if (!baselineRef.current) return;

    const b = baselineRef.current;
    const browAct = Math.max(0, (b.browLower - feats.browLower) / b.browLower);
    const eyeAct = Math.max(0, (b.eyeAperture - feats.eyeAperture) / b.eyeAperture);
    const noseAct = Math.max(0, (b.noseWidth - feats.noseWidth) / b.noseWidth);
    const mouthAct = Math.max(0, (feats.mouthWidth - b.mouthWidth) / b.mouthWidth);

    const composite =
      0.3 * Math.min(browAct, 0.6) +
      0.3 * Math.min(eyeAct, 0.6) +
      0.2 * Math.min(noseAct, 0.6) +
      0.2 * Math.min(mouthAct, 0.6);

    const rawScore = Math.min(10, (composite / 0.35) * 10);

    scoreHistoryRef.current.push(rawScore);
    if (scoreHistoryRef.current.length > SMOOTHING_WINDOW) scoreHistoryRef.current.shift();
    const smoothed =
      scoreHistoryRef.current.reduce((a, v) => a + v, 0) / scoreHistoryRef.current.length;
    const rounded = Math.round(smoothed * 10) / 10;

    setPaps(rounded);
    onPAPSUpdate?.(rounded);
  }, [onPAPSUpdate]);

  const calibrate = useCallback(() => {
    return new Promise((resolve) => {
      calibrationSamplesRef.current = [];
      calibratingRef.current = true;
      setIsCalibrating(true);

      setTimeout(() => {
        calibratingRef.current = false;
        const samples = calibrationSamplesRef.current;
        if (samples.length > 0) {
          const avg = (key) => samples.reduce((a, s) => a + s[key], 0) / samples.length;
          baselineRef.current = {
            browLower: avg('browLower'),
            eyeAperture: avg('eyeAperture'),
            noseWidth: avg('noseWidth'),
            mouthWidth: avg('mouthWidth'),
            lipGap: avg('lipGap'),
          };
          setIsCalibrated(true);
        }
        setIsCalibrating(false);
        resolve(!!baselineRef.current);
      }, CALIBRATION_MS);
    });
  }, []);

  useEffect(() => {
    if (!enabled || isInitializingRef.current) return;
    isInitializingRef.current = true;
    let mounted = true;
    mountedRef.current = true;

    async function init() {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js');
        if (!mounted) return;

        const FaceMesh = window.FaceMesh;
        const Camera = window.Camera;
        if (!FaceMesh || !Camera) throw new Error('FaceMesh modules not loaded.');

        const faceMesh = new FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
        });
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        faceMesh.onResults((r) => mounted && onResults(r));
        faceMeshRef.current = faceMesh;

        if (videoRef.current) {

  const waitForVideo = () => {
    return new Promise((resolve) => {
      const check = () => {
        if (
          videoRef.current &&
          videoRef.current.srcObject &&
          videoRef.current.readyState >= 2
        ) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };

      check();
    });
  };

  await waitForVideo();

  const loop = async () => {
    if (!mounted || !faceMeshRef.current || !videoRef.current) return;

    if (videoRef.current.readyState >= 2) {
      try {
        await faceMeshRef.current.send({
          image: videoRef.current
        });
      } catch (err) {
        console.warn("FaceMesh send error", err);
      }
    }

    requestAnimationFrame(loop);
  };

  loop();
}
        setIsLoading(false);
      } catch (err) {
        console.error('[useFacialPainDetection] Error:', err);
        setError(err.message || 'Failed to initialize facial pain detection.');
        setIsLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
      mountedRef.current = false;
      isInitializingRef.current = false;
      try {
        if (cameraRef.current) cameraRef.current.stop();
        if (faceMeshRef.current) faceMeshRef.current.close();
      } catch (_) {}
    };
  }, [enabled, loadScript, onResults, videoRef]);

  return {
    videoRef,
    isLoading,
    error,
    isFaceDetected,
    paps,
    isCalibrating,
    isCalibrated,
    calibrate,
  };
}
