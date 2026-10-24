import { Router } from 'express';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';

export const statsRouter = Router();

statsRouter.get('/', (req, res) => {
  try {
    const baseStats = db.getStatsSummary();
    const stats = {
      ...baseStats,
      rawFeedsCount: db.getRawFeedsCount(),
      upcomingCount: db.getUpcomingFixturesCount(),
      predictionsCount: predictionsDb.count(),
    };
    res.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to get stats' });
  }
});

statsRouter.post('/reset', (req, res) => {
  try {
    const clearRaw = req.body?.clearRaw !== false;
    db.clearAllData(clearRaw);
    predictionsDb.clearAll();
    const baseStats = db.getStatsSummary();
    const stats = {
      ...baseStats,
      rawFeedsCount: db.getRawFeedsCount(),
      upcomingCount: db.getUpcomingFixturesCount(),
      predictionsCount: predictionsDb.count(),
    };
    res.json({
      success: true,
      message: 'Database tables, raw feeds, and predictions successfully reset.',
      stats,
    });
  } catch (err: any) {
    console.error('Reset error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to reset database' });
  }
});

statsRouter.post('/clear', (req, res) => {
  try {
    db.clearAllData(true);
    predictionsDb.clearAll();
    res.json({
      success: true,
      message: 'Historical matches table and caches cleared.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to clear database' });
  }
});
