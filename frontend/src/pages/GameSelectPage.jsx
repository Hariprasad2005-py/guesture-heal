// src/pages/GameSelectPage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { 
  Target, Sword, ShoppingBasket, Palette, Cloud, Play, ChevronRight, 
  Settings, Zap, Heart, Activity, Move, Brain, Clock, Hand, Waves,
  TrendingUp, Shield, Eye, Star,
  Flame, CheckCircle2, X, PartyPopper, Trophy
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { GAME_IDS, GAME_TYPE_MAP, GAME_DISPLAY_NAMES, GAME_DESCRIPTIONS, GAME_COLORS } from '../constants/games';
import { patientPublicApi } from '../utils/apiService';

// Normalizes an exerciseId/name from rehabPlan (hyphenated, underscored, or
// display-name form) to the canonical GAME_IDS value used by this page.
// Normalizes an exerciseId from rehabPlan to the canonical GAME_IDS value.
// Backend stores underscored form (e.g. 'cloud_reach'); this also tolerates
// hyphenated or display-name variants if that ever changes upstream.
function normalizeToGameId(raw) {
  if (!raw) return null;
  const val = String(raw).trim();

  const byType = Object.entries(GAME_TYPE_MAP).find(([, type]) => type === val);
  if (byType) return byType[0];

  if (Object.values(GAME_IDS).includes(val)) return val;

  const byName = Object.entries(GAME_DISPLAY_NAMES).find(
    ([, name]) => name.toLowerCase() === val.toLowerCase()
  );
  if (byName) return byName[0];

  return null;
}

const GAME_ICON_MAP = {
  [GAME_IDS.PRECISION_REACH]: Target,
  [GAME_IDS.REHAB_SLICER]: Sword,
  [GAME_IDS.CATCH_FLEX]: ShoppingBasket,
  [GAME_IDS.CANVAS_AIR]: Palette,
  [GAME_IDS.CLOUD_REACH]: Cloud,
};

// --- Presentation-only metadata (does not touch game data/constants) ---
const EXERCISE_TAG = {
  [GAME_IDS.PRECISION_REACH]: 'Shoulder',
  [GAME_IDS.REHAB_SLICER]: 'Wrist',
  [GAME_IDS.CLOUD_REACH]: 'Range of Motion',
  [GAME_IDS.CATCH_FLEX]: 'Coordination',
  [GAME_IDS.CANVAS_AIR]: 'Fine Motor',
};

const DIFFICULTY = {
  [GAME_IDS.PRECISION_REACH]: 'Easy',
  [GAME_IDS.REHAB_SLICER]: 'Medium',
  [GAME_IDS.CLOUD_REACH]: 'Easy',
  [GAME_IDS.CATCH_FLEX]: 'Medium',
  [GAME_IDS.CANVAS_AIR]: 'Medium',
};

const DIFFICULTY_DOT = { Easy: 'bg-emerald-500', Medium: 'bg-amber-500' };

const ACCENT_COLOR = {
  [GAME_IDS.PRECISION_REACH]: '#2563EB',
  [GAME_IDS.REHAB_SLICER]: '#EF4444',
  [GAME_IDS.CLOUD_REACH]: '#10B981',
  [GAME_IDS.CATCH_FLEX]: '#8B5CF6',
  [GAME_IDS.CANVAS_AIR]: '#EC4899',
};

const GAMES = [
  {
    id: GAME_IDS.PRECISION_REACH,
    name: GAME_DISPLAY_NAMES[GAME_IDS.PRECISION_REACH],
    description: GAME_DESCRIPTIONS[GAME_IDS.PRECISION_REACH],
    icon: GAME_ICON_MAP[GAME_IDS.PRECISION_REACH],
    ...GAME_COLORS[GAME_IDS.PRECISION_REACH],
  },
  {
    id: GAME_IDS.REHAB_SLICER,
    name: GAME_DISPLAY_NAMES[GAME_IDS.REHAB_SLICER],
    description: GAME_DESCRIPTIONS[GAME_IDS.REHAB_SLICER],
    icon: GAME_ICON_MAP[GAME_IDS.REHAB_SLICER],
    ...GAME_COLORS[GAME_IDS.REHAB_SLICER],
  },
  {
    id: GAME_IDS.CATCH_FLEX,
    name: GAME_DISPLAY_NAMES[GAME_IDS.CATCH_FLEX],
    description: GAME_DESCRIPTIONS[GAME_IDS.CATCH_FLEX],
    icon: GAME_ICON_MAP[GAME_IDS.CATCH_FLEX],
    ...GAME_COLORS[GAME_IDS.CATCH_FLEX],
  },
  {
    id: GAME_IDS.CANVAS_AIR,
    name: GAME_DISPLAY_NAMES[GAME_IDS.CANVAS_AIR],
    description: GAME_DESCRIPTIONS[GAME_IDS.CANVAS_AIR],
    icon: GAME_ICON_MAP[GAME_IDS.CANVAS_AIR],
    ...GAME_COLORS[GAME_IDS.CANVAS_AIR],
  },
  {
    id: GAME_IDS.CLOUD_REACH,
    name: GAME_DISPLAY_NAMES[GAME_IDS.CLOUD_REACH],
    description: GAME_DESCRIPTIONS[GAME_IDS.CLOUD_REACH],
    icon: GAME_ICON_MAP[GAME_IDS.CLOUD_REACH],
    ...GAME_COLORS[GAME_IDS.CLOUD_REACH],
  },
];

