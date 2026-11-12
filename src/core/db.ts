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
  private fallbackSettings: EngineSettings = {
    rollingMatchWindow: 15,
    safeWinThreshold: 0.72,
    homeAdvantageFactor: 1.12,
    formDecayRate: 0.85,
    autoSyncDaily: true,
  };

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      initSqliteSchema();
      
      // Load settings only
      const settingsRow = sqliteDb.prepare("SELECT value FROM app_settings WHERE key = 'engine_settings'").get() as any;
      if (settingsRow && settingsRow.value) {
        try {
          this.fallbackSettings = JSON.parse(settingsRow.value);
        } catch {}
      }

      console.log('[FootballDB] Initialized persistent SQLite database (data/football_engine.db) in WAL mode.');
    } catch (err: any) {
      console.error('[FootballDB] SQLite initialization error:', err?.message);
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `SQLite initialization error: ${err?.message}`,
      });
    }

    this.isInitialized = true;
  }

  async clearAllData(clearRaw = true): Promise<void> {
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

      loggerService.addLog({
        level: 'SUCCESS',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Database tables ${clearRaw ? 'and compressed raw feeds ' : ''}cleared from SQLite`,
      });
    } catch (err: any) {
      console.error('[FootballDB] Error clearing SQLite tables:', err?.message);
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Error clearing SQLite tables: ${err?.message}`,
      });
    }
  }

  clearDatabase(clearRaw = false): void {
    this.clearAllData(clearRaw);
  }

  insertHistoricalMatches(matches: HistoricalMatch[]): number {
    if (matches.length === 0) return 0;

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
      return matches.length;
    } catch (err: any) {
      console.error('[FootballDB] Error inserting historical matches into SQLite:', err?.message);
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Error inserting historical matches: ${err?.message}`,
      });
      return 0;
    }
  }

  async saveUpcomingFixtures(fixtures: Fixture[]): Promise<void> {
    const seen = new Set<string>();
    const unique = fixtures.filter((f) => {
      if (!f.id || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });

    if (unique.length === 0) return;

    try {
      const insertStmt = sqliteDb.prepare(`
        INSERT OR REPLACE INTO upcoming_fixtures (
          id, provider_id, league, league_name, match_date, kick_off_time,
          home_team, away_team, home_badge, away_badge, stage,
          rest_days_home, rest_days_away,
          status, score_json,
          prediction_json, markets_json,
          home_stats_json, away_stats_json, measurements_json, h2h_matches_json,
          information_json, statistics_json,
          feed_path, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?,
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
            f.restDaysHome ?? null,
            f.restDaysAway ?? null,
            f.status || 'SCHEDULED',
            f.score ? JSON.stringify(f.score) : null,
            f.prediction ? JSON.stringify(f.prediction) : null,
            f.markets ? JSON.stringify(f.markets) : null,
            f.homeStats ? JSON.stringify(f.homeStats) : null,
            f.awayStats ? JSON.stringify(f.awayStats) : null,
            f.measurements ? JSON.stringify(f.measurements) : null,
            f.h2hMatches ? JSON.stringify(f.h2hMatches) : null,
            f.information ? JSON.stringify(f.information) : null,
            f.statistics ? JSON.stringify(f.statistics) : null,
            (f as any).feed_path || null,
            now
          );
        }
      });

      insertMany(unique);
    } catch (err: any) {
      console.error('[FootballDB] Error saving upcoming fixtures to SQLite:', err?.message);
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Error saving upcoming fixtures: ${err?.message}`,
      });
    }
  }

  async insertUpcomingFixtures(fixtures: Fixture[]): Promise<number> {
    await this.saveUpcomingFixtures(fixtures);
    return fixtures.length;
  }

  getUpcomingFixturesCount(): number {
    try {
      const row = sqliteDb.prepare("SELECT COUNT(*) as count FROM upcoming_fixtures WHERE status != 'FINISHED'").get() as any;
      return row ? Number(row.count) : 0;
    } catch (err: any) {
      console.error('[FootballDB] Error getting upcoming fixtures count:', err?.message);
      return 0;
    }
  }

  getFixtureById(id: string): Fixture | null {
    if (!id) return null;
    const cleanId = id.replace(/^fs_/, '').replace(/^hist_/, '').replace(/^scraped_/, '');
    
    try {
      // 1. Check upcoming_fixtures
      const row = sqliteDb.prepare("SELECT * FROM upcoming_fixtures WHERE id = ? OR id = ? OR id = ?").get(id, cleanId, `fs_${cleanId}`) as any;
      if (row) {
        return {
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
          restDaysHome: row.rest_days_home !== null ? Number(row.rest_days_home) : undefined,
          restDaysAway: row.rest_days_away !== null ? Number(row.rest_days_away) : undefined,
          status: (row.status as any) || 'SCHEDULED',
          score: row.score_json ? JSON.parse(row.score_json) : undefined,
          prediction: row.prediction_json ? JSON.parse(row.prediction_json) : undefined,
          markets: row.markets_json ? JSON.parse(row.markets_json) : undefined,
          homeStats: row.home_stats_json ? JSON.parse(row.home_stats_json) : undefined,
          awayStats: row.away_stats_json ? JSON.parse(row.away_stats_json) : undefined,
          measurements: row.measurements_json ? JSON.parse(row.measurements_json) : undefined,
          h2hMatches: row.h2h_matches_json ? JSON.parse(row.h2h_matches_json) : undefined,
          information: row.information_json ? JSON.parse(row.information_json) : undefined,
          statistics: row.statistics_json ? JSON.parse(row.statistics_json) : undefined,
        };
      }

      // 2. Check historical_matches table
      const histRow = sqliteDb.prepare(
        "SELECT * FROM historical_matches WHERE id = ? OR id = ? OR id = ? OR id = ? LIMIT 1"
      ).get(id, cleanId, `fs_hist_${cleanId}`, `hist_${cleanId}`) as any;

      if (histRow) {
        const fthg = Number(histRow.fthg) || 0;
        const ftag = Number(histRow.ftag) || 0;
        const homeShots = histRow.hs !== null && histRow.hs !== undefined ? Number(histRow.hs) : undefined;
        const awayShots = histRow.as_shots !== null && histRow.as_shots !== undefined ? Number(histRow.as_shots) : undefined;
        const homeTarget = histRow.hst !== null && histRow.hst !== undefined ? Number(histRow.hst) : undefined;
        const awayTarget = histRow.ast !== null && histRow.ast !== undefined ? Number(histRow.ast) : undefined;

        const stats: Array<{ category: string; homeValue?: any; awayValue?: any }> = [];
        if (homeShots !== undefined && awayShots !== undefined) {
          stats.push({ category: 'Goal Attempts', homeValue: homeShots, awayValue: awayShots });
        }
        if (homeTarget !== undefined && awayTarget !== undefined) {
          stats.push({ category: 'Shots on Goal', homeValue: homeTarget, awayValue: awayTarget });
        }
        stats.push({ category: 'Goals', homeValue: fthg, awayValue: ftag });

        const info = [
          { category: 'Match Date', value: String(histRow.match_date) },
          { category: 'Competition', value: String(histRow.div) },
          { category: 'Status', value: 'Full Time' },
          { category: 'Result', value: `${fthg} - ${ftag}` },
        ];

        return {
          id: String(histRow.id),
          providerId: 'FLASHSCORE',
          league: String(histRow.div),
          leagueName: String(histRow.div),
          matchDate: normalizeDateStr(String(histRow.match_date)),
          kickOffTime: 'FT',
          homeTeam: String(histRow.home_team),
          awayTeam: String(histRow.away_team),
          status: 'FINISHED' as const,
          score: { home: fthg, away: ftag },
          statistics: stats,
          information: info,
        };
      }
    } catch (err: any) {
      console.error('[FootballDB] Error getting fixture by ID:', err?.message);
    }

    return null;
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
    try {
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

      let query = "SELECT * FROM upcoming_fixtures WHERE status != 'FINISHED'";
      const params: any[] = [];

      if (leagueFilter && leagueFilter !== 'ALL') {
        query += " AND UPPER(league) = ?";
        params.push(leagueFilter.toUpperCase());
      }

      if (dateParam) {
        query += " AND match_date = ?";
        params.push(normalizeDateStr(dateParam));
      } else if (dateFilter && dateFilter !== 'ALL') {
        const todayStrs = getPossibleDateStrs(0);
        const tomorrowStrs = getPossibleDateStrs(1);
        const df = dateFilter.toUpperCase();
        
        if (df === 'TODAY') {
          query += ` AND match_date IN (${todayStrs.map(() => '?').join(',')})`;
          params.push(...todayStrs);
        } else if (df === 'TOMORROW') {
          query += ` AND match_date IN (${tomorrowStrs.map(() => '?').join(',')})`;
          params.push(...tomorrowStrs);
        }
      }

      query += " ORDER BY match_date ASC, kick_off_time ASC LIMIT 5000";

      const rows = sqliteDb.prepare(query).all(...params) as any[];
      return rows.map((row) => ({
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
        restDaysHome: row.rest_days_home !== null ? Number(row.rest_days_home) : undefined,
        restDaysAway: row.rest_days_away !== null ? Number(row.rest_days_away) : undefined,
        status: (row.status as any) || 'SCHEDULED',
        score: row.score_json ? JSON.parse(row.score_json) : undefined,
        prediction: row.prediction_json ? JSON.parse(row.prediction_json) : undefined,
        markets: row.markets_json ? JSON.parse(row.markets_json) : undefined,
        homeStats: row.home_stats_json ? JSON.parse(row.home_stats_json) : undefined,
        awayStats: row.away_stats_json ? JSON.parse(row.away_stats_json) : undefined,
        measurements: row.measurements_json ? JSON.parse(row.measurements_json) : undefined,
        h2hMatches: row.h2h_matches_json ? JSON.parse(row.h2h_matches_json) : undefined,
        information: row.information_json ? JSON.parse(row.information_json) : undefined,
        statistics: row.statistics_json ? JSON.parse(row.statistics_json) : undefined,
      }));
    } catch (err: any) {
      console.error('[FootballDB] Error getting upcoming fixtures:', err?.message);
      return [];
    }
  }

  getTeamHistoricalMatches(teamName: string, limit = 20): HistoricalMatch[] {
    if (!teamName) return [];
    try {
      const cleanName = teamName.trim();
      const lowerName = cleanName.toLowerCase();
      let rows = sqliteDb.prepare(`
        SELECT * FROM historical_matches 
        WHERE LOWER(home_team) = ? OR LOWER(away_team) = ? 
        ORDER BY match_date DESC LIMIT ?
      `).all(lowerName, lowerName, limit) as any[];

      // If fewer than 5 matches found, use tokenized core matching
      if (rows.length < 5) {
        const coreToken = cleanName
          .replace(/\b(FC|CF|SC|AC|FK|SK|SV|VfB|U19|U20|U21|U23|Women|W)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (coreToken.length >= 3) {
          const coreLower = coreToken.toLowerCase();
          const likePattern = `%${coreLower}%`;
          const fuzzyRows = sqliteDb.prepare(`
            SELECT * FROM historical_matches 
            WHERE (LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?)
            ORDER BY match_date DESC LIMIT ?
          `).all(likePattern, likePattern, limit) as any[];

          const existingIds = new Set(rows.map((r) => String(r.id)));
          for (const fr of fuzzyRows) {
            if (!existingIds.has(String(fr.id))) {
              rows.push(fr);
              existingIds.add(String(fr.id));
              if (rows.length >= limit) break;
            }
          }
        }
      }

      return rows.map((r) => ({
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
    } catch (err: any) {
      console.error('[FootballDB] Error getting team historical matches:', err?.message);
      return [];
    }
  }

  getLeagueHistoricalMatches(leagueCode: string, limit = 400): HistoricalMatch[] {
    try {
      const rows = sqliteDb.prepare(`
        SELECT * FROM historical_matches 
        WHERE UPPER(div) = ? 
        ORDER BY match_date DESC LIMIT ?
      `).all(leagueCode.toUpperCase(), limit) as any[];

      return rows.map((r) => ({
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
    } catch (err: any) {
      console.error('[FootballDB] Error getting league historical matches:', err?.message);
      return [];
    }
  }

  getAllHistoricalMatches(limit = 5000): HistoricalMatch[] {
    try {
      const rows = sqliteDb.prepare(`
        SELECT * FROM historical_matches 
        ORDER BY match_date DESC LIMIT ?
      `).all(limit) as any[];

      return rows.map((r) => ({
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
    } catch (err: any) {
      console.error('[FootballDB] Error getting all historical matches:', err?.message);
      return [];
    }
  }

  getStatsSummary() {
    const sqliteStats = getSqliteDbStats();
    return {
      totalMatches: sqliteStats.tableCounts['historical_matches'] || 0,
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
    } catch (err: any) {
      console.error('[FootballDB] Error saving settings:', err?.message);
    }
  }

  clearHistoricalData(): void {
    try {
      sqliteDb.exec('DELETE FROM historical_matches;');
    } catch (err: any) {
      console.error('[FootballDB] Error clearing historical data:', err?.message);
    }
  }

  saveTipsCache(
    tipsJson: string,
    headlineSummary: string,
    rawMarkdown: string,
    sourcesJson: string
  ): void {
    const now = new Date().toISOString();
    try {
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO football_tips_cache (
          id, tips_json, headline_summary, raw_markdown, sources_json, updated_at
        ) VALUES ('latest_tips', ?, ?, ?, ?, ?)
      `).run(tipsJson, headlineSummary, rawMarkdown, sourcesJson, now);
    } catch (err: any) {
      console.error('[FootballDB] Error saving tips cache:', err?.message);
    }
  }

  getTipsCache(): {
    tipsJson: string;
    headlineSummary: string;
    rawMarkdown: string;
    sourcesJson: string;
    updatedAt: string;
  } | null {
    try {
      const tipsRow = sqliteDb.prepare("SELECT * FROM football_tips_cache WHERE id = 'latest_tips'").get() as any;
      if (tipsRow) {
        return {
          tipsJson: String(tipsRow.tips_json),
          headlineSummary: String(tipsRow.headline_summary),
          rawMarkdown: String(tipsRow.raw_markdown),
          sourcesJson: String(tipsRow.sources_json),
          updatedAt: String(tipsRow.updated_at),
        };
      }
    } catch (err: any) {
      console.error('[FootballDB] Error getting tips cache:', err?.message);
    }
    return null;
  }

  saveFlashscoreScrapedMatches(matches: Array<any>): void {
    if (matches.length === 0) return;

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
    } catch (err: any) {
      console.error('[FootballDB] Error saving scraped matches:', err?.message);
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Error saving scraped matches: ${err?.message}`,
      });
    }
  }

  getFlashscoreScrapedMatches(limit = 1000): any[] {
    try {
      const rows = sqliteDb.prepare("SELECT * FROM flashscore_scraped_matches ORDER BY scraped_at DESC LIMIT ?").all(limit) as any[];
      return rows.map(row => ({
        matchId: row.match_id,
        stage: row.stage,
        status: row.status,
        date: row.match_date,
        country: row.country,
        leagueName: row.league_name,
        home: { name: row.home_name, image: row.home_image },
        away: { name: row.away_name, image: row.away_image },
        result: {
          home: row.home_score,
          away: row.away_score,
          regulationTime: row.regulation_time,
          penalties: row.penalties
        },
        information: row.information_json ? JSON.parse(row.information_json) : [],
        statistics: row.statistics_json ? JSON.parse(row.statistics_json) : [],
        scraped_at: row.scraped_at
      }));
    } catch (err: any) {
      console.error('[FootballDB] Error getting scraped matches:', err?.message);
      return [];
    }
  }

  savePredictionMeasurement(fixtureId: string, h2h: HeadToHeadMeasurement): void {
    if (!fixtureId) return;
    const cleanId = fixtureId.replace(/^fs_/, '').trim();

    try {
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO prediction_measurements_cache (fixture_id, h2h_json, calculated_at)
        VALUES (?, ?, ?)
      `).run(cleanId, JSON.stringify(h2h), new Date().toISOString());
    } catch (err: any) {
      console.error('[FootballDB] Error saving prediction measurement:', err?.message);
    }
  }

  getPredictionMeasurement(fixtureId: string): HeadToHeadMeasurement | null {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').trim();

    try {
      const row = sqliteDb.prepare(
        "SELECT h2h_json FROM prediction_measurements_cache WHERE fixture_id = ? OR fixture_id = ?"
      ).get(cleanId, fixtureId) as any;
      if (row && row.h2h_json) {
        const parsed = JSON.parse(row.h2h_json) as HeadToHeadMeasurement;
        // Only return if it contains actual populated data
        if (
          parsed &&
          (parsed.matchesCount > 0 ||
            (parsed.homeRecentMatches && parsed.homeRecentMatches.length > 0) ||
            (parsed.recentH2H && parsed.recentH2H.length > 0))
        ) {
          return parsed;
        }
      }
    } catch (err: any) {
      console.error('[FootballDB] Error getting prediction measurement:', err?.message);
    }

    return null;
  }

  getAllPredictionMeasurements(): Map<string, HeadToHeadMeasurement> {
    // This method is primarily used for stats or massive bulk operations
    const measurements = new Map<string, HeadToHeadMeasurement>();
    try {
      const rows = sqliteDb.prepare("SELECT fixture_id, h2h_json FROM prediction_measurements_cache LIMIT 1000").all() as any[];
      for (const row of rows) {
        try {
          measurements.set(row.fixture_id, JSON.parse(row.h2h_json));
        } catch {}
      }
    } catch (err: any) {
      console.error('[FootballDB] Error getting all prediction measurements:', err?.message);
    }
    return measurements;
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

  saveRawFeedData(fixtureId: string, feedPath: string, rawText: string): { hasChanged: boolean } {
    if (!rawText) return { hasChanged: false };
    
    // We don't have memory hash cache anymore, but we can check if it exists in DB
    const canonicalKey = feedPath || fixtureId;
    
    try {
      const compressed = compressString(rawText);
      const matchesCount = (rawText.match(/AA÷/g) || []).length;

      sqliteDb.prepare(`
        INSERT OR REPLACE INTO raw_feed_data (
          feed_path, compressed_data, uncompressed_length, matches_count, scraped_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(canonicalKey, compressed, rawText.length, matchesCount, new Date().toISOString());
      
      return { hasChanged: true };
    } catch (err: any) {
      console.warn('[FootballDB] SQLite compressed raw feed insert error:', err?.message);
      return { hasChanged: false };
    }
  }

  saveRawFeed(fixtureId: string, feedPath: string, rawText: string): { hasChanged: boolean } {
    return this.saveRawFeedData(fixtureId, feedPath, rawText);
  }

  getRawFeed(fixtureId: string): { rawText: string } | null {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').replace(/^scraped_/, '').trim();

    try {
      // Check direct feed_path match
      const directRow = sqliteDb.prepare("SELECT compressed_data FROM raw_feed_data WHERE feed_path = ? OR feed_path = ?").get(cleanId, `df_hh_1_${cleanId}`) as any;
      if (directRow && directRow.compressed_data) {
        return { rawText: decompressBuffer(directRow.compressed_data) };
      }

      // Check daily feeds stored in SQLite
      const dailyRows = sqliteDb.prepare("SELECT feed_path, compressed_data FROM raw_feed_data WHERE feed_path LIKE 'f_1_%'").all() as any[];
      for (const row of dailyRows) {
        if (row.compressed_data) {
          const decompressed = decompressBuffer(row.compressed_data);
          if (decompressed.includes(`AA÷${cleanId}`) || decompressed.includes(`AA÷${fixtureId}`)) {
            return { rawText: decompressed };
          }
        }
      }
    } catch (err: any) {
      console.error('[FootballDB] Error getting raw feed:', err?.message);
    }

    return null;
  }

  async getRawFeedAsync(fixtureId: string): Promise<{ rawText: string } | null> {
    return this.getRawFeed(fixtureId);
  }

  getRawFeedsCount(): number {
    try {
      const row = sqliteDb.prepare("SELECT COUNT(*) as count FROM raw_feed_data").get() as any;
      return row ? Number(row.count) : 0;
    } catch (err: any) {
      console.error('[FootballDB] Error getting raw feeds count:', err?.message);
      return 0;
    }
  }

  saveMatchStatistics(matchId: string, statistics: any[]): void {
    // This was primarily in-memory, but we can save it to scraped matches if we have the ID
    if (!matchId || !statistics || statistics.length === 0) return;
    const cleanId = matchId.replace(/^fs_/, '').trim();
    
    try {
      sqliteDb.prepare(`
        UPDATE flashscore_scraped_matches SET statistics_json = ? WHERE match_id = ?
      `).run(JSON.stringify(statistics), cleanId);
    } catch (err: any) {
      console.error('[FootballDB] Error updating match statistics:', err?.message);
    }
  }

  getMatchStatistics(matchId: string): any[] {
    if (!matchId) return [];
    const cleanId = matchId.replace(/^fs_/, '').trim();
    
    try {
      const row = sqliteDb.prepare("SELECT statistics_json FROM flashscore_scraped_matches WHERE match_id = ?").get(cleanId) as any;
      if (row && row.statistics_json) {
        return JSON.parse(row.statistics_json);
      }
    } catch (err: any) {
      console.error('[FootballDB] Error getting match statistics:', err?.message);
    }
    return [];
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

    try {
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO league_standings (league_code, league_name, country, standings_json, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(leagueCode, name, ctry || null, JSON.stringify(tableData), source, new Date().toISOString());
    } catch (err: any) {
      console.error('[FootballDB] Error saving league standings:', err?.message);
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Error saving league standings for ${leagueCode}: ${err?.message}`,
      });
    }
  }

  getLeagueStandings(leagueCode: string): any {
    try {
      const row = sqliteDb.prepare("SELECT * FROM league_standings WHERE league_code = ?").get(leagueCode) as any;
      if (row && row.standings_json) {
        const parsedTable = JSON.parse(row.standings_json);
        return {
          leagueCode: row.league_code,
          leagueName: row.league_name,
          country: row.country,
          table: parsedTable,
          standings: parsedTable,
          source: row.source,
          updatedAt: row.updated_at,
        };
      }
    } catch (err: any) {
      console.error('[FootballDB] Error getting league standings:', err?.message);
    }

    return null;
  }
}

export const db = new FootballDB();
