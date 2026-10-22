// Flight (Hard) - tilt your wrist left and right like a steering wheel to fly a plane through rings.
// Wrist, Stroke, Hand surgery, Nerve injury. Uses full-hand tracking (wrist tilt).
import { useRef } from "react";
import ArmGameFrame from "../components/rehab/ArmGameFrame";
import useStageLoop from "../components/rehab/useStageLoop";
import { drawLiveHand, roundedRect } from "../components/rehab/stageDraw";

const BODY = ["Rest your elbow on the table so your forearm points up, hand in front of the camera", "Keep your forearm still. Only the WRIST moves, tilting your hand left and right", "Think of turning a steering wheel with your wrist. Small, smooth tilts"];
const stepsFor = (hand, extra) => [
  `Hold your ${hand} hand up in front of the camera, fingers pointing up, elbow resting on the table. This upright hand is your 'straight ahead'.`,
  "TILT your wrist to the LEFT to fly left, and to the RIGHT to fly right. The little tilt meter at the bottom shows your wrist.",
  "Fly the plane through the glowing rings. An arrow tells you which way the next ring is.",
  `Level up for steady flying. Higher levels have smaller rings and storm clouds to dodge.${extra}`,
];

const META = {
  name: "Flight",
  emoji: "✈️",
  accent: "#38bdf8",
  tagline: "Tilt your wrist like a steering wheel. Fly through the rings.",
  sessionSeconds: 150,
  needsHands: true,
  fastHand: true,
  trains: "wrist tilting side to side (radial and ulnar deviation), with control and steadiness.",
  levelNames: ["Morning Sky", "Canyon Run", "Storm Front", "Sunset Run", "Night Flight"],
  levelHint: (l) => `smaller rings and faster flying${l >= 2 ? ", plus storm clouds to dodge" : ""}`,
  scoring: [
    "Your wrist tilt steers the plane. The straight-up hand position is the middle.",
    "Fly the plane through a ring to score. Rings further out need a bigger tilt.",
    "Pass 8 rings to reach the next level. From Level 3 there are storm clouds: steer around them. Hitting one costs points.",
  ],
  moves: [
    { id: "right", label: "Right wrist steering", motion: "tilt", arm: "right", steps: stepsFor("right", ""), body: BODY, tip: "tilt your wrist left and right to fly through the rings" },
    { id: "left", label: "Left wrist steering", motion: "tilt", arm: "left", steps: stepsFor("left", ""), body: BODY, tip: "tilt your wrist left and right to fly through the rings" },
    { id: "gentle", label: "Right wrist: gentle tilts", motion: "tilt", arm: "right", variant: "gentle", steps: stepsFor("right", " In this one the rings stay close to the middle, so you only need small tilts."), body: BODY, tip: "small gentle tilts, rings stay near the middle" },
  ],
};

const NEED = 8;
const MAX_TILT = 28; // degrees of wrist tilt for the full width
const ringW = (level) => Math.max(0.16, 0.34 - 0.04 * level);
const spreadFor = (level, variant) => (variant === "gentle" ? 0.45 : Math.min(0.95, 0.5 + 0.1 * level));
const gapFor = (level) => Math.max(1.5, 2.6 - 0.25 * level);
const travelFor = (level) => Math.max(1.9, 2.8 - 0.2 * level);
const SKIES = [["#6fb6ff", "#cfe9ff"], ["#e3a15a", "#ffe0b0"], ["#3b4a63", "#8795ad"], ["#ff7a59", "#ffc07a"], ["#0b1230", "#2a3a78"]];

