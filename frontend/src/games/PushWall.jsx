// frontend/src/games/PushWall.jsx
import { OneEuro } from "../utils/oneEuro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";

import useMediaPipeUpperBody from "../hooks/useMediaPipeUpperBody";
import usePostureGuidance from "../hooks/usePostureGuidance";
import useFacialPainDetection from "../hooks/useFacialPainDetection";
import useAdaptiveDifficulty from "../hooks/useAdaptiveDifficulty";
import { useGameEngine, GAME_STATES } from "../hooks/useGameEngine";
import { useSessionTelemetry } from "../hooks/useSessionTelemetry";
import { useAudioFeedback } from "../hooks/useAudioFeedback";
import SkeletonOverlay from "../components/rehab/SkeletonOverlay";
import SessionSummary from "../components/rehab/SessionSummary";
import SessionCheckpoint from "../components/rehab/SessionCheckpoint";
import MetricsEngine from "../utils/metricsEngine";
import PushDemo from "../components/rehab/PushDemo";
import { createPushDetector, symmetryFromGap } from "../utils/pushDetector";
import { createPushWallGame } from "./pushWallScene";

const SESSION_SECONDS = 120;

// Pushes per round. A round ends after this many walls have been resolved
// (pushed back or breached). Comfortable rounds step up 4 -> 6 -> 8;
// struggling rounds step back down.
const ROUND_SIZES = [4, 6, 8];

// --- Bilateral push detection -------------------------------------------
// Uses shoulder ELEVATION (0 = arm at side, ~90 = shoulder height, ~180 =
// overhead). A push fires once, early in the raising stroke (see
// utils/pushDetector.js), so lowering the arms never counts.
//
// The difficulty tolerance (10/6/4) is reinterpreted as an allowed degree gap
// between the left and right arm during the push; multiplying by 3 gives a
// workable angular band per level.
const SYMMETRY_DEGREE_SCALE = 3;

