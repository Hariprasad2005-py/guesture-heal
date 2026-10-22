// Piano (Hard) - Piano Tiles style: tiles slide down five lanes, press the matching finger as each tile reaches
// the line to play a simple song. The tune gets faster each time round. Trains finger isolation and reaction time.
// Stroke, Hand surgery, Nerve injury, Parkinson's. Uses full-hand tracking (curl of each finger).
import { useRef } from "react";
import ArmGameFrame from "../components/rehab/ArmGameFrame";
import useStageLoop from "../components/rehab/useStageLoop";
import { drawLiveHand, roundedRect } from "../components/rehab/stageDraw";

const BODY = ["Rest your forearm on the table, hand up in front of the camera, palm facing it", "Keep your fingers a little apart and relaxed, like they are above piano keys", "Press ONE finger at a time: bend it down and lift it straight back up. Keep the others still"];
const stepsFor = (hand, extra) => [
  `Hold your ${hand} hand up, palm to the camera, fingers relaxed and a little apart.`,
  "Five lanes, one for each finger, play the notes C D E F G like a piano. Coloured tiles slide down the lanes.",
  "When a tile reaches the white line, press THAT finger down (bend it) and lift it again. The note plays, and the song comes alive.",
  `Press only the finger of the tile's lane. Every time the song repeats, it gets a little faster.${extra}`,
];

const META = {
  name: "Piano",
  emoji: "🎹",
  accent: "#a78bfa",
  tagline: "Piano Tiles for your fingers. Play the song as the tiles arrive.",
  sessionSeconds: 150,
  needsHands: true,
  fastHand: true,
  trains: "finger isolation (one finger at a time), reaction time and rhythm.",
  levelNames: ["Hot Cross Buns", "Mary's Lamb", "Jingle Bells", "Ode to Joy", "Clair de Lune"],
  levelHint: (l) => `a new song and a quicker start (${Math.round(66 + 7 * l)} beats per minute)`,
  scoring: [
    "Each tile is a note with its own finger. Press that finger when the tile touches the white line.",
    "Closer to the line is PERFECT. Streaks of notes give x2 and x3 points.",
    "Play 10 notes to finish a round. 8 or more right reaches the next song. Every time a song repeats it speeds up.",
  ],
  moves: [
    { id: "right", label: "Right hand piano", motion: "finger", arm: "right", steps: stepsFor("right", ""), body: BODY, tip: "press the finger of the tile's lane when it reaches the line" },
    { id: "left", label: "Left hand piano", motion: "finger", arm: "left", steps: stepsFor("left", ""), body: BODY, tip: "press the finger of the tile's lane when it reaches the line" },
    { id: "slow", label: "Right hand: slow and careful", motion: "finger", arm: "right", variant: "slow", steps: stepsFor("right", " This one starts slower, so take your time on each press."), body: BODY, tip: "slow tune, one finger at a time" },
  ],
};

