import express from 'express';
import path from 'path';
import { db } from './src/core/db.js';
import { predictionsDb } from './src/core/predictionsDb.js';
import { app } from './src/app.js';
import { fixturesWorkerService } from './src/services/fixturesWorkerService.js';

async function startServer() {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Initialize local SQLite database engine
  console.log('Initializing local SQLite database engine (better-sqlite3 WAL Mode)...');
  await db.init();
  try {
    await predictionsDb.init();
  } catch (err) {
    console.warn('predictionsDb init notice:', err);
  }

  // Warm the server-side fixtures projection worker index in the background
  void fixturesWorkerService.ensureIndexReady(false).catch((err) => {
    console.warn('fixturesWorkerService warmup notice:', err);
  });

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
