import express from 'express';
import path from 'path';
import { app } from './src/app.js';
import { getSqliteGateState } from './src/core/sqliteClient.js';

async function startServer() {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // SQLite DB initialization is intentionally blocked at startup unless switched on manually
  const gate = getSqliteGateState();
  console.log(
    `[SQLite] Startup initialization blocked (enabled=${gate.enabled}, dbExists=${gate.dbExists}). Waiting for manual switch.`
  );

  // Vite integration: development middleware or static production serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use('/api', (_req, res) => {
      res.status(404).json({ error: 'API endpoint not found' });
    });
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Football Prediction Engine server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
