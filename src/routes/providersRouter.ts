import crypto from 'crypto';
import { Router } from 'express';
import { predictionsDb } from '../core/predictionsDb.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';
import { loggerService } from '../services/loggerService.js';
import { syncJobService } from '../services/syncJobService.js';
import { fixturesWorkerService } from '../services/fixturesWorkerService.js';

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
    const { scores } = await fixturesWorkerService.getCachedLiveScores(false);
    const payload = JSON.stringify({
      success: true,
      provider: 'FLASHSCORE',
      scores: scores || [],
    });
    const etag = `"${crypto.createHash('md5').update(payload).digest('hex')}"`;

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache');
    const clientEtag = req.headers['if-none-match'];
    if (clientEtag && (clientEtag === etag || clientEtag === `W/${etag}`)) {
      return res.status(304).end();
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(payload);
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
    const status = err?.message?.includes('currently running') ? 409 : 500;
    res.status(status).json({ success: false, error: err?.message || 'Failed to start sync job' });
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
