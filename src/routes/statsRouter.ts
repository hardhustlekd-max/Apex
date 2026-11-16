import { Router } from 'express';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';

export const statsRouter = Router();

statsRouter.get('/', async (req, res) => {
  try {
    await db.init();
    await predictionsDb.init();
    const baseStats = db.getStatsSummary();
    const rawFeedsCount = db.getRawFeedsCount();
    const upcomingDbCount = db.getUpcomingFixturesCount();
    const totalPredCount = await predictionsDb.countAsync('all');
    const upcomingPredCount = await predictionsDb.countAsync('upcoming');
    const histPredCount = predictionsDb.countHistoricalPredictions();

    const stats = {
      ...baseStats,
      rawFeedsCount,
      upcomingCount: upcomingDbCount > 0 ? upcomingDbCount : upcomingPredCount,
      predictionsCount: totalPredCount,
      upcomingPredictionsCount: upcomingPredCount,
      historicalPredictionsCount: histPredCount,
      totalMatches: Math.max(baseStats.totalMatches, histPredCount),
    };
    res.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to get stats' });
  }
});

statsRouter.post('/reset', (_req, res) => {
  res.status(403).json({
    success: false,
    error: 'Database clearing is restricted strictly to Full Sync and Update Predictions processes.',
  });
});

statsRouter.post('/clear', (_req, res) => {
  res.status(403).json({
    success: false,
    error: 'Database clearing is restricted strictly to Full Sync and Update Predictions processes.',
  });
});
