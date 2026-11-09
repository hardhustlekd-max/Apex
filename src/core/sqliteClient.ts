import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'football_engine.db');

let rawDbInstance: Database.Database | null = null;

function createRawDbInstance(): Database.Database {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -64000'); // 64 MB memory page cache
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Safely resets a corrupted or malformed SQLite database on disk
 */
export function resetCorruptedSqliteDb(): Database.Database {
  console.warn('[SQLite] Resetting malformed or corrupted database file...');
  if (rawDbInstance) {
    try {
      rawDbInstance.close();
    } catch {}
    rawDbInstance = null;
  }

  try {
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    if (fs.existsSync(`${DB_PATH}-wal`)) fs.unlinkSync(`${DB_PATH}-wal`);
    if (fs.existsSync(`${DB_PATH}-shm`)) fs.unlinkSync(`${DB_PATH}-shm`);
  } catch (err: any) {
    console.warn('[SQLite] Notice unlinking database files:', err?.message);
  }

  rawDbInstance = createRawDbInstance();
  initSqliteSchemaInternal(rawDbInstance);
  console.log('[SQLite] Fresh database created and schema initialized successfully.');
  return rawDbInstance;
}

/**
 * Verifies SQLite B-Tree integrity on disk and resets if malformed
 */
export function checkAndRepairSqliteIntegrity(dbInstance?: Database.Database): boolean {
  try {
    const db = dbInstance || getSqliteDb();
    const row = db.prepare('PRAGMA integrity_check').get() as any;
    const resultStr = String(row?.integrity_check || '');
    if (resultStr !== 'ok') {
      console.warn('[SQLite] Integrity check failed:', resultStr.slice(0, 120));
      resetCorruptedSqliteDb();
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('[SQLite] Exception during integrity check:', err?.message);
    resetCorruptedSqliteDb();
    return false;
  }
}

/**
 * Returns the current active raw SQLite database instance
 */
export function getSqliteDb(): Database.Database {
  if (!rawDbInstance) {
    try {
      rawDbInstance = createRawDbInstance();
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('malformed') || msg.includes('corrupt') || msg.includes('disk image')) {
        return resetCorruptedSqliteDb();
      }
      throw err;
    }
  }
  return rawDbInstance;
}

/**
 * Proxy wrapper for sqliteDb that transparently auto-recovers on disk corruption or malformed image errors
 */
export const sqliteDb: Database.Database = new Proxy({} as any, {
  get(_target, prop, receiver) {
    const db = getSqliteDb();
    const value = Reflect.get(db, prop, receiver);

    if (typeof value === 'function') {
      return function (...args: any[]) {
        try {
          return value.apply(db, args);
        } catch (err: any) {
          const msg = String(err?.message || '').toLowerCase();
          if (msg.includes('malformed') || msg.includes('corrupt') || msg.includes('disk image')) {
            console.error('[SQLite] Malformed database error detected:', err?.message);
            const freshDb = resetCorruptedSqliteDb();
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

    -- PILLARS 3 & 5: Upcoming Fixtures with Odds & Tactical Rest Days
    CREATE TABLE IF NOT EXISTS upcoming_fixtures (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL DEFAULT 'FLASHSCORE',
      league TEXT NOT NULL,
      league_name TEXT NOT NULL,
      match_date TEXT NOT NULL,
      kick_off_time TEXT NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      home_badge TEXT,
      away_badge TEXT,
      stage TEXT,
      rest_days_home INTEGER DEFAULT 7,
      rest_days_away INTEGER DEFAULT 7,
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
      information_json TEXT,
      statistics_json TEXT,
      feed_path TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_upcoming_date ON upcoming_fixtures(match_date);
    CREATE INDEX IF NOT EXISTS idx_upcoming_league ON upcoming_fixtures(league);

    -- PILLARS 4 & 5: Dixon-Coles Poisson Predictions & Value Bet Calculations
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
      full_fixture_json TEXT,
      predicted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pred_date ON upcoming_predictions(match_date);
    CREATE INDEX IF NOT EXISTS idx_pred_league ON upcoming_predictions(league);

    -- Live predictions cache
    CREATE TABLE IF NOT EXISTS live_predictions (
      fixture_id TEXT PRIMARY KEY,
      league TEXT NOT NULL,
      league_name TEXT NOT NULL,
      match_date TEXT NOT NULL,
      kick_off_time TEXT NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'LIVE',
      predicted_at TEXT NOT NULL,
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
      tip_key TEXT,
      tip_name TEXT,
      tip_odds REAL,
      tip_prob REAL,
      tip_ev REAL,
      full_fixture_json TEXT
    );

    -- Historical finished predictions
    CREATE TABLE IF NOT EXISTS historical_predictions (
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
      status TEXT NOT NULL DEFAULT 'FINISHED',
      home_score INTEGER,
      away_score INTEGER,
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
      tip_key TEXT,
      tip_name TEXT,
      tip_odds REAL,
      tip_prob REAL,
      tip_ev REAL,
      is_positive_ev INTEGER NOT NULL DEFAULT 0,
      is_banker INTEGER NOT NULL DEFAULT 0,
      full_fixture_json TEXT,
      predicted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hist_pred_date ON historical_predictions(match_date);

    -- PILLAR 2: Head-to-Head & Venue Splits Measurement Cache
    CREATE TABLE IF NOT EXISTS prediction_measurements_cache (
      fixture_id TEXT PRIMARY KEY,
      h2h_json TEXT NOT NULL,
      calculated_at TEXT NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS league_standings (
      league_code TEXT PRIMARY KEY,
      league_name TEXT NOT NULL,
      country TEXT,
      standings_json TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'FLASHSCORE_SCRAPED',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS football_tips_cache (
      id TEXT PRIMARY KEY,
      tips_json TEXT NOT NULL,
      headline_summary TEXT NOT NULL,
      raw_markdown TEXT NOT NULL,
      sources_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

/**
 * Initializes all database tables and indexes for the unified 5-Pillar Football Engine
 */
export function initSqliteSchema(): void {
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
    } catch (migErr: any) {
      console.warn('[SQLite] Migration note for upcoming_fixtures:', migErr?.message);
    }

    // Schema Migration: Ensure upcoming_predictions has full_fixture_json and other recent columns
    try {
      const columns = db.prepare("PRAGMA table_info(upcoming_predictions)").all() as any[];
      const columnNames = columns.map(c => c.name);
      
      if (columnNames.length > 0) {
        if (!columnNames.includes('full_fixture_json')) {
          console.log('[SQLite] Migrating upcoming_predictions: Adding full_fixture_json column');
          db.exec("ALTER TABLE upcoming_predictions ADD COLUMN full_fixture_json TEXT;");
        }
        if (!columnNames.includes('is_banker')) {
          console.log('[SQLite] Migrating upcoming_predictions: Adding is_banker column');
          db.exec("ALTER TABLE upcoming_predictions ADD COLUMN is_banker INTEGER DEFAULT 0;");
        }
      }
    } catch (migErr: any) {
      console.warn('[SQLite] Migration note for upcoming_predictions:', migErr?.message);
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

    checkAndRepairSqliteIntegrity(db);
  } catch (err: any) {
    console.warn('[SQLite] Error during schema init, auto-recovering clean database:', err?.message);
    resetCorruptedSqliteDb();
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
    'upcoming_predictions',
    'live_predictions',
    'historical_predictions',
    'prediction_measurements_cache',
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

// Clean process exit handler to flush WAL and close DB handles cleanly
process.on('exit', () => {
  if (rawDbInstance) {
    try {
      rawDbInstance.close();
    } catch {}
  }
});
