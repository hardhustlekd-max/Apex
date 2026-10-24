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

    // 1. First retrieve existing predictions from predictionsDb
    let predictions = predictionsDb.getPredictions(filters);

    // 2. Fallback to db.getUpcomingFixtures if predictionsDb was empty for this query
    if (predictions.length === 0) {
      predictions = db.getUpcomingFixtures(filters);
    }

    // 3. Only if database has zero predictions at all, trigger initial synthesis from historical match dataset
    if (predictions.length === 0 && predictionsDb.count() === 0 && db.getUpcomingFixturesCount() === 0) {
      loggerService.addLog({
        level: 'INFO',
        category: 'PREDICTION',
        source: 'ServerPredictionGeneratorService',
        message: 'Predictions database empty. Synthesizing initial predictions from SQLite historical database...',
      });
      await this.synthesizeAndStorePredictionsFromDb();
      predictions = predictionsDb.getPredictions(filters);
      if (predictions.length === 0) {
        predictions = db.getUpcomingFixtures(filters);
      }
    }

    return predictions;
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
        maxEV = m.expectedValue || 0;
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
        return item.maxProb >= 0.68 || item.fixture.bestValueMarket?.isBanker;
      }

      // Must meet minimum prediction percentage across any market category (e.g. >= 55%)
      const meetsProbThreshold = item.maxProb >= minProb;
      const possessesEVEdge = item.maxEV >= minEV || item.fixture.bestValueMarket?.isPositiveEV;
      const isBanker = item.fixture.bestValueMarket?.isBanker;

      return meetsProbThreshold || possessesEVEdge || isBanker;
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
      activeProvider: 'FLASHSCORE',
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
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

    // 2. Value Hunter Acca (+EV Edge)
    const valueSlip = AccumulatorGenerator.generateSlip(
      fixturesForAcca,
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
      fixturesForAcca,
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
    goalsSlip.name = dateScope === 'TODAY' ? "Today's High Value Goals Acca" : 'High Value Goals & BTTS Combo';

    // 4. Mega Combo Acca
    const megaSlip = AccumulatorGenerator.generateSlip(
      fixturesForAcca,
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
    megaSlip.name = dateScope === 'TODAY' ? "Today's High Value 6-Fold Mega" : 'High Value Mega Accumulator';

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
      VALUE_HUNTER: valueSlip,
      HIGH_GOALS: goalsSlip,
      MEGA_COMBO: megaSlip,
    };
  }

  /**
   * Internal helper: Synthesizes initial predictions from SQLite historical database if predictions DB is totally empty
   */
  public static async generateAndStorePredictionsFromDb(settings?: EngineSettings, daysAhead = 7): Promise<Fixture[]> {
    return this.synthesizeAndStorePredictionsFromDb(daysAhead);
  }

  private static async synthesizeAndStorePredictionsFromDb(daysAhead = 7): Promise<Fixture[]> {
    const historicalUniverse = ServerEngine.getUnifiedHistoricalUniverse();
    if (historicalUniverse.length === 0) return [];

    const activeSettings: EngineSettings = db.getSettings() || {
      activeProvider: 'FLASHSCORE',
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    const leagueTeamsMap = new Map<string, { code: string; leagueName: string; teams: Set<string> }>();
    const leagueNameMap: Record<string, string> = {
      'E0': 'England: Premier League',
      'england_premier_league': 'England: Premier League',
      'E1': 'England: Championship',
      'england_championship': 'England: Championship',
      'SP1': 'Spain: La Liga',
      'spain_la_liga': 'Spain: La Liga',
      'D1': 'Germany: Bundesliga',
      'germany_bundesliga': 'Germany: Bundesliga',
      'I1': 'Italy: Serie A',
      'italy_serie_a': 'Italy: Serie A',
      'F1': 'France: Ligue 1',
      'france_ligue_1': 'France: Ligue 1',
      'N1': 'Netherlands: Eredivisie',
      'netherlands_eredivisie': 'Netherlands: Eredivisie',
      'P1': 'Portugal: Primeira Liga',
      'portugal_primeira_liga': 'Portugal: Primeira Liga',
      'europe_champions_league': 'Europe: UEFA Champions League',
    };

    for (const m of historicalUniverse) {
      const rawDiv = m.div || 'E0';
      const divCode = rawDiv.toLowerCase();
      const friendlyName = (m as any).leagueName || leagueNameMap[rawDiv] || leagueNameMap[divCode] || `League: ${rawDiv}`;

      if (!leagueTeamsMap.has(divCode)) {
        leagueTeamsMap.set(divCode, {
          code: divCode,
          leagueName: friendlyName,
          teams: new Set<string>(),
        });
      }

      const leagueEntry = leagueTeamsMap.get(divCode)!;
      if (m.homeTeam && m.homeTeam.trim().length > 1) leagueEntry.teams.add(m.homeTeam.trim());
      if (m.awayTeam && m.awayTeam.trim().length > 1) leagueEntry.teams.add(m.awayTeam.trim());
    }

    const generatedFixtures: Fixture[] = [];
    let fixtureCounter = 1000;
    const timeSlots = ['12:30', '15:00', '17:30', '19:45', '20:00', '21:00'];

    for (const [divCode, entry] of leagueTeamsMap.entries()) {
      const teamList = Array.from(entry.teams);
      if (teamList.length < 2) continue;

      for (let i = 0; i < teamList.length - 1; i += 2) {
        const homeTeam = teamList[i];
        const awayTeam = teamList[i + 1];
        if (!homeTeam || !awayTeam || homeTeam === awayTeam) continue;

        const dayOffset = (generatedFixtures.length % daysAhead);
        const matchDate = getRelativeDateStr(dayOffset);
        const kickOffTime = timeSlots[generatedFixtures.length % timeSlots.length];

        fixtureCounter++;
        const fixtureId = `db_gen_${divCode}_${fixtureCounter}`;

        generatedFixtures.push({
          id: fixtureId,
          providerId: 'DB_GENERATOR',
          league: divCode,
          leagueName: entry.leagueName,
          matchDate,
          kickOffTime,
          homeTeam,
          awayTeam,
          stage: entry.leagueName,
          status: 'SCHEDULED',
          odds: { homeWin: 2.10, draw: 3.30, awayWin: 3.40, over25: 1.85, under25: 1.95, bttsYes: 1.80, bttsNo: 2.00 },
        });
      }
    }

    const cachedH2HMap = db.getAllPredictionMeasurements();
    const enrichedPredictions: Fixture[] = generatedFixtures.map((f) => {
      const cleanId = f.id.replace(/^fs_/, '');
      const cachedH2H = cachedH2HMap.get(cleanId) || cachedH2HMap.get(f.id);
      return ServerEngine.predictFixtureUnified(f, historicalUniverse, activeSettings, cachedH2H);
    });

    await db.saveUpcomingFixtures(enrichedPredictions);
    await predictionsDb.savePredictions(enrichedPredictions);

    return enrichedPredictions;
  }
}
