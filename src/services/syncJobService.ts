import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { isSqliteEnabled } from '../core/sqliteClient.js';
import { isScrapingEnabled } from '../core/scrapingGate.js';
import { flashscoreScraperService } from './flashscoreScraperService.js';
import { ServerEngine } from '../core/serverEngine.js';
import { loggerService } from './loggerService.js';
import { cleanFixtureId, Fixture } from '../core/types.js';
import { getRelativeDateStr, isMatchStarted } from '../core/dateUtils.js';
import { isSimulationLeague } from '../core/leagueMapper.js';
import { LiveScore } from '../providers/types.js';

export async function collectEngineStatsSummary() {
  const baseStats = db.getStatsSummary();
  const rawFeedsCount = db.getRawFeedsCount();
  const upcomingDbCount = db.getUpcomingFixturesCount();
  const totalPredCount = await predictionsDb.countAsync('all');
  const upcomingPredCount = await predictionsDb.countAsync('upcoming');
  const histPredCount = predictionsDb.countHistoricalPredictions();

  return {
    ...baseStats,
    rawFeedsCount,
    upcomingCount: upcomingDbCount > 0 ? upcomingDbCount : upcomingPredCount,
    predictionsCount: totalPredCount,
    upcomingPredictionsCount: upcomingPredCount,
    historicalCount: histPredCount,
    historicalPredictionsCount: histPredCount,
    totalMatches: Math.max(baseStats.totalMatches, histPredCount),
  };
}

function attachPredictionsToLiveScores(liveScores: LiveScore[]): Fixture[] {
  if (!liveScores || liveScores.length === 0) return [];
  const filteredScores = liveScores.filter(
    (s) => !isSimulationLeague(s.league, s.leagueName, undefined, undefined, undefined, s.homeTeam, s.awayTeam)
  );
  if (filteredScores.length === 0) return [];
  const todayStr = getRelativeDateStr(0);
  const predMap = predictionsDb.getPredictionsByIds(filteredScores.map((s) => s.fixtureId));

  return filteredScores.map((s) => {
    const lf: Fixture = {
      id: s.fixtureId,
      providerId: 'FLASHSCORE',
      league: s.league || 'ALL',
      leagueName: s.leagueName || 'Live In-Play',
      matchDate: todayStr,
      kickOffTime: s.status === 'FINISHED' ? 'FT' : `${s.minute}'`,
      homeTeam: s.homeTeam,
      awayTeam: s.awayTeam,
      status: 'LIVE' as const,
      minute: s.minute,
      score: { home: s.homeScore, away: s.awayScore },
    };

    const cleanId = cleanFixtureId(lf.id);
    const stored = predMap.get(lf.id) || predMap.get(cleanId);
    if (stored && stored.prediction) {
      return { ...lf, prediction: stored.prediction };
    }
    return lf;
  });
}

function getUnstartedUpcomingFixturesForPrediction(): Fixture[] {
  let upcoming = db.getUpcomingFixturesForPrediction();
  if (!upcoming || upcoming.length === 0) {
    const allPreds = predictionsDb.getPredictions({ state: 'all', skipSort: true });
    upcoming = allPreds.filter(
      (f) =>
        f.status === 'SCHEDULED' ||
        f.status === 'TIMED' ||
        (f.status as string) === 'UPCOMING' ||
        (!f.status && f.status !== 'FINISHED' && f.status !== 'LIVE')
    );
  }
  return upcoming.filter((f) => !isMatchStarted(f));
}

export interface SyncJobState {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number; // 0 to 100
  currentStep: string;
  stepIndex: number;
  totalSteps: number;
  matchesCount: number;
  skippedCount?: number;
  upcomingCount: number;
  predictionsCount: number;
  historicalPredictionsCount: number;
  livePredictionsCount: number;
  message?: string;
  error?: string;
  stats?: any;
  startTime: number;
  lastUpdatedAt: number;
  endTime?: number;
  timedOut?: boolean;
  jobType?: 'FULL' | 'PREDICTIONS';
}

