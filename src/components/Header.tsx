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
    <header className="sticky top-0 z-30 h-11 bg-white/90 dark:bg-[#09090B]/90 backdrop-blur-xl transition-colors border-b border-slate-200/80 dark:border-[#27272A]">
      <div className="max-w-[920px] w-full h-full mx-auto px-2.5 sm:px-3.5 lg:px-5 flex items-center justify-between gap-2.5">
        {/* Left: Brand */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-[#CCFF00] text-slate-950 flex items-center justify-center font-black text-[10px] shrink-0 shadow-xs">
              A
            </div>
            <div className="hidden sm:flex flex-col min-w-0">
              <span className="font-extrabold text-[10.5px] tracking-tight text-slate-950 dark:text-white truncate">
                Apex AI Predictions
              </span>
              <span className="text-[8px] text-slate-500 dark:text-neutral-400 font-medium leading-tight truncate">
                Football Analytics Engine
              </span>
            </div>
          </div>
        </div>

        {/* Center: Header Title */}
        <div className="flex items-center font-black text-[10px] sm:text-xs tracking-wider text-slate-900 dark:text-white uppercase select-none">
          <span>Live Scores</span>
        </div>

        {/* Right: Action Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            id="open-settings-modal-btn"
            onClick={onOpenSettings}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-full bg-slate-100 dark:bg-[#18181D] text-slate-800 dark:text-neutral-200 hover:bg-[#CCFF00] hover:text-slate-950 dark:hover:bg-[#CCFF00] dark:hover:text-slate-950 transition-all cursor-pointer text-[10.5px] font-black shadow-xs active:scale-95 border border-slate-200/60 dark:border-[#27272A]"
            title="Settings & Preferences"
            aria-label="Settings"
          >
            <Menu className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};

