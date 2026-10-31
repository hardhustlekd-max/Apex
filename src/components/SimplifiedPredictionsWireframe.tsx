import React, { useState, useMemo, useEffect } from 'react';
import { Fixture, MarketOption } from '../core/types.js';
import { getLeaguePriority } from '../core/leaguePriority.js';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
} from 'lucide-react';

interface SimplifiedPredictionsWireframeProps {
  fixtures: Fixture[];
  onSelectDetail: (fixture: Fixture) => void;
  marketFilter?: 'BEST_VALUE' | 'OVER_UNDER' | '1X2' | 'BTTS';
  sortBy?: 'DEFAULT' | 'PROB_DESC' | 'PROB_ASC' | 'HOME_DESC' | 'DRAW_DESC' | 'AWAY_DESC';
  onSelectSortBy?: (s: 'DEFAULT' | 'PROB_DESC' | 'PROB_ASC' | 'HOME_DESC' | 'DRAW_DESC' | 'AWAY_DESC') => void;
  selectedFixtureId?: string | number;
}

import {
  formatProb,
  getProbValue,
  getAuthoritative1X2Pick,
  getAuthoritativeValueBet,
  getHighestPredictionAcrossAllMarkets,
} from '../core/formatters.js';

function getTipProb(fixture: Fixture, marketFilter: string = 'BEST_VALUE'): number {
  if (marketFilter === 'OVER_UNDER') {
    const o = getProbValue(fixture.prediction?.over25Prob, 1);
    return Math.max(o, getProbValue(100 - o, 1));
  }
  if (marketFilter === 'BTTS') {
    const y = getProbValue(fixture.prediction?.bttsProb, 1);
    return Math.max(y, getProbValue(100 - y, 1));
  }
  if (marketFilter === '1X2') {
    return getAuthoritative1X2Pick(fixture).probabilityPercent;
  }
  return getHighestPredictionAcrossAllMarkets(fixture).probabilityPercent;
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

function getOver25Prob(fixture: Fixture): number {
  return getProbValue(fixture.prediction?.over25Prob, 1);
}

function getUnder25Prob(fixture: Fixture): number {
  const over = getProbValue(fixture.prediction?.over25Prob, 1);
  return Number((100 - over).toFixed(1));
}

function getBttsYesProb(fixture: Fixture): number {
  return getProbValue(fixture.prediction?.bttsProb, 1);
}

function getBttsNoProb(fixture: Fixture): number {
  const yes = getProbValue(fixture.prediction?.bttsProb, 1);
  return Number((100 - yes).toFixed(1));
}

export const SimplifiedPredictionsWireframe: React.FC<SimplifiedPredictionsWireframeProps> = ({
  fixtures,
  onSelectDetail,
  marketFilter = 'BEST_VALUE',
  sortBy = 'DEFAULT',
  onSelectSortBy,
  selectedFixtureId,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  useEffect(() => {
    setCurrentPage(1);
  }, [marketFilter, sortBy]);

  const uniqueFixtures = useMemo(() => {
    const seen = new Set<string>();
    const list = fixtures.filter((f) => {
      if (!f.id || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });

    if (sortBy && sortBy !== 'DEFAULT') {
      return list.slice().sort((a, b) => {
        if (sortBy === 'PROB_DESC') return getTipProb(b) - getTipProb(a);
        if (sortBy === 'PROB_ASC') return getTipProb(a) - getTipProb(b);
        if (sortBy === 'HOME_DESC') return getHomeProb(b) - getHomeProb(a);
        if (sortBy === 'DRAW_DESC') return getDrawProb(b) - getDrawProb(a);
        if (sortBy === 'AWAY_DESC') return getAwayProb(b) - getAwayProb(a);
        return 0;
      });
    }

    return list.slice().sort((a, b) => {
      const pa = getLeaguePriority(a.league, a.leagueName, a.stage);
      const pb = getLeaguePriority(b.league, b.leagueName, b.stage);
      if (pa !== pb) return pa - pb;
      if (a.matchDate !== b.matchDate) return a.matchDate.localeCompare(b.matchDate);
      return (a.kickOffTime || '').localeCompare(b.kickOffTime || '');
    });
  }, [fixtures, sortBy]);

  const totalPages = Math.max(1, Math.ceil(uniqueFixtures.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedFixtures = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return uniqueFixtures.slice(startIndex, startIndex + pageSize);
  }, [uniqueFixtures, safeCurrentPage, pageSize]);

  const startItemIndex = uniqueFixtures.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItemIndex = Math.min(safeCurrentPage * pageSize, uniqueFixtures.length);

  const groupedByLeague = useMemo(() => {
    interface LeagueGroup {
      leagueName: string;
      subDivision?: string;
      headerKey: string;
      fixtures: Fixture[];
    }

    const groupMap = new Map<string, LeagueGroup>();

    for (const fixture of paginatedFixtures) {
      const leagueKey = fixture.league || 'Other';
      const leagueName = fixture.leagueName || fixture.league || 'Other Competition';
      const subDivision = fixture.stage || fixture.leagueName || fixture.league;
      const headerKey = `${leagueKey}_${subDivision}`;

      if (!groupMap.has(headerKey)) {
        groupMap.set(headerKey, {
          leagueName,
          subDivision,
          headerKey,
          fixtures: [],
        });
      }
      groupMap.get(headerKey)!.fixtures.push(fixture);
    }

    return Array.from(groupMap.values());
  }, [paginatedFixtures]);

  const renderFixtureRow = (fixture: Fixture, showLeagueInRow: boolean) => {
    const isLive = fixture.status === 'LIVE';
    const kickOff = fixture.kickOffTime || '19:00';
    const pick = getAuthoritative1X2Pick(fixture);
    const valueBet = getAuthoritativeValueBet(fixture);

    const homeProb = getHomeProb(fixture);
    const drawProb = getDrawProb(fixture);
    const awayProb = getAwayProb(fixture);
    const over25 = getOver25Prob(fixture);
    const under25 = getUnder25Prob(fixture);
    const bttsYes = getBttsYesProb(fixture);
    const bttsNo = getBttsNoProb(fixture);

    const isSelected = selectedFixtureId !== undefined && String(selectedFixtureId) === String(fixture.id);

    return (
      <div
        key={fixture.id}
        onClick={() => onSelectDetail(fixture)}
        className={`group grid grid-cols-12 items-center px-3 sm:px-4 py-2 sm:py-2.5 transition-all cursor-pointer gap-2 ${
          isSelected
            ? 'bg-slate-100/90 dark:bg-[#1E1E26] shadow-xs'
            : isLive
            ? 'bg-rose-50/20 dark:bg-rose-950/20 hover:bg-rose-50/40 dark:hover:bg-rose-950/40'
            : 'hover:bg-slate-50 dark:hover:bg-[#18181D]/80'
        }`}
      >
        {/* Match Info Column */}
        <div className="col-span-6 sm:col-span-6 flex flex-col justify-center min-w-0 pr-1.5">
          {/* Home Team */}
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              {fixture.homeBadge ? (
                <img
                  src={fixture.homeBadge}
                  alt=""
                  className="w-4 h-4 object-contain shrink-0 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-4 h-4 rounded-full bg-slate-100 dark:bg-[#18181D] text-[10px] font-bold flex items-center justify-center shrink-0">
                  {fixture.homeTeam.slice(0, 1)}
                </div>
              )}
              <span
                className="font-bold text-xs sm:text-[13px] truncate whitespace-nowrap text-slate-900 dark:text-white"
                title={fixture.homeTeam}
              >
                {fixture.homeTeam}
              </span>
            </div>
            {fixture.score && fixture.score.home !== undefined && (
              <span
                className={`font-mono tabular-nums text-xs sm:text-[13px] shrink-0 ${
                  isLive
                    ? 'text-rose-600 dark:text-rose-400 font-black px-1.5 py-0.2 rounded-full bg-rose-100 dark:bg-rose-950/60'
                    : 'text-slate-900 dark:text-[#CCFF00] font-black'
                }`}
              >
                {fixture.score.home}
              </span>
            )}
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-between gap-1.5 min-w-0 mt-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {fixture.awayBadge ? (
                <img
                  src={fixture.awayBadge}
                  alt=""
                  className="w-4 h-4 object-contain shrink-0 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-4 h-4 rounded-full bg-slate-100 dark:bg-[#18181D] text-[10px] font-bold flex items-center justify-center shrink-0">
                  {fixture.awayTeam.slice(0, 1)}
                </div>
              )}
              <span
                className="font-semibold text-xs sm:text-[13px] truncate whitespace-nowrap text-slate-600 dark:text-slate-300"
                title={fixture.awayTeam}
              >
                {fixture.awayTeam}
              </span>
            </div>
            {fixture.score && fixture.score.away !== undefined && (
              <span
                className={`font-mono tabular-nums text-xs sm:text-[13px] shrink-0 ${
                  isLive
                    ? 'text-rose-600 dark:text-rose-400 font-black px-1.5 py-0.2 rounded-full bg-rose-100 dark:bg-rose-950/60'
                    : 'text-slate-900 dark:text-[#CCFF00] font-black'
                }`}
              >
                {fixture.score.away}
              </span>
            )}
          </div>

          {/* Subtext info: Kickoff time, Status, League */}
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums whitespace-nowrap min-w-0 truncate">
            {isLive ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-bold text-[10px] animate-pulse shrink-0">
                <span className="w-1 h-1 rounded-full bg-white" />
                <span>LIVE {fixture.minute ? `${fixture.minute}'` : ''}</span>
              </span>
            ) : null}
            {showLeagueInRow && (
              <>
                <span
                  className="text-slate-400 dark:text-slate-500 truncate max-w-[90px] font-medium"
                  title={fixture.leagueName || fixture.league}
                >
                  {fixture.leagueName || fixture.league}
                </span>
                <span className="text-slate-300 dark:text-slate-700 shrink-0">·</span>
              </>
            )}
            {!isLive && (
              <span className="text-blue-600 dark:text-[#CCFF00] shrink-0 font-bold font-mono tabular-nums">
                {kickOff}
              </span>
            )}
            {isLive && fixture.minute && (
              <span className="text-blue-600 dark:text-[#CCFF00] shrink-0 font-bold font-mono tabular-nums">
                {fixture.minute}'
              </span>
            )}
          </div>
        </div>

        {/* Prediction Data Columns */}
        <div className="col-span-6 sm:col-span-6 flex items-center justify-end gap-2 sm:gap-3 shrink-0">
          {/* Section 1: Highest Probability Pick */}
          <div
            className="flex items-center justify-center shrink-0"
            title={`Model Pick: ${pick.label} (${pick.probabilityFormatted})`}
          >
            <div className="flex items-center gap-1 font-mono tabular-nums">
              <span className="w-8 sm:w-9 h-6 sm:h-6.5 flex items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 text-xs font-bold whitespace-nowrap shrink-0 shadow-xs font-mono tabular-nums">
                {pick.shortLabel}
              </span>
              <span className="hidden sm:inline text-xs font-bold text-slate-700 dark:text-slate-200 font-mono tabular-nums">
                {pick.probabilityPercent.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Section 2: Probabilities */}
          <div className="flex items-center justify-end gap-1 font-mono tabular-nums text-xs font-bold shrink-0 whitespace-nowrap">
            {marketFilter === 'OVER_UNDER' ? (
              <>
                <span
                  className={`w-8 sm:w-9 h-6 sm:h-6.5 flex items-center justify-center rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors font-mono tabular-nums ${
                    over25 >= 50
                      ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 font-bold shadow-xs'
                      : 'bg-slate-100 dark:bg-[#18181D] text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {over25.toFixed(0)}
                </span>
                <span
                  className={`w-8 sm:w-9 h-6 sm:h-6.5 flex items-center justify-center rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors font-mono tabular-nums ${
                    under25 >= 50
                      ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 font-bold shadow-xs'
                      : 'bg-slate-100 dark:bg-[#18181D] text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {under25.toFixed(0)}
                </span>
              </>
            ) : marketFilter === 'BTTS' ? (
              <>
                <span
                  className={`w-8 sm:w-9 h-6 sm:h-6.5 flex items-center justify-center rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors font-mono tabular-nums ${
                    bttsYes >= 50
                      ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 font-bold shadow-xs'
                      : 'bg-slate-100 dark:bg-[#18181D] text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {bttsYes.toFixed(0)}
                </span>
                <span
                  className={`w-8 sm:w-9 h-6 sm:h-6.5 flex items-center justify-center rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors font-mono tabular-nums ${
                    bttsNo >= 50
                      ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 font-bold shadow-xs'
                      : 'bg-slate-100 dark:bg-[#18181D] text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {bttsNo.toFixed(0)}
                </span>
              </>
            ) : (
              <>
                <span
                  className={`w-8 sm:w-8.5 h-6 sm:h-6.5 flex items-center justify-center rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors font-mono tabular-nums ${
                    homeProb >= 50
                      ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 font-bold shadow-xs'
                      : homeProb >= 35
                      ? 'bg-slate-200 dark:bg-[#27272A] text-slate-900 dark:text-white font-bold'
                      : 'bg-slate-100 dark:bg-[#18181D] text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {homeProb.toFixed(0)}
                </span>
                <span
                  className={`w-8 sm:w-8.5 h-6 sm:h-6.5 flex items-center justify-center rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors font-mono tabular-nums ${
                    drawProb >= 35
                      ? 'bg-amber-500/15 text-amber-700 dark:text-[#CCFF00] font-bold'
                      : 'bg-slate-100 dark:bg-[#18181D] text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {drawProb.toFixed(0)}
                </span>
                <span
                  className={`w-8 sm:w-8.5 h-6 sm:h-6.5 flex items-center justify-center rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors font-mono tabular-nums ${
                    awayProb >= 50
                      ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 font-bold shadow-xs'
                      : awayProb >= 35
                      ? 'bg-slate-200 dark:bg-[#27272A] text-slate-900 dark:text-white font-bold'
                      : 'bg-slate-100 dark:bg-[#18181D] text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {awayProb.toFixed(0)}
                </span>
              </>
            )}
          </div>

          {/* Wireframe Chevron Right Affordance */}
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-900 dark:group-hover:text-[#CCFF00] group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </div>
    );
  };

  const isPercentageSortActive = sortBy && sortBy !== 'DEFAULT';

    return (
    <div className="w-full max-w-full space-y-2.5 text-slate-900 dark:text-slate-100 font-sans">
      {paginatedFixtures.length === 0 ? (
        <div className="p-8 text-center text-slate-400 dark:text-neutral-500 bg-white dark:bg-[#121216] rounded-2xl shadow-xs font-bold text-xs">
          No matches found for the selected filters.
        </div>
      ) : isPercentageSortActive ? (
        <div className="rounded-2xl overflow-hidden bg-white dark:bg-[#121216] shadow-xs transition-all">
          {/* Header */}
          <div className="bg-slate-100 dark:bg-[#18181D] grid grid-cols-12 items-center px-3 sm:px-4 py-2 sm:py-2.5 gap-2 font-black text-xs select-none">
            <div className="col-span-6 sm:col-span-6 flex items-center gap-1.5 min-w-0 pr-1.5">
              <span className="truncate whitespace-nowrap font-extrabold uppercase text-xs text-slate-900 dark:text-white">Match & League</span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono tabular-nums font-bold bg-slate-200 dark:bg-[#121216] text-slate-800 dark:text-[#CCFF00]">
                {sortBy === 'PROB_DESC' && 'Pick % (High → Low)'}
                {sortBy === 'PROB_ASC' && 'Pick % (Low → High)'}
                {sortBy === 'HOME_DESC' && 'Home Win % (1)'}
                {sortBy === 'DRAW_DESC' && 'Draw % (X)'}
                {sortBy === 'AWAY_DESC' && 'Away Win % (2)'}
              </span>
            </div>
            <div className="col-span-6 sm:col-span-6 flex items-center justify-end gap-2 sm:gap-3 shrink-0">
              <div className="flex items-center justify-center shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onSelectSortBy?.(sortBy === 'PROB_DESC' ? 'PROB_ASC' : 'PROB_DESC')
                  }
                  className="min-h-[32px] flex items-center justify-center gap-1 font-mono tabular-nums text-xs font-bold text-slate-600 dark:text-neutral-300 hover:text-sky-600 dark:hover:text-[#CCFF00] cursor-pointer"
                  title="Sort by Model Pick Probability"
                  aria-label="Sort by Model Pick Probability"
                >
                  <span>PICK</span>
                  {sortBy === 'PROB_DESC' && <ArrowDown className="w-3 h-3 text-sky-600 dark:text-[#CCFF00]" />}
                  {sortBy === 'PROB_ASC' && <ArrowUp className="w-3 h-3 text-sky-600 dark:text-[#CCFF00]" />}
                  {sortBy !== 'PROB_DESC' && sortBy !== 'PROB_ASC' && (
                    <ArrowUpDown className="w-3 h-3 opacity-50" />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-end gap-1 font-mono tabular-nums text-xs font-bold text-slate-600 dark:text-neutral-300 shrink-0">
                {marketFilter === 'OVER_UNDER' ? (
                  <>
                    <span className="w-8 sm:w-9 text-center">O 2.5</span>
                    <span className="w-8 sm:w-9 text-center">U 2.5</span>
                  </>
                ) : marketFilter === 'BTTS' ? (
                  <>
                    <span className="w-8 sm:w-9 text-center">YES</span>
                    <span className="w-8 sm:w-9 text-center">NO</span>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectSortBy?.(sortBy === 'HOME_DESC' ? 'DEFAULT' : 'HOME_DESC')
                      }
                      className={`min-h-[32px] w-8 sm:w-8.5 flex items-center justify-center gap-0.5 rounded-lg cursor-pointer hover:text-sky-600 dark:hover:text-[#CCFF00] ${
                        sortBy === 'HOME_DESC' ? 'text-sky-600 dark:text-[#CCFF00] font-black' : ''
                      }`}
                      title="Sort by Home Win %"
                      aria-label="Sort by Home Win %"
                    >
                      <span>1</span>
                      {sortBy === 'HOME_DESC' && <ArrowDown className="w-2.5 h-2.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectSortBy?.(sortBy === 'DRAW_DESC' ? 'DEFAULT' : 'DRAW_DESC')
                      }
                      className={`min-h-[32px] w-8 sm:w-8.5 flex items-center justify-center gap-0.5 rounded-lg cursor-pointer hover:text-sky-600 dark:hover:text-[#CCFF00] ${
                        sortBy === 'DRAW_DESC' ? 'text-sky-600 dark:text-[#CCFF00] font-black' : ''
                      }`}
                      title="Sort by Draw %"
                      aria-label="Sort by Draw %"
                    >
                      <span>X</span>
                      {sortBy === 'DRAW_DESC' && <ArrowDown className="w-2.5 h-2.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectSortBy?.(sortBy === 'AWAY_DESC' ? 'DEFAULT' : 'AWAY_DESC')
                      }
                      className={`min-h-[32px] w-8 sm:w-8.5 flex items-center justify-center gap-0.5 rounded-lg cursor-pointer hover:text-sky-600 dark:hover:text-[#CCFF00] ${
                        sortBy === 'AWAY_DESC' ? 'text-sky-600 dark:text-[#CCFF00] font-black' : ''
                      }`}
                      title="Sort by Away Win %"
                      aria-label="Sort by Away Win %"
                    >
                      <span>2</span>
                      {sortBy === 'AWAY_DESC' && <ArrowDown className="w-2.5 h-2.5" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-[#121216]">
            {paginatedFixtures.map((fixture) => renderFixtureRow(fixture, true))}
          </div>
        </div>
      ) : (
        groupedByLeague.map((group) => (
          <div
            key={group.headerKey}
            className="rounded-2xl overflow-hidden bg-white dark:bg-[#121216] shadow-xs mb-3 transition-all"
          >
            {/* Box Header per League */}
            <div className="bg-slate-100 dark:bg-[#18181D] grid grid-cols-12 items-center px-3 sm:px-4 py-2 sm:py-2.5 gap-2 font-black text-xs select-none">
              <div className="col-span-6 sm:col-span-6 flex items-center min-w-0 pr-1.5">
                <span className="truncate whitespace-nowrap font-extrabold text-slate-900 dark:text-white text-xs sm:text-[13px] uppercase tracking-wide">
                  {group.subDivision || group.leagueName}
                </span>
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-mono tabular-nums font-bold bg-slate-200 dark:bg-[#121216] text-slate-800 dark:text-[#CCFF00]">
                  {group.fixtures.length}
                </span>
              </div>
              <div className="col-span-6 sm:col-span-6 flex items-center justify-end gap-2 sm:gap-3 shrink-0">
                <div className="flex items-center justify-center shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectSortBy?.('PROB_DESC')}
                    className="min-h-[32px] flex items-center justify-center gap-1 font-mono tabular-nums text-xs font-bold text-slate-600 dark:text-neutral-300 hover:text-sky-600 dark:hover:text-[#CCFF00] cursor-pointer"
                    title="Click to sort table by Model Pick %"
                    aria-label="Sort table by Model Pick %"
                  >
                    <span>PICK</span>
                    <ArrowUpDown className="w-3 h-3 opacity-50" />
                  </button>
                </div>
                <div className="flex items-center justify-end gap-1 font-mono tabular-nums text-xs font-bold text-slate-600 dark:text-neutral-300 shrink-0">
                  {marketFilter === 'OVER_UNDER' ? (
                    <>
                      <span className="w-8 sm:w-9 text-center">O 2.5</span>
                      <span className="w-8 sm:w-9 text-center">U 2.5</span>
                    </>
                  ) : marketFilter === 'BTTS' ? (
                    <>
                      <span className="w-8 sm:w-9 text-center">YES</span>
                      <span className="w-8 sm:w-9 text-center">NO</span>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onSelectSortBy?.('HOME_DESC')}
                        className="min-h-[32px] w-8 sm:w-8.5 flex items-center justify-center text-center shrink-0 hover:text-sky-600 dark:hover:text-[#CCFF00] cursor-pointer"
                        title="Sort by Home Win %"
                        aria-label="Sort by Home Win %"
                      >
                        1
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectSortBy?.('DRAW_DESC')}
                        className="min-h-[32px] w-8 sm:w-8.5 flex items-center justify-center text-center shrink-0 hover:text-sky-600 dark:hover:text-[#CCFF00] cursor-pointer"
                        title="Sort by Draw %"
                        aria-label="Sort by Draw %"
                      >
                        X
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectSortBy?.('AWAY_DESC')}
                        className="min-h-[32px] w-8 sm:w-8.5 flex items-center justify-center text-center shrink-0 hover:text-sky-600 dark:hover:text-[#CCFF00] cursor-pointer"
                        title="Sort by Away Win %"
                        aria-label="Sort by Away Win %"
                      >
                        2
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-[#121216]">
              {group.fixtures.map((fixture) => renderFixtureRow(fixture, false))}
            </div>
          </div>
        ))
      )}

      {/* Pagination Bar */}
      {fixtures.length > 0 && (
        <div className="px-3 py-2 bg-white dark:bg-[#121216] flex flex-wrap items-center justify-between gap-2 text-xs rounded-xl sm:rounded-full shadow-xs">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-slate-500 dark:text-neutral-400 font-mono tabular-nums text-xs whitespace-nowrap">
              Showing{' '}
              <span className="font-extrabold text-slate-900 dark:text-[#CCFF00]">
                {startItemIndex}–{endItemIndex}
              </span>{' '}
              of{' '}
              <span className="font-extrabold text-slate-900 dark:text-white">
                {fixtures.length}
              </span>
            </span>
            <div className="relative inline-flex items-center">
              <select
                id="table-page-size-dropdown"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="min-h-[32px] bg-slate-100 dark:bg-[#18181D] rounded-full px-3 py-1 text-xs font-mono tabular-nums font-bold text-slate-900 dark:text-white appearance-none cursor-pointer pr-7 focus:outline-none"
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 dark:text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
            </div>
          </div>

          <div className="flex items-center gap-1 ml-auto font-mono tabular-nums">
            <button
              type="button"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage(1)}
              className="min-h-[32px] min-w-[32px] p-1.5 rounded-full bg-slate-100 dark:bg-[#18181D] text-slate-700 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-95 flex items-center justify-center"
              title="First Page"
              aria-label="First Page"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="min-h-[32px] flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-full bg-slate-100 dark:bg-[#18181D] text-slate-700 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs font-bold cursor-pointer active:scale-95"
              title="Previous Page"
              aria-label="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Prev</span>
            </button>

            <div className="flex items-center gap-0.5">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  if (totalPages <= 5) return true;
                  if (p === 1 || p === totalPages) return true;
                  return Math.abs(p - safeCurrentPage) <= 1;
                })
                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                  if (
                    idx > 0 &&
                    typeof arr[idx - 1] === 'number' &&
                    (p as number) - (arr[idx - 1] as number) > 1
                  ) {
                    acc.push('...');
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  typeof item === 'string' ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-1 text-slate-400 dark:text-neutral-600 font-bold text-xs select-none"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={`page-${item}`}
                      type="button"
                      onClick={() => setCurrentPage(item)}
                      className={`min-w-[32px] min-h-[32px] flex items-center justify-center rounded-full text-xs font-black transition-all cursor-pointer active:scale-95 ${
                        item === safeCurrentPage
                          ? 'bg-[#09090B] text-white dark:bg-[#CCFF00] dark:text-slate-950 shadow-xs'
                          : 'bg-slate-100 dark:bg-[#18181D] text-slate-700 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-neutral-800'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
            </div>

            <button
              type="button"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="min-h-[32px] flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-full bg-slate-100 dark:bg-[#18181D] text-slate-700 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs font-bold cursor-pointer active:scale-95"
              title="Next Page"
              aria-label="Next Page"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage(totalPages)}
              className="min-h-[32px] min-w-[32px] p-1.5 rounded-full bg-slate-100 dark:bg-[#18181D] text-slate-700 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-95 flex items-center justify-center"
              title="Last Page"
              aria-label="Last Page"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
