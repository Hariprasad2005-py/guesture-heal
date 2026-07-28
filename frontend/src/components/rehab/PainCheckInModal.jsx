import React from 'react';

export function ModerateCheckInModal({ paps, onContinue, onStop }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-40 bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-slate-900 rounded-2xl border border-amber-500/40 p-6 text-center">
        <div className="text-4xl mb-3">🤔</div>
        <h3 className="text-lg font-bold text-white mb-1">Are you okay to continue?</h3>
        <p className="text-slate-400 text-sm mb-1">We noticed some signs of discomfort.</p>
        <p className="text-slate-500 text-xs mb-6">Pain signal: {paps.toFixed(1)}/10 — the game has slowed down for you.</p>
        <div className="flex gap-3">
          <button
            onClick={onStop}
            className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-white transition"
          >
            Stop Session
          </button>
          <button
            onClick={onContinue}
            className="flex-1 px-4 py-3 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold text-slate-950 transition"
          >
            I'm Okay, Continue
          </button>
        </div>
      </div>
    </div>
  );
}

export function SeverePainRestScreen({ paps, onResume, canResume }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 bg-slate-950/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-slate-900 rounded-2xl border border-red-500/50 p-6 sm:p-8 text-center">
        <div className="text-5xl mb-3">🛑</div>
        <h3 className="text-xl font-bold text-white mb-1">Let's take a rest</h3>
        <p className="text-slate-400 text-sm mb-4">
          Signs of significant discomfort were detected. Please lower your arm to a
          comfortable resting position and breathe normally.
        </p>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-6 text-xs text-red-300">
          Pain signal: {paps.toFixed(1)}/10 — this moment has been logged for your therapist to review.
        </div>
        <button
          onClick={onResume}
          disabled={!canResume}
          className="w-full px-6 py-4 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl font-bold text-white text-lg transition"
        >
          {canResume ? "I've Rested, Resume" : 'Resting… please wait'}
        </button>
      </div>
    </div>
  );
}
