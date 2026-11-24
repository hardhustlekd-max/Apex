import React from 'react';
import { Target, Layers, Trophy, History, Ticket, Terminal, Sun, Moon, Globe, ChevronRight } from 'lucide-react';

interface DesktopSidebarProps {
  activeTab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY' | 'BETS';
  onSelectTab: (tab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY' | 'BETS') => void;
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
    <aside className="w-[196px] shrink-0 hidden lg:flex flex-col h-[calc(100vh-36px)] sticky top-[36px] bg-theme-card border-r border-theme shadow-theme-sm z-20 select-none overflow-y-auto no-scrollbar justify-between font-sans">
      <div className="p-2.5 space-y-4">
        {/* Primary Navigation Sections */}
        <nav aria-label="Workspace navigation" className="space-y-0.5">
          <p className="px-2.5 text-2xs font-medium uppercase tracking-[0.06em] text-theme-dim mb-1">
            Navigation
          </p>

          <button
            type="button"
            onClick={() => onSelectTab('FIXTURES')}
            className={`w-full h-[32px] flex items-center justify-between px-2.5 rounded-full text-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
              activeTab === 'FIXTURES'
                ? 'bg-theme-primary text-theme-primary-text shadow-theme-glow font-semibold'
                : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main font-medium'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Target className="w-4 h-4 shrink-0" />
              <span className="truncate whitespace-nowrap">Predictions &amp; Live</span>
            </div>
            {liveMatchesCount > 0 ? (
              <span className={`h-[18px] min-w-[20px] px-1.5 rounded-full inline-flex items-center justify-center text-2xs leading-none tabular-nums font-semibold shrink-0 ${
                activeTab === 'FIXTURES'
                  ? 'bg-black/20 text-theme-primary-text'
                  : 'bg-theme-primary text-theme-primary-text'
              }`}>
                {liveMatchesCount}
              </span>
            ) : totalMatchesCount > 0 ? (
              <span className={`text-xs font-normal tabular-nums shrink-0 ${
                activeTab === 'FIXTURES' ? 'opacity-90' : 'text-theme-dim'
              }`}>
                {totalMatchesCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('ACCAS')}
            className={`w-full h-[32px] flex items-center justify-between px-2.5 rounded-full text-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
              activeTab === 'ACCAS'
                ? 'bg-theme-primary text-theme-primary-text shadow-theme-glow font-semibold'
                : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main font-medium'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Layers className="w-4 h-4 shrink-0" />
              <span className="truncate whitespace-nowrap">Accumulators</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('STANDINGS')}
            className={`w-full h-[32px] flex items-center justify-between px-2.5 rounded-full text-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
              activeTab === 'STANDINGS'
                ? 'bg-theme-primary text-theme-primary-text shadow-theme-glow font-semibold'
                : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main font-medium'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Trophy className="w-4 h-4 shrink-0" />
              <span className="truncate whitespace-nowrap">Standings Table</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('HISTORY')}
            className={`w-full h-[32px] flex items-center justify-between px-2.5 rounded-full text-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
              activeTab === 'HISTORY'
                ? 'bg-theme-primary text-theme-primary-text shadow-theme-glow font-semibold'
                : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main font-medium'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <History className="w-4 h-4 shrink-0" />
              <span className="truncate whitespace-nowrap">Prediction History</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('BETS')}
            className={`w-full h-[32px] flex items-center justify-between px-2.5 rounded-full text-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
              activeTab === 'BETS'
                ? 'bg-theme-primary text-theme-primary-text shadow-theme-glow font-semibold'
                : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main font-medium'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Ticket className="w-4 h-4 shrink-0" />
              <span className="truncate whitespace-nowrap">My Bets</span>
            </div>
          </button>
        </nav>

        {/* Favorite Leagues Quick Selector */}
        <div className="space-y-1 pt-2.5 border-t border-theme-subdued">
          <div className="flex items-center justify-between px-2.5 mb-1">
            <span className="text-2xs font-medium uppercase tracking-[0.06em] text-theme-dim">
              Competitions
            </span>
            <button
              type="button"
              onClick={onOpenLeagueModal}
              className="h-[22px] px-2 text-xs text-theme-primary hover:underline cursor-pointer font-medium inline-flex items-center gap-0.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent rounded-full"
            >
              <span>All</span>
              <ChevronRight className="w-3.5 h-3.5" />
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
                  className={`w-full h-[30px] flex items-center justify-between px-2.5 rounded-full text-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                    isSelected
                      ? 'bg-theme-primary-subtle text-theme-primary font-semibold'
                      : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main font-normal'
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
      <div className="p-2.5 bg-theme-card-elevated border-t border-theme-subdued">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex-1 h-[32px] flex items-center justify-center gap-1.5 rounded-full bg-theme-subtle text-theme-main hover:bg-theme-card hover:text-theme-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent transition-all text-sm font-medium cursor-pointer whitespace-nowrap"
            title="Toggle Light / Dark mode"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-theme-primary" /> : <Moon className="w-4 h-4 text-theme-main" />}
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenTerminal}
            className="h-[32px] w-[32px] rounded-full bg-theme-subtle text-theme-main hover:bg-theme-card hover:text-theme-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent transition-all cursor-pointer flex items-center justify-center shrink-0"
            title="System Terminal & Logs"
            aria-label="Open Terminal Logs"
          >
            <Terminal className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
