// src/pages/GameSelectPage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { 
  Target, Sword, ShoppingBasket, Palette, Cloud, Play, ChevronRight, 
  Settings, Zap, Heart, Activity, Move, Brain, Clock, Hand, Waves,
  TrendingUp, Shield, Eye, Star,
  Flame, CheckCircle2
} from 'lucide-react';
import { GAME_IDS, GAME_DISPLAY_NAMES, GAME_DESCRIPTIONS, GAME_COLORS } from '../constants/games';

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
  const { currentPatient, token } = useAppStore();

  const handleStartGame = (gameId) => {
    const patientId = currentPatient?.patientId || currentPatient?._id;
    if (!patientId && !token) {
      navigate('/patient');
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
              <h1 className="text-2xl md:text-3xl font-black text-[#1E293B]">Welcome back, Arjun K</h1>
              <p className="text-slate-500 text-sm mt-1">Patient ID: GH-66399</p>
              {currentPatient && (
                <p className="text-sm text-[#0EA5E9] mt-1 font-medium">
                  👤 {currentPatient.name} ({currentPatient.patientId})
                </p>
              )}
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
              <p className="text-xl font-bold text-[#1E293B] leading-tight">—</p>
              <p className="text-xs font-medium text-slate-500">Today's Progress · Not tracked yet</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-[#E8F0FE] shadow-sm flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
              <Flame size={20} />
            </div>
            <div>
              <p className="text-xl font-bold text-[#1E293B] leading-tight">—</p>
              <p className="text-xs font-medium text-slate-500">Session Streak · Not tracked yet</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-[#E8F0FE] shadow-sm flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
              <Star size={20} />
            </div>
            <div>
              <p className="text-xl font-bold text-[#1E293B] leading-tight">—</p>
              <p className="text-xs font-medium text-slate-500">Total Score · Not tracked yet</p>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xl md:text-2xl font-black text-[#1E293B]">Therapeutic Exercises</h2>
          <p className="text-slate-500">Select your therapy session to begin.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {GAMES.map((game, i) => {
            const Icon = game.icon;
            const isRecommended = game.id === GAME_IDS.PRECISION_REACH;
            const difficulty = DIFFICULTY[game.id] || 'Easy';
            const accent = ACCENT_COLOR[game.id] || '#2563EB';

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

                  {/* Progress indicator: hidden until real session data exists */}
                  <div className="mb-6">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                      Not started today
                    </span>
                  </div>

                  <button className="w-full py-4 bg-[#2563EB] text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-[0.98] transition-all duration-300 group-hover:shadow-lg">
                    <Play size={18} fill="currentColor" />
                    Begin Exercise
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
          <p className="text-slate-500 text-sm mb-5">Not tracked yet &middot; ask your care team to set up a recovery plan.</p>
          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden mb-2">
            <div className="h-full rounded-full bg-slate-200" style={{ width: '0%' }} />
          </div>
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span className="flex items-center gap-1.5">
              <TrendingUp size={13} className="text-slate-300" />
              No data yet
            </span>
          </div>
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
    </div>
  );
}