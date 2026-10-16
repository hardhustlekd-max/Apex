import fs from 'fs';
import path from 'path';
import initSqlJs, { Database, SqlValue } from 'sql.js';
import { HistoricalMatch, Fixture, EngineSettings, HeadToHeadMeasurement, LeagueStandingTable, LeagueStandingEntry } from './types.js';
import { getRelativeDateStr, getCurrentSeason } from './seedData.js';
import { getCodeForSlug } from './leagueMapper.js';
import { loggerService } from '../services/loggerService.js';

function getDbPaths() {
  const localDir = path.resolve(process.cwd(), 'data');
  const localFile = path.join(localDir, 'football.sqlite');
  const tmpDir = path.resolve('/tmp', 'data');
  const tmpFile = path.join(tmpDir, 'football.sqlite');
  return { localDir, localFile, tmpDir, tmpFile };
}

export class FootballDB {
  private db: Database | null = null;
  private SQL: any = null;
  private isInitialized = false;
  private fallbackHistoricalMatches: HistoricalMatch[] = [];
  private fallbackUpcomingFixtures: Fixture[] = [];
  private fallbackSettings: EngineSettings = {
    activeProvider: 'FLASHSCORE',
    rollingMatchWindow: 15,
    minEVThreshold: 1.10,
    safeWinThreshold: 0.72,
    homeAdvantageFactor: 1.12,
    formDecayRate: 0.85,
    autoSyncDaily: true,
  };

  async init(): Promise<void> {
    if (this.isInitialized && this.db) return;

    this.fallbackHistoricalMatches = [];
    this.fallbackUpcomingFixtures = [];

    const { localDir, localFile, tmpFile } = getDbPaths();
    try {
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
    } catch {
      // Local directory creation restricted, will use in-memory/tmp
    }

    try {
      this.SQL = await initSqlJs();

      let loadedFromDisk = false;
      try {
        if (fs.existsSync(localFile)) {
          const fileBuffer = fs.readFileSync(localFile);
          this.db = new this.SQL.Database(fileBuffer);
          loadedFromDisk = true;
        } else if (fs.existsSync(tmpFile)) {
          const fileBuffer = fs.readFileSync(tmpFile);
          this.db = new this.SQL.Database(fileBuffer);
          loadedFromDisk = true;
        }
      } catch (err) {
        console.warn('Could not read existing SQLite database from disk, creating in-memory:', err);
      }

      if (!loadedFromDisk || !this.db) {
        this.db = new this.SQL.Database();
      }

      this.createTables();
      this.saveToDisk();
      this.isInitialized = true;
    } catch (err) {
      console.warn('SQLite wasm initialization failed, using in-memory dataset fallback:', err);
      this.isInitialized = true;
    }
  }

