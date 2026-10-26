import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Filter, ChevronDown, Search, X } from 'lucide-react';
import { GLOBAL_LEAGUES_DATASET } from '../core/globalLeaguesDataset.js';
import { Fixture } from '../core/types.js';
import { LiveScore } from '../providers/types.js';
import { getRelativeDateStr, getPossibleDateStrs, getStandardDateStr, normalizeDateStr, normalizeTimeStr } from '../core/dateUtils.js';
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
  isLoading: boolean;
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
}

import { getAuthoritative1X2Pick, getProbValue } from '../core/formatters.js';

function getTipProb(fixture: Fixture): number {
  return getAuthoritative1X2Pick(fixture).probabilityPercent;
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
  isLoading,
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
}) => {
  const [activeScope, setActiveScope] = useState<'UPCOMING' | 'LIVE' | 'HISTORY'>('UPCOMING');
  const [historyFixtures, setHistoryFixtures] = useState<Fixture[]>([]);
  const [livePredictionsFixtures, setLivePredictionsFixtures] = useState<Fixture[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [isLoadingLive, setIsLoadingLive] = useState<boolean>(false);
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
    { key: 'NEXT_3_DAYS', label: 'Next 3 Days' },
    { key: 'THIS_WEEK', label: 'This Week' },
    { key: 'ALL', label: 'All Dates' },
  ];

  const marketOptions = [
    { key: 'BEST_VALUE', label: 'Best Value' },
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
    return Array.from(new Set(fixtures.map((f) => f.matchDate))).filter(Boolean).sort();
  }, [fixtures]);

  const baseToday = useMemo(() => {
    const localToday = getStandardDateStr();
    const utcToday = new Date().toISOString().slice(0, 10);
    if (fixtures.some((f) => f.matchDate === localToday)) {
      return localToday;
    }
    if (fixtures.some((f) => f.matchDate === utcToday)) {
      return utcToday;
    }
    // Find nearest date >= localToday
    const upcomingDate = datasetDates.find((d) => d >= localToday || d >= utcToday);
    if (upcomingDate) return upcomingDate;
    // Fallback to latest available date or localToday
    return datasetDates[datasetDates.length - 1] || localToday;
  }, [fixtures, datasetDates]);

  const hasLoadedLiveRef = useRef<boolean>(false);

  useEffect(() => {
    hasLoadedLiveRef.current = false;
  }, [selectedLeague]);

  // Load predictions for live games directly from predictions db without periodic reload flicker
  useEffect(() => {
    let isCancelled = false;

    async function fetchLivePredictions(showSpinner: boolean) {
      try {
        if (showSpinner) {
          setIsLoadingLive(true);
        }
        const data = await EngineService.getLivePredictions(selectedLeague, 100);
        if (!isCancelled) {
          setLivePredictionsFixtures(data || []);
          hasLoadedLiveRef.current = true;
        }
      } catch (err) {
        console.error('Failed to load live predictions from db:', err);
      } finally {
        if (!isCancelled && showSpinner) {
          setIsLoadingLive(false);
        }
      }
    }

    if (activeScope === 'LIVE') {
      const needsInitialSpinner = !hasLoadedLiveRef.current && livePredictionsFixtures.length === 0;
      fetchLivePredictions(needsInitialSpinner);

      // Silent background polling every 60s that never toggles isLoadingLive or flashes the UI
      const timer = setInterval(() => {
        fetchLivePredictions(false);
      }, 60000);

      return () => {
        isCancelled = true;
        clearInterval(timer);
      };
    }

    return () => {
      isCancelled = true;
    };
  }, [activeScope, selectedLeague]);

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

  const getOffsetDate = (offsetDays: number) => {
    return getRelativeDateStr(offsetDays);
  };

  const uniqueFixtures = useMemo(() => {
    const seen = new Set<string>();
    return fixtures.filter((f) => {
      if (!f.id || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  }, [fixtures]);

  const filteredUpcomingFixtures = useMemo(() => {
    const todayStrs = Array.from(new Set([...getPossibleDateStrs(0), baseToday]));
    const tomorrowStrs = Array.from(new Set([...getPossibleDateStrs(1), getOffsetDate(1)]));
    const day2Strs = getPossibleDateStrs(2);
    const day6Strs = getPossibleDateStrs(6);
    const day2Str = getOffsetDate(2);
    const day6Str = getOffsetDate(6);
    const minToday = todayStrs.slice().sort()[0];
    const maxNext3 = [day2Strs[day2Strs.length - 1], day2Str].sort().pop()!;
    const maxWeek = [day6Strs[day6Strs.length - 1], day6Str].sort().pop()!;

    let matches = uniqueFixtures.filter((f) => {
      // Date filtering - resilient to UTC vs local timezone offsets
      if (dateFilter === 'TODAY') {
        if (!todayStrs.includes(f.matchDate)) return false;
      } else if (dateFilter === 'TOMORROW') {
        if (!tomorrowStrs.includes(f.matchDate)) return false;
      } else if (dateFilter === 'NEXT_3_DAYS') {
        if (f.matchDate < minToday || f.matchDate > maxNext3) return false;
      } else if (dateFilter === 'THIS_WEEK') {
        if (f.matchDate < minToday || f.matchDate > maxWeek) return false;
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

      // Exclude live matches from upcoming list
      if (f.status === 'LIVE') return false;

      return true;
    });

    return matches.slice().sort((a, b) => {
      const priorityA = getLeaguePriority(a.league, a.leagueName, a.stage);
      const priorityB = getLeaguePriority(b.league, b.leagueName, b.stage);
      if (priorityA !== priorityB) return priorityA - priorityB;
      if (a.matchDate !== b.matchDate) return a.matchDate.localeCompare(b.matchDate);
      return (a.kickOffTime || '').localeCompare(b.kickOffTime || '');
    });
  }, [fixtures, uniqueFixtures, dateFilter, selectedLeague, searchQuery, baseToday]);

  const liveFixtures: Fixture[] = useMemo(() => {
    // 1. Predictions loaded directly from separate predictions db
    const fromPredictionsDb = livePredictionsFixtures || [];

      // 2. Fixtures present in upcoming that are NOT marked LIVE (handled by liveFromScores)
    const liveFromFixtures = uniqueFixtures.filter((f) => f.status === 'LIVE');

    // 3. Fixtures derived from active live scores
    const liveFromScores: Fixture[] = (liveScores || []).map((s) => {
      const matchInPredictionsDb = fromPredictionsDb.find(
        (f) => f.id === s.fixtureId || f.id === `fs_${s.fixtureId}` || f.id.replace('fs_', '') === s.fixtureId
      );
      if (matchInPredictionsDb) {
        return {
          ...matchInPredictionsDb,
          minute: s.minute,
          score: { home: s.homeScore, away: s.awayScore },
          kickOffTime: s.status === 'FINISHED' ? 'FT' : (s.minute ? `${s.minute}'` : 'Live'),
        };
      }

      const matchInUpcoming = uniqueFixtures.find(
        (f) => f.id === s.fixtureId || f.id === `fs_${s.fixtureId}` || f.id.replace('fs_', '') === s.fixtureId
      );
      if (matchInUpcoming) {
        return {
          ...matchInUpcoming,
          status: 'LIVE' as const,
          minute: s.minute,
          score: { home: s.homeScore, away: s.awayScore },
          kickOffTime: s.status === 'FINISHED' ? 'FT' : (s.minute ? `${s.minute}'` : 'Live'),
        };
      }
      const { prediction, homeStats, awayStats } = ApexEngine.predictMatch(s.homeTeam, s.awayTeam, []);
      const odds = {
        homeWin: prediction.homeWinProb > 0 ? Number((1 / prediction.homeWinProb).toFixed(2)) : 2.20,
        draw: prediction.drawProb > 0 ? Number((1 / prediction.drawProb).toFixed(2)) : 3.30,
        awayWin: prediction.awayWinProb > 0 ? Number((1 / prediction.awayWinProb).toFixed(2)) : 3.20,
        over25: prediction.over25Prob > 0 ? Number((1 / prediction.over25Prob).toFixed(2)) : 1.90,
        under25: prediction.over25Prob < 1 ? Number((1 / (1 - prediction.over25Prob)).toFixed(2)) : 1.90,
      };
      const { markets, bestValueMarket } = ApexEngine.calculateMarkets(
        prediction,
        odds,
        {
          activeProvider: 'FLASHSCORE',
          rollingMatchWindow: 15,
          minEVThreshold: 1.10,
          safeWinThreshold: 0.72,
          homeAdvantageFactor: 1.12,
          formDecayRate: 0.85,
          autoSyncDaily: true,
        },
        s.homeTeam,
        s.awayTeam
      );

      return {
        id: s.fixtureId,
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
        odds,
        prediction,
        markets,
        bestValueMarket,
        homeStats,
        awayStats,
        measurements: prediction.measurements,
      };
    });

    const seen = new Set<string>();
    const combined: Fixture[] = [];
    // Prioritize fromPredictionsDb, then liveFromScores, then liveFromFixtures
    for (const f of [...fromPredictionsDb, ...liveFromScores, ...liveFromFixtures]) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        combined.push(f);
      }
    }

    combined.sort((a, b) => {
      const priorityA = getLeaguePriority(a.league, a.leagueName, a.stage);
      const priorityB = getLeaguePriority(b.league, b.leagueName, b.stage);
      if (priorityA !== priorityB) return priorityA - priorityB;
      return (a.kickOffTime || '').localeCompare(b.kickOffTime || '');
    });

    return combined;
  }, [livePredictionsFixtures, uniqueFixtures, liveScores, baseToday]);

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
          // Primary: Date Descending (Newest dates first)
          const dateA = normalizeDateStr(a.matchDate);
          const dateB = normalizeDateStr(b.matchDate);
          if (dateA !== dateB) return dateB.localeCompare(dateA);

          // Secondary: League Priority (Major leagues top within that date)
          const priorityA = getLeaguePriority(a.league, a.leagueName, a.stage);
          const priorityB = getLeaguePriority(b.league, b.leagueName, b.stage);
          if (priorityA !== priorityB) return priorityA - priorityB;

          // Tertiary: Time Descending
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
    if (marketChoiceFilter !== 'BEST_VALUE') count++;
    if (sortBy && sortBy !== 'DEFAULT') count++;
    return count;
  }, [selectedLeague, dateFilter, searchQuery, marketChoiceFilter, sortBy]);

  const handleResetAllFilters = () => {
    onSelectLeague('ALL');
    setDateFilter('TODAY');
    setMarketChoiceFilter('BEST_VALUE');
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
    const base = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();
      const dateStr = d.toISOString().slice(0, 10);
      days.push({ dayName, dayNum, dateStr, index: i });
    }
    return days;
  }, []);

  return (
    <div className="space-y-3 font-sans flex-1 flex flex-col">
      {/* Calendar Date Pills (Apex UI Geometry & Contrast) */}
      <div className="grid grid-cols-6 gap-1.5 sm:gap-2 w-full py-0.5">
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
              className={`w-full flex flex-col items-center justify-center py-2 px-1 sm:px-2 rounded-2xl sm:rounded-full transition-all cursor-pointer active:scale-95 ${
                isSelected
                  ? 'bg-[#121212] dark:bg-[#CCFF00] text-white dark:text-slate-950 shadow-md font-black scale-[1.03]'
                  : 'bg-white dark:bg-neutral-800/80 text-slate-800 dark:text-neutral-200 border border-slate-200/80 dark:border-neutral-700/80 hover:bg-slate-50 dark:hover:bg-neutral-700/80 font-bold'
              }`}
            >
              <span className="text-[9px] opacity-80 uppercase tracking-wider font-semibold truncate max-w-full">
                {cd.index === 0 ? 'Today' : cd.dayName}
              </span>
              <span className="text-xs sm:text-[13px] font-black">{cd.dayNum}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Scope Sub-Tabs: Upcoming, Live, History & Filters */}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
        <div className="flex items-center bg-white dark:bg-[#121212] p-1.5 rounded-full shrink-0 overflow-x-auto no-scrollbar flex-nowrap gap-1 border border-slate-200/80 dark:border-neutral-800 shadow-xs">
          <button
            id="subtab-upcoming-btn"
            type="button"
            onClick={() => setActiveScope('UPCOMING')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeScope === 'UPCOMING'
                ? 'bg-[#121212] dark:bg-[#CCFF00] text-white dark:text-slate-950 font-black shadow-xs'
                : 'text-slate-600 dark:text-neutral-400 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            Upcoming
          </button>

          <button
            id="subtab-live-btn"
            type="button"
            onClick={() => setActiveScope('LIVE')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              activeScope === 'LIVE'
                ? 'bg-[#121212] dark:bg-[#CCFF00] text-white dark:text-slate-950 font-black shadow-xs'
                : 'text-slate-600 dark:text-neutral-400 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <span className="whitespace-nowrap">Live</span>
            {liveScores && liveScores.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-[#CCFF00] text-slate-950 text-[10px] font-black">
                {liveScores.length}
              </span>
            )}
          </button>

          <button
            id="subtab-history-btn"
            type="button"
            onClick={() => setActiveScope('HISTORY')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeScope === 'HISTORY'
                ? 'bg-[#121212] dark:bg-[#CCFF00] text-white dark:text-slate-950 font-black shadow-xs'
                : 'text-slate-600 dark:text-neutral-400 hover:text-slate-950 dark:hover:text-white'
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
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 ${
              activeFilterCount > 0
                ? 'bg-[#CCFF00] text-slate-950 font-black'
                : 'bg-white dark:bg-neutral-800 border border-slate-200/80 dark:border-neutral-700 text-slate-800 dark:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-700'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-current" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="min-w-4 h-4 px-1 rounded-full bg-slate-950 text-[#CCFF00] text-[10px] font-black flex items-center justify-center">
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
        <div className="flex items-center gap-1.5 flex-wrap py-2 px-3 bg-slate-100/70 dark:bg-[#101728]/70 rounded-xl text-xs">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
            Active filters:
          </span>

          {selectedLeague !== 'ALL' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-[#162038] text-slate-900 dark:text-white font-medium shadow-xs text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">League:</span>
              <span className="truncate max-w-[130px] font-semibold">{selectedLeagueLabel}</span>
              <button
                type="button"
                onClick={() => onSelectLeague('ALL')}
                className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 cursor-pointer p-0.5"
                title="Remove league filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {dateFilter !== 'TODAY' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-[#162038] text-slate-900 dark:text-white font-medium shadow-xs text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">Date:</span>
              <span className="font-semibold">{dateOptionObj?.label || dateFilter}</span>
              <button
                type="button"
                onClick={() => setDateFilter('TODAY')}
                className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 cursor-pointer p-0.5"
                title="Reset date filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {marketChoiceFilter !== 'BEST_VALUE' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-[#162038] text-slate-900 dark:text-white font-medium shadow-xs text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">Market:</span>
              <span className="font-semibold">{marketOptionObj?.label || marketChoiceFilter}</span>
              <button
                type="button"
                onClick={() => setMarketChoiceFilter('BEST_VALUE')}
                className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 cursor-pointer p-0.5"
                title="Reset to Best Value"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {searchQuery.trim().length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-[#162038] text-slate-900 dark:text-white font-medium shadow-xs text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">Search:</span>
              <span className="truncate max-w-[110px] font-semibold">"{searchQuery}"</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 cursor-pointer p-0.5"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {sortBy && sortBy !== 'DEFAULT' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-[#162038] text-slate-900 dark:text-white font-medium shadow-xs text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">Sort:</span>
              <span className="font-semibold">{sortOptionObj?.label?.split('(')[0] || sortBy}</span>
              <button
                type="button"
                onClick={() => onSelectSortBy?.('DEFAULT')}
                className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 cursor-pointer p-0.5"
                title="Reset sort"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={handleResetAllFilters}
            className="ml-auto text-[11px] font-bold text-sky-600 dark:text-[#A3FF12] hover:underline px-1 py-0.5 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Match List Display */}
      {(isLoading && activeScope === 'UPCOMING') || (isLoadingHistory && activeScope === 'HISTORY') || (isLoadingLive && activeScope === 'LIVE') ? (
        <div className="bg-white dark:bg-[#0B0F17] rounded-2xl p-10 flex-1 min-h-[320px] flex flex-col items-center justify-center text-center border border-slate-100 dark:border-slate-800/80 shadow-xs">
          <div className="w-6 h-6 rounded-full border-2 border-slate-900 dark:border-slate-100 border-t-transparent animate-spin shrink-0 mx-auto" />
          <span className="mt-3 text-xs text-slate-500 dark:text-slate-400 font-bold">Loading match data...</span>
        </div>
      ) : displayedFixtures.length === 0 ? (
        <div className="bg-white dark:bg-[#0B0F17] rounded-2xl p-8 sm:p-12 flex-1 min-h-[320px] flex flex-col items-center justify-center text-center space-y-3 border border-slate-100 dark:border-slate-800/80 shadow-xs">
          <div className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
            <Filter className="w-5 h-5" />
          </div>
          <p className="text-sm font-extrabold text-slate-900 dark:text-white">
            {activeScope === 'UPCOMING'
              ? 'No upcoming fixtures found matching your criteria.'
              : activeScope === 'LIVE'
              ? 'No live matches currently in play.'
              : 'No historical matches found matching your criteria.'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto font-medium">
            {activeFilterCount > 0
              ? 'Some active filters or search terms may be narrowing down the results.'
              : activeScope === 'UPCOMING'
              ? 'Try choosing This Week or resetting your search filters.'
              : 'Try selecting a different league or clearing search.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Reset all filters ({activeFilterCount})
              </button>
            )}
            {activeScope === 'UPCOMING' && dateFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setDateFilter('ALL')}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Show all upcoming dates ({uniqueFixtures.length})
              </button>
            )}
            {activeScope === 'UPCOMING' && dateFilter === 'TODAY' && (
              <button
                type="button"
                onClick={() => setDateFilter('TOMORROW')}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Show tomorrow
              </button>
            )}
          </div>
        </div>
      ) : (
        <SimplifiedPredictionsWireframe
          fixtures={displayedFixtures}
          onSelectDetail={onSelectDetail}
          marketFilter={marketChoiceFilter as any}
          sortBy={sortBy}
          onSelectSortBy={onSelectSortBy}
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
