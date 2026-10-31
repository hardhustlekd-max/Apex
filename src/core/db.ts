import fs from 'fs';
import path from 'path';
import { HistoricalMatch, Fixture, EngineSettings, HeadToHeadMeasurement } from './types.js';
import { getPossibleDateStrs, normalizeDateStr } from './dateUtils.js';
import { loggerService } from '../services/loggerService.js';
import { footballTurso, safeTursoBatch } from './tursoClient.js';

function cleanupLocalDiskFiles(): void {
  const filesToDelete = [
    path.resolve(process.cwd(), 'data', 'football.sqlite'),
    path.resolve(process.cwd(), 'data', 'predictions.sqlite'),
    path.resolve('/tmp', 'data', 'football.sqlite'),
    path.resolve('/tmp', 'data', 'predictions.sqlite'),
  ];
  for (const fileP of filesToDelete) {
    try {
      if (fs.existsSync(fileP)) {
        fs.unlinkSync(fileP);
        console.log(`[FootballDB] Removed local SQLite file: ${fileP}`);
      }
    } catch {
      // Ignore if file doesn't exist or directory is read-only
    }
  }
}

export class FootballDB {
  private isInitialized = false;
  private fallbackHistoricalMatches: HistoricalMatch[] = [];
  private fallbackUpcomingFixtures: Fixture[] = [];
  private rawFeedsMemory: Map<string, string> = new Map();
  private measurementsMemory: Map<string, HeadToHeadMeasurement> = new Map();
  private standingsMemory: Map<string, any> = new Map();
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
    if (this.isInitialized) return;

    // Remove local disk SQLite files
    cleanupLocalDiskFiles();

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
          fthg, ftag, ftr, hthg, htag, htr, hs, as_shots, hst, ast,
          b365_h, b365_d, b365_a, b365_over25, b365_under25,
          rest_days_home, rest_days_away
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    this.fallbackUpcomingFixtures = unique;
    if (unique.length === 0) return;

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
    return this.fallbackUpcomingFixtures.length;
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
    let filtered = [...this.fallbackUpcomingFixtures];
    let leagueFilter: string | undefined;
    if (typeof filterOrLeague === 'object' && filterOrLeague !== null) {
      leagueFilter = filterOrLeague.league;
    } else {
      leagueFilter = typeof filterOrLeague === 'string' ? filterOrLeague : undefined;
    }
    if (leagueFilter && leagueFilter !== 'ALL') {
      filtered = filtered.filter((f) => (f.league || '').toUpperCase() === leagueFilter!.toUpperCase());
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
    return all.slice(0, limit);
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

  saveRawFeedData(fixtureId: string, feedPath: string, rawText: string): void {
    if (!rawText) return;
    if (fixtureId) {
      this.rawFeedsMemory.set(fixtureId, rawText);
      const cleanId = fixtureId.replace(/^fs_/, '').trim();
      this.rawFeedsMemory.set(cleanId, rawText);
      this.rawFeedsMemory.set(`fs_${cleanId}`, rawText);
    }
    if (feedPath) {
      this.rawFeedsMemory.set(feedPath, rawText);
    }

    if (footballTurso && fixtureId) {
      const cleanId = fixtureId.replace(/^fs_/, '').trim();
      footballTurso.execute({
        sql: `INSERT OR REPLACE INTO raw_feed_data (fixture_id, feed_path, raw_text, scraped_at) VALUES (?, ?, ?, ?)`,
        args: [cleanId, feedPath || fixtureId, rawText, new Date().toISOString()],
      }).catch(() => {});
    }
  }

  saveRawFeed(fixtureId: string, feedPath: string, rawText: string): void {
    this.saveRawFeedData(fixtureId, feedPath, rawText);
  }

  getRawFeed(fixtureId: string): { rawText: string } | null {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').trim();

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

  getRawFeedsCount(): number {
    return this.rawFeedsMemory.size;
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