  private saveToDisk(): void {
    if (!this.db) return;
    try {
      const { localDir, localFile, tmpDir, tmpFile } = getDbPaths();
      const data = this.db.export();
      const buffer = Buffer.from(data);

      // Primary: maintain local disk persistence under ./data/football.sqlite
      try {
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true });
        }
        fs.writeFileSync(localFile, buffer);
        return;
      } catch {
        // Fallback to /tmp if primary directory is mounted read-only
        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }
        fs.writeFileSync(tmpFile, buffer);
      }
    } catch {
      // In-memory persistent state maintained safely
    }
  }

  private createTables(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS historical_matches (
        id TEXT PRIMARY KEY,
        div TEXT NOT NULL,
        season TEXT NOT NULL,
        match_date TEXT NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        fthg INTEGER NOT NULL,
        ftag INTEGER NOT NULL,
        ftr TEXT NOT NULL,
        hthg INTEGER,
        htag INTEGER,
        htr TEXT,
        hs INTEGER,
        as_shots INTEGER,
        hst INTEGER,
        ast INTEGER,
        b365_h REAL,
        b365_d REAL,
        b365_a REAL,
        b365_over25 REAL,
        b365_under25 REAL,
        rest_days_home INTEGER DEFAULT 7,
        rest_days_away INTEGER DEFAULT 7
      );

      CREATE INDEX IF NOT EXISTS idx_matches_div ON historical_matches(div);
      CREATE INDEX IF NOT EXISTS idx_matches_home ON historical_matches(home_team);
      CREATE INDEX IF NOT EXISTS idx_matches_away ON historical_matches(away_team);
      CREATE INDEX IF NOT EXISTS idx_matches_date ON historical_matches(match_date);

      CREATE TABLE IF NOT EXISTS upcoming_fixtures (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        league TEXT NOT NULL,
        league_name TEXT NOT NULL,
        match_date TEXT NOT NULL,
        kick_off_time TEXT NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        b365_h REAL NOT NULL,
        b365_d REAL NOT NULL,
        b365_a REAL NOT NULL,
        b365_over25 REAL,
        b365_under25 REAL,
        b365_btts_yes REAL,
        b365_btts_no REAL,
        status TEXT NOT NULL DEFAULT 'SCHEDULED'
      );

      CREATE INDEX IF NOT EXISTS idx_upcoming_date ON upcoming_fixtures(match_date);

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS live_scores_cache (
        fixture_id TEXT PRIMARY KEY,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        home_score INTEGER NOT NULL DEFAULT 0,
        away_score INTEGER NOT NULL DEFAULT 0,
        minute INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'FIRST_HALF',
        events_json TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS football_tips_cache (
        id TEXT PRIMARY KEY,
        tips_json TEXT NOT NULL,
        headline_summary TEXT NOT NULL,
        raw_markdown TEXT NOT NULL,
        sources_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS flashscore_scraped_matches (
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
      );

      CREATE INDEX IF NOT EXISTS idx_flashscore_matches_date ON flashscore_scraped_matches(match_date);

      CREATE TABLE IF NOT EXISTS prebuilt_accumulators_cache (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        date_scope TEXT NOT NULL,
        combined_odds REAL NOT NULL,
        combined_prob REAL NOT NULL,
        risk_level TEXT NOT NULL,
        unstarted_only INTEGER DEFAULT 1,
        slip_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_prebuilt_cache_scope ON prebuilt_accumulators_cache(date_scope);

      CREATE TABLE IF NOT EXISTS prediction_measurements_cache (
        fixture_id TEXT PRIMARY KEY,
        h2h_json TEXT NOT NULL,
        calculated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pred_measurements_fixture ON prediction_measurements_cache(fixture_id);

      CREATE TABLE IF NOT EXISTS league_standings (
        league_code TEXT PRIMARY KEY,
        league_name TEXT NOT NULL,
        country TEXT,
        season TEXT,
        tournament_id TEXT,
        standings_json TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'FLASHSCORE_SCRAPED',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS terminal_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        details_json TEXT
      );

      CREATE TABLE IF NOT EXISTS match_statistics_relational (
        match_id TEXT NOT NULL,
        category TEXT NOT NULL,
        home_value TEXT,
        away_value TEXT,
        PRIMARY KEY (match_id, category)
      );

      CREATE TABLE IF NOT EXISTS h2h_records_relational (
        fixture_id TEXT PRIMARY KEY,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        matches_count INTEGER NOT NULL,
        home_wins INTEGER NOT NULL,
        draws INTEGER NOT NULL,
        away_wins INTEGER NOT NULL,
        h2h_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS raw_feed_data (
        fixture_id TEXT PRIMARY KEY,
        feed_path TEXT NOT NULL,
        raw_text TEXT NOT NULL,
        scraped_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON terminal_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_logs_level ON terminal_logs(level);
    `);

    // Insert default settings if not exists
    const settings = this.getSettings();
    if (!settings) {
      this.saveSettings(this.fallbackSettings);
    }
  }

  /**
   * Clears database tables and local browser storage while preserving raw historical feed data by default
   */
  clearDatabase(clearRaw: boolean = false): void {
    if (!this.db) return;
    this.db.run('BEGIN TRANSACTION;');
    try {
      this.db.run('DELETE FROM historical_matches;');
      this.db.run('DELETE FROM upcoming_fixtures;');
      this.db.run('DELETE FROM flashscore_scraped_matches;');
      this.db.run('DELETE FROM league_standings;');
      if (clearRaw) {
        this.db.run('DELETE FROM raw_feed_data;');
      }
      this.db.run('COMMIT;');
      this.saveToDisk();
      
      // Clear browser-side storage if running in browser
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }
      
      console.log('[FootballDB] All tables and browser storage cleared.');
      
      // Force reload to completely fresh start if in browser
      if (typeof window !== 'undefined' && window.location) {
        window.location.reload();
      }
    } catch (err) {
      this.db.run('ROLLBACK;');
      console.error('[FootballDB] Failed to clear database:', err);
    }
  }

  insertHistoricalMatches(matches: HistoricalMatch[]): number {
    if (matches.length === 0) return 0;
    this.fallbackHistoricalMatches = matches;

    if (!this.db) return matches.length;

    let inserted = 0;
    this.db.run('BEGIN TRANSACTION;');
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO historical_matches (
          id, div, season, match_date, home_team, away_team,
          fthg, ftag, ftr, hthg, htag, htr, hs, as_shots, hst, ast,
          b365_h, b365_d, b365_a, b365_over25, b365_under25,
          rest_days_home, rest_days_away
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const m of matches) {
        stmt.run([
          m.id,
          m.div,
          m.season,
          m.matchDate,
          m.homeTeam,
          m.awayTeam,
          m.fthg,
          m.ftag,
          m.ftr,
          m.hthg ?? null,
          m.htag ?? null,
          m.htr ?? null,
          m.hs ?? null,
          m.asShots ?? null,
          m.hst ?? null,
          m.ast ?? null,
          m.b365H ?? null,
          m.b365D ?? null,
          m.b365A ?? null,
          m.b365Over25 ?? null,
          m.b365Under25 ?? null,
          m.restDaysHome ?? 7,
          m.restDaysAway ?? 7,
        ]);
        inserted++;
      }
      stmt.free();
      this.db.run('COMMIT;');
      this.saveToDisk();
    } catch (err) {
      this.db.run('ROLLBACK;');
      console.error('Failed to insert historical matches transaction:', err);
    }

    return inserted;
  }

  insertUpcomingFixtures(fixtures: Fixture[]): number {
    if (fixtures.length === 0) return 0;
    this.fallbackUpcomingFixtures = fixtures;

    if (!this.db) return fixtures.length;

    this.db.run('BEGIN TRANSACTION;');
    try {
      // Clear previous scheduled fixtures
      this.db.run(`DELETE FROM upcoming_fixtures`);

      const stmt = this.db.prepare(`
        INSERT INTO upcoming_fixtures (
          id, provider_id, league, league_name, match_date, kick_off_time,
          home_team, away_team, b365_h, b365_d, b365_a,
          b365_over25, b365_under25, b365_btts_yes, b365_btts_no, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const f of fixtures) {
        stmt.run([
          f.id,
          f.providerId,
          f.league,
          f.leagueName,
          f.matchDate,
          f.kickOffTime,
          f.homeTeam,
          f.awayTeam,
          f.odds.homeWin,
          f.odds.draw,
          f.odds.awayWin,
          f.odds.over25 ?? 1.85,
          f.odds.under25 ?? 1.95,
          f.odds.bttsYes ?? 1.80,
          f.odds.bttsNo ?? 2.00,
          f.status,
        ]);
      }
      stmt.free();
      this.db.run('COMMIT;');
      this.saveToDisk();
    } catch (err) {
      this.db.run('ROLLBACK;');
      console.error('Failed to insert upcoming fixtures:', err);
    }

    return fixtures.length;
  }

  getUpcomingFixtures(leagueFilter?: string, dateFilter?: string): Fixture[] {
    const todayStr = getRelativeDateStr(0);

    if (!this.db) {
      let filtered = this.fallbackUpcomingFixtures.filter((f) => f.matchDate >= todayStr);
      if (leagueFilter && leagueFilter !== 'ALL') {
        filtered = filtered.filter((f) => f.league.toUpperCase() === leagueFilter.toUpperCase());
      }
      if (dateFilter === 'TODAY') {
        filtered = filtered.filter((f) => f.matchDate === todayStr);
      } else if (dateFilter === 'TOMORROW') {
        filtered = filtered.filter((f) => f.matchDate === getRelativeDateStr(1));
      } else if (dateFilter === 'NEXT_3_DAYS') {
        filtered = filtered.filter((f) => f.matchDate <= getRelativeDateStr(2));
      } else if (dateFilter === 'THIS_WEEK') {
        filtered = filtered.filter((f) => f.matchDate <= getRelativeDateStr(6));
      } else if (dateFilter && /^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
        filtered = filtered.filter((f) => f.matchDate === dateFilter);
      }
      return filtered;
    }

    try {
      let query = `SELECT * FROM upcoming_fixtures WHERE match_date >= ?`;
      const params: SqlValue[] = [todayStr];

      if (leagueFilter && leagueFilter !== 'ALL') {
        query += ` AND league = ?`;
        params.push(leagueFilter);
      }

      if (dateFilter === 'TODAY') {
        query += ` AND match_date = ?`;
        params.push(todayStr);
      } else if (dateFilter === 'TOMORROW') {
        query += ` AND match_date = ?`;
        params.push(getRelativeDateStr(1));
      } else if (dateFilter === 'NEXT_3_DAYS') {
        query += ` AND match_date <= ?`;
        params.push(getRelativeDateStr(2));
      } else if (dateFilter === 'THIS_WEEK') {
        query += ` AND match_date <= ?`;
        params.push(getRelativeDateStr(6));
      } else if (dateFilter && /^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
        query += ` AND match_date = ?`;
        params.push(dateFilter);
      }

      query += ` ORDER BY match_date ASC, kick_off_time ASC`;

      const stmt = this.db.prepare(query);
      stmt.bind(params);

      const fixtures: Fixture[] = [];
      const seenIds = new Set<string>();
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const fixtureId = String(row.id);
        if (seenIds.has(fixtureId)) continue;
        seenIds.add(fixtureId);

        fixtures.push({
          id: fixtureId,
          providerId: String(row.provider_id),
          league: String(row.league),
          leagueName: String(row.league_name),
          matchDate: String(row.match_date),
          kickOffTime: String(row.kick_off_time),
          homeTeam: String(row.home_team),
          awayTeam: String(row.away_team),
          status: (row.status as any) || 'SCHEDULED',
          odds: {
            homeWin: Number(row.b365_h),
            draw: Number(row.b365_d),
            awayWin: Number(row.b365_a),
            over25: Number(row.b365_over25),
            under25: Number(row.b365_under25),
            bttsYes: Number(row.b365_btts_yes),
            bttsNo: Number(row.b365_btts_no),
          },
        });
      }
      stmt.free();

      if (fixtures.length === 0) {
        return this.fallbackUpcomingFixtures;
      }

      return fixtures;
    } catch {
      return this.fallbackUpcomingFixtures;
    }
  }

  getTeamHistoricalMatches(teamName: string, limit = 20): HistoricalMatch[] {
    if (!this.db) {
      return this.fallbackHistoricalMatches
        .filter((m) => m.homeTeam.toLowerCase() === teamName.toLowerCase() || m.awayTeam.toLowerCase() === teamName.toLowerCase())
        .slice(0, limit);
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM historical_matches
        WHERE home_team = ? OR away_team = ?
        ORDER BY match_date DESC
        LIMIT ?
      `);
      stmt.bind([teamName, teamName, limit]);

      const matches: HistoricalMatch[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        matches.push(this.mapRowToHistoricalMatch(row));
      }
      stmt.free();
      return matches;
    } catch {
      return this.fallbackHistoricalMatches
        .filter((m) => m.homeTeam.toLowerCase() === teamName.toLowerCase() || m.awayTeam.toLowerCase() === teamName.toLowerCase())
        .slice(0, limit);
    }
  }

  getLeagueHistoricalMatches(leagueCode: string, limit = 400): HistoricalMatch[] {
    const leagueMapping: Record<string, string> = {
      'PREMIER LEAGUE': 'E0',
      'LA LIGA': 'SP1',
      'BUNDESLIGA': 'D1',
      'SERIE A': 'I1',
      'LIGUE 1': 'F1',
      'EFL CHAMPIONSHIP': 'E1',
    };
    const code = leagueMapping[leagueCode.toUpperCase()] || leagueCode;

    if (!this.db) {
      return this.fallbackHistoricalMatches
        .filter((m) => m.div.toUpperCase() === code.toUpperCase() || m.div.toUpperCase() === leagueCode.toUpperCase())
        .slice(0, limit);
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM historical_matches
        WHERE div = ? OR div = ?
        ORDER BY match_date DESC
        LIMIT ?
      `);
      stmt.bind([code, leagueCode, limit]);

      const matches: HistoricalMatch[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        matches.push(this.mapRowToHistoricalMatch(row));
      }
      stmt.free();
      return matches;
    } catch {
      return this.fallbackHistoricalMatches
        .filter((m) => m.div.toUpperCase() === code.toUpperCase() || m.div.toUpperCase() === leagueCode.toUpperCase())
        .slice(0, limit);
    }
  }

  getAllHistoricalMatches(limit = 1500): HistoricalMatch[] {
    if (!this.db) {
      return this.fallbackHistoricalMatches.slice(0, limit);
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM historical_matches
        ORDER BY match_date DESC
        LIMIT ?
      `);
      stmt.bind([limit]);

      const matches: HistoricalMatch[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        matches.push(this.mapRowToHistoricalMatch(row));
      }
      stmt.free();

      if (matches.length === 0) {
        return this.fallbackHistoricalMatches.slice(0, limit);
      }

      return matches;
    } catch {
      return this.fallbackHistoricalMatches.slice(0, limit);
    }
  }

  getStatsSummary() {
    if (!this.db) {
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

    try {
      const countRes = this.db.exec(`SELECT COUNT(*) as count FROM historical_matches`);
      const totalMatches = countRes[0]?.values[0]?.[0] ? Number(countRes[0].values[0][0]) : 0;

      const teamsRes = this.db.exec(`
        SELECT COUNT(DISTINCT team) FROM (
          SELECT home_team as team FROM historical_matches
          UNION
          SELECT away_team as team FROM historical_matches
        )
      `);
      const totalTeams = teamsRes[0]?.values[0]?.[0] ? Number(teamsRes[0].values[0][0]) : 0;

      const leagueRes = this.db.exec(`
        SELECT div, COUNT(*) as matches, AVG(fthg) as avg_home_goals, AVG(ftag) as avg_away_goals
        FROM historical_matches
        GROUP BY div
      `);

      const leagues = (leagueRes[0]?.values || []).map((row: any[]) => ({
        div: String(row[0]),
        matches: Number(row[1]),
        avgHomeGoals: Number((Number(row[2]) || 0).toFixed(2)),
        avgAwayGoals: Number((Number(row[3]) || 0).toFixed(2)),
      }));

      return { totalMatches, totalTeams, leagues };
    } catch {
      return {
        totalMatches: this.fallbackHistoricalMatches.length,
        totalTeams: 78,
        leagues: [],
      };
    }
  }

  getSettings(): EngineSettings | null {
    if (!this.db) return this.fallbackSettings;
    try {
      const res = this.db.exec(`SELECT value FROM app_settings WHERE key = 'engine_settings'`);
      if (res.length > 0 && res[0].values.length > 0) {
        return JSON.parse(String(res[0].values[0][0]));
      }
    } catch {
      // ignore
    }
    return this.fallbackSettings;
  }

  saveSettings(settings: EngineSettings): void {
    this.fallbackSettings = settings;
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO app_settings (key, value)
        VALUES ('engine_settings', ?)
      `);
      stmt.run([JSON.stringify(settings)]);
      stmt.free();
      this.saveToDisk();
    } catch {
      // ignore
    }
  }

  clearHistoricalData(): void {
    this.fallbackHistoricalMatches = [];
    if (!this.db) return;
    try {
      this.db.run(`DELETE FROM historical_matches`);
      this.saveToDisk();
    } catch {
      // ignore
    }
  }

  getLatestTipsCache(): {
    tipsJson: string;
    headlineSummary: string;
    rawMarkdown: string;
    sourcesJson: string;
    updatedAt: string;
  } | null {
    if (!this.db) return null;
    try {
      const res = this.db.exec(`
        SELECT tips_json, headline_summary, raw_markdown, sources_json, updated_at
        FROM football_tips_cache
        WHERE id = 'latest_tips'
      `);
      if (res.length > 0 && res[0].values.length > 0) {
        const row = res[0].values[0];
        return {
          tipsJson: String(row[0]),
          headlineSummary: String(row[1]),
          rawMarkdown: String(row[2]),
          sourcesJson: String(row[3]),
          updatedAt: String(row[4]),
        };
      }
    } catch {
      // ignore
    }
    return null;
  }

  saveTipsCache(
    tipsJson: string,
    headlineSummary: string,
    rawMarkdown: string,
    sourcesJson: string
  ): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO football_tips_cache (
          id, tips_json, headline_summary, raw_markdown, sources_json, updated_at
        ) VALUES ('latest_tips', ?, ?, ?, ?, ?)
      `);
      stmt.run([tipsJson, headlineSummary, rawMarkdown, sourcesJson, new Date().toISOString()]);
      stmt.free();
      this.saveToDisk();
    } catch {
      // ignore
    }
  }

  saveUpcomingFixtures(fixtures: Fixture[]): void {
    const seen = new Set<string>();
    const unique = fixtures.filter((f) => {
      if (!f.id || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });

    this.fallbackUpcomingFixtures = unique;
    if (!this.db) return;
    try {
      this.db.run(`DELETE FROM upcoming_fixtures`);
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO upcoming_fixtures (
          id, provider_id, league, league_name, match_date, kick_off_time,
          home_team, away_team, b365_h, b365_d, b365_a, b365_over25, b365_under25,
          b365_btts_yes, b365_btts_no, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const f of unique) {
        stmt.run([
          f.id,
          f.providerId || 'flashscore',
          String(f.league),
          f.leagueName,
          f.matchDate,
          f.kickOffTime,
          f.homeTeam,
          f.awayTeam,
          f.odds.homeWin,
          f.odds.draw,
          f.odds.awayWin,
          f.odds.over25 || 1.95,
          f.odds.under25 || 1.85,
          f.odds.bttsYes || 1.90,
          f.odds.bttsNo || 1.80,
          f.status || 'SCHEDULED',
        ]);
      }
      stmt.free();
      this.saveToDisk();
    } catch {
      // ignore
    }
  }

  saveFlashscoreScrapedMatches(matches: Array<{
    matchId: string;
    stage?: string;
    status: string;
    date: string;
    country?: string;
    leagueName?: string;
    home: { name: string; image?: string };
    away: { name: string; image?: string };
    result?: { home?: string; away?: string; regulationTime?: string; penalties?: string };
    information?: Array<{ category: string; value: string }>;
    statistics?: Array<{ category: string; homeValue?: string; awayValue?: string }>;
  }>): void {
    if (!this.db || matches.length === 0) return;
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO flashscore_scraped_matches (
          match_id, stage, status, match_date, country, league_name,
          home_name, home_image, away_name, away_image,
          home_score, away_score, regulation_time, penalties,
          information_json, statistics_json, scraped_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const m of matches) {
        stmt.run([
          m.matchId,
          m.stage || null,
          m.status || 'SCHEDULED',
          m.date || '',
          m.country || null,
          m.leagueName || null,
          m.home.name,
          m.home.image || null,
          m.away.name,
          m.away.image || null,
          m.result?.home ? parseInt(m.result.home, 10) : null,
          m.result?.away ? parseInt(m.result.away, 10) : null,
          m.result?.regulationTime || null,
          m.result?.penalties || null,
          m.information ? JSON.stringify(m.information) : null,
          m.statistics ? JSON.stringify(m.statistics) : null,
          new Date().toISOString(),
        ]);
      }
      stmt.free();
      this.saveToDisk();
    } catch (err) {
      console.warn('Error saving scraped matches to database:', err);
    }
  }

  getFlashscoreScrapedMatches(limit = 100): any[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM flashscore_scraped_matches
        ORDER BY match_date DESC
        LIMIT ?
      `);
      stmt.bind([limit]);
      const results: any[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
          matchId: String(row.match_id),
          stage: row.stage ? String(row.stage) : undefined,
          status: String(row.status),
          date: String(row.match_date),
          country: row.country ? String(row.country) : undefined,
          leagueName: row.league_name ? String(row.league_name) : undefined,
          home: {
            name: String(row.home_name),
            image: row.home_image ? String(row.home_image) : undefined,
          },
          away: {
            name: String(row.away_name),
            image: row.away_image ? String(row.away_image) : undefined,
          },
          result: {
            home: row.home_score !== null ? String(row.home_score) : undefined,
            away: row.away_score !== null ? String(row.away_score) : undefined,
            regulationTime: row.regulation_time ? String(row.regulation_time) : undefined,
            penalties: row.penalties ? String(row.penalties) : undefined,
          },
          information: row.information_json ? JSON.parse(String(row.information_json)) : [],
          statistics: row.statistics_json ? JSON.parse(String(row.statistics_json)) : [],
        });
      }
      stmt.free();
      return results;
    } catch {
      return [];
    }
  }

  savePredictionMeasurement(fixtureId: string, h2h: HeadToHeadMeasurement): void {
    if (!this.db || !fixtureId) return;
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO prediction_measurements_cache (fixture_id, h2h_json, calculated_at)
        VALUES (?, ?, ?)
      `);
      stmt.run([fixtureId, JSON.stringify(h2h), new Date().toISOString()]);
      stmt.free();
      this.saveToDisk();
    } catch (e) {
      console.warn('Failed to save prediction measurement to cache:', e);
    }
  }

  getPredictionMeasurement(fixtureId: string): HeadToHeadMeasurement | null {
    if (!this.db || !fixtureId) return null;
    try {
      const stmt = this.db.prepare('SELECT h2h_json FROM prediction_measurements_cache WHERE fixture_id = ?');
      stmt.bind([fixtureId]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        if (row.h2h_json) {
          return JSON.parse(row.h2h_json as string);
        }
      } else {
        stmt.free();
      }
    } catch (e) {
      console.warn('Failed to get prediction measurement from cache:', e);
    }
    return null;
  }

  getAllPredictionMeasurements(): Map<string, HeadToHeadMeasurement> {
    const map = new Map<string, HeadToHeadMeasurement>();
    if (!this.db) return map;
    try {
      const stmt = this.db.prepare('SELECT fixture_id, h2h_json FROM prediction_measurements_cache');
      while (stmt.step()) {
        const row = stmt.getAsObject();
        if (row.fixture_id && row.h2h_json) {
          try {
            map.set(row.fixture_id as string, JSON.parse(row.h2h_json as string));
          } catch {}
        }
      }
      stmt.free();
    } catch (e) {
      console.warn('Failed to get all prediction measurements:', e);
    }
    return map;
  }

  private mapRowToHistoricalMatch(row: Record<string, SqlValue>): HistoricalMatch {
    return {
      id: String(row.id),
      div: String(row.div),
      season: String(row.season),
      matchDate: String(row.match_date),
      homeTeam: String(row.home_team),
      awayTeam: String(row.away_team),
      fthg: Number(row.fthg),
      ftag: Number(row.ftag),
      ftr: (row.ftr as any) || 'D',
      hthg: row.hthg !== null ? Number(row.hthg) : undefined,
      htag: row.htag !== null ? Number(row.htag) : undefined,
      htr: row.htr !== null ? (row.htr as any) : undefined,
      hs: row.hs !== null ? Number(row.hs) : undefined,
      asShots: row.as_shots !== null ? Number(row.as_shots) : undefined,
      hst: row.hst !== null ? Number(row.hst) : undefined,
      ast: row.ast !== null ? Number(row.ast) : undefined,
      b365H: row.b365_h !== null ? Number(row.b365_h) : undefined,
      b365D: row.b365_d !== null ? Number(row.b365_d) : undefined,
      b365A: row.b365_a !== null ? Number(row.b365_a) : undefined,
      b365Over25: row.b365_over25 !== null ? Number(row.b365_over25) : undefined,
      b365Under25: row.b365_under25 !== null ? Number(row.b365_under25) : undefined,
      restDaysHome: row.rest_days_home !== null ? Number(row.rest_days_home) : 7,
      restDaysAway: row.rest_days_away !== null ? Number(row.rest_days_away) : 7,
    };
  }

  /**
   * Persists league standings table into SQLite
   */
  saveLeagueStandings(standings: LeagueStandingTable): void {
    if (!standings || !standings.leagueCode) return;
    try {
      if (this.db) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO league_standings 
          (league_code, league_name, country, season, tournament_id, standings_json, source, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run([
          standings.leagueCode,
          standings.leagueName,
          standings.country || null,
          standings.season || null,
          standings.tournamentId || null,
          JSON.stringify(standings.table),
          standings.source,
          standings.updatedAt,
        ]);
        stmt.free();
        this.saveToDisk();
      }
    } catch (err) {
      console.warn(`[FootballDB] Failed saving standings for ${standings.leagueCode}:`, err);
    }
  }

  /**
   * Retrieves league standings from SQLite
   */
  getLeagueStandings(leagueCode: string): LeagueStandingTable | null {
    if (!this.db) return null;
    try {
      // Allow searching by either slug or legacy code
      const stmt = this.db.prepare(`SELECT * FROM league_standings WHERE league_code = ? OR league_code = ? LIMIT 1`);
      stmt.bind([leagueCode.toLowerCase(), getCodeForSlug(leagueCode)]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return {
          leagueCode: String(row.league_code),
          leagueName: String(row.league_name),
          country: row.country ? String(row.country) : undefined,
          season: row.season ? String(row.season) : undefined,
          tournamentId: row.tournament_id ? String(row.tournament_id) : undefined,
          updatedAt: String(row.updated_at),
          source: (row.source as any) || 'FLASHSCORE_SCRAPED',
          table: JSON.parse(String(row.standings_json || '[]')),
        };
      }
      stmt.free();
    } catch (err) {
      console.warn(`[FootballDB] Failed reading standings for ${leagueCode}:`, err);
    }
    return null;
  }

  /**
   * Computes standings table from historical matches dataset
   */
  computeLeagueStandings(leagueCode: string, leagueName?: string): LeagueStandingTable {
    const matches = this.getAllHistoricalMatches(1500).filter(
      (m) =>
        m.div.toLowerCase() === leagueCode.toLowerCase() ||
        m.div.toLowerCase() === getCodeForSlug(leagueCode).toLowerCase()
    );

    const teamStats = new Map<string, {
      played: number;
      won: number;
      drawn: number;
      lost: number;
      goalsFor: number;
      goalsAgainst: number;
      points: number;
      form: ('W' | 'D' | 'L')[];
    }>();

    // Sort chronologically to track form correctly
    const sorted = [...matches].sort((a, b) => a.matchDate.localeCompare(b.matchDate));

    for (const m of sorted) {
      if (!teamStats.has(m.homeTeam)) {
        teamStats.set(m.homeTeam, { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: [] });
      }
      if (!teamStats.has(m.awayTeam)) {
        teamStats.set(m.awayTeam, { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: [] });
      }

      const h = teamStats.get(m.homeTeam)!;
      const a = teamStats.get(m.awayTeam)!;

      h.played++;
      a.played++;
      h.goalsFor += m.fthg;
      h.goalsAgainst += m.ftag;
      a.goalsFor += m.ftag;
      a.goalsAgainst += m.fthg;

      if (m.fthg > m.ftag) {
        h.won++;
        h.points += 3;
        h.form.push('W');
        a.lost++;
        a.form.push('L');
      } else if (m.fthg < m.ftag) {
        a.won++;
        a.points += 3;
        a.form.push('W');
        h.lost++;
        h.form.push('L');
      } else {
        h.drawn++;
        h.points += 1;
        h.form.push('D');
        a.drawn++;
        a.points += 1;
        a.form.push('D');
      }
    }

    // Convert to entries and rank
    const entries: LeagueStandingEntry[] = Array.from(teamStats.entries()).map(([teamName, s]) => {
      const gd = s.goalsFor - s.goalsAgainst;
      const recentForm = s.form.slice(-5) as ('W' | 'D' | 'L')[];
      return {
        rank: 1,
        teamName,
        played: s.played,
        won: s.won,
        drawn: s.drawn,
        lost: s.lost,
        goalsFor: s.goalsFor,
        goalsAgainst: s.goalsAgainst,
        goalDifference: gd,
        points: s.points,
        form: recentForm,
      };
    });

    // Sort by points DESC, goalDifference DESC, goalsFor DESC, teamName ASC
    entries.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.teamName.localeCompare(b.teamName);
    });

    // Assign rank 1..N
    entries.forEach((entry, idx) => {
      entry.rank = idx + 1;
    });

    const result: LeagueStandingTable = {
      leagueCode,
      leagueName: leagueName || leagueCode,
      season: getCurrentSeason(),
      updatedAt: new Date().toISOString(),
      source: 'FLASHSCORE_SCRAPED',
      table: entries,
    };

    if (entries.length > 0) {
      this.saveLeagueStandings(result);
    }

    return result;
  }

  saveRawFeed(fixtureId: string, feedPath: string, rawText: string): void {
    if (!this.db || !fixtureId || !rawText) return;
    try {
      this.db.run(`
        INSERT OR IGNORE INTO raw_feed_data (fixture_id, feed_path, raw_text, scraped_at)
        VALUES (?, ?, ?, ?)
      `, [fixtureId, feedPath, rawText, new Date().toISOString()]);
      this.saveToDisk();
      loggerService.addLog({
        level: 'SUCCESS',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Saved raw feed for fixture ${fixtureId}`,
      });
    } catch (err: any) {
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Failed to save raw feed: ${err?.message}`,
      });
    }
  }

  saveMatchStatistics(matchId: string, stats: Array<{ category: string; homeValue?: any; awayValue?: any }>): void {
    if (!this.db || !matchId || !stats || stats.length === 0) return;
    try {
      this.db.run('BEGIN TRANSACTION;');
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO match_statistics_relational (match_id, category, home_value, away_value)
        VALUES (?, ?, ?, ?)
      `);
      for (const st of stats) {
        stmt.run([matchId, st.category, String(st.homeValue ?? ''), String(st.awayValue ?? '')]);
      }
      stmt.free();
      this.db.run('COMMIT;');
      this.saveToDisk();
      loggerService.addLog({
        level: 'SUCCESS',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Saved ${stats.length} relational match statistics items for match ${matchId}`,
      });
    } catch (err: any) {
      this.db.run('ROLLBACK;');
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Failed to save match statistics: ${err?.message}`,
      });
    }
  }

  getRawFeed(identifier: string): { feedPath: string; rawText: string } | null {
    if (!this.db || !identifier) return null;
    const cleanId = identifier.replace(/^fs_/, '').trim();
    try {
      const stmt = this.db.prepare(`
        SELECT feed_path, raw_text FROM raw_feed_data
        WHERE fixture_id = ? OR fixture_id = ? OR feed_path = ? OR feed_path LIKE ?
        LIMIT 1
      `);
      stmt.bind([identifier, cleanId, identifier, `%${cleanId}%`]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return { feedPath: String(row.feed_path), rawText: String(row.raw_text) };
      }
      stmt.free();
    } catch (err: any) {
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Failed to retrieve raw feed: ${err?.message}`,
      });
    }
    return null;
  }

  getRawFeedsCount(): number {
    if (!this.db) return 0;
    try {
      const res = this.db.exec('SELECT COUNT(*) as count FROM raw_feed_data');
      if (res && res[0] && res[0].values && res[0].values[0]) {
        return Number(res[0].values[0][0]) || 0;
      }
    } catch {
      return 0;
    }
    return 0;
  }

  saveH2HRecord(fixtureId: string, h2h: HeadToHeadMeasurement): void {
    if (!this.db || !fixtureId || !h2h) return;
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO h2h_records_relational (fixture_id, home_team, away_team, matches_count, home_wins, draws, away_wins, h2h_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run([
        fixtureId,
        h2h.homeClub || 'Home',
        h2h.awayClub || 'Away',
        h2h.matchesCount || 0,
        h2h.homeWins || 0,
        h2h.draws || 0,
        h2h.awayWins || 0,
        JSON.stringify(h2h),
      ]);
      stmt.free();
      this.saveToDisk();
      loggerService.addLog({
        level: 'SUCCESS',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Saved relational H2H record for fixture ${fixtureId} (${h2h.homeClub} vs ${h2h.awayClub})`,
      });
    } catch (err: any) {
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Failed to save H2H record: ${err?.message}`,
      });
    }
  }
}

export const db = new FootballDB();
