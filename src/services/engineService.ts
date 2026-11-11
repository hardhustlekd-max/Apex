import {
  Fixture,
  EngineSettings,
  ProviderStatus,
  AccumulatorSlip,
  HistoricalMatch,
  TrendingTipsData,
  HeadToHeadMeasurement,
  TeamFormMatch,
  LeagueStandingTable,
} from '../core/types.js';
import { LiveScore } from '../providers/types.js';
import { loggerService, TerminalLogEntry } from './loggerService.js';

let localSettings: EngineSettings = {
  rollingMatchWindow: 15,
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
  private static async safeJsonFetch(url: string, options?: RequestInit): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 75000);
    try {
      const fetchHeaders: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (options?.headers) {
        if (options.headers instanceof Headers) {
          options.headers.forEach((v, k) => { fetchHeaders[k] = v; });
        } else if (Array.isArray(options.headers)) {
          options.headers.forEach(([k, v]) => { fetchHeaders[k] = v; });
        } else {
          Object.assign(fetchHeaders, options.headers);
        }
      }

      const res = await fetch(url, { ...options, headers: fetchHeaders, signal: controller.signal });
      clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type') || '';

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const isHtml = contentType.includes('text/html') || errText.trim().startsWith('<');
        loggerService.addLog({
          level: 'WARN',
          category: 'DATA_FETCH',
          source: 'EngineService',
          message: `Data fetch HTTP ${res.status} on ${url}`,
          details: { url, status: res.status, statusText: res.statusText, response: isHtml ? errText.slice(0, 150) : errText },
        });
        return null;
      }

      const text = await res.text();
      if (!text || text.trim() === '') {
        return null;
      }

      if (contentType.includes('text/html') || text.trim().startsWith('<')) {
        loggerService.addLog({
          level: 'WARN',
          category: 'DATA_FETCH',
          source: 'EngineService',
          message: `Server returned HTML response on ${url} (server booting or route fallback)`,
          details: { url, snippet: text.slice(0, 150) },
        });
        return null;
      }

      try {
        return JSON.parse(text);
      } catch (jsonErr: any) {
        loggerService.addLog({
          level: 'ERROR',
          category: 'DATA_FETCH',
          source: 'EngineService',
          message: `JSON parse error on ${url}: ${jsonErr.message}`,
          details: { url, error: jsonErr.message, snippet: text.slice(0, 200) },
        });
        return null;
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      const errObj = err instanceof Error ? err : new Error(String(err));
      const isAbort = errObj.name === 'AbortError' || errObj.message.toLowerCase().includes('abort');
      if (!isAbort) {
        loggerService.addLog({
          level: 'WARN',
          category: 'DATA_FETCH',
          source: 'EngineService',
          message: `Network fetch retry/fallback on ${url}: ${errObj.message}`,
          details: { url, error: errObj.message },
        });
      }
      return null;
    }
  }

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

    return [];
  }

  public static async getSettings(): Promise<EngineSettings> {
    const serverData = await this.safeJsonFetch('/api/settings');
    if (serverData && serverData.success && serverData.settings) {
      localSettings = serverData.settings;
      return serverData.settings;
    }
    return localSettings;
  }

  public static async getStorageStatus(): Promise<{
    footballDb: {
      configured: boolean;
      status: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED';
      url: string | null;
      latencyMs?: number;
      error?: string;
    };
    predictionsDb: {
      configured: boolean;
      status: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED';
      url: string | null;
      latencyMs?: number;
      error?: string;
    };
    storageEngine?: {
      status: string;
      mode: string;
    };
  } | null> {
    const serverData = await this.safeJsonFetch('/api/settings/storage-status');
    if (serverData && serverData.success) {
      return serverData as any;
    }
    return null;
  }

  public static async getScraperStatus(): Promise<{
    circuit: { state: 'CLOSED' | 'HALF_OPEN' | 'OPEN'; failureCount: number };
    rawFeedsCount: number;
    mirrors: Array<{ name: string; url: string; status: string }>;
  } | null> {
    const serverData = await this.safeJsonFetch('/api/settings/scraper-status');
    if (serverData && serverData.success) {
      return {
        circuit: serverData.circuit || { state: 'CLOSED', failureCount: 0 },
        rawFeedsCount: serverData.rawFeedsCount || 0,
        mirrors: serverData.mirrors || [],
      };
    }
    return null;
  }

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

  public static async updateUpcomingPredictions(onProgress?: (job: any) => void): Promise<{
    success: boolean;
    count?: number;
    skippedCount?: number;
    totalPredictionsCount?: number;
    upcomingCount?: number;
    stats?: any;
    message?: string;
    error?: string;
  }> {
    // Purge browser LocalStorage prediction cache as the first step
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('apex_cached_todays_fixtures');
        localStorage.removeItem('apex_cached_predictions');
        localStorage.removeItem('apex_cached_live_scores');
      }
    } catch (cacheErr) {
      console.warn('[EngineService] Note clearing local browser cache before prediction update:', cacheErr);
    }

    const startRes = await this.safeJsonFetch('/api/settings/update-predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!startRes || !startRes.success || !startRes.jobId) {
      return {
        success: false,
        error: startRes?.error || 'Failed to start prediction update process',
      };
    }

    const jobId = startRes.jobId;
    let pollAttempts = 0;
    const maxPollAttempts = 600; // Up to 8 minutes of polling (800ms * 600)

    while (pollAttempts < maxPollAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      pollAttempts++;

      const job = await this.getSyncJobStatus(jobId);
      
      // If job is not found, the server might have restarted. 
      // Try to see if there's any active job as a fallback before giving up.
      if (!job) {
        const activeJob = await this.getActiveSyncJob();
        if (!activeJob || activeJob.id !== jobId) {
          return {
            success: false,
            error: 'Prediction update job was lost (server may have restarted). Please try again.',
          };
        }
        continue; // Active job found but status call failed briefly
      }

      if (onProgress) {
        onProgress(job);
      }

      if (job.status === 'COMPLETED') {
        return {
          success: true,
          count: job.matchesCount || 0,
          skippedCount: job.skippedCount || 0,
          totalPredictionsCount: job.predictionsCount || 0,
          upcomingCount: job.upcomingCount || 0,
          stats: job.stats,
          message: job.message || `Successfully recalculated predictions for ${job.matchesCount || 0} upcoming matches.`,
        };
      }

      if (job.status === 'FAILED' || job.status === 'CANCELLED') {
        return {
          success: false,
          error: job.error || (job.status === 'CANCELLED' ? 'Prediction recalculation cancelled by user' : 'Prediction update encountered an error'),
        };
      }
    }

    return {
      success: false,
      error: 'Prediction recalculation process timed out while waiting for server response.',
    };
  }


  public static async startSyncJob(options?: {
    resetDatabase?: boolean;
    resetRawFeeds?: boolean;
  }): Promise<{ success: boolean; jobId?: string; job?: any; error?: string }> {
    const res = await this.safeJsonFetch('/api/providers/sync/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetDatabase: options?.resetDatabase ?? true,
        resetRawFeeds: options?.resetRawFeeds ?? true,
      }),
    });
    if (res && res.success && res.jobId) {
      return res;
    }
    return { success: false, error: res?.error || 'Failed to start background sync' };
  }

  public static async getSyncJobStatus(jobId: string): Promise<any | null> {
    const res = await this.safeJsonFetch(`/api/providers/sync/status/${jobId}`);
    return res && res.success ? res.job : null;
  }

  public static async getActiveSyncJob(): Promise<any | null> {
    const res = await this.safeJsonFetch('/api/providers/sync/active');
    return res && res.success ? res.job : null;
  }

  public static async cancelSyncJob(jobId: string): Promise<boolean> {
    const res = await this.safeJsonFetch(`/api/providers/sync/cancel/${jobId}`, { method: 'POST' });
    return !!(res && res.success);
  }

  public static async clearClientStorage(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      const theme = localStorage.getItem('theme');
      localStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      try {
        const dbs = await indexedDB.databases();
        for (const dbInfo of dbs) {
          if (dbInfo.name) {
            indexedDB.deleteDatabase(dbInfo.name);
          }
        }
      } catch {
        // Fallback
      }
    }
  }

  public static async resetAndSyncDatabase(onProgress?: (job: any) => void): Promise<{
    success: boolean;
    message: string;
    matchesCount?: number;
    upcomingCount?: number;
    predictionsCount?: number;
    historicalPredictionsCount?: number;
    livePredictionsCount?: number;
    stats?: any;
  }> {
    // 0. Purge local browser storage & IndexedDB
    await this.clearClientStorage().catch(() => {});

    // 1. Initiate async background sync job
    const startRes = await this.startSyncJob({ resetDatabase: true, resetRawFeeds: true });

    if (!startRes.success || !startRes.jobId) {
      // Fallback: synchronous execution if async job endpoint cannot start
      const fallbackRes = await this.safeJsonFetch('/api/providers/flashscore/reset-and-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (fallbackRes && fallbackRes.success) {
        return fallbackRes;
      }
      return {
        success: false,
        message: fallbackRes?.error || startRes.error || 'Failed to reset and sync database',
      };
    }

    const jobId = startRes.jobId;
    let pollAttempts = 0;
    const maxPollAttempts = 120; // 2 minutes maximum

    while (pollAttempts < maxPollAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      pollAttempts++;

      const job = await this.getSyncJobStatus(jobId);
      if (!job) continue;

      if (onProgress) {
        onProgress(job);
      }

      if (job.status === 'COMPLETED') {
        return {
          success: true,
          message: job.message || 'Database and feeds successfully reset and synchronized',
          matchesCount: job.matchesCount || 0,
          upcomingCount: job.upcomingCount || 0,
          predictionsCount: job.predictionsCount || 0,
          historicalPredictionsCount: job.historicalPredictionsCount || 0,
          livePredictionsCount: job.livePredictionsCount || 0,
          stats: job.stats,
        };
      }

      if (job.status === 'FAILED' || job.status === 'CANCELLED') {
        return {
          success: false,
          message: job.error || (job.status === 'CANCELLED' ? 'Sync cancelled by user' : 'Sync job encountered an error'),
        };
      }
    }

    return {
      success: true,
      message: 'Background synchronization is still continuing in server database.',
    };
  }

  public static async syncFlashscoreData(onProgress?: (job: any) => void): Promise<{
    success: boolean;
    message: string;
    matchesCount?: number;
    upcomingCount?: number;
    predictionsCount?: number;
    historicalPredictionsCount?: number;
    livePredictionsCount?: number;
    stats?: any;
  }> {
    return this.resetAndSyncDatabase(onProgress);
  }

  public static async syncHistoryOnly(): Promise<{
    success: boolean;
    message: string;
    count?: number;
  }> {
    const serverData = await this.safeJsonFetch('/api/providers/flashscore/sync-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (serverData && serverData.success) {
      return serverData;
    }
    return {
      success: false,
      message: serverData?.error || 'Failed to sync historical scraper data',
    };
  }

  public static async getProviders(): Promise<ProviderStatus[]> {
    const serverData = await this.safeJsonFetch('/api/providers');
    if (serverData && serverData.success && Array.isArray(serverData.providers)) {
      return serverData.providers;
    }

    return PROVIDER_METADATA;
  }

  public static async switchProvider(): Promise<boolean> {
    return true;
  }

  public static async getStats(): Promise<{
    totalMatches: number;
    totalTeams: number;
    leagues: any[];
    rawFeedsCount?: number;
    upcomingCount?: number;
    predictionsCount?: number;
  }> {
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

  public static async getMatchDetail(fixtureId: string): Promise<Fixture | null> {
    const serverData = await this.safeJsonFetch(`/api/fixtures/${encodeURIComponent(fixtureId)}`);
    if (serverData && serverData.success && serverData.fixture) {
      return serverData.fixture;
    }
    return null;
  }

  public static async getMatchHeadToHead(
    fixtureId: string,
    homeTeam?: string,
    awayTeam?: string
  ): Promise<HeadToHeadMeasurement | null> {
    const params = new URLSearchParams();
    if (homeTeam) params.set('home', homeTeam);
    if (awayTeam) params.set('away', awayTeam);
    const query = params.toString() ? `?${params.toString()}` : '';

    const serverData = await this.safeJsonFetch(`/api/fixtures/${encodeURIComponent(fixtureId)}/h2h${query}`);
    if (serverData && serverData.success && serverData.h2h) {
      return serverData.h2h;
    }

    const detailData = await this.safeJsonFetch(`/api/fixtures/${encodeURIComponent(fixtureId)}`);
    if (detailData && detailData.success && detailData.fixture?.prediction?.measurements?.h2h) {
      return detailData.fixture.prediction.measurements.h2h;
    }

    return null;
  }

  public static async parseMatchOnDemand(fixtureId: string) {
    return this.getMatchDetail(fixtureId);
  }

  public static async parseH2HOnDemand(fixtureId: string, homeTeam?: string, awayTeam?: string) {
    return this.getMatchHeadToHead(fixtureId, homeTeam, awayTeam);
  }

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

  public static async getLivePredictions(league = 'ALL', limit = 100): Promise<Fixture[]> {
    const params = new URLSearchParams();
    if (league !== 'ALL') params.set('league', league);
    params.set('limit', String(limit));

    const serverData = await this.safeJsonFetch(`/api/fixtures/live?${params.toString()}`);
    if (serverData && serverData.success && Array.isArray(serverData.fixtures)) {
      return serverData.fixtures;
    }

    return [];
  }

  public static async getLiveScores(): Promise<LiveScore[]> {
    const data = await this.safeJsonFetch('/api/providers/live-scores');
    if (data && data.success && Array.isArray(data.scores)) {
      return data.scores;
    }
    return [];
  }

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

  public static async clearTerminalLogs(): Promise<boolean> {
    const res = await this.safeJsonFetch('/api/logs/clear', { method: 'POST' });
    if (res && res.success) {
      loggerService.clearLogs();
      return true;
    }
    loggerService.clearLogs();
    return true;
  }

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

    return {};
  }

  public static async generateAccumulator(params: any): Promise<AccumulatorSlip> {
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

  public static async resetDatabase(): Promise<{ success: boolean; message: string; stats: any }> {
    const serverData = await this.safeJsonFetch('/api/stats/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (serverData && serverData.success) {
      return serverData;
    }

    return {
      success: false,
      message: serverData?.error || 'Database reset failed.',
      stats: await this.getStats(),
    };
  }

  public static async getTrendingTips(): Promise<TrendingTipsData | null> {
    const serverData = await this.safeJsonFetch('/api/tips');
    if (serverData && serverData.success && serverData.data) {
      return serverData.data;
    }
    return null;
  }

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

  public static async getLeagueStandings(league = 'england_premier_league'): Promise<LeagueStandingTable | null> {
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
