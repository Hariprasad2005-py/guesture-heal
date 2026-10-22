// One signature look per game, so no two games feel the same.
// Each mixes dark and light areas on purpose.
//   InkBackdrop        Rehab Slicer     cream paper + black ink sun + ink-wash hills
//   OrchardBackdrop    Catch & Flex     warm dusk sky over dark green orchard hills
//   BlueprintBackdrop  Precision Reach  blueprint blue with white measuring lines
//   StudioBackdrop     Canvas Air       dark studio with a soft spotlight on the paper
import { useMemo } from "react";

const rnd = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Each level shifts the colours of the same scene, so the game looks new as
// you move up. Level 0 is the original look, untouched.
export const LEVEL_LOOKS = [
  { hue: 0, sat: 1, bright: 1 },
  { hue: 40, sat: 1.1, bright: 1 },
  { hue: -45, sat: 1.15, bright: 0.97 },
  { hue: 95, sat: 1.2, bright: 0.94 },
  { hue: -100, sat: 1.25, bright: 0.92 },
  { hue: 150, sat: 1.25, bright: 0.9 },
  { hue: -150, sat: 1.3, bright: 0.88 },
  { hue: 200, sat: 1.3, bright: 0.86 },
  { hue: 250, sat: 1.3, bright: 0.85 },
  { hue: -250, sat: 1.3, bright: 0.84 },
];
const Fill = ({ children, style, level = 0 }) => {
  const look = LEVEL_LOOKS[Math.max(0, Math.min(LEVEL_LOOKS.length - 1, level))];
  const filter = level > 0 ? `hue-rotate(${look.hue}deg) saturate(${look.sat}) brightness(${look.bright})` : undefined;
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ ...style, filter, transition: "filter 1.2s ease" }}
      aria-hidden="true"
    >
      {children}
    </div>
  );
};

export function InkBackdrop({ level = 0 }) {
  return (
    <Fill level={level} style={{ background: "linear-gradient(180deg,#f6eddc 0%,#efe3c9 60%,#e4d4b4 100%)" }}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="ink-grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" /><feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0 0.2  0 0 0 0.35 0" /></filter>
          <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6eddc" stopOpacity="0" /><stop offset="1" stopColor="#f6eddc" stopOpacity="0.85" /></linearGradient>
        </defs>
        {/* big black ink sun */}
        <circle cx="770" cy="170" r="105" fill="#1c1a21" />
        <circle cx="770" cy="170" r="125" fill="none" stroke="#1c1a21" strokeOpacity="0.15" strokeWidth="2" />
        {/* far ink-wash ridges */}
        <path d="M0 470 C120 410 220 450 330 405 C450 355 540 430 650 395 C770 357 880 420 1000 380 L1000 600 L0 600Z" fill="#8d8a93" opacity="0.55" />
        <path d="M0 520 C130 470 260 520 380 485 C520 445 640 510 780 470 C880 442 950 480 1000 465 L1000 600 L0 600Z" fill="#4b4954" opacity="0.85" />
        <rect x="0" y="430" width="1000" height="120" fill="url(#mist)" opacity="0.6" />
        <path d="M0 560 C150 530 300 565 470 540 C650 515 820 560 1000 535 L1000 600 L0 600Z" fill="#1c1a21" />
        {/* bamboo stalks, dark on the right edge and faint on the left */}
        {[40, 78, 118].map((x, i) => (
          <g key={x} opacity={0.5 - i * 0.12}>
            <rect x={x} y="0" width="9" height="600" fill="#2a2830" />
            {[90, 210, 330, 450].map((y) => <rect key={y} x={x - 2} y={y} width="13" height="5" fill="#16151b" />)}
          </g>
        ))}
        {[930, 962].map((x, i) => (
          <g key={x} opacity={0.75 - i * 0.2}>
            <rect x={x} y="0" width="11" height="600" fill="#1c1a21" />
            {[70, 190, 310, 430].map((y) => <rect key={y} x={x - 2} y={y} width="15" height="6" fill="#0f0e13" />)}
          </g>
        ))}
        {/* paper grain */}
        <rect width="1000" height="600" filter="url(#ink-grain)" opacity="0.5" />
      </svg>
    </Fill>
  );
}

