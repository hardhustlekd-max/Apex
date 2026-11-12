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
      // Reconcile match states based on time
      const todayStr = getRelativeDateStr(0);
      
      // Update past matches to 'completed' and 'FINISHED'
      sqliteDb.prepare(`
        UPDATE predictions 
        SET match_state = 'completed', status = 'FINISHED' 
        WHERE match_date < ? AND match_state != 'completed'
      `).run(todayStr);

      console.log('[PredictionsDB] Initialized unified SQLite prediction store and reconciled match states.');
    } catch (err: any) {
      console.warn('[PredictionsDB] SQLite predictions initialization notice:', err?.message);
    }

    this.isInitialized = true;
  }

  private sanitizeFixtureForStorage(f: Fixture): string {
    const lean = {
      ...f,
      prediction: f.prediction ? { ...f.prediction } : undefined,
    };
    return JSON.stringify(lean);
  }

  async savePredictions(fixtures: Fixture[]): Promise<void> {
    if (!fixtures || fixtures.length === 0) return;

    try {
      const stmt = sqliteDb.prepare(`
        INSERT OR REPLACE INTO predictions (
          fixture_id, league, league_name, stage, match_date, kick_off_time,
          home_team, away_team, home_badge, away_badge, status, match_state,
          home_score, away_score,
          home_xg, away_xg, home_win_prob, draw_prob, away_win_prob,
          over15_prob, over25_prob, over35_prob, btts_prob,
          tip_key, tip_name, tip_prob, full_fixture_json, predicted_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?,
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
            const state = (f.status === 'FINISHED' || (f as any).match_state === 'completed') ? 'completed' : 'upcoming';

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
              state,
              f.score?.home ?? null,
              f.score?.away ?? null,
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
        console.log(`[PredictionsDB] Successfully saved ${savedCount}/${rows.length} unified predictions to SQLite.`);
      });

      insertMany(fixtures);
    } catch (err: any) {
      console.error('[PredictionsDB] Error persisting predictions to SQLite:', err?.message);
      throw err;
    }
  }

  getPredictions(filters?: {
    league?: string;
    date?: string;
    dateFilter?: string;
    unstartedOnly?: boolean;
    state?: 'upcoming' | 'completed' | 'all';
  }): Fixture[] {
    try {
      const stateFilter = filters?.state || 'upcoming';
      let query = "SELECT full_fixture_json FROM predictions";
      const params: any[] = [];
      const whereClauses: string[] = [];

      if (stateFilter !== 'all') {
        whereClauses.push("match_state = ?");
        params.push(stateFilter);
      }

      if (filters?.league && filters.league !== 'ALL') {
        whereClauses.push("UPPER(league) = ?");
        params.push(filters.league.toUpperCase());
      }

      if (filters?.date) {
        whereClauses.push("match_date = ?");
        params.push(normalizeDateStr(filters.date));
      } else if (filters?.dateFilter && filters.dateFilter !== 'ALL') {
        const todayStrs = getPossibleDateStrs(0);
        const tomorrowStrs = getPossibleDateStrs(1);
        const df = filters.dateFilter.toUpperCase();
        
        if (df === 'TODAY') {
          whereClauses.push(`match_date IN (${todayStrs.map(() => '?').join(',')})`);
          params.push(...todayStrs);
        } else if (df === 'TOMORROW') {
          whereClauses.push(`match_date IN (${tomorrowStrs.map(() => '?').join(',')})`);
          params.push(...tomorrowStrs);
        }
      }

      if (whereClauses.length > 0) {
        query += " WHERE " + whereClauses.join(" AND ");
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

  async getPredictionsAsync(filters?: any): Promise<Fixture[]> {
    return this.getPredictions(filters);
  }

  getPredictionById(fixtureId: string): Fixture | null {
    if (!fixtureId) return null;
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').replace(/^scraped_/, '');

    try {
      const row = sqliteDb.prepare(`
        SELECT full_fixture_json FROM predictions 
        WHERE fixture_id = ? OR fixture_id = ? OR fixture_id = ? OR fixture_id = ? OR fixture_id = ?
        LIMIT 1
      `).get(
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

  count(state: 'upcoming' | 'completed' | 'all' = 'upcoming'): number {
    try {
      let query = "SELECT COUNT(*) as count FROM predictions";
      const params: any[] = [];
      if (state !== 'all') {
        query += " WHERE match_state = ?";
        params.push(state);
      }
      const row = sqliteDb.prepare(query).get(...params) as any;
      return row ? Number(row.count) : 0;
    } catch (err: any) {
      console.error('[PredictionsDB] Error counting predictions:', err?.message);
      return 0;
    }
  }

  async countAsync(state: 'upcoming' | 'completed' | 'all' = 'upcoming'): Promise<number> {
    return this.count(state);
  }

  async clearPredictions(state: 'upcoming' | 'completed' | 'all' = 'upcoming'): Promise<void> {
    try {
      if (state === 'all') {
        sqliteDb.exec('DELETE FROM predictions;');
      } else {
        sqliteDb.prepare('DELETE FROM predictions WHERE match_state = ?').run(state);
      }
    } catch (err: any) {
      console.error('[PredictionsDB] Error clearing predictions:', err?.message);
    }
  }

  async removePredictions(fixtureIds: string[]): Promise<void> {
    if (!fixtureIds || fixtureIds.length === 0) return;
    try {
      const stmt = sqliteDb.prepare('DELETE FROM predictions WHERE fixture_id = ?');
      const deleteMany = sqliteDb.transaction((ids: string[]) => {
        for (const id of ids) {
          stmt.run(id);
          const cleanId = id.replace(/^fs_/, '');
          if (cleanId !== id) stmt.run(cleanId);
        }
      });
      deleteMany(fixtureIds);
    } catch (err: any) {
      console.error('[PredictionsDB] Error removing predictions:', err?.message);
    }
  }

  async clearAll(): Promise<void> {
    return this.clearPredictions('all');
  }

  async saveLivePredictions(fixtures: Fixture[]): Promise<void> {
    // Treat live as upcoming but with LIVE status
    return this.savePredictions(fixtures);
  }

  async saveHistoricalPredictions(fixtures: Fixture[]): Promise<void> {
    // Explicitly set state to completed
    const enriched = fixtures.map(f => ({ ...f, match_state: 'completed' as const }));
    return this.savePredictions(enriched);
  }

  getHistoricalPredictions(filters?: { league?: string; limit?: number }): Fixture[] {
    return this.getPredictions({ ...filters, state: 'completed' });
  }

  async getHistoricalPredictionsAsync(filters?: any): Promise<Fixture[]> {
    return this.getHistoricalPredictions(filters);
  }

  countHistoricalPredictions(): number {
    return this.count('completed');
  }

  async reconcileStaleMatches(): Promise<void> {
    const todayStr = getRelativeDateStr(0);
    try {
      // 1. Mark past matches as completed based on date
      sqliteDb.prepare(`
        UPDATE predictions 
        SET match_state = 'completed', status = 'FINISHED' 
        WHERE match_date < ? AND match_state != 'completed'
      `).run(todayStr);

      // 2. Transition matches that are marked as FINISHED in the upcoming_fixtures table
      sqliteDb.prepare(`
        UPDATE predictions 
        SET match_state = 'completed', status = 'FINISHED' 
        WHERE match_state = 'upcoming' AND fixture_id IN (
          SELECT id FROM upcoming_fixtures WHERE status = 'FINISHED'
        )
      `).run();

      // 3. Fetch all completed predictions without scores and try to sync them from other tables
      const staleRows = sqliteDb.prepare(`
        SELECT fixture_id, home_team, away_team, match_date, full_fixture_json 
        FROM predictions 
        WHERE match_state = 'completed' AND (home_score IS NULL OR away_score IS NULL)
      `).all() as any[];

      if (staleRows.length > 0) {
        console.log(`[PredictionsDB] Attempting to sync results for ${staleRows.length} completed predictions...`);
        const updateScoreStmt = sqliteDb.prepare(`
          UPDATE predictions 
          SET home_score = ?, away_score = ?, full_fixture_json = ? 
          WHERE fixture_id = ?
        `);

        for (const row of staleRows) {
          const cleanId = row.fixture_id.replace(/^fs_/, '').replace(/^hist_/, '').replace(/^scraped_/, '');
          
          // Try fetching score from flashscore_scraped_matches or historical_matches
          const resultRow = sqliteDb.prepare(`
            SELECT home_score, away_score FROM flashscore_scraped_matches WHERE match_id = ? OR match_id = ?
            UNION ALL
            SELECT fthg as home_score, ftag as away_score FROM historical_matches WHERE id = ? OR id = ?
            LIMIT 1
          `).get(row.fixture_id, cleanId, row.fixture_id, cleanId) as any;

          if (resultRow && resultRow.home_score !== null && resultRow.away_score !== null) {
            const fixture = JSON.parse(row.full_fixture_json) as Fixture;
            fixture.score = { home: resultRow.home_score, away: resultRow.away_score };
            fixture.status = 'FINISHED';

            updateScoreStmt.run(
              resultRow.home_score,
              resultRow.away_score,
              JSON.stringify(fixture),
              row.fixture_id
            );
          }
        }
      }
      
      console.log('[PredictionsDB] Reconciliation complete: States synced and results backfilled.');
    } catch (err: any) {
      console.error('[PredictionsDB] Error reconciling stale matches:', err?.message);
    }
  }
}

export const predictionsDb = new PredictionsDB();
