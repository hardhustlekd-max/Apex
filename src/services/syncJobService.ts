import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { flashscoreScraperService, convertHistoricalMatchToFixture } from './flashscoreScraperService.js';
import { ServerEngine } from '../core/serverEngine.js';
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
  skippedCount?: number;
  upcomingCount: number;
  predictionsCount: number;
  historicalPredictionsCount: number;
  livePredictionsCount: number;
  message?: string;
  error?: string;
  stats?: any;
  startTime: number;
  endTime?: number;
  jobType?: 'FULL' | 'PREDICTIONS';
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
        // If a job has been running for over 15 minutes, consider it timed out
        if (Date.now() - job.startTime > 900000) {
          job.status = 'FAILED';
          job.error = 'Job execution timed out after 15 minutes';
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

  public startPredictionJob(): SyncJobState {
    const existing = this.getActiveJob();
    if (existing) {
      return existing;
    }

    const jobId = `pred_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job: SyncJobState = {
      id: jobId,
      status: 'RUNNING',
      progress: 5,
      currentStep: 'Purging existing predictions from database & memory cache...',
      stepIndex: 1,
      totalSteps: 3,
      matchesCount: 0,
      skippedCount: 0,
      upcomingCount: 0,
      predictionsCount: 0,
      historicalPredictionsCount: 0,
      livePredictionsCount: 0,
      jobType: 'PREDICTIONS',
      startTime: Date.now(),
    };

    this.jobs.set(jobId, job);
    this.cleanOldJobs();

    setTimeout(() => {
      this.executePredictionJob(jobId).catch((err) => {
        console.error(`[SyncJobService] Uncaught error in prediction job ${jobId}:`, err);
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
      // Step 1: Purge databases, raw feeds, and in-memory caches to zero
      if (options.resetDatabase || options.resetRawFeeds) {
        this.updateProgress(jobId, {
          progress: 5,
          stepIndex: 1,
          totalSteps: 6,
          currentStep: 'Purging database tables, raw feeds, and clearing all cached data to zero...',
        });
        db.clearAllData(options.resetRawFeeds ?? true);
        predictionsDb.clearAll();
        flashscoreScraperService.clearCaches();
      }

      // Step 2: Reconcile stale matches and verify databases
      this.updateProgress(jobId, {
        progress: 15,
        stepIndex: 2,
        totalSteps: 6,
        currentStep: 'Verifying clean database state and reconciling match records...',
      });
      await predictionsDb.reconcileStaleMatches();

      if (this.isCancelled(jobId)) return;

      // Step 3: Ingest historical matches from feeds and tournament pages
      this.updateProgress(jobId, {
        progress: 35,
        stepIndex: 3,
        totalSteps: 6,
        currentStep: 'Parsing historical match results and multi-year tournament feeds...',
      });
      
      let syncRes = { success: true, matchesCount: 0, message: '' };
      try {
        syncRes = await flashscoreScraperService.syncHistoricalData(7, false);
      } catch (histErr: any) {
        loggerService.addLog({
          level: 'WARN',
          category: 'DATABASE',
          source: 'SyncJobService',
          message: `Step 3 historical sync note: ${histErr?.message || histErr}. Continuing to upcoming fixtures...`,
        });
        const currentHist = db.getAllHistoricalMatches(1500);
        syncRes = {
          success: true,
          matchesCount: currentHist.length,
          message: `Loaded ${currentHist.length} historical matches from database.`,
        };
      }

      if (this.isCancelled(jobId)) return;

      // Step 4: Ingest upcoming fixtures and calculate Poisson models
      this.updateProgress(jobId, {
        progress: 60,
        stepIndex: 4,
        totalSteps: 6,
        currentStep: 'Fetching upcoming fixtures raw feeds and calculating 5-Pillar Poisson predictions...',
      });
      const upcoming = await flashscoreScraperService.getUpcomingFixtures();
      const predRes = await ServerEngine.predictAndStoreUpcomingFixtures(upcoming);

      if (this.isCancelled(jobId)) return;

      // Step 5: Fetch and store Head-to-Head (H2H) raw feeds for upcoming games
      this.updateProgress(jobId, {
        progress: 80,
        stepIndex: 5,
        totalSteps: 6,
        currentStep: 'Fetching Head-to-Head (H2H) raw feeds, team recent form, and encounter statistics...',
      });
      await flashscoreScraperService.prefetchH2HForUpcomingFixtures(upcoming);
      const allHistorical = db.getAllHistoricalMatches(1500);
      const scrapedMatches = db.getFlashscoreScrapedMatches(500);
      const historicalFixtures: Fixture[] = allHistorical.map((m) => convertHistoricalMatchToFixture(m));

      for (const sm of scrapedMatches) {
        if (sm.result?.home !== undefined && sm.result?.away !== undefined) {
          const homeScore = parseInt(String(sm.result.home), 10) || 0;
          const awayScore = parseInt(String(sm.result.away), 10) || 0;
          const id = sm.matchId ? `hist_${sm.matchId}` : `scraped_hist_${historicalFixtures.length}`;
          if (!historicalFixtures.some((f) => f.id === id || f.id === `fs_hist_${sm.matchId}`)) {
            historicalFixtures.push({
              id,
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
                over15Prob: 0.75,
                over25Prob: 0.52,
                over35Prob: 0.28,
                bttsProb: 0.50,
                mostLikelyOutcome: {
                  selection: homeScore > awayScore ? 'Home Win' : homeScore < awayScore ? 'Away Win' : 'Draw',
                  marketKey: homeScore > awayScore ? 'HOME_WIN' : homeScore < awayScore ? 'AWAY_WIN' : 'DRAW',
                  probability: 0.55,
                  odds: 2.10,
                  expectedValue: 1.15,
                  isProfitable: true,
                  commentary: `Result: ${homeScore}-${awayScore}`,
                },
                topCorrectScores: [],
                homeAttackStrength: 1.0,
                homeDefenseStrength: 1.0,
                awayAttackStrength: 1.0,
                awayDefenseStrength: 1.0,
                homeFormMultiplier: 1.0,
                awayFormMultiplier: 1.0,
                probabilityMatrix: [],
              },
              bestValueMarket: {
                key: 'HOME_WIN',
                name: homeScore > awayScore ? `${sm.home.name} Win` : 'Match Result',
                odds: 2.10,
                probability: 0.45,
                impliedProb: 0.47,
                expectedValue: 1.05,
                isPositiveEV: true,
                isBanker: false,
              }
            });
          }
        }
      }
      if (historicalFixtures.length > 0) {
        await predictionsDb.saveHistoricalPredictions(historicalFixtures);
      }
      const histPredCount = predictionsDb.countHistoricalPredictions();

      if (this.isCancelled(jobId)) return;

      // Step 6: Update live matches (Read-Only Enrichment)
      this.updateProgress(jobId, {
        progress: 95,
        stepIndex: 6,
        totalSteps: 6,
        currentStep: 'Refreshing active live scores and enriching from database...',
      });

      const liveScores = await flashscoreScraperService.getLiveScores().catch(() => []);
      let liveEnrichedCount = 0;

      if (liveScores && liveScores.length > 0) {
        const enrichedLive: Fixture[] = liveScores.map((s) => {
          const lf: Fixture = {
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
            odds: { homeWin: 2.10, draw: 3.30, awayWin: 3.40, over25: 1.85, under25: 1.95 },
          };

          // Attach pre-existing prediction if it exists in DB
          const cleanId = (lf.id || '').replace(/^fs_/, '');
          const stored = predictionsDb.getPredictionById(lf.id) || predictionsDb.getPredictionById(cleanId);
          if (stored && stored.prediction) {
            return { ...lf, prediction: stored.prediction };
          }
          return lf;
        });

        await db.saveUpcomingFixtures(enrichedLive);
        liveEnrichedCount = enrichedLive.length;
      }

      const updatedStats = {
        ...db.getStatsSummary(),
        rawFeedsCount: db.getRawFeedsCount(),
        upcomingCount: db.getUpcomingFixturesCount(),
        predictionsCount: predictionsDb.count(),
        historicalCount: predictionsDb.countHistoricalPredictions(),
      };

      const finalMessage = options.resetDatabase || options.resetRawFeeds
        ? `Database & feeds reset and synchronized (${predRes.count} upcoming, ${liveEnrichedCount} live, ${histPredCount} historical predictions)`
        : `Database synchronized (${predRes.count} upcoming, ${liveEnrichedCount} live, ${histPredCount} historical)`;

      this.updateProgress(jobId, {
        status: 'COMPLETED',
        progress: 100,
        currentStep: 'Completed',
        matchesCount: syncRes.matchesCount,
        upcomingCount: upcoming.length,
        predictionsCount: predRes.count as any,
        historicalPredictionsCount: histPredCount,
        livePredictionsCount: liveEnrichedCount,
        stats: updatedStats,
        message: finalMessage,
        endTime: Date.now(),
      });

      loggerService.addLog({
        level: 'SUCCESS',
        category: 'DATABASE',
        source: 'SyncJobService',
        message: `Sync job ${jobId} finished successfully in ${((Date.now() - job.startTime) / 1000).toFixed(1)}s (Live Enriched: ${liveEnrichedCount})`,
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
      // Step 1: Purge existing predictions from DB and memory cache as the first step
      this.updateProgress(jobId, {
        progress: 5,
        stepIndex: 1,
        totalSteps: 3,
        currentStep: 'Purging existing predictions from database & memory cache...',
      });
      await predictionsDb.clearPredictions();

      if (this.isCancelled(jobId)) return;

      // Step 2: Query upcoming fixtures strictly from local DB
      this.updateProgress(jobId, {
        progress: 15,
        stepIndex: 2,
        totalSteps: 3,
        currentStep: 'Querying upcoming fixtures from database...',
      });

      let upcoming = db.getUpcomingFixtures();
      if (!upcoming || upcoming.length === 0) {
        const allPreds = predictionsDb.getAllPredictions();
        upcoming = allPreds.filter((f) => f.status === 'SCHEDULED' || f.status === 'TIMED' || (f.status as string) === 'UPCOMING' || (!f.status && f.status !== 'FINISHED' && f.status !== 'LIVE'));
      }

      const totalCount = upcoming ? upcoming.length : 0;
      this.updateProgress(jobId, {
        progress: 25,
        upcomingCount: totalCount,
        matchesCount: 0,
        skippedCount: 0,
        currentStep: totalCount > 0
          ? `Loaded ${totalCount} upcoming matches from database. Preparing 90% data availability recalculation...`
          : 'No upcoming matches found in database. Run full sync to populate matches.',
      });

      if (totalCount === 0) {
        this.updateProgress(jobId, {
          status: 'COMPLETED',
          progress: 100,
          currentStep: 'Completed',
          matchesCount: 0,
          skippedCount: 0,
          upcomingCount: 0,
          predictionsCount: predictionsDb.count(),
          message: 'No upcoming fixtures found in database to update.',
          endTime: Date.now(),
        });
        return;
      }

      if (this.isCancelled(jobId)) return;

      // Step 3: Recalculate predictions in chunks using the 90% Data Availability Gatekeeper
      this.updateProgress(jobId, {
        stepIndex: 3,
        totalSteps: 3,
        currentStep: `Recalculating predictions for ${totalCount} matches in chunks (90% data availability threshold)...`,
      });

      const { predictedCount, skippedCount } = await ServerEngine.recalculateUpcomingFromDbInChunks(
        upcoming,
        50,
        (processed, total, predicted, skipped) => {
          if (this.isCancelled(jobId)) return;
          const pct = Math.min(95, Math.round(15 + (processed / total) * 80));
          this.updateProgress(jobId, {
            progress: pct,
            matchesCount: predicted,
            skippedCount: skipped,
            upcomingCount: totalCount,
            predictionsCount: predictionsDb.count(),
            currentStep: `Processed ${processed}/${total} matches (${predicted} predicted, ${skipped} skipped)`,
          });
        }
      );

      if (this.isCancelled(jobId)) return;

      const totalPredictionsCount = await predictionsDb.countAsync();
      const finalMessage = `Successfully recalculated predictions for ${predictedCount} upcoming matches (${skippedCount} skipped due to <90% data completeness).`;

      const finalStats = {
        ...db.getStatsSummary(),
        rawFeedsCount: db.getRawFeedsCount(),
        upcomingCount: totalCount,
        predictionsCount: totalPredictionsCount,
        historicalCount: predictionsDb.countHistoricalPredictions(),
      };

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
        endTime: Date.now(),
      });

      loggerService.addLog({
        level: 'SUCCESS',
        category: 'PREDICTION',
        source: 'SyncJobService',
        message: `Prediction update job ${jobId} completed: ${predictedCount} predicted, ${skippedCount} skipped`,
        details: { predictedCount, skippedCount, totalUpcoming: totalCount, totalPredictionsCount },
      });
    } catch (err: any) {
      loggerService.addLog({
        level: 'ERROR',
        category: 'PREDICTION',
        source: 'SyncJobService',
        message: `Prediction update job ${jobId} failed: ${err?.message}`,
        details: { stack: err?.stack },
      });

      this.updateProgress(jobId, {
        status: 'FAILED',
        error: err?.message || 'Prediction recalculation worker encountered an error',
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
