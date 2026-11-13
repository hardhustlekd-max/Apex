import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { ServerEngine } from '../core/serverEngine.js';
import { Fixture, EngineSettings, AccumulatorSlip } from '../core/types.js';
import { getRelativeDateStr } from '../core/dateUtils.js';
import { loggerService } from './loggerService.js';
import { AccumulatorGenerator, isMatchStarted } from '../core/accumulator.js';

export interface SelectHighValueOptions {
  minEV?: number;
  minProb?: number;
  bankerOnly?: boolean;
  limit?: number;
}

export class ServerPredictionGeneratorService {
  /**
   * Retrieves predictions directly from database without re-running Poisson prediction engine if records exist.
   * Synthesizes predictions from historical DB dataset only if predictions database is empty.
   */
  public static async getPredictionsFromDb(filters?: {
    league?: string;
    dateFilter?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Fixture[]> {
    await db.init();
    await predictionsDb.init();

    // 1. Retrieve all upcoming fixtures from db
    const upcomingList = db.getUpcomingFixtures(filters);

    // 2. Retrieve calculated predictions from predictionsDb
    const predictionsList = await predictionsDb.getPredictionsAsync({ ...filters, state: 'all' });
    const predMap = new Map<string, Fixture>();
    for (const p of predictionsList) {
      if (p.id) {
        predMap.set(p.id, p);
        predMap.set(p.id.replace(/^fs_/, ''), p);
      }
    }

    // 3. If upcomingList has fixtures, combine them: attach prediction if eligible/stored, or leave unpredicted
    if (upcomingList.length > 0) {
      const mergedMap = new Map<string, Fixture>();
      for (const f of upcomingList) {
        const cleanId = (f.id || '').replace(/^fs_/, '');
        const p = predMap.get(f.id) || predMap.get(cleanId);
        if (p && p.prediction) {
          mergedMap.set(cleanId, {
            ...f,
            prediction: p.prediction,
            markets: p.markets || f.markets,
            mostLikelyOutcome: p.mostLikelyOutcome || f.mostLikelyOutcome,
            homeStats: p.homeStats || f.homeStats,
            awayStats: p.awayStats || f.awayStats,
            measurements: p.measurements || f.measurements,
            h2hMatches: p.h2hMatches || f.h2hMatches,
            information: p.information || f.information,
            statistics: p.statistics || f.statistics,
          });
        } else {
          // Ineligible / not yet predicted fixture -> strictly leave unpredicted
          // But still preserve details from upcoming_fixtures table if they exist
          mergedMap.set(cleanId, {
            ...f,
            prediction: undefined,
            h2hMatches: f.h2hMatches,
            information: f.information,
            statistics: f.statistics,
          });
        }
      }

      // Also ensure any standalone non-finished stored predictions not in upcomingList are included
      for (const p of predictionsList) {
        if ((p as any).match_state === 'completed' || p.status === 'FINISHED') continue;
        const cleanId = (p.id || '').replace(/^fs_/, '');
        if (!mergedMap.has(cleanId)) {
          mergedMap.set(cleanId, p);
        }
      }

      return Array.from(mergedMap.values());
    }

    // Fallback: Return stored predictions if upcoming fixtures table is not populated
    return predictionsList;
  }

  /**
   * Alias for getPredictionsFromDb to serve frontend UI
   */
  public static async getPredictionsForUi(filters?: {
    league?: string;
    dateFilter?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Fixture[]> {
    return this.getPredictionsFromDb(filters);
  }

  /**
   * Evaluates and extracts the maximum prediction percentage across ALL market categories
   * (1X2, Goals Over/Under 1.5, 2.5, 3.5, Both Teams to Score Yes/No, Double Chance 1X, X2, 12).
   */
  public static getMaxMarketPercentage(f: Fixture): {
    maxProb: number;
    maxMarketKey: string;
    maxMarketName: string;
    maxEV: number;
    allCategoryProbs: Record<string, number>;
  } {
    const pred = f.prediction;
    const markets = f.markets || [];

    let maxProb = 0;
    let maxMarketKey = 'BEST_VALUE';
    let maxMarketName = 'Best Value Pick';
    let maxEV = 0;

    const categoryProbs: Record<string, number> = {};

    if (pred) {
      categoryProbs['HOME_WIN'] = pred.homeWinProb || 0;
      categoryProbs['DRAW'] = pred.drawProb || 0;
      categoryProbs['AWAY_WIN'] = pred.awayWinProb || 0;
      categoryProbs['OVER_15'] = pred.over15Prob || 0;
      categoryProbs['OVER_25'] = pred.over25Prob || 0;
      categoryProbs['UNDER_25'] = pred.over25Prob !== undefined ? 1 - pred.over25Prob : 0;
      categoryProbs['OVER_35'] = pred.over35Prob || 0;
      categoryProbs['BTTS_YES'] = pred.bttsProb || 0;
      categoryProbs['BTTS_NO'] = pred.bttsProb !== undefined ? 1 - pred.bttsProb : 0;
      categoryProbs['DOUBLE_CHANCE_1X'] = Math.min(0.99, (pred.homeWinProb || 0) + (pred.drawProb || 0));
      categoryProbs['DOUBLE_CHANCE_X2'] = Math.min(0.99, (pred.awayWinProb || 0) + (pred.drawProb || 0));
    }

    // Evaluate markets array for highest prediction percentage across ALL market categories
    for (const m of markets) {
      if (m.probability > maxProb) {
        maxProb = m.probability;
        maxMarketKey = m.key;
        maxMarketName = m.name;
      }
      categoryProbs[m.key] = Math.max(categoryProbs[m.key] || 0, m.probability);
    }

    // Check all calculated category probabilities
    for (const [key, prob] of Object.entries(categoryProbs)) {
      if (prob > maxProb) {
        maxProb = prob;
        maxMarketKey = key;
        maxMarketName = key.replace(/_/g, ' ');
      }
    }

    return {
      maxProb,
      maxMarketKey,
      maxMarketName,
      maxEV,
      allCategoryProbs: categoryProbs,
    };
  }

  /**
   * Ranks and filters stored DB predictions based on prediction percentages across ALL market categories
   * (1X2, Over/Under Goals, Both Teams to Score, Double Chance).
   */
  public static selectHighValuePredictions(
    fixtures: Fixture[],
    options?: SelectHighValueOptions
  ): Fixture[] {
    const minProb = options?.minProb ?? 0.55;
    const minEV = options?.minEV ?? 1.0;
    const bankerOnly = options?.bankerOnly ?? false;
    const limit = options?.limit ?? 50;

    // Filter unstarted matches
    const candidates = fixtures.filter((f) => !isMatchStarted(f));

    // Calculate maximum market prediction percentage across all categories for each candidate
    const scoredCandidates = candidates.map((f) => {
      const marketAnalysis = this.getMaxMarketPercentage(f);
      return {
        fixture: f,
        maxProb: marketAnalysis.maxProb,
        maxMarketKey: marketAnalysis.maxMarketKey,
        maxMarketName: marketAnalysis.maxMarketName,
        maxEV: marketAnalysis.maxEV,
      };
    });

    // Filter based on all market categories prediction percentage threshold or banker status
    const highValueList = scoredCandidates.filter((item) => {
      if (bankerOnly) {
        return item.maxProb >= 0.68;
      }

      // Must meet minimum prediction percentage across any market category (e.g. >= 55%)
      const meetsProbThreshold = item.maxProb >= minProb;

      return meetsProbThreshold;
    });

    // Rank strictly descending by highest market category prediction percentage (and EV edge tiebreaker)
    highValueList.sort((a, b) => {
      if (Math.abs(b.maxProb - a.maxProb) > 0.01) {
        return b.maxProb - a.maxProb;
      }
      return b.maxEV - a.maxEV;
    });

    const result = highValueList.map((item) => item.fixture);

    if (limit && limit > 0) {
      return result.slice(0, limit);
    }

    return result;
  }

  /**
   * Selects high-value predictions from database and feeds them directly into the Accumulator Generator UI
   */
  public static async generateHighValueAccumulators(
    dateScope = 'TODAY',
    stake = 10,
    clientFixtures?: Fixture[]
  ): Promise<Record<string, AccumulatorSlip>> {
    await db.init();
    await predictionsDb.init();

    const settings: EngineSettings = db.getSettings() || {
      
      rollingMatchWindow: 15,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    // Retrieve predictions directly from DB without re-predicting if records exist
    let availableFixtures: Fixture[] = Array.isArray(clientFixtures) && clientFixtures.length > 0
      ? clientFixtures
      : await this.getPredictionsFromDb({ dateFilter: dateScope === 'ALL' ? undefined : dateScope });

    if (availableFixtures.length === 0) {
      availableFixtures = await this.getPredictionsFromDb();
    }

    // Select high-value predictions ranked across ALL market categories based on prediction percentage
    const highValueFixtures = this.selectHighValuePredictions(availableFixtures);
    const fixturesForAcca = highValueFixtures.length >= 3 ? highValueFixtures : availableFixtures;

    // 1. Banker Acca
    const bankerSlip = AccumulatorGenerator.generateSlip(
      fixturesForAcca,
      {
        strategy: 'BANKER',
        legCount: 3,
        minProbability: 0.68,
        stake,
        dateFilter: dateScope,
        allowedMarkets: ['HOME_WIN', 'AWAY_WIN', 'DOUBLE_CHANCE_1X', 'DOUBLE_CHANCE_X2', 'OVER_25'],
      },
      settings
    );

    // 2. High Confidence Acca
    const probSlip = AccumulatorGenerator.generateSlip(
      fixturesForAcca,
      {
        strategy: 'PROBABILITY_CHASE',
        legCount: 4,
        stake,
        dateFilter: dateScope,
        allowedMarkets: ['HOME_WIN', 'AWAY_WIN', 'OVER_25', 'BTTS_YES', 'DRAW'],
      },
      settings
    );

    // 3. High Goals Acca
    const goalsSlip = AccumulatorGenerator.generateSlip(
      fixturesForAcca,
      {
        strategy: 'CUSTOM',
        legCount: 4,
        stake,
        dateFilter: dateScope,
        allowedMarkets: ['OVER_25', 'BTTS_YES'],
      },
      settings
    );
    goalsSlip.name = dateScope === 'TODAY' ? "Today's High Goals Acca" : 'High Goals & BTTS Combo';

    // 4. Mega Combo Acca
    const megaSlip = AccumulatorGenerator.generateSlip(
      fixturesForAcca,
      {
        strategy: 'CUSTOM',
        legCount: 6,
        stake,
        dateFilter: dateScope,
        allowedMarkets: ['HOME_WIN', 'AWAY_WIN', 'OVER_25', 'BTTS_YES', 'DOUBLE_CHANCE_1X'],
      },
      settings
    );
    megaSlip.name = dateScope === 'TODAY' ? "Today's 6-Fold Mega Acca" : 'Mega Accumulator';

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'PREDICTION',
      source: 'ServerPredictionGeneratorService',
      message: `Fed ${highValueFixtures.length} high-value DB predictions (ranked across all market categories) directly to Accumulator Generator UI`,
      details: {
        dateScope,
        highValueCount: highValueFixtures.length,
        totalAvailable: availableFixtures.length,
      },
    });

    return {
      BANKER: bankerSlip,
      PROBABILITY_CHASE: probSlip,
      HIGH_GOALS: goalsSlip,
      MEGA_COMBO: megaSlip,
    };
  }
}
