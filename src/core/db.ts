import { HistoricalMatch, Fixture, EngineSettings, HeadToHeadMeasurement } from './types.js';
import { getPossibleDateStrs, normalizeDateStr } from './dateUtils.js';
import { loggerService } from '../services/loggerService.js';
import {
  sqliteDb,
  initSqliteSchema,
  compressString,
  decompressBuffer,
  getSqliteDbStats,
} from './sqliteClient.js';

export class FootballDB {
  private isInitialized = false;
  private fallbackHistoricalMatches: HistoricalMatch[] = [];
  private fallbackUpcomingFixtures: Fixture[] = [];
  private rawFeedsMemory: Map<string, string> = new Map();
  private rawFeedHashesMemory: Map<string, string> = new Map();
  private measurementsMemory: Map<string, HeadToHeadMeasurement> = new Map();
  private standingsMemory: Map<string, any> = new Map();
  private scrapedMatchesMemory: Map<string, any> = new Map();
  private matchStatsMemory: Map<string, any[]> = new Map();
  private tipsCache: {
    tipsJson: string;
    headlineSummary: string;
    rawMarkdown: string;
    sourcesJson: string;
    updatedAt: string;
  } | null = null;
  private fallbackSettings: EngineSettings = {
    rollingMatchWindow: 15,
    minEVThreshold: 1.10,
    safeWinThreshold: 0.72,
    homeAdvantageFactor: 1.12,
    formDecayRate: 0.85,
    autoSyncDaily: true,
  };

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      initSqliteSchema();
      this.hydrateFromSqlite();
      console.log('[FootballDB] Initialized persistent SQLite database (data/football_engine.db) in WAL mode.');
    } catch (err: any) {
      console.warn('[FootballDB] SQLite initialization notice:', err?.message);
    }

    this.isInitialized = true;
  }

  private hydrateFromSqlite(): void {
    try {
      // 1. Hydrate settings
      const settingsRow = sqliteDb.prepare("SELECT value FROM app_settings WHERE key = 'engine_settings'").get() as any;
      if (settingsRow && settingsRow.value) {
        try {
          this.fallbackSettings = JSON.parse(settingsRow.value);
        } catch {}
      }

      // 2. Hydrate historical matches count
      const histRows = sqliteDb.prepare("SELECT * FROM historical_matches LIMIT 2000").all() as any[];
      if (histRows && histRows.length > 0) {
        this.fallbackHistoricalMatches = histRows.map((r) => ({
          id: String(r.id),
          div: String(r.div),
          season: String(r.season),
          matchDate: String(r.match_date),
          homeTeam: String(r.home_team),
          awayTeam: String(r.away_team),
          fthg: Number(r.fthg),
          ftag: Number(r.ftag),
          ftr: (r.ftr as 'H' | 'D' | 'A') || 'D',
          hs: r.hs !== null ? Number(r.hs) : undefined,
          asShots: r.as_shots !== null ? Number(r.as_shots) : undefined,
          hst: r.hst !== null ? Number(r.hst) : undefined,
          ast: r.ast !== null ? Number(r.ast) : undefined,
        }));
      }

      // 3. Hydrate upcoming fixtures
      const upRows = sqliteDb.prepare("SELECT * FROM upcoming_fixtures LIMIT 2000").all() as any[];
      if (upRows && upRows.length > 0) {
        this.fallbackUpcomingFixtures = upRows.map((r) => ({
          id: String(r.id),
          providerId: (r.provider_id as any) || 'FLASHSCORE',
          league: String(r.league || ''),
          leagueName: String(r.league_name || r.league || ''),
          matchDate: String(r.match_date || ''),
          kickOffTime: String(r.kick_off_time || ''),
          homeTeam: String(r.home_team || ''),
          awayTeam: String(r.away_team || ''),
          homeBadge: r.home_badge ? String(r.home_badge) : undefined,
          awayBadge: r.away_badge ? String(r.away_badge) : undefined,
          stage: r.stage ? String(r.stage) : undefined,
          restDaysHome: r.rest_days_home !== null ? Number(r.rest_days_home) : 7,
          restDaysAway: r.rest_days_away !== null ? Number(r.rest_days_away) : 7,
          odds: {
            homeWin: Number(r.b365_h || 2.10),
            draw: Number(r.b365_d || 3.30),
            awayWin: Number(r.b365_a || 3.40),
            over25: r.b365_over25 ? Number(r.b365_over25) : 1.85,
            under25: r.b365_under25 ? Number(r.b365_under25) : 1.95,
            bttsYes: r.b365_btts_yes ? Number(r.b365_btts_yes) : undefined,
            bttsNo: r.b365_btts_no ? Number(r.b365_btts_no) : undefined,
          },
          status: (r.status as any) || 'SCHEDULED',
          score: r.score_json ? JSON.parse(r.score_json) : undefined,
          prediction: r.prediction_json ? JSON.parse(r.prediction_json) : undefined,
          markets: r.markets_json ? JSON.parse(r.markets_json) : undefined,
          bestValueMarket: r.best_value_market_json ? JSON.parse(r.best_value_market_json) : undefined,
          homeStats: r.home_stats_json ? JSON.parse(r.home_stats_json) : undefined,
          awayStats: r.away_stats_json ? JSON.parse(r.away_stats_json) : undefined,
          measurements: r.measurements_json ? JSON.parse(r.measurements_json) : undefined,
          h2hMatches: r.h2h_matches_json ? JSON.parse(r.h2h_matches_json) : undefined,
        }));
      }

      // 4. Hydrate prediction measurements cache
      const measRows = sqliteDb.prepare("SELECT fixture_id, h2h_json FROM prediction_measurements_cache LIMIT 1500").all() as any[];
      for (const m of measRows) {
        try {
          if (m.fixture_id && m.h2h_json) {
            const parsed = JSON.parse(m.h2h_json);
            const fid = String(m.fixture_id);
            this.measurementsMemory.set(fid, parsed);
            this.measurementsMemory.set(`fs_${fid}`, parsed);
          }
        } catch {}
      }

      // 5. Hydrate tips cache
      const tipsRow = sqliteDb.prepare("SELECT * FROM football_tips_cache WHERE id = 'latest_tips'").get() as any;
      if (tipsRow) {
        this.tipsCache = {
          tipsJson: String(tipsRow.tips_json),
          headlineSummary: String(tipsRow.headline_summary),
          rawMarkdown: String(tipsRow.raw_markdown),
          sourcesJson: String(tipsRow.sources_json),
          updatedAt: String(tipsRow.updated_at),
        };
      }
    } catch (err: any) {
      console.warn('[FootballDB] SQLite hydration note:', err?.message);
    }
  }

  async clearAllData(clearRaw = true): Promise<void> {
    this.fallbackHistoricalMatches = [];
    this.fallbackUpcomingFixtures = [];
    this.measurementsMemory.clear();
    this.standingsMemory.clear();
    this.scrapedMatchesMemory.clear();
    this.matchStatsMemory.clear();
    this.tipsCache = null;

    if (clearRaw) {
      this.rawFeedsMemory.clear();
      this.rawFeedHashesMemory.clear();
    }

    try {
      const runDelete = sqliteDb.transaction(() => {
        sqliteDb.exec('DELETE FROM historical_matches;');
        sqliteDb.exec('DELETE FROM upcoming_fixtures;');
        sqliteDb.exec('DELETE FROM flashscore_scraped_matches;');
        sqliteDb.exec('DELETE FROM prediction_measurements_cache;');
        sqliteDb.exec('DELETE FROM league_standings;');
        if (clearRaw) {
          sqliteDb.exec('DELETE FROM raw_feed_data;');
        }
      });
      runDelete();
    } catch (err: any) {
      console.error('[FootballDB] Error clearing SQLite tables:', err?.message);
    }

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'DATABASE',
      source: 'FootballDB',
      message: `Database tables ${clearRaw ? 'and compressed raw feeds ' : ''}cleared from SQLite`,
    });
  }

  clearDatabase(clearRaw = false): void {
    this.clearAllData(clearRaw);
  }

  insertHistoricalMatches(matches: HistoricalMatch[]): number {
    if (matches.length === 0) return 0;
    this.fallbackHistoricalMatches = matches;

    try {
      const insertStmt = sqliteDb.prepare(`
        INSERT OR REPLACE INTO historical_matches (
          id, div, season, match_date, home_team, away_team,
          fthg, ftag, ftr, hs, as_shots, hst, ast
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = sqliteDb.transaction((rows: HistoricalMatch[]) => {
        for (const m of rows) {
          insertStmt.run(
            m.id,
            m.div,
            m.season,
            m.matchDate,
            m.homeTeam,
            m.awayTeam,
            m.fthg,
            m.ftag,
            m.ftr,
            m.hs ?? null,
            m.asShots ?? null,
            m.hst ?? null,
            m.ast ?? null
          );
        }
      });

      insertMany(matches);
    } catch (err: any) {
      console.error('[FootballDB] Error inserting historical matches into SQLite:', err?.message);
    }

    return matches.length;
  }

  async saveUpcomingFixtures(fixtures: Fixture[]): Promise<void> {
    const seen = new Set<string>();
    const unique = fixtures.filter((f) => {
      if (!f.id || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });

    if (unique.length === 0) return;

    // Merge into this.fallbackUpcomingFixtures by ID so partial/chunked saves don't erase existing fixtures
    const fixtureMap = new Map<string, Fixture>();
    for (const f of this.fallbackUpcomingFixtures) {
      if (f.id) fixtureMap.set(f.id, f);
    }
    for (const f of unique) {
      if (f.id) fixtureMap.set(f.id, f);
    }
    this.fallbackUpcomingFixtures = Array.from(fixtureMap.values());

    try {
      const insertStmt = sqliteDb.prepare(`
        INSERT OR REPLACE INTO upcoming_fixtures (
          id, provider_id, league, league_name, match_date, kick_off_time,
          home_team, away_team, home_badge, away_badge, stage,
          rest_days_home, rest_days_away,
          b365_h, b365_d, b365_a, b365_over25, b365_under25,
          b365_btts_yes, b365_btts_no, status, score_json,
          prediction_json, markets_json, best_value_market_json,
          home_stats_json, away_stats_json, measurements_json, h2h_matches_json,
          feed_path, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?
        )
      `);

      const now = new Date().toISOString();
      const insertMany = sqliteDb.transaction((rows: Fixture[]) => {
        for (const f of rows) {
          insertStmt.run(
            f.id,
            f.providerId || 'FLASHSCORE',
            String(f.league),
            f.leagueName,
            f.matchDate,
            f.kickOffTime,
            f.homeTeam,
            f.awayTeam,
            f.homeBadge || null,
            f.awayBadge || null,
            f.stage || null,
            f.restDaysHome ?? 7,
            f.restDaysAway ?? 7,
            f.odds?.homeWin ?? 2.10,
            f.odds?.draw ?? 3.30,
            f.odds?.awayWin ?? 3.40,
            f.odds?.over25 ?? 1.85,
            f.odds?.under25 ?? 1.95,
            f.odds?.bttsYes ?? 1.90,
            f.odds?.bttsNo ?? 1.80,
            f.status || 'SCHEDULED',
            f.score ? JSON.stringify(f.score) : null,
            f.prediction ? JSON.stringify(f.prediction) : null,
            f.markets ? JSON.stringify(f.markets) : null,
            f.bestValueMarket ? JSON.stringify(f.bestValueMarket) : null,
            f.homeStats ? JSON.stringify(f.homeStats) : null,
            f.awayStats ? JSON.stringify(f.awayStats) : null,
            f.measurements ? JSON.stringify(f.measurements) : null,
            f.h2hMatches ? JSON.stringify(f.h2hMatches) : null,
            (f as any).feed_path || null,
            now
          );
        }
      });

      insertMany(unique);
    } catch (err: any) {
      console.error('[FootballDB] Error saving upcoming fixtures to SQLite:', err?.message);
    }
  }

  async insertUpcomingFixtures(fixtures: Fixture[]): Promise<number> {
    await this.saveUpcomingFixtures(fixtures);
    return fixtures.length;
  }

  getUpcomingFixturesCount(): number {
    return this.fallbackUpcomingFixtures.filter((f) => f.status !== 'FINISHED').length;
  }

  getFixtureById(id: string): Fixture | null {
    if (!id) return null;
    const cleanId = id.replace(/^fs_/, '');
    return (
      this.fallbackUpcomingFixtures.find(
        (f) => f.id === id || f.id === `fs_${cleanId}` || f.id === cleanId
      ) || null
    );
  }

  getUpcomingFixtures(
    filterOrLeague?: string | {
      league?: string;
      dateFilter?: string;
      date?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
    },
    _dateFilterLegacy?: string
  ): Fixture[] {
    let filtered = this.fallbackUpcomingFixtures.filter((f) => f.status !== 'FINISHED');

    let leagueFilter: string | undefined;
    let dateFilter: string | undefined;
    let dateParam: string | undefined;

    if (typeof filterOrLeague === 'object' && filterOrLeague !== null) {
      leagueFilter = filterOrLeague.league;
      dateFilter = filterOrLeague.dateFilter;
      dateParam = filterOrLeague.date;
    } else {
      leagueFilter = typeof filterOrLeague === 'string' ? filterOrLeague : undefined;
      dateFilter = _dateFilterLegacy;
    }

    if (leagueFilter && leagueFilter !== 'ALL') {
      filtered = filtered.filter((f) => (f.league || '').toUpperCase() === leagueFilter!.toUpperCase());
    }

    if (dateParam) {
      const targetDate = normalizeDateStr(dateParam);
      filtered = filtered.filter((f) => normalizeDateStr(f.matchDate) === targetDate);
    } else if (dateFilter && dateFilter !== 'ALL') {
      const todayStrs = getPossibleDateStrs(0);
      const tomorrowStrs = getPossibleDateStrs(1);
      const df = dateFilter.toUpperCase();
      filtered = filtered.filter((f) => {
        const norm = normalizeDateStr(f.matchDate);
        if (df === 'TODAY') return todayStrs.includes(norm);
        if (df === 'TOMORROW') return tomorrowStrs.includes(norm);
        return true;
      });
    }

    return filtered;
  }

  getTeamHistoricalMatches(teamName: string, limit = 20): HistoricalMatch[] {
    return this.fallbackHistoricalMatches
      .filter((m) => m.homeTeam.toLowerCase() === teamName.toLowerCase() || m.awayTeam.toLowerCase() === teamName.toLowerCase())
      .slice(0, limit);
  }

  getLeagueHistoricalMatches(leagueCode: string, limit = 400): HistoricalMatch[] {
    return this.fallbackHistoricalMatches
      .filter((m) => m.div.toUpperCase() === leagueCode.toUpperCase())
      .slice(0, limit);
  }

  getAllHistoricalMatches(limit = 1500): HistoricalMatch[] {
    return this.fallbackHistoricalMatches.slice(0, limit);
  }

  getStatsSummary() {
    const sqliteStats = getSqliteDbStats();
    return {
      totalMatches: this.fallbackHistoricalMatches.length,
      totalTeams: 78,
      dbSizeMB: sqliteStats.sizeMB,
      sqliteStats,
      leagues: [
        { div: 'E0', matches: 80, avgHomeGoals: 1.65, avgAwayGoals: 1.35 },
        { div: 'SP1', matches: 80, avgHomeGoals: 1.55, avgAwayGoals: 1.15 },
        { div: 'D1', matches: 72, avgHomeGoals: 1.85, avgAwayGoals: 1.45 },
        { div: 'I1', matches: 80, avgHomeGoals: 1.45, avgAwayGoals: 1.20 },
      ],
    };
  }

  getSettings(): EngineSettings {
    return this.fallbackSettings;
  }

  saveSettings(settings: EngineSettings): void {
    this.fallbackSettings = settings;
    try {
      sqliteDb.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('engine_settings', ?)").run(
        JSON.stringify(settings)
      );
    } catch {}
  }

  clearHistoricalData(): void {
    this.fallbackHistoricalMatches = [];
    try {
      sqliteDb.exec('DELETE FROM historical_matches;');
    } catch {}
  }

  saveTipsCache(
    tipsJson: string,
    headlineSummary: string,
    rawMarkdown: string,
    sourcesJson: string
  ): void {
    const now = new Date().toISOString();
    this.tipsCache = {
      tipsJson,
      headlineSummary,
      rawMarkdown,
      sourcesJson,
      updatedAt: now,
    };
    try {
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO football_tips_cache (
          id, tips_json, headline_summary, raw_markdown, sources_json, updated_at
        ) VALUES ('latest_tips', ?, ?, ?, ?, ?)
      `).run(tipsJson, headlineSummary, rawMarkdown, sourcesJson, now);
    } catch {}
  }

  getTipsCache(): {
    tipsJson: string;
    headlineSummary: string;
    rawMarkdown: string;
    sourcesJson: string;
    updatedAt: string;
  } | null {
    return this.tipsCache;
  }

  saveFlashscoreScrapedMatches(matches: Array<any>): void {
    if (matches.length === 0) return;
    for (const m of matches) {
      if (m.matchId) {
        this.scrapedMatchesMemory.set(m.matchId, m);
      }
    }

    try {
      const stmt = sqliteDb.prepare(`
        INSERT OR REPLACE INTO flashscore_scraped_matches (
          match_id, stage, status, match_date, country, league_name,
          home_name, home_image, away_name, away_image,
          home_score, away_score, regulation_time, penalties,
          information_json, statistics_json, scraped_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const now = new Date().toISOString();
      const insertMany = sqliteDb.transaction((rows: any[]) => {
        for (const m of rows) {
          stmt.run(
            m.matchId,
            m.stage || null,
            m.status || 'SCHEDULED',
            m.date || '',
            m.country || null,
            m.leagueName || null,
            m.home?.name || m.homeTeam || '',
            m.home?.image || m.homeBadge || null,
            m.away?.name || m.awayTeam || '',
            m.away?.image || m.awayBadge || null,
            m.result?.home ? parseInt(m.result.home, 10) : null,
            m.result?.away ? parseInt(m.result.away, 10) : null,
            m.result?.regulationTime || null,
            m.result?.penalties || null,
            m.information ? JSON.stringify(m.information) : null,
            m.statistics ? JSON.stringify(m.statistics) : null,
            now
          );
        }
      });
      insertMany(matches);
    } catch {}
  }

  getFlashscoreScrapedMatches(limit = 100): any[] {
    const all = Array.from(this.scrapedMatchesMemory.values());
    return all.sort((a, b) => new Date(b.scraped_at || 0).getTime() - new Date(a.scraped_at || 0).getTime()).slice(0, limit);
  }

  savePredictionMeasurement(fixtureId: string, h2h: HeadToHeadMeasurement): void {
    if (!fixtureId) return;
    const cleanId = fixtureId.replace(/^fs_/, '').trim();
    this.measurementsMemory.set(fixtureId, h2h);
    this.measurementsMemory.set(cleanId, h2h);
    this.measurementsMemory.set(`fs_${cleanId}`, h2h);

    try {
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO prediction_measurements_cache (fixture_id, h2h_json, calculated_at)
        VALUES (?, ?, ?)
      `).run(cleanId, JSON.stringify(h2h), new Date().toISOString());
    } catch {}
  }

  getPredictionMeasurement(fixtureId: string): HeadToHeadMeasurement | null {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').trim();
    const mem = this.measurementsMemory.get(fixtureId) || this.measurementsMemory.get(cleanId) || this.measurementsMemory.get(`fs_${cleanId}`);
    if (mem) return mem;

    try {
      const row = sqliteDb.prepare("SELECT h2h_json FROM prediction_measurements_cache WHERE fixture_id = ?").get(cleanId) as any;
      if (row && row.h2h_json) {
        const parsed = JSON.parse(row.h2h_json);
        this.measurementsMemory.set(cleanId, parsed);
        this.measurementsMemory.set(fixtureId, parsed);
        return parsed;
      }
    } catch {}

    return null;
  }

  getAllPredictionMeasurements(): Map<string, HeadToHeadMeasurement> {
    return this.measurementsMemory;
  }

  private computeFeedHash(text: string): string {
    if (!text) return 'empty_0';
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `${text.length}_${hash}`;
  }

  /**
   * Saves a raw feed into memory and compressed SQLite BLOB storage.
   * Feeds are keyed STRICTLY by their canonical feedPath to prevent multi-gigabyte bloat!
   */
  saveRawFeedData(fixtureId: string, feedPath: string, rawText: string): { hasChanged: boolean } {
    if (!rawText) return { hasChanged: false };
    const newHash = this.computeFeedHash(rawText);
    const key = feedPath || fixtureId;
    const existingHash = this.rawFeedHashesMemory.get(key);
    const hasChanged = existingHash !== newHash;

    if (hasChanged) {
      this.rawFeedHashesMemory.set(key, newHash);
    }

    // Cache in memory for instant synchronous access
    if (feedPath) {
      this.rawFeedsMemory.set(feedPath, rawText);
    }
    if (fixtureId && (fixtureId.includes('df_hh_') || !feedPath)) {
      const cleanId = fixtureId.replace(/^fs_/, '').trim();
      this.rawFeedsMemory.set(cleanId, rawText);
      this.rawFeedsMemory.set(`fs_${cleanId}`, rawText);
    }

    // Persist to SQLite as compressed GZIP BLOB strictly under canonical feedPath or on-demand H2H ID
    if (hasChanged) {
      try {
        const canonicalKey = feedPath || fixtureId;
        const compressed = compressString(rawText);
        const matchesCount = (rawText.match(/AA÷/g) || []).length;

        sqliteDb.prepare(`
          INSERT OR REPLACE INTO raw_feed_data (
            feed_path, compressed_data, uncompressed_length, matches_count, scraped_at
          ) VALUES (?, ?, ?, ?, ?)
        `).run(canonicalKey, compressed, rawText.length, matchesCount, new Date().toISOString());
      } catch (err: any) {
        console.warn('[FootballDB] SQLite compressed raw feed insert note:', err?.message);
      }
    }

    return { hasChanged };
  }

  saveRawFeed(fixtureId: string, feedPath: string, rawText: string): { hasChanged: boolean } {
    return this.saveRawFeedData(fixtureId, feedPath, rawText);
  }

  getRawFeed(fixtureId: string): { rawText: string } | null {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').replace(/^scraped_/, '').trim();

    // 1. Direct key match in rawFeedsMemory
    const directText = this.rawFeedsMemory.get(fixtureId) || this.rawFeedsMemory.get(cleanId) || this.rawFeedsMemory.get(`fs_${cleanId}`);
    if (directText) {
      return { rawText: directText };
    }

    // 2. Search daily raw feeds stored in memory for section containing this match ID (AA÷matchId)
    for (const [, rawText] of this.rawFeedsMemory.entries()) {
      if (rawText && (rawText.includes(`AA÷${cleanId}`) || rawText.includes(`AA÷${fixtureId}`))) {
        return { rawText };
      }
    }

    // 3. Check SQLite compressed raw_feed_data
    try {
      // Check direct feed_path match
      const directRow = sqliteDb.prepare("SELECT compressed_data FROM raw_feed_data WHERE feed_path = ? OR feed_path = ?").get(cleanId, `df_hh_1_${cleanId}`) as any;
      if (directRow && directRow.compressed_data) {
        const decompressed = decompressBuffer(directRow.compressed_data);
        this.rawFeedsMemory.set(cleanId, decompressed);
        return { rawText: decompressed };
      }

      // Check daily feeds stored in SQLite
      const dailyRows = sqliteDb.prepare("SELECT feed_path, compressed_data FROM raw_feed_data WHERE feed_path LIKE 'f_1_%'").all() as any[];
      for (const row of dailyRows) {
        if (row.compressed_data) {
          const decompressed = decompressBuffer(row.compressed_data);
          this.rawFeedsMemory.set(row.feed_path, decompressed);
          if (decompressed.includes(`AA÷${cleanId}`) || decompressed.includes(`AA÷${fixtureId}`)) {
            return { rawText: decompressed };
          }
        }
      }
    } catch {}

    return null;
  }

  async getRawFeedAsync(fixtureId: string): Promise<{ rawText: string } | null> {
    return this.getRawFeed(fixtureId);
  }

  getRawFeedsCount(): number {
    try {
      const row = sqliteDb.prepare("SELECT COUNT(*) as count FROM raw_feed_data").get() as any;
      return row ? Number(row.count) : this.rawFeedsMemory.size;
    } catch {
      return this.rawFeedsMemory.size;
    }
  }

  saveMatchStatistics(matchId: string, statistics: any[]): void {
    if (!matchId) return;
    const cleanId = matchId.replace(/^fs_/, '').trim();
    this.matchStatsMemory.set(matchId, statistics);
    this.matchStatsMemory.set(cleanId, statistics);
  }

  getMatchStatistics(matchId: string): any[] {
    if (!matchId) return [];
    const cleanId = matchId.replace(/^fs_/, '').trim();
    return this.matchStatsMemory.get(matchId) || this.matchStatsMemory.get(cleanId) || [];
  }

  saveH2HRecord(fixtureId: string, h2hOrHomeTeam: any, _awayTeam?: string, h2hObj?: HeadToHeadMeasurement): void {
    const h2h = typeof h2hOrHomeTeam === 'object' ? h2hOrHomeTeam : h2hObj;
    if (h2h) {
      this.savePredictionMeasurement(fixtureId, h2h);
    }
  }

  saveLeagueStandings(tableObjOrLeagueCode: any, leagueName?: string, country?: string, standings?: any[], source = 'FLASHSCORE_SCRAPED'): void {
    let leagueCode = '';
    let name = '';
    let ctry: string | undefined;
    let tableData: any[] = [];

    if (typeof tableObjOrLeagueCode === 'object' && tableObjOrLeagueCode !== null) {
      leagueCode = tableObjOrLeagueCode.leagueCode || tableObjOrLeagueCode.league_code;
      name = tableObjOrLeagueCode.leagueName || tableObjOrLeagueCode.league_name;
      ctry = tableObjOrLeagueCode.country;
      tableData = tableObjOrLeagueCode.table || tableObjOrLeagueCode.standings || [];
    } else {
      leagueCode = String(tableObjOrLeagueCode);
      name = leagueName || leagueCode;
      ctry = country;
      tableData = standings || [];
    }

    const data = { leagueCode, leagueName: name, country: ctry, standings: tableData, table: tableData, source, updatedAt: new Date().toISOString() };
    this.standingsMemory.set(leagueCode, data);

    try {
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO league_standings (league_code, league_name, country, standings_json, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(leagueCode, name, ctry || null, JSON.stringify(tableData), source, data.updatedAt);
    } catch {}
  }

  getLeagueStandings(leagueCode: string): any {
    const mem = this.standingsMemory.get(leagueCode);
    if (mem) return mem;

    try {
      const row = sqliteDb.prepare("SELECT * FROM league_standings WHERE league_code = ?").get(leagueCode) as any;
      if (row && row.standings_json) {
        const parsedTable = JSON.parse(row.standings_json);
        const parsed = {
          leagueCode: row.league_code,
          leagueName: row.league_name,
          country: row.country,
          table: parsedTable,
          standings: parsedTable,
          source: row.source,
          updatedAt: row.updated_at,
        };
        this.standingsMemory.set(leagueCode, parsed);
        return parsed;
      }
    } catch {}

    return null;
  }
}

export const db = new FootballDB();
