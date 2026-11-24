import { cleanFixtureId, Fixture, HistoricalMatch, LeagueCode, HeadToHeadMeasurement, LeagueStandingTable, ProviderStatus, ScrapedMarketOdds } from '../core/types.js';
import { LiveScore } from '../providers/types.js';
import { db } from '../core/db.js';
import { isScrapingEnabled } from '../core/scrapingGate.js';
import { getLeaguePriority } from '../core/leaguePriority.js';
import { isSimulationLeague } from '../core/leagueMapper.js';

export function convertHistoricalMatchToFixture(m: HistoricalMatch): Fixture {
  const homeScore = m.fthg ?? 0;
  const awayScore = m.ftag ?? 0;

  const stats: Array<{ category: string; homeValue?: any; awayValue?: any }> = [];
  if (m.hs !== undefined && m.asShots !== undefined) {
    stats.push({ category: 'Goal Attempts', homeValue: m.hs, awayValue: m.asShots });
  }
  if (m.hst !== undefined && m.ast !== undefined) {
    stats.push({ category: 'Shots on Goal', homeValue: m.hst, awayValue: m.ast });
  }
  stats.push({ category: 'Goals', homeValue: homeScore, awayValue: awayScore });

  const info = [
    { category: 'Match Date', value: normalizeDateStr(m.matchDate) },
    { category: 'Competition', value: m.leagueName || m.div || 'League' },
    { category: 'Status', value: 'Full Time' },
    { category: 'Result', value: `${homeScore} - ${awayScore}` },
  ];

  return {
    id: m.id ? (m.id.startsWith('hist_') || m.id.startsWith('fs_hist_') ? m.id : `fs_hist_${m.id}`) : `fs_hist_${Math.random()}`,
    providerId: 'FLASHSCORE',
    league: m.div || 'FLASHSCORE',
    leagueName: m.leagueName || m.div || 'FLASHSCORE',
    matchDate: normalizeDateStr(m.matchDate),
    kickOffTime: 'FT',
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    status: 'FINISHED' as const,
    score: { home: homeScore, away: awayScore },
    statistics: stats,
    information: info,
    prediction: undefined,
  };
}



import { GLOBAL_LEAGUES_DATASET } from '../core/globalLeaguesDataset.js';
import {
  getCurrentSeason,
  getUtcDateStr,
  matchesDateFilter,
  normalizeDateStr,
  normalizeTimeStr,
  getStandardDateStr,
} from '../core/dateUtils.js';
import { loggerService } from './loggerService.js';


const FLASHSCORE_FEED_BASE = 'https://www.flashscore.com/x/feed';
const FLASHSCORE_NINJA_BASE = 'https://2.flashscore.ninja/2/x/feed';
const CYRILLIC_REGEX = /[\u0400-\u04FF]/;
const FSIGN_HEADER = 'SW9D1eZo';
const STATIC_IMAGE_BASE = 'https://static.flashscore.com/res/image/data/';

import {
  parseFeedText,
  parseHeadToHeadFeedText,
  parseFlashscoreStandingsFeed,
  buildFallbackH2HFromHistoricalDb,
  teamMatchScore,
  H2H_PARSER_VERSION,
  ScrapedRawMatch,
} from '../core/feedParser.js';

export type CircuitState = 'CLOSED' | 'HALF_OPEN' | 'OPEN';

export class ScraperCircuitBreaker {
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private state: CircuitState = 'CLOSED';
  private failureThreshold = 5;
  private resetTimeoutMs = 30000;

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    if (this.state === 'OPEN') {
      if (now - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new Error('Circuit Breaker OPEN - backing off upstream scraper feed requests');
      }
    }

    try {
      const res = await fn();
      this.onSuccess();
      return res;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = 'CLOSED';
      }
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  public getStatus(): { state: CircuitState; failureCount: number } {
    return { state: this.state, failureCount: this.failureCount };
  }
}

export const scraperCircuitBreaker = new ScraperCircuitBreaker();

export class FlashscoreScraperService {
  private lastFetchTime = 0;
  private CACHE_TTL_MS = 60000; // 1 minute in-memory cache
  private upcomingMultiDaySyncPromise: Promise<Fixture[]> | null = null;
  private lastMultiDaySyncAt = 0;

