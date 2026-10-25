import React from 'react';
import { Menu, ChevronLeft } from 'lucide-react';
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
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#121212]/90 backdrop-blur-xl transition-colors border-b border-slate-200/80 dark:border-neutral-800">
      <div className="max-w-6xl w-full mx-auto px-3 sm:px-4 lg:px-6 py-2.5 flex items-center justify-between gap-3">
        {/* Left: Wireframe Back Chevron & Brand */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => {
              if (searchQuery && setSearchQuery) {
                setSearchQuery('');
              }
            }}
            className="w-11 h-11 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-neutral-200 hover:bg-[#CCFF00] hover:text-slate-950 dark:hover:bg-[#CCFF00] dark:hover:text-slate-950 flex items-center justify-center shrink-0 transition-all cursor-pointer active:scale-95 border border-transparent dark:border-white/10"
            title="Back / Clear"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-full bg-[#CCFF00] text-slate-950 flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
              A
            </div>
            <div className="hidden sm:flex flex-col min-w-0">
              <span className="font-extrabold text-xs tracking-tight text-slate-950 dark:text-white truncate">
                Apex AI Predictions
              </span>
              <span className="text-[10px] text-slate-500 dark:text-neutral-400 font-medium leading-tight truncate">
                Football Analytics Engine
              </span>
            </div>
          </div>
        </div>

        {/* Center: Header Title */}
        <div className="flex items-center font-black text-xs sm:text-sm tracking-wider text-slate-900 dark:text-white uppercase select-none">
          <span>Live Scores</span>
        </div>

        {/* Right: Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            id="open-settings-modal-btn"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-neutral-200 hover:bg-[#CCFF00] hover:text-slate-950 dark:hover:bg-[#CCFF00] dark:hover:text-slate-950 transition-all cursor-pointer text-xs font-black shadow-xs active:scale-95 border border-transparent dark:border-white/10"
            title="Settings & Preferences"
          >
            <Menu className="w-4 h-4" />
            <span className="hidden md:inline">Settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};

