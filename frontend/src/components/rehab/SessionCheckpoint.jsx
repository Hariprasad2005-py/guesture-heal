// Shared "How are you feeling?" prompt shown shortly before a session ends.
// The patient decides: add time, carry on, or finish now.
// Usage in any game:  <SessionCheckpoint {...engine.checkpoint} />
import React from "react";

export default function SessionCheckpoint({ open, secondsLeft, extendSeconds = 30, onExtend, onContinue, onFinish }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How are you feeling?"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 text-center text-white shadow-2xl">
        <h2 className="mb-1 text-2xl font-black">Nice work! How are you feeling?</h2>
        <p className="mb-5 text-sm text-slate-400">
          {secondsLeft} seconds left. You choose what happens next.
        </p>
        <div className="space-y-3">
          <button
            type="button"
            onClick={onExtend}
            className="w-full rounded-2xl bg-emerald-500 px-4 py-4 text-lg font-bold text-slate-950 hover:bg-emerald-400"
          >
            😊 I feel good: add {extendSeconds} sec
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="w-full rounded-2xl bg-slate-700 px-4 py-4 text-lg font-bold hover:bg-slate-600"
          >
            😐 I'm okay: finish as planned
          </button>
          <button
            type="button"
            onClick={onFinish}
            className="w-full rounded-2xl bg-rose-500/90 px-4 py-4 text-lg font-bold hover:bg-rose-500"
          >
            😣 I'm tired: finish now
          </button>
        </div>
      </div>
    </div>
  );
}
