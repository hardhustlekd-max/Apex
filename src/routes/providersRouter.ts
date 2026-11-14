import { Router } from 'express';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { EngineSettings, Fixture } from '../core/types.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';
import { getRelativeDateStr, normalizeDateStr } from '../core/dateUtils.js';
import { loggerService } from '../services/loggerService.js';
import { syncJobService } from '../services/syncJobService.js';
import { ServerEngine } from '../core/serverEngine.js';
import { isMatchStarted } from '../core/accumulator.js';

export const providersRouter = Router();

providersRouter.get('/', (req, res) => {
  try {
    const list = flashscoreScraperService.getProviderStatus();
    res.json({
      success: true,
      activeProviderId: 'FLASHSCORE',
      providers: [list],
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to list providers' });
  }
});

providersRouter.get('/live-scores', async (req, res) => {
  try {
    const scores = await flashscoreScraperService.getLiveScores().catch((err) => {
      loggerService.addLog({
        level: 'WARN',
        category: 'SCRAPER',
        source: 'ProvidersRouter',
        message: `Live scores fetch failed gracefully: ${err?.message || 'Network error'}`,
      });
      return [];
    });

    res.json({
      success: true,
      provider: 'FLASHSCORE',
      scores: scores || [],
    });
  } catch (err: any) {
    loggerService.addLog({
      level: 'ERROR',
      category: 'DATA_FETCH',
      source: 'ProvidersRouter',
      message: `Failed to get live scores: ${err?.message || 'Unknown error'}`,
      details: { error: err?.message, stack: err?.stack },
    });
    res.json({ success: true, provider: 'FLASHSCORE', scores: [] });
  }
});

// Flashscore Scraper specific endpoints
providersRouter.get('/flashscore/scrape', async (req, res) => {
  try {
    const date = req.query.date as string | undefined;
    const forceRefresh = req.query.refresh === 'true' || req.query.refresh === '1';
    const fixtures = await flashscoreScraperService.getUpcomingFixtures(date, forceRefresh);
    res.json({
      success: true,
      count: fixtures.length,
      fixtures,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to scrape Flashscore' });
  }
});

async function runSyncWorkflow(options: { resetDatabase: boolean; resetRawFeeds: boolean }) {
  if (options.resetDatabase || options.resetRawFeeds) {
    loggerService.addLog({
      level: 'INFO',
      category: 'DATABASE',
      source: 'SyncEngine',
      message: 'Purging database tables, raw feeds, and cached predictions...',
    });
    await db.clearAllData(options.resetRawFeeds, 'fullsync');
    await predictionsDb.clearAll('fullsync');
    flashscoreScraperService.clearCaches();
  }

  loggerService.addLog({
    level: 'INFO',
    category: 'DATABASE',
    source: 'SyncEngine',
    message: 'Starting Flashscore full data & H2H synchronization...',
  });

  try {
    await predictionsDb.reconcileStaleMatches();
    const upcoming = await flashscoreScraperService.getUpcomingFixtures(undefined, true);
    await flashscoreScraperService.prefetchH2HForUpcomingFixtures(upcoming);
    await flashscoreScraperService.prefetchOddsForUpcomingFixtures(upcoming, 200, 10).catch(() => 0);

    const unstarted = upcoming.filter((f) => !isMatchStarted(f));
    if (unstarted.length > 0) {
      await ServerEngine.recalculateUpcomingFromDbInChunks(unstarted, 100, undefined, { skipRemoteH2H: true });
    }

    const histPredCount = predictionsDb.countHistoricalPredictions();

    // Update live matches (Read-Only Enrichment)
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

    const totalPredCount = predictionsDb.count('all');
    const updatedStats = {
      ...db.getStatsSummary(),
      rawFeedsCount: db.getRawFeedsCount(),
      upcomingCount: db.getUpcomingFixturesCount(),
      predictionsCount: totalPredCount,
    };

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'DATA_FETCH',
      source: 'SyncEngine',
      message: `Sync completed: ${upcoming.length} upcoming fixtures, ${totalPredCount} stored predictions, ${histPredCount} historical, ${liveEnrichedCount} live enriched`,
    });

    return {
      success: true,
      message: options.resetDatabase || options.resetRawFeeds
        ? `Database & raw feeds reset and fully synchronized (${upcoming.length} upcoming fixtures, ${totalPredCount} predictions)`
        : `Database synchronized (${upcoming.length} upcoming fixtures refreshed, ${totalPredCount} predictions)`,
      matchesCount: upcoming.length,
      upcomingCount: upcoming.length,
      predictionsCount: totalPredCount,
      historicalPredictionsCount: histPredCount,
      livePredictionsCount: liveEnrichedCount,
      stats: updatedStats,
    };
  } catch (err: any) {
    loggerService.addLog({
      level: 'ERROR',
      category: 'DATA_FETCH',
      source: 'SyncEngine',
      message: `Fatal error during sync workflow: ${err?.message}`,
      details: { stack: err?.stack }
    });
    throw err;
  }
}

// ==========================================
// Async Job Runner Endpoints (Industry Standard)
// ==========================================

// Starts a detached background sync job and returns HTTP 202 immediately with Job ID
providersRouter.post('/sync/start', (req, res) => {
  try {
    const resetDatabase = req.body?.resetDatabase ?? true;
    const resetRawFeeds = req.body?.resetRawFeeds ?? true;
    const job = syncJobService.startJob({ resetDatabase, resetRawFeeds });
    res.status(202).json({
      success: true,
      jobId: job.id,
      job,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to start sync job' });
  }
});

// Retrieves current state and progress for a specific job
providersRouter.get('/sync/status/:jobId', (req, res) => {
  const job = syncJobService.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Sync job not found' });
  }
  res.json({ success: true, job });
});

// Retrieves any currently active (running or pending) job
providersRouter.get('/sync/active', (req, res) => {
  const job = syncJobService.getActiveJob();
  res.json({ success: true, job: job || null });
});

// Cancels a running sync job
providersRouter.post('/sync/cancel/:jobId', (req, res) => {
  const cancelled = syncJobService.cancelJob(req.params.jobId);
  res.json({ success: cancelled });
});

// Dedicated Historical Data Scraper Endpoint
providersRouter.post('/flashscore/sync-history', async (req, res) => {
  try {
    loggerService.addLog({
      level: 'INFO',
      category: 'SCRAPER',
      source: 'SyncHistoryOnly',
      message: 'Starting historical archive scraper execution...',
    });

    const syncRes = await flashscoreScraperService.syncHistoricalData(7, false);
    await predictionsDb.init();
    await predictionsDb.syncPendingPredictionResultsFromRemote(true);
    const histPredCount = predictionsDb.countHistoricalPredictions();

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'SCRAPER',
      source: 'SyncHistoryOnly',
      message: `Historical scraper completed: ${syncRes.matchesCount} historical matches synchronized into database`,
    });

    res.json({
      success: true,
      message: `Synchronized ${syncRes.matchesCount} historical matches and reconciled ${histPredCount} completed predictions in database.`,
      count: syncRes.matchesCount,
    });
  } catch (err: any) {
    loggerService.addLog({
      level: 'ERROR',
      category: 'SCRAPER',
      source: 'SyncHistoryOnly',
      message: `Historical scraper error: ${err?.message}`,
    });
    res.status(500).json({ success: false, error: err?.message || 'Failed to sync historical data' });
  }
});

// Unified Reset Database, Raw Feeds & Full Data Sync (Supports both async and synchronous fallback)
providersRouter.post('/flashscore/reset-and-sync', async (req, res) => {
  // If caller requests async execution or accepts 202
  if (req.query.async === 'true' || req.headers['x-sync-mode'] === 'async') {
    const job = syncJobService.startJob({ resetDatabase: true, resetRawFeeds: true });
    return res.status(202).json({ success: true, jobId: job.id, job });
  }
  try {
    const result = await runSyncWorkflow({ resetDatabase: true, resetRawFeeds: true });
    res.json(result);
  } catch (err: any) {
    loggerService.addLog({
      level: 'ERROR',
      category: 'DATA_FETCH',
      source: 'SyncEngine',
      message: `Failed to reset and sync Flashscore data: ${err?.message}`,
    });
    res.status(500).json({ success: false, error: err?.message || 'Failed to reset and sync Flashscore data' });
  }
});

// Standard sync route with optional reset support
providersRouter.post('/flashscore/sync', async (req, res) => {
  const resetDatabase = req.body?.resetDatabase ?? true;
  const resetRawFeeds = req.body?.resetRawFeeds ?? true;
  if (req.query.async === 'true' || req.headers['x-sync-mode'] === 'async') {
    const job = syncJobService.startJob({ resetDatabase, resetRawFeeds });
    return res.status(202).json({ success: true, jobId: job.id, job });
  }
  try {
    const result = await runSyncWorkflow({ resetDatabase, resetRawFeeds });
    res.json(result);
  } catch (err: any) {
    loggerService.addLog({
      level: 'ERROR',
      category: 'DATA_FETCH',
      source: 'SyncEngine',
      message: `Failed to sync Flashscore data: ${err?.message}`,
    });
    res.status(500).json({ success: false, error: err?.message || 'Failed to sync Flashscore data' });
  }
});

providersRouter.get('/flashscore/matches', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 500;
    const leagueFilter = (req.query.league as string || '').toLowerCase().trim();
    const countryFilter = (req.query.country as string || '').toLowerCase().trim();

    let matches = db.getFlashscoreScrapedMatches(limit);

    if (countryFilter) {
      matches = matches.filter((m) => (m.country || '').toLowerCase().includes(countryFilter));
    }

    if (leagueFilter) {
      matches = matches.filter((m) =>
        (m.leagueName || '').toLowerCase().includes(leagueFilter) ||
        (m.stage || '').toLowerCase().includes(leagueFilter)
      );
    }

    res.json({
      success: true,
      count: matches.length,
      matches,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to retrieve Flashscore matches' });
  }
});

providersRouter.get('/flashscore/export', (req, res) => {
  try {
    const format = (req.query.format as 'json' | 'json-array') || 'json';
    const matches = db.getFlashscoreScrapedMatches(500);
    const exported = flashscoreScraperService.exportData(matches, format);

    res.setHeader('Content-Type', 'application/json');
    res.send(exported);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to export Flashscore data' });
  }
});
