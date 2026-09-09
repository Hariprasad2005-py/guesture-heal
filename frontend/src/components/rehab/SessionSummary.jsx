// frontend/src/components/rehab/SessionSummary.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Target, Activity, TrendingUp, Clock, Zap, Shield, Timer } from 'lucide-react';
import MetricsChart from './MetricsChart';
import { useAppStore } from '../../store/appStore';

// Keys already surfaced as their own dedicated stat cards above (PAPS,
// Avg Response) when present. They're excluded from the generic Game
// Details key/value grid below so the same number isn't shown twice.
const KEYS_SHOWN_AS_DEDICATED_STATS = ['paps', 'avgResponseTimeSeconds', 'bestCombo', 'longestHitStreak'];

export default function SessionSummary({
  sessionData,
  onSaveReport,
  onFinish,
  gameName,
  gameId,
  patientId,
}) {
  const navigate = useNavigate();
  const { token, user } = useAppStore();
  const [saving, setSaving] = React.useState(false);

  const handleSaveAndViewReport = async () => {
    setSaving(true);
    try {
      const result = await onSaveReport?.();
      if (result && result.success === false) {
        console.error('Report save reported failure:', result.error);
      }
      const isTherapist = !!token && user?.role === 'therapist';
      if (patientId && patientId !== 'guest') {
        navigate(`/reports/patient/${patientId}`);
      } else if (isTherapist) {
        navigate('/reports');
      } else {
        navigate('/games');
      }
    } catch (err) {
      console.error('Failed to save report:', err);
    } finally {
      setSaving(false);
    }
  };

  // NOTE: every value below uses `??` (nullish coalescing), not `||`.
  // A legitimate 0 (0% accuracy, 0 reps, 0° ROM) must render as 0, not
  // silently fall through to a default because 0 is falsy.
  const paps = sessionData.gameSpecificMetrics?.paps ?? null;
  const avgResponse = sessionData.gameSpecificMetrics?.avgResponseTimeSeconds ?? null;
  const painAdjusted = sessionData.gameSpecificMetrics?.painAdjusted === true;

  const stats = [
    { icon: Trophy, label: 'Score', value: sessionData.score ?? 0, color: 'text-yellow-400' },
    { icon: Target, label: 'Accuracy', value: `${sessionData.accuracyPercent ?? 0}%`, color: 'text-blue-400' },
    { icon: Activity, label: 'Reps', value: sessionData.reps ?? 0, color: 'text-green-400' },
    { icon: TrendingUp, label: 'ROM', value: `${sessionData.romData?.averageRomDegrees ?? 0}°`, color: 'text-purple-400' },
    {
      icon: Clock,
      label: 'Duration',
      value: `${Math.floor((sessionData.durationSeconds ?? 0) / 60)}m ${(sessionData.durationSeconds ?? 0) % 60}s`,
      color: 'text-cyan-400',
    },
    // CloudReach stores this under gameSpecificMetrics.bestCombo. Other
    // games in this suite may still use `longestHitStreak` — both are
    // checked so this card works across the whole rehab-game suite.
    {
      icon: Zap,
      label: 'Best Streak',
      value: sessionData.gameSpecificMetrics?.bestCombo ?? sessionData.gameSpecificMetrics?.longestHitStreak ?? 0,
      color: 'text-orange-400',
    },
    // PAPS card — only shown when the metric is present (Precision Reach)
    ...(paps !== null
      ? [
        {
          icon: Shield,
          label: 'PAPS',
          value: paps,
          color: paps >= 75 ? 'text-emerald-400' : paps >= 50 ? 'text-amber-400' : 'text-rose-400',
        },
      ]
      : []),
    // Avg Response card — only shown when the metric is present
    ...(avgResponse !== null
      ? [
        {
          icon: Timer,
          label: 'Avg Response',
          value: `${avgResponse}s`,
          color: 'text-sky-400',
        },
      ]
      : []),
  ];

  const hasRomData = sessionData.romData?.perRep?.length > 0;

  return (
    <div className="h-screen overflow-y-auto bg-[#0B1120] p-8 text-white">      <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-black mb-2">🎯 Session Complete!</h1>
        <p className="text-slate-400">{gameName || 'Rehab Game'}</p>
      </div>

      {/* Pain-adjustment alert */}
      {painAdjusted && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-700/60 bg-amber-950/30 px-5 py-4 text-amber-300">
          <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold text-amber-200">Pain-Adjusted Score Applied</p>
            <p className="text-sm leading-relaxed text-amber-300/80">
              Facial discomfort was detected during this session. Your final PAPS score has been
              adjusted to <strong>80%</strong> of raw accuracy to reflect actual exertion capacity.
              Please rest before your next session.
            </p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-slate-900 rounded-xl p-6 border border-slate-800 text-center">
              <Icon className={`${stat.color} w-6 h-6 mx-auto mb-2`} />
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">{stat.label}</div>
            </div>
          );
        })}
      </div>

      {/* ROM Chart */}
      {hasRomData && (
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 mb-8">
          <h3 className="text-lg font-bold mb-4">Range of Motion per Rep</h3>
          <MetricsChart
            data={sessionData.romData.perRep}
            xKey="rep"
            yKey="romDegrees"
            label="ROM (°)"
            color="#22d3ee"
          />
        </div>
      )}

      {/* Game Specific Metrics */}
      {sessionData.gameSpecificMetrics && (
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 mb-8">
          <h3 className="text-lg font-bold mb-4">Game Details</h3>
          <div className="grid grid-cols-2 gap-4">
            {/*
                CloudReach nests non-primitive objects in gameSpecificMetrics
                (scoreBreakdown, fullMetrics) for use elsewhere (e.g. the
                clinical report). Rendering those directly as JSX text
                produced "[object Object]". This grid now only shows
                primitive (string/number/boolean) values; nested objects
                are simply skipped here rather than rendered badly.

                Keys already shown above as their own dedicated stat card
                (PAPS, Avg Response) are also skipped here so the same
                number isn't duplicated in both places.
              */}
            {Object.entries(sessionData.gameSpecificMetrics)
              .filter(([, value]) => value === null || typeof value !== 'object')
              .filter(([key]) => !KEYS_SHOWN_AS_DEDICATED_STATS.includes(key))
              .map(([key, value]) => (
                <div key={key} className="flex justify-between py-2 border-b border-slate-800 last:border-0">
                  <span className="text-slate-400 text-sm capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <span className="font-medium">
                    {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (value ?? '—')}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={handleSaveAndViewReport}
          disabled={saving}
          className="flex-1 bg-cyan-500 text-white px-8 py-4 rounded-xl font-bold hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 transition-all"
        >
          {saving ? 'Saving...' : '📊 Save & View Report'}
        </button>
        <button
          onClick={onFinish}
          className="flex-1 bg-slate-800 text-white px-8 py-4 rounded-xl font-bold hover:bg-slate-700 transition-all"
        >
          🏠 Back to Games
        </button>
      </div>
    </div>
    </div>
  );
}