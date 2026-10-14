import { Router } from 'express';
import { db } from '../core/db.js';
import { FootballDataCSVParser } from '../core/csvParser.js';

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

statsRouter.post('/seed', (req, res) => {
  try {
    const { customCsv, defaultSeason, reset } = req.body;

    if (reset) {
      db.clearHistoricalData();
    }

    if (!customCsv || customCsv.trim().length === 0) {
      const stats = db.getStatsSummary();
      return res.json({
        success: true,
        message: 'No CSV data provided. Database ready for dataset upload.',
        stats,
      });
    }

    const parsedMatches = FootballDataCSVParser.parseCSV(customCsv, defaultSeason || '2024/2025');
    const inserted = db.insertHistoricalMatches(parsedMatches);
    const stats = db.getStatsSummary();

    res.json({
      success: true,
      message: `Database successfully ingested ${inserted} matches from CSV dataset.`,
      stats,
    });
  } catch (err: any) {
    console.error('Seed error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to seed database' });
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
