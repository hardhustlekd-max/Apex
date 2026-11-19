import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { loggerService } from '../services/loggerService.js';
import { DEFAULT_ENGINE_SETTINGS } from './types.js';

const dbMutationListeners: Array<() => void> = [];

export function registerDbMutationListener(listener: () => void): void {
  if (!dbMutationListeners.includes(listener)) {
    dbMutationListeners.push(listener);
  }
}

export function notifyDbMutation(): void {
  for (const listener of dbMutationListeners) {
    try {
      listener();
    } catch {}
  }
}

export const DATA_DIR = process.env.DB_DIR || path.join(process.cwd(), 'data');
export const DB_PATH = path.join(DATA_DIR, 'football_engine.db');

let rawDbInstance: Database.Database | null = null;
let isRecoveringDb = false;

const RECOVERY_TABLES = [
  'app_settings',
  'historical_matches',
  'upcoming_fixtures',
  'predictions',
  'prediction_measurements_cache',
  'match_odds_cache',
  'raw_feed_data',
  'flashscore_scraped_matches',
  'league_standings',
];

function createRawDbInstance(): Database.Database {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Clean up any legacy WAL/SHM sidecars to prevent cross-restart page errors
  try {
    if (fs.existsSync(`${DB_PATH}-wal`)) fs.unlinkSync(`${DB_PATH}-wal`);
    if (fs.existsSync(`${DB_PATH}-shm`)) fs.unlinkSync(`${DB_PATH}-shm`);
  } catch {}

  const db = new Database(DB_PATH, { timeout: 10000 });
  db.pragma('busy_timeout = 10000');
  db.pragma('journal_mode = DELETE');
  db.pragma('synchronous = FULL');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -64000'); // 64 MB memory page cache
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Safely checkpoints SQLite WAL changes to disk without blocking readers
 */
export function checkpointSqliteWal(mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE' = 'PASSIVE'): void {
  if (!rawDbInstance) return;
  try {
    rawDbInstance.pragma(`wal_checkpoint(${mode})`);
  } catch (err: any) {
    console.warn(`[SQLite] WAL checkpoint (${mode}) notice:`, err?.message);
  }
}

function cleanupOldCorruptBackups(): void {
  try {
    const files = fs.readdirSync(DATA_DIR);
    const corruptMainDbs = files
      .filter((f) => /^football_engine\.db\.corrupt\.\d+$/.test(f))
      .sort()
      .reverse();
    // Keep only the single most recent corrupt main DB file; remove older files and all corrupt WAL/SHM sidecars
    const keepSet = new Set(corruptMainDbs.slice(0, 1));
    for (const f of files) {
      if (f.includes('.corrupt.') && !keepSet.has(f)) {
        try {
          fs.unlinkSync(path.join(DATA_DIR, f));
        } catch {}
      }
    }
  } catch {}
}

/**
 * Attempts lossless recovery of all readable tables from a corrupted SQLite DB into a brand new clean B-tree file.
 * Falls back to empty DB reset only if the file is completely unreadable.
 */
export function recoverCorruptedSqliteDb(): Database.Database {
  if (isRecoveringDb && rawDbInstance) {
    return rawDbInstance;
  }

  isRecoveringDb = true;
  const repairedPath = `${DB_PATH}.repaired.${Date.now()}`;
  let recoveredRowsTotal = 0;

  try {
    console.warn('[SQLite] Detected malformed database image; starting automatic lossless B-tree recovery...');

    // Ensure any mid-flight transaction on rawDbInstance is rolled back before salvaging
    if (rawDbInstance && rawDbInstance.inTransaction) {
      try {
        rawDbInstance.exec('ROLLBACK');
      } catch {}
    }

    // 1. Ensure we have a readable source handle
    let sourceDb = rawDbInstance;
    let openedTempSource = false;
    if (!sourceDb) {
      try {
        sourceDb = new Database(DB_PATH, { readonly: true, timeout: 5000 });
        openedTempSource = true;
      } catch {
        sourceDb = null;
      }
    }

    // 2. Create fresh clean target database with full schema
    const targetDb = new Database(repairedPath, { timeout: 10000 });
    targetDb.pragma('journal_mode = DELETE');
    targetDb.pragma('synchronous = FULL');
    initSqliteSchemaInternal(targetDb);

    if (sourceDb) {
      for (const table of RECOVERY_TABLES) {
        let rows: any[] = [];
        try {
          rows = sourceDb.prepare(`SELECT * FROM ${table}`).all() as any[];
        } catch {
          // Fallback: scan rowids individually to salvage intact rows around corrupt B-tree leaves
          try {
            const idRows = sourceDb.prepare(`SELECT rowid FROM ${table}`).all() as Array<{ rowid: number }>;
            const singleStmt = sourceDb.prepare(`SELECT * FROM ${table} WHERE rowid = ?`);
            for (const { rowid } of idRows) {
              try {
                const row = singleStmt.get(rowid);
                if (row) rows.push(row);
              } catch {}
            }
          } catch {}
        }

        if (rows.length > 0) {
          try {
            const cols = Object.keys(rows[0]);
            const placeholders = cols.map(() => '?').join(', ');
            const insertStmt = targetDb.prepare(
              `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`
            );
            const insertBatch = targetDb.transaction((batch: any[]) => {
              for (const row of batch) {
                try {
                  insertStmt.run(...cols.map((c) => row[c]));
                  recoveredRowsTotal++;
                } catch {}
              }
            });
            insertBatch(rows);
          } catch (tableErr: any) {
            console.warn(`[SQLite] Partial table recovery notice for ${table}:`, tableErr?.message);
          }
        }
      }
    }

    if (openedTempSource && sourceDb) {
      try {
        sourceDb.close();
      } catch {}
    }

    // Verify recovered DB integrity before swapping
    const check = targetDb.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
    const isOk = check.length === 1 && check[0]?.integrity_check === 'ok';
    try {
      targetDb.close();
    } catch {}

    if (!isOk) {
      try {
        if (fs.existsSync(repairedPath)) fs.unlinkSync(repairedPath);
      } catch {}
      throw new Error('Recovered DB failed integrity verification');
    }

    // Close active handle and move corrupted files aside
    if (rawDbInstance) {
      try {
        rawDbInstance.close();
      } catch {}
      rawDbInstance = null;
    }

    const suffix = `.corrupt.${Date.now()}`;
    if (fs.existsSync(DB_PATH)) fs.renameSync(DB_PATH, `${DB_PATH}${suffix}`);
    if (fs.existsSync(`${DB_PATH}-wal`)) fs.renameSync(`${DB_PATH}-wal`, `${DB_PATH}-wal${suffix}`);
    if (fs.existsSync(`${DB_PATH}-shm`)) fs.renameSync(`${DB_PATH}-shm`, `${DB_PATH}-shm${suffix}`);

    fs.renameSync(repairedPath, DB_PATH);
    cleanupOldCorruptBackups();

    rawDbInstance = createRawDbInstance();
    initSqliteSchemaInternal(rawDbInstance);
    console.log(`[SQLite] Automatic database recovery succeeded (${recoveredRowsTotal} rows preserved, PRAGMA integrity_check = ok).`);
    loggerService.addLog({
      level: 'SUCCESS',
      category: 'DATABASE',
      source: 'SQLiteClient',
      message: `Automatic database recovery succeeded (${recoveredRowsTotal} rows preserved, integrity_check = ok)`,
      details: { recoveredRowsTotal },
    });
    return rawDbInstance;
  } catch (recoverErr: any) {
    console.warn('[SQLite] Lossless recovery fallback triggered reset:', recoverErr?.message);
    loggerService.addLog({
      level: 'WARN',
      category: 'DATABASE',
      source: 'SQLiteClient',
      message: `SQLite lossless recovery failed; falling back to reset: ${recoverErr?.message || 'Unknown error'}`,
      details: { error: recoverErr?.message, stack: recoverErr?.stack },
    });
    try {
      if (fs.existsSync(repairedPath)) fs.unlinkSync(repairedPath);
    } catch {}
    return resetCorruptedSqliteDb();
  } finally {
    isRecoveringDb = false;
  }
}

/**
 * Safely backs up and resets a confirmed corrupted SQLite database on disk
 */
export function resetCorruptedSqliteDb(): Database.Database {
  console.warn('[SQLite] Backing up and resetting confirmed corrupted database file...');
  if (rawDbInstance) {
    try {
      rawDbInstance.pragma('wal_checkpoint(TRUNCATE)');
    } catch {}
    try {
      rawDbInstance.close();
    } catch {}
    rawDbInstance = null;
  }

  const suffix = `.corrupt.${Date.now()}`;
  try {
    if (fs.existsSync(DB_PATH)) fs.renameSync(DB_PATH, `${DB_PATH}${suffix}`);
    if (fs.existsSync(`${DB_PATH}-wal`)) fs.renameSync(`${DB_PATH}-wal`, `${DB_PATH}-wal${suffix}`);
    if (fs.existsSync(`${DB_PATH}-shm`)) fs.renameSync(`${DB_PATH}-shm`, `${DB_PATH}-shm${suffix}`);
    cleanupOldCorruptBackups();
  } catch (err: any) {
    console.warn('[SQLite] Notice backing up corrupted database files:', err?.message);
  }

  rawDbInstance = createRawDbInstance();
  initSqliteSchemaInternal(rawDbInstance);
  console.log('[SQLite] Fresh database created and schema initialized successfully.');
  return rawDbInstance;
}

/**
 * Verifies SQLite B-Tree integrity on disk
 */
export function checkAndRepairSqliteIntegrity(dbInstance?: Database.Database): boolean {
  try {
    const db = dbInstance || getSqliteDb();
    const rows = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
    const isOk = rows.length === 1 && String(rows[0]?.integrity_check || '') === 'ok';
    if (!isOk) {
      const resultStr = rows.map((r) => r.integrity_check).join('; ');
      console.warn('[SQLite] Integrity check failed:', resultStr.slice(0, 180));
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'SQLiteClient',
        message: `SQLite integrity check failed: ${resultStr.slice(0, 220)}`,
        details: { integrityCheck: resultStr },
      });
      try {
        fs.appendFileSync('sqlite_debug.log', `[${new Date().toISOString()}] Integrity check failed: ${resultStr}\n`);
      } catch {}
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('[SQLite] Exception during integrity check:', err?.message);
    loggerService.addLog({
      level: 'ERROR',
      category: 'DATABASE',
      source: 'SQLiteClient',
      message: `Exception during SQLite integrity check: ${err?.message || 'Unknown error'}`,
      details: { error: err?.message, stack: err?.stack },
    });
    try {
      fs.appendFileSync('sqlite_debug.log', `[${new Date().toISOString()}] Exception during integrity check: ${err?.message}\n`);
    } catch {}
    return false;
  }
}