// notes: 0..4 = C D E F G ; beats: 1 = one beat (spacing before the next tile)
const SONGS = [
  { title: "Hot Cross Buns", n: [[2, 1], [1, 1], [0, 2], [2, 1], [1, 1], [0, 2], [0, 0.5], [0, 0.5], [0, 0.5], [0, 0.5], [1, 0.5], [1, 0.5], [1, 0.5], [1, 0.5], [2, 1], [1, 1], [0, 2]] },
  { title: "Mary Had a Little Lamb", n: [[2, 1], [1, 1], [0, 1], [1, 1], [2, 1], [2, 1], [2, 2], [1, 1], [1, 1], [1, 2], [2, 1], [4, 1], [4, 2], [2, 1], [1, 1], [0, 1], [1, 1], [2, 1], [2, 1], [2, 1], [2, 1], [1, 1], [1, 1], [2, 1], [1, 1], [0, 3]] },
  { title: "Jingle Bells", n: [[2, 1], [2, 1], [2, 2], [2, 1], [2, 1], [2, 2], [2, 1], [4, 1], [0, 1.5], [1, 0.5], [2, 3], [3, 1], [3, 1], [3, 1.5], [3, 0.5], [3, 1], [2, 1], [2, 1], [2, 0.5], [2, 0.5], [2, 1], [1, 1], [1, 1], [2, 1], [1, 2], [4, 2]] },
  { title: "Ode to Joy", n: [[2, 1], [2, 1], [3, 1], [4, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1], [0, 1], [1, 1], [2, 1], [2, 1.5], [1, 0.5], [1, 2], [2, 1], [2, 1], [3, 1], [4, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1], [0, 1], [1, 1], [2, 1], [1, 1.5], [0, 0.5], [0, 2]] },
  { title: "Au Clair de la Lune", n: [[0, 1], [0, 1], [0, 1], [1, 1], [2, 2], [1, 2], [0, 1], [2, 1], [1, 1], [1, 1], [0, 3], [0, 1], [0, 1], [0, 1], [1, 1], [2, 2], [1, 2], [0, 1], [2, 1], [1, 1], [1, 1], [0, 3]] },
];
const NOTE_NAMES = ["C", "D", "E", "F", "G"];
const FREQ = [261.63, 293.66, 329.63, 349.23, 392.0];
const COLORS = ["#ff7a7a", "#ffb84d", "#ffe14d", "#5cd68a", "#5ab0ff"];
const FINGERS_R = ["thumb", "index", "middle", "ring", "pinky"];
const FNAMES = { thumb: "Thumb", index: "Index", middle: "Middle", ring: "Ring", pinky: "Little" };
const NEED = 10;
const PX_BEAT = 112;          // distance between two tiles one beat apart
const TILE_H = 74;
const LATENCY = 0.1;          // seconds: camera + model delay, so a press counts as a little earlier
const ZONE_UP = 120, ZONE_DOWN = 70;
const bpmFor = (level, variant, pass) => Math.min(150, (66 + 7 * level) * (variant === "slow" ? 0.78 : 1) * (1 + 0.06 * pass));

let audio = null;
const getAudio = () => { try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; if (!audio) audio = new AC(); if (audio.state === "suspended") audio.resume(); return audio; } catch { return null; } };
function playNote(f, len = 0.8, good = true) {
  const A = getAudio(); if (!A) return; const t = A.currentTime;
  [[1, 0.26], [2, 0.09], [3, 0.045], [4, 0.02]].forEach(([m, v]) => {
    const o = A.createOscillator(), g = A.createGain(); o.type = good ? "sine" : "triangle"; o.frequency.value = good ? f * m : 100 * m;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(good ? v : v * 0.5, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + (good ? Math.max(0.5, len) : 0.16));
    o.connect(g); g.connect(A.destination); o.start(t); o.stop(t + (good ? Math.max(0.5, len) : 0.16) + 0.05);
  });
}

