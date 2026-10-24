import React, { useState, useMemo, useEffect } from 'react';
import { X, History, Calendar, Clock } from 'lucide-react';
import { Fixture, HeadToHeadMeasurement, MarketOption } from '../core/types.js';
import { PoissonMatrixView } from './PoissonMatrixView.js';
import { ApexEngine } from '../core/poisson.js';
import { parseDynamicStatistics, StatCategoryGroup } from '../core/statisticsParser.js';
import { EngineService } from '../services/engineService.js';
import { LeagueStandings } from './LeagueStandings.js';
import { OnDemandParser } from '../core/onDemandParser.js';
import {
  formatProb,
  getProbValue,
  getAuthoritative1X2Pick,
  getAuthoritativeValueBet,
  formatEV,
} from '../core/formatters.js';

interface MatchDetailModalProps {
  fixture: Fixture | null;
  onClose: () => void;
}

type ModalTab = 'OVERVIEW' | 'H2H' | 'STATS' | 'TEAMS' | 'STANDINGS' | 'PREDICTIONS';

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
  fixture,
  onClose,
}) => {
  const safeFixture = useMemo(() => {
    if (!fixture) return null;
    if (fixture.prediction) return fixture;
    const { prediction, homeStats, awayStats } = ApexEngine.predictMatch(
      fixture.homeTeam,
      fixture.awayTeam,
      []
    );
    const odds = fixture.odds || {
      homeWin: prediction.homeWinProb > 0 ? Number((1 / prediction.homeWinProb).toFixed(2)) : 2.20,
      draw: prediction.drawProb > 0 ? Number((1 / prediction.drawProb).toFixed(2)) : 3.30,
      awayWin: prediction.awayWinProb > 0 ? Number((1 / prediction.awayWinProb).toFixed(2)) : 3.20,
      over25: prediction.over25Prob > 0 ? Number((1 / prediction.over25Prob).toFixed(2)) : 1.90,
      under25: prediction.over25Prob < 1 ? Number((1 / (1 - prediction.over25Prob)).toFixed(2)) : 1.90,
    };
    const { markets, bestValueMarket } = ApexEngine.calculateMarkets(
      prediction,
      odds,
      {
        activeProvider: 'FLASHSCORE',
        rollingMatchWindow: 15,
        minEVThreshold: 1.10,
        safeWinThreshold: 0.72,
        homeAdvantageFactor: 1.12,
        formDecayRate: 0.85,
        autoSyncDaily: true,
      },
      fixture.homeTeam,
      fixture.awayTeam
    );
    return {
      ...fixture,
      odds,
      prediction,
      markets,
      bestValueMarket,
      homeStats,
      awayStats,
      measurements: prediction.measurements,
    };
  }, [fixture]);

  if (!fixture || !safeFixture) return null;

  return <MatchDetailModalContent fixture={safeFixture} onClose={onClose} />;
};

