// Short "Level N" toast shown for a couple of seconds when the level changes.
export default function LevelBanner({ text, visible }) {
  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-16 z-40 -translate-x-1/2 transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
      }`}
      role="status"
    >
      <div className="rounded-full border border-white/40 bg-slate-900/85 px-6 py-2 text-base font-black text-white shadow-xl backdrop-blur">
        ⭐ {text}
      </div>
    </div>
  );
}
