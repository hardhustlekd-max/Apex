import { db } from './db.js';
import { predictionsDb } from './predictionsDb.js';
import {
  Fixture,
  EngineSettings,
  HistoricalMatch,
  HeadToHeadMeasurement,
} from './types.js';
import { ApexEngine } from './poisson.js';

import { loggerService } from '../services/loggerService.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';
import { matchesLeague } from './leagueMapper.js';

export class ServerEngine {
  public static getUnifiedHistoricalUniverse(): HistoricalMatch[] {
    const rawHist = db.getAllHistoricalMatches(1500);
    const scrapedMatches = db.getFlashscoreScrapedMatches(500);
    const scrapedAsHistorical: HistoricalMatch[] = scrapedMatches
      .filter((sm) => sm.result?.home !== undefined && sm.result?.away !== undefined)
      .map((sm, idx) => {
        const homeScore = parseInt(String(sm.result!.home), 10) || 0;
        const awayScore = parseInt(String(sm.result!.away), 10) || 0;
        const ftr: 'H' | 'D' | 'A' = homeScore > awayScore ? 'H' : homeScore < awayScore ? 'A' : 'D';
        return {
          id: sm.matchId || `scraped_${idx}`,
          div: sm.leagueName || sm.stage || 'FLASHSCORE',
          season: sm.season || '2024/2025',
          leagueName: sm.leagueName || sm.stage || 'FLASHSCORE',
          matchDate: sm.date ? sm.date.slice(0, 10) : '2024-01-01',
          homeTeam: sm.home.name,
          awayTeam: sm.away.name,
          fthg: homeScore,
          ftag: awayScore,
          ftr,
          restDaysHome: 7,
          restDaysAway: 7,
        };
      });
    const universe = [...rawHist, ...scrapedAsHistorical];
    loggerService.addLog({
      level: 'INFO',
      category: 'ENGINE',
      source: 'ServerEngine',
      message: `Retrieved unified historical universe: ${rawHist.length} historical + ${scrapedAsHistorical.length} scraped matches`,
    });
    return universe;
  }

  public static predictFixtureUnified(
    f: Fixture,
    allMatches: HistoricalMatch[],
    settings: EngineSettings,
    cachedH2H?: HeadToHeadMeasurement | null,
    tacticalInput?: any,
    scrapedMap?: Map<string, any>
  ): Fixture {
    const leagueMatches = allMatches.filter((m) =>
      matchesLeague(m.div, (m as any).leagueName, f.league) ||
      matchesLeague(m.div, (m as any).leagueName, f.leagueName)
    );
    const historicalContext = leagueMatches.length >= 10 ? leagueMatches : allMatches;

    const { prediction, homeStats, awayStats } = ApexEngine.predictMatch(
      f.homeTeam,
      f.awayTeam,
      historicalContext,
      settings,
      cachedH2H,
      allMatches,
      tacticalInput
    );

    let odds = f.odds;
    if (!odds || !odds.homeWin || !odds.draw || !odds.awayWin) {
      odds = {
        homeWin: prediction.homeWinProb > 0 ? Number((1 / prediction.homeWinProb).toFixed(2)) : 2.50,
        draw: prediction.drawProb > 0 ? Number((1 / prediction.drawProb).toFixed(2)) : 3.20,
        awayWin: prediction.awayWinProb > 0 ? Number((1 / prediction.awayWinProb).toFixed(2)) : 2.80,
        over25: prediction.over25Prob > 0 ? Number((1 / prediction.over25Prob).toFixed(2)) : 1.90,
        under25: prediction.over25Prob < 1 ? Number((1 / (1 - prediction.over25Prob)).toFixed(2)) : 1.90,
      };
    }

    const { markets, bestValueMarket, mostLikelyOutcome, profitableBet } = ApexEngine.calculateMarkets(
      prediction,
      odds,
      settings,
      f.homeTeam,
      f.awayTeam
    );

    const sm = scrapedMap
      ? (scrapedMap.get(f.id) ||
         scrapedMap.get(f.id.replace('fs_', '')) ||
         scrapedMap.get(`${f.homeTeam.toLowerCase()}__${f.awayTeam.toLowerCase()}`))
      : undefined;

    const stage = sm?.stage || f.stage;
    const homeBadge = sm?.home?.image || f.homeBadge;
    const awayBadge = sm?.away?.image || f.awayBadge;
    const information = sm?.information && sm.information.length > 0 ? sm.information : f.information;
    const statistics = sm?.statistics && sm.statistics.length > 0 ? sm.statistics : f.statistics;
    const resultDetails = sm?.result
      ? {
          regulationTime: sm.result.regulationTime,
          penalties: sm.result.penalties,
        }
      : f.resultDetails;

    const enrichedPrediction = {
      ...prediction,
      mostLikelyOutcome,
      profitableBet,
    };

    return {
      ...f,
      stage,
      homeBadge,
      awayBadge,
      information,
      statistics,
      resultDetails,
      odds,
      prediction: enrichedPrediction,
      markets,
      bestValueMarket,
      mostLikelyOutcome,
      profitableBet,
      homeStats,
      awayStats,
      measurements: prediction.measurements,
    };
  }

