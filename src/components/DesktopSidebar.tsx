import React from 'react';
import { Target, Layers, Trophy, History, Settings, Terminal, Sun, Moon, Globe, ChevronRight, Activity } from 'lucide-react';

interface DesktopSidebarProps {
  activeTab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY';
  onSelectTab: (tab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY') => void;
  selectedLeague: string;
  onSelectLeague: (league: string) => void;
  onOpenSettings: () => void;
  onOpenTerminal: () => void;
  onOpenLeagueModal: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  totalMatchesCount?: number;
  liveMatchesCount?: number;
  isSyncing?: boolean;
}

const POPULAR_LEAGUES = [
  { code: 'ALL', name: 'All Matches', flag: '🌍' },
  { code: 'ENG-PL', name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { code: 'ESP-LL', name: 'La Liga', flag: '🇪🇸' },
  { code: 'ITA-SA', name: 'Serie A', flag: '🇮🇹' },
  { code: 'GER-BL', name: 'Bundesliga', flag: '🇩🇪' },
  { code: 'FRA-L1', name: 'Ligue 1', flag: '🇫🇷' },
  { code: 'EUR-CL', name: 'Champions League', flag: '⭐' },
];

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  onSelectTab,
  selectedLeague,
  onSelectLeague,
  onOpenSettings,
  onOpenTerminal,
  onOpenLeagueModal,
  theme,
  onToggleTheme,
  totalMatchesCount = 0,
  liveMatchesCount = 0,
  isSyncing = false,
}) => {
  return (
    <aside className="w-64 shrink-0 hidden lg:flex flex-col h-[calc(100vh-3.5rem)] sticky top-14 bg-white/80 dark:bg-[#0D0D11]/90 backdrop-blur-xl z-20 select-none overflow-y-auto no-scrollbar justify-between">
      <div className="p-4 space-y-6">
        {/* Brand identity lockup */}
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-8 h-8 rounded-xl bg-[#CCFF00] text-slate-950 flex items-center justify-center font-black text-sm shadow-xs shrink-0 tracking-tighter">
            A
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-extrabold text-slate-900 dark:text-white tracking-tight truncate leading-tight">
              Apex Football
            </h1>
            <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium truncate">
              Poisson Analytics Engine
            </p>
          </div>
        </div>

        {/* Primary Navigation Sections */}
        <div className="space-y-1">
          <p className="px-3 text-xs font-black uppercase tracking-wider text-slate-400 dark:text-neutral-500 mb-1.5">
            Navigation
          </p>
          
          <button
            type="button"
            onClick={() => onSelectTab('FIXTURES')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'FIXTURES'
                ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 shadow-xs font-extrabold'
                : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-[#18181D] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Target className="w-4 h-4 shrink-0" />
              <span>Predictions & Live</span>
            </div>
            {liveMatchesCount > 0 ? (
              <span className={`text-xs font-mono font-black px-1.5 py-0.2 rounded-full ${
                activeTab === 'FIXTURES'
                  ? 'bg-[#CCFF00] text-slate-950 dark:bg-slate-950 dark:text-[#CCFF00]'
                  : 'bg-rose-500 text-white'
              }`}>
                {liveMatchesCount}
              </span>
            ) : totalMatchesCount > 0 ? (
              <span className={`text-xs font-mono tabular-nums ${
                activeTab === 'FIXTURES' ? 'opacity-90' : 'text-slate-400 dark:text-neutral-500'
              }`}>
                {totalMatchesCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('ACCAS')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'ACCAS'
                ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 shadow-xs font-extrabold'
                : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-[#18181D] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 shrink-0" />
              <span>Accumulators</span>
            </div>
            <span className={`text-xs font-mono px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'ACCAS'
                ? 'bg-[#CCFF00] text-slate-950 dark:bg-slate-950 dark:text-[#CCFF00]'
                : 'bg-slate-100 dark:bg-[#18181D] text-slate-600 dark:text-neutral-400'
            }`}>
              4
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('STANDINGS')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'STANDINGS'
                ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 shadow-xs font-extrabold'
                : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-[#18181D] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Trophy className="w-4 h-4 shrink-0" />
              <span>Standings Table</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('HISTORY')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'HISTORY'
                ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 shadow-xs font-extrabold'
                : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-[#18181D] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <History className="w-4 h-4 shrink-0" />
              <span>Prediction History</span>
            </div>
          </button>
        </div>

        {/* Favorite Leagues Quick Selector */}
        <div className="space-y-1 pt-2">
          <div className="flex items-center justify-between px-3 mb-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-neutral-500">
              Competitions
            </span>
            <button
              type="button"
              onClick={onOpenLeagueModal}
              className="text-xs text-sky-600 dark:text-[#CCFF00] hover:underline cursor-pointer font-bold flex items-center gap-0.5"
            >
              <span>All</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-0.5">
            {POPULAR_LEAGUES.map((league) => {
              const isSelected = selectedLeague === league.code;
              return (
                <button
                  key={league.code}
                  type="button"
                  onClick={() => {
                    onSelectLeague(league.code);
                    if (activeTab !== 'FIXTURES') onSelectTab('FIXTURES');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-[#18181D] text-slate-950 dark:text-[#CCFF00] font-bold'
                      : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-[#141418] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-xs shrink-0">{league.flag}</span>
                    <span className="truncate">{league.name}</span>
                  </div>
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Footer Diagnostics & Controls */}
      <div className="p-3 bg-slate-50/50 dark:bg-[#0A0A0E] space-y-2">
        {/* Engine status indicator */}
        <div className="flex items-center justify-between px-2 py-1 text-xs text-slate-500 dark:text-neutral-400">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-[#CCFF00]'}`} />
            <span className="font-mono font-bold text-xs uppercase tracking-wide">
              {isSyncing ? 'Syncing...' : 'Engine Online'}
            </span>
          </div>
          <span className="font-mono tabular-nums text-xs text-slate-400">v2.4 Pro</span>
        </div>

        {/* Action icons row */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white dark:bg-[#18181D] text-slate-700 dark:text-neutral-300 hover:text-slate-950 dark:hover:text-white transition-all text-xs font-bold cursor-pointer shadow-xs"
            title="Toggle Light / Dark mode"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
            <span className="text-[11px]">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenTerminal}
            className="p-1.5 rounded-lg bg-white dark:bg-[#18181D] text-slate-700 dark:text-neutral-300 hover:text-slate-950 dark:hover:text-[#CCFF00] transition-all cursor-pointer shadow-xs"
            title="System Terminal & Logs"
          >
            <Terminal className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg bg-white dark:bg-[#18181D] text-slate-700 dark:text-neutral-300 hover:text-slate-950 dark:hover:text-[#CCFF00] transition-all cursor-pointer shadow-xs"
            title="Engine Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
