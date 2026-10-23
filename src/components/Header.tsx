import React from 'react';
import { Menu, Terminal, Sun, Moon } from 'lucide-react';
import { EngineSettings, ProviderStatus } from '../core/types.js';
import { LiveScore } from '../providers/types.js';
import { LiveScoresTicker } from './LiveScoresTicker.js';

interface HeaderProps {
  settings: EngineSettings | null;
  providers: ProviderStatus[];
  stats: { totalMatches: number; totalTeams: number; leagues: any[] };
  onOpenSettings: () => void;
  onOpenTerminal?: () => void;
  onSelectAccaCategory?: (cat: 'BANKER' | 'VALUE_HUNTER') => void;
  onProviderChange: (providerId: EngineSettings['activeProvider']) => void;
  isSyncing: boolean;
  onSyncData?: () => void;
  isSyncingData?: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  liveScores: LiveScore[];
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
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#0B0F17]/80 backdrop-blur-md px-2 sm:px-3 py-2.5 transition-colors border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-[99%] sm:max-w-[98%] mx-auto flex items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center shrink-0 shadow-xs">
            <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
            </svg>
          </div>

          <div className="flex items-center gap-1.5 min-w-0 text-sm">
            <span className="font-semibold text-slate-900 dark:text-white truncate">
              predictions-engine
            </span>
            <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900">
              PROD
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleTheme}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer text-xs font-bold shadow-xs"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-slate-500" />}
          </button>

          {onOpenTerminal && (
            <button
              id="open-terminal-modal-btn"
              onClick={onOpenTerminal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer text-xs font-bold shadow-xs"
              title="Terminal Logs"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Terminal</span>
            </button>
          )}

          <button
            id="open-settings-modal-btn"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer text-xs font-bold shadow-xs"
            title="Settings & Preferences"
          >
            <Menu className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};
