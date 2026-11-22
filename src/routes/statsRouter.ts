import { Router } from 'express';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { getSqliteDbStats, getSqliteGateState, isSqliteEnabled } from '../core/sqliteClient.js';
import { collectEngineStatsSummary } from '../services/syncJobService.js';

export const statsRouter = Router();

statsRouter.get('/', async (_req, res) => {
  try {
    if (!isSqliteEnabled()) {
      const gate = getSqliteGateState();
      return res.json({
        success: true,
        sqliteBlocked: true,
        sqliteGate: gate,
        stats: {
          totalMatches: 0,
          totalTeams: 0,
          dbSizeMB: getSqliteDbStats().sizeMB,
          sqliteStats: getSqliteDbStats(),
          rawFeedsCount: 0,
          upcomingCount: 0,
          predictionsCount: 0,
          upcomingPredictionsCount: 0,
          historicalCount: 0,
          historicalPredictionsCount: 0,
          leagues: [],
        },
      });
    }
    await db.init();
    await predictionsDb.init();
    const stats = await collectEngineStatsSummary();
    res.json({
      success: true,
      sqliteBlocked: false,
      sqliteGate: getSqliteGateState(),
      stats,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to get stats' });
  }
});
