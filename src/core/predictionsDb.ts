import { Fixture } from './types.js';
import { getLeaguePriority } from './leaguePriority.js';
import { isMatchStarted } from './accumulator.js';
import { getPossibleDateStrs, getRelativeDateStr, normalizeDateStr, normalizeTimeStr } from './dateUtils.js';
import { matchesLeague } from './leagueMapper.js';
import { predictionsTurso, safeTursoBatch } from './tursoClient.js';

export class PredictionsDB {
  private isInitialized = false;
  private memoryFallback: Map<string, Fixture> = new Map();
  private liveMemoryFallback: Map<string, Fixture> = new Map();
  private historyMemoryFallback: Map<string, Fixture> = new Map();

  async init(): Promise<void> {
    if (this.isInitialized) return;

    if (predictionsTurso) {
      try {
        console.log('[PredictionsDB] Initializing Turso cloud prediction tables...');
        await this.createTablesOnTurso();
        console.log('[PredictionsDB] Turso prediction tables verified.');
      } catch (err: any) {
        console.warn('[PredictionsDB] Turso predictions init note:', err?.message);
      }
    } else {
      console.log('[PredictionsDB] Running predictions in memory mode (No predictions Turso URL).');
    }

    this.isInitialized = true;
  }

  private async createTablesOnTurso(): Promise<void> {
    if (!predictionsTurso) return;

    const queries = [
      `CREATE TABLE IF NOT EXISTS upcoming_predictions (
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
      );`,
      `CREATE INDEX IF NOT EXISTS idx_pred_date ON upcoming_predictions(match_date);`,
      `CREATE INDEX IF NOT EXISTS idx_pred_league ON upcoming_predictions(league);`,

      `CREATE TABLE IF NOT EXISTS live_predictions (
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
      );`,

      `CREATE TABLE IF NOT EXISTS historical_predictions (
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
      );`,
      `CREATE INDEX IF NOT EXISTS idx_hist_pred_date ON historical_predictions(match_date);`,
    ];

    for (const q of queries) {
      try {
        await predictionsTurso.execute(q);
      } catch (err: any) {
        console.warn('[PredictionsDB] Turso query note:', err?.message);
      }
    }
  }

  async savePredictions(fixtures: Fixture[]): Promise<void> {
    if (!fixtures || fixtures.length === 0) return;

    for (const f of fixtures) {
      if (f.id) {
        this.memoryFallback.set(f.id, f);
      }
    }

    if (predictionsTurso) {
      try {
        const now = new Date().toISOString();
        const batchStatements = fixtures.map((f) => {
          const pred = f.prediction;
          const bestTip = f.bestValueMarket;

          return {
            sql: `INSERT OR REPLACE INTO upcoming_predictions (
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
            )`,
            args: [
              f.id,
              f.league || 'ALL',
              f.leagueName || f.league || 'Unknown League',
              f.stage || null,
              normalizeDateStr(f.matchDate),
              normalizeTimeStr(f.kickOffTime || 'TBD'),
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
            ],
          };
        });

        await safeTursoBatch(predictionsTurso, batchStatements, 25);
      } catch (err: any) {
        console.error('[PredictionsDB] Error saving predictions to Turso:', err?.message);
      }
    }
  }

