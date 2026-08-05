
import React from 'react';

export default function SessionCompleteCard({ title = 'Session Complete!', gameStats = [], clinicalSummary }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 bg-slate-950/90 backdrop-blur-sm animate-in fade-in duration-500 p-4">
      <div className="w-full max-w-md flex flex-col items-center gap-4 text-center p-6 sm:p-8 bg-slate-900 rounded-2xl border border-teal-500/30">
        <div className="text-5xl">??</div>
        <h2 className="text-2xl font-bold text-white">{title}</h2>

        <div className="grid grid-cols-2 gap-3 w-full">
          {gameStats.map((s) => (
            <div key={s.label} className="bg-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">{s.label}</div>
              <div className={`text-2xl font-bold ${s.color || 'text-amber-400'}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {clinicalSummary && (
          <div className="w-full bg-slate-800/60 border border-slate-700 rounded-xl p-4 text-left mt-2">
            <div className="text-xs font-bold text-teal-400 uppercase tracking-wider mb-2">Clinical Summary</div>
            <dl className="grid grid-cols-2 gap-y-1 text-xs text-slate-300">
              <dt className="text-slate-500">Avg pain (PAPS)</dt>
              <dd>{clinicalSummary.avgPAPS} / 10</dd>
              <dt className="text-slate-500">Peak pain (PAPS)</dt>
              <dd>{clinicalSummary.maxPAPS} / 10</dd>
              <dt className="text-slate-500">Posture flags</dt>
              <dd>{clinicalSummary.severePostureEvents} severe  {clinicalSummary.minorPostureEvents} minor</dd>
              <dt className="text-slate-500">Difficulty changes</dt>
              <dd>{clinicalSummary.difficultyChangeCount}</dd>
              {clinicalSummary.therapistAlertCount > 0 && (
                <>
                  <dt className="text-red-400">Therapist alerts</dt>
                  <dd className="text-red-400">{clinicalSummary.therapistAlertCount}</dd>
                </>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}


