// Two popups for playing the same game again, in the same style as the other
// rehab popups (dark card, amber border, two clear buttons).
import React from "react";

function Shell({ tone, children }) {
  const border = tone === "red" ? "border-red-500/40" : "border-amber-500/40";
  return (
    <div role="dialog" aria-modal="true" className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className={`w-full max-w-sm rounded-2xl border ${border} bg-slate-900 p-6 text-center`}>{children}</div>
    </div>
  );
}

// "Do you really want to play again?"
export function ConfirmReplayModal({ gameName, playedToday, attemptNumber, maxAttempts, onYes, onNo }) {
  return (
    <Shell tone="amber">
      <div className="mb-3 text-4xl">🔁</div>
      <h3 className="mb-1 text-lg font-bold text-white">Play {gameName} again?</h3>
      <p className="mb-1 text-sm text-slate-400">
        You have already played it {playedToday} time{playedToday === 1 ? "" : "s"} today.
      </p>
      <p className="mb-6 text-xs text-slate-500">
        This would be attempt {attemptNumber} of {maxAttempts}. Only continue if your arm feels comfortable. Each attempt is saved in your report.
      </p>
      <div className="flex gap-3">
        <button onClick={onNo} className="flex-1 rounded-xl bg-slate-800 px-4 py-3 font-bold text-white transition hover:bg-slate-700">
          Not now
        </button>
        <button onClick={onYes} className="flex-1 rounded-xl bg-amber-500 px-4 py-3 font-bold text-slate-950 transition hover:bg-amber-400">
          Yes, play again
        </button>
      </div>
    </Shell>
  );
}

// "You are done for today with this game."
export function DoneForTodayModal({ gameName, maxAttempts, onBack, onReports }) {
  return (
    <Shell tone="red">
      <div className="mb-3 text-5xl">🌙</div>
      <h3 className="mb-1 text-xl font-bold text-white">You are done with {gameName} for today</h3>
      <p className="mb-4 text-sm text-slate-400">
        You have played it {maxAttempts} times today, which is the limit. Resting is part of recovery. Try another game, or come back tomorrow.
      </p>
      <div className="flex gap-3">
        {onReports && (
          <button onClick={onReports} className="flex-1 rounded-xl bg-slate-800 px-4 py-3 font-bold text-white transition hover:bg-slate-700">
            My reports
          </button>
        )}
        <button onClick={onBack} className="flex-1 rounded-xl bg-teal-600 px-4 py-3 font-bold text-white transition hover:bg-teal-500">
          Choose another game
        </button>
      </div>
    </Shell>
  );
}
