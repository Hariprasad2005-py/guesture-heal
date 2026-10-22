// Regatta (Medium) - row a boat down the lane by pulling both elbows back and stretching out again.
// Fracture, Stroke, Parkinson's, Rotator Cuff.
import { useRef } from "react";
import ArmGameFrame, { HudPill } from "../components/rehab/ArmGameFrame";
import useStageLoop from "../components/rehab/useStageLoop";
import { roundedRect } from "../components/rehab/stageDraw";

const BODY = ["Sit tall, shoulders relaxed and level", "Pull your elbows back past your ribs, like rowing, then stretch the arms out in front", "Keep both arms moving together, steady and smooth"];
const STEPS = [
  "Hold both hands out in front of you, arms stretched, as if holding oars.",
  "PULL: bend both elbows and draw your hands back to your chest. The boat glides forward.",
  "STRETCH: send your hands out again. Every pull and stretch is one stroke.",
];

const META = {
  name: "Regatta",
  emoji: "🚣",
  accent: "#5ac8ff",
  tagline: "Row down the lane. Pull back, stretch out, repeat.",
  sessionSeconds: 150,
  trains: "elbow bending and straightening with both arms together, and a steady rhythm.",
  levelNames: ["Lily Pond", "Winding River", "Misty Lake", "Sunset Bay", "Open Ocean"],
  levelHint: (l) => `a new waterway, fuller strokes and a quicker beat`,
  scoring: [
    "Each full pull then stretch is a stroke and drives the boat.",
    "Both arms moving together earns a bonus. Rowing on the beat earns another.",
    "Row 6 good strokes to reach the next level. Higher levels need a fuller stretch and pull.",
  ],
  moves: [
    { id: "both", label: "Both arms together", motion: "row", arm: "both", steps: STEPS, body: BODY, tip: "pull both elbows back, then stretch out" },
    { id: "left", label: "Left arm only", motion: "row", arm: "left", steps: STEPS.map((s) => s.replace("both elbows", "your left elbow").replace("Hold both hands", "Hold your left hand")), body: BODY, tip: "pull your left elbow back, then stretch out" },
    { id: "right", label: "Right arm only", motion: "row", arm: "right", steps: STEPS.map((s) => s.replace("both elbows", "your right elbow").replace("Hold both hands", "Hold your right hand")), body: BODY, tip: "pull your right elbow back, then stretch out" },
  ],
};

