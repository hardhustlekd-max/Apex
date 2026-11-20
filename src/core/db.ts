import { HistoricalMatch, Fixture, EngineSettings, HeadToHeadMeasurement, ScrapedMarketOdds, LeagueStandingTable, DEFAULT_ENGINE_SETTINGS, cleanFixtureId, SlipBet, BetSelection } from './types.js';
import { normalizeDateStr, resolveDateFilter } from './dateUtils.js';
import { loggerService } from '../services/loggerService.js';
import { sortFixturesByPopularityInPlace } from './leaguePriority.js';
import { extractTournamentMetadataFromFeed, FlashscoreTournamentMeta, resolveFixtureAlignment, teamMatchScore } from './feedParser.js';
import { getLeagueAliases } from './leagueMapper.js';
import {
  sqliteDb,
  initSqliteSchema,
  compressString,
  decompressBuffer,
  getSqliteDbStats,
  checkpointSqliteWal,
  notifyDbMutation,
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

function mapHistoricalMatchRow(r: any): HistoricalMatch {
  return {
    id: String(r.id),
    div: String(r.div),
    season: String(r.season),
    matchDate: String(r.match_date),
    homeTeam: String(r.home_team),
    awayTeam: String(r.away_team),
    fthg: Number(r.fthg),
    ftag: Number(r.ftag),
    ftr: (r.ftr as 'H' | 'D' | 'A') || 'D',
    hs: r.hs !== null && r.hs !== undefined ? Number(r.hs) : undefined,
    asShots: r.as_shots !== null && r.as_shots !== undefined ? Number(r.as_shots) : undefined,
    hst: r.hst !== null && r.hst !== undefined ? Number(r.hst) : undefined,
    ast: r.ast !== null && r.ast !== undefined ? Number(r.ast) : undefined,
  };
}

function mapScrapedMatchRow(row: any, includeJsonBlobs = true): any {
  return {
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
      penalties: row.penalties,
    },
    information: includeJsonBlobs && row.information_json ? safeJsonParse(row.information_json, []) : [],
    statistics: includeJsonBlobs && row.statistics_json ? safeJsonParse(row.statistics_json, []) : [],
    scraped_at: row.scraped_at,
  };
}

export class FootballDB {
  private isInitialized = false;
  private fallbackSettings: EngineSettings = { ...DEFAULT_ENGINE_SETTINGS };

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

