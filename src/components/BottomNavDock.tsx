import React from 'react';
import { Home, Trophy, Layers, Settings, Play, RefreshCw, Zap } from 'lucide-react';

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
    <div className="fixed bottom-3.5 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-[420px] bg-white/95 dark:bg-[#101728]/95 backdrop-blur-2xl rounded-full p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.7)] flex items-center justify-between px-3 sm:px-4 transition-all">
      {/* Home / Matches Tab */}
      <button
        type="button"
        onClick={() => onSelectTab('FIXTURES')}
        className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-full transition-all cursor-pointer ${
          activeTab === 'FIXTURES'
            ? 'text-slate-900 dark:text-[#A3FF12] font-black'
            : 'text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
        }`}
      >
        <Home className={`w-4.5 h-4.5 ${activeTab === 'FIXTURES' ? 'stroke-[2.5px] text-slate-900 dark:text-[#A3FF12]' : ''}`} />
        <span className="text-[9.5px] uppercase tracking-wider font-extrabold">Matches</span>
      </button>

      {/* Accumulators Tab */}
      <button
        type="button"
        onClick={() => onSelectTab('ACCAS')}
        className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-full transition-all cursor-pointer ${
          activeTab === 'ACCAS'
            ? 'text-slate-900 dark:text-[#A3FF12] font-black'
            : 'text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
        }`}
      >
        <Layers className={`w-4.5 h-4.5 ${activeTab === 'ACCAS' ? 'stroke-[2.5px] text-slate-900 dark:text-[#A3FF12]' : ''}`} />
        <span className="text-[9.5px] uppercase tracking-wider font-extrabold">Accas</span>
      </button>

      {/* Center Floating Action Button (Electric Lime #A3FF12) */}
      <div className="relative -top-4 shrink-0">
        <button
          type="button"
          onClick={onQuickSync}
          disabled={isSyncing}
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#A3FF12] text-slate-950 font-black flex items-center justify-center shadow-[0_4px_18px_rgba(163,255,18,0.4)] hover:shadow-[0_6px_24px_rgba(163,255,18,0.55)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
          title="Trigger Fast Resync"
        >
          {isSyncing ? (
            <RefreshCw className="w-4.5 h-4.5 animate-spin text-slate-950" />
          ) : (
            <Play className="w-4.5 h-4.5 fill-slate-950 ml-0.5 text-slate-950" />
          )}
        </button>
      </div>

      {/* Standings Tab */}
      <button
        type="button"
        onClick={() => onSelectTab('STANDINGS')}
        className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-full transition-all cursor-pointer ${
          activeTab === 'STANDINGS'
            ? 'text-slate-900 dark:text-[#A3FF12] font-black'
            : 'text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
        }`}
      >
        <Trophy className={`w-4.5 h-4.5 ${activeTab === 'STANDINGS' ? 'stroke-[2.5px] text-slate-900 dark:text-[#A3FF12]' : ''}`} />
        <span className="text-[9.5px] uppercase tracking-wider font-extrabold">Table</span>
      </button>

      {/* Settings / Profile Tab */}
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-all cursor-pointer font-medium"
      >
        <Settings className="w-4.5 h-4.5" />
        <span className="text-[9.5px] uppercase tracking-wider font-extrabold">Config</span>
      </button>
    </div>
  );
};
