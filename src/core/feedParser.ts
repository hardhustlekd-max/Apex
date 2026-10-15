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
        const [key, val] = p.split('÷');
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
        const [key, val] = p.split('÷');
        if (!key || val === undefined) continue;

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
            if (matchData.statistics.length > 0) matchData.statistics[matchData.statistics.length - 1].homeValue = val;
            break;
          case 'SK':
            if (matchData.statistics.length > 0) matchData.statistics[matchData.statistics.length - 1].awayValue = val;
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
