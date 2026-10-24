import fs from 'fs';
import path from 'path';
import initSqlJs, { Database } from 'sql.js';
import { Fixture } from './types.js';
import { getLeaguePriority } from './leaguePriority.js';
import { isMatchStarted } from './accumulator.js';
import { getRelativeDateStr, getPossibleDateStrs } from './dateUtils.js';
import { getSlugForCode, getCodeForSlug, getLeagueAliases, matchesLeague } from './leagueMapper.js';
import { predictionsTurso, safeTursoBatch } from './tursoClient.js';


function getPredictionsDbPaths() {
  const localDir = path.resolve(process.cwd(), 'data');
  const localFile = path.join(localDir, 'predictions.sqlite');
  const tmpDir = path.resolve('/tmp', 'data');
  const tmpFile = path.join(tmpDir, 'predictions.sqlite');
  return { localDir, localFile, tmpDir, tmpFile };
}

export class PredictionsDB {
  private db: Database | null = null;
  private SQL: any = null;
  private isInitialized = false;
  private useTurso = !!process.env.predictions_turso_url;
  private memoryFallback: Map<string, Fixture> = new Map();
  private liveMemoryFallback: Map<string, Fixture> = new Map();
  private historyMemoryFallback: Map<string, Fixture> = new Map();

  async init(): Promise<void> {
    if (this.isInitialized) return;
    
    if (this.useTurso) {
        console.log('[PredictionsDB] Using Turso for predictions database, initializing local SQLite cache as well.');
    }

    const { localDir, localFile, tmpFile } = getPredictionsDbPaths();
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
        console.warn('Could not read existing predictions SQLite database from disk:', err);
      }

      if (!loadedFromDisk || !this.db) {
        this.db = new this.SQL.Database();
      }

      this.createTables();

