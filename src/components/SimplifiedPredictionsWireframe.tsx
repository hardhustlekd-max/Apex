import React, { useState, useMemo, useEffect } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Fixture, LeagueGroupDTO } from '../core/types.js';
import { formatMatchDateTime } from '../core/dateUtils.js';
import { PaginationBar, TeamAvatar } from './ui/index.js';

interface SimplifiedPredictionsWireframeProps {
  fixtures: Fixture[];
  groups?: LeagueGroupDTO[];
  onSelectDetail: (fixture: Fixture) => void;
  marketFilter?: 'MOST_LIKELY' | 'OVER_UNDER' | '1X2' | 'BTTS';
  sortBy?: 'DEFAULT' | 'PROB_DESC' | 'PROB_ASC' | 'HOME_DESC' | 'DRAW_DESC' | 'AWAY_DESC';
  onSelectSortBy?: (s: 'DEFAULT' | 'PROB_DESC' | 'PROB_ASC' | 'HOME_DESC' | 'DRAW_DESC' | 'AWAY_DESC') => void;
  selectedFixtureId?: string | number;
}

export const SimplifiedPredictionsWireframe: React.FC<SimplifiedPredictionsWireframeProps> = ({
  fixtures,
  groups,
  onSelectDetail,
  marketFilter = 'MOST_LIKELY',
  sortBy = 'DEFAULT',
  onSelectSortBy,
  selectedFixtureId,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [expandedLeagues, setExpandedLeagues] = useState<Record<string, boolean>>({});
  const [leaguePages, setLeaguePages] = useState<Record<string, number>>({});

  useEffect(() => {
    setCurrentPage(1);
    setLeaguePages({});
  }, [marketFilter, sortBy]);

  const toggleLeagueExpand = (headerKey: string) => {
    setExpandedLeagues((prev) => ({
      ...prev,
      [headerKey]: !prev[headerKey],
    }));
  };

  // Server already deduplicates and sorts fixtures by active sortBy/marketFilter
  const orderedFixtures = fixtures;

  const totalPages = Math.max(1, Math.ceil(orderedFixtures.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedFixtures = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return orderedFixtures.slice(startIndex, startIndex + pageSize);
  }, [orderedFixtures, safeCurrentPage, pageSize]);

  const startItemIndex = orderedFixtures.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItemIndex = Math.min(safeCurrentPage * pageSize, orderedFixtures.length);

  // O(N) Map reconstruction from server-ordered LeagueGroupDTO[] (zero client sorting or scoring)
  const groupedByLeague = useMemo(() => {
    interface LeagueGroupView {
      leagueName: string;
      subDivision?: string;
      headerKey: string;
      fixtures: Fixture[];
    }

    if (groups && groups.length > 0) {
      const fixtureById = new Map<string, Fixture>();
      for (const f of orderedFixtures) {
        if (f.id) fixtureById.set(f.id, f);
      }

      const hydrated: LeagueGroupView[] = [];
      for (const g of groups) {
        const matched: Fixture[] = [];
        for (const id of g.fixtureIds) {
          const item = fixtureById.get(id);
          if (item) matched.push(item);
        }
        if (matched.length > 0) {
          hydrated.push({
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

    const groupMap = new Map<string, LeagueGroupView>();
    for (const fixture of orderedFixtures) {
      const leagueKey = fixture.league || 'Other';
      const leagueName = fixture.leagueName || fixture.league || 'Other Competition';
      const subDivision = fixture.stage || fixture.leagueName || fixture.league;
      const headerKey = `${leagueKey}_${subDivision}`;

      let group = groupMap.get(headerKey);
      if (!group) {
        group = {
          leagueName,
          subDivision,
          headerKey,
          fixtures: [],
        };
        groupMap.set(headerKey, group);
      }
      group.fixtures.push(fixture);
    }
    return Array.from(groupMap.values());
  }, [orderedFixtures, groups]);

  const renderFixtureRow = (fixture: Fixture, showLeagueInRow: boolean, index = 0) => {
    const isLive = fixture.status === 'LIVE';
    const isSelected = selectedFixtureId !== undefined && String(selectedFixtureId) === String(fixture.id);
    const kickOff = formatMatchDateTime(fixture.matchDate, fixture.kickOffTime || '19:00', fixture.timestamp).timeStr;
    const hasPred = fixture.hasPrediction ?? Boolean(fixture.prediction || fixture.probs);
    const isStandingsClose = Boolean(
      fixture.standingsClose ??
        fixture.prediction?.standingsClose ??
        fixture.prediction?.standingsContext?.standingsClose
    );
    const rawPick = fixture.authoritativePick;
    const pick =
      isStandingsClose && rawPick && (rawPick.key === 'HOME_WIN' || rawPick.key === 'DRAW' || rawPick.key === 'AWAY_WIN')
        ? fixture.highestPick && !['1', 'X', '2'].includes(fixture.highestPick.type)
          ? {
              ...fixture.highestPick,
              key: (fixture.highestPick.type === 'O2.5'
                ? 'OVER_25'
                : fixture.highestPick.type === 'U2.5'
                ? 'UNDER_25'
                : fixture.highestPick.type === 'BTTS_Y'
                ? 'BTTS_YES'
                : 'BTTS_NO') as any,
              isStandingsCloseFallback: true,
            }
          : null
        : rawPick;
    const probs = fixture.probs;

    const homeProb = hasPred && probs && !isStandingsClose ? probs.home : null;
    const drawProb = hasPred && probs && !isStandingsClose ? probs.draw : null;
    const awayProb = hasPred && probs && !isStandingsClose ? probs.away : null;
    const over25 = hasPred && probs ? probs.over25 : null;
    const under25 = hasPred && probs ? probs.under25 : null;
    const bttsYes = hasPred && probs ? probs.bttsYes : null;
    const bttsNo = hasPred && probs ? probs.bttsNo : null;

    return (
      <div
        key={`${fixture.id}_${index}`}
        role="button"
        tabIndex={0}
        onClick={() => onSelectDetail(fixture)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectDetail(fixture);
          }
        }}
        className={`group grid grid-cols-12 items-center min-h-[38px] px-2.5 py-1 border-b border-theme-subdued last:border-b-0 transition-all duration-150 cursor-pointer gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
          isSelected
            ? 'bg-theme-primary-subtle'
            : isLive
            ? 'bg-rose-50/30 dark:bg-rose-950/20 hover:bg-rose-50/60 dark:hover:bg-rose-950/40'
            : 'bg-theme-card hover:bg-theme-card-elevated'
        }`}
      >
        {/* Match Info Column */}
        <div className="col-span-6 sm:col-span-6 flex flex-col justify-center min-w-0 pr-1">
          {/* Home Team */}
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <TeamAvatar src={fixture.homeBadge} name={fixture.homeTeam} size="xs" />
              <span
                className="font-semibold text-sm truncate whitespace-nowrap text-theme-main"
                title={fixture.homeTeam}
              >
                {fixture.homeTeam}
              </span>
            </div>
            {fixture.score && fixture.score.home !== undefined && (
              <span
                className={`tabular-nums text-sm shrink-0 font-bold ${
                  isLive
                    ? 'min-w-[20px] h-[18px] inline-flex items-center justify-center px-1 rounded-md bg-theme-live text-white text-xs leading-none'
                    : 'min-w-[14px] text-right text-theme-main'
                }`}
              >
                {fixture.score.home}
              </span>
            )}
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-between gap-1.5 min-w-0 mt-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <TeamAvatar src={fixture.awayBadge} name={fixture.awayTeam} size="xs" />
              <span
                className="font-normal text-sm truncate whitespace-nowrap text-theme-sub"
                title={fixture.awayTeam}
              >
                {fixture.awayTeam}
              </span>
            </div>
            {fixture.score && fixture.score.away !== undefined && (
              <span
                className={`tabular-nums text-sm shrink-0 font-bold ${
                  isLive
                    ? 'min-w-[20px] h-[18px] inline-flex items-center justify-center px-1 rounded-md bg-theme-live text-white text-xs leading-none'
                    : 'min-w-[14px] text-right text-theme-main'
                }`}
              >
                {fixture.score.away}
              </span>
            )}
          </div>

          {/* Subtext info: Kickoff time, Status, League */}
          <div className="flex items-center gap-1.5 mt-0.5 text-xs font-normal tabular-nums whitespace-nowrap min-w-0 truncate">
            {isLive ? (
              <span className="h-[16px] inline-flex items-center gap-1 px-1.5 rounded-md bg-theme-live text-white font-bold text-2xs leading-none animate-pulse shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                <span>LIVE {fixture.minute ? `${fixture.minute}'` : ''}</span>
              </span>
            ) : null}
            {showLeagueInRow && (
              <>
                <span
                  className="text-theme-sub truncate max-w-[90px] font-normal"
                  title={fixture.leagueName || fixture.league}
                >
                  {fixture.leagueName || fixture.league}
                </span>
                <span aria-hidden="true" className="text-theme-dim shrink-0">·</span>
              </>
            )}
            {!isLive && (
              <span className="text-theme-dim shrink-0 font-normal tabular-nums">
                {kickOff}
              </span>
            )}
            {isStandingsClose && (
              <>
                <span aria-hidden="true" className="text-theme-dim shrink-0">·</span>
                <span
                  className="text-2xs font-medium text-amber-600 dark:text-amber-400 truncate"
                  title={fixture.standingsCloseReason || 'Close league standings — 1X2 suppressed'}
                >
                  Close · No 1X2
                </span>
              </>
            )}
          </div>
        </div>

        {/* Prediction Data Columns */}
        <div className="col-span-6 sm:col-span-6 flex items-center justify-end gap-1.5 sm:gap-2.5 shrink-0">
          {/* Section 1: Highest Probability Pick */}
          <div
            className="w-[46px] sm:w-[76px] flex items-center justify-center shrink-0"
            title={
              pick
                ? `${isStandingsClose ? 'Alt Market Pick (1X2 Suppressed)' : 'Model Pick'}: ${pick.label} (${pick.probabilityFormatted})`
                : 'No Prediction in Database'
            }
          >
            {pick && hasPred ? (
              <div className="flex items-center justify-center gap-1 tabular-nums">
                <span className="min-w-[32px] max-w-[52px] px-1.5 h-[21px] flex items-center justify-center rounded-lg bg-theme-model-pick text-theme-primary-text shadow-theme-sm text-2xs sm:text-xs leading-none font-bold whitespace-nowrap shrink-0 tabular-nums">
                  {pick.shortLabel || pick.type || '1'}
                </span>
                <span className="hidden sm:inline-block w-[25px] text-right text-xs font-semibold text-theme-main tabular-nums">
                  {pick.probabilityPercent.toFixed(0)}%
                </span>
              </div>
            ) : (
              <span className="text-sm font-normal text-theme-dim">
                -
              </span>
            )}
          </div>

          {/* Section 2: Borderless Tabular Probabilities */}
          <div className="flex items-center justify-end gap-0.5 tabular-nums text-sm shrink-0 whitespace-nowrap">
            {marketFilter === 'OVER_UNDER' ? (
              <>
                <span
                  className={`w-[32px] sm:w-[36px] h-[21px] flex items-center justify-center rounded-md text-sm whitespace-nowrap shrink-0 transition-colors tabular-nums ${
                    over25 && over25 >= 50
                      ? 'bg-theme-primary-subtle text-theme-primary font-semibold'
                      : 'text-theme-sub font-normal'
                  }`}
                >
                  {over25 !== null ? over25.toFixed(0) : '-'}
                </span>
                <span
                  className={`w-[32px] sm:w-[36px] h-[21px] flex items-center justify-center rounded-md text-sm whitespace-nowrap shrink-0 transition-colors tabular-nums ${
                    under25 && under25 >= 50
                      ? 'bg-theme-primary-subtle text-theme-primary font-semibold'
                      : 'text-theme-sub font-normal'
                  }`}
                >
                  {under25 !== null ? under25.toFixed(0) : '-'}
                </span>
              </>
            ) : marketFilter === 'BTTS' ? (
              <>
                <span
                  className={`w-[32px] sm:w-[36px] h-[21px] flex items-center justify-center rounded-md text-sm whitespace-nowrap shrink-0 transition-colors tabular-nums ${
                    bttsYes && bttsYes >= 50
                      ? 'bg-theme-primary-subtle text-theme-primary font-semibold'
                      : 'text-theme-sub font-normal'
                  }`}
                >
                  {bttsYes !== null ? bttsYes.toFixed(0) : '-'}
                </span>
                <span
                  className={`w-[32px] sm:w-[36px] h-[21px] flex items-center justify-center rounded-md text-sm whitespace-nowrap shrink-0 transition-colors tabular-nums ${
                    bttsNo && bttsNo >= 50
                      ? 'bg-theme-primary-subtle text-theme-primary font-semibold'
                      : 'text-theme-sub font-normal'
                  }`}
                >
                  {bttsNo !== null ? bttsNo.toFixed(0) : '-'}
                </span>
              </>
            ) : (
              <>
                <span
                  title={isStandingsClose ? '1X2 disabled due to close league standings' : undefined}
                  className={`w-[27px] sm:w-[30px] h-[21px] flex items-center justify-center rounded-md text-sm whitespace-nowrap shrink-0 transition-colors tabular-nums ${
                    homeProb && homeProb >= 50
                      ? 'bg-theme-primary-subtle text-theme-primary font-semibold'
                      : homeProb && homeProb >= 35
                      ? 'text-theme-main font-medium'
                      : 'text-theme-sub font-normal'
                  }`}
                >
                  {homeProb !== null ? homeProb.toFixed(0) : isStandingsClose ? '—' : '-'}
                </span>
                <span
                  title={isStandingsClose ? '1X2 disabled due to close league standings' : undefined}
                  className={`w-[27px] sm:w-[30px] h-[21px] flex items-center justify-center rounded-md text-sm whitespace-nowrap shrink-0 transition-colors tabular-nums ${
                    drawProb && drawProb >= 35
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold'
                      : 'text-theme-sub font-normal'
                  }`}
                >
                  {drawProb !== null ? drawProb.toFixed(0) : isStandingsClose ? '—' : '-'}
                </span>
                <span
                  title={isStandingsClose ? '1X2 disabled due to close league standings' : undefined}
                  className={`w-[27px] sm:w-[30px] h-[21px] flex items-center justify-center rounded-md text-sm whitespace-nowrap shrink-0 transition-colors tabular-nums ${
                    awayProb && awayProb >= 50
                      ? 'bg-theme-primary-subtle text-theme-primary font-semibold'
                      : awayProb && awayProb >= 35
                      ? 'text-theme-main font-medium'
                      : 'text-theme-sub font-normal'
                  }`}
                >
                  {awayProb !== null ? awayProb.toFixed(0) : isStandingsClose ? '—' : '-'}
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
  const areAllLeaguesExpanded =
    groupedByLeague.length > 0 && groupedByLeague.every((g) => !!expandedLeagues[g.headerKey]);

  const handleToggleAllLeagues = () => {
    if (areAllLeaguesExpanded) {
      setExpandedLeagues({});
    } else {
      const next: Record<string, boolean> = {};
      for (const g of groupedByLeague) {
        next[g.headerKey] = true;
      }
      setExpandedLeagues(next);
    }
  };

  return (
    <div className="w-full max-w-full space-y-2.5 text-theme-main font-sans">
      {orderedFixtures.length === 0 ? (
        <div className="p-6 text-center text-theme-sub bg-theme-card border border-theme rounded-2xl shadow-theme-sm font-medium text-sm">
          No matches found for the selected filters.
        </div>
      ) : isPercentageSortActive ? (
        <div className="rounded-2xl border border-theme overflow-hidden bg-theme-card shadow-theme-sm transition-all">
          <div className="bg-theme-header-grad border-b border-theme-subdued grid grid-cols-12 items-center px-2.5 sm:px-3 py-1.5 gap-1.5 select-none min-h-[38px]">
            <div className="col-span-6 sm:col-span-6 flex items-center gap-1.5 min-w-0 pr-1">
              <span className="truncate whitespace-nowrap font-semibold text-base tracking-[-0.01em] text-theme-main">Matches</span>
            </div>
            <div className="col-span-6 sm:col-span-6 flex items-center justify-end gap-1.5 sm:gap-2.5 shrink-0">
              <div className="w-[46px] sm:w-[76px] flex items-center justify-center shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onSelectSortBy?.(sortBy === 'PROB_DESC' ? 'PROB_ASC' : 'PROB_DESC')
                  }
                  className="h-[24px] flex items-center justify-center gap-1 tabular-nums text-2xs font-medium text-theme-sub hover:text-theme-primary cursor-pointer rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
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
              <div className="flex items-center justify-end gap-0.5 tabular-nums text-2xs font-medium text-theme-sub shrink-0">
                {marketFilter === 'OVER_UNDER' ? (
                  <>
                    <span className="w-[32px] sm:w-[36px] h-[24px] flex items-center justify-center text-center">O 2.5</span>
                    <span className="w-[32px] sm:w-[36px] h-[24px] flex items-center justify-center text-center">U 2.5</span>
                  </>
                ) : marketFilter === 'BTTS' ? (
                  <>
                    <span className="w-[32px] sm:w-[36px] h-[24px] flex items-center justify-center text-center">YES</span>
                    <span className="w-[32px] sm:w-[36px] h-[24px] flex items-center justify-center text-center">NO</span>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectSortBy?.(sortBy === 'HOME_DESC' ? 'DEFAULT' : 'HOME_DESC')
                      }
                      className={`h-[24px] w-[27px] sm:w-[30px] flex items-center justify-center gap-0.5 rounded-md cursor-pointer hover:text-theme-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                        sortBy === 'HOME_DESC' ? 'text-theme-primary font-semibold' : ''
                      }`}
                      title="Sort by Home Win %"
                      aria-label="Sort by Home Win %"
                    >
                      <span>1</span>
                      {sortBy === 'HOME_DESC' && <ArrowDown className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectSortBy?.(sortBy === 'DRAW_DESC' ? 'DEFAULT' : 'DRAW_DESC')
                      }
                      className={`h-[24px] w-[27px] sm:w-[30px] flex items-center justify-center gap-0.5 rounded-md cursor-pointer hover:text-theme-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                        sortBy === 'DRAW_DESC' ? 'text-theme-primary font-semibold' : ''
                      }`}
                      title="Sort by Draw %"
                      aria-label="Sort by Draw %"
                    >
                      <span>X</span>
                      {sortBy === 'DRAW_DESC' && <ArrowDown className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectSortBy?.(sortBy === 'AWAY_DESC' ? 'DEFAULT' : 'AWAY_DESC')
                      }
                      className={`h-[24px] w-[27px] sm:w-[30px] flex items-center justify-center gap-0.5 rounded-md cursor-pointer hover:text-theme-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                        sortBy === 'AWAY_DESC' ? 'text-theme-primary font-semibold' : ''
                      }`}
                      title="Sort by Away Win %"
                      aria-label="Sort by Away Win %"
                    >
                      <span>2</span>
                      {sortBy === 'AWAY_DESC' && <ArrowDown className="w-3 h-3" />}
                    </button>
                  </>
                )}
              </div>
              <span className="w-3.5 shrink-0" aria-hidden="true" />
            </div>
          </div>
          <div className="bg-theme-card">
            {paginatedFixtures.map((fixture, idx) => renderFixtureRow(fixture, true, idx))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {groupedByLeague.length > 1 && (
            <div className="flex items-center justify-between px-1 py-0.5 text-xs text-theme-sub">
              <span className="font-normal tabular-nums">
                {groupedByLeague.length} competitions · {orderedFixtures.length} {orderedFixtures.length === 1 ? 'match' : 'matches'}
              </span>
              <button
                type="button"
                onClick={handleToggleAllLeagues}
                className="h-[24px] inline-flex items-center gap-1 text-xs font-medium text-theme-sub hover:text-theme-primary hover:bg-theme-card transition-colors cursor-pointer px-2 rounded-lg whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
              >
                {areAllLeaguesExpanded ? (
                  <>
                    <ChevronsDownUp className="w-3.5 h-3.5" />
                    <span>Collapse all</span>
                  </>
                ) : (
                  <>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                    <span>Expand all</span>
                  </>
                )}
              </button>
            </div>
          )}

          {groupedByLeague.map((group) => {
            const isExpanded = !!expandedLeagues[group.headerKey];
            const isCollapsed = !isExpanded;
            const panelId = `league-accordion-${group.headerKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            const totalGroupMatches = group.fixtures.length;
            const showLeaguePagination = totalGroupMatches > pageSize;
            const totalGroupPages = Math.max(1, Math.ceil(totalGroupMatches / pageSize));
            const rawGroupPage = leaguePages[group.headerKey] || 1;
            const safeGroupPage = Math.min(rawGroupPage, totalGroupPages);
            const groupStartIdx = (safeGroupPage - 1) * pageSize;
            const visibleGroupFixtures = showLeaguePagination
              ? group.fixtures.slice(groupStartIdx, groupStartIdx + pageSize)
              : group.fixtures;

            return (
              <div
                key={group.headerKey}
                className="rounded-2xl border border-theme overflow-hidden bg-theme-card shadow-theme-sm transition-colors"
              >
                {isCollapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleLeagueExpand(group.headerKey)}
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    className="w-full min-h-[34px] flex items-center justify-between gap-2 px-2.5 sm:px-3 py-1.5 bg-theme-card hover:bg-theme-card-elevated transition-colors cursor-pointer text-left select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <ChevronDown className="w-3.5 h-3.5 text-theme-primary shrink-0 -rotate-90 transition-transform duration-150" />
                      <span
                        className="font-semibold text-theme-main text-xs leading-snug tracking-[-0.01em] truncate"
                        title={group.subDivision || group.leagueName}
                      >
                        {group.subDivision || group.leagueName}
                      </span>
                    </div>
                    <span className="h-[20px] min-w-[22px] px-1.5 rounded-md bg-theme-subtle text-theme-sub text-2xs font-medium tabular-nums flex items-center justify-center shrink-0">
                      {totalGroupMatches}
                    </span>
                  </button>
                ) : (
                  <div className="grid grid-cols-12 items-center px-2.5 sm:px-3 py-1.5 gap-1.5 select-none transition-colors min-h-[34px] bg-theme-header-grad border-b border-theme-subdued">
                    <div className="col-span-6 sm:col-span-6 flex items-center min-w-0 pr-1">
                      <button
                        type="button"
                        onClick={() => toggleLeagueExpand(group.headerKey)}
                        aria-expanded={isExpanded}
                        aria-controls={panelId}
                        className="w-full min-h-[24px] flex items-center gap-2 text-left cursor-pointer rounded-lg hover:text-theme-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent min-w-0"
                      >
                        <ChevronDown className="w-3.5 h-3.5 text-theme-primary shrink-0 rotate-0 transition-transform duration-150" />
                        <span className="font-semibold text-theme-main text-xs leading-snug tracking-[-0.01em] break-words">
                          {group.subDivision || group.leagueName}
                        </span>
                        <span className="text-theme-dim tabular-nums text-2xs font-medium shrink-0">
                          · {totalGroupMatches}
                        </span>
                      </button>
                    </div>

                    <div className="col-span-6 sm:col-span-6 flex items-center justify-end gap-1.5 sm:gap-2.5 shrink-0">
                      <div className="w-[46px] sm:w-[76px] flex items-center justify-center shrink-0">
                        <button
                          type="button"
                          onClick={() => onSelectSortBy?.('PROB_DESC')}
                          className="h-[24px] flex items-center justify-center gap-0.5 tabular-nums text-2xs font-medium text-theme-sub hover:text-theme-primary cursor-pointer rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                          title="Click to sort table by Model Pick %"
                          aria-label="Sort table by Model Pick %"
                        >
                          <span>PICK</span>
                          <ArrowUpDown className="w-3 h-3 opacity-50" />
                        </button>
                      </div>
                      <div className="flex items-center justify-end gap-0.5 tabular-nums text-2xs font-medium text-theme-sub shrink-0">
                        {marketFilter === 'OVER_UNDER' ? (
                          <>
                            <span className="w-[32px] sm:w-[36px] h-[24px] flex items-center justify-center text-center">O 2.5</span>
                            <span className="w-[32px] sm:w-[36px] h-[24px] flex items-center justify-center text-center">U 2.5</span>
                          </>
                        ) : marketFilter === 'BTTS' ? (
                          <>
                            <span className="w-[32px] sm:w-[36px] h-[24px] flex items-center justify-center text-center">YES</span>
                            <span className="w-[32px] sm:w-[36px] h-[24px] flex items-center justify-center text-center">NO</span>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onSelectSortBy?.('HOME_DESC')}
                              className="h-[24px] w-[27px] sm:w-[30px] flex items-center justify-center text-center shrink-0 hover:text-theme-primary cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                              title="Sort by Home Win %"
                              aria-label="Sort by Home Win %"
                            >
                              1
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectSortBy?.('DRAW_DESC')}
                              className="h-[24px] w-[27px] sm:w-[30px] flex items-center justify-center text-center shrink-0 hover:text-theme-primary cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                              title="Sort by Draw %"
                              aria-label="Sort by Draw %"
                            >
                              X
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectSortBy?.('AWAY_DESC')}
                              className="h-[24px] w-[27px] sm:w-[30px] flex items-center justify-center text-center shrink-0 hover:text-theme-primary cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                              title="Sort by Away Win %"
                              aria-label="Sort by Away Win %"
                            >
                              2
                            </button>
                          </>
                        )}
                      </div>
                      <span className="w-3.5 shrink-0" aria-hidden="true" />
                    </div>
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      id={panelId}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      className="bg-theme-card"
                    >
                      {visibleGroupFixtures.map((fixture, idx) => renderFixtureRow(fixture, false, idx))}
                      {showLeaguePagination && (
                        <PaginationBar
                          embedded
                          currentPage={safeGroupPage}
                          totalPages={totalGroupPages}
                          totalItems={totalGroupMatches}
                          startIndex={groupStartIdx + 1}
                          endIndex={Math.min(safeGroupPage * pageSize, totalGroupMatches)}
                          pageSize={pageSize}
                          onPageChange={(nextPage) =>
                            setLeaguePages((prev) => ({
                              ...prev,
                              [group.headerKey]: nextPage,
                            }))
                          }
                          onPageSizeChange={(size) => {
                            setPageSize(size);
                            setLeaguePages({});
                            setCurrentPage(1);
                          }}
                        />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Flat list pagination only when percentage sort is active and matches exceed pageSize */}
      {isPercentageSortActive && orderedFixtures.length > pageSize && (
        <PaginationBar
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalItems={orderedFixtures.length}
          startIndex={startItemIndex}
          endIndex={endItemIndex}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setLeaguePages({});
            setCurrentPage(1);
          }}
        />
      )}
    </div>
  );
};
