// Pendulum (Easy) - let your arm hang and swing it gently with a clock pendulum.
// Frozen Shoulder, Rotator Cuff, Fracture (classic "pendulum" shoulder exercise).
import { useRef } from "react";
import ArmGameFrame, { HudPill } from "../components/rehab/ArmGameFrame";
import useStageLoop from "../components/rehab/useStageLoop";
import { roundedRect } from "../components/rehab/stageDraw";

const BODY = ["Lean forward a little and rest your other hand on a table or your knee", "Let the swinging arm hang loose and heavy, like a rope", "Swing from your body and shoulder, not by pushing with your hand"];
const STEPS = [
  "Lean forward slightly and let the swinging arm hang down.",
  "A brass pendulum swings on the screen. Swing your arm gently left and right to match it. Your hand is the glowing bob.",
  "Each time you match one full back-and-forth swing, the swing grows a little bigger.",
];

const META = {
  name: "Pendulum",
  emoji: "🕰️",
  accent: "#e0b86a",
  tagline: "Swing your arm like a clock pendulum. Gentle and loose.",
  sessionSeconds: 150,
  trains: "relaxed shoulder swinging (Codman pendulum), which eases a stiff or painful shoulder.",
  levelNames: ["Slow Tick", "Steady", "Grandfather", "Long Case", "Cathedral"],
  levelHint: (l) => `bigger swings (about ${Math.round(((5 + l * 1.5) / 5) * 100)}% of Level 1) at a slightly quicker beat`,
  scoring: [
    "The brass pendulum is the guide and the glowing bob is your hand. Keep them together.",
    "One full back-and-forth swing that stays together with the guide is one swing.",
    "Match 4 swings to reach the next level. Higher levels swing a little wider and quicker. If it hurts, make the swing smaller. That is fine.",
  ],
  moves: [
    { id: "right", label: "Right arm swing", motion: "swing", arm: "right", steps: STEPS, body: BODY, tip: "let your right arm hang and swing with the pendulum" },
    { id: "left", label: "Left arm swing", motion: "swing", arm: "left", steps: STEPS, body: BODY, tip: "let your left arm hang and swing with the pendulum" },
    { id: "both", label: "Either arm", motion: "swing", arm: "both", steps: ["Lean forward slightly. Choose the arm that needs it, the one you move more is used.", ...STEPS.slice(1)], body: BODY, tip: "swing the arm you choose with the pendulum" },
  ],
};

const NEED = 4;
const amp = (level) => 5 + level * 1.5; // percent of camera width: how far the hand swings each side
const period = (level) => Math.max(2.2, 3.6 - level * 0.3); // seconds for one back-and-forth
const TOL = 0.55; // in units of the swing size