export function OrchardBackdrop({ level = 0 }) {
  const flies = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({ l: rnd(i + 3) * 100, t: 45 + rnd(i + 30) * 45, d: 2 + rnd(i + 60) * 4, dl: rnd(i + 90) * 5 })),
    []
  );
  return (
    <Fill level={level} style={{ background: "linear-gradient(180deg,#fff1d6 0%,#fbd0a0 28%,#f2956b 52%,#8c4a5a 70%,#2a3a4a 100%)" }}>
      <style>{`@keyframes orch-fly { 0%,100% { opacity:.2; transform: translateY(0) } 50% { opacity:1; transform: translateY(-10px) } }`}</style>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
        <defs><radialGradient id="orch-sun"><stop offset="0" stopColor="#fff7e0" /><stop offset="0.5" stopColor="#ffd9a0" stopOpacity="0.7" /><stop offset="1" stopColor="#ffd9a0" stopOpacity="0" /></radialGradient></defs>
        <circle cx="300" cy="360" r="210" fill="url(#orch-sun)" />
        <circle cx="300" cy="360" r="58" fill="#fff4d6" />
        <path d="M0 420 C150 380 300 430 470 395 C650 360 820 420 1000 385 L1000 600 L0 600Z" fill="#3d6b55" />
        <path d="M0 470 C180 430 330 485 520 450 C700 418 860 470 1000 440 L1000 600 L0 600Z" fill="#285041" />
        <path d="M0 530 C200 500 380 545 560 520 C760 495 900 535 1000 515 L1000 600 L0 600Z" fill="#183626" />
        {/* trees on the dark hills */}
        {[90, 240, 640, 780, 900].map((x, i) => (
          <g key={x} transform={`translate(${x} ${470 + (i % 2) * 22})`}>
            <rect x="-4" y="0" width="8" height="40" fill="#10261a" />
            <circle cx="0" cy="-10" r={30 + (i % 3) * 6} fill="#1c4331" />
            <circle cx="-14" cy="-26" r="6" fill="#ef4444" /><circle cx="12" cy="-18" r="6" fill="#f59e0b" /><circle cx="2" cy="-36" r="6" fill="#ef4444" />
          </g>
        ))}
      </svg>
      {flies.map((f, i) => (
        <span key={i} style={{ position: "absolute", left: `${f.l}%`, top: `${f.t}%`, width: 5, height: 5, borderRadius: "50%", background: "#fde68a", boxShadow: "0 0 10px 3px rgba(253,230,138,.8)", animation: `orch-fly ${f.d}s ease-in-out ${f.dl}s infinite` }} />
      ))}
    </Fill>
  );
}

export function BlueprintBackdrop({ homeX = 50, homeY = 50, level = 0 }) {
  return (
    <Fill level={level} style={{ background: "radial-gradient(ellipse at 50% 50%, #1b4a80 0%, #123a69 55%, #0b2a50 100%)" }}>
      <div className="absolute inset-0" style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)",
        backgroundSize: "24px 24px, 24px 24px, 120px 120px, 120px 120px",
      }} />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {[18, 29, 39].map((r) => (
          <ellipse key={r} cx={homeX} cy={homeY} rx={r * 0.62} ry={r} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={homeX} y1="0" x2={homeX} y2="100" stroke="rgba(255,255,255,.25)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1={homeY} x2="100" y2={homeY} stroke="rgba(255,255,255,.25)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* light paper title block, like a drawing sheet */}
      <div className="absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-sm border-2 border-white/70 bg-[#f4f1e8] px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#123a69] sm:block">
        Reach plan · sheet 1
      </div>
      {[["left-3 top-3", "border-l-2 border-t-2"], ["right-3 top-3", "border-r-2 border-t-2"], ["left-3 bottom-3", "border-l-2 border-b-2"], ["right-3 bottom-3", "border-r-2 border-b-2"]].map(([pos, b]) => (
        <span key={pos} className={`absolute h-5 w-5 border-white/70 ${pos} ${b}`} />
      ))}
    </Fill>
  );
}

export function StudioBackdrop() {
  return (
    <Fill style={{ background: "linear-gradient(180deg,#23272e 0%,#1a1d23 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 48% 70% at 50% 52%, rgba(45,212,191,.28) 0%, rgba(45,212,191,.08) 45%, transparent 75%)" }} />
      <div className="absolute inset-0" style={{ opacity: 0.06, backgroundImage: "repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 14px)" }} />
      {/* easel-style warm strip under the paper */}
      <div className="absolute inset-x-0 bottom-0 h-16" style={{ background: "linear-gradient(180deg, transparent, rgba(245,158,11,.14))" }} />
    </Fill>
  );
}
