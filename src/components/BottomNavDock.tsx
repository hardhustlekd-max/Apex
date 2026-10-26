import React from 'react';
import { Home, Trophy, Layers, Settings } from 'lucide-react';

interface BottomNavDockProps {
  activeTab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY';
  onSelectTab: (tab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY') => void;
  onOpenSettings: () => void;
  onQuickSync: () => void;
  isSyncing?: boolean;
}

export const BottomNavDock: React.FC<BottomNavDockProps> = ({
  activeTab,
  onSelectTab,
  onOpenSettings,
  onQuickSync,
  isSyncing,
}) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 w-full z-40 bg-[#09090B]/95 backdrop-blur-xl border-t border-[#27272A] text-white shadow-[0_-8px_30px_rgba(0,0,0,0.8)] pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] px-2.5 sm:px-5 transition-all">
      <div className="max-w-4xl mx-auto flex items-center justify-around sm:justify-center sm:gap-8 w-full">
        {/* Home / Matches Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('FIXTURES')}
          className={`min-h-[38px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-full transition-all cursor-pointer active:scale-95 ${
            activeTab === 'FIXTURES'
              ? 'bg-[#CCFF00] text-slate-950 font-black shadow-md'
              : 'text-neutral-400 hover:text-white font-bold'
          }`}
          aria-label="Home / Fixtures"
        >
          <Home className={`w-3.5 h-3.5 ${activeTab === 'FIXTURES' ? 'stroke-[2.5px] text-slate-950' : ''}`} />
          <span className="text-[10.5px] tracking-tight">Home</span>
        </button>

        {/* Accumulators Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('ACCAS')}
          className={`min-h-[38px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-full transition-all cursor-pointer active:scale-95 ${
            activeTab === 'ACCAS'
              ? 'bg-[#CCFF00] text-slate-950 font-black shadow-md'
              : 'text-neutral-400 hover:text-white font-bold'
          }`}
          aria-label="Accumulators Schedule"
        >
          <Layers className={`w-3.5 h-3.5 ${activeTab === 'ACCAS' ? 'stroke-[2.5px] text-slate-950' : ''}`} />
          <span className="text-[10.5px] tracking-tight">Schedule</span>
        </button>

        {/* Standings Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('STANDINGS')}
          className={`min-h-[38px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-full transition-all cursor-pointer active:scale-95 ${
            activeTab === 'STANDINGS'
              ? 'bg-[#CCFF00] text-slate-950 font-black shadow-md'
              : 'text-neutral-400 hover:text-white font-bold'
          }`}
          aria-label="League Standings"
        >
          <Trophy className={`w-3.5 h-3.5 ${activeTab === 'STANDINGS' ? 'stroke-[2.5px] text-slate-950' : ''}`} />
          <span className="text-[10.5px] tracking-tight">Bar</span>
        </button>

        {/* Settings / Config Tab */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="min-h-[38px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-neutral-400 hover:text-white transition-all cursor-pointer font-bold active:scale-95"
          title="Settings"
          aria-label="Configuration Settings"
        >
          <Settings className="w-3.5 h-3.5" />
          <span className="text-[10.5px] tracking-tight hidden sm:inline">Config</span>
        </button>
      </div>
    </div>
  );
};