      // Evaluate pending bets against latest SQLite match results on startup
      this.evaluateBets();

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
      notifyDbMutation();

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
    this.saveUpcomingFixturesSync(fixtures);
  }

  saveUpcomingFixturesSync(fixtures: Fixture[]): void {
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
          id, provider_id, league, league_name, match_date, kick_off_time, timestamp,
          home_team, away_team, home_badge, away_badge, stage,
          rest_days_home, rest_days_away,
          status, score_json,
          prediction_json, markets_json, best_value_market_json,
          home_stats_json, away_stats_json, measurements_json, h2h_matches_json,
          information_json, statistics_json, market_odds_json,
          feed_path, league_url, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          provider_id = excluded.provider_id,
          league = COALESCE(NULLIF(excluded.league, ''), upcoming_fixtures.league),
          league_name = COALESCE(NULLIF(excluded.league_name, ''), upcoming_fixtures.league_name),
          match_date = excluded.match_date,
          kick_off_time = excluded.kick_off_time,
          timestamp = COALESCE(excluded.timestamp, upcoming_fixtures.timestamp),
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
          league_url = COALESCE(NULLIF(excluded.league_url, ''), upcoming_fixtures.league_url),
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
            f.timestamp ? Number(f.timestamp) : null,
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
            f.leagueUrl || (f as any).league_url || null,
            now
          );
        }
      });

      insertMany(unique);
      notifyDbMutation();
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

  clearPredictionsOnUpcomingFixtures(fixtureIds: string[]): void {
    if (!fixtureIds || fixtureIds.length === 0) return;
    try {
      const stmt = sqliteDb.prepare(`
        UPDATE upcoming_fixtures
        SET prediction_json = NULL,
            markets_json = NULL,
            best_value_market_json = NULL,
            home_stats_json = NULL,
            away_stats_json = NULL,
            measurements_json = NULL,
            updated_at = ?
        WHERE id = ?
      `);
      const now = new Date().toISOString();
      const clearTx = sqliteDb.transaction((ids: string[]) => {
        for (const id of ids) {
          stmt.run(now, id);
        }
      });
      clearTx(fixtureIds);
      notifyDbMutation();
    } catch (err: any) {
      console.warn('[FootballDB] Notice clearing stale predictions on upcoming_fixtures:', err?.message);
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
      notifyDbMutation();
    } catch (err: any) {
      console.warn('[FootballDB] Notice updating upcoming fixture statuses:', err?.message);
    }
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
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Error purging Cyrillic fixtures: ${err?.message}`,
        details: { stack: err?.stack },
      });
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
          leagueUrl: row.league_url ? String(row.league_url) : undefined,
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
      skipSort?: boolean;
      skipPredictionBlobs?: boolean;
    },
    _dateFilterLegacy?: string
  ): Fixture[] {
    try {
      let leagueFilter: string | undefined;
      let dateFilter: string | undefined;
      let dateParam: string | undefined;
      let rowLimit = 100000;
      let skipSort = false;
      let skipPredictionBlobs = false;

      if (typeof filterOrLeague === 'object' && filterOrLeague !== null) {
        leagueFilter = filterOrLeague.league;
        dateFilter = filterOrLeague.dateFilter;
        dateParam = filterOrLeague.date;
        if (filterOrLeague.limit && filterOrLeague.limit > 0) rowLimit = filterOrLeague.limit;
        skipSort = Boolean(filterOrLeague.skipSort);
        skipPredictionBlobs = Boolean(filterOrLeague.skipPredictionBlobs);
      } else {
        leagueFilter = typeof filterOrLeague === 'string' ? filterOrLeague : undefined;
        dateFilter = _dateFilterLegacy;
      }

      const selectCols = skipPredictionBlobs
        ? `id, provider_id, league, league_name, league_url, match_date, kick_off_time, timestamp,
           home_team, away_team, home_badge, away_badge, stage,
           rest_days_home, rest_days_away, status, score_json,
           (prediction_json IS NOT NULL) AS has_prediction,
           h2h_matches_json, information_json, statistics_json, market_odds_json`
        : '*';

      let query = `SELECT ${selectCols} FROM upcoming_fixtures WHERE status != 'FINISHED'`;
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

      if (!skipSort) {
        query += " ORDER BY match_date ASC, kick_off_time ASC";
      }
      query += " LIMIT ?";
      params.push(rowLimit);

      const rows = sqliteDb.prepare(query).all(...params) as any[];
      const fixtures: Fixture[] = new Array(rows.length);
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const f: Fixture & { _hasExistingPrediction?: boolean } = {
          id: String(row.id),
          providerId: (row.provider_id as any) || 'FLASHSCORE',
          league: String(row.league || ''),
          leagueName: String(row.league_name || row.league || ''),
          leagueUrl: row.league_url ? String(row.league_url) : undefined,
          matchDate: String(row.match_date || ''),
          kickOffTime: String(row.kick_off_time || ''),
          timestamp: row.timestamp
            ? Number(row.timestamp)
            : (row.match_date && row.kick_off_time && String(row.kick_off_time).includes(':')
                ? Math.floor(new Date(`${row.match_date}T${row.kick_off_time}:00.000Z`).getTime() / 1000)
                : undefined),
          homeTeam: String(row.home_team || ''),
          awayTeam: String(row.away_team || ''),
          homeBadge: row.home_badge ? String(row.home_badge) : undefined,
          awayBadge: row.away_badge ? String(row.away_badge) : undefined,
          stage: row.stage ? String(row.stage) : undefined,
          restDaysHome: row.rest_days_home !== null && row.rest_days_home !== undefined ? Number(row.rest_days_home) : undefined,
          restDaysAway: row.rest_days_away !== null && row.rest_days_away !== undefined ? Number(row.rest_days_away) : undefined,
          status: (row.status as any) || 'SCHEDULED',
          score: row.score_json ? safeJsonParse(row.score_json, undefined) : undefined,
          prediction: skipPredictionBlobs ? undefined : safeJsonParse(row.prediction_json, undefined),
          markets: skipPredictionBlobs ? undefined : safeJsonParse(row.markets_json, undefined),
          mostLikelyOutcome: skipPredictionBlobs ? undefined : safeJsonParse(row.best_value_market_json, undefined),
          homeStats: skipPredictionBlobs ? undefined : safeJsonParse(row.home_stats_json, undefined),
          awayStats: skipPredictionBlobs ? undefined : safeJsonParse(row.away_stats_json, undefined),
          measurements: skipPredictionBlobs ? undefined : safeJsonParse(row.measurements_json, undefined),
          h2hMatches: row.h2h_matches_json ? safeJsonParse(row.h2h_matches_json, undefined) : undefined,
          information: row.information_json ? safeJsonParse(row.information_json, undefined) : undefined,
          statistics: row.statistics_json ? safeJsonParse(row.statistics_json, undefined) : undefined,
          marketOdds: row.market_odds_json ? safeJsonParse(row.market_odds_json, undefined) : undefined,
        };
        if (skipPredictionBlobs && row.has_prediction) {
          f._hasExistingPrediction = true;
        }
        fixtures[i] = f;
      }
      if (!skipSort) {
        sortFixturesByPopularityInPlace(fixtures);
      }
      return fixtures;
    } catch (err: any) {
      console.error('[FootballDB] Error getting upcoming fixtures:', err?.message);
      return [];
    }
  }

  /**
   * Fast, unsorted query tailored for batch prediction recalculation.
   * Avoids parsing stale prediction/markets/stats JSON blobs and skips popularity sorting.
   */
  getUpcomingFixturesForPrediction(): Array<Fixture & { _hasExistingPrediction?: boolean }> {
    return this.getUpcomingFixtures({
      skipSort: true,
      skipPredictionBlobs: true,
      limit: 100000,
    }) as Array<Fixture & { _hasExistingPrediction?: boolean }>;
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

      // If fewer than 5 matches found, use club-affix-stripped token lookup gated strictly by teamMatchScore
      if (rows.length < 5) {
        const coreToken = cleanName
          .replace(/\b(FC|CF|SC|AC|FK|SK|SV|VfB)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (coreToken.length >= 3) {
          const coreLower = coreToken.toLowerCase();
          const likePattern = `%${coreLower}%`;
          const candidateLimit = Math.max(limit * 5, 100);
          const fuzzyRows = sqliteDb.prepare(`
            SELECT * FROM historical_matches 
            WHERE (LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?)
            ORDER BY match_date DESC LIMIT ?
          `).all(likePattern, likePattern, candidateLimit) as any[];

          const existingIds = new Set(rows.map((r) => String(r.id)));
          for (const fr of fuzzyRows) {
            if (existingIds.has(String(fr.id))) continue;
            const homeScore = teamMatchScore(cleanName, fr.home_team);
            const awayScore = teamMatchScore(cleanName, fr.away_team);
            if (homeScore <= 0 && awayScore <= 0) continue;
            rows.push(fr);
            existingIds.add(String(fr.id));
            if (rows.length >= limit) break;
          }
        }
      }

      return rows.map(mapHistoricalMatchRow);
    } catch (err: any) {
      console.error('[FootballDB] Error getting team historical matches:', err?.message);
      return [];
    }
  }

  getHistoricalMatchById(matchId: string): HistoricalMatch | null {
    if (!matchId) return null;
    const cleanId = cleanFixtureId(matchId);
    try {
      const row = sqliteDb
        .prepare(
          'SELECT * FROM historical_matches WHERE id IN (?, ?, ?, ?) LIMIT 1'
        )
        .get(matchId, cleanId, `fs_hist_${cleanId}`, `hist_${cleanId}`) as any;
      return row ? mapHistoricalMatchRow(row) : null;
    } catch (err: any) {
      console.error('[FootballDB] Error getting historical match by ID:', err?.message);
      return null;
    }
  }

  getDirectH2HHistoricalMatches(homeTeam: string, awayTeam: string, limit = 15): HistoricalMatch[] {
    if (!homeTeam || !awayTeam) return [];
    try {
      // Gather candidate matches for homeTeam (handles exact and club-affix variations via getTeamHistoricalMatches)
      const candidates = this.getTeamHistoricalMatches(homeTeam, 200);
      return candidates
        .filter((m) => resolveFixtureAlignment(homeTeam, awayTeam, m.homeTeam, m.awayTeam).matched)
        .sort((a, b) => normalizeDateStr(b.matchDate).localeCompare(normalizeDateStr(a.matchDate)))
        .slice(0, limit);
    } catch (err: any) {
      console.error('[FootballDB] Error getting direct H2H historical matches:', err?.message);
      return [];
    }
  }

  getAllHistoricalMatches(limit = 5000): HistoricalMatch[] {
    try {
      const rows = sqliteDb.prepare(`
        SELECT * FROM historical_matches 
        ORDER BY match_date DESC LIMIT ?
      `).all(limit) as any[];

      return rows.map(mapHistoricalMatchRow);
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
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Error saving settings: ${err?.message}`,
        details: { stack: err?.stack },
      });
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

  getFlashscoreScrapedMatchById(matchId: string, includeJsonBlobs = true): any | null {
    if (!matchId) return null;
    const cleanId = cleanFixtureId(matchId);
    try {
      const cols = includeJsonBlobs
        ? '*'
        : 'match_id, stage, status, match_date, country, league_name, home_name, home_image, away_name, away_image, home_score, away_score, regulation_time, penalties, scraped_at';
      const row = sqliteDb
        .prepare(`SELECT ${cols} FROM flashscore_scraped_matches WHERE match_id IN (?, ?) LIMIT 1`)
        .get(matchId, cleanId) as any;
      return row ? mapScrapedMatchRow(row, includeJsonBlobs) : null;
    } catch (err: any) {
      console.error('[FootballDB] Error getting scraped match by ID:', err?.message);
      return null;
    }
  }

  getFlashscoreScrapedMatches(limit = 1000, options?: { includeJsonBlobs?: boolean }): any[] {
    try {
      const includeJsonBlobs = options?.includeJsonBlobs ?? true;
      const cols = includeJsonBlobs
        ? '*'
        : 'match_id, stage, status, match_date, country, league_name, home_name, home_image, away_name, away_image, home_score, away_score, regulation_time, penalties, scraped_at';
      const rows = sqliteDb.prepare(`SELECT ${cols} FROM flashscore_scraped_matches ORDER BY scraped_at DESC LIMIT ?`).all(limit) as any[];
      return rows.map((row) => mapScrapedMatchRow(row, includeJsonBlobs));
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
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Error saving prediction measurement: ${err?.message}`,
        details: { stack: err?.stack },
      });
    }
  }

  savePredictionMeasurementsBatch(items: Array<{ fixtureId: string; h2h: HeadToHeadMeasurement }>): void {
    if (!items || items.length === 0) return;
    try {
      const stmt = sqliteDb.prepare(`
        INSERT OR REPLACE INTO prediction_measurements_cache (fixture_id, h2h_json, calculated_at)
        VALUES (?, ?, ?)
      `);
      const now = new Date().toISOString();
      const saveTx = sqliteDb.transaction((entries: typeof items) => {
        for (const item of entries) {
          const cleanId = item.fixtureId.replace(/^fs_/, '').trim();
          if (!cleanId) continue;
          const versioned: HeadToHeadMeasurement = {
            ...item.h2h,
            parserVersion: item.h2h.parserVersion ?? 2,
          };
          stmt.run(cleanId, JSON.stringify(versioned), now);
        }
      });
      saveTx(items);
    } catch (err: any) {
      console.error('[FootballDB] Error batch saving prediction measurements:', err?.message);
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
      const rows = sqliteDb.prepare("SELECT fixture_id, h2h_json FROM prediction_measurements_cache LIMIT 100000").all() as any[];
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
      notifyDbMutation();
    } catch (err: any) {
      console.error('[FootballDB] Error saving match odds cache:', err?.message);
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `Error saving match odds cache: ${err?.message}`,
        details: { stack: err?.stack },
      });
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
      notifyDbMutation();
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
      const rows = sqliteDb.prepare("SELECT fixture_id, odds_json FROM match_odds_cache LIMIT 100000").all() as any[];
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
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'FootballDB',
        message: `SQLite compressed raw feed insert error: ${err?.message}`,
        details: { canonicalKey, stack: err?.stack },
      });
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

  getRawFeedPathsSet(): Set<string> {
    const paths = new Set<string>();
    try {
      const rows = sqliteDb.prepare("SELECT feed_path FROM raw_feed_data WHERE feed_path NOT LIKE 'f_1_%'").all() as Array<{ feed_path: string }>;
      for (const r of rows) {
        if (r.feed_path) paths.add(r.feed_path);
      }
    } catch {}
    return paths;
  }

  async getRawFeedAsync(fixtureId: string): Promise<{ rawText: string } | null> {
    return this.getRawFeed(fixtureId);
  }

  /**
   * Extracts Flashscore's authoritative JA (homeParticipantId) and JB (awayParticipantId)
   * from stored raw daily feeds (`f_1_*`) for accurate GraphQL odds alignment.
   */
  getFixtureParticipantIds(matchId: string): { homeParticipantId?: string; awayParticipantId?: string } | null {
    if (!matchId) return null;
    const cleanId = matchId.replace(/^fs_/, '').replace(/^hist_/, '').replace(/^scraped_/, '').trim();
    if (!cleanId) return null;

    try {
      const marker = `AA÷${cleanId}`;
      const dailyRows = sqliteDb.prepare("SELECT compressed_data FROM raw_feed_data WHERE feed_path LIKE 'f_1_%'").all() as any[];
      for (const row of dailyRows) {
        if (!row.compressed_data) continue;
        const decompressed = decompressBuffer(row.compressed_data);
        let searchFrom = 0;
        while (searchFrom < decompressed.length) {
          const idx = decompressed.indexOf(marker, searchFrom);
          if (idx === -1) break;
          const nextChar = decompressed[idx + marker.length];
          if (nextChar === '¬' || nextChar === '~' || nextChar === undefined) {
            const secStart = decompressed.lastIndexOf('~', idx);
            const secEnd = decompressed.indexOf('~', idx);
            const section = decompressed.slice(secStart === -1 ? 0 : secStart + 1, secEnd === -1 ? undefined : secEnd);
            const parts = section.split('¬');
            let homePid: string | undefined;
            let awayPid: string | undefined;
            for (const p of parts) {
              if (p.startsWith('JA÷')) homePid = p.slice(3).trim() || undefined;
              else if (p.startsWith('JB÷')) awayPid = p.slice(3).trim() || undefined;
            }
            if (homePid || awayPid) {
              return { homeParticipantId: homePid, awayParticipantId: awayPid };
            }
          }
          searchFrom = idx + marker.length;
        }
      }
    } catch (err: any) {
      console.error('[FootballDB] Error extracting participant IDs from raw feed:', err?.message);
    }

    return null;
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
    let leagueUrl: string | undefined;
    let season: string | undefined;
    let tableData: any[] = [];
    let groupsData: any[] | undefined;

    if (typeof tableObjOrLeagueCode === 'object' && tableObjOrLeagueCode !== null) {
      leagueCode = tableObjOrLeagueCode.leagueCode || tableObjOrLeagueCode.league_code;
      name = tableObjOrLeagueCode.leagueName || tableObjOrLeagueCode.league_name;
      ctry = tableObjOrLeagueCode.country;
      leagueUrl = tableObjOrLeagueCode.leagueUrl || tableObjOrLeagueCode.league_url;
      season = tableObjOrLeagueCode.season;
      tableData = tableObjOrLeagueCode.table || tableObjOrLeagueCode.standings || [];
      groupsData = Array.isArray(tableObjOrLeagueCode.groups) && tableObjOrLeagueCode.groups.length > 0
        ? tableObjOrLeagueCode.groups
        : undefined;
      if (tableData.length === 0 && groupsData) {
        tableData = groupsData.flatMap((g: any) => (Array.isArray(g.table) ? g.table : []));
      }
    } else {
      leagueCode = String(tableObjOrLeagueCode);
      name = leagueName || leagueCode;
      ctry = country;
      tableData = standings || [];
    }

    if (!leagueCode) return;

    try {
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO league_standings (
          league_code, league_name, country, league_url, season, standings_json, groups_json, source, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        leagueCode,
        name || leagueCode,
        ctry || null,
        leagueUrl || null,
        season || null,
        JSON.stringify(tableData),
        groupsData ? JSON.stringify(groupsData) : null,
        source,
        new Date().toISOString()
      );
      notifyDbMutation();
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

  private mapLeagueStandingsRow(row: any): LeagueStandingTable & { standings?: any[] } {
    const parsedTable = safeJsonParse<any[]>(row.standings_json, []);
    const parsedGroups = row.groups_json ? safeJsonParse<any[]>(row.groups_json, []) : [];
    const groups =
      Array.isArray(parsedGroups) && parsedGroups.length > 0
        ? parsedGroups
        : Array.isArray(parsedTable) && parsedTable.length > 0
        ? [{ name: 'Standings', table: parsedTable }]
        : [];

    return {
      leagueCode: String(row.league_code),
      leagueName: String(row.league_name || row.league_code),
      country: row.country ? String(row.country) : undefined,
      leagueUrl: row.league_url ? String(row.league_url) : undefined,
      season: row.season ? String(row.season) : undefined,
      table: parsedTable,
      standings: parsedTable,
      groups,
      source: (row.source as any) || 'FLASHSCORE_SCRAPED',
      updatedAt: String(row.updated_at || ''),
    };
  }

  getLeagueStandings(leagueCode: string, leagueUrl?: string, leagueName?: string): any {
    const aliasMap: Record<string, string[]> = {
      'e0': ['england_premier_league'],
      'england_premier_league': ['e0'],
      'e1': ['england_championship'],
      'england_championship': ['e1'],
      'sp1': ['spain_la_liga'],
      'spain_la_liga': ['sp1'],
      'd1': ['germany_bundesliga'],
      'germany_bundesliga': ['d1'],
      'd2': ['germany_2_bundesliga'],
      'germany_2_bundesliga': ['d2'],
      'i1': ['italy_serie_a'],
      'italy_serie_a': ['i1'],
      'f1': ['france_ligue_1'],
      'france_ligue_1': ['f1'],
      'n1': ['netherlands_eredivisie'],
      'nl1': ['netherlands_eredivisie'],
      'netherlands_eredivisie': ['n1', 'nl1'],
      'p1': ['portugal_primeira_liga'],
      'po1': ['portugal_primeira_liga'],
      'portugal_primeira_liga': ['p1', 'po1'],
      'bra': ['brazil_serie_a'],
      'brazil_serie_a': ['bra'],
      'mls': ['usa_major_league_soccer', 'mls1'],
      'mls1': ['usa_major_league_soccer', 'mls'],
      'usa_major_league_soccer': ['mls', 'mls1'],
      'sa1': ['saudi_arabia_saudi_professional_league', 'saudi_arabia_saudi_pro_league'],
      'ucl': ['europe_champions_league_league_phase', 'europe_champions_league', 'europe_uefa_champions_league'],
      'europe_champions_league': ['europe_champions_league_league_phase', 'ucl'],
      'europe_champions_league_league_phase': ['europe_champions_league', 'ucl'],
      'uel': ['europe_europa_league_league_phase', 'europe_europa_league', 'europe_uefa_europa_league'],
      'europe_europa_league': ['europe_europa_league_league_phase', 'uel'],
      'europe_europa_league_league_phase': ['europe_europa_league', 'uel'],
      'ucol': ['europe_conference_league_league_phase', 'europe_uefa_conference_league', 'uecl'],
      'uecl': ['europe_conference_league_league_phase', 'europe_uefa_conference_league', 'ucol'],
    };

    try {
      if (leagueUrl && leagueUrl.trim()) {
        const cleanUrl = leagueUrl.trim().replace(/\/+$/, '').toLowerCase();
        const urlRows = sqliteDb
          .prepare("SELECT * FROM league_standings WHERE league_url IS NOT NULL")
          .all() as any[];
        for (const row of urlRows) {
          const rowUrl = String(row.league_url || '').trim().replace(/\/+$/, '').toLowerCase();
          if (rowUrl && rowUrl === cleanUrl && row.standings_json) {
            return this.mapLeagueStandingsRow(row);
          }
        }
      }

      const clean = String(leagueCode || '').toLowerCase().trim();
      const dynamicAliases = [
        ...getLeagueAliases(leagueCode),
        ...(leagueName ? getLeagueAliases(leagueName) : []),
      ].map((a) => a.toLowerCase());

      const candidates = Array.from(
        new Set(
          [
            leagueCode,
            clean,
            ...(aliasMap[clean] || []),
            leagueName ? leagueName.toLowerCase().trim() : '',
            ...dynamicAliases,
          ].filter(Boolean)
        )
      );

      for (const code of candidates) {
        const row = sqliteDb
          .prepare("SELECT * FROM league_standings WHERE LOWER(league_code) = LOWER(?) LIMIT 1")
          .get(code) as any;
        if (row && row.standings_json) {
          return this.mapLeagueStandingsRow(row);
        }
      }
    } catch (err: any) {
      console.error('[FootballDB] Error getting league standings:', err?.message);
    }

    return null;
  }

  getAllLeagueStandingsTables(): LeagueStandingTable[] {
    try {
      const rows = sqliteDb
        .prepare("SELECT * FROM league_standings WHERE standings_json IS NOT NULL")
        .all() as any[];
      return rows
        .map((row) => this.mapLeagueStandingsRow(row))
        .filter((t) => Array.isArray(t.table) && t.table.length > 0);
    } catch (err: any) {
      console.error('[FootballDB] Error bulk loading league standings:', err?.message);
      return [];
    }
  }

  getAllLeagueStandingsSummaries(): Array<{
    leagueCode: string;
    leagueName: string;
    country: string;
    leagueUrl?: string;
    season?: string;
    teamCount: number;
    groupCount: number;
    updatedAt: string;
  }> {
    try {
      const rows = sqliteDb
        .prepare("SELECT league_code, league_name, country, league_url, season, standings_json, groups_json, updated_at FROM league_standings")
        .all() as any[];

      return rows.map((row) => {
        const parsedTable = safeJsonParse<any[]>(row.standings_json, []);
        const parsedGroups = row.groups_json ? safeJsonParse<any[]>(row.groups_json, []) : [];
        return {
          leagueCode: String(row.league_code),
          leagueName: String(row.league_name || row.league_code),
          country: String(row.country || 'International'),
          leagueUrl: row.league_url ? String(row.league_url) : undefined,
          season: row.season ? String(row.season) : undefined,
          teamCount: Array.isArray(parsedTable) ? parsedTable.length : 0,
          groupCount: Array.isArray(parsedGroups) && parsedGroups.length > 0 ? parsedGroups.length : (Array.isArray(parsedTable) && parsedTable.length > 0 ? 1 : 0),
          updatedAt: String(row.updated_at || ''),
        };
      });
    } catch (err: any) {
      console.error('[FootballDB] Error getting standings summaries:', err?.message);
      return [];
    }
  }

  getDiscoveredTournamentsFromDb(): Array<FlashscoreTournamentMeta & { leagueCode?: string }> {
    const collected: Array<FlashscoreTournamentMeta & { leagueCode?: string }> = [];
    const seenKeys = new Set<string>();

    try {
      // 1. From stored compressed f_1_* daily feeds (carries ZE tournamentId, ZC stageId, ZL leagueUrl)
      const dailyRows = sqliteDb
        .prepare("SELECT compressed_data FROM raw_feed_data WHERE feed_path LIKE 'f_1_%'")
        .all() as Array<{ compressed_data: Buffer }>;

      for (const r of dailyRows) {
        if (!r.compressed_data) continue;
        const text = decompressBuffer(r.compressed_data);
        const metas = extractTournamentMetadataFromFeed(text);
        for (const m of metas) {
          const key = `${m.leagueUrl || ''}::${m.country}::${m.tournament}`.toLowerCase();
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          collected.push(m);
        }
      }
    } catch (err: any) {
      console.warn('[FootballDB] Notice scanning raw feeds for tournaments:', err?.message);
    }

    try {
      // 2. Also inspect distinct leagues persisted in upcoming_fixtures
      const fixRows = sqliteDb
        .prepare("SELECT DISTINCT league, league_name, league_url FROM upcoming_fixtures WHERE league IS NOT NULL")
        .all() as Array<{ league: string; league_name: string; league_url?: string }>;

      for (const r of fixRows) {
        const leagueUrl = r.league_url ? String(r.league_url) : undefined;
        const rawName = String(r.league_name || r.league || '').trim();
        const colonIdx = rawName.indexOf(':');
        const country = colonIdx > 0 ? rawName.slice(0, colonIdx).trim() : 'International';
        const tournament = colonIdx > 0 ? rawName.slice(colonIdx + 1).trim() : rawName;
        const key = `${leagueUrl || ''}::${country}::${tournament}`.toLowerCase();
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        collected.push({
          leagueCode: String(r.league),
          tournament: rawName,
          country,
          leagueUrl,
        });
      }
    } catch (err: any) {
      console.warn('[FootballDB] Notice scanning upcoming_fixtures for tournaments:', err?.message);
    }

    return collected;
  }

  saveBet(bet: SlipBet): void {
    try {
      const stmt = sqliteDb.prepare(`
        INSERT OR REPLACE INTO bets (
          id, stake, total_odds, potential_win, currency, status, selections_json, placed_at, evaluated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        bet.id,
        bet.stake,
        bet.totalOdds,
        bet.potentialWin,
        bet.currency || 'Birr',
        bet.status || 'PENDING',
        JSON.stringify(bet.selections || []),
        bet.placedAt || new Date().toISOString(),
        bet.evaluatedAt || null
      );
    } catch (err: any) {
      console.error('[FootballDB] Error saving bet slip:', err?.message);
    }
  }

  getAllBets(): SlipBet[] {
    try {
      const rows = sqliteDb.prepare("SELECT * FROM bets ORDER BY placed_at DESC").all() as any[];
      return rows.map((r) => ({
        id: String(r.id),
        stake: Number(r.stake),
        totalOdds: Number(r.total_odds),
        potentialWin: Number(r.potential_win),
        currency: (r.currency || 'Birr') as 'Birr',
        status: (r.status || 'PENDING') as 'PENDING' | 'WON' | 'LOST',
        selections: safeJsonParse<BetSelection[]>(r.selections_json, []),
        placedAt: String(r.placed_at),
        evaluatedAt: r.evaluated_at ? String(r.evaluated_at) : undefined,
      }));
    } catch (err: any) {
      console.error('[FootballDB] Error fetching bets:', err?.message);
      return [];
    }
  }

  deleteBet(id: string): void {
    try {
      sqliteDb.prepare("DELETE FROM bets WHERE id = ?").run(id);
    } catch (err: any) {
      console.error('[FootballDB] Error deleting bet:', err?.message);
    }
  }

  evaluateBets(): void {
    try {
      const pendingBets = this.getAllBets().filter((b) => b.status === 'PENDING');
      if (pendingBets.length === 0) return;

      // Gather score cache from historical_matches, upcoming_fixtures, predictions, and flashscore_scraped_matches
      const scoreMap = new Map<string, { home: number; away: number; isFinished: boolean }>();

      const histRows = sqliteDb.prepare("SELECT id, fthg, ftag FROM historical_matches WHERE fthg IS NOT NULL AND ftag IS NOT NULL").all() as any[];
      for (const r of histRows) {
        const cleanId = cleanFixtureId(r.id);
        const entry = {
          home: Number(r.fthg),
          away: Number(r.ftag),
          isFinished: true,
        };
        scoreMap.set(cleanId, entry);
        scoreMap.set(String(r.id), entry);
      }

      const upcomingRows = sqliteDb.prepare("SELECT id, status, score_json FROM upcoming_fixtures WHERE score_json IS NOT NULL").all() as any[];
      for (const r of upcomingRows) {
        const parsedScore = safeJsonParse<{ home?: number; away?: number } | null>(r.score_json, null);
        if (parsedScore && typeof parsedScore.home === 'number' && typeof parsedScore.away === 'number') {
          const cleanId = cleanFixtureId(r.id);
          const isFin = String(r.status || '').toUpperCase() === 'FINISHED';
          const existing = scoreMap.get(cleanId);
          if (!existing || !existing.isFinished || isFin) {
            const entry = {
              home: parsedScore.home,
              away: parsedScore.away,
              isFinished: isFin,
            };
            scoreMap.set(cleanId, entry);
            scoreMap.set(String(r.id), entry);
          }
        }
      }

      const predRows = sqliteDb.prepare("SELECT fixture_id, home_score, away_score, status FROM predictions WHERE home_score IS NOT NULL AND away_score IS NOT NULL").all() as any[];
      for (const r of predRows) {
        const id = cleanFixtureId(r.fixture_id);
        const isFin = String(r.status || '').toUpperCase() === 'FINISHED';
        const existing = scoreMap.get(id);
        if (!existing || !existing.isFinished || isFin) {
          const entry = {
            home: Number(r.home_score),
            away: Number(r.away_score),
            isFinished: isFin,
          };
          scoreMap.set(id, entry);
          scoreMap.set(String(r.fixture_id), entry);
        }
      }

      const scrapedRows = sqliteDb.prepare("SELECT match_id, home_score, away_score, status FROM flashscore_scraped_matches WHERE home_score IS NOT NULL AND away_score IS NOT NULL").all() as any[];
      for (const r of scrapedRows) {
        const id = cleanFixtureId(r.match_id);
        const isFin = String(r.status || '').toUpperCase() === 'FINISHED' || Number(r.status) === 3 || Number(r.status) === 4;
        const existing = scoreMap.get(id);
        if (!existing || !existing.isFinished || isFin) {
          const entry = {
            home: Number(r.home_score),
            away: Number(r.away_score),
            isFinished: isFin,
          };
          scoreMap.set(id, entry);
          scoreMap.set(String(r.match_id), entry);
        }
      }

      const updateStmt = sqliteDb.prepare("UPDATE bets SET status = ?, selections_json = ?, evaluated_at = ? WHERE id = ?");

      const evaluateSelection = (sel: BetSelection, hs: number, as: number): boolean | null => {
        if (isNaN(hs) || isNaN(as)) return null;
        const key = (sel.marketKey || '').toUpperCase();
        const tot = hs + as;
        switch (key) {
          case 'HOME_WIN': return hs > as;
          case 'AWAY_WIN': return as > hs;
          case 'DRAW': return hs === as;
          case 'OVER_25': return tot >= 3;
          case 'UNDER_25': return tot <= 2;
          case 'BTTS_YES': return hs > 0 && as > 0;
          case 'BTTS_NO': return hs === 0 || as === 0;
          case 'DOUBLE_CHANCE_1X': return hs >= as;
          case 'DOUBLE_CHANCE_X2': return as >= hs;
          case 'DOUBLE_CHANCE_12': return hs !== as;
          case 'OVER_15': return tot >= 2;
          case 'UNDER_15': return tot <= 1;
          case 'OVER_35': return tot >= 4;
          case 'UNDER_35': return tot <= 3;
          default:
            if (key.includes('HOME') || key.includes('1')) return hs > as;
            if (key.includes('AWAY') || key.includes('2')) return as > hs;
            if (key.includes('DRAW') || key.includes('X')) return hs === as;
            return null;
        }
      };

      const evalTx = sqliteDb.transaction((betsToEval: SlipBet[]) => {
        const now = new Date().toISOString();
        for (const bet of betsToEval) {
          if (!Array.isArray(bet.selections) || bet.selections.length === 0) {
            continue;
          }

          let allWon = true;
          let anyLost = false;
          let allEvaluated = true;

          for (const sel of bet.selections) {
            const cleanId = cleanFixtureId(sel.fixtureId);
            const scoreInfo = scoreMap.get(cleanId) || scoreMap.get(String(sel.fixtureId));

            if (!scoreInfo) {
              sel.status = 'PENDING';
              allEvaluated = false;
              allWon = false;
              continue;
            }

            sel.score = { home: scoreInfo.home, away: scoreInfo.away };
            if (!scoreInfo.isFinished) {
              sel.status = 'PENDING';
              allEvaluated = false;
              allWon = false;
              continue;
            }

            const res = evaluateSelection(sel, scoreInfo.home, scoreInfo.away);
            if (res === null) {
              sel.status = 'PENDING';
              allEvaluated = false;
              allWon = false;
            } else if (res === false) {
              sel.status = 'LOST';
              anyLost = true;
            } else {
              sel.status = 'WON';
            }
          }

          if (anyLost) {
            bet.status = 'LOST';
            bet.evaluatedAt = now;
            updateStmt.run('LOST', JSON.stringify(bet.selections), now, bet.id);
          } else if (allEvaluated && allWon) {
            bet.status = 'WON';
            bet.evaluatedAt = now;
            updateStmt.run('WON', JSON.stringify(bet.selections), now, bet.id);
          } else {
            updateStmt.run('PENDING', JSON.stringify(bet.selections), bet.evaluatedAt || null, bet.id);
          }
        }
      });

      evalTx(pendingBets);
    } catch (err: any) {
      console.warn('[FootballDB] Error evaluating bets:', err?.message);
    }
  }
}

export const db = new FootballDB();
