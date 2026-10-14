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
import { PoissonEngine } from '../core/poisson.js';
import { AccumulatorGenerator, AccaGenerationParams, isMatchStarted } from '../core/accumulator.js';
import { FootballDataCSVParser } from '../core/csvParser.js';
import { getRelativeDateStr } from '../core/seedData.js';
import { LiveScore } from '../providers/types.js';
import { GLOBAL_LEAGUES_DATASET } from '../core/globalLeaguesDataset.js';
import { getLeaguePriority } from '../core/leaguePriority.js';

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
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await res.json();
      }
      return null;
    } catch {
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
}
