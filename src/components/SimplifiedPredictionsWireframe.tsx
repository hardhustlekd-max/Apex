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
}

import {
  formatProb,
  getProbValue,
  getAuthoritative1X2Pick,
  getAuthoritativeValueBet,
} from '../core/formatters.js';

function getTipProb(fixture: Fixture, marketFilter: string = 'BEST_VALUE'): number {
  if (marketFilter === 'OVER_UNDER') {
    const o = getProbValue(fixture.prediction?.over25Prob, 1);
    return Math.max(o, getProbValue(1 - (fixture.prediction?.over25Prob ?? 0.5), 1));
  }
  if (marketFilter === 'BTTS') {
    const y = getProbValue(fixture.prediction?.bttsProb, 1);
    return Math.max(y, getProbValue(1 - (fixture.prediction?.bttsProb ?? 0.5), 1));
  }
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

    return (
      <div
        key={fixture.id}
        onClick={() => onSelectDetail(fixture)}
        className={`grid grid-cols-12 items-center px-4 py-2.5 hover:bg-[#f6f8fa] dark:hover:bg-[#21262d]/60 transition-colors cursor-pointer gap-2 border-b border-[#d0d7de]/60 dark:border-[#30363d]/60 last:border-b-0 ${
          isLive ? 'bg-[#ffebe9]/30 dark:bg-[#f8514926]/10' : ''
        }`}
      >
        {/* Match Info Column */}
        <div className="col-span-5 sm:col-span-6 flex flex-col justify-center min-w-0 pr-1">
          {/* Home Team */}
          <div className="flex items-center justify-between gap-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              {fixture.homeBadge && (
                <img
                  src={fixture.homeBadge}
                  alt=""
                  className="w-3.5 h-3.5 object-contain shrink-0 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              )}
              <span
                className={`font-semibold text-xs truncate whitespace-nowrap text-[#1f2328] dark:text-[#f0f6fc]`}
                title={fixture.homeTeam}
              >
                {fixture.homeTeam}
              </span>
            </div>
            {fixture.score && fixture.score.home !== undefined && (
              <span
                className={`font-mono text-xs shrink-0 ${
                  isLive
                    ? 'text-[#cf222e] dark:text-[#f85149] font-bold px-1.5 py-0.2 rounded bg-[#ffebe9] dark:bg-[#f8514926]'
                    : 'text-[#1f2328] dark:text-[#f0f6fc] font-bold'
                }`}
              >
                {fixture.score.home}
              </span>
            )}
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-between gap-1 min-w-0 mt-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {fixture.awayBadge && (
                <img
                  src={fixture.awayBadge}
                  alt=""
                  className="w-3.5 h-3.5 object-contain shrink-0 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              )}
              <span
                className="font-medium text-xs truncate whitespace-nowrap text-[#656d76] dark:text-[#c9d1d9]"
                title={fixture.awayTeam}
              >
                {fixture.awayTeam}
              </span>
            </div>
            {fixture.score && fixture.score.away !== undefined && (
              <span
                className={`font-mono text-xs shrink-0 ${
                  isLive
                    ? 'text-[#cf222e] dark:text-[#f85149] font-bold px-1.5 py-0.2 rounded bg-[#ffebe9] dark:bg-[#f8514926]'
                    : 'text-[#1f2328] dark:text-[#f0f6fc] font-bold'
                }`}
              >
                {fixture.score.away}
              </span>
            )}
          </div>

          {/* Subtext info: Kickoff time, Status, League */}
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-mono text-[#656d76] dark:text-[#8d96a0] font-normal whitespace-nowrap min-w-0 truncate">
            {isLive ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-[#cf222e] text-white font-bold text-[10px] animate-pulse shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                <span>LIVE {fixture.minute ? `${fixture.minute}'` : ''}</span>
              </span>
            ) : null}
            {showLeagueInRow && (
              <>
                <span
                  className="text-[#656d76] dark:text-[#8d96a0] truncate max-w-[90px]"
                  title={fixture.leagueName || fixture.league}
                >
                  {fixture.leagueName || fixture.league}
                </span>
                <span className="text-[#d0d7de] dark:text-[#30363d] shrink-0">·</span>
              </>
            )}
            {!isLive && (
              <span className="text-[#656d76] dark:text-[#8d96a0] shrink-0 font-mono">
                {kickOff}
              </span>
            )}
          </div>
        </div>

        {/* Prediction Data Columns */}
        <div className="col-span-7 sm:col-span-6 flex items-center justify-end gap-1 sm:gap-2 shrink-0">
          {/* Section 1: Highest Probability Pick */}
          <div
            className="w-[30%] sm:w-[28%] flex items-center justify-center shrink-0"
            title={`Model Pick: ${pick.label} (${pick.probabilityFormatted})`}
          >
            <div className="flex items-center gap-1">
              <span className="min-w-6 px-1.5 h-5 flex items-center justify-center rounded-md bg-[#24292f] dark:bg-[#f0f6fc] text-white dark:text-[#1f2328] text-[11px] font-bold shrink-0 shadow-[0_1px_0_rgba(27,31,36,0.08)]">
                {pick.shortLabel}
              </span>
              <span className="hidden sm:inline font-mono text-[11px] font-semibold text-[#656d76] dark:text-[#8d96a0]">
                {pick.probabilityPercent.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Section 2: Value Bet (+EV) */}
          <div className="w-[26%] sm:w-[24%] flex items-center justify-center shrink-0">
            {valueBet.hasValue ? (
              <span
                className="px-2 h-5 flex items-center justify-center rounded-md bg-[#dafbe1] dark:bg-[#23863626] text-[#1a7f37] dark:text-[#3fb950] border border-[#4ac26b66] text-[10px] sm:text-[11px] font-mono font-bold whitespace-nowrap shadow-[0_1px_0_rgba(27,31,36,0.04)]"
                title={`Value Bet: ${valueBet.selection} (${valueBet.evFormatted} @ ${valueBet.odds.toFixed(2)})`}
              >
                +{valueBet.edgePercent.toFixed(1)}%
              </span>
            ) : (
              <span className="text-xs font-mono text-[#8c959f] dark:text-[#6e7681] select-none">
                —
              </span>
            )}
          </div>

          {/* Section 3: Probabilities */}
          <div className="w-[44%] sm:w-[48%] flex items-center justify-end gap-1.5 font-mono text-[10px] sm:text-[11px] font-bold shrink-0 whitespace-nowrap">
            {marketFilter === 'OVER_UNDER' ? (
              <>
                <span
                  className={`min-w-[34px] sm:min-w-[42px] h-5 flex items-center justify-center rounded-md text-[10px] sm:text-[11px] whitespace-nowrap shrink-0 border ${
                    over25 >= 50
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {over25.toFixed(1)}
                </span>
                <span
                  className={`min-w-[34px] sm:min-w-[42px] h-5 flex items-center justify-center rounded-md text-[10px] sm:text-[11px] whitespace-nowrap shrink-0 border ${
                    under25 >= 50
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {under25.toFixed(1)}
                </span>
              </>
            ) : marketFilter === 'BTTS' ? (
              <>
                <span
                  className={`min-w-[34px] sm:min-w-[42px] h-5 flex items-center justify-center rounded-md text-[10px] sm:text-[11px] whitespace-nowrap shrink-0 border ${
                    bttsYes >= 50
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {bttsYes.toFixed(1)}
                </span>
                <span
                  className={`min-w-[34px] sm:min-w-[42px] h-5 flex items-center justify-center rounded-md text-[10px] sm:text-[11px] whitespace-nowrap shrink-0 border ${
                    bttsNo >= 50
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {bttsNo.toFixed(1)}
                </span>
              </>
            ) : (
              <>
                <span
                  className={`min-w-[30px] sm:min-w-[36px] h-5 flex items-center justify-center rounded-md text-[10px] sm:text-[11px] whitespace-nowrap shrink-0 border ${
                    homeProb >= 50
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black'
                      : homeProb >= 35
                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-600'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {homeProb.toFixed(1)}
                </span>
                <span
                  className={`min-w-[30px] sm:min-w-[36px] h-5 flex items-center justify-center rounded-md text-[10px] sm:text-[11px] whitespace-nowrap shrink-0 border ${
                    drawProb >= 35
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900 font-bold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {drawProb.toFixed(1)}
                </span>
                <span
                  className={`min-w-[30px] sm:min-w-[36px] h-5 flex items-center justify-center rounded-md text-[10px] sm:text-[11px] whitespace-nowrap shrink-0 border ${
                    awayProb >= 50
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black'
                      : awayProb >= 35
                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-600'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {awayProb.toFixed(1)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const isPercentageSortActive = sortBy && sortBy !== 'DEFAULT';

  return (
    <div className="w-full max-w-full space-y-3 text-[#1f2328] dark:text-[#f0f6fc] font-sans">
      {paginatedFixtures.length === 0 ? (
        <div className="p-8 text-center text-[#656d76] dark:text-[#8d96a0] bg-white dark:bg-[#161b22] rounded-md border border-[#d0d7de] dark:border-[#30363d]">
          No matches found.
        </div>
      ) : isPercentageSortActive ? (
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-[#0B0F17] shadow-xs">
          {/* Header */}
          <div className="bg-slate-50 dark:bg-slate-900/60 grid grid-cols-12 items-center px-4 py-3 border-b border-slate-100 dark:border-slate-800 gap-2 font-bold text-xs select-none">
            <div className="col-span-5 sm:col-span-6 flex items-center gap-2 min-w-0 pr-1">
              <span className="truncate whitespace-nowrap font-extrabold text-slate-900 dark:text-white">Match & Competition</span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-950/80 text-slate-800 dark:text-slate-300">
                {sortBy === 'PROB_DESC' && 'Pick % (High → Low)'}
                {sortBy === 'PROB_ASC' && 'Pick % (Low → High)'}
                {sortBy === 'HOME_DESC' && 'Home Win % (1)'}
                {sortBy === 'DRAW_DESC' && 'Draw % (X)'}
                {sortBy === 'AWAY_DESC' && 'Away Win % (2)'}
              </span>
            </div>
            <div className="col-span-7 sm:col-span-6 flex items-center justify-end gap-1 sm:gap-2 shrink-0">
              <div className="w-[30%] sm:w-[28%] flex items-center justify-center shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onSelectSortBy?.(sortBy === 'PROB_DESC' ? 'PROB_ASC' : 'PROB_DESC')
                  }
                  className="flex items-center justify-center gap-1 font-mono text-[11px] font-semibold text-[#656d76] dark:text-[#8d96a0] hover:text-[#0969da] dark:hover:text-[#2f81f7] cursor-pointer"
                  title="Sort by Model Pick Probability"
                >
                  <span>PICK</span>
                  {sortBy === 'PROB_DESC' && <ArrowDown className="w-3 h-3 text-[#0969da]" />}
                  {sortBy === 'PROB_ASC' && <ArrowUp className="w-3 h-3 text-[#0969da]" />}
                  {sortBy !== 'PROB_DESC' && sortBy !== 'PROB_ASC' && (
                    <ArrowUpDown className="w-2.5 h-2.5 opacity-60" />
                  )}
                </button>
              </div>
              <div className="w-[26%] sm:w-[24%] flex items-center justify-center shrink-0">
                <span
                  className="font-mono text-[11px] font-semibold text-[#656d76] dark:text-[#8d96a0]"
                  title="Identified Positive EV Bet"
                >
                  VALUE
                </span>
              </div>
              <div className="w-[44%] sm:w-[48%] flex items-center justify-end gap-1 font-mono text-[11px] font-semibold text-[#656d76] dark:text-[#8d96a0] shrink-0">
                {marketFilter === 'OVER_UNDER' ? (
                  <>
                    <span className="min-w-[34px] sm:min-w-[42px] text-center">O 2.5</span>
                    <span className="min-w-[34px] sm:min-w-[42px] text-center">U 2.5</span>
                  </>
                ) : marketFilter === 'BTTS' ? (
                  <>
                    <span className="min-w-[34px] sm:min-w-[42px] text-center">YES</span>
                    <span className="min-w-[34px] sm:min-w-[42px] text-center">NO</span>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectSortBy?.(sortBy === 'HOME_DESC' ? 'DEFAULT' : 'HOME_DESC')
                      }
                      className={`min-w-[30px] sm:min-w-[36px] h-6 flex items-center justify-center gap-0.5 rounded cursor-pointer hover:text-[#0969da] ${
                        sortBy === 'HOME_DESC' ? 'text-[#0969da] dark:text-[#2f81f7] font-bold' : ''
                      }`}
                      title="Sort by Home Win %"
                    >
                      <span>1</span>
                      {sortBy === 'HOME_DESC' && <ArrowDown className="w-2.5 h-2.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectSortBy?.(sortBy === 'DRAW_DESC' ? 'DEFAULT' : 'DRAW_DESC')
                      }
                      className={`min-w-[30px] sm:min-w-[36px] h-6 flex items-center justify-center gap-0.5 rounded cursor-pointer hover:text-[#0969da] ${
                        sortBy === 'DRAW_DESC' ? 'text-[#0969da] dark:text-[#2f81f7] font-bold' : ''
                      }`}
                      title="Sort by Draw %"
                    >
                      <span>X</span>
                      {sortBy === 'DRAW_DESC' && <ArrowDown className="w-2.5 h-2.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectSortBy?.(sortBy === 'AWAY_DESC' ? 'DEFAULT' : 'AWAY_DESC')
                      }
                      className={`min-w-[30px] sm:min-w-[36px] h-6 flex items-center justify-center gap-0.5 rounded cursor-pointer hover:text-[#0969da] ${
                        sortBy === 'AWAY_DESC' ? 'text-[#0969da] dark:text-[#2f81f7] font-bold' : ''
                      }`}
                      title="Sort by Away Win %"
                    >
                      <span>2</span>
                      {sortBy === 'AWAY_DESC' && <ArrowDown className="w-2.5 h-2.5" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-[#161b22]">
            {paginatedFixtures.map((fixture) => renderFixtureRow(fixture, true))}
          </div>
        </div>
      ) : (
        groupedByLeague.map((group) => (
          <div
            key={group.headerKey}
            className="border border-[#d0d7de] dark:border-[#30363d] rounded-md overflow-hidden bg-white dark:bg-[#161b22] shadow-[0_1px_0_rgba(27,31,36,0.04)]"
          >
            {/* Primer Box Header per League */}
            <div className="bg-[#f6f8fa] dark:bg-[#161b22] grid grid-cols-12 items-center px-4 py-2.5 border-b border-[#d0d7de] dark:border-[#30363d] gap-2 font-semibold text-xs select-none">
              <div className="col-span-5 sm:col-span-6 flex items-center min-w-0 pr-1">
                <span className="truncate whitespace-nowrap font-bold text-[#1f2328] dark:text-[#f0f6fc]">
                  {group.subDivision || group.leagueName}
                </span>
                <span className="ml-2 px-2 py-0.2 rounded-full text-[11px] font-medium bg-[#afb8c1]/20 text-[#656d76] dark:text-[#8d96a0]">
                  {group.fixtures.length}
                </span>
              </div>
              <div className="col-span-7 sm:col-span-6 flex items-center justify-end gap-1 sm:gap-2 shrink-0">
                <div className="w-[30%] sm:w-[28%] flex items-center justify-center shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectSortBy?.('PROB_DESC')}
                    className="flex items-center justify-center gap-1 font-mono text-[11px] font-semibold text-[#656d76] dark:text-[#8d96a0] hover:text-[#0969da] cursor-pointer"
                    title="Click to sort table by Model Pick %"
                  >
                    <span>PICK</span>
                    <ArrowUpDown className="w-2.5 h-2.5 opacity-60" />
                  </button>
                </div>
                <div className="w-[26%] sm:w-[24%] flex items-center justify-center shrink-0">
                  <span
                    className="font-mono text-[11px] font-semibold text-[#656d76] dark:text-[#8d96a0]"
                    title="Identified Positive EV Bet"
                  >
                    VALUE
                  </span>
                </div>
                <div className="w-[44%] sm:w-[48%] flex items-center justify-end gap-1 font-mono text-[11px] font-semibold text-[#656d76] dark:text-[#8d96a0] shrink-0">
                  {marketFilter === 'OVER_UNDER' ? (
                    <>
                      <span className="min-w-[34px] sm:min-w-[42px] text-center">O 2.5</span>
                      <span className="min-w-[34px] sm:min-w-[42px] text-center">U 2.5</span>
                    </>
                  ) : marketFilter === 'BTTS' ? (
                    <>
                      <span className="min-w-[34px] sm:min-w-[42px] text-center">YES</span>
                      <span className="min-w-[34px] sm:min-w-[42px] text-center">NO</span>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onSelectSortBy?.('HOME_DESC')}
                        className="min-w-[30px] sm:min-w-[36px] text-center shrink-0 hover:text-[#0969da] cursor-pointer"
                        title="Sort by Home Win %"
                      >
                        1
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectSortBy?.('DRAW_DESC')}
                        className="min-w-[30px] sm:min-w-[36px] text-center shrink-0 hover:text-[#0969da] cursor-pointer"
                        title="Sort by Draw %"
                      >
                        X
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectSortBy?.('AWAY_DESC')}
                        className="min-w-[30px] sm:min-w-[36px] text-center shrink-0 hover:text-[#0969da] cursor-pointer"
                        title="Sort by Away Win %"
                      >
                        2
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-[#161b22]">
              {group.fixtures.map((fixture) => renderFixtureRow(fixture, false))}
            </div>
          </div>
        ))
      )}

      {/* GitHub Primer Pagination Bar */}
      {fixtures.length > 0 && (
        <div className="px-4 py-3 bg-white dark:bg-[#161b22] border border-[#d0d7de] dark:border-[#30363d] flex flex-wrap items-center justify-between gap-3 text-xs rounded-md shadow-[0_1px_0_rgba(27,31,36,0.04)]">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <span className="text-[#656d76] dark:text-[#8d96a0] font-normal text-xs whitespace-nowrap">
              Showing{' '}
              <span className="font-semibold text-[#1f2328] dark:text-[#f0f6fc]">
                {startItemIndex}–{endItemIndex}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-[#1f2328] dark:text-[#f0f6fc]">
                {fixtures.length}
              </span>{' '}
              matches
            </span>
            <div className="relative inline-flex items-center">
              <select
                id="table-page-size-dropdown"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-[#f6f8fa] dark:bg-[#21262d] border border-[#d0d7de] dark:border-[#30363d] rounded-md px-2.5 py-1 text-xs font-medium text-[#1f2328] dark:text-[#f0f6fc] appearance-none cursor-pointer pr-7 focus:outline-none focus:border-[#0969da]"
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#656d76] dark:text-[#8d96a0] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
            </div>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage(1)}
              className="p-1.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#21262d] text-[#24292f] dark:text-[#c9d1d9] hover:bg-[#f3f4f6] dark:hover:bg-[#30363d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="First Page"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#21262d] text-[#24292f] dark:text-[#c9d1d9] hover:bg-[#f3f4f6] dark:hover:bg-[#30363d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs font-medium cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Previous</span>
            </button>

            <div className="flex items-center gap-1">
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
                      className="px-1.5 text-[#656d76] font-semibold text-xs select-none"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={`page-${item}`}
                      type="button"
                      onClick={() => setCurrentPage(item)}
                      className={`min-w-7 h-7 flex items-center justify-center rounded-md text-xs font-semibold transition-colors cursor-pointer border ${
                        item === safeCurrentPage
                          ? 'bg-[#0969da] text-white border-[#0969da]'
                          : 'border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#21262d] text-[#24292f] dark:text-[#c9d1d9] hover:bg-[#f3f4f6] dark:hover:bg-[#30363d]'
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
              className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#21262d] text-[#24292f] dark:text-[#c9d1d9] hover:bg-[#f3f4f6] dark:hover:bg-[#30363d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs font-medium cursor-pointer"
              title="Next Page"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage(totalPages)}
              className="p-1.5 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#21262d] text-[#24292f] dark:text-[#c9d1d9] hover:bg-[#f3f4f6] dark:hover:bg-[#30363d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Last Page"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