      // Hydrate local SQLite from Turso if local upcoming_predictions table is empty
      if (this.useTurso && predictionsTurso) {
        try {
          const countRes = this.db.exec('SELECT COUNT(*) as count FROM upcoming_predictions');
          const currentCount = countRes[0]?.values[0]?.[0] ? Number(countRes[0].values[0][0]) : 0;
          if (currentCount === 0) {
            console.log('[PredictionsDB] Local cache empty. Hydrating upcoming_predictions from Turso in bulk...');
            const tursoRes = await predictionsTurso.execute(`
              SELECT fixture_id, league, league_name, stage, match_date, kick_off_time,
                     home_team, away_team, home_badge, away_badge, status,
                     b365_h, b365_d, b365_a, b365_over25, b365_under25, b365_btts_yes, b365_btts_no,
                     home_xg, away_xg, home_win_prob, draw_prob, away_win_prob,
                     over15_prob, over25_prob, over35_prob, btts_prob,
                     tip_key, tip_name, tip_odds, tip_prob, tip_ev,
                     is_positive_ev, is_banker, full_fixture_json, predicted_at
              FROM upcoming_predictions
            `);
            if (tursoRes.rows && tursoRes.rows.length > 0) {
              this.db.run('BEGIN TRANSACTION;');
              const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO upcoming_predictions (
                  fixture_id, league, league_name, stage, match_date, kick_off_time,
                  home_team, away_team, home_badge, away_badge, status,
                  b365_h, b365_d, b365_a, b365_over25, b365_under25, b365_btts_yes, b365_btts_no,
                  home_xg, away_xg, home_win_prob, draw_prob, away_win_prob,
                  over15_prob, over25_prob, over35_prob, btts_prob,
                  tip_key, tip_name, tip_odds, tip_prob, tip_ev,
                  is_positive_ev, is_banker, full_fixture_json, predicted_at
                ) VALUES (
                  ?, ?, ?, ?, ?, ?,
                  ?, ?, ?, ?, ?,
                  ?, ?, ?, ?, ?, ?, ?,
                  ?, ?, ?, ?, ?,
                  ?, ?, ?, ?,
                  ?, ?, ?, ?, ?,
                  ?, ?, ?, ?
                )
              `);
              for (const row of tursoRes.rows) {
                stmt.run([
                  row.fixture_id,
                  row.league || 'ALL',
                  row.league_name || 'Unknown',
                  row.stage || null,
                  row.match_date,
                  row.kick_off_time || 'TBD',
                  row.home_team,
                  row.away_team,
                  row.home_badge || null,
                  row.away_badge || null,
                  row.status || 'SCHEDULED',
                  row.b365_h || 2.0,
                  row.b365_d || 3.0,
                  row.b365_a || 3.5,
                  row.b365_over25 ?? null,
                  row.b365_under25 ?? null,
                  row.b365_btts_yes ?? null,
                  row.b365_btts_no ?? null,
                  row.home_xg ?? 1.35,
                  row.away_xg ?? 1.10,
                  row.home_win_prob ?? 0.45,
                  row.draw_prob ?? 0.28,
                  row.away_win_prob ?? 0.27,
                  row.over15_prob ?? 0.75,
                  row.over25_prob ?? 0.50,
                  row.over35_prob ?? 0.28,
                  row.btts_prob ?? 0.52,
                  row.tip_key || 'HOME_WIN',
                  row.tip_name || 'Home Win',
                  row.tip_odds || 2.0,
                  row.tip_prob || 0.45,
                  row.tip_ev || 0,
                  row.is_positive_ev ? 1 : 0,
                  row.is_banker ? 1 : 0,
                  row.full_fixture_json,
                  row.predicted_at || new Date().toISOString(),
                ] as any);
              }
              stmt.free();
              this.db.run('COMMIT;');
              console.log(`[PredictionsDB] Hydrated ${tursoRes.rows.length} upcoming predictions from Turso into local SQLite.`);
            }
          }
        } catch (err: any) {
          console.warn('[PredictionsDB] Hydration from Turso warning:', err?.message);
        }
      }

      this.saveToDisk();
      this.isInitialized = true;
    } catch (err) {
      console.warn('Predictions SQLite initialization failed, using in-memory dataset fallback:', err);
      this.isInitialized = true;
    }
  }

  private saveToDisk(): void {
    if (!this.db) return;
    try {
      const { localDir, localFile, tmpDir, tmpFile } = getPredictionsDbPaths();
      const data = this.db.export();
      const buffer = Buffer.from(data);

      try {
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true });
        }
        fs.writeFileSync(localFile, buffer);
        return;
      } catch {
        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }
        fs.writeFileSync(tmpFile, buffer);
      }
    } catch {
      // Fallback in-memory
    }
  }

  private createTables(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS upcoming_predictions (
        fixture_id TEXT PRIMARY KEY,
        league TEXT NOT NULL,
        league_name TEXT NOT NULL,
        stage TEXT,
        match_date TEXT NOT NULL,
        kick_off_time TEXT NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        home_badge TEXT,
        away_badge TEXT,
        status TEXT NOT NULL DEFAULT 'SCHEDULED',
        b365_h REAL NOT NULL,
        b365_d REAL NOT NULL,
        b365_a REAL NOT NULL,
        b365_over25 REAL,
        b365_under25 REAL,
        b365_btts_yes REAL,
        b365_btts_no REAL,
        home_xg REAL NOT NULL,
        away_xg REAL NOT NULL,
        home_win_prob REAL NOT NULL,
        draw_prob REAL NOT NULL,
        away_win_prob REAL NOT NULL,
        over15_prob REAL NOT NULL,
        over25_prob REAL NOT NULL,
        over35_prob REAL NOT NULL,
        btts_prob REAL NOT NULL,
        tip_key TEXT NOT NULL,
        tip_name TEXT NOT NULL,
        tip_odds REAL NOT NULL,
        tip_prob REAL NOT NULL,
        tip_ev REAL NOT NULL,
        is_positive_ev INTEGER NOT NULL DEFAULT 0,
        is_banker INTEGER NOT NULL DEFAULT 0,
        full_fixture_json TEXT NOT NULL,
        predicted_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pred_date ON upcoming_predictions(match_date);
      CREATE INDEX IF NOT EXISTS idx_pred_league ON upcoming_predictions(league);

      CREATE TABLE IF NOT EXISTS live_predictions (
        fixture_id TEXT PRIMARY KEY,
        league TEXT NOT NULL,
        league_name TEXT NOT NULL,
        stage TEXT,
        match_date TEXT NOT NULL,
        kick_off_time TEXT NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        home_badge TEXT,
        away_badge TEXT,
        status TEXT NOT NULL DEFAULT 'LIVE',
        minute INTEGER DEFAULT 0,
        home_score INTEGER DEFAULT 0,
        away_score INTEGER DEFAULT 0,
        b365_h REAL NOT NULL,
        b365_d REAL NOT NULL,
        b365_a REAL NOT NULL,
        home_xg REAL NOT NULL,
        away_xg REAL NOT NULL,
        home_win_prob REAL NOT NULL,
        draw_prob REAL NOT NULL,
        away_win_prob REAL NOT NULL,
        over15_prob REAL NOT NULL,
        over25_prob REAL NOT NULL,
        over35_prob REAL NOT NULL,
        btts_prob REAL NOT NULL,
        tip_key TEXT NOT NULL,
        tip_name TEXT NOT NULL,
        tip_odds REAL NOT NULL,
        tip_prob REAL NOT NULL,
        tip_ev REAL NOT NULL,
        is_positive_ev INTEGER NOT NULL DEFAULT 0,
        is_banker INTEGER NOT NULL DEFAULT 0,
        full_fixture_json TEXT NOT NULL,
        predicted_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_live_league ON live_predictions(league);

      CREATE TABLE IF NOT EXISTS historical_predictions (
        fixture_id TEXT PRIMARY KEY,
        league TEXT NOT NULL,
        league_name TEXT NOT NULL,
        stage TEXT,
        match_date TEXT NOT NULL,
        kick_off_time TEXT NOT NULL DEFAULT 'FT',
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        home_badge TEXT,
        away_badge TEXT,
        status TEXT NOT NULL DEFAULT 'FINISHED',
        home_score INTEGER NOT NULL,
        away_score INTEGER NOT NULL,
        b365_h REAL NOT NULL,
        b365_d REAL NOT NULL,
        b365_a REAL NOT NULL,
        home_xg REAL NOT NULL,
        away_xg REAL NOT NULL,
        home_win_prob REAL NOT NULL,
        draw_prob REAL NOT NULL,
        away_win_prob REAL NOT NULL,
        over15_prob REAL NOT NULL,
        over25_prob REAL NOT NULL,
        over35_prob REAL NOT NULL,
        btts_prob REAL NOT NULL,
        tip_key TEXT NOT NULL,
        tip_name TEXT NOT NULL,
        tip_odds REAL NOT NULL,
        tip_prob REAL NOT NULL,
        tip_ev REAL NOT NULL,
        is_positive_ev INTEGER NOT NULL DEFAULT 0,
        is_banker INTEGER NOT NULL DEFAULT 0,
        full_fixture_json TEXT NOT NULL,
        predicted_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_hist_pred_date ON historical_predictions(match_date);
      CREATE INDEX IF NOT EXISTS idx_hist_pred_league ON historical_predictions(league);
    `);
  }

  async savePredictions(fixtures: Fixture[]): Promise<void> {
    if (!fixtures || fixtures.length === 0) return;

    for (const f of fixtures) {
      if (f.id) {
        this.memoryFallback.set(f.id, f);
      }
    }

    // 1. ALWAYS write to local SQLite database first inside a single transaction!
    if (this.db) {
      try {
        this.db.run('BEGIN TRANSACTION;');
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO upcoming_predictions (
            fixture_id, league, league_name, stage, match_date, kick_off_time,
            home_team, away_team, home_badge, away_badge, status,
            b365_h, b365_d, b365_a, b365_over25, b365_under25, b365_btts_yes, b365_btts_no,
            home_xg, away_xg, home_win_prob, draw_prob, away_win_prob,
            over15_prob, over25_prob, over35_prob, btts_prob,
            tip_key, tip_name, tip_odds, tip_prob, tip_ev,
            is_positive_ev, is_banker, full_fixture_json, predicted_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?
          )
        `);

        const now = new Date().toISOString();

        for (const f of fixtures) {
          const pred = f.prediction;
          const bestTip = f.bestValueMarket;

          stmt.run([
            f.id,
            f.league || 'ALL',
            f.leagueName || f.league || 'Unknown League',
            f.stage || null,
            f.matchDate,
            f.kickOffTime || 'TBD',
            f.homeTeam,
            f.awayTeam,
            f.homeBadge || null,
            f.awayBadge || null,
            f.status || 'SCHEDULED',
            f.odds.homeWin || 2.0,
            f.odds.draw || 3.0,
            f.odds.awayWin || 3.5,
            f.odds.over25 ?? null,
            f.odds.under25 ?? null,
            f.odds.bttsYes ?? null,
            f.odds.bttsNo ?? null,
            pred?.homeXG ?? 1.35,
            pred?.awayXG ?? 1.10,
            pred?.homeWinProb ?? 0.45,
            pred?.drawProb ?? 0.28,
            pred?.awayWinProb ?? 0.27,
            pred?.over15Prob ?? 0.75,
            pred?.over25Prob ?? 0.50,
            pred?.over35Prob ?? 0.28,
            pred?.bttsProb ?? 0.52,
            bestTip?.key || 'HOME_WIN',
            bestTip?.name || 'Home Win',
            bestTip?.odds || f.odds.homeWin || 2.0,
            bestTip?.probability || pred?.homeWinProb || 0.45,
            bestTip?.expectedValue || 0,
            bestTip?.isPositiveEV ? 1 : 0,
            bestTip?.isBanker ? 1 : 0,
            JSON.stringify(f),
            now,
          ]);
        }

        stmt.free();
        this.db.run('COMMIT;');
        this.saveToDisk();
      } catch (err) {
        console.error('Error saving predictions to predictions.sqlite:', err);
        try {
          this.db.run('ROLLBACK;');
        } catch {}
      }
    }

    // 2. Batch sync to Turso asynchronously in background without blocking
    if (this.useTurso && predictionsTurso) {
      (async () => {
        try {
          const batchStatements = fixtures.map((f) => ({
            sql: `INSERT OR REPLACE INTO upcoming_predictions (
              fixture_id, league, league_name, match_date, kick_off_time,
              home_team, away_team, status, predicted_at,
              b365_h, b365_d, b365_a, home_xg, away_xg,
              home_win_prob, draw_prob, away_win_prob,
              over15_prob, over25_prob, over35_prob, btts_prob,
              tip_key, tip_name, tip_odds, tip_prob, tip_ev,
              full_fixture_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              f.id, f.league || 'ALL', f.leagueName || f.league || 'Unknown', f.matchDate, f.kickOffTime || 'TBD',
              f.homeTeam, f.awayTeam, f.status || 'SCHEDULED', new Date().toISOString(),
              f.odds.homeWin || 2.0, f.odds.draw || 3.0, f.odds.awayWin || 3.5,
              f.prediction?.homeXG ?? 1.35, f.prediction?.awayXG ?? 1.10,
              f.prediction?.homeWinProb ?? 0.45, f.prediction?.drawProb ?? 0.28, f.prediction?.awayWinProb ?? 0.27,
              f.prediction?.over15Prob ?? 0.75, f.prediction?.over25Prob ?? 0.50, f.prediction?.over35Prob ?? 0.28, f.prediction?.bttsProb ?? 0.52,
              f.bestValueMarket?.key || 'HOME_WIN', f.bestValueMarket?.name || 'Home Win', f.bestValueMarket?.odds || f.odds.homeWin || 2.0,
              f.bestValueMarket?.probability || f.prediction?.homeWinProb || 0.45, f.bestValueMarket?.expectedValue || 0,
              JSON.stringify(f)
            ]
          }));

          await safeTursoBatch(predictionsTurso, batchStatements, 25);
        } catch {
          // Graceful fallback for non-blocking background sync
        }
      })();
    }
  }

  getPredictions(filters?: {
    league?: string;
    date?: string;
    dateFilter?: string;
    startDate?: string;
    endDate?: string;
    unstartedOnly?: boolean;
  }): Fixture[] {
    const todayStrs = getPossibleDateStrs(0);
    const tomorrowStrs = getPossibleDateStrs(1);
    const day2Strs = getPossibleDateStrs(2);
    const day6Strs = getPossibleDateStrs(6);
    const minToday = todayStrs.slice().sort()[0];
    const maxNext3 = day2Strs.slice().sort().pop()!;
    const maxWeek = day6Strs.slice().sort().pop()!;

    let fixtures: Fixture[] = [];

    if (!this.db) {
      fixtures = Array.from(this.memoryFallback.values());
    } else {
      try {
        let sql = `SELECT full_fixture_json, match_date, kick_off_time, league, status FROM upcoming_predictions`;
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters?.league && filters.league !== 'ALL') {
          const aliases = getLeagueAliases(filters.league);
          if (aliases.length > 0) {
            const placeholders = aliases.map(() => '?').join(', ');
            const likeClauses = aliases.map(() => 'UPPER(league_name) LIKE ? OR UPPER(league) LIKE ?').join(' OR ');
            conditions.push(`(UPPER(league) IN (${placeholders}) OR ${likeClauses})`);
            params.push(...aliases);
            aliases.forEach((a) => {
              params.push(`%${a}%`, `%${a}%`);
            });
          }
        }

        if (filters?.date) {
          conditions.push(`match_date = ?`);
          params.push(filters.date);
        } else if (filters?.dateFilter === 'TODAY') {
          conditions.push(`match_date IN (${todayStrs.map(() => '?').join(',')})`);
          params.push(...todayStrs);
        } else if (filters?.dateFilter === 'TOMORROW') {
          conditions.push(`match_date IN (${tomorrowStrs.map(() => '?').join(',')})`);
          params.push(...tomorrowStrs);
        } else if (filters?.dateFilter === 'NEXT_3_DAYS') {
          conditions.push(`match_date >= ? AND match_date <= ?`);
          params.push(minToday, maxNext3);
        } else if (filters?.dateFilter === 'THIS_WEEK') {
          conditions.push(`match_date >= ? AND match_date <= ?`);
          params.push(minToday, maxWeek);
        } else if (filters?.dateFilter === 'CUSTOM') {
          if (filters.startDate) {
            conditions.push(`match_date >= ?`);
            params.push(filters.startDate);
          }
          if (filters.endDate) {
            conditions.push(`match_date <= ?`);
            params.push(filters.endDate);
          }
        }

        if (conditions.length > 0) {
          sql += ` WHERE ` + conditions.join(' AND ');
        }

        sql += ` ORDER BY match_date ASC, kick_off_time ASC`;

        const stmt = this.db.prepare(sql);
        if (params.length > 0) {
          stmt.bind(params);
        }

        while (stmt.step()) {
          const row = stmt.getAsObject() as { full_fixture_json: string };
          if (row.full_fixture_json) {
            try {
              const parsed = JSON.parse(row.full_fixture_json) as Fixture;
              if (parsed.prediction && parsed.prediction.probabilityMatrix) {
                parsed.prediction.probabilityMatrix = [];
              }
              fixtures.push(parsed);
            } catch (parseErr) {
              console.warn('Skipping corrupted fixture JSON row:', parseErr);
            }
          }
        }
        stmt.free();
      } catch (err) {
        console.error('Error fetching predictions from predictions.sqlite:', err);
        fixtures = Array.from(this.memoryFallback.values());
      }
    }

    const seen = new Set<string>();
    fixtures = fixtures.filter((f) => {
      if (!f.id || seen.has(f.id)) return false;
      if (f.status === 'FINISHED') return false;
      if (filters?.unstartedOnly && isMatchStarted(f)) return false;
      if (filters?.league && filters.league !== 'ALL') {
        if (!matchesLeague(f.league, f.leagueName, filters.league)) return false;
      }
      seen.add(f.id);
      return true;
    });

    fixtures.sort((a, b) => {
      const priorityA = getLeaguePriority(a.league, a.leagueName, a.stage);
      const priorityB = getLeaguePriority(b.league, b.leagueName, b.stage);
      if (priorityA !== priorityB) return priorityA - priorityB;
      if (a.matchDate !== b.matchDate) return a.matchDate.localeCompare(b.matchDate);
      return (a.kickOffTime || '').localeCompare(b.kickOffTime || '');
    });

    return fixtures;
  }

  getPredictionById(fixtureId: string): Fixture | null {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '');

    if (this.memoryFallback.has(fixtureId)) return this.memoryFallback.get(fixtureId)!;
    if (this.memoryFallback.has(cleanId)) return this.memoryFallback.get(cleanId)!;
    if (this.memoryFallback.has(`fs_${cleanId}`)) return this.memoryFallback.get(`fs_${cleanId}`)!;
    if (this.memoryFallback.has(`hist_${cleanId}`)) return this.memoryFallback.get(`hist_${cleanId}`)!;

    if (this.liveMemoryFallback.has(fixtureId)) return this.liveMemoryFallback.get(fixtureId)!;
    if (this.liveMemoryFallback.has(cleanId)) return this.liveMemoryFallback.get(cleanId)!;
    if (this.liveMemoryFallback.has(`fs_${cleanId}`)) return this.liveMemoryFallback.get(`fs_${cleanId}`)!;

    if (this.historyMemoryFallback.has(fixtureId)) return this.historyMemoryFallback.get(fixtureId)!;
    if (this.historyMemoryFallback.has(cleanId)) return this.historyMemoryFallback.get(cleanId)!;
    if (this.historyMemoryFallback.has(`hist_${cleanId}`)) return this.historyMemoryFallback.get(`hist_${cleanId}`)!;

    if (!this.db) return null;

    try {
      const stmt = this.db.prepare(`
        SELECT full_fixture_json FROM upcoming_predictions
        WHERE fixture_id = ? OR fixture_id = ? OR fixture_id = ? OR fixture_id = ?
        UNION ALL
        SELECT full_fixture_json FROM live_predictions
        WHERE fixture_id = ? OR fixture_id = ? OR fixture_id = ? OR fixture_id = ?
        UNION ALL
        SELECT full_fixture_json FROM historical_predictions
        WHERE fixture_id = ? OR fixture_id = ? OR fixture_id = ? OR fixture_id = ?
        LIMIT 1
      `);
      stmt.bind([
        fixtureId, cleanId, `fs_${cleanId}`, `hist_${cleanId}`,
        fixtureId, cleanId, `fs_${cleanId}`, `hist_${cleanId}`,
        fixtureId, cleanId, `fs_${cleanId}`, `hist_${cleanId}`
      ]);
      if (stmt.step()) {
        const row = stmt.getAsObject() as { full_fixture_json: string };
        stmt.free();
        if (row.full_fixture_json) {
          return JSON.parse(row.full_fixture_json) as Fixture;
        }
      }
      stmt.free();
    } catch (err) {
      console.error('Error getting prediction by ID from predictions.sqlite:', err);
    }
    return null;
  }

  getAllPredictions(): Fixture[] {
    return this.getPredictions({ dateFilter: 'ALL' });
  }

  count(): number {
    if (!this.db) return this.memoryFallback.size;
    try {
      const res = this.db.exec(`SELECT COUNT(*) as count FROM upcoming_predictions`);
      return res[0]?.values[0]?.[0] ? Number(res[0].values[0][0]) : 0;
    } catch {
      return this.memoryFallback.size;
    }
  }

  clearPredictions(): void {
    this.memoryFallback.clear();
    if (!this.db) return;
    try {
      this.db.run(`DELETE FROM upcoming_predictions;`);
      this.saveToDisk();
    } catch (err) {
      console.error('Error clearing predictions table:', err);
    }
  }

  /* -------------------------------------------------------------
   * Live Match Predictions Storage & Queries
   * ------------------------------------------------------------- */

  async saveLivePredictions(fixtures: Fixture[]): Promise<void> {
    if (!fixtures || fixtures.length === 0) return;

    for (const f of fixtures) {
      if (f.id) {
        this.liveMemoryFallback.set(f.id, f);
      }
    }

    // 1. ALWAYS write to local SQLite first
    if (this.db) {
      try {
        this.db.run('BEGIN TRANSACTION;');
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO live_predictions (
            fixture_id, league, league_name, stage, match_date, kick_off_time,
            home_team, away_team, home_badge, away_badge, status,
            minute, home_score, away_score,
            b365_h, b365_d, b365_a,
            home_xg, away_xg, home_win_prob, draw_prob, away_win_prob,
            over15_prob, over25_prob, over35_prob, btts_prob,
            tip_key, tip_name, tip_odds, tip_prob, tip_ev,
            is_positive_ev, is_banker, full_fixture_json, predicted_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?
          )
        `);

        const now = new Date().toISOString();

        for (const f of fixtures) {
          const pred = f.prediction;
          const bestTip = f.bestValueMarket;

          stmt.run([
            f.id,
            f.league || 'ALL',
            f.leagueName || f.league || 'Live In-Play',
            f.stage || null,
            f.matchDate,
            f.kickOffTime || `${f.minute || 0}'`,
            f.homeTeam,
            f.awayTeam,
            f.homeBadge || null,
            f.awayBadge || null,
            'LIVE',
            f.minute || 0,
            f.score?.home ?? 0,
            f.score?.away ?? 0,
            f.odds.homeWin || 2.0,
            f.odds.draw || 3.0,
            f.odds.awayWin || 3.5,
            pred?.homeXG ?? 1.35,
            pred?.awayXG ?? 1.10,
            pred?.homeWinProb ?? 0.45,
            pred?.drawProb ?? 0.28,
            pred?.awayWinProb ?? 0.27,
            pred?.over15Prob ?? 0.75,
            pred?.over25Prob ?? 0.50,
            pred?.over35Prob ?? 0.28,
            pred?.bttsProb ?? 0.52,
            bestTip?.key || 'HOME_WIN',
            bestTip?.name || 'Home Win',
            bestTip?.odds || f.odds.homeWin || 2.0,
            bestTip?.probability || pred?.homeWinProb || 0.45,
            bestTip?.expectedValue || 0,
            bestTip?.isPositiveEV ? 1 : 0,
            bestTip?.isBanker ? 1 : 0,
            JSON.stringify(f),
            now,
          ]);
        }

        stmt.free();
        this.db.run('COMMIT;');
        this.saveToDisk();
      } catch (err) {
        console.error('Error saving live predictions to predictions.sqlite:', err);
        try {
          this.db.run('ROLLBACK;');
        } catch {}
      }
    }

    // 2. Background sync to Turso in chunked batches
    if (this.useTurso && predictionsTurso) {
      (async () => {
        try {
          const batchStatements = fixtures.map((f) => ({
            sql: `INSERT OR REPLACE INTO live_predictions (
              fixture_id, league, league_name, match_date, kick_off_time,
              home_team, away_team, status, predicted_at,
              b365_h, b365_d, b365_a, home_xg, away_xg,
              home_win_prob, draw_prob, away_win_prob,
              over15_prob, over25_prob, over35_prob, btts_prob,
              tip_key, tip_name, tip_odds, tip_prob, tip_ev,
              full_fixture_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              f.id, f.league || 'ALL', f.leagueName || f.league || 'Live', f.matchDate, f.kickOffTime || 'LIVE', f.homeTeam, f.awayTeam, 'LIVE', new Date().toISOString(),
              f.odds.homeWin || 2.0, f.odds.draw || 3.0, f.odds.awayWin || 3.5, f.prediction?.homeXG ?? 1.35, f.prediction?.awayXG ?? 1.10,
              f.prediction?.homeWinProb ?? 0.45, f.prediction?.drawProb ?? 0.28, f.prediction?.awayWinProb ?? 0.27,
              f.prediction?.over15Prob ?? 0.75, f.prediction?.over25Prob ?? 0.50, f.prediction?.over35Prob ?? 0.28, f.prediction?.bttsProb ?? 0.52,
              f.bestValueMarket?.key || 'HOME_WIN', f.bestValueMarket?.name || 'Home Win', f.bestValueMarket?.odds || f.odds.homeWin || 2.0, f.bestValueMarket?.probability || f.prediction?.homeWinProb || 0.45, f.bestValueMarket?.expectedValue || 0,
              JSON.stringify(f)
            ]
          }));

          await safeTursoBatch(predictionsTurso, batchStatements, 25);
        } catch {
          // Graceful fallback for non-blocking live Turso sync
        }
      })();
    }
  }

  getLivePredictions(filters?: { league?: string; limit?: number }): Fixture[] {
    let fixtures: Fixture[] = [];

    if (!this.db) {
      fixtures = Array.from(this.liveMemoryFallback.values());
    } else {
      try {
        let sql = `SELECT full_fixture_json, league, league_name FROM live_predictions`;
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters?.league && filters.league !== 'ALL') {
          const aliases = getLeagueAliases(filters.league);
          const placeholders = aliases.map(() => '?').join(', ');
          const likeClauses = aliases.map(() => 'UPPER(league_name) LIKE ? OR UPPER(league) LIKE ?').join(' OR ');
          conditions.push(`(UPPER(league) IN (${placeholders}) OR ${likeClauses})`);
          params.push(...aliases);
          aliases.forEach((a) => {
            params.push(`%${a}%`, `%${a}%`);
          });
        }

        if (conditions.length > 0) {
          sql += ` WHERE ` + conditions.join(' AND ');
        }

        sql += ` ORDER BY predicted_at DESC`;
        if (filters?.limit) {
          sql += ` LIMIT ?`;
          params.push(filters.limit);
        }

        const stmt = this.db.prepare(sql);
        if (params.length > 0) {
          stmt.bind(params);
        }

        while (stmt.step()) {
          const row = stmt.getAsObject() as { full_fixture_json: string };
          if (row.full_fixture_json) {
            try {
              fixtures.push(JSON.parse(row.full_fixture_json) as Fixture);
            } catch {}
          }
        }
        stmt.free();
      } catch (err) {
        console.error('Error querying live predictions from predictions.sqlite:', err);
        fixtures = Array.from(this.liveMemoryFallback.values());
      }
    }

    if (filters?.league && filters.league !== 'ALL') {
      fixtures = fixtures.filter((f) => matchesLeague(f.league, f.leagueName, filters.league));
    }

    return fixtures;
  }

  countLivePredictions(): number {
    if (!this.db) return this.liveMemoryFallback.size;
    try {
      const res = this.db.exec(`SELECT COUNT(*) as count FROM live_predictions`);
      return res[0]?.values[0]?.[0] ? Number(res[0].values[0][0]) : 0;
    } catch {
      return this.liveMemoryFallback.size;
    }
  }

  /* -------------------------------------------------------------
   * Historical Predictions Storage & Queries
   * ------------------------------------------------------------- */

  async saveHistoricalPredictions(fixtures: Fixture[]): Promise<void> {
    if (!fixtures || fixtures.length === 0) return;

    for (const f of fixtures) {
      if (f.id) {
        this.historyMemoryFallback.set(f.id, f);
      }
    }

    // 1. ALWAYS write to local SQLite first
    if (this.db) {
      try {
        this.db.run('BEGIN TRANSACTION;');
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO historical_predictions (
            fixture_id, league, league_name, stage, match_date, kick_off_time,
            home_team, away_team, home_badge, away_badge, status,
            home_score, away_score,
            b365_h, b365_d, b365_a,
            home_xg, away_xg, home_win_prob, draw_prob, away_win_prob,
            over15_prob, over25_prob, over35_prob, btts_prob,
            tip_key, tip_name, tip_odds, tip_prob, tip_ev,
            is_positive_ev, is_banker, full_fixture_json, predicted_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?
          )
        `);

        const now = new Date().toISOString();

        for (const f of fixtures) {
          const pred = f.prediction;
          const bestTip = f.bestValueMarket;

          stmt.run([
            f.id,
            f.league || 'ALL',
            f.leagueName || f.league || 'Historical Match',
            f.stage || null,
            f.matchDate,
            f.kickOffTime || 'FT',
            f.homeTeam,
            f.awayTeam,
            f.homeBadge || null,
            f.awayBadge || null,
            'FINISHED',
            f.score?.home ?? 0,
            f.score?.away ?? 0,
            f.odds.homeWin || 2.0,
            f.odds.draw || 3.0,
            f.odds.awayWin || 3.5,
            pred?.homeXG ?? 1.35,
            pred?.awayXG ?? 1.10,
            pred?.homeWinProb ?? 0.45,
            pred?.drawProb ?? 0.28,
            pred?.awayWinProb ?? 0.27,
            pred?.over15Prob ?? 0.75,
            pred?.over25Prob ?? 0.50,
            pred?.over35Prob ?? 0.28,
            pred?.bttsProb ?? 0.52,
            bestTip?.key || 'HOME_WIN',
            bestTip?.name || 'Home Win',
            bestTip?.odds || f.odds.homeWin || 2.0,
            bestTip?.probability || pred?.homeWinProb || 0.45,
            bestTip?.expectedValue || 0,
            bestTip?.isPositiveEV ? 1 : 0,
            bestTip?.isBanker ? 1 : 0,
            JSON.stringify(f),
            now,
          ]);
        }

        stmt.free();
        this.db.run('COMMIT;');
        this.saveToDisk();
      } catch (err) {
        console.error('Error saving historical predictions to predictions.sqlite:', err);
        try {
          this.db.run('ROLLBACK;');
        } catch {}
      }
    }

    // 2. Background sync to Turso in chunked batches
    if (this.useTurso && predictionsTurso) {
      (async () => {
        try {
          const batchStatements = fixtures.map((f) => ({
            sql: `INSERT OR REPLACE INTO historical_predictions (
              fixture_id, league, league_name, match_date, kick_off_time,
              home_team, away_team, status, predicted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [f.id, f.league || 'ALL', f.leagueName || f.league || 'Historical', f.matchDate, f.kickOffTime || 'FT', f.homeTeam, f.awayTeam, 'FINISHED', new Date().toISOString()]
          }));

          await safeTursoBatch(predictionsTurso, batchStatements, 25);
        } catch {
          // Graceful fallback for non-blocking historical Turso sync
        }
      })();
    }
  }

  getHistoricalPredictions(filters?: { league?: string; limit?: number }): Fixture[] {
    let fixtures: Fixture[] = [];

    if (!this.db) {
      fixtures = Array.from(this.historyMemoryFallback.values());
    } else {
      try {
        let sql = `SELECT full_fixture_json, league, league_name FROM historical_predictions`;
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters?.league && filters.league !== 'ALL') {
          const aliases = getLeagueAliases(filters.league);
          const placeholders = aliases.map(() => '?').join(', ');
          const likeClauses = aliases.map(() => 'UPPER(league_name) LIKE ? OR UPPER(league) LIKE ?').join(' OR ');
          conditions.push(`(UPPER(league) IN (${placeholders}) OR ${likeClauses})`);
          params.push(...aliases);
          aliases.forEach((a) => {
            params.push(`%${a}%`, `%${a}%`);
          });
        }

        if (conditions.length > 0) {
          sql += ` WHERE ` + conditions.join(' AND ');
        }

        sql += ` ORDER BY match_date DESC`;
        if (filters?.limit) {
          sql += ` LIMIT ?`;
          params.push(filters.limit);
        }

        const stmt = this.db.prepare(sql);
        if (params.length > 0) {
          stmt.bind(params);
        }

        while (stmt.step()) {
          const row = stmt.getAsObject() as { full_fixture_json: string };
          if (row.full_fixture_json) {
            try {
              fixtures.push(JSON.parse(row.full_fixture_json) as Fixture);
            } catch {}
          }
        }
        stmt.free();
      } catch (err) {
        console.error('Error querying historical predictions from predictions.sqlite:', err);
        fixtures = Array.from(this.historyMemoryFallback.values());
      }
    }

    if (filters?.league && filters.league !== 'ALL') {
      fixtures = fixtures.filter((f) => matchesLeague(f.league, f.leagueName, filters.league));
    }

    return fixtures;
  }

  countHistoricalPredictions(): number {
    if (!this.db) return this.historyMemoryFallback.size;
    try {
      const res = this.db.exec(`SELECT COUNT(*) as count FROM historical_predictions`);
      return res[0]?.values[0]?.[0] ? Number(res[0].values[0][0]) : 0;
    } catch {
      return this.historyMemoryFallback.size;
    }
  }

  clearAll(): void {
    this.memoryFallback.clear();
    this.liveMemoryFallback.clear();
    this.historyMemoryFallback.clear();
    if (!this.db) return;
    try {
      this.db.run('DELETE FROM upcoming_predictions;');
      this.db.run('DELETE FROM live_predictions;');
      this.db.run('DELETE FROM historical_predictions;');
      this.saveToDisk();
    } catch (err) {
      console.error('Error clearing PredictionsDB:', err);
    }
  }
}

export const predictionsDb = new PredictionsDB();
