import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Filter, ChevronDown, Search, X, RefreshCw, Calendar } from 'lucide-react';
import { GLOBAL_LEAGUES_DATASET } from '../core/globalLeaguesDataset.js';
import { Fixture } from '../core/types.js';
import { LiveScore } from '../providers/types.js';
import { getRelativeDateStr, getPossibleDateStrs, getStandardDateStr, getUtcDateStr, getFixtureUtcDate, normalizeDateStr, normalizeTimeStr } from '../core/dateUtils.js';
import { FixtureCard } from './FixtureCard.js';
import { SimplifiedPredictionsWireframe } from './SimplifiedPredictionsWireframe.js';
import { LeagueSelectorModal } from './LeagueSelectorModal.js';
import { FixturesFilterModal } from './FixturesFilterModal.js';
import { EngineService } from '../services/engineService.js';
import { ApexEngine } from '../core/poisson.js';
import { getLeaguePriority } from '../core/leaguePriority.js';
import { getSlugForCode, getCodeForSlug, matchesLeague } from '../core/leagueMapper.js';

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

import { getAuthoritative1X2Pick, getProbValue } from '../core/formatters.js';

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
  setViewMode,
  isLeagueModalOpen,
  setIsLeagueModalOpen,
  sortBy = 'DEFAULT',
  onSelectSortBy,
  selectedFixtureId,
  isProcessingActive = false,
  onTriggerFullSync,
}) => {
  const [activeScope, setActiveScope] = useState<'UPCOMING' | 'LIVE' | 'HISTORY'>('UPCOMING');
  const [historyFixtures, setHistoryFixtures] = useState<Fixture[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Close filter modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(event.target as Node)
      ) {
        setIsFilterOpen(false);
      }
    };

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterOpen]);

  const dateOptions = [
    { key: 'TODAY', label: "Today's Matches" },
    { key: 'TOMORROW', label: 'Tomorrow' },
    { key: 'DAY_2', label: 'Day 2' },
    { key: 'DAY_3', label: 'Day 3' },
    { key: 'NEXT_3_DAYS', label: 'Next 3 Days' },
    { key: 'THIS_WEEK', label: 'This Week' },
    { key: 'ALL', label: 'All Dates' },
  ];

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

  const datasetDates = useMemo(() => {
    return Array.from(new Set(fixtures.map((f) => normalizeDateStr(f.matchDate)))).filter(Boolean).sort();
  }, [fixtures]);

  const baseToday = useMemo(() => {
    const utcToday = getUtcDateStr(0);
    if (fixtures.some((f) => {
      const nd = normalizeDateStr(f.matchDate);
      const ud = normalizeDateStr(getFixtureUtcDate(f));
      return nd === utcToday || ud === utcToday;
    })) {
      return utcToday;
    }
    // Find nearest date >= utcToday
    const upcomingDate = datasetDates.find((d) => d >= utcToday);
    if (upcomingDate) return upcomingDate;
    // Fallback to latest available date or utcToday
    return datasetDates[datasetDates.length - 1] || utcToday;
  }, [fixtures, datasetDates]);

  // Load history predictions from predictions db when history tab is active or selected league changes
  useEffect(() => {
    let isCancelled = false;
    async function fetchHistory() {
      try {
        setIsLoadingHistory(true);
        const data = await EngineService.getHistoricalMatches(selectedLeague, 200);
        if (!isCancelled) {
          setHistoryFixtures(data);
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

  // Create a fast lookup set for live IDs to filter upcoming
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
    const weekMax = getUtcDateStr(6);
    const todayStrs = getPossibleDateStrs(0);
    const tomorrowStrs = getPossibleDateStrs(1);
    const day2Strs = getPossibleDateStrs(2);
    const day3Strs = getPossibleDateStrs(3);

    let matches = uniqueFixtures.filter((f) => {
      // 1. FILTER OUT LIVE MATCHES
      if (f.status === 'LIVE' || liveIdSet.has(f.id)) return false;

      const matchDateNorm = normalizeDateStr(f.matchDate);
      const utcMatchDateNorm = normalizeDateStr(getFixtureUtcDate(f));

      // Date filtering
      if (dateFilter === 'TODAY') {
        if (!todayStrs.includes(matchDateNorm) && !todayStrs.includes(utcMatchDateNorm) && matchDateNorm !== baseToday) return false;
      } else if (dateFilter === 'TOMORROW') {
        if (!tomorrowStrs.includes(matchDateNorm) && !tomorrowStrs.includes(utcMatchDateNorm)) return false;
      } else if (dateFilter === 'DAY_2') {
        if (!day2Strs.includes(matchDateNorm) && !day2Strs.includes(utcMatchDateNorm)) return false;
      } else if (dateFilter === 'DAY_3') {
        if (!day3Strs.includes(matchDateNorm) && !day3Strs.includes(utcMatchDateNorm)) return false;
      } else if (dateFilter === 'NEXT_3_DAYS') {
        const inNext3 = todayStrs.includes(matchDateNorm) || todayStrs.includes(utcMatchDateNorm) ||
          tomorrowStrs.includes(matchDateNorm) || tomorrowStrs.includes(utcMatchDateNorm) ||
          day2Strs.includes(matchDateNorm) || day2Strs.includes(utcMatchDateNorm);
        if (!inNext3) return false;
      } else if (dateFilter === 'THIS_WEEK') {
        const inWeek = (matchDateNorm >= todayStrs[0] && matchDateNorm <= weekMax) ||
          (utcMatchDateNorm >= todayStrs[0] && utcMatchDateNorm <= weekMax);
        if (!inWeek) return false;
      } else if (dateFilter !== 'ALL') {
        const targetDate = normalizeDateStr(dateFilter);
        if (matchDateNorm !== targetDate && utcMatchDateNorm !== targetDate) return false;
      }

      // League filter
      if (selectedLeague !== 'ALL') {
        if (!matchesLeague(f.league, f.leagueName, selectedLeague)) return false;
      }

      // Search filter
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
  }, [uniqueFixtures, liveIdSet, dateFilter, selectedLeague, searchQuery, baseToday]);

  const liveFixtures: Fixture[] = useMemo(() => {
    if (!liveScores || liveScores.length === 0) return [];

    // The source of truth for "which matches are live" is the liveScores feed from provider
    const combined: Fixture[] = liveScores.map((s) => {
      // Find matching prediction data passed from App
      const matchInPredictions = livePredictions.find(
        (f) => f.id === s.fixtureId || f.id === `fs_${s.fixtureId}` || f.id.replace('fs_', '') === s.fixtureId
      );
      
      // Find matching fixture in upcoming (in case prediction not found yet)
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

      if (base) {
        return {
          ...base,
          status: 'LIVE' as const,
          minute: s.minute,
          score: { home: s.homeScore, away: s.awayScore },
          kickOffTime: s.status === 'FINISHED' ? 'FT' : (s.minute ? `${s.minute}'` : 'Live'),
        };
      }

      // Fallback for live matches not in our local DB yet
      return {
        id: s.fixtureId.startsWith('fs_') ? s.fixtureId : `fs_${s.fixtureId}`,
        providerId: 'FLASHSCORE',
        league: s.league || 'ALL',
        leagueName: s.leagueName || 'Live In-Play',
        matchDate: baseToday,
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
  }, [liveScores, livePredictions, uniqueFixtures, baseToday]);

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
          // STRICT FILTER: Only show historical matches that HAVE a real model prediction
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
    if (dateFilter !== 'TODAY') count++;
    if (searchQuery.trim().length > 0) count++;
    if (marketChoiceFilter !== 'MOST_LIKELY') count++;
    if (sortBy && sortBy !== 'DEFAULT') count++;
    return count;
  }, [selectedLeague, dateFilter, searchQuery, marketChoiceFilter, sortBy]);

  const handleResetAllFilters = () => {
    onSelectLeague('ALL');
    setDateFilter('TODAY');
    setMarketChoiceFilter('MOST_LIKELY');
    setSearchQuery('');
    onSelectSortBy?.('DEFAULT');
  };

  const selectedLeagueObj = leagueOptions.find((l) => l.code === selectedLeague);
  const selectedLeagueLabel = selectedLeagueObj ? selectedLeagueObj.name : selectedLeague;
  const dateOptionObj = dateOptions.find((d) => d.key === dateFilter);
  const marketOptionObj = marketOptions.find((m) => m.key === marketChoiceFilter);
  const sortOptionObj = sortOptions.find((s) => s.key === sortBy);

  const calendarDays = useMemo(() => {
    const days = [];
    const dayNameMap: Record<string, string> = {
      Sun: 'Su',
      Mon: 'Mo',
      Tue: 'Tu',
      Wed: 'Wed',
      Thu: 'Th',
      Fri: 'Fr',
      Sat: 'Sa',
    };

    for (let i = 0; i < 7; i++) {
      const dateStr = getUtcDateStr(i);
      const [y, m, dNum] = dateStr.split('-').map((p) => parseInt(p, 10));
      // Use Date.UTC to ensure "locale" formatting doesn't shift the day incorrectly
      const utcDateObj = new Date(Date.UTC(y, m - 1, dNum));
      const rawDayShort = utcDateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      const dayTwoLetter = dayNameMap[rawDayShort] || rawDayShort;
      days.push({ dayTwoLetter, dayNum: dNum, dateStr, index: i });
    }
    return days;
  }, []);

  return (
    <div className="space-y-2 font-sans flex-1 flex flex-col">
      {/* Day Selector Bar */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 items-center justify-items-center w-full py-1 px-0.5">
        {calendarDays.map((cd) => {
          const isToday = cd.index === 0 && dateFilter === 'TODAY';
          const isTomorrow = cd.index === 1 && dateFilter === 'TOMORROW';
          const isSelected = isToday || isTomorrow || (dateFilter === cd.dateStr);

          return (
            <button
              key={cd.dateStr}
              type="button"
              onClick={() => {
                if (cd.index === 0) setDateFilter('TODAY');
                else if (cd.index === 1) setDateFilter('TOMORROW');
                else setDateFilter(cd.dateStr);
              }}
              className={`w-full max-w-[44px] min-h-[46px] sm:min-h-[50px] flex flex-col items-center justify-center transition-all duration-200 cursor-pointer active:scale-95 ${
                isSelected
                  ? 'bg-theme-primary text-theme-primary-text rounded-xl sm:rounded-2xl shadow-md py-1.5 px-2 scale-[1.04]'
                  : 'bg-transparent text-theme-main hover:text-theme-primary py-1 px-1'
              }`}
            >
              {/* Date Number on TOP */}
              <span
                className={`text-sm sm:text-[15px] font-extrabold font-mono tabular-nums leading-none tracking-tight ${
                  isSelected ? 'text-theme-primary-text' : 'text-theme-main'
                }`}
              >
                {cd.dayNum}
              </span>
              {/* Day Abbreviation on BOTTOM */}
              <span
                className={`text-[10px] font-semibold leading-none mt-1 ${
                  isSelected ? 'text-theme-primary-text font-bold' : 'text-theme-sub'
                }`}
              >
                {cd.dayTwoLetter}
              </span>
            </button>
          );
        })}
      </div>

      {/* Scope Sub-Tabs: Upcoming, Live, History & Filters */}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
        <div className="flex items-center bg-theme-card border border-theme p-0.5 rounded-xl shrink-0 overflow-x-auto no-scrollbar flex-nowrap gap-0.5 shadow-xs">
          <button
            id="subtab-upcoming-btn"
            type="button"
            onClick={() => setActiveScope('UPCOMING')}
            className={`min-h-[30px] px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center ${
              activeScope === 'UPCOMING'
                ? 'bg-theme-primary text-theme-primary-text font-extrabold shadow-xs'
                : 'text-theme-sub hover:text-theme-main'
            }`}
          >
            Upcoming
          </button>

          <button
            id="subtab-live-btn"
            type="button"
            onClick={() => setActiveScope('LIVE')}
            className={`min-h-[30px] px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center gap-1.5 ${
              activeScope === 'LIVE'
                ? 'bg-theme-primary text-theme-primary-text font-extrabold shadow-xs'
                : 'text-theme-sub hover:text-theme-main'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />
            <span className="whitespace-nowrap">Live</span>
            {liveScores && liveScores.length > 0 && (
              <span className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-black font-mono tabular-nums ${
                activeScope === 'LIVE'
                  ? 'bg-black/15 text-current'
                  : 'bg-theme-primary-subtle text-theme-primary'
              }`}>
                {liveScores.length}
              </span>
            )}
          </button>

          <button
            id="subtab-history-btn"
            type="button"
            onClick={() => setActiveScope('HISTORY')}
            className={`min-h-[30px] px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center ${
              activeScope === 'HISTORY'
                ? 'bg-theme-primary text-theme-primary-text font-extrabold shadow-xs'
                : 'text-theme-sub hover:text-theme-main'
            }`}
          >
            History
          </button>
        </div>

        {/* Filter Button */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setIsFilterOpen(true)}
            className={`min-h-[30px] flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 ${
              activeFilterCount > 0
                ? 'bg-theme-primary text-theme-primary-text font-extrabold'
                : 'bg-theme-card border border-theme text-theme-main hover:bg-theme-subtle'
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
          dateFilter={dateFilter}
          setDateFilter={setDateFilter}
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
        <div className="flex items-center gap-1.5 flex-wrap py-2 px-3 bg-theme-card border border-theme rounded-2xl text-xs">
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
                className="text-theme-sub hover:text-theme-primary cursor-pointer p-0.5"
                title="Remove league filter"
                aria-label="Remove league filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {dateFilter !== 'TODAY' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-theme-subtle text-theme-main font-medium text-xs">
              <span className="text-theme-sub">Date:</span>
              <span className="font-semibold">{dateOptionObj?.label || dateFilter}</span>
              <button
                type="button"
                onClick={() => setDateFilter('TODAY')}
                className="text-theme-sub hover:text-theme-primary cursor-pointer p-0.5"
                title="Reset date filter"
                aria-label="Reset date filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {marketChoiceFilter !== 'BEST_VALUE' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-theme-subtle text-theme-main font-medium text-xs">
              <span className="text-theme-sub">Market:</span>
              <span className="font-semibold">{marketOptionObj?.label || marketChoiceFilter}</span>
              <button
                type="button"
                onClick={() => setMarketChoiceFilter('BEST_VALUE')}
                className="text-theme-sub hover:text-theme-primary cursor-pointer p-0.5"
                title="Reset to Best Value"
                aria-label="Reset market filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {searchQuery.trim().length > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-theme-subtle text-theme-main font-medium text-xs">
              <span className="text-theme-sub">Search:</span>
              <span className="truncate max-w-[110px] font-semibold">"{searchQuery}"</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-theme-sub hover:text-theme-primary cursor-pointer p-0.5"
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
                className="text-theme-sub hover:text-theme-primary cursor-pointer p-0.5"
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
            className="ml-auto text-xs font-bold text-theme-primary hover:underline px-1 py-0.5 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Match List Display */}
      {(isLoading && activeScope === 'UPCOMING') || (isLoadingHistory && activeScope === 'HISTORY') || (isLoadingLive && activeScope === 'LIVE') ? (
        <div className="bg-theme-card rounded-3xl p-10 flex-1 min-h-[320px] flex flex-col items-center justify-center text-center shadow-xs border border-theme">
          <div className="w-6 h-6 rounded-full border-2 border-theme-primary border-t-transparent animate-spin shrink-0 mx-auto" />
          <span className="mt-3 text-xs text-theme-sub font-bold">Loading match data...</span>
        </div>
      ) : displayedFixtures.length === 0 ? (
        <div className="bg-theme-card rounded-3xl p-8 sm:p-12 flex-1 min-h-[340px] flex flex-col items-center justify-center text-center space-y-4 shadow-xs border border-theme">
          <div className="w-12 h-12 rounded-2xl bg-theme-primary-subtle flex items-center justify-center text-theme-primary shadow-xs">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-sm font-extrabold text-theme-main">
              {activeScope === 'UPCOMING'
                ? 'No upcoming fixtures found in database'
                : activeScope === 'LIVE'
                ? 'No live matches currently in play'
                : 'No historical matches found in database'}
            </h3>
            <p className="text-xs text-theme-sub font-medium">
              {activeFilterCount > 0
                ? 'Some active filters or search terms may be narrowing down your results.'
                : 'Trigger a full synchronization to fetch fresh Flashscore match data, live scores, head-to-head records, and 5-Pillar Poisson model predictions.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {onTriggerFullSync && (
              <button
                type="button"
                onClick={onTriggerFullSync}
                className="px-4 py-2.5 bg-theme-primary text-theme-primary-text hover:bg-theme-primary-hover rounded-xl text-xs font-black transition-all cursor-pointer shadow-md active:scale-95 flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Start Full Sync & Update Data</span>
              </button>
            )}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Reset filters ({activeFilterCount})
              </button>
            )}
            {activeScope === 'UPCOMING' && dateFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setDateFilter('ALL')}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Show all dates ({uniqueFixtures.length})
              </button>
            )}
          </div>
        </div>
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
