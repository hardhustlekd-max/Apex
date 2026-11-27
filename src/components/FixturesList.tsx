import React, { useMemo, useState, useEffect } from 'react';
import { X, Calendar, Flame } from 'lucide-react';
import { Fixture, LeagueGroupDTO, LeagueOptionDTO } from '../core/types.js';
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
import {
  UPCOMING_MARKET_CATEGORIES,
  getUpcomingMarketFilterDisplayLabel,
  parseUpcomingMarketFilter,
} from '../core/marketEvaluator.js';
import {
  PopularMarketEntry,
  getTopPopularMarkets,
  subscribeMarketActivity,
} from '../core/marketActivity.js';
import { EmptyState, LoadingState, PaginationBar, SegmentedTabs } from './ui/index.js';

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
}) => {
  const [internalScope, setInternalScope] = useState<'UPCOMING' | 'LIVE' | 'HISTORY'>('UPCOMING');
  const activeScope = propActiveScope ?? internalScope;
  const setActiveScope = (next: 'UPCOMING' | 'LIVE' | 'HISTORY' | 'FILTERS') => {
    if (next === 'FILTERS') {
      setIsFilterOpen(true);
      return;
    }
    if (onSelectScope) onSelectScope(next as 'UPCOMING' | 'LIVE' | 'HISTORY');
    else setInternalScope(next as 'UPCOMING' | 'LIVE' | 'HISTORY');
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
  const [popularMarkets, setPopularMarkets] = useState<PopularMarketEntry[]>(() => getTopPopularMarkets(3));

  useEffect(() => {
    return subscribeMarketActivity(() => {
      setPopularMarkets(getTopPopularMarkets(3));
    });
  }, []);

  useEffect(() => {
    if (propLeaguesCatalog && propLeaguesCatalog.length > 0 && refreshKey === 0) return;
    let cancelled = false;
    EngineService.getLeaguesCatalog(refreshKey > 0).then((list) => {
      if (!cancelled && Array.isArray(list)) {
        setFetchedLeaguesCatalog(list);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [propLeaguesCatalog, refreshKey]);

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

  const marketOptions = UPCOMING_MARKET_CATEGORIES;

  const compactMarketTabs = useMemo(
    () => [
      { key: 'MOST_LIKELY', label: 'All' },
      { key: 'POPULAR', label: 'Popular' },
      { key: '1X2', label: '1X2' },
      { key: 'OVER_UNDER', label: 'O/U' },
      { key: 'DOUBLE_CHANCE', label: 'DC / DNB' },
      { key: 'BTTS', label: 'BTTS' },
      { key: 'COMBOS', label: 'Combos' },
      { key: 'TEAM_GOALS', label: 'Team' },
      { key: 'SPECIALS', label: 'Specials' },
    ],
    []
  );

  const parsedMarketFilter = useMemo(
    () => parseUpcomingMarketFilter(marketChoiceFilter),
    [marketChoiceFilter]
  );

  const activeMarketTabKey =
    parsedMarketFilter.category === 'ALL'
      ? 'MOST_LIKELY'
      : parsedMarketFilter.category;

  const popularMarketsKey =
    marketChoiceFilter === 'POPULAR' ? popularMarkets.map((p) => p.key).join(',') : '';

  const sortOptions = [
    { key: 'DEFAULT', label: 'Default (League & Kickoff)' },
    { key: 'PROB_DESC', label: 'Highest Tip % (High → Low)' },
    { key: 'PROB_ASC', label: 'Lowest Tip % (Low → High)' },
    { key: 'HOME_DESC', label: 'Highest Home Win % (1)' },
    { key: 'DRAW_DESC', label: 'Highest Draw % (X)' },
    { key: 'AWAY_DESC', label: 'Highest Away Win % (2)' },
  ];

  const resolvedLeaguesCatalog = useMemo(() => {
    const base =
      fetchedLeaguesCatalog.length >= (propLeaguesCatalog?.length || 0)
        ? fetchedLeaguesCatalog
        : propLeaguesCatalog || [];
    const byCode = new Map<string, LeagueOptionDTO>();
    for (const l of base) {
      if (l?.code) {
        byCode.set(l.code.toLowerCase(), l);
      }
    }
    for (const f of [...fixtures, ...propLiveFixtures]) {
      if (!f?.league || !f?.leagueName) continue;
      const code = String(f.league).trim();
      const key = code.toLowerCase();
      if (!byCode.has(key)) {
        const raw = String(f.leagueName).trim();
        const colonIdx = raw.indexOf(':');
        const name = colonIdx > 0 ? raw.slice(colonIdx + 1).trim() || raw : raw;
        const country = colonIdx > 0 ? raw.slice(0, colonIdx).trim() : (f.stage || 'Global');
        byCode.set(key, { code, name, country });
      }
    }
    return Array.from(byCode.values());
  }, [propLeaguesCatalog, fetchedLeaguesCatalog, fixtures, propLiveFixtures]);

  const leagueOptions = useMemo(
    () => [
      { code: 'ALL', name: 'All Leagues Worldwide' },
      ...resolvedLeaguesCatalog.map((l) => ({
        code: l.code,
        name:
          l.country && !l.name.toLowerCase().startsWith(l.country.toLowerCase())
            ? `${l.name} (${l.country})`
            : l.name,
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
            popularMarkets: marketChoiceFilter === 'POPULAR' ? popularMarkets.map((p) => p.key) : undefined,
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
  }, [activeScope, selectedLeague, debouncedHistorySearch, sortBy, marketChoiceFilter, popularMarketsKey, refreshKey]);

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
  const marketFilterLabel = useMemo(
    () => getUpcomingMarketFilterDisplayLabel(marketChoiceFilter),
    [marketChoiceFilter]
  );
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
        count: liveScores && liveScores.length > 0 ? liveScores.length : undefined,
      },
      {
        id: 'HISTORY' as const,
        label: 'History',
        buttonId: 'subtab-history-btn',
      },
      {
        id: 'FILTERS' as const,
        label: activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters',
        buttonId: 'subtab-filters-btn',
        count: activeFilterCount > 0 ? activeFilterCount : undefined,
      },
    ],
    [liveScores, activeFilterCount]
  );

  const emptyTitle =
    activeScope === 'UPCOMING'
      ? 'No upcoming fixtures found'
      : activeScope === 'LIVE'
      ? 'No live matches found'
      : 'No historical predictions found';

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
      <div>
        <SegmentedTabs
          items={scopeTabs}
          value={activeScope}
          onChange={(val) => setActiveScope(val)}
          variant="card"
          size="sm"
          className="min-w-0 w-full"
          ariaLabel="Match scope and filters"
        />

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
          popularMarkets={popularMarkets}
          sortOptions={sortOptions}
        />
      </div>

      {/* Market Filter Tabs Strip (including Popular Top 3 by user activity) */}
      <div className="space-y-1.5">
        <div
          role="tablist"
          aria-label="Market filter categories"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 px-1 bg-theme-card rounded-full"
        >
          {compactMarketTabs.map((tab) => {
            const isTabActive = activeMarketTabKey === tab.key;
            const isPopularTab = tab.key === 'POPULAR';
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isTabActive}
                onClick={() => setMarketChoiceFilter(tab.key)}
                title={
                  isPopularTab
                    ? `Prioritize top 3 markets: ${popularMarkets.map((p) => p.shortLabel).join(', ')}`
                    : undefined
                }
                className={`h-[28px] px-2.5 rounded-full text-xs whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150 inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                  isTabActive
                    ? 'bg-theme-primary text-theme-primary-text font-semibold'
                    : 'text-theme-sub hover:text-theme-main font-medium'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeMarketTabKey === 'POPULAR' && popularMarkets.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap px-2.5 py-1.5 rounded-xl bg-theme-subtle text-xs">
            <span className="text-2xs font-semibold uppercase tracking-[0.05em] text-theme-sub inline-flex items-center gap-1 shrink-0">
              <Flame className="w-3.5 h-3.5 text-theme-warning" />
              <span>Top 3 Active:</span>
            </span>
            {popularMarkets.map((pm, idx) => (
              <button
                key={pm.key}
                type="button"
                onClick={() => setMarketChoiceFilter(pm.key)}
                title={`Filter strictly by #${idx + 1} ${pm.label}`}
                className="h-[22px] px-2 rounded-full bg-theme-card hover:bg-theme-card-elevated text-theme-main text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-colors tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
              >
                <span className="text-theme-primary font-bold">#{idx + 1}</span>
                <span>{pm.shortLabel}</span>
                {pm.count > 0 && (
                  <span className="text-2xs text-theme-sub font-normal">({pm.count})</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active Filter Chips Strip */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap py-1.5 px-2.5 bg-theme-card rounded-xl text-xs">
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
                <X className="w-3.5 h-3.5" />
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
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )}

          {marketChoiceFilter !== 'MOST_LIKELY' && (
            <span className="h-[22px] inline-flex items-center gap-1 pl-2.5 pr-1 rounded-full bg-theme-subtle text-theme-main text-xs">
              <span className="font-medium truncate max-w-[180px]">{marketFilterLabel}</span>
              <button
                type="button"
                onClick={() => setMarketChoiceFilter('MOST_LIKELY')}
                className="w-[16px] h-[16px] inline-flex items-center justify-center text-theme-sub hover:text-theme-primary hover:bg-theme-card/80 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                title="Reset to Most Likely"
                aria-label="Reset market filter"
              >
                <X className="w-3.5 h-3.5" />
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
                <X className="w-3.5 h-3.5" />
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
                <X className="w-3.5 h-3.5" />
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
          icon={<Calendar className="w-5 h-5" />}
          title={emptyTitle}
          minHeight="min-h-[156px]"
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
              <div key={group.headerKey} className="bg-theme-card rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleLeagueExpand(group.headerKey)}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  className={`w-full min-h-[34px] flex items-center justify-between gap-2 px-3 py-1.5 transition-colors cursor-pointer text-left select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                    isCollapsed ? 'bg-theme-card hover:bg-theme-card-elevated' : 'bg-theme-card-elevated'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
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
