import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Filter, ChevronDown, Search, X } from 'lucide-react';
import { GLOBAL_LEAGUES_DATASET } from '../core/globalLeaguesDataset.js';
import { Fixture } from '../core/types.js';
import { LiveScore } from '../providers/types.js';
import { getRelativeDateStr } from '../core/dateUtils.js';
import { FixtureCard } from './FixtureCard.js';
import { SimplifiedPredictionsWireframe } from './SimplifiedPredictionsWireframe.js';
import { LeagueSelectorModal } from './LeagueSelectorModal.js';
import { FixturesFilterModal } from './FixturesFilterModal.js';
import { EngineService } from '../services/engineService.js';
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

function getTipProb(fixture: Fixture): number {
  const p = fixture.prediction;
  if (!p) return 45;
  const h = p.homeWinProb ?? 0;
  const d = p.drawProb ?? 0;
  const a = p.awayWinProb ?? 0;
  return Math.round(Math.max(h, d, a) * 100);
}

function getHomeProb(fixture: Fixture): number {
  return fixture.prediction?.homeWinProb !== undefined
    ? Math.round(fixture.prediction.homeWinProb * 100)
    : 45;
}

function getDrawProb(fixture: Fixture): number {
  return fixture.prediction?.drawProb !== undefined
    ? Math.round(fixture.prediction.drawProb * 100)
    : 28;
}

