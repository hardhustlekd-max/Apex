import { HistoricalMatch, Fixture, EngineSettings, HeadToHeadMeasurement, ScrapedMarketOdds } from './types.js';
import { getPossibleDateStrs, normalizeDateStr, resolveDateFilter } from './dateUtils.js';
import { loggerService } from '../services/loggerService.js';
import {
  sqliteDb,
  initSqliteSchema,
  compressString,
  decompressBuffer,
  getSqliteDbStats,
  checkpointSqliteWal,
} from './sqliteClient.js';

export type DbClearOrigin = 'fullsync' | 'update_predictions';

function safeJsonParse<T>(raw: any, fallback: T): T {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

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

      // Remove any stale Russian/Cyrillic rows previously ingested from /46/ mirrors
      this.purgeCyrillicFixtures();

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

  async clearAllData(clearRaw = true, origin?: DbClearOrigin): Promise<void> {
    if (origin !== 'fullsync') {
      console.warn(`[FootballDB] Blocked unauthorized clearAllData call (origin=${String(origin || 'none')}). Only fullsync may empty all tables.`);
      loggerService.addLog({
        level: 'WARN',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Blocked unauthorized clearAllData attempt (origin=${String(origin || 'none')})`,
      });
      return;
    }

    try {
      const runDelete = sqliteDb.transaction(() => {
        sqliteDb.exec('DELETE FROM historical_matches;');
        sqliteDb.exec('DELETE FROM upcoming_fixtures;');
        sqliteDb.exec('DELETE FROM flashscore_scraped_matches;');
        sqliteDb.exec('DELETE FROM predictions;');
        sqliteDb.exec('DELETE FROM prediction_measurements_cache;');
        sqliteDb.exec('DELETE FROM match_odds_cache;');
        sqliteDb.exec('DELETE FROM league_standings;');
        if (clearRaw) {
          sqliteDb.exec('DELETE FROM raw_feed_data;');
        }
      });
      runDelete();
      checkpointSqliteWal('TRUNCATE');

      loggerService.addLog({
        level: 'SUCCESS',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Database tables ${clearRaw ? 'and compressed raw feeds ' : ''}cleared from SQLite (origin: ${origin})`,
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

  clearDatabase(clearRaw = false, origin?: DbClearOrigin): void {
    void this.clearAllData(clearRaw, origin);
  }

  insertHistoricalMatches(matches: HistoricalMatch[]): number {
    if (matches.length === 0) return 0;

    try {
      const insertStmt = sqliteDb.prepare(`
        INSERT INTO historical_matches (
          id, div, season, match_date, home_team, away_team,
          fthg, ftag, ftr, hs, as_shots, hst, ast
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          div = COALESCE(NULLIF(excluded.div, ''), historical_matches.div),
          season = COALESCE(NULLIF(excluded.season, ''), historical_matches.season),
          match_date = COALESCE(NULLIF(excluded.match_date, ''), historical_matches.match_date),
          home_team = excluded.home_team,
          away_team = excluded.away_team,
          fthg = excluded.fthg,
          ftag = excluded.ftag,
          ftr = excluded.ftr,
          hs = COALESCE(excluded.hs, historical_matches.hs),
          as_shots = COALESCE(excluded.as_shots, historical_matches.as_shots),
          hst = COALESCE(excluded.hst, historical_matches.hst),
          ast = COALESCE(excluded.ast, historical_matches.ast)
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
      if (matches.length >= 20) {
        checkpointSqliteWal('PASSIVE');
      }
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
        INSERT INTO upcoming_fixtures (
          id, provider_id, league, league_name, match_date, kick_off_time,
          home_team, away_team, home_badge, away_badge, stage,
          rest_days_home, rest_days_away,
          status, score_json,
          prediction_json, markets_json, best_value_market_json,
          home_stats_json, away_stats_json, measurements_json, h2h_matches_json,
          information_json, statistics_json, market_odds_json,
          feed_path, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          provider_id = excluded.provider_id,
          league = COALESCE(NULLIF(excluded.league, ''), upcoming_fixtures.league),
          league_name = COALESCE(NULLIF(excluded.league_name, ''), upcoming_fixtures.league_name),
          match_date = excluded.match_date,
          kick_off_time = excluded.kick_off_time,
          home_team = excluded.home_team,
          away_team = excluded.away_team,
          home_badge = COALESCE(excluded.home_badge, upcoming_fixtures.home_badge),
          away_badge = COALESCE(excluded.away_badge, upcoming_fixtures.away_badge),
          stage = COALESCE(excluded.stage, upcoming_fixtures.stage),
          rest_days_home = COALESCE(excluded.rest_days_home, upcoming_fixtures.rest_days_home),
          rest_days_away = COALESCE(excluded.rest_days_away, upcoming_fixtures.rest_days_away),
          status = excluded.status,
          score_json = COALESCE(excluded.score_json, upcoming_fixtures.score_json),
          prediction_json = COALESCE(excluded.prediction_json, upcoming_fixtures.prediction_json),
          markets_json = COALESCE(excluded.markets_json, upcoming_fixtures.markets_json),
          best_value_market_json = COALESCE(excluded.best_value_market_json, upcoming_fixtures.best_value_market_json),
          home_stats_json = COALESCE(excluded.home_stats_json, upcoming_fixtures.home_stats_json),
          away_stats_json = COALESCE(excluded.away_stats_json, upcoming_fixtures.away_stats_json),
          measurements_json = COALESCE(excluded.measurements_json, upcoming_fixtures.measurements_json),
          h2h_matches_json = COALESCE(excluded.h2h_matches_json, upcoming_fixtures.h2h_matches_json),
          information_json = CASE
            WHEN excluded.information_json IS NOT NULL AND excluded.information_json != '[]'
            THEN excluded.information_json
            ELSE upcoming_fixtures.information_json
          END,
          statistics_json = CASE
            WHEN excluded.statistics_json IS NOT NULL AND excluded.statistics_json != '[]'
            THEN excluded.statistics_json
            ELSE upcoming_fixtures.statistics_json
          END,
          market_odds_json = COALESCE(excluded.market_odds_json, upcoming_fixtures.market_odds_json),
          feed_path = COALESCE(excluded.feed_path, upcoming_fixtures.feed_path),
          updated_at = excluded.updated_at
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
            f.mostLikelyOutcome ? JSON.stringify(f.mostLikelyOutcome) : null,
            f.homeStats ? JSON.stringify(f.homeStats) : null,
            f.awayStats ? JSON.stringify(f.awayStats) : null,
            f.measurements ? JSON.stringify(f.measurements) : null,
            f.h2hMatches ? JSON.stringify(f.h2hMatches) : null,
            f.information ? JSON.stringify(f.information) : null,
            f.statistics ? JSON.stringify(f.statistics) : null,
            f.marketOdds ? JSON.stringify(f.marketOdds) : null,
            (f as any).feed_path || null,
            now
          );
        }
      });

      insertMany(unique);
      if (unique.length >= 20) {
        checkpointSqliteWal('PASSIVE');
      }
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

  updateUpcomingFixtureStatuses(
    updates: Array<{ id: string; status: string; kickOffTime?: string; score?: { home: number; away: number } }>
  ): void {
    if (!updates || updates.length === 0) return;
    try {
      const stmt = sqliteDb.prepare(`
        UPDATE upcoming_fixtures
        SET status = ?,
            kick_off_time = COALESCE(?, kick_off_time),
            score_json = COALESCE(?, score_json),
            updated_at = ?
        WHERE id IN (?, ?)
      `);
      const now = new Date().toISOString();
      const applyUpdates = sqliteDb.transaction((items: typeof updates) => {
        for (const u of items) {
          const cleanId = u.id.replace(/^fs_/, '');
          stmt.run(
            u.status,
            u.kickOffTime || null,
            u.score ? JSON.stringify(u.score) : null,
            now,
            u.id,
            `fs_${cleanId}`
          );
        }
      });
      applyUpdates(updates);
    } catch (err: any) {
      console.warn('[FootballDB] Notice updating upcoming fixture statuses:', err?.message);
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

  getUpcomingDateCounts(dates: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const d of dates) {
      counts[d] = 0;
    }
    if (dates.length === 0) return counts;
    try {
      const placeholders = dates.map(() => '?').join(', ');
      const rows = sqliteDb
        .prepare(
          `SELECT match_date, COUNT(*) as count FROM upcoming_fixtures WHERE status NOT IN ('FINISHED', 'CANCELLED', 'POSTPONED') AND match_date IN (${placeholders}) GROUP BY match_date`
        )
        .all(...dates) as any[];
      for (const r of rows) {
        counts[String(r.match_date)] = Number(r.count) || 0;
      }
      return counts;
    } catch (err: any) {
      console.error('[FootballDB] Error getting upcoming date counts:', err?.message);
      return counts;
    }
  }

  hasCyrillicUpcomingData(): boolean {
    try {
      const row = sqliteDb
        .prepare(
          "SELECT 1 as found FROM upcoming_fixtures WHERE league_name GLOB '*[А-Яа-яЁё]*' OR stage GLOB '*[А-Яа-яЁё]*' OR home_team GLOB '*[А-Яа-яЁё]*' OR away_team GLOB '*[А-Яа-яЁё]*' LIMIT 1"
        )
        .get() as any;
      return Boolean(row?.found);
    } catch {
      return false;
    }
  }

  purgeCyrillicFixtures(): number {
    try {
      let removed = 0;
      const runClean = sqliteDb.transaction(() => {
        const res1 = sqliteDb
          .prepare(
            "DELETE FROM upcoming_fixtures WHERE league_name GLOB '*[А-Яа-яЁё]*' OR stage GLOB '*[А-Яа-яЁё]*' OR home_team GLOB '*[А-Яа-яЁё]*' OR away_team GLOB '*[А-Яа-яЁё]*'"
          )
          .run();
        const res2 = sqliteDb
          .prepare(
            "DELETE FROM flashscore_scraped_matches WHERE league_name GLOB '*[А-Яа-яЁё]*' OR country GLOB '*[А-Яа-яЁё]*' OR stage GLOB '*[А-Яа-яЁё]*' OR home_name GLOB '*[А-Яа-яЁё]*' OR away_name GLOB '*[А-Яа-яЁё]*'"
          )
          .run();
        const res3 = sqliteDb
          .prepare(
            "DELETE FROM predictions WHERE league_name GLOB '*[А-Яа-яЁё]*' OR home_team GLOB '*[А-Яа-яЁё]*' OR away_team GLOB '*[А-Яа-яЁё]*'"
          )
          .run();
        removed = (res1.changes || 0) + (res2.changes || 0) + (res3.changes || 0);

        const rawRows = sqliteDb.prepare('SELECT feed_path, compressed_data FROM raw_feed_data').all() as any[];
        const delRaw = sqliteDb.prepare('DELETE FROM raw_feed_data WHERE feed_path = ?');
        for (const r of rawRows) {
          if (r.compressed_data) {
            const text = decompressBuffer(r.compressed_data);
            if (/[\u0400-\u04FF]/.test(text)) {
              delRaw.run(r.feed_path);
              removed++;
            }
          }
        }
      });
      runClean();
      if (removed > 0) {
        loggerService.addLog({
          level: 'INFO',
          category: 'DATABASE',
          source: 'FootballDB',
          message: `Purged ${removed} Russian/Cyrillic-encoded cached records so English feeds reload cleanly`,
        });
      }
      return removed;
    } catch (err: any) {
      console.error('[FootballDB] Error purging Cyrillic fixtures:', err?.message);
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
          score: safeJsonParse(row.score_json, undefined),
          prediction: safeJsonParse(row.prediction_json, undefined),
          markets: safeJsonParse(row.markets_json, undefined),
          mostLikelyOutcome: safeJsonParse(row.best_value_market_json, undefined),
          homeStats: safeJsonParse(row.home_stats_json, undefined),
          awayStats: safeJsonParse(row.away_stats_json, undefined),
          measurements: safeJsonParse(row.measurements_json, undefined),
          h2hMatches: safeJsonParse(row.h2h_matches_json, undefined),
          information: safeJsonParse(row.information_json, undefined),
          statistics: safeJsonParse(row.statistics_json, undefined),
          marketOdds: safeJsonParse(row.market_odds_json, undefined),
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
        const resolved = resolveDateFilter(dateFilter);
        if (resolved.kind === 'SINGLE') {
          query += " AND match_date = ?";
          params.push(resolved.targetDate);
        } else if (resolved.kind === 'RANGE') {
          query += " AND match_date >= ? AND match_date <= ?";
          params.push(resolved.startDate, resolved.endDate);
        }
      }

      query += " ORDER BY match_date ASC, kick_off_time ASC LIMIT 20000";

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
        score: safeJsonParse(row.score_json, undefined),
        prediction: safeJsonParse(row.prediction_json, undefined),
        markets: safeJsonParse(row.markets_json, undefined),
        mostLikelyOutcome: safeJsonParse(row.best_value_market_json, undefined),
        homeStats: safeJsonParse(row.home_stats_json, undefined),
        awayStats: safeJsonParse(row.away_stats_json, undefined),
        measurements: safeJsonParse(row.measurements_json, undefined),
        h2hMatches: safeJsonParse(row.h2h_matches_json, undefined),
        information: safeJsonParse(row.information_json, undefined),
        statistics: safeJsonParse(row.statistics_json, undefined),
        marketOdds: safeJsonParse(row.market_odds_json, undefined),
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

  clearHistoricalData(origin?: DbClearOrigin): void {
    if (origin !== 'fullsync') {
      console.warn(`[FootballDB] Blocked unauthorized clearHistoricalData call (origin=${String(origin || 'none')}).`);
      return;
    }
    try {
      sqliteDb.exec('DELETE FROM historical_matches;');
      checkpointSqliteWal('PASSIVE');
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
        INSERT INTO flashscore_scraped_matches (
          match_id, stage, status, match_date, country, league_name,
          home_name, home_image, away_name, away_image,
          home_score, away_score, regulation_time, penalties,
          information_json, statistics_json, scraped_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(match_id) DO UPDATE SET
          stage = COALESCE(excluded.stage, flashscore_scraped_matches.stage),
          status = excluded.status,
          match_date = COALESCE(NULLIF(excluded.match_date, ''), flashscore_scraped_matches.match_date),
          country = COALESCE(excluded.country, flashscore_scraped_matches.country),
          league_name = COALESCE(excluded.league_name, flashscore_scraped_matches.league_name),
          home_name = excluded.home_name,
          home_image = COALESCE(excluded.home_image, flashscore_scraped_matches.home_image),
          away_name = excluded.away_name,
          away_image = COALESCE(excluded.away_image, flashscore_scraped_matches.away_image),
          home_score = COALESCE(excluded.home_score, flashscore_scraped_matches.home_score),
          away_score = COALESCE(excluded.away_score, flashscore_scraped_matches.away_score),
          regulation_time = COALESCE(excluded.regulation_time, flashscore_scraped_matches.regulation_time),
          penalties = COALESCE(excluded.penalties, flashscore_scraped_matches.penalties),
          information_json = CASE
            WHEN excluded.information_json IS NOT NULL AND excluded.information_json != '[]'
            THEN excluded.information_json
            ELSE flashscore_scraped_matches.information_json
          END,
          statistics_json = CASE
            WHEN excluded.statistics_json IS NOT NULL AND excluded.statistics_json != '[]'
            THEN excluded.statistics_json
            ELSE flashscore_scraped_matches.statistics_json
          END,
          scraped_at = excluded.scraped_at
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
            (m.result?.home !== undefined && m.result?.home !== null && m.result?.home !== '') ? parseInt(String(m.result.home), 10) : null,
            (m.result?.away !== undefined && m.result?.away !== null && m.result?.away !== '') ? parseInt(String(m.result.away), 10) : null,
            m.result?.regulationTime || null,
            m.result?.penalties || null,
            m.information ? JSON.stringify(m.information) : null,
            m.statistics ? JSON.stringify(m.statistics) : null,
            now
          );
        }
      });
      insertMany(matches);
      if (matches.length >= 20) {
        checkpointSqliteWal('PASSIVE');
      }
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
    const versioned: HeadToHeadMeasurement = {
      ...h2h,
      parserVersion: h2h.parserVersion ?? 2,
    };

    try {
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO prediction_measurements_cache (fixture_id, h2h_json, calculated_at)
        VALUES (?, ?, ?)
      `).run(cleanId, JSON.stringify(versioned), new Date().toISOString());
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
        // Invalidate legacy cached entries parsed before KU/KT & KA÷ subtab fixes
        if (!parsed || (parsed.parserVersion ?? 0) < 2) {
          return null;
        }
        // Only return if it contains actual populated data
        if (
          parsed.matchesCount > 0 ||
          (parsed.homeRecentMatches && parsed.homeRecentMatches.length > 0) ||
          (parsed.awayRecentMatches && parsed.awayRecentMatches.length > 0) ||
          (parsed.recentH2H && parsed.recentH2H.length > 0)
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
      const rows = sqliteDb.prepare("SELECT fixture_id, h2h_json FROM prediction_measurements_cache LIMIT 20000").all() as any[];
      for (const row of rows) {
        try {
          const parsed = JSON.parse(row.h2h_json) as HeadToHeadMeasurement;
          if (parsed && (parsed.parserVersion ?? 0) >= 2) {
            measurements.set(row.fixture_id, parsed);
          }
        } catch {}
      }
    } catch (err: any) {
      console.error('[FootballDB] Error getting all prediction measurements:', err?.message);
    }
    return measurements;
  }

  saveMatchOddsCache(fixtureId: string, odds: ScrapedMarketOdds): void {
    if (!fixtureId || !odds) return;
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').trim();
    if (!cleanId) return;
    const now = new Date().toISOString();
    const serialized = JSON.stringify(odds);

    try {
      sqliteDb.prepare(`
        INSERT INTO match_odds_cache (fixture_id, odds_json, fetched_at)
        VALUES (?, ?, ?)
        ON CONFLICT(fixture_id) DO UPDATE SET
          odds_json = excluded.odds_json,
          fetched_at = excluded.fetched_at
      `).run(cleanId, serialized, now);

      sqliteDb.prepare(`
        UPDATE upcoming_fixtures
        SET market_odds_json = ?, updated_at = ?
        WHERE id = ? OR id = ?
      `).run(serialized, now, cleanId, `fs_${cleanId}`);
    } catch (err: any) {
      console.error('[FootballDB] Error saving match odds cache:', err?.message);
    }
  }

  saveMatchOddsBatch(items: Array<{ fixtureId: string; odds: ScrapedMarketOdds }>): void {
    if (!items || items.length === 0) return;
    const now = new Date().toISOString();
    try {
      const cacheStmt = sqliteDb.prepare(`
        INSERT INTO match_odds_cache (fixture_id, odds_json, fetched_at)
        VALUES (?, ?, ?)
        ON CONFLICT(fixture_id) DO UPDATE SET
          odds_json = excluded.odds_json,
          fetched_at = excluded.fetched_at
      `);
      const upStmt = sqliteDb.prepare(`
        UPDATE upcoming_fixtures
        SET market_odds_json = ?, updated_at = ?
        WHERE id = ? OR id = ?
      `);

      const saveTx = sqliteDb.transaction((entries: Array<{ fixtureId: string; odds: ScrapedMarketOdds }>) => {
        for (const item of entries) {
          const cleanId = item.fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').trim();
          if (!cleanId || !item.odds) continue;
          const serialized = JSON.stringify(item.odds);
          cacheStmt.run(cleanId, serialized, now);
          upStmt.run(serialized, now, cleanId, `fs_${cleanId}`);
        }
      });
      saveTx(items);
      if (items.length >= 10) {
        checkpointSqliteWal('PASSIVE');
      }
    } catch (err: any) {
      console.error('[FootballDB] Error batch saving match odds cache:', err?.message);
    }
  }

  getMatchOddsCache(fixtureId: string): ScrapedMarketOdds | null {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').trim();
    if (!cleanId) return null;

    try {
      const row = sqliteDb.prepare(
        "SELECT odds_json FROM match_odds_cache WHERE fixture_id = ? OR fixture_id = ?"
      ).get(cleanId, fixtureId) as any;
      if (row && row.odds_json) {
        return safeJsonParse<ScrapedMarketOdds | null>(row.odds_json, null);
      }
    } catch (err: any) {
      console.error('[FootballDB] Error getting match odds cache:', err?.message);
    }
    return null;
  }

  getAllMatchOddsCache(): Map<string, ScrapedMarketOdds> {
    const oddsMap = new Map<string, ScrapedMarketOdds>();
    try {
      const rows = sqliteDb.prepare("SELECT fixture_id, odds_json FROM match_odds_cache LIMIT 20000").all() as any[];
      for (const row of rows) {
        const parsed = safeJsonParse<ScrapedMarketOdds | null>(row.odds_json, null);
        if (parsed) {
          oddsMap.set(String(row.fixture_id), parsed);
        }
      }
    } catch (err: any) {
      console.error('[FootballDB] Error loading all match odds cache:', err?.message);
    }
    return oddsMap;
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

  getRawFeed(fixtureId: string, directOnly = false): { rawText: string } | null {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').replace(/^scraped_/, '').trim();

    try {
      // Check direct feed_path match
      const directRow = sqliteDb.prepare("SELECT compressed_data FROM raw_feed_data WHERE feed_path = ? OR feed_path = ?").get(cleanId, `df_hh_1_${cleanId}`) as any;
      if (directRow && directRow.compressed_data) {
        return { rawText: decompressBuffer(directRow.compressed_data) };
      }

      if (directOnly) {
        return null;
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
    if (!matchId || !statistics || statistics.length === 0) return;
    const cleanId = matchId.replace(/^fs_/, '').trim();
    const statsJson = JSON.stringify(statistics);

    try {
      sqliteDb.prepare(`
        UPDATE flashscore_scraped_matches SET statistics_json = ? WHERE match_id = ?
      `).run(statsJson, cleanId);
      sqliteDb.prepare(`
        UPDATE upcoming_fixtures SET statistics_json = ? WHERE id IN (?, ?)
      `).run(statsJson, cleanId, `fs_${cleanId}`);
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
    const aliasMap: Record<string, string[]> = {
      'e0': ['england_premier_league'],
      'england_premier_league': ['e0'],
      'e1': ['england_championship'],
      'england_championship': ['e1'],
      'sp1': ['spain_la_liga'],
      'spain_la_liga': ['sp1'],
      'd1': ['germany_bundesliga'],
      'germany_bundesliga': ['d1'],
      'i1': ['italy_serie_a'],
      'italy_serie_a': ['i1'],
      'f1': ['france_ligue_1'],
      'france_ligue_1': ['f1'],
      'n1': ['netherlands_eredivisie'],
      'netherlands_eredivisie': ['n1'],
      'p1': ['portugal_primeira_liga'],
      'portugal_primeira_liga': ['p1'],
      'ucl': ['europe_champions_league_league_phase', 'europe_champions_league', 'europe_uefa_champions_league'],
      'europe_champions_league': ['europe_champions_league_league_phase', 'ucl'],
      'europe_champions_league_league_phase': ['europe_champions_league', 'ucl'],
      'uel': ['europe_europa_league_league_phase', 'europe_europa_league', 'europe_uefa_europa_league'],
      'europe_europa_league': ['europe_europa_league_league_phase', 'uel'],
      'europe_europa_league_league_phase': ['europe_europa_league', 'uel'],
    };

    try {
      const clean = String(leagueCode || '').toLowerCase().trim();
      const candidates = [leagueCode, clean, ...(aliasMap[clean] || [])];
      for (const code of candidates) {
        const row = sqliteDb.prepare("SELECT * FROM league_standings WHERE LOWER(league_code) = LOWER(?)").get(code) as any;
        if (row && row.standings_json) {
          const parsedTable = safeJsonParse(row.standings_json, []);
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
      }
    } catch (err: any) {
      console.error('[FootballDB] Error getting league standings:', err?.message);
    }

    return null;
  }
}

export const db = new FootballDB();
