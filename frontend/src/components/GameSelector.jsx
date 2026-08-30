import React from 'react';
import {
  Target, Sword, Cloud, ShoppingBasket, Palette, Play, ChevronRight,
  Activity, Flame, TrendingUp, HeartPulse, ShieldCheck, Clock
} from 'lucide-react';

const GAMES = [
  {
    id: 'precision-reach',
    title: 'Precision Reach',
    description: 'Hold your hand on clinical targets to improve shoulder and arm reach.',
    icon: Target,
    color: 'blue',
    duration: '60 SECONDS',
    featured: true
  },
  {
    id: 'rehab-slicer',
    title: 'Rehab Slicer',
    description: 'Swipe through medical objects to improve wrist and shoulder mobility.',
    icon: Sword,
    color: 'red',
    duration: '60 SECONDS',
    featured: false
  },
  {
    id: 'cloud-reach',
    title: 'Cloud Reach',
    description: 'Reach up and pop balloons to improve arm elevation.',
    icon: Cloud,
    color: 'green',
    duration: '60 SECONDS',
    featured: false
  },
  {
    id: 'catch-flex',
    title: 'Catch & Flex',
    description: 'Move your hand to catch falling items and improve coordination.',
    icon: ShoppingBasket,
    color: 'purple',
    duration: '60 SECONDS',
    featured: false
  },
  {
    id: 'canvas-air',
    title: 'Canvas Air',
    description: 'Trace shapes with your finger to improve fine motor control.',
    icon: Palette,
    color: 'pink',
    duration: '60 SECONDS',
    featured: false
  }
];

// --- Presentation-only metadata (does not touch GAMES) ---
const DIFFICULTY = {
  'precision-reach': 'Beginner',
  'rehab-slicer': 'Intermediate',
  'cloud-reach': 'Beginner',
  'catch-flex': 'Intermediate',
  'canvas-air': 'Advanced'
};

const EXERCISE_TYPE = {
  'precision-reach': 'Shoulder & Arm',
  'rehab-slicer': 'Wrist Mobility',
  'cloud-reach': 'Arm Elevation',
  'catch-flex': 'Coordination',
  'canvas-air': 'Fine Motor'
};

// Mock today's completion progress (%) per game, used to drive the ring + stats
const TODAYS_PROGRESS = {
  'precision-reach': 100,
  'rehab-slicer': 100,
  'cloud-reach': 40,
  'catch-flex': 20,
  'canvas-air': 0
};

const COMPLETED_TODAY = Object.values(TODAYS_PROGRESS).filter(p => p === 100).length;
const TOTAL_TODAY = GAMES.length;

const DIFFICULTY_STYLES = {
  Beginner: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Intermediate: 'bg-amber-50 text-amber-700 ring-amber-200',
  Advanced: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const COLOR_STYLES = {
  blue: { icon: 'bg-blue-50 text-blue-600', ring: '#2563EB' },
  red: { icon: 'bg-red-50 text-red-600', ring: '#DC2626' },
  green: { icon: 'bg-emerald-50 text-emerald-600', ring: '#059669' },
  purple: { icon: 'bg-violet-50 text-violet-600', ring: '#7C3AED' },
  pink: { icon: 'bg-pink-50 text-pink-600', ring: '#DB2777' },
};

const ProgressRing = ({ percent, color }) => {
  const size = 44;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-600">
        {percent}%
      </span>
    </div>
  );
};

