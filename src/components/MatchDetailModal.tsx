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
  getAuthoritativeValueBet,
  formatEV,
} from '../core/formatters.js';

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
        <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center text-slate-500 dark:text-neutral-400 bg-white dark:bg-[#121216] select-none">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-[#18181D] flex items-center justify-center mb-3">
            <Target className="w-6 h-6 text-slate-700 dark:text-[#CCFF00]" />
          </div>
          <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">Live Match Analytics</h4>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1 max-w-[260px] leading-relaxed">
            Select a fixture to view Dixon-Coles Poisson projections, team strengths, head-to-head records, and value bets.
          </p>
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
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="absolute inset-0 cursor-pointer" 
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-2xl mx-auto shadow-2xl animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
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

  useEffect(() => {
    let isCancelled = false;

    async function parseOnDemand() {
      // If we already have statistics, we don't need to fetch on-demand again for this specific component instance/ID
      if (fixture.id && !enrichedFixture.statistics) {
        setIsParsing(true);
        try {
          const detail = await EngineService.getMatchDetail(fixture.id);
          if (detail && !isCancelled) {
            setEnrichedFixture((prev) => {
              // Ensure we are still looking at the same fixture ID
              if (prev.id !== fixture.id) return prev;
              
              return {
                ...prev,
                ...detail,
                // Prioritize detail statistics but fallback to previous if empty
                statistics: (detail.statistics && detail.statistics.length > 0) 
                  ? detail.statistics 
                  : prev.statistics,
                score: detail.score || prev.score,
                // Merge measurements if present
                measurements: {
                  ...prev.measurements,
                  ...(detail.measurements || {})
                }
              };
            });
          }
        } catch (err) {
          console.warn('[MatchDetail] Detail fetch failed:', err);
        } finally {
          if (!isCancelled) setIsParsing(false);
        }
      }
    }

    // Reset local state ONLY if the ID actually changed
    if (enrichedFixture.id !== fixture.id) {
      setEnrichedFixture(fixture);
      setScrapedH2H(null);
      setIsLoadingH2H(true);
      parseOnDemand();
    } else {
      // If ID is the same, but the parent updated (e.g. live score change),
      // we merge the prop updates into our local enriched state without losing our enriched fields.
      setEnrichedFixture(prev => ({
        ...prev,
        ...fixture,
        // Preserve local enriched fields
        statistics: prev.statistics || fixture.statistics,
        information: prev.information || fixture.information,
        measurements: {
          ...prev.measurements,
          ...(fixture.measurements || {})
        }
      }));
    }

    return () => { isCancelled = true; };
  }, [fixture.id, fixture]); // Added fixture.id explicitly for clarity

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

  // Scraped Head to Head sync
  const initialH2H =
    pred?.measurements?.h2h?.homeRecentMatches &&
    pred.measurements.h2h.homeRecentMatches.length > 0
      ? pred.measurements.h2h
      : null;
  const [scrapedH2H, setScrapedH2H] = useState<HeadToHeadMeasurement | null>(initialH2H);
  const [isLoadingH2H, setIsLoadingH2H] = useState<boolean>(!initialH2H);

  // Synchronize H2H if it becomes available in the enriched fixture (e.g. from detail fetch)
  useEffect(() => {
    const fixtureH2H = enrichedFixture.measurements?.h2h || enrichedFixture.prediction?.measurements?.h2h;
    const hasData = fixtureH2H?.homeRecentMatches && fixtureH2H.homeRecentMatches.length > 0;
    
    if (hasData) {
      setScrapedH2H(fixtureH2H);
      setIsLoadingH2H(false);
    }
  }, [enrichedFixture.measurements, enrichedFixture.prediction]);

  useEffect(() => {
    let isCancelled = false;
    async function loadRealH2H() {
      // Check if we already have H2H in our local state
      if (scrapedH2H && scrapedH2H.homeRecentMatches && scrapedH2H.homeRecentMatches.length > 0) {
        setIsLoadingH2H(false);
        return;
      }

      // Check if it's already in the enriched fixture
      const existingH2H = enrichedFixture.measurements?.h2h || enrichedFixture.prediction?.measurements?.h2h;
      if (existingH2H && existingH2H.homeRecentMatches && existingH2H.homeRecentMatches.length > 0) {
        setScrapedH2H(existingH2H);
        setIsLoadingH2H(false);
        return;
      }

      try {
        setIsLoadingH2H(true);
        const data = await EngineService.getMatchHeadToHead(fixture.id, fixture.homeTeam, fixture.awayTeam);
        if (!isCancelled) {
          if (data && data.homeRecentMatches && data.homeRecentMatches.length > 0) {
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
        }
      } catch (err) {
        console.warn('Unable to load live H2H:', err);
      } finally {
        if (!isCancelled) {
          setIsLoadingH2H(false);
        }
      }
    }

    loadRealH2H();
    return () => {
      isCancelled = true;
    };
  }, [fixture.id, fixture.homeTeam, fixture.awayTeam]);

  // Derived real recent matches
  const homeRecentMatchesList = useMemo(() => {
    return scrapedH2H?.homeRecentMatches || [];
  }, [scrapedH2H]);

  const awayRecentMatchesList = useMemo(() => {
    return scrapedH2H?.awayRecentMatches || [];
  }, [scrapedH2H]);

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

  const h2h: HeadToHeadMeasurement = scrapedH2H || pred?.measurements?.h2h || {
    matchesCount: 0,
    homeWins: 0,
    draws: 0,
    awayWins: 0,
    homeGoalsAvg: 0,
    awayGoalsAvg: 0,
    h2hMultiplierHome: 1.0,
    h2hMultiplierAway: 1.0,
    recentH2H: [],
  };

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
  const authoritativePick = pred ? getAuthoritative1X2Pick(currentFixture) : { label: 'Match Result', probabilityFormatted: '-' };
  const authoritativeValue = pred ? getAuthoritativeValueBet(currentFixture) : { hasValue: false, selection: '-', evFormatted: '-', odds: 1.0 };

  const panelContainer = (
    <div
      className={`bg-white dark:bg-[#121216] text-slate-950 dark:text-neutral-100 flex flex-col overflow-hidden select-none ${
        isPanel
          ? 'h-full w-full'
          : 'w-full max-w-2xl h-[88vh] sm:h-[82vh] max-h-[850px] min-h-[540px] rounded-t-3xl sm:rounded-2xl shadow-2xl shrink-0'
      }`}
      style={{ scrollbarGutter: 'stable' }}
    >
      {/* Mobile Drag Handle Affordance */}
      {!isPanel && (
        <div className="w-10 h-1 bg-slate-300 dark:bg-neutral-700 rounded-md mx-auto my-2 sm:hidden shrink-0" />
      )}

      {/* Modal Header */}
      <div className="bg-white dark:bg-[#121216] px-4 sm:px-5 pt-3 pb-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-x-auto no-scrollbar text-[11px] text-slate-500 dark:text-neutral-400">
            <span className="font-bold text-slate-900 dark:text-white truncate whitespace-nowrap">
              {fixture.stage || fixture.leagueName}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-neutral-700 shrink-0">·</span>
            <span className="flex items-center gap-1 font-mono tabular-nums text-[10px] whitespace-nowrap shrink-0">
              <Calendar className="w-3 h-3 text-slate-400" />
              <span>{formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp).dateStr}</span>
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-neutral-700 shrink-0">·</span>
            <span className="flex items-center gap-1 font-mono tabular-nums text-[10px] whitespace-nowrap shrink-0">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp).timeStr}</span>
            </span>
            {fixture.status === 'LIVE' && (
              <>
                <span aria-hidden="true" className="text-slate-300 dark:text-neutral-700 shrink-0">·</span>
                <span className="text-slate-950 dark:text-slate-950 font-black flex items-center gap-1 text-[10px] whitespace-nowrap shrink-0 bg-[#CCFF00] px-1.5 py-0.5 rounded-md font-mono tabular-nums">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />
                  LIVE
                </span>
              </>
            )}
          </div>

          {/* Close Action */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[32px] min-w-[32px] w-8 h-8 rounded-xl bg-slate-100 hover:bg-[#CCFF00] hover:text-slate-950 dark:bg-[#18181D] dark:hover:bg-[#CCFF00] text-slate-700 dark:text-neutral-300 dark:hover:text-slate-950 transition-colors cursor-pointer flex items-center justify-center shrink-0"
              aria-label="Close match details"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </div>

        {/* Hero Scoreboard Container - Styled with Red Gradient Card from Reference Image */}
        <div className="mt-3 p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#FF1A35] via-[#FF0D2E] to-[#E6001C] text-white min-w-0 shadow-lg shadow-red-500/20 shrink-0 min-h-[96px] flex items-center">
          <div className="grid grid-cols-12 items-center gap-2 w-full">
            {/* Home Team */}
            <div className="col-span-5 flex items-center gap-2.5 min-w-0">
              {fixture.homeBadge ? (
                <img
                  src={fixture.homeBadge}
                  alt=""
                  className="w-8 h-8 sm:w-9 sm:h-9 object-contain shrink-0 rounded-full bg-white/20 p-0.5"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/20 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                  {fixture.homeTeam.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <span
                  className="text-xs sm:text-sm font-extrabold text-white truncate block"
                  title={fixture.homeTeam}
                >
                  {fixture.homeTeam}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5 font-mono tabular-nums text-[10px] text-white/80 min-h-[16px]">
                  {pred ? (
                    <>
                      <span className="font-bold whitespace-nowrap">
                        {homeWinPct}% Win
                      </span>
                      <span aria-hidden="true" className="text-white/60">·</span>
                      <span className="whitespace-nowrap">
                        xG {pred.homeXG}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Match Status / Score */}
            <div className="col-span-2 flex flex-col items-center justify-center text-center shrink-0">
              {fixture.score && fixture.score.home !== undefined ? (
                <div>
                  <span className="text-base sm:text-xl font-mono tabular-nums font-black text-white tracking-tight whitespace-nowrap">
                    {fixture.score.home} - {fixture.score.away}
                  </span>
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-white/90 mt-0.5">
                    {fixture.status === 'LIVE'
                      ? fixture.minute
                        ? `${fixture.minute}'`
                        : 'Live'
                      : 'Full Time'}
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-[11px] font-black uppercase tracking-widest text-white/90">
                    VS
                  </span>
                  <span className="block text-[10px] font-mono tabular-nums text-white/80 mt-0.5">
                    {formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp).timeStr}
                  </span>
                </div>
              )}
            </div>

            {/* Away Team */}
            <div className="col-span-5 flex items-center justify-end gap-2.5 min-w-0 text-right">
              <div className="min-w-0 flex-1">
                <span
                  className="text-xs sm:text-sm font-extrabold text-white truncate block"
                  title={fixture.awayTeam}
                >
                  {fixture.awayTeam}
                </span>
                <div className="flex items-center justify-end gap-1.5 mt-0.5 font-mono tabular-nums text-[10px] text-white/80 min-h-[16px]">
                  {pred ? (
                    <>
                      <span className="whitespace-nowrap">
                        xG {pred.awayXG}
                      </span>
                      <span aria-hidden="true" className="text-white/60">·</span>
                      <span className="font-bold whitespace-nowrap">
                        {awayWinPct}% Win
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              {fixture.awayBadge ? (
                <img
                  src={fixture.awayBadge}
                  alt=""
                  className="w-8 h-8 sm:w-9 sm:h-9 object-contain shrink-0 rounded-full bg-white/20 p-0.5"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/20 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                  {fixture.awayTeam.slice(0, 1)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Segmented Sub-Navigation Control */}
        <div className="mt-3 w-full flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#1A1C24] rounded-xl overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('OVERVIEW')}
            className={`flex-1 min-w-[64px] sm:min-w-0 min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center ${
              activeTab === 'OVERVIEW'
                ? 'bg-[#FF001F] text-white font-black shadow-xs'
                : 'text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Overview
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('H2H')}
            className={`flex-1 min-w-[56px] sm:min-w-0 min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-1 ${
              activeTab === 'H2H'
                ? 'bg-[#FF001F] text-white font-black shadow-xs'
                : 'text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>H2H</span>
            {h2h.matchesCount > 0 && (
              <span className="text-[10px] font-mono tabular-nums opacity-85">
                ({h2h.matchesCount})
              </span>
            )}
          </button>

          {parsedStatsSummary.items.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('STATS')}
              className={`flex-1 min-w-[64px] sm:min-w-0 min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-1 ${
                activeTab === 'STATS'
                  ? 'bg-[#FF001F] text-white font-black shadow-xs'
                  : 'text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Stats</span>
              <span className="text-[10px] font-mono tabular-nums opacity-85">
                ({parsedStatsSummary.items.length})
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('TEAMS')}
            className={`flex-1 min-w-[68px] sm:min-w-0 min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center ${
              activeTab === 'TEAMS'
                ? 'bg-[#FF001F] text-white font-black shadow-xs'
                : 'text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Team Form
          </button>

          {pred && (
            <button
              type="button"
              onClick={() => setActiveTab('PREDICTIONS')}
              className={`flex-1 min-w-[76px] sm:min-w-0 min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center ${
                activeTab === 'PREDICTIONS'
                  ? 'bg-[#FF001F] text-white font-black shadow-xs'
                  : 'text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Predictions
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('STANDINGS')}
            className={`flex-1 min-w-[68px] sm:min-w-0 min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center ${
              activeTab === 'STANDINGS'
                ? 'bg-[#FF001F] text-white font-black shadow-xs'
                : 'text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Standings
          </button>
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="p-4 sm:p-5 overflow-y-auto overscroll-contain space-y-4 flex-1 min-h-0 min-w-0">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-4">
            {pred ? (
              <>
                {/* Win Probability Bar & Outcome Cards */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#18181D] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 dark:text-white">
                      Match Outcome Probabilities
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-neutral-400 text-[11px]">
                      Dixon-Coles Model
                    </span>
                  </div>

                  {/* 3-Section Visual Proportional Gauge */}
                  <div className="h-2 w-full bg-slate-200 dark:bg-[#1A1C24] rounded-full flex overflow-hidden">
                    <div
                      style={{ width: `${homeWinPct}%` }}
                      className="bg-[#FF001F] transition-all duration-300"
                    />
                    <div
                      style={{ width: `${drawPct}%` }}
                      className="bg-slate-400 dark:bg-neutral-600 transition-all duration-300"
                    />
                    <div
                      style={{ width: `${awayWinPct}%` }}
                      className="bg-slate-800 dark:bg-neutral-300 transition-all duration-300"
                    />
                  </div>

                  {/* Outcome Metric Cards */}
                  <div className="grid grid-cols-3 gap-2 pt-1 font-mono tabular-nums">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] text-center">
                      <span className="text-[11px] font-sans text-[#8F92A1] dark:text-[#9EA3B2] block truncate">
                        {fixture.homeTeam}
                      </span>
                      <span className="text-sm sm:text-base font-extrabold text-[#FF001F] block mt-0.5">
                        {homeWinPct}%
                      </span>
                      {fixture.odds?.homeWin && (
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Odds {fixture.odds.homeWin.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] text-center">
                      <span className="text-[11px] font-sans text-[#8F92A1] dark:text-[#9EA3B2] block">
                        Draw
                      </span>
                      <span className="text-sm sm:text-base font-extrabold text-slate-700 dark:text-neutral-300 block mt-0.5">
                        {drawPct}%
                      </span>
                      {fixture.odds?.draw && (
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Odds {fixture.odds.draw.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] text-center">
                      <span className="text-[11px] font-sans text-[#8F92A1] dark:text-[#9EA3B2] block truncate">
                        {fixture.awayTeam}
                      </span>
                      <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white block mt-0.5">
                        {awayWinPct}%
                      </span>
                      {fixture.odds?.awayWin && (
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Odds {fixture.odds.awayWin.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Model Projections */}
                  <div className="pt-2 space-y-1.5 text-xs font-mono tabular-nums">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between">
                      <span className="font-sans text-slate-600 dark:text-neutral-300">Over 2.5 Goals</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {formatProb(pred.over25Prob, 1)}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between">
                      <span className="font-sans text-slate-600 dark:text-neutral-300">Both Teams to Score (BTTS)</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {formatProb(pred.bttsProb, 1)}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between">
                      <span className="font-sans text-slate-600 dark:text-neutral-300">Highest Probability Pick</span>
                      <span className="font-bold text-slate-900 dark:text-[#CCFF00] font-sans">
                        {authoritativePick.label} ({authoritativePick.probabilityFormatted})
                      </span>
                    </div>

                    {authoritativeValue.hasValue ? (
                      <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between">
                        <span className="font-sans text-slate-900 dark:text-[#CCFF00] font-bold flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5 text-slate-900 dark:text-[#CCFF00]" />
                          Value Market Edge
                        </span>
                        <span className="font-bold text-slate-900 dark:text-[#CCFF00] font-sans">
                          {authoritativeValue.selection} ({authoritativeValue.evFormatted} @ {authoritativeValue.odds.toFixed(2)})
                        </span>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between">
                        <span className="font-sans text-slate-500 dark:text-neutral-400">Value Market Edge</span>
                        <span className="font-medium text-slate-400 font-sans">No Edge Identified</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expected Goals & Strength Context */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#18181D] space-y-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block font-sans">
                    Key Performance Projections
                  </span>
                  <div className="space-y-1.5 text-xs font-mono tabular-nums">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between">
                      <span className="font-sans text-slate-600 dark:text-neutral-300">Expected Goals (xG)</span>
                      <div className="font-bold text-slate-900 dark:text-white">
                        <span className="text-slate-900 dark:text-[#CCFF00]">{pred?.homeXG ?? '-'}</span>
                        <span aria-hidden="true" className="text-slate-400 px-1 font-normal">vs</span>
                        <span className="text-cyan-600 dark:text-cyan-400">{pred?.awayXG ?? '-'}</span>
                      </div>
                    </div>

                    {pred?.teamStrength ? (
                      <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between">
                        <span className="font-sans text-slate-600 dark:text-neutral-300">Team Strength Index</span>
                        <div className="font-bold text-slate-900 dark:text-white">
                          <span className="text-slate-900 dark:text-[#CCFF00]">{pred.teamStrength.homeStrengthRating}</span>
                          <span aria-hidden="true" className="text-slate-400 px-1 font-normal">vs</span>
                          <span className="text-cyan-600 dark:text-cyan-400">{pred.teamStrength.awayStrengthRating}</span>
                        </div>
                      </div>
                    ) : pred?.eloRatings ? (
                      <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between">
                        <span className="font-sans text-slate-600 dark:text-neutral-300">Elo Ratings</span>
                        <div className="font-bold text-slate-900 dark:text-white">
                          <span className="text-slate-900 dark:text-[#CCFF00]">{pred.eloRatings.homeElo}</span>
                          <span aria-hidden="true" className="text-slate-400 px-1 font-normal">vs</span>
                          <span className="text-cyan-600 dark:text-cyan-400">{pred.eloRatings.awayElo}</span>
                        </div>
                      </div>
                    ) : null}

                    {pred?.tacticalContext && (
                      <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between">
                        <span className="font-sans text-slate-600 dark:text-neutral-300">Rest Days</span>
                        <div className="font-bold text-slate-900 dark:text-white">
                          <span>{pred.tacticalContext.restDaysHome}d</span>
                          <span aria-hidden="true" className="text-slate-400 px-1 font-normal">vs</span>
                          <span>{pred.tacticalContext.restDaysAway}d</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Poisson Score Heatmap Grid */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#18181D]">
                  <PoissonMatrixView
                    prediction={pred}
                    homeTeam={fixture.homeTeam}
                    awayTeam={fixture.awayTeam}
                    showTopScores={true}
                  />
                </div>
              </>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#18181D] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 dark:text-white">
                    Match Schedule & Odds
                  </span>
                  <span className="font-mono tabular-nums text-slate-500 dark:text-neutral-400 text-[11px]">
                    {fixture.leagueName}
                  </span>
                </div>
                {fixture.odds && (
                  <div className="grid grid-cols-3 gap-2 pt-1 font-mono tabular-nums">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] text-center">
                      <span className="text-[11px] font-sans text-[#8F92A1] dark:text-[#9EA3B2] block truncate">
                        {fixture.homeTeam}
                      </span>
                      <span className="text-xs font-bold text-slate-700 dark:text-neutral-300 block mt-1">
                        Odds {fixture.odds.homeWin ? fixture.odds.homeWin.toFixed(2) : '-'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] text-center">
                      <span className="text-[11px] font-sans text-[#8F92A1] dark:text-[#9EA3B2] block">
                        Draw
                      </span>
                      <span className="text-xs font-bold text-slate-700 dark:text-neutral-300 block mt-1">
                        Odds {fixture.odds.draw ? fixture.odds.draw.toFixed(2) : '-'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] text-center">
                      <span className="text-[11px] font-sans text-[#8F92A1] dark:text-[#9EA3B2] block truncate">
                        {fixture.awayTeam}
                      </span>
                      <span className="text-xs font-bold text-slate-700 dark:text-neutral-300 block mt-1">
                        Odds {fixture.odds.awayWin ? fixture.odds.awayWin.toFixed(2) : '-'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: HEAD TO HEAD */}
        {activeTab === 'H2H' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#18181D] space-y-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500 dark:text-neutral-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Head to Head Summary
                </span>
              </div>

              {isLoadingH2H ? (
                <div className="grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] animate-pulse">
                      <div className="h-2.5 w-12 mx-auto bg-slate-200 dark:bg-neutral-800 rounded-md" />
                      <div className="h-4 w-6 mx-auto bg-slate-200 dark:bg-neutral-800 rounded-md mt-1.5" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B]">
                    <span className="text-[10px] text-slate-500 dark:text-neutral-400 block truncate font-sans">
                      {fixture.homeTeam} Wins
                    </span>
                    <span className="text-sm font-black text-slate-900 dark:text-[#CCFF00] block mt-0.5">
                      {h2h.homeWins}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B]">
                    <span className="text-[10px] text-slate-500 dark:text-neutral-400 block truncate font-sans">
                      Draws
                    </span>
                    <span className="text-sm font-black text-amber-600 dark:text-amber-400 block mt-0.5">
                      {h2h.draws}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B]">
                    <span className="text-[10px] text-slate-500 dark:text-neutral-400 block truncate font-sans">
                      {fixture.awayTeam} Wins
                    </span>
                    <span className="text-sm font-black text-cyan-600 dark:text-cyan-400 block mt-0.5">
                      {h2h.awayWins}
                    </span>
                  </div>
                </div>
              )}

              {/* H2H Goal Averages & Multiplier */}
              {!isLoadingH2H && (
                <div className="space-y-1.5 text-xs font-mono tabular-nums pt-1">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between">
                    <span className="text-slate-500 dark:text-neutral-400 font-sans">Goal Average</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {h2h.homeGoalsAvg} vs {h2h.awayGoalsAvg}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between">
                    <span className="text-slate-500 dark:text-neutral-400 font-sans">H2H Adjustment Factor</span>
                    <span className="font-bold text-slate-900 dark:text-[#CCFF00]">
                      x{h2h.h2hMultiplierHome} vs x{h2h.h2hMultiplierAway}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Historical Encounters List */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#18181D] space-y-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white block font-sans">
                Past Meetings
              </span>

              {isLoadingH2H ? (
                <div className="space-y-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-[42px] w-full rounded-xl bg-white dark:bg-[#09090B] animate-pulse" />
                  ))}
                </div>
              ) : h2h.recentH2H && h2h.recentH2H.length > 0 ? (
                <div className="space-y-1.5 font-mono tabular-nums text-xs">
                  {h2h.recentH2H.map((enc, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between gap-2 min-w-0"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[10px] text-slate-400 shrink-0 font-sans">
                          {enc.date}
                        </span>
                        {enc.competition && (
                          <span className="text-[10px] text-slate-500 dark:text-neutral-400 truncate hidden sm:inline">
                            {enc.competition}
                          </span>
                        )}
                        <span className="font-bold text-slate-900 dark:text-white truncate">
                          {enc.homeTeam} vs {enc.awayTeam}
                        </span>
                      </div>

                      <div className="shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-black ${
                            enc.winner === 'HOME'
                              ? 'bg-[#CCFF00]/20 text-slate-950 dark:text-[#CCFF00]'
                              : enc.winner === 'AWAY'
                              ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400'
                              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {enc.score}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 font-mono">
                  No previous encounters found
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: STATISTICS */}
        {activeTab === 'STATS' && parsedStatsSummary.items.length > 0 && (
          <div className="space-y-4">
            {/* Possession Comparative Gauge */}
            {parsedStatsSummary.possession && (
              <div className="p-4 rounded-2xl bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] space-y-2 font-mono tabular-nums text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-[#FF001F] text-sm">
                    {parsedStatsSummary.possession.home}%
                  </span>
                  <span className="font-sans text-xs font-bold text-slate-800 dark:text-neutral-200">
                    Ball Possession
                  </span>
                  <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                    {parsedStatsSummary.possession.away}%
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 dark:bg-[#1E2027] rounded-full flex overflow-hidden">
                  <div
                    style={{ width: `${parsedStatsSummary.possession.home}%` }}
                    className="bg-[#FF001F] transition-all duration-300"
                  />
                  <div
                    style={{ width: `${parsedStatsSummary.possession.away}%` }}
                    className="bg-slate-800 dark:bg-neutral-300 transition-all duration-300"
                  />
                </div>
              </div>
            )}

            {/* Category Filter Pills */}
            {parsedStatsSummary.availableGroups.length > 1 && (
              <div className="w-full flex items-center bg-slate-100 dark:bg-[#1A1C24] p-1 rounded-xl overflow-x-auto no-scrollbar gap-1 flex-nowrap shrink-0">
                {parsedStatsSummary.availableGroups.map((g) => (
                  <button
                    key={g.group}
                    type="button"
                    onClick={() => setStatFilterGroup(g.group)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
                      statFilterGroup === g.group
                        ? 'bg-[#FF001F] text-white font-black'
                        : 'text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span>{g.label}</span>
                    <span className="text-[10px] font-mono tabular-nums opacity-85">({g.count})</span>
                  </button>
                ))}
              </div>
            )}

            {/* Metric Rows */}
            <div className="space-y-1.5">
              {filteredStatItems.map((stat, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                    <span
                      className={`w-12 text-left font-bold ${
                        stat.leader === 'HOME'
                          ? 'text-[#FF001F] font-black'
                          : 'text-[#8F92A1] dark:text-[#9EA3B2]'
                      }`}
                    >
                      {stat.home.raw}
                    </span>
                    <span className="text-slate-900 dark:text-white font-sans font-semibold text-center flex-1 truncate px-2 text-xs">
                      {stat.category}
                    </span>
                    <span
                      className={`w-12 text-right font-bold ${
                        stat.leader === 'AWAY'
                          ? 'text-slate-900 dark:text-white font-black'
                          : 'text-[#8F92A1] dark:text-[#9EA3B2]'
                      }`}
                    >
                      {stat.away.raw}
                    </span>
                  </div>

                  <div className="h-1.5 w-full bg-slate-100 dark:bg-[#1E2027] rounded-full flex overflow-hidden">
                    <div
                      style={{ width: `${stat.homeSharePercent}%` }}
                      className={`transition-all duration-300 ${
                        stat.isInverseMetric ? 'bg-amber-500' : 'bg-[#FF001F]'
                      }`}
                    />
                    <div
                      style={{ width: `${stat.awaySharePercent}%` }}
                      className={`transition-all duration-300 ${
                        stat.isInverseMetric ? 'bg-rose-500' : 'bg-slate-800 dark:bg-neutral-300'
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Venue & Details */}
            {(fixture.stage || (fixture.information && fixture.information.length > 0)) && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#18181D] space-y-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white block font-sans">
                  Match Details
                </span>
                <div className="space-y-1.5 text-xs font-mono tabular-nums">
                  {fixture.information?.map((info, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between gap-3"
                    >
                      <span className="text-slate-500 dark:text-neutral-400 font-sans">{info.category}</span>
                      <span className="font-bold text-slate-900 dark:text-white truncate">{info.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: TEAMS & FORM */}
        {activeTab === 'TEAMS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Home Team Card */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#18181D] space-y-3 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block">
                    {fixture.homeTeam}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-neutral-400 font-mono tabular-nums">
                    Home Form & Performance
                  </span>
                </div>
                <span className="text-xs px-2 py-1 rounded-md bg-slate-100 dark:bg-[#09090B] text-slate-900 dark:text-[#CCFF00] font-mono tabular-nums font-bold shrink-0">
                  x{pred?.homeFormMultiplier ?? 1.0} Form
                </span>
              </div>

              {/* Form Guide */}
              {homeRecentFormList.length > 0 ? (
                <div className="p-3 rounded-xl bg-white dark:bg-[#09090B] space-y-2 min-w-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-neutral-400 font-sans">Form Guide</span>
                    <span className="font-mono tabular-nums text-[10px] text-slate-400">
                      Last {Math.min(10, homeRecentFormList.length)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 font-mono tabular-nums">
                    {homeRecentFormList.slice(0, 10).map((r, i) => (
                      <span
                        key={i}
                        className={`w-6 h-6 rounded-md text-xs font-black flex items-center justify-center shrink-0 ${
                          r === 'W'
                            ? 'bg-[#CCFF00] text-slate-950'
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
                <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B]">
                  <span className="text-[10px] text-slate-500 dark:text-neutral-400 block font-sans">Attack Rating</span>
                  <span className="text-sm font-black text-slate-900 dark:text-[#CCFF00] block mt-0.5">
                    {pred?.homeAttackStrength ?? 1.0}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B]">
                  <span className="text-[10px] text-slate-500 dark:text-neutral-400 block font-sans">Defense Rating</span>
                  <span className="text-sm font-black text-slate-900 dark:text-[#CCFF00] block mt-0.5">
                    {pred?.homeDefenseStrength ?? 1.0}
                  </span>
                </div>
              </div>

              {/* Goals Summary */}
              {(homeRecentMatchesList.length > 0 || homeStats) && (
                <div className="space-y-1.5 font-mono tabular-nums text-xs">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between">
                    <span className="text-slate-500 dark:text-neutral-400 font-sans">Total Goals</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {homeGoalsScored} scored - {homeGoalsConceded} conceded
                    </span>
                  </div>
                </div>
              )}

              {/* Recent Matches */}
              {homeRecentMatchesList.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block font-sans">
                    Recent Matches
                  </span>
                  <div className="space-y-1 font-mono tabular-nums text-xs">
                    {homeRecentMatchesList.slice(0, 8).map((m, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span
                            className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                              m.isHome
                                ? 'bg-slate-100 dark:bg-[#18181D] text-slate-700 dark:text-neutral-300'
                                : 'bg-slate-200 dark:bg-[#18181D] text-slate-600 dark:text-neutral-400'
                            }`}
                          >
                            {m.isHome ? 'H' : 'A'}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white truncate">
                            vs {m.opponent}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {m.goalsFor} - {m.goalsAgainst}
                          </span>
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                              m.result === 'W'
                                ? 'bg-[#CCFF00] text-slate-950'
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
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#18181D] space-y-3 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate block">
                    {fixture.awayTeam}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-neutral-400 font-mono tabular-nums">
                    Away Form & Performance
                  </span>
                </div>
                <span className="text-xs px-2 py-1 rounded-md bg-cyan-50 dark:bg-[#09090B] text-cyan-700 dark:text-cyan-400 font-mono tabular-nums font-bold shrink-0">
                  x{pred?.awayFormMultiplier ?? 1.0} Form
                </span>
              </div>

              {/* Form Guide */}
              {awayRecentFormList.length > 0 ? (
                <div className="p-3 rounded-xl bg-white dark:bg-[#09090B] space-y-2 min-w-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-neutral-400 font-sans">Form Guide</span>
                    <span className="font-mono tabular-nums text-[10px] text-slate-400">
                      Last {Math.min(10, awayRecentFormList.length)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 font-mono tabular-nums">
                    {awayRecentFormList.slice(0, 10).map((r, i) => (
                      <span
                        key={i}
                        className={`w-6 h-6 rounded-md text-xs font-black flex items-center justify-center shrink-0 ${
                          r === 'W'
                            ? 'bg-cyan-500 text-slate-950'
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
                <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B]">
                  <span className="text-[10px] text-slate-500 dark:text-neutral-400 block font-sans">Attack Rating</span>
                  <span className="text-sm font-black text-cyan-600 dark:text-cyan-400 block mt-0.5">
                    {pred?.awayAttackStrength ?? 1.0}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B]">
                  <span className="text-[10px] text-slate-500 dark:text-neutral-400 block font-sans">Defense Rating</span>
                  <span className="text-sm font-black text-cyan-600 dark:text-cyan-400 block mt-0.5">
                    {pred?.awayDefenseStrength ?? 1.0}
                  </span>
                </div>
              </div>

              {/* Goals Summary */}
              {(awayRecentMatchesList.length > 0 || awayStats) && (
                <div className="space-y-1.5 font-mono tabular-nums text-xs">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between">
                    <span className="text-slate-500 dark:text-neutral-400 font-sans">Total Goals</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {awayGoalsScored} scored - {awayGoalsConceded} conceded
                    </span>
                  </div>
                </div>
              )}

              {/* Recent Matches */}
              {awayRecentMatchesList.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block font-sans">
                    Recent Matches
                  </span>
                  <div className="space-y-1 font-mono tabular-nums text-xs">
                    {awayRecentMatchesList.slice(0, 8).map((m, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span
                            className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                              m.isHome
                                ? 'bg-slate-100 dark:bg-[#18181D] text-slate-700 dark:text-neutral-300'
                                : 'bg-slate-200 dark:bg-[#18181D] text-slate-600 dark:text-neutral-400'
                            }`}
                          >
                            {m.isHome ? 'H' : 'A'}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white truncate">
                            vs {m.opponent}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {m.goalsFor} - {m.goalsAgainst}
                          </span>
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                              m.result === 'W'
                                ? 'bg-cyan-500 text-slate-950'
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
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#18181D] space-y-3">
              <span className="text-xs font-bold text-slate-900 dark:text-white block font-sans">
                Best Value Betting Predictions
              </span>
              {bestMarketsPerGroup && bestMarketsPerGroup.length > 0 ? (
                <div className="space-y-2 font-mono tabular-nums text-xs">
                  {bestMarketsPerGroup.map((market, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-white dark:bg-[#09090B] flex items-center justify-between"
                    >
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-neutral-400 font-sans block uppercase font-bold">
                          {market.groupName} Market
                        </span>
                        <span className="font-extrabold text-slate-900 dark:text-white font-sans text-sm">
                          {market.name}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold text-slate-900 dark:text-[#CCFF00] block text-sm">
                          {(market.probability * 100).toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          Fair Odds {(1 / market.probability).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 font-mono">
                  No predictions computed
                </div>
              )}
            </div>

            {/* Poisson Matrix View */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#18181D]">
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

  if (isPanel) {
    return panelContainer;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 dark:bg-black/80 backdrop-blur-md font-sans overflow-hidden">
      {panelContainer}
    </div>
  );
};