export default function PushWall({ onSessionEnd, patientId, gameId = "push-wall" }) {
  const videoRef = useRef(null);
  const phaserContainerRef = useRef(null);
  const phaserGameRef = useRef(null);
  const sceneRef = useRef(null);

  const [poseData, setPoseData] = useState(null);
  const [score, setScore] = useState(0);
  const [pushes, setPushes] = useState(0);
  const [breaches, setBreaches] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [lastSymmetryPct, setLastSymmetryPct] = useState(100);
  const [feedbackFlash, setFeedbackFlash] = useState(null);
  const [repData, setRepData] = useState([]);

  // --- Round progression ---
  const [roundNumber, setRoundNumber] = useState(1);
  const [roundTarget, setRoundTarget] = useState(ROUND_SIZES[0]);
  const [roundDots, setRoundDots] = useState([]); // 'hit' | 'miss' per resolved wall
  const [roundBanner, setRoundBanner] = useState(null);
  const roundTargetRef = useRef(ROUND_SIZES[0]);
  const roundHitsRef = useRef(0);
  const roundMissesRef = useRef(0);
  const roundSymRef = useRef([]);
  const roundsCompletedRef = useRef(0);
  const highestRoundSizeRef = useRef(ROUND_SIZES[0]);
  const papsScoreRef = useRef(0);
  const recordRoundOutcomeRef = useRef(null);

  const detectorRef = useRef(createPushDetector());
  const [armAngle, setArmAngle] = useState(0);
  const restRef = useRef({ left: null, right: null });
  const handFiltRef = useRef({
    left: { x: new OneEuro(0.6, 0.05), y: new OneEuro(0.6, 0.05) },
    right: { x: new OneEuro(0.6, 0.05), y: new OneEuro(0.6, 0.05) },
    lastL: { v: null },
    lastR: { v: null },
  });
  const minAngleRef = useRef(null);
  const maxAngleRef = useRef(0);
  const hasEndedRef = useRef(false);
  const symmetrySamplesRef = useRef([]);
  const metricsEngine = useRef(new MetricsEngine());

  const { isActive } = useMediaPipeUpperBody({
    videoRef,
    onPoseUpdate: setPoseData,
  });

  const guidance = usePostureGuidance(poseData);
  const { papsScore, isPainDetected, resetPainState } = useFacialPainDetection({ videoRef });
  const { currentDifficulty, settings, adapt } = useAdaptiveDifficulty();
  const telemetry = useSessionTelemetry(patientId, gameId);
  const audio = useAudioFeedback(true);

  const accuracy = useMemo(() => {
    const attempts = pushes + breaches;
    return attempts ? Math.round((pushes / attempts) * 100) : null;
  }, [pushes, breaches]);

  const missRate = useMemo(() => {
    const attempts = pushes + breaches;
    return attempts ? Math.round((breaches / attempts) * 100) : 0;
  }, [pushes, breaches]);

  const avgSymmetry = useMemo(() => {
    const samples = symmetrySamplesRef.current;
    if (!samples.length) return null;
    return Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 100);
  }, [pushes]);

  const romDegrees = useMemo(() => {
    if (minAngleRef.current === null) return 0;
    return Math.max(0, Math.round(maxAngleRef.current - minAngleRef.current));
  }, [poseData]);

  const engine = useGameEngine({
    sessionLength: SESSION_SECONDS,
    // Continuous, timer-driven — same reasoning as Rehab Slicer: waves spawn
    // on Phaser's own clock, not on useGameEngine's per-rep FEEDBACK/REST
    // cycle, so totalReps stays 0 and gameState remains ACTIVE throughout.
    totalReps: 0,
    onRepComplete: (success, data) => {
      telemetry.recordRep(success, data);
      if (success) audio.playSuccess();
      else audio.playMiss();
    },
    onSessionComplete: () => {
      finalizeTelemetry();
    },
  });

  const {
    gameState,
    countdown,
    timeLeft,
    isPaused,
    startSession,
    pauseSession,
    resumeSession,
    completeRep,
    endSession,
  } = engine;

  // --- latest-value refs, so the Phaser event sink and pose-update
  // callback (neither of which are React render-driven) always read fresh
  // state without needing to be re-subscribed every render. Same pattern
  // RehabSlicer uses for its rAF loop, applied here to the Phaser bridge.
  const comboRef = useRef(combo);
  const bestComboRef = useRef(bestCombo);
  const scoreRef = useRef(score);
  const currentDifficultyRef = useRef(currentDifficulty);
  const settingsRef = useRef(settings);
  const isPausedRef = useRef(isPaused);
  const gameStateRef = useRef(gameState);
  const completeRepRef = useRef(completeRep);

  comboRef.current = combo;
  bestComboRef.current = bestCombo;
  scoreRef.current = score;
  currentDifficultyRef.current = currentDifficulty;
  settingsRef.current = settings;
  isPausedRef.current = isPaused;
  gameStateRef.current = gameState;
  completeRepRef.current = completeRep;
  papsScoreRef.current = papsScore;

  // Called once per resolved wall ('hit' = pushed back, 'miss' = breached).
  // When a round's worth of walls is resolved, decide the next round's size
  // from how the patient did: hit rate, left-right evenness and pain score.
  recordRoundOutcomeRef.current = (kind, symmetry) => {
    if (kind === "hit") {
      roundHitsRef.current += 1;
      if (typeof symmetry === "number") roundSymRef.current.push(symmetry);
    } else {
      roundMissesRef.current += 1;
    }
    setRoundDots((d) => [...d, kind]);

    const hits = roundHitsRef.current;
    const resolved = hits + roundMissesRef.current;
    if (resolved < roundTargetRef.current) return;

    const hitRate = hits / resolved;
    const syms = roundSymRef.current;
    const avgSym = syms.length ? syms.reduce((a, b) => a + b, 0) / syms.length : 0;
    const pain = papsScoreRef.current ?? 0;
    const idx = ROUND_SIZES.indexOf(roundTargetRef.current);

    let nextIdx = idx;
    let note = "Good - same again";
    if (pain > 5 || hitRate < 0.5) {
      nextIdx = Math.max(0, idx - 1);
      note = nextIdx < idx ? "Taking it a little easier" : "Let's go again";
    } else if (hitRate >= 0.85 && avgSym >= 0.7 && pain < 3) {
      nextIdx = Math.min(ROUND_SIZES.length - 1, idx + 1);
      note = nextIdx > idx ? "Smooth and even - stepping up" : "Top level - keep it up";
    }

    const nextTarget = ROUND_SIZES[nextIdx];
    roundsCompletedRef.current += 1;
    highestRoundSizeRef.current = Math.max(highestRoundSizeRef.current, nextTarget);
    roundTargetRef.current = nextTarget;
    roundHitsRef.current = 0;
    roundMissesRef.current = 0;
    roundSymRef.current = [];

    setRoundTarget(nextTarget);
    setRoundNumber((n) => n + 1);
    setRoundDots([]);
    setRoundBanner({
      key: Date.now(),
      title: `Round ${roundsCompletedRef.current} complete`,
      sub: `${hits} of ${resolved} walls pushed back - next round: ${nextTarget} pushes`,
      note,
    });
    setTimeout(() => setRoundBanner(null), 2600);
  };

  const flashFeedback = useCallback((type, label) => {
    setFeedbackFlash({ key: Date.now(), type, label });
    setTimeout(() => setFeedbackFlash((f) => (f?.label === label ? null : f)), 500);
  }, []);

  // ---------------- Phaser lifecycle ----------------

  const attachContainer = useCallback((el) => {
    phaserContainerRef.current = el;
    if (el && !phaserGameRef.current) {
      const game = createPushWallGame(el);
      phaserGameRef.current = game;

      game.events.once("ready", () => {
        const scene = game.scene.keys["PushWallScene"];
        sceneRef.current = scene;

        scene.attachEventSink((type, payload) => {
          if (type === "wall-breach") {
            setBreaches((b) => b + 1);
            setCombo(0);
            setRepData((r) => [...r, { success: false, romDegrees: 0, tier: payload.tier }]);
            completeRepRef.current?.(false, { tier: payload.tier });
            flashFeedback("miss", "MISS");
            recordRoundOutcomeRef.current?.("miss");
          } else if (type === "push-early") {
            flashFeedback("early", "TOO EARLY");
          }
          // 'push-hit' is scored synchronously in registerPushEvent() below
          // (registerPush() returns its result directly), so it isn't
          // handled again here to avoid double-counting.
        });
      });
    }
  }, [flashFeedback]);

  useEffect(() => {
    return () => {
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
        sceneRef.current = null;
      }
    };
  }, []);

  // Push difficulty settings into the scene whenever they change.
  useEffect(() => {
    sceneRef.current?.setDifficulty({
      spawnRate: settings.spawnRate,
      objectSize: settings.objectSize,
      speed: settings.speed,
      difficultyName: currentDifficulty,
    });
  }, [settings, currentDifficulty]);

  // Mirror pause state into the scene.
  useEffect(() => {
    sceneRef.current?.setPaused(isPaused || isPainDetected || gameState !== GAME_STATES.ACTIVE);
  }, [isPaused, isPainDetected, gameState]);

  // ---------------- pose -> hand markers + bilateral push detection -------

  useEffect(() => {
    if (!poseData?.raw) return;
    const { raw } = poseData;
    // Elevation per arm (0 at rest). Falls back to 180 - flexion if the hook
    // did not supply it.
    const leftRaw = typeof poseData.leftElevation === "number" ? poseData.leftElevation : 180 - poseData.leftFlexion;
    const rightRaw = typeof poseData.rightElevation === "number" ? poseData.rightElevation : 180 - poseData.rightFlexion;
    // Rest calibration: the camera/body never gives exactly 0 with arms down.
    // Learn each arm's resting reading (lowest steady value) and subtract it,
    // so "arms down" reads 0 and shoulder height still reads about 90.
    const rest = restRef.current;
    const learnRest = (side, v) => {
      if (v >= 50) return;
      if (rest[side] === null || v < rest[side]) rest[side] = v;
      else rest[side] += 0.01 * (v - rest[side]);
    };
    learnRest("left", leftRaw);
    learnRest("right", rightRaw);
    const adjust = (v, r) => {
      const base = Math.min(35, r ?? 0);
      const a = Math.max(0, ((v - base) * 90) / (90 - base));
      return a < 5 ? 0 : Math.min(180, a);
    };
    const leftElev = adjust(leftRaw, rest.left);
    const rightElev = adjust(rightRaw, rest.right);

    // Mirror to match the mirrored camera preview (scale-x-[-1]), same
    // convention SkeletonOverlay uses for its own canvas draw.
    const leftPct = raw.leftWrist?.visibility > 0.4
      ? { x: (1 - raw.leftWrist.x) * 100, y: raw.leftWrist.y * 100 }
      : null;
    const rightPct = raw.rightWrist?.visibility > 0.4
      ? { x: (1 - raw.rightWrist.x) * 100, y: raw.rightWrist.y * 100 }
      : null;

    // Steady the dots: One Euro filter plus a small dead zone so they do not
    // shake while your hands are still, but still follow fast movement.
    const hf = handFiltRef.current;
    const steady = (pct, f, last) => {
      if (!pct) { f.x.reset(); f.y.reset(); last.v = null; return null; }
      const t = performance.now();
      const x = f.x.filter(pct.x, t);
      const y = f.y.filter(pct.y, t);
      if (last.v && Math.hypot(x - last.v.x, y - last.v.y) < 0.35) return last.v;
      last.v = { x, y };
      return last.v;
    };
    sceneRef.current?.setHandPositions(
      steady(leftPct, hf.left, hf.lastL),
      steady(rightPct, hf.right, hf.lastR),
    );

    const avgFlexion = (leftElev + rightElev) / 2;
    setArmAngle(Math.round(avgFlexion));
    minAngleRef.current = minAngleRef.current === null ? avgFlexion : Math.min(minAngleRef.current, avgFlexion);
    maxAngleRef.current = Math.max(maxAngleRef.current, avgFlexion);

    if (gameStateRef.current !== GAME_STATES.ACTIVE || isPausedRef.current) return;

    const step = detectorRef.current.update(performance.now(), leftElev, rightElev);

    if (step.rearmed) {
      // Arms came back down: store the true peak of the stroke that just ended
      // as that push's range of motion.
      setRepData((r) => {
        let i = r.length - 1;
        while (i >= 0 && r[i].success !== true) i -= 1;
        if (i < 0) return r;
        const copy = r.slice();
        copy[i] = { ...copy[i], romDegrees: Math.max(copy[i].romDegrees || 0, Math.round(step.peak)) };
        return copy;
      });
    }

    if (step.fired) {
      const toleranceDeg = (settingsRef.current.tolerance || 6) * SYMMETRY_DEGREE_SCALE;
      const symmetry = symmetryFromGap(step.gapDeg, toleranceDeg);
      const force = step.force;
      const result = sceneRef.current?.registerPush(force, symmetry);

      setLastSymmetryPct(Math.round(symmetry * 100));
      symmetrySamplesRef.current.push(symmetry);
      if (symmetrySamplesRef.current.length > 200) symmetrySamplesRef.current.shift();

      if (result?.hit) {
        setPushes((p) => p + 1);
        setCombo((c) => {
          const next = c + 1;
          setBestCombo((b) => Math.max(b, next));
          return next;
        });
        const comboMultiplier = 1 + Math.min(2, Math.floor(comboRef.current / 3) * 0.5);
        const points = Math.round(result.value * comboMultiplier);
        setScore((s) => s + points);
        setRepData((r) => [
          ...r,
          { success: true, romDegrees: Math.round(avgFlexion), tier: result.tier, symmetry: Math.round(symmetry * 100) },
        ]);
        completeRepRef.current?.(true, { tier: result.tier, symmetry: Math.round(symmetry * 100) });
        recordRoundOutcomeRef.current?.("hit", symmetry);
        flashFeedback("hit", result.perfectSymmetry ? "PERFECT SYMMETRY" : comboRef.current >= 3 ? "GREAT PUSH" : "PUSH");
      } else {
        flashFeedback("early", "TOO EARLY");
      }

      // Periodic difficulty re-evaluation, same trigger shape as the other
      // games (accuracy/paps/combo/ROM/missRate).
      adapt({
        accuracy: accuracy ?? 0,
        papsScore,
        combo: comboRef.current,
        maxFlexionAngle: maxAngleRef.current,
        missRate,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poseData]);

  const finalizeTelemetry = useCallback(() => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
    const sessionStats = metricsEngine.current.getSessionStats();
    telemetry.endSession({
      gameName: "Push Wall",
      score: scoreRef.current,
      hits: pushes,
      misses: breaches,
      accuracy,
      missRate,
      bestCombo: bestComboRef.current,
      currentCombo: comboRef.current,
      romDegrees: sessionStats.averageRom || romDegrees,
      papsScore,
      difficulty: currentDifficultyRef.current,
      gameSpecific: {
        totalPushes: pushes,
        totalBreaches: breaches,
        avgSymmetryPercent: avgSymmetry,
        longestPushStreak: bestComboRef.current,
        repData: sessionStats.reps || repData,
      },
    });
  }, [telemetry, pushes, breaches, accuracy, missRate, papsScore, romDegrees, avgSymmetry, repData]);

  // ========== RENDER ==========

  if (gameState === GAME_STATES.INSTRUCTIONS) {
    return (
      <div className="min-h-screen bg-[#0B1120] p-8 text-white">
        <div className="max-w-4xl mx-auto">
          <h1 className="mb-2 text-3xl font-black">🛡️ Push Wall</h1>
          <p className="mb-6 text-slate-400">Push the wall back with both arms.</p>

          <div className="mb-4 grid items-center gap-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:grid-cols-[220px_1fr]">
            <PushDemo />
            <ol className="space-y-3 text-lg text-slate-200">
              <li><b className="text-orange-300">1.</b> Sit back so your shoulders show on the camera.</li>
              <li>
                <b className="text-orange-300">2.</b> When the wall reaches the red line, raise{" "}
                <b>both arms together</b> to shoulder height.
              </li>
              <li><b className="text-orange-300">3.</b> Lower your arms, then go again.</li>
            </ol>
          </div>

          <details className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
            <summary className="cursor-pointer font-bold text-white">How scoring works</summary>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-400">
              <li>Each wall you push back scores by block type: wood 10, stone 20, gold 40.</li>
              <li>Both arms level gives a PERFECT SYMMETRY bonus. Every 3 pushes in a row raises your multiplier (up to x3).</li>
              <li>A wall that reaches the red line is a breach and resets your combo.</li>
              <li>Each round is 4 pushes. Do them smoothly and the next round grows to 6, then 8.</li>
              <li>Cyan dot = left hand, orange dot = right hand. The line between them is green when your arms are level.</li>
            </ul>
            <div className="mt-3 text-slate-500">Trains: shoulder raising with both arms, and left-right symmetry.</div>
          </details>

          <div className="relative overflow-hidden rounded-2xl border-4 border-slate-800 aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full scale-x-[-1] object-cover"
            />
            <SkeletonOverlay poseData={poseData} overallStatus={guidance.overallStatus} />
            <div className="absolute left-4 top-4 rounded-lg bg-black/60 px-3 py-2 font-mono text-sm">
              Arms {armAngle}° · PAPS {papsScore}
            </div>
          </div>

          <div
            className={`mt-4 rounded-xl border p-4 ${
              guidance.overallStatus === "ok"
                ? "border-green-800 bg-green-950/30 text-green-300"
                : "border-amber-800 bg-amber-950/30 text-amber-300"
            }`}
          >
            {guidance.message}
          </div>

          <button
            onClick={() => {
              telemetry.startTracking();
              startSession();
            }}
            disabled={!guidance.isReady || !isActive}
            className="mt-6 rounded-xl bg-orange-500 px-8 py-3 font-bold text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
          >
            Start Session
          </button>
          {(!guidance.isReady || !isActive) && (
            <p className="mt-3 text-sm text-amber-300" role="status">
              Start is locked: {!isActive ? "the camera is still starting." : guidance.message}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (gameState === GAME_STATES.COMPLETE) {
    const sessionData = {
      sessionId: telemetry.sessionId,
      gameId,
      patientId,
      date: new Date().toISOString(),
      durationSeconds: engine.elapsedSeconds,
      moodChoice: engine.moodChoice,
      score,
      accuracyPercent: accuracy,
      romData: {
        averageRomDegrees: romDegrees || 0,
        maxRomDegrees: maxAngleRef.current || 0,
        perRep: repData.map((r, i) => ({
          rep: i + 1,
          romDegrees: r.romDegrees || 0,
          success: r.success !== false,
        })),
      },
      reps: pushes + breaches,
      hitsOrCatchesOrCompletions: pushes,
      missesOrDrops: breaches,
      gameSpecificMetrics: {
        totalPushes: pushes,
        totalBreaches: breaches,
        missRate,
        avgSymmetryPercent: avgSymmetry,
        longestHitStreak: bestCombo,
        roundsCompleted: roundsCompletedRef.current,
        highestRoundSize: highestRoundSizeRef.current,
      },
    };

    return (
      <SessionSummary
        sessionData={sessionData}
        gameName="Push Wall"
        gameId={gameId}
        onSaveReport={async () => telemetry.saveReport(sessionData)}
        onFinish={() => onSessionEnd?.(sessionData)}
      />
    );
  }

  // Active game state
  return (
    <div className="min-h-screen bg-[#0B1120] p-8 pt-24 text-white">
      <SessionCheckpoint {...engine.checkpoint} />
      {gameState === GAME_STATES.COUNTDOWN && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 text-8xl font-black text-orange-400">
          {countdown || "GO"}
        </div>
      )}

      {isPainDetected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="rounded-2xl bg-slate-900 p-8 text-center max-w-md">
            <h2 className="mb-3 text-xl font-bold text-red-400">Discomfort Detected</h2>
            <p className="mb-6 text-slate-300">Please rest before resuming.</p>
            <button
              onClick={() => {
                resetPainState();
                resumeSession();
              }}
              className="rounded-lg bg-orange-500 px-6 py-2 font-bold hover:bg-orange-400"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="fixed left-0 right-0 top-0 z-40 flex justify-between border-b border-slate-800 bg-slate-950/90 px-8 py-4 backdrop-blur">
        <div className="flex gap-5 font-mono text-sm overflow-x-auto">
          <span>⏱ {timeLeft}s</span>
          <span>🎯 Score: {score}</span>
          <span>🛡 Pushes: {pushes}</span>
          <span>🦾 Arms: {armAngle}°</span>
          <span className="flex items-center gap-2 text-cyan-300">
            🏁 Round {roundNumber}
            <span className="flex items-center gap-1">
              {Array.from({ length: roundTarget }).map((_, i) => (
                <span
                  key={i}
                  className={`h-3 w-3 rounded-sm ${
                    roundDots[i] === "hit" ? "bg-emerald-400" : roundDots[i] === "miss" ? "bg-red-500" : "bg-slate-700"
                  }`}
                />
              ))}
            </span>
          </span>
          <span>💥 Breaches: {breaches}</span>
          <span>🔥 Combo: {combo}</span>
          <span>⚖ Symmetry: {lastSymmetryPct}%</span>
          <span className="text-orange-400">{currentDifficulty}</span>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => (isPaused ? resumeSession() : pauseSession())}
            className="rounded-lg bg-slate-800 p-2 hover:bg-slate-700"
          >
            {isPaused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button onClick={endSession} className="rounded-lg bg-red-950 p-2 hover:bg-red-900">
            <X size={18} />
          </button>
        </div>
      </div>

      {roundBanner && (
        <div key={roundBanner.key} className="pointer-events-none fixed inset-x-0 top-28 z-30 flex justify-center">
          <div className="rounded-2xl border border-cyan-400/40 bg-slate-950/90 px-8 py-4 text-center shadow-lg shadow-cyan-500/20">
            <div className="text-2xl font-black text-cyan-300">{roundBanner.title}</div>
            <div className="text-sm text-slate-300">{roundBanner.sub}</div>
            <div className="mt-1 text-sm font-semibold text-orange-300">{roundBanner.note}</div>
          </div>
        </div>
      )}

      {/* Game area */}
      <div className="flex h-[calc(100vh-140px)] gap-6">
        {/* Camera view */}
        <div className="relative w-[38%] overflow-hidden rounded-2xl border-4 border-slate-800 flex-shrink-0">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full scale-x-[-1] object-cover"
          />
          <SkeletonOverlay poseData={poseData} overallStatus={guidance.overallStatus} />
          <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-2 font-mono text-sm">
            Avg Flexion {Math.round(((poseData?.leftFlexion || 0) + (poseData?.rightFlexion || 0)) / 2)}°
          </div>
        </div>

        {/* Phaser game canvas */}
        <div className="relative w-[62%] overflow-hidden rounded-2xl border-4 border-slate-800 bg-[#0b1120]">
          <div ref={attachContainer} className="absolute inset-0 w-full h-full" />

          {feedbackFlash && (
            <div
              key={feedbackFlash.key}
              className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-4xl font-black ${
                feedbackFlash.type === "hit"
                  ? "text-emerald-400"
                  : feedbackFlash.type === "early"
                  ? "text-amber-400"
                  : "text-red-400"
              }`}
              style={{ animation: "pushwall-flash 450ms ease-out forwards" }}
            >
              {feedbackFlash.type === "hit" ? `🔥 ${feedbackFlash.label}` : `⚠️ ${feedbackFlash.label}`}
            </div>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-slate-500 text-xs">
            Push forward with both arms together as the wall gets close
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pushwall-flash {
          0% { opacity: 0; transform: scale(0.8); }
          25% { opacity: 1; transform: scale(1.1); }
          100% { opacity: 0; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
