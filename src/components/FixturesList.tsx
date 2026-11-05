import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Filter, ChevronDown, Search, X, RefreshCw } from 'lucide-react';
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
  selectedFixtureId?: string | number;
  isProcessingActive?: boolean;
  onTriggerFullSync?: () => void;
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
  selectedFixtureId,
  isProcessingActive = false,
  onTriggerFullSync,
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
    { key: 'DAY_2', label: 'Day 2' },
    { key: 'DAY_3', label: 'Day 3' },
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
    return Array.from(new Set(fixtures.map((f) => normalizeDateStr(f.matchDate)))).filter(Boolean).sort();
  }, [fixtures]);

  const baseToday = useMemo(() => {
    const localToday = getStandardDateStr();
    const utcToday = new Date().toISOString().slice(0, 10);
    if (fixtures.some((f) => normalizeDateStr(f.matchDate) === localToday)) {
      return localToday;
    }
    if (fixtures.some((f) => normalizeDateStr(f.matchDate) === utcToday)) {
      return utcToday;
    }
    // Find nearest date >= localToday or utcToday
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
    const todayStr = getRelativeDateStr(0);
    const tomorrowStr = getRelativeDateStr(1);
    const day2Str = getRelativeDateStr(2);
    const day3Str = getRelativeDateStr(3);
    const next3Max = getRelativeDateStr(2);
    const weekMax = getRelativeDateStr(6);

    let matches = uniqueFixtures.filter((f) => {
      const matchDateNorm = normalizeDateStr(f.matchDate);

      // Date filtering strictly matching Flashscore UTC standard dates
      if (dateFilter === 'TODAY') {
        if (matchDateNorm !== todayStr && matchDateNorm !== baseToday) return false;
      } else if (dateFilter === 'TOMORROW') {
        if (matchDateNorm !== tomorrowStr) return false;
      } else if (dateFilter === 'DAY_2') {
        if (matchDateNorm !== day2Str) return false;
      } else if (dateFilter === 'DAY_3') {
        if (matchDateNorm !== day3Str) return false;
      } else if (dateFilter === 'NEXT_3_DAYS') {
        if (matchDateNorm < todayStr || matchDateNorm > next3Max) return false;
      } else if (dateFilter === 'THIS_WEEK') {
        if (matchDateNorm < todayStr || matchDateNorm > weekMax) return false;
      } else if (dateFilter !== 'ALL') {
        // Specific calendar date filter
        if (matchDateNorm !== normalizeDateStr(dateFilter)) return false;
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
    for (let i = 0; i < 6; i++) {
      const dateStr = getRelativeDateStr(i);
      const [y, m, dNum] = dateStr.split('-').map((p) => parseInt(p, 10));
      const utcDate = new Date(Date.UTC(y, m - 1, dNum));
      const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : utcDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      days.push({ dayName, dayNum: dNum, dateStr, index: i });
    }
    return days;
  }, []);

  return (
    <div className="space-y-2.5 font-sans flex-1 flex flex-col">
      {/* Calendar Date Selector Bar */}
      <div className="grid grid-cols-6 gap-1.5 sm:gap-2 w-full py-1">
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
              className={`w-full min-h-[52px] flex flex-col items-center justify-center py-1.5 px-1 sm:px-2 rounded-2xl transition-all cursor-pointer active:scale-95 ${
                isSelected
                  ? 'bg-[#FF001F] text-white shadow-md font-bold scale-[1.02]'
                  : 'bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] text-slate-800 dark:text-neutral-200 hover:bg-slate-50 dark:hover:bg-[#1E2027] shadow-xs'
              }`}
            >
              <span className={`text-[10px] sm:text-[11px] font-bold truncate max-w-full leading-none mb-1 ${
                isSelected ? 'text-white/90' : 'text-[#8F92A1] dark:text-[#9EA3B2]'
              }`}>
                {cd.index === 0 ? 'Today' : cd.dayName}
              </span>
              <span className={`text-xs sm:text-sm font-black font-mono tabular-nums leading-none ${
                isSelected ? 'text-white' : 'text-slate-900 dark:text-white'
              }`}>{cd.dayNum}</span>
            </button>
          );
        })}
      </div>

      {/* Scope Sub-Tabs: Upcoming, Live, History & Filters */}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
        <div className="flex items-center bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] p-1 rounded-2xl shrink-0 overflow-x-auto no-scrollbar flex-nowrap gap-1 shadow-xs">
          <button
            id="subtab-upcoming-btn"
            type="button"
            onClick={() => setActiveScope('UPCOMING')}
            className={`min-h-[34px] px-3.5 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center ${
              activeScope === 'UPCOMING'
                ? 'bg-[#FF001F] text-white font-extrabold shadow-xs'
                : 'text-[#8F92A1] dark:text-[#9EA3B2] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Upcoming
          </button>

          <button
            id="subtab-live-btn"
            type="button"
            onClick={() => setActiveScope('LIVE')}
            className={`min-h-[34px] px-3.5 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center gap-1.5 ${
              activeScope === 'LIVE'
                ? 'bg-[#FF001F] text-white font-extrabold shadow-xs'
                : 'text-[#8F92A1] dark:text-[#9EA3B2] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
            <span className="whitespace-nowrap">Live</span>
            {liveScores && liveScores.length > 0 && (
              <span className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] sm:text-xs font-black font-mono tabular-nums ${
                activeScope === 'LIVE'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#FF001F]/10 text-[#FF001F]'
              }`}>
                {liveScores.length}
              </span>
            )}
          </button>

          <button
            id="subtab-history-btn"
            type="button"
            onClick={() => setActiveScope('HISTORY')}
            className={`min-h-[34px] px-3.5 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center ${
              activeScope === 'HISTORY'
                ? 'bg-[#FF001F] text-white font-extrabold shadow-xs'
                : 'text-[#8F92A1] dark:text-[#9EA3B2] hover:text-slate-900 dark:hover:text-white'
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
            className={`min-h-[36px] flex items-center justify-center gap-1.5 px-3.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 ${
              activeFilterCount > 0
                ? 'bg-[#FF001F] text-white font-extrabold'
                : 'bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] text-slate-800 dark:text-neutral-200 hover:bg-slate-50 dark:hover:bg-[#1E2027]'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-current" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="min-w-4 h-4 px-1 rounded-full bg-white text-[#FF001F] text-[10px] sm:text-xs font-black font-mono tabular-nums flex items-center justify-center">
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
        <div className="flex items-center gap-1.5 flex-wrap py-2 px-3 bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] rounded-2xl text-xs">
          <span className="text-xs font-bold text-[#8F92A1] dark:text-[#9EA3B2] shrink-0">
            Active filters:
          </span>

          {selectedLeague !== 'ALL' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#1E2027] text-slate-900 dark:text-white font-medium text-xs">
              <span className="text-[#8F92A1] dark:text-[#9EA3B2]">League:</span>
              <span className="truncate max-w-[130px] font-semibold">{selectedLeagueLabel}</span>
              <button
                type="button"
                onClick={() => onSelectLeague('ALL')}
                className="text-slate-400 hover:text-[#FF001F] cursor-pointer p-0.5"
                title="Remove league filter"
                aria-label="Remove league filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {dateFilter !== 'TODAY' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#1E2027] text-slate-900 dark:text-white font-medium text-xs">
              <span className="text-[#8F92A1] dark:text-[#9EA3B2]">Date:</span>
              <span className="font-semibold">{dateOptionObj?.label || dateFilter}</span>
              <button
                type="button"
                onClick={() => setDateFilter('TODAY')}
                className="text-slate-400 hover:text-[#FF001F] cursor-pointer p-0.5"
                title="Reset date filter"
                aria-label="Reset date filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {marketChoiceFilter !== 'BEST_VALUE' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#1E2027] text-slate-900 dark:text-white font-medium text-xs">
              <span className="text-[#8F92A1] dark:text-[#9EA3B2]">Market:</span>
              <span className="font-semibold">{marketOptionObj?.label || marketChoiceFilter}</span>
              <button
                type="button"
                onClick={() => setMarketChoiceFilter('BEST_VALUE')}
                className="text-slate-400 hover:text-[#FF001F] cursor-pointer p-0.5"
                title="Reset to Best Value"
                aria-label="Reset market filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {searchQuery.trim().length > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#1E2027] text-slate-900 dark:text-white font-medium text-xs">
              <span className="text-[#8F92A1] dark:text-[#9EA3B2]">Search:</span>
              <span className="truncate max-w-[110px] font-semibold">"{searchQuery}"</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-[#FF001F] cursor-pointer p-0.5"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {sortBy && sortBy !== 'DEFAULT' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#1E2027] text-slate-900 dark:text-white font-medium text-xs">
              <span className="text-[#8F92A1] dark:text-[#9EA3B2]">Sort:</span>
              <span className="font-semibold">{sortOptionObj?.label?.split('(')[0] || sortBy}</span>
              <button
                type="button"
                onClick={() => onSelectSortBy?.('DEFAULT')}
                className="text-slate-400 hover:text-[#FF001F] cursor-pointer p-0.5"
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
            className="ml-auto text-xs font-bold text-[#FF001F] hover:underline px-1 py-0.5 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Match List Display */}
      {(isLoading && activeScope === 'UPCOMING') || (isLoadingHistory && activeScope === 'HISTORY') || (isLoadingLive && activeScope === 'LIVE') ? (
        <div className="bg-white dark:bg-[#121216] rounded-3xl p-10 flex-1 min-h-[320px] flex flex-col items-center justify-center text-center shadow-xs">
          <div className="w-6 h-6 rounded-full border-2 border-slate-900 dark:border-[#CCFF00] border-t-transparent animate-spin shrink-0 mx-auto" />
          <span className="mt-3 text-xs text-slate-500 dark:text-neutral-400 font-bold">Loading match data...</span>
        </div>
      ) : displayedFixtures.length === 0 ? (
        <div className="bg-white dark:bg-[#121216] rounded-3xl p-8 sm:p-12 flex-1 min-h-[340px] flex flex-col items-center justify-center text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-[#CCFF00]/15 dark:bg-[#CCFF00]/10 flex items-center justify-center text-slate-950 dark:text-[#CCFF00] shadow-xs">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              {activeScope === 'UPCOMING'
                ? 'No upcoming fixtures found in database'
                : activeScope === 'LIVE'
                ? 'No live matches currently in play'
                : 'No historical matches found in database'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
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
                className="px-4 py-2.5 bg-slate-950 text-[#CCFF00] hover:bg-slate-900 dark:bg-[#CCFF00] dark:hover:bg-[#b8e600] dark:text-slate-950 rounded-xl text-xs font-black transition-all cursor-pointer shadow-md active:scale-95 flex items-center gap-2"
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
