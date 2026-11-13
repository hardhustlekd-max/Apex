import React, { useMemo, useState, useEffect } from 'react';
import { Filter, ChevronDown, X, RefreshCw } from 'lucide-react';
import { GLOBAL_LEAGUES_DATASET } from '../core/globalLeaguesDataset.js';
import { Fixture } from '../core/types.js';
import { LiveScore } from '../providers/types.js';
import {
  getUtcDateStr,
  normalizeDateStr,
  normalizeTimeStr,
  getCalendarStripDays,
  getDateFilterOptions,
  resolveDateFilter,
  matchesDateFilter,
  getDateFilterDisplayLabel,
} from '../core/dateUtils.js';
import { FixtureCard } from './FixtureCard.js';
import { SimplifiedPredictionsWireframe } from './SimplifiedPredictionsWireframe.js';
import { LeagueSelectorModal } from './LeagueSelectorModal.js';
import { FixturesFilterModal } from './FixturesFilterModal.js';
import { EngineService } from '../services/engineService.js';
import { getLeaguePriority } from '../core/leaguePriority.js';
import { matchesLeague } from '../core/leagueMapper.js';
import { getProbValue } from '../core/formatters.js';
import { Button, EmptyState, LoadingState, SegmentedTabs } from './ui/index.js';

interface FixturesListProps {
  fixtures: Fixture[];
  liveScores?: LiveScore[];
  livePredictions?: Fixture[];
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
}

function getTipProb(fixture: Fixture): number {
  const pick = fixture.mostLikelyOutcome;
  return pick ? getProbValue(pick.probability, 1) : 0;
}

function getHomeProb(fixture: Fixture): number {
  return getProbValue(fixture.prediction?.homeWinProb, 1);
}

function getDrawProb(fixture: Fixture): number {
  return getProbValue(fixture.prediction?.drawProb, 1);
}

function getAwayProb(fixture: Fixture): number {
  return getProbValue(fixture.prediction?.awayWinProb, 1);
}

