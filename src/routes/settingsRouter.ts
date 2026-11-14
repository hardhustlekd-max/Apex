import { Router } from 'express';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { ServerEngine } from '../core/serverEngine.js';
import { EngineSettings } from '../core/types.js';
import { scraperCircuitBreaker } from '../services/flashscoreScraperService.js';
import { getSqliteDbStats } from '../core/sqliteClient.js';

export const settingsRouter = Router();

settingsRouter.get('/', (req, res) => {
  try {
    const settings = db.getSettings();
    res.json({
      success: true,
      settings: settings || {
        rollingMatchWindow: 15,
        safeWinThreshold: 0.72,
        homeAdvantageFactor: 1.12,
        formDecayRate: 0.85,
        autoSyncDaily: true,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to get settings' });
  }
});

const getStorageStatusHandler = (_req: any, res: any) => {
  const stats = getSqliteDbStats();
  res.json({
    success: true,
    storageEngine: {
      status: 'ONLINE',
      mode: 'LOCAL_SQLITE_WAL',
      dbPath: stats.path,
      sizeMB: stats.sizeMB,
      sizeBytes: stats.sizeBytes,
      journalMode: stats.journalMode,
      tableCounts: stats.tableCounts,
    },
    footballDb: {
      configured: true,
      status: 'CONNECTED',
      url: `Local SQLite (${stats.sizeMB} MB, WAL Mode)`,
      latencyMs: 1,
      sizeMB: stats.sizeMB,
    },
    predictionsDb: {
      configured: true,
      status: 'CONNECTED',
      url: `data/football_engine.db (${stats.tableCounts['predictions'] || 0} predictions)`,
      latencyMs: 1,
    },
  });
};

settingsRouter.get('/storage-status', getStorageStatusHandler);

settingsRouter.get('/scraper-status', (req, res) => {
  try {
    const circuitStatus = scraperCircuitBreaker ? scraperCircuitBreaker.getStatus() : { state: 'CLOSED', failureCount: 0 };
    const rawFeedsCount = db.getRawFeedsCount();
    res.json({
      success: true,
      circuit: circuitStatus,
      rawFeedsCount,
      mirrors: [
        { name: 'Primary Flashscore Feed', url: 'https://www.flashscore.com/x/feed', status: 'ONLINE' },
        { name: 'Ninja CDN English Primary', url: 'https://2.flashscore.ninja/2/x/feed', status: 'ONLINE' },
        { name: 'Ninja CDN English Mirror 1', url: 'https://1.flashscore.ninja/2/x/feed', status: 'ONLINE' },
        { name: 'Flashscore UK Mirror', url: 'https://www.flashscore.co.uk/x/feed', status: 'ONLINE' },
        { name: 'Flashscore Global Mirror', url: 'https://www.flashscore.in/x/feed', status: 'ONLINE' },
      ],
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to get scraper status' });
  }
});

settingsRouter.put('/', (req, res) => {
  try {
    const updated: Partial<EngineSettings> = req.body;
    const current = db.getSettings() || {
      rollingMatchWindow: 15,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    const newSettings: EngineSettings = {
      ...current,
      ...updated,
    };

    db.saveSettings(newSettings);

    res.json({
      success: true,
      settings: newSettings,
      message: 'Engine settings updated successfully',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update settings' });
  }
});

settingsRouter.post('/update-predictions', async (req, res) => {
  try {
    const { syncJobService } = await import('../services/syncJobService.js');
    const job = syncJobService.startPredictionJob();
    res.status(202).json({
      success: true,
      jobId: job.id,
      job,
      message: 'Prediction recalculation background job started',
    });
  } catch (err: any) {
    console.error('Error updating predictions:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to update upcoming predictions' });
  }
});

settingsRouter.post('/update-predictions-sync', async (req, res) => {
  try {
    let upcoming = db.getUpcomingFixtures();
    if (!upcoming || upcoming.length === 0) {
      const allPreds = predictionsDb.getPredictions({ state: 'all' });
      upcoming = allPreds.filter((f) => f.status === 'SCHEDULED' || f.status === 'TIMED' || (f.status as string) === 'UPCOMING' || (!f.status && f.status !== 'FINISHED' && f.status !== 'LIVE'));
    }
    const { isMatchStarted } = await import('../core/accumulator.js');
    upcoming = upcoming.filter(f => !isMatchStarted(f));

    const totalCount = upcoming ? upcoming.length : 0;
    if (totalCount === 0) {
      return res.json({
        success: true,
        count: 0,
        skippedCount: 0,
        totalPredictionsCount: predictionsDb.count('all'),
        upcomingCount: 0,
        message: 'No upcoming fixtures found in database to update.',
      });
    }

    await predictionsDb.clearPredictions('upcoming', 'update_predictions');

    const { predictedCount, skippedCount } = await ServerEngine.recalculateUpcomingFromDbInChunks(
      upcoming,
      50,
      undefined,
      { skipRemoteH2H: true }
    );

    const totalPredictionsCount = await predictionsDb.countAsync('all');
    res.json({
      success: true,
      count: predictedCount,
      skippedCount,
      totalPredictionsCount,
      upcomingCount: totalCount,
      stats: {
        ...db.getStatsSummary(),
        rawFeedsCount: db.getRawFeedsCount(),
        upcomingCount: db.getUpcomingFixturesCount(),
        predictionsCount: totalPredictionsCount,
        historicalCount: predictionsDb.countHistoricalPredictions(),
      },
      message: `Successfully recalculated predictions for ${predictedCount} upcoming matches (${skippedCount} skipped).`,
    });
  } catch (err: any) {
    console.error('Error in synchronous prediction update:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to update upcoming predictions synchronously' });
  }
});