  /**
   * Fetch raw feed string from Flashscore feed endpoint
   */
  private async fetchFlashscoreFeed(path: string): Promise<string | null> {
    if (!isScrapingEnabled()) {
      return null;
    }
    const urls = [
      `${FLASHSCORE_FEED_BASE}/${path}`,
      `${FLASHSCORE_NINJA_BASE}/${path}`,
      `https://1.flashscore.ninja/2/x/feed/${path}`,
      `https://www.flashscore.co.uk/x/feed/${path}`,
      `https://www.flashscore.in/x/feed/${path}`,
    ];

    let lastError: any = null;

    try {
      return await scraperCircuitBreaker.execute(async () => {
        for (let attempt = 0; attempt < urls.length; attempt++) {
          const url = urls[attempt];
          let timeout: NodeJS.Timeout | null = null;
          try {
            if (attempt > 0) {
              const backoffMs = Math.min(2000, Math.pow(2, attempt - 1) * 300) + Math.random() * 150;
              await new Promise((r) => setTimeout(r, backoffMs));
            }

            const controller = new AbortController();
            timeout = setTimeout(() => controller.abort(), 6000);

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
              // Flashscore responses can sometimes be very short (e.g., A1÷¬~)
              if (text && text.length > 0) {
                if (CYRILLIC_REGEX.test(text)) {
                  lastError = new Error(`Non-English (Cyrillic) feed returned by ${url}`);
                  continue;
                }
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
        throw lastError || new Error(`All ${urls.length} Flashscore mirrors failed for path ${path}`);
      });
    } catch (cbErr: any) {
      const localCached = db.getRawFeed(path);
      if (localCached && localCached.rawText && !CYRILLIC_REGEX.test(localCached.rawText)) {
        return localCached.rawText;
      }

      loggerService.addLog({
        level: 'INFO',
        category: 'SCRAPER',
        source: 'FlashscoreScraperService',
        message: `Flashscore feed fallback for path "${path}": ${cbErr?.message || 'Remote endpoints unavailable'}`,
        details: {
          path,
          error: cbErr?.message,
          timestamp: new Date().toISOString(),
        },
      });

      return null;
    }
  }

  async fetchAndPersistRawFeed(path: string, fixtureId?: string): Promise<string | null> {
    const rawText = await this.fetchFlashscoreFeed(path);
    if (rawText) {
      db.saveRawFeed(fixtureId || path, path, rawText);

      // Automatically parse and persist match records from raw feed text into database tables
      try {
        const rawMatches = parseFeedText(rawText);
        if (rawMatches && rawMatches.length > 0) {
          const upcomingFixturesToSave: Fixture[] = [];
          const scrapedMatchesForDb: any[] = [];
          const historicalMatchesToSave: HistoricalMatch[] = [];
          const statusUpdates: Array<{ id: string; status: string; kickOffTime?: string; score?: { home: number; away: number } }> = [];

          for (const m of rawMatches) {
            const matchDateObj = m.timestamp ? new Date(m.timestamp * 1000) : new Date();
            const year = matchDateObj.getUTCFullYear();
            const month = String(matchDateObj.getUTCMonth() + 1).padStart(2, '0');
            const day = String(matchDateObj.getUTCDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            const hours = String(matchDateObj.getUTCHours()).padStart(2, '0');
            const minutes = String(matchDateObj.getUTCMinutes()).padStart(2, '0');
            const kickOffTime = `${hours}:${minutes}`;

            const { code, name } = this.mapToLeagueCode(m.tournament, m.country);
            if (isSimulationLeague(code, name, m.country, m.leagueUrl, m.tournament, m.homeTeam, m.awayTeam)) {
              continue;
            }
            const isLive = m.statusCode === '2';
            const isFinished = ['3', '10', '11', '47', '48', '49'].includes(m.statusCode || '');
            const isCancelledOrPostponed = ['4', '5', '6', '36', '37', '38'].includes(m.statusCode || '');
            const mappedStatus = isFinished
              ? 'FINISHED'
              : isLive
              ? 'LIVE'
              : ['5', '36'].includes(m.statusCode || '')
              ? 'CANCELLED'
              : isCancelledOrPostponed
              ? 'POSTPONED'
              : 'SCHEDULED';

            if (isFinished && m.homeScore !== undefined && m.awayScore !== undefined) {
              const ftr = m.homeScore > m.awayScore ? 'H' : m.homeScore < m.awayScore ? 'A' : 'D';
              historicalMatchesToSave.push({
                id: `fs_hist_${m.matchId}`,
                div: code,
                season: getCurrentSeason(),
                matchDate: dateStr,
                homeTeam: m.homeTeam,
                awayTeam: m.awayTeam,
                fthg: m.homeScore,
                ftag: m.awayScore,
                ftr,
              });
              statusUpdates.push({
                id: `fs_${m.matchId}`,
                status: 'FINISHED',
                kickOffTime: 'FT',
                score: { home: m.homeScore, away: m.awayScore },
              });
            } else if (isCancelledOrPostponed) {
              statusUpdates.push({
                id: `fs_${m.matchId}`,
                status: mappedStatus,
                kickOffTime: mappedStatus,
              });
            } else if (!isFinished && !isCancelledOrPostponed) {
              upcomingFixturesToSave.push({
                id: `fs_${m.matchId}`,
                providerId: 'FLASHSCORE',
                league: code,
                leagueName: name,
                leagueUrl: m.leagueUrl,
                matchDate: dateStr,
                kickOffTime,
                timestamp: m.timestamp,
                homeTeam: m.homeTeam,
                awayTeam: m.awayTeam,
                homeBadge: m.homeBadge ? `${STATIC_IMAGE_BASE}${m.homeBadge}` : undefined,
                awayBadge: m.awayBadge ? `${STATIC_IMAGE_BASE}${m.awayBadge}` : undefined,
                status: isLive ? 'LIVE' : 'SCHEDULED',
                stage: m.tournament,
                score: (m.homeScore !== undefined && m.awayScore !== undefined) ? { home: m.homeScore, away: m.awayScore } : undefined,
                minute: m.minute,
                information: [
                  { category: 'Source', value: 'Flashscore Scraping Feed Auto-Parser' },
                  { category: 'Country', value: m.country },
                  { category: 'Competition', value: name },
                ],
                statistics: m.statistics || [],
              });
            }

            scrapedMatchesForDb.push({
              matchId: m.matchId,
              stage: m.tournament,
              status: mappedStatus,
              date: `${dateStr} ${kickOffTime}`,
              country: m.country,
              leagueName: name,
              home: { name: m.homeTeam, image: m.homeBadge ? `${STATIC_IMAGE_BASE}${m.homeBadge}` : undefined },
              away: { name: m.awayTeam, image: m.awayBadge ? `${STATIC_IMAGE_BASE}${m.awayBadge}` : undefined },
              result: {
                home: m.homeScore !== undefined ? String(m.homeScore) : undefined,
                away: m.awayScore !== undefined ? String(m.awayScore) : undefined,
              },
              information: [
                { category: 'Source', value: 'Flashscore Scraping Feed Auto-Parser' },
                { category: 'Country', value: m.country },
                { category: 'Competition', value: name },
              ],
              statistics: m.statistics || [],
            });
          }

          if (upcomingFixturesToSave.length > 0) {
            await db.saveUpcomingFixtures(upcomingFixturesToSave);
          }
          if (statusUpdates.length > 0) {
            db.updateUpcomingFixtureStatuses(statusUpdates);
          }
          if (historicalMatchesToSave.length > 0) {
            db.insertHistoricalMatches(historicalMatchesToSave);
          }
          if (scrapedMatchesForDb.length > 0) {
            db.saveFlashscoreScrapedMatches(scrapedMatchesForDb);
          }
        }
      } catch (parseErr) {
        console.error('[FlashscoreScraper] Error auto-parsing raw feed:', parseErr);
      }
    }
    return rawText;
  }

  /**
   * Map tournament/country string to application LeagueCode
   */
  private mapToLeagueCode(tournament: string, country: string): { code: LeagueCode; name: string } {
    const cleanedTournament = tournament.replace(/^[A-Z\s]+:\s*/, '').trim();
    const cleanedLower = cleanedTournament.toLowerCase();
    const countryLower = (country || '').toLowerCase();

    const matchesCountry = (l: (typeof GLOBAL_LEAGUES_DATASET)[number]) =>
      l.country?.toLowerCase() === countryLower || countryLower === 'international';

    // 1. Exact league name match first (prevents "LaLiga" matching "LaLiga 2" or "Bundesliga" matching "2. Bundesliga")
    const exactMatch = GLOBAL_LEAGUES_DATASET.find(
      (l) => l.name.toLowerCase() === cleanedLower && matchesCountry(l)
    );
    if (exactMatch) {
      return { code: exactMatch.code as LeagueCode, name: exactMatch.name };
    }

    // 2. Fallback to substring match in Global Leagues Dataset
    const match = GLOBAL_LEAGUES_DATASET.find(
      (l) => l.name.toLowerCase().includes(cleanedLower) && matchesCountry(l)
    );

    if (match) {
      return { code: match.code as LeagueCode, name: match.name };
    }

    const countryPrefix = country ? country.trim() : 'International';
    
    // Fallback: Generate native Flashscore naming/slug code
    const nativeCode = `${countryPrefix}_${cleanedTournament}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const name = country ? `${country}: ${cleanedTournament}` : cleanedTournament;
    return { code: nativeCode as LeagueCode, name };
  }


  private hasMultiDayUpcomingCoverage(): boolean {
    if (db.hasCyrillicUpcomingData()) {
      db.purgeCyrillicFixtures();
      return false;
    }
    const day0 = getUtcDateStr(0);
    const day1 = getUtcDateStr(1);
    const day2 = getUtcDateStr(2);
    const counts = db.getUpcomingDateCounts([day0, day1, day2]);
    return (counts[day1] || 0) > 0 && (counts[day2] || 0) > 0;
  }

  public async ensureUpcomingMultiDayCoverage(): Promise<void> {
    if (!isScrapingEnabled()) {
      return;
    }
    if (this.hasMultiDayUpcomingCoverage()) {
      return;
    }
    if (Date.now() - this.lastMultiDaySyncAt < 5 * 60 * 1000 && !this.upcomingMultiDaySyncPromise) {
      return;
    }
    try {
      await this.getUpcomingFixtures(undefined, true);
    } catch {
      // Non-fatal fallback; DB returns whatever is currently stored
    }
  }

  /**
   * Scrapes upcoming and scheduled fixtures from Flashscore UTC feeds across days 0..7
   */
  async getUpcomingFixtures(dateFilter?: string, forceRefresh = false): Promise<Fixture[]> {
    const filterUpper = (dateFilter || '').trim().toUpperCase();
    const isSingleDayFilter = Boolean(dateFilter) && !['ALL', 'NEXT_3_DAYS', 'THIS_WEEK'].includes(filterUpper);

    if (!isScrapingEnabled()) {
      return db.getUpcomingFixtures(undefined, dateFilter);
    }

    // 1. Primary lookup: Return cached SQLite fixtures only if multi-day coverage exists (or requested single day is populated)
    if (!forceRefresh) {
      const sqliteUpcoming = db.getUpcomingFixtures(undefined, dateFilter);
      const hasCoverage = isSingleDayFilter
        ? sqliteUpcoming.length > 0
        : sqliteUpcoming.length > 0 && this.hasMultiDayUpcomingCoverage();
      if (hasCoverage) {
        return sqliteUpcoming;
      }
    }

    const runMultiDayScrape = async (): Promise<Fixture[]> => {
      const scrapedFixtures: Fixture[] = [];
      const scrapedMatchesForDb: any[] = [];
      const seenMatchIds = new Set<string>();

      // Scrape Day 0 (today) through Day 7 using canonical UTC feed (t=0)
      const dayOffsets = [0, 1, 2, 3, 4, 5, 6, 7];
      const feedResults: Array<{ feedPath: string; feedText: string | null }> = [];

      const batchSize = 4;
      for (let i = 0; i < dayOffsets.length; i += batchSize) {
        const batch = dayOffsets.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (offset) => {
            const feedPath = `f_1_${offset}_0_en_1`;
            const feedText = await this.fetchAndPersistRawFeed(feedPath);
            return { feedPath, feedText };
          })
        );
        feedResults.push(...batchResults);
      }

      for (const { feedPath, feedText } of feedResults) {
        if (!feedText) continue;

        const rawMatches = parseFeedText(feedText);

        for (const m of rawMatches) {
          // Skip finished, cancelled, and postponed matches
          if (['3', '4', '5', '6', '10', '11', '36', '37', '38', '47', '48', '49'].includes(m.statusCode || '')) {
            continue;
          }

          // Guarantee unique fixture ID
          if (seenMatchIds.has(m.matchId)) continue;
          seenMatchIds.add(m.matchId);

          const matchDateObj = m.timestamp ? new Date(m.timestamp * 1000) : new Date();
          const year = matchDateObj.getUTCFullYear();
          const month = String(matchDateObj.getUTCMonth() + 1).padStart(2, '0');
          const day = String(matchDateObj.getUTCDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;
          const hours = String(matchDateObj.getUTCHours()).padStart(2, '0');
          const minutes = String(matchDateObj.getUTCMinutes()).padStart(2, '0');
          const kickOffTime = `${hours}:${minutes}`;

          const { code, name } = this.mapToLeagueCode(m.tournament, m.country);
          if (isSimulationLeague(code, name, m.country, m.leagueUrl, m.tournament, m.homeTeam, m.awayTeam)) {
            continue;
          }

          const isLive = m.statusCode === '2';
          const fixture: Fixture = {
            id: `fs_${m.matchId}`,
            providerId: 'FLASHSCORE',
            league: code,
            leagueName: name,
            leagueUrl: m.leagueUrl,
            matchDate: dateStr,
            kickOffTime,
            timestamp: m.timestamp,
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            homeParticipantId: m.homeParticipantId,
            awayParticipantId: m.awayParticipantId,
            homeBadge: m.homeBadge ? `${STATIC_IMAGE_BASE}${m.homeBadge}` : undefined,
            awayBadge: m.awayBadge ? `${STATIC_IMAGE_BASE}${m.awayBadge}` : undefined,
            status: isLive ? 'LIVE' : 'SCHEDULED',
            stage: m.tournament,
            score: (m.homeScore !== undefined && m.awayScore !== undefined)
              ? { home: m.homeScore, away: m.awayScore }
              : undefined,
            feed_path: feedPath,
            information: [
              { category: 'Source', value: 'Flashscore Scraping Feed' },
              { category: 'Country', value: m.country },
              { category: 'Competition', value: name },
            ],
            statistics: m.statistics || [],
          } as any;

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
            statistics: m.statistics || [],
          });
        }
      }

      if (scrapedFixtures.length > 0) {
        await db.saveUpcomingFixtures(scrapedFixtures);
        db.saveFlashscoreScrapedMatches(scrapedMatchesForDb);

        loggerService.addLog({
          level: 'SUCCESS',
          category: 'DATA_FETCH',
          source: 'FlashscoreScraper',
          message: `Fetched ${scrapedFixtures.length} upcoming fixtures across days 0..7 from Flashscore UTC feed`,
          details: { count: scrapedFixtures.length, dateFilter: dateFilter || 'All' },
        });

        return scrapedFixtures;
      }

      return db.getUpcomingFixtures();
    };

    if (!this.upcomingMultiDaySyncPromise) {
      this.upcomingMultiDaySyncPromise = runMultiDayScrape().finally(() => {
        this.lastMultiDaySyncAt = Date.now();
        this.upcomingMultiDaySyncPromise = null;
      });
    }

    const allFixtures = await this.upcomingMultiDaySyncPromise;
    if (dateFilter && filterUpper !== 'ALL') {
      return allFixtures.filter((f) => matchesDateFilter(f, dateFilter));
    }
    return allFixtures;
  }

  /**
   * Scrapes live in-play scores from Flashscore
   */
  async getLiveScores(): Promise<LiveScore[]> {
    if (!isScrapingEnabled()) {
      return [];
    }
    const feedPath = 'f_1_0_0_en_1';
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

    const liveScores: LiveScore[] = [];
    for (const m of liveMatches) {
      const { code, name } = this.mapToLeagueCode(m.tournament || '', m.country || '');
      if (isSimulationLeague(code, name, m.country, m.leagueUrl, m.tournament, m.homeTeam, m.awayTeam)) {
        continue;
      }

      let computedMinute = 45;
      let status: LiveScore['status'] = 'FIRST_HALF';

      const nowSec = Math.floor(Date.now() / 1000);
      const startSec = m.timestamp || 0;

      if (m.periodCode === '12') {
        status = 'FIRST_HALF';
        if (startSec > 0) {
          const elapsed = Math.floor((nowSec - startSec) / 60);
          computedMinute = Math.max(1, Math.min(45, elapsed));
        } else {
          computedMinute = 25;
        }
      } else if (m.periodCode === '10' || m.periodCode === '19') {
        computedMinute = 45;
        status = 'HALF_TIME';
      } else if (m.periodCode === '13') {
        status = 'SECOND_HALF';
        if (startSec > 0) {
          const elapsed2 = 45 + Math.floor((nowSec - (startSec + 3600)) / 60);
          computedMinute = Math.max(46, Math.min(90, elapsed2));
        } else {
          computedMinute = 70;
        }
      } else if (m.periodCode === '14') {
        status = 'EXTRA_TIME';
        if (startSec > 0) {
          const elapsedET = 90 + Math.floor((nowSec - (startSec + 6300)) / 60);
          computedMinute = Math.max(91, Math.min(120, elapsedET));
        } else {
          computedMinute = 105;
        }
      } else if (startSec > 0) {
        const elapsed = Math.floor((nowSec - startSec) / 60);
        computedMinute = Math.max(1, Math.min(90, elapsed));
      }

      const finalMinute = (m.minute && m.minute > 0) ? m.minute : computedMinute;

      liveScores.push({
        fixtureId: `fs_${m.matchId}`,
        league: code,
        leagueName: name,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeScore: m.homeScore ?? 0,
        awayScore: m.awayScore ?? 0,
        minute: finalMinute,
        status,
        events: [],
      });
    }

    return liveScores;
  }


  /**
   * Refreshes and persists daily UTC Flashscore feed (t=0) for a given day offset (-7..1)
   */
  public async syncDailyFeedForOffset(offsetDays: number): Promise<boolean> {
    if (!isScrapingEnabled()) {
      return false;
    }
    const clampedOffset = Math.max(-7, Math.min(1, Math.trunc(offsetDays)));
    const feedPath = `f_1_${clampedOffset}_0_en_1`;
    const rawText = await this.fetchAndPersistRawFeed(feedPath);
    return Boolean(rawText && rawText.length > 0);
  }

  /**
   * Queries Flashscore lightweight match header feed (dc_1_<id>) for authoritative status and score.
   * Uses a short timeout and bypasses the global scraperCircuitBreaker so individual lookup misses never block bulk feeds.
   */
  public async fetchMatchStatusAndScore(matchId: string): Promise<{
    statusCode: string;
    status: 'FINISHED' | 'LIVE' | 'SCHEDULED' | 'POSTPONED' | 'CANCELLED';
    homeScore?: number;
    awayScore?: number;
    minute?: number;
  } | null> {
    if (!isScrapingEnabled()) {
      return null;
    }
    const cleanId = String(matchId || '')
      .replace(/^fs_hist_/, '')
      .replace(/^fs_/, '')
      .replace(/^hist_/, '')
      .replace(/^scraped_/, '')
      .trim();

    if (!cleanId) return null;

    const urls = [
      `${FLASHSCORE_FEED_BASE}/dc_1_${cleanId}`,
      `${FLASHSCORE_NINJA_BASE}/dc_1_${cleanId}`,
    ];

    for (const url of urls) {
      let timeout: NodeJS.Timeout | null = null;
      try {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(url, {
          headers: {
            'x-fsign': FSIGN_HEADER,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': 'https://www.flashscore.com/',
            'Origin': 'https://www.flashscore.com',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': '*/*',
          },
          signal: controller.signal,
        });

        if (!res.ok) continue;
        const text = await res.text();
        if (!text || (!text.includes('DB÷') && !text.includes('DA÷') && !text.includes('DE÷'))) {
          continue;
        }

        const kv: Record<string, string> = {};
        for (const section of text.split('~')) {
          for (const part of section.split('¬')) {
            const sepIdx = part.indexOf('÷');
            if (sepIdx > 0) {
              kv[part.slice(0, sepIdx)] = part.slice(sepIdx + 1);
            }
          }
        }

        const statusCode = kv['DB'] || kv['DA'] || kv['DZ'] || '';
        const parsedHome = kv['DE'] !== undefined && kv['DE'] !== '' ? parseInt(kv['DE'], 10) : NaN;
        const parsedAway = kv['DF'] !== undefined && kv['DF'] !== '' ? parseInt(kv['DF'], 10) : NaN;
        const homeScore = Number.isFinite(parsedHome) ? parsedHome : undefined;
        const awayScore = Number.isFinite(parsedAway) ? parsedAway : undefined;

        let status: 'FINISHED' | 'LIVE' | 'SCHEDULED' | 'POSTPONED' | 'CANCELLED' = 'SCHEDULED';
        if (['3', '10', '11', '47', '48', '49'].includes(statusCode)) {
          status = 'FINISHED';
        } else if (statusCode === '2') {
          status = 'LIVE';
        } else if (['5', '36'].includes(statusCode)) {
          status = 'CANCELLED';
        } else if (['4', '6', '37', '38'].includes(statusCode)) {
          status = 'POSTPONED';
        }

        let minute: number | undefined;
        if (status === 'LIVE') {
          const rawMin = parseInt(kv['DD'] || kv['DM'] || '', 10);
          if (Number.isFinite(rawMin) && rawMin > 0) {
            minute = rawMin;
          } else {
            const period = kv['DC'] || '';
            const nowSec = Math.floor(Date.now() / 1000);
            const periodStart = parseInt(kv['DK'] || kv['AD'] || '', 10);
            if (period === '10' || period === '19') {
              minute = 45;
            } else if (Number.isFinite(periodStart) && periodStart > 0) {
              const elapsed = Math.floor((nowSec - periodStart) / 60);
              if (period === '13') minute = Math.max(46, Math.min(90, 45 + elapsed));
              else if (period === '14') minute = Math.max(91, Math.min(120, 90 + elapsed));
              else minute = Math.max(1, Math.min(45, elapsed));
            }
          }
        }

        return { statusCode, status, homeScore, awayScore, minute };
      } catch {
        // Try next mirror
      } finally {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
      }
    }

    return null;
  }

  /**
   * Clears in-memory caches for fresh scraping
   */
  public clearCaches(): void {
    this.lastFetchTime = 0;
    this.lastMultiDaySyncAt = 0;
  }

  /**
   * Playwright headless browser fallback when direct HTTP feed requests fail or hit Cloudflare/403/429
   */
  private async runPlaywrightScraperFallback(seasonUrl: string): Promise<HistoricalMatch[]> {
    if (!isScrapingEnabled()) {
      return [];
    }
    loggerService.addLog({
      level: 'INFO',
      category: 'SCRAPER',
      source: 'FlashscoreScraperService',
      message: `Executing Playwright headless browser fallback for URL: ${seasonUrl}`,
    });

    const matches: HistoricalMatch[] = [];
    try {
      // Dynamic import of playwright via indirect evaluation so Vite dev server AST scanner does not try to bundle browser/Node playwright dependencies
      // @ts-ignore
      const pwImport = new Function('m', 'return import(m)');
      const { chromium } = await pwImport('playwright');
      if (!chromium) return matches;
      
      const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }).catch(() => null);
      if (!browser) return matches;

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      }).catch(() => null);
      if (!context) {
        await browser.close().catch(() => {});
        return matches;
      }

      const page = await context.newPage().catch(() => null);
      if (!page) {
        await browser.close().catch(() => {});
        return matches;
      }

      await page.goto(seasonUrl, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});

      // Click "Show more matches" if available
      const loadMoreSelector = '[data-testid="wcl-buttonLink"]';
      for (let i = 0; i < 3; i++) {
        try {
          const btn = await page.$(loadMoreSelector);
          if (!btn) break;
          await btn.click();
          await page.waitForTimeout(400);
        } catch {
          break;
        }
      }

      // Extract match elements from DOM
      const rawDOMMatches = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('.event__match.event__match--static.event__match--twoLine'));
        return els.map((el) => {
          const id = el.id ? el.id.replace('g_1_', '') : '';
          const home = el.querySelector('.event__participant--home')?.textContent?.trim() || '';
          const away = el.querySelector('.event__participant--away')?.textContent?.trim() || '';
          const scoreHome = el.querySelector('.event__score--home')?.textContent?.trim() || '';
          const scoreAway = el.querySelector('.event__score--away')?.textContent?.trim() || '';
          return { id, home, away, scoreHome, scoreAway };
        });
      }).catch(() => []);

      await browser.close().catch(() => {});

      for (const m of rawDOMMatches) {
        if (!m.id || !m.home || !m.away) continue;
        const hScore = parseInt(m.scoreHome, 10);
        const aScore = parseInt(m.scoreAway, 10);
        if (isNaN(hScore) || isNaN(aScore)) continue;

        const ftr = hScore > aScore ? 'H' : hScore < aScore ? 'A' : 'D';
        matches.push({
          id: `fs_hist_${m.id}`,
          div: 'FLASHSCORE',
          season: getCurrentSeason(),
          matchDate: normalizeDateStr(getStandardDateStr(new Date())),
          homeTeam: m.home,
          awayTeam: m.away,
          fthg: hScore,
          ftag: aScore,
          ftr,
        });
      }

      if (matches.length > 0) {
        loggerService.addLog({
          level: 'SUCCESS',
          category: 'SCRAPER',
          source: 'FlashscoreScraperService',
          message: `Playwright headless fallback successfully retrieved ${matches.length} matches from ${seasonUrl}`,
        });
      }
    } catch (err: any) {
      loggerService.addLog({
        level: 'WARN',
        category: 'SCRAPER',
        source: 'FlashscoreScraperService',
        message: `Playwright headless fallback skipped for ${seasonUrl}: ${err?.message || err}`,
      });
    }

    return matches;
  }

  /**
   * Discovers and scrapes full multi-year season archive results for a given tournament path
   */
  async scrapeLeagueArchive(
    baseLeaguePath: string,
    leagueCode: string,
    maxSeasons = 2,
    allowPlaywrightFallback = false
  ): Promise<HistoricalMatch[]> {
    if (!isScrapingEnabled() || isSimulationLeague(leagueCode, undefined, undefined, baseLeaguePath)) {
      return [];
    }
    const historicalMatches: HistoricalMatch[] = [];
    const seenMatchIds = new Set<string>();

    try {
      // 1. Fetch the /archive/ page to discover past season URLs
      const archiveUrl = `https://www.flashscore.com${baseLeaguePath.replace(/\/results\/?$/, '')}/archive/`;
      let seasonUrls: string[] = [`https://www.flashscore.com${baseLeaguePath}`];

      let archiveTimeout: ReturnType<typeof setTimeout> | null = null;
      try {
        const controller = new AbortController();
        archiveTimeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(archiveUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
          signal: controller.signal,
        });

        if (res.ok) {
          const html = await res.text();
          const seasonMatches = Array.from(html.matchAll(/href=["'](\/football\/[a-z0-9-]+\/[a-z0-9-]+-[0-9]{4}-[0-9]{4}\/results\/)["']/g));
          const extractedUrls = Array.from(new Set(seasonMatches.map((m) => `https://www.flashscore.com${m[1]}`)));
          if (extractedUrls.length > 0) {
            seasonUrls = [...seasonUrls, ...extractedUrls].slice(0, maxSeasons);
          }
        }
      } catch (err) {
        loggerService.addLog({
          level: 'INFO',
          category: 'SCRAPER',
          source: 'FlashscoreScraperService',
          message: `Archive listing fetch note for ${leagueCode}: ${err}`,
        });
      } finally {
        if (archiveTimeout) clearTimeout(archiveTimeout);
      }

      // 2. Scrape results for each discovered season
      for (const seasonUrl of seasonUrls) {
        let seasonMatchesExtracted = 0;
        let seasonTimeout: ReturnType<typeof setTimeout> | null = null;
        try {
          const controller = new AbortController();
          seasonTimeout = setTimeout(() => controller.abort(), 4000);
          const res = await fetch(seasonUrl, {
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
                if (!matchId || seenMatchIds.has(matchId)) continue;
                if (data['AB'] !== '3' || data['AG'] === undefined || data['AH'] === undefined) continue;

                const homeTeam = (data['AE'] || '').trim();
                const awayTeam = (data['AF'] || '').trim();
                const homeScore = parseInt(data['AG'], 10);
                const awayScore = parseInt(data['AH'], 10);
                if (!homeTeam || !awayTeam || isNaN(homeScore) || isNaN(awayScore)) continue;

                seenMatchIds.add(matchId);
                const ts = parseInt(data['AD'] || '0', 10);
                const matchDateObj = ts ? new Date(ts * 1000) : new Date();
                const matchDate = normalizeDateStr(getStandardDateStr(matchDateObj));
                const ftr = homeScore > awayScore ? 'H' : homeScore < awayScore ? 'A' : 'D';

                historicalMatches.push({
                  id: `fs_hist_${matchId}`,
                  div: leagueCode,
                  season: getCurrentSeason(),
                  matchDate,
                  homeTeam,
                  awayTeam,
                  fthg: homeScore,
                  ftag: awayScore,
                  ftr,
                });
                seasonMatchesExtracted++;
              }
            }
          }
        } catch (err) {
          if (allowPlaywrightFallback) {
            const fallbackResults = await this.runPlaywrightScraperFallback(seasonUrl);
            for (const fm of fallbackResults) {
              if (!seenMatchIds.has(fm.id)) {
                seenMatchIds.add(fm.id);
                historicalMatches.push({ ...fm, div: leagueCode });
              }
            }
          }
        } finally {
          if (seasonTimeout) clearTimeout(seasonTimeout);
        }

        if (allowPlaywrightFallback && seasonMatchesExtracted === 0) {
          const fallbackResults = await this.runPlaywrightScraperFallback(seasonUrl);
          for (const fm of fallbackResults) {
            if (!seenMatchIds.has(fm.id)) {
              seenMatchIds.add(fm.id);
              historicalMatches.push({ ...fm, div: leagueCode });
            }
          }
        }
      }
    } catch (err: any) {
      loggerService.addLog({
        level: 'WARN',
        category: 'SCRAPER',
        source: 'FlashscoreScraperService',
        message: `Skipped archive scrape for ${leagueCode}: ${err?.message || err}`,
      });
    }

    return historicalMatches;
  }

  /**
   * Scrapes completed match results from Flashscore to populate historical database
   */
  async syncHistoricalData(
    daysBack = 7,
    _shouldClear = false,
    options?: { skipUpcomingRefresh?: boolean; skipStandings?: boolean }
  ): Promise<{ success: boolean; matchesCount: number; message: string }> {
    if (!isScrapingEnabled()) {
      return {
        success: false,
        matchesCount: 0,
        message: 'Data scraping is switched off until enabled manually.',
      };
    }
    loggerService.addLog({
      level: 'INFO',
      category: 'SCRAPER',
      source: 'FlashscoreScraperService',
      message: `Starting syncHistoricalData with multi-year archive crawling (daysBack: ${daysBack})`,
    });

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
      if (!feedText) continue;

      const rawMatches = parseFeedText(feedText);
      const finished = rawMatches.filter((m) =>
        m.homeScore !== undefined &&
        m.awayScore !== undefined &&
        (['3', '10', '11', '47', '48', '49'].includes(m.statusCode || '') || (offset < 0 && m.statusCode !== '1' && m.statusCode !== '2'))
      );

      for (const m of finished) {
        if (seenHistIds.has(m.matchId)) continue;
        const { code, name } = this.mapToLeagueCode(m.tournament, m.country);
        if (isSimulationLeague(code, name, m.country, m.leagueUrl, m.tournament, m.homeTeam, m.awayTeam)) {
          continue;
        }
        seenHistIds.add(m.matchId);
        const matchDateObj = m.timestamp ? new Date(m.timestamp * 1000) : new Date();
        const dateStr = normalizeDateStr(getStandardDateStr(matchDateObj));

        const homeScore = m.homeScore!;
        const awayScore = m.awayScore!;
        const ftr = homeScore > awayScore ? 'H' : homeScore < awayScore ? 'A' : 'D';

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
          hs,
          asShots,
          hst,
          ast,
        });
      }
    }

    // Expanded multi-year completed season results for the last 3 complete seasons across global leagues
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
      { path: '/football/germany/2-bundesliga/results/', code: 'germany_2_bundesliga' },
      { path: '/football/france/ligue-2/results/', code: 'france_ligue_2' },
      { path: '/football/italy/serie-b/results/', code: 'italy_serie_b' },
      { path: '/football/spain/laliga2/results/', code: 'spain_la_liga_2' },
      { path: '/football/turkey/super-lig/results/', code: 'turkey_super_lig' },
      { path: '/football/belgium/jupiler-pro-league/results/', code: 'belgium_jupiler_pro_league' },
      { path: '/football/scotland/premiership/results/', code: 'scotland_premiership' },
      { path: '/football/austria/bundesliga/results/', code: 'austria_bundesliga' },
      { path: '/football/switzerland/super-league/results/', code: 'switzerland_super_league' },
      { path: '/football/denmark/superliga/results/', code: 'denmark_superliga' },
      { path: '/football/norway/eliteserien/results/', code: 'norway_eliteserien' },
      { path: '/football/sweden/allsvenskan/results/', code: 'sweden_allsvenskan' },
      { path: '/football/greece/super-league/results/', code: 'greece_super_league' },
      { path: '/football/poland/ekstraklasa/results/', code: 'poland_ekstraklasa' },
      { path: '/football/mexico/liga-mx/results/', code: 'mexico_liga_mx' },
      { path: '/football/argentina/liga-profesional/results/', code: 'argentina_liga_profesional' },
      { path: '/football/japan/j1-league/results/', code: 'japan_j1_league' },
      { path: '/football/south-korea/k-league-1/results/', code: 'south_korea_k_league_1' },
      { path: '/football/saudi-arabia/saudi-professional-league/results/', code: 'saudi_arabia_saudi_professional_league' },
    ];

    const archiveBatchSize = 5;
    for (let i = 0; i < tournamentPages.length; i += archiveBatchSize) {
      const batch = tournamentPages.slice(i, i + archiveBatchSize);
      await Promise.allSettled(
        batch.map(async (t) => {
          const archivedMatches = await this.scrapeLeagueArchive(t.path, t.code, 3, false);
          for (const am of archivedMatches) {
            if (!seenHistIds.has(am.id)) {
              seenHistIds.add(am.id);
              historicalMatches.push(am);
            }
          }
        })
      );
    }

    if (historicalMatches.length > 0) {
      inserted = db.insertHistoricalMatches(historicalMatches);
    }

    // Refresh upcoming fixtures across all multi-day feeds (unless Step 4 will execute it immediately after)
    const upcoming = options?.skipUpcomingRefresh
      ? []
      : await this.getUpcomingFixtures(undefined, true);

    // Scrape and save standings for discovered & catalog leagues unless deferred to dedicated Full Sync step
    if (!options?.skipStandings) {
      await this.syncAllCatalogStandings();
    }

    return {
      success: true,
      matchesCount: historicalMatches.length + upcoming.length,
      message: `FlashscoreScraping synchronized ${historicalMatches.length} historical results and ${upcoming.length} upcoming fixtures into database.`,
    };
  }

