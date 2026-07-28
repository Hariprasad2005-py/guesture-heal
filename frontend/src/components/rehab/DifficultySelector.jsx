import React from 'react';

const TIERS = [
  { id: 'beginner', label: 'Beginner', desc: 'Slow, large, close targets. Best for first sessions or higher pain sensitivity.' },
  { id: 'intermediate', label: 'Intermediate', desc: 'Moderate speed and distance. For patients progressing steadily.' },
  { id: 'advanced', label: 'Advanced', desc: 'Faster, farther, longer holds. For patients nearing full mobility.' },
];

export default function DifficultySelector({ onSelect, defaultTier }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 bg-slate-950/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700 p-6 sm:p-8">
        <h2 className="text-xl font-bold text-white text-center mb-1">Choose a difficulty</h2>
        <p className="text-slate-400 text-sm text-center mb-6">
          The game will still adapt automatically to your pain and posture during play.
        </p>
        <div className="space-y-3">
          {TIERS.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`w-full text-left p-4 rounded-xl border transition ${
                defaultTier === t.id
                  ? 'border-teal-500 bg-teal-500/10'
                  : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'
              }`}
            >
              <div className="font-bold text-white">{t.label}</div>
              <div className="text-xs text-slate-400 mt-1">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
