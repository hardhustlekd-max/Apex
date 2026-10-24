import { Router } from 'express';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { providerManager } from '../providers/providerManager.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';
import { ApexEngine } from '../core/poisson.js';
import { AccumulatorGenerator, AccaGenerationParams, isMatchStarted } from '../core/accumulator.js';
import { EngineSettings, Fixture } from '../core/types.js';
import { ServerEngine } from '../core/serverEngine.js';
import { loggerService } from '../services/loggerService.js';
import { ServerPredictionGeneratorService } from '../services/serverPredictionGeneratorService.js';

export const accumulatorRouter = Router();

async function handlePrebuiltGeneration(req: any, res: any) {
  try {
    const dateScope = (req.body?.dateScope || req.query?.dateScope || 'TODAY') as any;
    const stake = Number(req.body?.stake || req.query?.stake) || 10;
    const clientFixtures = req.body?.fixtures;

    // Use ServerPredictionGeneratorService to select high-value predictions directly from DB
    const slips = await ServerPredictionGeneratorService.generateHighValueAccumulators(
      dateScope,
      stake,
      clientFixtures
    );

    res.json({
      success: true,
      slips,
    });
  } catch (err: any) {
    console.error('Error generating prebuilt accumulators on server:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to generate prebuilt accumulators' });
  }
}

accumulatorRouter.post('/prebuilt', handlePrebuiltGeneration);
accumulatorRouter.get('/prebuilt', handlePrebuiltGeneration);

accumulatorRouter.post('/generate', async (req, res) => {
  try {
    const params: AccaGenerationParams = req.body || {};
    const settings: EngineSettings = db.getSettings() || {
      activeProvider: 'FLASHSCORE',
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    // Retrieve predictions directly from DB
    const dbFixtures = await ServerPredictionGeneratorService.getPredictionsFromDb();
    const highValueFixtures = ServerPredictionGeneratorService.selectHighValuePredictions(dbFixtures);
    const candidateFixtures = highValueFixtures.length >= 3 ? highValueFixtures : dbFixtures;

    const unstartedFixtures = candidateFixtures.filter((f) => !isMatchStarted(f));
    const slip = AccumulatorGenerator.generateSlip(unstartedFixtures, params, settings);

    res.json({
      success: true,
      slip,
    });
  } catch (err: any) {
    console.error('Error generating accumulator slip:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to generate accumulator' });
  }
});
