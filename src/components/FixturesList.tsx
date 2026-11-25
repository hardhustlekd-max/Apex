import React, { useMemo, useState, useEffect } from 'react';
import { Filter, ChevronDown, X, RefreshCw, Power, Database } from 'lucide-react';
import { Fixture, LeagueGroupDTO, LeagueOptionDTO, SqliteGateState } from '../core/types.js';
import { LiveScore } from '../providers/types.js';
import {
  getUtcDateStr,
  getCalendarStripDays,
  getDateFilterOptions,
  resolveDateFilter,
  getDateFilterDisplayLabel,
} from '../core/dateUtils.js';
import { FixtureCard } from './FixtureCard.js';
import { SimplifiedPredictionsWireframe } from './SimplifiedPredictionsWireframe.js';
import { LeagueSelectorModal } from './LeagueSelectorModal.js';
import { FixturesFilterModal } from './FixturesFilterModal.js';
import { EngineService } from '../services/engineService.js';
import { Button, EmptyState, LoadingState, PaginationBar, SegmentedTabs } from './ui/index.js';

interface FixturesListProps {
  fixtures: Fixture[];
  fixtureGroups?: LeagueGroupDTO[];
  totalDatabaseCount?: number;
  liveScores?: LiveScore[];
  liveFixtures?: Fixture[];
  liveGroups?: LeagueGroupDTO[];
  leaguesCatalog?: LeagueOptionDTO[];
  activeScope?: 'UPCOMING' | 'LIVE' | 'HISTORY';
  onSelectScope?: (scope: 'UPCOMING' | 'LIVE' | 'HISTORY') => void;
  isLoading: boolean;
  isLoadingLive?: boolean;
  onSelectDetail: (fixture: Fixture) => void;
  selectedLeague: string;
  onSelectLeague: (league: string) => void;
  dateFilter: string;
  setDateFilter: (d: any) => void;
  marketChoiceFilter: string;
  setMarketChoiceFilter: (m: any) => void;
  searchQuery: string;
  setSearchQuery: (s: string) => void;
  viewMode: string;
  setViewMode: (v: any) => void;
  isLeagueModalOpen: boolean;
  setIsLeagueModalOpen: (b: boolean) => void;
  sortBy?: 'DEFAULT' | 'PROB_DESC' | 'PROB_ASC' | 'HOME_DESC' | 'DRAW_DESC' | 'AWAY_DESC';
  onSelectSortBy?: (s: 'DEFAULT' | 'PROB_DESC' | 'PROB_ASC' | 'HOME_DESC' | 'DRAW_DESC' | 'AWAY_DESC') => void;
  selectedFixtureId?: string | number;
  isProcessingActive?: boolean;
  onTriggerFullSync?: () => void;
  refreshKey?: number;
  sqliteBlocked?: boolean;
  sqliteGate?: SqliteGateState | null;
  onSwitchOnSqlite?: () => void;
  isTogglingSqlite?: boolean;
  scrapingBlocked?: boolean;
  onSwitchOnScraping?: () => void;
  isTogglingScraping?: boolean;
  onOpenSettings?: () => void;
}