  public static async predictAndStoreUpcomingFixtures(
    upcomingFixtures: Fixture[]
  ): Promise<{ count: number; fixtures: Fixture[] }> {
    const settings: EngineSettings = db.getSettings() || {
      activeProvider: 'FLASHSCORE',
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    const seenIds = new Set<string>();
    const validFixtures = upcomingFixtures.filter((f) => {
      if (!f.id || seenIds.has(f.id)) return false;
      seenIds.add(f.id);
      return true;
    });

    const allMatches = this.getUnifiedHistoricalUniverse();
    const scrapedMatches = db.getFlashscoreScrapedMatches(500);

    const scrapedMap = new Map<string, any>();
    for (const sm of scrapedMatches) {
      if (sm.matchId) {
        scrapedMap.set(sm.matchId, sm);
        scrapedMap.set(`fs_${sm.matchId}`, sm);
      }
      if (sm.home?.name && sm.away?.name) {
        scrapedMap.set(`${sm.home.name.toLowerCase()}__${sm.away.name.toLowerCase()}`, sm);
      }
    }

    const cachedH2HMap = db.getAllPredictionMeasurements();

    const enrichedFixtures: Fixture[] = validFixtures.map((f) => {
      const cleanId = (f.id || '').replace(/^fs_/, '');
      const cachedH2H =
        cachedH2HMap.get(cleanId) ||
        cachedH2HMap.get(f.id) ||
        (f.prediction?.measurements?.h2h && f.prediction.measurements.h2h.matchesCount > 0
          ? f.prediction.measurements.h2h
          : null);

      const tacticalInput = {
        information: f.information,
        restDaysHome: f.restDaysHome,
        restDaysAway: f.restDaysAway,
        stage: f.stage,
      };

      return this.predictFixtureUnified(f, allMatches, settings, cachedH2H, tacticalInput, scrapedMap);
    });

    db.saveUpcomingFixtures(enrichedFixtures);
    try {
      await predictionsDb.init();
      predictionsDb.savePredictions(enrichedFixtures);
    } catch {
      // ignore
    }

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'PREDICTION',
      source: 'ServerEngine',
      message: `Unified 5-Pillar Engine generated predictions for ${enrichedFixtures.length} upcoming fixtures`,
      details: { count: enrichedFixtures.length, universeSize: allMatches.length },
    });

