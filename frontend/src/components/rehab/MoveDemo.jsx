// Looping skeleton demo (front view) that shows HOW to move the body for one
// "movement" of a game. Same look as GameDemo (green body, orange right arm,
// cyan left arm) with a glowing trail, an angle read-out and body cues.
//
// move = { motion: "raise" | "sweep" | "cross" | "climb", plane: "front" | "side",
//          arm: "both" | "left" | "right", peak: degrees (raise/climb), label }
// Pass `u` (0..1) to freeze a frame (tests).
import React, { useEffect, useState } from "react";

const G = "#4ade80";
const OR = "#fb923c";
const CY = "#22d3ee";
const SH = { left: { x: 92, y: 88 }, right: { x: 168, y: 88 } };
const L1 = 46;
const L2 = 46;
const PERIOD_MS = 5200;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const between = (u, a, b) => ease((u - a) / (b - a));
const rad = (d) => (d * Math.PI) / 180;

// 0 -> 1 -> 0 over one loop: rise, hold, lower.
const bump = (u) => (u < 0.1 ? 0 : u < 0.5 ? between(u, 0.1, 0.5) : u < 0.64 ? 1 : 1 - between(u, 0.64, 0.95));

function elbowFor(sh, hand, side) {
  const dx = hand.x - sh.x;
  const dy = hand.y - sh.y;
  const d = clamp(Math.hypot(dx, dy), 1, L1 + L2 - 0.5);
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const ux = dx / d, uy = dy / d;
  let px = -uy, py = ux;
  if (py < 0 || (py === 0 && px * (side === "left" ? -1 : 1) < 0)) { px = -px; py = -py; }
  return { x: sh.x + ux * a + px * h, y: sh.y + uy * a + py * h };
}

// Where the moving hand is at time u, plus the arm height it stands for.
function pose(move, side, u) {
  const sh = SH[side];
  const s = side === "left" ? -1 : 1;
  const peak = move.peak || 90;
  if (move.motion === "sweep") {
    const ang = 62 * Math.sin(u * Math.PI * 2);
    return { hand: { x: 130 + 98 * Math.sin(rad(ang)), y: 176 - 98 * Math.cos(rad(ang)) }, straight: false };
  }
  if (move.motion === "cross") {
    const k = bump(u);
    const x0 = sh.x + s * 52, x1 = 130 - s * 62;
    return { hand: { x: x0 + (x1 - x0) * k, y: 104 - 12 * Math.sin(k * Math.PI) }, straight: false };
  }
  let k = bump(u);
  if (move.motion === "climb") k = Math.round(k * 5) / 5; // five stops
  const a = peak * k;
  if (move.plane === "front") {
    // Reaching forward: seen from the front the arm shortens (it points at the camera).
    return { hand: { x: sh.x + s * 8 * Math.sin(rad(a)), y: sh.y + 88 * Math.cos(rad(a)) * (a > 100 ? 1 : 0.86) - (a <= 100 ? 0 : 0) }, elev: a, front: true, straight: true };
  }
  return { hand: { x: sh.x + s * 88 * Math.sin(rad(a)), y: sh.y + 88 * Math.cos(rad(a)) }, elev: a, straight: true };
}

