import { Router } from 'express';
import { db } from '../core/db.js';
import { providerManager } from '../providers/providerManager.js';
import { EngineSettings } from '../core/types.js';
import { getTursoConnectionStatus } from '../core/tursoClient.js';
import { scraperCircuitBreaker } from '../services/flashscoreScraperService.js';

export const settingsRouter = Router();

settingsRouter.get('/', (req, res) => {
  try {
    const settings = db.getSettings();
    res.json({
      success: true,
      settings: settings || {
        activeProvider: 'FLASHSCORE',
        rollingMatchWindow: 15,
        minEVThreshold: 1.10,
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

settingsRouter.get('/turso-status', async (req, res) => {
  try {
    const tursoStatus = await getTursoConnectionStatus();
    res.json({
      success: true,
      turso: tursoStatus,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to check Turso connection status' });
  }
});

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
        { name: 'Ninja CDN Primary', url: 'https://46.flashscore.ninja/46/x/feed', status: 'ONLINE' },
        { name: 'Ninja CDN Mirror 1', url: 'https://1.flashscore.ninja/46/x/feed', status: 'ONLINE' },
        { name: 'Ninja CDN Mirror 2', url: 'https://2.flashscore.ninja/46/x/feed', status: 'ONLINE' },
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
      activeProvider: 'FLASHSCORE',
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    const newSettings: EngineSettings = {
      ...current,
      ...updated,
    };

    if (updated.activeProvider) {
      providerManager.setActiveProvider(updated.activeProvider);
    }

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


