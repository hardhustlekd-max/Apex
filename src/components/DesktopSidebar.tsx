import React from 'react';
import { Target, Layers, Trophy, History, Settings, Terminal, Sun, Moon, Globe, ChevronRight } from 'lucide-react';

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
  { code: 'ALL', name: 'All Matches' },
  { code: 'ENG-PL', name: 'Premier League' },
  { code: 'ESP-LL', name: 'La Liga' },
  { code: 'ITA-SA', name: 'Serie A' },
  { code: 'GER-BL', name: 'Bundesliga' },
  { code: 'FRA-L1', name: 'Ligue 1' },
  { code: 'EUR-CL', name: 'Champions League' },
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
    <aside className="w-60 shrink-0 hidden lg:flex flex-col h-[calc(100vh-3rem)] sticky top-12 bg-theme-card border-r border-theme/40 z-20 select-none overflow-y-auto no-scrollbar justify-between">
      <div className="p-3 space-y-4">
        {/* Brand identity lockup */}
        <div className="flex items-center gap-2.5 px-1.5 py-0.5">
          <div className="w-7.5 h-7.5 rounded-xl bg-theme-primary text-theme-primary-text flex items-center justify-center font-black text-xs shadow-xs shrink-0 tracking-tighter">
            L
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-extrabold text-theme-main tracking-tight truncate leading-tight">
              Live Score Engine
            </h1>
            <p className="text-[11px] text-theme-sub font-medium truncate">
              Poisson Projections
            </p>
          </div>
        </div>

        {/* Primary Navigation Sections */}
        <div className="space-y-0.5">
          <p className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-theme-sub mb-1">
            Navigation
          </p>
          
          <button
            type="button"
            onClick={() => onSelectTab('FIXTURES')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'FIXTURES'
                ? 'bg-theme-primary text-theme-primary-text shadow-xs font-black'
                : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Target className="w-4 h-4 shrink-0" />
              <span>Predictions & Live</span>
            </div>
            {liveMatchesCount > 0 ? (
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                activeTab === 'FIXTURES'
                  ? 'bg-black/20 text-theme-primary-text'
                  : 'bg-theme-primary text-theme-primary-text font-extrabold'
              }`}>
                {liveMatchesCount}
              </span>
            ) : totalMatchesCount > 0 ? (
              <span className={`text-[11px] font-mono tabular-nums ${
                activeTab === 'FIXTURES' ? 'opacity-90' : 'text-theme-dim'
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
                ? 'bg-theme-primary text-theme-primary-text shadow-xs font-black'
                : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 shrink-0" />
              <span>Accumulators</span>
            </div>
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'ACCAS'
                ? 'bg-black/20 text-theme-primary-text'
                : 'bg-theme-subtle text-theme-main'
            }`}>
              4
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('STANDINGS')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'STANDINGS'
                ? 'bg-theme-primary text-theme-primary-text shadow-xs font-black'
                : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main'
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
                ? 'bg-theme-primary text-theme-primary-text shadow-xs font-black'
                : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main'
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
            <span className="text-xs font-bold uppercase tracking-wider text-theme-sub">
              Competitions
            </span>
            <button
              type="button"
              onClick={onOpenLeagueModal}
              className="text-xs text-theme-primary hover:underline cursor-pointer font-bold flex items-center gap-0.5"
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
                  className={`w-full flex items-center justify-between px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-theme-primary-subtle text-theme-primary font-bold'
                      : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Globe className="w-3.5 h-3.5 text-theme-dim shrink-0" />
                    <span className="truncate">{league.name}</span>
                  </div>
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-theme-primary shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Footer Diagnostics & Controls */}
      <div className="p-2.5 bg-theme-card-elevated border-t border-theme/40 space-y-1.5">
        {/* Engine status indicator */}
        <div className="flex items-center justify-between px-1.5 py-0.5 text-xs text-theme-sub">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-theme-primary'}`} />
            <span className="font-mono font-bold text-[11px] uppercase tracking-wide">
              {isSyncing ? 'Syncing...' : 'Engine Online'}
            </span>
          </div>
          <span className="font-mono tabular-nums text-[11px] text-theme-dim">v2.4 Pro</span>
        </div>

        {/* Action icons row */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex-1 flex items-center justify-center gap-1.5 py-1 rounded-lg bg-theme-card border border-theme text-theme-main hover:text-theme-primary transition-all text-xs font-bold cursor-pointer shadow-xs"
            title="Toggle Light / Dark mode"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-theme-main" />}
            <span className="text-[11px]">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenTerminal}
            className="p-1 rounded-lg bg-theme-card border border-theme text-theme-main hover:text-theme-primary transition-all cursor-pointer shadow-xs"
            title="System Terminal & Logs"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1 rounded-lg bg-theme-card border border-theme text-theme-main hover:text-theme-primary transition-all cursor-pointer shadow-xs"
            title="Engine Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