  /**
   * Scrapes live Flashscore bookmaker odds across 1X2, Double Chance, Over/Under, BTTS, and Correct Score
   * via Flashscore's odds GraphQL endpoint, computes vig-removed market-implied probabilities,
   * and persists results in SQLite (match_odds_cache & upcoming_fixtures).
   */
  async fetchMatchOdds(
    matchId: string,
    options?: {
      homeParticipantId?: string;
      awayParticipantId?: string;
      forceRefresh?: boolean;
      skipDbSave?: boolean;
    }
  ): Promise<ScrapedMarketOdds | null> {
    const cleanId = String(matchId || '').replace(/^fs_/, '').replace(/^hist_/, '').trim();
    if (!cleanId) return null;

    if (!options?.forceRefresh) {
      const cached = db.getMatchOddsCache(cleanId);
      if (cached && cached.homeOdds && cached.awayOdds) {
        return cached;
      }
    }

    if (!isScrapingEnabled()) {
      return null;
    }

    const avg = (arr: number[]): number | undefined => {
      if (!arr || arr.length === 0) return undefined;
      const sum = arr.reduce((a, b) => a + b, 0);
      return Number((sum / arr.length).toFixed(2));
    };

    const removeVig2Way = (o1?: number, o2?: number): [number | undefined, number | undefined] => {
      if (!o1 || !o2 || o1 <= 1 || o2 <= 1) return [undefined, undefined];
      const p1 = 1 / o1;
      const p2 = 1 / o2;
      const tot = p1 + p2;
      return [Number((p1 / tot).toFixed(4)), Number((p2 / tot).toFixed(4))];
    };

    const removeVig3Way = (o1?: number, o2?: number, o3?: number): [number | undefined, number | undefined, number | undefined] => {
      if (!o1 || !o2 || !o3 || o1 <= 1 || o2 <= 1 || o3 <= 1) return [undefined, undefined, undefined];
      const p1 = 1 / o1;
      const p2 = 1 / o2;
      const p3 = 1 / o3;
      const tot = p1 + p2 + p3;
      return [
        Number((p1 / tot).toFixed(4)),
        Number((p2 / tot).toFixed(4)),
        Number((p3 / tot).toFixed(4)),
      ];
    };

    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 5000);
      const urls = [
        `https://global.ds.lsapp.eu/odds/pq_graphql?_hash=oce&eventId=${encodeURIComponent(cleanId)}&projectId=2&geoIpCode=GB&geoIpSubdivisionCode=`,
        `https://global.ds.lsapp.eu/odds/pq_graphql?_hash=oce&eventId=${encodeURIComponent(cleanId)}&projectId=2&geoIpCode=US&geoIpSubdivisionCode=USNY`,
      ];

