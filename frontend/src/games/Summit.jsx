// Summit (Easy) - walk your hand up a mountain route. Each checkpoint needs a little more arm height.
// Frozen Shoulder, Rotator Cuff, Fracture.
import { useRef } from "react";
import ArmGameFrame, { HudPill } from "../components/rehab/ArmGameFrame";
import useStageLoop from "../components/rehab/useStageLoop";
import { drawAvatar, roundedRect } from "../components/rehab/stageDraw";

const META = {
  name: "Summit",
  emoji: "⛰️",
  accent: "#ffe08a",
  tagline: "Climb the mountain by raising your arm higher, one checkpoint at a time.",
  sessionSeconds: 150,
  levelHint: (l) => `the flags sit ${4 * l}° higher than Level 1`,
  trains: "stepwise shoulder elevation, with rests between steps.",
  levelNames: ["Foothills", "Ridge", "Pass", "Crest", "Peak"],
  scoring: [
    "The climber goes up the mountain exactly as high as your arm goes up. Higher arm = higher climber.",
    "Raise your arm until the climber reaches a flag, then hold for a moment to plant it.",
    "Five checkpoints make one climb. Reaching the summit scores a bonus.",
    "Then lower your arm to base camp and climb again. Higher levels start a little higher.",
  ],
  moves: [
    {
      id: "front", label: "Climb forward", motion: "climb", plane: "front", arm: null, peak: 150,
      steps: ["Raise your arm forward and up in small steps, like climbing stairs in the air.", "Pause at each checkpoint for a second, then keep going.", "At the top, lower slowly all the way to base camp."],
      body: ["Keep the elbow straight but not locked", "Do not shrug the shoulder up", "Sit tall and do not lean back"],
      tip: "arm forward and up, step by step",
    },
    {
      id: "side", label: "Climb out to the side", motion: "climb", plane: "side", arm: null, peak: 150,
      steps: ["Lift your arm out to the side in small steps, palm down.", "Pause at each checkpoint for a second.", "Turn your palm up near the top if that feels easier, then lower slowly."],
      body: ["Lead with the elbow", "Keep the shoulder blade down and back", "Stay square to the camera"],
      tip: "arm out to the side, step by step",
    },
    {
      id: "both", label: "Climb with both arms", motion: "climb", plane: "front", arm: "both", peak: 150,
      steps: ["Raise both arms together in small steps.", "The higher arm counts, so the stiffer arm can follow the good one.", "Lower both arms together to base camp."],
      body: ["Let the good arm lead and the stiff arm follow", "Keep both shoulders level", "Breathe out as you rise"],
      tip: "both arms up together, step by step",
    },
  ],
};

const baseThr = [38, 58, 78, 98, 118];
const thrFor = (level) => baseThr.map((t, i) => Math.min(150 - (4 - i) * 6, t + level * 4));
const HOLD = 0.7;
const ROUTE = [[0.36, 0.9], [0.43, 0.78], [0.5, 0.65], [0.47, 0.5], [0.54, 0.36], [0.5, 0.18]];

// point along the route at fraction f (0 base camp .. 1 summit)
function along(w, h, f) {
  const segs = ROUTE.length - 1;
  const k = Math.max(0, Math.min(1, f)) * segs;
  const i = Math.min(segs - 1, Math.floor(k));
  const t = k - i;
  const a = ROUTE[i], b = ROUTE[i + 1];
  return { x: (a[0] + (b[0] - a[0]) * t) * w, y: (a[1] + (b[1] - a[1]) * t) * h };
}

