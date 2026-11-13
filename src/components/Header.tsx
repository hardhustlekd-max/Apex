import React from 'react';
import { Settings } from 'lucide-react';
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
  onOpenSettings,
}) => {
  return (
    <header className="sticky top-0 z-30 h-12 bg-theme-glass transition-colors shadow-theme-sm">
      <div className="w-full max-w-7xl h-full mx-auto px-3 sm:px-5 flex items-center justify-between gap-3">
        {/* Zone 1: Brand Title */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-theme-primary text-theme-primary-text flex items-center justify-center font-black text-xs shrink-0 shadow-theme-glow">
            A
          </div>
          <span className="font-extrabold text-sm sm:text-base tracking-tight text-theme-main whitespace-nowrap truncate">
            Apex Live Score
          </span>
        </div>

        {/* Zone 2: Center Context Title */}
        <div className="hidden sm:flex items-center font-bold text-sm sm:text-[15px] text-theme-main select-none whitespace-nowrap">
          <span>Today&apos;s Matches</span>
        </div>

        {/* Zone 3: Primary Action (Settings) */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            id="open-settings-modal-btn"
            type="button"
            onClick={onOpenSettings}
            className="w-9 h-9 rounded-full flex items-center justify-center text-theme-main hover:bg-theme-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent transition-all cursor-pointer active:scale-95"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5 text-theme-main" />
          </button>
        </div>
      </div>
    </header>
  );
};