export const FixturesList: React.FC<FixturesListProps> = ({
  fixtures,
  fixtureGroups,
  totalDatabaseCount,
  liveScores,
  liveFixtures: propLiveFixtures = [],
  liveGroups = [],
  leaguesCatalog: propLeaguesCatalog,
  activeScope: propActiveScope,
  onSelectScope,
  isLoading,
  isLoadingLive = false,
  onSelectDetail,
  selectedLeague,
  onSelectLeague,
  dateFilter,
  setDateFilter,
  marketChoiceFilter,
  setMarketChoiceFilter,
  searchQuery,
  setSearchQuery,
  viewMode,
  isLeagueModalOpen,
  setIsLeagueModalOpen,
  sortBy = 'DEFAULT',
  onSelectSortBy,
  selectedFixtureId,
  onTriggerFullSync,
  refreshKey = 0,
  sqliteBlocked = false,
  sqliteGate = null,
  onSwitchOnSqlite,
  isTogglingSqlite = false,
  scrapingBlocked = true,
  onSwitchOnScraping,
  isTogglingScraping = false,
  onOpenSettings,
}) => {
  const [internalScope, setInternalScope] = useState<'UPCOMING' | 'LIVE' | 'HISTORY'>('UPCOMING');
  const activeScope = propActiveScope ?? internalScope;
  const setActiveScope = (next: 'UPCOMING' | 'LIVE' | 'HISTORY') => {
    if (onSelectScope) onSelectScope(next);
    else setInternalScope(next);
  };

  const [historyFixtures, setHistoryFixtures] = useState<Fixture[]>([]);
  const [historyGroups, setHistoryGroups] = useState<LeagueGroupDTO[]>([]);
  const [historySummary, setHistorySummary] = useState<{
    upcomingFixturesInDb: number;
    totalPredictions: number;
    upcomingPredictions: number;
    livePredictions: number;
    completedWithScore: number;
    completedAwaitingScore: number;
  } | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [fetchedLeaguesCatalog, setFetchedLeaguesCatalog] = useState<LeagueOptionDTO[]>([]);
  const [debouncedHistorySearch, setDebouncedHistorySearch] = useState<string>(searchQuery);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [expandedLeagues, setExpandedLeagues] = useState<Record<string, boolean>>({});
  const [cardsPageSize, setCardsPageSize] = useState<number>(10);
  const [cardsLeaguePages, setCardsLeaguePages] = useState<Record<string, number>>({});

  useEffect(() => {
    if (propLeaguesCatalog && propLeaguesCatalog.length > 0) return;
    let cancelled = false;
    EngineService.getLeaguesCatalog().then((list) => {
      if (!cancelled && Array.isArray(list)) {
        setFetchedLeaguesCatalog(list);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [propLeaguesCatalog]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedHistorySearch(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const toggleLeagueExpand = (headerKey: string) => {
    setExpandedLeagues((prev) => ({
      ...prev,
      [headerKey]: !prev[headerKey],
    }));
  };

  const dateOptions = useMemo(() => getDateFilterOptions(), []);

  const marketOptions = [
    { key: 'MOST_LIKELY', label: 'Most Likely' },
    { key: 'OVER_UNDER', label: 'Over Under' },
    { key: '1X2', label: '1X2 Match Winner' },
    { key: 'BTTS', label: 'Both Teams to Score' },
  ];

  const sortOptions = [
    { key: 'DEFAULT', label: 'Default (League & Kickoff)' },
    { key: 'PROB_DESC', label: 'Highest Tip % (High → Low)' },
    { key: 'PROB_ASC', label: 'Lowest Tip % (Low → High)' },
    { key: 'HOME_DESC', label: 'Highest Home Win % (1)' },
    { key: 'DRAW_DESC', label: 'Highest Draw % (X)' },
    { key: 'AWAY_DESC', label: 'Highest Away Win % (2)' },
  ];

  const resolvedLeaguesCatalog = useMemo(
    () => (propLeaguesCatalog && propLeaguesCatalog.length > 0 ? propLeaguesCatalog : fetchedLeaguesCatalog),
    [propLeaguesCatalog, fetchedLeaguesCatalog]
  );

  const leagueOptions = useMemo(
    () => [
      { code: 'ALL', name: 'All Leagues Worldwide' },
      ...resolvedLeaguesCatalog.map((l) => ({
        code: l.code,
        name: `${l.name} (${l.country || 'Global'})`,
      })),
    ],
    [resolvedLeaguesCatalog]
  );

  const utcToday = getUtcDateStr(0);
  const resolvedDateFilter = useMemo(() => resolveDateFilter(dateFilter), [dateFilter]);
  const canonicalDateFilter = resolvedDateFilter.canonicalKey;

  const handleSelectDateFilter = (nextDateFilter: string) => {
    const resolvedNext = resolveDateFilter(nextDateFilter);
    setDateFilter(resolvedNext.canonicalKey);
    if (activeScope !== 'UPCOMING') {
      setActiveScope('UPCOMING');
    }
  };

  useEffect(() => {
    if (activeScope !== 'HISTORY') return;
    let isCancelled = false;
    async function fetchHistory() {
      try {
        setIsLoadingHistory(true);
        const { matches, groups, summary } = await EngineService.getHistoricalEvaluation(
          selectedLeague,
          200,
          refreshKey > 0,
          {
            search: debouncedHistorySearch,
            sortBy,
            marketFilter: marketChoiceFilter,
          }
        );
        if (!isCancelled) {
          setHistoryFixtures(matches);
          setHistoryGroups(groups || []);
          setHistorySummary(summary);
        }
      } catch (err) {
        console.error('Failed to load history predictions from db:', err);
      } finally {
        if (!isCancelled) {
          setIsLoadingHistory(false);
        }
      }
    }

    void fetchHistory();

    return () => {
      isCancelled = true;
    };
  }, [activeScope, selectedLeague, debouncedHistorySearch, sortBy, marketChoiceFilter, refreshKey]);

  const liveScoresMap = useMemo(() => {
    const map = new Map<string, LiveScore>();
    if (liveScores && liveScores.length > 0) {
      for (const s of liveScores) {
        if (s.fixtureId) {
          map.set(s.fixtureId, s);
          const clean = s.fixtureId.replace(/^fs_/, '');
          map.set(clean, s);
          map.set(`fs_${clean}`, s);
        }
      }
    }
    return map;
  }, [liveScores]);

  const displayedFixtures = useMemo(() => {
    let baseList = fixtures;
    if (activeScope === 'LIVE') baseList = propLiveFixtures;
    else if (activeScope === 'HISTORY') return historyFixtures;

    if (liveScoresMap.size === 0) return baseList;

    return baseList.map((f) => {
      const cleanId = (f.id || '').replace(/^fs_/, '');
      const ls = liveScoresMap.get(f.id) || liveScoresMap.get(cleanId);
      if (!ls) return f;
      return {
        ...f,
        status: (ls.status === 'FINISHED' ? 'FINISHED' : 'LIVE') as any,
        minute: ls.minute ?? f.minute,
        score: { home: ls.homeScore, away: ls.awayScore },
        kickOffTime: ls.status === 'FINISHED' ? 'FT' : ls.minute ? `${ls.minute}'` : 'Live',
      };
    });
  }, [activeScope, fixtures, propLiveFixtures, historyFixtures, liveScoresMap]);

  const activeGroups = useMemo(() => {
    if (activeScope === 'LIVE') return liveGroups;
    if (activeScope === 'HISTORY') return historyGroups;
    return fixtureGroups;
  }, [activeScope, fixtureGroups, liveGroups, historyGroups]);

  // O(N) Map reconstruction from server-computed LeagueGroupDTO[] (zero client sorting/scoring)
  const groupedByLeague = useMemo(() => {
    interface LeagueGroupView {
      leagueKey: string;
      leagueName: string;
      subDivision?: string;
      headerKey: string;
      fixtures: Fixture[];
    }

    if (activeGroups && activeGroups.length > 0) {
      const fixtureById = new Map<string, Fixture>();
      for (const f of displayedFixtures) {
        if (f.id) fixtureById.set(f.id, f);
      }
      const hydrated: LeagueGroupView[] = [];
      for (const g of activeGroups) {
        const matched: Fixture[] = [];
        for (const id of g.fixtureIds) {
          const item = fixtureById.get(id);
          if (item) matched.push(item);
        }
        if (matched.length > 0) {
          hydrated.push({
            leagueKey: g.leagueKey,
            leagueName: g.leagueName,
            subDivision: g.subDivision,
            headerKey: g.headerKey,
            fixtures: matched,
          });
        }
      }
      if (hydrated.length > 0) {
        return hydrated;
      }
    }

    const map = new Map<string, LeagueGroupView>();
    for (const f of displayedFixtures) {
      const leagueKey = f.league || 'ALL';
      const leagueName = f.leagueName || f.league || 'Other Competition';
      const subDivision = f.stage || f.leagueName || f.league;
      const headerKey = `${leagueKey}_${subDivision}`;
      let group = map.get(headerKey);
      if (!group) {
        group = {
          leagueKey,
          leagueName,
          subDivision,
          headerKey,
          fixtures: [],
        };
        map.set(headerKey, group);
      }
      group.fixtures.push(f);
    }
    return Array.from(map.values());
  }, [displayedFixtures, activeGroups]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedLeague !== 'ALL') count++;
    if (canonicalDateFilter !== 'TODAY') count++;
    if (searchQuery.trim().length > 0) count++;
    if (marketChoiceFilter !== 'MOST_LIKELY') count++;
    if (sortBy && sortBy !== 'DEFAULT') count++;
    return count;
  }, [selectedLeague, canonicalDateFilter, searchQuery, marketChoiceFilter, sortBy]);

  const handleResetAllFilters = () => {
    onSelectLeague('ALL');
    setDateFilter('TODAY');
    setMarketChoiceFilter('MOST_LIKELY');
    setSearchQuery('');
    onSelectSortBy?.('DEFAULT');
  };

  const selectedLeagueObj = leagueOptions.find((l) => l.code === selectedLeague);
  const selectedLeagueLabel = selectedLeagueObj ? selectedLeagueObj.name : selectedLeague;
  const dateFilterLabel = useMemo(() => getDateFilterDisplayLabel(canonicalDateFilter), [canonicalDateFilter]);
  const marketOptionObj = marketOptions.find((m) => m.key === marketChoiceFilter);
  const sortOptionObj = sortOptions.find((s) => s.key === sortBy);

  const calendarDays = useMemo(() => getCalendarStripDays(7), [utcToday]);

  const scopeTabs = useMemo(
    () => [
      {
        id: 'UPCOMING' as const,
        label: 'Upcoming',
        buttonId: 'subtab-upcoming-btn',
      },
      {
        id: 'LIVE' as const,
        label: 'Live',
        buttonId: 'subtab-live-btn',
        icon: <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />,
        count: liveScores && liveScores.length > 0 ? liveScores.length : undefined,
      },
      {
        id: 'HISTORY' as const,
        label: 'History',
        buttonId: 'subtab-history-btn',
      },
    ],
    [liveScores]
  );

  const emptyTitle = sqliteBlocked
    ? sqliteGate?.blockedReason === 'MISSING_DB_ON_PREVIEW'
      ? 'No SQLite DB on Preview (Switched Off)'
      : 'SQLite Database Switched Off'
    : activeScope === 'UPCOMING'
    ? 'No Upcoming Fixtures'
    : activeScope === 'LIVE'
    ? scrapingBlocked
      ? 'Live Data Scraping Switched Off'
      : 'No Live Matches'
    : historySummary && historySummary.completedAwaitingScore > 0
    ? `Awaiting Final Scores (${historySummary.completedAwaitingScore})`
    : historySummary && (historySummary.upcomingPredictions > 0 || historySummary.livePredictions > 0)
    ? `Pending Results (${historySummary.upcomingPredictions} Upcoming, ${historySummary.livePredictions} Live)`
    : historySummary && historySummary.totalPredictions === 0 && historySummary.upcomingFixturesInDb > 0
    ? `No Predictions Generated (${historySummary.upcomingFixturesInDb} Fixtures)`
    : 'No Historical Predictions';

  return (
    <div className="space-y-2.5 font-sans flex-1 flex flex-col">
      {/* 7-Day Selector Bar */}
      <div className="grid grid-cols-7 gap-1 items-center justify-items-center w-full">
        {calendarDays.map((cd) => {
          const isSelected =
            resolvedDateFilter.kind === 'SINGLE' && resolvedDateFilter.dayIndex === cd.index;
          const isInRange =
            resolvedDateFilter.kind === 'RANGE' &&
            cd.dateStr >= resolvedDateFilter.startDate &&
            cd.dateStr <= resolvedDateFilter.endDate;

          return (
            <button
              key={cd.dateStr}
              type="button"
              onClick={() => handleSelectDateFilter(cd.filterKey)}
              aria-pressed={isSelected || isInRange}
              title={cd.fullLabel}
              className={`w-full max-w-[40px] h-[38px] flex flex-col items-center justify-center transition-all duration-150 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent rounded-xl bg-transparent hover:bg-theme-card/50`}
            >
              <span
                className={`text-base font-semibold tabular-nums leading-none tracking-[-0.01em] ${
                  isSelected || isInRange
                    ? 'text-theme-primary font-bold'
                    : 'text-theme-main'
                }`}
              >
                {cd.dayNum}
              </span>
              <span
                className={`text-2xs font-medium leading-none mt-1 ${
                  isSelected || isInRange
                    ? 'text-theme-primary font-semibold'
                    : 'text-theme-sub'
                }`}
              >
                {cd.dayTwoLetter}
              </span>
            </button>
          );
        })}
      </div>

      {/* Scope Sub-Tabs & Filters Bar */}
      <div className="flex items-center justify-between gap-2 flex-nowrap">
        <SegmentedTabs
          items={scopeTabs}
          value={activeScope}
          onChange={(val) => setActiveScope(val as 'UPCOMING' | 'LIVE' | 'HISTORY')}
          variant="card"
          size="sm"
          className="min-w-0"
          ariaLabel="Match scope"
        />

        {/* Filter Trigger */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setIsFilterOpen(true)}
            className={`h-[34px] min-h-[34px] flex items-center justify-center gap-1.5 px-3 rounded-full text-sm transition-all cursor-pointer active:scale-95 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
              activeFilterCount > 0
                ? 'bg-theme-primary text-theme-primary-text border border-theme-neon font-semibold shadow-theme-glow'
                : 'bg-theme-card border border-theme text-theme-main font-medium hover:bg-theme-card-elevated hover:border-theme-accent shadow-theme-sm'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-current" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-black/20 text-theme-primary-text text-2xs leading-none font-semibold tabular-nums inline-flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 opacity-70" />
          </button>
        </div>

        {/* Filter Modal */}
        <FixturesFilterModal
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          selectedLeague={selectedLeague}
          onSelectLeague={onSelectLeague}
          dateFilter={canonicalDateFilter}
          setDateFilter={handleSelectDateFilter}
          marketChoiceFilter={marketChoiceFilter}
          setMarketChoiceFilter={setMarketChoiceFilter}
          viewMode={viewMode}
          sortBy={sortBy}
          onSelectSortBy={onSelectSortBy}
          setIsLeagueModalOpen={setIsLeagueModalOpen}
          onResetFilters={handleResetAllFilters}
          activeFilterCount={activeFilterCount}
          leagueOptions={leagueOptions}
          dateOptions={dateOptions}
          marketOptions={marketOptions}
          sortOptions={sortOptions}
        />
      </div>

      {/* Active Filter Chips Strip */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap py-1.5 px-2.5 bg-theme-card border border-theme rounded-xl text-xs shadow-theme-sm">
          <span className="text-2xs font-medium uppercase tracking-[0.05em] text-theme-sub shrink-0">
            Filters:
          </span>

          {selectedLeague !== 'ALL' && (
            <span className="h-[22px] inline-flex items-center gap-1 pl-2.5 pr-1 rounded-full bg-theme-subtle text-theme-main text-xs">
              <span className="truncate max-w-[115px] font-medium">{selectedLeagueLabel}</span>
              <button
                type="button"
                onClick={() => onSelectLeague('ALL')}
                className="w-[16px] h-[16px] inline-flex items-center justify-center text-theme-sub hover:text-theme-primary hover:bg-theme-card/80 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                title="Remove league filter"
                aria-label="Remove league filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {canonicalDateFilter !== 'TODAY' && (
            <span className="h-[22px] inline-flex items-center gap-1 pl-2.5 pr-1 rounded-full bg-theme-subtle text-theme-main text-xs">
              <span className="font-medium">{dateFilterLabel}</span>
              <button
                type="button"
                onClick={() => handleSelectDateFilter('TODAY')}
                className="w-[16px] h-[16px] inline-flex items-center justify-center text-theme-sub hover:text-theme-primary hover:bg-theme-card/80 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                title="Reset date filter"
                aria-label="Reset date filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {marketChoiceFilter !== 'MOST_LIKELY' && (
            <span className="h-[22px] inline-flex items-center gap-1 pl-2.5 pr-1 rounded-full bg-theme-subtle text-theme-main text-xs">
              <span className="font-medium">{marketOptionObj?.label || marketChoiceFilter}</span>
              <button
                type="button"
                onClick={() => setMarketChoiceFilter('MOST_LIKELY')}
                className="w-[16px] h-[16px] inline-flex items-center justify-center text-theme-sub hover:text-theme-primary hover:bg-theme-card/80 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                title="Reset to Most Likely"
                aria-label="Reset market filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {searchQuery.trim().length > 0 && (
            <span className="h-[22px] inline-flex items-center gap-1 pl-2.5 pr-1 rounded-full bg-theme-subtle text-theme-main text-xs">
              <span className="truncate max-w-[100px] font-medium">&quot;{searchQuery}&quot;</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="w-[16px] h-[16px] inline-flex items-center justify-center text-theme-sub hover:text-theme-primary hover:bg-theme-card/80 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {sortBy && sortBy !== 'DEFAULT' && (
            <span className="h-[22px] inline-flex items-center gap-1 pl-2.5 pr-1 rounded-full bg-theme-subtle text-theme-main text-xs">
              <span className="font-medium">{sortOptionObj?.label?.split('(')[0] || sortBy}</span>
              <button
                type="button"
                onClick={() => onSelectSortBy?.('DEFAULT')}
                className="w-[16px] h-[16px] inline-flex items-center justify-center text-theme-sub hover:text-theme-primary hover:bg-theme-card/80 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                title="Reset sort"
                aria-label="Reset sort"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={handleResetAllFilters}
            className="ml-auto h-[22px] inline-flex items-center text-xs font-medium text-theme-primary hover:underline px-2.5 cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
          >
            Clear
          </button>
        </div>
      )}

      {/* Match List Display */}
      {(isLoading && activeScope === 'UPCOMING') || (isLoadingHistory && activeScope === 'HISTORY') || (isLoadingLive && activeScope === 'LIVE') ? (
        <LoadingState />
      ) : displayedFixtures.length === 0 ? (
        <EmptyState
          icon={sqliteBlocked ? <Database className="w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
          title={emptyTitle}
          minHeight="min-h-[156px]"
          actions={
            sqliteBlocked ? (
              <>
                {onSwitchOnSqlite && (
                  <Button variant="primary" size="sm" onClick={onSwitchOnSqlite} disabled={isTogglingSqlite}>
                    <Power className="w-3.5 h-3.5" />
                    <span>{isTogglingSqlite ? 'Switching On...' : 'Switch On SQLite DB'}</span>
                  </Button>
                )}
                {onOpenSettings && (
                  <Button variant="secondary" size="sm" onClick={onOpenSettings}>
                    <span>Open Settings / Drive Restore</span>
                  </Button>
                )}
              </>
            ) : (
              <>
                {activeScope === 'LIVE' && scrapingBlocked && onSwitchOnScraping && (
                  <Button variant="primary" size="sm" onClick={onSwitchOnScraping} disabled={isTogglingScraping}>
                    <Power className="w-3.5 h-3.5" />
                    <span>{isTogglingScraping ? 'Switching On...' : 'Switch Scraping ON'}</span>
                  </Button>
                )}
                {onTriggerFullSync && !scrapingBlocked && (activeScope !== 'HISTORY' || !historySummary || (historySummary.totalPredictions === 0 && historySummary.upcomingFixturesInDb === 0)) && (
                  <Button variant="primary" size="sm" onClick={onTriggerFullSync}>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Start Full Sync &amp; Update Data</span>
                  </Button>
                )}
                {activeFilterCount > 0 && (
                  <Button variant="subtle" size="sm" onClick={handleResetAllFilters}>
                    Reset filters ({activeFilterCount})
                  </Button>
                )}
                {activeScope === 'UPCOMING' && canonicalDateFilter !== 'ALL' && (
                  <Button variant="subtle" size="sm" onClick={() => handleSelectDateFilter('ALL')}>
                    Show all dates ({totalDatabaseCount ?? fixtures.length})
                  </Button>
                )}
              </>
            )
          }
        />
      ) : viewMode === 'CARDS' ? (
        <div className="space-y-2.5">
          {groupedByLeague.map((group) => {
            const isExpanded = !!expandedLeagues[group.headerKey];
            const isCollapsed = !isExpanded;
            const panelId = `cards-accordion-${group.headerKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            const totalGroupMatches = group.fixtures.length;
            const showLeaguePagination = totalGroupMatches > cardsPageSize;
            const totalGroupPages = Math.max(1, Math.ceil(totalGroupMatches / cardsPageSize));
            const rawGroupPage = cardsLeaguePages[group.headerKey] || 1;
            const safeGroupPage = Math.min(rawGroupPage, totalGroupPages);
            const groupStartIdx = (safeGroupPage - 1) * cardsPageSize;
            const visibleGroupFixtures = showLeaguePagination
              ? group.fixtures.slice(groupStartIdx, groupStartIdx + cardsPageSize)
              : group.fixtures;

            return (
              <div key={group.headerKey} className="bg-theme-card rounded-2xl border border-theme overflow-hidden shadow-theme-sm">
                <button
                  type="button"
                  onClick={() => toggleLeagueExpand(group.headerKey)}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  className={`w-full min-h-[34px] flex items-center justify-between gap-2 px-3 py-1.5 transition-colors cursor-pointer text-left select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                    isCollapsed ? 'bg-theme-card hover:bg-theme-card-elevated' : 'bg-theme-header-grad border-b border-theme-subdued'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-theme-primary shrink-0 transition-transform duration-150 ${
                        isCollapsed ? '-rotate-90' : 'rotate-0'
                      }`}
                    />
                    <span
                      className={`font-semibold text-xs leading-snug tracking-[-0.01em] text-theme-main ${
                        isCollapsed ? 'truncate' : 'break-words'
                      }`}
                      title={group.leagueName}
                    >
                      {group.leagueName}
                    </span>
                    {group.subDivision && group.subDivision !== group.leagueName && (
                      <span className="text-2xs font-normal text-theme-sub truncate hidden sm:inline">
                        · {group.subDivision}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="h-[20px] min-w-[22px] px-1.5 rounded-full bg-theme-subtle text-theme-sub text-2xs font-medium tabular-nums flex items-center justify-center">
                      {totalGroupMatches}
                    </span>
                    <span className="text-2xs font-normal text-theme-sub hidden sm:inline">
                      {isCollapsed ? 'Expand' : 'Collapse'}
                    </span>
                  </div>
                </button>

                {!isCollapsed && (
                  <div id={panelId} className="bg-theme-card">
                    <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {visibleGroupFixtures.map((fixture, idx) => (
                        <FixtureCard
                          key={`${fixture.id}_${idx}`}
                          fixture={fixture}
                          onSelectDetail={onSelectDetail}
                          isSelected={selectedFixtureId !== undefined && String(selectedFixtureId) === String(fixture.id)}
                          marketFilter={marketChoiceFilter as any}
                        />
                      ))}
                    </div>
                    {showLeaguePagination && (
                      <PaginationBar
                        embedded
                        currentPage={safeGroupPage}
                        totalPages={totalGroupPages}
                        totalItems={totalGroupMatches}
                        startIndex={groupStartIdx + 1}
                        endIndex={Math.min(safeGroupPage * cardsPageSize, totalGroupMatches)}
                        pageSize={cardsPageSize}
                        onPageChange={(nextPage) =>
                          setCardsLeaguePages((prev) => ({
                            ...prev,
                            [group.headerKey]: nextPage,
                          }))
                        }
                        onPageSizeChange={(size) => {
                          setCardsPageSize(size);
                          setCardsLeaguePages({});
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <SimplifiedPredictionsWireframe
          fixtures={displayedFixtures}
          groups={activeGroups}
          onSelectDetail={onSelectDetail}
          marketFilter={marketChoiceFilter as any}
          sortBy={sortBy}
          onSelectSortBy={onSelectSortBy}
          selectedFixtureId={selectedFixtureId}
        />
      )}

      <LeagueSelectorModal
        isOpen={isLeagueModalOpen}
        onClose={() => setIsLeagueModalOpen(false)}
        selectedLeague={selectedLeague}
        onSelectLeague={onSelectLeague}
        leagues={resolvedLeaguesCatalog}
      />
    </div>
  );
};