function isFatalSqliteCorruptionError(err: any): boolean {
  const code = String(err?.code || '').toUpperCase();
  if (code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB') {
    return true;
  }
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('database disk image is malformed') || msg.includes('file is not a database');
}

/**
 * Returns the current active raw SQLite database instance
 */
export function getSqliteDb(): Database.Database {
  if (!rawDbInstance) {
    try {
      rawDbInstance = createRawDbInstance();
    } catch (err: any) {
      if (isFatalSqliteCorruptionError(err)) {
        loggerService.addLog({
          level: 'WARN',
          category: 'DATABASE',
          source: 'SQLiteClient',
          message: `Fatal SQLite error on startup: ${err?.message || 'database malformed'}`,
          details: { code: err?.code, stack: err?.stack },
        });
        return resetCorruptedSqliteDb();
      }
      throw err;
    }
  }
  return rawDbInstance;
}

function wrapStatementWithCorruptionRecovery(sql: string, initialStmt: Database.Statement): Database.Statement {
  let currentStmt = initialStmt;
  return new Proxy(initialStmt, {
    get(target, prop, receiver) {
      const value = Reflect.get(currentStmt, prop, currentStmt);
      if (typeof value !== 'function') {
        return value;
      }
      if (prop === 'run' || prop === 'get' || prop === 'all' || prop === 'iterate') {
        return function (...args: any[]) {
          try {
            return (currentStmt as any)[prop](...args);
          } catch (err: any) {
            if (isFatalSqliteCorruptionError(err) && !isRecoveringDb) {
              console.error(`[SQLite] Malformed database caught during statement.${String(prop)}():`, err?.message);
              loggerService.addLog({
                level: 'ERROR',
                category: 'DATABASE',
                source: 'SQLiteClient',
                message: `SQLite corruption caught during statement.${String(prop)}(): ${err?.message}`,
                details: { sql: sql.slice(0, 160), code: err?.code, stack: err?.stack },
              });
              const freshDb = recoverCorruptedSqliteDb();
              currentStmt = freshDb.prepare(sql);
              return (currentStmt as any)[prop](...args);
            }
            throw err;
          }
        };
      }
      return value.bind(currentStmt);
    },
  });
}

