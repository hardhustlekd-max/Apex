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
  onSelectAccaCategory?: (cat: 'BANKER' | 'VALUE_HUNTER') => void;
  onProviderChange: (providerId: EngineSettings['activeProvider']) => void;
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
    <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-[#0E0F14]/95 backdrop-blur-md transition-colors border-b border-[#ECEEF2] dark:border-[#20232D]">
      <div className="w-full max-w-7xl h-full mx-auto px-4 sm:px-6 flex items-center justify-between gap-3">
        {/* Left: Hamburger Menu Button aligned with reference */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-800 dark:text-neutral-200 hover:bg-slate-100 dark:hover:bg-[#1A1C24] transition-all cursor-pointer active:scale-95"
            aria-label="Navigation Menu"
            title="Menu & Settings"
          >
            <Menu className="w-5 h-5 text-slate-800 dark:text-neutral-200" />
          </button>
          
          <div className="hidden sm:flex items-center gap-2">
            <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white">
              Apex Live Score
            </span>
          </div>
        </div>

        {/* Center: Title styled cleanly as in reference ("Home" / "Today's Matches") */}
        <div className="flex items-center font-bold text-base text-slate-900 dark:text-white select-none">
          <span>Today's Matches</span>
        </div>

        {/* Right: Notification Bell / Quick Settings Icon as in reference */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            id="open-settings-modal-btn"
            onClick={onOpenSettings}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-800 dark:text-neutral-200 hover:bg-slate-100 dark:hover:bg-[#1A1C24] transition-all cursor-pointer relative active:scale-95"
            title="Settings & Alerts"
            aria-label="Settings"
          >
            <Bell className="w-4.5 h-4.5 text-slate-700 dark:text-neutral-200" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#FF001F]" />
          </button>
        </div>
      </div>
    </header>
  );
};