function Stage({ api }) {
  const S = useRef({ cp: 0, hold: 0, climbT: 0, needRest: false, climbs: 0, best: 0, flash: 0, ang: 0 }).current;

  const canvasRef = useStageLoop(api, {
    update(dt) {
      const e = api.inputRef.current.elev;
      const thr = thrFor(api.level);
      S.flash = Math.max(0, S.flash - dt);
      S.ang += (e - S.ang) * Math.min(1, dt * 10);
      api.setMission({ text: S.needRest ? "Summit reached! Lower your arm to start another climb" : "Plant 5 flags on the way up. Your arm height moves the climber", done: S.cp, total: 5 });
      if (S.needRest) {
        api.setCoach(e < 22 ? "Ready. Start climbing when you like" : "Lower your arm slowly back to base camp", e < 22 ? "ok" : "info");
        if (e < 22) { S.needRest = false; S.cp = 0; S.climbT = 0; }
        return;
      }
      S.climbT += dt;
      S.best = Math.max(S.best, e);
      if (S.cp < 5) {
        const need = thr[S.cp];
        if (e >= need) {
          S.hold += dt;
          api.setCoach(`Hold it... planting flag ${S.cp + 1}`, "ok");
          if (S.hold >= HOLD) {
            S.cp += 1; S.hold = 0; S.flash = 0.8;
            if (S.cp === 5) {
              api.hit(60 + Math.max(0, 30 - Math.round(S.climbT)), S.best);
              S.climbs += 1; S.needRest = true; S.best = 0;
              api.extraRef.current = { summits: S.climbs, topCheckpointDeg: thr[4] };
              api.roundDone(1);
            }
          }
        } else {
          S.hold = Math.max(0, S.hold - dt * 2);
          api.setCoach(e < need - 12 ? `Raise your arm higher: flag ${S.cp + 1} is at ${need}°` : `Almost there, a little higher (${need}°)`, "info");
        }
      }
      if (S.climbT > 50 && S.cp < 5) {
        api.miss(); S.needRest = true; S.best = 0;
        api.extraRef.current = { summits: S.climbs, topCheckpointDeg: thr[4] };
        api.roundDone(0.3);
      }
    },
    draw(ctx, { w, h }, time) {
      const e = api.inputRef.current.elev;
      const inp = api.inputRef.current;
      const thr = thrFor(api.level);
      const top = thr[4];
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#1c2a4d"); sky.addColorStop(0.6, "#7a5c7e"); sky.addColorStop(1, "#f0a56a");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,228,184,0.9)"; ctx.beginPath(); ctx.arc(w * 0.8, h * 0.28, 22, 0, 6.283); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      for (let i = 0; i < 24; i++) { ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(time + i)); ctx.fillRect((i * 83) % w, (i * 37) % (h * 0.4), 2, 2); }
      ctx.globalAlpha = 1;
      const poly = (pts, fill) => { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h))); ctx.closePath(); ctx.fill(); };
      poly([[0, 0.74], [0.16, 0.56], [0.3, 0.69], [0.45, 0.44], [0.6, 0.65], [0.77, 0.48], [1, 0.7], [1, 1], [0, 1]], "rgba(74,74,118,0.75)");
      poly([[0, 0.86], [0.2, 0.65], [0.36, 0.79], [0.5, 0.15], [0.65, 0.7], [0.82, 0.58], [1, 0.79], [1, 1], [0, 1]], "#2a2a4c");
      poly([[0.5, 0.15], [0.45, 0.3], [0.48, 0.27], [0.5, 0.33], [0.53, 0.26], [0.56, 0.29]], "rgba(232,238,248,0.93)");
      poly([[0, 0.95], [0.22, 0.86], [0.44, 0.93], [0.66, 0.87], [0.88, 0.94], [1, 0.9], [1, 1], [0, 1]], "#14142a");
      // route, bright up to where the climber is
      const frac = S.needRest && S.cp >= 5 ? 1 : Math.min(1, S.ang / top);
      ctx.lineCap = "round";
      ctx.setLineDash([2, 9]); ctx.strokeStyle = "rgba(255,224,138,0.55)"; ctx.lineWidth = 3;
      ctx.beginPath(); for (let i = 0; i <= 40; i++) { const p = along(w, h, i / 40); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.stroke();
      ctx.setLineDash([]); ctx.strokeStyle = "#ffe08a"; ctx.lineWidth = 5;
      ctx.beginPath(); for (let i = 0; i <= 40; i++) { const f = (i / 40) * frac; const p = along(w, h, f); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.stroke();
      // flags at the height they need
      thr.forEach((t, i) => {
        const p = along(w, h, t / top);
        const done = S.cp > i; const next = S.cp === i && !S.needRest;
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 26); ctx.stroke();
        ctx.fillStyle = done ? "#7cf2c0" : next ? "#ffe08a" : "rgba(255,255,255,0.45)";
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 26); ctx.lineTo(p.x + 20, p.y - 20); ctx.lineTo(p.x, p.y - 13); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "800 12px Manrope, system-ui, sans-serif"; ctx.textAlign = "left";
        ctx.fillText(done ? "✓" : `${t}°`, p.x + 24, p.y - 12);
        if (next) {
          ctx.strokeStyle = "#ffe08a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 13 + Math.sin(time * 4) * 2, 0, 6.283); ctx.stroke();
          if (S.hold > 0) { ctx.strokeStyle = "#7cf2c0"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(p.x, p.y, 19, -Math.PI / 2, -Math.PI / 2 + (S.hold / HOLD) * 6.283); ctx.stroke(); }
        }
      });
      // the climber
      const c = along(w, h, frac);
      ctx.fillStyle = "#fff"; ctx.shadowColor = "#ffe08a"; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(c.x, c.y - 16, 7, 0, 6.283); ctx.fill();
      ctx.fillRect(c.x - 4.5, c.y - 9, 9, 16); ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffe08a"; ctx.font = "800 11px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("YOU", c.x, c.y - 30);
      if (S.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${S.flash * 0.22})`; ctx.fillRect(0, 0, w, h); }

      // your own arms, so the link is obvious
      const arm = api.arm;
      const l = arm === "both" || arm === "left" ? inp.leftElev : 0, r = arm === "both" || arm === "right" ? inp.rightElev : 0;
      const ax = w * 0.17, ay = h * 0.36, sc = Math.min(1.3, h / 440);
      ctx.fillStyle = "rgba(5,8,22,0.45)"; roundedRect(ctx, ax - 92 * sc, ay - 36 * sc, 184 * sc, 220 * sc, 14); ctx.fill();
      drawAvatar(ctx, ax, ay, sc, { l, r, body: "#f1e9ff", glow: "#ffe08a" });
      ctx.fillStyle = "#ffe08a"; ctx.font = "800 12px Manrope, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`arm ${Math.round(e)}°  →  climber`, ax, ay + 168 * sc);

      // height gauge
      const gx = 36, gy = 70, gh = h - 190;
      ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gh); ctx.stroke();
      const yOf = (d) => gy + gh - (Math.min(180, d) / 180) * gh;
      thr.forEach((t) => { ctx.strokeStyle = "rgba(255,224,138,0.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx - 7, yOf(t)); ctx.lineTo(gx + 7, yOf(t)); ctx.stroke(); });
      ctx.strokeStyle = "#ffe08a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(gx, yOf(e)); ctx.lineTo(gx, yOf(0)); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(gx, yOf(e), 7, 0, 6.283); ctx.fill();
      ctx.font = "700 11px Manrope, system-ui, sans-serif"; ctx.textAlign = "left";
      ctx.fillStyle = "#e6dff0"; ctx.fillText("180°", gx + 12, gy + 4); ctx.fillText("0°", gx + 12, gy + gh + 4);
      if (S.needRest) {
        ctx.fillStyle = "rgba(10,10,28,0.8)"; roundedRect(ctx, w / 2 - 130, h * 0.12, 260, 40, 10); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "800 16px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("🏔 SUMMIT!", w / 2, h * 0.12 + 26);
      }
    },
  });

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ filter: api.levelFilter }} />
      <HudPill className="absolute left-3 top-14 z-10" label="Summits" value={`${S.climbs}`} />
    </>
  );
}

export default function Summit(props) {
  return <ArmGameFrame meta={META} {...props}>{(api) => <Stage api={api} />}</ArmGameFrame>;
}