const NEED = 6;
const pullThr = (level) => Math.max(0.4, 0.55 - level * 0.03); // fraction of your full reach: smaller = pulled in more
const extThr = (level) => Math.min(0.9, 0.75 + level * 0.03);
const beat = (level) => Math.max(2.0, 3.3 - level * 0.3);
const TRACK = 14;
// ---- ocean themes: one per level ----
const tree = (ctx, x, y, r, c1, c2) => { ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(x, y, 16 + r * 12, 0, 6.283); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(x - 4, y - 4, 9 + r * 6, 0, 6.283); ctx.fill(); };
const pine = (ctx, x, y, r) => { ctx.fillStyle = "#1d4a3a"; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x, y - 30 + i * 10); ctx.lineTo(x - 14 + i * 1, y - 8 + i * 10); ctx.lineTo(x + 14 - i * 1, y - 8 + i * 10); ctx.fill(); } };
const rock = (ctx, x, y, r) => { ctx.fillStyle = "#6b7280"; ctx.beginPath(); ctx.ellipse(x, y, 12 + r * 12, 9 + r * 6, 0, 0, 6.283); ctx.fill(); ctx.fillStyle = "#9aa3b2"; ctx.beginPath(); ctx.ellipse(x - 3, y - 3, 6 + r * 5, 4 + r * 3, 0, 0, 6.283); ctx.fill(); };
const palm = (ctx, x, y) => { ctx.strokeStyle = "#7a5a34"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y + 16); ctx.lineTo(x + 3, y - 12); ctx.stroke(); ctx.fillStyle = "#2fa85a"; for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; ctx.beginPath(); ctx.ellipse(x + 3 + Math.cos(a) * 11, y - 12 + Math.sin(a) * 6, 11, 4, a, 0, 6.283); ctx.fill(); } };
const THEMES = [
  { name: "Lily Pond", water: ["#0f4b52", "#0d6a66"], wave: "rgba(190,255,235,0.12)", bank: ["#2f5d3a", "rgba(47,93,58,0)"], hull: "#e8d6b0", deck: "#b98e4e", accent: "#7cf2c0",
    bankProp: (c, x, y, r) => tree(c, x, y, r, "#2c6b3d", "#3f8a52"),
    draw: (c, x, y, sd, r1) => { c.fillStyle = "#3da35d"; c.beginPath(); c.arc(x, y, 14 + r1 * 8, 0.3, 6.0); c.lineTo(x, y); c.fill(); if (r1 > 0.6) { c.fillStyle = "#ffb3d1"; c.beginPath(); c.arc(x, y - 2, 5, 0, 6.283); c.fill(); } } },
  { name: "Winding River", water: ["#2a5a6e", "#2f7487"], wave: "rgba(255,255,255,0.12)", bank: ["#6b5436", "rgba(107,84,54,0)"], hull: "#f0dcb6", deck: "#a97c3e", accent: "#ffd25a",
    bankProp: (c, x, y, r) => tree(c, x, y, r, "#2a6a38", "#46934f"),
    draw: (c, x, y, sd, r1) => { c.fillStyle = "rgba(255,255,255,0.08)"; c.beginPath(); c.ellipse(x, y, 30 + r1 * 20, 5, 0, 0, 6.283); c.fill(); } },
  { name: "Misty Lake", water: ["#1d3b5a", "#2b5d86"], wave: "rgba(200,230,255,0.13)", bank: ["#4b5563", "rgba(75,85,99,0)"], hull: "#dcd2bd", deck: "#8d6a42", accent: "#9be3ff",
    bankProp: (c, x, y, r) => (r > 0.5 ? pine(c, x, y, r) : rock(c, x, y, r)),
    draw: (c, x, y, sd, r1, r2, t) => { c.fillStyle = `rgba(220,235,255,${0.06 + 0.03 * Math.sin(t + r1 * 6)})`; c.beginPath(); c.ellipse(x, y, 80, 18, 0, 0, 6.283); c.fill(); } },
  { name: "Sunset Bay", water: ["#5b2a5e", "#e0685a"], wave: "rgba(255,220,170,0.2)", bank: ["#e7c98a", "rgba(231,201,138,0)"], hull: "#fff1d6", deck: "#c17a3a", accent: "#ffcf6a",
    bankProp: (c, x, y, r) => palm(c, x, y),
    draw: (c, x, y, sd, r1, r2, t) => { if (r1 > 0.45) { c.fillStyle = "#fff"; c.beginPath(); c.moveTo(x, y - 26); c.lineTo(x + 14, y + 6); c.lineTo(x, y + 6); c.fill(); c.fillStyle = "#ffd8a8"; c.beginPath(); c.moveTo(x - 2, y - 20); c.lineTo(x - 14, y + 6); c.lineTo(x - 2, y + 6); c.fill(); c.fillStyle = "#5b3a2a"; c.fillRect(x - 12, y + 6, 26, 5); } else { c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 2; const f = Math.sin(t * 5 + r2 * 9) * 3; c.beginPath(); c.moveTo(x - 9, y - f); c.quadraticCurveTo(x - 4, y - 8 - f, x, y); c.quadraticCurveTo(x + 4, y - 8 + f, x + 9, y); c.stroke(); } } },
  { name: "Open Ocean", big: true, water: ["#040f26", "#0a2a52"], wave: "rgba(150,210,255,0.22)", bank: null, hull: "#f4f1e8", deck: "#8a6a3e", accent: "#5ac8ff",
    bankProp: () => {},
    draw: (c, x, y, sd, r1, r2, t) => { if (r1 > 0.7) { c.fillStyle = "#e8f6ff"; c.beginPath(); c.moveTo(x - 20, y + 10); c.lineTo(x - 8, y - 20); c.lineTo(x + 4, y - 6); c.lineTo(x + 14, y - 26); c.lineTo(x + 26, y + 10); c.fill(); c.fillStyle = "#a9d4f0"; c.beginPath(); c.moveTo(x - 8, y - 20); c.lineTo(x + 4, y - 6); c.lineTo(x - 2, y + 10); c.lineTo(x - 20, y + 10); c.fill(); } else { c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 24, y); c.quadraticCurveTo(x, y - 16 - Math.sin(t * 2 + r2 * 8) * 4, x + 24, y); c.stroke(); } } },
];
 // strokes to the finish

