import React, { useState, useMemo, useEffect } from 'react';
import { X, History, Target, Trophy } from 'lucide-react';
import { Fixture, HeadToHeadMeasurement, LeagueStandingEntry, LeagueStandingTable, MarketOption } from '../core/types.js';
import { TacticalAnalysis } from './TacticalAnalysis.js';
import { parseDynamicStatistics, StatCategoryGroup } from '../core/statisticsParser.js';
import { EngineService } from '../services/engineService.js';
import { LeagueStandings } from './LeagueStandings.js';
import { getProbValue } from '../core/formatters.js';
import { teamMatchScore, resolveFixtureAlignment, resolveTeamSide } from '../core/feedParser.js';
import { formatMatchDateTime } from '../core/dateUtils.js';
import { Card, SegmentedTabs, StatTile, EmptyState, SectionHeader, TeamAvatar } from './ui/index.js';

export interface MatchDetailViewProps {
  fixture: Fixture | null;
  onClose?: () => void;
  isPanel?: boolean;
}

type ModalTab = 'OVERVIEW' | 'H2H' | 'STATS' | 'TEAMS' | 'STANDINGS' | 'PREDICTIONS' | 'TACTICS';

export const MatchDetailView: React.FC<MatchDetailViewProps> = ({
  fixture,
  onClose,
  isPanel = false,
}) => {
  const safeFixture = useMemo(() => {
    if (!fixture) return null;
    return fixture;
  }, [fixture]);

  if (!fixture || !safeFixture) {
    if (isPanel) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center text-theme-sub bg-theme-card select-none">
          <Target className="w-6 h-6 text-theme-primary mb-2" />
          <h4 className="font-semibold text-lg text-theme-main tracking-[-0.015em]">Select a Match</h4>
        </div>
      );
    }
    return null;
  }

  return <MatchDetailModalContent fixture={safeFixture} onClose={onClose} isPanel={isPanel} />;
};

