import React from 'react';
import { Calendar, Sparkles, Trophy, History, Ticket } from 'lucide-react';

interface BottomNavDockProps {
  activeTab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY' | 'BETS';
  onSelectTab: (tab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY' | 'BETS') => void;
}

const NAV_ITEMS = [
  { id: 'FIXTURES' as const, label: 'Today', icon: Calendar, ariaLabel: 'Home and Fixtures' },
  { id: 'ACCAS' as const, label: 'Tips', icon: Sparkles, ariaLabel: 'Featured Tips' },
  { id: 'STANDINGS' as const, label: 'Table', icon: Trophy, ariaLabel: 'League Standings' },
  { id: 'HISTORY' as const, label: 'History', icon: History, ariaLabel: 'Prediction History' },
  { id: 'BETS' as const, label: 'Bets', icon: Ticket, ariaLabel: 'My Bets & Slips' },
];

export const BottomNavDock: React.FC<BottomNavDockProps> = ({
  activeTab,
  onSelectTab,
}) => {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+10px)] left-3 right-3 z-40 lg:hidden bg-theme-card/95 backdrop-blur-md border border-theme-subdued rounded-3xl p-1.5 shadow-theme-md transition-colors font-sans"
    >
      <div className="max-w-md mx-auto grid grid-cols-5 gap-1 w-full">
        {NAV_ITEMS.map(({ id, label, icon: Icon, ariaLabel }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={ariaLabel}
              className={`h-[46px] rounded-2xl flex flex-col items-center justify-center gap-0.5 px-1 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent active:scale-95 ${
                isActive
                  ? 'bg-theme-primary text-theme-primary-text font-semibold'
                  : 'text-theme-sub hover:text-theme-main hover:bg-theme-subtle/70 font-medium'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2.25 : 1.85} />
              <span className="text-2xs leading-none tracking-[-0.005em] truncate max-w-full">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
