import React from 'react';
import { Settings, Search, X } from 'lucide-react';
import { AppLogo } from './ui/index.js';

interface HeaderProps {
  activeTab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY' | 'BETS';
  onOpenSettings: () => void;
  searchQuery?: string;
  setSearchQuery?: (s: string) => void;
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
  searchQuery = '',
  setSearchQuery,
}) => {
  return (
    <header className="sticky top-0 z-30 h-[42px] bg-theme-glass border-b border-theme transition-colors shadow-theme-sm font-sans">
      <div className="w-full max-w-7xl h-full mx-auto px-3 sm:px-4 flex items-center justify-between gap-2">
        {/* Zone 1: Brand Title */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <AppLogo size={28} title="Apex Live Score" />
          <span className="font-bold text-base tracking-[-0.015em] text-theme-main whitespace-nowrap truncate hidden sm:inline">
            Apex Live Score
          </span>
        </div>

        {/* Zone 2: Search Input in Top Navbar */}
        <div className="flex-1 max-w-[260px] sm:max-w-[340px] mx-2">
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 w-3.5 h-3.5 text-theme-sub pointer-events-none" />
            <input
              type="text"
              placeholder="Search team (e.g. Arsenal)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery?.(e.target.value)}
              className="w-full h-[30px] pl-8 pr-7 bg-theme-card border border-theme rounded-xl text-xs text-theme-main placeholder:text-theme-dim focus:outline-none focus:ring-2 focus:ring-theme-accent transition-all shadow-theme-sm"
            />
            {searchQuery && searchQuery.length > 0 && (
              <button
                type="button"
                onClick={() => setSearchQuery?.('')}
                className="absolute right-2 w-4 h-4 rounded-full text-theme-sub hover:text-theme-main flex items-center justify-center cursor-pointer"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Zone 3: Primary Action (Settings) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-medium text-theme-sub hidden md:inline truncate max-w-[120px]">
            {TAB_TITLES[activeTab]}
          </span>
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
