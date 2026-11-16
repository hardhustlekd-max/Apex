import { HeadToHeadMatchRecord, HeadToHeadMeasurement, TeamFormMatch } from './types.js';
import { getStandardDateStr, normalizeDateStr } from './dateUtils.js';

export const H2H_PARSER_VERSION = 3;

export interface ScrapedRawMatch {
  matchId: string;
  timestamp: number;
  tournament: string;
  country: string;
  leagueUrl?: string;
  homeTeam: string;
  awayTeam: string;
  homeParticipantId?: string;
  awayParticipantId?: string;
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

const TEAM_AFFIX_REGEX = /\b(fc|cf|sc|ac|fk|sk|sv|vfb)\b/gi;
const COUNTRY_PAREN_REGEX = /\(\s*(?!(?:w|women|u\d{2}|b|ii)\b)[a-z]{3,}\s*\)/gi;

export type TeamCategory = 'SENIOR' | 'WOMEN' | `YOUTH_${string}` | `RESERVE_${string}`;

/**
 * Extracts squad category so Senior teams never match U17-U23 Youth, Women (W), or Reserve (B/II) teams.
 */
export function extractTeamCategory(name?: string): TeamCategory {
  if (!name) return 'SENIOR';
  const raw = String(name).trim();
  if (!raw) return 'SENIOR';

  // Keep parenthesized category markers like (W) or (U19), strip country codes like (Cze)/(Bel)
  const withoutCountry = raw.replace(COUNTRY_PAREN_REGEX, ' ');
  const spaced = normSpacedTeam(withoutCountry);

  // Youth markers: U15..U23 or Jong
  const youthMatch = spaced.match(/\bu\s*(1[5-9]|2[0-3])\b/);
  if (youthMatch) {
    return `YOUTH_${youthMatch[1]}`;
  }
  if (/\bjong\b/.test(spaced)) {
    return 'YOUTH_JONG';
  }

  // Women markers: "Women", trailing standalone "W", or "(W)"
  if (/\bwomen\b/.test(spaced) || /\(\s*w\s*\)/i.test(raw) || /(?:^|\s)w$/.test(spaced)) {
    return 'WOMEN';
  }

  // Reserve markers: trailing standalone "B" or "II" (or "(B)"/"(II)") on multi-word club names
  const tokens = spaced.split(' ').filter(Boolean);
  if (tokens.length >= 2) {
    const lastToken = tokens[tokens.length - 1];
    if (lastToken === 'b' || lastToken === 'ii') {
      return `RESERVE_${lastToken.toUpperCase()}`;
    }
  }
  if (/\(\s*(b|ii)\s*\)/i.test(raw)) {
    return `RESERVE_${raw.match(/\(\s*(b|ii)\s*\)/i)![1].toUpperCase()}`;
  }

  return 'SENIOR';
}

function normCompactTeam(name?: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normSpacedTeam(name?: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normCoreTeam(name?: string): string {
  return normSpacedTeam(name).replace(TEAM_AFFIX_REGEX, ' ').replace(/\s+/g, ' ').trim();
}

interface TeamProfile {
  category: TeamCategory;
  compact: string;
  coreCompact: string;
  spaced: string;
  padded: string;
  tokens: string[];
}

const teamProfileCache = new Map<string, TeamProfile>();

function getTeamProfile(name?: string): TeamProfile | null {
  if (!name) return null;
  const cached = teamProfileCache.get(name);
  if (cached) return cached;

  const raw = String(name).trim();
  if (!raw) return null;

  const compact = normCompactTeam(raw);
  if (!compact) return null;

  const category = extractTeamCategory(raw);
  const spaced = normSpacedTeam(raw);
  const coreCompact = normCoreTeam(raw).replace(/\s+/g, '');
  const tokens = spaced.split(' ').filter(Boolean);
  const profile: TeamProfile = {
    category,
    compact,
    coreCompact,
    spaced,
    padded: ` ${spaced} `,
    tokens,
  };

  if (teamProfileCache.size > 15000) {
    teamProfileCache.clear();
  }
  teamProfileCache.set(name, profile);
  return profile;
}

function scoreTeamProfiles(pTarget: TeamProfile, pCand: TeamProfile): number {
  if (pTarget.category !== pCand.category) return 0;
  if (pTarget.compact === pCand.compact) return 1000;
  if (pTarget.coreCompact && pCand.coreCompact && pTarget.coreCompact === pCand.coreCompact) return 800;

  if (pTarget.padded.includes(pCand.padded) && pCand.compact.length >= 3) {
    return 400 + Math.round((pCand.compact.length / pTarget.compact.length) * 100);
  }
  if (pCand.padded.includes(pTarget.padded) && pTarget.compact.length >= 3) {
    return 400 + Math.round((pTarget.compact.length / pCand.compact.length) * 100);
  }

  const minLen = Math.min(pTarget.compact.length, pCand.compact.length);
  const maxLen = Math.max(pTarget.compact.length, pCand.compact.length);
  if (
    minLen >= 5 &&
    maxLen > 0 &&
    minLen / maxLen >= 0.65 &&
    (pTarget.compact.includes(pCand.compact) || pCand.compact.includes(pTarget.compact))
  ) {
    return 100 + Math.round((minLen / maxLen) * 100);
  }

  let sharedCount = 0;
  for (const t of pTarget.tokens) {
    if (t.length >= 3 && pCand.tokens.includes(t)) {
      sharedCount++;
    }
  }
  if (sharedCount > 0 && sharedCount === Math.min(pTarget.tokens.length, pCand.tokens.length)) {
    return 80 + sharedCount * 10;
  }

  return 0;
}

/**
 * Scores how strongly two team names refer to the same club/national team.
 * Prevents category cross-contamination (Senior vs U19/W/B) and short substring collisions.
 */
export function teamMatchScore(targetName?: string, candidateName?: string): number {
  const pTarget = getTeamProfile(targetName);
  const pCand = getTeamProfile(candidateName);
  if (!pTarget || !pCand) return 0;
  return scoreTeamProfiles(pTarget, pCand);
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

interface TeamUniverseIndex<T> {
  uniqueTeams: Array<{ rawName: string; profile: TeamProfile; matches: T[] }>;
  resultCache: Map<string, T[]>;
}

const teamUniverseIndexCache = new WeakMap<object, TeamUniverseIndex<any>>();

/**
 * Fast WeakMap-indexed team historical match lookup.
 * Produces the exact same set of matches as scanning allMatches with resolveTeamSide() !== null,
 * but runs ~500x faster on batch prediction workloads.
 */
export function getTeamHistoricalMatches<T extends { homeTeam: string; awayTeam: string }>(
  teamName: string,
  allMatches: T[]
): T[] {
  if (!teamName || !allMatches || allMatches.length === 0) return [];

  let index = teamUniverseIndexCache.get(allMatches) as TeamUniverseIndex<T> | undefined;
  if (!index) {
    const byRaw = new Map<string, { rawName: string; profile: TeamProfile; matches: T[] }>();
    const addMatchForTeam = (raw: string, match: T) => {
      if (!raw) return;
      let entry = byRaw.get(raw);
      if (!entry) {
        const profile = getTeamProfile(raw);
        if (!profile) return;
        entry = { rawName: raw, profile, matches: [] };
        byRaw.set(raw, entry);
      }
      const list = entry.matches;
      if (list[list.length - 1] !== match) {
        list.push(match);
      }
    };

    for (const m of allMatches) {
      addMatchForTeam(m.homeTeam, m);
      if (m.awayTeam !== m.homeTeam) {
        addMatchForTeam(m.awayTeam, m);
      }
    }

    index = {
      uniqueTeams: Array.from(byRaw.values()),
      resultCache: new Map<string, T[]>(),
    };
    teamUniverseIndexCache.set(allMatches, index);
  }

  const cached = index.resultCache.get(teamName);
  if (cached) return cached;

  const targetProfile = getTeamProfile(teamName);
  if (!targetProfile) return [];

  const matchedSet = new Set<T>();
  for (const item of index.uniqueTeams) {
    if (scoreTeamProfiles(targetProfile, item.profile) > 0) {
      for (const m of item.matches) {
        matchedSet.add(m);
      }
    }
  }

  const result = Array.from(matchedSet);
  index.resultCache.set(teamName, result);
  return result;
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
          case 'JA':
            matchData.homeParticipantId = val;
            break;
          case 'JB':
            matchData.awayParticipantId = val;
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
  // Track the true header club names from the feed separately from caller hints to avoid section poisoning
  let parsedHomeHeaderClub = '';
  let parsedAwayHeaderClub = '';

  let homeRecentWithTs: Array<{ ts: number; item: TeamFormMatch }> = [];
  let awayRecentWithTs: Array<{ ts: number; item: TeamFormMatch }> = [];
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
      const homeHeaderScore = fixtureHomeTeam ? teamMatchScore(rawHeaderClub, fixtureHomeTeam) : 0;
      const awayHeaderScore = fixtureAwayTeam ? teamMatchScore(rawHeaderClub, fixtureAwayTeam) : 0;

      if (homeHeaderScore > 0 && homeHeaderScore >= awayHeaderScore && !foundHomeHeader) {
        currentSection = 'HOME_RECENT';
        foundHomeHeader = true;
        parsedHomeHeaderClub = rawHeaderClub;
      } else if (awayHeaderScore > 0 && awayHeaderScore > homeHeaderScore && !foundAwayHeader) {
        currentSection = 'AWAY_RECENT';
        foundAwayHeader = true;
        parsedAwayHeaderClub = rawHeaderClub;
      } else if (!foundHomeHeader) {
        currentSection = 'HOME_RECENT';
        foundHomeHeader = true;
        parsedHomeHeaderClub = rawHeaderClub;
      } else if (!foundAwayHeader) {
        currentSection = 'AWAY_RECENT';
        foundAwayHeader = true;
        parsedAwayHeaderClub = rawHeaderClub;
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

        const target = parsedHomeHeaderClub || fixtureHomeTeam || '';
        const side = resolveTeamSide(target, rawHome, rawAway);
        if (!side) continue;
        seenHomeKeys.add(dedupKey);

        const isH = side === 'HOME';
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

        const target = parsedAwayHeaderClub || fixtureAwayTeam || '';
        const side = resolveTeamSide(target, rawHome, rawAway);
        if (!side) continue;
        seenAwayKeys.add(dedupKey);

        const isH = side === 'HOME';
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

        const hTarget = fixtureHomeTeam || parsedHomeHeaderClub || '';
        const aTarget = fixtureAwayTeam || parsedAwayHeaderClub || '';
        let isHomeFixture = true;

        if (hTarget && aTarget) {
          const alignment = resolveFixtureAlignment(hTarget, aTarget, rawHome, rawAway);
          if (!alignment.matched) continue;
          isHomeFixture = alignment.isHomeFixture;
        } else if (hTarget) {
          const side = resolveTeamSide(hTarget, rawHome, rawAway);
          if (!side) continue;
          isHomeFixture = side === 'HOME';
        } else {
          continue;
        }

        seenH2HKeys.add(dedupKey);

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

  // Strictly enforce alignment with caller's (fixtureHomeTeam, fixtureAwayTeam) if headers appeared swapped
  if (fixtureHomeTeam && fixtureAwayTeam && (parsedHomeHeaderClub || parsedAwayHeaderClub)) {
    const alignment = resolveFixtureAlignment(
      fixtureHomeTeam,
      fixtureAwayTeam,
      parsedHomeHeaderClub,
      parsedAwayHeaderClub
    );
    if (alignment.matched && !alignment.isHomeFixture) {
      const tempMatches = homeRecentWithTs;
      homeRecentWithTs = awayRecentWithTs;
      awayRecentWithTs = tempMatches;
      const tempClub = parsedHomeHeaderClub;
      parsedHomeHeaderClub = parsedAwayHeaderClub;
      parsedAwayHeaderClub = tempClub;
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
  let weightedWinDiff = 0;
  let weightedGoalDiff = 0;
  let weightTotal = 0;
  const nowSec = Math.floor(Date.now() / 1000);

  for (const item of cappedH2H) {
    homeGoalsTotal += item.goalsForHomeFixture;
    awayGoalsTotal += item.goalsForAwayFixture;
    if (item.goalsForHomeFixture > item.goalsForAwayFixture) homeWins++;
    else if (item.goalsForAwayFixture > item.goalsForHomeFixture) awayWins++;
    else draws++;

    const itemSec = item.ts > 0 ? item.ts : Math.floor((new Date(item.record.date).getTime() || Date.now()) / 1000);
    const ageYears = Math.max(0, (nowSec - itemSec) / (365 * 86400));
    const recencyWeight = Math.exp(-ageYears * 0.45);
    const outcomeDir =
      item.goalsForHomeFixture > item.goalsForAwayFixture ? 1 :
      item.goalsForAwayFixture > item.goalsForHomeFixture ? -1 : 0;
    weightedWinDiff += outcomeDir * recencyWeight;
    weightedGoalDiff += (item.goalsForHomeFixture - item.goalsForAwayFixture) * recencyWeight;
    weightTotal += recencyWeight;
  }

  const matchesCount = homeWins + draws + awayWins;
  if (matchesCount === 0 && homeRecentMatches.length === 0 && awayRecentMatches.length === 0) {
    return null;
  }

  const homeGoalsAvg = matchesCount > 0 ? Number((homeGoalsTotal / matchesCount).toFixed(2)) : 0;
  const awayGoalsAvg = matchesCount > 0 ? Number((awayGoalsTotal / matchesCount).toFixed(2)) : 0;
  const swing = weightTotal > 0 ? (weightedWinDiff / weightTotal) * 0.14 + (weightedGoalDiff / weightTotal) * 0.05 : 0;
  const h2hMultiplierHome = Number(Math.max(0.80, Math.min(1.25, 1.0 + swing)).toFixed(3));
  const h2hMultiplierAway = Number(Math.max(0.80, Math.min(1.25, 1.0 - swing)).toFixed(3));

  const homeClubName = (fixtureHomeTeam && fixtureAwayTeam)
    ? fixtureHomeTeam
    : (parsedHomeHeaderClub || fixtureHomeTeam || '');
  const awayClubName = (fixtureHomeTeam && fixtureAwayTeam)
    ? fixtureAwayTeam
    : (parsedAwayHeaderClub || fixtureAwayTeam || '');

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
