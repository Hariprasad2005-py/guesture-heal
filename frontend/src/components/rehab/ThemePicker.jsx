import { STAGE_THEMES } from "./StageBackdrop";
export default function ThemePicker({ value, onChange, dark = true }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Game look">
      {STAGE_THEMES.map((t, i) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={value === i}
          onClick={() => onChange(i)}
          className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
            value === i
              ? "border-cyan-400 bg-cyan-500 text-white"
              : dark
              ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {t.emoji} {t.name}
        </button>
      ))}
    </div>
  );
}
