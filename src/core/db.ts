import fs from 'fs';
import path from 'path';
import { HistoricalMatch, Fixture, EngineSettings, HeadToHeadMeasurement } from './types.js';
import { getPossibleDateStrs, normalizeDateStr } from './dateUtils.js';
import { loggerService } from '../services/loggerService.js';
import { footballTurso, safeTursoBatch } from './tursoClient.js';



export class FootballDB {
  private isInitialized = false;
  private fallbackHistoricalMatches: HistoricalMatch[] = [];
  private fallbackUpcomingFixtures: Fixture[] = [];
  private rawFeedsMemory: Map<string, string> = new Map();
  private rawFeedsDbCount = 0;
  private measurementsMemory: Map<string, HeadToHeadMeasurement> = new Map();
  private standingsMemory: Map<string, any> = new Map();
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



    if (footballTurso) {
      try {
        console.log('[FootballDB] Initializing Turso cloud database tables...');
        await this.createTablesOnTurso();
        console.log('[FootballDB] Turso cloud database tables verified.');
      } catch (err: any) {
        console.warn('[FootballDB] Turso initialization warning:', err?.message);
      }
    } else {
      console.log('[FootballDB] Running in-memory mode (No Turso URL provided).');
    }

    this.isInitialized = true;
  }

  private async createTablesOnTurso(): Promise<void> {
    if (!footballTurso) return;

    const queries = [
      `CREATE TABLE IF NOT EXISTS historical_matches (
        id TEXT PRIMARY KEY,
        div TEXT NOT NULL,
        season TEXT NOT NULL,
        match_date TEXT NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        fthg INTEGER NOT NULL,
        ftag INTEGER NOT NULL,
        ftr TEXT NOT NULL,
        hs INTEGER,
        as_shots INTEGER,
        hst INTEGER,
        ast INTEGER
      );`,
      `CREATE INDEX IF NOT EXISTS idx_matches_div ON historical_matches(div);`,
      `CREATE INDEX IF NOT EXISTS idx_matches_date ON historical_matches(match_date);`,
      `CREATE TABLE IF NOT EXISTS upcoming_fixtures (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        league TEXT NOT NULL,
        league_name TEXT NOT NULL,
        match_date TEXT NOT NULL,
        kick_off_time TEXT NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        home_badge TEXT,
        away_badge TEXT,
        stage TEXT,
        b365_h REAL NOT NULL,
        b365_d REAL NOT NULL,
        b365_a REAL NOT NULL,
        b365_over25 REAL,
        b365_under25 REAL,
        b365_btts_yes REAL,
        b365_btts_no REAL,
        status TEXT NOT NULL DEFAULT 'SCHEDULED',
        score_json TEXT,
        prediction_json TEXT,
        markets_json TEXT,
        best_value_market_json TEXT,
        home_stats_json TEXT,
        away_stats_json TEXT,
        measurements_json TEXT,
        h2h_matches_json TEXT,
        updated_at TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_upcoming_date ON upcoming_fixtures(match_date);`,
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS football_tips_cache (
        id TEXT PRIMARY KEY,
        tips_json TEXT NOT NULL,
        headline_summary TEXT NOT NULL,
        raw_markdown TEXT NOT NULL,
        sources_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS flashscore_scraped_matches (
        match_id TEXT PRIMARY KEY,
        stage TEXT,
        status TEXT NOT NULL,
        match_date TEXT NOT NULL,
        country TEXT,
        league_name TEXT,
        home_name TEXT NOT NULL,
        home_image TEXT,
        away_name TEXT NOT NULL,
        away_image TEXT,
        home_score INTEGER,
        away_score INTEGER,
        regulation_time TEXT,
        penalties TEXT,
        information_json TEXT,
        statistics_json TEXT,
        scraped_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS prediction_measurements_cache (
        fixture_id TEXT PRIMARY KEY,
        h2h_json TEXT NOT NULL,
        calculated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS raw_feed_data (
        fixture_id TEXT PRIMARY KEY,
        feed_path TEXT NOT NULL,
        raw_text TEXT NOT NULL,
        scraped_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS league_standings (
        league_code TEXT PRIMARY KEY,
        league_name TEXT NOT NULL,
        country TEXT,
        standings_json TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'FLASHSCORE_SCRAPED',
        updated_at TEXT NOT NULL
      );`,
    ];

    for (const q of queries) {
      try {
        await footballTurso.execute(q);
      } catch (err: any) {
        console.warn(`[FootballDB] Turso table creation note:`, err?.message);
      }
    }

    if (footballTurso && this.fallbackUpcomingFixtures.length === 0) {
      try {
        const res = await footballTurso.execute('SELECT * FROM upcoming_fixtures LIMIT 1500;');
        if (res.rows && res.rows.length > 0) {
          const loaded: Fixture[] = [];
          for (const row of res.rows) {
            try {
              loaded.push({
                id: String(row.id),
                providerId: (row.provider_id as any) || 'FLASHSCORE',
                league: String(row.league || ''),
                leagueName: String(row.league_name || row.league || ''),
                matchDate: String(row.match_date || ''),
                kickOffTime: String(row.kick_off_time || ''),
                homeTeam: String(row.home_team || ''),
                awayTeam: String(row.away_team || ''),
                homeBadge: row.home_badge ? String(row.home_badge) : undefined,
                awayBadge: row.away_badge ? String(row.away_badge) : undefined,
                stage: row.stage ? String(row.stage) : undefined,
                odds: {
                  homeWin: Number(row.b365_h || 2.10),
                  draw: Number(row.b365_d || 3.30),
                  awayWin: Number(row.b365_a || 3.40),
                  over25: row.b365_over25 ? Number(row.b365_over25) : 1.85,
                  under25: row.b365_under25 ? Number(row.b365_under25) : 1.95,
                  bttsYes: row.b365_btts_yes ? Number(row.b365_btts_yes) : undefined,
                  bttsNo: row.b365_btts_no ? Number(row.b365_btts_no) : undefined,
                },
                status: (row.status as any) || 'SCHEDULED',
                prediction: row.prediction_json ? JSON.parse(String(row.prediction_json)) : undefined,
                markets: row.markets_json ? JSON.parse(String(row.markets_json)) : undefined,
                bestValueMarket: row.best_value_market_json ? JSON.parse(String(row.best_value_market_json)) : undefined,
                homeStats: row.home_stats_json ? JSON.parse(String(row.home_stats_json)) : undefined,
                awayStats: row.away_stats_json ? JSON.parse(String(row.away_stats_json)) : undefined,
                measurements: row.measurements_json ? JSON.parse(String(row.measurements_json)) : undefined,
              });
            } catch {}
          }
          if (loaded.length > 0) {
            this.fallbackUpcomingFixtures = loaded;
          }
        }
      } catch (err: any) {
        console.warn('[FootballDB] Note hydrating upcoming fixtures:', err?.message);
      }
    }

    if (footballTurso && this.measurementsMemory.size === 0) {
      try {
        const res = await footballTurso.execute('SELECT fixture_id, h2h_json FROM prediction_measurements_cache LIMIT 1500;');
        if (res.rows && res.rows.length > 0) {
          for (const row of res.rows) {
            try {
              if (row.fixture_id && row.h2h_json) {
                const parsed = JSON.parse(String(row.h2h_json));
                const fid = String(row.fixture_id);
                this.measurementsMemory.set(fid, parsed);
                this.measurementsMemory.set(`fs_${fid}`, parsed);
              }
            } catch {}
          }
        }
      } catch (err: any) {
        console.warn('[FootballDB] Note hydrating measurements:', err?.message);
      }
    }

    if (footballTurso && this.scrapedMatchesMemory.size === 0) {
      try {
        const res = await footballTurso.execute('SELECT * FROM flashscore_scraped_matches LIMIT 500;');
        if (res.rows && res.rows.length > 0) {
          for (const row of res.rows) {
            try {
              const sm = {
                matchId: String(row.match_id),
                stage: row.stage ? String(row.stage) : undefined,
                status: String(row.status || 'FINISHED'),
                date: String(row.match_date || ''),
                country: row.country ? String(row.country) : undefined,
                leagueName: row.league_name ? String(row.league_name) : undefined,
                home: { name: String(row.home_name || ''), image: row.home_image ? String(row.home_image) : undefined },
                away: { name: String(row.away_name || ''), image: row.away_image ? String(row.away_image) : undefined },
                result: (row.home_score !== null && row.away_score !== null) ? { home: Number(row.home_score), away: Number(row.away_score) } : undefined,
                regulation_time: row.regulation_time ? String(row.regulation_time) : undefined,
                information: row.information_json ? JSON.parse(String(row.information_json)) : undefined,
                statistics: row.statistics_json ? JSON.parse(String(row.statistics_json)) : undefined,
                scraped_at: row.scraped_at ? String(row.scraped_at) : undefined,
              };
              this.scrapedMatchesMemory.set(sm.matchId, sm);
            } catch {}
          }
        }
      } catch (err: any) {
        console.warn('[FootballDB] Note hydrating scraped matches:', err?.message);
      }
    }

    if (footballTurso && this.rawFeedsMemory.size === 0) {
      try {
        const res = await footballTurso.execute('SELECT COUNT(*) as count FROM raw_feed_data;');
        if (res.rows && res.rows.length > 0 && res.rows[0].count !== undefined) {
          this.rawFeedsDbCount = Number(res.rows[0].count);
        }
      } catch (err: any) {
        console.warn('[FootballDB] Note checking raw_feed_data count:', err?.message);
      }
    }
  }

  async clearAllData(clearRaw = true): Promise<void> {
    this.fallbackHistoricalMatches = [];
    this.fallbackUpcomingFixtures = [];
    this.measurementsMemory.clear();
    this.standingsMemory.clear();
    if (clearRaw) {
      this.rawFeedsMemory.clear();
    }

    if (footballTurso) {
      try {
        await footballTurso.execute('DELETE FROM historical_matches;');
        await footballTurso.execute('DELETE FROM upcoming_fixtures;');
        await footballTurso.execute('DELETE FROM flashscore_scraped_matches;');
        await footballTurso.execute('DELETE FROM prediction_measurements_cache;');
        await footballTurso.execute('DELETE FROM league_standings;');
        if (clearRaw) {
          await footballTurso.execute('DELETE FROM raw_feed_data;');
        }
      } catch (err: any) {
        console.error('[FootballDB] Error clearing Turso database:', err?.message);
      }
    }

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'DATABASE',
      source: 'FootballDB',
      message: `Database tables ${clearRaw ? 'and raw feeds ' : ''}cleared on Turso`,
    });
  }

  clearDatabase(clearRaw = false): void {
    this.clearAllData(clearRaw);
  }

  insertHistoricalMatches(matches: HistoricalMatch[]): number {
    if (matches.length === 0) return 0;
    this.fallbackHistoricalMatches = matches;

    if (footballTurso) {
      const statements = matches.map((m) => ({
        sql: `INSERT OR REPLACE INTO historical_matches (
          id, div, season, match_date, home_team, away_team,
          fthg, ftag, ftr, hs, as_shots, hst, ast
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
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
          m.ast ?? null,
        ],
      }));

      safeTursoBatch(footballTurso, statements, 25);
    }

    return matches.length;
  }

  saveUpcomingFixtures(fixtures: Fixture[]): void {
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

    if (footballTurso) {
      const statements = unique.map((f) => ({
        sql: `INSERT OR REPLACE INTO upcoming_fixtures (
          id, provider_id, league, league_name, match_date, kick_off_time,
          home_team, away_team, home_badge, away_badge, stage,
          b365_h, b365_d, b365_a, b365_over25, b365_under25,
          b365_btts_yes, b365_btts_no, status, score_json,
          prediction_json, markets_json, best_value_market_json,
          home_stats_json, away_stats_json, measurements_json, h2h_matches_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
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
          f.odds.homeWin,
          f.odds.draw,
          f.odds.awayWin,
          f.odds.over25 || 1.95,
          f.odds.under25 || 1.85,
          f.odds.bttsYes || 1.90,
          f.odds.bttsNo || 1.80,
          f.status || 'SCHEDULED',
          f.score ? JSON.stringify(f.score) : null,
          f.prediction ? JSON.stringify(f.prediction) : null,
          f.markets ? JSON.stringify(f.markets) : null,
          f.bestValueMarket ? JSON.stringify(f.bestValueMarket) : null,
          f.homeStats ? JSON.stringify(f.homeStats) : null,
          f.awayStats ? JSON.stringify(f.awayStats) : null,
          f.measurements ? JSON.stringify(f.measurements) : null,
          f.h2hMatches ? JSON.stringify(f.h2hMatches) : null,
          new Date().toISOString(),
        ],
      }));

      safeTursoBatch(footballTurso, statements, 25);
    }
  }

  insertUpcomingFixtures(fixtures: Fixture[]): number {
    this.saveUpcomingFixtures(fixtures);
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
    return {
      totalMatches: this.fallbackHistoricalMatches.length,
      totalTeams: 78,
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
    if (footballTurso) {
      footballTurso.execute({
        sql: `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('engine_settings', ?)`,
        args: [JSON.stringify(settings)],
      }).catch(() => {});
    }
  }

  clearHistoricalData(): void {
    this.fallbackHistoricalMatches = [];
    if (footballTurso) {
      footballTurso.execute('DELETE FROM historical_matches;').catch(() => {});
    }
  }

  saveTipsCache(
    tipsJson: string,
    headlineSummary: string,
    rawMarkdown: string,
    sourcesJson: string
  ): void {
    if (footballTurso) {
      footballTurso.execute({
        sql: `INSERT OR REPLACE INTO football_tips_cache (
          id, tips_json, headline_summary, raw_markdown, sources_json, updated_at
        ) VALUES ('latest_tips', ?, ?, ?, ?, ?)`,
        args: [tipsJson, headlineSummary, rawMarkdown, sourcesJson, new Date().toISOString()],
      }).catch(() => {});
    }
  }

  private scrapedMatchesMemory: Map<string, any> = new Map();
  private matchStatsMemory: Map<string, any[]> = new Map();

  saveFlashscoreScrapedMatches(matches: Array<any>): void {
    if (matches.length === 0) return;
    for (const m of matches) {
      if (m.matchId) {
        this.scrapedMatchesMemory.set(m.matchId, m);
      }
    }

    if (!footballTurso) return;
    try {
      const statements = matches.map((m) => ({
        sql: `INSERT OR REPLACE INTO flashscore_scraped_matches (
          match_id, stage, status, match_date, country, league_name,
          home_name, home_image, away_name, away_image,
          home_score, away_score, regulation_time, penalties,
          information_json, statistics_json, scraped_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
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
          new Date().toISOString(),
        ],
      }));
      safeTursoBatch(footballTurso, statements, 25);
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

    if (footballTurso) {
      footballTurso.execute({
        sql: `INSERT OR REPLACE INTO prediction_measurements_cache (fixture_id, h2h_json, calculated_at) VALUES (?, ?, ?)`,
        args: [cleanId, JSON.stringify(h2h), new Date().toISOString()],
      }).catch(() => {});
    }
  }

  getPredictionMeasurement(fixtureId: string): HeadToHeadMeasurement | null {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').trim();
    return this.measurementsMemory.get(fixtureId) || this.measurementsMemory.get(cleanId) || this.measurementsMemory.get(`fs_${cleanId}`) || null;
  }

  getAllPredictionMeasurements(): Map<string, HeadToHeadMeasurement> {
    return this.measurementsMemory;
  }

  private rawFeedHashesMemory: Map<string, string> = new Map();

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

  saveRawFeedData(fixtureId: string, feedPath: string, rawText: string): { hasChanged: boolean } {
    if (!rawText) return { hasChanged: false };
    const newHash = this.computeFeedHash(rawText);
    const key = fixtureId || feedPath;
    const existingHash = this.rawFeedHashesMemory.get(key);
    const hasChanged = existingHash !== newHash;

    if (hasChanged) {
      this.rawFeedHashesMemory.set(key, newHash);
    }

    if (fixtureId) {
      this.rawFeedsMemory.set(fixtureId, rawText);
      const cleanId = fixtureId.replace(/^fs_/, '').trim();
      this.rawFeedsMemory.set(cleanId, rawText);
      this.rawFeedsMemory.set(`fs_${cleanId}`, rawText);
      this.rawFeedHashesMemory.set(cleanId, newHash);
      this.rawFeedHashesMemory.set(`fs_${cleanId}`, newHash);
    }
    if (feedPath) {
      this.rawFeedsMemory.set(feedPath, rawText);
      this.rawFeedHashesMemory.set(feedPath, newHash);
    }

    if (footballTurso && fixtureId && hasChanged) {
      const cleanId = fixtureId.replace(/^fs_/, '').trim();
      footballTurso.execute({
        sql: `INSERT OR REPLACE INTO raw_feed_data (fixture_id, feed_path, raw_text, scraped_at) VALUES (?, ?, ?, ?)`,
        args: [cleanId, feedPath || fixtureId, rawText, new Date().toISOString()],
      }).catch(() => {});
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
    let directText = this.rawFeedsMemory.get(fixtureId) || this.rawFeedsMemory.get(cleanId) || this.rawFeedsMemory.get(`fs_${cleanId}`);
    if (directText) {
      return { rawText: directText };
    }

    // 2. Search daily raw feeds stored in memory for section containing this match ID (AA÷matchId)
    for (const [key, rawText] of this.rawFeedsMemory.entries()) {
      if (rawText && (rawText.includes(`AA÷${cleanId}`) || rawText.includes(`AA÷${fixtureId}`))) {
        return { rawText };
      }
    }

    return null;
  }

  async getRawFeedAsync(fixtureId: string): Promise<{ rawText: string } | null> {
    const memRes = this.getRawFeed(fixtureId);
    if (memRes) return memRes;

    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').replace(/^scraped_/, '').trim();

    if (footballTurso) {
      try {
        const res = await footballTurso.execute({
          sql: `SELECT raw_text FROM raw_feed_data WHERE fixture_id = ? OR feed_path = ? OR feed_path = ? LIMIT 1`,
          args: [cleanId, cleanId, `df_hh_1_${cleanId}`],
        });
        if (res.rows && res.rows.length > 0 && res.rows[0].raw_text) {
          const rawText = String(res.rows[0].raw_text);
          this.rawFeedsMemory.set(cleanId, rawText);
          this.rawFeedsMemory.set(`fs_${cleanId}`, rawText);
          return { rawText };
        }
      } catch (err: any) {
        console.warn('[FootballDB] Turso raw_feed_data query note:', err?.message);
      }
    }

    return null;
  }

  getRawFeedsCount(): number {
    return Math.max(this.rawFeedsMemory.size, this.rawFeedsDbCount);
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

    const data = { leagueCode, leagueName: name, country: ctry, standings: tableData, source, updatedAt: new Date().toISOString() };
    this.standingsMemory.set(leagueCode, data);
    if (footballTurso) {
      footballTurso.execute({
        sql: `INSERT OR REPLACE INTO league_standings (league_code, league_name, country, standings_json, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [leagueCode, name, ctry || null, JSON.stringify(tableData), source, data.updatedAt],
      }).catch(() => {});
    }
  }

  getLeagueStandings(leagueCode: string): any {
    return this.standingsMemory.get(leagueCode) || null;
  }
}

export const db = new FootballDB();
