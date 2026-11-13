import React, { useState, useMemo, useEffect } from 'react';
import { X, History, Target } from 'lucide-react';
import { Fixture, HeadToHeadMeasurement, MarketOption } from '../core/types.js';
import { PoissonMatrixView } from './PoissonMatrixView.js';
import { MatchHeatmap } from './MatchHeatmap.js';
import { TacticalAnalysis } from './TacticalAnalysis.js';
import { parseDynamicStatistics, StatCategoryGroup } from '../core/statisticsParser.js';
import { EngineService } from '../services/engineService.js';
import { LeagueStandings } from './LeagueStandings.js';
import { getProbValue } from '../core/formatters.js';
import { teamMatchScore, resolveFixtureAlignment, resolveTeamSide } from '../core/feedParser.js';
import { Card, SegmentedTabs, StatTile, EmptyState, SectionHeader, TeamAvatar } from './ui/index.js';

export interface MatchDetailViewProps {
  fixture: Fixture | null;
  onClose?: () => void;
  isPanel?: boolean;
}

type ModalTab = 'OVERVIEW' | 'H2H' | 'STATS' | 'TEAMS' | 'STANDINGS' | 'PREDICTIONS' | 'HEATMAP' | 'TACTICS';

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
        <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center text-theme-sub bg-theme-card select-none">
          <div className="w-12 h-12 rounded-2xl bg-theme-subtle flex items-center justify-center mb-3">
            <Target className="w-6 h-6 text-theme-primary" />
          </div>
          <h4 className="font-extrabold text-sm text-theme-main">Select a Match</h4>
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
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-theme-overlay backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-2xl h-[92vh] sm:h-[85vh] max-h-[820px] min-h-0 flex flex-col pointer-events-auto z-10 my-auto shadow-theme-md animate-in slide-in-from-bottom-4 duration-300">
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

      if (!fixture.statistics?.length || !fixture.information?.length || !fixture.prediction) {
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

  const homeRecentMatchesList = useMemo(() => {
    return (
      scrapedH2H?.homeRecentMatches ||
      enrichedFixture.measurements?.h2h?.homeRecentMatches ||
      pred?.measurements?.h2h?.homeRecentMatches ||
      []
    );
  }, [scrapedH2H, enrichedFixture.measurements?.h2h?.homeRecentMatches, pred?.measurements?.h2h?.homeRecentMatches]);

  const awayRecentMatchesList = useMemo(() => {
    return (
      scrapedH2H?.awayRecentMatches ||
      enrichedFixture.measurements?.h2h?.awayRecentMatches ||
      pred?.measurements?.h2h?.awayRecentMatches ||
      []
    );
  }, [scrapedH2H, enrichedFixture.measurements?.h2h?.awayRecentMatches, pred?.measurements?.h2h?.awayRecentMatches]);

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

  const h2h: HeadToHeadMeasurement =
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
    };

  const _h2hTrends = useMemo(() => {
    if (!h2h) return { homeTrend: '', awayTrend: '', homeForm: [], awayForm: [] };

    const recentH2H = h2h.recentH2H || [];
    if (recentH2H.length > 0) {
      const homeForm: ('W' | 'D' | 'L')[] = [];
      const awayForm: ('W' | 'D' | 'L')[] = [];

      recentH2H.slice(0, 5).forEach((m) => {
        let gHome = 0;
        let gAway = 0;

        if (m.score && m.score.includes('-')) {
          const parts = m.score.split('-').map((s) => parseInt(s.trim(), 10));
          if (!isNaN(parts[0]) && !isNaN(parts[1])) {
            gHome = parts[0];
            gAway = parts[1];
          }
        }

        const alignment = resolveFixtureAlignment(fixture.homeTeam, fixture.awayTeam, m.homeTeam, m.awayTeam);
        const homeVsMatchHome = teamMatchScore(fixture.homeTeam, m.homeTeam);
        const homeVsMatchAway = teamMatchScore(fixture.homeTeam, m.awayTeam);

        let homeGoals = 0;
        let awayGoals = 0;

        if (alignment.matched ? alignment.isHomeFixture : homeVsMatchHome > homeVsMatchAway) {
          homeGoals = gHome;
          awayGoals = gAway;
        } else if (alignment.matched ? !alignment.isHomeFixture : homeVsMatchAway > homeVsMatchHome) {
          homeGoals = gAway;
          awayGoals = gHome;
        } else {
          if (m.winner === 'HOME') {
            homeForm.push('W');
            awayForm.push('L');
          } else if (m.winner === 'AWAY') {
            homeForm.push('L');
            awayForm.push('W');
          } else {
            homeForm.push('D');
            awayForm.push('D');
          }
          return;
        }

        if (homeGoals > awayGoals) {
          homeForm.push('W');
          awayForm.push('L');
        } else if (homeGoals < awayGoals) {
          homeForm.push('L');
          awayForm.push('W');
        } else {
          homeForm.push('D');
          awayForm.push('D');
        }
      });

      return {
        homeTrend: homeForm.join('-'),
        awayTrend: awayForm.join('-'),
        homeForm,
        awayForm,
      };
    }

    const isHomeClubMatchingHomeFixture =
      !h2h.homeClub || resolveTeamSide(h2h.homeClub, fixture.homeTeam, fixture.awayTeam) !== 'AWAY';

    const homeMatches = isHomeClubMatchingHomeFixture
      ? (h2h.homeRecentMatches || fixture.homeStats?.recentMatches || [])
      : (h2h.awayRecentMatches || fixture.homeStats?.recentMatches || []);

    const awayMatches = isHomeClubMatchingHomeFixture
      ? (h2h.awayRecentMatches || fixture.awayStats?.recentMatches || [])
      : (h2h.homeRecentMatches || fixture.awayStats?.recentMatches || []);

    const homeForm: ('W' | 'D' | 'L')[] = homeMatches.length > 0
      ? homeMatches.slice(0, 5).map((m) => m.result)
      : (fixture.homeStats?.recentForm || []);
    const awayForm: ('W' | 'D' | 'L')[] = awayMatches.length > 0
      ? awayMatches.slice(0, 5).map((m) => m.result)
      : (fixture.awayStats?.recentForm || []);

    return {
      homeTrend: homeForm.join('-'),
      awayTrend: awayForm.join('-'),
      homeForm,
      awayForm,
    };
  }, [h2h, fixture.homeTeam, fixture.awayTeam, fixture.homeStats, fixture.awayStats]);

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

  void _h2hTrends;
  void _filteredStatItems;

  const homeWinPct = pred ? getProbValue(pred.homeWinProb, 1) : 0;
  const awayWinPct = pred ? getProbValue(pred.awayWinProb, 1) : 0;

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
    {
      id: 'PREDICTIONS' as ModalTab,
      label: 'Preds',
      count: bestMarketsPerGroup.length > 0 ? bestMarketsPerGroup.length : undefined,
    },
    { id: 'HEATMAP' as ModalTab, label: 'Heatmap' },
    { id: 'TACTICS' as ModalTab, label: 'Tactics' },
  ];

  const panelContainer = (
    <div
      className={`bg-theme-card text-theme-main flex flex-col overflow-hidden select-none h-full w-full ${
        isPanel ? '' : 'rounded-t-3xl sm:rounded-2xl shadow-theme-md'
      }`}
      style={{ scrollbarGutter: 'stable' }}
    >
      {/* Mobile Drag Handle Affordance */}
      {!isPanel && (
        <div className="w-10 h-1 bg-theme-dim/40 rounded-full mx-auto my-1.5 sm:hidden shrink-0 opacity-70" />
      )}

      {/* Modal Header */}
      <div className="bg-theme-glass px-3 sm:px-4 pt-2 pb-1.5 shrink-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-x-auto no-scrollbar text-[11px] text-theme-sub">
            <span className="font-bold text-theme-main truncate whitespace-nowrap">
              {fixture.stage || fixture.leagueName}
            </span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-theme-subtle hover:bg-theme-primary hover:text-theme-primary-text text-theme-main transition-colors cursor-pointer flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
              aria-label="Close match details"
            >
              <X className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          )}
        </div>

        {/* Compact Hero Scoreboard */}
        <Card
          surface="elevated"
          padding="sm"
          radius="xl"
          className="mt-2 flex items-center justify-between gap-3"
        >
          <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
            <TeamAvatar src={fixture.homeBadge} name={fixture.homeTeam} size="sm" />
            <span className="text-xs font-extrabold text-theme-main truncate block max-w-full">
              {fixture.homeTeam}
            </span>
            {pred && (
              <span className="text-[10.5px] font-bold font-mono tabular-nums text-theme-primary">
                {homeWinPct}%
              </span>
            )}
          </div>

          <div className="flex flex-col items-center shrink-0 px-2">
            <span className="text-sm font-black font-mono tabular-nums text-theme-main bg-theme-subtle px-2.5 py-0.5 rounded-lg">
              {fixture.score ? `${fixture.score.home}-${fixture.score.away}` : 'VS'}
            </span>
            <span className="text-[9.5px] font-bold text-theme-sub uppercase mt-0.5">
              {fixture.status === 'LIVE' ? 'LIVE' : fixture.status === 'FINISHED' ? 'FT' : fixture.kickOffTime}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
            <TeamAvatar src={fixture.awayBadge} name={fixture.awayTeam} size="sm" />
            <span className="text-xs font-extrabold text-theme-main truncate block max-w-full">
              {fixture.awayTeam}
            </span>
            {pred && (
              <span className="text-[10.5px] font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">
                {awayWinPct}%
              </span>
            )}
          </div>
        </Card>

        <div className="mt-2">
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
      <div className="p-3.5 sm:p-5 overflow-y-auto overscroll-contain space-y-3.5 sm:space-y-4 flex-1 min-h-0 min-w-0">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-4">
            {pred ? (
              <>
                <Card surface="elevated" padding="md" radius="2xl" className="space-y-2">
                  <SectionHeader title="Projections" size="sm" />
                  <div className="space-y-1.5 text-xs font-mono tabular-nums">
                    <div className="p-2.5 rounded-xl bg-theme-card flex items-center justify-between">
                      <span className="font-sans text-theme-sub">Expected Goals (xG)</span>
                      <div className="font-bold text-theme-main">
                        <span className="text-theme-primary">{pred?.homeXG ?? '-'}</span>
                        <span aria-hidden="true" className="text-theme-dim px-1 font-normal">vs</span>
                        <span className="text-sky-600 dark:text-sky-400">{pred?.awayXG ?? '-'}</span>
                      </div>
                    </div>

                    {pred?.teamStrength ? (
                      <div className="p-2.5 rounded-xl bg-theme-card flex items-center justify-between">
                        <span className="font-sans text-theme-sub">Team Strength Index</span>
                        <div className="font-bold text-theme-main">
                          <span className="text-theme-primary">{pred.teamStrength.homeStrengthRating}</span>
                          <span aria-hidden="true" className="text-theme-dim px-1 font-normal">vs</span>
                          <span className="text-sky-600 dark:text-sky-400">{pred.teamStrength.awayStrengthRating}</span>
                        </div>
                      </div>
                    ) : pred?.eloRatings ? (
                      <div className="p-2.5 rounded-xl bg-theme-card flex items-center justify-between">
                        <span className="font-sans text-theme-sub">Elo Ratings</span>
                        <div className="font-bold text-theme-main">
                          <span className="text-theme-primary">{pred.eloRatings.homeElo}</span>
                          <span aria-hidden="true" className="text-theme-dim px-1 font-normal">vs</span>
                          <span className="text-sky-600 dark:text-sky-400">{pred.eloRatings.awayElo}</span>
                        </div>
                      </div>
                    ) : null}

                    {pred?.tacticalContext && (
                      <div className="p-2.5 rounded-xl bg-theme-card flex items-center justify-between">
                        <span className="font-sans text-theme-sub">Rest Days</span>
                        <div className="font-bold text-theme-main">
                          <span>{pred.tacticalContext.restDaysHome}d</span>
                          <span aria-hidden="true" className="text-theme-dim px-1 font-normal">vs</span>
                          <span>{pred.tacticalContext.restDaysAway}d</span>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                <Card surface="elevated" padding="md" radius="2xl">
                  <PoissonMatrixView
                    prediction={pred}
                    homeTeam={fixture.homeTeam}
                    awayTeam={fixture.awayTeam}
                    showTopScores={true}
                  />
                </Card>
              </>
            ) : (
              <EmptyState
                icon={<Target className="w-6 h-6" />}
                title="No projections"
                minHeight="min-h-[200px]"
                className="bg-theme-card-elevated"
              />
            )}
          </div>
        )}

        {/* TAB 2: HEAD TO HEAD */}
        {activeTab === 'H2H' && (
          <div className="space-y-4">
            <Card surface="elevated" padding="md" radius="2xl" className="space-y-3">
              <SectionHeader
                title="Head to Head"
                icon={<History className="w-4 h-4 text-theme-primary" />}
                size="sm"
              />

              {isLoadingH2H ? (
                <div className="grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-theme-card animate-pulse">
                      <div className="h-2.5 w-12 mx-auto bg-theme-subtle rounded-md" />
                      <div className="h-4 w-6 mx-auto bg-theme-subtle rounded-md mt-1.5" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <StatTile label={`${fixture.homeTeam} Wins`} value={h2h.homeWins} tone="accent" surface="card" />
                  <StatTile label="Draws" value={h2h.draws} tone="warning" surface="card" />
                  <StatTile label={`${fixture.awayTeam} Wins`} value={h2h.awayWins} tone="info" surface="card" />
                </div>
              )}

              {!isLoadingH2H && (
                <div className="space-y-1.5 text-xs font-mono tabular-nums pt-1">
                  <div className="p-2.5 rounded-xl bg-theme-card flex items-center justify-between">
                    <span className="text-theme-sub font-sans">Goal Average</span>
                    <span className="font-bold text-theme-main">
                      {h2h.homeGoalsAvg} vs {h2h.awayGoalsAvg}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-theme-card flex items-center justify-between">
                    <span className="text-theme-sub font-sans">H2H Adjustment Factor</span>
                    <span className="font-bold text-theme-primary">
                      x{h2h.h2hMultiplierHome} vs x{h2h.h2hMultiplierAway}
                    </span>
                  </div>
                </div>
              )}
            </Card>

            <Card surface="elevated" padding="md" radius="2xl" className="space-y-2">
              <SectionHeader title="Past Meetings" size="sm" />

              {isLoadingH2H ? (
                <div className="space-y-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-[42px] w-full rounded-xl bg-theme-card animate-pulse" />
                  ))}
                </div>
              ) : h2h.recentH2H && h2h.recentH2H.length > 0 ? (
                <div className="space-y-1.5 font-mono tabular-nums text-xs">
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
                        className="p-2.5 rounded-xl bg-theme-card flex items-center justify-between gap-2 min-w-0"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-[10px] text-theme-sub shrink-0 font-sans">{enc.date}</span>
                          {enc.competition && (
                            <span className="text-[10px] text-theme-sub truncate hidden sm:inline">
                              {enc.competition}
                            </span>
                          )}
                          <span className="font-bold text-theme-main truncate">
                            {enc.homeTeam} vs {enc.awayTeam}
                          </span>
                        </div>

                        <div className="shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded-md text-xs font-black ${
                              isHomeWinner
                                ? 'bg-theme-primary/20 text-theme-primary'
                                : isAwayWinner
                                ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400'
                                : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
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
                <div className="py-6 text-center text-xs text-theme-sub font-mono">No H2H records</div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 3: TEAMS & FORM */}
        {activeTab === 'TEAMS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card surface="elevated" padding="md" radius="2xl" className="space-y-3 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-extrabold text-sm text-theme-main truncate block">{fixture.homeTeam}</span>
                  <span className="text-[11px] text-theme-sub font-mono tabular-nums">Home Form</span>
                </div>
              </div>

              {homeRecentFormList.length > 0 ? (
                <div className="p-3 rounded-xl bg-theme-card space-y-2 min-w-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-theme-sub font-sans">Form Guide</span>
                    <span className="font-mono tabular-nums text-[10px] text-theme-dim">
                      Last {Math.min(10, homeRecentFormList.length)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 font-mono tabular-nums">
                    {homeRecentFormList.slice(0, 10).map((r, i) => (
                      <span
                        key={i}
                        className={`w-6 h-6 rounded-md text-xs font-black flex items-center justify-center shrink-0 ${
                          r === 'W'
                            ? 'bg-theme-primary text-theme-primary-text'
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
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <StatTile label="Attack Rating" value={pred?.homeAttackStrength ?? 1.0} tone="accent" surface="card" />
                <StatTile label="Defense Rating" value={pred?.homeDefenseStrength ?? 1.0} tone="accent" surface="card" />
              </div>

              {(homeRecentMatchesList.length > 0 || homeStats) && (
                <div className="space-y-1.5 font-mono tabular-nums text-xs">
                  <div className="p-2.5 rounded-xl bg-theme-card flex items-center justify-between">
                    <span className="text-theme-sub font-sans">Total Goals</span>
                    <span className="font-bold text-theme-main">
                      {homeGoalsScored} scored - {homeGoalsConceded} conceded
                    </span>
                  </div>
                </div>
              )}

              {homeRecentMatchesList.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <SectionHeader title="Recent Matches" size="sm" />
                  <div className="space-y-1 font-mono tabular-nums text-xs">
                    {homeRecentMatchesList.slice(0, 8).map((m, idx) => (
                      <div key={idx} className="p-2 rounded-xl bg-theme-card flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span
                            className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                              m.isHome ? 'bg-theme-subtle text-theme-main' : 'bg-theme-subtle text-theme-sub'
                            }`}
                          >
                            {m.isHome ? 'H' : 'A'}
                          </span>
                          <span className="font-bold text-theme-main truncate">vs {m.opponent}</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-bold text-theme-main">
                            {m.goalsFor} - {m.goalsAgainst}
                          </span>
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                              m.result === 'W'
                                ? 'bg-theme-primary text-theme-primary-text'
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

            <Card surface="elevated" padding="md" radius="2xl" className="space-y-3 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-extrabold text-sm text-theme-main truncate block">{fixture.awayTeam}</span>
                  <span className="text-[11px] text-theme-sub font-mono tabular-nums">Away Form</span>
                </div>
              </div>

              {awayRecentFormList.length > 0 ? (
                <div className="p-3 rounded-xl bg-theme-card space-y-2 min-w-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-theme-sub font-sans">Form Guide</span>
                    <span className="font-mono tabular-nums text-[10px] text-theme-dim">
                      Last {Math.min(10, awayRecentFormList.length)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 font-mono tabular-nums">
                    {awayRecentFormList.slice(0, 10).map((r, i) => (
                      <span
                        key={i}
                        className={`w-6 h-6 rounded-md text-xs font-black flex items-center justify-center shrink-0 ${
                          r === 'W' ? 'bg-sky-500 text-white' : r === 'D' ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'
                        }`}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <StatTile label="Attack Rating" value={pred?.awayAttackStrength ?? 1.0} tone="info" surface="card" />
                <StatTile label="Defense Rating" value={pred?.awayDefenseStrength ?? 1.0} tone="info" surface="card" />
              </div>

              {(awayRecentMatchesList.length > 0 || awayStats) && (
                <div className="space-y-1.5 font-mono tabular-nums text-xs">
                  <div className="p-2.5 rounded-xl bg-theme-card flex items-center justify-between">
                    <span className="text-theme-sub font-sans">Total Goals</span>
                    <span className="font-bold text-theme-main">
                      {awayGoalsScored} scored - {awayGoalsConceded} conceded
                    </span>
                  </div>
                </div>
              )}

              {awayRecentMatchesList.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <SectionHeader title="Recent Matches" size="sm" />
                  <div className="space-y-1 font-mono tabular-nums text-xs">
                    {awayRecentMatchesList.slice(0, 8).map((m, idx) => (
                      <div key={idx} className="p-2 rounded-xl bg-theme-card flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span
                            className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                              m.isHome ? 'bg-theme-subtle text-theme-main' : 'bg-theme-subtle text-theme-sub'
                            }`}
                          >
                            {m.isHome ? 'H' : 'A'}
                          </span>
                          <span className="font-bold text-theme-main truncate">vs {m.opponent}</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-bold text-theme-main">
                            {m.goalsFor} - {m.goalsAgainst}
                          </span>
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                              m.result === 'W'
                                ? 'bg-sky-500 text-white'
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
          </div>
        )}

        {/* TAB 5: PREDICTIONS */}
        {activeTab === 'PREDICTIONS' && (
          <div className="space-y-4">
            <Card surface="elevated" padding="md" radius="2xl" className="space-y-3">
              <SectionHeader title="Best Predictions" size="sm" />
              {bestMarketsPerGroup && bestMarketsPerGroup.length > 0 ? (
                <div className="space-y-2 font-mono tabular-nums text-xs">
                  {bestMarketsPerGroup.map((market, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-theme-card flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-theme-sub font-sans block uppercase font-bold">
                          {market.groupName} Market
                        </span>
                        <span className="font-extrabold text-theme-main font-sans text-sm">{market.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold text-theme-primary block text-sm">
                          {(market.probability * 100).toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-theme-dim block">
                          Fair Odds {(1 / market.probability).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-theme-sub font-mono">No predictions computed</div>
              )}
            </Card>

            {pred && (
              <Card surface="elevated" padding="md" radius="2xl">
                <PoissonMatrixView
                  prediction={pred}
                  homeTeam={fixture.homeTeam}
                  awayTeam={fixture.awayTeam}
                  showTopScores={true}
                />
              </Card>
            )}
          </div>
        )}

        {/* TAB 6: STANDINGS */}
        {activeTab === 'STANDINGS' && (
          <div className="space-y-4">
            <LeagueStandings
              initialLeague={fixture.league}
              highlightTeams={{ homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam }}
              compact
            />
          </div>
        )}

        {/* TAB 7: HEATMAP */}
        {activeTab === 'HEATMAP' && (
          <div className="space-y-4">
            <MatchHeatmap fixture={enrichedFixture} />
          </div>
        )}

        {/* TAB 8: TACTICS */}
        {activeTab === 'TACTICS' && (
          <div className="space-y-4">
            <TacticalAnalysis fixture={enrichedFixture} />
          </div>
        )}
      </div>
    </div>
  );

  return panelContainer;
};
