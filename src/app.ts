import express, { Express } from 'express';
import compression from 'compression';
import { fixturesRouter } from './routes/fixturesRouter.js';
import { settingsRouter } from './routes/settingsRouter.js';
import { providersRouter } from './routes/providersRouter.js';
import { statsRouter } from './routes/statsRouter.js';
import { logsRouter } from './routes/logsRouter.js';

export function createApp(): Express {
  const app = express();

  app.use(compression());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const healthHandler = (_req: express.Request, res: express.Response) => {
    res.json({
      status: 'ok',
      engine: 'Poisson Football Prediction & Analytics Engine',
      timestamp: new Date().toISOString(),
      database: 'Local SQLite (better-sqlite3 WAL Mode)',
    });
  };

  app.get('/api/health', healthHandler);
  app.get('/health', healthHandler);

  // Mount active API routers under /api/...
  app.use('/api/fixtures', fixturesRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/providers', providersRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/logs', logsRouter);

  // Also mount without /api prefix in case serverless gateway strips /api
  app.use('/fixtures', fixturesRouter);
  app.use('/settings', settingsRouter);
  app.use('/providers', providersRouter);
  app.use('/stats', statsRouter);
  app.use('/logs', logsRouter);

  return app;
}

export const app = createApp();
