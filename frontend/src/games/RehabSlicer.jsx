// src/games/RehabSlicer/RehabSlicer.jsx
// Single-file rehabilitation game with MediaPipe Pose detection
// One balloon at a time with full ROM tracking and therapy metrics

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  BALLOON_MIN_RADIUS: 25,
  BALLOON_MAX_RADIUS: 45,
  SPEED_MIN: 2.5,
  SPEED_MAX: 6.0,
  SPAWN_DELAY: 1200,
  HIT_TOLERANCE: 1.3,
  TRAIL_LENGTH: 25,
  PARTICLE_COUNT: 30,
  BASE_SCORE: 10,
  ROM_BONUS_MULTIPLIER: 0.5,
  TARGET_ACCURACY: 65,
  SPEED_ADJUSTMENT: 0.25,
  SIZE_ADJUSTMENT: 2,
};

const BALLOON_COLORS = [
  { color: '#ef4444', glow: 'rgba(239, 68, 68, 0.3)', label: '🔴' },
  { color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.3)', label: '🔵' },
  { color: '#22c55e', glow: 'rgba(34, 197, 94, 0.3)', label: '🟢' },
  { color: '#eab308', glow: 'rgba(234, 179, 8, 0.3)', label: '🟡' },
  { color: '#a855f7', glow: 'rgba(168, 85, 247, 0.3)', label: '🟣' },
  { color: '#ec4899', glow: 'rgba(236, 72, 153, 0.3)', label: '🩷' },
  { color: '#f97316', glow: 'rgba(249, 115, 22, 0.3)', label: '🟠' },
];

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function RehabSlicer({
  onSessionEnd,
  patientId,
  gameId = 'rehab-slicer',
  gameName = 'Rehab Balloon Slicer',
  qaAdapterRef
} = {}) {
  // ----- Refs -----
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const animationRef = useRef(null);
  const poseRef = useRef(null);
  const cameraRef = useRef(null);
  const balloonRef = useRef(null);
  const particlesRef = useRef([]);
  const trailPointsRef = useRef([]);
  const wristPositionsRef = useRef([]);
  const popEffectsRef = useRef([]);
  const sessionStartRef = useRef(null);
  const balloonSpawnTimeRef = useRef(0);
  const hitCountRef = useRef(0);
  const missCountRef = useRef(0);
  const sliceCountRef = useRef(0);
  const reactionTimesRef = useRef([]);
  const romValuesRef = useRef([]);
  const smoothnessValuesRef = useRef([]);
  const totalScoreRef = useRef(0);
  const prevWristRef = useRef(null);
  const currentWristRef = useRef(null);
  const isWristTrackingRef = useRef(false);
  const isHitProcessedRef = useRef(false);
  const frameCountRef = useRef(0);
  const difficultySpeedRef = useRef(CONFIG.SPEED_MIN);
  const difficultySizeRef = useRef(CONFIG.BALLOON_MAX_RADIUS);
  const comboCountRef = useRef(0);
  const lastHitTimeRef = useRef(0);
  const totalMovementRef = useRef(0);
  const armExtensionRef = useRef(0);
  const maxRomRef = useRef(0);
  const leftArmRomRef = useRef(0);
  const rightArmRomRef = useRef(0);
  const romSamplesRef = useRef([]);
  
  // ----- State -----
  const [gameState, setGameState] = useState('start');
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [slices, setSlices] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [therapyScore, setTherapyScore] = useState(0);
  const [avgReaction, setAvgReaction] = useState(0);
  const [rom, setRom] = useState(0);
  const [smoothness, setSmoothness] = useState(0);
  const [maxRom, setMaxRom] = useState(0);
  const [currentDifficulty, setCurrentDifficulty] = useState('Normal');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [poseLoading, setPoseLoading] = useState(true);
  const [poseError, setPoseError] = useState(null);
  const [currentArm, setCurrentArm] = useState('none');
  const [balloonPopup, setBalloonPopup] = useState(null);
  const [comboDisplay, setComboDisplay] = useState(0);
  
  // ============================================================
  // MEDIAPIPE POSE SETUP
  // ============================================================
  
  const loadMediaPipeScripts = useCallback(() => {
    return new Promise((resolve, reject) => {
      const scripts = [
        'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
        'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js',
      ];
      
      let loaded = 0;
      
      for (const src of scripts) {
        const script = document.createElement('script');
        script.src = src;
        script.crossOrigin = 'anonymous';
        script.async = true;
        script.onload = () => {
          loaded++;
          if (loaded === scripts.length) resolve();
        };
        script.onerror = () => reject(new Error(`Failed to load: ${src}`));
        document.head.appendChild(script);
      }
    });
  }, []);
  
  const initializePose = useCallback(async () => {
    try {
      await loadMediaPipeScripts();
      
      const Pose = window.Pose;
      const Camera = window.Camera;
      
      if (!Pose || !Camera) {
        throw new Error('MediaPipe modules not loaded');
      }
      
      const pose = new Pose({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });
      
      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        selfieMode: true,
      });
      
      pose.onResults((results) => {
        if (results.poseLandmarks) {
          handlePoseResults(results.poseLandmarks);
        }
      });
      
      poseRef.current = pose;
      
      if (videoRef.current) {
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (poseRef.current && videoRef.current) {
              try {
                await poseRef.current.send({ image: videoRef.current });
              } catch (_) {}
            }
          },
          width: 640,
          height: 480,
        });
        
        await camera.start();
        cameraRef.current = camera;
        setIsCameraReady(true);
        setPoseLoading(false);
      }
    } catch (err) {
      console.error('[RehabSlicer] Pose initialization error:', err);
      setPoseError(err.message || 'Failed to initialize camera');
      setPoseLoading(false);
    }
  }, [loadMediaPipeScripts]);
  
  // ============================================================
  // POSE RESULTS HANDLER
  // ============================================================
  
  const handlePoseResults = useCallback((landmarks) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Extract landmarks
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const nose = landmarks[0];
    
    if (!leftWrist || !rightWrist) return;
    
    // Convert to canvas coordinates
    const width = canvas.width;
    const height = canvas.height;
    
    const toCanvas = (lm) => ({
      x: (1 - lm.x) * width,
      y: lm.y * height,
      z: lm.z || 0,
      visibility: lm.visibility || 1,
    });
    
    const leftWristPos = toCanvas(leftWrist);
    const rightWristPos = toCanvas(rightWrist);
    const leftElbowPos = toCanvas(leftElbow);
    const rightElbowPos = toCanvas(rightElbow);
    const leftShoulderPos = toCanvas(leftShoulder);
    const rightShoulderPos = toCanvas(rightShoulder);
    const nosePos = toCanvas(nose);
    
    // Determine active arm
    const leftDist = Math.hypot(leftWristPos.x - nosePos.x, leftWristPos.y - nosePos.y);
    const rightDist = Math.hypot(rightWristPos.x - nosePos.x, rightWristPos.y - nosePos.y);
    
    let activeWrist = null;
    let activeElbow = null;
    let activeShoulder = null;
    let armSide = 'none';
    
    if (leftWrist.visibility > 0.5 && leftDist < rightDist) {
      activeWrist = leftWristPos;
      activeElbow = leftElbowPos;
      activeShoulder = leftShoulderPos;
      armSide = 'left';
    } else if (rightWrist.visibility > 0.5) {
      activeWrist = rightWristPos;
      activeElbow = rightElbowPos;
      activeShoulder = rightShoulderPos;
      armSide = 'right';
    }
    
    if (!activeWrist) {
      isWristTrackingRef.current = false;
      return;
    }
    
    setCurrentArm(armSide);
    isWristTrackingRef.current = true;
    
    // Track movement
    if (currentWristRef.current) {
      const dist = Math.hypot(
        activeWrist.x - currentWristRef.current.x,
        activeWrist.y - currentWristRef.current.y
      );
      totalMovementRef.current += dist;
    }
    
    // Calculate ROM (arm extension angle)
    if (activeElbow && activeShoulder) {
      const shoulderToElbow = {
        x: activeElbow.x - activeShoulder.x,
        y: activeElbow.y - activeShoulder.y,
      };
      const elbowToWrist = {
        x: activeWrist.x - activeElbow.x,
        y: activeWrist.y - activeElbow.y,
      };
      
      const angle = Math.atan2(
        elbowToWrist.y * shoulderToElbow.x - elbowToWrist.x * shoulderToElbow.y,
        elbowToWrist.x * shoulderToElbow.x + elbowToWrist.y * shoulderToElbow.y
      );
      
      const degrees = Math.abs(angle * 180 / Math.PI);
      const romValue = Math.min(180, degrees);
      
      romValuesRef.current.push(romValue);
      if (romValue > maxRomRef.current) maxRomRef.current = romValue;
      if (armSide === 'left') leftArmRomRef.current = Math.max(leftArmRomRef.current, romValue);
      else rightArmRomRef.current = Math.max(rightArmRomRef.current, romValue);
      
      // Track arm extension distance
      const extension = Math.hypot(
        activeWrist.x - activeShoulder.x,
        activeWrist.y - activeShoulder.y
      );
      armExtensionRef.current = Math.max(armExtensionRef.current, extension);
    }
    
    // Wrist history for smoothness
    wristPositionsRef.current.push({ ...activeWrist, t: performance.now() });
    if (wristPositionsRef.current.length > 30) {
      wristPositionsRef.current.shift();
    }
    
    // Calculate smoothness
    if (wristPositionsRef.current.length > 10) {
      let jerkSum = 0;
      let count = 0;
      for (let i = 3; i < wristPositionsRef.current.length; i++) {
        const dt = wristPositionsRef.current[i].t - wristPositionsRef.current[i-1].t;
        if (dt > 0) {
          const dx = wristPositionsRef.current[i].x - wristPositionsRef.current[i-1].x;
          const dy = wristPositionsRef.current[i].y - wristPositionsRef.current[i-1].y;
          const v = Math.sqrt(dx*dx + dy*dy) / dt;
          const prevDx = wristPositionsRef.current[i-1].x - wristPositionsRef.current[i-2].x;
          const prevDy = wristPositionsRef.current[i-1].y - wristPositionsRef.current[i-2].y;
          const prevV = Math.sqrt(prevDx*prevDx + prevDy*prevDy) / dt;
          jerkSum += Math.abs(v - prevV) / dt;
          count++;
        }
      }
      if (count > 0) {
        const smoothnessVal = 1 / (1 + jerkSum / count);
        smoothnessValuesRef.current.push(smoothnessVal);
        setSmoothness(Math.round(smoothnessVal * 100));
      }
    }
    
    // Update trail
    if (gameState === 'playing') {
      trailPointsRef.current.push({ ...activeWrist });
      if (trailPointsRef.current.length > CONFIG.TRAIL_LENGTH) {
        trailPointsRef.current.shift();
      }
    }
    
    // Detect balloon hit
    if (gameState === 'playing' && balloonRef.current && !isHitProcessedRef.current) {
      const balloon = balloonRef.current;
      
      // Calculate distance from wrist movement line to balloon center
      if (prevWristRef.current) {
        const speed = Math.hypot(
          activeWrist.x - prevWristRef.current.x,
          activeWrist.y - prevWristRef.current.y
        );
        
        if (speed > 1) {
          const hit = detectHit(
            prevWristRef.current.x,
            prevWristRef.current.y,
            activeWrist.x,
            activeWrist.y,
            balloon
          );
          
          if (hit) {
            handleHit();
          }
        }
      }
    }
    
    prevWristRef.current = currentWristRef.current;
    currentWristRef.current = activeWrist;
    
  }, [gameState]);
  
  // ============================================================
  // HIT DETECTION
  // ============================================================
  
  const detectHit = useCallback((x1, y1, x2, y2, balloon) => {
    if (!balloon || !balloon.active) return false;
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    
    if (lenSq === 0) return false;
    
    let t = ((balloon.x - x1) * dx + (balloon.y - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    
    const dist = Math.sqrt(
      (balloon.x - closestX) ** 2 +
      (balloon.y - closestY) ** 2
    );
    
    const hitRadius = balloon.radius * CONFIG.HIT_TOLERANCE;
    return dist < hitRadius;
  }, []);
  
  // ============================================================
  // BALLOON SYSTEM
  // ============================================================
  
  const spawnBalloon = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const colors = BALLOON_COLORS;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const radius = difficultySizeRef.current * (0.7 + Math.random() * 0.3);
    const x = radius + Math.random() * (canvas.width - radius * 2);
    const y = -radius - 20;
    const speed = difficultySpeedRef.current * (1.0 + Math.random() * 0.6);
    
    balloonRef.current = {
      id: Date.now() + Math.random(),
      x,
      y,
      radius,
      color: color.color,
      glow: color.glow,
      label: color.label,
      speed,
      active: true,
      hit: false,
      missed: false,
      spawnTime: performance.now(),
    };
    
    balloonSpawnTimeRef.current = performance.now();
    isHitProcessedRef.current = false;
    setBalloonPopup(null);
  }, []);
  
  const handleHit = useCallback(() => {
    if (!balloonRef.current || isHitProcessedRef.current) return;
    const balloon = balloonRef.current;
    
    isHitProcessedRef.current = true;
    balloon.hit = true;
    balloon.active = false;
    
    // Update metrics
    hitCountRef.current++;
    sliceCountRef.current++;
    const reactionTime = (performance.now() - balloon.spawnTime) / 1000;
    reactionTimesRef.current.push(reactionTime);
    
    // Combo
    const now = performance.now();
    if (now - lastHitTimeRef.current < 1500) {
      comboCountRef.current++;
    } else {
      comboCountRef.current = 1;
    }
    lastHitTimeRef.current = now;
    setComboDisplay(comboCountRef.current);
    
    // Calculate ROM score for this hit
    const currentRom = romValuesRef.current.length > 0 
      ? romValuesRef.current[romValuesRef.current.length - 1] 
      : 0;
    const romBonus = Math.round(currentRom * CONFIG.ROM_BONUS_MULTIPLIER);
    
    // Score
    const points = CONFIG.BASE_SCORE + 
      Math.round(currentRom * 0.3) + 
      (comboCountRef.current > 1 ? comboCountRef.current * 2 : 0);
    
    totalScoreRef.current += points;
    setScore(totalScoreRef.current);
    setHits(hitCountRef.current);
    setSlices(sliceCountRef.current);
    
    // Update average reaction time
    if (reactionTimesRef.current.length > 0) {
      const avg = reactionTimesRef.current.reduce((a, b) => a + b, 0) / reactionTimesRef.current.length;
      setAvgReaction(Math.round(avg * 1000));
    }
    
    // Update ROM
    const avgRom = romValuesRef.current.length > 0
      ? romValuesRef.current.reduce((a, b) => a + b, 0) / romValuesRef.current.length
      : 0;
    setRom(Math.round(avgRom));
    setMaxRom(Math.round(maxRomRef.current));
    
    // Create pop effect
    createPopEffect(balloon.x, balloon.y, balloon.color);
    
    // Show popup
    setBalloonPopup({
      text: '🎈 POP!',
      points: `+${points}`,
      combo: comboCountRef.current > 1 ? `x${comboCountRef.current}` : '',
      x: balloon.x,
      y: balloon.y - 40,
    });
    
    // Schedule next balloon
    setTimeout(() => {
      if (gameState === 'playing') {
        spawnBalloon();
      }
    }, CONFIG.SPAWN_DELAY);
    
    // Update difficulty
    updateDifficulty();
    
  }, [gameState]);
  
  const handleMiss = useCallback(() => {
    if (!balloonRef.current || isHitProcessedRef.current) return;
    const balloon = balloonRef.current;
    
    isHitProcessedRef.current = true;
    balloon.missed = true;
    balloon.active = false;
    
    missCountRef.current++;
    comboCountRef.current = 0;
    setComboDisplay(0);
    setMisses(missCountRef.current);
    
    // Update accuracy
    const total = hitCountRef.current + missCountRef.current;
    setAccuracy(Math.round((hitCountRef.current / total) * 100));
    
    // Show miss effect
    setBalloonPopup({
      text: '💨 Miss!',
      points: '',
      combo: '',
      x: balloon.x,
      y: balloon.y - 20,
    });
    
    // Schedule next balloon
    setTimeout(() => {
      if (gameState === 'playing') {
        spawnBalloon();
      }
    }, CONFIG.SPAWN_DELAY);
    
    updateDifficulty();
    
  }, [gameState]);
  
  // ============================================================
  // DIFFICULTY ADAPTATION
  // ============================================================
  
  const updateDifficulty = useCallback(() => {
    const total = hitCountRef.current + missCountRef.current;
    if (total < 3) return;
    
    const accuracyRate = (hitCountRef.current / total) * 100;
    
    if (accuracyRate > CONFIG.TARGET_ACCURACY) {
      // Increase difficulty
      difficultySpeedRef.current = Math.min(
        CONFIG.SPEED_MAX,
        difficultySpeedRef.current + CONFIG.SPEED_ADJUSTMENT
      );
      difficultySizeRef.current = Math.max(
        CONFIG.BALLOON_MIN_RADIUS,
        difficultySizeRef.current - CONFIG.SIZE_ADJUSTMENT
      );
    } else if (accuracyRate < CONFIG.TARGET_ACCURACY - 20) {
      // Decrease difficulty
      difficultySpeedRef.current = Math.max(
        CONFIG.SPEED_MIN,
        difficultySpeedRef.current - CONFIG.SPEED_ADJUSTMENT * 1.5
      );
      difficultySizeRef.current = Math.min(
        CONFIG.BALLOON_MAX_RADIUS,
        difficultySizeRef.current + CONFIG.SIZE_ADJUSTMENT
      );
    }
    
    // Update difficulty label
    const speedRatio = (difficultySpeedRef.current - CONFIG.SPEED_MIN) / (CONFIG.SPEED_MAX - CONFIG.SPEED_MIN);
    if (speedRatio < 0.33) setCurrentDifficulty('Beginner');
    else if (speedRatio < 0.66) setCurrentDifficulty('Intermediate');
    else setCurrentDifficulty('Advanced');
    
  }, []);
  
  // ============================================================
  // POP EFFECT
  // ============================================================
  
  const createPopEffect = useCallback((x, y, color) => {
    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        radius: 2 + Math.random() * 5,
        life: 40 + Math.random() * 30,
        maxLife: 70,
        color,
        gravity: 0.15,
      });
    }
    
    // Shockwave ring
    popEffectsRef.current.push({
      x,
      y,
      radius: 10,
      maxRadius: 80,
      life: 30,
      maxLife: 30,
    });
  }, []);
  
  // ============================================================
  // UPDATE GAME
  // ============================================================
  
  const updateGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const height = canvas.height;
    
    // Update balloon
    const balloon = balloonRef.current;
    if (balloon && balloon.active) {
      balloon.y += balloon.speed;
      
      // Check for miss (reached bottom)
      if (balloon.y + balloon.radius >= height && !isHitProcessedRef.current) {
        handleMiss();
      }
    }
    
    // Update particles
    for (const p of particlesRef.current) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity || 0.1;
      p.life -= 1;
      p.radius *= 0.98;
    }
    particlesRef.current = particlesRef.current.filter(p => p.life > 0 && p.radius > 0.5);
    
    // Update pop effects
    for (const e of popEffectsRef.current) {
      e.radius += (e.maxRadius - e.radius) * 0.08;
      e.life -= 1;
    }
    popEffectsRef.current = popEffectsRef.current.filter(e => e.life > 0);
    
    // Update balloon popups
    if (balloonPopup) {
      // Auto-clear after delay
    }
    
    // Update accuracy
    const total = hitCountRef.current + missCountRef.current;
    if (total > 0) {
      setAccuracy(Math.round((hitCountRef.current / total) * 100));
    }
    
    // Update therapy score
    const accScore = accuracy / 100;
    const romScore = Math.min(1, (rom / 180));
    const reactScore = Math.min(1, 1 / (avgReaction / 1000 + 0.1));
    const smoothScore = smoothness / 100;
    
    const therapy = Math.round(
      (accScore * 0.35 + romScore * 0.25 + reactScore * 0.2 + smoothScore * 0.2) * 100
    );
    setTherapyScore(Math.min(100, therapy));
    
  }, [accuracy, rom, avgReaction, smoothness, handleMiss]);
  
  // ============================================================
  // RENDER
  // ============================================================
  
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0a0a1a');
    grad.addColorStop(0.5, '#141428');
    grad.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    
    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    for (let i = 0; i < height; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }
    
    // Draw balloon
    const balloon = balloonRef.current;
    if (balloon && balloon.active) {
      ctx.save();
      ctx.translate(balloon.x, balloon.y);
      
      // Glow
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, balloon.radius * 2);
      glow.addColorStop(0, balloon.glow || 'rgba(255,255,255,0.1)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, balloon.radius * 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Balloon body
      ctx.shadowColor = balloon.color;
      ctx.shadowBlur = 30;
      ctx.fillStyle = balloon.color + '40';
      ctx.strokeStyle = balloon.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, balloon.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      
      // String
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(0, balloon.radius);
      ctx.lineTo(0, balloon.radius + 30);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Shine
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.ellipse(-balloon.radius * 0.25, -balloon.radius * 0.25, balloon.radius * 0.3, balloon.radius * 0.2, -0.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = `${balloon.radius * 0.5}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(balloon.label || '🎈', 0, 4);
      
      ctx.restore();
    }
    
    // Draw particles
    for (const p of particlesRef.current) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.radius * alpha), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    
    // Draw pop effects
    for (const e of popEffectsRef.current) {
      const alpha = e.life / e.maxLife;
      ctx.globalAlpha = alpha * 0.3;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    
    // Draw trail
    if (trailPointsRef.current.length > 1) {
      const points = trailPointsRef.current;
      const len = points.length;
      
      for (let i = 1; i < len; i++) {
        const alpha = i / len;
        const size = 1 + alpha * 8;
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.shadowColor = '#a78bfa';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.moveTo(points[i - 1].x, points[i - 1].y);
        ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    }
    
    // Wrist indicator
    if (currentWristRef.current && gameState === 'playing') {
      const w = currentWristRef.current;
      ctx.fillStyle = '#a78bfa';
      ctx.shadowColor = '#a78bfa';
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(currentArm === 'left' ? '← L' : currentArm === 'right' ? 'R →' : '', w.x, w.y - 12);
    }
    
    // Balloon popup
    if (balloonPopup) {
      const elapsed = performance.now() - balloonPopup._time || 0;
      const alpha = Math.max(0, 1 - elapsed / 1000);
      const yOffset = Math.min(80, elapsed * 0.08);
      
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffd700';
      ctx.font = `bold ${balloonPopup.text.includes('POP') ? 36 : 28}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255,215,0,0.3)';
      ctx.shadowBlur = 20;
      ctx.fillText(balloonPopup.text, balloonPopup.x, balloonPopup.y - yOffset);
      
      if (balloonPopup.points) {
        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(balloonPopup.points, balloonPopup.x, balloonPopup.y - yOffset - 40);
      }
      if (balloonPopup.combo) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(balloonPopup.combo, balloonPopup.x + 50, balloonPopup.y - yOffset - 30);
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    
    // Rest zone indicator
    const restY = height - 40;
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(width * 0.2, restY);
    ctx.lineTo(width * 0.8, restY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(167, 139, 250, 0.06)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('— REST ZONE —', width / 2, restY - 6);
    
  }, [gameState, balloonPopup, currentWristRef, currentArm]);
  
  // ============================================================
  // GAME LOOP
  // ============================================================
  
  const gameLoop = useCallback(() => {
    updateGame();
    render();
    frameCountRef.current += 1;
    animationRef.current = requestAnimationFrame(gameLoop);
  }, [updateGame, render]);
  
  // ============================================================
  // GAME STATE MANAGEMENT
  // ============================================================
  
  const startGame = useCallback(() => {
    // Reset all metrics
    hitCountRef.current = 0;
    missCountRef.current = 0;
    sliceCountRef.current = 0;
    totalScoreRef.current = 0;
    reactionTimesRef.current = [];
    romValuesRef.current = [];
    smoothnessValuesRef.current = [];
    comboCountRef.current = 0;
    totalMovementRef.current = 0;
    armExtensionRef.current = 0;
    maxRomRef.current = 0;
    leftArmRomRef.current = 0;
    rightArmRomRef.current = 0;
    romSamplesRef.current = [];
    isHitProcessedRef.current = false;
    difficultySpeedRef.current = CONFIG.SPEED_MIN + (CONFIG.SPEED_MAX - CONFIG.SPEED_MIN) * 0.6;
    difficultySizeRef.current = CONFIG.BALLOON_MAX_RADIUS - 5;
    
    setScore(0);
    setHits(0);
    setMisses(0);
    setSlices(0);
    setAccuracy(0);
    setTherapyScore(0);
    setAvgReaction(0);
    setRom(0);
    setSmoothness(0);
    setMaxRom(0);
    setComboDisplay(0);
    setCurrentDifficulty('Beginner');
    setBalloonPopup(null);
    
    particlesRef.current = [];
    trailPointsRef.current = [];
    popEffectsRef.current = [];
    wristPositionsRef.current = [];
    currentWristRef.current = null;
    prevWristRef.current = null;
    isWristTrackingRef.current = false;
    balloonRef.current = null;
    
    sessionStartRef.current = performance.now();
    setGameState('playing');
    
    // Spawn first balloon after short delay
    setTimeout(() => {
      if (gameState === 'playing' || gameState === 'start') {
        spawnBalloon();
      }
    }, 500);
  }, [spawnBalloon]);
  
  const endGame = useCallback(() => {
    setGameState('result');
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    const total = hitCountRef.current + missCountRef.current;
    const accuracyVal = total > 0 ? Math.round((hitCountRef.current / total) * 100) : 0;
    const avgRom = romValuesRef.current.length > 0
      ? Math.round(romValuesRef.current.reduce((a, b) => a + b, 0) / romValuesRef.current.length)
      : 0;
    const avgReactionVal = reactionTimesRef.current.length > 0
      ? Math.round((reactionTimesRef.current.reduce((a, b) => a + b, 0) / reactionTimesRef.current.length) * 1000)
      : 0;
    const avgSmoothness = smoothnessValuesRef.current.length > 0
      ? Math.round((smoothnessValuesRef.current.reduce((a, b) => a + b, 0) / smoothnessValuesRef.current.length) * 100)
      : 0;
    
    const summary = {
      score: totalScoreRef.current,
      hits: hitCountRef.current,
      misses: missCountRef.current,
      slices: sliceCountRef.current,
      accuracy: accuracyVal,
      maxRom: Math.round(maxRomRef.current),
      avgRom: avgRom,
      avgReactionTime: avgReactionVal,
      avgSmoothness: avgSmoothness,
      leftArmRom: Math.round(leftArmRomRef.current),
      rightArmRom: Math.round(rightArmRomRef.current),
      therapyScore: therapyScore,
      difficulty: currentDifficulty,
      gameType: gameId,
      exerciseResults: [{
        exerciseId: gameId,
        name: gameName,
        repsCompleted: total,
        accuracy: accuracyVal,
        score: totalScoreRef.current,
      }],
    };
    
    onSessionEnd?.(summary);
  }, [therapyScore, currentDifficulty, gameId, gameName, onSessionEnd]);
  
  const restartGame = useCallback(() => {
    setGameState('start');
    balloonRef.current = null;
    particlesRef.current = [];
    trailPointsRef.current = [];
    popEffectsRef.current = [];
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);
  
  // ============================================================
  // CANVAS SETUP
  // ============================================================
  
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);
  
  // ============================================================
  // INITIALIZE POSE
  // ============================================================
  
  useEffect(() => {
    initializePose();
    return () => {
      if (cameraRef.current) {
        try { cameraRef.current.stop(); } catch (_) {}
        cameraRef.current = null;
      }
      if (poseRef.current) {
        try { poseRef.current.close(); } catch (_) {}
        poseRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [initializePose]);
  
  // ============================================================
  // START GAME LOOP
  // ============================================================
  
  useEffect(() => {
    if (gameState === 'start' || gameState === 'result') {
      const loop = () => {
        render();
        animationRef.current = requestAnimationFrame(loop);
      };
      animationRef.current = requestAnimationFrame(loop);
    } else if (gameState === 'playing') {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      animationRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameState, gameLoop, render]);
  
  // ============================================================
  // EXPOSE QA ADAPTER
  // ============================================================
  
  useEffect(() => {
    if (!import.meta.env.DEV || !qaAdapterRef) return;
    qaAdapterRef.current = {
      startGame,
      endGame,
      restartGame,
      spawnBalloon,
      getState: () => ({
        score: totalScoreRef.current,
        hits: hitCountRef.current,
        misses: missCountRef.current,
        slices: sliceCountRef.current,
        accuracy,
        rom,
        maxRom: maxRomRef.current,
        avgReaction,
        smoothness,
        therapyScore,
        gameState,
        balloon: balloonRef.current,
      }),
      injectWristPosition: (x, y) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const pos = { x: x * canvas.width, y: y * canvas.height };
        if (!currentWristRef.current) {
          currentWristRef.current = pos;
        } else {
          prevWristRef.current = currentWristRef.current;
          currentWristRef.current = pos;
          isWristTrackingRef.current = true;
        }
      },
      cleanup: () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        if (cameraRef.current) { try { cameraRef.current.stop(); } catch (_) {} }
        if (poseRef.current) { try { poseRef.current.close(); } catch (_) {} }
      },
    };
    return () => { if (qaAdapterRef) qaAdapterRef.current = null; };
  }, [qaAdapterRef, accuracy, rom, avgReaction, smoothness, therapyScore, gameState, startGame, endGame, restartGame, spawnBalloon]);
  
  // ============================================================
  // RENDER UI
  // ============================================================
  
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[600px] bg-slate-950 overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      {/* Video (hidden) */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
        autoPlay
      />
      
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
      
      {/* Camera status */}
      {poseLoading && (
        <div className="absolute bottom-4 left-4 z-10 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-slate-400">
          ⏳ Initializing camera...
        </div>
      )}
      {poseError && (
        <div className="absolute bottom-4 left-4 z-10 bg-red-900/70 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-red-300">
          ⚠️ {poseError}
        </div>
      )}
      {isCameraReady && gameState !== 'result' && (
        <div className="absolute bottom-4 left-4 z-10 bg-green-900/70 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-green-300">
          ● Camera ready
        </div>
      )}
      
      {/* HUD - Playing */}
      {gameState === 'playing' && (
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-10">
          <div className="flex gap-3 flex-wrap">
            <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 min-w-[60px]">
              <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Score</div>
              <div className="text-xl font-bold text-amber-400">{score}</div>
            </div>
            <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 min-w-[60px]">
              <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Hits</div>
              <div className="text-xl font-bold text-emerald-400">{hits}</div>
            </div>
            <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 min-w-[60px]">
              <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Misses</div>
              <div className="text-xl font-bold text-red-400">{misses}</div>
            </div>
            <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 min-w-[60px]">
              <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">ROM</div>
              <div className="text-xl font-bold text-violet-400">{rom}°</div>
            </div>
            {comboDisplay > 1 && (
              <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 border border-amber-500/30">
                <div className="text-[8px] font-bold text-amber-400 uppercase tracking-wider">Combo</div>
                <div className="text-xl font-bold text-amber-400">×{comboDisplay}</div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 text-center min-w-[50px]">
              <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Level</div>
              <div className="text-sm font-bold text-white">{currentDifficulty}</div>
            </div>
            <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 text-center min-w-[50px]">
              <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Therapy</div>
              <div className="text-sm font-bold text-teal-400">{therapyScore}%</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Result Screen */}
      {gameState === 'result' && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/85 backdrop-blur-md">
          <div className="bg-slate-900 rounded-2xl p-8 max-w-md w-full text-center border border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="text-5xl mb-2">🏆</div>
            <h2 className="text-2xl font-bold text-white mb-1">Session Complete!</h2>
            <p className="text-slate-400 text-sm mb-4">Great work on your rehabilitation</p>
            
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-slate-800 rounded-xl p-2">
                <div className="text-[9px] text-slate-400">Score</div>
                <div className="text-lg font-bold text-amber-400">{score}</div>
              </div>
              <div className="bg-slate-800 rounded-xl p-2">
                <div className="text-[9px] text-slate-400">Accuracy</div>
                <div className="text-lg font-bold text-emerald-400">{accuracy}%</div>
              </div>
              <div className="bg-slate-800 rounded-xl p-2">
                <div className="text-[9px] text-slate-400">Therapy</div>
                <div className="text-lg font-bold text-teal-400">{therapyScore}%</div>
              </div>
              <div className="bg-slate-800 rounded-xl p-2">
                <div className="text-[9px] text-slate-400">Hits</div>
                <div className="text-base font-bold text-white">{hits}</div>
              </div>
              <div className="bg-slate-800 rounded-xl p-2">
                <div className="text-[9px] text-slate-400">Misses</div>
                <div className="text-base font-bold text-red-400">{misses}</div>
              </div>
              <div className="bg-slate-800 rounded-xl p-2">
                <div className="text-[9px] text-slate-400">Slices</div>
                <div className="text-base font-bold text-violet-400">{slices}</div>
              </div>
              <div className="bg-slate-800 rounded-xl p-2">
                <div className="text-[9px] text-slate-400">Max ROM</div>
                <div className="text-base font-bold text-cyan-400">{maxRom}°</div>
              </div>
              <div className="bg-slate-800 rounded-xl p-2">
                <div className="text-[9px] text-slate-400">Reaction</div>
                <div className="text-base font-bold text-orange-400">{avgReaction}ms</div>
              </div>
              <div className="bg-slate-800 rounded-xl p-2">
                <div className="text-[9px] text-slate-400">Smoothness</div>
                <div className="text-base font-bold text-indigo-400">{smoothness}%</div>
              </div>
            </div>
            
            <button
              onClick={restartGame}
              className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-bold text-white text-lg transition-colors"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
      
      {/* Start Screen */}
      {gameState === 'start' && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/85 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-2xl p-8 max-w-md w-full text-center border border-slate-700">
            <div className="text-5xl mb-2">🎈</div>
            <h1 className="text-3xl font-bold text-white mb-1">Balloon Slicer</h1>
            <p className="text-slate-400 text-sm mb-4">Pop balloons with arm movements</p>
            
            {/* Camera status */}
            <div className="bg-slate-800 rounded-xl p-3 mb-4">
              <div className="text-xs text-slate-400">
                {poseLoading ? (
                  <span className="text-yellow-400">⏳ Loading camera...</span>
                ) : poseError ? (
                  <span className="text-red-400">⚠️ {poseError}</span>
                ) : isCameraReady ? (
                  <span className="text-green-400">✅ Camera ready</span>
                ) : (
                  <span>⏳ Initializing...</span>
                )}
              </div>
            </div>
            
            <div className="text-left text-sm text-slate-300 mb-4 space-y-1 bg-slate-800/50 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">🎯</span>
                <span>Hit balloons by moving your arm through them</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-amber-400">⏱️</span>
                <span>Faster hits = higher combo bonus</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-violet-400">🔄</span>
                <span>Return to rest zone between balloons</span>
              </div>
            </div>
            
            <button
              onClick={startGame}
              disabled={!isCameraReady || poseLoading}
              className={`w-full py-3 rounded-xl font-bold text-white text-lg transition-colors ${
                isCameraReady && !poseLoading
                  ? 'bg-violet-600 hover:bg-violet-500'
                  : 'bg-slate-700 cursor-not-allowed opacity-50'
              }`}
            >
              {poseLoading ? 'Loading...' : 'Start Session'}
            </button>
            
            <div className="mt-3 text-[10px] text-slate-500">
              Move your arm to pop balloons • One balloon at a time
            </div>
          </div>
        </div>
      )}
    </div>
  );
}