function Stage({ api }) {
  const S = useRef({
    maxReach: { l: 0.45, r: 0.45 }, rr: { l: 0.7, r: 0.7 }, state: "wait", strokes: 0, round: [], dist: 0, vel: 0, lastBeat: 0, clock: 0,
    minElbow: 999, maxElbow: 0, lastStrokeT: -9, bonusFlash: 0, flash: null, scroll: 0, laps: 0, symSum: 0, beatHits: 0, ripples: [],
  }).current;

  const canvasRef = useStageLoop(api, {
    update(dt) {
      const inp = api.inputRef.current;
      const arm = api.arm, level = api.level;
      S.clock += dt;
      S.flash && ((S.flash.t -= dt) <= 0) && (S.flash = null);
      ["l", "r"].forEach((k) => {
        const raw = k === "l" ? inp.leftReach : inp.rightReach;
        if (raw != null) {
          S.maxReach[k] = Math.max(0.4, Math.max(S.maxReach[k] * (1 - dt * 0.004), raw));
          S.rr[k] = Math.min(1.1, raw / S.maxReach[k]);
        }
      });
      const keys = arm === "left" ? ["l"] : arm === "right" ? ["r"] : ["l", "r"];
      const rAvg = keys.reduce((a, k) => a + S.rr[k], 0) / keys.length;
      const diff = keys.length === 2 ? Math.abs(S.rr.l - S.rr.r) : 0;
      const eAvg = keys.map((k) => (k === "l" ? inp.leftElbow : inp.rightElbow)).filter((v) => v != null);
      if (eAvg.length) { const e = eAvg.reduce((a, b) => a + b, 0) / eAvg.length; S.minElbow = Math.min(S.minElbow, e); S.maxElbow = Math.max(S.maxElbow, e); }
      S.rNow = rAvg; S.diffNow = diff;
      // boat physics
      S.vel *= Math.pow(0.55, dt);
      S.dist += S.vel * dt; S.scroll += S.vel * dt * 160 + dt * 12;
      // stroke state machine
      const P = pullThr(level), E = extThr(level);
      if (S.state === "wait" && rAvg >= E) S.state = "ext";
      else if (S.state === "ext" && rAvg <= P) {
        S.state = "pull";
        S.strokes += 1;
        const together = diff < 0.25;
        const bt = beat(level);
        const phase = ((S.clock % bt) / bt);
        const onBeat = Math.min(phase, 1 - phase) < 0.2;
        if (together) S.symSum += 1; if (onBeat) S.beatHits += 1;
        const pts = 20 + (together ? 10 : 0) + (onBeat ? 10 : 0);
        S.vel += 0.9 + (together ? 0.3 : 0);
        for (let i = 0; i < 6; i++) S.ripples.push({ x: (Math.random() - 0.5) * 80, y: 20 + Math.random() * 30, r: 4, life: 1 });
        const rom = S.maxElbow > S.minElbow ? S.maxElbow - S.minElbow : 0;
        api.hit(pts, rom); S.round.push(1); S.minElbow = 999; S.maxElbow = 0;
        S.flash = { t: 0.7, text: together && onBeat ? "PERFECT STROKE" : together ? "STROKE, BOTH TOGETHER" : "STROKE" };
        api.extraRef.current = { strokes: S.strokes, togetherStrokes: S.symSum, onBeatStrokes: S.beatHits, laps: S.laps };
        if (S.dist * 1 >= TRACK) { S.dist = 0; S.laps += 1; S.flash = { t: 1.2, text: "FINISH LINE!" }; }
        if (S.round.length >= NEED) { const r = S.round.reduce((a, b) => a + b, 0) / S.round.length; S.round = []; api.roundDone(r); }
      } else if (S.state === "pull" && rAvg >= E) S.state = "ext";
      // stalls: no stroke for a long time counts as a missed stroke
      if (S.state === "ext" && S.clock - S.lastStrokeT > 9999) S.lastStrokeT = S.clock;
      api.setMission({ text: "Row 6 good strokes: pull back, stretch out", done: Math.min(NEED, S.round.length), total: NEED });
      if (S.state === "wait") api.setCoach("Stretch both hands out in front of you to start", "info");
      else if (S.state === "ext") api.setCoach(rAvg > E ? "Now PULL your elbows back to your chest" : "Keep stretching out, a little further", rAvg > E ? "ok" : "warn");
      else api.setCoach(rAvg < P + 0.12 ? "Now STRETCH your arms out again" : "Stretch out fully to reset", "info");
      S.ripples.forEach((p) => { p.life -= dt; p.r += dt * 40; }); S.ripples = S.ripples.filter((p) => p.life > 0);
    },
    draw(ctx, { w, h }, time) {
      const level = api.level, arm = api.arm;
      const TH = THEMES[Math.max(0, Math.min(THEMES.length - 1, level))];
      const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, TH.water[0]); bg.addColorStop(1, TH.water[1]);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      const cx = w * 0.56, laneW = Math.min(w * 0.3, 260);
      const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
      // water shimmer / waves
      ctx.strokeStyle = TH.wave; ctx.lineWidth = TH.big ? 3 : 2;
      for (let i = 0; i < (TH.big ? 22 : 16); i++) { const y = ((i * 47 + S.scroll * 1.2) % (h + 40)) - 20; const x0 = (i * 131) % w; ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo(x0 + 40, y - (TH.big ? 12 : 6), x0 + 80, y); ctx.stroke(); }
      // banks and scenery scrolling past
      const SP = 120;
      for (let k = -1; k < h / SP + 2; k++) {
        const y = ((k * SP + S.scroll) % (h + 2 * SP)) - SP;
        const seed = Math.floor((k * SP + S.scroll) / (h + 2 * SP)) * 31 + k;
        [-1, 1].forEach((sd) => {
          const r1 = rnd(seed * 2 + sd), r2 = rnd(seed * 3 + sd * 7);
          const ex = sd * (laneW + 44 + r1 * 90);
          TH.draw(ctx, cx + ex, y + r2 * 60, sd, r1, r2, time, TH);
        });
      }
      // bank edges
      if (TH.bank) {
        [-1, 1].forEach((sd) => { const bx = cx + sd * (laneW + 36); const g = ctx.createLinearGradient(bx, 0, bx + sd * 400, 0); g.addColorStop(0, TH.bank[0]); g.addColorStop(1, TH.bank[1]); ctx.fillStyle = g; ctx.fillRect(sd < 0 ? 0 : bx, 0, sd < 0 ? bx : w - bx, h); });
        // trees / rocks on the banks
        for (let k = -1; k < h / 90 + 2; k++) {
          const y = ((k * 90 + S.scroll * 0.9) % (h + 180)) - 90;
          [-1, 1].forEach((sd) => { const r = rnd(k * 5 + sd); TH.bankProp(ctx, cx + sd * (laneW + 80 + r * (w * 0.5 - laneW)), y, r, sd); });
        }
      }
      // lane buoys
      for (let i = -1; i < 9; i++) {
        const y = ((i * (h / 6) + S.scroll) % (h + h / 6)) - h / 12;
        [[-laneW, "#ff7a59"], [laneW, "#ffd25a"]].forEach(([dx, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx + dx, y, 8, 0, 6.283); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(cx + dx - 1, y - 14, 2, 8); });
      }
      // finish gate that comes down the lane as you near the line
      const left = TRACK - S.dist;
      if (left < 3.2) {
        const gy = h * 0.58 - 120 - left * 70;
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - laneW, gy); ctx.lineTo(cx + laneW, gy); ctx.stroke();
        for (let i = 0; i < 14; i++) { ctx.fillStyle = i % 2 ? "#111" : "#fff"; ctx.fillRect(cx - laneW + (i * 2 * laneW) / 14, gy - 12, (2 * laneW) / 14, 12); }
        ctx.fillStyle = "#fff"; ctx.font = "900 13px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("FINISH", cx, gy - 18);
      }
      // boat
      const by = h * 0.58;
      const bob = Math.sin(time * 2) * 2;
      S.ripples.forEach((p) => { ctx.strokeStyle = `rgba(255,255,255,${p.life * 0.5})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx + p.x, by + 40 + p.y, p.r, p.r * 0.4, 0, 0, 6.283); ctx.stroke(); });
      // wake behind the boat
      const wk = Math.min(1, S.vel / 1.2);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * wk})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx - 14, by + 90); ctx.lineTo(cx - 60 - wk * 30, by + 230); ctx.moveTo(cx + 14, by + 90); ctx.lineTo(cx + 60 + wk * 30, by + 230); ctx.stroke();
      ctx.save(); ctx.translate(0, bob);
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(cx + 8, by + 8, 30, 104, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = TH.hull; ctx.beginPath(); ctx.moveTo(cx, by - 100); ctx.quadraticCurveTo(cx + 28, by, cx, by + 100); ctx.quadraticCurveTo(cx - 28, by, cx, by - 100); ctx.fill();
      ctx.fillStyle = TH.deck; ctx.beginPath(); ctx.moveTo(cx, by - 80); ctx.quadraticCurveTo(cx + 17, by, cx, by + 80); ctx.quadraticCurveTo(cx - 17, by, cx, by - 80); ctx.fill();
      // rower
      ctx.fillStyle = "#f4d0a8"; ctx.beginPath(); ctx.arc(cx, by - 4, 9, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#2f6fd4"; roundedRect(ctx, cx - 11, by + 4, 22, 22, 7); ctx.fill();
      // oars sweep with the pull
      const oar = (sg, col, r, active) => {
        const pulled = 1 - Math.max(0, Math.min(1, (r - 0.3) / 0.6)); // 0 stretched, 1 pulled
        const ang = -0.6 + pulled * 1.2;
        ctx.save(); ctx.translate(cx + sg * 18, by - 8); ctx.rotate(sg * (Math.PI / 2 - ang * 0.6));
        ctx.strokeStyle = "#6b4a22"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 110); ctx.stroke();
        ctx.fillStyle = active ? col : "rgba(255,255,255,0.25)"; ctx.shadowColor = col; ctx.shadowBlur = active ? 14 : 0; ctx.beginPath(); ctx.ellipse(0, 112, 9, 20, 0, 0, 6.283); ctx.fill();
        ctx.restore();
      };
      oar(-1, "#22d3ee", S.rr.l, arm !== "right");
      oar(1, "#fb923c", S.rr.r, arm !== "left");
      ctx.restore();
      // ---- YOUR OARS panel (left): two bars with clear PULL and STRETCH zones ----
      const P = pullThr(level), E = extThr(level);
      const px0 = w * 0.035, bh = Math.min(h * 0.42, 210), top = h * 0.25;
      ctx.fillStyle = "rgba(5,12,22,0.78)"; roundedRect(ctx, px0, top - 40, 190, bh + 130, 14); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "900 12px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("YOUR ARMS", px0 + 95, top - 20);
      const bar = (x, label, r, col, on) => {
        ctx.fillStyle = "rgba(255,255,255,0.12)"; roundedRect(ctx, x - 14, top, 28, bh, 8); ctx.fill();
        // zones
        ctx.fillStyle = "rgba(124,242,192,0.28)"; ctx.fillRect(x - 14, top + bh - bh * P, 28, bh * P); // pull zone (bottom)
        ctx.fillStyle = "rgba(255,210,90,0.28)"; ctx.fillRect(x - 14, top, 28, bh * (1 - E)); // stretch zone (top)
        ctx.fillStyle = on ? col : "rgba(255,255,255,0.3)"; const fh = bh * Math.max(0.03, Math.min(1, r)); roundedRect(ctx, x - 9, top + bh - fh, 18, fh, 6); ctx.fill();
        ctx.fillStyle = on ? "#fff" : "rgba(255,255,255,0.4)"; ctx.font = "800 11px Manrope, system-ui, sans-serif"; ctx.fillText(label, x, top + bh + 16);
      };
      bar(px0 + 50, "LEFT", S.rr.l, "#22d3ee", arm !== "right");
      bar(px0 + 140, "RIGHT", S.rr.r, "#fb923c", arm !== "left");
      ctx.font = "800 10px Manrope, system-ui, sans-serif";
      ctx.fillStyle = "#ffd25a"; ctx.fillText("STRETCH", px0 + 95, top + 14); ctx.fillStyle = "#7cf2c0"; ctx.fillText("PULL", px0 + 95, top + bh - 8);
      const needPull = S.state === "ext";
      ctx.fillStyle = needPull ? "#7cf2c0" : "#ffd25a"; roundedRect(ctx, px0 + 14, top + bh + 28, 162, 32, 10); ctx.fill();
      ctx.fillStyle = "#0b1b2a"; ctx.font = "900 13px Manrope, system-ui, sans-serif"; ctx.fillText(needPull ? "NEXT: PULL BACK ↓" : "NEXT: STRETCH OUT ↑", px0 + 95, top + bh + 49);
      // ---- progress ----
      const tx = w * 0.3, tw = w * 0.5;
      ctx.fillStyle = "rgba(5,12,22,0.75)"; roundedRect(ctx, tx, 62, tw, 24, 9); ctx.fill();
      ctx.fillStyle = TH.accent; roundedRect(ctx, tx + 3, 65, Math.max(10, (tw - 6) * Math.min(1, S.dist / TRACK)), 18, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "800 11px Manrope, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`${TH.name} · Lap ${S.laps + 1} · ${Math.round(Math.min(1, S.dist / TRACK) * 100)}% to the finish`, tx + tw / 2, 79);
      // row pulse below the track bar
      const bt = beat(level), ph = (S.clock % bt) / bt;
      const bx = cx + laneW + 70, byy = h * 0.32;
      ctx.fillStyle = "rgba(5,12,22,0.7)"; roundedRect(ctx, bx - 56, byy - 52, 112, 112, 14); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.2 + 0.6 * (1 - ph)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, byy - 4, 14 + 22 * ph, 0, 6.283); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(bx, byy - 4, 9, 0, 6.283); ctx.fill();
      ctx.font = "800 10px Manrope, system-ui, sans-serif"; ctx.fillText("PULL WHEN IT", bx, byy + 38); ctx.fillText("PULSES = BONUS", bx, byy + 51);
      if (S.flash) { ctx.globalAlpha = Math.min(1, S.flash.t * 2); ctx.fillStyle = "#fff"; ctx.font = "900 26px Manrope, system-ui, sans-serif"; ctx.shadowColor = "#000"; ctx.shadowBlur = 8; ctx.fillText(S.flash.text, cx, h * 0.3); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
    },
  });

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ filter: api.levelFilter }} />
      <HudPill className="absolute left-3 top-14 z-10" label="Strokes" value={`${S.strokes}`} />
    </>
  );
}

export default function Regatta(props) {
  return <ArmGameFrame meta={META} {...props}>{(api) => <Stage api={api} />}</ArmGameFrame>;
}
