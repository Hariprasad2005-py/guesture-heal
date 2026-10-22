// Breathe (Easy) - raise your arms slowly as a glowing orb expands, lower them as it settles.
// Frozen Shoulder, Rotator Cuff, Stroke, Parkinson's.
import { useRef } from "react";
import ArmGameFrame, { HudPill } from "../components/rehab/ArmGameFrame";
import useStageLoop from "../components/rehab/useStageLoop";
import { drawAvatar, roundedRect } from "../components/rehab/stageDraw";

const META = {
  name: "Breathe",
  emoji: "🌬️",
  accent: "#6fe0d0",
  tagline: "Raise your arms slowly with the light, lower them as it settles.",
  sessionSeconds: 150,
  levelHint: (l) => `lift to about ${Math.min(115, 60 + l * 11)}° and hold a little longer`,
  trains: "slow, controlled shoulder raising, and calm breathing with the movement.",
  levelNames: ["Calm", "Tide", "Lagoon", "Aurora", "Deep Sea"],
  scoring: [
    "Your arms are shown as a figure. A ghost figure shows where your arms should be. Copy the ghost slowly, up and down.",
    "Staying within about 20° of the light for most of the breath counts as a good breath.",
    "Higher levels ask for a little more height. Never push into pain.",
  ],
  moves: [
    {
      id: "front", label: "Both arms forward", motion: "raise", plane: "front", arm: "both", peak: 90,
      steps: ["As the light grows, raise both arms forward and up, slowly, like lifting a tray.", "As the light settles, lower your arms down to your sides.", "Breathe in on the way up and out on the way down."],
      body: ["Shoulders level and relaxed, not shrugged up", "Elbows soft, thumbs pointing up", "Do not lean back as you raise"],
      tip: "arms forward and up with the light",
    },
    {
      id: "side", label: "Both arms out to the sides", motion: "raise", plane: "side", arm: "both", peak: 90,
      steps: ["As the light grows, lift both arms out to the sides, palms down.", "Stop where it feels comfortable. Hold for a moment at the top.", "Lower slowly as the light settles."],
      body: ["Lead with the elbows, not the hands", "Keep your neck long, shoulders away from your ears", "Sit against the chair back"],
      tip: "arms out to the sides with the light",
    },
    {
      id: "one", label: "One arm at a time", motion: "raise", plane: "front", arm: null, peak: 90,
      steps: ["Pick your arm below (for a stiff shoulder, start with the stiff one if it is comfortable).", "Raise that arm forward and up as the light grows, lower it as it settles.", "The other arm rests in your lap."],
      body: ["Support the resting arm in your lap", "Keep your body still, only the arm moves", "Small and smooth is better than high and jerky"],
      tip: "one arm up with the light",
    },
  ],
};

const CYCLE = { inhale: 4.2, hold: 1.2, exhale: 4.2 };
const TOL = 22;
const NEED = 3; // good breaths to reach the next level
const ease = (x) => x * x * (3 - 2 * x);
const peakFor = (level) => Math.min(115, 60 + level * 11);

