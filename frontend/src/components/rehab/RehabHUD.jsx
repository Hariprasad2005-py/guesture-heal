
import React from 'react';

const PAPS_COLOR = (paps) => (paps > 6 ? 'text-red-400' : paps > 3 ? 'text-amber-400' : 'text-teal-400');
const POSTURE_BADGE = {
  ok: { color: 'bg-teal-500/20 border-teal-500/30 text-teal-400', label: '? Posture Good' },
  minor: { color: 'bg-amber-500/20 border-amber-500/30 text-amber-400', label: '? Adjust Posture' },
  severe: { color: 'bg-red-500/20 border-red-500/30 text-red-400 animate-pulse', label: '? Fix Posture Now' },
};

export function RehabTopStats({ stats }) {
  return (
    <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-10 gap-2 flex-wrap">
      {stats.map((s) => (
        <div key={s.label} className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 text-center border border-white/10 min-w-[76px]">
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{s.label}</div>
          <div className={`text-2xl sm:text-3xl font-bold ${s.color || 'text-white'}`}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

export function ClinicalStatusBar({ paps, postureStatus, handDetected, handLabel = 'Hand Detected' }) {
  const posture = POSTURE_BADGE[postureStatus] || POSTURE_BADGE.ok;
  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-none z-10 flex flex-col items-center gap-2">
      <div className="flex gap-2 flex-wrap justify-center">
        <div className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border bg-slate-800/80 border-slate-700 text-slate-300">
          PAPS <span className={PAPS_COLOR(paps)}>{paps.toFixed(1)}</span>/10
        </div>
        <div className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border ${posture.color}`}>
          {posture.label}
        </div>
        <div className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
          handDetected
            ? 'bg-teal-500/20 border-teal-500/30 text-teal-400'
            : 'bg-red-500/20 border-red-500/30 text-red-400 animate-pulse'
        }`}>
          {handDetected ? `?? ${handLabel}` : '?? Not Detected'}
        </div>
      </div>
    </div>
  );
}

export function PostureCorrectionBanner({ cue }) {
  if (!cue) return null;
  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 bg-red-500/90 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg text-sm animate-pulse">
      ?? {cue}
    </div>
  );
}


