// "Which arm do you want to use?" three-way control shared by the games.
// value: "both" | "left" | "right"
export default function ArmPicker({ value, onChange, dark = true, hint = true }) {
  const opts = [
    ["both", "Both arms"],
    ["left", "Left arm only"],
    ["right", "Right arm only"],
  ];
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which arm to use">
        {opts.map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
              value === v
                ? "border-cyan-400 bg-cyan-500 text-white"
                : dark
                ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {hint && (
        <p className={`mt-1.5 text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>
          Pick one arm if you only use one. With both arms the game tells you which hand to use.
        </p>
      )}
    </div>
  );
}
