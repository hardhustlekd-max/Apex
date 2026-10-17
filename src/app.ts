import express, { Express } from 'express';
import compression from 'compression';
import { db } from './core/db.js';
import { predictionsDb } from './core/predictionsDb.js';
import { fixturesRouter } from './routes/fixturesRouter.js';
import { accumulatorRouter } from './routes/accumulatorRouter.js';
import { settingsRouter } from './routes/settingsRouter.js';
import { providersRouter } from './routes/providersRouter.js';
import { statsRouter } from './routes/statsRouter.js';
import { tipsRouter } from './routes/tipsRouter.js';
import { logsRouter } from './routes/logsRouter.js';
import { flashscoreScraperService } from './services/flashscoreScraperService.js';

export function createApp(): Express {
  const app = express();

  app.use(compression());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Middleware to ensure DB is initialized on incoming requests
  app.use(async (_req, _res, next) => {
    try {
      await db.init();
      await predictionsDb.init();
      next();
    } catch (err) {
      next(err);
    }
  });

  // Health check endpoint
  const healthHandler = (_req: express.Request, res: express.Response) => {
    res.json({
      status: 'ok',
      engine: 'Poisson Football Prediction & Accumulator Engine',
      timestamp: new Date().toISOString(),
      database: 'SQLite (sql.js WASM)',
    });
  };

  app.get('/api/health', healthHandler);
  app.get('/health', healthHandler);

  // Mount API routers under /api/...
  app.use('/api/fixtures', fixturesRouter);
  app.use('/api/accumulator', accumulatorRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/providers', providersRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/tips', tipsRouter);
  app.use('/api/logs', logsRouter);

  const standingsHandler = async (req: express.Request, res: express.Response) => {
    try {
      const league = (req.params.league || req.query.league || 'england_premier_league') as string;
      const standings = await flashscoreScraperService.getLeagueStandings(league);
      res.json({ success: true, league, standings });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch league standings' });
    }
  };

  app.get('/api/standings/:league', standingsHandler);
  app.get('/api/standings', standingsHandler);

  // Also mount without /api prefix in case serverless gateway strips /api
  app.use('/fixtures', fixturesRouter);
  app.use('/accumulator', accumulatorRouter);
  app.use('/settings', settingsRouter);
  app.use('/providers', providersRouter);
  app.use('/stats', statsRouter);
  app.use('/tips', tipsRouter);
  app.use('/logs', logsRouter);
  app.get('/standings/:league', standingsHandler);
  app.get('/standings', standingsHandler);

  return app;
}

export const app = createApp();
