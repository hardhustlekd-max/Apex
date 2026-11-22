import { Router } from 'express';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { DEFAULT_ENGINE_SETTINGS, EngineSettings } from '../core/types.js';
import { scraperCircuitBreaker } from '../services/flashscoreScraperService.js';
import {
  DB_PATH,
  disableSqliteManually,
  enableSqliteManually,
  getSqliteDbStats,
  getSqliteGateState,
  isSqliteEnabled,
} from '../core/sqliteClient.js';
import {
  disableScrapingManually,
  enableScrapingManually,
  getScrapingGateState,
  isScrapingEnabled,
} from '../core/scrapingGate.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';
import { syncJobService } from '../services/syncJobService.js';
import { fixturesWorkerService } from '../services/fixturesWorkerService.js';
import { loggerService } from '../services/loggerService.js';
import { ServerEngine } from '../core/serverEngine.js';
import { computeLeagueVolatilities } from '../core/leagueVolatility.js';

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
  const gate = getSqliteGateState();
  const scrapingGate = getScrapingGateState();
  res.json({
    success: true,
    sqliteGate: gate,
    scrapingGate,
    storageEngine: {
      status: gate.enabled ? (gate.initialized ? 'ONLINE' : 'STANDBY') : 'BLOCKED',
      mode: gate.enabled ? 'LOCAL_SQLITE_WAL' : 'MANUAL_SWITCH_REQUIRED',
      isDevPreview: gate.isDevPreview,
      enabled: gate.enabled,
      initialized: gate.initialized,
      dbExists: gate.dbExists,
      blockedReason: gate.blockedReason,
      dbPath: stats.path,
      sizeMB: stats.sizeMB,
      sizeBytes: stats.sizeBytes,
      journalMode: stats.journalMode,
      tableCounts: stats.tableCounts,
    },
    footballDb: {
      configured: gate.dbExists,
      status: gate.enabled ? 'CONNECTED' : 'BLOCKED',
      url: gate.enabled
        ? `Local SQLite (${stats.sizeMB} MB, WAL Mode)`
        : gate.dbExists
        ? `Blocked (${stats.sizeMB} MB on disk — switch on manually)`
        : 'Not initialized (No DB file on preview)',
      latencyMs: gate.enabled ? 1 : 0,
      sizeMB: stats.sizeMB,
    },
    predictionsDb: {
      configured: gate.dbExists,
      status: gate.enabled ? 'CONNECTED' : 'BLOCKED',
      url: gate.enabled
        ? `${DB_PATH} (${stats.tableCounts['predictions'] || 0} predictions)`
        : 'SQLite initialization blocked until switched on manually',
      latencyMs: gate.enabled ? 1 : 0,
    },
  });
};

settingsRouter.get('/storage-status', getStorageStatusHandler);

settingsRouter.post('/sqlite-toggle', async (req, res) => {
  try {
    const requestedEnabled = Boolean(req.body?.enabled);

    if (requestedEnabled) {
      const gateBefore = getSqliteGateState();
      const gate = enableSqliteManually();
      await db.init();
      await predictionsDb.init().catch(() => {});
      await fixturesWorkerService.ensureIndexReady(true).catch(() => {});
      const finalGate = getSqliteGateState();
      const stats = getSqliteDbStats();

      loggerService.addLog({
        level: 'SUCCESS',
        category: 'DATABASE',
        source: 'SQLiteGate',
        message: gateBefore.dbExists
          ? `SQLite DB manually switched ON (${stats.sizeMB} MB loaded from ${DB_PATH})`
          : `SQLite DB manually switched ON and initialized at ${DB_PATH}`,
      });

      return res.json({
        success: true,
        sqliteGate: finalGate,
        stats,
        message: gate.dbExists
          ? 'SQLite database switched ON and initialized.'
          : 'SQLite database created and initialized manually.',
      });
    } else {
      const activeJob = syncJobService.getActiveJob();
      if (activeJob && (activeJob.status === 'RUNNING' || activeJob.status === 'PENDING')) {
        return res.status(409).json({
          success: false,
          error: 'Cannot switch off SQLite while a background sync or prediction job is running.',
        });
      }

      const gate = disableSqliteManually();
      await db.init();
      await predictionsDb.init();
      fixturesWorkerService.invalidate();

      loggerService.addLog({
        level: 'INFO',
        category: 'DATABASE',
        source: 'SQLiteGate',
        message: 'SQLite DB manually switched OFF (connections closed and auto-init blocked).',
      });

      return res.json({
        success: true,
        sqliteGate: gate,
        stats: getSqliteDbStats(),
        message: 'SQLite database switched OFF and auto-initialization blocked.',
      });
    }
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'Failed to toggle SQLite database state',
    });
  }
});

