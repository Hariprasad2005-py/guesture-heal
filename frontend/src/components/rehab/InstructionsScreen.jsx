import React from 'react';

export default function InstructionsScreen({
  icon = '🎯',
  title,
  startingPosture,
  armPosition,
  movement,
  successCondition,
  therapyBenefit,
  onContinue,
  continueLabel = 'Continue to Difficulty',
}) {
  const rows = [
    { label: 'Starting posture', value: startingPosture },
    { label: 'Arm position', value: armPosition },
    { label: 'Movement required', value: movement },
    { label: 'Success condition', value: successCondition },
    { label: 'Therapy benefit', value: therapyBenefit },
  ];

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 bg-slate-950/95 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-700 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center gap-2 mb-6">
          <div className="text-5xl">{icon}</div>
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          <p className="text-slate-400 text-sm">Read carefully before you begin.</p>
        </div>

        <div className="space-y-3 mb-6">
          {rows.map((r) => (
            <div key={r.label} className="bg-slate-800/70 rounded-xl p-3 border border-slate-700">
              <div className="text-xs font-bold text-teal-400 uppercase tracking-wider mb-1">{r.label}</div>
              <div className="text-sm text-slate-200">{r.value}</div>
            </div>
          ))}
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-6 text-xs text-amber-300">
          If you feel any pain or discomfort at any point, the session will pause automatically.
          You can also stop at any time.
        </div>

        <button
          onClick={onContinue}
          className="w-full px-6 py-4 bg-teal-600 hover:bg-teal-500 rounded-xl font-bold text-white text-lg transition shadow-lg shadow-teal-600/30"
        >
          {continueLabel}
        </button>
      </div>
    </div>
  );
}
