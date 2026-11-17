import { Router } from 'express';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { collectEngineStatsSummary } from '../services/syncJobService.js';

export const statsRouter = Router();

statsRouter.get('/', async (_req, res) => {
  try {
    await db.init();
    await predictionsDb.init();
    const stats = await collectEngineStatsSummary();
    res.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to get stats' });
  }
});
