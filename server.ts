import express from 'express';
import fs from 'fs';
import path from 'path';
import { app } from './src/app.js';
import { getSqliteGateState } from './src/core/sqliteClient.js';

async function startServer() {
  const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
  const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

  // SQLite DB initialization is intentionally blocked at startup unless switched on manually
  const gate = getSqliteGateState();
  console.log(
    `[SQLite] Startup initialization blocked (enabled=${gate.enabled}, dbExists=${gate.dbExists}). Waiting for manual switch.`
  );

  const distPath = path.join(process.cwd(), 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  const isProdEnv = process.env.NODE_ENV === 'production';

  // Vite integration: development middleware when Vite is available in non-production, otherwise static production serving
  let useViteDevMiddleware = !isProdEnv;
  if (useViteDevMiddleware) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      if (fs.existsSync(distIndexPath)) {
        console.warn('[Server] Vite dev dependency unavailable; serving static production build from dist/.');
        useViteDevMiddleware = false;
      } else {
        throw err;
      }
    }
  }

  if (!useViteDevMiddleware) {
    if (!fs.existsSync(distIndexPath)) {
      throw new Error(`Production frontend bundle missing at ${distIndexPath}. Run "npm run build" first.`);
    }
    app.use(express.static(distPath));
    app.use('/api', (_req, res) => {
      res.status(404).json({ error: 'API endpoint not found' });
    });
    app.get('*', (_req, res) => {
      res.sendFile(distIndexPath);
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Football Prediction Engine server running on http://0.0.0.0:${PORT}`);
  });

  // Prevent 502 Bad Gateway races behind Railway / Envoy load balancers (60s proxy keep-alive)
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