function Stage({ api }) {
  const S = useRef({ t: 0, base: { l: null, r: null }, u: 0, inSync: 0, frames: 0, results: [], good: 0, swings: 0, peak: 0, flash: 0, trail: [], gemL: false, gemR: false, pops: [], combo: 0, bestCombo: 0, tick: 0 }).current;

  const canvasRef = useStageLoop(api, {
    update(dt) {
      const inp = api.inputRef.current;
      const arm = api.arm;
      const hd = arm === "left" ? inp.left : arm === "right" ? inp.right : inp.hand;
      const key = hd && hd === inp.left ? "l" : "r";
      const A = amp(api.level), T = period(api.level);
      S.flash = Math.max(0, S.flash - dt);
      if (hd) {
        // the swing is measured from where your hand hangs (a slowly moving middle point)
        if (S.base[key] == null) S.base[key] = hd.x;
        S.base[key] += (hd.x - S.base[key]) * Math.min(1, dt * 0.5);
        S.u = (hd.x - S.base[key]) / A;
      } else S.u *= 0.9;
      S.t += dt;
      S.pops.forEach((q) => { q.life -= dt; q.r += dt * 60; }); S.pops = S.pops.filter((q) => q.life > 0);
      // golden gems at both ends: swing far enough to light each one
      if (hd) {
        if (!S.gemL && S.u <= -0.6) { S.gemL = true; api.bonus(8); S.pops.push({ side: -1, life: 0.7, r: 10 }); }
        if (!S.gemR && S.u >= 0.6) { S.gemR = true; api.bonus(8); S.pops.push({ side: 1, life: 0.7, r: 10 }); }
      }
      const target = Math.sin((2 * Math.PI * S.t) / T);
      S.frames += 1;
      const dev = Math.abs(S.u - target);
      if (hd && dev < TOL) S.inSync += 1;
      S.peak = Math.max(S.peak, Math.abs(S.u));
      S.trail.push({ u: S.u, t: S.t }); if (S.trail.length > 18) S.trail.shift();
      if (!hd) api.setCoach("Let the camera see your swinging hand", "warn");
      else if (dev < TOL) api.setCoach("Lovely. Keep it loose and easy", "ok");
      else if (!S.gemL && !S.gemR && Math.abs(S.u) < 0.4) api.setCoach("Swing out to light the gold gems at both ends", "warn");
      else if (Math.abs(S.u) < Math.abs(target) * 0.5) api.setCoach("Swing a little bigger, follow the pendulum", "warn");
      else api.setCoach("Slow down and let your arm hang loose", "info");
      api.setMission({ text: "Swing your arm with the pendulum, loose and gentle", done: S.results.reduce((a, b) => a + b, 0), total: NEED });
      if (S.t >= T) {
        const frac = S.frames ? S.inSync / S.frames : 0;
        const good = hd && frac >= 0.55 && S.peak >= 0.45;
        if (good) { S.combo += 1; S.bestCombo = Math.max(S.bestCombo, S.combo); if (S.gemL && S.gemR) api.bonus(15); api.hit(Math.round(30 + frac * 50), Math.min(60, S.peak * A * 2.2)); S.good += 1; S.flash = 0.8; } else { api.miss(); S.combo = 0; }
        S.swings += 1; S.results.push(good ? 1 : 0);
        api.extraRef.current = { swings: S.swings, matchedSwings: S.good, swingSizePct: Math.round(A) };
        if (S.results.length >= NEED) { const rate = S.results.reduce((a, b) => a + b, 0) / S.results.length; S.results = []; api.roundDone(rate); }
        S.t = 0; S.inSync = 0; S.frames = 0; S.peak = 0; S.gemL = false; S.gemR = false;
      }
    },
    draw(ctx, { w, h }, time) {
      const A = amp(api.level), T = period(api.level);
      const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#0e1424"); bg.addColorStop(1, "#1a2038");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      const px = w / 2, py = h * 0.12, L = Math.min(h * 0.62, w * 0.34);
      const maxAng = 0.62;
      // wall clock face behind
      const fg = ctx.createRadialGradient(px, py + L * 0.45, 20, px, py + L * 0.45, L * 0.95);
      fg.addColorStop(0, "rgba(224,184,106,0.12)"); fg.addColorStop(1, "rgba(224,184,106,0)");
      ctx.fillStyle = fg; ctx.fillRect(0, 0, w, h);
      // arc of tick marks
      ctx.strokeStyle = "rgba(224,184,106,0.5)"; ctx.lineWidth = 2;
      for (let i = -8; i <= 8; i++) {
        const a = (i / 8) * maxAng, r0 = L + 26, r1 = L + (i % 4 === 0 ? 44 : 36);
        ctx.beginPath(); ctx.moveTo(px + Math.sin(a) * r0, py + Math.cos(a) * r0); ctx.lineTo(px + Math.sin(a) * r1, py + Math.cos(a) * r1); ctx.stroke();
      }
      // soft clock face behind the pendulum
      const cx0 = px, cy0 = py + L * 0.5, cr = L * 0.52;
      ctx.strokeStyle = "rgba(224,184,106,0.12)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx0, cy0, cr, 0, 6.283); ctx.stroke();
      ctx.fillStyle = "rgba(224,184,106,0.16)"; ctx.font = `700 ${Math.round(cr * 0.16)}px Georgia, serif`; ctx.textAlign = "center";
      ["XII", "III", "VI", "IX"].forEach((n, i) => { const a = i * Math.PI / 2; ctx.fillText(n, cx0 + Math.sin(a) * cr * 0.82, cy0 - Math.cos(a) * cr * 0.82 + cr * 0.06); });
      const sa = time * 0.5; ctx.strokeStyle = "rgba(224,184,106,0.18)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.lineTo(cx0 + Math.sin(sa) * cr * 0.6, cy0 - Math.cos(sa) * cr * 0.6); ctx.stroke();
      // golden gems at both ends of the swing
      [-1, 1].forEach((sd) => {
        const lit = sd < 0 ? S.gemL : S.gemR, ga = sd * maxAng * 0.85 * 0.78, gx = px + Math.sin(ga) * L * 1.12, gy = py + Math.cos(ga) * L * 1.12;
        ctx.save(); ctx.translate(gx, gy); ctx.rotate(Math.PI / 4 + (lit ? time * 2 : 0));
        ctx.shadowColor = "#ffd25a"; ctx.shadowBlur = lit ? 30 : 8; ctx.fillStyle = lit ? "#ffd25a" : "rgba(255,210,90,0.25)"; ctx.strokeStyle = "#ffd25a"; ctx.lineWidth = 2;
        roundedRect(ctx, -13, -13, 26, 26, 5); ctx.fill(); ctx.stroke(); ctx.restore(); ctx.shadowBlur = 0;
        ctx.fillStyle = lit ? "#ffd25a" : "rgba(255,255,255,0.5)"; ctx.font = "800 11px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(lit ? "GOT IT" : sd < 0 ? "REACH LEFT" : "REACH RIGHT", gx, gy + 34);
      });
      S.pops.forEach((q) => { const ga = q.side * maxAng * 0.85 * 0.78; ctx.strokeStyle = `rgba(255,210,90,${q.life})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px + Math.sin(ga) * L * 1.12, py + Math.cos(ga) * L * 1.12, q.r, 0, 6.283); ctx.stroke(); });
      const guideA = Math.sin((2 * Math.PI * S.t) / T) * maxAng * 0.85;
      const meA = Math.max(-1.1, Math.min(1.1, S.u)) * maxAng * 0.85;
      const bob = (a, r, fill, glow, rad) => {
        const bx = px + Math.sin(a) * L, by = py + Math.cos(a) * L;
        ctx.strokeStyle = fill; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke();
        ctx.shadowColor = glow; ctx.shadowBlur = 22; ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(bx, by, rad, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
        return [bx, by];
      };
      // the guide (brass) and you (glowing)
      bob(guideA, L, "#d4a24f", "#d4a24f", 24);
      ctx.fillStyle = "#f6e3b4"; ctx.beginPath(); ctx.arc(px + Math.sin(guideA) * L, py + Math.cos(guideA) * L, 9, 0, 6.283); ctx.fill();
      // your trail
      S.trail.forEach((q, i) => {
        const a = Math.max(-1.1, Math.min(1.1, q.u)) * maxAng * 0.85;
        ctx.fillStyle = `rgba(124,242,192,${(i / S.trail.length) * 0.35})`;
        ctx.beginPath(); ctx.arc(px + Math.sin(a) * L, py + Math.cos(a) * L, 12, 0, 6.283); ctx.fill();
      });
      const hd = api.inputRef.current.hand;
      const close = hd && Math.abs(S.u - Math.sin((2 * Math.PI * S.t) / T)) < TOL;
      const [mx, my] = bob(meA, L, close ? "#7cf2c0" : "#5ac8ff", close ? "#7cf2c0" : "#5ac8ff", 14);
      // sync ring around your bob: fills as you stay with the guide this swing
      const fr = S.frames ? S.inSync / S.frames : 0;
      ctx.strokeStyle = fr >= 0.55 ? "#7cf2c0" : "#ffd25a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(mx, my, 22, -Math.PI / 2, -Math.PI / 2 + 6.283 * fr); ctx.stroke();
      // swing progress bar with combo
      const bw = 210, bx0 = w * 0.03 + 8, by0 = h * 0.3;
      ctx.fillStyle = "rgba(5,8,20,0.75)"; roundedRect(ctx, bx0 - 8, by0 - 20, bw + 16, 42, 10); ctx.fill();
      ctx.fillStyle = "#c9b98a"; ctx.font = "700 10px Manrope, system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillText("THIS SWING", bx0, by0 - 6); ctx.textAlign = "right"; ctx.fillText(S.combo > 1 ? `🔥 ${S.combo} IN A ROW` : "MATCH 4 TO LEVEL UP", bx0 + bw, by0 - 6);
      ctx.fillStyle = "rgba(255,255,255,0.15)"; roundedRect(ctx, bx0, by0 + 2, bw, 10, 5); ctx.fill();
      ctx.fillStyle = "#e0b86a"; roundedRect(ctx, bx0, by0 + 2, Math.max(8, bw * Math.min(1, S.t / T)), 10, 5); ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff"; ctx.font = "800 12px Manrope, system-ui, sans-serif";
      ctx.fillText("YOU", mx, my + 32);
      ctx.fillStyle = "#e0b86a"; ctx.fillText("GUIDE", px + Math.sin(guideA) * L, py + Math.cos(guideA) * L - 36);
      // pivot
      ctx.fillStyle = "#e0b86a"; ctx.beginPath(); ctx.arc(px, py, 9, 0, 6.283); ctx.fill();
      if (S.flash > 0) { ctx.globalAlpha = Math.min(1, S.flash * 1.5); ctx.fillStyle = "#7cf2c0"; ctx.font = "900 28px Manrope, system-ui, sans-serif"; ctx.fillText("SWING MATCHED", px, h * 0.5); ctx.globalAlpha = 1; }
    },
  });

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ filter: api.levelFilter }} />
      <HudPill className="absolute left-3 top-14 z-10" label="Matched swings" value={`${S.good} of ${S.swings}`} />
    </>
  );
}

export default function Pendulum(props) {
  return <ArmGameFrame meta={META} {...props}>{(api) => <Stage api={api} />}</ArmGameFrame>;
}
