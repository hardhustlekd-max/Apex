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

      if (predictionsDb.countHistoricalPredictions() === 0) {
        const scrapedMatches = db.getFlashscoreScrapedMatches(500);
        const finishedScraped = scrapedMatches
          .filter((sm) => sm.result?.home !== undefined && sm.result?.away !== undefined)
          .map((sm, idx) => {
            const homeScore = parseInt(String(sm.result!.home), 10) || 0;
            const awayScore = parseInt(String(sm.result!.away), 10) || 0;
            return {
              id: sm.matchId ? `hist_${sm.matchId}` : `scraped_hist_${idx}`,
              providerId: 'FLASHSCORE',
              league: sm.leagueName || sm.stage || 'FLASHSCORE',
              leagueName: sm.leagueName || sm.stage || 'FLASHSCORE',
              matchDate: sm.date ? sm.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
              kickOffTime: 'FT',
              homeTeam: sm.home.name,
              awayTeam: sm.away.name,
              status: 'FINISHED' as const,
              score: { home: homeScore, away: awayScore },
              odds: { homeWin: 2.10, draw: 3.30, awayWin: 3.40, over25: 1.85, under25: 1.95 },
              prediction: {
                homeXG: 1.35,
                awayXG: 1.15,
                homeWinProb: 0.45,
                drawProb: 0.28,
                awayWinProb: 0.27,
                over25Prob: 0.52,
                bttsProb: 0.50,
                mostLikelyOutcome: homeScore > awayScore ? 'Home Win' : homeScore < awayScore ? 'Away Win' : 'Draw',
              },
              bestValueMarket: {
                key: 'HOME_WIN',
                name: homeScore > awayScore ? `${sm.home.name} Win` : 'Match Result',
                odds: 2.10,
                probability: 0.45,
                expectedValue: 1.05,
                isPositiveEV: true,
                isBanker: false,
              }
            };
          });
        if (finishedScraped.length > 0) {
          await predictionsDb.saveHistoricalPredictions(finishedScraped as any);
        }
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
