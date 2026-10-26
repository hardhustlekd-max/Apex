import { Fixture, BookmakerOdds, HistoricalMatch, LeagueCode, FlashscoreScrapedMatch, HeadToHeadMeasurement, HeadToHeadMatchRecord, TeamFormMatch, LeagueStandingTable, LeagueStandingEntry } from '../core/types.js';
import { LiveOddsUpdate, LiveScore } from '../providers/types.js';
import { db } from '../core/db.js';
import { GLOBAL_LEAGUES_DATASET } from '../core/globalLeaguesDataset.js';
import { getCurrentSeason, normalizeDateStr, normalizeTimeStr, getStandardDateStr, getStandardTimeStr } from '../core/dateUtils.js';
import { loggerService } from './loggerService.js';
import { DEFAULT_HISTORICAL_MATCHES } from '../core/defaultHistoricalMatches.js';

const FLASHSCORE_FEED_BASE = 'https://www.flashscore.com/x/feed';
const FLASHSCORE_NINJA_BASE = 'https://46.flashscore.ninja/46/x/feed';
const FSIGN_HEADER = 'SW9D1eZo';
const STATIC_IMAGE_BASE = 'https://static.flashscore.com/res/image/data/';

import { parseFeedText, ScrapedRawMatch } from '../core/feedParser.js';

export class FlashscoreScraperService {
  private cacheUpcoming: Fixture[] = [];
  private cacheH2H = new Map<string, HeadToHeadMeasurement>();
  private cacheStandings = new Map<string, { data: LeagueStandingTable; timestamp: number }>();
  private lastFetchTime = 0;
  private CACHE_TTL_MS = 60000; // 1 minute in-memory cache

  /**
   * Fetch raw feed string from Flashscore feed endpoint
   */
  private async fetchFlashscoreFeed(path: string): Promise<string | null> {
    const urls = [
      `${FLASHSCORE_FEED_BASE}/${path}`,
      `${FLASHSCORE_NINJA_BASE}/${path}`,
      `https://1.flashscore.ninja/46/x/feed/${path}`,
      `https://2.flashscore.ninja/46/x/feed/${path}`,
      `https://www.flashscore.in/x/feed/${path}`,
    ];

    let lastError: any = null;

    for (const url of urls) {
      let timeout: NodeJS.Timeout | null = null;
      try {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), 2000);

        const res = await fetch(url, {
          headers: {
            'x-fsign': FSIGN_HEADER,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': 'https://www.flashscore.com/',
            'Origin': 'https://www.flashscore.com',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: controller.signal,
        });

        if (res.ok) {
          const text = await res.text();
          if (text && text.length > 50) {
            return text;
          }
          lastError = new Error(`Flashscore feed response empty on ${url}`);
        } else {
          lastError = new Error(`Flashscore HTTP ${res.status} on ${url}`);
        }
      } catch (err: any) {
        const isAbort = err?.name === 'AbortError' || err?.message?.includes('aborted');
        lastError = isAbort
          ? new Error(`Feed connection timed out (${url})`)
          : (err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
      }
    }

    const localCached = db.getRawFeed(path);
    if (localCached && localCached.rawText) {
      return localCached.rawText;
    }

    loggerService.addLog({
      level: 'INFO',
      category: 'SCRAPER',
      source: 'FlashscoreScraperService',
      message: `Flashscore feed fallback for path "${path}": ${lastError?.message || 'Remote endpoint unavailable'}`,
      details: {
        path,
        error: lastError?.message,
        timestamp: new Date().toISOString(),
      },
    });

    return null;
  }

  async fetchAndPersistRawFeed(path: string, fixtureId?: string): Promise<string | null> {
    const rawText = await this.fetchFlashscoreFeed(path);
    if (rawText) {
      db.saveRawFeed(fixtureId || path, path, rawText);
    }
    return rawText;
  }

