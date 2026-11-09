import { Fixture } from './types.js';
import { getLeaguePriority } from './leaguePriority.js';
import { isMatchStarted } from './accumulator.js';
import { getPossibleDateStrs, getRelativeDateStr, normalizeDateStr } from './dateUtils.js';
import { matchesLeague } from './leagueMapper.js';
import { sqliteDb } from './sqliteClient.js';

export class PredictionsDB {
  private isInitialized = false;
  private memoryFallback: Map<string, Fixture> = new Map();
  private liveMemoryFallback: Map<string, Fixture> = new Map();
  private historyMemoryFallback: Map<string, Fixture> = new Map();

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.hydrateFromSqlite();
      console.log('[PredictionsDB] Initialized local SQLite prediction store in WAL mode.');
    } catch (err: any) {
      console.warn('[PredictionsDB] SQLite predictions hydration note:', err?.message);
    }

    this.isInitialized = true;
  }

  private hydrateFromSqlite(): void {
    try {
      const rows = sqliteDb.prepare("SELECT full_fixture_json FROM upcoming_predictions LIMIT 2500").all() as any[];
      for (const row of rows) {
        if (row && row.full_fixture_json) {
          try {
            const parsed = JSON.parse(row.full_fixture_json) as Fixture;
            if (parsed && parsed.id) {
              this.memoryFallback.set(parsed.id, parsed);
            }
          } catch {}
        }
      }

      const histRows = sqliteDb.prepare("SELECT full_fixture_json FROM historical_predictions LIMIT 1500").all() as any[];
      for (const row of histRows) {
        if (row && row.full_fixture_json) {
          try {
            const parsed = JSON.parse(row.full_fixture_json) as Fixture;
            if (parsed && parsed.id) {
              this.historyMemoryFallback.set(parsed.id, parsed);
            }
          } catch {}
        }
      }
    } catch {}
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
      if (f.id) {
        this.memoryFallback.set(f.id, f);
      }

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
            b365_h, b365_d, b365_a,
            home_xg, away_xg, home_win_prob, draw_prob, away_win_prob,
            over15_prob, over25_prob, over35_prob, btts_prob,
            tip_key, tip_name, tip_odds, tip_prob, tip_ev,
            is_positive_ev, is_banker, full_fixture_json, predicted_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?
          )
        `);

        const now = new Date().toISOString();
        const insertMany = sqliteDb.transaction((rows: Fixture[]) => {
          for (const f of rows) {
            const pred = f.prediction;
            const bestTip = f.bestValueMarket;

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
              f.odds?.homeWin || 2.10,
              f.odds?.draw || 3.30,
              f.odds?.awayWin || 3.40,
              pred?.homeXG ?? 1.35,
              pred?.awayXG ?? 1.15,
              pred?.homeWinProb ?? 0.45,
              pred?.drawProb ?? 0.28,
              pred?.awayWinProb ?? 0.27,
              pred?.over15Prob ?? 0.75,
              pred?.over25Prob ?? 0.52,
              pred?.over35Prob ?? 0.28,
              pred?.bttsProb ?? 0.50,
              bestTip?.key || 'HOME_WIN',
              bestTip?.name || 'Home Win',
              bestTip?.odds || f.odds?.homeWin || 2.10,
              bestTip?.probability || pred?.homeWinProb || 0.45,
              bestTip?.expectedValue || 1.05,
              bestTip?.isPositiveEV ? 1 : 0,
              bestTip?.isBanker ? 1 : 0,
              this.sanitizeFixtureForStorage(f),
              now
            );
          }
        });

        insertMany(upcomingToPersist);
      } catch (err: any) {
        console.error('[PredictionsDB] Error persisting predictions to SQLite:', err?.message);
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
    const seen = new Set<string>();
    let fixtures: Fixture[] = [];
    for (const f of this.memoryFallback.values()) {
      if (!f || !f.id) continue;
      const cleanId = f.id.replace(/^fs_/, '');
      if (seen.has(cleanId)) continue;
      if (f.status === 'FINISHED') continue;
      if (filters?.unstartedOnly && isMatchStarted(f)) continue;

      if (filters?.league && filters.league !== 'ALL') {
        if (!matchesLeague(f.league, f.leagueName, filters.league)) continue;
      }

      if (filters?.date) {
        const targetDate = normalizeDateStr(filters.date);
        if (normalizeDateStr(f.matchDate) !== targetDate) continue;
      } else if (filters?.dateFilter && filters.dateFilter !== 'ALL') {
        const todayStrs = getPossibleDateStrs(0);
        const tomorrowStrs = getPossibleDateStrs(1);
        const df = filters.dateFilter.toUpperCase();
        const norm = normalizeDateStr(f.matchDate);
        if (df === 'TODAY' && !todayStrs.includes(norm)) continue;
        if (df === 'TOMORROW' && !tomorrowStrs.includes(norm)) continue;
      }

      seen.add(cleanId);
      fixtures.push(f);
    }

    fixtures.sort((a, b) => {
      const priorityA = getLeaguePriority(a.league, a.leagueName, a.stage);
      const priorityB = getLeaguePriority(b.league, b.leagueName, b.stage);
      if (priorityA !== priorityB) return priorityA - priorityB;
      if (a.matchDate !== b.matchDate) return (a.matchDate || '').localeCompare(b.matchDate || '');
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
    if (this.liveMemoryFallback.has(fixtureId)) return this.liveMemoryFallback.get(fixtureId)!;
    if (this.liveMemoryFallback.has(cleanId)) return this.liveMemoryFallback.get(cleanId)!;
    if (this.historyMemoryFallback.has(fixtureId)) return this.historyMemoryFallback.get(fixtureId)!;
    if (this.historyMemoryFallback.has(cleanId)) return this.historyMemoryFallback.get(cleanId)!;

    // Check SQLite
    try {
      const row = sqliteDb.prepare(`
        SELECT full_fixture_json FROM upcoming_predictions WHERE fixture_id = ? OR fixture_id = ?
        UNION
        SELECT full_fixture_json FROM historical_predictions WHERE fixture_id = ? OR fixture_id = ?
        LIMIT 1
      `).get(fixtureId, `fs_${cleanId}`, fixtureId, `fs_${cleanId}`) as any;

      if (row && row.full_fixture_json) {
        const parsed = JSON.parse(row.full_fixture_json) as Fixture;
        this.memoryFallback.set(fixtureId, parsed);
        return parsed;
      }
    } catch {}

    return null;
  }

  getAllPredictions(): Fixture[] {
    return this.getPredictions({ dateFilter: 'ALL' });
  }

  count(): number {
    const seen = new Set<string>();
    for (const f of this.memoryFallback.values()) {
      if (f && f.id) {
        seen.add(f.id.replace(/^fs_/, ''));
      }
    }
    return seen.size;
  }

  async countAsync(): Promise<number> {
    try {
      const row = sqliteDb.prepare("SELECT COUNT(*) as count FROM upcoming_predictions").get() as any;
      if (row && row.count !== undefined) {
        return Number(row.count);
      }
    } catch {}
    return this.count();
  }

  async removePredictions(fixtureIds: string[]): Promise<void> {
    if (!fixtureIds || fixtureIds.length === 0) return;
    for (const id of fixtureIds) {
      const cleanId = id.replace(/^fs_/, '');
      this.memoryFallback.delete(id);
      this.memoryFallback.delete(cleanId);
      this.memoryFallback.delete(`fs_${cleanId}`);
    }

    try {
      const placeholders = fixtureIds.map(() => '?').join(',');
      sqliteDb.prepare(`DELETE FROM upcoming_predictions WHERE fixture_id IN (${placeholders})`).run(...fixtureIds);
    } catch {}
  }

  async clearPredictions(): Promise<void> {
    this.memoryFallback.clear();
    try {
      sqliteDb.exec('DELETE FROM upcoming_predictions;');
    } catch {}
  }

  async saveLivePredictions(fixtures: Fixture[]): Promise<void> {
    if (!fixtures || fixtures.length === 0) return;
    for (const f of fixtures) {
      if (f.id) {
        this.liveMemoryFallback.set(f.id, f);
      }
    }

    try {
      const stmt = sqliteDb.prepare(`
        INSERT OR REPLACE INTO live_predictions (
          fixture_id, league, league_name, match_date, kick_off_time,
          home_team, away_team, status, predicted_at,
          b365_h, b365_d, b365_a, home_xg, away_xg,
          home_win_prob, draw_prob, away_win_prob,
          over15_prob, over25_prob, over35_prob, btts_prob,
          tip_key, tip_name, tip_odds, tip_prob, tip_ev,
          full_fixture_json
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?
        )
      `);

      const now = new Date().toISOString();
      const insertMany = sqliteDb.transaction((rows: Fixture[]) => {
        for (const f of rows) {
          const pred = f.prediction;
          const bestTip = f.bestValueMarket;

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
            f.odds?.homeWin || 2.10,
            f.odds?.draw || 3.30,
            f.odds?.awayWin || 3.40,
            pred?.homeXG ?? 1.35,
            pred?.awayXG ?? 1.15,
            pred?.homeWinProb ?? 0.45,
            pred?.drawProb ?? 0.28,
            pred?.awayWinProb ?? 0.27,
            pred?.over15Prob ?? 0.75,
            pred?.over25Prob ?? 0.52,
            pred?.over35Prob ?? 0.28,
            pred?.bttsProb ?? 0.50,
            bestTip?.key || 'HOME_WIN',
            bestTip?.name || 'Home Win',
            bestTip?.odds || f.odds?.homeWin || 2.10,
            bestTip?.probability || pred?.homeWinProb || 0.45,
            bestTip?.expectedValue || 1.05,
            this.sanitizeFixtureForStorage(f)
          );
        }
      });
      insertMany(fixtures);
    } catch {}
  }

  getLivePredictions(filters?: { league?: string; limit?: number }): Fixture[] {
    let fixtures = Array.from(this.liveMemoryFallback.values());
    if (filters?.league && filters.league !== 'ALL') {
      fixtures = fixtures.filter((f) => matchesLeague(f.league, f.leagueName, filters.league!));
    }
    if (filters?.limit) {
      fixtures = fixtures.slice(0, filters.limit);
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

    try {
      const stmt = sqliteDb.prepare(`
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
      const insertMany = sqliteDb.transaction((rows: Fixture[]) => {
        for (const f of rows) {
          const pred = f.prediction;
          const bestTip = f.bestValueMarket;

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
            f.odds?.homeWin || 2.10,
            f.odds?.draw || 3.30,
            f.odds?.awayWin || 3.40,
            pred?.homeXG ?? 1.35,
            pred?.awayXG ?? 1.15,
            pred?.homeWinProb ?? 0.45,
            pred?.drawProb ?? 0.28,
            pred?.awayWinProb ?? 0.27,
            pred?.over15Prob ?? 0.75,
            pred?.over25Prob ?? 0.52,
            pred?.over35Prob ?? 0.28,
            pred?.bttsProb ?? 0.50,
            bestTip?.key || 'HOME_WIN',
            bestTip?.name || 'Home Win',
            bestTip?.odds || f.odds?.homeWin || 2.10,
            bestTip?.probability || pred?.homeWinProb || 0.45,
            bestTip?.expectedValue || 1.05,
            bestTip?.isPositiveEV ? 1 : 0,
            bestTip?.isBanker ? 1 : 0,
            this.sanitizeFixtureForStorage(f),
            now
          );
        }
      });
      insertMany(fixtures);
    } catch (err: any) {
      console.error('[PredictionsDB] Error saving historical predictions to SQLite:', err?.message);
    }
  }

  getHistoricalPredictions(filters?: { league?: string; limit?: number }): Fixture[] {
    let fixtures = Array.from(this.historyMemoryFallback.values());
    if (filters?.league && filters.league !== 'ALL') {
      fixtures = fixtures.filter((f) => matchesLeague(f.league, f.leagueName, filters.league!));
    }
    fixtures.sort((a, b) => (b.matchDate || '').localeCompare(a.matchDate || ''));
    if (filters?.limit) {
      fixtures = fixtures.slice(0, filters.limit);
    }
    return fixtures;
  }

  async getHistoricalPredictionsAsync(filters?: { league?: string; limit?: number }): Promise<Fixture[]> {
    return this.getHistoricalPredictions(filters);
  }

  countHistoricalPredictions(): number {
    return this.historyMemoryFallback.size;
  }

  async clearAll(): Promise<void> {
    this.memoryFallback.clear();
    this.liveMemoryFallback.clear();
    this.historyMemoryFallback.clear();

    try {
      sqliteDb.exec(`
        DELETE FROM upcoming_predictions;
        DELETE FROM live_predictions;
        DELETE FROM historical_predictions;
      `);
    } catch {}
  }

  async reconcileStaleMatches(): Promise<void> {
    const todayStr = getRelativeDateStr(0);
    const staleMatches: Fixture[] = [];
    for (const [, f] of this.memoryFallback.entries()) {
      if (f.matchDate && f.matchDate < todayStr) {
        f.status = 'FINISHED';
        staleMatches.push(f);
      }
    }

    if (staleMatches.length > 0) {
      await this.saveHistoricalPredictions(staleMatches);
      for (const m of staleMatches) {
        this.memoryFallback.delete(m.id);
        const cleanId = m.id.replace(/^fs_/, '');
        this.memoryFallback.delete(cleanId);
        this.memoryFallback.delete(`fs_${cleanId}`);
      }

      try {
        const placeholders = staleMatches.map(() => '?').join(',');
        sqliteDb.prepare(`DELETE FROM upcoming_predictions WHERE fixture_id IN (${placeholders})`).run(
          ...staleMatches.map((m) => m.id)
        );
      } catch {}
    }
  }
}

export const predictionsDb = new PredictionsDB();
