// Table Rally (id: cross-rally, Easy) - table tennis from your side of the table.
// Your hand is the paddle. Slide it to meet each ball; balls on the far side of
// your body make you reach ACROSS. Swipe the way you want to send the ball.
// Frozen Shoulder, Rotator Cuff.
import { useRef } from "react";
import ArmGameFrame, { HudPill } from "../components/rehab/ArmGameFrame";
import useStageLoop from "../components/rehab/useStageLoop";
import { roundedRect } from "../components/rehab/stageDraw";

const STEPS_COMMON = [
  "Hold your hand up in front of you, like holding a table tennis paddle. Your hand is the paddle on the screen.",
  "The ball comes from the far end of the table, bounces once and rises to you. Slide your hand left or right so your paddle meets the ball.",
  "Balls on the far side of your body make you reach across. That is the exercise.",
  "After you hit, swipe your hand toward the glowing target. A dotted arc shows the shot to copy. Hit the target for bonus points.",
];
const BODY = ["Keep your chest facing the camera, let your arm do the reaching", "Shoulder down and relaxed, elbow leads the reach", "Slow and controlled beats a hard slap"];

const META = {
  name: "Table Rally",
  emoji: "🏓",
  accent: "#7cf2c0",
  tagline: "A table tennis rally. Your hand is the paddle.",
  sessionSeconds: 150,
  fastInput: true, // less smoothing on the hand so the bat reacts at once
  trains: "reaching across the body (horizontal adduction) and side to side, hard directions for a stiff shoulder.",
  levelNames: ["Warm-up", "Rally", "Match", "Final", "Champion"],
  levelHint: (l) => `balls come ${Math.round(l * 8)}% faster and land wider`,
  scoring: [
    "Every ball you meet with your paddle is a return and scores points.",
    "Balls on the far side of your body (across your chest) score extra, because that reach is the exercise.",
    "After you hit, swipe toward the glowing target on the far end (follow the dotted arc) to get an ANGLE bonus.",
    "Return 5 balls to reach the next level. Missing balls just makes the next round a little easier.",
  ],
  moves: [
    { id: "right", label: "Right hand paddle", motion: "cross", arm: "right", peak: 90, steps: STEPS_COMMON, body: BODY, tip: "slide your right hand to meet the ball, reach across for the left ones" },
    { id: "left", label: "Left hand paddle", motion: "cross", arm: "left", peak: 90, steps: STEPS_COMMON, body: BODY, tip: "slide your left hand to meet the ball, reach across for the right ones" },
    { id: "both", label: "Either hand", motion: "cross", arm: "both", peak: 90, steps: [
      "Hold both hands up in front of you. Each hand is a paddle on the screen.",
      "Use whichever hand is closer to the ball. Balls come to both sides.",
      "Try the hand that has to reach across your body for some of them.",
      "After you hit, swipe the way you want the ball to go. Aim for the glowing target.",
    ], body: BODY, tip: "use whichever hand is closer to the ball" },
  ],
};

const NEED = 5;
const spread = (level) => Math.min(0.95, 0.5 + level * 0.1);
const flight = (level) => Math.max(1.8, 3.1 - level * 0.22); // seconds from serve to you: plenty of time at Level 1
const HIT_FROM = 0.78, HIT_TO = 1.15, TOL = 0.38; // forgiving window, and the bat only has to pass the ball
const AIM_WINDOW = 0.45; // seconds after the hit in which your swipe decides the angle
const SWIPE_U = 0.1; // how far (in table widths) you must swipe to count as left or right
// The table is fitted to YOUR reach: it learns how far each hand has moved sideways and maps
// that range to the width of the table (so a stiff shoulder with a small range still reaches
// every ball, and the table opens up as your range grows). Never smaller than MIN_SPAN.
const MIN_SPAN = 22; // percent of the camera width
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function laneFor(arm, level) {
  const sp = spread(level);
  const r = Math.random();
  if (arm === "both") return (Math.random() * 2 - 1) * sp;
  const cross = arm === "right" ? -1 : 1; // screen side that is across the body
  if (r < 0.55) return cross * (0.4 + Math.random() * (sp - 0.35));
  if (r < 0.8) return (Math.random() - 0.5) * 0.3;
  return -cross * (0.25 + Math.random() * 0.35);
}

