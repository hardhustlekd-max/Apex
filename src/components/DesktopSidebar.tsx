import React from 'react';
import { Target, Layers, Trophy, History, Terminal, Sun, Moon, Globe, ChevronRight } from 'lucide-react';

interface DesktopSidebarProps {
  activeTab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY';
  onSelectTab: (tab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY') => void;
  selectedLeague: string;
  onSelectLeague: (league: string) => void;
  onOpenTerminal: () => void;
  onOpenLeagueModal: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  totalMatchesCount?: number;
  liveMatchesCount?: number;
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
  onOpenTerminal,
  onOpenLeagueModal,
  theme,
  onToggleTheme,
  totalMatchesCount = 0,
  liveMatchesCount = 0,
}) => {
  return (
    <aside className="w-60 shrink-0 hidden lg:flex flex-col h-[calc(100vh-3rem)] sticky top-12 bg-theme-card shadow-theme-sm z-20 select-none overflow-y-auto no-scrollbar justify-between">
      <div className="p-3 space-y-4">
        {/* Primary Navigation Sections */}
        <nav aria-label="Workspace navigation" className="space-y-0.5">
          <p className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-theme-sub mb-1">
            Navigation
          </p>

          <button
            type="button"
            onClick={() => onSelectTab('FIXTURES')}
            className={`w-full min-h-[36px] flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
              activeTab === 'FIXTURES'
                ? 'bg-theme-primary text-theme-primary-text shadow-theme-glow font-black'
                : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Target className="w-4 h-4 shrink-0" />
              <span className="truncate whitespace-nowrap">Predictions & Live</span>
            </div>
            {liveMatchesCount > 0 ? (
              <span className={`text-[10px] font-mono tabular-nums font-bold px-1.5 py-0.2 rounded-full shrink-0 ${
                activeTab === 'FIXTURES'
                  ? 'bg-black/20 text-theme-primary-text'
                  : 'bg-theme-primary text-theme-primary-text font-extrabold'
              }`}>
                {liveMatchesCount}
              </span>
            ) : totalMatchesCount > 0 ? (
              <span className={`text-[11px] font-mono tabular-nums shrink-0 ${
                activeTab === 'FIXTURES' ? 'opacity-90' : 'text-theme-dim'
              }`}>
                {totalMatchesCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('ACCAS')}
            className={`w-full min-h-[36px] flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
              activeTab === 'ACCAS'
                ? 'bg-theme-primary text-theme-primary-text shadow-theme-glow font-black'
                : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Layers className="w-4 h-4 shrink-0" />
              <span className="truncate whitespace-nowrap">Accumulators</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('STANDINGS')}
            className={`w-full min-h-[36px] flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
              activeTab === 'STANDINGS'
                ? 'bg-theme-primary text-theme-primary-text shadow-theme-glow font-black'
                : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Trophy className="w-4 h-4 shrink-0" />
              <span className="truncate whitespace-nowrap">Standings Table</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('HISTORY')}
            className={`w-full min-h-[36px] flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
              activeTab === 'HISTORY'
                ? 'bg-theme-primary text-theme-primary-text shadow-theme-glow font-black'
                : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <History className="w-4 h-4 shrink-0" />
              <span className="truncate whitespace-nowrap">Prediction History</span>
            </div>
          </button>
        </nav>

        {/* Favorite Leagues Quick Selector */}
        <div className="space-y-1 pt-2">
          <div className="flex items-center justify-between px-3 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-theme-sub">
              Competitions
            </span>
            <button
              type="button"
              onClick={onOpenLeagueModal}
              className="text-xs text-theme-primary hover:underline cursor-pointer font-bold flex items-center gap-0.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent rounded"
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
                  className={`w-full min-h-[32px] flex items-center justify-between px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                    isSelected
                      ? 'bg-theme-primary-subtle text-theme-primary font-bold'
                      : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Globe className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-theme-primary' : 'text-theme-dim'}`} />
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

      {/* Bottom Footer Controls */}
      <div className="p-2.5 bg-theme-card-elevated">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex-1 min-h-[32px] flex items-center justify-center gap-1.5 py-1 rounded-lg bg-theme-card text-theme-main hover:bg-theme-subtle hover:text-theme-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent transition-all text-xs font-bold cursor-pointer whitespace-nowrap"
            title="Toggle Light / Dark mode"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-theme-primary" /> : <Moon className="w-3.5 h-3.5 text-theme-main" />}
            <span className="text-[11px]">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenTerminal}
            className="min-h-[32px] min-w-[32px] p-1.5 rounded-lg bg-theme-card text-theme-main hover:bg-theme-subtle hover:text-theme-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent transition-all cursor-pointer flex items-center justify-center"
            title="System Terminal & Logs"
            aria-label="Open Terminal Logs"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};

