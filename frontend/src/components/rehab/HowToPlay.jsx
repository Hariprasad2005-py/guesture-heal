// Shared "how to play" block: a skeleton demo next to three short steps, with
// scoring tucked into a collapsed section. Same look in every game.
// theme: "dark" (default) | "light"
import React from "react";
import GameDemo from "./GameDemo";

export default function HowToPlay({ variant, caption, steps = [], scoring = [], trains, theme = "dark" }) {
  const light = theme === "light";
  const box = light ? "border-slate-200 bg-white" : "border-slate-800 bg-slate-900/60";
  const text = light ? "text-slate-800" : "text-slate-200";
  const accent = light ? "text-teal-600" : "text-orange-300";
  const muted = light ? "text-slate-500" : "text-slate-400";
  const head = light ? "text-slate-900" : "text-white";
  return (
    <div>
      <div className={`mb-4 grid items-center gap-6 rounded-2xl border p-5 sm:grid-cols-[240px_1fr] ${box}`}>
        <GameDemo variant={variant} caption={caption} />
        <ol className={`space-y-3 text-lg ${text}`}>
          {steps.map((s, i) => (
            <li key={i}><b className={accent}>{i + 1}.</b> {s}</li>
          ))}
        </ol>
      </div>
      {scoring.length > 0 && (
        <details className={`mb-6 rounded-xl border p-4 text-sm ${box} ${light ? "text-slate-700" : "text-slate-300"}`}>
          <summary className={`cursor-pointer font-bold ${head}`}>How scoring works</summary>
          <ul className={`mt-3 list-disc space-y-1 pl-5 ${muted}`}>
            {scoring.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
          {trains && <div className={`mt-3 ${light ? "text-slate-400" : "text-slate-500"}`}>Trains: {trains}</div>}
        </details>
      )}
    </div>
  );
}
