import React, { useState, useMemo, useEffect } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from 'lucide-react';
import { Fixture } from '../core/types.js';
import { getLeaguePriority } from '../core/leaguePriority.js';
import { formatMatchDateTime } from '../core/dateUtils.js';
import { getProbValue, getAuthoritative1X2Pick, getHighestPredictionAcrossAllMarkets } from '../core/formatters.js';
import { PaginationBar, TeamAvatar } from './ui/index.js';

interface SimplifiedPredictionsWireframeProps {
  fixtures: Fixture[];
  onSelectDetail: (fixture: Fixture) => void;
  marketFilter?: 'MOST_LIKELY' | 'OVER_UNDER' | '1X2' | 'BTTS';
  sortBy?: 'DEFAULT' | 'PROB_DESC' | 'PROB_ASC' | 'HOME_DESC' | 'DRAW_DESC' | 'AWAY_DESC';
  onSelectSortBy?: (s: 'DEFAULT' | 'PROB_DESC' | 'PROB_ASC' | 'HOME_DESC' | 'DRAW_DESC' | 'AWAY_DESC') => void;
  selectedFixtureId?: string | number;
}

function getTipProb(fixture: Fixture, marketFilter: string = 'MOST_LIKELY'): number {
  if (marketFilter === 'OVER_UNDER') {
    const o = getProbValue(fixture.prediction?.over25Prob, 1);
    return Math.max(o, getProbValue(100 - o, 1));
  }
  if (marketFilter === 'BTTS') {
    const y = getProbValue(fixture.prediction?.bttsProb, 1);
    return Math.max(y, getProbValue(100 - y, 1));
  }
  if (marketFilter === '1X2') {
    const pick = getAuthoritative1X2Pick(fixture);
    return pick ? pick.probabilityPercent : 0;
  }
  const highest = getHighestPredictionAcrossAllMarkets(fixture);
  return highest ? highest.probabilityPercent : 0;
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
  marketFilter = 'MOST_LIKELY',
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
    const isSelected = selectedFixtureId !== undefined && String(selectedFixtureId) === String(fixture.id);
    const kickOff = formatMatchDateTime(fixture.matchDate, fixture.kickOffTime || '19:00', fixture.timestamp).timeStr;
    const pick = getAuthoritative1X2Pick(fixture);

    const homeProb = fixture.prediction ? getHomeProb(fixture) : null;
    const drawProb = fixture.prediction ? getDrawProb(fixture) : null;
    const awayProb = fixture.prediction ? getAwayProb(fixture) : null;
    const over25 = fixture.prediction ? getOver25Prob(fixture) : null;
    const under25 = fixture.prediction ? getUnder25Prob(fixture) : null;
    const bttsYes = fixture.prediction ? getBttsYesProb(fixture) : null;
    const bttsNo = fixture.prediction ? getBttsNoProb(fixture) : null;

    return (
      <div
        key={fixture.id}
        role="button"
        tabIndex={0}
        onClick={() => onSelectDetail(fixture)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectDetail(fixture);
          }
        }}
        className={`group grid grid-cols-12 items-center px-3 sm:px-3.5 py-1.5 sm:py-2 transition-all duration-150 cursor-pointer gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
          isSelected
            ? 'bg-theme-primary-subtle'
            : isLive
            ? 'bg-rose-50/30 dark:bg-rose-950/20 hover:bg-rose-50/60 dark:hover:bg-rose-950/40'
            : 'odd:bg-theme-card even:bg-theme-card-elevated/45 hover:bg-theme-subtle/75'
        }`}
      >
        {/* Match Info Column */}
        <div className="col-span-6 sm:col-span-6 flex flex-col justify-center min-w-0 pr-1.5">
          {/* Home Team */}
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <TeamAvatar src={fixture.homeBadge} name={fixture.homeTeam} size="sm" />
              <span
                className="font-bold text-xs sm:text-[13px] truncate whitespace-nowrap text-theme-main"
                title={fixture.homeTeam}
              >
                {fixture.homeTeam}
              </span>
            </div>
            {fixture.score && fixture.score.home !== undefined && (
              <span
                className={`font-mono tabular-nums text-xs sm:text-[13px] shrink-0 font-black ${
                  isLive
                    ? 'text-white px-1.5 py-0.2 rounded-full bg-theme-live'
                    : 'text-theme-main'
                }`}
              >
                {fixture.score.home}
              </span>
            )}
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-between gap-1.5 min-w-0 mt-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <TeamAvatar src={fixture.awayBadge} name={fixture.awayTeam} size="sm" />
              <span
                className="font-semibold text-xs sm:text-[13px] truncate whitespace-nowrap text-theme-sub"
                title={fixture.awayTeam}
              >
                {fixture.awayTeam}
              </span>
            </div>
            {fixture.score && fixture.score.away !== undefined && (
              <span
                className={`font-mono tabular-nums text-xs sm:text-[13px] shrink-0 font-black ${
                  isLive
                    ? 'text-white px-1.5 py-0.2 rounded-full bg-theme-live'
                    : 'text-theme-main'
                }`}
              >
                {fixture.score.away}
              </span>
            )}
          </div>

          {/* Subtext info: Kickoff time, Status, League */}
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] sm:text-xs font-mono tabular-nums whitespace-nowrap min-w-0 truncate">
            {isLive ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-theme-live text-white font-black text-[10px] animate-pulse shrink-0">
                <span className="w-1 h-1 rounded-full bg-white" />
                <span>LIVE {fixture.minute ? `${fixture.minute}'` : ''}</span>
              </span>
            ) : null}
            {showLeagueInRow && (
              <>
                <span
                  className="text-theme-sub truncate max-w-[90px] font-medium"
                  title={fixture.leagueName || fixture.league}
                >
                  {fixture.leagueName || fixture.league}
                </span>
                <span aria-hidden="true" className="text-theme-sub shrink-0">·</span>
              </>
            )}
            {!isLive && (
              <span className="text-theme-sub shrink-0 font-semibold font-mono tabular-nums">
                {kickOff}
              </span>
            )}
            {isLive && fixture.minute && (
              <span className="text-theme-live shrink-0 font-black font-mono tabular-nums">
                {fixture.minute}&apos;
              </span>
            )}
          </div>
        </div>

        {/* Prediction Data Columns */}
        <div className="col-span-6 sm:col-span-6 flex items-center justify-end gap-2 sm:gap-3 shrink-0">
          {/* Section 1: Highest Probability Pick */}
          <div
            className="flex items-center justify-center shrink-0"
            title={pick ? `Model Pick: ${pick.label} (${pick.probabilityFormatted})` : 'No Prediction in Database'}
          >
            {pick && fixture.prediction ? (
              <div className="flex items-center gap-1 font-mono tabular-nums">
                <span className="w-8 sm:w-9 h-6 sm:h-6.5 flex items-center justify-center rounded-lg bg-theme-model-pick text-theme-primary-text text-xs font-black whitespace-nowrap shrink-0 font-mono tabular-nums">
                  {pick.shortLabel}
                </span>
                <span className="hidden sm:inline text-xs font-bold text-theme-main font-mono tabular-nums">
                  {pick.probabilityPercent.toFixed(0)}%
                </span>
              </div>
            ) : (
              <span className="text-xs font-mono font-bold text-theme-sub">
                -
              </span>
            )}
          </div>

          {/* Section 2: Probabilities */}
          <div className="flex items-center justify-end gap-1 font-mono tabular-nums text-xs font-bold shrink-0 whitespace-nowrap">
            {marketFilter === 'OVER_UNDER' ? (
              <>
                <span
                  className={`w-8 sm:w-9 h-6 sm:h-6.5 flex items-center justify-center rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors font-mono tabular-nums ${
                    over25 && over25 >= 50
                      ? 'bg-theme-primary text-theme-primary-text font-black'
                      : 'bg-theme-subtle text-theme-sub font-bold'
                  }`}
                >
                  {over25 !== null ? over25.toFixed(0) : '-'}
                </span>
                <span
                  className={`w-8 sm:w-9 h-6 sm:h-6.5 flex items-center justify-center rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors font-mono tabular-nums ${
                    under25 && under25 >= 50
                      ? 'bg-theme-primary text-theme-primary-text font-black'
                      : 'bg-theme-subtle text-theme-sub font-bold'
                  }`}
                >
                  {under25 !== null ? under25.toFixed(0) : '-'}
                </span>
              </>
            ) : marketFilter === 'BTTS' ? (
              <>
                <span
                  className={`w-8 sm:w-9 h-6 sm:h-6.5 flex items-center justify-center rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors font-mono tabular-nums ${
                    bttsYes && bttsYes >= 50
                      ? 'bg-theme-primary text-theme-primary-text font-black'
                      : 'bg-theme-subtle text-theme-sub font-bold'
                  }`}
                >
                  {bttsYes !== null ? bttsYes.toFixed(0) : '-'}
                </span>
                <span
                  className={`w-8 sm:w-9 h-6 sm:h-6.5 flex items-center justify-center rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors font-mono tabular-nums ${
                    bttsNo && bttsNo >= 50
                      ? 'bg-theme-primary text-theme-primary-text font-black'
                      : 'bg-theme-subtle text-theme-sub font-bold'
                  }`}
                >
                  {bttsNo !== null ? bttsNo.toFixed(0) : '-'}
                </span>
              </>
            ) : (
              <>
                <span
                  className={`w-8 sm:w-8.5 h-6 sm:h-6.5 flex items-center justify-center rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors font-mono tabular-nums ${
                    homeProb && homeProb >= 50
                      ? 'bg-theme-primary text-theme-primary-text font-black'
                      : homeProb && homeProb >= 35
                      ? 'bg-theme-subtle text-theme-main font-bold'
                      : 'bg-theme-subtle text-theme-sub'
                  }`}
                >
                  {homeProb !== null ? homeProb.toFixed(0) : '-'}
                </span>
                <span
                  className={`w-8 sm:w-8.5 h-6 sm:h-6.5 flex items-center justify-center rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors font-mono tabular-nums ${
                    drawProb && drawProb >= 35
                      ? 'bg-amber-500/20 text-amber-900 dark:text-amber-400 font-bold'
                      : 'bg-theme-subtle text-theme-sub'
                  }`}
                >
                  {drawProb !== null ? drawProb.toFixed(0) : '-'}
                </span>
                <span
                  className={`w-8 sm:w-8.5 h-6 sm:h-6.5 flex items-center justify-center rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors font-mono tabular-nums ${
                    awayProb && awayProb >= 50
                      ? 'bg-theme-primary text-theme-primary-text font-black'
                      : awayProb && awayProb >= 35
                      ? 'bg-theme-subtle text-theme-main font-bold'
                      : 'bg-theme-subtle text-theme-sub'
                  }`}
                >
                  {awayProb !== null ? awayProb.toFixed(0) : '-'}
                </span>
              </>
            )}
          </div>

          <ChevronRight className="w-3.5 h-3.5 text-theme-sub group-hover:text-theme-primary group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </div>
    );
  };

  const isPercentageSortActive = sortBy && sortBy !== 'DEFAULT';

  return (
    <div className="w-full max-w-full space-y-2.5 text-theme-main font-sans">
      {paginatedFixtures.length === 0 ? (
        <div className="p-8 text-center text-theme-sub bg-theme-card rounded-2xl shadow-theme-sm font-bold text-xs">
          No matches found for the selected filters.
        </div>
      ) : isPercentageSortActive ? (
        <div className="rounded-2xl overflow-hidden bg-theme-card shadow-theme-sm transition-all">
          <div className="bg-theme-card-elevated grid grid-cols-12 items-center px-3 sm:px-4 py-2 sm:py-2.5 gap-2 font-black text-xs select-none">
            <div className="col-span-6 sm:col-span-6 flex items-center gap-1.5 min-w-0 pr-1.5">
              <span className="truncate whitespace-nowrap font-extrabold uppercase text-xs text-theme-main">Matches</span>
            </div>
            <div className="col-span-6 sm:col-span-6 flex items-center justify-end gap-2 sm:gap-3 shrink-0">
              <div className="flex items-center justify-center shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onSelectSortBy?.(sortBy === 'PROB_DESC' ? 'PROB_ASC' : 'PROB_DESC')
                  }
                  className="min-h-[32px] flex items-center justify-center gap-1 font-mono tabular-nums text-xs font-bold text-theme-sub hover:text-theme-primary cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                  title="Sort by Model Pick Probability"
                  aria-label="Sort by Model Pick Probability"
                >
                  <span>PICK</span>
                  {sortBy === 'PROB_DESC' && <ArrowDown className="w-3 h-3 text-theme-primary" />}
                  {sortBy === 'PROB_ASC' && <ArrowUp className="w-3 h-3 text-theme-primary" />}
                  {sortBy !== 'PROB_DESC' && sortBy !== 'PROB_ASC' && (
                    <ArrowUpDown className="w-3 h-3 opacity-50" />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-end gap-1 font-mono tabular-nums text-xs font-bold text-theme-sub shrink-0">
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
                      className={`min-h-[32px] w-8 sm:w-8.5 flex items-center justify-center gap-0.5 rounded-lg cursor-pointer hover:text-theme-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                        sortBy === 'HOME_DESC' ? 'text-theme-primary font-black' : ''
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
                      className={`min-h-[32px] w-8 sm:w-8.5 flex items-center justify-center gap-0.5 rounded-lg cursor-pointer hover:text-theme-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                        sortBy === 'DRAW_DESC' ? 'text-theme-primary font-black' : ''
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
                      className={`min-h-[32px] w-8 sm:w-8.5 flex items-center justify-center gap-0.5 rounded-lg cursor-pointer hover:text-theme-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                        sortBy === 'AWAY_DESC' ? 'text-theme-primary font-black' : ''
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
          <div className="bg-theme-card">
            {paginatedFixtures.map((fixture) => renderFixtureRow(fixture, true))}
          </div>
        </div>
      ) : (
        groupedByLeague.map((group) => (
          <div
            key={group.headerKey}
            className="rounded-xl sm:rounded-2xl overflow-hidden bg-theme-card shadow-theme-sm mb-2 transition-all"
          >
            <div className="bg-theme-card-elevated grid grid-cols-12 items-center px-3 sm:px-3.5 py-1.5 sm:py-2 gap-2 font-bold text-xs select-none">
              <div className="col-span-6 sm:col-span-6 flex items-center min-w-0 pr-1.5">
                <span className="truncate whitespace-nowrap font-extrabold text-theme-main text-xs sm:text-[13px] uppercase tracking-wide">
                  {group.subDivision || group.leagueName}
                </span>
              </div>
              <div className="col-span-6 sm:col-span-6 flex items-center justify-end gap-2 sm:gap-3 shrink-0">
                <div className="flex items-center justify-center shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectSortBy?.('PROB_DESC')}
                    className="min-h-[32px] flex items-center justify-center gap-1 font-mono tabular-nums text-xs font-bold text-theme-sub hover:text-theme-primary cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                    title="Click to sort table by Model Pick %"
                    aria-label="Sort table by Model Pick %"
                  >
                    <span>PICK</span>
                    <ArrowUpDown className="w-3 h-3 opacity-50" />
                  </button>
                </div>
                <div className="flex items-center justify-end gap-1 font-mono tabular-nums text-xs font-bold text-theme-sub shrink-0">
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
                        className="min-h-[32px] w-8 sm:w-8.5 flex items-center justify-center text-center shrink-0 hover:text-theme-primary cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                        title="Sort by Home Win %"
                        aria-label="Sort by Home Win %"
                      >
                        1
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectSortBy?.('DRAW_DESC')}
                        className="min-h-[32px] w-8 sm:w-8.5 flex items-center justify-center text-center shrink-0 hover:text-theme-primary cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                        title="Sort by Draw %"
                        aria-label="Sort by Draw %"
                      >
                        X
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectSortBy?.('AWAY_DESC')}
                        className="min-h-[32px] w-8 sm:w-8.5 flex items-center justify-center text-center shrink-0 hover:text-theme-primary cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
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
            <div className="bg-theme-card">
              {group.fixtures.map((fixture) => renderFixtureRow(fixture, false))}
            </div>
          </div>
        ))
      )}

      {/* Pagination Bar */}
      {fixtures.length > 0 && (
        <PaginationBar
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalItems={fixtures.length}
          startIndex={startItemIndex}
          endIndex={endItemIndex}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
        />
      )}
    </div>
  );
};
