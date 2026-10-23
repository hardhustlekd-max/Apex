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

    for (const f of paginatedFixtures) {
      const baseLeague = f.leagueName || 'Premier League';
      const subDivision = f.stage && f.stage.trim() !== '' && f.stage.trim().toLowerCase() !== baseLeague.trim().toLowerCase()
        ? f.stage.trim()
        : undefined;

      const headerKey = subDivision ? `${baseLeague} • ${subDivision}` : baseLeague;

      if (!groupMap.has(headerKey)) {
        groupMap.set(headerKey, {
          leagueName: baseLeague,
          subDivision,
          headerKey,
          fixtures: [],
        });
      }
      groupMap.get(headerKey)!.fixtures.push(f);
    }

    const groups = Array.from(groupMap.values());
    groups.sort((ga, gb) => {
      const pa = getLeaguePriority(ga.fixtures[0]?.league, ga.fixtures[0]?.leagueName, ga.fixtures[0]?.stage);
      const pb = getLeaguePriority(gb.fixtures[0]?.league, gb.fixtures[0]?.leagueName, gb.fixtures[0]?.stage);
      if (pa !== pb) return pa - pb;
      return ga.headerKey.localeCompare(gb.headerKey);
    });

    return groups;
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
        className={`grid grid-cols-12 items-center px-3.5 sm:px-4 py-2 hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition-colors cursor-pointer gap-1 sm:gap-2 ${
          isLive ? 'bg-rose-50/30 dark:bg-rose-950/10' : ''
        }`}
      >
        <div className="col-span-5 sm:col-span-6 flex flex-col justify-center min-w-0 pr-1">
          <div className="flex items-center justify-between gap-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              {fixture.homeBadge && (
                <img src={fixture.homeBadge} alt="" className="w-3.5 h-3.5 object-contain shrink-0 rounded-full" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
              )}
              <span className={`font-bold text-xs truncate whitespace-nowrap ${isLive ? 'text-slate-900 dark:text-white font-extrabold' : 'text-slate-900 dark:text-white'}`} title={fixture.homeTeam}>
                {fixture.homeTeam}
              </span>
            </div>
            {fixture.score && fixture.score.home !== undefined && (
              <span className={`font-mono text-xs shrink-0 ${isLive ? 'text-rose-600 dark:text-rose-400 font-black px-1 rounded bg-rose-100/60 dark:bg-rose-900/40' : 'text-slate-900 dark:text-white font-bold'}`}>
                {fixture.score.home}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-1 min-w-0 mt-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {fixture.awayBadge && (
                <img src={fixture.awayBadge} alt="" className="w-3.5 h-3.5 object-contain shrink-0 rounded-full" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
              )}
              <span className={`font-medium text-xs truncate whitespace-nowrap ${isLive ? 'text-slate-800 dark:text-slate-200 font-bold' : 'text-slate-700 dark:text-slate-300'}`} title={fixture.awayTeam}>
                {fixture.awayTeam}
              </span>
            </div>
            {fixture.score && fixture.score.away !== undefined && (
              <span className={`font-mono text-xs shrink-0 ${isLive ? 'text-rose-600 dark:text-rose-400 font-black px-1 rounded bg-rose-100/60 dark:bg-rose-900/40' : 'text-slate-900 dark:text-white font-bold'}`}>
                {fixture.score.away}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[9px] font-mono text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap min-w-0 truncate">
            {isLive ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-rose-600 text-white font-black text-[9px] animate-pulse shrink-0 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                <span>LIVE {fixture.minute ? `${fixture.minute}'` : ''}</span>
              </span>
            ) : null}
            {showLeagueInRow && (
              <>
                <span className="text-slate-600 dark:text-slate-400 font-semibold truncate max-w-[80px]" title={fixture.leagueName || fixture.league}>{fixture.leagueName || fixture.league}</span>
                <span className="text-slate-300 dark:text-slate-700 shrink-0">·</span>
              </>
            )}
            {!isLive && (
              <span className="text-slate-600 dark:text-slate-300 font-semibold shrink-0">{kickOff}</span>
            )}
          </div>
        </div>

        <div className="col-span-7 sm:col-span-6 flex items-center justify-end gap-1 sm:gap-2 shrink-0">
          {/* Section 1: Highest Probability Pick */}
          <div className="w-[30%] sm:w-[28%] flex items-center justify-center shrink-0" title={`Model Pick: ${pick.label} (${pick.probabilityFormatted})`}>
            <div className="flex items-center gap-1">
              <span className="min-w-6 px-1.5 h-5 flex items-center justify-center rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black shrink-0 shadow-2xs">
                {pick.shortLabel}
              </span>
              <span className="hidden sm:inline font-mono text-[9px] font-bold text-slate-500 dark:text-slate-400">
                {pick.probabilityPercent.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Section 2: Value Bet (+EV) */}
          <div className="w-[26%] sm:w-[24%] flex items-center justify-center shrink-0">
            {valueBet.hasValue ? (
              <span
                className="px-1.5 h-5 flex items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 text-[9px] sm:text-[10px] font-mono font-bold whitespace-nowrap shadow-2xs"
                title={`Value Bet: ${valueBet.selection} (${valueBet.evFormatted} @ ${valueBet.odds.toFixed(2)})`}
              >
                +{valueBet.edgePercent.toFixed(1)}%
              </span>
            ) : (
              <span className="text-[11px] font-mono text-slate-300 dark:text-slate-700 select-none">
                —
              </span>
            )}
          </div>

          {/* Section 3: Probabilities strictly 1 decimal place */}
          <div className="w-[44%] sm:w-[48%] flex items-center justify-end gap-0.5 sm:gap-1 font-mono text-[9px] sm:text-[10px] font-bold shrink-0 whitespace-nowrap">
            {marketFilter === 'OVER_UNDER' ? (
              <>
                <span className={`min-w-[34px] sm:min-w-[40px] h-5 flex items-center justify-center rounded-md text-[9px] sm:text-[10px] whitespace-nowrap shrink-0 ${over25 >= 50 ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>{over25.toFixed(1)}</span>
                <span className={`min-w-[34px] sm:min-w-[40px] h-5 flex items-center justify-center rounded-md text-[9px] sm:text-[10px] whitespace-nowrap shrink-0 ${under25 >= 50 ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>{under25.toFixed(1)}</span>
              </>
            ) : marketFilter === 'BTTS' ? (
              <>
                <span className={`min-w-[34px] sm:min-w-[40px] h-5 flex items-center justify-center rounded-md text-[9px] sm:text-[10px] whitespace-nowrap shrink-0 ${bttsYes >= 50 ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>{bttsYes.toFixed(1)}</span>
                <span className={`min-w-[34px] sm:min-w-[40px] h-5 flex items-center justify-center rounded-md text-[9px] sm:text-[10px] whitespace-nowrap shrink-0 ${bttsNo >= 50 ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>{bttsNo.toFixed(1)}</span>
              </>
            ) : (
              <>
                <span className={`min-w-[30px] sm:min-w-[34px] h-5 flex items-center justify-center rounded-md text-[9px] sm:text-[10px] whitespace-nowrap shrink-0 ${homeProb >= 50 ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black' : homeProb >= 35 ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>{homeProb.toFixed(1)}</span>
                <span className={`min-w-[30px] sm:min-w-[34px] h-5 flex items-center justify-center rounded-md text-[9px] sm:text-[10px] whitespace-nowrap shrink-0 ${drawProb >= 35 ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>{drawProb.toFixed(1)}</span>
                <span className={`min-w-[30px] sm:min-w-[34px] h-5 flex items-center justify-center rounded-md text-[9px] sm:text-[10px] whitespace-nowrap shrink-0 ${awayProb >= 50 ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black' : awayProb >= 35 ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>{awayProb.toFixed(1)}</span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const isPercentageSortActive = sortBy && sortBy !== 'DEFAULT';

  return (
    <div className="w-full max-w-full space-y-3 text-slate-900 dark:text-slate-100 font-sans">
      {paginatedFixtures.length === 0 ? (
        <div className="p-8 text-center text-slate-500 bg-white dark:bg-[#0B0F17] rounded-xl border border-slate-200/80 dark:border-slate-800">No matches found.</div>
      ) : isPercentageSortActive ? (
        <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl sm:rounded-2xl overflow-hidden bg-white dark:bg-[#0B0F17] shadow-xs">
          <div className="bg-slate-50 dark:bg-slate-900/80 grid grid-cols-12 items-center px-3.5 sm:px-4 py-2 border-b border-slate-200/80 dark:border-slate-800 gap-1 sm:gap-2 font-bold text-xs select-none">
            <div className="col-span-5 sm:col-span-6 flex items-center gap-2 min-w-0 pr-1">
              <span className="truncate whitespace-nowrap tracking-tight font-extrabold text-slate-900 dark:text-white">Match & Competition</span>
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
                <button type="button" onClick={() => onSelectSortBy?.(sortBy === 'PROB_DESC' ? 'PROB_ASC' : 'PROB_DESC')} className="flex items-center justify-center gap-1 font-mono text-[10px] sm:text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer" title="Sort by Model Pick Probability">
                  <span>PICK</span>
                  {sortBy === 'PROB_DESC' && <ArrowDown className="w-3 h-3 text-slate-600 dark:text-slate-400" />}
                  {sortBy === 'PROB_ASC' && <ArrowUp className="w-3 h-3 text-slate-600 dark:text-slate-400" />}
                  {sortBy !== 'PROB_DESC' && sortBy !== 'PROB_ASC' && <ArrowUpDown className="w-2.5 h-2.5 text-slate-400 opacity-60" />}
                </button>
              </div>
              <div className="w-[26%] sm:w-[24%] flex items-center justify-center shrink-0">
                <span className="font-mono text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400" title="Identified Positive EV Bet">
                  VALUE
                </span>
              </div>
              <div className="w-[44%] sm:w-[48%] flex items-center justify-end gap-0.5 sm:gap-1 font-mono text-[10px] sm:text-[11px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                {marketFilter === 'OVER_UNDER' ? (
                  <>
                    <span className="min-w-[34px] sm:min-w-[40px] text-center text-[10px] font-bold">O 2.5</span>
                    <span className="min-w-[34px] sm:min-w-[40px] text-center text-[10px] font-bold">U 2.5</span>
                  </>
                ) : marketFilter === 'BTTS' ? (
                  <>
                    <span className="min-w-[34px] sm:min-w-[40px] text-center text-[10px] font-bold">YES</span>
                    <span className="min-w-[34px] sm:min-w-[40px] text-center text-[10px] font-bold">NO</span>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => onSelectSortBy?.(sortBy === 'HOME_DESC' ? 'DEFAULT' : 'HOME_DESC')} className={`min-w-[30px] sm:min-w-[34px] h-6 flex items-center justify-center gap-0.5 rounded cursor-pointer hover:text-slate-900 dark:hover:text-white ${sortBy === 'HOME_DESC' ? 'text-slate-900 dark:text-white font-black' : ''}`} title="Sort by Home Win %">
                      <span>1</span>
                      {sortBy === 'HOME_DESC' && <ArrowDown className="w-2.5 h-2.5 text-slate-600 dark:text-slate-400" />}
                    </button>
                    <button type="button" onClick={() => onSelectSortBy?.(sortBy === 'DRAW_DESC' ? 'DEFAULT' : 'DRAW_DESC')} className={`min-w-[30px] sm:min-w-[34px] h-6 flex items-center justify-center gap-0.5 rounded cursor-pointer hover:text-slate-900 dark:hover:text-white ${sortBy === 'DRAW_DESC' ? 'text-slate-900 dark:text-white font-black' : ''}`} title="Sort by Draw %">
                      <span>X</span>
                      {sortBy === 'DRAW_DESC' && <ArrowDown className="w-2.5 h-2.5 text-slate-600 dark:text-slate-400" />}
                    </button>
                    <button type="button" onClick={() => onSelectSortBy?.(sortBy === 'AWAY_DESC' ? 'DEFAULT' : 'AWAY_DESC')} className={`min-w-[30px] sm:min-w-[34px] h-6 flex items-center justify-center gap-0.5 rounded cursor-pointer hover:text-slate-900 dark:hover:text-white ${sortBy === 'AWAY_DESC' ? 'text-slate-900 dark:text-white font-black' : ''}`} title="Sort by Away Win %">
                      <span>2</span>
                      {sortBy === 'AWAY_DESC' && <ArrowDown className="w-2.5 h-2.5 text-slate-600 dark:text-slate-400" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/40 bg-white dark:bg-[#0B0F17]">
            {paginatedFixtures.map((fixture) => renderFixtureRow(fixture, true))}
          </div>
        </div>
      ) : (
        groupedByLeague.map((group) => (
          <div key={group.headerKey} className="border border-slate-200/80 dark:border-slate-800 rounded-xl sm:rounded-2xl overflow-hidden bg-white dark:bg-[#0B0F17] shadow-xs">
            <div className="bg-slate-50 dark:bg-slate-900/80 grid grid-cols-12 items-center px-3.5 sm:px-4 py-2 border-b border-slate-200/80 dark:border-slate-800 gap-1 sm:gap-2 font-bold text-xs select-none">
              <div className="col-span-5 sm:col-span-6 flex items-center min-w-0 pr-1">
                <span className="truncate whitespace-nowrap tracking-tight font-extrabold text-slate-900 dark:text-white">{group.subDivision || group.leagueName}</span>
              </div>
              <div className="col-span-7 sm:col-span-6 flex items-center justify-end gap-1 sm:gap-2 shrink-0">
                <div className="w-[30%] sm:w-[28%] flex items-center justify-center shrink-0">
                  <button type="button" onClick={() => onSelectSortBy?.('PROB_DESC')} className="flex items-center justify-center gap-1 font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer" title="Click to sort table by Model Pick %">
                    <span>PICK</span>
                    <ArrowUpDown className="w-2.5 h-2.5 opacity-60" />
                  </button>
                </div>
                <div className="w-[26%] sm:w-[24%] flex items-center justify-center shrink-0">
                  <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400" title="Identified Positive EV Bet">VALUE</span>
                </div>
                <div className="w-[44%] sm:w-[48%] flex items-center justify-end gap-0.5 sm:gap-1 font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0 tracking-wider">
                  {marketFilter === 'OVER_UNDER' ? (
                    <>
                      <span className="min-w-[34px] sm:min-w-[40px] text-center">O 2.5</span>
                      <span className="min-w-[34px] sm:min-w-[40px] text-center">U 2.5</span>
                    </>
                  ) : marketFilter === 'BTTS' ? (
                    <>
                      <span className="min-w-[34px] sm:min-w-[40px] text-center">YES</span>
                      <span className="min-w-[34px] sm:min-w-[40px] text-center">NO</span>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => onSelectSortBy?.('HOME_DESC')} className="min-w-[30px] sm:min-w-[34px] text-center shrink-0 hover:text-slate-900 dark:hover:text-white cursor-pointer" title="Sort by Home Win %">1</button>
                      <button type="button" onClick={() => onSelectSortBy?.('DRAW_DESC')} className="min-w-[30px] sm:min-w-[34px] text-center shrink-0 hover:text-slate-900 dark:hover:text-white cursor-pointer" title="Sort by Draw %">X</button>
                      <button type="button" onClick={() => onSelectSortBy?.('AWAY_DESC')} className="min-w-[30px] sm:min-w-[34px] text-center shrink-0 hover:text-slate-900 dark:hover:text-white cursor-pointer" title="Sort by Away Win %">2</button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/40 bg-white dark:bg-[#0B0F17]">
              {group.fixtures.map((fixture) => renderFixtureRow(fixture, false))}
            </div>
          </div>
        ))
      )}

      {fixtures.length > 0 && (
        <div className="px-4 py-2.5 bg-white dark:bg-[#0B0F17] border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs rounded-xl sm:rounded-2xl shadow-xs">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-slate-500 dark:text-slate-400 font-medium text-xs whitespace-nowrap">
              Showing <span className="font-bold text-slate-900 dark:text-white">{startItemIndex}–{endItemIndex}</span> of <span className="font-bold text-slate-900 dark:text-white">{fixtures.length}</span> matches
            </span>
            <div className="relative inline-flex items-center">
              <select id="table-page-size-dropdown" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }} className="bg-slate-50 dark:bg-slate-900 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 dark:text-white appearance-none cursor-pointer pr-7 focus:outline-none">
                <option value={5} className="bg-white dark:bg-slate-900">5 per page</option>
                <option value={10} className="bg-white dark:bg-slate-900">10 per page</option>
                <option value={20} className="bg-white dark:bg-slate-900">20 per page</option>
                <option value={50} className="bg-white dark:bg-slate-900">50 per page</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 ml-auto">
            <button type="button" disabled={safeCurrentPage <= 1} onClick={() => setCurrentPage(1)} className="p-1.5 rounded-xl bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs" title="First Page"><ChevronsLeft className="w-3.5 h-3.5" /></button>
            <button type="button" disabled={safeCurrentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-bold cursor-pointer shadow-xs" title="Previous Page"><ChevronLeft className="w-3.5 h-3.5" /><span className="hidden sm:inline">Prev</span></button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => { if (totalPages <= 5) return true; if (p === 1 || p === totalPages) return true; return Math.abs(p - safeCurrentPage) <= 1; })
                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  typeof item === 'string' ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 font-bold text-xs select-none">...</span>
                  ) : (
                    <button key={`page-${item}`} type="button" onClick={() => setCurrentPage(item)} className={`min-w-7 h-7 flex items-center justify-center rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${item === safeCurrentPage ? 'bg-slate-900 dark:bg-slate-600 text-white shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{item}</button>
                  )
                )}
            </div>
            <button type="button" disabled={safeCurrentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-bold cursor-pointer shadow-xs" title="Next Page"><span className="hidden sm:inline">Next</span><ChevronRight className="w-3.5 h-3.5" /></button>
            <button type="button" disabled={safeCurrentPage >= totalPages} onClick={() => setCurrentPage(totalPages)} className="p-1.5 rounded-xl bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs" title="Last Page"><ChevronsRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  );
};
