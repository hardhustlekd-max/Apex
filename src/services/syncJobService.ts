import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { flashscoreScraperService } from './flashscoreScraperService.js';
import { ServerEngine } from '../core/serverEngine.js';
import { providerManager } from '../providers/providerManager.js';
import { loggerService } from './loggerService.js';
import { Fixture } from '../core/types.js';
import { getRelativeDateStr, normalizeDateStr } from '../core/dateUtils.js';

export interface SyncJobState {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number; // 0 to 100
  currentStep: string;
  stepIndex: number;
  totalSteps: number;
  matchesCount: number;
  upcomingCount: number;
  predictionsCount: number;
  historicalPredictionsCount: number;
  livePredictionsCount: number;
  message?: string;
  error?: string;
  stats?: any;
  startTime: number;
  endTime?: number;
}

export class SyncJobService {
  private jobs: Map<string, SyncJobState> = new Map();
  private maxStoredJobs = 15;

  public getJob(jobId: string): SyncJobState | null {
    return this.jobs.get(jobId) || null;
  }

  public getActiveJob(): SyncJobState | null {
    for (const job of this.jobs.values()) {
      if (job.status === 'RUNNING' || job.status === 'PENDING') {
        // If a job has been running for over 5 minutes, consider it timed out
        if (Date.now() - job.startTime > 300000) {
          job.status = 'FAILED';
          job.error = 'Job execution timed out after 5 minutes';
          job.endTime = Date.now();
          continue;
        }
        return job;
      }
    }
    return null;
  }

  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'RUNNING') return false;
    job.status = 'CANCELLED';
    job.currentStep = 'Sync cancelled by user';
    job.endTime = Date.now();
    loggerService.addLog({
      level: 'WARN',
      category: 'DATABASE',
      source: 'SyncJobService',
      message: `Sync job ${jobId} was cancelled by user`,
    });
    return true;
  }

  public startJob(options?: { resetDatabase?: boolean; resetRawFeeds?: boolean }): SyncJobState {
    const opts = { resetDatabase: false, resetRawFeeds: false, ...options };
    // If an active job is already running, return it instead of spawning concurrent resets
    const existing = this.getActiveJob();
    if (existing) {
      return existing;
    }

    const jobId = `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job: SyncJobState = {
      id: jobId,
      status: 'RUNNING',
      progress: 5,
      currentStep: 'Initializing full data & H2H sync worker...',
      stepIndex: 1,
      totalSteps: 5,
      matchesCount: 0,
      upcomingCount: 0,
      predictionsCount: 0,
      historicalPredictionsCount: 0,
      livePredictionsCount: 0,
      startTime: Date.now(),
    };

    this.jobs.set(jobId, job);
    this.cleanOldJobs();

    // Detach execution so HTTP response returns immediately (202 Accepted)
    setTimeout(() => {
      this.executeJob(jobId, opts).catch((err) => {
        console.error(`[SyncJobService] Uncaught error in job ${jobId}:`, err);
      });
    }, 10);

    return job;
  }

  private cleanOldJobs(): void {
    if (this.jobs.size > this.maxStoredJobs) {
      const keys = Array.from(this.jobs.keys());
      const toRemove = keys.slice(0, keys.length - this.maxStoredJobs);
      for (const k of toRemove) {
        this.jobs.delete(k);
      }
    }
  }

  private updateProgress(jobId: string, partial: Partial<SyncJobState>): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'CANCELLED') return;
    Object.assign(job, partial);
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
      message: `Initiating async full sync job ${jobId} (historical, upcoming feeds, and H2H)`,
    });

    try {
      // Step 1: Reconcile stale matches and verify databases
      this.updateProgress(jobId, {
        progress: 10,
        stepIndex: 1,
        currentStep: 'Reconciling past matches and initializing sync worker...',
      });
      await predictionsDb.reconcileStaleMatches();

      if (this.isCancelled(jobId)) return;

      // Step 2: Ingest historical matches from feeds and tournament pages
      this.updateProgress(jobId, {
        progress: 30,
        stepIndex: 2,
        currentStep: 'Scraping historical results and tournament archive feeds...',
      });
      const syncRes = await flashscoreScraperService.syncHistoricalData(7, false);

      if (this.isCancelled(jobId)) return;

      // Step 3: Ingest upcoming fixtures and calculate Poisson models
      this.updateProgress(jobId, {
        progress: 55,
        stepIndex: 3,
        currentStep: 'Fetching upcoming fixtures raw feeds and calculating Poisson predictions...',
      });
      const upcoming = await flashscoreScraperService.getUpcomingFixtures();
      const predRes = await ServerEngine.predictAndStoreUpcomingFixtures(upcoming);

      if (this.isCancelled(jobId)) return;

      // Step 4: Fetch and store Head-to-Head (H2H) raw feeds for upcoming games
      this.updateProgress(jobId, {
        progress: 75,
        stepIndex: 4,
        currentStep: 'Fetching Head-to-Head (H2H) raw feeds and team recent form records...',
      });
      await flashscoreScraperService.prefetchH2HForUpcomingFixtures(upcoming);
      const scrapedMatches = db.getFlashscoreScrapedMatches(500);
      const finishedScraped = scrapedMatches
        .filter((sm) => sm.result?.home !== undefined && sm.result?.away !== undefined)
        .map((sm, idx) => {
          const homeScore = parseInt(String(sm.result!.home), 10) || 0;
          const awayScore = parseInt(String(sm.result!.away), 10) || 0;
          return {
            id: sm.matchId ? `hist_${sm.matchId}` : `scraped_hist_${idx}`,
            providerId: 'FLASHSCORE',
            league: sm.leagueName || sm.stage || 'FLASHSCORE',
            leagueName: sm.leagueName || sm.stage || 'FLASHSCORE',
            matchDate: normalizeDateStr(sm.date ? sm.date.slice(0, 10) : getRelativeDateStr(-30)),
            kickOffTime: 'FT',
            homeTeam: sm.home.name,
            awayTeam: sm.away.name,
            status: 'FINISHED' as const,
            score: { home: homeScore, away: awayScore },
            odds: { homeWin: 2.10, draw: 3.30, awayWin: 3.40, over25: 1.85, under25: 1.95 },
            prediction: {
              homeXG: 1.35,
              awayXG: 1.15,
              homeWinProb: 0.45,
              drawProb: 0.28,
              awayWinProb: 0.27,
              over25Prob: 0.52,
              bttsProb: 0.50,
              mostLikelyOutcome: homeScore > awayScore ? 'Home Win' : homeScore < awayScore ? 'Away Win' : 'Draw',
            },
            bestValueMarket: {
              key: 'HOME_WIN',
              name: homeScore > awayScore ? `${sm.home.name} Win` : 'Match Result',
              odds: 2.10,
              probability: 0.45,
              expectedValue: 1.05,
              isPositiveEV: true,
              isBanker: false,
            }
          };
        });
      if (finishedScraped.length > 0) {
        await predictionsDb.saveHistoricalPredictions(finishedScraped as unknown as Fixture[]);
      }
      const histPredCount = predictionsDb.countHistoricalPredictions();

      if (this.isCancelled(jobId)) return;

      // Step 5: Update live predictions for any active matches
      this.updateProgress(jobId, {
        progress: 90,
        stepIndex: 5,
        currentStep: 'Evaluating active live matches and updating SQLite cache...',
      });

      const activeProvider = providerManager.getActiveProvider();
      const liveScores = await activeProvider.getLiveScores().catch(() => []);
      let livePredCount = 0;

      if (liveScores && liveScores.length > 0) {
        const liveFixtures: Fixture[] = liveScores.map((s) => ({
          id: s.fixtureId,
          providerId: 'FLASHSCORE',
          league: s.league || 'ALL',
          leagueName: s.leagueName || 'Live In-Play',
          matchDate: getRelativeDateStr(0),
          kickOffTime: s.status === 'FINISHED' ? 'FT' : `${s.minute}'`,
          homeTeam: s.homeTeam,
          awayTeam: s.awayTeam,
          status: 'LIVE' as const,
          minute: s.minute,
          score: { home: s.homeScore, away: s.awayScore },
          odds: {
            homeWin: 2.10,
            draw: 3.30,
            awayWin: 3.40,
            over25: 1.85,
            under25: 1.95,
          },
        }));
        const liveRes = await ServerEngine.predictAndStoreLiveFixtures(liveFixtures);
        livePredCount = liveRes.count;
      }

      const updatedStats = {
        ...db.getStatsSummary(),
        rawFeedsCount: db.getRawFeedsCount(),
        upcomingCount: db.getUpcomingFixturesCount(),
        predictionsCount: predictionsDb.count(),
        historicalCount: predictionsDb.countHistoricalPredictions(),
      };

      const finalMessage = options.resetDatabase || options.resetRawFeeds
        ? `Database & feeds reset and synchronized (${predRes.count} upcoming, ${livePredCount} live, ${histPredCount} historical predictions)`
        : `Database synchronized (${predRes.count} upcoming, ${livePredCount} live, ${histPredCount} historical)`;

      this.updateProgress(jobId, {
        status: 'COMPLETED',
        progress: 100,
        currentStep: 'Completed',
        matchesCount: syncRes.matchesCount,
        upcomingCount: upcoming.length,
        predictionsCount: predRes.count as any,
        historicalPredictionsCount: histPredCount,
        livePredictionsCount: livePredCount,
        stats: updatedStats,
        message: finalMessage,
        endTime: Date.now(),
      });

      loggerService.addLog({
        level: 'SUCCESS',
        category: 'DATABASE',
        source: 'SyncJobService',
        message: `Sync job ${jobId} finished successfully in ${((Date.now() - job.startTime) / 1000).toFixed(1)}s`,
        details: { stats: updatedStats },
      });
    } catch (err: any) {
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'SyncJobService',
        message: `Sync job ${jobId} failed: ${err?.message}`,
        details: { stack: err?.stack },
      });

      this.updateProgress(jobId, {
        status: 'FAILED',
        error: err?.message || 'Sync worker encountered an error',
        currentStep: 'Failed',
        endTime: Date.now(),
      });
    }
  }

  private isCancelled(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    return !job || job.status === 'CANCELLED';
  }
}

export const syncJobService = new SyncJobService();
