import React from 'react';
import { Home, Search, Layers, Trophy, History } from 'lucide-react';

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
    <div className="fixed bottom-0 left-0 right-0 w-full z-40 lg:hidden bg-theme-card/95 backdrop-blur-xl border-t border-theme pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] px-3 transition-all">
      <div className="max-w-md mx-auto flex items-center justify-around w-full">
        {/* Home / Matches Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('FIXTURES')}
          className={`min-h-[46px] min-w-[50px] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer relative ${
            activeTab === 'FIXTURES'
              ? 'text-theme-primary'
              : 'text-theme-sub hover:text-theme-main'
          }`}
          aria-label="Home / Fixtures"
        >
          <Home className="w-5 h-5 stroke-[2]" />
          {activeTab === 'FIXTURES' && (
            <span className="w-1.5 h-1.5 rounded-full bg-theme-primary absolute -bottom-0.5" />
          )}
        </button>

        {/* Accumulators Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('ACCAS')}
          className={`min-h-[46px] min-w-[50px] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer relative ${
            activeTab === 'ACCAS'
              ? 'text-theme-primary'
              : 'text-theme-sub hover:text-theme-main'
          }`}
          aria-label="Accumulators Schedule"
        >
          <Layers className="w-5 h-5 stroke-[2]" />
          {activeTab === 'ACCAS' && (
            <span className="w-1.5 h-1.5 rounded-full bg-theme-primary absolute -bottom-0.5" />
          )}
        </button>

        {/* Standings Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('STANDINGS')}
          className={`min-h-[46px] min-w-[50px] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer relative ${
            activeTab === 'STANDINGS'
              ? 'text-theme-primary'
              : 'text-theme-sub hover:text-theme-main'
          }`}
          aria-label="League Standings"
        >
          <Trophy className="w-5 h-5 stroke-[2]" />
          {activeTab === 'STANDINGS' && (
            <span className="w-1.5 h-1.5 rounded-full bg-theme-primary absolute -bottom-0.5" />
          )}
        </button>

        {/* History Tab */}
        <button
          type="button"
          onClick={() => onSelectTab('HISTORY')}
          className={`min-h-[46px] min-w-[50px] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer relative ${
            activeTab === 'HISTORY'
              ? 'text-theme-primary'
              : 'text-theme-sub hover:text-theme-main'
          }`}
          aria-label="Prediction History"
        >
          <History className="w-5 h-5 stroke-[2]" />
          {activeTab === 'HISTORY' && (
            <span className="w-1.5 h-1.5 rounded-full bg-theme-primary absolute -bottom-0.5" />
          )}
        </button>
      </div>
    </div>
  );
};