  async getPredictionsAsync(filters?: {
    league?: string;
    date?: string;
    dateFilter?: string;
    startDate?: string;
    endDate?: string;
    unstartedOnly?: boolean;
  }): Promise<Fixture[]> {
    let fixtures: Fixture[] = [];

    if (predictionsTurso) {
      try {
        let sql = `SELECT full_fixture_json FROM upcoming_predictions WHERE 1=1`;
        const args: any[] = [];

        if (filters?.date) {
          sql += ` AND match_date = ?`;
          args.push(filters.date);
        }

        sql += ` ORDER BY match_date ASC, kick_off_time ASC`;

        const res = await predictionsTurso.execute({ sql, args });
        if (res.rows && res.rows.length > 0) {
          for (const row of res.rows) {
            if (row.full_fixture_json) {
              try {
                const parsed = JSON.parse(String(row.full_fixture_json)) as Fixture;
                fixtures.push(parsed);
              } catch {}
            }
          }
        }
      } catch (err: any) {
        console.warn('[PredictionsDB] Error querying Turso predictions:', err?.message);
      }
    }

    if (fixtures.length === 0) {
      fixtures = Array.from(this.memoryFallback.values());
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

  getPredictions(filters?: {
    league?: string;
    date?: string;
    dateFilter?: string;
    startDate?: string;
    endDate?: string;
    unstartedOnly?: boolean;
  }): Fixture[] {
    let fixtures = Array.from(this.memoryFallback.values());
    if (filters?.league && filters.league !== 'ALL') {
      fixtures = fixtures.filter((f) => matchesLeague(f.league, f.leagueName, filters.league!));
    }
    return fixtures;
  }

  getPredictionById(fixtureId: string): Fixture | null {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '');

    if (this.memoryFallback.has(fixtureId)) return this.memoryFallback.get(fixtureId)!;
    if (this.memoryFallback.has(cleanId)) return this.memoryFallback.get(cleanId)!;
    if (this.liveMemoryFallback.has(fixtureId)) return this.liveMemoryFallback.get(fixtureId)!;
    if (this.historyMemoryFallback.has(fixtureId)) return this.historyMemoryFallback.get(fixtureId)!;

    return null;
  }

  getAllPredictions(): Fixture[] {
    return this.getPredictions({ dateFilter: 'ALL' });
  }

  count(): number {
    return this.memoryFallback.size;
  }

  clearPredictions(): void {
    this.memoryFallback.clear();
    if (predictionsTurso) {
      predictionsTurso.execute('DELETE FROM upcoming_predictions;').catch(() => {});
    }
  }

  async saveLivePredictions(fixtures: Fixture[]): Promise<void> {
    if (!fixtures || fixtures.length === 0) return;

    for (const f of fixtures) {
      if (f.id) {
        this.liveMemoryFallback.set(f.id, f);
      }
    }

    if (predictionsTurso) {
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
            f.id,
            f.league || 'ALL',
            f.leagueName || f.league || 'Live',
            f.matchDate,
            f.kickOffTime || 'LIVE',
            f.homeTeam,
            f.awayTeam,
            'LIVE',
            new Date().toISOString(),
            f.odds.homeWin || 2.0,
            f.odds.draw || 3.0,
            f.odds.awayWin || 3.5,
            f.prediction?.homeXG ?? 1.35,
            f.prediction?.awayXG ?? 1.10,
            f.prediction?.homeWinProb ?? 0.45,
            f.prediction?.drawProb ?? 0.28,
            f.prediction?.awayWinProb ?? 0.27,
            f.prediction?.over15Prob ?? 0.75,
            f.prediction?.over25Prob ?? 0.50,
            f.prediction?.over35Prob ?? 0.28,
            f.prediction?.bttsProb ?? 0.52,
            f.bestValueMarket?.key || 'HOME_WIN',
            f.bestValueMarket?.name || 'Home Win',
            f.bestValueMarket?.odds || f.odds.homeWin || 2.0,
            f.bestValueMarket?.probability || f.prediction?.homeWinProb || 0.45,
            f.bestValueMarket?.expectedValue || 0,
            JSON.stringify(f),
          ],
        }));

        await safeTursoBatch(predictionsTurso, batchStatements, 25);
      } catch {}
    }
  }

  getLivePredictions(filters?: { league?: string; limit?: number }): Fixture[] {
    let fixtures = Array.from(this.liveMemoryFallback.values());
    if (filters?.league && filters.league !== 'ALL') {
      fixtures = fixtures.filter((f) => matchesLeague(f.league, f.leagueName, filters.league!));
    }
    return fixtures;
  }

  countLivePredictions(): number {
    return this.liveMemoryFallback.size;
  }

  async saveHistoricalPredictions(fixtures: Fixture[]): Promise<void> {
    if (!fixtures || fixtures.length === 0) return;

    for (const f of fixtures) {
      if (f.id) {
        this.historyMemoryFallback.set(f.id, f);
      }
    }

    if (predictionsTurso) {
      try {
        const now = new Date().toISOString();
        const batchStatements = fixtures.map((f) => {
          const pred = f.prediction;
          const bestTip = f.bestValueMarket;

          return {
            sql: `INSERT OR REPLACE INTO historical_predictions (
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
            )`,
            args: [
              f.id,
              f.league || 'ALL',
              f.leagueName || f.league || 'Historical Match',
              f.stage || null,
              normalizeDateStr(f.matchDate),
              normalizeTimeStr(f.kickOffTime || 'FT'),
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
            ],
          };
        });

        await safeTursoBatch(predictionsTurso, batchStatements, 25);
      } catch (err: any) {
        console.error('[PredictionsDB] Error saving historical predictions to Turso:', err?.message);
      }
    }
  }

  getHistoricalPredictions(filters?: { league?: string; limit?: number }): Fixture[] {
    let fixtures = Array.from(this.historyMemoryFallback.values());
    if (filters?.league && filters.league !== 'ALL') {
      fixtures = fixtures.filter((f) => matchesLeague(f.league, f.leagueName, filters.league!));
    }
    return fixtures;
  }

  countHistoricalPredictions(): number {
    return this.historyMemoryFallback.size;
  }

  async clearAll(): Promise<void> {
    this.memoryFallback.clear();
    this.liveMemoryFallback.clear();
    this.historyMemoryFallback.clear();

    if (predictionsTurso) {
      try {
        await predictionsTurso.execute('DELETE FROM upcoming_predictions;');
        await predictionsTurso.execute('DELETE FROM live_predictions;');
        await predictionsTurso.execute('DELETE FROM historical_predictions;');
      } catch {}
    }
  }
}

export const predictionsDb = new PredictionsDB();
