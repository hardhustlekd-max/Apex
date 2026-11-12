import React from 'react';
import { Menu, Bell } from 'lucide-react';
import { EngineSettings, ProviderStatus } from '../core/types.js';
import { LiveScore } from '../providers/types.js';

interface HeaderProps {
  settings: EngineSettings | null;
  providers: ProviderStatus[];
  stats: { totalMatches: number; totalTeams: number; leagues: any[] };
  onOpenSettings: () => void;
  onOpenTerminal?: () => void;
  onOpenSeedModal?: () => void;
  onSelectAccaCategory?: (cat: 'BANKER' | 'PROBABILITY_CHASE') => void;
  isSyncing: boolean;
  onSyncData?: () => void;
  isSyncingData?: boolean;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  liveScores: LiveScore[];
  searchQuery?: string;
  setSearchQuery?: (s: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  providers,
  stats,
  onOpenSettings,
  onOpenTerminal,
  theme,
  onToggleTheme,
  liveScores,
  searchQuery,
  setSearchQuery,
}) => {
  return (
    <header className="sticky top-0 z-30 h-12 bg-theme-card backdrop-blur-md transition-colors border-b border-theme/40">
      <div className="w-full max-w-7xl h-full mx-auto px-3 sm:px-5 flex items-center justify-between gap-3">
        {/* Left: Hamburger Menu Button */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-8 h-8 rounded-full flex items-center justify-center text-theme-main hover:bg-theme-subtle transition-all cursor-pointer active:scale-95"
            aria-label="Navigation Menu"
            title="Menu & Settings"
          >
            <Menu className="w-4.5 h-4.5 text-theme-main" />
          </button>
          
          <div className="hidden sm:flex items-center gap-2">
            <span className="font-extrabold text-sm sm:text-base tracking-tight text-theme-main">
              Apex Live Score
            </span>
          </div>
        </div>

        {/* Center: Title styled cleanly */}
        <div className="flex items-center font-bold text-sm sm:text-[15px] text-theme-main select-none">
          <span>Today's Matches</span>
        </div>

        {/* Right: Notification Bell / Quick Settings Icon */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            id="open-settings-modal-btn"
            onClick={onOpenSettings}
            className="w-8 h-8 rounded-full flex items-center justify-center text-theme-main hover:bg-theme-subtle transition-all cursor-pointer relative active:scale-95"
            title="Settings & Alerts"
            aria-label="Settings"
          >
            <Bell className="w-4 h-4 text-theme-main" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-theme-primary" />
          </button>
        </div>
      </div>
    </header>
  );
};