/**
 * Proxy wrapper for sqliteDb (covers DB methods, prepared statements, and transactions)
 */
export const sqliteDb: Database.Database = new Proxy({} as any, {
  get(_target, prop, receiver) {
    const db = getSqliteDb();
    const value = Reflect.get(db, prop, receiver);

    if (typeof value === 'function') {
      if (prop === 'prepare') {
        return function (sql: string) {
          try {
            const stmt = db.prepare(sql);
            return wrapStatementWithCorruptionRecovery(sql, stmt);
          } catch (err: any) {
            if (isFatalSqliteCorruptionError(err) && !isRecoveringDb) {
              console.error('[SQLite] Malformed database caught during prepare():', err?.message);
              loggerService.addLog({
                level: 'ERROR',
                category: 'DATABASE',
                source: 'SQLiteClient',
                message: `SQLite corruption caught during prepare(): ${err?.message}`,
                details: { sql: sql.slice(0, 160), code: err?.code, stack: err?.stack },
              });
              const freshDb = recoverCorruptedSqliteDb();
              const stmt = freshDb.prepare(sql);
              return wrapStatementWithCorruptionRecovery(sql, stmt);
            }
            throw err;
          }
        };
      }

      if (prop === 'transaction') {
        return function (fn: (...args: any[]) => any) {
          const tx = db.transaction(fn);
          return function (...args: any[]) {
            try {
              return tx(...args);
            } catch (err: any) {
              if (isFatalSqliteCorruptionError(err) && !isRecoveringDb) {
                console.error('[SQLite] Malformed database caught during transaction():', err?.message);
                loggerService.addLog({
                  level: 'ERROR',
                  category: 'DATABASE',
                  source: 'SQLiteClient',
                  message: `SQLite corruption caught during transaction(): ${err?.message}`,
                  details: { code: err?.code, stack: err?.stack },
                });
                const freshDb = recoverCorruptedSqliteDb();
                const freshTx = freshDb.transaction(fn);
                return freshTx(...args);
              }
              throw err;
            }
          };
        };
      }

      return function (...args: any[]) {
        try {
          return value.apply(db, args);
        } catch (err: any) {
          if (isFatalSqliteCorruptionError(err) && !isRecoveringDb && !checkAndRepairSqliteIntegrity(db)) {
            console.error('[SQLite] Confirmed database corruption detected during execution:', err?.message);
            loggerService.addLog({
              level: 'ERROR',
              category: 'DATABASE',
              source: 'SQLiteClient',
              message: `Confirmed SQLite corruption during ${String(prop)}(): ${err?.message}`,
              details: { code: err?.code, stack: err?.stack },
            });
            try {
              fs.appendFileSync('sqlite_debug.log', `[${new Date().toISOString()}] Confirmed corruption caught during ${String(prop)}: ${err?.message}\n`);
            } catch {}
            const freshDb = recoverCorruptedSqliteDb();
            const freshMethod = (freshDb as any)[prop];
            if (typeof freshMethod === 'function') {
              return freshMethod.apply(freshDb, args);
            }
          }
          throw err;
        }
      };
    }
    return value;
  },
});

