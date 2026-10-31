import React from 'react';
import { Menu } from 'lucide-react';
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
    <header className="sticky top-0 z-30 h-14 bg-white/90 dark:bg-[#09090B]/90 backdrop-blur-xl transition-colors shadow-xs">
      <div className="w-full max-w-7xl h-full mx-auto px-3.5 sm:px-5 lg:px-6 flex items-center justify-between gap-3">
        {/* Left: Brand */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-[#CCFF00] text-slate-950 flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
            A
          </div>
          <div className="hidden sm:flex flex-col min-w-0">
            <span className="font-extrabold text-base tracking-tight text-slate-950 dark:text-white truncate">
              Apex AI Predictions
            </span>
            <span className="text-xs text-slate-500 dark:text-neutral-400 font-semibold leading-tight truncate">
              Football Analytics Engine
            </span>
          </div>
        </div>

        {/* Center: Header Title */}
        <div className="flex items-center font-black text-sm sm:text-base tracking-widest text-slate-900 dark:text-white uppercase select-none">
          <span>Live Scores</span>
        </div>

        {/* Right: Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="open-settings-modal-btn"
            onClick={onOpenSettings}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-slate-100 dark:bg-[#18181D] text-slate-800 dark:text-neutral-200 hover:bg-[#CCFF00] hover:text-slate-950 dark:hover:bg-[#CCFF00] dark:hover:text-slate-950 transition-all cursor-pointer text-xs sm:text-sm font-extrabold shadow-xs active:scale-95"
            title="Settings & Preferences"
            aria-label="Settings"
          >
            <Menu className="w-4.5 h-4.5" />
            <span className="hidden md:inline">Settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};

