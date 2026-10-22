// Rhythm Studio (Hard) - big arm swings in time with the beat: arms UP on the up beat, DOWN on the down beat.
// Parkinson's, Stroke (not given to early Frozen Shoulder).
import { useRef, useState } from "react";
import ArmGameFrame, { HudPill } from "../components/rehab/ArmGameFrame";
import useStageLoop from "../components/rehab/useStageLoop";
import { drawAvatar, roundedRect } from "../components/rehab/stageDraw";

const BODY = ["Sit tall at the front of the chair so your arms swing freely", "Make the movements BIG: Parkinson's training works best with large, deliberate swings", "Let the beat lead you and breathe out on each swing up"];
const STEPS = [
  "Four count-in beats first (4, 3, 2, 1), just to feel the rhythm. Then scoring starts.",
  "Listen to the beat. Circles scroll along the lane at the bottom. An up arrow means arms UP on the beat, a down arrow means arms DOWN.",
  "Swing your arms up high on the up beat, and bring them right down on the down beat. The COACH figure moves just ahead of the beat: copy it and arrive with it.",
  "Make each swing BIG. The swing-size meter shows how big your last swing was.",
];

const META = {
  name: "Rhythm Studio",
  emoji: "🎵",
  accent: "#c77dff",
  tagline: "Big arm swings in time with the music.",
  sessionSeconds: 150,
  trains: "large, rhythmic arm movements with timing, which helps movement size and rhythm.",
  levelNames: ["Slow Jam", "Groove", "Swing", "Funk", "Disco"],
  levelHint: (l) => `a quicker beat (${54 + l * 7} per minute) and ${Math.min(105, 62 + l * 9)}° swings`,
  scoring: [
    "Each beat is checked: arms high enough on an up beat, arms low on a down beat.",
    "Being close to the exact beat scores extra (ON THE BEAT).",
    "Hit 8 beats in a round to reach the next level. Higher levels have a quicker beat and a bigger swing.",
  ],
  moves: [
    { id: "both", label: "Both arms together", motion: "raise", plane: "side", arm: "both", peak: 100, steps: STEPS, body: BODY, tip: "arms up on the up beat, down on the down beat" },
    { id: "left", label: "Left arm only", motion: "raise", plane: "side", arm: "left", peak: 100, steps: STEPS, body: BODY, tip: "left arm up on the up beat, down on the down beat" },
    { id: "right", label: "Right arm only", motion: "raise", plane: "side", arm: "right", peak: 100, steps: STEPS, body: BODY, tip: "right arm up on the up beat, down on the down beat" },
  ],
};

const NEED = 8;
const bpmFor = (level) => 54 + level * 7;
const upThr = (level) => Math.min(105, 62 + level * 9);
const LOW = 25;
const WIN = 0.4; // seconds either side of a beat

