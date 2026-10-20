import { Router } from 'express';
import { db } from '../core/db.js';

export const statsRouter = Router();

statsRouter.get('/', (req, res) => {
  try {
    const stats = db.getStatsSummary();
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
    db.clearHistoricalData();
    const stats = db.getStatsSummary();
    res.json({
      success: true,
      message: 'Database tables and caches successfully reset.',
      stats,
    });
  } catch (err: any) {
    console.error('Reset error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to reset database' });
  }
});

statsRouter.post('/clear', (req, res) => {
  try {
    db.clearHistoricalData();
    res.json({
      success: true,
      message: 'Historical matches table cleared.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to clear database' });
  }
});
