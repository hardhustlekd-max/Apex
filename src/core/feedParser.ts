import { HeadToHeadMatchRecord, HeadToHeadMeasurement, TeamFormMatch } from './types.js';
import { getStandardDateStr, normalizeDateStr } from './dateUtils.js';

export const H2H_PARSER_VERSION = 2;

export interface ScrapedRawMatch {
  matchId: string;
  timestamp: number;
  tournament: string;
  country: string;
  leagueUrl?: string;
  homeTeam: string;
  awayTeam: string;
  homeBadge?: string;
  awayBadge?: string;
  statusCode: string;
  periodCode?: string;
  homeScore?: number;
  awayScore?: number;
  homeHtScore?: number;
  awayHtScore?: number;
  statistics?: any[];
  minute?: number;
}

const TEAM_AFFIX_REGEX = /\b(fc|cf|sc|ac|fk|sk|sv|vfb|u19|u20|u21|u23|women|w)\b/gi;

function normCompactTeam(name?: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normSpacedTeam(name?: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normCoreTeam(name?: string): string {
  return normSpacedTeam(name).replace(TEAM_AFFIX_REGEX, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Scores how strongly two team names refer to the same club/national team.
 * Prevents substring collisions like "Congo" vs "D.R. Congo" or "Sporting CP" vs "Sporting CP B".
 */
export function teamMatchScore(targetName?: string, candidateName?: string): number {
  const cTarget = normCompactTeam(targetName);
  const cCand = normCompactTeam(candidateName);
  if (!cTarget || !cCand) return 0;

  if (cTarget === cCand) return 1000;

  const coreTarget = normCoreTeam(targetName).replace(/\s+/g, '');
  const coreCand = normCoreTeam(candidateName).replace(/\s+/g, '');
  if (coreTarget && coreCand && coreTarget === coreCand) return 800;

  const sTarget = normSpacedTeam(targetName);
  const sCand = normSpacedTeam(candidateName);
  const targetTokens = sTarget.split(' ').filter(Boolean);
  const candTokens = sCand.split(' ').filter(Boolean);

  // Word-boundary sequence containment (e.g. "Man Utd" vs "Man Utd U21", preferring full word match)
  const paddedTarget = ` ${sTarget} `;
  const paddedCand = ` ${sCand} `;
  if (paddedTarget.includes(paddedCand) && cCand.length >= 3) {
    return 400 + Math.round((cCand.length / cTarget.length) * 100);
  }
  if (paddedCand.includes(paddedTarget) && cTarget.length >= 3) {
    return 400 + Math.round((cTarget.length / cCand.length) * 100);
  }

  // Fallback compact substring match (must be at least 3 chars)
  const minLen = Math.min(cTarget.length, cCand.length);
  if (minLen >= 3 && (cTarget.includes(cCand) || cCand.includes(cTarget))) {
    const maxLen = Math.max(cTarget.length, cCand.length);
    return 100 + Math.round((minLen / maxLen) * 100);
  }

  // Shared meaningful tokens fallback
  const shared = targetTokens.filter((t) => t.length >= 3 && candTokens.includes(t));
  if (shared.length > 0 && shared.length === Math.min(targetTokens.length, candTokens.length)) {
    return 80 + shared.length * 10;
  }

  return 0;
}

/**
 * Determines whether targetTeam played as HOME or AWAY in a match, comparing specificity against both sides.
 */
export function resolveTeamSide(
  targetTeam?: string,
  matchHome?: string,
  matchAway?: string
): 'HOME' | 'AWAY' | null {
  const homeScore = teamMatchScore(targetTeam, matchHome);
  const awayScore = teamMatchScore(targetTeam, matchAway);
  if (homeScore === 0 && awayScore === 0) return null;
  return homeScore >= awayScore ? 'HOME' : 'AWAY';
}

/**
 * Resolves how a past H2H match aligns with the current fixture's (fixtureHome, fixtureAway) pair.
 * Returns { matched: false } if both teams aren't involved, otherwise indicates whether fixtureHome played HOME in the past match.
 */
export function resolveFixtureAlignment(
  fixtureHome?: string,
  fixtureAway?: string,
  matchHome?: string,
  matchAway?: string
): { matched: boolean; isHomeFixture: boolean } {
  const hVsH = teamMatchScore(fixtureHome, matchHome);
  const aVsA = teamMatchScore(fixtureAway, matchAway);
  const hVsA = teamMatchScore(fixtureHome, matchAway);
  const aVsH = teamMatchScore(fixtureAway, matchHome);

  const directValid = hVsH > 0 && aVsA > 0;
  const swappedValid = hVsA > 0 && aVsH > 0;

  if (!directValid && !swappedValid) {
    return { matched: false, isHomeFixture: hVsH >= hVsA };
  }

  const directScore = directValid ? hVsH + aVsA : -1;
  const swappedScore = swappedValid ? hVsA + aVsH : -1;

  return {
    matched: true,
    isHomeFixture: directScore >= swappedScore,
  };
}

/**
 * Parse Flashscore delimiter format:
 * Sections begin with ~
 * Within each section, pairs are separated by ¬
 * Keys and values are separated by ÷
 */
export function parseFeedText(feedText: string): ScrapedRawMatch[] {
  const matches: ScrapedRawMatch[] = [];
  const sections = feedText.split('~');

  let currentTournament = 'Football Competition';
  let currentCountry = 'International';
  let currentLeagueUrl = '';

  for (const section of sections) {
    if (!section) continue;

    if (section.startsWith('ZA÷')) {
      // Tournament header section
      const parts = section.split('¬');
      for (const p of parts) {
        const sepIdx = p.indexOf('÷');
        if (sepIdx <= 0) continue;
        const key = p.slice(0, sepIdx);
        const val = p.slice(sepIdx + 1);
        if (key === 'ZA' && val) currentTournament = val.trim();
        if (key === 'ZY' && val) currentCountry = val.trim();
        if (key === 'ZL' && val) currentLeagueUrl = val.trim();
      }
    } else if (section.startsWith('AA÷')) {
      // Match item
      const parts = section.split('¬');
      const matchData: any = {
        tournament: currentTournament,
        country: currentCountry,
        leagueUrl: currentLeagueUrl,
        statistics: [],
      };

      for (const p of parts) {
        const sepIdx = p.indexOf('÷');
        if (sepIdx <= 0) continue;
        const key = p.slice(0, sepIdx);
        const val = p.slice(sepIdx + 1);
        if (val === undefined) continue;

        switch (key) {
          case 'AA':
            matchData.matchId = val;
            break;
          case 'AD':
            matchData.timestamp = parseInt(val, 10);
            break;
          case 'AE':
            matchData.homeTeam = val;
            break;
          case 'AF':
            matchData.awayTeam = val;
            break;
          case 'AG':
            matchData.homeScore = parseInt(val, 10);
            break;
          case 'AH':
            matchData.awayScore = parseInt(val, 10);
            break;
          case 'BC':
            matchData.homeHtScore = parseInt(val, 10);
            break;
          case 'BD':
            matchData.awayHtScore = parseInt(val, 10);
            break;
          case 'AB':
            matchData.statusCode = val;
            break;
          case 'AC':
            matchData.periodCode = val;
            break;
          case 'OA':
            matchData.homeBadge = val;
            break;
          case 'OB':
            matchData.awayBadge = val;
            break;
          // Parse stats (e.g. SI: Category, SJ: Home Val, SK: Away Val)
          case 'SI':
            matchData.statistics.push({ category: val });
            break;
          case 'SJ':
            if (matchData.statistics.length > 0) {
              matchData.statistics[matchData.statistics.length - 1].homeValue = val;
            }
            break;
          case 'SK':
            if (matchData.statistics.length > 0) {
              matchData.statistics[matchData.statistics.length - 1].awayValue = val;
            }
            break;
          case 'DE': {
            const matchMinute = val.split('+')[0];
            matchData.minute = parseInt(matchMinute, 10);
            break;
          }
          // Support for direct statistic keys from Flashscore feeds
          case 'SF':
            matchData.statistics.push({ category: 'Possession', homeValue: val });
            break;
          case 'SG':
            if (matchData.statistics.length > 0 && matchData.statistics[matchData.statistics.length - 1].category === 'Possession') {
              matchData.statistics[matchData.statistics.length - 1].awayValue = val;
            } else {
              matchData.statistics.push({ category: 'Shots', homeValue: val });
            }
            break;
          case 'SH':
            if (matchData.statistics.length > 0 && matchData.statistics[matchData.statistics.length - 1].category === 'Shots') {
              matchData.statistics[matchData.statistics.length - 1].awayValue = val;
            } else {
              matchData.statistics.push({ category: 'Shots on Goal', homeValue: val });
            }
            break;
        }
      }

      if (matchData.matchId && matchData.homeTeam && matchData.awayTeam) {
        matches.push(matchData as ScrapedRawMatch);
      }
    }
  }

  return matches;
}

/**
 * Parses Flashscore `df_hh_1_<id>` H2H & recent matches feed.
 * Flashscore df_hh_1_ conventions (verified against live payloads):
 * - KA÷Overall is the complete tab; subsequent KA÷ tabs (<Team> - Home, <Team> - Away) duplicate H2H subsets.
 * - KJ = Home Team (prefixed with '*' if winner), KK = Away Team (prefixed with '*' if winner)
 * - KU = Home Goals (or AG, or left side of KL "H:A")
 * - KT = Away Goals (or AH, or right side of KL "H:A")
 * - KC = Unix timestamp (seconds), KP or AA = match ID, AC or AB = status code
 */
export function parseHeadToHeadFeedText(
  feedText: string,
  matchId: string,
  fixtureHomeTeam?: string,
  fixtureAwayTeam?: string
): HeadToHeadMeasurement | null {
  if (!feedText || (!feedText.includes('KB÷') && !feedText.includes('KC÷'))) {
    return null;
  }

  const cleanId = String(matchId || '')
    .replace(/^fs_hist_/, '')
    .replace(/^fs_/, '')
    .replace(/^hist_/, '')
    .replace(/^scraped_/, '')
    .trim();

  const sections = feedText.split('~');
  let currentSection: 'NONE' | 'HOME_RECENT' | 'AWAY_RECENT' | 'H2H' = 'NONE';
  let foundHomeHeader = false;
  let foundAwayHeader = false;
  let seenOverallTab = false;
  let inOverallTab = true;
  let homeClubName = fixtureHomeTeam || '';
  let awayClubName = fixtureAwayTeam || '';

  const homeRecentWithTs: Array<{ ts: number; item: TeamFormMatch }> = [];
  const awayRecentWithTs: Array<{ ts: number; item: TeamFormMatch }> = [];
  const h2hWithTs: Array<{
    ts: number;
    key: string;
    goalsForHomeFixture: number;
    goalsForAwayFixture: number;
    record: HeadToHeadMatchRecord;
  }> = [];

  const seenHomeKeys = new Set<string>();
  const seenAwayKeys = new Set<string>();
  const seenH2HKeys = new Set<string>();

  for (const s of sections) {
    if (!s) continue;

    if (s.startsWith('KA÷')) {
      const tabLabel = s.split('¬')[0].slice(3).trim().toLowerCase();
      if (tabLabel === 'overall' || tabLabel === '') {
        seenOverallTab = true;
        inOverallTab = true;
      } else if (seenOverallTab) {
        // Finished parsing the Overall tab; stop before Home/Away subtabs duplicate matches
        break;
      } else {
        inOverallTab = false;
        currentSection = 'NONE';
      }
      continue;
    }

    if (!inOverallTab) continue;

    if (s.startsWith('KB÷Last matches: ')) {
      const rawHeaderClub = s.replace('KB÷Last matches: ', '').split('¬')[0].trim();
      const side = resolveTeamSide(
        rawHeaderClub,
        fixtureHomeTeam || (!foundHomeHeader ? rawHeaderClub : ''),
        fixtureAwayTeam || ''
      );

      if (side === 'HOME' && !foundHomeHeader) {
        currentSection = 'HOME_RECENT';
        foundHomeHeader = true;
        if (!homeClubName) homeClubName = rawHeaderClub;
      } else if (side === 'AWAY' && !foundAwayHeader) {
        currentSection = 'AWAY_RECENT';
        foundAwayHeader = true;
        if (!awayClubName) awayClubName = rawHeaderClub;
      } else if (!foundHomeHeader) {
        currentSection = 'HOME_RECENT';
        foundHomeHeader = true;
        if (!homeClubName) homeClubName = rawHeaderClub;
      } else if (!foundAwayHeader) {
        currentSection = 'AWAY_RECENT';
        foundAwayHeader = true;
        if (!awayClubName) awayClubName = rawHeaderClub;
      } else {
        currentSection = 'NONE';
      }
      continue;
    }

    if (s.includes('KB÷Head-to-head matches')) {
      currentSection = 'H2H';
      continue;
    }

    if (currentSection !== 'NONE' && s.includes('KC÷')) {
      const parts = s.split('¬');
      const d: Record<string, string> = {};
      for (const p of parts) {
        const sepIdx = p.indexOf('÷');
        if (sepIdx > 0) {
          d[p.slice(0, sepIdx)] = p.slice(sepIdx + 1);
        }
      }

      const matchIdField = (d['KP'] || d['AA'] || '').trim();
      if (cleanId && matchIdField && matchIdField === cleanId) {
        continue;
      }

      const statusCode = (d['AB'] || d['AC'] || '').trim();
      // Skip scheduled / live / cancelled / postponed codes if explicitly marked non-finished
      if (['1', '2', '4', '5', '6', '36', '37', '38'].includes(statusCode)) {
        continue;
      }

      const rawHome = (d['KJ'] || '').replace(/^\*/, '').trim();
      const rawAway = (d['KK'] || '').replace(/^\*/, '').trim();
      if (!rawHome || !rawAway) continue;

      // KU is Home Goals, KT is Away Goals (verified against live Flashscore KL "H:A")
      let hG = d['KU'] !== undefined && d['KU'] !== '' ? parseInt(d['KU'], 10) : NaN;
      let aG = d['KT'] !== undefined && d['KT'] !== '' ? parseInt(d['KT'], 10) : NaN;

      if ((isNaN(hG) || isNaN(aG)) && d['KL'] && d['KL'].includes(':')) {
        const [klH, klA] = d['KL'].split(':').map((x) => parseInt(x.trim(), 10));
        if (!isNaN(klH) && !isNaN(klA)) {
          hG = klH;
          aG = klA;
        }
      }

      if (isNaN(hG) || isNaN(aG)) {
        const ag = d['AG'] !== undefined && d['AG'] !== '' ? parseInt(d['AG'], 10) : NaN;
        const ah = d['AH'] !== undefined && d['AH'] !== '' ? parseInt(d['AH'], 10) : NaN;
        if (!isNaN(ag) && !isNaN(ah)) {
          hG = ag;
          aG = ah;
        }
      }

      if (isNaN(hG) || isNaN(aG)) continue;

      const timestamp = parseInt(d['KC'] || '0', 10);
      const matchDateObj = timestamp > 0 ? new Date(timestamp * 1000) : new Date();
      const dateStr = normalizeDateStr(getStandardDateStr(matchDateObj));
      const competition = d['KF'] || 'League';
      const dedupKey = matchIdField || `${dateStr}__${rawHome.toLowerCase()}__${rawAway.toLowerCase()}`;

      if (currentSection === 'HOME_RECENT') {
        if (seenHomeKeys.has(dedupKey)) continue;
        seenHomeKeys.add(dedupKey);

        const target = fixtureHomeTeam || homeClubName;
        const side = resolveTeamSide(target, rawHome, rawAway);
        const isH = side !== 'AWAY';
        const gf = isH ? hG : aG;
        const ga = isH ? aG : hG;
        const opp = isH ? rawAway : rawHome;
        const res: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf < ga ? 'L' : 'D';

        homeRecentWithTs.push({
          ts: timestamp,
          item: {
            date: dateStr,
            opponent: opp || 'Opponent',
            isHome: isH,
            goalsFor: gf,
            goalsAgainst: ga,
            result: res,
            competition,
          },
        });
      } else if (currentSection === 'AWAY_RECENT') {
        if (seenAwayKeys.has(dedupKey)) continue;
        seenAwayKeys.add(dedupKey);

        const target = fixtureAwayTeam || awayClubName;
        const side = resolveTeamSide(target, rawHome, rawAway);
        const isH = side !== 'AWAY';
        const gf = isH ? hG : aG;
        const ga = isH ? aG : hG;
        const opp = isH ? rawAway : rawHome;
        const res: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf < ga ? 'L' : 'D';

        awayRecentWithTs.push({
          ts: timestamp,
          item: {
            date: dateStr,
            opponent: opp || 'Opponent',
            isHome: isH,
            goalsFor: gf,
            goalsAgainst: ga,
            result: res,
            competition,
          },
        });
      } else if (currentSection === 'H2H') {
        if (seenH2HKeys.has(dedupKey)) continue;
        seenH2HKeys.add(dedupKey);

        const hTarget = fixtureHomeTeam || homeClubName || '';
        const aTarget = fixtureAwayTeam || awayClubName || '';
        let isHomeFixture = true;

        if (hTarget && aTarget) {
          const alignment = resolveFixtureAlignment(hTarget, aTarget, rawHome, rawAway);
          if (!alignment.matched) continue;
          isHomeFixture = alignment.isHomeFixture;
        } else if (hTarget) {
          const side = resolveTeamSide(hTarget, rawHome, rawAway);
          isHomeFixture = side !== 'AWAY';
        }

        const goalsForHomeFixture = isHomeFixture ? hG : aG;
        const goalsForAwayFixture = isHomeFixture ? aG : hG;

        h2hWithTs.push({
          ts: timestamp,
          key: dedupKey,
          goalsForHomeFixture,
          goalsForAwayFixture,
          record: {
            date: dateStr,
            homeTeam: rawHome,
            awayTeam: rawAway,
            score: `${hG}-${aG}`,
            winner: hG > aG ? 'HOME' : aG > hG ? 'AWAY' : 'DRAW',
            competition,
          },
        });
      }
    }
  }

  // Strictly order newest-first (descending by timestamp/date) so index 0 is always the most recent match
  homeRecentWithTs.sort((a, b) => b.ts - a.ts || b.item.date.localeCompare(a.item.date));
  awayRecentWithTs.sort((a, b) => b.ts - a.ts || b.item.date.localeCompare(a.item.date));
  h2hWithTs.sort((a, b) => b.ts - a.ts || b.record.date.localeCompare(a.record.date));

  const homeRecentMatches = homeRecentWithTs.slice(0, 20).map((x) => x.item);
  const awayRecentMatches = awayRecentWithTs.slice(0, 20).map((x) => x.item);
  const cappedH2H = h2hWithTs.slice(0, 15);

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let homeGoalsTotal = 0;
  let awayGoalsTotal = 0;
  for (const item of cappedH2H) {
    homeGoalsTotal += item.goalsForHomeFixture;
    awayGoalsTotal += item.goalsForAwayFixture;
    if (item.goalsForHomeFixture > item.goalsForAwayFixture) homeWins++;
    else if (item.goalsForAwayFixture > item.goalsForHomeFixture) awayWins++;
    else draws++;
  }

  const matchesCount = homeWins + draws + awayWins;
  if (matchesCount === 0 && homeRecentMatches.length === 0 && awayRecentMatches.length === 0) {
    return null;
  }

  const homeGoalsAvg = matchesCount > 0 ? Number((homeGoalsTotal / matchesCount).toFixed(2)) : 0;
  const awayGoalsAvg = matchesCount > 0 ? Number((awayGoalsTotal / matchesCount).toFixed(2)) : 0;
  const netWinDiff = homeWins - awayWins;
  const netGoalDiff = homeGoalsTotal - awayGoalsTotal;
  const swing = matchesCount > 0 ? netWinDiff * 0.02 + (netGoalDiff / matchesCount) * 0.015 : 0;
  const h2hMultiplierHome = Number(Math.max(0.90, Math.min(1.15, 1.0 + swing)).toFixed(3));
  const h2hMultiplierAway = Number(Math.max(0.90, Math.min(1.15, 1.0 - swing)).toFixed(3));

  return {
    parserVersion: H2H_PARSER_VERSION,
    matchesCount,
    homeWins,
    draws,
    awayWins,
    homeGoalsAvg,
    awayGoalsAvg,
    h2hMultiplierHome,
    h2hMultiplierAway,
    recentH2H: cappedH2H.map((x) => x.record),
    homeClub: homeClubName,
    awayClub: awayClubName,
    homeRecentMatches,
    awayRecentMatches,
  };
}
