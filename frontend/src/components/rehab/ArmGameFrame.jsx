// Shared frame for the arm games (Breathe, Summit, Window Wiper, Cross Rally...).
// It does everything every game needs the same way as Push Wall / Cloud Reach:
// camera + pose, posture check, pain detection, comfort easing, countdown,
// pause/end bar, 10-second checkpoint, telemetry, session summary, replay.
// Each game only supplies its stage (children) and a small `meta` object.
//
// meta = { name, emoji, accent, tagline, sessionSeconds, trains,
//          moves: [{ id, label, motion, plane, arm, peak, steps[], body[] }],   // rotates every play
//          scoring: [], levelNames: [] }
// children(api) -> stage element. api gives the game:
//   inputRef.current = { leftElev, rightElev, elev, left, right, hand }  (see armInput.js)
//   activeRef (true only while really playing), level (0-based, after comfort easing),
//   move, arm, hit(points, rom), miss(), roundDone(hitRate), extraRef, levelFilter
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import useMediaPipeUpperBody from "../../hooks/useMediaPipeUpperBody";
import usePostureGuidance from "../../hooks/usePostureGuidance";
import useFacialPainDetection from "../../hooks/useFacialPainDetection";
import { useGameEngine, GAME_STATES } from "../../hooks/useGameEngine";
import { useSessionTelemetry } from "../../hooks/useSessionTelemetry";
import { useAudioFeedback } from "../../hooks/useAudioFeedback";
import useComfortEase from "../../hooks/useComfortEase";
import SkeletonOverlay from "./SkeletonOverlay";
import SessionSummary from "./SessionSummary";
import SessionCheckpoint from "./SessionCheckpoint";
import GameShell, { StageTopBar, CameraPip } from "./GameShell";
import LevelBanner from "./LevelBanner";
import ArmPicker from "./ArmPicker";
import MoveDemo from "./MoveDemo";
import { LEVEL_LOOKS } from "./GameBackdrops";
import { createArmInput } from "../../utils/armInput";
import { getPlaysToday } from "../../utils/dailyPlays";

export const MAX_LEVELS = 10;

