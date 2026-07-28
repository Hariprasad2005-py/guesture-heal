import { useCallback, useEffect, useRef, useState } from 'react';

const POSE_LANDMARK = {
  nose: 0,
  leftEyeInner: 1,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftEar: 7,
  rightEar: 8,
};

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

function angleBetween(a, b, c) {
  if (!a || !b || !c) return null;
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.hypot(ab.x, ab.y);
  const magCB = Math.hypot(cb.x, cb.y);
  if (magAB === 0 || magCB === 0) return null;
  const cos = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return toDeg(Math.acos(cos));
}

function lineAngleFromHorizontal(a, b) {
  if (!a || !b) return null;
  return toDeg(Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)));
}

function computeMetrics(lm) {
  const L = POSE_LANDMARK;
  const shoulderMid = lm[L.leftShoulder] && lm[L.rightShoulder]
    ? { x: (lm[L.leftShoulder].x + lm[L.rightShoulder].x) / 2, y: (lm[L.leftShoulder].y + lm[L.rightShoulder].y) / 2 }
    : null;

  return {
    shoulderLevelDeg: lineAngleFromHorizontal(lm[L.leftShoulder], lm[L.rightShoulder]),
    neckTiltDeg: shoulderMid ? angleBetween(lm[L.nose], shoulderMid, { x: shoulderMid.x, y: shoulderMid.y - 1 }) : null,
    leftElbowAngleDeg: angleBetween(lm[L.leftShoulder], lm[L.leftElbow], lm[L.leftWrist]),
    rightElbowAngleDeg: angleBetween(lm[L.rightShoulder], lm[L.rightElbow], lm[L.rightWrist]),
    leftShoulderElevationDeg: angleBetween(lm[L.leftElbow], lm[L.leftShoulder], lm[L.rightShoulder]),
    rightShoulderElevationDeg: angleBetween(lm[L.rightElbow], lm[L.rightShoulder], lm[L.leftShoulder]),
  };
}

function evaluateRules(metrics, rules) {
  const results = [];
  for (const rule of rules) {
    let value = null;
    let deviation = 0;

    if (rule.type === 'levelness') {
      value = metrics.shoulderLevelDeg;
      deviation = value ?? 0;
    } else if (rule.type === 'neckTilt') {
      value = metrics.neckTiltDeg;
      deviation = value ?? 0;
    } else if (rule.type === 'elbowAngleMin') {
      const v = rule.side === 'left' ? metrics.leftElbowAngleDeg : metrics.rightElbowAngleDeg;
      value = v;
      deviation = v == null ? 0 : Math.max(0, rule.minDeg - v);
    }

    if (value == null) continue;

    let status = 'ok';
    if (rule.severeDeg != null && deviation >= rule.severeDeg) status = 'severe';
    else if (rule.toleranceDeg != null && deviation >= rule.toleranceDeg) status = 'minor';
    else if (rule.minDeg != null && deviation > 0) status = deviation > (rule.severeDeg || 20) ? 'severe' : 'minor';

    results.push({ id: rule.id, value, deviation, status, cue: rule.cue });
  }
  return results;
}

export function usePostureGuidance({ enabled = true, videoRef: externalVideoRef, postureRules = [] } = {}) {
  const internalVideoRef = useRef(null);
  const videoRef = externalVideoRef || internalVideoRef;
  const poseRef = useRef(null);
  const cameraRef = useRef(null);
  const mountedRef = useRef(true);
  const isInitializingRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isBodyDetected, setIsBodyDetected] = useState(false);
  const [keypoints, setKeypoints] = useState(null);
  const [jointResults, setJointResults] = useState([]);
  const [overallStatus, setOverallStatus] = useState('ok');
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

  const rulesRef = useRef(postureRules);
  rulesRef.current = postureRules;

  const onResults = useCallback((results, containerEl) => {
    if (!mountedRef.current) return;
    const lm = results.poseLandmarks;
    if (!lm) {
      setIsBodyDetected(false);
      return;
    }
    setIsBodyDetected(true);

    const metrics = computeMetrics(lm);
    const evaluated = evaluateRules(metrics, rulesRef.current);
    setJointResults(evaluated);

    const hasSevere = evaluated.some((r) => r.status === 'severe');
    const hasMinor = evaluated.some((r) => r.status === 'minor');
    setOverallStatus(hasSevere ? 'severe' : hasMinor ? 'minor' : 'ok');

    const w = containerEl?.clientWidth || 640;
    const h = containerEl?.clientHeight || 480;
    const L = POSE_LANDMARK;
    const toPx = (p) => (p ? { x: (1 - p.x) * w, y: p.y * h, visible: (p.visibility ?? 1) > 0.4 } : null);

    setKeypoints({
      nose: toPx(lm[L.nose]),
      leftShoulder: toPx(lm[L.leftShoulder]),
      rightShoulder: toPx(lm[L.rightShoulder]),
      leftElbow: toPx(lm[L.leftElbow]),
      rightElbow: toPx(lm[L.rightElbow]),
      leftWrist: toPx(lm[L.leftWrist]),
      rightWrist: toPx(lm[L.rightWrist]),
    });
  }, []);

  const containerElRef = useRef(null);
  const setOverlayContainer = useCallback((el) => {
    containerElRef.current = el;
  }, []);

  const calibrate = useCallback(() => {
    return new Promise((resolve) => {
      setIsCalibrating(true);
      setTimeout(() => {
        setIsCalibrated(true);
        setIsCalibrating(false);
        resolve(true);
      }, 2000);
    });
  }, []);

  useEffect(() => {
    if (!enabled || isInitializingRef.current) return;
    isInitializingRef.current = true;
    let mounted = true;
    mountedRef.current = true;

    async function init() {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js');
        if (!mounted) return;

        const Pose = window.Pose;
        const Camera = window.Camera;
        if (!Pose || !Camera) throw new Error('Pose modules not loaded.');

        const pose = new Pose({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`,
        });
        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          selfieMode: true,
        });
        pose.onResults((r) => mounted && onResults(r, containerElRef.current));
        poseRef.current = pose;

        if (videoRef.current) {
          if (videoRef.current.srcObject) {
            const loop = async () => {
              if (!mounted || !poseRef.current || !videoRef.current) return;
              if (videoRef.current.readyState >= 2) {
                try { await poseRef.current.send({ image: videoRef.current }); } catch (_) {}
              }
              requestAnimationFrame(loop);
            };
            loop();
          } else {
            const camera = new Camera(videoRef.current, {
              onFrame: async () => {
                if (!mounted || !poseRef.current || !videoRef.current) return;
                try { await poseRef.current.send({ image: videoRef.current }); } catch (_) {}
              },
              width: 640,
              height: 480,
            });
            await camera.start();
            cameraRef.current = camera;
          }
        }
        setIsLoading(false);
      } catch (err) {
        console.error('[usePostureGuidance] Error:', err);
        setError(err.message || 'Failed to initialize posture tracking.');
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
        if (poseRef.current) poseRef.current.close();
      } catch (_) {}
    };
  }, [enabled, loadScript, onResults, videoRef]);

  return {
    videoRef,
    setOverlayContainer,
    isLoading,
    error,
    isBodyDetected,
    keypoints,
    jointResults,
    overallStatus,
    isCalibrating,
    isCalibrated,
    calibrate,
  };
}
