import React from 'react';
import { Home, Trophy, Layers, History, Settings } from 'lucide-react';

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
    <div className="fixed bottom-0 left-0 right-0 w-full z-40 lg:hidden bg-white/95 dark:bg-[#09090B]/95 backdrop-blur-xl text-slate-900 dark:text-white shadow-[0_-4px_25px_rgba(0,0,0,0.06)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.8)] pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] px-2 sm:px-4 transition-all">
      <div className="max-w-md mx-auto flex items-center justify-around w-full">
        {/* Home / Matches Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('FIXTURES')}
          className={`min-h-[44px] min-w-[54px] flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all cursor-pointer active:scale-95 ${
            activeTab === 'FIXTURES'
              ? 'bg-[#CCFF00] text-slate-950 font-black shadow-xs'
              : 'text-slate-500 hover:text-slate-950 dark:text-neutral-400 dark:hover:text-white font-bold'
          }`}
          aria-label="Home / Fixtures"
        >
          <Home className={`w-4 h-4 ${activeTab === 'FIXTURES' ? 'stroke-[2.5px] text-slate-950' : 'text-slate-500 dark:text-neutral-400'}`} />
          <span className="text-[11px] font-bold tracking-tight">Matches</span>
        </button>

        {/* Accumulators Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('ACCAS')}
          className={`min-h-[44px] min-w-[54px] flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all cursor-pointer active:scale-95 ${
            activeTab === 'ACCAS'
              ? 'bg-[#CCFF00] text-slate-950 font-black shadow-xs'
              : 'text-slate-500 hover:text-slate-950 dark:text-neutral-400 dark:hover:text-white font-bold'
          }`}
          aria-label="Accumulators Schedule"
        >
          <Layers className={`w-4 h-4 ${activeTab === 'ACCAS' ? 'stroke-[2.5px] text-slate-950' : 'text-slate-500 dark:text-neutral-400'}`} />
          <span className="text-[11px] font-bold tracking-tight">Accas</span>
        </button>

        {/* Standings Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('STANDINGS')}
          className={`min-h-[44px] min-w-[54px] flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all cursor-pointer active:scale-95 ${
            activeTab === 'STANDINGS'
              ? 'bg-[#CCFF00] text-slate-950 font-black shadow-xs'
              : 'text-slate-500 hover:text-slate-950 dark:text-neutral-400 dark:hover:text-white font-bold'
          }`}
          aria-label="League Standings"
        >
          <Trophy className={`w-4 h-4 ${activeTab === 'STANDINGS' ? 'stroke-[2.5px] text-slate-950' : 'text-slate-500 dark:text-neutral-400'}`} />
          <span className="text-[11px] font-bold tracking-tight">Tables</span>
        </button>

        {/* History Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('HISTORY')}
          className={`min-h-[44px] min-w-[54px] flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all cursor-pointer active:scale-95 ${
            activeTab === 'HISTORY'
              ? 'bg-[#CCFF00] text-slate-950 font-black shadow-xs'
              : 'text-slate-500 hover:text-slate-950 dark:text-neutral-400 dark:hover:text-white font-bold'
          }`}
          aria-label="Prediction History"
        >
          <History className={`w-4 h-4 ${activeTab === 'HISTORY' ? 'stroke-[2.5px] text-slate-950' : 'text-slate-500 dark:text-neutral-400'}`} />
          <span className="text-[11px] font-bold tracking-tight">History</span>
        </button>

        {/* Settings / Config Tab */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="min-h-[44px] min-w-[54px] flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-2xl text-slate-500 hover:text-slate-950 dark:text-neutral-400 dark:hover:text-white transition-all cursor-pointer font-bold active:scale-95"
          title="Settings"
          aria-label="Configuration Settings"
        >
          <Settings className="w-4 h-4 text-slate-500 dark:text-neutral-400" />
          <span className="text-[11px] font-bold tracking-tight">Settings</span>
        </button>
      </div>
    </div>
  );
};
