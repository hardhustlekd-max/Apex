import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import {
  Fixture,
  EngineSettings,
  ProviderStatus,
  AccumulatorSlip,
  HistoricalMatch,
  MarketOption,
  TrendingTipsData,
  HeadToHeadMeasurement,
  TeamFormMatch,
  LeagueStandingTable,
} from '../core/types.js';
import { ApexEngine } from '../core/poisson.js';
import { AccumulatorGenerator, AccaGenerationParams, isMatchStarted } from '../core/accumulator.js';
import { FootballDataCSVParser } from '../core/csvParser.js';
import { getRelativeDateStr } from '../core/seedData.js';
import { LiveScore } from '../providers/types.js';
import { GLOBAL_LEAGUES_DATASET } from '../core/globalLeaguesDataset.js';
import { getLeaguePriority } from '../core/leaguePriority.js';
import { GeminiSearchService } from './geminiSearchService.js';
import { loggerService, TerminalLogEntry } from './loggerService.js';

// Default In-Memory Engine State for Universal & Client-Side execution (Vercel, Static, etc.)
let localSettings: EngineSettings = {
  activeProvider: 'FLASHSCORE',
  rollingMatchWindow: 15,
  minEVThreshold: 1.10,
  safeWinThreshold: 0.72,
  homeAdvantageFactor: 1.12,
  formDecayRate: 0.85,
  autoSyncDaily: true,
};



const PROVIDER_METADATA: ProviderStatus[] = [
  {
    id: 'FLASHSCORE',
    name: 'Flashscore Live Scraper',
    type: 'SCRAPER',
    status: 'ONLINE',
    description: 'Direct FlashscoreScraping engine extracting live match results, in-play statistics, worldwide fixtures, and results directly from Flashscore.',
    latencyMs: 14,
    features: ['Direct Flashscore Feed Scraper', 'Real-Time In-Play Scores', '50+ Worldwide Leagues & Cups', 'Live Statistics & Results', 'Instant SQLite Sync'],
  },
];