// ---- a small synthesised backing track (no audio files needed), locked to the beat ----
let audio = null;
const getAudio = () => {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audio) audio = new AC();
    if (audio.state === "suspended") audio.resume();
    return audio;
  } catch { return null; }
};
const tone = (A, type, f, t, len, vol, f2) => {
  const o = A.createOscillator(), g = A.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + len);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(g); g.connect(A.destination); o.start(t); o.stop(t + len + 0.02);
};
const noise = (A, t, len, vol, hp) => {
  const n = Math.floor(A.sampleRate * len), buf = A.createBuffer(1, n, A.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = A.createBufferSource(), f = A.createBiquadFilter(), g = A.createGain();
  src.buffer = buf; f.type = "highpass"; f.frequency.value = hp;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  src.connect(f); f.connect(g); g.connect(A.destination); src.start(t);
};
// EDM groove: four-on-the-floor kick, claps, off-beat hats, bright detuned-saw arpeggio, pad and risers
const ROOT = [55, 43.65, 65.41, 49];
const ARP = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]]; // Am F C G
const lead = (A, f, t, len, vol, cutoff) => {
  const lp = A.createBiquadFilter(), g = A.createGain();
  lp.type = "lowpass"; lp.frequency.setValueAtTime(cutoff, t); lp.frequency.exponentialRampToValueAtTime(Math.max(400, cutoff * 0.35), t + len);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  lp.connect(g); g.connect(A.destination);
  [-9, 9].forEach((c) => { const o = A.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = c; o.connect(lp); o.start(t); o.stop(t + len + 0.02); });
};
const sweep = (A, t, len) => {
  const n = Math.floor(A.sampleRate * len), buf = A.createBuffer(1, n, A.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = A.createBufferSource(), f = A.createBiquadFilter(), g = A.createGain();
  src.buffer = buf; f.type = "highpass"; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(9000, t + len);
  g.gain.setValueAtTime(0.01, t); g.gain.exponentialRampToValueAtTime(0.16, t + len);
  src.connect(f); f.connect(g); g.connect(A.destination); src.start(t);
};
function playBeat(beatNo, spb, level) {
  const A = getAudio(); if (!A) return;
  const t = A.currentTime + 0.01, bar = Math.floor((beatNo - 1) / 4) % 4, pos = (beatNo - 1) % 4;
  tone(A, "sine", 120, t, 0.11, 0.32, 48);                                   // tight kick on every beat
  if (pos % 2 === 1) { noise(A, t, 0.13, 0.20, 1500); noise(A, t + 0.012, 0.09, 0.10, 3000); } // clap on 2 and 4
  noise(A, t + spb / 2, 0.09, 0.11, 8000);                                   // open hat on the off-beat
  if (level >= 1) { noise(A, t + spb / 4, 0.03, 0.045, 9000); noise(A, t + (3 * spb) / 4, 0.03, 0.045, 9000); }
  // pumping off-beat bass (light, filtered)
  { const lp = A.createBiquadFilter(), g = A.createGain(), o = A.createOscillator(), tb = t + spb / 2; lp.type = "lowpass"; lp.frequency.value = 380; o.type = "sawtooth"; o.frequency.value = ROOT[bar] * 2;
    g.gain.setValueAtTime(0.0001, tb); g.gain.exponentialRampToValueAtTime(0.07, tb + 0.015); g.gain.exponentialRampToValueAtTime(0.001, tb + spb * 0.42); o.connect(lp); lp.connect(g); g.connect(A.destination); o.start(tb); o.stop(tb + spb * 0.45); }
  // bright detuned-saw arpeggio in eighth notes
  const notes = ARP[bar];
  lead(A, notes[(pos * 2) % 3] * 2, t, spb * 0.42, 0.05, 3600);
  lead(A, notes[(pos * 2 + 1) % 3] * 2, t + spb / 2, spb * 0.42, 0.045, 3200);
  if (level >= 2 && pos === 0) notes.forEach((f) => tone(A, "triangle", f * 2, t, spb * 3.7, 0.03));  // pad, once per bar
  if (level >= 3) lead(A, notes[pos % 3] * 4, t + spb / 4, spb * 0.2, 0.025, 5000);             // sparkle
  if (beatNo % 16 === 13) sweep(A, t, spb * 4);                                // riser into the next phrase
}

function Stage({ api }) {
  const S = useRef({ clock: 0, beatNo: 0, nextBeat: 2.2, hist: [], round: [], hits: 0, beats: 0, onBeat: 0, size: 0, flash: null, pulse: 0, results: [], lastResolved: -1, pops: [], combo: 0, best: 0, sparks: [], lights: 0, cx: 0, cy: 0 }).current;

  const [music, setMusic] = useState(true);
  const musicRef = useRef(true); musicRef.current = music;
  const canvasRef = useStageLoop(api, {
    update(dt) {
      const level = api.level;
      const e = api.inputRef.current.elev;
      S.clock += dt;
      S.hist.push({ t: S.clock, e });
      while (S.hist.length && S.clock - S.hist[0].t > 2.5) S.hist.shift();
      S.pulse = Math.max(0, S.pulse - dt * 2.5);
      S.sparks.forEach((q) => { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 300 * dt; q.life -= dt; }); S.sparks = S.sparks.filter((q) => q.life > 0);
      S.flash && ((S.flash.t -= dt) <= 0) && (S.flash = null);
      S.pops.forEach((p) => { p.life -= dt; p.y -= 25 * dt; }); S.pops = S.pops.filter((p) => p.life > 0);
      const spb = 60 / bpmFor(level);
      const thr = upThr(level);
      // swing size: biggest difference in the last two beats
      const recent = S.hist.filter((q) => S.clock - q.t < spb * 2);
      if (recent.length) S.size = Math.max(...recent.map((q) => q.e)) - Math.min(...recent.map((q) => q.e));
      // the beat arrives
      if (S.clock >= S.nextBeat) {
        S.beatNo += 1; S.pulse = 1;
        if (musicRef.current) playBeat(S.beatNo, 60 / bpmFor(level), level);
        S.nextBeat += spb;
        S.pendingAt = S.clock;
      }
      // resolve the previous beat once its window has passed
      const bi = S.beatNo - 1;
      if (bi >= 5 && S.lastResolved < bi && S.clock - (S.nextBeat - spb) >= WIN) {
        const bt = S.nextBeat - spb;
        const up = bi % 2 === 1;
        const w = S.hist.filter((q) => Math.abs(q.t - bt) <= WIN);
        let ok = false, peakT = bt;
        if (w.length) {
          if (up) { const m = w.reduce((a, q) => (q.e > a.e ? q : a), w[0]); ok = m.e >= thr; peakT = m.t; }
          else { const m = w.reduce((a, q) => (q.e < a.e ? q : a), w[0]); ok = m.e <= LOW; peakT = m.t; }
          if (up && ok) { /* also need to have started low before: avoids holding arms up all the time */ const before = S.hist.filter((q) => q.t < bt - 0.1 && q.t > bt - spb * 1.6); ok = before.length ? Math.min(...before.map((q) => q.e)) <= thr * 0.7 : ok; }
        }
        S.lastResolved = bi; S.beats += 1;
        if (ok) {
          const onBeat = Math.abs(peakT - bt) < 0.18;
          if (onBeat) S.onBeat += 1; S.hits += 1;
          S.combo += 1; S.best = Math.max(S.best, S.combo);
          const mult = S.combo >= 6 ? 3 : S.combo >= 3 ? 2 : 1;
          api.hit((20 + (onBeat ? 10 : 0)) * mult, Math.max(0, S.size));
          S.lights = 1;
          for (let i = 0; i < (onBeat ? 26 : 12); i++) S.sparks.push({ x: S.cx, y: S.cy, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 300 - 60, life: 0.9, c: ["#ff9bd4", "#7bb8ff", "#ffd25a", "#7cf2c0"][i % 4] });
          S.round.push(1); S.flash = { t: 0.6, text: (onBeat ? "ON THE BEAT" : "GOOD") + (mult > 1 ? `  x${mult}` : "") };
        } else { api.miss(); S.combo = 0; S.round.push(0); S.flash = { t: 0.5, text: up ? "Higher!" : "Lower your arms" }; }
        api.extraRef.current = { beats: S.beats, hitBeats: S.hits, onBeatPct: S.hits ? Math.round((S.onBeat / S.hits) * 100) : 0, swingTargetDeg: thr };
        if (S.round.length >= NEED) { const r = S.round.reduce((a, b) => a + b, 0) / NEED; S.round = []; api.roundDone(r); }
      }
      S.lights = Math.max(0, S.lights - dt * 1.5);
      // coaching: what is next
      const nextUp = (S.beatNo + 1) % 2 === 1;
      S.nextUp = nextUp;
      const toBeat = S.nextBeat - S.clock;
      if (S.beatNo < 5) api.setCoach(S.beatNo < 1 ? "Get ready: arms down, listen to the beat" : "Count-in: copy the coach and feel the beat", "info");
      else api.setCoach(nextUp ? (toBeat < spb * 0.7 ? "Swing UP on the next beat" : "Arms low, get ready to swing UP") : (toBeat < spb * 0.7 ? "Bring them DOWN on the next beat" : "Hold up, then DOWN on the beat"), "info");
      api.setMission({ text: "Hit 8 beats: arms UP on ↑ beats, DOWN on ↓ beats", done: Math.min(NEED, S.round.length), total: NEED });
    },
    draw(ctx, { w, h }, time) {
      const level = api.level, spb = 60 / bpmFor(level), thr = upThr(level);
      const e = api.inputRef.current.elev, inp = api.inputRef.current, arm = api.arm;
      const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#16101f"); bg.addColorStop(1, "#0b0810");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      // equaliser
      for (let i = 0; i < 16; i++) {
        const x = i < 8 ? 30 + i * 22 : w - 30 - (15 - i) * 22;
        const hh = 20 + 70 * (0.4 + 0.6 * Math.abs(Math.sin(time * 3 + i * 0.7))) * (0.5 + S.pulse * 0.5);
        ctx.fillStyle = "rgba(199,125,255,0.55)"; roundedRect(ctx, x, h * 0.72 - hh, 12, hh, 3); ctx.fill();
      }
      // stage lights that flare when you hit
      for (let i = 0; i < 3; i++) { const lx2 = w * (0.2 + i * 0.3), g2 = ctx.createRadialGradient(lx2, 0, 10, lx2, h * 0.7, h * 0.7); g2.addColorStop(0, `rgba(${i === 1 ? "255,155,212" : "123,184,255"},${0.10 + S.lights * 0.22})`); g2.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h); }
      // coach and you
      const sc = Math.min(1.5, h / 400), upCue = S.beatNo < 1 ? false : S.beatNo % 2 === 1;
      const lft = arm === "both" || arm === "left" ? 1 : 0, rgt = arm === "both" || arm === "right" ? 1 : 0;
      const hiE = thr + 10, loE = 5;
      // the coach moves smoothly so that the arms ARRIVE exactly on the next beat
      const prog = Math.max(0, Math.min(1, 1 - (S.nextBeat - S.clock) / spb));
      const ease = prog * prog * (3 - 2 * prog);
      const nextIsUp = S.beatNo < 1 ? true : S.beatNo % 2 === 0;
      const coachE = S.beatNo < 1 ? 0 : nextIsUp ? loE + (hiE - loE) * ease : hiE - (hiE - loE) * ease;
      const cx1 = w * 0.17, cx2 = w * 0.40, ay = h * 0.16;
      [[cx1, "COACH: copy me", "#d9b8ff", true], [cx2, "YOU", "#fff", false]].forEach(([x0, label, col, isCoach]) => {
        ctx.fillStyle = isCoach ? "rgba(199,125,255,0.10)" : "rgba(255,255,255,0.05)"; roundedRect(ctx, x0 - 105 * sc, ay - 34 * sc, 210 * sc, 250 * sc, 16); ctx.fill();
        ctx.strokeStyle = isCoach ? "rgba(199,125,255,0.5)" : "rgba(255,255,255,0.2)"; ctx.lineWidth = 2; ctx.stroke();
        if (isCoach) drawAvatar(ctx, x0, ay, sc, { l: lft ? coachE : 0, r: rgt ? coachE : 0, body: "#e6cfff", glow: "#c77dff" });
        else drawAvatar(ctx, x0, ay, sc, { l: lft ? inp.leftElev : 0, r: rgt ? inp.rightElev : 0, body: "#fff", glow: "#7cf2c0" });
        ctx.fillStyle = col; ctx.font = "900 12px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(label, x0, ay + 214 * sc);
      });
      // dotted target line at the swing height on your figure
      // pulse circle with a big word
      const cx = w * 0.68, cy = h * 0.36, R = Math.min(w * 0.11, h * 0.18);
      S.cx = cx; S.cy = cy;
      for (let i = 0; i < 2; i++) { const k = (S.pulse + i * 0.5) % 1; ctx.strokeStyle = `rgba(199,125,255,${0.5 * (1 - k)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R * (1.3 + (1 - S.pulse) * 0.6 + i * 0.3), 0, 6.283); ctx.stroke(); }
      const cg = ctx.createRadialGradient(cx, cy, 4, cx, cy, R * (1 + S.pulse * 0.25));
      const warm = S.beatNo >= 5 && upCue;
      cg.addColorStop(0, warm ? "#ffb3df" : "#9bd0ff"); cg.addColorStop(1, warm ? "#a02fb8" : "#2b4fd1");
      ctx.fillStyle = cg; ctx.shadowColor = "#c77dff"; ctx.shadowBlur = 30 * S.pulse + 10; ctx.beginPath(); ctx.arc(cx, cy, R * (1 + S.pulse * 0.25), 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      if (S.beatNo < 5) { ctx.font = `900 ${Math.round(R * 1.1)}px Manrope, system-ui, sans-serif`; ctx.fillText(S.beatNo < 1 ? "…" : String(5 - S.beatNo), cx, cy + R * 0.38); ctx.font = "800 12px Manrope, system-ui, sans-serif"; ctx.fillText("GET READY", cx, cy + R * 1.45); }
      else { ctx.font = `900 ${Math.round(R * 0.27)}px Manrope, system-ui, sans-serif`; ctx.fillText(upCue ? "ARMS UP" : "ARMS DOWN", cx, cy - R * 0.05); ctx.font = `900 ${Math.round(R * 0.7)}px Manrope, system-ui, sans-serif`; ctx.fillText(upCue ? "↑" : "↓", cx, cy + R * 0.78); }
      // combo / multiplier
      if (S.combo >= 2) { const mult = S.combo >= 6 ? 3 : S.combo >= 3 ? 2 : 1; ctx.fillStyle = "#ffd25a"; ctx.font = "900 18px Manrope, system-ui, sans-serif"; ctx.fillText(`🔥 ${S.combo} IN A ROW${mult > 1 ? "  ·  x" + mult + " POINTS" : ""}`, cx, cy - R * 1.65); }
      // sparks
      S.sparks.forEach((q) => { ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, 6, 6); }); ctx.globalAlpha = 1;
      // beat lane
      const lx = w * 0.04, lw = w * 0.7, ly = h - 150;
      ctx.fillStyle = "rgba(5,3,9,0.85)"; roundedRect(ctx, lx, ly, lw, 40, 10); ctx.fill();
      const hitX = lx + lw * 0.3;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hitX, ly + 4); ctx.lineTo(hitX, ly + 36); ctx.stroke();
      for (let k = -1; k <= 6; k++) {
        const bn = S.beatNo + k, bt = S.nextBeat - spb + k * spb;
        const x = hitX + (bt - S.clock) * (lw * 0.7 / (spb * 4));
        if (x < lx || x > lx + lw || bn < 1) continue;
        const up = bn % 2 === 1;
        ctx.fillStyle = up ? "#ff9bd4" : "#7bb8ff"; ctx.beginPath(); ctx.arc(x, ly + 20, bn <= 4 ? 8 : 11, 0, 6.283); ctx.fill();
        ctx.fillStyle = "#1a0f26"; ctx.font = "900 14px Manrope, system-ui, sans-serif"; ctx.fillText(up ? "↑" : "↓", x, ly + 25);
      }
      // swing size meter
      const mw = Math.min(190, w * 0.2), mx = w * 0.68 - mw / 2, my = h * 0.68;
      ctx.fillStyle = "rgba(5,3,9,0.8)"; roundedRect(ctx, mx - 8, my - 22, mw + 16, 46, 9); ctx.fill();
      ctx.fillStyle = "#c9b8e0"; ctx.font = "700 10px Manrope, system-ui, sans-serif"; ctx.fillText("SWING SIZE", mx + mw / 2, my - 8);
      ctx.fillStyle = "rgba(255,255,255,0.2)"; roundedRect(ctx, mx, my, mw, 9, 4); ctx.fill();
      ctx.fillStyle = S.size >= thr * 0.9 ? "#7cf2c0" : "#ff9bd4"; roundedRect(ctx, mx, my, Math.max(6, mw * Math.min(1, S.size / thr)), 9, 4); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "700 11px Manrope, system-ui, sans-serif"; ctx.fillText(`${Math.round(S.size)}° of ${Math.round(thr)}°`, mx + mw / 2, my + 22);
      if (S.flash) { ctx.globalAlpha = Math.min(1, S.flash.t * 3); ctx.fillStyle = S.flash.text === "Higher!" || S.flash.text.startsWith("Lower") ? "#ffd25a" : "#7cf2c0"; ctx.font = "900 28px Manrope, system-ui, sans-serif"; ctx.shadowColor = "#000"; ctx.shadowBlur = 8; ctx.fillText(S.flash.text, cx, h * 0.12); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
      void e;
    },
  });

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ filter: api.levelFilter }} />
      <button type="button" onClick={() => setMusic((m) => !m)} className="absolute left-3 top-[7.5rem] z-10 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white">{music ? "🔊 Music on" : "🔇 Music off"}</button>
      <HudPill className="absolute left-3 top-14 z-10" label="On the beat" value={`${S.hits ? Math.round((S.onBeat / S.hits) * 100) : 0}%  ·  ${S.hits}/${S.beats}`} />
    </>
  );
}

export default function RhythmStudio(props) {
  return <ArmGameFrame meta={META} {...props}>{(api) => <Stage api={api} />}</ArmGameFrame>;
}