export function HudPill({ label, value, className = "" }) {
  return (
    <div className={`rounded-lg bg-black/70 px-3 py-1.5 backdrop-blur ${className}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
      <div className="text-base font-extrabold leading-tight text-white">{value}</div>
    </div>
  );
}

export default function ArmGameFrame({ meta, onSessionEnd, patientId, gameId, children }) {
  const videoRef = useRef(null);
  const [poseData, setPoseData] = useState(null);
  const moves = meta.moves;
  const [moveIdx, setMoveIdx] = useState(() => {
    try { return getPlaysToday(patientId, gameId) % moves.length; } catch { return 0; }
  });
  const move = moves[moveIdx];
  // start with the arm the rotating movement asks for (Right hand paddle -> right arm only)
  const [armChoice, setArmChoice] = useState(() => moves[moveIdx]?.arm || "both");

  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [repData, setRepData] = useState([]);
  const [levelIdx, setLevelIdx] = useState(0);
  const levelRef = useRef(0);
  const [live, setLive] = useState({ elev: 0 });
  const [banner, setBanner] = useState({ visible: false, text: "" });
  // What the player is working towards right now, and live coaching text.
  const [mission, setMissionState] = useState(null);
  const [coach, setCoachState] = useState({ text: "", tone: "info" });
  const missionKey = useRef("");
  const coachKey = useRef("");

  const inputRef = useRef({ leftElev: 0, rightElev: 0, elev: 0, left: null, right: null, hand: null });
  const armIn = useRef(null);
  if (!armIn.current) armIn.current = createArmInput({ fast: !!meta.fastInput });
  const armRef = useRef(armChoice);
  armRef.current = armChoice;
  const extraRef = useRef({});
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const bestRef = useRef(0);
  const maxRomRef = useRef(0);
  const papsRef = useRef(0);
  const hasEndedRef = useRef(false);
  const activeRef = useRef(false);
  const completeRepRef = useRef(null);
  const bannerTimer = useRef(null);

  const { isActive } = useMediaPipeUpperBody({ videoRef, onPoseUpdate: setPoseData });
  const guidance = usePostureGuidance(poseData);
  const { papsScore, isPainDetected, resetPainState } = useFacialPainDetection({ videoRef });
  const telemetry = useSessionTelemetry(patientId, gameId);
  const audio = useAudioFeedback(true);
  papsRef.current = papsScore;

  const engine = useGameEngine({
    sessionLength: meta.sessionSeconds || 120,
    totalReps: 0,
    onRepComplete: (success, data) => {
      telemetry.recordRep(success, data);
      if (success) audio.playSuccess(); else audio.playMiss();
    },
    onSessionComplete: () => finalizeTelemetry(),
  });
  const { gameState, countdown, timeLeft, isPaused, startSession, pauseSession, resumeSession, completeRep, endSession } = engine;
  completeRepRef.current = completeRep;

  const { easeSteps, notice } = useComfortEase({ papsScore, isPainDetected, active: gameState === GAME_STATES.ACTIVE });
  const level = Math.max(0, levelIdx - easeSteps);
  const levelCount = meta.levelNames?.length || 5;
  activeRef.current = gameState === GAME_STATES.ACTIVE && !isPaused && !isPainDetected;

  // pose -> input numbers for the game
  useEffect(() => {
    const r = armIn.current.update(poseData);
    if (!r) return;
    const a = armRef.current;
    const elev = a === "left" ? r.leftElev : a === "right" ? r.rightElev : Math.max(r.leftElev, r.rightElev);
    let hand = null;
    if (a === "left") hand = r.left; else if (a === "right") hand = r.right;
    else hand = r.leftElev > r.rightElev ? r.left || r.right : r.right || r.left;
    inputRef.current = { ...r, elev, hand };
    if (activeRef.current && elev > maxRomRef.current) maxRomRef.current = elev;
    const rounded = Math.round(elev);
    setLive((v) => (v.elev === rounded ? v : { elev: rounded }));
  }, [poseData]);

  const hit = useCallback((points = 10, rom = 0) => {
    scoreRef.current += points;
    streakRef.current += 1;
    bestRef.current = Math.max(bestRef.current, streakRef.current);
    setScore(scoreRef.current);
    setStreak(streakRef.current);
    setBestStreak(bestRef.current);
    setHits((h) => h + 1);
    setRepData((r) => [...r, { success: true, romDegrees: Math.round(rom) }]);
    completeRepRef.current?.(true, { rom });
  }, []);
  const bonus = useCallback((points) => {
    scoreRef.current += points;
    setScore(scoreRef.current);
  }, []);
  const miss = useCallback(() => {
    streakRef.current = 0;
    setStreak(0);
    setMisses((m) => m + 1);
    setRepData((r) => [...r, { success: false, romDegrees: 0 }]);
    completeRepRef.current?.(false, {});
  }, []);

  const showBanner = useCallback((text) => {
    setBanner({ visible: true, text });
    clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner((b) => ({ ...b, visible: false })), 2400);
  }, []);
  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  const setMission = useCallback((m) => {
    const k = JSON.stringify(m);
    if (k === missionKey.current) return;
    missionKey.current = k;
    setMissionState(m);
  }, []);
  const setCoach = useCallback((text, tone = "info") => {
    const k = `${tone}|${text}`;
    if (k === coachKey.current) return;
    coachKey.current = k;
    setCoachState({ text, tone });
  }, []);

  // Called by a game after a round: up after a smooth round, down after a hard one.
  const roundDone = useCallback((hitRate) => {
    const pain = papsRef.current ?? 0;
    const struggled = pain > 5 || hitRate < 0.5;
    const smooth = !struggled && hitRate >= 0.75 && pain < 3;
    const next = Math.max(0, Math.min(levelCount - 1, levelRef.current + (smooth ? 1 : struggled ? -1 : 0)));
    if (next !== levelRef.current) {
      levelRef.current = next;
      setLevelIdx(next);
      const hint = meta.levelHint?.(next);
      showBanner(smooth ? `Level ${next + 1}${hint ? `: ${hint}` : ""}` : `Easing back to Level ${next + 1}`);
    }
  }, [levelCount, showBanner, meta]);

  const accuracy = hits + misses ? Math.round((hits / (hits + misses)) * 100) : null;
  const finalizeTelemetry = useCallback(() => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
    telemetry.endSession({
      gameName: meta.name,
      score: scoreRef.current,
      hits,
      misses,
      accuracy,
      missRate: hits + misses ? Math.round((misses / (hits + misses)) * 100) : 0,
      bestCombo: bestRef.current,
      currentCombo: streakRef.current,
      romDegrees: Math.round(maxRomRef.current),
      papsScore,
      difficulty: `Level ${levelRef.current + 1}`,
      gameSpecific: { movement: move.label, level: levelRef.current + 1, ...extraRef.current, repData },
    });
  }, [telemetry, hits, misses, accuracy, papsScore, repData, meta.name, move.label]);

  const levelFilter = useMemo(() => {
    if (level <= 0) return undefined;
    const look = LEVEL_LOOKS[Math.min(LEVEL_LOOKS.length - 1, level)];
    return `hue-rotate(${look.hue}deg) saturate(${look.sat}) brightness(${look.bright})`;
  }, [level]);
  const levelName = meta.levelNames?.[Math.min(level, meta.levelNames.length - 1)] || "";

  const api = {
    inputRef, activeRef, level, levelCount, levelFilter, move, arm: armChoice, extraRef, hit, miss, bonus, roundDone,
    timeLeft, score, streak, hits, misses, showBanner, setMission, setCoach,
  };

  const pickMove = (i) => {
    setMoveIdx(i);
    if (moves[i].arm) setArmChoice(moves[i].arm);
  };
  const accent = meta.accent || "#22d3ee";
  const demoMove = { ...move, arm: move.arm || (armChoice === "both" ? "right" : armChoice) };

  // ---------------- INSTRUCTIONS ----------------
  if (gameState === GAME_STATES.INSTRUCTIONS) {
    return (
      <div className="min-h-screen overflow-y-auto bg-[#0B1120] p-6 pb-24 text-white sm:p-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-1 text-3xl font-black">{meta.emoji} {meta.name}</h1>
          <p className="mb-5 text-slate-400">{meta.tagline}</p>

          <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-white">Today's movement</div>
              <div className="text-xs text-slate-400">Changes every time you play, so your shoulder works in a new way. Tap to pick another.</div>
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Movement">
              {moves.map((m, i) => (
                <button key={m.id} type="button" role="radio" aria-checked={i === moveIdx} onClick={() => pickMove(i)}
                  className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${i === moveIdx ? "text-white" : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
                  style={i === moveIdx ? { background: accent, borderColor: accent } : undefined}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 grid items-center gap-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:grid-cols-[280px_1fr]">
            <MoveDemo move={demoMove} caption={move.label} />
            <div>
              <ol className="space-y-3 text-lg text-slate-200">
                <li><b style={{ color: accent }}>1.</b> Sit tall on a chair so both shoulders show on the camera.</li>
                {move.steps.map((s, i) => (<li key={i}><b style={{ color: accent }}>{i + 2}.</b> {s}</li>))}
              </ol>
              {move.body?.length > 0 && (
                <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                  <div className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">Body tips</div>
                  <ul className="space-y-1 text-sm text-slate-300">
                    {move.body.map((b, i) => (<li key={i}>• {b}</li>))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <details className="mb-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
            <summary className="cursor-pointer font-bold text-white">How scoring works</summary>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-400">
              {(meta.scoring || []).map((s, i) => (<li key={i}>{s}</li>))}
              <li>Smooth rounds raise the LEVEL: a new look and a little more challenge. If it feels like too much, the game eases off by itself.</li>
              <li>Cyan arm = your left, orange arm = your right.</li>
            </ul>
            {meta.trains && <div className="mt-3 text-slate-500">Trains: {meta.trains}</div>}
          </details>

          <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-1.5 text-sm font-semibold text-slate-200">Which arm will you use?</div>
            <ArmPicker value={armChoice} onChange={setArmChoice} dark hint={false} />
          </div>

          <div className="relative aspect-video overflow-hidden rounded-2xl border-4 border-slate-800">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
            <SkeletonOverlay poseData={poseData} overallStatus={guidance.overallStatus} shoulderAngle={live.elev} />
            <div className="absolute left-4 top-4 rounded-lg bg-black/60 px-3 py-2 font-mono text-sm">Arm {live.elev}° · PAPS {papsScore}</div>
          </div>
          <div className={`mt-4 rounded-xl border p-4 ${guidance.overallStatus === "ok" ? "border-green-800 bg-green-950/30 text-green-300" : "border-amber-800 bg-amber-950/30 text-amber-300"}`}>
            {guidance.message}
          </div>
          <button
            onClick={() => { telemetry.startTracking(); startSession(); }}
            disabled={!guidance.isReady || !isActive}
            className="mt-6 rounded-xl px-8 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
            style={{ background: accent }}
          >
            Start Session
          </button>
          {(!guidance.isReady || !isActive) && (
            <p className="mt-3 text-sm text-amber-300" role="status">Start is locked: {!isActive ? "the camera is still starting." : guidance.message}</p>
          )}
        </div>
      </div>
    );
  }

  // ---------------- COMPLETE ----------------
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
        averageRomDegrees: Math.round(repData.filter((r) => r.success).reduce((a, r) => a + r.romDegrees, 0) / Math.max(1, hits)),
        maxRomDegrees: Math.round(maxRomRef.current),
        perRep: repData.map((r, i) => ({ rep: i + 1, romDegrees: r.romDegrees || 0, success: r.success !== false })),
      },
      reps: hits + misses,
      hitsOrCatchesOrCompletions: hits,
      missesOrDrops: misses,
      gameSpecificMetrics: { movement: move.label, bestStreak, levelReached: levelRef.current + 1, ...extraRef.current },
    };
    return (
      <SessionSummary
        sessionData={sessionData}
        gameName={meta.name}
        gameId={gameId}
        onSaveReport={async () => telemetry.saveReport(sessionData)}
        onFinish={() => onSessionEnd?.(sessionData)}
      />
    );
  }

  // ---------------- ACTIVE ----------------
  return (
    <GameShell offset={100} backdrop={<div className="absolute inset-0 bg-[#0b1120]" />}>
      <SessionCheckpoint {...engine.checkpoint} />
      {gameState === GAME_STATES.COUNTDOWN && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 text-8xl font-black" style={{ color: accent }}>
          {countdown || "GO"}
        </div>
      )}
      {isPainDetected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="max-w-md rounded-2xl bg-slate-900 p-8 text-center">
            <h2 className="mb-3 text-xl font-bold text-red-400">Discomfort Detected</h2>
            <p className="mb-6 text-slate-300">Please rest before resuming.</p>
            <button onClick={() => { resetPainState(); resumeSession(); }} className="rounded-lg px-6 py-2 font-bold text-slate-950" style={{ background: accent }}>Resume</button>
          </div>
        </div>
      )}
      <StageTopBar isPaused={isPaused} onPause={pauseSession} onResume={resumeSession} onEnd={endSession}>
        <span>⏱ {timeLeft}s</span>
        <span>🎯 {score}</span>
        <span>✔ {hits}</span>
        <span>🔥 {streak}</span>
        <span className="rounded-full bg-amber-400 px-3 py-0.5 font-black text-slate-900">Level {level + 1}{levelName ? ` · ${levelName}` : ""}</span>
      </StageTopBar>
      <LevelBanner text={notice.visible ? notice.text : banner.text} visible={notice.visible || banner.visible} />

      <div className="absolute inset-x-0 bottom-0 top-12 overflow-hidden">
        {children(api)}

        {mission && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex max-w-[60%] -translate-x-1/2 items-center gap-3 rounded-full border border-white/20 bg-black/70 px-4 py-1.5 text-sm font-bold text-white shadow-lg backdrop-blur">
            <span className="truncate">🎯 {mission.text}</span>
            {mission.total > 0 && (
              <span className="flex flex-shrink-0 items-center gap-1" aria-label={`${mission.done} of ${mission.total}`}>
                {Array.from({ length: mission.total }).map((_, i) => (
                  <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: i < mission.done ? accent : "rgba(255,255,255,0.25)" }} />
                ))}
                <span className="ml-1 text-xs font-semibold text-slate-300">to Level {level + 2}</span>
              </span>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute right-3 top-[76px] z-10 hidden w-40 rounded-xl border border-white/15 bg-black/55 p-1.5 backdrop-blur sm:block">
          <div className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-300">Copy this</div>
          <MoveDemo move={demoMove} />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex flex-col items-center gap-1.5 px-3">
          {coach.text && (
            <div
              className="max-w-[85%] rounded-xl px-5 py-2 text-center text-base font-extrabold shadow-lg sm:text-xl"
              style={{ background: coach.tone === "ok" ? "rgba(16,185,129,0.92)" : coach.tone === "warn" ? "rgba(245,158,11,0.94)" : "rgba(2,6,23,0.85)", color: coach.tone === "warn" ? "#1f1300" : "#fff" }}
            >
              {coach.text}
            </div>
          )}
          <div className="max-w-[70%] rounded-lg bg-black/55 px-3 py-1 text-center text-xs font-semibold text-slate-200">
            {move.label}: {move.tip || move.steps[0]}
          </div>
        </div>
      </div>

      <CameraPip videoRef={videoRef} poseData={poseData} guidance={guidance} />
    </GameShell>
  );
}
