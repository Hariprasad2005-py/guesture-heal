// Steady Hand (Medium) - guide your fingertip along a winding wire without touching the sides.
// Parkinson's (tremor), Stroke, Hand surgery, Nerve injury, Wrist. Uses full-hand tracking (index fingertip + shake).
import { useRef } from "react";
import ArmGameFrame from "../components/rehab/ArmGameFrame";
import useStageLoop from "../components/rehab/useStageLoop";
import { drawLiveHand, roundedRect } from "../components/rehab/stageDraw";

const BODY = ["Rest your elbow on the table and keep your forearm still", "Point with your index finger. The camera follows the tip of that finger", "Move slowly and smoothly. Slow is better than fast here"];
const stepsFor = (hand, extra) => [
  `Hold your ${hand} hand up in front of the camera and point with your index finger. Hold it still for a moment where it is comfortable: that spot becomes START.`,
  "A glowing wire path appears. Your fingertip is the glowing dot. Guide the dot along the wire from the green start to the finish flag.",
  "Stay inside the wire's band. If you touch the edge it flashes red. Each checkpoint rewards a steady hand.",
  `The shake meter shows how steady you are. Slow, calm movements score best.${extra}`,
];

const META = {
  name: "Steady Hand",
  emoji: "🎯",
  accent: "#2dd4bf",
  tagline: "Guide your fingertip along the wire. Stay steady.",
  sessionSeconds: 150,
  needsHands: true,
  trackHandRom: false,
  trains: "fine hand control and steadiness (reducing tremor), moving slowly and precisely.",
  levelNames: ["Garden Path", "River Bend", "Mountain Pass", "Needle Eye", "Surgeon"],
  levelHint: (l) => `a narrower wire and a curvier path`,
  scoring: [
    "Your fingertip is the dot. Follow the glowing wire from start to finish without touching its edges.",
    "There are 5 checkpoints on the way. Each one scores more if your hand was steady and you stayed on the wire.",
    "Finish the wire cleanly to reach the next level. Higher levels have a narrower wire and more curves.",
  ],
  moves: [
    { id: "right", label: "Right hand wire", motion: "trace", arm: "right", steps: stepsFor("right", ""), body: BODY, tip: "guide your fingertip along the glowing wire" },
    { id: "left", label: "Left hand wire", motion: "trace", arm: "left", steps: stepsFor("left", ""), body: BODY, tip: "guide your fingertip along the glowing wire" },
    { id: "wide", label: "Right hand: wide wire", motion: "trace", arm: "right", variant: "wide", steps: stepsFor("right", " This one has a wider wire, so it is more forgiving."), body: BODY, tip: "wide wire, calm slow movements" },
  ],
};

const NEED_CP = 5;
const widthFor = (level, variant) => (variant === "wide" ? 1.35 : 1) * Math.max(0.042, 0.085 - 0.009 * level); // half-width as a fraction of stage height
const ampFor = (level) => Math.min(0.3, 0.12 + 0.04 * level);
const R_X = 18, R_Y = 20; // percent of the camera picture the finger travels for one stage half-width / half-height

const makePath = (level, seed) => {
  const A1 = ampFor(level), A2 = A1 * 0.45, f1 = 1.4 + 0.25 * level, f2 = 3 + 0.4 * level, p1 = seed * 2.3, p2 = seed * 1.1 + 1;
  const pts = [];
  for (let i = 0; i <= 80; i++) { const u = i / 80; pts.push({ u, x: -1 + 2 * u, y: A1 * Math.sin(Math.PI * f1 * u + p1) * Math.min(1, u * 6) + A2 * Math.sin(Math.PI * f2 * u + p2) * Math.min(1, u * 6) * Math.min(1, (1 - u) * 6) }); }
  return pts;
};

