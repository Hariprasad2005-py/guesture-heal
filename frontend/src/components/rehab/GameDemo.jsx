// Looping skeleton demo (front view) that shows a patient what to do.
// variant: "reach" | "slice" | "catch" | "trace" | "target"
// Pure SVG, drawn from a time value; no assets. Pass `u` (0..1) to freeze a frame (tests).
import React, { useEffect, useState } from "react";

const SHOULDER = { x: 140, y: 80 };
const L1 = 44;
const L2 = 44;
const PERIOD_MS = 4200;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const between = (u, a, b) => ease((u - a) / (b - a));

// Two-bone arm: elbow bulges downward/outward.
function elbowFor(hand) {
  const dx = hand.x - SHOULDER.x;
  const dy = hand.y - SHOULDER.y;
  const d = clamp(Math.hypot(dx, dy), 1, L1 + L2 - 0.5);
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const ux = dx / d, uy = dy / d;
  let px = -uy, py = ux;
  if (py < 0 || (py === 0 && px < 0)) { px = -px; py = -py; }
  return { x: SHOULDER.x + ux * a + px * h, y: SHOULDER.y + uy * a + py * h };
}

function frame(variant, u) {
  const rest = { x: 150, y: 148 };
  if (variant === "reach" || variant === "target") {
    const target = { x: 196, y: 26 };
    let k = 0;
    if (u < 0.1) k = 0;
    else if (u < 0.42) k = between(u, 0.1, 0.42);
    else if (u < 0.78) k = 1;
    else k = 1 - between(u, 0.78, 0.95);
    const hold = clamp((u - 0.42) / 0.3, 0, 1);
    return { hand: { x: lerp(rest.x, target.x - 4, k), y: lerp(rest.y, target.y + 6, k) }, target, hold, popped: u > 0.72 && u < 0.8 };
  }
  if (variant === "slice") {
    const start = { x: 184, y: 48 }, end = { x: 112, y: 124 };
    const k = between(u, 0.32, 0.5);
    const back = between(u, 0.72, 0.95);
    const m = k * (1 - back);
    const fall = clamp((u - 0.0) / 0.38, 0, 1);
    return { hand: { x: lerp(rest.x, start.x, between(u, 0.0, 0.3)) * (1 - m) + lerp(start.x, end.x, k) * m, y: lerp(rest.y, start.y, between(u, 0.0, 0.3)) * (1 - m) + lerp(start.y, end.y, k) * m }, k, fall, cut: u > 0.4 && u < 0.85, u };
  }
  if (variant === "catch") {
    const xs = u < 0.5 ? lerp(176, 138, between(u, 0.08, 0.38)) : lerp(138, 108, between(u, 0.58, 0.85));
    const ball1 = u < 0.5 ? { x: 138, y: lerp(14, 118, clamp((u - 0.05) / 0.4, 0, 1)) } : null;
    const ball2 = u >= 0.5 ? { x: 108, y: lerp(14, 118, clamp((u - 0.53) / 0.4, 0, 1)) } : null;
    return { hand: { x: xs, y: 96 }, basketX: xs, ball: ball1 || ball2, caught: (u > 0.45 && u < 0.62) || u > 0.93 };
  }
  // trace
  const c = { x: 172, y: 58 }, r = 20;
  const p = clamp((u - 0.1) / 0.7, 0, 1);
  const ang = -Math.PI / 2 + p * Math.PI * 2;
  const at = (a) => ({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  const startP = at(-Math.PI / 2);
  const hand = u < 0.1 ? { x: lerp(rest.x, startP.x, between(u, 0, 0.1)), y: lerp(rest.y, startP.y, between(u, 0, 0.1)) }
    : u > 0.9 ? { x: lerp(startP.x, rest.x, between(u, 0.9, 1)), y: lerp(startP.y, rest.y, between(u, 0.9, 1)) } : at(ang);
  return { hand, c, r, p, at };
}

export default function GameDemo({ variant = "reach", caption, u: fixedU }) {
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
  const f = frame(variant, u);
  const elbow = elbowFor(f.hand);
  const G = "#4ade80", O = "#fb923c";

  const lShoulder = { x: 80, y: 80 };
  const lHand = { x: 70, y: 150 };

  let extras = null;
  if (variant === "reach" || variant === "target") {
    const circ = 2 * Math.PI * 17;
    extras = (
      <g>
        <circle cx={f.target.x} cy={f.target.y} r="17" fill="#38bdf8" fillOpacity="0.18" stroke="#38bdf8" strokeOpacity="0.5" strokeWidth="2" />
        <circle cx={f.target.x} cy={f.target.y} r="17" fill="none" stroke="#fde047" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${circ * f.hold} ${circ}`} transform={`rotate(-90 ${f.target.x} ${f.target.y})`} />
        <text x={f.target.x} y={f.target.y + 6} textAnchor="middle" fontSize="18">{f.popped ? "✨" : "☁️"}</text>
      </g>
    );
  } else if (variant === "slice") {
    const fx = 150, fy = lerp(18, 82, f.fall);
    const open = f.cut ? clamp((f.u - 0.4) * 10, 0, 1) * 9 : 0;
    extras = (
      <g>
        {f.cut ? (
          <g>
            <text x={fx - open} y={fy + 8 + open * 0.6} textAnchor="middle" fontSize="22" opacity={1 - clamp((f.u - 0.4) * 2.2, 0, 1)}>🍉</text>
            <text x={fx + open} y={fy + 8 + open * 0.6} textAnchor="middle" fontSize="22" opacity={1 - clamp((f.u - 0.4) * 2.2, 0, 1)}>🍉</text>
          </g>
        ) : (
          <text x={fx} y={fy + 8} textAnchor="middle" fontSize="22">🍉</text>
        )}
        {f.k > 0 && f.k < 1 && (
          <line x1="184" y1="48" x2={f.hand.x} y2={f.hand.y} stroke="#e2e8f0" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
        )}
      </g>
    );
  } else if (variant === "catch") {
    extras = (
      <g>
        {f.ball && !f.caught && <circle cx={f.ball.x} cy={f.ball.y} r="8" fill="#22c55e" />}
        <path d={`M ${f.basketX - 18} 124 L ${f.basketX - 13} 146 L ${f.basketX + 13} 146 L ${f.basketX + 18} 124 Z`} fill="#f59e0b" fillOpacity="0.9" stroke="#fde68a" strokeWidth="2" />
        {f.caught && <text x={f.basketX} y="116" textAnchor="middle" fontSize="13" fill="#4ade80" fontWeight="bold">+10</text>}
      </g>
    );
  } else {
    const pts = [];
    const n = Math.floor(f.p * 40);
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / 40) * Math.PI * 2; const q = f.at(a); pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`); }
    extras = (
      <g>
        <circle cx={f.c.x} cy={f.c.y} r={f.r} fill="none" stroke="#94a3b8" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="4 4" />
        {pts.length > 1 && <polyline points={pts.join(" ")} fill="none" stroke={G} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
      </g>
    );
  }

  return (
    <figure className="m-0 flex flex-col items-center">
      <svg viewBox="0 0 230 175" width="100%" style={{ maxWidth: 260 }} role="img" aria-label={caption || "Demo of the movement"}>
        <rect x="2" y="2" width="226" height="171" rx="14" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
        <circle cx="110" cy="42" r="16" fill="none" stroke={G} strokeWidth="4" />
        <line x1="110" y1="58" x2="110" y2="76" stroke={G} strokeWidth="4" strokeLinecap="round" />
        <line x1={lShoulder.x} y1="80" x2={SHOULDER.x} y2="80" stroke={G} strokeWidth="4" strokeLinecap="round" />
        <line x1="110" y1="80" x2="110" y2="148" stroke={G} strokeWidth="4" strokeLinecap="round" />
        <line x1={lShoulder.x} y1="80" x2="74" y2="116" stroke={G} strokeWidth="4" strokeLinecap="round" />
        <line x1="74" y1="116" x2={lHand.x} y2={lHand.y} stroke={G} strokeWidth="4" strokeLinecap="round" />
        {extras}
        <polyline points={`${SHOULDER.x},${SHOULDER.y} ${elbow.x.toFixed(1)},${elbow.y.toFixed(1)} ${f.hand.x.toFixed(1)},${f.hand.y.toFixed(1)}`}
          fill="none" stroke={O} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={SHOULDER.x} cy={SHOULDER.y} r="5" fill={G} />
        <circle cx={elbow.x} cy={elbow.y} r="4" fill={O} />
        <circle cx={f.hand.x} cy={f.hand.y} r="6.5" fill="#fff" stroke={O} strokeWidth="3" />
      </svg>
      {caption && <figcaption className="mt-2 text-center text-xs text-slate-400">{caption}</figcaption>}
    </figure>
  );
}
