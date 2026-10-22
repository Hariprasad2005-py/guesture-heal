// Grip Gauge (Easy) - squeeze your hand into a fist to fill the gauge, hold it, then open wide.
// Hand surgery, Stroke, Wrist, Nerve injury, Parkinson's, Fracture. Uses full-hand tracking (finger curl).
import { useRef } from "react";
import ArmGameFrame from "../components/rehab/ArmGameFrame";
import useStageLoop from "../components/rehab/useStageLoop";
import { drawLiveHand, roundedRect } from "../components/rehab/stageDraw";

const BODY = ["Rest your forearm on the table or your lap, elbow bent, hand up in front of the camera", "Palm faces the camera, fingers a little apart", "Squeeze all fingers together into a fist, then open FULLY. Do not rush"];
const stepsFor = (hand, extra) => [
  `Hold your ${hand} hand up, palm facing the camera, fingers open.`,
  `SQUEEZE: curl all your fingers into a fist. The gauge fills as you squeeze. Fill it up to the green line.`,
  `HOLD: keep the gauge above the green line until the ring around the ball fills up.${extra}`,
  "OPEN: spread your hand wide open again. That is one rep. Rest if you need to.",
];

const META = {
  name: "Grip Gauge",
  emoji: "✊",
  accent: "#f59e0b",
  tagline: "Squeeze, hold and open. Fill the gauge to the green line.",
  sessionSeconds: 150,
  needsHands: true,
  trains: "hand grip strength and finger flexion and extension (curling and opening the hand).",
  levelNames: ["Soft Sponge", "Tennis Ball", "Stress Ball", "Modelling Clay", "Steel Spring"],
  levelHint: (l) => `squeeze to ${Math.round(Math.min(90, 50 + 7 * l))}% and hold for ${(Math.min(2.4, 0.8 + 0.3 * l)).toFixed(1)} seconds`,
  scoring: [
    "The gauge shows how tightly your hand is closed. A green line shows the squeeze you need.",
    "Squeeze past the line, hold until the ring is full, then open your hand wide. That is one rep.",
    "Do 5 good reps to reach the next level. Higher levels need a firmer squeeze and a longer hold. If your hand tires, the game eases off by itself.",
  ],
  moves: [
    { id: "right", label: "Right hand: steady squeeze", motion: "grip", arm: "right", variant: "steady", steps: stepsFor("right", ""), body: BODY, tip: "squeeze to the green line, hold, then open wide" },
    { id: "left", label: "Left hand: steady squeeze", motion: "grip", arm: "left", variant: "steady", steps: stepsFor("left", ""), body: BODY, tip: "squeeze to the green line, hold, then open wide" },
    { id: "pulse", label: "Right hand: quick pulses", motion: "grip", arm: "right", variant: "pulse", steps: stepsFor("right", " In this one the hold is short, so squeeze and open in a quick, steady rhythm."), body: BODY, tip: "quick squeeze, short hold, open wide" },
  ],
};

const NEED = 5;
const targetFor = (level) => Math.min(0.9, 0.5 + 0.07 * level);
const holdFor = (level, variant) => (variant === "pulse" ? 0.4 : Math.min(2.4, 0.8 + 0.3 * level));
const BALLS = [["#f7d046", "#d49a12"], ["#b7e04a", "#6a9a14"], ["#ff8a65", "#c2412a"], ["#c9a07a", "#8a5a34"], ["#9aa7b8", "#4d5b70"]];

