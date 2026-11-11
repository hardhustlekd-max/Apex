import { Fixture } from './types.js';
import { getLeaguePriority } from './leaguePriority.js';
import { isMatchStarted } from './accumulator.js';
import { getPossibleDateStrs, getRelativeDateStr, normalizeDateStr } from './dateUtils.js';
import { matchesLeague } from './leagueMapper.js';
import { sqliteDb } from './sqliteClient.js';
import { loggerService } from '../services/loggerService.js';

export class PredictionsDB {
  private isInitialized = false;

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('[PredictionsDB] Initialized local SQLite prediction store in WAL mode.');
    } catch (err: any) {
      console.warn('[PredictionsDB] SQLite predictions initialization notice:', err?.message);
    }

    this.isInitialized = true;
  }

  /**
   * Helper to produce a clean, lean fixture representation for JSON storage
   * (strips the transient 100-cell probability matrix which is recomputed on-demand in <0.1ms)
   */
  private sanitizeFixtureForStorage(f: Fixture): string {
    const lean = {
      ...f,
      prediction: f.prediction
        ? {
            ...f.prediction,
            probabilityMatrix: undefined, // Strip 100-cell grid to save 80KB per row
          }
        : undefined,
    };
    return JSON.stringify(lean);
  }

  async savePredictions(fixtures: Fixture[]): Promise<void> {
    if (!fixtures || fixtures.length === 0) return;

    const finishedFixtures: Fixture[] = [];
    const upcomingToPersist: Fixture[] = [];

    for (const f of fixtures) {
      if (f.status === 'FINISHED') {
        finishedFixtures.push(f);
      } else {
        upcomingToPersist.push(f);
      }
    }

    if (finishedFixtures.length > 0) {
      await this.saveHistoricalPredictions(finishedFixtures);
    }

    if (upcomingToPersist.length > 0) {
      try {
        const stmt = sqliteDb.prepare(`
          INSERT OR REPLACE INTO upcoming_predictions (
            fixture_id, league, league_name, stage, match_date, kick_off_time,
            home_team, away_team, home_badge, away_badge, status,
            home_xg, away_xg, home_win_prob, draw_prob, away_win_prob,
            over15_prob, over25_prob, over35_prob, btts_prob,
            tip_key, tip_name, tip_prob, full_fixture_json, predicted_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?
          )
        `);

        const now = new Date().toISOString();
        const insertMany = sqliteDb.transaction((rows: Fixture[]) => {
          let savedCount = 0;
          for (const f of rows) {
            try {
              const pred = f.prediction;
              const bestTip = f.mostLikelyOutcome;

              stmt.run(
                f.id,
                f.league || 'ALL',
                f.leagueName || f.league || 'Unknown League',
                f.stage || null,
                normalizeDateStr(f.matchDate),
                f.kickOffTime || 'TBD',
                f.homeTeam,
                f.awayTeam,
                f.homeBadge || null,
                f.awayBadge || null,
                f.status || 'SCHEDULED',
                pred?.homeXG ?? null,
                pred?.awayXG ?? null,
                pred?.homeWinProb ?? null,
                pred?.drawProb ?? null,
                pred?.awayWinProb ?? null,
                pred?.over15Prob ?? null,
                pred?.over25Prob ?? null,
                pred?.over35Prob ?? null,
                pred?.bttsProb ?? null,
                bestTip?.marketKey || null,
                (bestTip as any)?.selection || bestTip?.marketKey || null,
                bestTip?.probability || pred?.homeWinProb || null,
                this.sanitizeFixtureForStorage(f),
                now
              );
              savedCount++;
            } catch (rowErr: any) {
              console.warn(`[PredictionsDB] Failed to save fixture ${f.id} (${f.homeTeam} vs ${f.awayTeam}):`, rowErr?.message);
            }
          }
          console.log(`[PredictionsDB] Successfully saved ${savedCount}/${rows.length} predictions to SQLite.`);
        });

        insertMany(upcomingToPersist);
      } catch (err: any) {
        console.error('[PredictionsDB] Error persisting predictions to SQLite:', err?.message);
        loggerService.addLog({
          level: 'ERROR',
          category: 'DATABASE',
          source: 'PredictionsDB',
          message: `Error persisting predictions: ${err?.message}`,
          details: { count: upcomingToPersist.length, firstId: upcomingToPersist[0]?.id },
        });
        throw err; // Re-throw to let caller handle it
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
    return this.getPredictions(filters);
  }

  getPredictions(filters?: {
    league?: string;
    date?: string;
    dateFilter?: string;
    startDate?: string;
    endDate?: string;
    unstartedOnly?: boolean;
  }): Fixture[] {
    try {
      let query = "SELECT full_fixture_json FROM upcoming_predictions WHERE status != 'FINISHED'";
      const params: any[] = [];

      if (filters?.league && filters.league !== 'ALL') {
        query += " AND UPPER(league) = ?";
        params.push(filters.league.toUpperCase());
      }

      if (filters?.date) {
        query += " AND match_date = ?";
        params.push(normalizeDateStr(filters.date));
      } else if (filters?.dateFilter && filters.dateFilter !== 'ALL') {
        const todayStrs = getPossibleDateStrs(0);
        const tomorrowStrs = getPossibleDateStrs(1);
        const df = filters.dateFilter.toUpperCase();
        
        if (df === 'TODAY') {
          query += ` AND match_date IN (${todayStrs.map(() => '?').join(',')})`;
          params.push(...todayStrs);
        } else if (df === 'TOMORROW') {
          query += ` AND match_date IN (${tomorrowStrs.map(() => '?').join(',')})`;
          params.push(...tomorrowStrs);
        }
      }

      const rows = sqliteDb.prepare(query).all(...params) as any[];
      let fixtures: Fixture[] = rows.map(r => JSON.parse(r.full_fixture_json));

      if (filters?.unstartedOnly) {
        fixtures = fixtures.filter(f => !isMatchStarted(f));
      }

      fixtures.sort((a, b) => {
        const priorityA = getLeaguePriority(a.league, a.leagueName, a.stage);
        const priorityB = getLeaguePriority(b.league, b.leagueName, b.stage);
        if (priorityA !== priorityB) return priorityA - priorityB;
        if (a.matchDate !== b.matchDate) return (a.matchDate || '').localeCompare(b.matchDate || '');
        return (a.kickOffTime || '').localeCompare(b.kickOffTime || '');
      });

      return fixtures;
    } catch (err: any) {
      console.error('[PredictionsDB] Error getting predictions:', err?.message);
      return [];
    }
  }

  getPredictionById(fixtureId: string): Fixture | null {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').replace(/^scraped_/, '');

    try {
      const row = sqliteDb.prepare(`
        SELECT full_fixture_json FROM upcoming_predictions 
        WHERE fixture_id = ? OR fixture_id = ? OR fixture_id = ? OR fixture_id = ? OR fixture_id = ?
        UNION
        SELECT full_fixture_json FROM live_predictions 
        WHERE fixture_id = ? OR fixture_id = ? OR fixture_id = ? OR fixture_id = ? OR fixture_id = ?
        UNION
        SELECT full_fixture_json FROM historical_predictions 
        WHERE fixture_id = ? OR fixture_id = ? OR fixture_id = ? OR fixture_id = ? OR fixture_id = ?
        LIMIT 1
      `).get(
        fixtureId, cleanId, `fs_${cleanId}`, `hist_${cleanId}`, `fs_hist_${cleanId}`,
        fixtureId, cleanId, `fs_${cleanId}`, `hist_${cleanId}`, `fs_hist_${cleanId}`,
        fixtureId, cleanId, `fs_${cleanId}`, `hist_${cleanId}`, `fs_hist_${cleanId}`
      ) as any;

      if (row && row.full_fixture_json) {
        return JSON.parse(row.full_fixture_json) as Fixture;
      }
    } catch (err: any) {
      console.error('[PredictionsDB] Error getting prediction by ID:', err?.message);
    }

    return null;
  }

  getAllPredictions(): Fixture[] {
    return this.getPredictions({ dateFilter: 'ALL' });
  }

  count(): number {
    try {
      const row = sqliteDb.prepare("SELECT COUNT(*) as count FROM upcoming_predictions").get() as any;
      return row ? Number(row.count) : 0;
    } catch (err: any) {
      console.error('[PredictionsDB] Error counting predictions:', err?.message);
      return 0;
    }
  }

  async countAsync(): Promise<number> {
    return this.count();
  }

  async removePredictions(fixtureIds: string[]): Promise<void> {
    if (!fixtureIds || fixtureIds.length === 0) return;

    try {
      const placeholders = fixtureIds.map(() => '?').join(',');
      sqliteDb.prepare(`DELETE FROM upcoming_predictions WHERE fixture_id IN (${placeholders})`).run(...fixtureIds);
    } catch (err: any) {
      console.error('[PredictionsDB] Error removing predictions:', err?.message);
    }
  }

  async clearPredictions(): Promise<void> {
    try {
      sqliteDb.exec('DELETE FROM upcoming_predictions;');
    } catch (err: any) {
      console.error('[PredictionsDB] Error clearing predictions:', err?.message);
    }
  }

  async saveLivePredictions(fixtures: Fixture[]): Promise<void> {
    if (!fixtures || fixtures.length === 0) return;

    try {
      const stmt = sqliteDb.prepare(`
        INSERT OR REPLACE INTO live_predictions (
          fixture_id, league, league_name, match_date, kick_off_time,
          home_team, away_team, status, predicted_at,
          home_xg, away_xg,
          home_win_prob, draw_prob, away_win_prob,
          over15_prob, over25_prob, over35_prob, btts_prob,
          tip_key, tip_name, tip_prob,
          full_fixture_json
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?
        )
      `);

      const now = new Date().toISOString();
      const insertMany = sqliteDb.transaction((rows: Fixture[]) => {
        for (const f of rows) {
          const pred = f.prediction;
          const bestTip = f.mostLikelyOutcome;

          stmt.run(
            f.id,
            f.league || 'ALL',
            f.leagueName || f.league || 'Live',
            f.matchDate,
            f.kickOffTime || 'LIVE',
            f.homeTeam,
            f.awayTeam,
            'LIVE',
            now,
            pred?.homeXG ?? null,
            pred?.awayXG ?? null,
            pred?.homeWinProb ?? null,
            pred?.drawProb ?? null,
            pred?.awayWinProb ?? null,
            pred?.over15Prob ?? null,
            pred?.over25Prob ?? null,
            pred?.over35Prob ?? null,
            pred?.bttsProb ?? null,
            bestTip?.marketKey || null,
            bestTip?.selection || bestTip?.marketKey || null,
            bestTip?.probability || pred?.homeWinProb || null,
            this.sanitizeFixtureForStorage(f)
          );
        }
      });
      insertMany(fixtures);
    } catch (err: any) {
      console.error('[PredictionsDB] Error saving live predictions:', err?.message);
    }
  }

  getLivePredictions(filters?: { league?: string; limit?: number }): Fixture[] {
    try {
      let query = "SELECT full_fixture_json FROM live_predictions";
      const params: any[] = [];
      if (filters?.league && filters.league !== 'ALL') {
        query += " WHERE UPPER(league) = ?";
        params.push(filters.league.toUpperCase());
      }
      query += " ORDER BY predicted_at DESC";
      if (filters?.limit) {
        query += " LIMIT ?";
        params.push(filters.limit);
      }

      const rows = sqliteDb.prepare(query).all(...params) as any[];
      return rows.map(r => JSON.parse(r.full_fixture_json));
    } catch (err: any) {
      console.error('[PredictionsDB] Error getting live predictions:', err?.message);
      return [];
    }
  }

  countLivePredictions(): number {
    try {
      const row = sqliteDb.prepare("SELECT COUNT(*) as count FROM live_predictions").get() as any;
      return row ? Number(row.count) : 0;
    } catch (err: any) {
      console.error('[PredictionsDB] Error counting live predictions:', err?.message);
      return 0;
    }
  }

  async saveHistoricalPredictions(fixtures: Fixture[]): Promise<void> {
    if (!fixtures || fixtures.length === 0) return;

    try {
      const stmt = sqliteDb.prepare(`
        INSERT OR REPLACE INTO historical_predictions (
          fixture_id, league, league_name, stage, match_date, kick_off_time,
          home_team, away_team, home_badge, away_badge, status,
          home_score, away_score,
          home_xg, away_xg, home_win_prob, draw_prob, away_win_prob,
          over15_prob, over25_prob, over35_prob, btts_prob,
          tip_key, tip_name, tip_prob, full_fixture_json, predicted_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `);

      const now = new Date().toISOString();
      const insertMany = sqliteDb.transaction((rows: Fixture[]) => {
        for (const f of rows) {
          const pred = f.prediction;
          const bestTip = f.mostLikelyOutcome;

          stmt.run(
            f.id,
            f.league || 'ALL',
            f.leagueName || f.league || 'Historical Match',
            f.stage || null,
            normalizeDateStr(f.matchDate),
            f.kickOffTime || 'FT',
            f.homeTeam,
            f.awayTeam,
            f.homeBadge || null,
            f.awayBadge || null,
            'FINISHED',
            f.score?.home ?? 0,
            f.score?.away ?? 0,
            pred?.homeXG ?? null,
            pred?.awayXG ?? null,
            pred?.homeWinProb ?? null,
            pred?.drawProb ?? null,
            pred?.awayWinProb ?? null,
            pred?.over15Prob ?? null,
            pred?.over25Prob ?? null,
            pred?.over35Prob ?? null,
            pred?.bttsProb ?? null,
            bestTip?.marketKey || null,
            bestTip?.selection || bestTip?.marketKey || null,
            bestTip?.probability || pred?.homeWinProb || null,
            this.sanitizeFixtureForStorage(f),
            now
          );
        }
      });
      insertMany(fixtures);
    } catch (err: any) {
      console.error('[PredictionsDB] Error saving historical predictions to SQLite:', err?.message);
      loggerService.addLog({
        level: 'ERROR',
        category: 'DATABASE',
        source: 'PredictionsDB',
        message: `Error saving historical predictions: ${err?.message}`,
      });
    }
  }

  getHistoricalPredictions(filters?: { league?: string; limit?: number }): Fixture[] {
    try {
      let query = "SELECT full_fixture_json FROM historical_predictions";
      const params: any[] = [];
      if (filters?.league && filters.league !== 'ALL') {
        query += " WHERE UPPER(league) = ?";
        params.push(filters.league.toUpperCase());
      }
      query += " ORDER BY match_date DESC";
      if (filters?.limit) {
        query += " LIMIT ?";
        params.push(filters.limit);
      }

      const rows = sqliteDb.prepare(query).all(...params) as any[];
      return rows.map(r => JSON.parse(r.full_fixture_json));
    } catch (err: any) {
      console.error('[PredictionsDB] Error getting historical predictions:', err?.message);
      return [];
    }
  }

  async getHistoricalPredictionsAsync(filters?: { league?: string; limit?: number }): Promise<Fixture[]> {
    return this.getHistoricalPredictions(filters);
  }

  countHistoricalPredictions(): number {
    try {
      const row = sqliteDb.prepare("SELECT COUNT(*) as count FROM historical_predictions").get() as any;
      return row ? Number(row.count) : 0;
    } catch (err: any) {
      console.error('[PredictionsDB] Error counting historical predictions:', err?.message);
      return 0;
    }
  }

  async clearAll(): Promise<void> {
    try {
      sqliteDb.exec(`
        DELETE FROM upcoming_predictions;
        DELETE FROM live_predictions;
        DELETE FROM historical_predictions;
      `);
    } catch (err: any) {
      console.error('[PredictionsDB] Error clearing all predictions:', err?.message);
    }
  }

  async reconcileStaleMatches(): Promise<void> {
    const todayStr = getRelativeDateStr(0);
    try {
      const rows = sqliteDb.prepare("SELECT full_fixture_json FROM upcoming_predictions WHERE match_date < ?").all(todayStr) as any[];
      if (rows.length > 0) {
        const staleMatches = rows.map(r => {
          const f = JSON.parse(r.full_fixture_json) as Fixture;
          f.status = 'FINISHED';
          return f;
        });

        await this.saveHistoricalPredictions(staleMatches);
        const placeholders = staleMatches.map(() => '?').join(',');
        sqliteDb.prepare(`DELETE FROM upcoming_predictions WHERE fixture_id IN (${placeholders})`).run(
          ...staleMatches.map((m) => m.id)
        );
      }
    } catch (err: any) {
      console.error('[PredictionsDB] Error reconciling stale matches:', err?.message);
    }
  }
}

export const predictionsDb = new PredictionsDB();