export const MatchDetailModal: React.FC<{ fixture: Fixture | null; onClose: () => void }> = ({
  fixture,
  onClose,
}) => {
  const lastFixtureRef = React.useRef(fixture);
  useEffect(() => {
    if (fixture) lastFixtureRef.current = fixture;
  }, [fixture]);

  useEffect(() => {
    if (!fixture) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fixture, onClose]);

  const displayFixture = fixture || lastFixtureRef.current;
  if (!displayFixture) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${displayFixture.homeTeam} vs ${displayFixture.awayTeam} details`}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-3 bg-theme-overlay backdrop-blur-xl animate-in fade-in duration-200"
    >
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-2xl h-[86vh] sm:h-[80vh] max-h-[680px] min-h-0 flex flex-col pointer-events-auto z-10 my-auto shadow-theme-md animate-in slide-in-from-bottom-4 duration-300">
        <MatchDetailView fixture={displayFixture} onClose={onClose} isPanel={false} />
      </div>
    </div>
  );
};

const MatchDetailModalContent: React.FC<{ fixture: Fixture; onClose?: () => void; isPanel?: boolean }> = ({
  fixture,
  onClose,
  isPanel = false,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('OVERVIEW');
  const [statFilterGroup] = useState<StatCategoryGroup>('ALL');

  const [enrichedFixture, setEnrichedFixture] = useState<Fixture>(fixture);
  const [, setIsParsing] = useState<boolean>(false);

  const hasTeamFormData = (h?: HeadToHeadMeasurement | null): boolean =>
    !!(
      h &&
      ((h.homeRecentMatches && h.homeRecentMatches.length > 0) ||
        (h.awayRecentMatches && h.awayRecentMatches.length > 0))
    );

  const hasAnyH2HData = (h?: HeadToHeadMeasurement | null): boolean =>
    !!(
      h &&
      (h.matchesCount > 0 ||
        (h.homeRecentMatches && h.homeRecentMatches.length > 0) ||
        (h.awayRecentMatches && h.awayRecentMatches.length > 0) ||
        (h.recentH2H && h.recentH2H.length > 0))
    );

  const initialH2H =
    fixture.measurements?.h2h ||
    fixture.prediction?.measurements?.h2h ||
    null;

  const hasInitialValidH2H = hasTeamFormData(initialH2H);

  const [scrapedH2H, setScrapedH2H] = useState<HeadToHeadMeasurement | null>(hasInitialValidH2H ? initialH2H : null);
  const [isLoadingH2H, setIsLoadingH2H] = useState<boolean>(!hasInitialValidH2H);
  const [standingsTable, setStandingsTable] = useState<LeagueStandingTable | null>(null);
  const [isLoadingStandings, setIsLoadingStandings] = useState<boolean>(true);

  useEffect(() => {
    let isCancelled = false;

    const currentH2H =
      fixture.measurements?.h2h ||
      fixture.prediction?.measurements?.h2h ||
      null;

    const hasValidH2H = hasTeamFormData(currentH2H);

    setEnrichedFixture(fixture);
    setScrapedH2H(hasValidH2H ? currentH2H : null);
    setIsLoadingH2H(!hasValidH2H);

    async function loadDetailsAndH2H() {
      if (!fixture.id) return;

      let resolvedTeamForm = hasValidH2H;

      if (
        !fixture.statistics?.length ||
        !fixture.information?.length ||
        !fixture.prediction ||
        !fixture.markets?.length ||
        !fixture.prediction?.topCorrectScores?.length ||
        !fixture.marketOdds
      ) {
        setIsParsing(true);
        try {
          const detail = await EngineService.getMatchDetail(fixture.id);
          if (detail && !isCancelled) {
            setEnrichedFixture((prev) => ({
              ...prev,
              ...detail,
              statistics: detail.statistics?.length ? detail.statistics : prev.statistics,
              information: detail.information?.length ? detail.information : prev.information,
              score: detail.score || prev.score,
              marketOdds: detail.marketOdds || prev.marketOdds,
              measurements: {
                ...prev.measurements,
                ...(detail.measurements || {}),
              },
            }));
            const detailH2H = detail.measurements?.h2h || detail.prediction?.measurements?.h2h;
            if (hasAnyH2HData(detailH2H)) {
              setScrapedH2H(detailH2H!);
              if (hasTeamFormData(detailH2H)) {
                resolvedTeamForm = true;
                setIsLoadingH2H(false);
              }
            }
          }
        } catch (err) {
          console.warn('[MatchDetail] Detail fetch failed:', err);
        } finally {
          if (!isCancelled) setIsParsing(false);
        }
      }

      if (!resolvedTeamForm) {
        try {
          setIsLoadingH2H(true);
          const data = await EngineService.getMatchHeadToHead(fixture.id, fixture.homeTeam, fixture.awayTeam);
          if (!isCancelled && hasAnyH2HData(data)) {
            setScrapedH2H(data!);
            setEnrichedFixture((prev) => ({
              ...prev,
              measurements: {
                ...prev.measurements,
                h2h: data!,
              },
              h2hMatches: data!.recentH2H || prev.h2hMatches,
            }));
          }
        } catch (err) {
          console.warn('Unable to load live H2H:', err);
        } finally {
          if (!isCancelled) {
            setIsLoadingH2H(false);
          }
        }
      } else {
        setIsLoadingH2H(false);
      }
    }

    loadDetailsAndH2H();

    return () => {
      isCancelled = true;
    };
  }, [fixture.id, fixture.homeTeam, fixture.awayTeam]);

  useEffect(() => {
    let isCancelled = false;

    async function loadFixtureStandings() {
      const targetLeague = enrichedFixture.league || enrichedFixture.leagueName || 'ALL';
      try {
        setIsLoadingStandings(true);
        const data = await EngineService.getLeagueStandings(targetLeague, {
          leagueUrl: enrichedFixture.leagueUrl,
          leagueName: enrichedFixture.leagueName,
          homeTeam: enrichedFixture.homeTeam,
          awayTeam: enrichedFixture.awayTeam,
        });
        if (!isCancelled) {
          setStandingsTable(data && Array.isArray(data.table) && data.table.length > 0 ? data : null);
        }
      } catch {
        if (!isCancelled) {
          setStandingsTable(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingStandings(false);
        }
      }
    }

    void loadFixtureStandings();

    return () => {
      isCancelled = true;
    };
  }, [
    fixture.id,
    enrichedFixture.league,
    enrichedFixture.leagueUrl,
    enrichedFixture.leagueName,
    enrichedFixture.homeTeam,
    enrichedFixture.awayTeam,
  ]);

  const currentFixture = enrichedFixture;
  const pred = currentFixture.prediction || null;
  const homeStats = currentFixture.homeStats;
  const awayStats = currentFixture.awayStats;

  const bestMarketsPerGroup = useMemo(() => {
    if (!currentFixture.markets) return [];
    const groups: Record<string, MarketOption> = {};
    currentFixture.markets.forEach((market) => {
      let group = '';
      if (['HOME_WIN', 'DRAW', 'AWAY_WIN'].includes(market.key)) group = '1X2';
      else if (['OVER_25', 'UNDER_25'].includes(market.key)) group = 'GOALS';
      else if (['BTTS_YES', 'BTTS_NO'].includes(market.key)) group = 'BTTS';
      else if (['DOUBLE_CHANCE_1X', 'DOUBLE_CHANCE_X2'].includes(market.key)) group = 'DC';
      if (group && (!groups[group] || market.probability > groups[group].probability)) {
        groups[group] = market;
      }
    });
    return Object.entries(groups).map(([groupName, market]) => ({ groupName, ...market }));
  }, [currentFixture.markets]);

  const rawH2H: HeadToHeadMeasurement = useMemo(() => (
    scrapedH2H ||
    enrichedFixture.measurements?.h2h ||
    pred?.measurements?.h2h || {
      matchesCount: enrichedFixture.h2hMatches?.length || 0,
      homeWins: 0,
      draws: 0,
      awayWins: 0,
      homeGoalsAvg: 0,
      awayGoalsAvg: 0,
      h2hMultiplierHome: 1.0,
      h2hMultiplierAway: 1.0,
      recentH2H: enrichedFixture.h2hMatches || [],
      homeClub: fixture.homeTeam,
      awayClub: fixture.awayTeam,
      homeRecentMatches: [],
      awayRecentMatches: [],
    }
  ), [scrapedH2H, enrichedFixture.measurements?.h2h, enrichedFixture.h2hMatches, pred?.measurements?.h2h, fixture.homeTeam, fixture.awayTeam]);

  const isSwappedH2H = useMemo(() => {
    if (!rawH2H.homeClub && !rawH2H.awayClub) return false;
    if (rawH2H.homeClub && rawH2H.awayClub) {
      const alignment = resolveFixtureAlignment(fixture.homeTeam, fixture.awayTeam, rawH2H.homeClub, rawH2H.awayClub);
      if (alignment.matched) return !alignment.isHomeFixture;
    }
    if (rawH2H.homeClub) {
      return resolveTeamSide(rawH2H.homeClub, fixture.homeTeam, fixture.awayTeam) === 'AWAY';
    }
    if (rawH2H.awayClub) {
      return resolveTeamSide(rawH2H.awayClub, fixture.homeTeam, fixture.awayTeam) === 'HOME';
    }
    return false;
  }, [rawH2H.homeClub, rawH2H.awayClub, fixture.homeTeam, fixture.awayTeam]);

  const h2h: HeadToHeadMeasurement = useMemo(() => {
    if (!isSwappedH2H) return rawH2H;
    return {
      ...rawH2H,
      homeClub: rawH2H.awayClub || fixture.homeTeam,
      awayClub: rawH2H.homeClub || fixture.awayTeam,
      homeWins: rawH2H.awayWins,
      awayWins: rawH2H.homeWins,
      homeGoalsAvg: rawH2H.awayGoalsAvg,
      awayGoalsAvg: rawH2H.homeGoalsAvg,
      h2hMultiplierHome: rawH2H.h2hMultiplierAway,
      h2hMultiplierAway: rawH2H.h2hMultiplierHome,
      homeRecentMatches: rawH2H.awayRecentMatches || [],
      awayRecentMatches: rawH2H.homeRecentMatches || [],
    };
  }, [rawH2H, isSwappedH2H, fixture.homeTeam, fixture.awayTeam]);

  const homeRecentMatchesList = useMemo(() => h2h.homeRecentMatches || [], [h2h.homeRecentMatches]);
  const awayRecentMatchesList = useMemo(() => h2h.awayRecentMatches || [], [h2h.awayRecentMatches]);

  const homeRecentFormList = useMemo(() => {
    return homeRecentMatchesList.map((m) => m.result);
  }, [homeRecentMatchesList]);

  const awayRecentFormList = useMemo(() => {
    return awayRecentMatchesList.map((m) => m.result);
  }, [awayRecentMatchesList]);

  const homeGoalsScored = useMemo(() => {
    return homeRecentMatchesList.reduce((acc, m) => acc + m.goalsFor, 0);
  }, [homeRecentMatchesList]);

  const homeGoalsConceded = useMemo(() => {
    return homeRecentMatchesList.reduce((acc, m) => acc + m.goalsAgainst, 0);
  }, [homeRecentMatchesList]);

  const awayGoalsScored = useMemo(() => {
    return awayRecentMatchesList.reduce((acc, m) => acc + m.goalsFor, 0);
  }, [awayRecentMatchesList]);

  const awayGoalsConceded = useMemo(() => {
    return awayRecentMatchesList.reduce((acc, m) => acc + m.goalsAgainst, 0);
  }, [awayRecentMatchesList]);

  const rawStatistics = useMemo(() => {
    return fixture.statistics || [];
  }, [fixture.statistics]);

  const parsedStatsSummary = useMemo(() => {
    return parseDynamicStatistics(rawStatistics);
  }, [rawStatistics]);

  const _filteredStatItems = useMemo(() => {
    if (statFilterGroup === 'ALL') return parsedStatsSummary.items;
    return parsedStatsSummary.items.filter((item) => item.group === statFilterGroup);
  }, [parsedStatsSummary, statFilterGroup]);

  void _filteredStatItems;

  const homeWinPct = pred ? getProbValue(pred.homeWinProb, 1) : 0;
  const awayWinPct = pred ? getProbValue(pred.awayWinProb, 1) : 0;

  const { homeStandingInfo, awayStandingInfo } = useMemo(() => {
    const empty = {
      homeStandingInfo: null as { entry: LeagueStandingEntry; totalTeams: number; groupName?: string } | null,
      awayStandingInfo: null as { entry: LeagueStandingEntry; totalTeams: number; groupName?: string } | null,
    };
    if (!standingsTable) return empty;
    const groups =
      Array.isArray(standingsTable.groups) && standingsTable.groups.length > 0
        ? standingsTable.groups
        : Array.isArray(standingsTable.table) && standingsTable.table.length > 0
        ? [{ name: 'Standings', table: standingsTable.table }]
        : [];
    if (groups.length === 0) return empty;

    const findTeam = (teamName: string) => {
      let bestScore = 0;
      let bestRes: { entry: LeagueStandingEntry; totalTeams: number; groupName?: string } | null = null;
      for (const grp of groups) {
        for (const e of grp.table) {
          const s = teamMatchScore(teamName, e.teamName);
          if (s > bestScore) {
            bestScore = s;
            bestRes = {
              entry: e,
              totalTeams: grp.table.length,
              groupName: grp.name && grp.name !== 'Standings' ? grp.name : undefined,
            };
          }
        }
      }
      return bestScore > 0 ? bestRes : null;
    };

    return {
      homeStandingInfo: findTeam(fixture.homeTeam),
      awayStandingInfo: findTeam(fixture.awayTeam),
    };
  }, [standingsTable, fixture.homeTeam, fixture.awayTeam]);

  const tabItems = [
    { id: 'OVERVIEW' as ModalTab, label: 'Overview' },
    { id: 'H2H' as ModalTab, label: 'H2H', count: h2h.matchesCount > 0 ? h2h.matchesCount : undefined },
    {
      id: 'TEAMS' as ModalTab,
      label: 'Teams',
      count:
        homeRecentMatchesList.length + awayRecentMatchesList.length > 0
          ? homeRecentMatchesList.length + awayRecentMatchesList.length
          : undefined,
    },
    { id: 'STANDINGS' as ModalTab, label: 'Table' },
    {
      id: 'PREDICTIONS' as ModalTab,
      label: 'Preds',
      count: bestMarketsPerGroup.length > 0 ? bestMarketsPerGroup.length : undefined,
    },
    { id: 'TACTICS' as ModalTab, label: 'Tactics' },
  ];

  const panelContainer = (
    <div
      className={`bg-theme-card text-theme-main flex flex-col overflow-hidden select-none h-full w-full font-sans ${
        isPanel ? '' : 'rounded-t-2xl sm:rounded-2xl border border-theme shadow-theme-md'
      }`}
      style={{ scrollbarGutter: 'stable' }}
    >
      {/* Mobile Drag Handle Affordance */}
      {!isPanel && (
        <div className="w-8 h-1 bg-theme-dim/40 rounded-full mx-auto mt-1.5 mb-0.5 sm:hidden shrink-0 opacity-70" />
      )}

      {/* Neon Gradient Header Band */}
      <div className="bg-theme-header-grad border-b border-theme px-3 pt-1.5 pb-2 shrink-0">
        <div className="min-h-[30px] flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-x-auto no-scrollbar text-xs text-theme-sub">
            <span className="font-medium text-theme-main truncate whitespace-nowrap">
              {fixture.stage || fixture.leagueName}
            </span>
            <span aria-hidden="true" className="text-theme-dim shrink-0">·</span>
            <span className="tabular-nums font-normal text-theme-sub shrink-0">
              {formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp).dateStr}
            </span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-[30px] h-[30px] rounded-full hover:bg-theme-subtle text-theme-sub hover:text-theme-main transition-colors cursor-pointer flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
              aria-label="Close match details"
            >
              <X className="w-4 h-4 stroke-[2.25]" />
            </button>
          )}
        </div>

        {/* Hero Scoreboard (unboxed directly inside header band) */}
        <div className="mt-1.5 py-1 flex items-center justify-between gap-2.5">
          <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
            <TeamAvatar src={fixture.homeBadge} name={fixture.homeTeam} size="md" />
            <span className="text-base font-semibold text-theme-main truncate block max-w-full tracking-[-0.01em]">
              {fixture.homeTeam}
            </span>
            {pred && (
              <span className="text-xs font-semibold tabular-nums text-theme-primary">
                {homeWinPct}%
              </span>
            )}
          </div>

          <div className="flex flex-col items-center shrink-0 px-1.5">
            <span className="text-xl leading-none font-bold tabular-nums text-theme-main tracking-[-0.025em]">
              {fixture.score ? `${fixture.score.home} - ${fixture.score.away}` : 'VS'}
            </span>
            <span className="text-2xs font-medium text-theme-sub uppercase tracking-[0.06em] mt-1 tabular-nums">
              {fixture.status === 'LIVE' ? 'LIVE' : fixture.status === 'FINISHED' ? 'FT' : formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp).timeStr}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
            <TeamAvatar src={fixture.awayBadge} name={fixture.awayTeam} size="md" />
            <span className="text-base font-semibold text-theme-main truncate block max-w-full tracking-[-0.01em]">
              {fixture.awayTeam}
            </span>
            {pred && (
              <span className="text-xs font-semibold tabular-nums text-sky-500 dark:text-sky-400">
                {awayWinPct}%
              </span>
            )}
          </div>
        </div>

        <div className="mt-1.5">
          <SegmentedTabs<ModalTab>
            items={tabItems}
            value={activeTab}
            onChange={(val) => setActiveTab(val)}
            variant="subtle"
            size="xs"
            fullWidth
            ariaLabel="Match inspection tabs"
          />
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="p-3 overflow-y-auto overscroll-contain space-y-2.5 flex-1 min-h-0 min-w-0">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-2.5">
            {pred ? (
              <>
                <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
                  <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
                    <SectionHeader title="Projections" size="sm" className="w-full" />
                  </div>
                  <div className="divide-y divide-[var(--border-subdued)] text-sm tabular-nums">
                    <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between">
                      <span className="text-theme-sub font-normal">Expected Goals (xG)</span>
                      <div className="font-semibold text-theme-main">
                        <span className="text-theme-primary">{pred?.homeXG ?? '-'}</span>
                        <span aria-hidden="true" className="text-theme-dim px-1.5 font-normal">vs</span>
                        <span className="text-sky-500 dark:text-sky-400">{pred?.awayXG ?? '-'}</span>
                      </div>
                    </div>

                    {pred?.teamStrength ? (
                      <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between">
                        <span className="text-theme-sub font-normal">Team Strength Index</span>
                        <div className="font-semibold text-theme-main">
                          <span className="text-theme-primary">{pred.teamStrength.homeStrengthRating}</span>
                          <span aria-hidden="true" className="text-theme-dim px-1.5 font-normal">vs</span>
                          <span className="text-sky-500 dark:text-sky-400">{pred.teamStrength.awayStrengthRating}</span>
                        </div>
                      </div>
                    ) : pred?.eloRatings ? (
                      <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between">
                        <span className="text-theme-sub font-normal">Elo Ratings</span>
                        <div className="font-semibold text-theme-main">
                          <span className="text-theme-primary">{pred.eloRatings.homeElo}</span>
                          <span aria-hidden="true" className="text-theme-dim px-1.5 font-normal">vs</span>
                          <span className="text-sky-500 dark:text-sky-400">{pred.eloRatings.awayElo}</span>
                        </div>
                      </div>
                    ) : null}

                    {pred?.standingsContext && (pred.standingsContext.home || pred.standingsContext.away) && (
                      <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between gap-2">
                        <span className="text-theme-sub font-normal truncate">
                          League Rank{pred.standingsContext.groupName ? ` · ${pred.standingsContext.groupName}` : ''}
                        </span>
                        <div className="font-semibold text-theme-main shrink-0">
                          <span className="text-theme-primary">
                            {pred.standingsContext.home
                              ? `#${pred.standingsContext.home.rank}/${pred.standingsContext.home.totalTeams} (${pred.standingsContext.home.ppg.toFixed(2)})`
                              : '-'}
                          </span>
                          <span aria-hidden="true" className="text-theme-dim px-1.5 font-normal">vs</span>
                          <span className="text-sky-500 dark:text-sky-400">
                            {pred.standingsContext.away
                              ? `#${pred.standingsContext.away.rank}/${pred.standingsContext.away.totalTeams} (${pred.standingsContext.away.ppg.toFixed(2)})`
                              : '-'}
                          </span>
                        </div>
                      </div>
                    )}

                    {pred?.tacticalContext && (
                      <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between">
                        <span className="text-theme-sub font-normal">Rest Days</span>
                        <div className="font-semibold text-theme-main">
                          <span>{pred.tacticalContext.restDaysHome}d</span>
                          <span aria-hidden="true" className="text-theme-dim px-1.5 font-normal">vs</span>
                          <span>{pred.tacticalContext.restDaysAway}d</span>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                {enrichedFixture.marketOdds && (
                  <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
                    <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
                      <SectionHeader
                        title="Flashscore Market Odds"
                        size="sm"
                        className="w-full"
                        action={
                          enrichedFixture.marketOdds.bookmakersCount ? (
                            <span className="text-xs font-normal tabular-nums text-theme-dim">
                              {enrichedFixture.marketOdds.bookmakersCount} bookmakers
                            </span>
                          ) : undefined
                        }
                      />
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-[var(--border-subdued)] text-center tabular-nums">
                      <div className="min-h-[58px] py-2 px-2 flex flex-col justify-center">
                        <span className="text-xs font-medium text-theme-sub block">1 (Home)</span>
                        <span className="text-lg font-bold text-theme-primary block mt-0.5 tracking-[-0.015em]">
                          {enrichedFixture.marketOdds.homeOdds ? enrichedFixture.marketOdds.homeOdds.toFixed(2) : '-'}
                        </span>
                        <span className="text-xs font-normal text-theme-dim block">
                          {enrichedFixture.marketOdds.homeImpliedProb !== undefined
                            ? `${(enrichedFixture.marketOdds.homeImpliedProb * 100).toFixed(1)}%`
                            : '-'}
                        </span>
                      </div>
                      <div className="min-h-[58px] py-2 px-2 flex flex-col justify-center">
                        <span className="text-xs font-medium text-theme-sub block">X (Draw)</span>
                        <span className="text-lg font-bold text-amber-500 block mt-0.5 tracking-[-0.015em]">
                          {enrichedFixture.marketOdds.drawOdds ? enrichedFixture.marketOdds.drawOdds.toFixed(2) : '-'}
                        </span>
                        <span className="text-xs font-normal text-theme-dim block">
                          {enrichedFixture.marketOdds.drawImpliedProb !== undefined
                            ? `${(enrichedFixture.marketOdds.drawImpliedProb * 100).toFixed(1)}%`
                            : '-'}
                        </span>
                      </div>
                      <div className="min-h-[58px] py-2 px-2 flex flex-col justify-center">
                        <span className="text-xs font-medium text-theme-sub block">2 (Away)</span>
                        <span className="text-lg font-bold text-sky-500 dark:text-sky-400 block mt-0.5 tracking-[-0.015em]">
                          {enrichedFixture.marketOdds.awayOdds ? enrichedFixture.marketOdds.awayOdds.toFixed(2) : '-'}
                        </span>
                        <span className="text-xs font-normal text-theme-dim block">
                          {enrichedFixture.marketOdds.awayImpliedProb !== undefined
                            ? `${(enrichedFixture.marketOdds.awayImpliedProb * 100).toFixed(1)}%`
                            : '-'}
                        </span>
                      </div>
                    </div>
                    {(enrichedFixture.marketOdds.over25Odds || enrichedFixture.marketOdds.bttsYesOdds) && (
                      <div className="border-t border-theme-subdued grid grid-cols-2 divide-x divide-[var(--border-subdued)] text-sm tabular-nums">
                        {enrichedFixture.marketOdds.over25Odds && (
                          <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between gap-2">
                            <span className="text-theme-sub font-normal">O/U 2.5</span>
                            <span className="font-semibold text-theme-main">
                              {enrichedFixture.marketOdds.over25Odds.toFixed(2)} / {enrichedFixture.marketOdds.under25Odds?.toFixed(2) ?? '-'}
                            </span>
                          </div>
                        )}
                        {enrichedFixture.marketOdds.bttsYesOdds && (
                          <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between gap-2">
                            <span className="text-theme-sub font-normal">BTTS Y/N</span>
                            <span className="font-semibold text-theme-main">
                              {enrichedFixture.marketOdds.bttsYesOdds.toFixed(2)} / {enrichedFixture.marketOdds.bttsNoOdds?.toFixed(2) ?? '-'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                )}
              </>
            ) : !homeStandingInfo && !awayStandingInfo ? (
              <EmptyState
                icon={<Target className="w-5 h-5" />}
                title="No projections"
                minHeight="min-h-[140px]"
                className="bg-theme-card-elevated"
              />
            ) : null}

            {(homeStandingInfo || awayStandingInfo) && standingsTable && (
              <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
                <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center justify-between gap-2">
                  <SectionHeader
                    title="League Standings"
                    icon={<Trophy className="w-3.5 h-3.5" />}
                    size="sm"
                  />
                  <button
                    type="button"
                    onClick={() => setActiveTab('STANDINGS')}
                    className="text-xs font-semibold text-theme-primary hover:underline cursor-pointer shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent rounded"
                  >
                    Full Table
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subdued)]">
                  {[
                    {
                      key: 'HOME',
                      teamName: fixture.homeTeam,
                      info: homeStandingInfo,
                      accentClass: 'text-theme-primary',
                      winBgClass: 'bg-theme-primary text-theme-primary-text',
                    },
                    {
                      key: 'AWAY',
                      teamName: fixture.awayTeam,
                      info: awayStandingInfo,
                      accentClass: 'text-sky-500 dark:text-sky-400',
                      winBgClass: 'bg-sky-500 text-white',
                    },
                  ].map((side) => (
                    <div key={side.key} className="p-2.5 space-y-1.5 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-theme-main truncate">{side.teamName}</span>
                        {side.info ? (
                          <span className={`text-sm font-bold tabular-nums shrink-0 ${side.accentClass}`}>
                            #{side.info.entry.rank} / {side.info.totalTeams}
                          </span>
                        ) : (
                          <span className="text-xs text-theme-dim shrink-0">Not ranked</span>
                        )}
                      </div>

                      {side.info && (
                        <>
                          <div className="flex items-center justify-between text-xs text-theme-sub tabular-nums">
                            <span>
                              {side.info.entry.played} MP · {side.info.entry.won}-{side.info.entry.drawn}-{side.info.entry.lost}
                            </span>
                            <span className="font-semibold text-theme-main">
                              {side.info.entry.points} PTS ({side.info.entry.played > 0 ? (side.info.entry.points / side.info.entry.played).toFixed(2) : '0.00'})
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                            <span className="text-theme-sub">
                              GF {side.info.entry.goalsFor} · GA {side.info.entry.goalsAgainst} · GD{' '}
                              <span className="font-medium text-theme-main">
                                {side.info.entry.goalDifference > 0
                                  ? `+${side.info.entry.goalDifference}`
                                  : side.info.entry.goalDifference}
                              </span>
                            </span>

                            {side.info.entry.form && side.info.entry.form.length > 0 && (
                              <div className="inline-flex items-center gap-0.5 shrink-0">
                                {side.info.entry.form.slice(0, 5).map((r, idx) => (
                                  <span
                                    key={idx}
                                    className={`w-[16px] h-[16px] rounded-[4px] inline-flex items-center justify-center text-2xs leading-none font-bold ${
                                      r === 'W'
                                        ? side.winBgClass
                                        : r === 'D'
                                        ? 'bg-amber-500 text-white'
                                        : 'bg-rose-500 text-white'
                                    }`}
                                  >
                                    {r}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* TAB 2: HEAD TO HEAD */}
        {activeTab === 'H2H' && (
          <div className="space-y-2.5">
            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
                <SectionHeader
                  title="Head to Head"
                  icon={<History className="w-3.5 h-3.5" />}
                  size="sm"
                  className="w-full"
                />
              </div>

              {isLoadingH2H ? (
                <div className="grid grid-cols-3 divide-x divide-[var(--border-subdued)] text-center tabular-nums">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="p-2.5 animate-pulse">
                      <div className="h-3 w-12 mx-auto bg-theme-subtle rounded-md" />
                      <div className="h-5 w-6 mx-auto bg-theme-subtle rounded-md mt-1.5" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 divide-x divide-[var(--border-subdued)]">
                  <StatTile label={`${fixture.homeTeam}`} value={h2h.homeWins} tone="accent" surface="flat" />
                  <StatTile label="Draws" value={h2h.draws} tone="warning" surface="flat" />
                  <StatTile label={`${fixture.awayTeam}`} value={h2h.awayWins} tone="info" surface="flat" />
                </div>
              )}

              {!isLoadingH2H && (
                <div className="border-t border-theme-subdued divide-y divide-[var(--border-subdued)] text-sm tabular-nums">
                  <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between">
                    <span className="text-theme-sub font-normal">Goal Average</span>
                    <span className="font-semibold text-theme-main">
                      {h2h.homeGoalsAvg} vs {h2h.awayGoalsAvg}
                    </span>
                  </div>

                  <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between">
                    <span className="text-theme-sub font-normal">H2H Factor</span>
                    <span className="font-semibold text-theme-primary">
                      x{h2h.h2hMultiplierHome} vs x{h2h.h2hMultiplierAway}
                    </span>
                  </div>
                </div>
              )}
            </Card>

            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
                <SectionHeader title="Past Meetings" size="sm" className="w-full" />
              </div>

              {isLoadingH2H ? (
                <div className="p-3 space-y-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-8 w-full rounded-lg bg-theme-card animate-pulse" />
                  ))}
                </div>
              ) : h2h.recentH2H && h2h.recentH2H.length > 0 ? (
                <div className="divide-y divide-[var(--border-subdued)] tabular-nums text-sm">
                  {h2h.recentH2H.map((enc, idx) => {
                    const winningTeam =
                      enc.winner === 'HOME' ? enc.homeTeam : enc.winner === 'AWAY' ? enc.awayTeam : null;
                    const winHomeScore = winningTeam ? teamMatchScore(winningTeam, fixture.homeTeam) : 0;
                    const winAwayScore = winningTeam ? teamMatchScore(winningTeam, fixture.awayTeam) : 0;
                    const isHomeWinner = winHomeScore > 0 && winHomeScore >= winAwayScore;
                    const isAwayWinner = winAwayScore > 0 && winAwayScore > winHomeScore;

                    return (
                      <div
                        key={idx}
                        className="min-h-[34px] px-3 py-1.5 flex items-center justify-between gap-2 min-w-0"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="text-xs font-normal text-theme-sub shrink-0">{enc.date}</span>
                          {enc.competition && (
                            <span className="text-xs font-normal text-theme-dim truncate hidden sm:inline">
                              · {enc.competition}
                            </span>
                          )}
                          <span className="font-medium text-theme-main truncate text-sm">
                            {enc.homeTeam} <span className="text-theme-sub font-normal">vs</span> {enc.awayTeam}
                          </span>
                        </div>

                        <div className="shrink-0">
                          <span
                            className={`min-w-[38px] h-[21px] inline-flex items-center justify-center px-2 rounded-md text-xs font-bold leading-none ${
                              isHomeWinner
                                ? 'bg-theme-primary-subtle text-theme-primary'
                                : isAwayWinner
                                ? 'bg-sky-500/15 text-sky-500 dark:text-sky-400'
                                : 'bg-amber-500/15 text-amber-500 dark:text-amber-400'
                            }`}
                          >
                            {enc.score}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-5 text-center text-sm text-theme-sub">No H2H records</div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 3: TEAMS & FORM */}
        {activeTab === 'TEAMS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {[
              {
                teamName: fixture.homeTeam,
                sideLabel: 'Home Form',
                recentForm: homeRecentFormList,
                recentMatches: homeRecentMatchesList,
                attackStrength: pred?.homeAttackStrength ?? 1.0,
                defenseStrength: pred?.homeDefenseStrength ?? 1.0,
                goalsScored: homeGoalsScored,
                goalsConceded: homeGoalsConceded,
                hasStats: Boolean(homeStats),
                tone: 'accent' as const,
                winBgClass: 'bg-theme-primary text-theme-primary-text',
              },
              {
                teamName: fixture.awayTeam,
                sideLabel: 'Away Form',
                recentForm: awayRecentFormList,
                recentMatches: awayRecentMatchesList,
                attackStrength: pred?.awayAttackStrength ?? 1.0,
                defenseStrength: pred?.awayDefenseStrength ?? 1.0,
                goalsScored: awayGoalsScored,
                goalsConceded: awayGoalsConceded,
                hasStats: Boolean(awayStats),
                tone: 'info' as const,
                winBgClass: 'bg-sky-500 text-white',
              },
            ].map((side) => (
              <Card key={side.sideLabel} surface="elevated" padding="none" radius="2xl" className="overflow-hidden min-w-0">
                <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center justify-between gap-2">
                  <span className="font-semibold text-base text-theme-main truncate block tracking-[-0.01em]">{side.teamName}</span>
                  <span className="text-2xs text-theme-sub uppercase tracking-[0.06em] font-medium shrink-0">{side.sideLabel}</span>
                </div>

                {side.recentForm.length > 0 && (
                  <div className="px-3 py-1.5 border-b border-theme-subdued space-y-1 min-w-0">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-theme-sub font-medium">Form Guide</span>
                      <span className="tabular-nums font-normal text-theme-dim">
                        Last {Math.min(10, side.recentForm.length)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 tabular-nums">
                      {side.recentForm.slice(0, 10).map((r, i) => (
                        <span
                          key={i}
                          className={`w-[19px] h-[19px] rounded-md text-2xs leading-none font-bold flex items-center justify-center shrink-0 ${
                            r === 'W'
                              ? side.winBgClass
                              : r === 'D'
                              ? 'bg-amber-500 text-white'
                              : 'bg-rose-500 text-white'
                          }`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 divide-x divide-[var(--border-subdued)] border-b border-theme-subdued">
                  <StatTile label="Attack" value={side.attackStrength} tone={side.tone} surface="flat" />
                  <StatTile label="Defense" value={side.defenseStrength} tone={side.tone} surface="flat" />
                </div>

                {(side.recentMatches.length > 0 || side.hasStats) && (
                  <div className="min-h-[32px] px-3 py-1.5 border-b border-theme-subdued flex items-center justify-between tabular-nums text-sm">
                    <span className="text-theme-sub font-normal">Total Goals</span>
                    <span className="font-semibold text-theme-main">
                      {side.goalsScored} scored · {side.goalsConceded} conceded
                    </span>
                  </div>
                )}

                {side.recentMatches.length > 0 && (
                  <div>
                    <div className="min-h-[32px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
                      <SectionHeader title="Recent Matches" size="sm" className="w-full" />
                    </div>
                    <div className="divide-y divide-[var(--border-subdued)] tabular-nums text-sm">
                      {side.recentMatches.slice(0, 8).map((m, idx) => (
                        <div key={idx} className="min-h-[32px] px-3 py-1.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="text-xs font-normal text-theme-dim shrink-0">{m.date}</span>
                            <span
                              className={`w-[14px] text-center text-2xs font-semibold shrink-0 ${
                                m.isHome ? 'text-theme-main' : 'text-theme-sub'
                              }`}
                            >
                              {m.isHome ? 'H' : 'A'}
                            </span>
                            <span className="font-medium text-theme-main truncate">vs {m.opponent}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-semibold text-theme-main">
                              {m.goalsFor}-{m.goalsAgainst}
                            </span>
                            <span
                              className={`w-[18px] h-[18px] rounded-md flex items-center justify-center text-2xs leading-none font-bold shrink-0 ${
                                m.result === 'W'
                                  ? side.winBgClass
                                  : m.result === 'D'
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-rose-500 text-white'
                              }`}
                            >
                              {m.result}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* TAB 5: PREDICTIONS */}
        {activeTab === 'PREDICTIONS' && (
          <div className="space-y-2.5">
            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
                <SectionHeader title="Best Predictions" size="sm" className="w-full" />
              </div>
              {bestMarketsPerGroup && bestMarketsPerGroup.length > 0 ? (
                <div className="divide-y divide-[var(--border-subdued)] tabular-nums text-sm">
                  {bestMarketsPerGroup.map((market, idx) => {
                    const mOdds = enrichedFixture.marketOdds;
                    let fsOdds: number | undefined;
                    let fsProb: number | undefined;
                    if (mOdds) {
                      if (market.key === 'HOME_WIN') { fsOdds = mOdds.homeOdds; fsProb = mOdds.homeImpliedProb; }
                      else if (market.key === 'DRAW') { fsOdds = mOdds.drawOdds; fsProb = mOdds.drawImpliedProb; }
                      else if (market.key === 'AWAY_WIN') { fsOdds = mOdds.awayOdds; fsProb = mOdds.awayImpliedProb; }
                      else if (market.key === 'OVER_25') { fsOdds = mOdds.over25Odds; fsProb = mOdds.over25ImpliedProb; }
                      else if (market.key === 'UNDER_25') { fsOdds = mOdds.under25Odds; fsProb = mOdds.under25ImpliedProb; }
                      else if (market.key === 'BTTS_YES') { fsOdds = mOdds.bttsYesOdds; fsProb = mOdds.bttsYesImpliedProb; }
                      else if (market.key === 'BTTS_NO') { fsOdds = mOdds.bttsNoOdds; fsProb = mOdds.bttsNoImpliedProb; }
                      else if (market.key === 'DOUBLE_CHANCE_1X') { fsOdds = mOdds.dc1XOdds; fsProb = mOdds.dc1XImpliedProb; }
                      else if (market.key === 'DOUBLE_CHANCE_X2') { fsOdds = mOdds.dcX2Odds; fsProb = mOdds.dcX2ImpliedProb; }
                    }
                    return (
                      <div key={idx} className="min-h-[46px] px-3 py-2 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-2xs text-theme-sub block uppercase font-medium tracking-[0.06em]">
                            {market.groupName} Market
                          </span>
                          <span className="font-semibold text-theme-main text-base tracking-[-0.01em]">{market.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-theme-primary block text-lg tracking-[-0.015em]">
                            {(market.probability * 100).toFixed(1)}%
                          </span>
                          <span className="text-xs font-normal text-theme-dim block">
                            Model Fair {(1 / market.probability).toFixed(2)}
                            {fsOdds !== undefined && fsProb !== undefined
                              ? ` · FS ${fsOdds.toFixed(2)} (${(fsProb * 100).toFixed(1)}%)`
                              : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-5 text-center text-sm text-theme-sub">No predictions computed</div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 6: STANDINGS */}
        {activeTab === 'STANDINGS' && (
          <div className="space-y-2.5">
            <LeagueStandings
              initialLeague={currentFixture.league || currentFixture.leagueName}
              leagueContext={{
                leagueUrl: currentFixture.leagueUrl,
                leagueName: currentFixture.leagueName,
              }}
              preloadedStandings={standingsTable}
              isLoadingPreloaded={isLoadingStandings}
              highlightTeams={{ homeTeam: currentFixture.homeTeam, awayTeam: currentFixture.awayTeam }}
              compact
            />
          </div>
        )}

        {/* TAB 7: TACTICS */}
        {activeTab === 'TACTICS' && (
          <div className="space-y-2.5">
            <TacticalAnalysis fixture={enrichedFixture} />
          </div>
        )}
      </div>
    </div>
  );

  return panelContainer;
};
