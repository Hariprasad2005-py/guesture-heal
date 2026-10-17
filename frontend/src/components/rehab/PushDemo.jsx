// A small looping animation (side view) showing what the patient has to do in
// Push Wall: both arms rise to shoulder height, the wall gets pushed away,
// arms lower. Drawn in the same green "skeleton" style as the live overlay so
// patients connect it with what they see on their camera.
const GREEN = "#34d399";
const ORANGE = "#fb923c";

export default function PushDemo({ className = "" }) {
  return (
    <figure className={`m-0 ${className}`} aria-label="Animation: raise both arms to shoulder height to push the wall">
      <style>{`
        @keyframes pd-arm { 0%,8% { transform: rotate(0deg); } 38%,58% { transform: rotate(-90deg); } 90%,100% { transform: rotate(0deg); } }
        @keyframes pd-wall { 0%,36% { transform: translateX(0); opacity: 1; } 52% { transform: translateX(34px); opacity: 0; } 53%,84% { transform: translateX(0); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
        .pd-arm { transform-origin: 80px 70px; animation: pd-arm 3.6s ease-in-out infinite; }
        .pd-wall { animation: pd-wall 3.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .pd-arm, .pd-wall { animation: none; } .pd-arm { transform: rotate(-90deg); } }
      `}</style>
      <svg viewBox="0 0 220 200" width="100%" role="img">
        {/* red danger line */}
        <line x1="150" y1="14" x2="150" y2="186" stroke="#ef4444" strokeWidth="2" strokeDasharray="5 5" opacity="0.7" />
        {/* wall of blocks */}
        <g className="pd-wall">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x="166" y={30 + i * 20} width="26" height="18" rx="3" fill="#b98a52" stroke="#0b1120" strokeOpacity="0.4" />
          ))}
        </g>
        {/* body (skeleton style) */}
        <g stroke={GREEN} strokeWidth="4" strokeLinecap="round" fill="none">
          <circle cx="80" cy="38" r="14" />
          <line x1="80" y1="52" x2="80" y2="70" />
          <line x1="80" y1="70" x2="80" y2="128" />
          <line x1="80" y1="128" x2="68" y2="182" />
          <line x1="80" y1="128" x2="94" y2="182" />
        </g>
        {/* arms: rotate around the shoulder */}
        <g className="pd-arm">
          <g stroke={ORANGE} strokeWidth="5" strokeLinecap="round" fill="none">
            <line x1="80" y1="70" x2="80" y2="106" />
            <line x1="80" y1="106" x2="80" y2="142" />
          </g>
          <circle cx="80" cy="106" r="4.5" fill={ORANGE} />
          <circle cx="80" cy="142" r="6" fill={ORANGE} stroke="#fff" strokeWidth="1.5" />
        </g>
        <circle cx="80" cy="70" r="5.5" fill={GREEN} stroke="#fff" strokeWidth="1.5" />
      </svg>
      <figcaption className="mt-1 text-center text-xs text-slate-400">Both arms up to shoulder height, then down</figcaption>
    </figure>
  );
}