export class EngineService {
  /**
   * Helper to check if a backend response is valid JSON
   */
  private static async safeJsonFetch(url: string, options?: RequestInit): Promise<any> {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const errObj = new Error(`HTTP ${res.status} ${res.statusText} for ${url} - ${errText}`);
        loggerService.addLog({
          level: 'ERROR',
          category: 'DATA_FETCH',
          source: 'EngineService',
          message: `Data fetch HTTP error ${res.status} on ${url}`,
          details: { url, status: res.status, statusText: res.statusText, response: errText, stack: errObj.stack },
        });
        return null;
      }
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await res.json();
      }
      return null;
    } catch (err: any) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATA_FETCH',
        source: 'EngineService',
        message: `Network fetch error on ${url}: ${errObj.message}`,
        details: { url, error: errObj.message, stack: errObj.stack },
      });
      return null;
    }
  }

  /**
   * Fetches fixtures - queries /api/fixtures, and transparently falls back to in-memory Poisson calculations if deployed statically (e.g. Vercel)
   */
  public static async getFixtures(
    league = 'ALL',
    dateFilter?: string,
    customStartDate?: string,
    customEndDate?: string
  ): Promise<Fixture[]> {
    const params = new URLSearchParams();
    if (league !== 'ALL') params.set('league', league);
    if (dateFilter && dateFilter !== 'ALL') params.set('dateFilter', dateFilter);
    if (customStartDate) params.set('startDate', customStartDate);
    if (customEndDate) params.set('endDate', customEndDate);

    const query = params.toString();
    const url = query ? `/api/fixtures?${query}` : '/api/fixtures';
    const serverData = await this.safeJsonFetch(url);

    if (serverData && serverData.success && Array.isArray(serverData.fixtures)) {
      return serverData.fixtures;
    }

    throw new Error(serverData?.error || 'Failed to fetch fixtures from server');
  }



  /**
   * Fetches engine settings
   */
  public static async getSettings(): Promise<EngineSettings> {
    const serverData = await this.safeJsonFetch('/api/settings');
    if (serverData && serverData.success && serverData.settings) {
      localSettings = serverData.settings;
      return serverData.settings;
    }
    return localSettings;
  }

  /**
   * Updates engine settings
   */
  public static async updateSettings(newSettings: Partial<EngineSettings>): Promise<EngineSettings> {
    const serverData = await this.safeJsonFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings),
    });

    if (serverData && serverData.success && serverData.settings) {
      localSettings = serverData.settings;
      return serverData.settings;
    }

    localSettings = { ...localSettings, ...newSettings };
    return localSettings;
  }

  /**
   * Syncs real Flashscore data into database and stores predictions in separate predictions db
   */
  public static async syncFlashscoreData(): Promise<{
    success: boolean;
    message: string;
    matchesCount?: number;
    upcomingCount?: number;
    predictionsCount?: number;
  }> {
    const res = await this.safeJsonFetch('/api/providers/flashscore/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res && res.success) {
      return res;
    }

    return {
      success: false,
      message: res?.error || 'Failed to sync with Flashscore scraper service',
      matchesCount: 0,
      upcomingCount: 0,
      predictionsCount: 0,
    };
  }

  /**
   * Fetches provider status
   */
  public static async getProviders(): Promise<ProviderStatus[]> {
    const serverData = await this.safeJsonFetch('/api/providers');
    if (serverData && serverData.success && Array.isArray(serverData.providers)) {
      return serverData.providers;
    }

    return PROVIDER_METADATA;
  }

  /**
   * Hot-swaps active provider
   */
  public static async switchProvider(providerId: EngineSettings['activeProvider']): Promise<boolean> {
    const serverData = await this.safeJsonFetch('/api/providers/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId }),
    });

    if (serverData && serverData.success) {
      localSettings.activeProvider = providerId;
      return true;
    }

    localSettings.activeProvider = providerId;
    return true;
  }

  /**
   * Fetches database and league statistics
   */
  public static async getStats(): Promise<{ totalMatches: number; totalTeams: number; leagues: any[] }> {
    const serverData = await this.safeJsonFetch('/api/stats');
    if (serverData && serverData.success && serverData.stats) {
      return serverData.stats;
    }

    return {
      totalMatches: 0,
      totalTeams: 0,
      leagues: [],
    };
  }

  /**
   * Fetches full match detail including real scraped H2H measurements
   */
  public static async getMatchDetail(fixtureId: string): Promise<Fixture | null> {
    const serverData = await this.safeJsonFetch(`/api/fixtures/${fixtureId}`);
    if (serverData && serverData.success && serverData.fixture) {
      return serverData.fixture;
    }
    return null;
  }

  /**
   * Fetches real scraped Head-to-Head (H2H) records for a specific match
   */
  public static async getMatchHeadToHead(
    fixtureId: string,
    homeTeam?: string,
    awayTeam?: string
  ): Promise<HeadToHeadMeasurement | null> {
    const params = new URLSearchParams();
    if (homeTeam) params.set('home', homeTeam);
    if (awayTeam) params.set('away', awayTeam);
    const query = params.toString() ? `?${params.toString()}` : '';

    const serverData = await this.safeJsonFetch(`/api/fixtures/${fixtureId}/h2h${query}`);
    if (serverData && serverData.success && serverData.h2h) {
      return serverData.h2h;
    }

    // Try detail endpoint fallback
    const detailData = await this.safeJsonFetch(`/api/fixtures/${fixtureId}`);
    if (detailData && detailData.success && detailData.fixture?.prediction?.measurements?.h2h) {
      return detailData.fixture.prediction.measurements.h2h;
    }

    return null;
  }

  /**
   * Fetches recent match list for a specific club parsed directly from scraper response
   */
  public static async getClubRecentMatches(
    clubName: string,
    matchId?: string
  ): Promise<TeamFormMatch[]> {
    const query = matchId ? `?matchId=${encodeURIComponent(matchId)}` : '';
    const serverData = await this.safeJsonFetch(`/api/fixtures/club/${encodeURIComponent(clubName)}/recent${query}`);
    if (serverData && serverData.success && Array.isArray(serverData.matches)) {
      return serverData.matches;
    }
    return [];
  }

  /**
   * Fetches live in-play predictions directly from predictions db
   */
  public static async getLivePredictions(league = 'ALL', limit = 100): Promise<Fixture[]> {
    const params = new URLSearchParams();
    if (league !== 'ALL') params.set('league', league);
    params.set('limit', String(limit));

    const serverData = await this.safeJsonFetch(`/api/fixtures/live?${params.toString()}`);
    if (serverData && serverData.success && Array.isArray(serverData.fixtures) && serverData.fixtures.length > 0) {
      return serverData.fixtures;
    }

    return [];
  }

  /**
   * Fetches live in-play scores
   */
  public static async getLiveScores(): Promise<LiveScore[]> {
    const serverData = await this.safeJsonFetch('/api/providers/live-scores');
    if (serverData && serverData.success && Array.isArray(serverData.scores) && serverData.scores.length > 0) {
      return serverData.scores;
    }

    return [];
  }

  /**
   * Fetches historical match predictions directly from predictions db
   */
  public static async getHistoricalMatches(league = 'ALL', limit = 200): Promise<Fixture[]> {
    const params = new URLSearchParams();
    if (league !== 'ALL') params.set('league', league);
    params.set('limit', String(limit));

    const serverData = await this.safeJsonFetch(`/api/fixtures/history?${params.toString()}`);
    if (serverData && serverData.success && Array.isArray(serverData.matches)) {
      return serverData.matches;
    }

    return [];
  }

  /**
   * Fetches real-time log history from terminal logger
   */
  public static async getTerminalLogs(filter?: {
    category?: string;
    level?: string;
    search?: string;
    limit?: number;
  }): Promise<TerminalLogEntry[]> {
    const params = new URLSearchParams();
    if (filter?.category) params.set('category', filter.category);
    if (filter?.level) params.set('level', filter.level);
    if (filter?.search) params.set('search', filter.search);
    if (filter?.limit) params.set('limit', String(filter.limit));

    const serverData = await this.safeJsonFetch(`/api/logs?${params.toString()}`);
    if (serverData && serverData.success && Array.isArray(serverData.logs)) {
      return serverData.logs;
    }
    return loggerService.getLogs(filter as any);
  }

  /**
   * Clears terminal log history
   */
  public static async clearTerminalLogs(): Promise<boolean> {
    const res = await this.safeJsonFetch('/api/logs/clear', { method: 'POST' });
    if (res && res.success) {
      loggerService.clearLogs();
      return true;
    }
    loggerService.clearLogs();
    return true;
  }

  /**
   * Records a terminal log entry
   */
  public static async recordTerminalLog(entry: {
    level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
    category: 'DATA_FETCH' | 'PREDICTION' | 'SCRAPER' | 'ENGINE' | 'DATABASE';
    source: string;
    message: string;
    details?: any;
  }): Promise<void> {
    loggerService.addLog(entry);
    await this.safeJsonFetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  }

  /**
   * Fetches Prebuilt Accumulator Slips generated entirely on the server side
   */
  public static async getPrebuiltAccumulators(
    dateScope = 'TODAY',
    stake = 10,
    fixtures?: Fixture[]
  ): Promise<Record<string, AccumulatorSlip>> {
    const serverData = await this.safeJsonFetch('/api/accumulator/prebuilt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateScope, stake, fixtures }),
    });

    if (serverData && serverData.success && serverData.slips) {
      return serverData.slips;
    }

    // Use provided scraped fixtures - strictly exclude started matches
    const rawFixtures = fixtures && fixtures.length > 0 ? fixtures : [];
    const fixturesToUse = rawFixtures.filter((f) => !isMatchStarted(f));
    const banker = AccumulatorGenerator.generateSlip(
      fixturesToUse,
      {
        strategy: 'BANKER',
        legCount: 3,
        minProbability: 0.68,
        stake,
        dateFilter: dateScope,
        allowedMarkets: ['HOME_WIN', 'AWAY_WIN', 'DOUBLE_CHANCE_1X', 'DOUBLE_CHANCE_X2', 'OVER_15' as any],
      },
      localSettings
    );
    const value = AccumulatorGenerator.generateSlip(
      fixturesToUse,
      {
        strategy: 'VALUE_HUNTER',
        legCount: 4,
        stake,
        dateFilter: dateScope,
        allowedMarkets: ['HOME_WIN', 'AWAY_WIN', 'OVER_25', 'BTTS_YES', 'DRAW'],
      },
      localSettings
    );
    const goals = AccumulatorGenerator.generateSlip(
      fixturesToUse,
      {
        strategy: 'CUSTOM',
        legCount: 4,
        targetOdds: 6.0,
        stake,
        dateFilter: dateScope,
        allowedMarkets: ['OVER_25', 'BTTS_YES'],
      },
      localSettings
    );
    goals.name = dateScope === 'TODAY' ? "Today's High Goals Combo" : 'High Goals & BTTS Acca';

    const mega = AccumulatorGenerator.generateSlip(
      fixturesToUse,
      {
        strategy: 'CUSTOM',
        legCount: 6,
        targetOdds: 20.0,
        stake,
        dateFilter: dateScope,
        allowedMarkets: ['HOME_WIN', 'AWAY_WIN', 'OVER_25', 'BTTS_YES', 'DOUBLE_CHANCE_1X'],
      },
      localSettings
    );
    mega.name = dateScope === 'TODAY' ? "Today's 6-Fold Mega Acca" : 'Weekend Mega Accumulator';

    return {
      BANKER: banker,
      VALUE_HUNTER: value,
      HIGH_GOALS: goals,
      MEGA_COMBO: mega,
    };
  }

  /**
   * Generates Accumulator Slip
   */
  public static async generateAccumulator(params: AccaGenerationParams): Promise<AccumulatorSlip> {
    const serverData = await this.safeJsonFetch('/api/accumulator/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (serverData && serverData.success && serverData.slip) {
      return serverData.slip;
    }

    throw new Error(serverData?.error || 'Failed to generate accumulator slip from server');
  }

  /**
   * Seeds historical CSV dataset (or custom CSV)
   */
  public static async seedDatabase(
    customCsv?: string,
    reset = false
  ): Promise<{ success: boolean; message: string; stats: any }> {
    const serverData = await this.safeJsonFetch('/api/stats/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customCsv, reset }),
    });

    if (serverData && serverData.success) {
      return serverData;
    }

    return {
      success: false,
      message: serverData?.error || 'Database seed failed.',
      stats: await this.getStats(),
    };
  }

  /**
   * Fetches trending football tips & headlines grounded by Google Search
   */
  public static async getTrendingTips(): Promise<TrendingTipsData | null> {
    const serverData = await this.safeJsonFetch('/api/tips');
    if (serverData && serverData.success && serverData.data) {
      return serverData.data;
    }
    return null;
  }

  /**
   * Forces refresh of trending football tips & headlines with Google Search
   */
  public static async refreshTrendingTips(): Promise<TrendingTipsData | null> {
    const serverData = await this.safeJsonFetch('/api/tips/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (serverData && serverData.success && serverData.data) {
      return serverData.data;
    }
    return null;
  }

  /**
   * Retrieves league standing table from server API
   */
  public static async getLeagueStandings(league = 'E0'): Promise<LeagueStandingTable | null> {
    const serverData = await this.safeJsonFetch(`/api/standings/${encodeURIComponent(league)}`);
    if (serverData && serverData.success && serverData.standings) {
      return serverData.standings;
    }
    const fixturesStandings = await this.safeJsonFetch(`/api/fixtures/standings/${encodeURIComponent(league)}`);
    if (fixturesStandings && fixturesStandings.success && fixturesStandings.standings) {
      return fixturesStandings.standings;
    }
    return null;
  }

  /**
   * Builds the single authoritative historical universe combining
   * historical reference matches and Flashscore scraped matches
   */
  public static getUnifiedHistoricalUniverse(): HistoricalMatch[] {
    const rawHist = db.getAllHistoricalMatches(1500);
    const scrapedMatches = db.getFlashscoreScrapedMatches(500);
    const scrapedAsHistorical: HistoricalMatch[] = scrapedMatches
      .filter((sm) => sm.result?.home !== undefined && sm.result?.away !== undefined)
      .map((sm, idx) => {
        const homeScore = parseInt(String(sm.result!.home), 10) || 0;
        const awayScore = parseInt(String(sm.result!.away), 10) || 0;
        const ftr: 'H' | 'D' | 'A' = homeScore > awayScore ? 'H' : homeScore < awayScore ? 'A' : 'D';
        return {
          id: sm.matchId || `scraped_${idx}`,
          div: sm.leagueName || sm.stage || 'FLASHSCORE',
          season: sm.season || '2024/2025',
          leagueName: sm.leagueName || sm.stage || 'FLASHSCORE',
          matchDate: sm.date ? sm.date.slice(0, 10) : '2024-01-01',
          homeTeam: sm.home.name,
          awayTeam: sm.away.name,
          fthg: homeScore,
          ftag: awayScore,
          ftr,
          restDaysHome: 7,
          restDaysAway: 7,
        };
      });
    const universe = [...rawHist, ...scrapedAsHistorical];
    loggerService.addLog({
      level: 'INFO',
      category: 'ENGINE',
      source: 'EngineService',
      message: `Retrieved unified historical universe: ${rawHist.length} historical + ${scrapedAsHistorical.length} scraped matches`,
    });
    return universe;
  }

  /**
   * Unified 5-Pillar Prediction Execution
   * Used identically for Upcoming Fixtures, Historical Matches, Live Fixtures, and Match Detail Modal.
   */
  public static predictFixtureUnified(
    f: Fixture,
    allMatches: HistoricalMatch[],
    settings: EngineSettings,
    cachedH2H?: HeadToHeadMeasurement | null,
    tacticalInput?: any,
    scrapedMap?: Map<string, any>
  ): Fixture {
    const leagueMatches = allMatches.filter((m) => m.div.toUpperCase() === (f.league || '').toUpperCase());
    const historicalContext = leagueMatches.length >= 10 ? leagueMatches : allMatches;

    const { prediction, homeStats, awayStats } = ApexEngine.predictMatch(
      f.homeTeam,
      f.awayTeam,
      historicalContext,
      settings,
      cachedH2H,
      allMatches,
      tacticalInput
    );

    // Ensure valid odds without hardcoded fallbacks
    let odds = f.odds;
    if (!odds || !odds.homeWin || !odds.draw || !odds.awayWin) {
      loggerService.addLog({
        level: 'WARN',
        category: 'PREDICTION',
        source: 'ApexEngine',
        message: `Odds missing for ${f.homeTeam} vs ${f.awayTeam} (ID: ${f.id}). Calculating fair probabilities without hardcoded odds.`,
      });
      odds = {
        homeWin: prediction.homeWinProb > 0 ? Number((1 / prediction.homeWinProb).toFixed(2)) : 2.50,
        draw: prediction.drawProb > 0 ? Number((1 / prediction.drawProb).toFixed(2)) : 3.20,
        awayWin: prediction.awayWinProb > 0 ? Number((1 / prediction.awayWinProb).toFixed(2)) : 2.80,
        over25: prediction.over25Prob > 0 ? Number((1 / prediction.over25Prob).toFixed(2)) : 1.90,
        under25: prediction.over25Prob < 1 ? Number((1 / (1 - prediction.over25Prob)).toFixed(2)) : 1.90,
      };
    }

    const { markets, bestValueMarket } = ApexEngine.calculateMarkets(
      prediction,
      odds,
      settings,
      f.homeTeam,
      f.awayTeam
    );

    const sm = scrapedMap
      ? (scrapedMap.get(f.id) ||
         scrapedMap.get(f.id.replace('fs_', '')) ||
         scrapedMap.get(`${f.homeTeam.toLowerCase()}__${f.awayTeam.toLowerCase()}`))
      : undefined;

    const stage = sm?.stage || f.stage;
    const homeBadge = sm?.home?.image || f.homeBadge;
    const awayBadge = sm?.away?.image || f.awayBadge;
    const information = sm?.information && sm.information.length > 0 ? sm.information : f.information;
    const statistics = sm?.statistics && sm.statistics.length > 0 ? sm.statistics : f.statistics;
    const resultDetails = sm?.result
      ? {
          regulationTime: sm.result.regulationTime,
          penalties: sm.result.penalties,
        }
      : f.resultDetails;

    return {
      ...f,
      stage,
      homeBadge,
      awayBadge,
      information,
      statistics,
      resultDetails,
      odds,
      prediction,
      markets,
      bestValueMarket,
      homeStats,
      awayStats,
      measurements: prediction.measurements,
    };
  }

  /**
   * Runs the Poisson Prediction Engine for a set of upcoming fixtures
   * and stores the resulting predictions in the separate predictions database (predictions.sqlite)
   */
  public static async predictAndStoreUpcomingFixtures(
    upcomingFixtures: Fixture[]
  ): Promise<{ count: number; fixtures: Fixture[] }> {
    const settings: EngineSettings = db.getSettings() || {
      activeProvider: 'FLASHSCORE',
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    // Deduplicate fixtures and filter out past/started fixtures
    const seenIds = new Set<string>();
    const validFixtures = upcomingFixtures.filter((f) => {
      if (!f.id || seenIds.has(f.id) || isMatchStarted(f)) return false;
      seenIds.add(f.id);
      return true;
    });

    const allMatches = this.getUnifiedHistoricalUniverse();
    const scrapedMatches = db.getFlashscoreScrapedMatches(500);

    const scrapedMap = new Map<string, any>();
    for (const sm of scrapedMatches) {
      if (sm.matchId) {
        scrapedMap.set(sm.matchId, sm);
        scrapedMap.set(`fs_${sm.matchId}`, sm);
      }
      if (sm.home?.name && sm.away?.name) {
        scrapedMap.set(`${sm.home.name.toLowerCase()}__${sm.away.name.toLowerCase()}`, sm);
      }
    }

    const cachedH2HMap = db.getAllPredictionMeasurements();

    // Process every fixture through the Unified Poisson prediction engine
    const enrichedFixtures: Fixture[] = await Promise.all(validFixtures.map(async (f) => {
      const cleanId = (f.id || '').replace(/^fs_/, '');
      const cachedH2H =
        cachedH2HMap.get(cleanId) ||
        cachedH2HMap.get(f.id) ||
        (f.prediction?.measurements?.h2h && f.prediction.measurements.h2h.matchesCount > 0
          ? f.prediction.measurements.h2h
          : null);

      const tacticalInput = await GeminiSearchService.getMatchTacticalContext(f.homeTeam, f.awayTeam) || {
        information: f.information,
        restDaysHome: f.restDaysHome,
        restDaysAway: f.restDaysAway,
        stage: f.stage,
      };

      return this.predictFixtureUnified(f, allMatches, settings, cachedH2H, tacticalInput, scrapedMap);
    }));

    // Store in the separate predictions database
    await predictionsDb.init();
    predictionsDb.savePredictions(enrichedFixtures);

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'PREDICTION',
      source: 'ApexEngine',
      message: `Unified 5-Pillar Engine generated predictions for ${enrichedFixtures.length} upcoming fixtures`,
      details: { count: enrichedFixtures.length, universeSize: allMatches.length },
    });

    return {
      count: enrichedFixtures.length,
      fixtures: enrichedFixtures,
    };
  }

  /**
   * Processes live matches through the Poisson Prediction Engine
   * and stores predictions in predictions.sqlite under live_predictions
   */
  public static async predictAndStoreLiveFixtures(
    liveFixtures: Fixture[]
  ): Promise<{ count: number; fixtures: Fixture[] }> {
    const settings: EngineSettings = db.getSettings() || {
      activeProvider: 'FLASHSCORE',
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    const allMatches = this.getUnifiedHistoricalUniverse();
    const cachedH2HMap = db.getAllPredictionMeasurements();

    const enrichedLive: Fixture[] = await Promise.all(liveFixtures.map(async (f) => {
      const cleanId = (f.id || '').replace(/^fs_/, '');
      const cachedH2H =
        cachedH2HMap.get(cleanId) ||
        cachedH2HMap.get(f.id) ||
        (f.prediction?.measurements?.h2h && f.prediction.measurements.h2h.matchesCount > 0
          ? f.prediction.measurements.h2h
          : null);

      const tacticalInput = await GeminiSearchService.getMatchTacticalContext(f.homeTeam, f.awayTeam) || {
        information: f.information,
        restDaysHome: f.restDaysHome,
        restDaysAway: f.restDaysAway,
        stage: f.stage,
      };

      const enriched = this.predictFixtureUnified(f, allMatches, settings, cachedH2H, tacticalInput);
      return {
        ...enriched,
        status: 'LIVE' as const,
      };
    }));

    await predictionsDb.init();
    predictionsDb.saveLivePredictions(enrichedLive);

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'PREDICTION',
      source: 'ApexEngine',
      message: `Unified 5-Pillar Engine updated predictions for ${enrichedLive.length} live matches`,
      details: { count: enrichedLive.length },
    });

    return {
      count: enrichedLive.length,
      fixtures: enrichedLive,
    };
  }

  /**
   * Processes historical matches through the unified 5-pillar Poisson Prediction Engine
   * and stores predictions in predictions.sqlite under historical_predictions
   */
  public static async predictAndStoreHistoricalMatches(
    historicalMatches: any[]
  ): Promise<{ count: number; fixtures: Fixture[] }> {
    const settings: EngineSettings = db.getSettings() || {
      activeProvider: 'FLASHSCORE',
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    const allMatches = this.getUnifiedHistoricalUniverse();
    const cachedH2HMap = db.getAllPredictionMeasurements();

    const enrichedHistory: Fixture[] = historicalMatches.map((m) => {
      const cleanId = String(m.id || '').replace(/^fs_hist_/, '').replace(/^hist_/, '').replace(/^fs_/, '');
      const cachedH2H =
        cachedH2HMap.get(cleanId) ||
        cachedH2HMap.get(m.id);

      const homeTeam = m.homeTeam || m.home?.name || 'Home Club';
      const awayTeam = m.awayTeam || m.away?.name || 'Away Club';

      // Check for real odds from dataset; if missing, do not use hardcoded fallbacks
      let odds = undefined;
      if (m.b365H && m.b365D && m.b365A) {
        odds = {
          homeWin: m.b365H,
          draw: m.b365D,
          awayWin: m.b365A,
          over25: m.b365Over25,
          under25: m.b365Under25,
        };
      }

      const fixtureId = m.id?.startsWith('hist_') ? m.id : `hist_${m.id}`;
      const tempFixture: Fixture = {
        id: fixtureId,
        providerId: 'HISTORICAL',
        league: m.div || 'LEAGUE',
        leagueName: m.leagueName || m.div || 'Historical Match',
        matchDate: m.matchDate || '2024-01-01',
        kickOffTime: 'FT',
        homeTeam,
        awayTeam,
        status: 'FINISHED' as const,
        score: {
          home: m.fthg ?? 0,
          away: m.ftag ?? 0,
        },
        odds,
        restDaysHome: m.restDaysHome || 7,
        restDaysAway: m.restDaysAway || 7,
      };

      return this.predictFixtureUnified(tempFixture, allMatches, settings, cachedH2H);
    });

    await predictionsDb.init();
    predictionsDb.saveHistoricalPredictions(enrichedHistory);

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'PREDICTION',
      source: 'ApexEngine',
      message: `Unified 5-Pillar Engine evaluated ${enrichedHistory.length} historical matches`,
      details: { count: enrichedHistory.length, universeSize: allMatches.length },
    });

    return {
      count: enrichedHistory.length,
      fixtures: enrichedHistory,
    };
  }

}