function Stage({ api }) {
  const S = useRef({ phase: "squeeze", hold: 0, peak: 0, timer: 0, reps: [], done: 0, attempts: 0, flash: null, pops: [], sq: 0, noHand: 0 }).current;

  const canvasRef = useStageLoop(api, {
    update(dt) {
      const hand = api.handRef.current, level = api.level, variant = api.move.variant;
      S.flash && ((S.flash.t -= dt) <= 0) && (S.flash = null);
      S.pops.forEach((q) => { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 260 * dt; }); S.pops = S.pops.filter((q) => q.life > 0);
      if (!hand.present) { S.noHand += dt; api.setCoach(`Show your ${api.arm === "left" ? "left" : "right"} hand to the camera, palm facing it`, "warn"); S.sq += (0 - S.sq) * 0.2; return; }
      S.noHand = 0;
      const g = hand.grip, T = targetFor(level), need = holdFor(level, variant);
      S.sq = g;
      S.timer += dt;
      S.peak = Math.max(S.peak, g);
      if (S.phase === "squeeze") {
        if (g >= T) { S.phase = "hold"; S.hold = 0; }
      } else if (S.phase === "hold") {
        if (g >= T - 0.08) { S.hold += dt; if (S.hold >= need) { S.phase = "open"; S.flash = { t: 0.8, text: "HELD! NOW OPEN" }; } }
        else { S.phase = "squeeze"; S.hold = 0; }
      } else if (S.phase === "open") {
        if (g <= 0.2) {
          const rom = Math.round(S.peak * 90);
          api.hit(30 + Math.round((S.peak - T) * 60) + level * 4, rom);
          S.done += 1; S.attempts += 1; S.reps.push(1);
          S.flash = { t: 1, text: "GREAT REP" };
          for (let i = 0; i < 18; i++) S.pops.push({ x: 0, y: 0, vx: (Math.random() - 0.5) * 360, vy: -Math.random() * 260 - 40, life: 0.9, c: ["#ffd25a", "#7cf2c0", "#ff9bd4", "#7bb8ff"][i % 4] });
          api.extraRef.current = { reps: S.done, peakGripPct: Math.round(S.peak * 100), targetGripPct: Math.round(T * 100) };
          S.phase = "squeeze"; S.hold = 0; S.peak = 0; S.timer = 0;
          if (S.reps.length >= NEED) { const r = S.reps.reduce((a, b) => a + b, 0) / S.reps.length; S.reps = []; api.roundDone(r); }
        }
      }
      if (S.timer > 25) { api.miss(); S.attempts += 1; S.reps.push(0); S.flash = { t: 1, text: "Take your time. Next rep" }; S.phase = "squeeze"; S.hold = 0; S.peak = 0; S.timer = 0; if (S.reps.length >= NEED) { const r = S.reps.reduce((a, b) => a + b, 0) / S.reps.length; S.reps = []; api.roundDone(r); } }
      const coach = { squeeze: g < T * 0.5 ? "Squeeze your fingers into a fist" : "Keep squeezing, a little more to the green line", hold: `Hold it there... ${Math.max(0, need - S.hold).toFixed(1)}s`, open: "Now open your hand wide" }[S.phase];
      api.setCoach(coach, S.phase === "hold" ? "ok" : "info");
      api.setMission({ text: `Squeeze past the green line, hold, open (${Math.min(NEED, S.reps.reduce((a, b) => a + b, 0))} of ${NEED} reps)`, done: Math.min(NEED, S.reps.reduce((a, b) => a + b, 0)), total: NEED });
    },
    draw(ctx, { w, h }, time) {
      const level = api.level, variant = api.move.variant, T = targetFor(level), need = holdFor(level, variant);
      const hand = api.handRef.current, g = S.sq;
      const col = api.arm === "left" ? "#22d3ee" : "#fb923c";
      const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#1a1410"); bg.addColorStop(1, "#0f0b08");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      // soft glow behind the ball
      const bx = w * 0.5, by = h * 0.47, R = Math.min(w * 0.14, h * 0.22);
      const glow = ctx.createRadialGradient(bx, by, 10, bx, by, R * 3); glow.addColorStop(0, "rgba(245,158,11,0.18)"); glow.addColorStop(1, "rgba(245,158,11,0)");
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
      // ---- gauge (left) ----
      const gx = w * 0.17, gt = h * 0.2, gh = Math.min(h * 0.55, 330), gw = 46;
      ctx.fillStyle = "rgba(255,255,255,0.07)"; roundedRect(ctx, gx - gw / 2, gt, gw, gh, 23); ctx.fill();
      ctx.save(); roundedRect(ctx, gx - gw / 2, gt, gw, gh, 23); ctx.clip();
      const fh = gh * Math.max(0.02, g), above = g >= T;
      const gg = ctx.createLinearGradient(0, gt + gh, 0, gt); gg.addColorStop(0, "#3b82f6"); gg.addColorStop(T, above ? "#22c55e" : "#38bdf8"); gg.addColorStop(1, above ? "#fde047" : "#38bdf8");
      ctx.fillStyle = above ? "#22c55e" : "#3b82f6"; ctx.fillRect(gx - gw / 2, gt + gh - fh, gw, fh);
      // target band
      ctx.fillStyle = "rgba(34,197,94,0.22)"; ctx.fillRect(gx - gw / 2, gt, gw, gh * (1 - T));
      ctx.restore();
      const ty = gt + gh * (1 - T);
      ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(gx - gw / 2 - 14, ty); ctx.lineTo(gx + gw / 2 + 14, ty); ctx.stroke();
      ctx.fillStyle = "#22c55e"; ctx.font = "800 11px Manrope, system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillText("SQUEEZE TO HERE", gx + gw / 2 + 18, ty + 4);
      ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "900 16px Manrope, system-ui, sans-serif"; ctx.fillText(`${Math.round(g * 100)}%`, gx, gt + gh + 24);
      ctx.fillStyle = "#c9b08a"; ctx.font = "800 10px Manrope, system-ui, sans-serif"; ctx.fillText("GRIP STRENGTH", gx, gt - 12);
      // ---- ball ----
      const [c1, c2] = BALLS[Math.min(BALLS.length - 1, level)];
      const sqx = 1 + 0.3 * g, sqy = 1 - 0.32 * g + (S.phase === "hold" ? Math.sin(time * 14) * 0.012 : 0);
      ctx.save(); ctx.translate(bx, by); ctx.scale(sqx, sqy);
      const bgd = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
      bgd.addColorStop(0, c1); bgd.addColorStop(1, c2);
      ctx.fillStyle = bgd; ctx.shadowColor = c1; ctx.shadowBlur = 24 * (0.4 + g); ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
      // face: happier as you squeeze
      ctx.fillStyle = "#2a1a0a"; ctx.beginPath(); ctx.arc(-R * 0.3, -R * 0.1, R * 0.07, 0, 6.283); ctx.arc(R * 0.3, -R * 0.1, R * 0.07, 0, 6.283); ctx.fill();
      ctx.strokeStyle = "#2a1a0a"; ctx.lineWidth = R * 0.05; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(0, R * 0.12 - g * R * 0.05, R * 0.28, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.restore();
      // hold ring
      if (S.phase === "hold" || S.phase === "open") {
        const k = S.phase === "open" ? 1 : Math.min(1, S.hold / need);
        ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(bx, by, R * 1.28, 0, 6.283); ctx.stroke();
        ctx.strokeStyle = "#7cf2c0"; ctx.beginPath(); ctx.arc(bx, by, R * 1.28, -Math.PI / 2, -Math.PI / 2 + 6.283 * k); ctx.stroke();
      }
      // phase chips
      const chips = [["squeeze", "1 SQUEEZE"], ["hold", "2 HOLD"], ["open", "3 OPEN WIDE"]];
      chips.forEach(([id, label], i) => {
        const cx0 = bx - 170 + i * 120, cy0 = by + R * 1.55 + 18, on = S.phase === id;
        ctx.fillStyle = on ? "#f59e0b" : "rgba(255,255,255,0.1)"; roundedRect(ctx, cx0 - 54, cy0 - 14, 108, 28, 14); ctx.fill();
        ctx.fillStyle = on ? "#1a1006" : "#c9b08a"; ctx.font = "800 12px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(label, cx0, cy0 + 4);
      });
      // ---- your hand (right) ----
      const hx = w * 0.8, hy = h * 0.62, hs = Math.min(w * 0.14, h * 0.28);
      ctx.fillStyle = "rgba(255,255,255,0.05)"; roundedRect(ctx, hx - hs * 1.15, hy - hs * 2.35, hs * 2.3, hs * 3.1, 18); ctx.fill();
      if (hand.present) drawLiveHand(ctx, hand, hx, hy, hs, col);
      else { ctx.fillStyle = "#c9b08a"; ctx.font = "800 13px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("Show your hand", hx, hy - hs); }
      ctx.fillStyle = col; ctx.font = "900 11px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(`YOUR ${api.arm === "left" ? "LEFT" : "RIGHT"} HAND`, hx, hy + hs * 0.95);
      // confetti
      S.pops.forEach((q) => { ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.c; ctx.fillRect(bx + q.x, by + q.y, 7, 7); }); ctx.globalAlpha = 1;
      if (S.flash) { ctx.globalAlpha = Math.min(1, S.flash.t * 2); ctx.fillStyle = "#7cf2c0"; ctx.font = "900 28px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.shadowColor = "#000"; ctx.shadowBlur = 8; ctx.fillText(S.flash.text, bx, by - R * 1.6); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
    },
  });
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ filter: api.levelFilter }} />;
}

export default function GripGauge(props) {
  return <ArmGameFrame meta={META} {...props}>{(api) => <Stage api={api} />}</ArmGameFrame>;
}