settingsRouter.get('/scraper-status', (req, res) => {
  try {
    const circuitStatus = scraperCircuitBreaker ? scraperCircuitBreaker.getStatus() : { state: 'CLOSED', failureCount: 0 };
    const rawFeedsCount = db.getRawFeedsCount();
    const scrapingGate = getScrapingGateState();
    const mirrorStatus = scrapingGate.enabled ? 'ONLINE' : 'BLOCKED · OFF';
    res.json({
      success: true,
      enabled: scrapingGate.enabled,
      scrapingGate,
      circuit: circuitStatus,
      rawFeedsCount,
      mirrors: [
        { name: 'Primary Flashscore Feed', url: 'https://www.flashscore.com/x/feed', status: mirrorStatus },
        { name: 'Ninja CDN English Primary', url: 'https://2.flashscore.ninja/2/x/feed', status: mirrorStatus },
        { name: 'Ninja CDN English Mirror 1', url: 'https://1.flashscore.ninja/2/x/feed', status: mirrorStatus },
        { name: 'Flashscore UK Mirror', url: 'https://www.flashscore.co.uk/x/feed', status: mirrorStatus },
        { name: 'Flashscore Global Mirror', url: 'https://www.flashscore.in/x/feed', status: mirrorStatus },
      ],
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to get scraper status' });
  }
});

settingsRouter.post('/scraping-toggle', (req, res) => {
  try {
    const requestedEnabled = Boolean(req.body?.enabled);

    if (requestedEnabled) {
      const gate = enableScrapingManually();
      flashscoreScraperService.clearCaches();
      fixturesWorkerService.clearLiveCache();

      loggerService.addLog({
        level: 'SUCCESS',
        category: 'SCRAPER',
        source: 'ScrapingGate',
        message: 'Data scraping manually switched ON.',
      });

      return res.json({
        success: true,
        scrapingGate: gate,
        message: 'Data scraping switched ON manually.',
      });
    } else {
      const activeJob = syncJobService.getActiveJob();
      if (activeJob && activeJob.jobType === 'FULL' && (activeJob.status === 'RUNNING' || activeJob.status === 'PENDING')) {
        return res.status(409).json({
          success: false,
          error: 'Cannot switch off data scraping while Full Data Sync is running.',
        });
      }

      const gate = disableScrapingManually();
      flashscoreScraperService.clearCaches();
      fixturesWorkerService.clearLiveCache();

      loggerService.addLog({
        level: 'INFO',
        category: 'SCRAPER',
        source: 'ScrapingGate',
        message: 'Data scraping manually switched OFF (all remote scraping blocked).',
      });

      return res.json({
        success: true,
        scrapingGate: gate,
        message: 'Data scraping switched OFF and blocked.',
      });
    }
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'Failed to toggle data scraping state',
    });
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
    if (!isSqliteEnabled()) {
      return res.status(409).json({
        success: false,
        sqliteBlocked: true,
        error: 'SQLite database is switched off. Enable SQLite DB manually before calculating predictions.',
      });
    }
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

settingsRouter.get('/volatility', async (_req, res) => {
  try {
    if (!isSqliteEnabled()) {
      return res.json({
        success: true,
        sqliteBlocked: true,
        leagues: [],
      });
    }
    await db.init();
    const leagues = db.getAllLeagueVolatilities();
    return res.json({
      success: true,
      sqliteBlocked: false,
      leagues,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to retrieve league volatility calibration metrics',
    });
  }
});

settingsRouter.post('/volatility/calibrate', async (_req, res) => {
  try {
    if (!isSqliteEnabled()) {
      return res.status(409).json({
        success: false,
        sqliteBlocked: true,
        error: 'SQLite database is switched off. Enable SQLite DB manually before calibrating league volatility.',
      });
    }
    await db.init();
    const settings = db.getSettings() || DEFAULT_ENGINE_SETTINGS;
    const matches = ServerEngine.getUnifiedHistoricalUniverse();
    const { records, globalLogLoss } = computeLeagueVolatilities(matches, {
      temperatureAlpha: settings.volatilityTemperatureAlpha ?? 1.0,
    });

    if (records.length > 0) {
      db.saveLeagueVolatilitiesBatch(records);
    }
    const saved = db.getAllLeagueVolatilities();
    const calibratedCount = saved.filter((r) => !r.is_fallback).length;
    const fallbackCount = saved.filter((r) => r.is_fallback).length;

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'PREDICTION',
      source: 'VolatilityCalibrator',
      message: `Calibrated League Volatility (V_L) across ${saved.length} competitions (${calibratedCount} calibrated >=100 matches, ${fallbackCount} neutral fallback V_L=1.00, LL_global=${globalLogLoss.toFixed(4)})`,
    });

    return res.json({
      success: true,
      globalLogLoss,
      totalLeagues: saved.length,
      calibratedCount,
      fallbackCount,
      leagues: saved,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to calibrate league volatility coefficients',
    });
  }
});