// Local keyframes for staggered fade-in — scoped via a plain <style> tag so it
// works regardless of the host app's Tailwind config.
const FadeInStyles = () => (
  <style>{`
    @keyframes rehabFadeInUp {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .rehab-fade-in {
      opacity: 0;
      animation: rehabFadeInUp 0.5s ease forwards;
    }
  `}</style>
);

export default function GameSelectPage() {
  const navigate = useNavigate();
  const { currentPatient, publicPatientId, token, setCurrentPatient } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [completionNotice, setCompletionNotice] = useState(null);

  // TEST MODE — activated by appending ?test=1 to the URL.
  // When true, the daily-completion popup is bypassed for this page only.
  // Production users never set this param, so nothing changes for them.
  const isTestMode = new URLSearchParams(window.location.search).get('test') === '1';

  // Sync fix: currentPatient can be empty on this page (direct nav, refresh,
  // new tab) even though we still know who the patient is via publicPatientId.
  // Re-fetch instead of silently rendering with no data, mirroring how
  // PatientPublicDashboard loads on mount.
  //
  // Always refetch (not just when currentPatient is missing): this page is
  // also the one the patient lands back on right after finishing a game.
  // The cached currentPatient in the store still reflects pre-session
  // state (exercise/day completion, currentDay), so without a fresh fetch
  // here the "already completed today" / "day completed" checks below
  // would be working off stale data. Runs once on mount.
  useEffect(() => {
    if (publicPatientId) {
      setLoading(true);
      patientPublicApi.getById(publicPatientId)
        .then((data) => {
          if (data?.patient) setCurrentPatient(data.patient);
        })
        .catch((err) => console.error('Failed to reload patient on /games:', err))
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicPatientId]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading your session...</div>;
  }

  // Sync fix: today's plan drives which games show and their completion state,
  // matching PatientPublicDashboard's day.isCompleted / day.exercises logic.
  const todaysPlan = currentPatient?.rehabPlan?.find(
    (d) => d.day === currentPatient?.currentDay
  );
  const todaysExerciseIds = new Set(
    (todaysPlan?.exercises || [])
      .map((ex) => normalizeToGameId(ex.exerciseId ?? ex.name))
      .filter(Boolean)
  );
  const isDayCompleted = !!todaysPlan?.isCompleted;
  const matchedGames = GAMES.filter((g) => todaysExerciseIds.has(g.id));
  const gamesForToday = matchedGames.length > 0 ? matchedGames : GAMES;

  // gameId -> whether today's plan entry for that specific exercise is
  // already marked complete. Keyed the same way todaysExerciseIds is
  // built, so it stays correct regardless of exerciseId/gameType/name
  // variance upstream.
  const completedGameIds = new Set(
    (todaysPlan?.exercises || [])
      .filter((ex) => ex.isCompleted)
      .map((ex) => normalizeToGameId(ex.exerciseId ?? ex.gameType ?? ex.name))
      .filter(Boolean)
  );

  const handleStartGame = (gameId) => {
    const patientId = currentPatient?.patientId || currentPatient?._id;
    if (!patientId && !token) {
      navigate('/patient');
      return;
    }

    // TEST MODE: skip daily-completion restrictions entirely and pass
    // isTestMode through the URL so GameEngine can forward it to the game.
    if (isTestMode) {
      navigate(`/game/${gameId}?test=1`);
      return;
    }

    // Whole day already finished — don't let them re-enter through any
    // card; today's plan is done regardless of which game they tap.
    if (isDayCompleted) {
      setCompletionNotice('day');
      return;
    }

    // This specific exercise is already done today, even though the day
    // as a whole isn't (other games in today's plan are still pending).
    if (completedGameIds.has(gameId)) {
      setCompletionNotice('exercise');
      return;
    }

    navigate(`/game/${gameId}`);
  };

  const todaysDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-[#F0F7FF] p-6 md:p-8">
      <FadeInStyles />
      <div className="max-w-7xl mx-auto">
        {/* Patient header banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#DCEBFF] via-[#EEF6FF] to-white border border-[#E8F0FE] p-6 md:p-8 mb-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full ring-1 ring-inset ring-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Ready for Therapy
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-400 text-xs font-medium">
                  <Clock size={12} />
                  {todaysDate}
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-[#1E293B]">
                Welcome back{currentPatient?.name ? `, ${currentPatient.name.split(' ')[0]}` : ''}
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                {currentPatient?.patientId
                  ? `Patient ID: ${currentPatient.patientId}`
                  : 'No patient selected'}
              </p>
            </div>

            <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center text-[#2563EB] shadow-sm shrink-0 self-start lg:self-center">
              <Heart size={26} />
            </div>
          </div>
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-white rounded-2xl p-5 border border-[#E8F0FE] shadow-sm flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-xl font-bold text-[#1E293B] leading-tight">
                {currentPatient?.currentDay ? `Day ${currentPatient.currentDay}/${currentPatient.rehabPlan?.length || 7}` : '—'}
              </p>
              <p className="text-xs font-medium text-slate-500">
                Today's Progress{currentPatient?.currentDay ? '' : ' · Not tracked yet'}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-[#E8F0FE] shadow-sm flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
              <Flame size={20} />
            </div>
            <div>
              <p className="text-xl font-bold text-[#1E293B] leading-tight">
                {currentPatient?.totalSessions ?? '—'}
              </p>
              <p className="text-xs font-medium text-slate-500">
                Sessions Completed{currentPatient?.totalSessions ? '' : ' · Not tracked yet'}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-[#E8F0FE] shadow-sm flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
              <Star size={20} />
            </div>
            <div>
              <p className="text-xl font-bold text-[#1E293B] leading-tight">
                {currentPatient?.totalScore ?? '—'}
              </p>
              <p className="text-xs font-medium text-slate-500">
                Total Score{currentPatient?.totalScore ? '' : ' · Not tracked yet'}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xl md:text-2xl font-black text-[#1E293B]">Therapeutic Exercises</h2>
          <p className="text-slate-500">Select your therapy session to begin.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gamesForToday.map((game, i) => {
            const Icon = game.icon;
            const isRecommended = game.id === GAME_IDS.PRECISION_REACH;
            const difficulty = DIFFICULTY[game.id] || 'Easy';
            const accent = ACCENT_COLOR[game.id] || '#2563EB';
            // A card is "done" either because this specific exercise is
            // complete, or (redundantly, but harmless) the whole day is.
            const isGameCompletedToday = isDayCompleted || completedGameIds.has(game.id);

            return (
              <div
                key={game.id}
                className="rehab-fade-in group relative bg-white rounded-3xl border border-[#E8F0FE] shadow-sm hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 cursor-pointer overflow-hidden"
                style={{ animationDelay: `${i * 80}ms` }}
                onClick={() => handleStartGame(game.id)}
              >
                {/* Accent strip */}
                <span
                  className="absolute left-0 top-0 bottom-0 w-1.5"
                  style={{ backgroundColor: accent }}
                  aria-hidden="true"
                />

                <div className="p-8 pl-9">
                  {isRecommended && (
                    <div className="mb-3 inline-flex w-fit bg-gradient-to-r from-[#2563EB] to-[#0EA5E9] text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-sm items-center gap-1">
                      <Star size={12} fill="currentColor" />
                      Therapist Recommended
                    </div>
                  )}

                  <div className="flex items-start justify-between mb-6">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${game.bg} ${game.text} group-hover:scale-110 transition-transform`}>
                      <Icon size={32} />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <span className={`w-2 h-2 rounded-full ${DIFFICULTY_DOT[difficulty]}`} />
                      {difficulty}
                    </div>
                  </div>

                  <h3 className="text-2xl font-bold text-[#1E293B] mb-2">{game.name}</h3>
                  <p className="text-slate-500 mb-4 leading-relaxed">{game.description}</p>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-3 py-1 bg-[#F0F7FF] text-[#2563EB] rounded-full text-xs font-bold uppercase">
                      {EXERCISE_TAG[game.id]}
                    </span>
                    <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold uppercase">60 seconds</span>
                    <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold uppercase">Hand tracking</span>
                  </div>

                  {/* Progress indicator: driven by today's rehabPlan entry */}
                  <div className="mb-6">
                    {isGameCompletedToday ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">
                        <CheckCircle2 size={12} /> Completed today
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                        Not started today
                      </span>
                    )}
                  </div>

                  <button className="w-full py-4 bg-[#2563EB] text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-[0.98] transition-all duration-300 group-hover:shadow-lg">
                    <Play size={18} fill="currentColor" />
                    {isGameCompletedToday ? 'Practice Again' : 'Begin Exercise'}
                    <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recovery journey */}
        <div className="mt-12 bg-white rounded-3xl border border-[#E8F0FE] shadow-sm p-6 md:p-8">
          <h3 className="text-lg font-bold text-[#1E293B] mb-1 flex items-center gap-2">
            <span aria-hidden="true">⚕️</span> Your Recovery Journey
          </h3>
          {(() => {
            const totalDays = currentPatient?.rehabPlan?.length || 7;
            const completedDays =
              currentPatient?.rehabPlan?.filter((d) => d.isCompleted).length ?? 0;
            const hasPlan = !!currentPatient?.rehabPlan?.length;
            const pct = hasPlan ? Math.round((completedDays / totalDays) * 100) : 0;

            return (
              <>
                <p className="text-slate-500 text-sm mb-5">
                  {hasPlan
                    ? `${completedDays} of ${totalDays} days completed`
                    : 'Not tracked yet · ask your care team to set up a recovery plan.'}
                </p>
                <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full bg-teal-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <TrendingUp size={13} className="text-slate-300" />
                    {hasPlan ? `${pct}% complete` : 'No data yet'}
                  </span>
                </div>
              </>
            );
          })()}
        </div>

        {/* Medical disclaimer footer */}
        <footer className="mt-8 flex items-start gap-2.5 text-slate-400 text-xs bg-white/60 border border-[#E8F0FE] rounded-2xl px-5 py-4">
          <Shield size={16} className="shrink-0 mt-0.5" />
          <p>
            These exercises are intended to supplement, not replace, guidance from your licensed physical therapist.
            Stop immediately and consult your care team if you experience pain or discomfort.
          </p>
        </footer>
      </div>

      {/* Already-completed notice */}
      {completionNotice && (
        <div
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4 z-50"
          onClick={() => setCompletionNotice(null)}
        >
          <div
            className="relative bg-white rounded-3xl p-14 md:p-20 max-w-3xl w-full text-center shadow-2xl overflow-hidden animate-[rehabFadeInUp_0.4s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Decorative background glow */}
            <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-emerald-100/60 blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-blue-100/50 blur-3xl" aria-hidden="true" />

            <button
              className="absolute top-7 right-7 w-12 h-12 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors z-10"
              onClick={() => setCompletionNotice(null)}
              aria-label="Close"
            >
              <X size={26} />
            </button>

            {/* Celebratory icon cluster */}
            <div className="relative w-40 h-40 mx-auto mb-10">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-2xl shadow-emerald-200" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Trophy size={76} className="text-white drop-shadow-sm" strokeWidth={1.6} />
              </div>
              <PartyPopper size={38} className="absolute -top-2 -left-5 text-amber-400 rotate-[-20deg]" />
              <Star size={30} className="absolute -bottom-1 -right-3 text-blue-400 fill-blue-400" />
              <Star size={18} className="absolute top-3 -right-6 text-emerald-400 fill-emerald-400" />
            </div>

            <h3 className="relative text-4xl md:text-5xl font-black text-slate-800 mb-5 leading-tight tracking-tight">
              {completionNotice === 'day' ? "You're all done for today!" : 'Already completed today'}
            </h3>

            <p className="relative text-slate-500 text-xl leading-relaxed mb-12 max-w-lg mx-auto">
              {completionNotice === 'day'
                ? "You've finished every exercise in today's plan. Come back tomorrow for your next session."
                : "You've already completed this exercise today. You can practice it again, or come back tomorrow."}
            </p>

            <button
              className="relative w-full py-6 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-2xl font-bold text-xl hover:from-blue-700 hover:to-blue-600 active:scale-[0.98] transition-all duration-200 shadow-xl shadow-blue-200"
              onClick={() => setCompletionNotice(null)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}