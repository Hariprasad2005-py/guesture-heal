// src/pages/GameSelectPage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { Target, Sword, ShoppingBasket, Palette, Play, ChevronRight } from 'lucide-react';

const GAMES = [
  {
    id: 'precision-reach',
    name: 'Precision Reach',
    description: 'Raise your arm to launch a rocket higher and improve shoulder reach.',
    icon: Target,
    bg: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    id: 'rehab-slicer',
    name: 'Rehab Slicer',
    description: 'Slice falling items one at a time to build wrist and elbow motion.',
    icon: Sword,
    bg: 'bg-pink-50',
    text: 'text-pink-600',
  },
  {
    id: 'catch-flex',
    name: 'Catch & Flex',
    description: 'Move your hand to steer the basket and catch falling fruit.',
    icon: ShoppingBasket,
    bg: 'bg-purple-50',
    text: 'text-purple-600',
  },
  {
    id: 'canvas-air',
    name: 'Canvas Air',
    description: 'Trace shapes with your fingertip to improve fine motor control.',
    icon: Palette,
    bg: 'bg-rose-50',
    text: 'text-rose-600',
  },
];

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

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10">
          <h1 className="text-4xl font-black text-slate-900 mb-2">Rehab Games</h1>
          <p className="text-slate-500 text-lg">Choose a game to start your physical therapy session.</p>
          {currentPatient && (
            <p className="text-sm text-teal-600 mt-2">
              Patient: {currentPatient.name} ({currentPatient.patientId})
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {GAMES.map((game) => {
            const Icon = game.icon;
            return (
              <div
                key={game.id}
                className="group relative bg-white rounded-3xl p-8 border-2 border-slate-100 shadow-sm hover:shadow-xl hover:border-teal-500/30 transition-all duration-300 cursor-pointer"
                onClick={() => handleStartGame(game.id)}
              >
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${game.bg} ${game.text} group-hover:scale-110 transition-transform`}>
                  <Icon size={32} />
                </div>

                <h3 className="text-2xl font-bold text-slate-900 mb-3">{game.name}</h3>
                <p className="text-slate-500 mb-8 line-clamp-2 leading-relaxed">{game.description}</p>

                <div className="flex flex-wrap gap-2 mb-6">
                  <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold uppercase">60 seconds</span>
                  <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold uppercase">Hand tracking</span>
                </div>

                <button className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors group-hover:shadow-lg">
                  <Play size={18} fill="currentColor" />
                  Start Session
                  <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}