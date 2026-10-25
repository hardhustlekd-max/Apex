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
    <div className="fixed bottom-0 left-0 right-0 w-full z-40 bg-[#121212] dark:bg-[#121212] border-t border-neutral-800 text-white shadow-[0_-8px_30px_rgba(0,0,0,0.7)] pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] px-3 sm:px-6 transition-all">
      <div className="max-w-5xl mx-auto flex items-center justify-around sm:justify-center sm:gap-10 w-full">
        {/* Home / Matches Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('FIXTURES')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full transition-all cursor-pointer ${
            activeTab === 'FIXTURES'
              ? 'bg-[#CCFF00] text-slate-950 font-black shadow-md'
              : 'text-neutral-400 hover:text-white font-bold'
          }`}
        >
          <Home className={`w-4 h-4 ${activeTab === 'FIXTURES' ? 'stroke-[2.5px] text-slate-950' : ''}`} />
          <span className="text-xs tracking-tight">Home</span>
        </button>

        {/* Accumulators Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('ACCAS')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full transition-all cursor-pointer ${
            activeTab === 'ACCAS'
              ? 'bg-[#CCFF00] text-slate-950 font-black shadow-md'
              : 'text-neutral-400 hover:text-white font-bold'
          }`}
        >
          <Layers className={`w-4 h-4 ${activeTab === 'ACCAS' ? 'stroke-[2.5px] text-slate-950' : ''}`} />
          <span className="text-xs tracking-tight">Schedule</span>
        </button>



        {/* Standings Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('STANDINGS')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full transition-all cursor-pointer ${
            activeTab === 'STANDINGS'
              ? 'bg-[#CCFF00] text-slate-950 font-black shadow-md'
              : 'text-neutral-400 hover:text-white font-bold'
          }`}
        >
          <Trophy className={`w-4 h-4 ${activeTab === 'STANDINGS' ? 'stroke-[2.5px] text-slate-950' : ''}`} />
          <span className="text-xs tracking-tight">Bar</span>
        </button>

        {/* Settings / Config Tab */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full text-neutral-400 hover:text-white transition-all cursor-pointer font-bold"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
          <span className="text-xs tracking-tight hidden sm:inline">Config</span>
        </button>
      </div>
    </div>
  );
};
