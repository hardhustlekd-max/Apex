import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './src/core/db.js';
import { predictionsDb } from './src/core/predictionsDb.js';
import { app } from './src/app.js';

function resolvePort(): number {
  const portFlagIdx = process.argv.indexOf('--port');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const parsed = parseInt(process.argv[portFlagIdx + 1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const portEq = process.argv.find((arg) => arg.startsWith('--port='));
  if (portEq) {
    const parsed = parseInt(portEq.split('=')[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (process.env.PORT) {
    const parsed = parseInt(process.env.PORT, 10);
    if (Number.isFinite(parsed) && parsed > 0 && (process.env.NODE_ENV === 'production' || parsed !== 8080)) {
      return parsed;
    }
  }
  return 3000;
}

process.on('unhandledRejection', (reason) => {
  console.warn('[Server] Unhandled promise rejection:', reason);
});

async function startServer() {
  const PORT = resolvePort();
  const isHmrDisabled = process.env.DISABLE_HMR === 'true';

  // Initialize local SQLite database engine
  console.log('Initializing local SQLite database engine (better-sqlite3 WAL Mode)...');
  await db.init();
  try {
    await predictionsDb.init();
  } catch (err) {
    console.warn('predictionsDb init notice:', err);
  }

  // Vite integration: development middleware or static production serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ...(isHmrDisabled ? { hmr: false, ws: false, watch: null } : {}),
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚽ Football Prediction Engine server running on http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err: any) => {
    console.error('Server listen error:', err?.message || err);
    process.exit(1);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