function Stage({ api }) {
  const S = useRef({ clock: 0, neutral: null, cal: [], calT: 0, plane: 0, tilt: 0, items: [], nextSpawn: 1.5, results: [], passed: 0, storms: 0, scroll: 0, flash: null, trail: [], combo: 0, puffs: [] }).current;
  if (!S.puffs.length) for (let i = 0; i < 14; i++) S.puffs.push({ x: (Math.random() - 0.5) * 2.2, z: Math.random(), s: 0.6 + Math.random() * 0.8 });

  const canvasRef = useStageLoop(api, {
    update(dt) {
      const hand = api.handRef.current, level = api.level, variant = api.move.variant;
      S.clock += dt; S.flash && ((S.flash.t -= dt) <= 0) && (S.flash = null);
      S.puffs.forEach((p) => { p.z -= dt * 0.35; if (p.z < 0) { p.z += 1; p.x = (Math.random() - 0.5) * 2.2; } });
      if (!hand.present) { api.setCoach(`Show your ${api.arm} hand, fingers up`, "warn"); return; }
      // the first moment the hand is upright and steady sets "straight ahead"
      if (S.neutral == null) {
        S.cal.push(hand.tilt); S.calT += dt;
        api.setCoach("Hold your hand upright: setting 'straight ahead'...", "info");
        if (S.calT > 1.0) { const a = S.cal.slice().sort((x, y) => x - y); S.neutral = a[Math.floor(a.length / 2)]; }
        return;
      }
      const rel = hand.tilt - S.neutral;
      S.tilt = rel;
      const target = Math.max(-1.15, Math.min(1.15, rel / MAX_TILT));
      S.plane += (target - S.plane) * Math.min(1, dt * 9);
      S.trail.push(S.plane); if (S.trail.length > 16) S.trail.shift();
      // spawn rings and storms
      if (S.clock >= S.nextSpawn) {
        const sp = spreadFor(level, variant);
        const storm = level >= 2 && Math.random() < 0.28;
        let x = (Math.random() * 2 - 1) * sp;
        const last = S.items.filter((i) => !i.storm).slice(-1)[0];
        if (!storm && last && Math.abs(x - last.x) < 0.35) x = Math.max(-sp, Math.min(sp, last.x + (x >= last.x ? 0.5 : -0.5)));
        S.items.push({ x, storm, z: 1, w: storm ? 0.3 : ringW(level), done: false });
        S.nextSpawn += gapFor(level) * (storm ? 0.6 : 1);
      }
      const travel = travelFor(level);
      S.items.forEach((it) => {
        it.z -= dt / travel;
        if (!it.done && it.z <= 0) {
          it.done = true;
          const dx = Math.abs(S.plane - it.x);
          if (it.storm) {
            if (dx < it.w) { api.miss(); S.combo = 0; S.flash = { t: 0.9, text: "STORM! Steer around", warn: true }; }
            else { api.bonus(10); S.flash = { t: 0.6, text: "Dodged it!" }; }
          } else if (dx <= it.w) {
            S.combo += 1; const mult = S.combo >= 6 ? 3 : S.combo >= 3 ? 2 : 1;
            api.hit((dx < it.w * 0.4 ? 35 : 22) * mult, Math.abs(rel));
            S.passed += 1; S.results.push(1); S.flash = { t: 0.7, text: dx < it.w * 0.4 ? "BULLSEYE" : "RING!" + (mult > 1 ? `  x${mult}` : "") };
            api.extraRef.current = { ringsPassed: S.passed, wristTiltRangeDeg: Math.round(Math.max(...[S.maxL || 0, S.maxR || 0])) };
          } else { S.combo = 0; S.results.push(0); api.miss(); S.flash = { t: 0.8, text: it.x > S.plane ? "Missed: tilt RIGHT sooner" : "Missed: tilt LEFT sooner", warn: true }; }
          if (!it.storm && S.results.length >= NEED) { const r = S.results.reduce((a, b) => a + b, 0) / S.results.length; S.results = []; api.roundDone(r); }
        }
      });
      if (rel < 0) S.maxL = Math.max(S.maxL || 0, -rel); else S.maxR = Math.max(S.maxR || 0, rel);
      S.items = S.items.filter((i) => i.z > -0.15);
      const nxt = S.items.filter((i) => !i.done).sort((a, b) => a.z - b.z)[0];
      if (nxt && !nxt.storm) api.setCoach(nxt.x > S.plane + 0.12 ? "Tilt your wrist to the RIGHT  →" : nxt.x < S.plane - 0.12 ? "←  Tilt your wrist to the LEFT" : "Hold it there, you are lined up", Math.abs(nxt.x - S.plane) < 0.12 ? "ok" : "info");
      else if (nxt && nxt.storm) api.setCoach(Math.abs(nxt.x - S.plane) < nxt.w + 0.1 ? "Storm ahead! Steer away" : "Clear skies", "warn");
      else api.setCoach("Keep your wrist loose and steady", "info");
      api.setMission({ text: "Fly through 8 rings: tilt your wrist left and right", done: Math.min(NEED, S.results.reduce((a, b) => a + b, 0)), total: NEED });
    },
    draw(ctx, { w, h }, time) {
      const level = api.level, hand = api.handRef.current, left = api.arm === "left", col = left ? "#22d3ee" : "#fb923c";
      const [s1, s2] = SKIES[Math.min(SKIES.length - 1, level)];
      const hor = h * 0.38;
      const sky = ctx.createLinearGradient(0, 0, 0, hor); sky.addColorStop(0, s1); sky.addColorStop(1, s2);
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, hor);
      const gnd = ctx.createLinearGradient(0, hor, 0, h); gnd.addColorStop(0, level === 4 ? "#0f1a3d" : level === 3 ? "#6b3a4a" : "#3b6d4a"); gnd.addColorStop(1, level === 4 ? "#060b1f" : "#1c3a2a");
      ctx.fillStyle = gnd; ctx.fillRect(0, hor, w, h - hor);
      if (level === 4) { ctx.fillStyle = "#fff"; for (let i = 0; i < 40; i++) { ctx.globalAlpha = 0.3 + 0.7 * ((i * 37) % 10) / 10; ctx.fillRect((i * 97) % w, (i * 53) % hor, 2, 2); } ctx.globalAlpha = 1; }
      // ground stripes rushing toward you
      ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) { const z = ((i / 12) + (time * 0.35)) % 1, y = hor + (h - hor) * z * z; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      const cx = w * 0.5 - w * 0.04, W = Math.min(w * 0.36, 380);
      const proj = (x, z) => { const sc = 1 - 0.88 * z; return { x: cx + x * W * sc, y: hor + (h * 0.5 - hor + 0) * (1 - z) * 0.85 + 6, sc }; };
      // clouds
      S.puffs.forEach((p) => { const q = proj(p.x * 1.1, p.z); ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - p.z)})`; ctx.beginPath(); ctx.ellipse(q.x, hor - 30 + (1 - p.z) * 20, 60 * q.sc * p.s, 16 * q.sc * p.s, 0, 0, 6.283); ctx.fill(); });
      // rings and storms, far to near
      S.items.slice().sort((a, b) => b.z - a.z).forEach((it) => {
        const z = Math.max(0, it.z), q = proj(it.x, z), r = it.w * W * q.sc * 1.0;
        ctx.globalAlpha = it.done ? Math.max(0, 1 + it.z * 6) : 1;
        if (it.storm) {
          ctx.fillStyle = "#3a3f55"; ctx.shadowColor = "#000"; ctx.shadowBlur = 16;
          [[-0.5, 0.1, 0.7], [0, -0.2, 0.9], [0.5, 0.1, 0.7]].forEach(([ox, oy, s]) => { ctx.beginPath(); ctx.ellipse(q.x + ox * r * 1.4, q.y + oy * r, r * s, r * s * 0.7, 0, 0, 6.283); ctx.fill(); });
          ctx.shadowBlur = 0; ctx.strokeStyle = "#ffe066"; ctx.lineWidth = Math.max(1.5, 4 * q.sc); ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - r * 0.2, q.y + r * 0.5); ctx.lineTo(q.x + r * 0.1, q.y + r * 0.5); ctx.lineTo(q.x - r * 0.1, q.y + r * 1.0); ctx.stroke();
        } else {
          ctx.strokeStyle = "#7cf2c0"; ctx.shadowColor = "#7cf2c0"; ctx.shadowBlur = 18 * q.sc; ctx.lineWidth = Math.max(3, 12 * q.sc);
          ctx.beginPath(); ctx.ellipse(q.x, q.y, r, r * 0.95, 0, 0, 6.283); ctx.stroke(); ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
      });
      // plane (seen from behind), banks with your tilt
      const px = cx + Math.max(-1.15, Math.min(1.15, S.plane)) * W, py = h * 0.7, roll = (S.plane) * 0.5;
      S.trail.forEach((tx, i) => { ctx.fillStyle = `rgba(255,255,255,${(i / S.trail.length) * 0.25})`; ctx.beginPath(); ctx.arc(cx + tx * W, py + 20 + (S.trail.length - i) * 3, 5, 0, 6.283); ctx.fill(); });
      ctx.save(); ctx.translate(px, py); ctx.rotate(roll);
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0, 50, 60, 10, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#f4f6fa"; ctx.beginPath(); ctx.moveTo(-70, 8); ctx.lineTo(0, -6); ctx.lineTo(70, 8); ctx.lineTo(0, 22); ctx.closePath(); ctx.fill(); // wings
      ctx.fillStyle = "#38bdf8"; ctx.beginPath(); ctx.moveTo(-70, 8); ctx.lineTo(-52, 6); ctx.lineTo(-54, 12); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(70, 8); ctx.lineTo(52, 6); ctx.lineTo(54, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#dfe6f1"; ctx.beginPath(); ctx.ellipse(0, 6, 13, 30, 0, 0, 6.283); ctx.fill(); // body
      ctx.fillStyle = "#38bdf8"; ctx.beginPath(); ctx.ellipse(0, -8, 7, 12, 0, 0, 6.283); ctx.fill(); // cockpit
      ctx.fillStyle = "#f4f6fa"; ctx.beginPath(); ctx.moveTo(-22, 30); ctx.lineTo(22, 30); ctx.lineTo(0, 40); ctx.closePath(); ctx.fill(); // tail
      ctx.restore();
      // tilt meter (bottom centre)
      const mw = Math.min(260, w * 0.3), mx = w * 0.5 - w * 0.04, my = h - 140;
      ctx.fillStyle = "rgba(5,10,25,0.78)"; roundedRect(ctx, mx - mw / 2 - 14, my - 28, mw + 28, 58, 12); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.14)"; roundedRect(ctx, mx - mw / 2, my - 4, mw, 8, 4); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx, my - 12); ctx.lineTo(mx, my + 12); ctx.stroke();
      const tx = mx + Math.max(-1, Math.min(1, S.plane)) * (mw / 2);
      ctx.fillStyle = "#38bdf8"; ctx.shadowColor = "#38bdf8"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(tx, my, 10, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = "#cbd5e1"; ctx.font = "800 10px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("← LEFT", mx - mw / 2 + 16, my + 24); ctx.fillText("RIGHT →", mx + mw / 2 - 18, my + 24); ctx.fillText(S.neutral == null ? "SETTING MIDDLE..." : `WRIST ${Math.round(S.tilt)}°`, mx, my - 16);
      // your hand
      const hx = w * 0.86, hy = h * 0.5, hs = Math.min(w * 0.1, h * 0.2);
      ctx.fillStyle = "rgba(5,10,25,0.5)"; roundedRect(ctx, hx - hs * 1.2, hy - hs * 2.3, hs * 2.4, hs * 3.1, 18); ctx.fill();
      if (hand.present) drawLiveHand(ctx, hand, hx, hy, hs, col); else { ctx.fillStyle = "#cbd5e1"; ctx.font = "800 13px Manrope, system-ui, sans-serif"; ctx.fillText("Show your hand", hx, hy - hs); }
      // keep the hand panel upright by showing the target tilt arrow above it
      ctx.fillStyle = col; ctx.font = "900 11px Manrope, system-ui, sans-serif"; ctx.fillText(`YOUR ${left ? "LEFT" : "RIGHT"} HAND`, hx, hy + hs * 0.95);
      if (S.combo >= 2) { ctx.fillStyle = "#ffd25a"; ctx.font = "900 18px Manrope, system-ui, sans-serif"; ctx.fillText(`🔥 ${S.combo} RINGS IN A ROW`, cx, h * 0.14); }
      if (S.flash) { ctx.globalAlpha = Math.min(1, S.flash.t * 2); ctx.fillStyle = S.flash.warn ? "#ffd25a" : "#fff"; ctx.font = "900 28px Manrope, system-ui, sans-serif"; ctx.shadowColor = "#000"; ctx.shadowBlur = 8; ctx.fillText(S.flash.text, cx, h * 0.24); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
    },
  });
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ filter: api.levelFilter }} />;
}

export default function Flight(props) {
  return <ArmGameFrame meta={META} {...props}>{(api) => <Stage api={api} />}</ArmGameFrame>;
}