function initSqliteSchemaInternal(targetDb: Database.Database): void {
  targetDb.exec(`
    -- PILLAR 1: Historical Matches for xG, Shot Efficiency & Form Momentum
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
      hs INTEGER,
      as_shots INTEGER,
      hst INTEGER,
      ast INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_hist_div ON historical_matches(div);
    CREATE INDEX IF NOT EXISTS idx_hist_date ON historical_matches(match_date);
    CREATE INDEX IF NOT EXISTS idx_hist_home ON historical_matches(home_team);
    CREATE INDEX IF NOT EXISTS idx_hist_away ON historical_matches(away_team);

    -- PILLARS 3 & 5: Upcoming Fixtures with Tactical Rest Days
    CREATE TABLE IF NOT EXISTS upcoming_fixtures (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL DEFAULT 'FLASHSCORE',
      league TEXT NOT NULL,
      league_name TEXT NOT NULL,
      match_date TEXT NOT NULL,
      kick_off_time TEXT NOT NULL,
      timestamp INTEGER,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      home_badge TEXT,
      away_badge TEXT,
      stage TEXT,
      rest_days_home INTEGER,
      rest_days_away INTEGER,
      status TEXT NOT NULL DEFAULT 'SCHEDULED',
      score_json TEXT,
      prediction_json TEXT,
      markets_json TEXT,
      best_value_market_json TEXT,
      home_stats_json TEXT,
      away_stats_json TEXT,
      measurements_json TEXT,
      h2h_matches_json TEXT,
      information_json TEXT,
      statistics_json TEXT,
      market_odds_json TEXT,
      feed_path TEXT,
      league_url TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_upcoming_date ON upcoming_fixtures(match_date);
    CREATE INDEX IF NOT EXISTS idx_upcoming_league ON upcoming_fixtures(league);
    CREATE INDEX IF NOT EXISTS idx_upcoming_status_date ON upcoming_fixtures(status, match_date);

    -- UNIFIED PREDICTIONS TABLE: Dixon-Coles Poisson Predictions
    -- Used for upcoming, live, and historical evaluation
    CREATE TABLE IF NOT EXISTS predictions (
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
      status TEXT NOT NULL DEFAULT 'SCHEDULED', -- Flashscore status: SCHEDULED, LIVE, FINISHED
      match_state TEXT DEFAULT 'upcoming', -- Internal state: upcoming, completed
      home_score INTEGER,
      away_score INTEGER,
      home_xg REAL,
      away_xg REAL,
      home_win_prob REAL,
      draw_prob REAL,
      away_win_prob REAL,
      over15_prob REAL,
      over25_prob REAL,
      over35_prob REAL,
      btts_prob REAL,
      tip_key TEXT, -- The 1x2 prediction key: HOME_WIN, DRAW, AWAY_WIN
      tip_name TEXT,
      tip_prob REAL,
      full_fixture_json TEXT,
      predicted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(match_date);
    CREATE INDEX IF NOT EXISTS idx_predictions_league ON predictions(league);
    CREATE INDEX IF NOT EXISTS idx_predictions_state ON predictions(match_state);
    CREATE INDEX IF NOT EXISTS idx_predictions_state_league ON predictions(match_state, league);
    CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);

    -- PILLAR 2: Head-to-Head & Venue Splits Measurement Cache
    CREATE TABLE IF NOT EXISTS prediction_measurements_cache (
      fixture_id TEXT PRIMARY KEY,
      h2h_json TEXT NOT NULL,
      calculated_at TEXT NOT NULL
    );

    -- SCRAPED MARKET ODDS CACHE: Flashscore bookmaker odds & implied probabilities
    CREATE TABLE IF NOT EXISTS match_odds_cache (
      fixture_id TEXT PRIMARY KEY,
      odds_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    -- BET SLIPS & BET BUILDER TABLE
    CREATE TABLE IF NOT EXISTS bets (
      id TEXT PRIMARY KEY,
      stake REAL NOT NULL,
      total_odds REAL NOT NULL,
      potential_win REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'Birr',
      status TEXT NOT NULL DEFAULT 'PENDING',
      selections_json TEXT NOT NULL,
      placed_at TEXT NOT NULL,
      evaluated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);
    CREATE INDEX IF NOT EXISTS idx_bets_placed ON bets(placed_at DESC);

    -- ARCHIVAL: Single-Instance Compressed Raw Feeds (strictly 1 row per daily feed)
    CREATE TABLE IF NOT EXISTS raw_feed_data (
      feed_path TEXT PRIMARY KEY,
      compressed_data BLOB NOT NULL,
      uncompressed_length INTEGER NOT NULL,
      matches_count INTEGER NOT NULL DEFAULT 0,
      scraped_at TEXT NOT NULL
    );

    -- Auxiliary stores
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
    CREATE INDEX IF NOT EXISTS idx_scraped_scraped_at ON flashscore_scraped_matches(scraped_at DESC);
    CREATE INDEX IF NOT EXISTS idx_scraped_teams_date ON flashscore_scraped_matches(home_name, away_name, match_date);

    CREATE TABLE IF NOT EXISTS league_standings (
      league_code TEXT PRIMARY KEY,
      league_name TEXT NOT NULL,
      country TEXT,
      league_url TEXT,
      season TEXT,
      standings_json TEXT NOT NULL,
      groups_json TEXT,
      source TEXT NOT NULL DEFAULT 'FLASHSCORE_SCRAPED',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

let isSchemaInitialized = false;

/**
 * Initializes all database tables and indexes for the unified 5-Pillar Football Engine
 */
export function initSqliteSchema(): void {
  if (isSchemaInitialized && rawDbInstance) return;

  try {
    const db = getSqliteDb();
    initSqliteSchemaInternal(db);

    // Schema Migration: Ensure new columns exist in upcoming_fixtures
    try {
      const columns = db.prepare("PRAGMA table_info(upcoming_fixtures)").all() as any[];
      const columnNames = columns.map(c => c.name);
      
      if (!columnNames.includes('information_json')) {
        console.log('[SQLite] Migrating upcoming_fixtures: Adding information_json column');
        db.exec("ALTER TABLE upcoming_fixtures ADD COLUMN information_json TEXT;");
      }
      if (!columnNames.includes('statistics_json')) {
        console.log('[SQLite] Migrating upcoming_fixtures: Adding statistics_json column');
        db.exec("ALTER TABLE upcoming_fixtures ADD COLUMN statistics_json TEXT;");
      }
      if (!columnNames.includes('market_odds_json')) {
        console.log('[SQLite] Migrating upcoming_fixtures: Adding market_odds_json column');
        db.exec("ALTER TABLE upcoming_fixtures ADD COLUMN market_odds_json TEXT;");
      }
      if (!columnNames.includes('timestamp')) {
        console.log('[SQLite] Migrating upcoming_fixtures: Adding timestamp column and backfilling');
        db.exec("ALTER TABLE upcoming_fixtures ADD COLUMN timestamp INTEGER;");
        db.exec("UPDATE upcoming_fixtures SET timestamp = CAST(strftime('%s', match_date || ' ' || kick_off_time || ':00') AS INTEGER) WHERE timestamp IS NULL AND kick_off_time LIKE '%:%';");
      }
      if (!columnNames.includes('league_url')) {
        db.exec("ALTER TABLE upcoming_fixtures ADD COLUMN league_url TEXT;");
      }
    } catch (migErr: any) {
      console.warn('[SQLite] Migration note for upcoming_fixtures:', migErr?.message);
    }

    // Schema Migration: Ensure league_standings supports groups_json, league_url, season
    try {
      const stCols = db.prepare("PRAGMA table_info(league_standings)").all() as any[];
      const stColNames = stCols.map((c) => c.name);
      if (!stColNames.includes('league_url')) {
        db.exec("ALTER TABLE league_standings ADD COLUMN league_url TEXT;");
      }
      if (!stColNames.includes('season')) {
        db.exec("ALTER TABLE league_standings ADD COLUMN season TEXT;");
      }
      if (!stColNames.includes('groups_json')) {
        db.exec("ALTER TABLE league_standings ADD COLUMN groups_json TEXT;");
      }
    } catch (migErr: any) {
      console.warn('[SQLite] Migration note for league_standings:', migErr?.message);
    }

    // Schema Migration: Handle transition to unified predictions table
    try {
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='predictions'").get();
      if (!tableCheck) {
        console.log('[SQLite] Creating unified predictions table and migrating data if possible...');
        // Temporary: drop old tables if they exist to avoid confusion
        db.exec("DROP TABLE IF EXISTS upcoming_predictions;");
        db.exec("DROP TABLE IF EXISTS live_predictions;");
        db.exec("DROP TABLE IF EXISTS historical_predictions;");
      } else {
        const predCols = db.prepare("PRAGMA table_info(predictions)").all() as any[];
        if (!predCols.map(c => c.name).includes('timestamp')) {
          console.log('[SQLite] Migrating predictions: Adding timestamp column');
          db.exec("ALTER TABLE predictions ADD COLUMN timestamp INTEGER;");
          db.exec("UPDATE predictions SET timestamp = CAST(strftime('%s', match_date || ' ' || kick_off_time || ':00') AS INTEGER) WHERE timestamp IS NULL AND kick_off_time LIKE '%:%';");
        }
      }
    } catch (migErr: any) {
      console.warn('[SQLite] Migration note for unified predictions:', migErr?.message);
    }

    // Ensure flashscore_scraped_matches also has these columns
    try {
      const columns = db.prepare("PRAGMA table_info(flashscore_scraped_matches)").all() as any[];
      const columnNames = columns.map(c => c.name);
      if (!columnNames.includes('information_json')) {
        db.exec("ALTER TABLE flashscore_scraped_matches ADD COLUMN information_json TEXT;");
      }
      if (!columnNames.includes('statistics_json')) {
        db.exec("ALTER TABLE flashscore_scraped_matches ADD COLUMN statistics_json TEXT;");
      }
    } catch {}

    // Ensure default engine_settings row exists in app_settings
    try {
      db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('engine_settings', ?)").run(
        JSON.stringify(DEFAULT_ENGINE_SETTINGS)
      );
    } catch {}

    isSchemaInitialized = true;
  } catch (err: any) {
    console.warn('[SQLite] Error during schema init:', err?.message);
  }
}

/**
 * Gzip compression helper for raw feeds
 */
export function compressString(str: string): Buffer {
  return zlib.gzipSync(Buffer.from(str, 'utf-8'), { level: 6 });
}

/**
 * Gzip decompression helper for raw feeds
 */
export function decompressBuffer(buf: Buffer): string {
  try {
    return zlib.gunzipSync(buf).toString('utf-8');
  } catch {
    return buf.toString('utf-8');
  }
}

/**
 * Returns disk stats for the SQLite database
 */
export function getSqliteDbStats(): {
  path: string;
  sizeBytes: number;
  sizeMB: number;
  journalMode: string;
  tableCounts: Record<string, number>;
  walSizeBytes: number;
} {
  let sizeBytes = 0;
  let walSizeBytes = 0;

  try {
    if (fs.existsSync(DB_PATH)) {
      sizeBytes = fs.statSync(DB_PATH).size;
    }
    const walPath = `${DB_PATH}-wal`;
    if (fs.existsSync(walPath)) {
      walSizeBytes = fs.statSync(walPath).size;
    }
  } catch {}

  const tableCounts: Record<string, number> = {};
  const tables = [
    'historical_matches',
    'upcoming_fixtures',
    'predictions',
    'prediction_measurements_cache',
    'match_odds_cache',
    'raw_feed_data',
    'flashscore_scraped_matches',
    'league_standings',
  ];

  for (const table of tables) {
    try {
      const row = sqliteDb.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as any;
      tableCounts[table] = row ? Number(row.count) : 0;
    } catch {
      tableCounts[table] = 0;
    }
  }

  const totalSize = sizeBytes + walSizeBytes;

  return {
    path: DB_PATH,
    sizeBytes: totalSize,
    sizeMB: Number((totalSize / (1024 * 1024)).toFixed(2)),
    journalMode: 'WAL',
    tableCounts,
    walSizeBytes,
  };
}

export function closeSqliteDb(): void {
  if (rawDbInstance) {
    try {
      rawDbInstance.pragma('wal_checkpoint(TRUNCATE)');
      rawDbInstance.close();
    } catch (err: any) {
      console.warn('[SQLite] Notice closing database:', err?.message);
    }
    rawDbInstance = null;
  }
}

// Process exit handlers to flush WAL and close DB handles cleanly
process.on('SIGINT', () => {
  closeSqliteDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeSqliteDb();
  process.exit(0);
});

process.on('exit', () => {
  closeSqliteDb();
});