// A table tennis bat: wooden handle, red rubber face, white edge. `col` is the glow
// (cyan = left hand, orange = right hand). Tilts a little with sideways movement.
function drawBat(ctx, x, y, col, tilt = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.shadowColor = col; ctx.shadowBlur = 20;
  ctx.fillStyle = "#c9954f"; roundedRect(ctx, -6, 18, 12, 40, 4); ctx.fill(); // handle
  ctx.fillStyle = "#a8742f"; roundedRect(ctx, -6, 40, 12, 6, 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#f3e9d2"; ctx.beginPath(); ctx.ellipse(0, -4, 31, 35, 0, 0, 6.283); ctx.fill(); // edge
  const g = ctx.createRadialGradient(-8, -16, 4, 0, -4, 34);
  g.addColorStop(0, "#ff6a5f"); g.addColorStop(1, "#b3201a");
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -4, 27, 31, 0, 0, 6.283); ctx.fill(); // rubber
  ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 8, -30); ctx.lineTo(i * 8, 22); ctx.stroke(); }
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -4, 33, 37, 0, 0, 6.283); ctx.stroke(); // hand colour ring
  ctx.restore();
}

function Stage({ api }) {
  const S = useRef({
    ball: null, timer: 1.2, returns: 0, tries: 0, crossHits: 0, crossTotal: 0, angleHits: 0, round: [], parts: [], pops: [],
    target: pick([-0.7, 0, 0.7]), flash: null, clock: 0, range: { l: null, r: null }, hist: { l: [], r: [] }, shown: { l: null, r: null }, shownY: { l: 55, r: 55 }, tiltV: { l: 0, r: 0 },
  }).current;

  const canvasRef = useStageLoop(api, {
    update(dt) {
      const inp = api.inputRef.current;
      const arm = api.arm;
      const level = api.level;
      // short memory of where each bat has been, so a quick pass over the ball still counts
      S.clock += dt;
      [["l", inp.left], ["r", inp.right]].forEach(([k, hd]) => {
        const hs = S.hist[k];
        let uNow = 0;
        if (hd) {
          const rg = S.range[k] || (S.range[k] = { min: hd.x, max: hd.x });
          rg.min = Math.min(rg.min, hd.x); rg.max = Math.max(rg.max, hd.x);
          rg.min += (hd.x - rg.min) * dt * 0.01; rg.max += (hd.x - rg.max) * dt * 0.01; // forget old extremes slowly
          const span = Math.max(MIN_SPAN, rg.max - rg.min);
          rg.span = span;
          uNow = Math.max(-1.3, Math.min(1.3, (hd.x - (rg.min + rg.max) / 2) / (span / 2)));
        }
        if (hd) hs.push({ t: S.clock, u: uNow });
        while (hs.length && S.clock - hs[0].t > 0.35) hs.shift();
        // What we draw: the bat holds still for tiny wobbles and follows fully for real
        // movement (small gap = heavy smoothing, big gap = nearly direct).
        if (hd) {
          const u = uNow;
          if (S.shown[k] == null) S.shown[k] = u;
          const d = u - S.shown[k];
          if (Math.abs(d) > 0.05) S.shown[k] += d * Math.min(1, 0.18 + Math.abs(d) * 2.2);
          const dy = hd.y - S.shownY[k];
          if (Math.abs(dy) > 3) S.shownY[k] += dy * Math.min(1, 0.15 + Math.abs(dy) * 0.02);
          S.tiltV[k] += ((d > 0.05 ? d : d < -0.05 ? d : 0) - S.tiltV[k]) * 0.15;
        } else { S.shown[k] = null; S.tiltV[k] = 0; }
      });
      S.flash && ((S.flash.t -= dt) <= 0) && (S.flash = null);
      S.parts.forEach((p) => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; });
      S.parts = S.parts.filter((p) => p.life > 0);
      S.pops.forEach((p) => { p.life -= dt; p.y -= 30 * dt; });
      S.pops = S.pops.filter((p) => p.life > 0);

      api.setMission({ text: "Return 5 balls. Reach across for the far ones, swipe to aim", done: Math.min(NEED, S.round.length), total: NEED });
      const b = S.ball;
      if (!b) {
        api.setCoach("Get ready: the ball is coming. Hold your hand up like a paddle", "info");
        S.timer -= dt;
        if (S.timer <= 0) { S.ball = { lane: laneFor(arm, level), p: 0, state: "in", rt: 0, aim: 0 }; S.target = pick([-0.7, 0, 0.7]); }
        return;
      }
      if (b.state === "in") {
        b.p += dt / flight(level);
        const keys = arm === "left" ? ["l"] : arm === "right" ? ["r"] : ["l", "r"];
        const sideTxt = b.lane < -0.2 ? "your LEFT" : b.lane > 0.2 ? "your RIGHT" : "the MIDDLE";
        if (b.p < HIT_FROM) {
          const across = (arm === "right" && b.lane < -0.2) || (arm === "left" && b.lane > 0.2);
          api.setCoach(across ? `Ball coming to ${sideTxt}: reach ACROSS your body now` : `Ball coming to ${sideTxt}: slide your bat there`, across ? "warn" : "info");
        } else api.setCoach("HIT IT! Put your bat on the ball", "warn");
        if (b.p >= HIT_FROM && b.p <= HIT_TO) {
          const hitKey = keys.find((k) => S.hist[k].some((q) => S.clock - q.t < 0.3 && Math.abs(q.u - b.lane) < TOL));
          if (hitKey) {
            const u0 = S.hist[hitKey].length ? S.hist[hitKey][S.hist[hitKey].length - 1].u : b.lane;
            b.state = "out"; b.rt = 0; b.hitKey = hitKey; b.u0 = u0; b.aim = 0; b.aimLocked = false;
            const isCross = (hitKey === "r" && b.lane < -0.25) || (hitKey === "l" && b.lane > 0.25);
            b.isCross = isCross;
            S.returns += 1; S.tries += 1; if (isCross) S.crossHits += 1; if (isCross) S.crossTotal += 1;
            const pts = 20 + (isCross ? 15 : 0);
            api.hit(pts, Math.min(120, (S.range[hitKey]?.span || MIN_SPAN) * 1.2));
            S.round.push(1);
            S.flash = { t: 0.7, text: isCross ? "CROSS-BODY RETURN!" : "RETURN!" };
            S.pops.push({ text: `+${pts}`, life: 1, x: b.lane, y: 0 });
            for (let i = 0; i < 20; i++) S.parts.push({ x: 0, y: 0, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 220, life: 0.7 });
          }
        }
        if (b.p > HIT_TO && b.state === "in") {
          b.state = "miss"; b.rt = 0; S.tries += 1;
          if ((arm === "right" && b.lane < -0.25) || (arm === "left" && b.lane > 0.25)) S.crossTotal += 1;
          api.miss(); S.round.push(0);
          S.flash = { t: 0.8, text: "Missed. Slide your bat to the ball sooner" };
        }
      } else {
        b.rt += dt;
        if (b.state === "out" && !b.aimLocked) {
          const hs = S.hist[b.hitKey];
          const now = hs.length ? hs[hs.length - 1].u : b.u0;
          const du = now - b.u0;
          b.aim = du < -SWIPE_U ? -0.7 : du > SWIPE_U ? 0.7 : 0;
          if (b.rt >= AIM_WINDOW) {
            b.aimLocked = true;
            if (b.aim === S.target) { S.angleHits += 1; api.bonus(15); S.flash = { t: 0.8, text: "ANGLE BONUS! +15" }; S.pops.push({ text: "+15", life: 1, x: b.aim, y: -40 }); }
          }
        }
        api.setCoach(b.state === "out" ? (!b.aimLocked ? (S.target < 0 ? "Swipe LEFT toward the target" : S.target > 0 ? "Swipe RIGHT toward the target" : "Hold still: hit it straight") : b.aim === S.target ? "Perfect angle!" : "Nice return. Next time follow the dotted arc") : "Missed that one. Next ball: get your bat there early", b.state === "out" ? "ok" : "warn");
        if (b.rt > (b.state === "out" ? 1.2 : 0.8)) {
          S.ball = null; S.timer = 1.1;
          if (S.round.length >= NEED) { const rate = S.round.reduce((a, c) => a + c, 0) / S.round.length; S.round = []; api.roundDone(rate); }
        }
      }
      api.extraRef.current = { returns: S.returns, attempts: S.tries, crossBodyReturns: S.crossHits, crossBodyBalls: S.crossTotal, angleBonuses: S.angleHits };
    },
    draw(ctx, { w, h }, time) {
      const inp = api.inputRef.current;
      const arm = api.arm;
      // ----- room -----
      const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#0a0f1c"); bg.addColorStop(1, "#14202e");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      const spot = ctx.createRadialGradient(w / 2, h * 0.3, 10, w / 2, h * 0.3, w * 0.6);
      spot.addColorStop(0, "rgba(255,255,255,0.16)"); spot.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = spot; ctx.fillRect(0, 0, w, h);
      // ----- table geometry -----
      const far = h * 0.2, near = h * 0.72;
      const wf = w * 0.34, wn = w * 0.78;
      const cx = w / 2;
      const yAt = (p) => far + (near - far) * Math.pow(Math.max(0, Math.min(1.15, p)), 1.12);
      const halfAt = (p) => (wf + (wn - wf) * Math.max(0, Math.min(1.15, p))) / 2;
      const sAt = (p) => 0.5 + 0.75 * Math.max(0, Math.min(1.15, p));
      // table top
      const tg = ctx.createLinearGradient(0, far, 0, near); tg.addColorStop(0, "#1b5aa8"); tg.addColorStop(1, "#0f3c78");
      ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(cx - wf / 2, far); ctx.lineTo(cx + wf / 2, far); ctx.lineTo(cx + wn / 2, near); ctx.lineTo(cx - wn / 2, near); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 3; ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, far); ctx.lineTo(cx, near); ctx.stroke();
      // table edge thickness
      ctx.fillStyle = "#0a2a52"; ctx.fillRect(cx - wn / 2, near, wn, 14);
      // net halfway
      const ny = yAt(0.5), nh = halfAt(0.5);
      ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fillRect(cx - nh, ny - 24, nh * 2, 24);
      ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 2; ctx.strokeRect(cx - nh, ny - 24, nh * 2, 24);
      // target zones on the far end
      [-0.7, 0, 0.7].forEach((u) => {
        const on = S.target === u;
        const zx = cx + u * halfAt(0.04);
        ctx.fillStyle = on ? `rgba(124,242,192,${0.45 + 0.2 * Math.sin(time * 6)})` : "rgba(255,255,255,0.06)";
        ctx.strokeStyle = on ? "#7cf2c0" : "rgba(255,255,255,0.2)"; ctx.lineWidth = on ? 3 : 1;
        ctx.beginPath(); ctx.ellipse(zx, yAt(0.07), wf * 0.13, 9, 0, 0, 6.283); ctx.fill(); ctx.stroke();
      });
      ctx.fillStyle = "#7cf2c0"; ctx.font = "800 11px Manrope, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("AIM HERE", cx + S.target * halfAt(0.04), yAt(0.07) - 14);
      // opponent paddle (far end) swings when a ball starts
      const b = S.ball;
      const oppU = b ? b.lane * 0.4 : 0;
      ctx.save(); ctx.translate(cx + oppU * halfAt(0), far - 22);
      ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#d83a3a"; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 6.283); ctx.fill();
      ctx.restore();
      // ----- imaginary arcs: where the ball is coming from, and the shot to copy -----
      const hAt = (p) => (p < 0.68 ? 55 * (1 - Math.pow(p / 0.68, 2)) : 70 * Math.sin(Math.PI * (p - 0.68) / 0.64));
      const inX = near;
      ctx.fillStyle = "rgba(255,255,255,0.07)"; // hit zone
      ctx.beginPath(); ctx.moveTo(cx - halfAt(0.8), yAt(0.8)); ctx.lineTo(cx + halfAt(0.8), yAt(0.8)); ctx.lineTo(cx + halfAt(1), yAt(1)); ctx.lineTo(cx - halfAt(1), yAt(1)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.font = "700 10px Manrope, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("HIT ZONE", cx, yAt(0.9));
      if (b && b.state === "in") {
        const lx = cx + b.lane * halfAt(1);
        // where it will arrive
        const pulse = 0.7 + 0.3 * Math.sin(time * 8);
        ctx.fillStyle = `rgba(255,214,120,${pulse})`;
        ctx.beginPath(); ctx.moveTo(lx, inX + 4); ctx.lineTo(lx - 12, inX + 22); ctx.lineTo(lx + 12, inX + 22); ctx.closePath(); ctx.fill();
        ctx.font = "800 11px Manrope, system-ui, sans-serif"; ctx.fillText("BALL ARRIVES HERE", lx, inX + 38);
        // dotted arc of the incoming ball
        ctx.setLineDash([3, 7]); ctx.strokeStyle = "rgba(255,214,120,0.55)"; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i <= 24; i++) { const pp = b.p + (1 - b.p) * (i / 24); const x = cx + b.lane * halfAt(pp), y = yAt(pp) - Math.max(0, hAt(pp)) * sAt(pp); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (b && (b.state === "in" || (b.state === "out" && !b.aimLocked))) {
        // the shot to copy: from your side to the glowing target
        const sx = cx + (b.lane) * halfAt(1), sy = yAt(1) - 40;
        const tx = cx + S.target * halfAt(0.07), ty = yAt(0.07);
        const mx = (sx + tx) / 2 + (S.target - b.lane) * 40, my = Math.min(sy, ty) - 70;
        ctx.setLineDash([6, 7]); ctx.strokeStyle = "rgba(124,242,192,0.85)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke(); ctx.setLineDash([]);
        const ang = Math.atan2(ty - my, tx - mx);
        ctx.fillStyle = "#7cf2c0"; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - 12 * Math.cos(ang - 0.4), ty - 12 * Math.sin(ang - 0.4)); ctx.lineTo(tx - 12 * Math.cos(ang + 0.4), ty - 12 * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill();
      }
      // ----- ball -----
      if (b) {
        let bx, by, r, hgt = 0;
        if (b.state === "in" || b.state === "miss") {
          const p = b.state === "miss" ? Math.min(1.15, 1.1 + b.rt * 0.12) : b.p;
          hgt = p < 0.68 ? 55 * (1 - Math.pow(p / 0.68, 2)) : 70 * Math.sin(Math.PI * (p - 0.68) / 0.64);
          bx = cx + b.lane * halfAt(p); by = yAt(p) - Math.max(0, hgt) * sAt(p); r = 6 + 9 * sAt(p);
          // shadow + bounce mark
          ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(bx, yAt(p), r * 1.1, r * 0.35, 0, 0, 6.283); ctx.fill();
          // trail
          for (let i = 1; i <= 5; i++) {
            const pp = Math.max(0, p - i * 0.03);
            const hh = pp < 0.68 ? 55 * (1 - Math.pow(pp / 0.68, 2)) : 70 * Math.sin(Math.PI * (pp - 0.68) / 0.64);
            ctx.fillStyle = `rgba(255,170,60,${0.28 - i * 0.045})`; ctx.beginPath(); ctx.arc(cx + b.lane * halfAt(pp), yAt(pp) - Math.max(0, hh) * sAt(pp), r * (1 - i * 0.12), 0, 6.283); ctx.fill();
          }
          if (b.state === "miss") ctx.globalAlpha = Math.max(0, 1 - b.rt / 0.8);
        } else {
          const k = Math.min(1, b.rt / 0.9);
          const p = 1 - k;
          const u = b.lane + (b.aim - b.lane) * k;
          hgt = 40 * Math.sin(Math.PI * Math.min(1, k * 1.1)) + 30 * (1 - k);
          bx = cx + u * halfAt(p); by = yAt(p) - hgt * sAt(p); r = 6 + 9 * sAt(p);
          ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(bx, yAt(p), r * 1.1, r * 0.35, 0, 0, 6.283); ctx.fill();
        }
        ctx.shadowColor = "#ffb347"; ctx.shadowBlur = 16; ctx.fillStyle = "#fff4e0";
        ctx.beginPath(); ctx.arc(bx, by, r, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = "#ffa94d"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, r * 0.7, 0.3, 2.6 + time * 8); ctx.stroke();
        ctx.globalAlpha = 1;
        // "hit now" ring when the ball is in the hit window
        if (b.state === "in" && b.p >= HIT_FROM - 0.1) {
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by, r + 8 + Math.sin(time * 12) * 2, 0, 6.283); ctx.stroke();
        }
        S.parts.forEach((p2) => { ctx.fillStyle = `rgba(255,214,120,${Math.max(0, p2.life)})`; ctx.beginPath(); ctx.arc(bx + p2.x, by + p2.y, 3, 0, 6.283); ctx.fill(); });
      }
      // ----- your bat: only the hand you chose appears, and it follows that hand -----
      const paddles = [];
      if (arm !== "right" && S.shown.l != null) paddles.push(["l", inp.left, "#22d3ee"]);
      if (arm !== "left" && S.shown.r != null) paddles.push(["r", inp.right, "#fb923c"]);
      paddles.forEach(([k, hd, col]) => {
        const px = cx + S.shown[k] * halfAt(1);
        const py = near - 14 - (Math.max(20, Math.min(90, S.shownY[k])) - 55) * 0.5;
        const vel = S.tiltV[k];
        drawBat(ctx, px, py, col, Math.max(-0.35, Math.min(0.35, vel * 1.2)));
        // swipe guide beside the bat while the ball is on its way: which way to swipe after hitting
        if (b && (b.state === "in" || (b.state === "out" && !b.aimLocked))) {
          const dir = S.target < 0 ? -1 : S.target > 0 ? 1 : 0;
          ctx.strokeStyle = "#7cf2c0"; ctx.fillStyle = "#7cf2c0"; ctx.lineWidth = 4; ctx.lineCap = "round";
          if (dir !== 0) {
            const ax = px + dir * 56, ay = py - 8, len = 46 + Math.sin(time * 8) * 5;
            ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(ax, ay + 18); ctx.quadraticCurveTo(ax + dir * len * 0.5, ay - 22, ax + dir * len, ay); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ax + dir * len, ay); ctx.lineTo(ax + dir * (len - 11), ay - 10); ctx.lineTo(ax + dir * (len - 11), ay + 9); ctx.closePath(); ctx.fill();
          } else { ctx.font = "800 11px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("HIT STRAIGHT", px, py - 56); }
        }
      });
      if (!paddles.length) {
        ctx.fillStyle = "rgba(0,0,0,0.6)"; roundedRect(ctx, cx - 150, near - 40, 300, 34, 9); ctx.fill();
        ctx.fillStyle = "#ffd25a"; ctx.font = "800 13px Manrope, system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Raise your hand so the camera can see it", cx, near - 18);
      }
      // cross-body hint on the far side
      if (arm !== "both") {
        const sideLeft = arm === "right";
        ctx.fillStyle = "rgba(255,210,90,0.9)"; ctx.font = "800 12px Manrope, system-ui, sans-serif"; ctx.textAlign = sideLeft ? "left" : "right";
        ctx.fillText(sideLeft ? "← ACROSS YOUR BODY" : "ACROSS YOUR BODY →", sideLeft ? cx - wn / 2 + 6 : cx + wn / 2 - 6, near + 32);
      }
      S.pops.forEach((p3) => { ctx.fillStyle = `rgba(255,255,255,${Math.max(0, p3.life)})`; ctx.font = "900 22px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(p3.text, cx + p3.x * halfAt(1), near - 70 + p3.y); });
      if (S.flash) {
        ctx.globalAlpha = Math.min(1, S.flash.t * 2.5); ctx.fillStyle = S.flash.text.startsWith("Missed") ? "#ffd25a" : "#7cf2c0";
        ctx.font = "900 28px Manrope, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.shadowColor = "#000"; ctx.shadowBlur = 8;
        ctx.fillText(S.flash.text, cx, h * 0.12 + 30); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    },
  });

  const crossPct = S.crossTotal ? Math.round((S.crossHits / S.crossTotal) * 100) : 0;
  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ filter: api.levelFilter }} />
      <HudPill className="absolute left-3 top-14 z-10" label="Returns" value={`${S.returns}`} />
      <HudPill className="absolute left-3 top-[118px] z-10" label="Across body" value={`${S.crossHits} / ${S.crossTotal} (${crossPct}%)`} />
    </>
  );
}

export default function CrossRally(props) {
  return <ArmGameFrame meta={META} {...props}>{(api) => <Stage api={api} />}</ArmGameFrame>;
}
