import React from 'react';
import { Target, Sword, Cloud, ShoppingBasket, Palette, Play, ChevronRight } from 'lucide-react';

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

const GameCard = ({ game, onSelect }) => {
  const Icon = game.icon;
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    red: 'bg-red-100 text-red-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    pink: 'bg-pink-100 text-pink-600',
  };

  return (
    <div className={`bg-white rounded-3xl p-6 shadow-sm border-2 ${game.featured ? 'border-teal-400' : 'border-transparent'} flex flex-col h-full`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${colorClasses[game.color]}`}>
        <Icon size={24} />
      </div>
      
      <h3 className="text-xl font-bold text-slate-900 mb-2">{game.title}</h3>
      <p className="text-slate-500 text-sm mb-6 flex-grow">{game.description}</p>
      
      <div className="flex gap-2 mb-6">
        <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-3 py-1 rounded-full">{game.duration}</span>
        <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-3 py-1 rounded-full">HAND TRACKING</span>
      </div>
      
      <button 
        onClick={() => onSelect(game.id)}
        className="w-full bg-[#0F172A] text-white py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-medium hover:bg-slate-800 transition-colors"
      >
        <Play size={16} fill="currentColor" />
        <span>Start Session</span>
        <ChevronRight size={16} className="ml-auto" />
      </button>
    </div>
  );
};

export default function GameSelector({ onSelectGame }) {
  // Internal default state if no prop provided
  const handleSelect = (id) => {
    if (onSelectGame) {
      onSelectGame(id);
    } else {
      console.log('Selected game:', id);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8 md:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Rehabilitation Games</h1>
          <p className="text-slate-500">Select a session to begin your therapeutic exercises.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {GAMES.map(game => (
            <GameCard key={game.id} game={game} onSelect={handleSelect} />
          ))}
        </div>
      </div>
    </div>
  );
}
