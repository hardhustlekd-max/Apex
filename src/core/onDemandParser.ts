import { db } from './db.js';
import {
  parseFeedText,
  parseHeadToHeadFeedText,
  buildFallbackH2HFromHistoricalDb,
  H2H_PARSER_VERSION,
  ScrapedRawMatch,
} from './feedParser.js';
import { cleanFixtureId, HeadToHeadMeasurement } from './types.js';
import { loggerService } from '../services/loggerService.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';

export class OnDemandParser {
  /**
   * Parses raw match metadata and basic statistics on-demand for a given fixture ID from local SQLite database
   */
  public static async getParsedMatch(fixtureId: string): Promise<ScrapedRawMatch | null> {
    if (!fixtureId) return null;
    const cleanId = cleanFixtureId(fixtureId);
    
    loggerService.addLog({
      level: 'INFO',
      category: 'DATABASE',
      source: 'OnDemandParser',
      message: `Extracting match data on demand from local SQLite database for fixture ${cleanId}`,
    });

    // 1. Primary lookup: Local SQLite raw feeds table
    let rawData = await db.getRawFeedAsync(cleanId);
    if (rawData && rawData.rawText) {
      const matches = parseFeedText(rawData.rawText);
      const found = matches.find((m) => m.matchId === cleanId) || null;
      if (found) {
        loggerService.addLog({
          level: 'SUCCESS',
          category: 'DATABASE',
          source: 'OnDemandParser',
          message: `Successfully parsed match from local raw feed: ${found.homeTeam} vs ${found.awayTeam}`,
        });
        return found;
      }
    }

    // 2. Secondary lookup: Local SQLite scraped matches table (indexed single-row lookup)
    const existingScraped = db.getFlashscoreScrapedMatchById(fixtureId);

    if (existingScraped) {
      const homeScore = existingScraped.result?.home !== undefined ? parseInt(existingScraped.result.home, 10) : undefined;
      const awayScore = existingScraped.result?.away !== undefined ? parseInt(existingScraped.result.away, 10) : undefined;
      return {
        matchId: existingScraped.matchId,
        timestamp: Math.floor(Date.now() / 1000),
        tournament: existingScraped.stage || existingScraped.leagueName || 'League',
        country: existingScraped.country || 'International',
        homeTeam: existingScraped.home.name,
        awayTeam: existingScraped.away.name,
        homeScore,
        awayScore,
        statusCode: existingScraped.status === 'FINISHED' ? '3' : existingScraped.status === 'LIVE' ? '2' : '1',
        statistics: existingScraped.statistics || [],
      };
    }

    // 3. Tertiary lookup: Local SQLite upcoming or historical fixtures table
    const fixture = db.getFixtureById(fixtureId) || db.getFixtureById(cleanId);
    if (fixture) {
      return {
        matchId: cleanId,
        timestamp: fixture.timestamp || Math.floor(Date.now() / 1000),
        tournament: fixture.leagueName || fixture.league || 'League',
        country: 'International',
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        homeScore: fixture.score?.home,
        awayScore: fixture.score?.away,
        statusCode: fixture.status === 'FINISHED' ? '3' : fixture.status === 'LIVE' ? '2' : '1',
        statistics: [],
      };
    }

    loggerService.addLog({
      level: 'INFO',
      category: 'DATABASE',
      source: 'OnDemandParser',
      message: `Match data not available in local SQLite database for fixture ${cleanId}`,
    });
    return null;
  }

  /**
   * Parses raw Head-to-Head (H2H) and recent team form on-demand from 100% local SQLite database
   */
  public static async getParsedH2H(
    fixtureId: string,
    fixtureHomeTeam?: string,
    fixtureAwayTeam?: string
  ): Promise<HeadToHeadMeasurement | null> {
    if (!fixtureId) return null;
    const cleanId = cleanFixtureId(fixtureId);

    // 1. Check if up-to-date measurement is already saved in local SQLite cache
    const storedMeasurement = db.getPredictionMeasurement(cleanId) || db.getPredictionMeasurement(fixtureId);
    if (
      storedMeasurement &&
      (storedMeasurement.parserVersion || 0) >= H2H_PARSER_VERSION &&
      (storedMeasurement.matchesCount > 0 ||
        storedMeasurement.homeRecentMatches?.length ||
        storedMeasurement.awayRecentMatches?.length ||
        storedMeasurement.recentH2H?.length)
    ) {
      return storedMeasurement;
    }

    // 2. Check local raw feed text in SQLite, or fetch from Flashscore
    let rawData = await db.getRawFeedAsync(cleanId);
    if (!rawData || !rawData.rawText || (!rawData.rawText.includes('KB÷') && !rawData.rawText.includes('KC÷'))) {
      const scraped = await flashscoreScraperService.getMatchHeadToHead(cleanId, fixtureHomeTeam, fixtureAwayTeam);
      if (
        scraped &&
        (scraped.matchesCount > 0 ||
          scraped.homeRecentMatches?.length ||
          scraped.awayRecentMatches?.length ||
          scraped.recentH2H?.length)
      ) {
        return scraped;
      }
      rawData = await db.getRawFeedAsync(cleanId);
    }

    if (rawData && rawData.rawText && (rawData.rawText.includes('KB÷') || rawData.rawText.includes('KC÷'))) {
      const measurement = parseHeadToHeadFeedText(rawData.rawText, cleanId, fixtureHomeTeam, fixtureAwayTeam);
      if (measurement) {
        db.savePredictionMeasurement(cleanId, measurement);
        return measurement;
      }
    }

    if (
      storedMeasurement &&
      (storedMeasurement.matchesCount > 0 ||
        storedMeasurement.homeRecentMatches?.length ||
        storedMeasurement.awayRecentMatches?.length ||
        storedMeasurement.recentH2H?.length)
    ) {
      return storedMeasurement;
    }

    // 3. Fallback: Calculate H2H directly from local SQLite historical matches database
    let homeTeam = fixtureHomeTeam || '';
    let awayTeam = fixtureAwayTeam || '';
    if (!homeTeam || !awayTeam) {
      const f = db.getFixtureById(cleanId);
      if (f) {
        homeTeam = homeTeam || f.homeTeam;
        awayTeam = awayTeam || f.awayTeam;
      }
    }

    if (homeTeam || awayTeam) {
      const homeHist = homeTeam ? db.getTeamHistoricalMatches(homeTeam, 15) : [];
      const awayHist = awayTeam ? db.getTeamHistoricalMatches(awayTeam, 15) : [];
      const directH2H = homeTeam && awayTeam ? db.getDirectH2HHistoricalMatches(homeTeam, awayTeam, 15) : [];

      const fallbackMeasurement = buildFallbackH2HFromHistoricalDb(
        homeTeam,
        awayTeam,
        homeHist,
        awayHist,
        directH2H,
        { computeSwingMultipliers: false }
      );

      db.savePredictionMeasurement(cleanId, fallbackMeasurement);
      return fallbackMeasurement;
    }

    return null;
  }
}

