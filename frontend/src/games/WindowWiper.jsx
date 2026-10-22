// Window Wiper (Medium) - sweep wide, smooth arcs with your hand to clear rain from a night windshield.
// Frozen Shoulder, Rotator Cuff, Stroke.
import { useRef } from "react";
import ArmGameFrame, { HudPill } from "../components/rehab/ArmGameFrame";
import useStageLoop from "../components/rehab/useStageLoop";
import { roundedRect } from "../components/rehab/stageDraw";

const META = {
  name: "Window Wiper",
  emoji: "🌧️",
  accent: "#5ac8ff",
  tagline: "Sweep wide, smooth arcs to clear the rain from the glass.",
  sessionSeconds: 150,
  levelHint: (l) => `wider swings (${Math.min(130, 55 + l * 15)}°), heavier rain, longer to keep it clear`,
  trains: "wide shoulder swings, side to side, with smooth control.",
  levelNames: ["Drizzle", "Showers", "Downpour", "Storm", "Monsoon"],
  scoring: [
    "Your hand is the wiper blade. A rain burst floods the glass: swing left and right to clear it.",
    "Collect the glowing gem at each end of the glass. Each gem is one wide wipe, and reaching further out keeps the whole glass clean.",
    "Keep the glass mostly clear for a few seconds to beat the burst. Beat 3 bursts to reach the next level. Higher levels mean wider swings and heavier rain.",
  ],
  moves: [
    {
      id: "right", label: "Right hand, wide arcs", motion: "sweep", arm: "right", peak: 90,
      steps: ["Raise your right hand to about chest height, elbow slightly bent.", "Swing it slowly out to the right, then all the way across to the left, like a wiper.", "Keep the arc smooth. Turn around at each end without a jerk."],
      body: ["Let the shoulder do the swing, keep your body still", "Hand stays at chest height", "Breathe out on each sweep"],
      tip: "swing your hand left and right in a wide arc",
    },
    {
      id: "left", label: "Left hand, wide arcs", motion: "sweep", arm: "left", peak: 90,
      steps: ["Raise your left hand to about chest height, elbow slightly bent.", "Swing it slowly out to the left, then all the way across to the right, like a wiper.", "Keep the arc smooth. Turn around at each end without a jerk."],
      body: ["Let the shoulder do the swing, keep your body still", "Hand stays at chest height", "Breathe out on each sweep"],
      tip: "swing your hand left and right in a wide arc",
    },
    {
      id: "either", label: "Slow and wide, either hand", motion: "sweep", arm: "both", peak: 90,
      steps: ["Use whichever hand is easier today (the one you raise higher is used).", "Take longer, slower swings with the elbow lifted a little.", "Try to reach a little further at the ends each time, within comfort."],
      body: ["Lift the elbow slightly away from your side", "Sit tall, do not twist your body", "Smooth beats fast"],
      tip: "long, slow swings with the hand you choose",
    },
  ],
};

const BINS = 36;
const SPAN = 150; // degrees covered by the glass
const NEED_BURSTS = 3;
const needSpan = (level) => Math.min(130, 55 + level * 15);
const sustainFor = (level) => 3 + level * 0.8;
const regrow = (level) => 0.07 + level * 0.015;
const BURST_SECONDS = 26;
const CALM_SECONDS = 3.5;
const angleOf = (x) => Math.max(-75, Math.min(75, ((x - 50) / 30) * 75));

