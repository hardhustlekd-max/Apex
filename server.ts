import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './src/core/db.js';
import { predictionsDb } from './src/core/predictionsDb.js';
import { app } from './src/app.js';

async function startServer() {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Initialize Turso cloud database
  console.log('Initializing Turso LibSQL Cloud Database engine...');
  await db.init();
  try {
    await predictionsDb.init();
  } catch (err) {
    console.warn('predictionsDb init notice:', err);
  }

  // Initial fixture and historical match ingestion if tables are empty
  (async () => {
    try {
      const { ServerEngine } = await import('./src/core/serverEngine.js');
      const { DEFAULT_HISTORICAL_MATCHES } = await import('./src/core/defaultHistoricalMatches.js');

      if (predictionsDb.countHistoricalPredictions() === 0) {
        let rawHist = db.getAllHistoricalMatches(1500);
        if (rawHist.length === 0) {
          db.insertHistoricalMatches(DEFAULT_HISTORICAL_MATCHES);
          rawHist = DEFAULT_HISTORICAL_MATCHES;
        }
        await ServerEngine.predictAndStoreHistoricalMatches(rawHist);
      }

      if (db.getUpcomingFixturesCount() === 0) {
        const { flashscoreScraperService } = await import('./src/services/flashscoreScraperService.js');
        const { ServerPredictionGeneratorService } = await import('./src/services/serverPredictionGeneratorService.js');
        const initialUpcoming = await flashscoreScraperService.getUpcomingFixtures().catch(() => []);
        if (initialUpcoming && initialUpcoming.length > 0) {
          await ServerEngine.predictAndStoreUpcomingFixtures(initialUpcoming);
          const liveInUpcoming = initialUpcoming.filter((f) => f.status === 'LIVE');
          if (liveInUpcoming.length > 0) {
            await ServerEngine.predictAndStoreLiveFixtures(liveInUpcoming);
          }
        } else {
          await ServerPredictionGeneratorService.generateAndStorePredictionsFromDb();
        }
      }
    } catch (err: any) {
      console.warn('Boot background fixture/history seed notice:', err?.message);
    }
  })();

  // Vite integration: development middleware or static production serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚽ Football Prediction Engine server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
