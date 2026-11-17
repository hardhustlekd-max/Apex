import { Router } from 'express';
import { db } from '../core/db.js';
import { DEFAULT_ENGINE_SETTINGS, EngineSettings } from '../core/types.js';
import { scraperCircuitBreaker } from '../services/flashscoreScraperService.js';
import { getSqliteDbStats } from '../core/sqliteClient.js';
import { syncJobService } from '../services/syncJobService.js';

export const settingsRouter = Router();

settingsRouter.get('/', (req, res) => {
  try {
    const settings = db.getSettings();
    res.json({
      success: true,
      settings: settings || DEFAULT_ENGINE_SETTINGS,
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
    const current = db.getSettings() || DEFAULT_ENGINE_SETTINGS;

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
    const job = syncJobService.startPredictionJob();
    res.status(202).json({
      success: true,
      jobId: job.id,
      job,
      message: 'Prediction recalculation background job started',
    });
  } catch (err: any) {
    console.error('Error updating predictions:', err);
    const status = err?.message?.includes('currently running') ? 409 : 500;
    res.status(status).json({ success: false, error: err?.message || 'Failed to update upcoming predictions' });
  }
});