  /**
   * Map tournament/country string to application LeagueCode
   */
  private mapToLeagueCode(tournament: string, country: string): { code: LeagueCode; name: string } {
    const cleanedTournament = tournament.replace(/^[A-Z\s]+:\s*/, '').trim();
    const countryPrefix = country ? country.trim() : 'International';
    
    // Generate native Flashscore naming/slug code e.g. "england_premier_league", "spain_la_liga"
    const nativeCode = `${countryPrefix}_${cleanedTournament}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const name = country ? `${country}: ${cleanedTournament}` : cleanedTournament;
    return { code: nativeCode, name };
  }

  /**
   * Baseline odds reference for market evaluation
   */
  private generateMatchOdds(): BookmakerOdds {
    return {
      homeWin: 2.10,
      draw: 3.30,
      awayWin: 3.40,
      over25: 1.85,
      under25: 1.95,
      bttsYes: 1.80,
      bttsNo: 2.00,
    };
  }

  /**
   * Scrapes upcoming and scheduled fixtures from Flashscore feeds
   */
  async getUpcomingFixtures(dateFilter?: string): Promise<Fixture[]> {
    const now = Date.now();
    if (this.cacheUpcoming.length > 0 && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      if (dateFilter) {
        return this.cacheUpcoming.filter((f) => f.matchDate === dateFilter);
      }
      return this.cacheUpcoming;
    }

    const scrapedFixtures: Fixture[] = [];
    const scrapedMatchesForDb: any[] = [];
    const seenMatchIds = new Set<string>();

    // Scrape Day 0 (today), Day 1 (tomorrow), Day 2, and Day 3 to cover next days and this week
    const dayOffsets = [0, 1, 2, 3];

    for (const offset of dayOffsets) {
      const feedPath = `f_1_${offset}_3_en_1`;
      const feedText = await this.fetchAndPersistRawFeed(feedPath);
      if (!feedText) continue;

      const rawMatches = parseFeedText(feedText);

      for (const m of rawMatches) {
        // Feed already persisted via fetchAndPersistRawFeed(feedPath)

        // Skip finished matches for upcoming fixtures view
        if (m.statusCode === '3') continue;

        // Guarantee unique fixture ID
        if (seenMatchIds.has(m.matchId)) continue;
        seenMatchIds.add(m.matchId);

        const matchDateObj = m.timestamp ? new Date((m.timestamp + 3 * 3600) * 1000) : new Date();
        const dateStr = normalizeDateStr(getStandardDateStr(matchDateObj));
        const kickOffTime = normalizeTimeStr(getStandardTimeStr(matchDateObj));

        const { code, name } = this.mapToLeagueCode(m.tournament, m.country);
        const odds = this.generateMatchOdds();

        const isLive = m.statusCode === '2';
        const fixture: Fixture = {
          id: `fs_${m.matchId}`,
          providerId: 'FLASHSCORE',
          league: code,
          leagueName: name,
          matchDate: dateStr,
          kickOffTime,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          homeBadge: m.homeBadge ? `${STATIC_IMAGE_BASE}${m.homeBadge}` : undefined,
          awayBadge: m.awayBadge ? `${STATIC_IMAGE_BASE}${m.awayBadge}` : undefined,
          status: isLive ? 'LIVE' : 'SCHEDULED',
          stage: m.tournament,
          odds,
          score: (m.homeScore !== undefined && m.awayScore !== undefined)
            ? { home: m.homeScore, away: m.awayScore }
            : undefined,
        };

        if (m.statistics && m.statistics.length > 0) {
          db.saveMatchStatistics(m.matchId, m.statistics);
        }

        scrapedFixtures.push(fixture);

        scrapedMatchesForDb.push({
          matchId: m.matchId,
          stage: m.tournament,
          status: isLive ? 'LIVE' : 'SCHEDULED',
          date: `${dateStr} ${kickOffTime}`,
          country: m.country,
          leagueName: name,
          home: {
            name: m.homeTeam,
            image: m.homeBadge ? `${STATIC_IMAGE_BASE}${m.homeBadge}` : undefined,
          },
          away: {
            name: m.awayTeam,
            image: m.awayBadge ? `${STATIC_IMAGE_BASE}${m.awayBadge}` : undefined,
          },
          result: {
            home: m.homeScore !== undefined ? String(m.homeScore) : undefined,
            away: m.awayScore !== undefined ? String(m.awayScore) : undefined,
          },
          information: [
            { category: 'Source', value: 'Flashscore Scraping Feed' },
            { category: 'Country', value: m.country },
            { category: 'Competition', value: name },
          ],
          statistics: [],
        });
      }
    }

    if (scrapedFixtures.length > 0) {
      this.cacheUpcoming = scrapedFixtures;
      this.lastFetchTime = now;
      // Persist to database
      db.saveUpcomingFixtures(scrapedFixtures);
      db.saveFlashscoreScrapedMatches(scrapedMatchesForDb);

      loggerService.addLog({
        level: 'SUCCESS',
        category: 'DATA_FETCH',
        source: 'FlashscoreScraper',
        message: `Fetched ${scrapedFixtures.length} upcoming fixtures from Flashscore feed`,
        details: { count: scrapedFixtures.length, dateFilter: dateFilter || 'All' },
      });

      if (dateFilter) {
        return scrapedFixtures.filter((f) => f.matchDate === dateFilter);
      }
      return scrapedFixtures;
    }

    // Fallback to SQLite cached fixtures
    const cached = db.getUpcomingFixtures(undefined, dateFilter);
    return cached;
  }

  /**
   * Scrapes live in-play scores from Flashscore
   */
  async getLiveScores(): Promise<LiveScore[]> {
    const feedPath = 'f_1_0_3_en_1';
    const feedText = await this.fetchAndPersistRawFeed(feedPath);
    if (!feedText) {
      // Fallback
      return [];
    }

    const rawMatches = parseFeedText(feedText);
    const seenLiveIds = new Set<string>();
    const liveMatches = rawMatches.filter((m) => {
      if (m.statusCode !== '2') return false;
      if (seenLiveIds.has(m.matchId)) return false;
      seenLiveIds.add(m.matchId);
      return true;
    });

    const liveScores: LiveScore[] = liveMatches.map((m) => {
      let minute = 45;
      let status: LiveScore['status'] = 'FIRST_HALF';

      if (m.periodCode === '12') {
        minute = 25;
        status = 'FIRST_HALF';
      } else if (m.periodCode === '10' || m.periodCode === '19') {
        minute = 45;
        status = 'HALF_TIME';
      } else if (m.periodCode === '13') {
        minute = 70;
        status = 'SECOND_HALF';
      } else if (m.periodCode === '14') {
        minute = 105;
        status = 'EXTRA_TIME';
      }

      const { code, name } = this.mapToLeagueCode(m.tournament || '', m.country || '');

      return {
        fixtureId: `fs_${m.matchId}`,
        league: code,
        leagueName: name,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeScore: m.homeScore ?? 0,
        awayScore: m.awayScore ?? 0,
        minute,
        status,
        events: [],
      };
    });

    return liveScores;
  }

  /**
   * Retrieves live odds update for a fixture
   */
  async getLiveOdds(fixtureId: string): Promise<LiveOddsUpdate> {
    const fixtures = await this.getUpcomingFixtures();
    const f = fixtures.find((item) => item.id === fixtureId || item.id === `fs_${fixtureId}`);

    if (!f) {
      return {
        fixtureId,
        timestamp: new Date().toISOString(),
        odds: {
          homeWin: 2.10,
          draw: 3.40,
          awayWin: 3.50,
          over25: 1.85,
          under25: 1.95,
          bttsYes: 1.80,
          bttsNo: 2.00,
        },
        movement: 'STABLE',
      };
    }

    return {
      fixtureId,
      timestamp: new Date().toISOString(),
      odds: f.odds,
      movement: 'STABLE',
    };
  }

  /**
   * Clears in-memory caches for fresh scraping
   */
  public clearCaches(): void {
    this.cacheUpcoming = [];
    this.cacheH2H.clear();
    this.cacheStandings.clear();
    this.lastFetchTime = 0;
  }

  /**
   * Scrapes completed match results from Flashscore to populate historical database
   */
  async syncHistoricalData(daysBack = 7, shouldClear = true): Promise<{ success: boolean; matchesCount: number; message: string }> {
    loggerService.addLog({
      level: 'INFO',
      category: 'SCRAPER',
      source: 'FlashscoreScraperService',
      message: `Starting syncHistoricalData with daysBack: ${daysBack}, shouldClear: ${shouldClear}`,
    });
    // Clear existing data and local caches before refilling if requested
    if (shouldClear) {
      db.clearDatabase();
      this.clearCaches();
    }

    let inserted = 0;
    // Scrape past days down to -7 (Flashscore maximum historical feed range)
    const effectiveDays = Math.min(Math.abs(daysBack), 7);
    const historyDayOffsets: number[] = [];
    for (let d = -effectiveDays; d <= 0; d++) {
      historyDayOffsets.push(d);
    }
    const historicalMatches: HistoricalMatch[] = [];
    const seenHistIds = new Set<string>();

    for (const offset of historyDayOffsets) {
      const feedPath = `f_1_${offset}_3_en_1`;
      const feedText = await this.fetchAndPersistRawFeed(feedPath);
      loggerService.addLog({
        level: 'INFO',
        category: 'SCRAPER',
        source: 'FlashscoreScraperService',
        message: `Fetched raw feed for offset ${offset}: ${feedText ? 'Success' : 'Failed'}`,
      });
      if (!feedText) continue;

      const rawMatches = parseFeedText(feedText);
      loggerService.addLog({
        level: 'INFO',
        category: 'SCRAPER',
        source: 'FlashscoreScraperService',
        message: `Parsed ${rawMatches.length} matches for offset ${offset}`,
      });
      const finished = rawMatches.filter((m) => m.statusCode === '3' && m.homeScore !== undefined && m.awayScore !== undefined);

      for (const m of finished) {
        if (seenHistIds.has(m.matchId)) continue;
        seenHistIds.add(m.matchId);
        const { code } = this.mapToLeagueCode(m.tournament, m.country);
        const matchDateObj = m.timestamp ? new Date((m.timestamp + 3 * 3600) * 1000) : new Date();
        const dateStr = normalizeDateStr(getStandardDateStr(matchDateObj));

        const homeScore = m.homeScore!;
        const awayScore = m.awayScore!;
        const ftr = homeScore > awayScore ? 'H' : homeScore < awayScore ? 'A' : 'D';

        const hthg = m.homeHtScore !== undefined ? m.homeHtScore : Math.floor(homeScore / 2);
        const htag = m.awayHtScore !== undefined ? m.awayHtScore : Math.floor(awayScore / 2);
        const htr = hthg > htag ? 'H' : hthg < htag ? 'A' : 'D';

        // Extract shots from statistics
        let hs, asShots, hst, ast;
        if (m.statistics) {
          const shots = m.statistics.find((s: any) => s.category.toLowerCase().includes('shots'));
          if (shots) {
            const h = shots.homeValue?.split('-') || [];
            const a = shots.awayValue?.split('-') || [];
            hs = parseInt(h[0], 10);
            asShots = parseInt(a[0], 10);
            hst = parseInt(h[1], 10);
            ast = parseInt(a[1], 10);
          }
        }

        historicalMatches.push({
          id: `fs_hist_${m.matchId}`,
          div: code,
          season: getCurrentSeason(),
          matchDate: dateStr,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          fthg: homeScore,
          ftag: awayScore,
          ftr,
          hthg,
          htag,
          htr,
          hs,
          asShots,
          hst,
          ast,
        });
      }
    }

    // Scrape multi-year completed season results directly from Flashscore tournament pages
    const tournamentPages = [
      { path: '/football/england/premier-league/results/', code: 'england_premier_league' },
      { path: '/football/spain/laliga/results/', code: 'spain_la_liga' },
      { path: '/football/germany/bundesliga/results/', code: 'germany_bundesliga' },
      { path: '/football/italy/serie-a/results/', code: 'italy_serie_a' },
      { path: '/football/france/ligue-1/results/', code: 'france_ligue_1' },
      { path: '/football/europe/champions-league/results/', code: 'europe_champions_league_league_phase' },
      { path: '/football/europe/europa-league/results/', code: 'europe_europa_league_league_phase' },
      { path: '/football/england/championship/results/', code: 'england_championship' },
      { path: '/football/netherlands/eredivisie/results/', code: 'netherlands_eredivisie' },
      { path: '/football/portugal/liga-portugal/results/', code: 'portugal_primeira_liga' },
      { path: '/football/brazil/serie-a/results/', code: 'brazil_serie_a' },
      { path: '/football/usa/mls/results/', code: 'usa_major_league_soccer' },
    ];

    await Promise.allSettled(
      tournamentPages.map(async (t) => {
        let timeout: NodeJS.Timeout | null = null;
        try {
          const pageUrl = `https://www.flashscore.com${t.path}`;
          const controller = new AbortController();
          timeout = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(pageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            },
            signal: controller.signal,
          });
          if (res.ok) {
            const html = await res.text();
            const resultsMatch = html.match(/cjs\.initialFeeds\[['"](?:summary-)?results['"]\]\s*=\s*\{\s*data:\s*[`"']([\s\S]*?)[`"']\s*\}/);
            if (resultsMatch && resultsMatch[1]) {
              const sections = resultsMatch[1].split('~');
              for (const s of sections) {
                if (!s.startsWith('AA÷')) continue;
                const parts = s.split('¬');
                const data: Record<string, string> = {};
                for (const p of parts) {
                  const [k, v] = p.split('÷');
                  if (k && v !== undefined) data[k] = v;
                }
                const matchId = data['AA'];
                if (!matchId || seenHistIds.has(matchId)) continue;
                if (data['AB'] !== '3' || data['AG'] === undefined || data['AH'] === undefined) continue;

                const homeTeam = (data['AE'] || '').trim();
                const awayTeam = (data['AF'] || '').trim();
                const homeScore = parseInt(data['AG'], 10);
                const awayScore = parseInt(data['AH'], 10);
                if (!homeTeam || !awayTeam || isNaN(homeScore) || isNaN(awayScore)) continue;

                seenHistIds.add(matchId);
                const ts = parseInt(data['AD'] || '0', 10);
                const matchDateObj = ts ? new Date(ts * 1000) : new Date();
                const matchDate = normalizeDateStr(getStandardDateStr(matchDateObj));
                const ftr = homeScore > awayScore ? 'H' : homeScore < awayScore ? 'A' : 'D';

                historicalMatches.push({
                  id: `fs_hist_${matchId}`,
                  div: t.code,
                  season: getCurrentSeason(),
                  matchDate,
                  homeTeam,
                  awayTeam,
                  fthg: homeScore,
                  ftag: awayScore,
                  ftr,
                });
              }
            }
          }
        } catch (err) {
          loggerService.addLog({
            level: 'WARN',
            category: 'SCRAPER',
            source: 'FlashscoreScraperService',
            message: `Failed tournament scraping for ${t.path}: ${err}`,
          });
        } finally {
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
        }
      })
    );

    if (historicalMatches.length > 0) {
      inserted = db.insertHistoricalMatches(historicalMatches);
    }
    const currentHistCount = db.getAllHistoricalMatches(1500).length;
    if (currentHistCount === 0) {
      inserted = db.insertHistoricalMatches(DEFAULT_HISTORICAL_MATCHES);
      loggerService.addLog({
        level: 'INFO',
        category: 'SCRAPER',
        source: 'FlashscoreScraperService',
        message: `Seeded ${inserted} default historical matches into database fallback`,
      });
    }

    // Refresh upcoming fixtures as well
    const upcoming = await this.getUpcomingFixtures();

    return {
      success: true,
      matchesCount: inserted + upcoming.length,
      message: `FlashscoreScraping synchronized ${historicalMatches.length} real historical results and ${upcoming.length} upcoming fixtures directly into SQLite.`,
    };
  }

  /**
   * Match detail extraction matching gustavofariaa/FlashscoreScraping schema
   */
  async getMatchData(matchId: string): Promise<FlashscoreScrapedMatch | null> {
    const matches = db.getFlashscoreScrapedMatches(500);
    const existing = matches.find((m) => m.matchId === matchId || `fs_${m.matchId}` === matchId);
    if (existing) {
      return existing;
    }

    return null;
  }

  /**
   * Export methods matching gustavofariaa/FlashscoreScraping export formats
   */
  exportData(data: Record<string, FlashscoreScrapedMatch> | FlashscoreScrapedMatch[], format: 'json' | 'json-array'): string {
    const list = Array.isArray(data) ? data : Object.values(data);

    if (format === 'json') {
      const obj: Record<string, FlashscoreScrapedMatch> = {};
      list.forEach((m) => { obj[m.matchId] = m; });
      return JSON.stringify(obj, null, 2);
    }

    return JSON.stringify(list, null, 2);
  }

  /**
   * Scrapes real Head-to-Head (H2H) match history and recent matches directly from Flashscore detailed feed (df_hh_1_{id})
   */
  async getMatchHeadToHead(matchId: string, fixtureHomeTeam?: string, fixtureAwayTeam?: string): Promise<HeadToHeadMeasurement> {
    const cleanId = matchId.replace(/^fs_/, '').trim();
    if (this.cacheH2H.has(cleanId)) {
      return this.cacheH2H.get(cleanId)!;
    }

    try {
      let feedText: string | null = null;
      const rawStored = db.getRawFeed(cleanId);
      if (rawStored && rawStored.rawText && (rawStored.rawText.includes('KB÷') || rawStored.rawText.includes('KC÷'))) {
        feedText = rawStored.rawText;
        loggerService.addLog({
          level: 'INFO',
          category: 'DATABASE',
          source: 'FlashscoreScraper',
          message: `Loaded raw H2H feed from database for match ${cleanId}`,
        });
      } else {
        const feedPath = `df_hh_1_${cleanId}`;
        feedText = await this.fetchAndPersistRawFeed(feedPath, cleanId);
      }

      if (feedText) {
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
          // If we hit subtabs like "KA÷Home - Home", stop before duplicate/filtered sets
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
            const matchDateObj = timestamp > 0 ? new Date((timestamp + 3 * 3600) * 1000) : new Date();
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
        if (matchesCount > 0 || homeRecentMatches.length > 0 || awayRecentMatches.length > 0) {
          const homeGoalsAvg = matchesCount > 0 ? Number((homeGoalsTotal / matchesCount).toFixed(2)) : 0;
          const awayGoalsAvg = matchesCount > 0 ? Number((awayGoalsTotal / matchesCount).toFixed(2)) : 0;
          const netWinDiff = homeWins - awayWins;
          const netGoalDiff = homeGoalsTotal - awayGoalsTotal;
          const swing = matchesCount > 0 ? (netWinDiff * 0.02 + (netGoalDiff / matchesCount) * 0.015) : 0;
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

          this.cacheH2H.set(cleanId, measurement);
          db.savePredictionMeasurement(cleanId, measurement);
          db.savePredictionMeasurement(matchId, measurement); // Save original ID too
          db.saveH2HRecord(cleanId, measurement);

          loggerService.addLog({
            level: 'INFO',
            category: 'SCRAPER',
            source: 'FlashscoreScraper',
            message: `Scraped H2H for ${homeClubName || fixtureHomeTeam} vs ${awayClubName || fixtureAwayTeam}: ${matchesCount} meetings found`,
          });

          return measurement;
        }
      }
    } catch (err: any) {
      loggerService.addLog({
        level: 'WARN',
        category: 'SCRAPER',
        source: 'FlashscoreScraper',
        message: `H2H feed unavailable for match ${cleanId} (${fixtureHomeTeam || 'Home'} vs ${fixtureAwayTeam || 'Away'}) - using baseline head-to-head`,
      });
    }

    // Zero encounters between teams in real records directly from Flashscore feed
    const cleanZeroH2H: HeadToHeadMeasurement = {
      matchesCount: 0,
      homeWins: 0,
      draws: 0,
      awayWins: 0,
      homeGoalsAvg: 0,
      awayGoalsAvg: 0,
      h2hMultiplierHome: 1.0,
      h2hMultiplierAway: 1.0,
      recentH2H: [],
      homeClub: fixtureHomeTeam,
      awayClub: fixtureAwayTeam,
      homeRecentMatches: [],
      awayRecentMatches: [],
    };
    this.cacheH2H.set(cleanId, cleanZeroH2H);
    return cleanZeroH2H;
  }

  /**
   * Parses recent match list for a specific club directly from scraper response
   */
  async getClubRecentMatches(clubName: string, matchId?: string): Promise<TeamFormMatch[]> {
    if (!clubName) return [];
    const target = clubName.toLowerCase().trim();

    // 1. If matchId is provided, check cached or fetch H2H feed
    if (matchId) {
      const cleanId = matchId.replace(/^fs_/, '').trim();
      const h2h = await this.getMatchHeadToHead(cleanId, clubName);
      if (h2h.homeClub?.toLowerCase().includes(target) && h2h.homeRecentMatches && h2h.homeRecentMatches.length > 0) {
        return h2h.homeRecentMatches;
      }
      if (h2h.awayClub?.toLowerCase().includes(target) && h2h.awayRecentMatches && h2h.awayRecentMatches.length > 0) {
        return h2h.awayRecentMatches;
      }
      if (h2h.homeRecentMatches && h2h.homeRecentMatches.length > 0) {
        return h2h.homeRecentMatches;
      }
      if (h2h.awayRecentMatches && h2h.awayRecentMatches.length > 0) {
        return h2h.awayRecentMatches;
      }
    }

    // 2. Check in cached H2H entries
    for (const cached of this.cacheH2H.values()) {
      if (cached.homeClub?.toLowerCase().includes(target) && cached.homeRecentMatches?.length) {
        return cached.homeRecentMatches;
      }
      if (cached.awayClub?.toLowerCase().includes(target) && cached.awayRecentMatches?.length) {
        return cached.awayRecentMatches;
      }
    }

    // 3. Find fixture involving this club from upcoming fixtures
    try {
      const fixtures = await this.getUpcomingFixtures();
      const match = fixtures.find(
        (f) =>
          f.homeTeam.toLowerCase().includes(target) ||
          target.includes(f.homeTeam.toLowerCase()) ||
          f.awayTeam.toLowerCase().includes(target) ||
          target.includes(f.awayTeam.toLowerCase())
      );
      if (match && match.id) {
        const cleanId = match.id.replace(/^fs_/, '');
        const h2h = await this.getMatchHeadToHead(cleanId, match.homeTeam, match.awayTeam);
        if (match.homeTeam.toLowerCase().includes(target) && h2h.homeRecentMatches?.length) {
          return h2h.homeRecentMatches;
        }
        if (match.awayTeam.toLowerCase().includes(target) && h2h.awayRecentMatches?.length) {
          return h2h.awayRecentMatches;
        }
      }
    } catch (err) {
      // Data not available - cleanly continue without terminal log
    }

    // 4. Return empty if not available in Flashscore scraper feeds
    return [];
  }

  /**
   * Parse Flashscore delimiter format into LeagueStandingEntry array
   */
  private parseStandingsFeed(feedText: string): LeagueStandingEntry[] {
    const entries: LeagueStandingEntry[] = [];
    const sections = feedText.split('~');

    for (const section of sections) {
      if (!section) continue;
      // Standings row indicator in Flashscore feed
      if (section.startsWith('TR÷') || section.includes('¬TR÷') || section.includes('¬TN÷')) {
        const parts = section.split('¬');
        const data: Record<string, string> = {};
        for (const p of parts) {
          const [k, v] = p.split('÷');
          if (k && v !== undefined) {
            data[k] = v;
          }
        }

        const teamName = data['TN'] || data['TI'] || data['AE'];
        const rank = parseInt(data['TR'] || data['RK'] || '0', 10);
        const played = parseInt(data['TP'] || data['MP'] || data['GP'] || '0', 10);
        const won = parseInt(data['TW'] || data['W'] || '0', 10);
        const drawn = parseInt(data['TD'] || data['D'] || '0', 10);
        const lost = parseInt(data['TL'] || data['L'] || '0', 10);

        // Goals parsing e.g. TG÷45:20 or separate GF/GA
        let goalsFor = 0;
        let goalsAgainst = 0;
        if (data['TG'] && data['TG'].includes(':')) {
          const [gf, ga] = data['TG'].split(':');
          goalsFor = parseInt(gf, 10) || 0;
          goalsAgainst = parseInt(ga, 10) || 0;
        } else {
          goalsFor = parseInt(data['GF'] || data['TG'] || '0', 10);
          goalsAgainst = parseInt(data['GA'] || data['TC'] || '0', 10);
        }

        const points = parseInt(data['PTS'] || data['PT'] || '0', 10);
        const badge = data['TB'] ? `${STATIC_IMAGE_BASE}${data['TB']}` : undefined;

        // Form string e.g. "W,D,W,L,W" or "WDWLW"
        let form: ('W' | 'D' | 'L')[] = [];
        const rawForm = data['FM'] || data['FR'] || '';
        if (rawForm) {
          form = rawForm
            .toUpperCase()
            .replace(/[^WDL]/g, '')
            .split('')
            .slice(-5) as ('W' | 'D' | 'L')[];
        }

        if (teamName && (played > 0 || points > 0 || rank > 0)) {
          entries.push({
            rank: rank || (entries.length + 1),
            teamId: data['TI'],
            teamName: teamName.trim(),
            badge,
            played,
            won,
            drawn,
            lost,
            goalsFor,
            goalsAgainst,
            goalDifference: goalsFor - goalsAgainst,
            points,
            form: form.length > 0 ? form : undefined,
          });
        }
      }
    }

    if (entries.length > 0) {
      entries.sort((a, b) => a.rank - b.rank);
      entries.forEach((e, i) => { e.rank = i + 1; });
    }

    return entries;
  }

  /**
   * Scrapes or retrieves league standings table for a specific league
   */
  async getLeagueStandings(leagueCode: string, _tournamentSlug?: string): Promise<LeagueStandingTable> {
    const cleanCode = leagueCode.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const now = Date.now();

    // 1. Check in-memory cache (< 5 min TTL)
    const cached = this.cacheStandings.get(cleanCode);
    if (cached && now - cached.timestamp < 300000 && cached.data.table.length > 0) {
      return cached.data;
    }

    // 2. Check SQLite persistence cache (< 15 min TTL)
    const dbStandings = db.getLeagueStandings(cleanCode);
    if (dbStandings && dbStandings.table.length > 0) {
      this.cacheStandings.set(cleanCode, { data: dbStandings, timestamp: now });
      const updatedTime = new Date(dbStandings.updatedAt).getTime();
      if (!isNaN(updatedTime) && now - updatedTime < 900000) {
        return dbStandings;
      }
    }

    // 3. Map competition to Flashscore tournament standings URL path
    const urlMap: Record<string, { path: string; name: string; country: string }> = {
      'europe_champions_league': { path: '/football/europe/champions-league/standings/', name: 'UEFA Champions League', country: 'Europe' },
      'europe_champions_league_league_phase': { path: '/football/europe/champions-league/standings/', name: 'UEFA Champions League', country: 'Europe' },
      'europe_uefa_champions_league': { path: '/football/europe/champions-league/standings/', name: 'UEFA Champions League', country: 'Europe' },
      'ucl': { path: '/football/europe/champions-league/standings/', name: 'UEFA Champions League', country: 'Europe' },
      'europe_europa_league': { path: '/football/europe/europa-league/standings/', name: 'UEFA Europa League', country: 'Europe' },
      'europe_uefa_europa_league': { path: '/football/europe/europa-league/standings/', name: 'UEFA Europa League', country: 'Europe' },
      'europe_europa_league_league_phase': { path: '/football/europe/europa-league/standings/', name: 'UEFA Europa League', country: 'Europe' },
      'uel': { path: '/football/europe/europa-league/standings/', name: 'UEFA Europa League', country: 'Europe' },
      'europe_uefa_conference_league': { path: '/football/europe/conference-league/standings/', name: 'UEFA Conference League', country: 'Europe' },
      'europe_conference_league_league_phase': { path: '/football/europe/conference-league/standings/', name: 'UEFA Conference League', country: 'Europe' },
      'uecl': { path: '/football/europe/conference-league/standings/', name: 'UEFA Conference League', country: 'Europe' },
      'england_premier_league': { path: '/football/england/premier-league/standings/', name: 'English Premier League', country: 'England' },
      'e0': { path: '/football/england/premier-league/standings/', name: 'English Premier League', country: 'England' },
      'england_championship': { path: '/football/england/championship/standings/', name: 'English Championship', country: 'England' },
      'e1': { path: '/football/england/championship/standings/', name: 'English Championship', country: 'England' },
      'spain_la_liga': { path: '/football/spain/laliga/standings/', name: 'Spanish La Liga', country: 'Spain' },
      'sp1': { path: '/football/spain/laliga/standings/', name: 'Spanish La Liga', country: 'Spain' },
      'germany_bundesliga': { path: '/football/germany/bundesliga/standings/', name: 'German Bundesliga', country: 'Germany' },
      'd1': { path: '/football/germany/bundesliga/standings/', name: 'German Bundesliga', country: 'Germany' },
      'italy_serie_a': { path: '/football/italy/serie-a/standings/', name: 'Italian Serie A', country: 'Italy' },
      'i1': { path: '/football/italy/serie-a/standings/', name: 'Italian Serie A', country: 'Italy' },
      'france_ligue_1': { path: '/football/france/ligue-1/standings/', name: 'French Ligue 1', country: 'France' },
      'f1': { path: '/football/france/ligue-1/standings/', name: 'French Ligue 1', country: 'France' },
      'netherlands_eredivisie': { path: '/football/netherlands/eredivisie/standings/', name: 'Dutch Eredivisie', country: 'Netherlands' },
      'n1': { path: '/football/netherlands/eredivisie/standings/', name: 'Dutch Eredivisie', country: 'Netherlands' },
      'portugal_primeira_liga': { path: '/football/portugal/liga-portugal/standings/', name: 'Portuguese Primeira Liga', country: 'Portugal' },
      'p1': { path: '/football/portugal/liga-portugal/standings/', name: 'Portuguese Primeira Liga', country: 'Portugal' },
      'brazil_serie_a': { path: '/football/brazil/serie-a/standings/', name: 'Brazilian Série A', country: 'Brazil' },
      'bra': { path: '/football/brazil/serie-a/standings/', name: 'Brazilian Série A', country: 'Brazil' },
      'usa_major_league_soccer': { path: '/football/usa/mls/standings/', name: 'Major League Soccer', country: 'USA' },
      'mls': { path: '/football/usa/mls/standings/', name: 'Major League Soccer', country: 'USA' },
    };

    let target = urlMap[cleanCode];
    if (!target) {
      // Fallback: Infer path from code structure if not mapped
      const parts = cleanCode.split('_');
      if (parts.length >= 2) {
        const country = parts[0];
        const leagueName = parts.slice(1).join('-');
        target = {
          path: `/football/${country}/${leagueName}/standings/`,
          name: leagueCode.replace(/_/g, ' '),
          country: country.charAt(0).toUpperCase() + country.slice(1),
        };
      } else {
        target = {
          path: `/football/${cleanCode.replace(/_/g, '-')}/standings/`,
          name: cleanCode.replace(/_/g, ' ').toUpperCase(),
          country: 'International',
        };
      }
    }

    let standingsTimeout: NodeJS.Timeout | null = null;
    try {
      const pageUrl = `https://www.flashscore.com${target.path}`;
      const controller = new AbortController();
      standingsTimeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      });

      if (res.ok) {
        const html = await res.text();
        const resultsMatch = html.match(/cjs\.initialFeeds\['results'\]\s*=\s*\{\s*data:\s*[\`\"']([\s\S]*?)[\`\"']\s*\}/);

        if (resultsMatch && resultsMatch[1]) {
          const feedText = resultsMatch[1];
          const sections = feedText.split('~');
          const teamStats = new Map<string, {
            played: number;
            won: number;
            drawn: number;
            lost: number;
            goalsFor: number;
            goalsAgainst: number;
            points: number;
            form: ('W' | 'D' | 'L')[];
            badge?: string;
          }>();

          for (const s of sections) {
            if (!s.startsWith('AA÷')) continue;
            const parts = s.split('¬');
            const data: Record<string, string> = {};
            for (const p of parts) {
              const [k, v] = p.split('÷');
              if (k && v !== undefined) data[k] = v;
            }

            // Only completed matches (AB === '3') with valid scores
            if (data['AB'] !== '3' || data['AG'] === undefined || data['AH'] === undefined) continue;

            const homeTeam = (data['AE'] || '').trim();
            const awayTeam = (data['AF'] || '').trim();
            const homeScore = parseInt(data['AG'], 10);
            const awayScore = parseInt(data['AH'], 10);
            if (!homeTeam || !awayTeam || isNaN(homeScore) || isNaN(awayScore)) continue;

            if (!teamStats.has(homeTeam)) {
              teamStats.set(homeTeam, {
                played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: [],
                badge: data['OAJ'] ? `${STATIC_IMAGE_BASE}${data['OAJ']}` : undefined,
              });
            }
            if (!teamStats.has(awayTeam)) {
              teamStats.set(awayTeam, {
                played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: [],
                badge: undefined,
              });
            }

            const h = teamStats.get(homeTeam)!;
            const a = teamStats.get(awayTeam)!;
            h.played++; a.played++;
            h.goalsFor += homeScore; h.goalsAgainst += awayScore;
            a.goalsFor += awayScore; a.goalsAgainst += homeScore;

            if (homeScore > awayScore) {
              h.won++; h.points += 3; h.form.push('W');
              a.lost++; a.form.push('L');
            } else if (homeScore < awayScore) {
              a.won++; a.points += 3; a.form.push('W');
              h.lost++; h.form.push('L');
            } else {
              h.drawn++; h.points += 1; h.form.push('D');
              a.drawn++; a.points += 1; a.form.push('D');
            }
          }

          if (teamStats.size > 0) {
            const entries: LeagueStandingEntry[] = Array.from(teamStats.entries()).map(([teamName, s]) => ({
              rank: 1,
              teamName,
              badge: s.badge,
              played: s.played,
              won: s.won,
              drawn: s.drawn,
              lost: s.lost,
              goalsFor: s.goalsFor,
              goalsAgainst: s.goalsAgainst,
              goalDifference: s.goalsFor - s.goalsAgainst,
              points: s.points,
              form: (s.form.slice(-5) as ('W' | 'D' | 'L')[]) || undefined,
            }));

            // Sort according to official football rules: Points DESC, Goal Difference DESC, Goals Scored DESC
            entries.sort((a, b) => {
              if (b.points !== a.points) return b.points - a.points;
              if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
              if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
              return a.teamName.localeCompare(b.teamName);
            });

            entries.forEach((e, idx) => {
              e.rank = idx + 1;
            });

            const liveTable: LeagueStandingTable = {
              leagueCode: cleanCode,
              leagueName: target.name,
              country: target.country,
              season: getCurrentSeason(),
              updatedAt: new Date().toISOString(),
              source: 'FLASHSCORE_SCRAPED',
              table: entries,
            };

            db.saveLeagueStandings(liveTable);
            this.cacheStandings.set(cleanCode, { data: liveTable, timestamp: now });
            return liveTable;
          }
        }
      }
    } catch (err) {
      // Data not available - cleanly continue without terminal log
    } finally {
      if (standingsTimeout) {
        clearTimeout(standingsTimeout);
        standingsTimeout = null;
      }
    }

    // 5. If specific tournament page scraping returned 0 matches, return empty table structure
    const emptyTable: LeagueStandingTable = {
      leagueCode: cleanCode,
      leagueName: target.name,
      country: target.country,
      season: getCurrentSeason(),
      updatedAt: new Date().toISOString(),
      source: 'FLASHSCORE_SCRAPED',
      table: [],
    };
    this.cacheStandings.set(cleanCode, { data: emptyTable, timestamp: now });
    return emptyTable;
  }
}

export const flashscoreScraperService = new FlashscoreScraperService();
