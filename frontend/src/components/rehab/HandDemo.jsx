// Looping hand demo for the hand games (same look as MoveDemo: green skeleton, glow trail, cyan = left, orange = right).
// move = { motion: "grip" | "finger" | "tilt" | "trace", arm: "left" | "right" }
import { useEffect, useState } from "react";
import { makeHand } from "../../utils/handModel";

const G = "#4ade80", OR = "#fb923c", CY = "#22d3ee";
const PERIOD_MS = 5200;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const between = (u, a, b) => ease((u - a) / (b - a));
const bump = (u) => (u < 0.1 ? 0 : u < 0.5 ? between(u, 0.1, 0.5) : u < 0.64 ? 1 : 1 - between(u, 0.64, 0.95));
const CHAINS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];

function stateFor(motion, u) {
  if (motion === "grip") { const k = bump(u); return { curls: [k, k, k, k, k], label: u < 0.1 ? "OPEN" : u < 0.5 ? "SQUEEZE" : u < 0.64 ? "HOLD" : "OPEN", gauge: k }; }
  if (motion === "finger") {
    const slot = Math.floor(u * 5) % 5, lu = (u * 5) % 1, k = Math.sin(Math.PI * clamp(lu * 1.25, 0, 1)) ** 0.7;
    const curls = [0, 0, 0, 0, 0]; curls[slot] = k;
    return { curls, lit: slot, label: "PRESS THE LIT FINGER" };
  }
  if (motion === "tilt") return { curls: [0, 0, 0, 0, 0], tilt: 32 * Math.sin(u * Math.PI * 2), label: u < 0.25 || u > 0.75 ? (u < 0.25 ? "TILT RIGHT" : "TILT LEFT") : u < 0.5 ? "BACK TO MIDDLE" : "TILT LEFT" };
  // trace: the hand glides along a gentle S-curve while the fingertip stays in a small ring
  return { curls: [0.9, 0, 0.9, 0.9, 0.9], dx: 26 * Math.sin(u * Math.PI * 2), dy: 10 * Math.sin(u * Math.PI * 4), label: "GLIDE, KEEP IT STEADY", trace: true };
}

export default function HandDemo({ move, caption, u: fixedU }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (fixedU != null) return undefined;
    let raf; const t0 = performance.now(); let last = 0;
    const loop = (now) => { if (now - last > 33) { setT((Math.max(0, now - t0) % PERIOD_MS) / PERIOD_MS); last = now; } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fixedU]);
  const u = fixedU != null ? fixedU : t;
  const m = move || { motion: "grip", arm: "right" };
  const left = m.arm === "left";
  const col = left ? CY : OR;
  const st = stateFor(m.motion, u);
  const asp = 1; // draw in a square unit space
  const S = 72; // palm length in svg units
  const hand = makeHand({ curls: st.curls, tiltDeg: st.tilt || 0, cx: 0, cy: 0, scale: 1, aspect: asp, thumbSide: left ? 1 : -1, spread: 0.6 });
  const wx = 130 + (st.dx || 0), wy = 182 + (st.dy || 0);
  const P = (p) => [wx + p.x * S, wy + p.y * S];
  const tip = P(hand[8]);
  const trailPts = [];
  if (st.trace) for (let i = 1; i <= 6; i++) { const uu = (u - i * 0.02 + 1) % 1; trailPts.push([130 + 26 * Math.sin(uu * Math.PI * 2) + hand[8].x * S, 182 + 10 * Math.sin(uu * Math.PI * 4) + hand[8].y * S]); }
  return (
    <figure className="m-0 flex flex-col items-center">
      <svg viewBox="0 0 260 200" width="100%" style={{ maxWidth: 300 }} role="img" aria-label={caption || "Demo of the hand movement"}>
        <defs><radialGradient id="hd-bg" cx="50%" cy="38%" r="75%"><stop offset="0" stopColor="#1e293b" /><stop offset="1" stopColor="#0b1120" /></radialGradient><filter id="hd-blur"><feGaussianBlur stdDeviation="3" /></filter></defs>
        <rect x="2" y="2" width="256" height="196" rx="16" fill="url(#hd-bg)" stroke="#1e293b" strokeWidth="2" />
        <g stroke="#ffffff" strokeOpacity="0.04"><path d="M20 50H240M20 100H240M20 150H240M65 12V188M130 12V188M195 12V188" /></g>
        {/* forearm */}
        <path d={`M${wx - 22} 200 L${wx - 14} ${wy} M${wx + 22} 200 L${wx + 14} ${wy}`} stroke="#334155" strokeWidth="4" strokeLinecap="round" fill="none" />
        {/* palm outline */}
        <polygon points={[0, 1, 5, 9, 13, 17].map((i) => P(hand[i]).join(",")).join(" ")} fill={col} fillOpacity="0.08" stroke={G} strokeOpacity="0.55" strokeWidth="3" strokeLinejoin="round" />
        {CHAINS.map((ch, fi) => {
          const lit = st.lit === fi;
          const pts = (fi === 0 ? [1, 2, 3, 4] : [ch[0], ch[1], ch[2], ch[3]]).map((i) => P(hand[i]).join(",")).join(" ");
          return (
            <g key={fi}>
              {lit && <polyline points={pts} fill="none" stroke={col} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" opacity="0.28" filter="url(#hd-blur)" />}
              <polyline points={pts} fill="none" stroke={lit ? col : G} strokeWidth={lit ? 6 : 4.5} strokeLinecap="round" strokeLinejoin="round" />
              {ch.map((i) => { const [x, y] = P(hand[i]); return <circle key={i} cx={x} cy={y} r={i === ch[3] ? 5 : 3} fill={i === ch[3] ? "#fff" : G} stroke={i === ch[3] ? col : "none"} strokeWidth="2.5" />; })}
            </g>
          );
        })}
        <circle cx={wx} cy={wy} r="5" fill={G} />
        {st.trace && trailPts.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={5 - i * 0.6} fill={col} opacity={0.3 - i * 0.04} />)}
        {st.trace && <circle cx={tip[0]} cy={tip[1]} r="15" fill="none" stroke="#fde047" strokeWidth="2.5" strokeDasharray="4 4" />}
        {m.motion === "grip" && (
          <g transform="translate(222 40)">
            <rect x="-8" y="0" width="16" height="110" rx="8" fill="#ffffff" fillOpacity="0.12" />
            <rect x="-8" y={110 - 110 * st.gauge} width="16" height={Math.max(4, 110 * st.gauge)} rx="8" fill={col} />
            <text x="0" y="-8" textAnchor="middle" fontSize="9" fontWeight="800" fill="#cbd5e1">GRIP</text>
          </g>
        )}
        {m.motion === "tilt" && (
          <g fill="none" stroke="#fde047" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
            <path d="M40 60 H22 M30 52 L22 60 L30 68" /><path d="M220 60 H238 M230 52 L238 60 L230 68" />
          </g>
        )}
        <text x="130" y="22" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fde047">{st.label}</text>
      </svg>
      {caption && <figcaption className="mt-1 text-center text-xs text-slate-400">{caption}</figcaption>}
    </figure>
  );
}