function Stage({ api }) {
  const S = useRef({ clock: 0, center: null, cal: [], calT: 0, cur: { x: 0, y: 0 }, trail: [], path: makePath(0, 1), seed: 1, prog: 0, cp: 0, touched: false, touchNow: false, touchCd: 0, cleanSince: true, results: [], flash: null, wave: [], steadySum: 0, steadyN: 0, touches: 0, shake: 0, tremor: 0, roundT: 0 }).current;

  const canvasRef = useStageLoop(api, {
    update(dt) {
      const hand = api.handRef.current, level = api.level, variant = api.move.variant;
      S.clock += dt; S.flash && ((S.flash.t -= dt) <= 0) && (S.flash = null); S.touchCd = Math.max(0, S.touchCd - dt); S.shake = Math.max(0, S.shake - dt * 3);
      if (!hand.present || !hand.tip) { api.setCoach(`Point with your ${api.arm} index finger at the camera`, "warn"); return; }
      // calibrate: where is your fingertip when you rest in the middle
      if (S.center == null) {
        S.cal.push({ x: hand.tip.x, y: hand.tip.y }); S.calT += dt;
        api.setCoach("Hold your fingertip still where it is comfortable: this becomes START...", "info");
        if (S.calT > 1.0) { S.center = { x: S.cal.reduce((a, p) => a + p.x, 0) / S.cal.length, y: S.cal.reduce((a, p) => a + p.y, 0) / S.cal.length }; }
        return;
      }
      // fingertip -> stage (-1..1 across, -1..1 down)
      const tx = Math.max(-1.3, Math.min(1.3, -1 + (hand.tip.x - S.center.x) / R_X)), ty = Math.max(-1.3, Math.min(1.3, (hand.tip.y - S.center.y) / R_Y));
      S.cur.x += (tx - S.cur.x) * Math.min(1, dt * 14); S.cur.y += (ty - S.cur.y) * Math.min(1, dt * 14);
      S.trail.push({ x: S.cur.x, y: S.cur.y }); if (S.trail.length > 24) S.trail.shift();
      S.tremor += (hand.tremor - S.tremor) * Math.min(1, dt * 4);
      S.wave.push(hand.tremor); if (S.wave.length > 90) S.wave.shift();
      const steady = Math.max(0, Math.min(100, 100 - S.tremor * 22));
      S.steadySum += steady; S.steadyN += 1;
      S.roundT += dt;
      // where on the wire is the finger? (the stage is square-ish: x in half-widths, y scaled by the aspect)
      const P = S.path, halfW = widthFor(level, variant);
      const kx = (S.asp || 1.6) * 0.31; // x units: stage heights
      let best = 0, bd = 9;
      for (let i = 0; i < P.length; i++) { const dx = (S.cur.x - P[i].x) * kx, dy = S.cur.y * 0.36 - P[i].y; const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = i; } }
      const prog = best / (P.length - 1);
      const inside = bd <= halfW;
      S.touchNow = !inside;
      if (!inside && S.touchCd <= 0 && S.prog > 0.01) { S.touches += 1; S.touchCd = 1.0; S.cleanSince = false; S.shake = 1; api.miss(); S.flash = { t: 0.6, text: "Touched the wire!", warn: true }; }
      // progress only moves forward along the wire, no jumping ahead
      if (inside && prog < 0.06) S.started = true;
      if (inside && S.started && prog > S.prog && prog - S.prog < 0.18) S.prog = prog;
      // checkpoints every 20%
      const cpNow = Math.floor(S.prog * NEED_CP + 1e-6);
      if (cpNow > S.cp && S.cp < NEED_CP) {
        S.cp = cpNow;
        const clean = S.cleanSince;
        api.hit(Math.round((clean ? 30 : 12) + steady * 0.3 + level * 3), 0);
        S.results.push(clean ? 1 : 0.5);
        S.flash = { t: 0.9, text: `CHECKPOINT ${S.cp}: steady ${Math.round(steady)}%` };
        S.cleanSince = true;
        api.extraRef.current = { avgSteadinessPct: Math.round(S.steadySum / Math.max(1, S.steadyN)), wireTouches: S.touches, checkpointsReached: S.cp, avgTremorPctOfPalm: Math.round(S.tremor * 10) / 10 };
        if (S.cp >= NEED_CP) {
          const rate = S.results.reduce((a, b) => a + b, 0) / NEED_CP;
          S.flash = { t: 1.4, text: "FINISHED THE WIRE" };
          S.results = []; S.cp = 0; S.prog = 0; S.started = false; S.seed += 1; S.path = makePath(level + (rate >= 0.75 ? 1 : 0), S.seed); S.touches = 0; S.roundT = 0;
          api.roundDone(rate);
        }
      }
      // too slow: give up after 70s on one wire
      if (S.roundT > 70) { S.results = []; S.cp = 0; S.prog = 0; S.started = false; S.started = false; S.seed += 1; S.path = makePath(level, S.seed); S.roundT = 0; api.roundDone(0.3); }
      api.setCoach(S.prog < 0.02 && S.touchNow ? "Bring your fingertip to the green START circle" : S.touchNow ? "Back onto the wire, slowly" : S.tremor > 2.5 ? "Relax your hand, breathe out, go slower" : S.prog < 0.02 ? "Move onto the green START and follow the wire" : "Nice and steady. Keep following the wire", S.touchNow ? "warn" : S.tremor > 2.5 ? "warn" : "ok");
      api.setMission({ text: "Follow the wire to the flag without touching the sides", done: S.cp, total: NEED_CP });
    },
    draw(ctx, { w, h }, time) {
      const level = api.level, variant = api.move.variant, hand = api.handRef.current, left = api.arm === "left", col = left ? "#22d3ee" : "#fb923c";
      S.asp = w / h;
      const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#082a2e"); bg.addColorStop(1, "#04171a");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(45,212,191,0.07)"; ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      const ox = w * 0.42, oy = h * 0.5;
      const toS = (px, py) => [ox + px * (w * 0.31), oy + py * h];
      const halfW = widthFor(level, variant) * h;
      const shake = S.shake > 0 ? Math.sin(time * 60) * 4 * S.shake : 0;
      ctx.save(); ctx.translate(shake, 0);
      // wire corridor
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      const pathStroke = (lw, style) => { ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.beginPath(); S.path.forEach((p, i) => { const [x, y] = toS(p.x, p.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); };
      pathStroke(halfW * 2 + 10, "rgba(45,212,191,0.16)");
      pathStroke(halfW * 2, S.touchNow ? "rgba(239,68,68,0.28)" : "rgba(8,60,64,0.9)");
      // progress glow
      ctx.strokeStyle = "#5eead4"; ctx.shadowColor = "#2dd4bf"; ctx.shadowBlur = 14; ctx.lineWidth = 4; ctx.beginPath();
      S.path.forEach((p, i) => { if (p.u > S.prog) return; const [x, y] = toS(p.x, p.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); ctx.shadowBlur = 0;
      // checkpoints, start, flag
      for (let k = 1; k <= NEED_CP; k++) { const i = Math.round((k / NEED_CP) * (S.path.length - 1)), [x, y] = toS(S.path[i].x, S.path[i].y); const done = S.cp >= k; ctx.fillStyle = done ? "#22c55e" : "rgba(255,255,255,0.3)"; ctx.beginPath(); ctx.arc(x, y, k === NEED_CP ? 0 : 7, 0, 6.283); ctx.fill(); }
      const [s0x, s0y] = toS(S.path[0].x, S.path[0].y), [e0x, e0y] = toS(S.path[80].x, S.path[80].y);
      ctx.fillStyle = "#22c55e"; ctx.beginPath(); ctx.arc(s0x, s0y, 15, 0, 6.283); ctx.fill(); ctx.fillStyle = "#06210f"; ctx.font = "900 11px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("START", s0x, s0y + 4);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(e0x, e0y + 18); ctx.lineTo(e0x, e0y - 26); ctx.stroke(); ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.moveTo(e0x, e0y - 26); ctx.lineTo(e0x + 26, e0y - 17); ctx.lineTo(e0x, e0y - 8); ctx.fill();
      // your fingertip
      if (S.center) {
        S.trail.forEach((q, i) => { const [x, y] = [ox + q.x * (w * 0.31), oy + q.y * 0.36 * h]; ctx.fillStyle = `rgba(255,255,255,${(i / S.trail.length) * 0.25})`; ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.283); ctx.fill(); });
        const fx = ox + S.cur.x * (w * 0.31), fy = oy + S.cur.y * 0.36 * h;
        ctx.fillStyle = S.touchNow ? "#ef4444" : "#fff"; ctx.shadowColor = S.touchNow ? "#ef4444" : "#2dd4bf"; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(fx, fy, 11, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = "#cffafe"; ctx.font = "800 10px Manrope, system-ui, sans-serif"; ctx.fillText("YOUR FINGER", fx, fy - 18);
      }
      ctx.restore();
      // shake meter (right)
      const steady = Math.max(0, Math.min(100, 100 - S.tremor * 22));
      const mx = w * 0.12, my = h * 0.16, mw = 140;
      ctx.fillStyle = "rgba(2,20,22,0.8)"; roundedRect(ctx, mx - mw / 2 - 12, my - 22, mw + 24, 120, 12); ctx.fill();
      ctx.fillStyle = "#99f6e4"; ctx.font = "800 10px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("STEADINESS", mx, my - 6);
      ctx.fillStyle = "rgba(255,255,255,0.14)"; roundedRect(ctx, mx - mw / 2, my + 2, mw, 10, 5); ctx.fill();
      ctx.fillStyle = steady > 70 ? "#22c55e" : steady > 40 ? "#fbbf24" : "#ef4444"; roundedRect(ctx, mx - mw / 2, my + 2, Math.max(8, mw * steady / 100), 10, 5); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "900 16px Manrope, system-ui, sans-serif"; ctx.fillText(`${Math.round(steady)}%`, mx, my + 34);
      // live shake line
      ctx.strokeStyle = "#2dd4bf"; ctx.lineWidth = 1.5; ctx.beginPath();
      S.wave.forEach((v, i) => { const x = mx - mw / 2 + (i / 90) * mw, y = my + 78 - Math.min(24, v * 7); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
      ctx.fillStyle = "#6ee7d6"; ctx.font = "700 9px Manrope, system-ui, sans-serif"; ctx.fillText("SHAKE, LAST 3 SECONDS", mx, my + 94);
      // your hand
      const hx = w * 0.87, hy = h * 0.74, hs = Math.min(w * 0.09, h * 0.2);
      ctx.fillStyle = "rgba(2,20,22,0.55)"; roundedRect(ctx, hx - hs * 1.2, hy - hs * 2.2, hs * 2.4, hs * 3.05, 16); ctx.fill();
      if (hand.present) drawLiveHand(ctx, hand, hx, hy, hs, col, { highlight: 8 }); else { ctx.fillStyle = "#99f6e4"; ctx.font = "800 12px Manrope, system-ui, sans-serif"; ctx.fillText("Show your hand", hx, hy - hs); }
      if (S.flash) { ctx.globalAlpha = Math.min(1, S.flash.t * 2); ctx.fillStyle = S.flash.warn ? "#fca5a5" : "#5eead4"; ctx.font = "900 26px Manrope, system-ui, sans-serif"; ctx.shadowColor = "#000"; ctx.shadowBlur = 8; ctx.textAlign = "center"; ctx.fillText(S.flash.text, ox, h * 0.16); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
      if (S.center == null) { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = "#fff"; ctx.font = "900 22px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("Point with your index finger and hold it still: this is your START", ox, h * 0.5); }
    },
  });
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ filter: api.levelFilter }} />;
}

export default function SteadyHand(props) {
  return <ArmGameFrame meta={META} {...props}>{(api) => <Stage api={api} />}</ArmGameFrame>;
}