const GameCard = ({ game, onSelect }) => {
  const Icon = game.icon;
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    red: 'bg-red-100 text-red-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    pink: 'bg-pink-100 text-pink-600',
  };

  const styles = COLOR_STYLES[game.color] || COLOR_STYLES.blue;
  const difficulty = DIFFICULTY[game.id] || 'Beginner';
  const exerciseType = EXERCISE_TYPE[game.id] || 'General';
  const progress = TODAYS_PROGRESS[game.id] ?? 0;

  return (
    <div
      className={`group relative bg-white rounded-2xl p-6 shadow-sm hover:shadow-lg border ${
        game.featured ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-100'
      } flex flex-col h-full transition-all duration-300 hover:-translate-y-1`}
    >
      {game.featured && (
        <span className="absolute -top-2.5 left-6 bg-[#2563EB] text-white text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-full shadow-sm">
          RECOMMENDED
        </span>
      )}

      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClasses[game.color]}`}>
          <Icon size={24} />
        </div>
        <ProgressRing percent={progress} color={styles.ring} />
      </div>

      <h3 className="text-lg font-bold text-slate-900 mb-1.5 tracking-tight">{game.title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed mb-5 flex-grow">{game.description}</p>

      <div className="flex flex-wrap gap-1.5 mb-5">
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full ring-1 ring-inset ${DIFFICULTY_STYLES[difficulty]}`}>
          {difficulty}
        </span>
        <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-[10px] font-semibold px-2.5 py-1 rounded-full ring-1 ring-inset ring-slate-200">
          {exerciseType}
        </span>
        <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-500 text-[10px] font-semibold px-2.5 py-1 rounded-full ring-1 ring-inset ring-slate-200">
          <Clock size={10} />
          {game.duration}
        </span>
      </div>

      <button
        onClick={() => onSelect(game.id)}
        className="w-full bg-[#2563EB] text-white py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all duration-200 shadow-sm hover:shadow-md"
      >
        <Play size={16} fill="currentColor" />
        <span>Start Session</span>
        <ChevronRight size={16} className="ml-auto transition-transform duration-200 group-hover:translate-x-0.5" />
      </button>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, accent }) => (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow duration-300">
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
      <Icon size={20} />
    </div>
    <div>
      <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
      <p className="text-xs font-medium text-slate-500">{label}</p>
    </div>
  </div>
);

export default function GameSelector({ onSelectGame }) {
  // Internal default state if no prop provided
  const handleSelect = (id) => {
    if (onSelectGame) {
      onSelectGame(id);
    } else {
      console.log('Selected game:', id);
    }
  };

  const progressPercent = Math.round((COMPLETED_TODAY / TOTAL_TODAY) * 100);

  return (
    <div className="min-h-screen bg-[#F0F7FF] p-4 sm:p-8 md:p-12">
      <div className="max-w-6xl mx-auto">

        {/* Patient header */}
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2563EB] via-[#2F6FE0] to-[#14B8A6] p-6 sm:p-8 mb-8 shadow-lg shadow-blue-200/50">
          <div className="absolute inset-0 opacity-10 pointer-events-none" aria-hidden="true">
            <HeartPulse size={220} className="absolute -right-6 -top-10 text-white" />
          </div>

          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/30 flex items-center justify-center text-white font-bold text-lg shrink-0">
                AK
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1.5 bg-white/15 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full ring-1 ring-white/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    Active Session
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Welcome back, Arjun K</h1>
                <p className="text-blue-50/90 text-sm">Patient ID: GH-66399 &middot; Ready for today's therapy session</p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm ring-1 ring-white/25 rounded-2xl px-5 py-4 min-w-[220px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white text-xs font-semibold tracking-wide uppercase">Today's Progress</span>
                <span className="text-white text-sm font-bold">{COMPLETED_TODAY}/{TOTAL_TODAY}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white transition-all duration-700 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-blue-50/80 text-[11px] mt-2">{TOTAL_TODAY - COMPLETED_TODAY} exercises remaining today</p>
            </div>
          </div>
        </header>

        {/* Quick stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <StatCard icon={Activity} label="Total Sessions" value="47" accent="bg-blue-50 text-blue-600" />
          <StatCard icon={Flame} label="Current Streak" value="5 Days" accent="bg-orange-50 text-orange-600" />
          <StatCard icon={TrendingUp} label="Today's Progress" value={`${COMPLETED_TODAY}/${TOTAL_TODAY} Completed`} accent="bg-teal-50 text-teal-600" />
        </div>

        {/* Section heading */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Rehabilitation Exercises</h2>
            <p className="text-slate-500 text-sm">Select a session to begin your therapeutic exercises.</p>
          </div>
        </div>

        {/* Games grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {GAMES.map(game => (
            <GameCard key={game.id} game={game} onSelect={handleSelect} />
          ))}
        </div>

        {/* Disclaimer footer */}
        <footer className="mt-12 flex items-start gap-2.5 text-slate-400 text-xs bg-white/60 border border-slate-100 rounded-2xl px-5 py-4">
          <ShieldCheck size={16} className="shrink-0 mt-0.5" />
          <p>
            These exercises are intended to supplement, not replace, guidance from your licensed physical therapist.
            Stop immediately and consult your care team if you experience pain or discomfort.
          </p>
        </footer>
      </div>
    </div>
  );
}