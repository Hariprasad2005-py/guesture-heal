// Themed full-stage backdrop shared by the games (pure CSS, no canvas).
// Four looks: sky, sunset, ocean, night. Decorations float gently and never
// intercept pointer events.
import { useMemo } from "react";

export const STAGE_THEMES = [
  { id: "sky", name: "Sky", emoji: "☀️", bg: "linear-gradient(180deg,#7dd3fc 0%,#bae6fd 55%,#e0f2fe 100%)", dark: false, decor: "cloud" },
  { id: "sunset", name: "Sunset", emoji: "🌅", bg: "linear-gradient(180deg,#6d28d9 0%,#db2777 45%,#fb923c 85%,#fde68a 100%)", dark: true, decor: "cloud" },
  { id: "ocean", name: "Ocean", emoji: "🌊", bg: "linear-gradient(180deg,#67e8f9 0%,#0ea5e9 45%,#0369a1 100%)", dark: true, decor: "bubble" },
  { id: "night", name: "Night", emoji: "🌙", bg: "linear-gradient(180deg,#0b1026 0%,#1e1b4b 60%,#312e81 100%)", dark: true, decor: "star" },
];

function seeded(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export default function StageBackdrop({ theme = 0, dim = 0 }) {
  const t = STAGE_THEMES[theme % STAGE_THEMES.length];
  const items = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        left: seeded(i + 1) * 100,
        top: seeded(i + 40) * 100,
        size: 10 + seeded(i + 80) * 38,
        delay: seeded(i + 120) * 6,
        dur: 6 + seeded(i + 160) * 8,
      })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: t.bg }} aria-hidden="true">
      <style>{`
        @keyframes sb-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
        @keyframes sb-twinkle { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
      `}</style>
      {items.map((d, i) => {
        if (t.decor === "star") {
          const s = 2 + (d.size % 4);
          return (
            <span key={i} style={{ position: "absolute", left: `${d.left}%`, top: `${d.top * 0.8}%`, width: s, height: s, borderRadius: "50%", background: "#fff", animation: `sb-twinkle ${2 + d.dur / 4}s ease-in-out ${d.delay}s infinite` }} />
          );
        }
        const isCloud = t.decor === "cloud";
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: isCloud ? d.size * 3 : d.size,
              height: isCloud ? d.size * 1.1 : d.size,
              borderRadius: isCloud ? 999 : "50%",
              background: isCloud ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.18)",
              border: isCloud ? "none" : "1px solid rgba(255,255,255,.35)",
              filter: isCloud ? "blur(6px)" : "none",
              animation: `sb-float ${d.dur}s ease-in-out ${d.delay}s infinite`,
            }}
          />
        );
      })}
      {dim > 0 && <div className="absolute inset-0" style={{ background: `rgba(2,6,23,${dim})` }} />}
    </div>
  );
}