function Stage({ api }) {
  const S = useRef({ t: 0, inSync: 0, frames: 0, maxElev: 0, results: [], parts: [], breaths: 0, good: 0, fb: "" }).current;
  const target = (t, peak) => {
    if (t < CYCLE.inhale) return peak * ease(t / CYCLE.inhale);
    if (t < CYCLE.inhale + CYCLE.hold) return peak;
    return peak * (1 - ease((t - CYCLE.inhale - CYCLE.hold) / CYCLE.exhale));
  };
  const total = CYCLE.inhale + CYCLE.hold + CYCLE.exhale;
  const goodNow = () => S.results.reduce((a, b) => a + b, 0);

  const canvasRef = useStageLoop(api, {
    update(dt) {
      const peak = peakFor(api.level);
      S.t += dt;
      const e = api.inputRef.current.elev;
      const tg = target(S.t, peak);
      S.frames += 1;
      const diff = e - tg;
      if (Math.abs(diff) <= TOL) S.inSync += 1;
      S.maxElev = Math.max(S.maxElev, e);
      const rising = S.t < CYCLE.inhale, holding = S.t >= CYCLE.inhale && S.t < CYCLE.inhale + CYCLE.hold;
      if (Math.abs(diff) <= TOL) api.setCoach(holding ? "Perfect, hold it there" : rising ? "Good, keep rising slowly" : "Good, keep lowering slowly", "ok");
      else if (diff < 0) api.setCoach(rising || holding ? "Lift your arms a little higher" : "You are ahead, wait for the light", "warn");
      else api.setCoach(rising ? "Slow down, let the ghost catch up" : "Lower your arms a little more", "warn");
      api.setMission({ text: "Copy the ghost arms: up as the light grows, down as it fades", done: goodNow(), total: NEED });
      if (S.t >= total) {
        const frac = S.frames ? S.inSync / S.frames : 0;
        const good = frac >= 0.6 && S.maxElev >= peak * 0.7;
        if (good) { api.hit(Math.round(40 + frac * 60), S.maxElev); S.good += 1; } else api.miss();
        S.results.push(good ? 1 : 0);
        S.breaths += 1;
        if (good) for (let i = 0; i < 30; i++) S.parts.push({ a: Math.random() * 6.283, r: 20, v: 60 + Math.random() * 120, life: 1 });
        api.extraRef.current = { breaths: S.breaths, goodBreaths: S.good, peakTargetDeg: peak };
        if (S.results.length >= NEED) { const rate = goodNow() / S.results.length; S.results = []; api.roundDone(rate); }
        S.t = 0; S.inSync = 0; S.frames = 0; S.maxElev = 0;
      }
      S.parts.forEach((p) => { p.r += p.v * dt; p.life -= dt * 0.9; });
      S.parts = S.parts.filter((p) => p.life > 0);
    },
    draw(ctx, { w, h }, time) {
      const peak = peakFor(api.level);
      const tg = target(S.t, peak);
      const inp = api.inputRef.current;
      const e = inp.elev;
      const arm = api.arm;
      const mine = (side) => (arm === "both" || arm === side ? (side === "left" ? inp.leftElev : inp.rightElev) : 0);
      const tgFor = (side) => (arm === "both" || arm === side ? tg : 0);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#06141c"); g.addColorStop(1, "#0c3340");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(154,243,230,0.18)";
      for (let i = 0; i < 28; i++) {
        const x = ((i * 97.3 + time * (4 + (i % 5))) % (w + 20)) - 10;
        const y = h - ((i * 53.7 + time * (6 + (i % 7))) % (h + 20)) + 10;
        ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3), 0, 6.283); ctx.fill();
      }
      const close = Math.abs(e - tg) <= TOL;

      // ---- left: you + the ghost to copy ----
      const ax = w * 0.3, ay = h * 0.3, sc = Math.min(1.5, h / 400);
      const hr = 70 * sc;
      ctx.fillStyle = close ? "rgba(124,242,192,0.08)" : "rgba(255,255,255,0.03)";
      ctx.beginPath(); ctx.arc(ax, ay + 60 * sc, 150 * sc, 0, 6.283); ctx.fill();
      drawAvatar(ctx, ax, ay, sc, { l: tgFor("left"), r: tgFor("right"), body: "#9af3e6", alpha: 0.4, dashed: true });
      drawAvatar(ctx, ax, ay, sc, { l: mine("left"), r: mine("right"), body: close ? "#b9ffe5" : "#e2e8f0", glow: close ? "#7cf2c0" : "#ffd25a" });
      ctx.font = "800 12px Manrope, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillStyle = "#9af3e6"; ctx.fillText("ghost = where to be", ax, ay + 140 * sc);
      ctx.fillStyle = "#e2e8f0"; ctx.fillText("you", ax, ay + 156 * sc);

      // ---- right: the breath light ----
      const cx = w * 0.66, cy = h * 0.44, R = Math.min(w * 0.22, h * 0.32);
      [0.58, 0.8, 1].forEach((k, i) => {
        ctx.strokeStyle = `rgba(111,224,208,${0.5 - i * 0.14})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, 6.283); ctx.stroke();
      });
      ctx.strokeStyle = "#9af3e6"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + (S.t / total) * 6.283); ctx.stroke();
      const orbR = R * (0.28 + 0.6 * (tg / peak));
      const og = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbR);
      og.addColorStop(0, "#e6fffb"); og.addColorStop(0.45, "rgba(111,224,208,0.9)"); og.addColorStop(1, "rgba(27,143,147,0)");
      ctx.fillStyle = og; ctx.beginPath(); ctx.arc(cx, cy, orbR, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#e6fffb"; ctx.shadowColor = "#6fe0d0"; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.12, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
      // your ring
      const meR = R * (0.28 + 0.6 * Math.min(1, e / peak));
      ctx.strokeStyle = close ? "#7cf2c0" : "#ffd25a"; ctx.lineWidth = 5; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(cx, cy, meR, 0, 6.283); ctx.stroke(); ctx.shadowBlur = 0;
      S.parts.forEach((p) => { ctx.fillStyle = `rgba(230,255,251,${Math.max(0, p.life)})`; ctx.beginPath(); ctx.arc(cx + Math.cos(p.a) * (p.r + R * 0.5), cy + Math.sin(p.a) * (p.r + R * 0.5), 3, 0, 6.283); ctx.fill(); });
      // direction arrows
      const rising = S.t < CYCLE.inhale, holding = S.t >= CYCLE.inhale && S.t < CYCLE.inhale + CYCLE.hold;
      const label = rising ? "RAISE" : holding ? "HOLD" : "LOWER";
      ctx.fillStyle = "rgba(5,11,17,0.75)"; roundedRect(ctx, cx - 90, cy + R + 14, 180, 40, 10); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "900 20px Manrope, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`${rising ? "↑ " : holding ? "" : "↓ "}${label}${rising ? " ↑" : holding ? "" : " ↓"}`, cx, cy + R + 41);
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "700 11px Manrope, system-ui, sans-serif";
      ctx.fillText(`${rising ? "breathe in" : holding ? "stay there" : "breathe out"} · target ${Math.round(peak)}°`, cx, cy + R + 68);
      ctx.textAlign = "left";
    },
  });

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ filter: api.levelFilter }} />
      <HudPill className="absolute left-3 top-14 z-10" label="Good breaths" value={`${S.good} of ${S.breaths}`} />
    </>
  );
}

export default function Breathe(props) {
  return <ArmGameFrame meta={META} {...props}>{(api) => <Stage api={api} />}</ArmGameFrame>;
}
