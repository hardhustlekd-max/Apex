import { db } from './db.js';
import { predictionsDb } from './predictionsDb.js';
import {
  Fixture,
  EngineSettings,
  HistoricalMatch,
  HeadToHeadMeasurement,
  TeamFormMatch,
} from './types.js';
import { ApexEngine } from './poisson.js';
import { DEFAULT_HISTORICAL_MATCHES } from './defaultHistoricalMatches.js';

import { loggerService } from '../services/loggerService.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';
import { matchesLeague } from './leagueMapper.js';
import { getRelativeDateStr, getCurrentSeason, normalizeDateStr, normalizeTimeStr } from './dateUtils.js';

export class ServerEngine {
  public static getUnifiedHistoricalUniverse(): HistoricalMatch[] {
    let rawHist = db.getAllHistoricalMatches(1500);
    if (rawHist.length === 0) {
      db.insertHistoricalMatches(DEFAULT_HISTORICAL_MATCHES);
      rawHist = DEFAULT_HISTORICAL_MATCHES;
    }
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
          season: sm.season || getCurrentSeason(),
          leagueName: sm.leagueName || sm.stage || 'FLASHSCORE',
          matchDate: sm.date ? sm.date.slice(0, 10) : getRelativeDateStr(-30),
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

  /**
   * Dynamically calculates rest days from scraped match calendars & timestamps
   */
  public static calculateDynamicRestDays(
    teamName: string,
    fixtureDateStr: string,
    allMatches: HistoricalMatch[],
    recentFormMatches?: TeamFormMatch[]
  ): number {
    if (!fixtureDateStr || !teamName) return 7;
    const fixtureDate = new Date(fixtureDateStr.length === 10 ? `${fixtureDateStr}T12:00:00Z` : fixtureDateStr);
    const fixtureTime = fixtureDate.getTime();
    if (isNaN(fixtureTime)) return 7;

    // 1. Inspect recent matches from H2H scraped feed (most authoritative & timestamped)
    if (recentFormMatches && recentFormMatches.length > 0) {
      for (const rm of recentFormMatches) {
        if (rm.date) {
          const matchDate = new Date(rm.date.length === 10 ? `${rm.date}T12:00:00Z` : rm.date);
          const matchTime = matchDate.getTime();
          if (!isNaN(matchTime) && matchTime < fixtureTime) {
            const diffDays = Math.round((fixtureTime - matchTime) / (1000 * 3600 * 24));
            if (diffDays >= 1) {
              return Math.min(28, diffDays);
            }
          }
        }
      }
    }

    // 2. Fallback to unified historical universe
    const cleanTeam = teamName.toLowerCase().trim();
    let latestPriorTime = 0;

    for (const m of allMatches) {
      const h = m.homeTeam?.toLowerCase().trim();
      const a = m.awayTeam?.toLowerCase().trim();
      if (h === cleanTeam || a === cleanTeam || (h && cleanTeam.includes(h)) || (a && cleanTeam.includes(a))) {
        if (m.matchDate) {
          const md = new Date(m.matchDate.length === 10 ? `${m.matchDate}T12:00:00Z` : m.matchDate);
          const mt = md.getTime();
          if (!isNaN(mt) && mt < fixtureTime && mt > latestPriorTime) {
            latestPriorTime = mt;
          }
        }
      }
    }

    if (latestPriorTime > 0) {
      const diffDays = Math.round((fixtureTime - latestPriorTime) / (1000 * 3600 * 24));
      if (diffDays >= 1) {
        return Math.min(28, diffDays);
      }
    }

    return 7;
  }

  public static predictFixtureUnified(
    fixture: Fixture,
    allMatches: HistoricalMatch[],
    settings: EngineSettings,
    cachedH2H?: HeadToHeadMeasurement | null,
    tacticalInput?: any,
    scrapedMap?: Map<string, any>,
    historicalContextOverride?: HistoricalMatch[]
  ): Fixture {
    // Standardize date/time for the incoming fixture
    const f = {
      ...fixture,
      matchDate: normalizeDateStr(fixture.matchDate),
      kickOffTime: normalizeTimeStr(fixture.kickOffTime)
    };
    const historicalContext = historicalContextOverride && historicalContextOverride.length >= 5
      ? historicalContextOverride 
      : (allMatches.filter((m) =>
          matchesLeague(m.div, (m as any).leagueName, f.league) ||
          matchesLeague(m.div, (m as any).leagueName, f.leagueName)
        ).length >= 10 
          ? allMatches.filter((m) =>
              matchesLeague(m.div, (m as any).leagueName, f.league) ||
              matchesLeague(m.div, (m as any).leagueName, f.leagueName)
            )
          : allMatches);

    // Dynamically calculate rest days if not already provided
    const restDaysHome = tacticalInput?.restDaysHome ?? f.restDaysHome ?? this.calculateDynamicRestDays(
      f.homeTeam,
      f.matchDate,
      allMatches,
      cachedH2H?.homeRecentMatches
    );
    const restDaysAway = tacticalInput?.restDaysAway ?? f.restDaysAway ?? this.calculateDynamicRestDays(
      f.awayTeam,
      f.matchDate,
      allMatches,
      cachedH2H?.awayRecentMatches
    );

    const mergedTacticalInput = {
      ...tacticalInput,
      restDaysHome,
      restDaysAway,
      information: tacticalInput?.information || f.information,
      stage: tacticalInput?.stage || f.stage,
    };

    const { prediction, homeStats, awayStats } = ApexEngine.predictMatch(
      f.homeTeam,
      f.awayTeam,
      historicalContext,
      settings,
      cachedH2H,
      allMatches,
      mergedTacticalInput
    );

    let odds = f.odds;
    const isDummyPlaceholder = !odds || !odds.homeWin || !odds.draw || !odds.awayWin ||
      (odds.homeWin === 2.10 && odds.draw === 3.30 && odds.awayWin === 3.40);

    if (isDummyPlaceholder) {
      // Calibrate realistic market consensus odds with standard bookmaker overround (~5.5% on 1X2, 6.0% on totals)
      const margin1x2 = 1.055;
      const marginTotals = 1.06;

      const pH = Math.max(0.03, Math.min(0.92, prediction.homeWinProb));
      const pD = Math.max(0.05, Math.min(0.40, prediction.drawProb));
      const pA = Math.max(0.03, Math.min(0.92, prediction.awayWinProb));

      const hw = Number(Math.max(1.04, Math.min(25.0, 1 / (pH * margin1x2))).toFixed(2));
      const dr = Number(Math.max(1.50, Math.min(20.0, 1 / (pD * margin1x2))).toFixed(2));
      const aw = Number(Math.max(1.04, Math.min(25.0, 1 / (pA * margin1x2))).toFixed(2));

      const pOver = Math.max(0.05, Math.min(0.95, prediction.over25Prob));
      const pUnder = 1 - pOver;
      const o25 = Number(Math.max(1.10, Math.min(15.0, 1 / (pOver * marginTotals))).toFixed(2));
      const u25 = Number(Math.max(1.10, Math.min(15.0, 1 / (pUnder * marginTotals))).toFixed(2));

      const pBtts = Math.max(0.05, Math.min(0.95, prediction.bttsProb));
      const pBttsNo = 1 - pBtts;
      const bttsY = Number(Math.max(1.10, Math.min(15.0, 1 / (pBtts * marginTotals))).toFixed(2));
      const bttsN = Number(Math.max(1.10, Math.min(15.0, 1 / (pBttsNo * marginTotals))).toFixed(2));

      odds = {
        homeWin: hw,
        draw: dr,
        awayWin: aw,
        over25: o25,
        under25: u25,
        bttsYes: bttsY,
        bttsNo: bttsN,
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
      restDaysHome,
      restDaysAway,
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

    await db.saveUpcomingFixtures(enrichedFixtures);
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

    await db.saveUpcomingFixtures(enrichedLive);
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
    
    // Optimization: Get all existing IDs in one go to avoid repetitive queries in the loop
    const existingIds = new Set<string>();
    try {
      const histData = predictionsDb.getHistoricalPredictions({ limit: 5000 });
      histData.forEach(f => { if (f.id) existingIds.add(f.id); });
    } catch {
      // ignore
    }

    // Optimization: Group all matches by league for O(1) context lookup instead of O(N) filtering inside the loop
    const matchesByLeague = new Map<string, HistoricalMatch[]>();
    for (const m of allMatches) {
        const div = String(m.div || '').toUpperCase();
        if (!matchesByLeague.has(div)) matchesByLeague.set(div, []);
        matchesByLeague.get(div)!.push(m);
        
        const leagueName = String((m as any).leagueName || '').toUpperCase();
        if (leagueName && leagueName !== div) {
           if (!matchesByLeague.has(leagueName)) matchesByLeague.set(leagueName, []);
           matchesByLeague.get(leagueName)!.push(m);
        }
    }

    const enrichedHistory: Fixture[] = [];
    
    for (const m of historicalMatches) {
      const fixtureId = m.id?.startsWith('hist_') ? m.id : `hist_${m.id}`;
      
      // Fast in-memory check instead of getPredictionById (which does SQL + JSON parse)
      if (existingIds.has(fixtureId)) {
        continue;
      }

      const cleanId = String(m.id || '').replace(/^fs_hist_/, '').replace(/^hist_/, '').replace(/^fs_/, '');
      const cachedH2H =
        cachedH2HMap.get(cleanId) ||
        cachedH2HMap.get(m.id);

      const homeTeam = m.homeTeam || m.home?.name || 'Home Club';
      const awayTeam = m.awayTeam || m.away?.name || 'Away Club';

      const divUpper = String(m.div || 'LEAGUE').toUpperCase();
      const leagueNameUpper = String(m.leagueName || m.div || 'Historical Match').toUpperCase();
      const historicalContext = matchesByLeague.get(divUpper) || matchesByLeague.get(leagueNameUpper) || allMatches;

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


      const tempFixture: Fixture = {
        id: fixtureId,
        providerId: 'HISTORICAL',
        league: m.div || 'LEAGUE',
        leagueName: m.leagueName || m.div || 'Historical Match',
        matchDate: normalizeDateStr(m.matchDate || getRelativeDateStr(-30)),
        kickOffTime: normalizeTimeStr(m.kickOffTime || 'FT'),
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

      // Optimization: Filter league matches once per iteration or use a Map
      // Actually, predictFixtureUnified already does this, but it takes allMatches.
      // We can optimize predictFixtureUnified to be faster if we pass league matches.
      const result = this.predictFixtureUnified(tempFixture, allMatches, settings, cachedH2H, undefined, undefined, historicalContext);
      enrichedHistory.push(result);
      
      // Batch save every 50 to keep memory low and provide progress (logs)
      if (enrichedHistory.length % 100 === 0) {
        predictionsDb.saveHistoricalPredictions(enrichedHistory.slice(-100));
        loggerService.addLog({
           level: 'INFO',
           category: 'PREDICTION',
           source: 'ServerEngine',
           message: `Historical sync progress: ${enrichedHistory.length}/${historicalMatches.length} matches processed...`,
        });
      }
    }

    await predictionsDb.init();
    // Save remaining
    if (enrichedHistory.length > 0) {
       const remaining = enrichedHistory.slice(-(enrichedHistory.length % 100 || enrichedHistory.length));
       if (remaining.length > 0) {
          predictionsDb.saveHistoricalPredictions(remaining);
       }
    }

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'PREDICTION',
      source: 'ServerEngine',
      message: `Unified 5-Pillar Engine evaluated ${enrichedHistory.length} new historical matches`,
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

  public static generateFallbackFixtures(): Fixture[] {
    const today = getRelativeDateStr(0);
    const tomorrow = getRelativeDateStr(1);
    const day2 = getRelativeDateStr(2);

    return [
      {
        id: 'fallback_1',
        providerId: 'FLASHSCORE',
        league: 'england_premier_league',
        leagueName: 'England: Premier League',
        matchDate: today,
        kickOffTime: '20:00',
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        stage: 'Premier League',
        status: 'SCHEDULED',
        odds: { homeWin: 1.85, draw: 3.60, awayWin: 4.20, over25: 1.75, under25: 2.10, bttsYes: 1.80, bttsNo: 2.00 }
      },
      {
        id: 'fallback_2',
        providerId: 'FLASHSCORE',
        league: 'spain_la_liga',
        leagueName: 'Spain: La Liga',
        matchDate: today,
        kickOffTime: '21:00',
        homeTeam: 'Real Madrid',
        awayTeam: 'Barcelona',
        stage: 'LaLiga',
        status: 'SCHEDULED',
        odds: { homeWin: 2.10, draw: 3.40, awayWin: 3.20, over25: 1.65, under25: 2.25, bttsYes: 1.60, bttsNo: 2.30 }
      },
      {
        id: 'fallback_3',
        providerId: 'FLASHSCORE',
        league: 'germany_bundesliga',
        leagueName: 'Germany: Bundesliga',
        matchDate: today,
        kickOffTime: '18:30',
        homeTeam: 'Bayern Munich',
        awayTeam: 'Borussia Dortmund',
        stage: 'Bundesliga',
        status: 'SCHEDULED',
        odds: { homeWin: 1.55, draw: 4.50, awayWin: 5.50, over25: 1.45, under25: 2.75, bttsYes: 1.55, bttsNo: 2.40 }
      },
      {
        id: 'fallback_4',
        providerId: 'FLASHSCORE',
        league: 'italy_serie_a',
        leagueName: 'Italy: Serie A',
        matchDate: today,
        kickOffTime: '19:45',
        homeTeam: 'Inter Milan',
        awayTeam: 'AC Milan',
        stage: 'Serie A',
        status: 'SCHEDULED',
        odds: { homeWin: 2.00, draw: 3.30, awayWin: 3.80, over25: 1.90, under25: 1.90, bttsYes: 1.85, bttsNo: 1.95 }
      },
      {
        id: 'fallback_5',
        providerId: 'FLASHSCORE',
        league: 'france_ligue_1',
        leagueName: 'France: Ligue 1',
        matchDate: tomorrow,
        kickOffTime: '20:00',
        homeTeam: 'PSG',
        awayTeam: 'Marseille',
        stage: 'Ligue 1',
        status: 'SCHEDULED',
        odds: { homeWin: 1.48, draw: 4.60, awayWin: 6.50, over25: 1.50, under25: 2.60, bttsYes: 1.70, bttsNo: 2.10 }
      },
      {
        id: 'fallback_6',
        providerId: 'FLASHSCORE',
        league: 'england_premier_league',
        leagueName: 'England: Premier League',
        matchDate: tomorrow,
        kickOffTime: '15:00',
        homeTeam: 'Manchester City',
        awayTeam: 'Liverpool',
        stage: 'Premier League',
        status: 'SCHEDULED',
        odds: { homeWin: 1.90, draw: 3.50, awayWin: 3.90, over25: 1.68, under25: 2.15, bttsYes: 1.72, bttsNo: 2.05 }
      },
      {
        id: 'fallback_7',
        providerId: 'FLASHSCORE',
        league: 'europe_champions_league',
        leagueName: 'Europe: Champions League',
        matchDate: day2,
        kickOffTime: '20:00',
        homeTeam: 'Real Madrid',
        awayTeam: 'Manchester City',
        stage: 'UEFA Champions League',
        status: 'SCHEDULED',
        odds: { homeWin: 2.40, draw: 3.40, awayWin: 2.80, over25: 1.72, under25: 2.05, bttsYes: 1.65, bttsNo: 2.20 }
      },
      {
        id: 'fallback_8',
        providerId: 'FLASHSCORE',
        league: 'europe_champions_league',
        leagueName: 'Europe: Champions League',
        matchDate: day2,
        kickOffTime: '20:00',
        homeTeam: 'Bayern Munich',
        awayTeam: 'Arsenal',
        stage: 'UEFA Champions League',
        status: 'SCHEDULED',
        odds: { homeWin: 1.80, draw: 3.80, awayWin: 4.40, over25: 1.60, under25: 2.30, bttsYes: 1.75, bttsNo: 2.00 }
      }
    ];
  }
}
