import { db } from './db.js';
import { parseFeedText, ScrapedRawMatch } from './feedParser.js';
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
    const scrapedMatches = db.getFlashscoreScrapedMatches(500);
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
    if (storedMeasurement) {
      return storedMeasurement;
    }

    // 2. Check local raw feed text in SQLite
    let rawData = await db.getRawFeedAsync(cleanId);
    if (rawData && rawData.rawText && (rawData.rawText.includes('KB÷') || rawData.rawText.includes('KC÷'))) {
      const feedText = rawData.rawText;
      const sections = feedText.split('~');
      let currentSection: 'NONE' | 'HOME_RECENT' | 'AWAY_RECENT' | 'H2H' = 'NONE';
      let foundHomeHeader = false;
      let foundAwayHeader = false;
      let homeClubName = fixtureHomeTeam || '';
      let awayClubName = fixtureAwayTeam || '';

      let homeWins = 0;
      let draws = 0;
      let awayWins = 0;
      let homeGoalsTotal = 0;
      let awayGoalsTotal = 0;
      const recentH2H: HeadToHeadMatchRecord[] = [];
      const homeRecentMatches: TeamFormMatch[] = [];
      const awayRecentMatches: TeamFormMatch[] = [];

      for (const s of sections) {
        if (s.startsWith('KA÷') && !s.startsWith('KA÷Overall') && (foundHomeHeader || foundAwayHeader)) {
          break;
        }

        if (s.startsWith('KB÷Last matches: ')) {
          const rawHeaderClub = s.replace('KB÷Last matches: ', '').replace('¬', '').trim();
          if (!foundHomeHeader) {
            currentSection = 'HOME_RECENT';
            foundHomeHeader = true;
            if (!homeClubName) homeClubName = rawHeaderClub;
          } else if (!foundAwayHeader) {
            currentSection = 'AWAY_RECENT';
            foundAwayHeader = true;
            if (!awayClubName) awayClubName = rawHeaderClub;
          }
          continue;
        }

        if (s.includes('KB÷Head-to-head matches')) {
          currentSection = 'H2H';
          continue;
        }

        if (s.includes('KC÷')) {
          const parts = s.split('¬');
          const d: Record<string, string> = {};
          for (const p of parts) {
            const [k, v] = p.split('÷');
            if (k && v !== undefined) d[k] = v;
          }

          const rawHome = (d['KJ'] || '').replace(/^\*/, '').trim();
          const rawAway = (d['KK'] || '').replace(/^\*/, '').trim();
          const hG = parseInt(d['KU'] || '0', 10);
          const aG = parseInt(d['KT'] || '0', 10);
          const timestamp = parseInt(d['KC'] || '0', 10);
          const matchDateObj = timestamp > 0 ? new Date(timestamp * 1000) : new Date();
          const dateStr = normalizeDateStr(getStandardDateStr(matchDateObj));
          const competition = d['KF'] || 'League';

          if (currentSection === 'HOME_RECENT') {
            const target = homeClubName.toLowerCase();
            const isH = rawHome.toLowerCase().includes(target) || target.includes(rawHome.toLowerCase());
            const gf = isH ? hG : aG;
            const ga = isH ? aG : hG;
            const opp = isH ? rawAway : rawHome;
            const res: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf < ga ? 'L' : 'D';

            if (homeRecentMatches.length < 20) {
              homeRecentMatches.push({
                date: dateStr,
                opponent: opp || 'Opponent',
                isHome: isH,
                goalsFor: gf,
                goalsAgainst: ga,
                result: res,
                competition,
              });
            }
          } else if (currentSection === 'AWAY_RECENT') {
            const target = awayClubName.toLowerCase();
            const isH = rawHome.toLowerCase().includes(target) || target.includes(rawHome.toLowerCase());
            const gf = isH ? hG : aG;
            const ga = isH ? aG : hG;
            const opp = isH ? rawAway : rawHome;
            const res: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf < ga ? 'L' : 'D';

            if (awayRecentMatches.length < 20) {
              awayRecentMatches.push({
                date: dateStr,
                opponent: opp || 'Opponent',
                isHome: isH,
                goalsFor: gf,
                goalsAgainst: ga,
                result: res,
                competition,
              });
            }
          } else if (currentSection === 'H2H') {
            let isHomeFixture = true;
            if (fixtureHomeTeam) {
              const fHomeLower = fixtureHomeTeam.toLowerCase();
              const rHomeLower = rawHome.toLowerCase();
              const rAwayLower = rawAway.toLowerCase();
              if (rHomeLower === fHomeLower || fHomeLower.includes(rHomeLower)) {
                isHomeFixture = true;
              } else if (rAwayLower === fHomeLower || fHomeLower.includes(rAwayLower)) {
                isHomeFixture = false;
              }
            }

            const goalsForHome = isHomeFixture ? hG : aG;
            const goalsForAway = isHomeFixture ? aG : hG;

            homeGoalsTotal += goalsForHome;
            awayGoalsTotal += goalsForAway;

            if (goalsForHome > goalsForAway) {
              homeWins++;
            } else if (goalsForAway > goalsForHome) {
              awayWins++;
            } else {
              draws++;
            }

            if (recentH2H.length < 15) {
              recentH2H.push({
                date: dateStr,
                homeTeam: rawHome,
                awayTeam: rawAway,
                score: `${hG}-${aG}`,
                winner: hG > aG ? 'HOME' : aG > hG ? 'AWAY' : 'DRAW',
                competition,
              });
            }
          }
        }
      }

      const matchesCount = homeWins + draws + awayWins;
      const homeGoalsAvg = matchesCount > 0 ? Number((homeGoalsTotal / matchesCount).toFixed(2)) : 0;
      const awayGoalsAvg = matchesCount > 0 ? Number((awayGoalsTotal / matchesCount).toFixed(2)) : 0;
      const netWinDiff = homeWins - awayWins;
      const netGoalDiff = homeGoalsTotal - awayGoalsTotal;
      const swing = matchesCount > 0 ? netWinDiff * 0.02 + (netGoalDiff / matchesCount) * 0.015 : 0;
      const h2hMultiplierHome = Number(Math.max(0.90, Math.min(1.15, 1.0 + swing)).toFixed(3));
      const h2hMultiplierAway = Number(Math.max(0.90, Math.min(1.15, 1.0 - swing)).toFixed(3));

      const measurement: HeadToHeadMeasurement = {
        matchesCount,
        homeWins,
        draws,
        awayWins,
        homeGoalsAvg,
        awayGoalsAvg,
        h2hMultiplierHome,
        h2hMultiplierAway,
        recentH2H,
        homeClub: homeClubName,
        awayClub: awayClubName,
        homeRecentMatches,
        awayRecentMatches,
      };

      db.savePredictionMeasurement(cleanId, measurement);
      return measurement;
    }

    // 3. Fallback: Calculate H2H directly from local SQLite historical matches database
    const homeTeam = fixtureHomeTeam || (db.getFixtureById(cleanId)?.homeTeam || '');
    const awayTeam = fixtureAwayTeam || (db.getFixtureById(cleanId)?.awayTeam || '');

    if (homeTeam || awayTeam) {
      const homeName = homeTeam.toLowerCase().trim();
      const awayName = awayTeam.toLowerCase().trim();

      const homeHist = homeTeam ? db.getTeamHistoricalMatches(homeTeam, 15) : [];
      const awayHist = awayTeam ? db.getTeamHistoricalMatches(awayTeam, 15) : [];

      const homeRecentMatches: TeamFormMatch[] = homeHist.map((m) => {
        const isH = m.homeTeam.toLowerCase().includes(homeName);
        const gf = isH ? m.fthg : m.ftag;
        const ga = isH ? m.ftag : m.fthg;
        const opp = isH ? m.awayTeam : m.homeTeam;
        const res: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
        return {
          date: m.matchDate,
          opponent: opp,
          isHome: isH,
          goalsFor: gf,
          goalsAgainst: ga,
          result: res,
          competition: m.div,
        };
      });

      const awayRecentMatches: TeamFormMatch[] = awayHist.map((m) => {
        const isH = m.homeTeam.toLowerCase().includes(awayName);
        const gf = isH ? m.fthg : m.ftag;
        const ga = isH ? m.ftag : m.fthg;
        const opp = isH ? m.awayTeam : m.homeTeam;
        const res: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
        return {
          date: m.matchDate,
          opponent: opp,
          isHome: isH,
          goalsFor: gf,
          goalsAgainst: ga,
          result: res,
          competition: m.div,
        };
      });

      const allHistorical = db.getAllHistoricalMatches(5000);
      const directH2H = allHistorical.filter(
        (m) =>
          (m.homeTeam.toLowerCase().includes(homeName) && m.awayTeam.toLowerCase().includes(awayName)) ||
          (m.homeTeam.toLowerCase().includes(awayName) && m.awayTeam.toLowerCase().includes(homeName))
      );

      let homeWins = 0, draws = 0, awayWins = 0, homeGoalsTotal = 0, awayGoalsTotal = 0;
      const recentH2H: HeadToHeadMatchRecord[] = directH2H.slice(0, 10).map((m) => {
        const isHomeFixture = m.homeTeam.toLowerCase().includes(homeName);
        const gHome = isHomeFixture ? m.fthg : m.ftag;
        const gAway = isHomeFixture ? m.ftag : m.fthg;
        homeGoalsTotal += gHome;
        awayGoalsTotal += gAway;
        if (gHome > gAway) homeWins++;
        else if (gAway > gHome) awayWins++;
        else draws++;

        return {
          date: m.matchDate,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          score: `${m.fthg}-${m.ftag}`,
          winner: m.fthg > m.ftag ? (isHomeFixture ? 'HOME' : 'AWAY') : m.ftag > m.fthg ? (isHomeFixture ? 'AWAY' : 'HOME') : 'DRAW',
          competition: m.div,
        };
      });

      const matchesCount = directH2H.length;
      const homeGoalsAvg = matchesCount > 0 ? Number((homeGoalsTotal / matchesCount).toFixed(2)) : 0;
      const awayGoalsAvg = matchesCount > 0 ? Number((awayGoalsTotal / matchesCount).toFixed(2)) : 0;

      const fallbackMeasurement: HeadToHeadMeasurement = {
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

