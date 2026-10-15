import { Router } from 'express';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { providerManager } from '../providers/providerManager.js';
import { ApexEngine } from '../core/poisson.js';
import { AccumulatorGenerator, AccaGenerationParams, isMatchStarted } from '../core/accumulator.js';
import { EngineSettings, Fixture } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import { loggerService } from '../services/loggerService.js';

export const accumulatorRouter = Router();

async function handlePrebuiltGeneration(req: any, res: any) {
  try {
    const dateScope = (req.body?.dateScope || req.query?.dateScope || 'TODAY') as any;
    const stake = Number(req.body?.stake || req.query?.stake) || 10;
    const clientFixtures = req.body?.fixtures;

    const settings: EngineSettings = db.getSettings() || {
      activeProvider: 'FLASHSCORE',
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    let fixturesToUse: Fixture[] = [];

    if (Array.isArray(clientFixtures) && clientFixtures.length > 0) {
      fixturesToUse = clientFixtures;
    } else {
      await predictionsDb.init();
      if (predictionsDb.count() > 0) {
        fixturesToUse = predictionsDb.getAllPredictions();
      } else {
        const provider = providerManager.getActiveProvider();
        const rawFixtures = await provider.getUpcomingFixtures();
        const allMatches = EngineService.getUnifiedHistoricalUniverse();
        const cachedH2HMap = db.getAllPredictionMeasurements();

        fixturesToUse = rawFixtures.map((f) => {
          if (f.prediction && f.markets && f.markets.length > 0) {
            return f;
          }
          const cleanId = (f.id || '').replace(/^fs_/, '');
          const cachedH2H = cachedH2HMap.get(cleanId) ||
            cachedH2HMap.get(f.id) ||
            (f.prediction?.measurements?.h2h && f.prediction.measurements.h2h.matchesCount > 0 ? f.prediction.measurements.h2h : null);

          const tacticalInput = {
            information: f.information,
            restDaysHome: f.restDaysHome,
            restDaysAway: f.restDaysAway,
            stage: f.stage,
          };

          return EngineService.predictFixtureUnified(f, allMatches, settings, cachedH2H, tacticalInput);
        });
      }
    }

    // Exclude matches that have already started or kicked off
    fixturesToUse = fixturesToUse.filter((f) => !isMatchStarted(f));

    // Cross-check against active live matches to guarantee no in-play games are selected
    try {
      const activeLiveScores = await providerManager.getActiveProvider().getLiveScores();
      if (Array.isArray(activeLiveScores) && activeLiveScores.length > 0) {
        const liveIds = new Set<string>();
        const liveTeams = new Set<string>();
        for (const ls of activeLiveScores) {
          if (ls.fixtureId) liveIds.add(ls.fixtureId.toLowerCase());
          if (ls.homeTeam) liveTeams.add(ls.homeTeam.toLowerCase().trim());
          if (ls.awayTeam) liveTeams.add(ls.awayTeam.toLowerCase().trim());
        }
        fixturesToUse = fixturesToUse.filter((f) => {
          if (liveIds.has(f.id.toLowerCase())) return false;
          if (liveTeams.has(f.homeTeam.toLowerCase().trim()) && liveTeams.has(f.awayTeam.toLowerCase().trim())) return false;
          return true;
        });
      }
    } catch {
      // non-blocking
    }

    // 1. Banker Acca
    const bankerSlip = AccumulatorGenerator.generateSlip(
      fixturesToUse,
      {
        strategy: 'BANKER',
        legCount: 3,
        minProbability: 0.68,
        stake,
        dateFilter: dateScope,
        allowedMarkets: ['HOME_WIN', 'AWAY_WIN', 'DOUBLE_CHANCE_1X', 'DOUBLE_CHANCE_X2', 'OVER_15' as any],
      },
      settings
    );

    // 2. Value Hunter Acca
    const valueSlip = AccumulatorGenerator.generateSlip(
      fixturesToUse,
      {
        strategy: 'VALUE_HUNTER',
        legCount: 4,
        stake,
        dateFilter: dateScope,
        allowedMarkets: ['HOME_WIN', 'AWAY_WIN', 'OVER_25', 'BTTS_YES', 'DRAW'],
      },
      settings
    );

    // 3. High Goals Acca
    const goalsSlip = AccumulatorGenerator.generateSlip(
      fixturesToUse,
      {
        strategy: 'CUSTOM',
        legCount: 4,
        targetOdds: 6.0,
        stake,
        dateFilter: dateScope,
        allowedMarkets: ['OVER_25', 'BTTS_YES'],
      },
      settings
    );
    goalsSlip.name = dateScope === 'TODAY' ? "Today's High Goals Combo" : 'High Goals & BTTS Acca';

    // 4. Mega Combo Acca
    const megaSlip = AccumulatorGenerator.generateSlip(
      fixturesToUse,
      {
        strategy: 'CUSTOM',
        legCount: 6,
        targetOdds: 20.0,
        stake,
        dateFilter: dateScope,
        allowedMarkets: ['HOME_WIN', 'AWAY_WIN', 'OVER_25', 'BTTS_YES', 'DOUBLE_CHANCE_1X'],
      },
      settings
    );
    megaSlip.name = dateScope === 'TODAY' ? "Today's 6-Fold Mega Acca" : 'Weekend Mega Accumulator';

    res.json({
      success: true,
      slips: {
        BANKER: bankerSlip,
        VALUE_HUNTER: valueSlip,
        HIGH_GOALS: goalsSlip,
        MEGA_COMBO: megaSlip,
      },
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
    const provider = providerManager.getActiveProvider();
    const settings: EngineSettings = db.getSettings() || {
      activeProvider: 'FLASHSCORE',
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    const rawFixtures = await provider.getUpcomingFixtures();
    const allMatches = EngineService.getUnifiedHistoricalUniverse();
    const cachedH2HMap = db.getAllPredictionMeasurements();

    // Enrich all fixtures with Poisson predictions & markets using the unified engine
    const enrichedFixtures: Fixture[] = rawFixtures.map((f) => {
      if (f.prediction && f.markets && f.markets.length > 0) {
        return f;
      }
      const cleanId = (f.id || '').replace(/^fs_/, '');
      const cachedH2H = cachedH2HMap.get(cleanId) ||
        cachedH2HMap.get(f.id) ||
        (f.prediction?.measurements?.h2h && f.prediction.measurements.h2h.matchesCount > 0 ? f.prediction.measurements.h2h : null);

      const tacticalInput = {
        information: f.information,
        restDaysHome: f.restDaysHome,
        restDaysAway: f.restDaysAway,
        stage: f.stage,
      };

      const predicted = EngineService.predictFixtureUnified(f, allMatches, settings, cachedH2H, tacticalInput);
      loggerService.addLog({
        level: 'INFO',
        category: 'ENGINE',
        source: 'AccumulatorRouter',
        message: `Processed prediction for fixture ${predicted.homeTeam} vs ${predicted.awayTeam}`,
      });
      return predicted;
    });

    const unstartedFixtures = enrichedFixtures.filter((f) => !isMatchStarted(f));
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
