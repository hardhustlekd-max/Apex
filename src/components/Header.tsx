import React from 'react';
import { Menu, Terminal, Sun, Moon, ChevronLeft, Search } from 'lucide-react';
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
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
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
    <header className="sticky top-0 z-30 bg-white/85 dark:bg-[#070c14]/85 backdrop-blur-xl transition-colors shadow-xs dark:shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
      <div className="max-w-6xl w-full mx-auto px-3 sm:px-4 lg:px-6 py-2.5 flex items-center justify-between gap-3">
        {/* Left: Wireframe Back Chevron & Brand */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => {
              if (searchQuery && setSearchQuery) {
                setSearchQuery('');
              }
            }}
            className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-[#162038] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center shrink-0 transition-all cursor-pointer hover:scale-105 active:scale-95"
            title="Back / Clear"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-slate-900 dark:bg-[#A3FF12] text-white dark:text-slate-950 flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
              P
            </div>
            <div className="hidden sm:flex flex-col min-w-0">
              <span className="font-extrabold text-xs tracking-tight text-slate-900 dark:text-white truncate">
                Predictions Engine
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium leading-tight truncate">
                Apex AI Analytics
              </span>
            </div>
          </div>
        </div>

        {/* Center: Live Scores Wireframe Header */}
        <div className="flex items-center gap-2 font-black text-xs sm:text-sm tracking-wider text-slate-900 dark:text-white uppercase select-none">
          <span>Live Scores</span>
          {liveScores && liveScores.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              {liveScores.length} LIVE
            </span>
          )}
        </div>

        {/* Right: Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={onToggleTheme}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100 dark:bg-[#162038] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1c2947] transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-xs"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}
          </button>

          {onOpenTerminal && (
            <button
              id="open-terminal-modal-btn"
              onClick={onOpenTerminal}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-[#162038] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1c2947] transition-all cursor-pointer text-xs font-bold shadow-xs hover:scale-105 active:scale-95"
              title="Terminal Logs"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Terminal</span>
            </button>
          )}

          <button
            id="open-settings-modal-btn"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-[#162038] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1c2947] transition-all cursor-pointer text-xs font-bold shadow-xs hover:scale-105 active:scale-95"
            title="Settings & Preferences"
          >
            <Menu className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};