function Stage({ api }) {
  const S = useRef({
    clock: 0, tiles: [], song: 0, k: 0, since: 0, gap: 0, pass: 0, started: false, restLeft: 0, down: [false, false, false, false, false], prev: [0, 0, 0, 0, 0],
    results: [], combo: 0, bestCombo: 0, perfects: 0, wrong: 0, played: 0, flash: null, keyGlow: [0, 0, 0, 0, 0], sparks: [], title: 0, speed: 100,
  }).current;

  const canvasRef = useStageLoop(api, {
    update(dt) {
      const hand = api.handRef.current, level = api.level, variant = api.move.variant, left = api.arm === "left";
      S.clock += dt;
      S.flash && ((S.flash.t -= dt) <= 0) && (S.flash = null);
      S.title = Math.max(0, S.title - dt);
      S.keyGlow = S.keyGlow.map((v) => Math.max(0, v - dt * 3.5));
      S.sparks.forEach((q) => { q.life -= dt; }); S.sparks = S.sparks.filter((q) => q.life > 0);
      const songIdx = Math.min(SONGS.length - 1, level);
      if (!S.started) { S.started = true; S.song = songIdx; S.k = 0; S.since = 1e6; S.gap = 0; S.title = 2.4; }
      const bpm = bpmFor(level, variant, S.pass);
      const pxs = (PX_BEAT * bpm) / 60; // pixels per second
      S.speed = bpm;
      const top = -TILE_H;
      // spawn the next tile of the song once the previous one has moved far enough
      S.since += pxs * dt;
      if (S.since >= S.gap) {
        const song = SONGS[S.song];
        if (S.k < song.n.length) {
          const [n, beats] = song.n[S.k];
          S.tiles.push({ note: n, y: top, done: false, miss: false, beats, mark: null });
          S.since = 0; S.gap = beats * PX_BEAT; S.k += 1;
          if (S.k >= song.n.length) { S.gap = 3.2 * PX_BEAT; }
        } else if (S.tiles.every((t) => t.done || t.y > 1e5)) {
          // song finished: play it again, faster
          const nextSong = songIdx !== S.song;
          S.pass = nextSong ? 0 : S.pass + 1; S.song = songIdx; S.k = 0; S.since = 1e6; S.title = 2.4;
          S.flash = { t: 1.2, text: nextSong ? "NEW SONG!" : `AGAIN, FASTER  (${Math.round(bpmFor(level, variant, S.pass))} BPM)` };
        }
      }
      S.tiles.forEach((t) => { t.y += pxs * dt; });
      // finger presses: bend clearly more than the other fingers; a fast bend counts straight away (quicker response)
      const fingers = left ? FINGERS_R.slice().reverse() : FINGERS_R; // lane i plays note i
      const presses = [];
      if (hand.present) {
        const vals = fingers.map((f) => hand.curl[f]);
        const sum = vals.reduce((a, b) => a + b, 0);
        vals.forEach((v, i) => {
          const others = (sum - v) / 4, rel = v - others, dv = (v - S.prev[i]) / Math.max(dt, 0.001);
          S.prev[i] = v;
          if (!S.down[i] && ((v > 0.45 && rel > 0.18) || (dv > 2.2 && v > 0.28 && rel > 0.1))) { S.down[i] = true; presses.push(i); S.keyGlow[i] = 1; }
          else if (S.down[i] && (v < 0.28 || rel < 0.06)) S.down[i] = false;
        });
      } else { S.down = S.down.map(() => false); }
      // judge: only the first tile that is waiting in the zone can be hit
      const lineY = (S.lineY || 400);
      const waiting = S.tiles.filter((t) => !t.done && t.y >= lineY - ZONE_UP).sort((a, b) => b.y - a.y)[0];
      presses.forEach((lane) => {
        const note = lane;
        if (waiting && !waiting.done && waiting.note === note) {
          const y = waiting.y - pxs * LATENCY, off = Math.abs(y - lineY);
          waiting.done = true; waiting.mark = true;
          const perfect = off <= 26, good = off <= 62;
          S.combo += 1; S.bestCombo = Math.max(S.bestCombo, S.combo); if (perfect) S.perfects += 1; S.played += 1;
          const mult = S.combo >= 10 ? 3 : S.combo >= 5 ? 2 : 1;
          api.hit((perfect ? 30 : good ? 20 : 12) * mult, 90 * hand.curl[fingers[note]]);
          S.results.push(1);
          S.flash = { t: 0.55, text: (perfect ? "PERFECT" : good ? "GOOD" : y < lineY ? "EARLY" : "LATE") + (mult > 1 ? `  x${mult}` : "") };
          playNote(FREQ[note], waiting.beats * 60 / bpm, true);
          S.sparks.push({ lane: note, life: 0.6 });
          api.extraRef.current = { notesPlayed: S.played, perfects: S.perfects, bestCombo: S.bestCombo, wrongPresses: S.wrong, topBpm: Math.round(Math.max(bpm, S.topBpm || 0)) };
          S.topBpm = Math.max(bpm, S.topBpm || 0);
        } else if (waiting) {
          S.wrong += 1; S.flash = { t: 0.7, text: `That was ${FNAMES[fingers[note]]}. This tile is ${FNAMES[fingers[waiting.note]]}`, warn: true }; playNote(0, 0.1, false);
        }
      });
      // tiles that slid past without being played
      S.tiles.forEach((t) => { if (!t.done && t.y > lineY + ZONE_DOWN) { t.done = true; t.miss = true; S.combo = 0; S.results.push(0); api.miss(); } });
      if (S.results.length >= NEED) { const r = S.results.reduce((a, b) => a + b, 0) / S.results.length; S.results = []; api.roundDone(r); }
      S.tiles = S.tiles.filter((t) => t.y < (S.lineY || 400) + 260);
      const next = S.tiles.filter((t) => !t.done).sort((a, b) => b.y - a.y)[0];
      if (!hand.present) api.setCoach(`Show your ${api.arm} hand, palm to the camera`, "warn");
      else if (next && next.y > lineY - 160) api.setCoach(`${FNAMES[fingers[next.note]]} finger now!`, "ok");
      else api.setCoach("Watch the tiles. Press the finger of the tile's lane", "info");
      api.setMission({ text: `Play "${SONGS[S.song].title}": press each tile's finger on the line`, done: Math.min(NEED, S.results.reduce((a, b) => a + b, 0)), total: NEED });
    },
    draw(ctx, { w, h }, time) {
      const hand = api.handRef.current, left = api.arm === "left", col = left ? "#22d3ee" : "#fb923c";
      const fingers = left ? FINGERS_R.slice().reverse() : FINGERS_R;
      const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#150f26"); bg.addColorStop(1, "#0b0716");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      const lanes = 5, lw = Math.min(w * 0.11, 94), x0 = w * 0.5 - (lanes * lw) / 2 - w * 0.06, top = 10, lineY = h - 215;
      S.lineY = lineY;
      ctx.fillStyle = "rgba(255,255,255,0.04)"; roundedRect(ctx, x0 - 8, top, lanes * lw + 16, h - top - 70, 14); ctx.fill();
      for (let i = 0; i < lanes; i++) {
        const lx = x0 + i * lw;
        const g = ctx.createLinearGradient(0, top, 0, lineY); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, `${COLORS[i]}${S.down[i] ? "55" : "1c"}`);
        ctx.fillStyle = g; ctx.fillRect(lx + 2, top, lw - 4, lineY - top);
        ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, top); ctx.lineTo(lx, h - 75); ctx.stroke();
      }
      // hit zone and line
      ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(x0, lineY - 26, lanes * lw, 52);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.shadowColor = "#a78bfa"; ctx.shadowBlur = 14; ctx.beginPath(); ctx.moveTo(x0 - 8, lineY); ctx.lineTo(x0 + lanes * lw + 8, lineY); ctx.stroke(); ctx.shadowBlur = 0;
      // tiles
      S.tiles.forEach((t) => {
        const lx = x0 + t.note * lw, y = t.y;
        if (t.mark) { return; }
        ctx.globalAlpha = t.miss ? 0.28 : 1;
        const near = !t.miss && Math.abs(y - lineY) < ZONE_UP;
        const gr = ctx.createLinearGradient(0, y - TILE_H / 2, 0, y + TILE_H / 2); gr.addColorStop(0, COLORS[t.note]); gr.addColorStop(1, `${COLORS[t.note]}bb`);
        ctx.fillStyle = gr; ctx.shadowColor = COLORS[t.note]; ctx.shadowBlur = near ? 22 : 10;
        roundedRect(ctx, lx + 5, y - TILE_H / 2, lw - 10, TILE_H, 10); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = "#1b1030"; ctx.textAlign = "center"; ctx.font = "900 22px Manrope, system-ui, sans-serif"; ctx.fillText(NOTE_NAMES[t.note], lx + lw / 2, y + 2);
        ctx.font = "800 10px Manrope, system-ui, sans-serif"; ctx.fillText(FNAMES[fingers[t.note]].toUpperCase(), lx + lw / 2, y + 20);
        ctx.globalAlpha = 1;
      });
      S.sparks.forEach((q) => { const lx = x0 + q.lane * lw; ctx.globalAlpha = Math.max(0, q.life); ctx.strokeStyle = COLORS[q.lane]; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(lx + lw / 2, lineY, 16 + (0.6 - q.life) * 90, 0, 6.283); ctx.stroke(); }); ctx.globalAlpha = 1;
      // keys
      for (let i = 0; i < lanes; i++) {
        const lx = x0 + i * lw, curl = hand.present ? hand.curl[fingers[i]] : 0, press = Math.min(1, curl * 1.2), ky = lineY + 40 + press * 14;
        ctx.fillStyle = S.down[i] ? COLORS[i] : "#f3efe6"; ctx.shadowColor = COLORS[i]; ctx.shadowBlur = S.keyGlow[i] * 26;
        roundedRect(ctx, lx + 4, ky, lw - 8, h - ky - 76, 8); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = COLORS[i]; ctx.fillRect(lx + 4, ky, lw - 8, 8);
        ctx.fillStyle = "#2b2140"; ctx.textAlign = "center"; ctx.font = "900 18px Manrope, system-ui, sans-serif"; ctx.fillText(NOTE_NAMES[i], lx + lw / 2, h - 108);
        ctx.font = "800 10px Manrope, system-ui, sans-serif"; ctx.fillText(FNAMES[fingers[i]].toUpperCase(), lx + lw / 2, h - 92);
      }
      // song title and progress, speed meter
      const song = SONGS[S.song];
      ctx.textAlign = "left"; ctx.fillStyle = "rgba(5,3,12,0.75)"; roundedRect(ctx, 14, 14, 190, 78, 12); ctx.fill();
      ctx.fillStyle = "#c4b5fd"; ctx.font = "800 10px Manrope, system-ui, sans-serif"; ctx.fillText("NOW PLAYING", 28, 34);
      ctx.fillStyle = "#fff"; ctx.font = "900 14px Manrope, system-ui, sans-serif"; ctx.fillText(song.title, 28, 53);
      ctx.fillStyle = "rgba(255,255,255,0.15)"; roundedRect(ctx, 28, 62, 160, 7, 3); ctx.fill(); ctx.fillStyle = "#a78bfa"; roundedRect(ctx, 28, 62, Math.max(6, 160 * Math.min(1, S.k / song.n.length)), 7, 3); ctx.fill();
      ctx.fillStyle = "#ffd25a"; ctx.font = "800 11px Manrope, system-ui, sans-serif"; ctx.fillText(`SPEED ${Math.round(S.speed)} BPM  ·  round ${S.pass + 1}`, 28, 84);
      // hand
      const hx = w * 0.84, hy = h * 0.55, hs = Math.min(w * 0.12, h * 0.25);
      ctx.fillStyle = "rgba(255,255,255,0.05)"; roundedRect(ctx, hx - hs * 1.2, hy - hs * 2.3, hs * 2.4, hs * 3.1, 18); ctx.fill();
      if (hand.present) drawLiveHand(ctx, hand, hx, hy, hs, col); else { ctx.fillStyle = "#b6a8d8"; ctx.font = "800 13px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("Show your hand", hx, hy - hs); }
      ctx.fillStyle = col; ctx.font = "900 11px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(`YOUR ${left ? "LEFT" : "RIGHT"} HAND`, hx, hy + hs * 0.95);
      if (S.combo >= 2) { ctx.fillStyle = "#ffd25a"; ctx.font = "900 20px Manrope, system-ui, sans-serif"; ctx.fillText(`🔥 ${S.combo} IN A ROW`, x0 + (lanes * lw) / 2, h * 0.1); }
      if (S.flash) { ctx.globalAlpha = Math.min(1, S.flash.t * 2); ctx.fillStyle = S.flash.warn ? "#ffd25a" : "#7cf2c0"; ctx.font = "900 24px Manrope, system-ui, sans-serif"; ctx.shadowColor = "#000"; ctx.shadowBlur = 8; ctx.textAlign = "center"; ctx.fillText(S.flash.text, x0 + (lanes * lw) / 2, lineY - 40); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
      if (S.title > 0) { ctx.globalAlpha = Math.min(1, S.title); ctx.fillStyle = "#fff"; ctx.font = "900 30px Manrope, system-ui, sans-serif"; ctx.shadowColor = "#000"; ctx.shadowBlur = 10; ctx.textAlign = "center"; ctx.fillText(song.title, x0 + (lanes * lw) / 2, h * 0.3); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
    },
  });
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ filter: api.levelFilter }} />;
}

export default function Piano(props) {
  return <ArmGameFrame meta={META} {...props}>{(api) => <Stage api={api} />}</ArmGameFrame>;
}