function getAwayProb(fixture: Fixture): number {
  return fixture.prediction?.awayWinProb !== undefined
    ? Math.round(fixture.prediction.awayWinProb * 100)
    : 27;
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
    const localToday = getRelativeDateStr(0);
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

  // Load predictions for live games directly from predictions db
  useEffect(() => {
    let isCancelled = false;
    async function fetchLivePredictions() {
      try {
        setIsLoadingLive(true);
        const data = await EngineService.getLivePredictions(selectedLeague, 100);
        if (!isCancelled) {
          setLivePredictionsFixtures(data || []);
        }
      } catch (err) {
        console.error('Failed to load live predictions from db:', err);
      } finally {
        if (!isCancelled) {
          setIsLoadingLive(false);
        }
      }
    }

    if (activeScope === 'LIVE') {
      fetchLivePredictions();
    }

    return () => {
      isCancelled = true;
    };
  }, [activeScope, selectedLeague, liveScores]);

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
    try {
      const parts = baseToday.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        d.setDate(d.getDate() + offsetDays);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch {
      // fallback
    }
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
    const localToday = getRelativeDateStr(0);
    const utcToday = new Date().toISOString().slice(0, 10);
    const todayStr = baseToday;
    const tomorrowStr = getOffsetDate(1);
    const localTomorrow = getRelativeDateStr(1);
    const next3DaysStr = getOffsetDate(2);
    const thisWeekStr = getOffsetDate(6);

    let matches = uniqueFixtures.filter((f) => {
      // Date filtering - resilient to UTC vs local timezone offsets
      if (dateFilter === 'TODAY') {
        if (f.matchDate !== todayStr && f.matchDate !== localToday && f.matchDate !== utcToday) return false;
      } else if (dateFilter === 'TOMORROW') {
        if (f.matchDate !== tomorrowStr && f.matchDate !== localTomorrow) return false;
      } else if (dateFilter === 'NEXT_3_DAYS') {
        const minDate = todayStr < localToday ? todayStr : localToday;
        if (f.matchDate < minDate || f.matchDate > next3DaysStr) return false;
      } else if (dateFilter === 'THIS_WEEK') {
        const minDate = todayStr < localToday ? todayStr : localToday;
        if (f.matchDate < minDate || f.matchDate > thisWeekStr) return false;
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
      return {
        id: s.fixtureId,
        providerId: 'FLASHSCORE',
        league: s.league || 'ALL',
        leagueName: s.leagueName || 'Live In-Play',
        matchDate: baseToday,
        kickOffTime: s.status === 'FINISHED' ? 'FT' : `${s.minute}'`,
        homeTeam: s.homeTeam,
        awayTeam: s.awayTeam,
        status: 'LIVE' as const,
        minute: s.minute,
        score: { home: s.homeScore, away: s.awayScore },
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
          const priorityA = getLeaguePriority(a.league, a.leagueName, a.stage);
          const priorityB = getLeaguePriority(b.league, b.leagueName, b.stage);
          if (priorityA !== priorityB) return priorityA - priorityB;
          return b.matchDate.localeCompare(a.matchDate);
        });
      return applySort(filtered);
    }

    return applySort(filteredUpcomingFixtures);
  }, [activeScope, filteredUpcomingFixtures, liveFixtures, historyFixtures, selectedLeague, searchQuery, sortBy]);

  return (
    <div className="space-y-1.5 font-sans flex-1 flex flex-col">
      {/* Scope Sub-Tabs: Upcoming, Live, History placed above match list */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg shadow-inner shrink-0 overflow-x-auto no-scrollbar flex-nowrap gap-0.5">
          <button
            id="subtab-upcoming-btn"
            type="button"
            onClick={() => setActiveScope('UPCOMING')}
            className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeScope === 'UPCOMING'
                ? 'bg-white text-black shadow-xs'
                : 'text-zinc-600 hover:text-black'
            }`}
          >
            Upcoming
          </button>

          <button
            id="subtab-live-btn"
            type="button"
            onClick={() => setActiveScope('LIVE')}
            className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 ${
              activeScope === 'LIVE'
                ? 'bg-white text-black shadow-xs'
                : 'text-zinc-600 hover:text-black'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse shrink-0" />
            <span className="whitespace-nowrap">Live</span>
          </button>

          <button
            id="subtab-history-btn"
            type="button"
            onClick={() => setActiveScope('HISTORY')}
            className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeScope === 'HISTORY'
                ? 'bg-white text-black shadow-xs'
                : 'text-zinc-600 hover:text-black'
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
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer shadow-xs ${
              sortBy && sortBy !== 'DEFAULT'
                ? 'bg-zinc-50 text-zinc-700 border border-zinc-300'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            <Filter className="w-3 h-3 text-zinc-500" />
            <span>Filters</span>
            {sortBy && sortBy !== 'DEFAULT' && (
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse" title="Percentage sort active" />
            )}
            <ChevronDown className="w-3 h-3 text-zinc-400" />
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
          leagueOptions={leagueOptions}
          dateOptions={dateOptions}
          marketOptions={marketOptions}
          sortOptions={sortOptions}
        />
      </div>

      {/* Match List Display (Wireframe or Cards) */}
      {(isLoading && activeScope === 'UPCOMING') || (isLoadingHistory && activeScope === 'HISTORY') || (isLoadingLive && activeScope === 'LIVE') ? (
        <div className="bg-white rounded-xl sm:rounded-2xl p-8 sm:p-12 flex-1 min-h-[360px] flex flex-col items-center justify-center text-center shadow-xs">
          <div className="w-8 h-8 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin shrink-0 mx-auto" />
        </div>
      ) : displayedFixtures.length === 0 ? (
        <div className="bg-white rounded-xl sm:rounded-2xl p-8 flex-1 min-h-[360px] flex flex-col items-center justify-center text-center shadow-sm space-y-3">
          <p className="text-sm font-bold text-zinc-700">
            {activeScope === 'UPCOMING'
              ? 'No upcoming fixtures found matching your criteria.'
              : activeScope === 'LIVE'
              ? 'No live matches currently in play.'
              : 'No historical matches found matching your criteria.'}
          </p>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            {activeScope === 'UPCOMING'
              ? 'Try choosing All Dates or resetting your search filters.'
              : 'Try selecting a different league or clearing search.'}
          </p>
          {activeScope === 'UPCOMING' && dateFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setDateFilter('ALL')}
              className="mt-1 px-4 py-2 bg-black text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors cursor-pointer shadow-xs"
            >
              Show All Dates
            </button>
          )}
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
