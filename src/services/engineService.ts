import {
  Fixture,
  FixturesQueryResponse,
  FeaturedTipsResponse,
  LiveFixturesResponse,
  LeagueOptionDTO,
  LeagueGroupDTO,
  EngineSettings,
  ProviderStatus,
  HeadToHeadMeasurement,
  StandingsCatalogItem,
  LeagueStandingTable,
  SlipBet,
  SqliteGateState,
  ScrapingGateState,
  LeagueVolatilityRecord,
} from '../core/types.js';
import { LiveScore } from '../providers/types.js';
import { loggerService, TerminalLogEntry } from './loggerService.js';
import { ClientCache } from '../core/clientCache.js';

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

      const res = await fetch(url, {
        cache: options?.cache ?? 'default',
        ...options,
        headers: fetchHeaders,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type') || '';

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const isHtml = contentType.includes('text/html') || errText.trim().startsWith('<');
        let parsedErrorJson: any = null;
        if (!isHtml && contentType.includes('application/json') && errText) {
          try {
            parsedErrorJson = JSON.parse(errText);
          } catch {}
        }
        loggerService.addLog({
          level: res.status >= 500 ? 'ERROR' : 'WARN',
          category: 'DATA_FETCH',
          source: 'EngineService',
          message: `Data fetch HTTP ${res.status} on ${url}`,
          details: {
            url,
            status: res.status,
            statusText: res.statusText,
            response: isHtml ? errText.slice(0, 150) : errText,
          },
        });
        if (parsedErrorJson && typeof parsedErrorJson === 'object') {
          return { ...parsedErrorJson, success: false, httpStatus: res.status };
        }
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

  public static buildQueryFixturesCacheKey(params?: {
    league?: string;
    dateFilter?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    sortBy?: string;
    marketFilter?: string;
  }): string {
    return [
      'query',
      params?.league || 'ALL',
      params?.dateFilter || 'ALL',
      params?.startDate || '',
      params?.endDate || '',
      (params?.search || '').trim().toLowerCase(),
      params?.sortBy || 'DEFAULT',
      params?.marketFilter || 'MOST_LIKELY',
    ].join('_');
  }

  public static async queryFixtures(
    params?: {
      league?: string;
      dateFilter?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
      sortBy?: string;
      marketFilter?: string;
    },
    options?: { forceRefresh?: boolean; signal?: AbortSignal }
  ): Promise<FixturesQueryResponse> {
    const cacheKey = this.buildQueryFixturesCacheKey(params);
    const cached = options?.forceRefresh ? null : await ClientCache.getCachedQueryResponse(cacheKey);

    const urlParams = new URLSearchParams();
    if (params?.league && params.league !== 'ALL') urlParams.set('league', params.league);
    if (params?.dateFilter) urlParams.set('dateFilter', params.dateFilter);
    if (params?.startDate) urlParams.set('startDate', params.startDate);
    if (params?.endDate) urlParams.set('endDate', params.endDate);
    if (params?.search && params.search.trim()) urlParams.set('search', params.search.trim());
    if (params?.sortBy && params.sortBy !== 'DEFAULT') urlParams.set('sortBy', params.sortBy);
    if (params?.marketFilter && params.marketFilter !== 'MOST_LIKELY') {
      urlParams.set('marketFilter', params.marketFilter);
    }
    if (options?.forceRefresh) urlParams.set('force', '1');

    const qs = urlParams.toString();
    const url = qs ? `/api/fixtures?${qs}` : '/api/fixtures';

    const fetchHeaders: Record<string, string> = { Accept: 'application/json' };
    if (!options?.forceRefresh && cached?.etag) {
      fetchHeaders['If-None-Match'] = cached.etag;
    }

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (options?.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
    const timeoutId = setTimeout(() => controller.abort(), 75000);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: fetchHeaders,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 304 && cached?.data) {
        return cached.data;
      }

      if (res.ok) {
        const text = await res.text();
        if (text) {
          const serverData = JSON.parse(text) as FixturesQueryResponse;
          if (serverData?.sqliteBlocked) {
            void ClientCache.clearDynamicData();
            return serverData;
          }
          if (serverData && serverData.success && Array.isArray(serverData.fixtures)) {
            const etag = res.headers.get('ETag') || undefined;
            void ClientCache.setCachedQueryResponse(cacheKey, serverData, etag);
            // Also cache under resolved dateFilter key so AUTO -> TODAY reuses immediately
            if (params?.dateFilter === 'AUTO' && serverData.resolvedDateFilter) {
              const resolvedKey = this.buildQueryFixturesCacheKey({
                ...params,
                dateFilter: serverData.resolvedDateFilter,
              });
              void ClientCache.setCachedQueryResponse(resolvedKey, serverData, etag);
            }
            return serverData;
          }
        }
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name !== 'AbortError') {
        console.warn('[EngineService] Network notice querying fixtures:', err?.message);
      }
    } finally {
      if (options?.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
    }

    if (cached?.data) {
      return cached.data;
    }

    return {
      success: false,
      provider: 'FLASHSCORE',
      count: 0,
      totalDatabaseCount: 0,
      resolvedDateFilter: params?.dateFilter === 'AUTO' ? 'TODAY' : (params?.dateFilter || 'ALL'),
      fixtures: [],
      groups: [],
    };
  }

  public static async getFeaturedTips(forceRefresh = false): Promise<FeaturedTipsResponse> {
    const cached = forceRefresh ? null : await ClientCache.getCachedFeaturedTips();
    const url = forceRefresh ? '/api/fixtures/featured-tips?force=1' : '/api/fixtures/featured-tips';
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (!forceRefresh && cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }

    try {
      const res = await fetch(url, { method: 'GET', headers });
      if (res.status === 304 && cached?.data) {
        return cached.data;
      }
      if (res.ok) {
        const data = (await res.json()) as FeaturedTipsResponse;
        if (data?.sqliteBlocked) {
          void ClientCache.clearDynamicData();
          return data;
        }
        if (data && data.success && Array.isArray(data.tips)) {
          const etag = res.headers.get('ETag') || undefined;
          void ClientCache.setCachedFeaturedTips(data, etag);
          return data;
        }
      }
    } catch (err: any) {
      console.warn('[EngineService] Featured tips fetch notice:', err?.message);
    }

    return cached?.data || { success: false, count: 0, totalOdds: 1.0, tips: [] };
  }

  public static async getLeaguesCatalog(): Promise<LeagueOptionDTO[]> {
    const cached = await ClientCache.getCachedLeagues();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }

    try {
      const res = await fetch('/api/fixtures/leagues', { method: 'GET', headers });
      if (res.status === 304 && cached?.data) {
        return cached.data;
      }
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.leagues)) {
          const etag = res.headers.get('ETag') || undefined;
          void ClientCache.setCachedLeagues(data.leagues, etag);
          return data.leagues;
        }
      }
    } catch {}

    return cached?.data || [];
  }

  public static async getStandingsCatalog(): Promise<{ syncedCount: number; leagues: StandingsCatalogItem[] }> {
    const serverData = await this.safeJsonFetch('/api/fixtures/standings/catalog');
    if (serverData && serverData.success && Array.isArray(serverData.leagues)) {
      return {
        syncedCount: serverData.syncedCount ?? serverData.leagues.filter((l: StandingsCatalogItem) => l.hasStandings).length,
        leagues: serverData.leagues,
      };
    }
    return { syncedCount: 0, leagues: [] };
  }

  public static async getLeagueStandings(
    leagueCode: string,
    context?: {
      leagueUrl?: string;
      leagueName?: string;
      homeTeam?: string;
      awayTeam?: string;
    }
  ): Promise<LeagueStandingTable | null> {
    const cleanCode = (leagueCode || 'england_premier_league').trim();
    const params = new URLSearchParams();
    if (context?.leagueUrl) params.set('leagueUrl', context.leagueUrl);
    if (context?.leagueName) params.set('leagueName', context.leagueName);
    if (context?.homeTeam) params.set('homeTeam', context.homeTeam);
    if (context?.awayTeam) params.set('awayTeam', context.awayTeam);
    const qs = params.toString();
    const url = `/api/fixtures/standings/${encodeURIComponent(cleanCode)}${qs ? `?${qs}` : ''}`;
    const serverData = await this.safeJsonFetch(url);
    if (serverData && serverData.success && serverData.standings) {
      return serverData.standings as LeagueStandingTable;
    }
    return null;
  }

  public static async getSettings(): Promise<EngineSettings> {
    const cached = await ClientCache.getCachedSettings();
    if (cached) {
      localSettings = cached;
    }

    const serverData = await this.safeJsonFetch('/api/settings');
    if (serverData && serverData.success && serverData.settings) {
      localSettings = serverData.settings;
      void ClientCache.setCachedSettings(serverData.settings);
      return serverData.settings;
    }
    return localSettings;
  }

  public static async getStorageStatus(): Promise<{
    sqliteGate?: SqliteGateState;
    scrapingGate?: ScrapingGateState;
    footballDb: {
      configured: boolean;
      status: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED' | 'BLOCKED';
      url: string | null;
      latencyMs?: number;
      sizeMB?: number;
      error?: string;
    };
    predictionsDb: {
      configured: boolean;
      status: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED' | 'BLOCKED';
      url: string | null;
      latencyMs?: number;
      error?: string;
    };
    storageEngine?: {
      status: string;
      mode: string;
      isDevPreview?: boolean;
      enabled?: boolean;
      initialized?: boolean;
      dbExists?: boolean;
      blockedReason?: SqliteGateState['blockedReason'];
      dbPath?: string;
      sizeMB?: number;
      sizeBytes?: number;
      journalMode?: string;
      tableCounts?: Record<string, number>;
    };
  } | null> {
    const serverData = await this.safeJsonFetch('/api/settings/storage-status');
    if (serverData && serverData.success) {
      return serverData as any;
    }
    return null;
  }

  public static async toggleSqliteDb(enabled: boolean): Promise<{
    success: boolean;
    sqliteGate?: SqliteGateState;
    stats?: any;
    message?: string;
    error?: string;
  }> {
    const serverData = await this.safeJsonFetch('/api/settings/sqlite-toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (serverData && serverData.success) {
      await ClientCache.clearDynamicData();
      return serverData;
    }
    return {
      success: false,
      error: serverData?.error || `Failed to switch SQLite DB ${enabled ? 'ON' : 'OFF'}.`,
    };
  }

  public static async toggleScraping(enabled: boolean): Promise<{
    success: boolean;
    scrapingGate?: ScrapingGateState;
    message?: string;
    error?: string;
  }> {
    const serverData = await this.safeJsonFetch('/api/settings/scraping-toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (serverData && serverData.success) {
      await ClientCache.setCachedLiveScores([]);
      return serverData;
    }
    return {
      success: false,
      error: serverData?.error || `Failed to switch data scraping ${enabled ? 'ON' : 'OFF'}.`,
    };
  }

  public static async getDriveDbStatus(accessToken?: string | null): Promise<{
    success: boolean;
    isDevPreview?: boolean;
    sqliteGate?: SqliteGateState;
    authenticated?: boolean;
    needsReauth?: boolean;
    driveFile?: {
      id: string;
      name: string;
      size?: string;
      modifiedTime?: string;
      mimeType?: string;
      webViewLink?: string;
    } | null;
    localStats?: {
      path: string;
      sizeBytes: number;
      sizeMB: number;
      tableCounts: Record<string, number>;
    };
    error?: string;
  }> {
    try {
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      const res = await fetch('/api/drive-db/status', { headers });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error checking Google Drive backup.' };
    }
  }

  public static async uploadDbToDrive(
    accessToken: string,
    fileId?: string
  ): Promise<{
    success: boolean;
    action?: 'CREATED' | 'UPDATED';
    needsReauth?: boolean;
    driveFile?: {
      id: string;
      name: string;
      size?: string;
      modifiedTime?: string;
      webViewLink?: string;
    };
    sizeBytes?: number;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/drive-db/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId }),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to upload database to Google Drive.' };
    }
  }

  public static async restoreDbFromDrive(
    accessToken: string,
    fileId?: string
  ): Promise<{
    success: boolean;
    needsReauth?: boolean;
    sqliteGate?: SqliteGateState;
    restoredFileId?: string;
    sizeBytes?: number;
    tableCounts?: Record<string, number>;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/drive-db/restore', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId }),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to restore database from Google Drive.' };
    }
  }

  public static async deleteDriveDbFile(
    accessToken: string,
    fileId: string
  ): Promise<{ success: boolean; needsReauth?: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/drive-db/file/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to delete Google Drive backup.' };
    }
  }

  public static async getScraperStatus(): Promise<{
    enabled?: boolean;
    scrapingGate?: ScrapingGateState;
    circuit: { state: 'CLOSED' | 'HALF_OPEN' | 'OPEN'; failureCount: number };
    rawFeedsCount: number;
    mirrors: Array<{ name: string; url: string; status: string }>;
  } | null> {
    const serverData = await this.safeJsonFetch('/api/settings/scraper-status');
    if (serverData && serverData.success) {
      return {
        enabled: Boolean(serverData.enabled),
        scrapingGate: serverData.scrapingGate,
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

  public static async pollBackgroundJob(
    jobId: string,
    options?: {
      onProgress?: (job: any) => void;
      signal?: AbortSignal;
      pollIntervalMs?: number;
      inactivityTimeoutMs?: number;
      maxDurationMs?: number;
    }
  ): Promise<{ success: boolean; job?: any; error?: string; cancelled?: boolean }> {
    const pollIntervalMs = options?.pollIntervalMs ?? 800;
    const inactivityTimeoutMs = options?.inactivityTimeoutMs ?? 135_000;
    const maxDurationMs = options?.maxDurationMs ?? 9 * 60 * 1000;
    const startedAt = Date.now();
    let lastActivityAt = startedAt;
    let lastSignature = '';
    let consecutiveMissing = 0;

    while (true) {
      if (options?.signal?.aborted) {
        return { success: false, cancelled: true, error: 'Process cancelled by user.' };
      }

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollIntervalMs);
        if (options?.signal) {
          const onAbort = () => {
            clearTimeout(timer);
            resolve();
          };
          if (options.signal.aborted) {
            clearTimeout(timer);
            resolve();
          } else {
            options.signal.addEventListener('abort', onAbort, { once: true });
          }
        }
      });

      if (options?.signal?.aborted) {
        return { success: false, cancelled: true, error: 'Process cancelled by user.' };
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed > maxDurationMs) {
        await this.cancelSyncJob(jobId).catch(() => false);
        const msg = `Background job timed out after ${Math.round(maxDurationMs / 1000)}s.`;
        loggerService.addLog({
          level: 'ERROR',
          category: 'ENGINE',
          source: 'EngineService',
          message: msg,
          details: { jobId, elapsedMs: elapsed },
        });
        return { success: false, error: msg };
      }

      let job = await this.getSyncJobStatus(jobId);
      if (!job) {
        const activeJob = await this.getActiveSyncJob();
        if (activeJob && activeJob.id === jobId) {
          job = activeJob;
        }
      }

      if (!job) {
        consecutiveMissing++;
        if (consecutiveMissing >= 5) {
          const msg = 'Background job state could not be found on server (server may have restarted or job expired).';
          loggerService.addLog({
            level: 'ERROR',
            category: 'DATA_FETCH',
            source: 'EngineService',
            message: msg,
            details: { jobId, consecutiveMissing },
          });
          return { success: false, error: msg };
        }
        continue;
      }

      consecutiveMissing = 0;

      const sig = `${job.status}|${job.progress}|${job.stepIndex}|${job.matchesCount}|${job.currentStep}|${job.lastUpdatedAt || ''}`;
      if (sig !== lastSignature) {
        lastSignature = sig;
        lastActivityAt = Date.now();
      } else if (Date.now() - lastActivityAt > inactivityTimeoutMs && (job.status === 'RUNNING' || job.status === 'PENDING')) {
        await this.cancelSyncJob(jobId).catch(() => false);
        const msg = `Background job stalled with no progress update for ${Math.round(inactivityTimeoutMs / 1000)}s.`;
        loggerService.addLog({
          level: 'ERROR',
          category: 'ENGINE',
          source: 'EngineService',
          message: msg,
          details: { jobId, lastStep: job.currentStep, progress: job.progress },
        });
        return { success: false, job, error: msg };
      }

      if (options?.onProgress) {
        options.onProgress(job);
      }

      if (job.status === 'COMPLETED') {
        return { success: true, job };
      }

      if (job.status === 'CANCELLED') {
        return { success: false, job, cancelled: true, error: job.error || 'Process cancelled by user.' };
      }

      if (job.status === 'FAILED') {
        return { success: false, job, error: job.error || 'Background process failed.' };
      }
    }
  }

  public static async updateUpcomingPredictions(
    onProgress?: (job: any) => void,
    signal?: AbortSignal
  ): Promise<{
    success: boolean;
    count?: number;
    skippedCount?: number;
    totalPredictionsCount?: number;
    upcomingCount?: number;
    stats?: any;
    message?: string;
    error?: string;
    cancelled?: boolean;
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
      signal,
    });

    if (!startRes || !startRes.success || !startRes.jobId) {
      return {
        success: false,
        cancelled: signal?.aborted,
        error: startRes?.error || (signal?.aborted ? 'Cancelled by user.' : 'Failed to start prediction update process'),
      };
    }

    const jobId = startRes.jobId;
    if (startRes.job && onProgress) {
      onProgress(startRes.job);
    }

    const pollRes = await this.pollBackgroundJob(jobId, {
      onProgress,
      signal,
      pollIntervalMs: 800,
      inactivityTimeoutMs: 150_000,
      maxDurationMs: 16 * 60 * 1000,
    });

    if (pollRes.success && pollRes.job) {
      const job = pollRes.job;
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

    return {
      success: false,
      cancelled: pollRes.cancelled,
      error: pollRes.error || 'Prediction recalculation encountered an error.',
    };
  }


  public static async startSyncJob(
    options?: {
      resetDatabase?: boolean;
      resetRawFeeds?: boolean;
    },
    signal?: AbortSignal
  ): Promise<{ success: boolean; jobId?: string; job?: any; error?: string }> {
    const res = await this.safeJsonFetch('/api/providers/sync/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetDatabase: options?.resetDatabase ?? true,
        resetRawFeeds: options?.resetRawFeeds ?? true,
      }),
      signal,
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

  public static async resetAndSyncDatabase(
    onProgress?: (job: any) => void,
    signal?: AbortSignal
  ): Promise<{
    success: boolean;
    message: string;
    matchesCount?: number;
    upcomingCount?: number;
    predictionsCount?: number;
    historicalPredictionsCount?: number;
    livePredictionsCount?: number;
    stats?: any;
    cancelled?: boolean;
  }> {
    // 0. Purge local browser storage & IndexedDB
    await this.clearClientStorage().catch(() => {});

    // 1. Initiate async background sync job with merge & retain mode (resetDatabase: false, resetRawFeeds: false)
    const startRes = await this.startSyncJob({ resetDatabase: false, resetRawFeeds: false }, signal);

    if (!startRes.success || !startRes.jobId) {
      return {
        success: false,
        cancelled: signal?.aborted,
        message: startRes.error || (signal?.aborted ? 'Cancelled by user.' : 'Failed to start Full Data Sync job'),
      };
    }

    const jobId = startRes.jobId;
    if (startRes.job && onProgress) {
      onProgress(startRes.job);
    }

    const pollRes = await this.pollBackgroundJob(jobId, {
      onProgress,
      signal,
      pollIntervalMs: 1000,
      inactivityTimeoutMs: 135_000,
      maxDurationMs: 9 * 60 * 1000,
    });

    if (pollRes.success && pollRes.job) {
      const job = pollRes.job;
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

    return {
      success: false,
      cancelled: pollRes.cancelled,
      message: pollRes.error || 'Full Data Sync encountered an error.',
    };
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

  public static async getStats(): Promise<{
    totalMatches: number;
    totalTeams: number;
    leagues: any[];
    rawFeedsCount?: number;
    upcomingCount?: number;
    predictionsCount?: number;
    sqliteBlocked?: boolean;
    sqliteGate?: SqliteGateState;
  }> {
    const serverData = await this.safeJsonFetch('/api/stats');
    if (serverData && serverData.success && serverData.stats) {
      return {
        ...serverData.stats,
        sqliteBlocked: Boolean(serverData.sqliteBlocked),
        sqliteGate: serverData.sqliteGate,
      };
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

  public static async queryLiveFixtures(params?: {
    league?: string;
    search?: string;
    sortBy?: string;
    marketFilter?: string;
    limit?: number;
  }): Promise<LiveFixturesResponse> {
    const league = params?.league || 'ALL';
    const search = (params?.search || '').trim();
    const sortBy = params?.sortBy || 'DEFAULT';
    const marketFilter = params?.marketFilter || 'MOST_LIKELY';
    const limit = params?.limit ?? 200;

    const cacheKey = `live_${league}_${search.toLowerCase()}_${sortBy}_${marketFilter}`;
    const cached = await ClientCache.getCachedLiveFixtures(cacheKey);

    const urlParams = new URLSearchParams();
    if (league !== 'ALL') urlParams.set('league', league);
    if (search) urlParams.set('search', search);
    if (sortBy !== 'DEFAULT') urlParams.set('sortBy', sortBy);
    if (marketFilter !== 'MOST_LIKELY') urlParams.set('marketFilter', marketFilter);
    urlParams.set('limit', String(limit));

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }

    try {
      const res = await fetch(`/api/fixtures/live?${urlParams.toString()}`, { method: 'GET', headers });
      if (res.status === 304 && cached?.data) {
        return cached.data;
      }
      if (res.ok) {
        const data = (await res.json()) as LiveFixturesResponse;
        if (data?.sqliteBlocked) {
          void ClientCache.clearDynamicData();
          return data;
        }
        if (data && data.success && Array.isArray(data.fixtures)) {
          const etag = res.headers.get('ETag') || undefined;
          void ClientCache.setCachedLiveFixtures(cacheKey, data, etag);
          return data;
        }
      }
    } catch {}

    return cached?.data || { success: false, provider: 'FLASHSCORE', count: 0, fixtures: [], groups: [] };
  }

  public static async getLiveScores(): Promise<LiveScore[]> {
    const cached = await ClientCache.getCachedLiveScores();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }

    try {
      const res = await fetch('/api/providers/live-scores', { method: 'GET', headers });
      if (res.status === 304 && cached?.data) {
        return cached.data;
      }
      if (res.ok) {
        const data = await res.json();
        const etag = res.headers.get('ETag') || undefined;
        if (data?.scrapingBlocked) {
          void ClientCache.setCachedLiveScores([], etag);
          return [];
        }
        if (data && data.success && Array.isArray(data.scores)) {
          void ClientCache.setCachedLiveScores(data.scores, etag);
          return data.scores;
        }
      }
    } catch {}

    return cached?.data || [];
  }

  public static async getHistoricalEvaluation(
    league = 'ALL',
    limit = 200,
    refresh = false,
    options?: {
      search?: string;
      sortBy?: string;
      marketFilter?: string;
    }
  ): Promise<{
    matches: Fixture[];
    groups: LeagueGroupDTO[];
    summary: {
      upcomingFixturesInDb: number;
      totalPredictions: number;
      upcomingPredictions: number;
      livePredictions: number;
      completedWithScore: number;
      completedAwaitingScore: number;
    } | null;
    sqliteBlocked?: boolean;
    sqliteGate?: SqliteGateState;
  }> {
    const search = (options?.search || '').trim();
    const sortBy = options?.sortBy || 'DEFAULT';
    const marketFilter = options?.marketFilter || 'MOST_LIKELY';
    const cacheKey = `history_${league}_${limit}_${search.toLowerCase()}_${sortBy}_${marketFilter}`;
    const cached = refresh
      ? null
      : await ClientCache.getEntry<{ matches: Fixture[]; groups: LeagueGroupDTO[]; summary: any }>(cacheKey);

    const params = new URLSearchParams();
    if (league !== 'ALL') params.set('league', league);
    params.set('limit', String(limit));
    if (search) params.set('search', search);
    if (sortBy !== 'DEFAULT') params.set('sortBy', sortBy);
    if (marketFilter !== 'MOST_LIKELY') params.set('marketFilter', marketFilter);
    if (refresh) params.set('refresh', 'true');

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (!refresh && cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }

    try {
      const res = await fetch(`/api/fixtures/history?${params.toString()}`, { method: 'GET', headers });
      if (res.status === 304 && cached?.data) {
        return cached.data;
      }
      if (res.ok) {
        const serverData = await res.json();
        if (serverData?.sqliteBlocked) {
          void ClientCache.clearDynamicData();
          return {
            matches: [],
            groups: [],
            summary: serverData.summary || null,
            sqliteBlocked: true,
            sqliteGate: serverData.sqliteGate,
          };
        }
        if (serverData && serverData.success && Array.isArray(serverData.matches)) {
          const result = {
            matches: serverData.matches,
            groups: Array.isArray(serverData.groups) ? serverData.groups : [],
            summary: serverData.summary || null,
          };
          const etag = res.headers.get('ETag') || undefined;
          void ClientCache.setEntry(cacheKey, result, etag);
          return result;
        }
      }
    } catch {}

    return cached?.data || { matches: [], groups: [], summary: null };
  }

  public static async exportPredictions(sortByProb?: 'desc' | 'asc'): Promise<{
    success: boolean;
    format?: string;
    version?: string;
    exportedAt?: string;
    count?: number;
    predictions?: any[];
    error?: string;
  }> {
    const query = sortByProb ? `?sortByProb=${sortByProb}` : '';
    const serverData = await this.safeJsonFetch(`/api/fixtures/predictions/export${query}`);
    if (serverData && serverData.success) {
      return serverData;
    }
    return {
      success: false,
      error: serverData?.error || 'Failed to export predictions',
    };
  }

  public static async downloadPredictionsJson(sortByProb?: 'desc' | 'asc'): Promise<{
    success: boolean;
    count?: number;
    filename?: string;
    error?: string;
  }> {
    try {
      const res = await this.exportPredictions(sortByProb);
      if (!res.success || !res.predictions) {
        return {
          success: false,
          error: res.error || 'Failed to retrieve predictions for export',
        };
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `apex_1x2_predictions_${dateStr}.json`;
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return {
        success: true,
        count: res.count ?? res.predictions.length,
        filename,
      };
    } catch (err: any) {
      console.error('Error downloading predictions JSON:', err);
      return {
        success: false,
        error: err?.message || 'Error creating JSON file download',
      };
    }
  }

  public static async evaluateImportedPredictions(payload: any): Promise<{
    success: boolean;
    summary?: {
      totalImported: number;
      evaluatedCount: number;
      pendingCount: number;
      wonCount: number;
      lostCount: number;
      accuracy: number;
      homePicksCount: number;
      drawPicksCount: number;
      awayPicksCount: number;
    };
    evaluated?: any[];
    error?: string;
  }> {
    const serverData = await this.safeJsonFetch('/api/fixtures/predictions/evaluate-imported', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (serverData && serverData.success) {
      return serverData;
    }
    return {
      success: false,
      error: serverData?.error || 'Failed to evaluate imported predictions',
    };
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

  public static async getBets(): Promise<SlipBet[]> {
    const serverData = await this.safeJsonFetch('/api/bets', { cache: 'no-store' });
    if (serverData && serverData.success && Array.isArray(serverData.bets)) {
      return serverData.bets;
    }
    return [];
  }

  public static async saveBet(bet: SlipBet): Promise<{ success: boolean; error?: string }> {
    const serverData = await this.safeJsonFetch('/api/bets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bet),
    });
    if (serverData && serverData.success) {
      return { success: true };
    }
    return { success: false, error: serverData?.error || 'Failed to save bet slip' };
  }

  public static async deleteBet(id: string): Promise<boolean> {
    const res = await this.safeJsonFetch(`/api/bets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return Boolean(res && res.success);
  }

  public static async getLeagueVolatilities(): Promise<{
    success: boolean;
    sqliteBlocked?: boolean;
    leagues: LeagueVolatilityRecord[];
  }> {
    const res = await this.safeJsonFetch('/api/settings/volatility');
    if (res && res.success && Array.isArray(res.leagues)) {
      return {
        success: true,
        sqliteBlocked: Boolean(res.sqliteBlocked),
        leagues: res.leagues,
      };
    }
    return { success: false, leagues: [] };
  }

  public static async calibrateLeagueVolatilities(): Promise<{
    success: boolean;
    globalLogLoss?: number;
    totalLeagues?: number;
    calibratedCount?: number;
    fallbackCount?: number;
    leagues?: LeagueVolatilityRecord[];
    error?: string;
  }> {
    const res = await this.safeJsonFetch('/api/settings/volatility/calibrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res && res.success) {
      return res;
    }
    return {
      success: false,
      error: res?.error || 'Failed to calibrate league volatility',
    };
  }
}