function Arm({ side, move, u, active, color }) {
  const sh = SH[side];
  const p = active ? pose(move, side, u) : { hand: { x: sh.x + (side === "left" ? -6 : 6), y: sh.y + 84 }, straight: true };
  const elbow = p.front ? { x: (sh.x + p.hand.x) / 2 + (side === "left" ? -3 : 3), y: (sh.y + p.hand.y) / 2 } : elbowFor(sh, p.hand, side);
  const pts = `${sh.x},${sh.y} ${elbow.x.toFixed(1)},${elbow.y.toFixed(1)} ${p.hand.x.toFixed(1)},${p.hand.y.toFixed(1)}`;
  const trail = [];
  if (active) for (let i = 1; i <= 6; i++) { const q = pose(move, side, (u - i * 0.018 + 1) % 1).hand; trail.push(q); }
  return (
    <g opacity={active ? 1 : 0.55}>
      {active && trail.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={5 - i * 0.6} fill={color} opacity={0.32 - i * 0.045} />)}
      {active && <polyline points={pts} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity="0.22" filter="url(#md-blur)" />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={active ? 5.5 : 4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={elbow.x} cy={elbow.y} r="4" fill={color} />
      <circle cx={p.hand.x} cy={p.hand.y} r={active ? 7 : 5} fill="#fff" stroke={color} strokeWidth="3" />
      {active && p.front && p.elev > 40 && <circle cx={p.hand.x} cy={p.hand.y} r="13" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" />}
    </g>
  );
}

export default function MoveDemo({ move, caption, u: fixedU }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (fixedU != null) return undefined;
    let raf; const t0 = performance.now(); let last = 0;
    const loop = (now) => {
      if (now - last > 33) { setT(((now - t0) % PERIOD_MS) / PERIOD_MS); last = now; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fixedU]);
  const u = fixedU != null ? fixedU : t;
  const m = move || { motion: "raise", plane: "side", arm: "both", peak: 90 };
  const oneHand = m.motion === "sweep" || m.motion === "cross";
  const leftOn = oneHand ? m.arm === "left" : m.arm !== "right";
  const rightOn = oneHand ? m.arm !== "left" : m.arm !== "left";
  const lead = rightOn ? "right" : "left";
  const lp = pose(m, lead, u);
  const elev = lp.elev;
  const s = lead === "left" ? -1 : 1;
  const sh = SH[lead];

  return (
    <figure className="m-0 flex flex-col items-center">
      <svg viewBox="0 0 260 200" width="100%" style={{ maxWidth: 300 }} role="img" aria-label={caption || "Demo of the movement"}>
        <defs>
          <radialGradient id="md-bg" cx="50%" cy="38%" r="75%"><stop offset="0" stopColor="#1e293b" /><stop offset="1" stopColor="#0b1120" /></radialGradient>
          <filter id="md-blur"><feGaussianBlur stdDeviation="4" /></filter>
        </defs>
        <rect x="2" y="2" width="256" height="196" rx="16" fill="url(#md-bg)" stroke="#1e293b" strokeWidth="2" />
        <g stroke="#ffffff" strokeOpacity="0.04"><path d="M20 50H240M20 100H240M20 150H240M65 12V188M130 12V188M195 12V188" /></g>
        {/* chair */}
        <path d="M96 150 H164 M104 150 V188 M156 150 V188" stroke="#334155" strokeWidth="4" strokeLinecap="round" fill="none" />
        {/* body */}
        <g stroke={G} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <circle cx="130" cy="46" r="17" />
          <path d="M130 63 V72" />
          <path d={`M${SH.left.x} 88 H${SH.right.x}`} />
          <path d={`M${SH.left.x} 88 L112 148 H148 L${SH.right.x} 88`} strokeOpacity="0.55" />
          <path d="M112 148 L106 188 M148 148 L154 188" />
        </g>
        <circle cx={SH.left.x} cy="88" r="5" fill={G} /><circle cx={SH.right.x} cy="88" r="5" fill={G} />
        <Arm side="left" move={m} u={u} active={leftOn} color={CY} />
        <Arm side="right" move={m} u={u} active={rightOn} color={OR} />
        {/* angle arc + read-out for raising moves */}
        {typeof elev === "number" && elev > 4 && (
          <g>
            <path d={`M ${sh.x} ${sh.y + 26} A 26 26 0 ${elev > 180 ? 1 : 0} ${s === 1 ? 0 : 1} ${sh.x + s * 26 * Math.sin(rad(elev))} ${sh.y + 26 * Math.cos(rad(elev))}`} fill="none" stroke="#fde047" strokeWidth="2.5" strokeLinecap="round" />
            <text x={sh.x + s * 44} y={sh.y + 40} textAnchor="middle" fontSize="12" fontWeight="800" fill="#fde047">{Math.round(elev)}°</text>
          </g>
        )}
        {m.motion === "sweep" && <path d="M 32 150 A 98 98 0 0 1 228 150" fill="none" stroke="#94a3b8" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="4 5" />}
        {m.motion === "cross" && <path d={`M ${SH[lead].x + s * 52} 96 Q 130 70 ${130 - s * 62} 96`} fill="none" stroke="#94a3b8" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="4 5" />}
        {m.motion === "climb" && [1, 2, 3, 4, 5].map((i) => {
          const a = ((m.peak || 150) * i) / 5;
          const x = SH[lead].x + s * 30, y = SH[lead].y + 88 * Math.cos(rad(a));
          return <circle key={i} cx={x} cy={y} r="3.5" fill="#fde047" opacity="0.8" />;
        })}
        {m.motion === "raise" && m.plane === "front" && <text x="130" y="20" textAnchor="middle" fontSize="10" fontWeight="700" fill="#94a3b8" letterSpacing="1">ARMS POINT AT THE CAMERA</text>}
      </svg>
      {caption && <figcaption className="mt-2 text-center text-xs text-slate-400">{caption}</figcaption>}
    </figure>
  );
}
