import React from 'react';
import { Settings } from 'lucide-react';

interface HeaderProps {
  activeTab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY' | 'BETS';
  onOpenSettings: () => void;
}

const TAB_TITLES: Record<HeaderProps['activeTab'], string> = {
  FIXTURES: "Today's Matches",
  ACCAS: 'Featured Tips',
  STANDINGS: 'Standings Table',
  HISTORY: 'Prediction History',
  BETS: 'My Bet Slips',
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onOpenSettings,
}) => {
  return (
    <header className="sticky top-0 z-30 h-[36px] bg-theme-glass border-b border-theme transition-colors shadow-theme-sm font-sans">
      <div className="w-full max-w-7xl h-full mx-auto px-3 sm:px-4 flex items-center justify-between gap-2.5">
        {/* Zone 1: Brand Title */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-[22px] h-[22px] rounded-lg bg-theme-primary text-theme-primary-text flex items-center justify-center font-bold text-sm shrink-0 shadow-theme-glow">
            A
          </div>
          <span className="font-bold text-lg tracking-[-0.015em] text-theme-main whitespace-nowrap truncate">
            Apex Live Score
          </span>
        </div>

        {/* Zone 2: Center Context Title */}
        <div className="hidden sm:flex items-center font-medium text-base text-theme-sub select-none whitespace-nowrap">
          <span>{TAB_TITLES[activeTab]}</span>
        </div>

        {/* Zone 3: Primary Action (Settings) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            id="open-settings-modal-btn"
            type="button"
            onClick={onOpenSettings}
            className="w-[30px] h-[30px] rounded-full hover:bg-theme-subtle flex items-center justify-center text-theme-sub hover:text-theme-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent transition-colors cursor-pointer active:scale-95"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