const MatchDetailModalContent: React.FC<{ fixture: Fixture; onClose: () => void }> = ({
  fixture,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('OVERVIEW');
  const [statFilterGroup, setStatFilterGroup] = useState<StatCategoryGroup>('ALL');



  const [enrichedFixture, setEnrichedFixture] = useState<Fixture>(fixture);
  const [isParsing, setIsParsing] = useState<boolean>(false);

  useEffect(() => {
    async function parseOnDemand() {
      if (fixture.id && !fixture.statistics) {
        setIsParsing(true);
        const parsed = await OnDemandParser.getParsedMatch(fixture.id);
        if (parsed) {
          setEnrichedFixture(prev => ({
             ...prev,
             statistics: parsed.statistics || [],
             score: (parsed.homeScore !== undefined && parsed.awayScore !== undefined)
               ? { home: parsed.homeScore, away: parsed.awayScore }
               : undefined,
          }));
        }
        setIsParsing(false);
      }
    }
    parseOnDemand();
    setEnrichedFixture(fixture);
  }, [fixture]);

  const currentFixture = enrichedFixture;
  const pred = currentFixture.prediction!;
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

  // Real Scraped Head to Head synchronization
  const initialH2H = pred.measurements?.h2h && pred.measurements.h2h.homeRecentMatches && pred.measurements.h2h.homeRecentMatches.length > 0
    ? pred.measurements.h2h
    : null;
  const [scrapedH2H, setScrapedH2H] = useState<HeadToHeadMeasurement | null>(initialH2H);
  const [isLoadingH2H, setIsLoadingH2H] = useState<boolean>(!initialH2H);

  useEffect(() => {
    const h2h = pred.measurements?.h2h && pred.measurements.h2h.homeRecentMatches && pred.measurements.h2h.homeRecentMatches.length > 0 ? pred.measurements.h2h : null;
    if (h2h) {
      setScrapedH2H(h2h);
      setIsLoadingH2H(false);
    }
  }, [pred]);

  useEffect(() => {
    let isCancelled = false;
    async function loadRealH2H() {
      if (initialH2H && initialH2H.homeRecentMatches && initialH2H.homeRecentMatches.length > 0) {
        setIsLoadingH2H(false);
        return;
      }

      try {
        setIsLoadingH2H(true);
        // Direct H2H call to fetch scraped H2H and team form records
        const data = await EngineService.getMatchHeadToHead(fixture.id, fixture.homeTeam, fixture.awayTeam);
        if (!isCancelled) {
          if (data) {
            setScrapedH2H(data);
            setEnrichedFixture((prev) => ({
              ...prev,
              measurements: {
                ...prev.measurements,
                h2h: data,
              },
              h2hMatches: data.recentH2H,
            }));
          }
          setIsLoadingH2H(false);
        } else {
          const detail = await EngineService.getMatchDetail(fixture.id);
          if (!isCancelled && detail) {
            setEnrichedFixture(detail);
            if (detail.prediction?.measurements?.h2h) {
              setScrapedH2H(detail.prediction.measurements.h2h);
            }
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

  // Derived real recent matches parsed strictly from Flashscore scraper endpoint response
  const homeRecentMatchesList = useMemo(() => {
    if (scrapedH2H?.homeRecentMatches && scrapedH2H.homeRecentMatches.length > 0) {
      return scrapedH2H.homeRecentMatches;
    }
    return [];
  }, [scrapedH2H]);

  const awayRecentMatchesList = useMemo(() => {
    if (scrapedH2H?.awayRecentMatches && scrapedH2H.awayRecentMatches.length > 0) {
      return scrapedH2H.awayRecentMatches;
    }
    return [];
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

  const h2h: HeadToHeadMeasurement = scrapedH2H || pred.measurements?.h2h || {
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

  // Dynamically parse real statistics from Flashscore scraper
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

  // Probabilities standardized with strictly 1 decimal place
  const homeWinPct = getProbValue(pred.homeWinProb, 1);
  const drawPct = getProbValue(pred.drawProb, 1);
  const awayWinPct = getProbValue(pred.awayWinProb, 1);

  const topScores = pred.topCorrectScores?.slice(0, 5) || [];

  // Authoritative Pick and Value Bet from unified engine
  const authoritativePick = getAuthoritative1X2Pick(currentFixture);
  const authoritativeValue = getAuthoritativeValueBet(currentFixture);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-4 bg-black/60 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-150 font-sans">
      <div className="bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 rounded-2xl sm:rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl shadow-slate-900/10 dark:shadow-black/70 border border-slate-100 dark:border-slate-800/80">
        
        {/* Modal Top Bar */}
        <div className="bg-white dark:bg-[#0B0F17] px-3 sm:px-6 pt-3 sm:pt-4 pb-2.5 sm:pb-3 border-b border-slate-100 dark:border-slate-800/60 shrink-0">
          <div className="flex items-center justify-between gap-2 sm:gap-3 min-w-0">
            {/* Competition & Timing Metadata */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-nowrap overflow-x-auto no-scrollbar text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate whitespace-nowrap text-[11px] sm:text-xs">
                {fixture.stage || fixture.leagueName}
              </span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600 shrink-0">·</span>
              <span className="flex items-center gap-1 font-mono text-[10px] sm:text-[11px] whitespace-nowrap shrink-0">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>{fixture.matchDate}</span>
              </span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600 shrink-0">·</span>
              <span className="flex items-center gap-1 font-mono text-[10px] sm:text-[11px] whitespace-nowrap shrink-0">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>{fixture.kickOffTime}</span>
              </span>
              {fixture.status === 'LIVE' && (
                <>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600 shrink-0">·</span>
                  <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1 text-[10px] sm:text-[11px] whitespace-nowrap shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    Live In Play
                  </span>
                </>
              )}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 sm:p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer shrink-0 shadow-2xs"
              aria-label="Close match details"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Hero Scoreboard Banner */}
          <div className="mt-2 sm:mt-3 p-2.5 sm:p-5 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/40 min-w-0">
            <div className="grid grid-cols-12 items-center gap-1 sm:gap-4">
              
              {/* Home Team */}
              <div className="col-span-5 flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-nowrap">
                {fixture.homeBadge ? (
                  <img
                    src={fixture.homeBadge}
                    alt=""
                    className="w-7 h-7 sm:w-10 sm:h-10 object-contain shrink-0 rounded-full"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-950/80 text-slate-700 dark:text-slate-400 font-black text-xs sm:text-sm flex items-center justify-center shrink-0">
                    {fixture.homeTeam.slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-xs sm:text-base font-extrabold text-slate-900 dark:text-white truncate block" title={fixture.homeTeam}>
                    {fixture.homeTeam}
                  </span>
                  <div className="flex items-center gap-1 mt-0.5 flex-nowrap">
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-50 dark:bg-slate-950/80 text-slate-700 dark:text-slate-400 font-mono text-[9px] sm:text-[10px] font-bold whitespace-nowrap shrink-0">
                      {homeWinPct}% Win
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono hidden md:inline whitespace-nowrap shrink-0">
                      xG {pred.homeXG}
                    </span>
                  </div>
                </div>
              </div>

              {/* Center Match Status or Score */}
              <div className="col-span-2 flex flex-col items-center justify-center text-center shrink-0 px-0.5">
                {fixture.score && fixture.score.home !== undefined ? (
                  <div>
                    <span className="text-base sm:text-2xl font-mono font-black text-slate-900 dark:text-white tracking-tight whitespace-nowrap">
                      {fixture.score.home} : {fixture.score.away}
                    </span>
                    <span className="block text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mt-0.5 whitespace-nowrap">
                      {fixture.status === 'LIVE' ? (fixture.minute ? `${fixture.minute}'` : 'Live') : 'Full Time'}
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg bg-white dark:bg-[#070A0F] text-slate-400 dark:text-slate-500 shadow-2xs whitespace-nowrap">
                      VS
                    </span>
                    <span className="block text-[9px] sm:text-[10px] font-mono text-slate-400 mt-0.5 whitespace-nowrap">
                      {fixture.kickOffTime}
                    </span>
                  </div>
                )}
              </div>

              {/* Away Team */}
              <div className="col-span-5 flex items-center justify-end gap-1.5 sm:gap-2.5 min-w-0 text-right flex-nowrap">
                <div className="min-w-0 flex-1">
                  <span className="text-xs sm:text-base font-extrabold text-slate-900 dark:text-white truncate block" title={fixture.awayTeam}>
                    {fixture.awayTeam}
                  </span>
                  <div className="flex items-center justify-end gap-1 mt-0.5 flex-nowrap">
                    <span className="text-[10px] text-slate-400 font-mono hidden md:inline whitespace-nowrap shrink-0">
                      xG {pred.awayXG}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-400 font-mono text-[9px] sm:text-[10px] font-bold whitespace-nowrap shrink-0">
                      {awayWinPct}% Win
                    </span>
                  </div>
                </div>
                {fixture.awayBadge ? (
                  <img
                    src={fixture.awayBadge}
                    alt=""
                    className="w-7 h-7 sm:w-10 sm:h-10 object-contain shrink-0 rounded-full"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-400 font-black text-xs sm:text-sm flex items-center justify-center shrink-0">
                    {fixture.awayTeam.slice(0, 1)}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Segmented Sub-Navigation Bar */}
          <div className="mt-2 sm:mt-3 w-full flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900/80 rounded-xl sm:rounded-2xl overflow-x-auto no-scrollbar flex-nowrap shrink-0 touch-pan-x">
            <button
              type="button"
              onClick={() => setActiveTab('OVERVIEW')}
              className={`flex-1 min-w-[64px] sm:min-w-0 px-2 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 sm:shrink flex items-center justify-center ${
                activeTab === 'OVERVIEW'
                  ? 'bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('H2H')}
              className={`flex-1 min-w-[54px] sm:min-w-0 px-2 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 sm:shrink flex items-center justify-center gap-1.5 ${
                activeTab === 'H2H'
                  ? 'bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>H2H</span>
              {h2h.matchesCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-950/80 text-slate-700 dark:text-slate-400 font-mono font-bold">
                  {h2h.matchesCount}
                </span>
              )}
            </button>

            {parsedStatsSummary.items.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('STATS')}
                className={`flex-1 min-w-[70px] sm:min-w-0 px-2 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 sm:shrink flex items-center justify-center gap-1.5 ${
                  activeTab === 'STATS'
                    ? 'bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <span>Statistics</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-400 font-mono font-bold">
                  {parsedStatsSummary.items.length}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('TEAMS')}
              className={`flex-1 min-w-[72px] sm:min-w-0 px-2 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 sm:shrink flex items-center justify-center ${
                activeTab === 'TEAMS'
                  ? 'bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>Team Form</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('STANDINGS')}
              className={`flex-1 min-w-[72px] sm:min-w-0 px-2 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 sm:shrink flex items-center justify-center ${
                activeTab === 'STANDINGS'
                  ? 'bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>Standings</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('PREDICTIONS')}
              className={`flex-1 min-w-[80px] sm:min-w-0 px-2 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 sm:shrink flex items-center justify-center ${
                activeTab === 'PREDICTIONS'
                  ? 'bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>Predictions</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-3 sm:p-6 overflow-y-auto overscroll-contain space-y-3.5 sm:space-y-5 flex-1 min-w-0">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Win Probability Proportional Gauge & Cards */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Outcome Probabilities
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    Dixon-Coles Model
                  </span>
                </div>

                {/* 3-Section Proportional Bar */}
                <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full flex overflow-hidden">
                  <div style={{ width: `${homeWinPct}%` }} className="bg-slate-500 transition-all duration-300" />
                  <div style={{ width: `${drawPct}%` }} className="bg-amber-500 transition-all duration-300" />
                  <div style={{ width: `${awayWinPct}%` }} className="bg-cyan-500 transition-all duration-300" />
                </div>

                {/* 3 Metric Cards */}
                <div className="grid grid-cols-3 gap-1 pt-1 font-mono">
                  <div className="p-1.5 rounded-lg bg-white dark:bg-[#070A0F] text-center shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate font-sans">
                      {fixture.homeTeam} Win
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-slate-600 dark:text-slate-400 block mt-0.5">
                      {homeWinPct}%
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Odds {fixture.odds.homeWin.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-1.5 rounded-lg bg-white dark:bg-[#070A0F] text-center shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">
                      Draw
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-amber-600 dark:text-amber-400 block mt-0.5">
                      {drawPct}%
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Odds {fixture.odds.draw.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-1.5 rounded-lg bg-white dark:bg-[#070A0F] text-center shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate font-sans">
                      {fixture.awayTeam} Win
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-cyan-600 dark:text-cyan-400 block mt-0.5">
                      {awayWinPct}%
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Odds {fixture.odds.awayWin.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Projections List (Draw, Over under, BTTS, Model Pick, Value Bet) */}
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 space-y-1.5 text-xs font-mono">
                  <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-sans">Draw Probability</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">{drawPct.toFixed(1)}%</span>
                  </div>
                  <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-sans">Over 2.5 Goals</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{formatProb(pred.over25Prob, 1)}</span>
                  </div>
                  <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-sans">BTTS (Both Teams Score)</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{formatProb(pred.bttsProb, 1)}</span>
                  </div>
                  <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-sans font-medium">Model Pick (Highest Prob)</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-sans">
                      {authoritativePick.label} ({authoritativePick.probabilityFormatted})
                    </span>
                  </div>
                  {authoritativeValue.hasValue ? (
                    <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-500/20 shadow-xs flex items-center justify-between">
                      <span className="text-emerald-700 dark:text-emerald-400 font-sans font-semibold">Value Bet (+EV)</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400 font-sans">
                        {authoritativeValue.selection} ({authoritativeValue.evFormatted} @ {authoritativeValue.odds.toFixed(2)})
                      </span>
                    </div>
                  ) : (
                    <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-sans">Value Bet (+EV)</span>
                      <span className="font-medium text-slate-400 font-sans">
                        No Edge in Market
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Key Market Projections List */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 space-y-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block font-sans">
                  Key Projections
                </span>
                <div className="space-y-1.5 font-mono">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300 font-sans">Expected Goals</span>
                    <div className="font-bold text-slate-900 dark:text-white">
                      <span className="text-slate-600 dark:text-slate-400">{pred.homeXG}</span>
                      <span className="text-slate-400 px-1 font-normal">vs</span>
                      <span className="text-cyan-600 dark:text-cyan-400">{pred.awayXG}</span>
                    </div>
                  </div>

                  {pred.teamStrength ? (
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300 font-sans">Team Strength</span>
                      <div className="font-bold text-slate-900 dark:text-white">
                        <span className="text-slate-600 dark:text-slate-400">{pred.teamStrength.homeStrengthRating}</span>
                        <span className="text-slate-400 px-1 font-normal">vs</span>
                        <span className="text-cyan-600 dark:text-cyan-400">{pred.teamStrength.awayStrengthRating}</span>
                      </div>
                    </div>
                  ) : pred.eloRatings ? (
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300 font-sans">Elo Ratings</span>
                      <div className="font-bold text-slate-900 dark:text-white">
                        <span className="text-slate-600 dark:text-slate-400">{pred.eloRatings.homeElo}</span>
                        <span className="text-slate-400 px-1 font-normal">vs</span>
                        <span className="text-cyan-600 dark:text-cyan-400">{pred.eloRatings.awayElo}</span>
                      </div>
                    </div>
                  ) : null}

                  {pred.tacticalContext && (
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300 font-sans">Rest Days</span>
                      <div className="font-bold text-slate-900 dark:text-white">
                        <span className="text-slate-600 dark:text-slate-400">{pred.tacticalContext.restDaysHome}d</span>
                        <span className="text-slate-400 px-1 font-normal">vs</span>
                        <span className="text-cyan-600 dark:text-cyan-400">{pred.tacticalContext.restDaysAway}d</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HEAD TO HEAD */}
          {activeTab === 'H2H' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Summary Metrics */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 space-y-3.5">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Head to Head Record
                  </span>
                </div>

                {/* 3 Outcome Summary Cards */}
                {isLoadingH2H ? (
                  <div className="grid grid-cols-3 gap-1 text-center font-mono">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="p-2 rounded-lg bg-white dark:bg-[#070A0F] shadow-xs animate-pulse">
                        <div className="h-2.5 w-14 mx-auto bg-slate-200 dark:bg-slate-800 rounded" />
                        <div className="h-4 w-6 mx-auto bg-slate-200 dark:bg-slate-800 rounded mt-1.5" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1 text-center font-mono">
                    <div className="p-2 rounded-lg bg-white dark:bg-[#070A0F] shadow-xs">
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 block truncate font-sans w-full">
                        {fixture.homeTeam} Wins
                      </span>
                      <span className="text-xs sm:text-sm font-black text-slate-600 dark:text-slate-400 block mt-0.5">
                        {h2h.homeWins}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-white dark:bg-[#070A0F] shadow-xs">
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 block truncate font-sans w-full">
                        Draws
                      </span>
                      <span className="text-xs sm:text-sm font-black text-amber-600 dark:text-amber-400 block mt-0.5">
                        {h2h.draws}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-white dark:bg-[#070A0F] shadow-xs">
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 block truncate font-sans w-full">
                        {fixture.awayTeam} Wins
                      </span>
                      <span className="text-xs sm:text-sm font-black text-cyan-600 dark:text-cyan-400 block mt-0.5">
                        {h2h.awayWins}
                      </span>
                    </div>
                  </div>
                )}

                {/* Key Insights (Averages & Multipliers) */}
                {isLoadingH2H ? (
                  <div className="space-y-1.5 text-xs font-mono pt-1">
                    {[0, 1].map((i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between animate-pulse">
                        <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
                        <div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5 text-xs font-mono pt-1">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 text-[11px] font-sans">
                        Goals Per Match
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {h2h.homeGoalsAvg} vs {h2h.awayGoalsAvg}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 text-[11px] font-sans">
                        H2H Factor
                      </span>
                      <span className="font-bold text-slate-600 dark:text-slate-400">
                        x{h2h.h2hMultiplierHome} vs x{h2h.h2hMultiplierAway}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Historical Match Encounters List */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 space-y-2.5">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Past Encounters
                </span>

                {isLoadingH2H ? (
                  <div className="py-8 min-h-[140px] text-center text-xs text-slate-500 font-mono flex flex-col items-center justify-center gap-2">
                    <div className="w-5 h-5 rounded-full border-2 border-slate-500 border-t-transparent animate-spin shrink-0" />
                    <span>Loading records...</span>
                  </div>
                ) : h2h.recentH2H && h2h.recentH2H.length > 0 ? (
                  <div className="space-y-1.5">
                    {h2h.recentH2H.map((enc, idx) => (
                      <div
                        key={idx}
                        className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between gap-2 text-xs font-mono min-w-0"
                      >
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 pr-1">
                          <span className="text-[10px] text-slate-400 shrink-0 font-sans">
                            {enc.date}
                          </span>
                          {enc.competition && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[80px] sm:max-w-[120px] hidden sm:inline">
                              {enc.competition}
                            </span>
                          )}
                          <span className="font-semibold text-slate-900 dark:text-white truncate">
                            {enc.homeTeam} vs {enc.awayTeam}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-1.5 sm:px-2 py-0.5 rounded-lg text-xs font-black ${
                              enc.winner === 'HOME'
                                ? 'bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400'
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
                  <div className="py-8 text-center text-xs text-slate-400 font-mono">
                    No previous encounters recorded
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: STATISTICS */}
          {activeTab === 'STATS' && parsedStatsSummary.items.length > 0 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Possession Comparative Gauge */}
              {parsedStatsSummary.possession && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-600 dark:text-slate-400 text-sm">
                      {parsedStatsSummary.possession.home}%
                    </span>
                    <span className="font-sans text-xs font-bold text-slate-700 dark:text-slate-300">
                      Ball Possession
                    </span>
                    <span className="font-bold text-cyan-600 dark:text-cyan-400 text-sm">
                      {parsedStatsSummary.possession.away}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full flex overflow-hidden">
                    <div
                      style={{ width: `${parsedStatsSummary.possession.home}%` }}
                      className="bg-slate-500 transition-all duration-300"
                    />
                    <div
                      style={{ width: `${parsedStatsSummary.possession.away}%` }}
                      className="bg-cyan-500 transition-all duration-300"
                    />
                  </div>
                </div>
              )}

              {/* Dynamic Group Filter */}
              {parsedStatsSummary.availableGroups.length > 1 && (
                <div className="w-full flex items-center bg-slate-100 dark:bg-slate-900/80 p-1 rounded-2xl overflow-x-auto no-scrollbar gap-1 flex-nowrap shrink-0">
                  {parsedStatsSummary.availableGroups.map((g) => (
                    <button
                      key={g.group}
                      type="button"
                      onClick={() => setStatFilterGroup(g.group)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
                        statFilterGroup === g.group
                          ? 'bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <span>{g.label}</span>
                      <span className="text-[10px] opacity-75 font-mono">({g.count})</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Parsed Metric Items */}
              <div className="space-y-1.5">
                {filteredStatItems.map((stat, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span
                        className={`font-bold w-14 text-left ${
                          stat.leader === 'HOME'
                            ? 'text-slate-600 dark:text-slate-400 font-extrabold'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {stat.home.raw}
                      </span>
                      <span className="text-slate-700 dark:text-slate-300 font-sans font-semibold text-center flex-1 truncate px-2 text-xs">
                        {stat.category}
                      </span>
                      <span
                        className={`font-bold w-14 text-right ${
                          stat.leader === 'AWAY'
                            ? 'text-cyan-600 dark:text-cyan-400 font-extrabold'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {stat.away.raw}
                      </span>
                    </div>

                    {/* Comparative Visual Share Bar */}
                    <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full flex overflow-hidden">
                      <div
                        style={{ width: `${stat.homeSharePercent}%` }}
                        className={`transition-all duration-300 ${
                          stat.isInverseMetric ? 'bg-rose-500' : 'bg-slate-500'
                        }`}
                      />
                      <div
                        style={{ width: `${stat.awaySharePercent}%` }}
                        className={`transition-all duration-300 ${
                          stat.isInverseMetric ? 'bg-amber-500' : 'bg-cyan-500'
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Match Venue & Details if provided */}
              {(fixture.stage || (fixture.information && fixture.information.length > 0)) && (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 space-y-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Venue Details
                  </span>
                  <div className="space-y-1.5 text-xs font-mono">
                    {fixture.information?.map((info, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between gap-3"
                      >
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">{info.category}</span>
                        <span className="font-bold text-slate-900 dark:text-white truncate text-right">{info.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: TEAMS & FORM */}
          {activeTab === 'TEAMS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 animate-in fade-in duration-150">
              
              {/* Home Team Analysis */}
              <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-900/60 space-y-3 sm:space-y-3.5 min-w-0 overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate block">
                      {fixture.homeTeam}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      Home Form & Statistics
                    </span>
                  </div>
                  <span className="text-xs px-2 sm:px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-950/80 text-slate-700 dark:text-slate-400 font-mono font-bold shrink-0">
                    x{pred.homeFormMultiplier} Form
                  </span>
                </div>

                {/* Recent Form Sequence Badges */}
                {homeRecentFormList.length > 0 ? (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">Form Guide</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono font-bold">
                        Last {Math.min(10, homeRecentFormList.length)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 font-mono">
                      {homeRecentFormList.slice(0, 10).map((r, i) => (
                        <span
                          key={i}
                          className={`w-6 h-6 rounded-md sm:rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center text-white shrink-0 shadow-2xs ${
                            r === 'W'
                              ? 'bg-slate-500'
                              : r === 'D'
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : isLoadingH2H ? (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">Form Guide</span>
                      <span className="text-[10px] text-slate-400 font-mono">Loading</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 font-mono">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span key={i} className="w-6 h-6 rounded-md sm:rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse shrink-0" />
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Ratings & Averages */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">Attack Rating</span>
                    <span className="text-sm sm:text-base font-extrabold text-slate-600 dark:text-slate-400 block mt-0.5">
                      {pred.homeAttackStrength}
                    </span>
                  </div>
                  <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">Defense Rating</span>
                    <span className="text-sm sm:text-base font-extrabold text-slate-600 dark:text-slate-400 block mt-0.5">
                      {pred.homeDefenseStrength}
                    </span>
                  </div>
                </div>

                {(homeRecentMatchesList.length > 0 || homeStats) && (
                  <div className="space-y-1.5 font-mono text-xs">
                    <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-sans">Total Goals</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {homeGoalsScored} scored - {homeGoalsConceded} conceded
                      </span>
                    </div>
                    <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-sans">Average Goals</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {homeRecentMatchesList.length > 0
                          ? `${(homeGoalsScored / homeRecentMatchesList.length).toFixed(2)} - ${(homeGoalsConceded / homeRecentMatchesList.length).toFixed(2)} per match`
                          : `${homeStats?.avgGoalsScored ?? 0} - ${homeStats?.avgGoalsConceded ?? 0} per match`}
                      </span>
                    </div>
                  </div>
                )}

                {homeRecentMatchesList.length > 0 ? (
                  <div className="space-y-2 pt-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-sans">
                        Recent Matches
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono font-bold">
                        Last {Math.min(10, homeRecentMatchesList.length)}
                      </span>
                    </div>
                    <div className="space-y-1.5 font-mono">
                      {homeRecentMatchesList.slice(0, 10).map((m, idx) => (
                        <div
                          key={idx}
                          className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between gap-2 text-xs min-w-0"
                        >
                          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 pr-1">
                            <span
                              className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                                m.isHome
                                  ? 'bg-slate-100 dark:bg-slate-950/80 text-slate-700 dark:text-slate-400'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                              title={m.isHome ? 'Home' : 'Away'}
                            >
                              {m.isHome ? 'H' : 'A'}
                            </span>
                            <div className="min-w-0 flex-1 flex flex-col">
                              <span className="font-semibold text-slate-900 dark:text-white truncate text-xs">
                                vs {m.opponent}
                              </span>
                              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-sans truncate">
                                <span className="shrink-0">{m.date}</span>
                                {m.competition && (
                                  <>
                                    <span className="text-slate-300 dark:text-slate-700 shrink-0">•</span>
                                    <span className="truncate max-w-[85px] sm:max-w-[130px] text-slate-500 dark:text-slate-400">{m.competition}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                            <span className="font-bold text-slate-900 dark:text-white text-xs whitespace-nowrap">
                              {m.goalsFor} - {m.goalsAgainst}
                            </span>
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black text-white shrink-0 ${
                                m.result === 'W'
                                  ? 'bg-slate-500'
                                  : m.result === 'D'
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                            >
                              {m.result}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : isLoadingH2H ? (
                  <div className="py-6 min-h-[160px] text-center text-xs text-slate-500 font-mono flex flex-col items-center justify-center gap-2">
                    <div className="w-5 h-5 rounded-full border-2 border-slate-500 border-t-transparent animate-spin shrink-0" />
                    <span>Loading recent matches...</span>
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-400 font-mono">
                    No recent matches recorded
                  </div>
                )}
              </div>

              {/* Away Team Analysis */}
              <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-900/60 space-y-3 sm:space-y-3.5 min-w-0 overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate block">
                      {fixture.awayTeam}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      Away Form & Statistics
                    </span>
                  </div>
                  <span className="text-xs px-2 sm:px-2.5 py-1 rounded-xl bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-400 font-mono font-bold shrink-0">
                    x{pred.awayFormMultiplier} Form
                  </span>
                </div>

                {/* Recent Form Sequence Badges */}
                {awayRecentFormList.length > 0 ? (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">Form Guide</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono font-bold">
                        Last {Math.min(10, awayRecentFormList.length)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 font-mono">
                      {awayRecentFormList.slice(0, 10).map((r, i) => (
                        <span
                          key={i}
                          className={`w-6 h-6 rounded-md sm:rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center text-white shrink-0 shadow-2xs ${
                            r === 'W'
                              ? 'bg-slate-500'
                              : r === 'D'
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : isLoadingH2H ? (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">Form Guide</span>
                      <span className="text-[10px] text-slate-400 font-mono">Loading</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 font-mono">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span key={i} className="w-6 h-6 rounded-md sm:rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse shrink-0" />
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Ratings & Averages */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">Attack Rating</span>
                    <span className="text-sm sm:text-base font-extrabold text-cyan-600 dark:text-cyan-400 block mt-0.5">
                      {pred.awayAttackStrength}
                    </span>
                  </div>
                  <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">Defense Rating</span>
                    <span className="text-sm sm:text-base font-extrabold text-cyan-600 dark:text-cyan-400 block mt-0.5">
                      {pred.awayDefenseStrength}
                    </span>
                  </div>
                </div>

                {(awayRecentMatchesList.length > 0 || awayStats) && (
                  <div className="space-y-1.5 font-mono text-xs">
                    <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-sans">Total Goals</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {awayGoalsScored} scored - {awayGoalsConceded} conceded
                      </span>
                    </div>
                    <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-sans">Average Goals</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {awayRecentMatchesList.length > 0
                          ? `${(awayGoalsScored / awayRecentMatchesList.length).toFixed(2)} - ${(awayGoalsConceded / awayRecentMatchesList.length).toFixed(2)} per match`
                          : `${awayStats?.avgGoalsScored ?? 0} - ${awayStats?.avgGoalsConceded ?? 0} per match`}
                      </span>
                    </div>
                  </div>
                )}

                {awayRecentMatchesList.length > 0 && (
                  <div className="space-y-2 pt-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-sans">
                        Recent Matches
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono font-bold">
                        Last {Math.min(10, awayRecentMatchesList.length)}
                      </span>
                    </div>
                    <div className="space-y-1.5 font-mono">
                      {awayRecentMatchesList.slice(0, 10).map((m, idx) => (
                        <div
                          key={idx}
                          className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between gap-2 text-xs min-w-0"
                        >
                          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 pr-1">
                            <span
                              className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                                m.isHome
                                  ? 'bg-slate-100 dark:bg-slate-950/80 text-slate-700 dark:text-slate-400'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                              title={m.isHome ? 'Home' : 'Away'}
                            >
                              {m.isHome ? 'H' : 'A'}
                            </span>
                            <div className="min-w-0 flex-1 flex flex-col">
                              <span className="font-semibold text-slate-900 dark:text-white truncate text-xs">
                                vs {m.opponent}
                              </span>
                              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-sans truncate">
                                <span>{m.date}</span>
                                {m.competition && (
                                  <>
                                    <span className="text-slate-300 dark:text-slate-700 shrink-0">•</span>
                                    <span className="truncate max-w-[85px] sm:max-w-[130px] text-slate-500 dark:text-slate-400">{m.competition}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                            <span className="font-bold text-slate-900 dark:text-white text-xs whitespace-nowrap">
                              {m.goalsFor} - {m.goalsAgainst}
                            </span>
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black text-white shrink-0 ${
                                m.result === 'W'
                                  ? 'bg-slate-500'
                                  : m.result === 'D'
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
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
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 space-y-3">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block font-sans">
                  Market Predictions
                </span>
                {bestMarketsPerGroup && bestMarketsPerGroup.length > 0 ? (
                  <div className="space-y-2">
                    {bestMarketsPerGroup.map((market, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-white dark:bg-[#070A0F] shadow-xs flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-300 font-sans font-bold">{market.groupName}</span>
                        <div className="text-right">
                          <span className="font-bold text-slate-900 dark:text-white block">{market.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono block">{(market.probability * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 font-mono">
                    No market predictions available
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: STANDINGS */}
          {activeTab === 'STANDINGS' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <LeagueStandings
                initialLeague={fixture.league}
                highlightTeams={{ homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam }}
                compact
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