    return {
      count: enrichedFixtures.length,
      fixtures: enrichedFixtures,
    };
  }

  public static async predictAndStoreLiveFixtures(
    liveFixtures: Fixture[]
  ): Promise<{ count: number; fixtures: Fixture[] }> {
    const settings: EngineSettings = db.getSettings() || {
      activeProvider: 'FLASHSCORE',
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    const allMatches = this.getUnifiedHistoricalUniverse();
    const cachedH2HMap = db.getAllPredictionMeasurements();

    const enrichedLive: Fixture[] = liveFixtures.map((f) => {
      const cleanId = (f.id || '').replace(/^fs_/, '');
      const cachedH2H =
        cachedH2HMap.get(cleanId) ||
        cachedH2HMap.get(f.id) ||
        (f.prediction?.measurements?.h2h && f.prediction.measurements.h2h.matchesCount > 0
          ? f.prediction.measurements.h2h
          : null);

      const tacticalInput = {
        information: f.information,
        restDaysHome: f.restDaysHome,
        restDaysAway: f.restDaysAway,
        stage: f.stage,
      };

      const enriched = this.predictFixtureUnified(f, allMatches, settings, cachedH2H, tacticalInput);
      return {
        ...enriched,
        status: 'LIVE' as const,
      };
    });

    db.saveUpcomingFixtures(enrichedLive);
    try {
      await predictionsDb.init();
      predictionsDb.saveLivePredictions(enrichedLive);
    } catch {
      // ignore
    }

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'PREDICTION',
      source: 'ServerEngine',
      message: `Unified 5-Pillar Engine updated predictions for ${enrichedLive.length} live matches`,
      details: { count: enrichedLive.length },
    });

    return {
      count: enrichedLive.length,
      fixtures: enrichedLive,
    };
  }

  public static async predictAndStoreHistoricalMatches(
    historicalMatches: any[]
  ): Promise<{ count: number; fixtures: Fixture[] }> {
    const settings: EngineSettings = db.getSettings() || {
      activeProvider: 'FLASHSCORE',
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    const allMatches = this.getUnifiedHistoricalUniverse();
    const cachedH2HMap = db.getAllPredictionMeasurements();

    const enrichedHistory: Fixture[] = historicalMatches.map((m) => {
      const cleanId = String(m.id || '').replace(/^fs_hist_/, '').replace(/^hist_/, '').replace(/^fs_/, '');
      const cachedH2H =
        cachedH2HMap.get(cleanId) ||
        cachedH2HMap.get(m.id);

      const homeTeam = m.homeTeam || m.home?.name || 'Home Club';
      const awayTeam = m.awayTeam || m.away?.name || 'Away Club';

      let odds = undefined;
      if (m.b365H && m.b365D && m.b365A) {
        odds = {
          homeWin: m.b365H,
          draw: m.b365D,
          awayWin: m.b365A,
          over25: m.b365Over25,
          under25: m.b365Under25,
        };
      }

      const fixtureId = m.id?.startsWith('hist_') ? m.id : `hist_${m.id}`;
      const tempFixture: Fixture = {
        id: fixtureId,
        providerId: 'HISTORICAL',
        league: m.div || 'LEAGUE',
        leagueName: m.leagueName || m.div || 'Historical Match',
        matchDate: m.matchDate || '2024-01-01',
        kickOffTime: 'FT',
        homeTeam,
        awayTeam,
        status: 'FINISHED' as const,
        score: {
          home: m.fthg ?? 0,
          away: m.ftag ?? 0,
        },
        odds,
        restDaysHome: m.restDaysHome || 7,
        restDaysAway: m.restDaysAway || 7,
      };

      return this.predictFixtureUnified(tempFixture, allMatches, settings, cachedH2H);
    });

    await predictionsDb.init();
    predictionsDb.saveHistoricalPredictions(enrichedHistory);

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'PREDICTION',
      source: 'ServerEngine',
      message: `Unified 5-Pillar Engine evaluated ${enrichedHistory.length} historical matches`,
      details: { count: enrichedHistory.length, universeSize: allMatches.length },
    });

    return {
      count: enrichedHistory.length,
      fixtures: enrichedHistory,
    };
  }

  public static async predictAndStoreAll(): Promise<void> {
    const rawMatches = db.getAllHistoricalMatches(1500);
    const upcoming = await flashscoreScraperService.getUpcomingFixtures();
    
    await this.predictAndStoreUpcomingFixtures(upcoming);
    await this.predictAndStoreHistoricalMatches(rawMatches);
    
    loggerService.addLog({
      level: 'SUCCESS',
      category: 'ENGINE',
      source: 'ServerEngine',
      message: 'All predictions recalculated based on current historical and upcoming data.',
    });
  }
}