const FULL_SYNC_MAX_DURATION_MS = 8 * 60 * 1000; // 8 minutes hard cap
const PREDICTION_JOB_MAX_DURATION_MS = 15 * 60 * 1000; // 15 minutes hard cap for huge fixture lists
const JOB_INACTIVITY_TIMEOUT_MS = 120 * 1000; // 120s without heartbeat/progress = stalled
const COMPLETED_JOB_RETENTION_MS = 30 * 60 * 1000; // prune terminal jobs older than 30 min
const WATCHDOG_INTERVAL_MS = 5000;

export class SyncJobService {
  private jobs: Map<string, SyncJobState> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private maxStoredJobs = 15;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startWatchdog();
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) return;
    this.watchdogTimer = setInterval(() => {
      this.reapStaleJobs();
    }, WATCHDOG_INTERVAL_MS);
    if (typeof (this.watchdogTimer as any)?.unref === 'function') {
      (this.watchdogTimer as any).unref();
    }
  }

  private getMaxDurationMs(job: SyncJobState): number {
    return job.jobType === 'PREDICTIONS' ? PREDICTION_JOB_MAX_DURATION_MS : FULL_SYNC_MAX_DURATION_MS;
  }

  private failStaleJob(job: SyncJobState, reason: string): void {
    const now = Date.now();
    job.status = 'FAILED';
    job.timedOut = true;
    job.error = reason;
    job.currentStep = 'Failed (Timed Out)';
    job.endTime = now;
    job.lastUpdatedAt = now;

    const controller = this.abortControllers.get(job.id);
    if (controller && !controller.signal.aborted) {
      controller.abort(new Error(reason));
    }
    this.abortControllers.delete(job.id);

    loggerService.addLog({
      level: 'ERROR',
      category: job.jobType === 'PREDICTIONS' ? 'PREDICTION' : 'DATABASE',
      source: 'SyncJobWatchdog',
      message: `Background ${job.jobType === 'PREDICTIONS' ? 'Calculate Predictions' : 'Full Data Sync'} job ${job.id} automatically terminated: ${reason}`,
      details: {
        jobId: job.id,
        jobType: job.jobType,
        progress: job.progress,
        stepIndex: job.stepIndex,
        elapsedMs: now - job.startTime,
      },
    });
  }

  public reapStaleJobs(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'RUNNING' || job.status === 'PENDING') {
        const maxDuration = this.getMaxDurationMs(job);
        const lastTouch = job.lastUpdatedAt || job.startTime;
        if (now - job.startTime > maxDuration) {
          this.failStaleJob(
            job,
            `Job exceeded maximum runtime limit (${Math.round(maxDuration / 1000)}s)`
          );
        } else if (now - lastTouch > JOB_INACTIVITY_TIMEOUT_MS) {
          this.failStaleJob(
            job,
            `Job stalled with no progress update for ${Math.round((now - lastTouch) / 1000)}s`
          );
        }
      } else if (job.endTime && now - job.endTime > COMPLETED_JOB_RETENTION_MS) {
        this.jobs.delete(id);
        this.abortControllers.delete(id);
      }
    }
  }

  public getJob(jobId: string): SyncJobState | null {
    this.reapStaleJobs();
    return this.jobs.get(jobId) || null;
  }

  public getActiveJob(): SyncJobState | null {
    this.reapStaleJobs();
    for (const job of this.jobs.values()) {
      if (job.status === 'RUNNING' || job.status === 'PENDING') {
        return job;
      }
    }
    return null;
  }

  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || (job.status !== 'RUNNING' && job.status !== 'PENDING')) return false;
    const now = Date.now();
    job.status = 'CANCELLED';
    job.currentStep = 'Job cancelled by user';
    job.error = 'Cancelled by user';
    job.endTime = now;
    job.lastUpdatedAt = now;

    const controller = this.abortControllers.get(jobId);
    if (controller && !controller.signal.aborted) {
      controller.abort(new Error('Job cancelled by user'));
    }
    this.abortControllers.delete(jobId);

    loggerService.addLog({
      level: 'WARN',
      category: job.jobType === 'PREDICTIONS' ? 'PREDICTION' : 'DATABASE',
      source: 'SyncJobService',
      message: `${job.jobType === 'PREDICTIONS' ? 'Prediction' : 'Sync'} job ${jobId} was cancelled by user`,
    });
    return true;
  }

  public startJob(options?: { resetDatabase?: boolean; resetRawFeeds?: boolean }): SyncJobState {
    if (!isSqliteEnabled()) {
      throw new Error('SQLite database is switched off. Enable SQLite DB manually before starting Full Data Sync.');
    }
    if (!isScrapingEnabled()) {
      throw new Error('Data scraping is switched off. Enable Data Scraping manually before starting Full Data Sync.');
    }
    const opts = { resetDatabase: false, resetRawFeeds: false, ...options };
    const existing = this.getActiveJob();
    if (existing) {
      if (existing.jobType === 'FULL') {
        return existing;
      }
      throw new Error(`Another background process (${existing.jobType}) is currently running. Wait for completion or cancel it first.`);
    }

    const now = Date.now();
    const jobId = `sync_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const job: SyncJobState = {
      id: jobId,
      status: 'RUNNING',
      progress: 5,
      currentStep: 'Initializing Full Data Sync worker...',
      stepIndex: 1,
      totalSteps: 8,
      matchesCount: 0,
      upcomingCount: 0,
      predictionsCount: 0,
      historicalPredictionsCount: 0,
      livePredictionsCount: 0,
      jobType: 'FULL',
      startTime: now,
      lastUpdatedAt: now,
    };

    this.jobs.set(jobId, job);
    this.abortControllers.set(jobId, new AbortController());
    this.cleanOldJobs();

    // Detach execution so HTTP response returns immediately (202 Accepted)
    setTimeout(() => {
      this.executeJob(jobId, opts).catch((err) => {
        console.error(`[SyncJobService] Uncaught error in job ${jobId}:`, err);
      });
    }, 10);

    return job;
  }

  public startPredictionJob(): SyncJobState {
    if (!isSqliteEnabled()) {
      throw new Error('SQLite database is switched off. Enable SQLite DB manually before calculating predictions.');
    }
    const existing = this.getActiveJob();
    if (existing) {
      if (existing.jobType === 'PREDICTIONS') {
        return existing;
      }
      throw new Error(`Another background process (${existing.jobType}) is currently running. Wait for completion or cancel it first.`);
    }

    const now = Date.now();
    const jobId = `pred_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const job: SyncJobState = {
      id: jobId,
      status: 'RUNNING',
      progress: 5,
      currentStep: 'Querying upcoming fixtures from SQLite database...',
      stepIndex: 1,
      totalSteps: 3,
      matchesCount: 0,
      skippedCount: 0,
      upcomingCount: 0,
      predictionsCount: 0,
      historicalPredictionsCount: 0,
      livePredictionsCount: 0,
      jobType: 'PREDICTIONS',
      startTime: now,
      lastUpdatedAt: now,
    };

    this.jobs.set(jobId, job);
    this.abortControllers.set(jobId, new AbortController());
    this.cleanOldJobs();

    setTimeout(() => {
      this.executePredictionJob(jobId).catch((err) => {
        console.error(`[SyncJobService] Uncaught error in prediction job ${jobId}:`, err);
      });
    }, 10);

    return job;
  }

  private cleanOldJobs(): void {
    this.reapStaleJobs();
    if (this.jobs.size > this.maxStoredJobs) {
      const keys = Array.from(this.jobs.keys());
      for (const k of keys) {
        if (this.jobs.size <= this.maxStoredJobs) break;
        const j = this.jobs.get(k);
        if (j && j.status !== 'RUNNING' && j.status !== 'PENDING') {
          this.jobs.delete(k);
          this.abortControllers.delete(k);
        }
      }
    }
  }

  private updateProgress(jobId: string, partial: Partial<SyncJobState>): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'CANCELLED' || job.status === 'FAILED') return;
    Object.assign(job, partial, { lastUpdatedAt: Date.now() });
  }

  private touchHeartbeat(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'RUNNING') return;
    job.lastUpdatedAt = Date.now();
  }

  private isTerminated(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    const controller = this.abortControllers.get(jobId);
    return (
      !job ||
      job.status === 'CANCELLED' ||
      job.status === 'FAILED' ||
      Boolean(controller?.signal.aborted)
    );
  }

  private async runStepWithTimeout<T>(
    jobId: string,
    stepName: string,
    timeoutMs: number,
    task: () => Promise<T>
  ): Promise<T> {
    if (this.isTerminated(jobId)) {
      throw new Error(`Job ${jobId} was aborted before ${stepName}`);
    }

    const controller = this.abortControllers.get(jobId);
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let heartbeatHandle: ReturnType<typeof setInterval> | null = null;
    let onAbortHandler: (() => void) | null = null;

    // Keep inactivity heartbeat alive while waiting on an explicitly bounded step
    heartbeatHandle = setInterval(() => {
      this.touchHeartbeat(jobId);
    }, 10000);
    if (typeof (heartbeatHandle as any)?.unref === 'function') {
      (heartbeatHandle as any).unref();
    }

    try {
      return await new Promise<T>((resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${stepName} timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);

        if (controller) {
          onAbortHandler = () => {
            reject(new Error(`Job aborted during ${stepName}`));
          };
          if (controller.signal.aborted) {
            onAbortHandler();
            return;
          }
          controller.signal.addEventListener('abort', onAbortHandler, { once: true });
        }

        task().then(resolve, reject);
      });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (heartbeatHandle) clearInterval(heartbeatHandle);
      if (controller && onAbortHandler) {
        controller.signal.removeEventListener('abort', onAbortHandler);
      }
    }
  }

  private async executeJob(
    jobId: string,
    options: { resetDatabase: boolean; resetRawFeeds: boolean }
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    loggerService.addLog({
      level: 'INFO',
      category: 'DATABASE',
      source: 'SyncJobService',
      message: `Initiating async Full Data Sync job ${jobId} (scraping historical, upcoming fixtures, H2H, odds, and live scores)`,
    });

    try {
      // Step 1: Purge databases, raw feeds, and in-memory caches to zero
      if (options.resetDatabase || options.resetRawFeeds) {
        this.updateProgress(jobId, {
          progress: 5,
          stepIndex: 1,
          totalSteps: 8,
          currentStep: 'Purging database tables, raw feeds, and clearing all cached data to zero...',
        });
        await this.runStepWithTimeout(jobId, 'Database purge', 25_000, async () => {
          await db.clearAllData(options.resetRawFeeds ?? true, 'fullsync');
          await predictionsDb.clearAll('fullsync');
          flashscoreScraperService.clearCaches();
        });
      }

      if (this.isTerminated(jobId)) return;

      // Step 2: Reconcile stale matches and verify databases
      this.updateProgress(jobId, {
        progress: 12,
        stepIndex: 2,
        totalSteps: 8,
        currentStep: 'Verifying clean database state and reconciling match records...',
      });
      await this.runStepWithTimeout(jobId, 'Stale match reconciliation', 25_000, () =>
        predictionsDb.reconcileStaleMatches()
      );

      if (this.isTerminated(jobId)) return;

      // Step 3: Scrape historical matches from feeds and tournament pages (non-fatal on partial timeouts)
      this.updateProgress(jobId, {
        progress: 24,
        stepIndex: 3,
        totalSteps: 8,
        currentStep: 'Scraping historical match results and multi-year tournament feeds...',
      });

      let syncRes = { success: true, matchesCount: 0, message: '' };
      try {
        syncRes = await this.runStepWithTimeout(
          jobId,
          'Historical archive sync',
          150_000,
          () => flashscoreScraperService.syncHistoricalData(7, false, { skipUpcomingRefresh: true, skipStandings: true })
        );
      } catch (histErr: any) {
        if (this.isTerminated(jobId)) return;
        loggerService.addLog({
          level: 'WARN',
          category: 'SCRAPER',
          source: 'SyncJobService',
          message: `Step 3 historical sync notice: ${histErr?.message || histErr}. Continuing to upcoming fixtures...`,
        });
        const currentHist = db.getAllHistoricalMatches(5000);
        syncRes = {
          success: true,
          matchesCount: currentHist.length,
          message: `Loaded ${currentHist.length} historical matches from database.`,
        };
      }

      if (this.isTerminated(jobId)) return;

      // Step 4: Scrape upcoming fixtures
      this.updateProgress(jobId, {
        progress: 40,
        stepIndex: 4,
        totalSteps: 8,
        matchesCount: syncRes.matchesCount,
        currentStep: 'Scraping upcoming fixtures raw feeds and saving to database...',
      });
      const upcoming = await this.runStepWithTimeout(
        jobId,
        'Upcoming fixtures scrape',
        60_000,
        () => flashscoreScraperService.getUpcomingFixtures(undefined, true)
      );

      if (this.isTerminated(jobId)) return;

      // Step 5: Scrape standings for all discovered & catalog leagues via official Flashscore endpoints
      this.updateProgress(jobId, {
        progress: 52,
        stepIndex: 5,
        totalSteps: 8,
        upcomingCount: upcoming.length,
        currentStep: 'Discovering and scraping standings tables for all catalog leagues...',
      });
      await this.runStepWithTimeout(
        jobId,
        'All-catalog standings sync',
        180_000,
        () =>
          flashscoreScraperService.syncAllCatalogStandings((processed, total, saved) => {
            if (this.isTerminated(jobId)) return;
            const pct = total > 0 ? Math.min(68, Math.round(52 + (processed / total) * 16)) : 60;
            this.updateProgress(jobId, {
              progress: pct,
              stepIndex: 5,
              totalSteps: 8,
              currentStep: `Scraping league standings (${processed}/${total} checked, ${saved} tables saved)...`,
            });
          })
      ).catch((standErr: any) => {
        if (this.isTerminated(jobId)) return { totalAttempted: 0, savedCount: 0 };
        loggerService.addLog({
          level: 'WARN',
          category: 'SCRAPER',
          source: 'SyncJobService',
          message: `Full data sync standings notice: ${standErr?.message || standErr}`,
        });
        return { totalAttempted: 0, savedCount: 0 };
      });

      if (this.isTerminated(jobId)) return;

      // Step 6: Scrape and store Head-to-Head (H2H) raw feeds for upcoming games
      this.updateProgress(jobId, {
        progress: 70,
        stepIndex: 6,
        totalSteps: 8,
        upcomingCount: upcoming.length,
        currentStep: 'Scraping Head-to-Head (H2H) raw feeds, team recent form, and encounter statistics...',
      });
      await this.runStepWithTimeout(
        jobId,
        'H2H prefetch',
        60_000,
        () => flashscoreScraperService.prefetchH2HForUpcomingFixtures(upcoming)
      ).catch((h2hErr: any) => {
        if (this.isTerminated(jobId)) return 0;
        loggerService.addLog({
          level: 'WARN',
          category: 'SCRAPER',
          source: 'SyncJobService',
          message: `Full data sync H2H prefetch notice: ${h2hErr?.message || h2hErr}`,
        });
        return 0;
      });

      if (this.isTerminated(jobId)) return;

      // Step 7: Scrape and persist Flashscore pre-match market odds & implied probabilities
      this.updateProgress(jobId, {
        progress: 82,
        stepIndex: 7,
        totalSteps: 8,
        currentStep: 'Scraping Flashscore bookmaker odds & market-implied probabilities into SQLite...',
      });
      await this.runStepWithTimeout(
        jobId,
        'Market odds prefetch',
        60_000,
        () => flashscoreScraperService.prefetchOddsForUpcomingFixtures(upcoming, 200, 10)
      ).catch((oddsErr: any) => {
        if (this.isTerminated(jobId)) return 0;
        loggerService.addLog({
          level: 'WARN',
          category: 'SCRAPER',
          source: 'SyncJobService',
          message: `Full data sync odds prefetch note: ${oddsErr?.message || oddsErr}`,
        });
        return 0;
      });

      if (this.isTerminated(jobId)) return;

      const histPredCount = predictionsDb.countHistoricalPredictions();

      // Step 8: Scrape active live scores (pure data scraping, no prediction calculation)
      this.updateProgress(jobId, {
        progress: 92,
        stepIndex: 8,
        totalSteps: 8,
        currentStep: 'Scraping active live scores and updating database...',
      });

      const liveScores = await this.runStepWithTimeout(
        jobId,
        'Live scores scrape',
        25_000,
        () => flashscoreScraperService.getLiveScores()
      ).catch(() => []);

      if (this.isTerminated(jobId)) return;

      let liveEnrichedCount = 0;

      if (liveScores && liveScores.length > 0) {
        const enrichedLive = attachPredictionsToLiveScores(liveScores);
        await db.saveUpcomingFixtures(enrichedLive);
        liveEnrichedCount = enrichedLive.length;
      }

      if (this.isTerminated(jobId)) return;

      const updatedStats = await collectEngineStatsSummary();
      const totalStoredPredictions = updatedStats.predictionsCount;

      const finalMessage = options.resetDatabase || options.resetRawFeeds
        ? `Full Data Sync complete (${syncRes.matchesCount} historical, ${upcoming.length} upcoming, ${liveEnrichedCount} live)`
        : `Full Data Sync complete (${upcoming.length} upcoming refreshed, ${liveEnrichedCount} live)`;

      const now = Date.now();
      this.updateProgress(jobId, {
        status: 'COMPLETED',
        progress: 100,
        currentStep: 'Completed',
        matchesCount: syncRes.matchesCount,
        upcomingCount: upcoming.length,
        predictionsCount: totalStoredPredictions,
        historicalPredictionsCount: histPredCount,
        livePredictionsCount: liveEnrichedCount,
        stats: updatedStats,
        message: finalMessage,
        endTime: now,
      });

      loggerService.addLog({
        level: 'SUCCESS',
        category: 'DATABASE',
        source: 'SyncJobService',
        message: `Full Data Sync job ${jobId} finished in ${((now - job.startTime) / 1000).toFixed(1)}s (${upcoming.length} upcoming, ${liveEnrichedCount} live)`,
        details: { stats: updatedStats },
      });
    } catch (err: any) {
      if (job.status === 'CANCELLED') return;
      const errMsg = err?.message || 'Sync worker encountered an error';
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'SyncJobService',
        message: `Sync job ${jobId} failed: ${errMsg}`,
        details: { stack: err?.stack },
      });

      const currentJob = this.jobs.get(jobId);
      if (currentJob && currentJob.status !== 'CANCELLED') {
        const now = Date.now();
        currentJob.status = 'FAILED';
        currentJob.error = errMsg;
        currentJob.currentStep = 'Failed';
        currentJob.endTime = now;
        currentJob.lastUpdatedAt = now;
      }
    } finally {
      this.abortControllers.delete(jobId);
      const currentJob = this.jobs.get(jobId);
      if (currentJob && (currentJob.status === 'RUNNING' || currentJob.status === 'PENDING')) {
        const now = Date.now();
        currentJob.status = 'FAILED';
        currentJob.error = currentJob.error || 'Full Data Sync worker exited unexpectedly';
        currentJob.currentStep = 'Failed';
        currentJob.endTime = now;
        currentJob.lastUpdatedAt = now;
      }
    }
  }

  private async executePredictionJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    loggerService.addLog({
      level: 'INFO',
      category: 'PREDICTION',
      source: 'SyncJobService',
      message: `Initiating pure database prediction update job ${jobId} (zero external scraper calls)`,
    });

    try {
      // Step 1: Query upcoming fixtures strictly from local DB before clearing
      this.updateProgress(jobId, {
        progress: 10,
        stepIndex: 1,
        totalSteps: 3,
        currentStep: 'Querying upcoming fixtures from database...',
      });

      const upcoming = getUnstartedUpcomingFixturesForPrediction();
      this.touchHeartbeat(jobId);

      const totalCount = upcoming.length;

      if (totalCount === 0) {
        this.updateProgress(jobId, {
          status: 'COMPLETED',
          progress: 100,
          currentStep: 'Completed',
          matchesCount: 0,
          skippedCount: 0,
          upcomingCount: 0,
          predictionsCount: predictionsDb.count('all'),
          message: 'No upcoming fixtures found in database to update.',
          endTime: Date.now(),
        });
        return;
      }

      if (this.isTerminated(jobId)) return;

      // Step 2: Purge existing upcoming predictions (preserving completed historical predictions)
      this.updateProgress(jobId, {
        progress: 15,
        stepIndex: 2,
        totalSteps: 3,
        upcomingCount: totalCount,
        matchesCount: 0,
        skippedCount: 0,
        currentStep: `Refreshing ${totalCount} upcoming predictions in SQLite database...`,
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await this.runStepWithTimeout(jobId, 'Purging upcoming predictions', 90_000, () =>
        predictionsDb.clearPredictions('upcoming', 'update_predictions')
      );

      if (this.isTerminated(jobId)) return;

      // Step 3: Recalculate predictions in chunks using pure local DB data
      const existingCompletedCount = predictionsDb.count('completed');
      this.updateProgress(jobId, {
        stepIndex: 3,
        totalSteps: 3,
        currentStep: `Recalculating predictions for ${totalCount} matches in chunks...`,
      });

      const { predictedCount, skippedCount } = await ServerEngine.recalculateUpcomingFromDbInChunks(
        upcoming,
        150,
        (processed, total, predicted, skipped) => {
          if (this.isTerminated(jobId)) return;
          const pct = Math.min(95, Math.round(15 + (processed / total) * 80));
          this.updateProgress(jobId, {
            progress: pct,
            matchesCount: predicted,
            skippedCount: skipped,
            upcomingCount: totalCount,
            predictionsCount: existingCompletedCount + predicted,
            currentStep: `Processed ${processed}/${total} matches (${predicted} predicted, ${skipped} skipped)`,
          });
        },
        {
          skipRemoteH2H: true,
          alreadyClearedUpcoming: true,
          collectFixtures: false,
          shouldCancel: () => this.isTerminated(jobId),
        }
      );

      if (this.isTerminated(jobId)) return;

      const finalStats = await collectEngineStatsSummary();
      const totalPredictionsCount = finalStats.predictionsCount;
      const finalMessage = `Successfully recalculated predictions for ${predictedCount} upcoming matches (${skippedCount} skipped due to <90% data completeness).`;

      const now = Date.now();
      this.updateProgress(jobId, {
        status: 'COMPLETED',
        progress: 100,
        currentStep: 'Completed',
        matchesCount: predictedCount,
        skippedCount: skippedCount,
        upcomingCount: totalCount,
        predictionsCount: totalPredictionsCount,
        stats: finalStats,
        message: finalMessage,
        endTime: now,
      });

      loggerService.addLog({
        level: 'SUCCESS',
        category: 'PREDICTION',
        source: 'SyncJobService',
        message: `Prediction update job ${jobId} completed: ${predictedCount} predicted, ${skippedCount} skipped`,
        details: { predictedCount, skippedCount, totalUpcoming: totalCount, totalPredictionsCount },
      });
    } catch (err: any) {
      if (job.status === 'CANCELLED') return;
      const errMsg = err?.message || 'Prediction recalculation worker encountered an error';
      loggerService.addLog({
        level: 'ERROR',
        category: 'PREDICTION',
        source: 'SyncJobService',
        message: `Prediction update job ${jobId} failed: ${errMsg}`,
        details: { stack: err?.stack },
      });

      const currentJob = this.jobs.get(jobId);
      if (currentJob && currentJob.status !== 'CANCELLED') {
        const now = Date.now();
        currentJob.status = 'FAILED';
        currentJob.error = errMsg;
        currentJob.currentStep = 'Failed';
        currentJob.endTime = now;
        currentJob.lastUpdatedAt = now;
      }
    } finally {
      this.abortControllers.delete(jobId);
      const currentJob = this.jobs.get(jobId);
      if (currentJob && (currentJob.status === 'RUNNING' || currentJob.status === 'PENDING')) {
        const now = Date.now();
        currentJob.status = 'FAILED';
        currentJob.error = currentJob.error || 'Prediction recalculation worker exited unexpectedly';
        currentJob.currentStep = 'Failed';
        currentJob.endTime = now;
        currentJob.lastUpdatedAt = now;
      }
    }
  }
}

export const syncJobService = new SyncJobService();
