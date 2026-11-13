import { db } from './db.js';
import {
  parseFeedText,
  parseHeadToHeadFeedText,
  resolveTeamSide,
  resolveFixtureAlignment,
  H2H_PARSER_VERSION,
  ScrapedRawMatch,
} from './feedParser.js';
import { HeadToHeadMeasurement, HeadToHeadMatchRecord, TeamFormMatch } from './types.js';
import { loggerService } from '../services/loggerService.js';
import { normalizeDateStr, getStandardDateStr } from './dateUtils.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';

export class OnDemandParser {
  /**
   * Parses raw match metadata and basic statistics on-demand for a given fixture ID from local SQLite database
   */
  public static async getParsedMatch(fixtureId: string): Promise<ScrapedRawMatch | null> {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').replace(/^scraped_/, '').trim();
    
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

    // 2. Secondary lookup: Local SQLite scraped matches table
    const scrapedMatches = db.getFlashscoreScrapedMatches(1000);
    const existingScraped = scrapedMatches.find(
      (m) => m.matchId === cleanId || m.matchId === fixtureId || `fs_${m.matchId}` === fixtureId
    );

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
   * Parses all matches from a specific raw feed path stored in the local SQLite database
   */
  public static async getParsedMatchesFromFeed(feedPath: string): Promise<ScrapedRawMatch[]> {
    if (!feedPath) return [];
    
    const rawData = db.getRawFeed(feedPath);
    if (!rawData || !rawData.rawText) {
      return [];
    }

    loggerService.addLog({
      level: 'INFO',
      category: 'DATABASE',
      source: 'OnDemandParser',
      message: `Parsing all matches from local raw feed path ${feedPath}`,
    });

    return parseFeedText(rawData.rawText);
  }

  /**
   * Parses match statistics on-demand from the local SQLite database
   */
  public static async getParsedStatistics(
    fixtureId: string
  ): Promise<Array<{ category: string; homeValue?: any; awayValue?: any }>> {
    // 1. Check relational statistics table in local SQLite
    const relStats = db.getMatchStatistics(fixtureId);
    if (relStats && relStats.length > 0) {
      return relStats;
    }

    // 2. Fall back to match object in local SQLite
    const match = await this.getParsedMatch(fixtureId);
    if (match && match.statistics && match.statistics.length > 0) {
      return match.statistics;
    }

    return [];
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
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').replace(/^scraped_/, '').trim();

    // 1. Check if measurement is already saved in local SQLite cache
    const storedMeasurement = db.getPredictionMeasurement(cleanId) || db.getPredictionMeasurement(fixtureId);
    if (
      storedMeasurement &&
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

    // 3. Fallback: Calculate H2H directly from local SQLite historical matches database
    const homeTeam = fixtureHomeTeam || (db.getFixtureById(cleanId)?.homeTeam || '');
    const awayTeam = fixtureAwayTeam || (db.getFixtureById(cleanId)?.awayTeam || '');

    if (homeTeam || awayTeam) {
      const homeHist = (homeTeam ? db.getTeamHistoricalMatches(homeTeam, 15) : [])
        .slice()
        .sort((a, b) => normalizeDateStr(b.matchDate).localeCompare(normalizeDateStr(a.matchDate)));
      const awayHist = (awayTeam ? db.getTeamHistoricalMatches(awayTeam, 15) : [])
        .slice()
        .sort((a, b) => normalizeDateStr(b.matchDate).localeCompare(normalizeDateStr(a.matchDate)));

      const homeRecentMatches: TeamFormMatch[] = homeHist.map((m) => {
        const side = resolveTeamSide(homeTeam, m.homeTeam, m.awayTeam);
        const isH = side !== 'AWAY';
        const gf = isH ? m.fthg : m.ftag;
        const ga = isH ? m.ftag : m.fthg;
        const opp = isH ? m.awayTeam : m.homeTeam;
        const res: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
        return {
          date: normalizeDateStr(m.matchDate),
          opponent: opp,
          isHome: isH,
          goalsFor: gf,
          goalsAgainst: ga,
          result: res,
          competition: m.div,
        };
      });

      const awayRecentMatches: TeamFormMatch[] = awayHist.map((m) => {
        const side = resolveTeamSide(awayTeam, m.homeTeam, m.awayTeam);
        const isH = side !== 'AWAY';
        const gf = isH ? m.fthg : m.ftag;
        const ga = isH ? m.ftag : m.fthg;
        const opp = isH ? m.awayTeam : m.homeTeam;
        const res: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
        return {
          date: normalizeDateStr(m.matchDate),
          opponent: opp,
          isHome: isH,
          goalsFor: gf,
          goalsAgainst: ga,
          result: res,
          competition: m.div,
        };
      });

      const allHistorical = db.getAllHistoricalMatches(5000);
      const directH2H = allHistorical
        .filter((m) => resolveFixtureAlignment(homeTeam, awayTeam, m.homeTeam, m.awayTeam).matched)
        .sort((a, b) => normalizeDateStr(b.matchDate).localeCompare(normalizeDateStr(a.matchDate)));

      let homeWins = 0, draws = 0, awayWins = 0, homeGoalsTotal = 0, awayGoalsTotal = 0;
      const cappedH2H = directH2H.slice(0, 15);
      const recentH2H: HeadToHeadMatchRecord[] = cappedH2H.map((m) => {
        const { isHomeFixture } = resolveFixtureAlignment(homeTeam, awayTeam, m.homeTeam, m.awayTeam);
        const gHome = isHomeFixture ? m.fthg : m.ftag;
        const gAway = isHomeFixture ? m.ftag : m.fthg;
        homeGoalsTotal += gHome;
        awayGoalsTotal += gAway;
        if (gHome > gAway) homeWins++;
        else if (gAway > gHome) awayWins++;
        else draws++;

        return {
          date: normalizeDateStr(m.matchDate),
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          score: `${m.fthg}-${m.ftag}`,
          winner: m.fthg > m.ftag ? 'HOME' : m.ftag > m.fthg ? 'AWAY' : 'DRAW',
          competition: m.div,
        };
      });

      const matchesCount = homeWins + draws + awayWins;
      const homeGoalsAvg = matchesCount > 0 ? Number((homeGoalsTotal / matchesCount).toFixed(2)) : 0;
      const awayGoalsAvg = matchesCount > 0 ? Number((awayGoalsTotal / matchesCount).toFixed(2)) : 0;

      const fallbackMeasurement: HeadToHeadMeasurement = {
        parserVersion: H2H_PARSER_VERSION,
        matchesCount,
        homeWins,
        draws,
        awayWins,
        homeGoalsAvg,
        awayGoalsAvg,
        h2hMultiplierHome: 1.0,
        h2hMultiplierAway: 1.0,
        recentH2H,
        homeClub: homeTeam,
        awayClub: awayTeam,
        homeRecentMatches,
        awayRecentMatches,
      };

      db.savePredictionMeasurement(cleanId, fallbackMeasurement);
      return fallbackMeasurement;
    }

    return null;
  }

  /**
   * Returns current count of persisted raw feeds from local SQLite database
   */
  public static getRawFeedsCount(): number {
    return db.getRawFeedsCount();
  }
}

