import { db } from './db.js';
import { parseFeedText, ScrapedRawMatch } from './feedParser.js';
import { HeadToHeadMeasurement, HeadToHeadMatchRecord, TeamFormMatch } from './types.js';
import { loggerService } from '../services/loggerService.js';

export class OnDemandParser {
  /**
   * Parses raw match metadata and basic statistics on-demand for a given fixture ID
   */
  public static async getParsedMatch(fixtureId: string): Promise<ScrapedRawMatch | null> {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').trim();
    
    loggerService.addLog({
      level: 'INFO',
      category: 'DATABASE',
      source: 'OnDemandParser',
      message: `Extracting on-demand match data from raw feed for fixture ${cleanId}`,
    });

    const rawData = db.getRawFeed(cleanId);
    if (!rawData || !rawData.rawText) {
      loggerService.addLog({
        level: 'WARN',
        category: 'DATABASE',
        source: 'OnDemandParser',
        message: `No raw feed found in database for fixture ${cleanId}`,
      });
      return null;
    }

    const matches = parseFeedText(rawData.rawText);
    const found = matches.find((m) => m.matchId === cleanId) || null;

    if (found) {
      loggerService.addLog({
        level: 'SUCCESS',
        category: 'DATABASE',
        source: 'OnDemandParser',
        message: `Successfully parsed match on demand: ${found.homeTeam} vs ${found.awayTeam} (Stats items: ${found.statistics?.length || 0})`,
      });
    }

    return found;
  }

  /**
   * Parses all matches from a specific raw feed path stored in the database
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
      message: `Parsing all matches from raw feed path ${feedPath}`,
    });

    const matches = parseFeedText(rawData.rawText);
    return matches;
  }

  /**
   * Parses match statistics on-demand from the raw feed
   */
  public static async getParsedStatistics(
    fixtureId: string
  ): Promise<Array<{ category: string; homeValue?: any; awayValue?: any }>> {
    const match = await this.getParsedMatch(fixtureId);
    if (match && match.statistics && match.statistics.length > 0) {
      return match.statistics;
    }

    // Check relational statistics table as well
    const relStats = db.getMatchStatistics(fixtureId);
    if (relStats && relStats.length > 0) {
      return relStats;
    }

    return [];
  }

  /**
   * Parses raw Head-to-Head (H2H) and recent team form on-demand from raw feed text
   */
  public static async getParsedH2H(
    fixtureId: string,
    fixtureHomeTeam?: string,
    fixtureAwayTeam?: string
  ): Promise<HeadToHeadMeasurement | null> {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').trim();

    const rawData = db.getRawFeed(cleanId);
    if (!rawData || !rawData.rawText || (!rawData.rawText.includes('KB÷') && !rawData.rawText.includes('KC÷'))) {
      return null;
    }

    loggerService.addLog({
      level: 'INFO',
      category: 'DATABASE',
      source: 'OnDemandParser',
      message: `Parsing raw H2H feed on demand for fixture ${cleanId}`,
    });

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
        const dateStr = timestamp > 0 ? new Date((timestamp + 3 * 3600) * 1000).toISOString().split('T')[0] : '';
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

    return {
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
  }

  /**
   * Returns current count of persisted raw feeds
   */
  public static getRawFeedsCount(): number {
    return db.getRawFeedsCount();
  }
}
