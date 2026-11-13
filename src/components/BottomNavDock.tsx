import React from 'react';
import { Home, Layers, Trophy, History } from 'lucide-react';

interface BottomNavDockProps {
  activeTab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY';
  onSelectTab: (tab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY') => void;
  onOpenSettings: () => void;
  onQuickSync: () => void;
  isSyncing?: boolean;
}

const NAV_ITEMS = [
  { id: 'FIXTURES' as const, label: 'Home / Fixtures', icon: Home },
  { id: 'ACCAS' as const, label: 'Accumulators Schedule', icon: Layers },
  { id: 'STANDINGS' as const, label: 'League Standings', icon: Trophy },
  { id: 'HISTORY' as const, label: 'Prediction History', icon: History },
];

export const BottomNavDock: React.FC<BottomNavDockProps> = ({
  activeTab,
  onSelectTab,
}) => {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 w-full z-40 lg:hidden bg-theme-glass shadow-theme-md pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] px-3 transition-all"
    >
      <div className="max-w-md mx-auto flex items-center justify-around w-full">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={label}
              className={`min-h-[46px] min-w-[50px] rounded-xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent active:scale-95 ${
                isActive
                  ? 'text-theme-primary'
                  : 'text-theme-sub hover:text-theme-main'
              }`}
            >
              <Icon className="w-5 h-5 stroke-[2]" />
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-theme-primary absolute -bottom-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
