// Daily Tasks (Medium) - practise everyday movements: sip a drink, brush your hair, reach a shelf.
// Stroke, Hand Surgery, Fracture.
import { useRef } from "react";
import ArmGameFrame from "../components/rehab/ArmGameFrame";
import useStageLoop from "../components/rehab/useStageLoop";
import { roundedRect } from "../components/rehab/stageDraw";

const BODY = ["Sit tall with your back against the chair", "Move slowly: the camera follows your hand relative to your own body", "Use the hand you are practising, rest the other in your lap"];

const mk = (id, label, arm, handWord) => ({
  id, label, motion: "tasks", arm,
  steps: [
    `Task 1, SHELF: reach your ${handWord} hand up high, above your head, to the jar on the shelf and hold. Then lower it to the counter.`,
    `Task 2, SIP: pick up the cup from the counter (low circle), bring it to your mouth and hold for a second. Then put it back down.`,
    `Task 3, BRUSH: lift your ${handWord} hand to the side of your head and stroke up and back 3 times, like brushing your hair. Then lower it.`,
    `Task 4, SHOULDER: bring your ${handWord} hand across to touch the opposite shoulder and hold. Then lower it.`,
  ],
  body: BODY,
  tip: `follow the glowing circle on the body map with your ${handWord} hand`,
});

const META = {
  name: "Daily Tasks",
  emoji: "☕",
  accent: "#6fd0c2",
  tagline: "Practise everyday movements: reach a shelf, sip, brush your hair, touch your shoulder.",
  sessionSeconds: 150,
  trains: "everyday reaching: hand to mouth, hand to head, and reaching up high, the movements you need at home.",
  levelNames: ["Morning", "Midday", "Afternoon", "Evening", "Weekend"],
  levelHint: (l) => `longer holds and ${3 + Math.min(2, l)} hair strokes`,
  scoring: [
    "The kitchen scene shows your head and shoulders. The glowing circle is where your hand should go. The white dot is your hand.",
    "Finish a task: reach the shelf, sip, brush your hair, touch the opposite shoulder. Each finished task scores.",
    "Finish all 4 tasks to reach the next level. Higher levels need a longer hold and more brush strokes.",
  ],
  moves: [mk("right", "Right hand tasks", "right", "right"), mk("left", "Left hand tasks", "left", "left"), mk("both", "Either hand", "both", "(stronger or choice of)")],
};

const TASKS = [
  { id: "shelf", name: "Reach the shelf" },
  { id: "sip", name: "Sip from the cup" },
  { id: "brush", name: "Brush your hair" },
  { id: "shoulder", name: "Touch opposite shoulder" },
];
const N = TASKS.length;
const holdFor = (level) => 0.8 + level * 0.15;
const strokesFor = (level) => 3 + Math.min(2, level);

// hand position in shoulder-widths from the middle of the shoulders (up is negative y)
function rel(hand, body) {
  if (!hand || !body) return null;
  return { dx: (hand.x - body.x) / body.w, dy: (hand.y - body.y) / body.w };
}
const inLow = (r) => r && r.dy > 0.55;
const inMouth = (r) => r && Math.abs(r.dx) < 0.6 && r.dy > -1.2 && r.dy < -0.2;
const inHair = (r) => r && Math.abs(r.dx) > 0.3 && r.dy < -0.45 && r.dy > -1.9;
const inShelf = (r) => r && r.dy < -1.25;
const inShoulder = (r, hs) => r && r.dx * hs < -0.1 && Math.abs(r.dx) < 1.4 && r.dy > -0.55 && r.dy < 0.55;

const INK = "#10161f", TEAL = "#2f6f73", SLATE = "#6f7d86", AMBER = "#f5b942", GREEN = "#4ade80";

