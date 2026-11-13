import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  History,
  Calendar,
  Clock,
  Target,
  TrendingUp,
  BarChart2,
  Shield,
  Layers,
  Award,
  ChevronRight,
  Info,
  Activity,
  Zap,
} from 'lucide-react';
import { Fixture, HeadToHeadMeasurement, MarketOption } from '../core/types.js';
import { formatMatchDateTime } from '../core/dateUtils.js';
import { PoissonMatrixView } from './PoissonMatrixView.js';
import { ApexEngine } from '../core/poisson.js';
import { parseDynamicStatistics, StatCategoryGroup } from '../core/statisticsParser.js';
import { EngineService } from '../services/engineService.js';
import { LeagueStandings } from './LeagueStandings.js';
import {
  formatProb,
  getProbValue,
  getAuthoritative1X2Pick,
} from '../core/formatters.js';
import { teamMatchScore, resolveFixtureAlignment, resolveTeamSide } from '../core/feedParser.js';

// H2HTrendBadge removed as per user request to eliminate trend badges

export interface MatchDetailViewProps {
  fixture: Fixture | null;
  onClose?: () => void;
  isPanel?: boolean;
}

type ModalTab = 'OVERVIEW' | 'H2H' | 'STATS' | 'TEAMS' | 'STANDINGS' | 'PREDICTIONS';

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
  // Use a fixed overlay to stabilize the modal and prevent background shifting
  // Keep track of the last fixture to prevent flickering if fixture becomes null
  const lastFixtureRef = React.useRef(fixture);
  React.useEffect(() => {
    if (fixture) lastFixtureRef.current = fixture;
  }, [fixture]);

  const displayFixture = fixture || lastFixtureRef.current;
  if (!displayFixture) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-theme-overlay backdrop-blur-md animate-in fade-in duration-200">
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
  const [statFilterGroup, setStatFilterGroup] = useState<StatCategoryGroup>('ALL');

  const [enrichedFixture, setEnrichedFixture] = useState<Fixture>(fixture);
  const [isParsing, setIsParsing] = useState<boolean>(false);

  // Scraped Head to Head sync state
  const initialH2H =
    fixture.measurements?.h2h ||
    fixture.prediction?.measurements?.h2h ||
    null;

  const hasInitialValidH2H = !!(
    initialH2H &&
    (initialH2H.matchesCount > 0 ||
      (initialH2H.homeRecentMatches && initialH2H.homeRecentMatches.length > 0) ||
      (initialH2H.recentH2H && initialH2H.recentH2H.length > 0))
  );

  const [scrapedH2H, setScrapedH2H] = useState<HeadToHeadMeasurement | null>(hasInitialValidH2H ? initialH2H : null);
  const [isLoadingH2H, setIsLoadingH2H] = useState<boolean>(!hasInitialValidH2H);

  // Sync when fixture ID or team names change
  useEffect(() => {
    let isCancelled = false;

    const currentH2H =
      fixture.measurements?.h2h ||
      fixture.prediction?.measurements?.h2h ||
      null;

    const hasValidH2H = !!(
      currentH2H &&
      (currentH2H.matchesCount > 0 ||
        (currentH2H.homeRecentMatches && currentH2H.homeRecentMatches.length > 0) ||
        (currentH2H.recentH2H && currentH2H.recentH2H.length > 0))
    );

    // Reset state immediately for the selected fixture
    setEnrichedFixture(fixture);
    setScrapedH2H(hasValidH2H ? currentH2H : null);
    setIsLoadingH2H(!hasValidH2H);

    async function loadDetailsAndH2H() {
      if (!fixture.id) return;

      // 1. Fetch match detail if statistics, information, or prediction are missing
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
            if (
              detailH2H &&
              (detailH2H.matchesCount > 0 ||
                detailH2H.homeRecentMatches?.length ||
                detailH2H.recentH2H?.length)
            ) {
              setScrapedH2H(detailH2H);
              setIsLoadingH2H(false);
            }
          }
        } catch (err) {
          console.warn('[MatchDetail] Detail fetch failed:', err);
        } finally {
          if (!isCancelled) setIsParsing(false);
        }
      }

      // 2. Fetch H2H if still missing or empty
      if (!hasValidH2H) {
        try {
          setIsLoadingH2H(true);
          const data = await EngineService.getMatchHeadToHead(fixture.id, fixture.homeTeam, fixture.awayTeam);
          if (
            !isCancelled &&
            data &&
            (data.matchesCount > 0 ||
              (data.homeRecentMatches && data.homeRecentMatches.length > 0) ||
              (data.recentH2H && data.recentH2H.length > 0))
          ) {
            setScrapedH2H(data);
            setEnrichedFixture((prev) => ({
              ...prev,
              measurements: {
                ...prev.measurements,
                h2h: data,
              },
              h2hMatches: data.recentH2H || prev.h2hMatches,
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



  // Derived real recent matches
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

  const h2hTrends = useMemo(() => {
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

  // Dynamic statistics
  const rawStatistics = useMemo(() => {
    return fixture.statistics || [];
  }, [fixture.statistics]);

  const parsedStatsSummary = useMemo(() => {
    return parseDynamicStatistics(rawStatistics);
  }, [rawStatistics]);

  const filteredStatItems = useMemo(() => {
    if (statFilterGroup === 'ALL') return parsedStatsSummary.items;
    return parsedStatsSummary.items.filter((item) => item.group === statFilterGroup);
  }, [parsedStatsSummary, statFilterGroup]);

  // Standardized outcome probabilities
  const homeWinPct = pred ? getProbValue(pred.homeWinProb, 1) : 0;
  const drawPct = pred ? getProbValue(pred.drawProb, 1) : 0;
  const awayWinPct = pred ? getProbValue(pred.awayWinProb, 1) : 0;

  // Unified engine picks

  const panelContainer = (
    <div
      className={`bg-theme-card text-theme-main flex flex-col overflow-hidden select-none h-full w-full ${
        isPanel
          ? ''
          : 'rounded-t-3xl sm:rounded-2xl border border-theme shadow-theme-md'
      }`}
      style={{ scrollbarGutter: 'stable' }}
    >
      {/* Mobile Drag Handle Affordance */}
      {!isPanel && (
        <div className="w-10 h-1 bg-theme-dim/40 rounded-full mx-auto my-1.5 sm:hidden shrink-0 opacity-70" />
      )}

      {/* Modal Header */}
      <div className="bg-theme-glass px-3 sm:px-4 pt-2 pb-1.5 shrink-0 border-b border-theme">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-x-auto no-scrollbar text-[10px] text-theme-sub">
            <span className="font-bold text-theme-main truncate whitespace-nowrap">
              {fixture.stage || fixture.leagueName}
            </span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-theme-subtle hover:bg-theme-primary hover:text-theme-primary-text text-theme-main transition-colors cursor-pointer flex items-center justify-center shrink-0"
              aria-label="Close match details"
            >
              <X className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          )}
        </div>

        {/* Compact Hero Scoreboard */}
        <div className="mt-2 p-3 rounded-xl bg-theme-card-elevated border border-theme flex items-center justify-between gap-3 shadow-theme-sm">
          <div className="flex flex-col items-center gap-0.5 min-w-0 flex-1">
             <span className="text-xs font-extrabold text-theme-main truncate block">{fixture.homeTeam}</span>
             {pred && <span className="text-[10px] font-bold font-mono tabular-nums text-theme-primary">{homeWinPct}%</span>}
          </div>
          
          <div className="flex flex-col items-center shrink-0 px-2">
            <span className="text-sm font-black font-mono tabular-nums text-theme-main bg-theme-subtle border border-theme px-2.5 py-0.5 rounded-lg">
              {fixture.score ? `${fixture.score.home}-${fixture.score.away}` : 'VS'}
            </span>
            <span className="text-[9px] font-bold text-theme-sub uppercase mt-0.5">{fixture.status === 'LIVE' ? 'LIVE' : 'FT'}</span>
          </div>

          <div className="flex flex-col items-center gap-0.5 min-w-0 flex-1">
             <span className="text-xs font-extrabold text-theme-main truncate block">{fixture.awayTeam}</span>
             {pred && <span className="text-[10px] font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">{awayWinPct}%</span>}
          </div>
        </div>

        <div className="mt-2 w-full flex items-center gap-0.5 p-0.5 bg-theme-subtle border border-theme rounded-lg overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('OVERVIEW')}
            className={`flex-1 min-w-[50px] min-h-[28px] px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center ${
              activeTab === 'OVERVIEW' ? 'bg-theme-primary text-theme-primary-text font-black shadow-theme-sm' : 'text-theme-sub hover:text-theme-main'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('H2H')}
            className={`flex-1 min-w-[50px] min-h-[28px] px-2 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-1 ${
              activeTab === 'H2H' ? 'bg-theme-primary text-theme-primary-text font-black' : 'text-theme-sub hover:text-theme-main'
            }`}
          >
            H2H {h2h.matchesCount > 0 && <span className="opacity-80">({h2h.matchesCount})</span>}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('TEAMS')}
            className={`flex-1 min-w-[50px] min-h-[28px] px-2 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-1 ${
              activeTab === 'TEAMS' ? 'bg-theme-primary text-theme-primary-text font-black' : 'text-theme-sub hover:text-theme-main'
            }`}
          >
            Teams {homeRecentMatchesList.length + awayRecentMatchesList.length > 0 && <span className="opacity-80">({homeRecentMatchesList.length + awayRecentMatchesList.length})</span>}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('PREDICTIONS')}
            className={`flex-1 min-w-[50px] min-h-[28px] px-2 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-1 ${
              activeTab === 'PREDICTIONS' ? 'bg-theme-primary text-theme-primary-text font-black' : 'text-theme-sub hover:text-theme-main'
            }`}
          >
            Preds {bestMarketsPerGroup.length > 0 && <span className="opacity-80">({bestMarketsPerGroup.length})</span>}
          </button>
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="p-3.5 sm:p-5 overflow-y-auto overscroll-contain space-y-3.5 sm:space-y-4 flex-1 min-h-0 min-w-0">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-4">
            {pred ? (
              <>


                {/* Expected Goals & Strength Context */}
                <div className="p-4 rounded-2xl bg-theme-card-elevated border border-theme space-y-2 shadow-theme-sm">
                  <span className="text-xs font-bold text-theme-main block font-sans">
                    Key Performance Projections
                  </span>
                  <div className="space-y-1.5 text-xs font-mono tabular-nums">
                    <div className="p-2.5 rounded-xl bg-theme-card border border-theme flex items-center justify-between">
                      <span className="font-sans text-theme-sub">Expected Goals (xG)</span>
                      <div className="font-bold text-theme-main">
                        <span className="text-theme-primary">{pred?.homeXG ?? '-'}</span>
                        <span aria-hidden="true" className="text-theme-dim px-1 font-normal">vs</span>
                        <span className="text-sky-600 dark:text-sky-400">{pred?.awayXG ?? '-'}</span>
                      </div>
                    </div>

                    {pred?.teamStrength ? (
                      <div className="p-2.5 rounded-xl bg-theme-card border border-theme flex items-center justify-between">
                        <span className="font-sans text-theme-sub">Team Strength Index</span>
                        <div className="font-bold text-theme-main">
                          <span className="text-theme-primary">{pred.teamStrength.homeStrengthRating}</span>
                          <span aria-hidden="true" className="text-theme-dim px-1 font-normal">vs</span>
                          <span className="text-sky-600 dark:text-sky-400">{pred.teamStrength.awayStrengthRating}</span>
                        </div>
                      </div>
                    ) : pred?.eloRatings ? (
                      <div className="p-2.5 rounded-xl bg-theme-card border border-theme flex items-center justify-between">
                        <span className="font-sans text-theme-sub">Elo Ratings</span>
                        <div className="font-bold text-theme-main">
                          <span className="text-theme-primary">{pred.eloRatings.homeElo}</span>
                          <span aria-hidden="true" className="text-theme-dim px-1 font-normal">vs</span>
                          <span className="text-sky-600 dark:text-sky-400">{pred.eloRatings.awayElo}</span>
                        </div>
                      </div>
                    ) : null}

                    {pred?.tacticalContext && (
                      <div className="p-2.5 rounded-xl bg-theme-card border border-theme flex items-center justify-between">
                        <span className="font-sans text-theme-sub">Rest Days</span>
                        <div className="font-bold text-theme-main">
                          <span>{pred.tacticalContext.restDaysHome}d</span>
                          <span aria-hidden="true" className="text-theme-dim px-1 font-normal">vs</span>
                          <span>{pred.tacticalContext.restDaysAway}d</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Poisson Score Heatmap Grid */}
                <div className="p-4 rounded-2xl bg-theme-card-elevated border border-theme shadow-theme-sm">
                  <PoissonMatrixView
                    prediction={pred}
                    homeTeam={fixture.homeTeam}
                    awayTeam={fixture.awayTeam}
                    showTopScores={true}
                  />
                </div>
              </>
            ) : (
              <div className="p-4 rounded-2xl bg-theme-card-elevated border border-theme space-y-3 text-center py-8 shadow-theme-sm">
                <Target className="w-8 h-8 text-theme-primary mx-auto mb-2 opacity-50" />
                <p className="text-xs text-theme-sub">No projections</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: HEAD TO HEAD */}
        {activeTab === 'H2H' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-theme-card border border-theme space-y-3 shadow-xs">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-theme-primary" />
                <span className="text-xs font-bold text-theme-main">
                  Head to Head Summary
                </span>
              </div>

              {isLoadingH2H ? (
                <div className="grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-theme-subtle border border-theme animate-pulse">
                      <div className="h-2.5 w-12 mx-auto bg-theme-subtle rounded-md" />
                      <div className="h-4 w-6 mx-auto bg-theme-subtle rounded-md mt-1.5" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
                  <div className="p-2.5 rounded-xl bg-theme-subtle border border-theme">
                    <span className="text-[10px] text-theme-sub block truncate font-sans">
                      {fixture.homeTeam} Wins
                    </span>
                    <span className="text-sm font-black text-theme-primary block mt-0.5">
                      {h2h.homeWins}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-theme-subtle border border-theme">
                    <span className="text-[10px] text-theme-sub block truncate font-sans">
                      Draws
                    </span>
                    <span className="text-sm font-black text-amber-500 block mt-0.5">
                      {h2h.draws}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-theme-subtle border border-theme">
                    <span className="text-[10px] text-theme-sub block truncate font-sans">
                      {fixture.awayTeam} Wins
                    </span>
                    <span className="text-sm font-black text-sky-500 block mt-0.5">
                      {h2h.awayWins}
                    </span>
                  </div>
                </div>
              )}

              {/* H2H Goal Averages & Multiplier */}
              {!isLoadingH2H && (
                <div className="space-y-1.5 text-xs font-mono tabular-nums pt-1">
                  <div className="p-2.5 rounded-xl bg-theme-subtle border border-theme flex items-center justify-between">
                    <span className="text-theme-sub font-sans">Goal Average</span>
                    <span className="font-bold text-theme-main">
                      {h2h.homeGoalsAvg} vs {h2h.awayGoalsAvg}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-theme-subtle border border-theme flex items-center justify-between">
                    <span className="text-theme-sub font-sans">H2H Adjustment Factor</span>
                    <span className="font-bold text-theme-primary">
                      x{h2h.h2hMultiplierHome} vs x{h2h.h2hMultiplierAway}
                    </span>
                  </div>


                </div>
              )}
            </div>

            {/* Historical Encounters List */}
            <div className="p-4 rounded-2xl bg-theme-card border border-theme space-y-2 shadow-xs">
              <span className="text-xs font-bold text-theme-main block font-sans">
                Past Meetings
              </span>

              {isLoadingH2H ? (
                <div className="space-y-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-[42px] w-full rounded-xl bg-theme-subtle animate-pulse" />
                  ))}
                </div>
              ) : h2h.recentH2H && h2h.recentH2H.length > 0 ? (
                <div className="space-y-1.5 font-mono tabular-nums text-xs">
                  {h2h.recentH2H.map((enc, idx) => {
                    const winningTeam = enc.winner === 'HOME' ? enc.homeTeam : enc.winner === 'AWAY' ? enc.awayTeam : null;
                    const winHomeScore = winningTeam ? teamMatchScore(winningTeam, fixture.homeTeam) : 0;
                    const winAwayScore = winningTeam ? teamMatchScore(winningTeam, fixture.awayTeam) : 0;
                    const isHomeWinner = winHomeScore > 0 && winHomeScore >= winAwayScore;
                    const isAwayWinner = winAwayScore > 0 && winAwayScore > winHomeScore;

                    return (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-theme-subtle border border-theme flex items-center justify-between gap-2 min-w-0"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-[10px] text-theme-sub shrink-0 font-sans">
                            {enc.date}
                          </span>
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
                <div className="py-6 text-center text-xs text-theme-sub font-mono">
                  No H2H records
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: TEAMS & FORM */}
        {activeTab === 'TEAMS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Home Team Card */}
            <div className="p-4 rounded-2xl bg-theme-card-elevated border border-theme space-y-3 min-w-0 shadow-theme-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-extrabold text-sm text-theme-main truncate block">
                    {fixture.homeTeam}
                  </span>
                  <span className="text-[11px] text-theme-sub font-mono tabular-nums">
                    Home Form & Performance
                  </span>
                </div>
                <span className="text-xs px-2 py-1 rounded-md bg-theme-card border border-theme text-theme-primary font-mono tabular-nums font-bold shrink-0">
                  x{pred?.homeFormMultiplier ?? 1.0} Form
                </span>
              </div>

              {/* Form Guide */}
              {homeRecentFormList.length > 0 ? (
                <div className="p-3 rounded-xl bg-theme-card border border-theme space-y-2 min-w-0">
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

              {/* Strengths */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                <div className="p-2.5 rounded-xl bg-theme-card border border-theme">
                  <span className="text-[10px] text-theme-sub block font-sans">Attack Rating</span>
                  <span className="text-sm font-black text-theme-primary block mt-0.5">
                    {pred?.homeAttackStrength ?? 1.0}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-theme-card border border-theme">
                  <span className="text-[10px] text-theme-sub block font-sans">Defense Rating</span>
                  <span className="text-sm font-black text-theme-primary block mt-0.5">
                    {pred?.homeDefenseStrength ?? 1.0}
                  </span>
                </div>
              </div>

              {/* Goals Summary */}
              {(homeRecentMatchesList.length > 0 || homeStats) && (
                <div className="space-y-1.5 font-mono tabular-nums text-xs">
                  <div className="p-2.5 rounded-xl bg-theme-card border border-theme flex items-center justify-between">
                    <span className="text-theme-sub font-sans">Total Goals</span>
                    <span className="font-bold text-theme-main">
                      {homeGoalsScored} scored - {homeGoalsConceded} conceded
                    </span>
                  </div>
                </div>
              )}

              {/* Recent Matches */}
              {homeRecentMatchesList.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-bold text-theme-main block font-sans">
                    Recent Matches
                  </span>
                  <div className="space-y-1 font-mono tabular-nums text-xs">
                    {homeRecentMatchesList.slice(0, 8).map((m, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-xl bg-theme-card border border-theme flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span
                            className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                              m.isHome
                                ? 'bg-theme-subtle text-theme-main'
                                : 'bg-theme-subtle text-theme-sub'
                            }`}
                          >
                            {m.isHome ? 'H' : 'A'}
                          </span>
                          <span className="font-bold text-theme-main truncate">
                            vs {m.opponent}
                          </span>
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
            </div>

            {/* Away Team Card */}
            <div className="p-4 rounded-2xl bg-theme-card-elevated border border-theme space-y-3 min-w-0 shadow-theme-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-extrabold text-sm text-theme-main truncate block">
                    {fixture.awayTeam}
                  </span>
                  <span className="text-[11px] text-theme-sub font-mono tabular-nums">
                    Away Form & Performance
                  </span>
                </div>
                <span className="text-xs px-2 py-1 rounded-md bg-theme-card border border-theme text-sky-600 dark:text-sky-400 font-mono tabular-nums font-bold shrink-0">
                  x{pred?.awayFormMultiplier ?? 1.0} Form
                </span>
              </div>

              {/* Form Guide */}
              {awayRecentFormList.length > 0 ? (
                <div className="p-3 rounded-xl bg-theme-card border border-theme space-y-2 min-w-0">
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
                          r === 'W'
                            ? 'bg-sky-500 text-white'
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

              {/* Strengths */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                <div className="p-2.5 rounded-xl bg-theme-card border border-theme">
                  <span className="text-[10px] text-theme-sub block font-sans">Attack Rating</span>
                  <span className="text-sm font-black text-sky-600 dark:text-sky-400 block mt-0.5">
                    {pred?.awayAttackStrength ?? 1.0}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-theme-card border border-theme">
                  <span className="text-[10px] text-theme-sub block font-sans">Defense Rating</span>
                  <span className="text-sm font-black text-sky-600 dark:text-sky-400 block mt-0.5">
                    {pred?.awayDefenseStrength ?? 1.0}
                  </span>
                </div>
              </div>

              {/* Goals Summary */}
              {(awayRecentMatchesList.length > 0 || awayStats) && (
                <div className="space-y-1.5 font-mono tabular-nums text-xs">
                  <div className="p-2.5 rounded-xl bg-theme-card border border-theme flex items-center justify-between">
                    <span className="text-theme-sub font-sans">Total Goals</span>
                    <span className="font-bold text-theme-main">
                      {awayGoalsScored} scored - {awayGoalsConceded} conceded
                    </span>
                  </div>
                </div>
              )}

              {/* Recent Matches */}
              {awayRecentMatchesList.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-bold text-theme-main block font-sans">
                    Recent Matches
                  </span>
                  <div className="space-y-1 font-mono tabular-nums text-xs">
                    {awayRecentMatchesList.slice(0, 8).map((m, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-xl bg-theme-card border border-theme flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span
                            className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                              m.isHome
                                ? 'bg-theme-subtle text-theme-main'
                                : 'bg-theme-subtle text-theme-sub'
                            }`}
                          >
                            {m.isHome ? 'H' : 'A'}
                          </span>
                          <span className="font-bold text-theme-main truncate">
                            vs {m.opponent}
                          </span>
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
            </div>
          </div>
        )}

        {/* TAB 5: PREDICTIONS */}
        {activeTab === 'PREDICTIONS' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-theme-card-elevated border border-theme space-y-3 shadow-theme-sm">
              <span className="text-xs font-bold text-theme-main block font-sans">
                Best Value Betting Predictions
              </span>
              {bestMarketsPerGroup && bestMarketsPerGroup.length > 0 ? (
                <div className="space-y-2 font-mono tabular-nums text-xs">
                  {bestMarketsPerGroup.map((market, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-theme-card border border-theme flex items-center justify-between"
                    >
                      <div>
                        <span className="text-[10px] text-theme-sub font-sans block uppercase font-bold">
                          {market.groupName} Market
                        </span>
                        <span className="font-extrabold text-theme-main font-sans text-sm">
                          {market.name}
                        </span>
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
                <div className="py-6 text-center text-xs text-theme-sub font-mono">
                  No predictions computed
                </div>
              )}
            </div>

            {/* Poisson Matrix View */}
            <div className="p-4 rounded-2xl bg-theme-card-elevated border border-theme shadow-theme-sm">
              <PoissonMatrixView
                prediction={pred}
                homeTeam={fixture.homeTeam}
                awayTeam={fixture.awayTeam}
                showTopScores={true}
              />
            </div>
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
      </div>
    </div>
  );

  return panelContainer;
};