export const FixturesList: React.FC<FixturesListProps> = ({
  fixtures,
  liveScores,
  livePredictions = [],
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
}) => {
  const [activeScope, setActiveScope] = useState<'UPCOMING' | 'LIVE' | 'HISTORY'>('UPCOMING');
  const [historyFixtures, setHistoryFixtures] = useState<Fixture[]>([]);
  const [historySummary, setHistorySummary] = useState<{
    upcomingFixturesInDb: number;
    totalPredictions: number;
    upcomingPredictions: number;
    livePredictions: number;
    completedWithScore: number;
    completedAwaitingScore: number;
  } | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

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

  const leagueOptions = [
    { code: 'ALL', name: 'All Leagues Worldwide' },
    ...GLOBAL_LEAGUES_DATASET.map((l) => ({ code: l.code, name: `${l.name} (${l.country || 'Global'})` })),
  ];

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
    let isCancelled = false;
    async function fetchHistory() {
      try {
        setIsLoadingHistory(true);
        const { matches, summary } = await EngineService.getHistoricalEvaluation(selectedLeague, 200);
        if (!isCancelled) {
          setHistoryFixtures(matches);
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

    if (activeScope === 'HISTORY') {
      fetchHistory();
    }

    return () => {
      isCancelled = true;
    };
  }, [activeScope, selectedLeague]);

  const uniqueFixtures = useMemo(() => {
    const seen = new Set<string>();
    return fixtures.filter((f) => {
      if (!f.id || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  }, [fixtures]);

  const liveIdSet = useMemo(() => {
    const set = new Set<string>();
    if (liveScores) {
      liveScores.forEach(s => {
        set.add(s.fixtureId);
        set.add(`fs_${s.fixtureId}`);
      });
    }
    return set;
  }, [liveScores]);

  const filteredUpcomingFixtures = useMemo(() => {
    const matches = uniqueFixtures.filter((f) => {
      if (f.status === 'LIVE' || liveIdSet.has(f.id)) return false;
      if (!matchesDateFilter(f, canonicalDateFilter)) return false;

      if (selectedLeague !== 'ALL') {
        if (!matchesLeague(f.league, f.leagueName, selectedLeague)) return false;
      }

      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase();
        const matchName = `${f.homeTeam} ${f.awayTeam} ${f.leagueName}`.toLowerCase();
        if (!matchName.includes(query)) return false;
      }

      return true;
    });

    return matches.slice().sort((a, b) => {
      const priorityA = getLeaguePriority(a.league, a.leagueName, a.stage);
      const priorityB = getLeaguePriority(b.league, b.leagueName, b.stage);
      if (priorityA !== priorityB) return priorityA - priorityB;
      if (a.matchDate !== b.matchDate) return a.matchDate.localeCompare(b.matchDate);
      return (a.kickOffTime || '').localeCompare(b.kickOffTime || '');
    });
  }, [uniqueFixtures, liveIdSet, canonicalDateFilter, selectedLeague, searchQuery]);

  const liveFixtures: Fixture[] = useMemo(() => {
    if (!liveScores || liveScores.length === 0) return [];

    const combined: Fixture[] = liveScores.map((s) => {
      const matchInPredictions = livePredictions.find(
        (f) => f.id === s.fixtureId || f.id === `fs_${s.fixtureId}` || f.id.replace('fs_', '') === s.fixtureId
      );
      const matchInUpcoming = uniqueFixtures.find(
        (f) => f.id === s.fixtureId || f.id === `fs_${s.fixtureId}` || f.id.replace('fs_', '') === s.fixtureId
      );

      const base = matchInPredictions || matchInUpcoming;

      if (base) {
        return {
          ...base,
          status: 'LIVE' as const,
          minute: s.minute,
          score: { home: s.homeScore, away: s.awayScore },
          kickOffTime: s.status === 'FINISHED' ? 'FT' : (s.minute ? `${s.minute}'` : 'Live'),
        };
      }

      return {
        id: s.fixtureId.startsWith('fs_') ? s.fixtureId : `fs_${s.fixtureId}`,
        providerId: 'FLASHSCORE',
        league: s.league || 'ALL',
        leagueName: s.leagueName || 'Live In-Play',
        matchDate: utcToday,
        kickOffTime: s.status === 'FINISHED' ? 'FT' : (s.minute ? `${s.minute}'` : 'Live'),
        homeTeam: s.homeTeam,
        awayTeam: s.awayTeam,
        status: 'LIVE' as const,
        minute: s.minute,
        score: { home: s.homeScore, away: s.awayScore },
      };
    });

    combined.sort((a, b) => {
      const priorityA = getLeaguePriority(a.league, a.leagueName, a.stage);
      const priorityB = getLeaguePriority(b.league, b.leagueName, b.stage);
      if (priorityA !== priorityB) return priorityA - priorityB;
      return (a.kickOffTime || '').localeCompare(b.kickOffTime || '');
    });

    return combined;
  }, [liveScores, livePredictions, uniqueFixtures, utcToday]);

  const displayedFixtures = useMemo(() => {
    const applySort = (list: Fixture[]) => {
      if (!sortBy || sortBy === 'DEFAULT') return list;
      return list.slice().sort((a, b) => {
        if (sortBy === 'PROB_DESC') return getTipProb(b) - getTipProb(a);
        if (sortBy === 'PROB_ASC') return getTipProb(a) - getTipProb(b);
        if (sortBy === 'HOME_DESC') return getHomeProb(b) - getHomeProb(a);
        if (sortBy === 'DRAW_DESC') return getDrawProb(b) - getDrawProb(a);
        if (sortBy === 'AWAY_DESC') return getAwayProb(b) - getAwayProb(a);
        return 0;
      });
    };

    if (activeScope === 'LIVE') {
      const filtered = liveFixtures.filter((f) => {
        if (selectedLeague !== 'ALL') {
          if (!matchesLeague(f.league, f.leagueName, selectedLeague)) return false;
        }
        if (searchQuery.trim().length > 0) {
          const query = searchQuery.toLowerCase();
          const matchName = `${f.homeTeam} ${f.awayTeam} ${f.leagueName}`.toLowerCase();
          if (!matchName.includes(query)) return false;
        }
        return true;
      });
      return applySort(filtered);
    }

    if (activeScope === 'HISTORY') {
      const filtered = historyFixtures
        .filter((f) => {
          if (f.prediction === undefined) return false;
          if (selectedLeague !== 'ALL') {
            if (!matchesLeague(f.league, f.leagueName, selectedLeague)) return false;
          }
          if (searchQuery.trim().length > 0) {
            const query = searchQuery.toLowerCase();
            const matchName = `${f.homeTeam} ${f.awayTeam} ${f.leagueName}`.toLowerCase();
            if (!matchName.includes(query)) return false;
          }
          return true;
        })
        .sort((a, b) => {
          const dateA = normalizeDateStr(a.matchDate);
          const dateB = normalizeDateStr(b.matchDate);
          if (dateA !== dateB) return dateB.localeCompare(dateA);
          const priorityA = getLeaguePriority(a.league, a.leagueName, a.stage);
          const priorityB = getLeaguePriority(b.league, b.leagueName, b.stage);
          if (priorityA !== priorityB) return priorityA - priorityB;
          const timeA = normalizeTimeStr(a.kickOffTime || '00:00');
          const timeB = normalizeTimeStr(b.kickOffTime || '00:00');
          return timeB.localeCompare(timeA);
        });
      return applySort(filtered);
    }

    return applySort(filteredUpcomingFixtures);
  }, [activeScope, filteredUpcomingFixtures, liveFixtures, historyFixtures, selectedLeague, searchQuery, sortBy]);

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

  const emptyTitle =
    activeScope === 'UPCOMING'
      ? 'No Upcoming Fixtures'
      : activeScope === 'LIVE'
      ? 'No Live Matches'
      : historySummary && historySummary.completedAwaitingScore > 0
      ? `Awaiting Final Scores (${historySummary.completedAwaitingScore})`
      : historySummary && (historySummary.upcomingPredictions > 0 || historySummary.livePredictions > 0)
      ? `Pending Results (${historySummary.upcomingPredictions} Upcoming, ${historySummary.livePredictions} Live)`
      : historySummary && historySummary.totalPredictions === 0 && historySummary.upcomingFixturesInDb > 0
      ? `No Predictions Generated (${historySummary.upcomingFixturesInDb} Fixtures)`
      : 'No Historical Predictions';

  return (
    <div className="space-y-2 font-sans flex-1 flex flex-col">
      {/* 7-Day Selector Bar */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 items-center justify-items-center w-full py-1 px-0.5">
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
              className={`w-full max-w-[44px] min-h-[46px] sm:min-h-[50px] flex flex-col items-center justify-center transition-all duration-150 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent rounded-xl sm:rounded-2xl ${
                isSelected
                  ? 'bg-theme-primary text-theme-primary-text shadow-theme-glow py-1.5 px-2 scale-[1.04]'
                  : isInRange
                  ? 'bg-theme-primary-subtle text-theme-primary py-1.5 px-1'
                  : 'bg-transparent text-theme-main hover:bg-theme-card hover:text-theme-primary py-1 px-1'
              }`}
            >
              <span
                className={`text-sm sm:text-[15px] font-extrabold font-mono tabular-nums leading-none tracking-tight ${
                  isSelected
                    ? 'text-theme-primary-text'
                    : isInRange
                    ? 'text-theme-primary'
                    : 'text-theme-main'
                }`}
              >
                {cd.dayNum}
              </span>
              <span
                className={`text-[10px] font-semibold leading-none mt-1 ${
                  isSelected
                    ? 'text-theme-primary-text font-bold'
                    : isInRange
                    ? 'text-theme-primary font-bold'
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
      <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
        <SegmentedTabs
          items={scopeTabs}
          value={activeScope}
          onChange={(val) => setActiveScope(val as 'UPCOMING' | 'LIVE' | 'HISTORY')}
          variant="card"
          size="xs"
          ariaLabel="Match scope"
        />

        {/* Filter Trigger */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setIsFilterOpen(true)}
            className={`min-h-[30px] flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
              activeFilterCount > 0
                ? 'bg-theme-primary text-theme-primary-text font-extrabold shadow-theme-glow'
                : 'bg-theme-card text-theme-main hover:bg-theme-subtle shadow-theme-sm'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-current" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="min-w-3.5 h-3.5 px-1 rounded-full bg-black/20 text-theme-primary-text text-[9.5px] font-black font-mono tabular-nums flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className="w-3 h-3 opacity-70" />
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
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
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
        <div className="flex items-center gap-1.5 flex-wrap py-2 px-3 bg-theme-card rounded-2xl text-xs shadow-theme-sm">
          <span className="text-xs font-bold text-theme-sub shrink-0">
            Active filters:
          </span>

          {selectedLeague !== 'ALL' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-theme-subtle text-theme-main font-medium text-xs">
              <span className="text-theme-sub">League:</span>
              <span className="truncate max-w-[130px] font-semibold">{selectedLeagueLabel}</span>
              <button
                type="button"
                onClick={() => onSelectLeague('ALL')}
                className="text-theme-sub hover:text-theme-primary cursor-pointer p-0.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                title="Remove league filter"
                aria-label="Remove league filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {canonicalDateFilter !== 'TODAY' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-theme-subtle text-theme-main font-medium text-xs">
              <span className="text-theme-sub">Date:</span>
              <span className="font-semibold">{dateFilterLabel}</span>
              <button
                type="button"
                onClick={() => handleSelectDateFilter('TODAY')}
                className="text-theme-sub hover:text-theme-primary cursor-pointer p-0.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                title="Reset date filter"
                aria-label="Reset date filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {marketChoiceFilter !== 'MOST_LIKELY' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-theme-subtle text-theme-main font-medium text-xs">
              <span className="text-theme-sub">Market:</span>
              <span className="font-semibold">{marketOptionObj?.label || marketChoiceFilter}</span>
              <button
                type="button"
                onClick={() => setMarketChoiceFilter('MOST_LIKELY')}
                className="text-theme-sub hover:text-theme-primary cursor-pointer p-0.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                title="Reset to Most Likely"
                aria-label="Reset market filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {searchQuery.trim().length > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-theme-subtle text-theme-main font-medium text-xs">
              <span className="text-theme-sub">Search:</span>
              <span className="truncate max-w-[110px] font-semibold">&quot;{searchQuery}&quot;</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-theme-sub hover:text-theme-primary cursor-pointer p-0.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {sortBy && sortBy !== 'DEFAULT' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-theme-subtle text-theme-main font-medium text-xs">
              <span className="text-theme-sub">Sort:</span>
              <span className="font-semibold">{sortOptionObj?.label?.split('(')[0] || sortBy}</span>
              <button
                type="button"
                onClick={() => onSelectSortBy?.('DEFAULT')}
                className="text-theme-sub hover:text-theme-primary cursor-pointer p-0.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
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
            className="ml-auto text-xs font-bold text-theme-primary hover:underline px-1.5 py-0.5 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Match List Display */}
      {(isLoading && activeScope === 'UPCOMING') || (isLoadingHistory && activeScope === 'HISTORY') || (isLoadingLive && activeScope === 'LIVE') ? (
        <LoadingState />
      ) : displayedFixtures.length === 0 ? (
        <EmptyState
          icon={<RefreshCw className="w-6 h-6" />}
          title={emptyTitle}
          minHeight="min-h-[340px]"
          actions={
            <>
              {onTriggerFullSync && (activeScope !== 'HISTORY' || !historySummary || (historySummary.totalPredictions === 0 && historySummary.upcomingFixturesInDb === 0)) && (
                <Button variant="primary" size="md" pill={false} onClick={onTriggerFullSync}>
                  <RefreshCw className="w-4 h-4" />
                  <span>Start Full Sync &amp; Update Data</span>
                </Button>
              )}
              {activeFilterCount > 0 && (
                <Button variant="subtle" size="md" pill={false} onClick={handleResetAllFilters}>
                  Reset filters ({activeFilterCount})
                </Button>
              )}
              {activeScope === 'UPCOMING' && canonicalDateFilter !== 'ALL' && (
                <Button variant="subtle" size="md" pill={false} onClick={() => handleSelectDateFilter('ALL')}>
                  Show all dates ({uniqueFixtures.length})
                </Button>
              )}
            </>
          }
        />
      ) : viewMode === 'CARDS' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {displayedFixtures.map((fixture) => (
            <FixtureCard
              key={fixture.id}
              fixture={fixture}
              onSelectDetail={onSelectDetail}
              isSelected={selectedFixtureId !== undefined && String(selectedFixtureId) === String(fixture.id)}
            />
          ))}
        </div>
      ) : (
        <SimplifiedPredictionsWireframe
          fixtures={displayedFixtures}
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
      />
    </div>
  );
};
