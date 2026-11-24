import React from 'react';
import { Home, Layers, Trophy, History, Ticket } from 'lucide-react';

interface BottomNavDockProps {
  activeTab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY' | 'BETS';
  onSelectTab: (tab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY' | 'BETS') => void;
}

const NAV_ITEMS = [
  { id: 'FIXTURES' as const, label: 'Today', ariaLabel: 'Home and Fixtures', icon: Home },
  { id: 'ACCAS' as const, label: 'Tips', ariaLabel: 'Featured Tips', icon: Layers },
  { id: 'STANDINGS' as const, label: 'Table', ariaLabel: 'League Standings', icon: Trophy },
  { id: 'HISTORY' as const, label: 'History', ariaLabel: 'Prediction History', icon: History },
  { id: 'BETS' as const, label: 'Bets', ariaLabel: 'My Bets & Slips', icon: Ticket },
];

export const BottomNavDock: React.FC<BottomNavDockProps> = ({
  activeTab,
  onSelectTab,
}) => {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+8px)] left-2.5 right-2.5 z-40 lg:hidden bg-theme-glass border border-theme rounded-full shadow-theme-md p-1 transition-all font-sans"
    >
      <div className="max-w-md mx-auto grid grid-cols-5 gap-1 w-full">
        {NAV_ITEMS.map(({ id, label, ariaLabel, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={ariaLabel}
              className={`h-[38px] rounded-full flex flex-col items-center justify-center gap-0.5 px-1.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent active:scale-95 ${
                isActive
                  ? 'bg-theme-primary text-theme-primary-text shadow-theme-glow font-semibold'
                  : 'text-theme-sub hover:text-theme-main font-medium'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.2]' : 'stroke-[1.8]'}`} />
              <span className="text-xs leading-none tracking-[-0.005em] truncate max-w-full">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