      let oddsEntries: any[] | null = null;
      for (const url of urls) {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Origin': 'https://www.flashscore.com',
            'Referer': 'https://www.flashscore.com/',
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });
        if (!res.ok) continue;
        const json = (await res.json()) as any;
        const entries = json?.data?.findOddsByEventId?.odds;
        if (Array.isArray(entries) && entries.length > 0) {
          oddsEntries = entries;
          break;
        }
      }

      if (!Array.isArray(oddsEntries) || oddsEntries.length === 0) return null;

      let homePid = options?.homeParticipantId;
      let awayPid = options?.awayParticipantId;

      if (!homePid || !awayPid) {
        const rawPids = db.getFixtureParticipantIds(cleanId);
        if (rawPids) {
          homePid = homePid || rawPids.homeParticipantId;
          awayPid = awayPid || rawPids.awayParticipantId;
        }
      }

      const fullTime1X2Entries = oddsEntries.filter(
        (o: any) => o.bettingType === 'HOME_DRAW_AWAY' && o.bettingScope === 'FULL_TIME' && Array.isArray(o.odds)
      );

      // Infer participant IDs cleanly from HOME_DRAW_AWAY FULL_TIME order [Home, Away, Draw] only if JA/JB unavailable
      if (!homePid || !awayPid) {
        for (const entry of fullTime1X2Entries) {
          const nonNullPids = entry.odds
            .map((item: any) => item?.eventParticipantId)
            .filter((pid: any) => typeof pid === 'string' && pid.length > 0);
          if (nonNullPids.length >= 2) {
            homePid = homePid || nonNullPids[0];
            awayPid = awayPid || nonNullPids[1];
            break;
          }
        }
      }

      const bookmakerIds = new Set<number>();
      const h1Arr: number[] = [];
      const dXArr: number[] = [];
      const a2Arr: number[] = [];
      const dc1XArr: number[] = [];
      const dc12Arr: number[] = [];
      const dcX2Arr: number[] = [];
      const o15Arr: number[] = [];
      const u15Arr: number[] = [];
      const o25Arr: number[] = [];
      const u25Arr: number[] = [];
      const o35Arr: number[] = [];
      const u35Arr: number[] = [];
      const bttsYesArr: number[] = [];
      const bttsNoArr: number[] = [];
      const csMap = new Map<string, number[]>();

      for (const entry of oddsEntries) {
        if (entry?.bettingScope !== 'FULL_TIME' || !Array.isArray(entry.odds)) continue;
        if (typeof entry.bookmakerId === 'number') {
          bookmakerIds.add(entry.bookmakerId);
        }

        if (entry.bettingType === 'HOME_DRAW_AWAY') {
          for (const item of entry.odds) {
            const val = parseFloat(item?.value);
            if (!Number.isFinite(val) || val <= 1.01) continue;
            if (item.eventParticipantId === null || item.eventParticipantId === undefined) {
              dXArr.push(val);
            } else if (homePid && item.eventParticipantId === homePid) {
              h1Arr.push(val);
            } else if (awayPid && item.eventParticipantId === awayPid) {
              a2Arr.push(val);
            }
          }
        } else if (entry.bettingType === 'DOUBLE_CHANCE') {
          for (const item of entry.odds) {
            const val = parseFloat(item?.value);
            if (!Number.isFinite(val) || val <= 1.01) continue;
            if (item.eventParticipantId === null || item.eventParticipantId === undefined) {
              dc12Arr.push(val);
            } else if (homePid && item.eventParticipantId === homePid) {
              dc1XArr.push(val);
            } else if (awayPid && item.eventParticipantId === awayPid) {
              dcX2Arr.push(val);
            }
          }
        } else if (entry.bettingType === 'OVER_UNDER') {
          for (const item of entry.odds) {
            const val = parseFloat(item?.value);
            const hcap = String(item?.handicap?.value || '').trim();
            const sel = String(item?.selection || '').toUpperCase();
            if (!Number.isFinite(val) || val <= 1.01) continue;
            if (hcap === '1.5') {
              if (sel === 'OVER') o15Arr.push(val);
              else if (sel === 'UNDER') u15Arr.push(val);
            } else if (hcap === '2.5') {
              if (sel === 'OVER') o25Arr.push(val);
              else if (sel === 'UNDER') u25Arr.push(val);
            } else if (hcap === '3.5') {
              if (sel === 'OVER') o35Arr.push(val);
              else if (sel === 'UNDER') u35Arr.push(val);
            }
          }
        } else if (entry.bettingType === 'BOTH_TEAMS_TO_SCORE') {
          for (const item of entry.odds) {
            const val = parseFloat(item?.value);
            if (!Number.isFinite(val) || val <= 1.01) continue;
            if (item.bothTeamsToScore === true) bttsYesArr.push(val);
            else if (item.bothTeamsToScore === false) bttsNoArr.push(val);
          }
        } else if (entry.bettingType === 'CORRECT_SCORE') {
          for (const item of entry.odds) {
            const val = parseFloat(item?.value);
            const rawScore = String(item?.score || '').trim();
            if (!Number.isFinite(val) || val <= 1.01 || !rawScore) continue;
            const normScore = rawScore.replace(':', '-');
            const list = csMap.get(normScore) || [];
            list.push(val);
            csMap.set(normScore, list);
          }
        }
      }

      const homeOdds = avg(h1Arr);
      const drawOdds = avg(dXArr);
      const awayOdds = avg(a2Arr);
      const [homeImpliedProb, drawImpliedProb, awayImpliedProb] = removeVig3Way(homeOdds, drawOdds, awayOdds);

      const dc1XOdds = avg(dc1XArr);
      const dc12Odds = avg(dc12Arr);
      const dcX2Odds = avg(dcX2Arr);
      // 1X implied = (Home + Draw), X2 implied = (Draw + Away) when 1X2 exists, else vig-adjusted reciprocal
      const dc1XImpliedProb =
        homeImpliedProb !== undefined && drawImpliedProb !== undefined
          ? Number(Math.min(0.99, homeImpliedProb + drawImpliedProb).toFixed(4))
          : dc1XOdds && dc1XOdds > 1
          ? Number(Math.min(0.99, (1 / dc1XOdds) * 0.94).toFixed(4))
          : undefined;
      const dcX2ImpliedProb =
        awayImpliedProb !== undefined && drawImpliedProb !== undefined
          ? Number(Math.min(0.99, awayImpliedProb + drawImpliedProb).toFixed(4))
          : dcX2Odds && dcX2Odds > 1
          ? Number(Math.min(0.99, (1 / dcX2Odds) * 0.94).toFixed(4))
          : undefined;

      const over15Odds = avg(o15Arr);
      const under15Odds = avg(u15Arr);
      const [over15ImpliedProb] = removeVig2Way(over15Odds, under15Odds);

      const over25Odds = avg(o25Arr);
      const under25Odds = avg(u25Arr);
      const [over25ImpliedProb, under25ImpliedProb] = removeVig2Way(over25Odds, under25Odds);

      const over35Odds = avg(o35Arr);
      const under35Odds = avg(u35Arr);
      const [over35ImpliedProb] = removeVig2Way(over35Odds, under35Odds);

      const bttsYesOdds = avg(bttsYesArr);
      const bttsNoOdds = avg(bttsNoArr);
      const [bttsYesImpliedProb, bttsNoImpliedProb] = removeVig2Way(bttsYesOdds, bttsNoOdds);

      const allCs = Array.from(csMap.entries())
        .map(([score, vals]) => {
          const o = avg(vals)!;
          return { score, odds: o, rawProb: 1 / o };
        })
        .sort((a, b) => a.odds - b.odds);
      const csOverround = allCs.reduce((sum, x) => sum + x.rawProb, 0) || 1;
      const topCorrectScores = allCs.slice(0, 5).map((x) => ({
        score: x.score,
        odds: x.odds,
        impliedProb: Number((x.rawProb / csOverround).toFixed(4)),
      }));

      if (
        homeOdds === undefined &&
        awayOdds === undefined &&
        over25Odds === undefined &&
        bttsYesOdds === undefined
      ) {
        return null;
      }

      const result: ScrapedMarketOdds = {
        provider: 'FLASHSCORE',
        fetchedAt: new Date().toISOString(),
        bookmakersCount: bookmakerIds.size > 0 ? bookmakerIds.size : undefined,
        homeParticipantId: homePid,
        awayParticipantId: awayPid,
        homeOdds,
        drawOdds,
        awayOdds,
        homeImpliedProb,
        drawImpliedProb,
        awayImpliedProb,
        dc1XOdds,
        dc12Odds,
        dcX2Odds,
        dc1XImpliedProb,
        dcX2ImpliedProb,
        over15Odds,
        under15Odds,
        over15ImpliedProb,
        over25Odds,
        under25Odds,
        over25ImpliedProb,
        under25ImpliedProb,
        over35Odds,
        under35Odds,
        over35ImpliedProb,
        bttsYesOdds,
        bttsNoOdds,
        bttsYesImpliedProb,
        bttsNoImpliedProb,
        topCorrectScores: topCorrectScores.length > 0 ? topCorrectScores : undefined,
      };

      if (!options?.skipDbSave) {
        db.saveMatchOddsCache(cleanId, result);
      }

      return result;
    } catch {
      return null;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    }
  }

  /**
   * Scrapes real Head-to-Head (H2H) match history and recent matches directly from Flashscore detailed feed (df_hh_1_{id})
   */
  async getMatchHeadToHead(matchId: string, fixtureHomeTeam?: string, fixtureAwayTeam?: string): Promise<HeadToHeadMeasurement> {
    const cleanId = matchId.replace(/^fs_/, '').replace(/^hist_/, '').trim();
    
    // Check DB first (auto-upgrade from raw feed if cached with an older parserVersion)
    const existing = db.getPredictionMeasurement(cleanId);
    if (existing && (existing.parserVersion || 0) >= H2H_PARSER_VERSION) return existing;

    try {
      let feedText: string | null = null;
      const rawStored = db.getRawFeed(cleanId, true);
      if (rawStored && rawStored.rawText && (rawStored.rawText.includes('KB÷') || rawStored.rawText.includes('KC÷'))) {
        feedText = rawStored.rawText;
        loggerService.addLog({
          level: 'INFO',
          category: 'DATABASE',
          source: 'FlashscoreScraper',
          message: `Loaded raw H2H feed from local SQLite database for match ${cleanId}`,
        });
      }

      if (!feedText) {
        try {
          const fetched = await this.fetchFlashscoreFeed(`df_hh_1_${cleanId}`);
          if (fetched && (fetched.includes('KB÷') || fetched.includes('KC÷'))) {
            feedText = fetched;
            db.saveRawFeedData(cleanId, `df_hh_1_${cleanId}`, feedText);
            loggerService.addLog({
              level: 'INFO',
              category: 'SCRAPER',
              source: 'FlashscoreScraper',
              message: `Fetched fresh H2H feed from Flashscore network for match ${cleanId}`,
            });
          }
        } catch {
          // Continue to historical database fallback
        }
      }

      if (feedText) {
        const measurement = parseHeadToHeadFeedText(feedText, cleanId, fixtureHomeTeam, fixtureAwayTeam);
        if (measurement) {
          db.savePredictionMeasurement(cleanId, measurement);
          if (matchId && matchId !== cleanId) {
            db.savePredictionMeasurement(matchId, measurement);
          }
          db.saveH2HRecord(cleanId, measurement);

          loggerService.addLog({
            level: 'INFO',
            category: 'SCRAPER',
            source: 'FlashscoreScraper',
            message: `Scraped H2H for ${measurement.homeClub || fixtureHomeTeam} vs ${measurement.awayClub || fixtureAwayTeam}: ${measurement.matchesCount} meetings found`,
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

    // Fallback: Calculate H2H & Recent Matches from DB historical matches if teams provided
    if (fixtureHomeTeam || fixtureAwayTeam) {
      const homeHist = fixtureHomeTeam ? db.getTeamHistoricalMatches(fixtureHomeTeam, 20) : [];
      const awayHist = fixtureAwayTeam ? db.getTeamHistoricalMatches(fixtureAwayTeam, 20) : [];
      const directH2H =
        fixtureHomeTeam && fixtureAwayTeam
          ? db.getDirectH2HHistoricalMatches(fixtureHomeTeam, fixtureAwayTeam, 15)
          : [];

      const fallbackMeasurement = buildFallbackH2HFromHistoricalDb(
        fixtureHomeTeam || '',
        fixtureAwayTeam || '',
        homeHist,
        awayHist,
        directH2H,
        { computeSwingMultipliers: true }
      );

      if (
        fallbackMeasurement.matchesCount > 0 ||
        (fallbackMeasurement.homeRecentMatches?.length ?? 0) > 0 ||
        (fallbackMeasurement.awayRecentMatches?.length ?? 0) > 0
      ) {
        db.savePredictionMeasurement(cleanId, fallbackMeasurement);
        if (matchId && matchId !== cleanId) {
          db.savePredictionMeasurement(matchId, fallbackMeasurement);
        }
        db.saveH2HRecord(cleanId, fallbackMeasurement);
      }
      return fallbackMeasurement;
    }

    // Zero encounters between teams in real records directly from Flashscore feed
    const cleanZeroH2H: HeadToHeadMeasurement = {
      parserVersion: H2H_PARSER_VERSION,
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
    return cleanZeroH2H;
  }

  /**
   * Prefetches and persists H2H raw feeds for upcoming matches during full sync
   */
  async prefetchH2HForUpcomingFixtures(upcoming: Fixture[], limit = 30): Promise<number> {
    if (!isScrapingEnabled()) return 0;
    let count = 0;
    const targetFixtures = upcoming.slice(0, limit);
    const batchSize = 5;
    for (let i = 0; i < targetFixtures.length; i += batchSize) {
      const slice = targetFixtures.slice(i, i + batchSize);
      const settled = await Promise.allSettled(
        slice.map(async (f) => {
          const cleanId = f.id.replace(/^fs_/, '').replace(/^hist_/, '').trim();
          if (!cleanId) return false;
          await this.getMatchHeadToHead(cleanId, f.homeTeam, f.awayTeam);
          return true;
        })
      );
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) count++;
      }
    }
    return count;
  }

  /**
   * Prefetches and persists Flashscore pre-match market odds into SQLite (match_odds_cache & upcoming_fixtures)
   * during Full Sync, prioritizing popular competitions and imminent fixtures.
   */
  async prefetchOddsForUpcomingFixtures(
    upcoming: Fixture[],
    limit = 200,
    concurrency = 10
  ): Promise<number> {
    if (!isScrapingEnabled() || !upcoming || upcoming.length === 0) return 0;

    const existingOddsMap = db.getAllMatchOddsCache();

    // Hydrate any already-cached odds onto incoming fixtures first
    for (const f of upcoming) {
      const cleanId = f.id.replace(/^fs_/, '').replace(/^hist_/, '').trim();
      const cached = existingOddsMap.get(cleanId) || existingOddsMap.get(f.id);
      if (cached && !f.marketOdds) {
        f.marketOdds = cached;
      }
    }

    const candidates = upcoming
      .filter((f) => {
        if (f.status === 'FINISHED' || f.status === 'CANCELLED' || f.status === 'POSTPONED') return false;
        const cleanId = f.id.replace(/^fs_/, '').replace(/^hist_/, '').trim();
        return Boolean(cleanId) && !existingOddsMap.has(cleanId) && !existingOddsMap.has(f.id);
      })
      .sort((a, b) => {
        const pa = getLeaguePriority(a.league, a.leagueName);
        const pb = getLeaguePriority(b.league, b.leagueName);
        if (pa !== pb) return pb - pa;
        const da = `${a.matchDate} ${a.kickOffTime}`;
        const dbDate = `${b.matchDate} ${b.kickOffTime}`;
        return da.localeCompare(dbDate);
      })
      .slice(0, limit);

    if (candidates.length === 0) return existingOddsMap.size;

    let fetchedCount = 0;
    const savedBatch: Array<{ fixtureId: string; odds: ScrapedMarketOdds }> = [];

    for (let i = 0; i < candidates.length; i += concurrency) {
      const slice = candidates.slice(i, i + concurrency);
      const results = await Promise.all(
        slice.map(async (f) => {
          const cleanId = f.id.replace(/^fs_/, '').replace(/^hist_/, '').trim();
          const odds = await this.fetchMatchOdds(cleanId, {
            homeParticipantId: f.homeParticipantId,
            awayParticipantId: f.awayParticipantId,
            forceRefresh: true,
            skipDbSave: true,
          }).catch(() => null);
          return { fixture: f, cleanId, odds };
        })
      );

      for (const { fixture, cleanId, odds } of results) {
        if (odds) {
          fixture.marketOdds = odds;
          savedBatch.push({ fixtureId: cleanId, odds });
          fetchedCount++;
        }
      }
    }

    if (savedBatch.length > 0) {
      db.saveMatchOddsBatch(savedBatch);
    }

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'SCRAPER',
      source: 'FlashscoreScraper',
      message: `Scraped & persisted Flashscore market odds for ${fetchedCount}/${candidates.length} upcoming fixtures into SQLite`,
      details: { fetchedCount, totalAttempted: candidates.length, totalCached: existingOddsMap.size + fetchedCount },
    });

    return fetchedCount;
  }

  private normalizeLeagueBasePath(rawPath?: string): string | undefined {
    if (!rawPath) return undefined;
    let clean = rawPath.trim();
    if (!clean) return undefined;
    clean = clean.replace(/^https?:\/\/[^/]+/i, '');
    if (!clean.startsWith('/')) clean = `/${clean}`;
    clean = clean.replace(/\/(?:standings|results|fixtures|archive)\/?$/i, '/');
    if (!clean.endsWith('/')) clean = `${clean}/`;
    return clean.startsWith('/football/') ? clean : undefined;
  }

  private getKnownStandingsUrlMap(): Record<string, { path: string; name: string; country: string }> {
    return {
      'europe_champions_league': { path: '/football/europe/champions-league/', name: 'UEFA Champions League', country: 'Europe' },
      'europe_champions_league_league_phase': { path: '/football/europe/champions-league/', name: 'UEFA Champions League', country: 'Europe' },
      'europe_uefa_champions_league': { path: '/football/europe/champions-league/', name: 'UEFA Champions League', country: 'Europe' },
      'ucl': { path: '/football/europe/champions-league/', name: 'UEFA Champions League', country: 'Europe' },
      'europe_europa_league': { path: '/football/europe/europa-league/', name: 'UEFA Europa League', country: 'Europe' },
      'europe_uefa_europa_league': { path: '/football/europe/europa-league/', name: 'UEFA Europa League', country: 'Europe' },
      'europe_europa_league_league_phase': { path: '/football/europe/europa-league/', name: 'UEFA Europa League', country: 'Europe' },
      'uel': { path: '/football/europe/europa-league/', name: 'UEFA Europa League', country: 'Europe' },
      'europe_uefa_conference_league': { path: '/football/europe/conference-league/', name: 'UEFA Conference League', country: 'Europe' },
      'europe_conference_league_league_phase': { path: '/football/europe/conference-league/', name: 'UEFA Conference League', country: 'Europe' },
      'ucol': { path: '/football/europe/conference-league/', name: 'UEFA Conference League', country: 'Europe' },
      'uecl': { path: '/football/europe/conference-league/', name: 'UEFA Conference League', country: 'Europe' },
      'england_premier_league': { path: '/football/england/premier-league/', name: 'Premier League', country: 'England' },
      'e0': { path: '/football/england/premier-league/', name: 'Premier League', country: 'England' },
      'england_championship': { path: '/football/england/championship/', name: 'EFL Championship', country: 'England' },
      'e1': { path: '/football/england/championship/', name: 'EFL Championship', country: 'England' },
      'spain_la_liga': { path: '/football/spain/laliga/', name: 'La Liga', country: 'Spain' },
      'spain_laliga': { path: '/football/spain/laliga/', name: 'La Liga', country: 'Spain' },
      'sp1': { path: '/football/spain/laliga/', name: 'La Liga', country: 'Spain' },
      'spain_la_liga_2': { path: '/football/spain/laliga2/', name: 'LaLiga2', country: 'Spain' },
      'spain_laliga2': { path: '/football/spain/laliga2/', name: 'LaLiga2', country: 'Spain' },
      'germany_bundesliga': { path: '/football/germany/bundesliga/', name: 'Bundesliga', country: 'Germany' },
      'd1': { path: '/football/germany/bundesliga/', name: 'Bundesliga', country: 'Germany' },
      'germany_2_bundesliga': { path: '/football/germany/2-bundesliga/', name: '2. Bundesliga', country: 'Germany' },
      'd2': { path: '/football/germany/2-bundesliga/', name: '2. Bundesliga', country: 'Germany' },
      'italy_serie_a': { path: '/football/italy/serie-a/', name: 'Serie A', country: 'Italy' },
      'i1': { path: '/football/italy/serie-a/', name: 'Serie A', country: 'Italy' },
      'italy_serie_b': { path: '/football/italy/serie-b/', name: 'Serie B', country: 'Italy' },
      'france_ligue_1': { path: '/football/france/ligue-1/', name: 'Ligue 1', country: 'France' },
      'f1': { path: '/football/france/ligue-1/', name: 'Ligue 1', country: 'France' },
      'france_ligue_2': { path: '/football/france/ligue-2/', name: 'Ligue 2', country: 'France' },
      'netherlands_eredivisie': { path: '/football/netherlands/eredivisie/', name: 'Eredivisie', country: 'Netherlands' },
      'n1': { path: '/football/netherlands/eredivisie/', name: 'Eredivisie', country: 'Netherlands' },
      'nl1': { path: '/football/netherlands/eredivisie/', name: 'Eredivisie', country: 'Netherlands' },
      'portugal_primeira_liga': { path: '/football/portugal/liga-portugal/', name: 'Liga Portugal', country: 'Portugal' },
      'portugal_liga_portugal': { path: '/football/portugal/liga-portugal/', name: 'Liga Portugal', country: 'Portugal' },
      'p1': { path: '/football/portugal/liga-portugal/', name: 'Liga Portugal', country: 'Portugal' },
      'po1': { path: '/football/portugal/liga-portugal/', name: 'Liga Portugal', country: 'Portugal' },
      'brazil_serie_a': { path: '/football/brazil/serie-a/', name: 'Série A', country: 'Brazil' },
      'bra': { path: '/football/brazil/serie-a/', name: 'Série A', country: 'Brazil' },
      'turkey_super_lig': { path: '/football/turkey/super-lig/', name: 'Süper Lig', country: 'Turkey' },
      'belgium_jupiler_pro_league': { path: '/football/belgium/jupiler-pro-league/', name: 'Jupiler Pro League', country: 'Belgium' },
      'scotland_premiership': { path: '/football/scotland/premiership/', name: 'Premiership', country: 'Scotland' },
      'austria_bundesliga': { path: '/football/austria/bundesliga/', name: 'Bundesliga', country: 'Austria' },
      'switzerland_super_league': { path: '/football/switzerland/super-league/', name: 'Super League', country: 'Switzerland' },
      'denmark_superliga': { path: '/football/denmark/superliga/', name: 'Superliga', country: 'Denmark' },
      'norway_eliteserien': { path: '/football/norway/eliteserien/', name: 'Eliteserien', country: 'Norway' },
      'sweden_allsvenskan': { path: '/football/sweden/allsvenskan/', name: 'Allsvenskan', country: 'Sweden' },
      'greece_super_league': { path: '/football/greece/super-league/', name: 'Super League', country: 'Greece' },
      'poland_ekstraklasa': { path: '/football/poland/ekstraklasa/', name: 'Ekstraklasa', country: 'Poland' },
      'mexico_liga_mx': { path: '/football/mexico/liga-mx/', name: 'Liga MX', country: 'Mexico' },
      'argentina_liga_profesional': { path: '/football/argentina/torneo-betano/', name: 'Torneo Betano', country: 'Argentina' },
      'japan_j1_league': { path: '/football/japan/j1-league/', name: 'J1 League', country: 'Japan' },
      'south_korea_k_league_1': { path: '/football/south-korea/k-league-1/', name: 'K League 1', country: 'South Korea' },
      'saudi_arabia_saudi_professional_league': { path: '/football/saudi-arabia/saudi-professional-league/', name: 'Saudi Pro League', country: 'Saudi Arabia' },
      'sa1': { path: '/football/saudi-arabia/saudi-professional-league/', name: 'Saudi Pro League', country: 'Saudi Arabia' },
    };
  }

  /**
   * Queries Flashscore's official standings feed (`to_<tournamentId>_<tournamentStageId>_1`) directly.
   * Bypasses the global circuit breaker so individual empty/404 cup stages never stall batch sync.
   */
  private async fetchDirectStandingsFeed(
    tournamentId: string,
    tournamentStageId: string
  ): Promise<string | null> {
    if (!isScrapingEnabled() || !tournamentId || !tournamentStageId) return null;
    const path = `to_${tournamentId.trim()}_${tournamentStageId.trim()}_1`;
    const urls = [
      `${FLASHSCORE_NINJA_BASE}/${path}`,
      `https://global.flashscore.ninja/2/x/feed/${path}`,
      `${FLASHSCORE_FEED_BASE}/${path}`,
    ];

    for (const url of urls) {
      let timeout: ReturnType<typeof setTimeout> | null = null;
      try {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), 5000);
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

        if (res.status === 404) return null;
        if (!res.ok) continue;

        const text = await res.text();
        if (!text || CYRILLIC_REGEX.test(text)) continue;
        if (text.includes('TR÷') || text.includes('¬TR÷')) {
          return text;
        }
        // Valid 200 with no TR÷ means knockout cup / no standings table available on this stage
        return null;
      } catch {
        // Try next mirror
      } finally {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
      }
    }

    return null;
  }

  /**
   * Fetches Flashscore standings HTML page to extract window.leaguePageHeaderData IDs (or inline initialFeeds)
   * when tournamentId/tournamentStageId were not already present in daily feeds.
   */
  private async resolveStandingsIdsFromHtml(standingsPath: string): Promise<{
    tournamentId?: string;
    tournamentStageId?: string;
    initialFeed?: string;
  } | null> {
    if (!isScrapingEnabled()) return null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const cleanPath = standingsPath.endsWith('/standings/')
        ? standingsPath
        : `${standingsPath.replace(/\/$/, '')}/standings/`;
      const pageUrl = `https://www.flashscore.com${cleanPath}`;
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 6500);

      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      });

      if (!res.ok) return null;
      const html = await res.text();

      const standingsMatch = html.match(/cjs\.initialFeeds\['standings'\]\s*=\s*\{\s*data:\s*[`"']([\s\S]*?)[`"']\s*\}/);
      const initialFeed = standingsMatch?.[1] && !CYRILLIC_REGEX.test(standingsMatch[1]) ? standingsMatch[1] : undefined;

      const tidMatch = html.match(/(?:["']?tournamentId["']?)\s*:\s*["']([A-Za-z0-9]+)["']/);
      const sidMatch = html.match(/(?:["']?tournamentStageId["']?)\s*:\s*["']([A-Za-z0-9]+)["']/);

      if (!initialFeed && (!tidMatch?.[1] || !sidMatch?.[1])) {
        return null;
      }

      return {
        tournamentId: tidMatch?.[1],
        tournamentStageId: sidMatch?.[1],
        initialFeed,
      };
    } catch {
      return null;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    }
  }

  /**
   * Scrapes official Flashscore standings via `to_<ZE>_<ZC>_1` or HTML `leaguePageHeaderData`
   * and persists multi-group tables in SQLite. Zero fabricated/manual calculations.
   */
  async fetchAndSaveLeagueStandings(
    targetInput:
      | string
      | {
          leagueCode: string;
          leagueName?: string;
          country?: string;
          leagueUrl?: string;
          tournamentId?: string;
          tournamentStageId?: string;
        }
  ): Promise<LeagueStandingTable | null> {
    if (!isScrapingEnabled()) return null;
    const rawCode = typeof targetInput === 'string' ? targetInput : targetInput.leagueCode;
    const cleanCode = String(rawCode || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (!cleanCode) return null;

    const urlMap = this.getKnownStandingsUrlMap();
    const mappedUrlInfo = urlMap[cleanCode];

    let resolvedName =
      (typeof targetInput === 'object' ? targetInput.leagueName : undefined) ||
      mappedUrlInfo?.name ||
      rawCode.replace(/_/g, ' ');
    let resolvedCountry =
      (typeof targetInput === 'object' ? targetInput.country : undefined) ||
      mappedUrlInfo?.country ||
      'International';

    if (resolvedName.includes(':')) {
      const colonIdx = resolvedName.indexOf(':');
      const prefixCountry = resolvedName.slice(0, colonIdx).trim();
      const suffixLeague = resolvedName.slice(colonIdx + 1).trim();
      if (suffixLeague) {
        if (resolvedCountry === 'International' && prefixCountry) {
          resolvedCountry = prefixCountry;
        }
        resolvedName = suffixLeague;
      }
    }

    let baseLeagueUrl =
      this.normalizeLeagueBasePath(typeof targetInput === 'object' ? targetInput.leagueUrl : undefined) ||
      mappedUrlInfo?.path;

    if (isSimulationLeague(cleanCode, resolvedName, resolvedCountry, baseLeagueUrl)) {
      return null;
    }

    if (!baseLeagueUrl) {
      const countrySlug = resolvedCountry
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const parts = cleanCode.split('_');
      if (countrySlug && countrySlug !== 'international') {
        const prefixCheck = `${countrySlug.replace(/-/g, '_')}_`;
        const slugRemainder = cleanCode.startsWith(prefixCheck)
          ? cleanCode.slice(prefixCheck.length).replace(/_/g, '-')
          : resolvedName
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '');
        if (slugRemainder) {
          baseLeagueUrl = `/football/${countrySlug}/${slugRemainder}/`;
        }
      } else if (parts.length >= 2) {
        baseLeagueUrl = `/football/${parts[0]}/${parts.slice(1).join('-')}/`;
      }
    }

    let resolvedTid = typeof targetInput === 'object' ? targetInput.tournamentId : undefined;
    let resolvedSid = typeof targetInput === 'object' ? targetInput.tournamentStageId : undefined;
    let feedText: string | null = null;

    // 1. Direct fast path using ZE + ZC IDs from daily Flashscore feeds
    if (resolvedTid && resolvedSid) {
      feedText = await this.fetchDirectStandingsFeed(resolvedTid, resolvedSid);
    }

    // 2. HTML header resolution path (leaguePageHeaderData -> to_<tid>_<sid>_1)
    if (!feedText && baseLeagueUrl) {
      const htmlInfo = await this.resolveStandingsIdsFromHtml(`${baseLeagueUrl}standings/`);
      if (htmlInfo) {
        if (htmlInfo.initialFeed) {
          feedText = htmlInfo.initialFeed;
        } else if (htmlInfo.tournamentId && htmlInfo.tournamentStageId) {
          resolvedTid = htmlInfo.tournamentId;
          resolvedSid = htmlInfo.tournamentStageId;
          feedText = await this.fetchDirectStandingsFeed(resolvedTid, resolvedSid);
        }
      }
    }

    if (!feedText) return null;

    const parsed = parseFlashscoreStandingsFeed(feedText);
    if (!parsed.table || parsed.table.length === 0) {
      return null;
    }

    const table: LeagueStandingTable = {
      leagueCode: cleanCode,
      leagueName: resolvedName,
      country: resolvedCountry,
      leagueUrl: baseLeagueUrl,
      season: getCurrentSeason(),
      tournamentId: resolvedTid,
      updatedAt: new Date().toISOString(),
      source: 'FLASHSCORE_SCRAPED',
      table: parsed.table,
      groups: parsed.groups,
    };

    db.saveLeagueStandings(table);
    return table;
  }

  /**
   * Discovers and pre-scrapes standings for every league discovered in stored Flashscore feeds,
   * upcoming fixtures, and the global catalog during Full Sync.
   */
  async syncAllCatalogStandings(
    onProgress?: (processed: number, total: number, saved: number) => void
  ): Promise<{ totalAttempted: number; savedCount: number }> {
    if (!isScrapingEnabled()) {
      return { totalAttempted: 0, savedCount: 0 };
    }
    type CatalogTarget = {
      leagueCode: string;
      leagueName: string;
      country: string;
      leagueUrl?: string;
      tournamentId?: string;
      tournamentStageId?: string;
    };

    const dedupMap = new Map<string, CatalogTarget>();
    const urlMap = this.getKnownStandingsUrlMap();

    const mergeTarget = (candidate: CatalogTarget) => {
      const normUrl = this.normalizeLeagueBasePath(candidate.leagueUrl);
      const normCode = candidate.leagueCode.toLowerCase().trim();
      if (isSimulationLeague(normCode, candidate.leagueName, candidate.country, normUrl)) {
        return;
      }
      const tidKey =
        candidate.tournamentId && candidate.tournamentStageId
          ? `tid:${candidate.tournamentId}_${candidate.tournamentStageId}`
          : undefined;
      const key = normUrl ? `url:${normUrl}` : tidKey || `code:${normCode}`;

      const existing = dedupMap.get(key);
      if (existing) {
        if (!existing.tournamentId && candidate.tournamentId) existing.tournamentId = candidate.tournamentId;
        if (!existing.tournamentStageId && candidate.tournamentStageId) existing.tournamentStageId = candidate.tournamentStageId;
        if (!existing.leagueUrl && normUrl) existing.leagueUrl = normUrl;
        if (candidate.leagueName && candidate.leagueName.length > 0 && existing.leagueName === existing.leagueCode) {
          existing.leagueName = candidate.leagueName;
        }
        return;
      }

      dedupMap.set(key, {
        ...candidate,
        leagueCode: normCode,
        leagueUrl: normUrl,
      });
    };

    // 1. Seed popular top leagues (ensures marquee competitions are always included even off-season)
    const marqueeLeagues: Array<{ code: string; name: string; country: string; url: string }> = [
      { code: 'england_premier_league', name: 'Premier League', country: 'England', url: '/football/england/premier-league/' },
      { code: 'spain_la_liga', name: 'La Liga', country: 'Spain', url: '/football/spain/laliga/' },
      { code: 'germany_bundesliga', name: 'Bundesliga', country: 'Germany', url: '/football/germany/bundesliga/' },
      { code: 'italy_serie_a', name: 'Serie A', country: 'Italy', url: '/football/italy/serie-a/' },
      { code: 'france_ligue_1', name: 'Ligue 1', country: 'France', url: '/football/france/ligue-1/' },
      { code: 'europe_champions_league_league_phase', name: 'UEFA Champions League', country: 'Europe', url: '/football/europe/champions-league/' },
      { code: 'europe_europa_league_league_phase', name: 'UEFA Europa League', country: 'Europe', url: '/football/europe/europa-league/' },
      { code: 'europe_uefa_conference_league', name: 'UEFA Conference League', country: 'Europe', url: '/football/europe/conference-league/' },
      { code: 'england_championship', name: 'EFL Championship', country: 'England', url: '/football/england/championship/' },
      { code: 'netherlands_eredivisie', name: 'Eredivisie', country: 'Netherlands', url: '/football/netherlands/eredivisie/' },
      { code: 'portugal_primeira_liga', name: 'Liga Portugal', country: 'Portugal', url: '/football/portugal/liga-portugal/' },
      { code: 'brazil_serie_a', name: 'Série A', country: 'Brazil', url: '/football/brazil/serie-a/' },
      { code: 'germany_2_bundesliga', name: '2. Bundesliga', country: 'Germany', url: '/football/germany/2-bundesliga/' },
      { code: 'france_ligue_2', name: 'Ligue 2', country: 'France', url: '/football/france/ligue-2/' },
      { code: 'italy_serie_b', name: 'Serie B', country: 'Italy', url: '/football/italy/serie-b/' },
      { code: 'spain_la_liga_2', name: 'LaLiga2', country: 'Spain', url: '/football/spain/laliga2/' },
      { code: 'turkey_super_lig', name: 'Süper Lig', country: 'Turkey', url: '/football/turkey/super-lig/' },
      { code: 'belgium_jupiler_pro_league', name: 'Jupiler Pro League', country: 'Belgium', url: '/football/belgium/jupiler-pro-league/' },
      { code: 'scotland_premiership', name: 'Premiership', country: 'Scotland', url: '/football/scotland/premiership/' },
      { code: 'austria_bundesliga', name: 'Bundesliga', country: 'Austria', url: '/football/austria/bundesliga/' },
      { code: 'switzerland_super_league', name: 'Super League', country: 'Switzerland', url: '/football/switzerland/super-league/' },
      { code: 'denmark_superliga', name: 'Superliga', country: 'Denmark', url: '/football/denmark/superliga/' },
      { code: 'norway_eliteserien', name: 'Eliteserien', country: 'Norway', url: '/football/norway/eliteserien/' },
      { code: 'sweden_allsvenskan', name: 'Allsvenskan', country: 'Sweden', url: '/football/sweden/allsvenskan/' },
      { code: 'greece_super_league', name: 'Super League', country: 'Greece', url: '/football/greece/super-league/' },
      { code: 'poland_ekstraklasa', name: 'Ekstraklasa', country: 'Poland', url: '/football/poland/ekstraklasa/' },
      { code: 'mexico_liga_mx', name: 'Liga MX', country: 'Mexico', url: '/football/mexico/liga-mx/' },
      { code: 'argentina_liga_profesional', name: 'Torneo Betano', country: 'Argentina', url: '/football/argentina/torneo-betano/' },
      { code: 'japan_j1_league', name: 'J1 League', country: 'Japan', url: '/football/japan/j1-league/' },
      { code: 'south_korea_k_league_1', name: 'K League 1', country: 'South Korea', url: '/football/south-korea/k-league-1/' },
      { code: 'saudi_arabia_saudi_professional_league', name: 'Saudi Pro League', country: 'Saudi Arabia', url: '/football/saudi-arabia/saudi-professional-league/' },
    ];

    for (const m of marqueeLeagues) {
      mergeTarget({
        leagueCode: m.code,
        leagueName: m.name,
        country: m.country,
        leagueUrl: m.url,
      });
    }

    for (const g of GLOBAL_LEAGUES_DATASET) {
      const codeLower = g.code.toLowerCase();
      const mapped = urlMap[codeLower];
      mergeTarget({
        leagueCode: mapped ? codeLower : codeLower,
        leagueName: g.name,
        country: g.country || 'International',
        leagueUrl: mapped?.path,
      });
    }

    // 2. Discover every league present in stored Flashscore raw feeds & upcoming fixtures
    const discovered = db.getDiscoveredTournamentsFromDb();
    for (const item of discovered) {
      const mapped = this.mapToLeagueCode(item.tournament, item.country);
      const rawCleanName = item.tournament.includes(':')
        ? item.tournament.slice(item.tournament.indexOf(':') + 1).trim()
        : item.tournament.trim();

      mergeTarget({
        leagueCode: (item.leagueCode || mapped.code).toLowerCase(),
        leagueName: rawCleanName || mapped.name,
        country: item.country || 'International',
        leagueUrl: item.leagueUrl,
        tournamentId: item.tournamentId,
        tournamentStageId: item.tournamentStageId,
      });
    }

    const targets = Array.from(dedupMap.values());
    // Direct ZE+ZC feed targets execute in <200ms each; HTML-only fallback targets run afterwards
    const directTargets = targets.filter((t) => Boolean(t.tournamentId && t.tournamentStageId));
    const htmlTargets = targets.filter((t) => !(t.tournamentId && t.tournamentStageId));

    const totalAttempted = targets.length;
    let processed = 0;
    let savedCount = 0;

    const runBatches = async (list: CatalogTarget[], concurrency: number) => {
      for (let i = 0; i < list.length; i += concurrency) {
        const batch = list.slice(i, i + concurrency);
        const results = await Promise.allSettled(
          batch.map((t) => this.fetchAndSaveLeagueStandings(t))
        );
        for (const r of results) {
          processed++;
          if (r.status === 'fulfilled' && r.value && r.value.table.length > 0) {
            savedCount++;
          }
        }
        onProgress?.(processed, totalAttempted, savedCount);
      }
    };

    await runBatches(directTargets, 8);
    await runBatches(htmlTargets, 5);

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'SCRAPER',
      source: 'FlashscoreScraper',
      message: `Synchronized league standings tables for ${savedCount}/${totalAttempted} discovered & catalog competitions`,
      details: { savedCount, totalAttempted, directTargets: directTargets.length, htmlTargets: htmlTargets.length },
    });

    return { totalAttempted, savedCount };
  }

  /**
   * Retrieves league standings table strictly 100% from SQLite database saved data
   */
  async getLeagueStandings(
    leagueCode: string,
    slugOrContext?:
      | string
      | {
          leagueUrl?: string;
          leagueName?: string;
          homeTeam?: string;
          awayTeam?: string;
        }
  ): Promise<LeagueStandingTable> {
    const cleanCode = (leagueCode || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const ctx = typeof slugOrContext === 'object' && slugOrContext !== null ? slugOrContext : undefined;
    if (isSimulationLeague(cleanCode, ctx?.leagueName, undefined, ctx?.leagueUrl, undefined, ctx?.homeTeam, ctx?.awayTeam)) {
      return {
        leagueCode: cleanCode,
        leagueName: ctx?.leagueName || cleanCode.replace(/_/g, ' ').toUpperCase(),
        country: cleanCode.split('_')[0]?.toUpperCase() || 'LEAGUE',
        season: getCurrentSeason(),
        updatedAt: new Date().toISOString(),
        source: 'FLASHSCORE_SCRAPED',
        table: [],
        groups: [],
      };
    }
    const homeTarget = ctx?.homeTeam?.trim() || '';
    const awayTarget = ctx?.awayTeam?.trim() || '';

    const hasTeamInTable = (rows: any[], team: string): boolean => {
      if (!team || !Array.isArray(rows)) return false;
      return rows.some((r) => r?.teamName && teamMatchScore(team, r.teamName) > 0);
    };

    const formatFound = (raw: any): LeagueStandingTable => {
      const tableData = Array.isArray(raw.table)
        ? raw.table
        : Array.isArray(raw.standings)
        ? raw.standings
        : [];
      const groupsData =
        Array.isArray(raw.groups) && raw.groups.length > 0
          ? raw.groups
          : tableData.length > 0
          ? [{ name: 'Standings', table: tableData }]
          : [];
      return {
        leagueCode: raw.leagueCode || cleanCode,
        leagueName: raw.leagueName || cleanCode.replace(/_/g, ' ').toUpperCase(),
        country: raw.country || 'LEAGUE',
        leagueUrl: raw.leagueUrl,
        season: raw.season || getCurrentSeason(),
        updatedAt: raw.updatedAt || new Date().toISOString(),
        source: 'FLASHSCORE_SCRAPED',
        table: tableData,
        groups: groupsData,
      };
    };

    const dbStandings = db.getLeagueStandings(cleanCode, ctx?.leagueUrl, ctx?.leagueName);
    if (dbStandings && Array.isArray(dbStandings.table) && dbStandings.table.length > 0) {
      if (!homeTarget && !awayTarget) {
        return formatFound(dbStandings);
      }
      if (hasTeamInTable(dbStandings.table, homeTarget) || hasTeamInTable(dbStandings.table, awayTarget)) {
        return formatFound(dbStandings);
      }
    }

    // Secondary lookup across all persisted league standings using URL / name / team overlap
    if (ctx?.leagueUrl || ctx?.leagueName || homeTarget || awayTarget) {
      const allTables = db.getAllLeagueStandingsTables();
      const normCtxUrl = ctx?.leagueUrl ? ctx.leagueUrl.trim().replace(/\/+$/, '').toLowerCase() : '';
      const normCtxName = ctx?.leagueName ? ctx.leagueName.trim().toLowerCase() : '';

      if (normCtxUrl) {
        const byUrl = allTables.find(
          (t) => t.leagueUrl && t.leagueUrl.trim().replace(/\/+$/, '').toLowerCase() === normCtxUrl
        );
        if (byUrl) return formatFound(byUrl);
      }

      if (homeTarget && awayTarget) {
        // Prefer table matching leagueName/code where both teams appear
        const matchingBoth = allTables.filter(
          (t) => hasTeamInTable(t.table, homeTarget) && hasTeamInTable(t.table, awayTarget)
        );
        if (matchingBoth.length === 1) {
          return formatFound(matchingBoth[0]);
        }
        if (matchingBoth.length > 1) {
          const nameMatched = matchingBoth.find((t) => {
            const ln = (t.leagueName || '').toLowerCase();
            return (normCtxName && (ln.includes(normCtxName) || normCtxName.includes(ln))) || t.leagueCode.toLowerCase() === cleanCode;
          });
          return formatFound(nameMatched || matchingBoth[0]);
        }
      }
    }

    if (dbStandings && Array.isArray(dbStandings.table) && dbStandings.table.length > 0) {
      return formatFound(dbStandings);
    }

    return {
      leagueCode: cleanCode,
      leagueName: ctx?.leagueName || cleanCode.replace(/_/g, ' ').toUpperCase(),
      country: cleanCode.split('_')[0]?.toUpperCase() || 'LEAGUE',
      season: getCurrentSeason(),
      updatedAt: new Date().toISOString(),
      source: 'FLASHSCORE_SCRAPED',
      table: [],
      groups: [],
    };
  }
  public getProviderStatus(): ProviderStatus {
    return {
      id: 'FLASHSCORE',
      name: 'Flashscore Live Scraper',
      type: 'SCRAPER',
      status: isScrapingEnabled() ? 'ONLINE' : 'STANDBY',
      latencyMs: 0,
      description: 'Direct FlashscoreScraping engine extracting live match results, in-play statistics, worldwide fixtures, and results directly from Flashscore.',
      features: ['Direct Flashscore Feed Scraper', 'Real-Time In-Play Scores', '50+ Worldwide Leagues & Cups', 'Live Statistics & Results', 'Instant SQLite Sync'],
    };
  }
}

export const flashscoreScraperService = new FlashscoreScraperService();
