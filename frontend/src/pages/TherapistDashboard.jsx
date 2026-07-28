import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { loadSessionHistory } from '../engine/SessionLogger';



function PostureHeatCell({ severity, count }) {
  const bg = severity === 'severe'
    ? `rgba(239,68,68,${Math.min(1, 0.2 + count * 0.15)})`
    : `rgba(245,158,11,${Math.min(1, 0.2 + count * 0.15)})`;
  return (
    <div
      className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold text-white/90 border border-white/10"
      style={{ backgroundColor: count > 0 ? bg : 'rgba(255,255,255,0.03)' }}
      title={`${severity}: ${count}`}
    >
      {count > 0 ? count : ''}
    </div>
  );
}

export default function TherapistDashboard() {
  const [history] = useState(() => loadSessionHistory());
  const [selectedIdx, setSelectedIdx] = useState(history.length ? history.length - 1 : -1);

  const session = selectedIdx >= 0 ? history[selectedIdx] : null;

  const papsChartData = useMemo(() => {
    if (!session) return [];
    const t0 = session.startedAt;
    return session.papsTrend.map((p) => ({ tSec: Math.round((p.t - t0) / 1000), paps: p.score }));
  }, [session]);

  const difficultyChartData = useMemo(() => {
    if (!session) return [];
    const t0 = session.startedAt;
    return session.difficultyLog
      .filter((d) => d.field === 'speedFactor')
      .map((d) => ({ tSec: Math.round((d.t - t0) / 1000), speedFactor: d.to }));
  }, [session]);

  const postureCounts = useMemo(() => {
    if (!session) return { minor: 0, severe: 0 };
    return {
      minor: session.postureEvents.filter((e) => e.severity === 'minor').length,
      severe: session.postureEvents.filter((e) => e.severity === 'severe').length,
    };
  }, [session]);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Therapist Dashboard</h1>
        <p className="text-slate-400 text-sm mb-6">
          PAPS pain trends, posture deviations, and adaptive difficulty history per session.
        </p>

        {history.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-500">
            No sessions recorded yet. Complete a rehab game session to see data here.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 h-fit">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Sessions</h2>
              <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                {history.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedIdx(i)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${
                      i === selectedIdx ? 'border-teal-500 bg-teal-500/10' : 'border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-medium">{GAME_LABELS[s.gameId] || s.gameId}</div>
                    <div className="text-xs text-slate-500">{new Date(s.startedAt).toLocaleString()} · {s.mode}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-3 space-y-6">
              {session && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Accuracy" value={`${session.summary.accuracyPct}%`} />
                    <StatCard label="Avg PAPS" value={`${session.summary.avgPAPS}/10`} accent={session.summary.avgPAPS > 4 ? 'text-amber-400' : 'text-teal-400'} />
                    <StatCard label="Peak PAPS" value={`${session.summary.maxPAPS}/10`} accent={session.summary.maxPAPS > 6 ? 'text-red-400' : 'text-white'} />
                    <StatCard label="Therapist Alerts" value={session.summary.therapistAlertCount} accent={session.summary.therapistAlertCount > 0 ? 'text-red-400' : 'text-white'} />
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">PAPS Pain Trend</h3>
                    <div style={{ width: '100%', height: 220 }}>
                      <ResponsiveContainer>
                        <LineChart data={papsChartData}>
                          <CartesianGrid stroke="#1e293b" />
                          <XAxis dataKey="tSec" stroke="#64748b" label={{ value: 'seconds', position: 'insideBottom', offset: -4, fill: '#64748b', fontSize: 11 }} />
                          <YAxis domain={[0, 10]} stroke="#64748b" />
                          <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} />
                          <Line type="monotone" dataKey="paps" stroke="#f59e0b" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Difficulty Curve (speed factor)</h3>
                    <div style={{ width: '100%', height: 200 }}>
                      <ResponsiveContainer>
                        <LineChart data={difficultyChartData}>
                          <CartesianGrid stroke="#1e293b" />
                          <XAxis dataKey="tSec" stroke="#64748b" />
                          <YAxis stroke="#64748b" />
                          <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} />
                          <Legend />
                          <Line type="stepAfter" dataKey="speedFactor" stroke="#2dd4bf" strokeWidth={2} dot />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 text-xs text-slate-500 space-y-1 max-h-32 overflow-y-auto">
                      {session.difficultyLog.map((d, i) => (
                        <div key={i}>
                          <span className="text-slate-400">{new Date(d.t).toLocaleTimeString()}</span> — {d.field}: {d.from} → {d.to} <span className="text-slate-600">({d.reason})</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Posture Deviation Heatmap</h3>
                    <div className="flex gap-6 items-center">
                      <div className="flex flex-col items-center gap-1">
                        <PostureHeatCell severity="minor" count={postureCounts.minor} />
                        <span className="text-[10px] text-slate-500">Minor</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <PostureHeatCell severity="severe" count={postureCounts.severe} />
                        <span className="text-[10px] text-slate-500">Severe</span>
                      </div>
                      <p className="text-xs text-slate-500 flex-1">
                        {postureCounts.severe > 0
                          ? 'Severe posture deviations paused gameplay until corrected — review technique with the patient.'
                          : 'No severe posture deviations recorded this session.'}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent = 'text-white' }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}
