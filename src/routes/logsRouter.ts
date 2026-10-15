import { Router } from 'express';
import { loggerService, LogCategory, LogLevel } from '../services/loggerService.js';

export const logsRouter = Router();

// GET /api/logs
logsRouter.get('/', (req, res) => {
  try {
    const category = req.query.category as LogCategory | undefined;
    const level = req.query.level as LogLevel | undefined;
    const search = req.query.search as string | undefined;
    const limit = parseInt((req.query.limit as string) || '200', 10);

    const logs = loggerService.getLogs({ category, level, search, limit });
    res.json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch logs' });
  }
});

// POST /api/logs
logsRouter.post('/', (req, res) => {
  try {
    const { level, category, source, message, details } = req.body;
    if (!message || !source) {
      return res.status(400).json({ success: false, error: 'Message and source are required' });
    }

    const entry = loggerService.addLog({
      level: level || 'INFO',
      category: category || 'ENGINE',
      source,
      message,
      details,
    });

    res.json({ success: true, entry });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to record log' });
  }
});

// POST /api/logs/clear
logsRouter.post('/clear', (_req, res) => {
  try {
    loggerService.clearLogs();
    res.json({ success: true, message: 'Logs cleared successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to clear logs' });
  }
});