function Stage({ api }) {
  const S = useRef({
    rain: new Array(BINS).fill(0.2), ang: 0, phase: "calm", phaseT: 2, sustain: 0, burstNo: 0, cleared: 0, round: [],
    next: "R", lastGem: null, gems: 0, wipes: 0, flash: 0, flashText: "", clearPct: 0,
  }).current;
  const gemAng = (side, level) => (side === "L" ? -1 : 1) * Math.min(72, needSpan(level) / 2 + 3);

  const canvasRef = useStageLoop(api, {
    update(dt) {
      const hand = api.inputRef.current.hand;
      const level = api.level;
      S.flash = Math.max(0, S.flash - dt);
      S.phaseT -= dt;
      // glass state
      if (S.phase === "storm") for (let i = 0; i < BINS; i++) S.rain[i] = Math.min(1, S.rain[i] + regrow(level) * dt);
      let clear = 0;
      for (let i = 0; i < BINS; i++) clear += 1 - S.rain[i];
      S.clearPct = (clear / BINS) * 100;
      // blade follows the hand
      const prev = S.ang;
      if (hand) {
        S.ang += (angleOf(hand.x) - S.ang) * Math.min(1, dt * 14);
        for (let i = 0; i < BINS; i++) {
          const a = -SPAN / 2 + ((i + 0.5) / BINS) * SPAN;
          if (Math.abs(a - S.ang) < 5 || Math.abs(a - (prev + S.ang) / 2) < 5) S.rain[i] = 0;
        }
      }
      const total = sustainFor(level);
      if (S.phase === "calm") {
        api.setMission({ text: "Rest your arm. The next rain burst is coming", done: S.cleared, total: NEED_BURSTS });
        api.setCoach("Rest for a moment, then get ready to wipe", "info");
        if (S.phaseT <= 0) {
          S.phase = "storm"; S.phaseT = BURST_SECONDS; S.sustain = 0; S.burstNo += 1; S.next = "R"; S.lastGem = null;
          S.rain.fill(1); S.flash = 1.2; S.flashText = `RAIN BURST ${S.burstNo}`;
        }
        return;
      }
      // storm
      api.setMission({ text: `Rain burst: keep the glass 80% clear for ${total.toFixed(0)} seconds`, done: S.cleared, total: NEED_BURSTS });
      // gems: swing to the glowing gem at the end of the glass, then to the other one
      const ga = gemAng(S.next, level);
      if (hand && Math.abs(S.ang - ga) < 6) {
        const span = S.lastGem == null ? 0 : Math.abs(ga - S.lastGem);
        S.lastGem = ga; S.next = S.next === "L" ? "R" : "L"; S.gems += 1;
        if (span > 0) { S.wipes += 1; api.hit(20 + Math.round(span / 4), span); }
        else api.bonus(5);
        S.flash = 0.35; S.flashText = "💎";
        api.extraRef.current = { wipes: S.wipes, gems: S.gems, burstsCleared: S.cleared, requiredSpanDeg: needSpan(level) };
      }
      if (S.clearPct >= 80) S.sustain += dt; else S.sustain = Math.max(0, S.sustain - dt * 1.5);
      const dir = S.next === "L" ? "left" : "right";
      if (S.clearPct < 80) api.setCoach(`Swing your hand to the ${dir} gem 💎 to wipe the glass`, "warn");
      else api.setCoach(`Glass is clear! Keep going: ${Math.max(0, total - S.sustain).toFixed(1)}s more. Swing to the ${dir} gem`, "ok");
      if (S.sustain >= total) {
        S.cleared += 1; S.round.push(1); api.bonus(50 + level * 10); S.flash = 1.4; S.flashText = "BURST CLEARED +bonus";
        S.phase = "calm"; S.phaseT = CALM_SECONDS; S.rain.fill(0.15);
      } else if (S.phaseT <= 0) {
        S.round.push(0); api.miss(); S.flash = 1.2; S.flashText = "Rain won this time";
        S.phase = "calm"; S.phaseT = CALM_SECONDS; S.rain.fill(0.15);
      }
      if (S.phase === "calm" && S.round.length >= NEED_BURSTS) {
        const rate = S.round.reduce((a, b) => a + b, 0) / S.round.length;
        S.round = []; S.cleared = 0; api.roundDone(rate);
      }
      api.extraRef.current = { ...api.extraRef.current, wipes: S.wipes, gems: S.gems, requiredSpanDeg: needSpan(level) };
    },
    draw(ctx, { w, h }, time) {
      const px = w / 2, py = h + 6, R = Math.min(h * 0.98, w * 0.5);
      const level = api.level;
      ctx.fillStyle = "#27304d"; ctx.fillRect(0, 0, w, h);
      [[0.16, 0.55, 22, "#ff7a59"], [0.28, 0.4, 16, "#ffd25a"], [0.47, 0.62, 24, "#5ac8ff"], [0.64, 0.44, 18, "#ff5a9e"], [0.8, 0.58, 22, "#ffd25a"], [0.9, 0.36, 14, "#5ac8ff"]].forEach(([x, y, r, c]) => {
        const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * 1.8);
        g.addColorStop(0, c); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 0.85; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x * w, y * h, r * 1.8, 0, 6.283); ctx.fill();
      });
      ctx.globalAlpha = 1;
      const drawSharp = () => {
        const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#0f1730"); g.addColorStop(1, "#1a2446");
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#0a1020"; ctx.beginPath(); ctx.moveTo(0, h * 0.78);
        [[0.07, 0.6], [0.07, 0.46], [0.14, 0.46], [0.14, 0.62], [0.23, 0.62], [0.23, 0.34], [0.32, 0.34], [0.32, 0.58], [0.43, 0.58], [0.43, 0.42], [0.54, 0.42], [0.54, 0.66], [0.64, 0.66], [0.64, 0.38], [0.75, 0.38], [0.75, 0.62], [0.86, 0.62], [0.86, 0.5], [1, 0.5]].forEach(([x, y]) => ctx.lineTo(x * w, y * h));
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
        ctx.fillStyle = "#ffd25a";
        for (let i = 0; i < 26; i++) ctx.fillRect(((i * 41) % w) | 0, h * 0.4 + ((i * 29) % (h * 0.5)), 5, 7);
      };
      for (let i = 0; i < BINS; i++) {
        const a0 = (-SPAN / 2 + (i / BINS) * SPAN - 90) * (Math.PI / 180);
        const a1 = (-SPAN / 2 + ((i + 1) / BINS) * SPAN - 90) * (Math.PI / 180);
        const clear = 1 - S.rain[i];
        if (clear < 0.03) continue;
        ctx.save(); ctx.globalAlpha = Math.min(1, clear * 1.3);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, R, a0 - 0.004, a1 + 0.004); ctx.closePath(); ctx.clip();
        drawSharp(); ctx.restore();
      }
      // rain
      const heavy = S.phase === "storm" ? 1 : 0.25;
      ctx.strokeStyle = "rgba(159,179,198,0.5)"; ctx.lineWidth = 2; ctx.lineCap = "round";
      for (let i = 0; i < 70; i++) {
        const x = (i * 71) % w; const y = ((i * 47 + time * (130 + (i % 5) * 30)) % (h + 40)) - 20;
        const a = (Math.atan2(x - px, py - y) * 180) / Math.PI;
        const bi = Math.floor(((a + SPAN / 2) / SPAN) * BINS);
        const rain = bi >= 0 && bi < BINS ? S.rain[bi] : 1;
        if (rain < 0.25 || (i > 25 && S.phase !== "storm")) continue;
        ctx.globalAlpha = rain * 0.7 * heavy; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 20); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // gems at both ends of the glass
      if (S.phase === "storm") {
        ["L", "R"].forEach((side) => {
          const a = gemAng(side, level) * (Math.PI / 180);
          const gx = px + Math.sin(a) * R * 0.82, gy = py - Math.cos(a) * R * 0.82;
          const next = S.next === side;
          const sz = next ? 17 + Math.sin(time * 6) * 2 : 11;
          ctx.save(); ctx.translate(gx, gy);
          ctx.shadowColor = "#7cf2ff"; ctx.shadowBlur = next ? 26 : 6;
          ctx.fillStyle = next ? "#bffbff" : "rgba(191,251,255,0.35)";
          ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.8, 0); ctx.lineTo(0, sz); ctx.lineTo(-sz * 0.8, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
          if (next) {
            ctx.fillStyle = "#fff"; ctx.font = "900 13px Manrope, system-ui, sans-serif"; ctx.textAlign = "center";
            ctx.fillText(side === "L" ? "← WIPE HERE" : "WIPE HERE →", gx, gy - 28);
          }
        });
      }
      // blade
      const bx = px + Math.sin((S.ang * Math.PI) / 180) * R, by = py - Math.cos((S.ang * Math.PI) / 180) * R;
      ctx.strokeStyle = "#0a0e18"; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = S.flash > 0.2 ? "#7cf2c0" : "#5a6482"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = "#1a2030"; ctx.beginPath(); ctx.arc(px, py - 4, 10, 0, 6.283); ctx.fill();
      // sustain bar
      if (S.phase === "storm") {
        const total = sustainFor(level), bw = Math.min(300, w * 0.4), bx0 = w / 2 - bw / 2, by0 = 62;
        ctx.fillStyle = "rgba(5,8,16,0.75)"; roundedRect(ctx, bx0 - 8, by0 - 4, bw + 16, 36, 9); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.2)"; roundedRect(ctx, bx0, by0 + 12, bw, 10, 5); ctx.fill();
        ctx.fillStyle = S.clearPct >= 80 ? "#7cf2c0" : "#5ac8ff"; roundedRect(ctx, bx0, by0 + 12, Math.max(6, bw * Math.min(1, S.sustain / total)), 10, 5); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "700 11px Manrope, system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(`Glass ${Math.round(S.clearPct)}% clear · hold above 80% to win the burst · ${Math.ceil(Math.max(0, S.phaseT))}s left`, w / 2, by0 + 8);
      }
      if (S.flash > 0) {
        ctx.globalAlpha = Math.min(1, S.flash * 1.5); ctx.fillStyle = "#fff"; ctx.font = "900 34px Manrope, system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.shadowColor = "#000"; ctx.shadowBlur = 8; ctx.fillText(S.flashText, w / 2, h * 0.3); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    },
  });

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ filter: api.levelFilter }} />
      <HudPill className="absolute left-3 top-14 z-10" label="Wide wipes" value={`${S.wipes}`} />
    </>
  );
}

export default function WindowWiper(props) {
  return <ArmGameFrame meta={META} {...props}>{(api) => <Stage api={api} />}</ArmGameFrame>;
}