function Stage({ api }) {
  const S = useRef({ task: 0, step: 0, hold: 0, strokes: 0, hairHigh: false, timer: 0, done: Array(N).fill(false), rounds: 0, rel: null, elevMax: 0, flash: null, trail: [], hs: 1 }).current;
  const tgtFor = () => {
    const t = TASKS[S.task].id;
    if (t === "shelf") return S.step === 0 ? "shelf" : "low";
    if (t === "sip") return S.step === 0 ? "low" : S.step === 1 ? "mouth" : "low";
    if (t === "brush") return S.step === 0 ? "hair" : S.step === 1 ? "hairlow" : "low";
    return S.step === 0 ? "shoulder" : "low";
  };

  const canvasRef = useStageLoop(api, {
    update(dt) {
      const inp = api.inputRef.current;
      const level = api.level;
      S.flash && ((S.flash.t -= dt) <= 0) && (S.flash = null);
      S.hs = api.arm === "left" ? -1 : api.arm === "right" ? 1 : inp.hand && inp.hand === inp.left ? -1 : inp.hand && inp.hand === inp.right ? 1 : S.hs;
      const r = rel(inp.hand, inp.body);
      S.rel = r;
      if (r) { S.trail.push({ dx: r.dx, dy: r.dy }); if (S.trail.length > 12) S.trail.shift(); }
      S.elevMax = Math.max(S.elevMax, inp.elev || 0);
      const at = (z) => (z === "low" ? inLow(r) : z === "mouth" ? inMouth(r) : z === "hair" ? inHair(r) && r.dy < -0.9 : z === "hairlow" ? inHair(r) && r.dy > -0.9 : z === "shoulder" ? inShoulder(r, S.hs) : inShelf(r));
      const T = TASKS[S.task];
      S.timer += dt;
      const need = holdFor(level);
      const finish = (ok) => {
        if (ok) { api.hit(40 + level * 5, Math.min(170, S.elevMax)); S.done[S.task] = true; S.flash = { t: 1, text: `${T.name.toUpperCase()}: DONE` }; }
        else { api.miss(); S.flash = { t: 1, text: "Too slow. Next task" }; }
        S.task += 1; S.step = 0; S.hold = 0; S.strokes = 0; S.timer = 0; S.elevMax = 0; S.hairHigh = false;
        api.extraRef.current = { tasksDone: S.done.filter(Boolean).length + S.rounds * N, rounds: S.rounds };
        if (S.task >= N) {
          const rate = S.done.filter(Boolean).length / N;
          S.task = 0; S.done = Array(N).fill(false); S.rounds += 1;
          api.roundDone(rate);
        }
      };
      if (!r) { api.setCoach("Show your upper body and your hand to the camera", "warn"); return; }
      if (S.timer > 40) { finish(false); return; }
      if (T.id === "shelf") {
        if (S.step === 0) { if (at("shelf")) { S.hold += dt; if (S.hold >= need) { S.step = 1; S.hold = 0; S.flash = { t: 0.8, text: "JAR ON THE SHELF" }; } } else S.hold = Math.max(0, S.hold - dt); }
        else if (at("low")) finish(true);
      } else if (T.id === "sip") {
        if (S.step === 0) { if (at("low")) { S.hold += dt; if (S.hold >= 0.5) { S.step = 1; S.hold = 0; } } else S.hold = 0; }
        else if (S.step === 1) { if (at("mouth")) { S.hold += dt; if (S.hold >= need) { S.step = 2; S.hold = 0; S.flash = { t: 0.8, text: "SIP!" }; } } else S.hold = Math.max(0, S.hold - dt); }
        else if (at("low")) finish(true);
      } else if (T.id === "brush") {
        if (S.step === 0) { if (at("hair")) { S.hold += dt; if (S.hold >= 0.4) { S.step = 1; S.hold = 0; S.hairHigh = true; } } else S.hold = 0; }
        else if (S.step === 1) {
          if (S.hairHigh && at("hairlow")) { S.hairHigh = false; S.strokes += 1; S.flash = { t: 0.4, text: `stroke ${S.strokes}` }; }
          else if (!S.hairHigh && at("hair")) S.hairHigh = true;
          if (S.strokes >= strokesFor(level)) S.step = 2;
        } else if (at("low")) finish(true);
      } else {
        if (S.step === 0) { if (at("shoulder")) { S.hold += dt; if (S.hold >= need) { S.step = 1; S.hold = 0; S.flash = { t: 0.8, text: "SHOULDER TOUCHED" }; } } else S.hold = Math.max(0, S.hold - dt); }
        else if (at("low")) finish(true);
      }
      const hint = {
        shelf: ["Reach UP high, above your head, to the jar", "Lower your hand to the counter"],
        sip: ["Move your hand down to the cup on the counter", "Bring the cup up to your mouth and hold", "Now put the cup back down"],
        brush: ["Lift your hand to the side of your head", `Brush: up and back down (${S.strokes} of ${strokesFor(level)})`, "Lower your hand to rest"],
        shoulder: ["Bring your hand across to the opposite shoulder", "Lower your hand to rest"],
      }[T.id][S.step];
      api.setCoach(hint, S.hold > 0 ? "ok" : "info");
      api.setMission({ text: `Task ${S.task + 1} of ${N}: ${T.name}`, done: S.done.filter(Boolean).length, total: N });
    },
    draw(ctx, { w, h }, time) {
      const level = api.level;
      const hs = S.hs, tg = tgtFor(), T = TASKS[S.task];
      // ---- kitchen: stone wall and counter ----
      ctx.fillStyle = "#e9e4da"; ctx.fillRect(0, 0, w, h);
      const sx = w * 0.5, W = Math.min(w * 0.15, h * 0.18), sy = h * 0.62;
      const counterY = sy + W * 0.72;
      ctx.fillStyle = "#c9bfae"; ctx.fillRect(0, counterY, w, h - counterY);
      ctx.fillStyle = "#a89c88"; ctx.fillRect(0, counterY, w, 5);
      // shelves on the working-hand side
      const shx = sx + hs * W * 0.9, shw = W * 3.2, shx0 = hs > 0 ? shx : shx - shw;
      [sy - W * 2.55, sy - W * 1.75].forEach((yy, k) => {
        ctx.fillStyle = "#6f7d86"; roundedRect(ctx, shx0, yy, shw, 8, 2); ctx.fill();
        const jars = k === 0 ? [["#2f6f73", 24, 22], ["#2f6f73", 20, 16], ["#b9693f", 26, 20], ["#b9693f", 22, 14]] : [["#8a9aa4", 28, 24], ["#2f6f73", 24, 20]];
        jars.forEach(([c, jw, jh], i) => { ctx.fillStyle = c; roundedRect(ctx, shx0 + 14 + i * (jw + 10), yy - jh, jw, jh, 3); ctx.fill(); });
      });
      // silhouette: head and shoulders
      ctx.fillStyle = SLATE;
      ctx.beginPath(); ctx.arc(sx, sy - W * 1.05, W * 0.5, 0, 6.283); ctx.fill();
      ctx.fillRect(sx - W * 0.14, sy - W * 0.62, W * 0.28, W * 0.4);
      ctx.beginPath(); ctx.moveTo(sx - W * 1.05, sy + W * 1.6); ctx.quadraticCurveTo(sx - W * 1.05, sy - W * 0.3, sx, sy - W * 0.3); ctx.quadraticCurveTo(sx + W * 1.05, sy - W * 0.3, sx + W * 1.05, sy + W * 1.6); ctx.fill();
      // targets
      const Z = {
        shelf: { x: hs * 1.35, y: -2.25, label: "SHELF" },
        hair: { x: hs * 0.95, y: -1.2, label: "HAIR" },
        mouth: { x: 0, y: -0.75, label: "MOUTH" },
        shoulder: { x: -hs * 0.55, y: 0.05, label: "OPPOSITE SHOULDER" },
        low: { x: hs * 1.4, y: 0.98, label: "CUP" },
      };
      const zid = tg === "hairlow" ? "hair" : tg;
      Object.entries(Z).forEach(([id, z]) => {
        if (id !== zid) return;
        const zx = sx + z.x * W, zy = sy + z.y * W, rr = W * 0.34;
        const k = (time * 0.55) % 1;
        ctx.strokeStyle = `rgba(47,111,115,${0.9 * (1 - k)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(zx, zy, rr * (0.9 + k * 0.6), 0, 6.283); ctx.stroke();
        ctx.fillStyle = "rgba(47,111,115,0.22)"; ctx.strokeStyle = TEAL; ctx.lineWidth = 3; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(zx, zy, rr, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
        if (S.hold > 0 && (tg === "mouth" || tg === "shelf" || tg === "shoulder")) {
          ctx.strokeStyle = GREEN; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(zx, zy, rr + 7, -Math.PI / 2, -Math.PI / 2 + 6.283 * Math.min(1, S.hold / holdFor(level))); ctx.stroke();
        }
        ctx.fillStyle = INK; ctx.font = "800 11px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(z.label, zx, zy + rr + 20);
        if (id === "hair" && S.step >= 1) { for (let i = 0; i < strokesFor(level); i++) { ctx.fillStyle = i < S.strokes ? GREEN : "rgba(16,22,31,0.25)"; ctx.beginPath(); ctx.arc(zx - ((strokesFor(level) - 1) * 9) + i * 18, zy - rr - 14, 5, 0, 6.283); ctx.fill(); } }
      });
      // the cup on the counter
      const cz = Z.low, cxp = sx + cz.x * W, cyp = counterY - 2;
      const cupUp = S.task === 1 && S.step === 1;
      const cupX = cupUp ? sx : cxp, cupY = cupUp ? sy - 0.2 * W : cyp;
      ctx.fillStyle = "#fff"; ctx.strokeStyle = SLATE; ctx.lineWidth = 3; roundedRect(ctx, cupX - 19, cupY - 44, 38, 44, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cupX + 19, cupY - 24, 12, -1.2, 1.2); ctx.stroke();
      ctx.fillStyle = "rgba(185,105,63,0.85)"; ctx.fillRect(cupX - 17, cupY - 30, 34, 20);
      // your hand
      const cl = (v, a, b) => Math.max(a, Math.min(b, v));
      S.trail.forEach((q, i) => { ctx.fillStyle = `rgba(16,22,31,${(i / S.trail.length) * 0.22})`; ctx.beginPath(); ctx.arc(sx + cl(q.dx, -3, 3) * W, sy + cl(q.dy, -2.8, 1.6) * W, 6, 0, 6.283); ctx.fill(); });
      if (S.rel) {
        const hx = sx + cl(S.rel.dx, -3, 3) * W, hy = sy + cl(S.rel.dy, -2.8, 1.6) * W;
        ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.shadowColor = TEAL; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(hx, hy, 11, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = INK; ctx.font = "800 11px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("YOUR HAND", hx, hy - 18);
      }
      // ---- today's tasks card (top left) ----
      const cx0 = 16, cy0 = 14;
      ctx.fillStyle = "rgba(16,22,31,0.94)"; roundedRect(ctx, cx0, cy0, 214, 30 + N * 28 + 10, 10); ctx.fill();
      ctx.fillStyle = "#9fb3c6"; ctx.font = "700 10px Manrope, system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillText("TODAY'S TASKS", cx0 + 16, cy0 + 22);
      TASKS.forEach((t, i) => {
        const y = cy0 + 36 + i * 28, cur = i === S.task, dn = S.done[i];
        if (dn) { ctx.fillStyle = GREEN; roundedRect(ctx, cx0 + 16, y, 16, 16, 4); ctx.fill(); ctx.strokeStyle = "#06210f"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx0 + 20, y + 8); ctx.lineTo(cx0 + 23, y + 11); ctx.lineTo(cx0 + 29, y + 4); ctx.stroke(); }
        else { ctx.strokeStyle = cur ? AMBER : "#7f8fa4"; ctx.lineWidth = 2.5; roundedRect(ctx, cx0 + 16, y, 16, 16, 4); ctx.stroke(); }
        ctx.fillStyle = dn ? "#fff" : cur ? AMBER : "#cfd8e6"; ctx.font = "700 13px Manrope, system-ui, sans-serif"; ctx.fillText(t.name, cx0 + 42, y + 13);
      });
      // task tile
      const ty0 = cy0 + 30 + N * 28 + 24;
      ctx.fillStyle = "rgba(16,22,31,0.94)"; roundedRect(ctx, cx0, ty0, 84, 40, 8); ctx.fill();
      ctx.fillStyle = "#9fb3c6"; ctx.font = "700 10px Manrope, system-ui, sans-serif"; ctx.fillText("TASK", cx0 + 12, ty0 + 17);
      ctx.fillStyle = "#fff"; ctx.font = "800 14px Manrope, system-ui, sans-serif"; ctx.fillText(`${S.task + 1} of ${N}`, cx0 + 12, ty0 + 33);
      if (S.flash) { ctx.globalAlpha = Math.min(1, S.flash.t * 2); ctx.fillStyle = INK; ctx.font = "900 26px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(S.flash.text, w / 2, 50); ctx.globalAlpha = 1; }
      void T;
    },
  });

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ filter: api.levelFilter }} />;
}

export default function DailyTasks(props) {
  return <ArmGameFrame meta={META} {...props}>{(api) => <Stage api={api} />}</ArmGameFrame>;
}
