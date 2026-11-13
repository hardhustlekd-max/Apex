import { Fixture } from './types.js';
import { getLeaguePriority } from './leaguePriority.js';
import { isMatchStarted } from './accumulator.js';
import { getPossibleDateStrs, getRelativeDateStr, normalizeDateStr, normalizeTimeStr, resolveDateFilter } from './dateUtils.js';
import { sqliteDb } from './sqliteClient.js';
import { loggerService } from '../services/loggerService.js';

export interface PredictionEvaluationSummary {
  upcomingFixturesInDb: number;
  totalPredictions: number;
  upcomingPredictions: number;
  livePredictions: number;
  completedWithScore: number;
  completedAwaitingScore: number;
}

function getCleanId(id: string): string {
  return String(id || '')
    .replace(/^fs_hist_/, '')
    .replace(/^fs_/, '')
    .replace(/^hist_/, '')
    .replace(/^scraped_/, '')
    .trim();
}

function parseMatchTimestampMs(matchDate: string, kickOffTime: string, fixture?: Fixture): number | null {
  if (fixture?.timestamp && fixture.timestamp > 0) {
    return fixture.timestamp > 1e11 ? fixture.timestamp : fixture.timestamp * 1000;
  }

  const normDate = normalizeDateStr(matchDate);
  const dateParts = normDate.split('-').map((p) => parseInt(p, 10));
  if (dateParts.length !== 3 || dateParts.some(isNaN)) return null;

  const normTime = normalizeTimeStr(kickOffTime);
  if (!normTime || !normTime.includes(':')) return null;

  const timeParts = normTime.split(':').map((p) => parseInt(p, 10));
  if (timeParts.length < 2 || isNaN(timeParts[0]) || isNaN(timeParts[1])) return null;

  return Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1]);
}

function getUtcDayOffsetFromToday(matchDateStr: string, todayStr: string): number | null {
  const normMatch = normalizeDateStr(matchDateStr);
  const normToday = normalizeDateStr(todayStr);
  const mParts = normMatch.split('-').map((n) => parseInt(n, 10));
  const tParts = normToday.split('-').map((n) => parseInt(n, 10));
  if (mParts.length !== 3 || tParts.length !== 3 || mParts.some(isNaN) || tParts.some(isNaN)) {
    return null;
  }
  const mUtc = Date.UTC(mParts[0], mParts[1] - 1, mParts[2]);
  const tUtc = Date.UTC(tParts[0], tParts[1] - 1, tParts[2]);
  return Math.round((mUtc - tUtc) / 86_400_000);
}

export class PredictionsDB {
  private isInitialized = false;
  private remoteSyncInFlight: Promise<void> | null = null;
  private lastRemoteSyncAt = 0;
  private readonly REMOTE_SYNC_COOLDOWN_MS = 30_000;

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.reconcileStaleMatches();
      console.log('[PredictionsDB] Initialized unified SQLite prediction store and reconciled local match states.');
    } catch (err: any) {
      console.warn('[PredictionsDB] SQLite predictions initialization notice:', err?.message);
    }

    this.isInitialized = true;

    // Trigger background remote result reconciliation on app startup without blocking server boot
    void this.syncPendingPredictionResultsFromRemote(false).catch((err: any) => {
      console.warn('[PredictionsDB] Startup remote result sync notice:', err?.message);
    });
  }

  private sanitizeFixtureForStorage(f: Fixture): string {
    const lean = {
      ...f,
      prediction: f.prediction ? { ...f.prediction } : undefined,
    };
    return JSON.stringify(lean);
  }

  private hydrateFixtureFromRow(row: any): Fixture {
    const fixture = JSON.parse(row.full_fixture_json) as Fixture;
    if (row.status) {
      fixture.status = row.status;
    }
    if (row.kick_off_time) {
      fixture.kickOffTime = row.kick_off_time;
    }
    if (
      row.home_score !== null &&
      row.home_score !== undefined &&
      row.away_score !== null &&
      row.away_score !== undefined
    ) {
      fixture.score = {
        home: Number(row.home_score),
        away: Number(row.away_score),
      };
    }
    if (row.match_state === 'completed') {
      (fixture as any).match_state = 'completed';
    }
    return fixture;
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
            // STRICT VALIDATION: Never save a prediction record if the prediction object itself is missing
            if (!f.prediction) continue;

            const pred = f.prediction;
            const bestTip = f.mostLikelyOutcome;

            // Determine authoritative 1X2 tip key/name/prob for DB summary columns
            const hw = Number(pred.homeWinProb ?? 0);
            const dr = Number(pred.drawProb ?? 0);
            const aw = Number(pred.awayWinProb ?? 0);
            let tipKey = bestTip?.marketKey || 'HOME_WIN';
            let tipName = (bestTip as any)?.selection || bestTip?.marketKey || `${f.homeTeam} Win`;
            let tipProb = bestTip?.probability ?? hw;

            if (hw > 0 || dr > 0 || aw > 0) {
              if (hw >= dr && hw >= aw) {
                tipKey = 'HOME_WIN';
                tipName = `${f.homeTeam} Win`;
                tipProb = hw;
              } else if (aw >= hw && aw >= dr) {
                tipKey = 'AWAY_WIN';
                tipName = `${f.awayTeam} Win`;
                tipProb = aw;
              } else {
                tipKey = 'DRAW';
                tipName = 'Draw';
                tipProb = dr;
              }
            }

            // Determine match state: only mark as completed if status is FINISHED/POSTPONED/CANCELLED or FT
            const statusUpper = String(f.status || 'SCHEDULED').toUpperCase();
            const isFin =
              statusUpper === 'FINISHED' ||
              statusUpper === 'POSTPONED' ||
              statusUpper === 'CANCELLED' ||
              (f as any).match_state === 'completed' ||
              f.kickOffTime === 'FT';
            const state = isFin ? 'completed' : 'upcoming';

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
              pred.homeXG ?? null,
              pred.awayXG ?? null,
              pred.homeWinProb ?? null,
              pred.drawProb ?? null,
              pred.awayWinProb ?? null,
              pred.over15Prob ?? null,
              pred.over25Prob ?? null,
              pred.over35Prob ?? null,
              pred.bttsProb ?? null,
              tipKey,
              tipName,
              tipProb,
              this.sanitizeFixtureForStorage(f),
              now
            );
            savedCount++;
          } catch (rowErr: any) {
            console.warn(`[PredictionsDB] Failed to save fixture ${f.id} (${f.homeTeam} vs ${f.awayTeam}):`, rowErr?.message);
          }
        }
        if (savedCount > 0) {
          console.log(`[PredictionsDB] Successfully saved ${savedCount}/${rows.length} manual unified predictions to SQLite.`);
        }
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
      let query = `
        SELECT full_fixture_json, status, match_state, kick_off_time, home_score, away_score
        FROM predictions
      `;
      const params: any[] = [];
      const whereClauses: string[] = [];

      if (stateFilter !== 'all') {
        whereClauses.push('match_state = ?');
        params.push(stateFilter);
      }

      if (filters?.league && filters.league !== 'ALL') {
        whereClauses.push('UPPER(league) = ?');
        params.push(filters.league.toUpperCase());
      }

      if (filters?.date) {
        whereClauses.push('match_date = ?');
        params.push(normalizeDateStr(filters.date));
      } else if (filters?.dateFilter && filters.dateFilter !== 'ALL') {
        const resolved = resolveDateFilter(filters.dateFilter);
        if (resolved.kind === 'SINGLE') {
          whereClauses.push('match_date = ?');
          params.push(resolved.targetDate);
        } else if (resolved.kind === 'RANGE') {
          whereClauses.push('match_date >= ? AND match_date <= ?');
          params.push(resolved.startDate, resolved.endDate);
        }
      }

      if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
      }

      const rows = sqliteDb.prepare(query).all(...params) as any[];
      let fixtures: Fixture[] = rows.map((r) => this.hydrateFixtureFromRow(r));

      if (filters?.unstartedOnly) {
        fixtures = fixtures.filter((f) => !isMatchStarted(f));
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
    const cleanId = getCleanId(fixtureId);

    try {
      const row = sqliteDb.prepare(`
        SELECT full_fixture_json, status, match_state, kick_off_time, home_score, away_score
        FROM predictions
        WHERE fixture_id = ? OR fixture_id = ? OR fixture_id = ? OR fixture_id = ? OR fixture_id = ?
        LIMIT 1
      `).get(
        fixtureId, cleanId, `fs_${cleanId}`, `hist_${cleanId}`, `fs_hist_${cleanId}`
      ) as any;

      if (row && row.full_fixture_json) {
        return this.hydrateFixtureFromRow(row);
      }
    } catch (err: any) {
      console.error('[PredictionsDB] Error getting prediction by ID:', err?.message);
    }

    return null;
  }

  count(state: 'upcoming' | 'completed' | 'all' = 'upcoming'): number {
    try {
      let query = 'SELECT COUNT(*) as count FROM predictions';
      const params: any[] = [];
      if (state !== 'all') {
        query += ' WHERE match_state = ?';
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
    return this.savePredictions(fixtures);
  }

  async saveHistoricalPredictions(fixtures: Fixture[]): Promise<void> {
    const enriched = fixtures.map((f) => ({ ...f, match_state: 'completed' as const }));
    return this.savePredictions(enriched);
  }

  getHistoricalPredictions(filters?: { league?: string; limit?: number }): Fixture[] {
    const list = this.getPredictions({ ...filters, state: 'completed' });
    if (filters?.limit && filters.limit > 0 && list.length > filters.limit) {
      // Sort descending by date/time before slicing if limited
      const sortedDesc = list.slice().sort((a, b) => {
        const da = normalizeDateStr(a.matchDate);
        const db = normalizeDateStr(b.matchDate);
        if (da !== db) return db.localeCompare(da);
        return normalizeTimeStr(b.kickOffTime || '00:00').localeCompare(normalizeTimeStr(a.kickOffTime || '00:00'));
      });
      return sortedDesc.slice(0, filters.limit);
    }
    return list;
  }

  async getHistoricalPredictionsAsync(filters?: any): Promise<Fixture[]> {
    return this.getHistoricalPredictions(filters);
  }

  countHistoricalPredictions(): number {
    try {
      const row = sqliteDb.prepare(`
        SELECT COUNT(*) as count
        FROM predictions
        WHERE match_state = 'completed'
          AND UPPER(status) = 'FINISHED'
          AND home_score IS NOT NULL
          AND away_score IS NOT NULL
      `).get() as any;
      return row ? Number(row.count) : 0;
    } catch {
      return this.count('completed');
    }
  }

  getEvaluationSummary(): PredictionEvaluationSummary {
    const todayStr = getRelativeDateStr(0);
    try {
      const upcomingFixturesRow = sqliteDb
        .prepare("SELECT COUNT(*) as count FROM upcoming_fixtures WHERE UPPER(status) NOT IN ('FINISHED', 'POSTPONED', 'CANCELLED')")
        .get() as any;
      const totalPredRow = sqliteDb.prepare('SELECT COUNT(*) as count FROM predictions').get() as any;
      const completedWithScoreRow = sqliteDb.prepare(`
        SELECT COUNT(*) as count FROM predictions
        WHERE UPPER(status) = 'FINISHED'
          AND home_score IS NOT NULL
          AND away_score IS NOT NULL
      `).get() as any;
      const livePredRow = sqliteDb.prepare(`
        SELECT COUNT(*) as count FROM predictions
        WHERE UPPER(status) = 'LIVE'
      `).get() as any;
      const awaitingScoreRow = sqliteDb.prepare(`
        SELECT COUNT(*) as count FROM predictions
        WHERE (home_score IS NULL OR away_score IS NULL)
          AND UPPER(status) NOT IN ('POSTPONED', 'CANCELLED', 'LIVE')
          AND (match_date < ? OR match_state = 'completed' OR UPPER(status) = 'FINISHED')
      `).get(todayStr) as any;
      const upcomingPredRow = sqliteDb.prepare(`
        SELECT COUNT(*) as count FROM predictions
        WHERE match_state = 'upcoming'
          AND UPPER(status) NOT IN ('FINISHED', 'LIVE', 'POSTPONED', 'CANCELLED')
          AND match_date >= ?
      `).get(todayStr) as any;

      return {
        upcomingFixturesInDb: upcomingFixturesRow ? Number(upcomingFixturesRow.count) : 0,
        totalPredictions: totalPredRow ? Number(totalPredRow.count) : 0,
        upcomingPredictions: upcomingPredRow ? Number(upcomingPredRow.count) : 0,
        livePredictions: livePredRow ? Number(livePredRow.count) : 0,
        completedWithScore: completedWithScoreRow ? Number(completedWithScoreRow.count) : 0,
        completedAwaitingScore: awaitingScoreRow ? Number(awaitingScoreRow.count) : 0,
      };
    } catch (err: any) {
      console.warn('[PredictionsDB] Error computing evaluation summary:', err?.message);
      return {
        upcomingFixturesInDb: 0,
        totalPredictions: 0,
        upcomingPredictions: 0,
        livePredictions: 0,
        completedWithScore: 0,
        completedAwaitingScore: 0,
      };
    }
  }

  private applyMatchOutcomeToDb(
    row: { fixture_id: string; full_fixture_json: string },
    status: 'FINISHED' | 'LIVE' | 'SCHEDULED' | 'POSTPONED' | 'CANCELLED',
    homeScore?: number,
    awayScore?: number
  ): void {
    const cleanId = getCleanId(row.fixture_id);
    const fixture = JSON.parse(row.full_fixture_json) as Fixture;

    if (status === 'FINISHED' && homeScore !== undefined && awayScore !== undefined) {
      fixture.status = 'FINISHED';
      fixture.kickOffTime = 'FT';
      fixture.score = { home: homeScore, away: awayScore };
      (fixture as any).match_state = 'completed';

      sqliteDb.prepare(`
        UPDATE predictions
        SET match_state = 'completed',
            status = 'FINISHED',
            kick_off_time = 'FT',
            home_score = ?,
            away_score = ?,
            full_fixture_json = ?
        WHERE fixture_id = ?
      `).run(homeScore, awayScore, this.sanitizeFixtureForStorage(fixture), row.fixture_id);

      sqliteDb.prepare(`
        UPDATE upcoming_fixtures
        SET status = 'FINISHED',
            kick_off_time = 'FT',
            score_json = ?
        WHERE id IN (?, ?, ?)
      `).run(JSON.stringify({ home: homeScore, away: awayScore }), row.fixture_id, cleanId, `fs_${cleanId}`);
      return;
    }

    if (status === 'POSTPONED' || status === 'CANCELLED') {
      fixture.status = status;
      fixture.kickOffTime = status;
      (fixture as any).match_state = 'completed';

      sqliteDb.prepare(`
        UPDATE predictions
        SET match_state = 'completed',
            status = ?,
            kick_off_time = ?,
            full_fixture_json = ?
        WHERE fixture_id = ?
      `).run(status, status, this.sanitizeFixtureForStorage(fixture), row.fixture_id);

      sqliteDb.prepare(`
        UPDATE upcoming_fixtures
        SET status = ?,
            kick_off_time = ?
        WHERE id IN (?, ?, ?)
      `).run(status, status, row.fixture_id, cleanId, `fs_${cleanId}`);
      return;
    }

    if (status === 'LIVE') {
      fixture.status = 'LIVE';
      if (homeScore !== undefined && awayScore !== undefined) {
        fixture.score = { home: homeScore, away: awayScore };
      }

      sqliteDb.prepare(`
        UPDATE predictions
        SET status = 'LIVE',
            home_score = COALESCE(?, home_score),
            away_score = COALESCE(?, away_score),
            full_fixture_json = ?
        WHERE fixture_id = ?
      `).run(homeScore ?? null, awayScore ?? null, this.sanitizeFixtureForStorage(fixture), row.fixture_id);

      sqliteDb.prepare(`
        UPDATE upcoming_fixtures
        SET status = 'LIVE',
            score_json = COALESCE(?, score_json)
        WHERE id IN (?, ?, ?)
      `).run(
        homeScore !== undefined && awayScore !== undefined ? JSON.stringify({ home: homeScore, away: awayScore }) : null,
        row.fixture_id,
        cleanId,
        `fs_${cleanId}`
      );
    }
  }

  private isRowReadyForResultCheck(row: any, fixture?: Fixture): boolean {
    const statusUpper = String(row.status || '').toUpperCase();
    if (statusUpper === 'POSTPONED' || statusUpper === 'CANCELLED') return false;
    if (
      statusUpper === 'FINISHED' &&
      row.home_score !== null &&
      row.home_score !== undefined &&
      row.away_score !== null &&
      row.away_score !== undefined
    ) {
      return false;
    }

    if (statusUpper === 'LIVE' || statusUpper === 'FINISHED' || row.match_state === 'completed') {
      return true;
    }

    const todayStr = getRelativeDateStr(0);
    const normDate = normalizeDateStr(row.match_date);
    if (normDate < todayStr) return true;
    if (normDate > todayStr) return false;

    if (String(row.kick_off_time || '').toUpperCase() === 'FT') return true;

    const kickoffMs = parseMatchTimestampMs(normDate, row.kick_off_time, fixture);
    if (kickoffMs !== null) {
      // Check matches that kicked off at least 95 minutes ago
      return Date.now() - kickoffMs >= 95 * 60 * 1000;
    }

    return false;
  }

  async reconcileStaleMatches(): Promise<number> {
    let updatedCount = 0;

    try {
      // 1. Repair rows that already have finished scores so match_state, status, kick_off_time, and full_fixture_json stay consistent
      const repairRows = sqliteDb.prepare(`
        SELECT fixture_id, status, match_state, kick_off_time, home_score, away_score, full_fixture_json
        FROM predictions
        WHERE home_score IS NOT NULL AND away_score IS NOT NULL
          AND UPPER(status) = 'FINISHED'
          AND (match_state != 'completed' OR kick_off_time != 'FT')
      `).all() as any[];

      for (const r of repairRows) {
        this.applyMatchOutcomeToDb(r, 'FINISHED', Number(r.home_score), Number(r.away_score));
        updatedCount++;
      }

      // 2. Reconcile any predictions missing final scores or still marked upcoming/live against local DB tables
      const pendingRows = sqliteDb.prepare(`
        SELECT fixture_id, home_team, away_team, match_date, kick_off_time, status, match_state, home_score, away_score, full_fixture_json
        FROM predictions
        WHERE (home_score IS NULL OR away_score IS NULL OR UPPER(status) != 'FINISHED' OR match_state != 'completed')
          AND UPPER(status) NOT IN ('POSTPONED', 'CANCELLED')
      `).all() as any[];

      if (pendingRows.length === 0) {
        return updatedCount;
      }

      const scrapedStmt = sqliteDb.prepare(`
        SELECT status, home_score, away_score
        FROM flashscore_scraped_matches
        WHERE (
          match_id = ? OR match_id = ?
          OR (LOWER(home_name) = LOWER(?) AND LOWER(away_name) = LOWER(?) AND SUBSTR(match_date, 1, 10) = ?)
        )
        AND (
          (UPPER(status) = 'FINISHED' AND home_score IS NOT NULL AND away_score IS NOT NULL)
          OR UPPER(status) IN ('POSTPONED', 'CANCELLED')
        )
        LIMIT 1
      `);

      const histStmt = sqliteDb.prepare(`
        SELECT fthg as home_score, ftag as away_score
        FROM historical_matches
        WHERE (
          id IN (?, ?, ?, ?)
          OR (LOWER(home_team) = LOWER(?) AND LOWER(away_team) = LOWER(?) AND match_date = ?)
        )
        AND fthg IS NOT NULL AND ftag IS NOT NULL
        LIMIT 1
      `);

      const upcomingStmt = sqliteDb.prepare(`
        SELECT status, score_json
        FROM upcoming_fixtures
        WHERE id IN (?, ?, ?)
          AND UPPER(status) IN ('FINISHED', 'POSTPONED', 'CANCELLED')
        LIMIT 1
      `);

      for (const row of pendingRows) {
        const cleanId = getCleanId(row.fixture_id);
        const normDate = normalizeDateStr(row.match_date);

        // Priority 1: flashscore_scraped_matches
        const scrapedRow = scrapedStmt.get(
          row.fixture_id,
          cleanId,
          row.home_team,
          row.away_team,
          normDate
        ) as any;

        if (scrapedRow) {
          const scrapedStatus = String(scrapedRow.status || '').toUpperCase();
          if (scrapedStatus === 'FINISHED' && scrapedRow.home_score !== null && scrapedRow.away_score !== null) {
            this.applyMatchOutcomeToDb(row, 'FINISHED', Number(scrapedRow.home_score), Number(scrapedRow.away_score));
            updatedCount++;
            continue;
          }
          if (scrapedStatus === 'POSTPONED' || scrapedStatus === 'CANCELLED') {
            this.applyMatchOutcomeToDb(row, scrapedStatus as 'POSTPONED' | 'CANCELLED');
            updatedCount++;
            continue;
          }
        }

        // Priority 2: historical_matches (supports fs_hist_<id>, hist_<id>, and team+date match)
        const histRow = histStmt.get(
          row.fixture_id,
          cleanId,
          `fs_hist_${cleanId}`,
          `hist_${cleanId}`,
          row.home_team,
          row.away_team,
          normDate
        ) as any;

        if (histRow && histRow.home_score !== null && histRow.away_score !== null) {
          this.applyMatchOutcomeToDb(row, 'FINISHED', Number(histRow.home_score), Number(histRow.away_score));
          updatedCount++;
          continue;
        }

        // Priority 3: upcoming_fixtures if marked FINISHED/POSTPONED/CANCELLED
        const upRow = upcomingStmt.get(row.fixture_id, cleanId, `fs_${cleanId}`) as any;
        if (upRow) {
          const upStatus = String(upRow.status || '').toUpperCase();
          if (upStatus === 'FINISHED' && upRow.score_json) {
            try {
              const parsedScore = JSON.parse(upRow.score_json);
              if (parsedScore?.home !== undefined && parsedScore?.away !== undefined) {
                this.applyMatchOutcomeToDb(row, 'FINISHED', Number(parsedScore.home), Number(parsedScore.away));
                updatedCount++;
                continue;
              }
            } catch {}
          } else if (upStatus === 'POSTPONED' || upStatus === 'CANCELLED') {
            this.applyMatchOutcomeToDb(row, upStatus as 'POSTPONED' | 'CANCELLED');
            updatedCount++;
            continue;
          }
        }
      }

      if (updatedCount > 0) {
        console.log(`[PredictionsDB] Local reconciliation updated ${updatedCount} prediction record(s).`);
      }
    } catch (err: any) {
      console.error('[PredictionsDB] Error reconciling stale matches:', err?.message);
    }

    return updatedCount;
  }

  async syncPendingPredictionResultsFromRemote(force = false): Promise<void> {
    if (this.remoteSyncInFlight) {
      await this.remoteSyncInFlight;
      if (!force) return;
    }

    const now = Date.now();
    if (!force && now - this.lastRemoteSyncAt < this.REMOTE_SYNC_COOLDOWN_MS) {
      await this.reconcileStaleMatches();
      return;
    }

    const runSync = async () => {
      this.lastRemoteSyncAt = Date.now();

      // 1. Always attempt local SQLite reconciliation first
      await this.reconcileStaleMatches();

      // 2. Find remaining predictions whose kickoff/date has passed and lack confirmed final scores
      const candidates = sqliteDb.prepare(`
        SELECT fixture_id, home_team, away_team, match_date, kick_off_time, status, match_state, home_score, away_score, full_fixture_json
        FROM predictions
        WHERE (home_score IS NULL OR away_score IS NULL OR UPPER(status) != 'FINISHED' OR match_state != 'completed')
          AND UPPER(status) NOT IN ('POSTPONED', 'CANCELLED')
      `).all() as any[];

      const readyToCheck = candidates.filter((row) => {
        try {
          const parsed = JSON.parse(row.full_fixture_json) as Fixture;
          return this.isRowReadyForResultCheck(row, parsed);
        } catch {
          return this.isRowReadyForResultCheck(row);
        }
      });

      if (readyToCheck.length === 0) {
        return;
      }

      const { flashscoreScraperService } = await import('../services/flashscoreScraperService.js');
      const todayStr = getRelativeDateStr(0);

      // 3. Batch refresh relevant Flashscore UTC daily feeds (t=0, offsets -7..0) for any ready candidates
      const offsetsToFetch = new Set<number>();
      for (const row of readyToCheck) {
        const delta = getUtcDayOffsetFromToday(row.match_date, todayStr);
        if (delta !== null && delta >= -7 && delta <= 0) {
          offsetsToFetch.add(delta);
        }
      }

      for (const offset of Array.from(offsetsToFetch).sort((a, b) => b - a)) {
        try {
          await flashscoreScraperService.syncDailyFeedForOffset(offset);
        } catch (feedErr: any) {
          console.warn(`[PredictionsDB] Daily UTC feed sync error for offset ${offset}:`, feedErr?.message);
        }
      }

      // Re-run local reconciliation after persisting daily feeds
      const feedMatchedCount = await this.reconcileStaleMatches();

      // 4. For any candidates STILL without final scores (e.g. >7 days old or missing from main daily feed), query dc_1_<id> directly
      const remainingCandidates = sqliteDb.prepare(`
        SELECT fixture_id, home_team, away_team, match_date, kick_off_time, status, match_state, home_score, away_score, full_fixture_json
        FROM predictions
        WHERE (home_score IS NULL OR away_score IS NULL OR UPPER(status) != 'FINISHED' OR match_state != 'completed')
          AND UPPER(status) NOT IN ('POSTPONED', 'CANCELLED')
      `).all() as any[];

      const stillMissing = remainingCandidates
        .filter((row) => {
          try {
            const parsed = JSON.parse(row.full_fixture_json) as Fixture;
            return this.isRowReadyForResultCheck(row, parsed);
          } catch {
            return this.isRowReadyForResultCheck(row);
          }
        })
        .slice(0, 40);

      let dcUpdatedCount = 0;
      const concurrency = 6;
      for (let i = 0; i < stillMissing.length; i += concurrency) {
        const batch = stillMissing.slice(i, i + concurrency);
        await Promise.allSettled(
          batch.map(async (row) => {
            const remote = await flashscoreScraperService.fetchMatchStatusAndScore(row.fixture_id);
            if (!remote) return;

            if (remote.status === 'FINISHED' && remote.homeScore !== undefined && remote.awayScore !== undefined) {
              this.applyMatchOutcomeToDb(row, 'FINISHED', remote.homeScore, remote.awayScore);
              dcUpdatedCount++;
            } else if (remote.status === 'POSTPONED' || remote.status === 'CANCELLED') {
              this.applyMatchOutcomeToDb(row, remote.status);
              dcUpdatedCount++;
            } else if (remote.status === 'LIVE' && remote.homeScore !== undefined && remote.awayScore !== undefined) {
              this.applyMatchOutcomeToDb(row, 'LIVE', remote.homeScore, remote.awayScore);
            }
          })
        );
      }

      const totalResolved = feedMatchedCount + dcUpdatedCount;
      if (totalResolved > 0) {
        loggerService.addLog({
          level: 'SUCCESS',
          category: 'DATABASE',
          source: 'PredictionsDB',
          message: `Reconciled ${totalResolved} completed prediction result(s) from Flashscore`,
        });
      }
    };

    const syncPromise = runSync().finally(() => {
      if (this.remoteSyncInFlight === syncPromise) {
        this.remoteSyncInFlight = null;
      }
    });

    this.remoteSyncInFlight = syncPromise;
    await syncPromise;
  }

  async reconcileAndSyncResults(options?: { force?: boolean }): Promise<void> {
    await this.syncPendingPredictionResultsFromRemote(Boolean(options?.force));
  }

  export1X2Predictions(): {
    format: string;
    version: string;
    exportedAt: string;
    count: number;
    predictions: Array<{
      fixtureId: string;
      league: string;
      leagueName: string;
      stage: string | null;
      matchDate: string;
      kickOffTime: string;
      homeTeam: string;
      awayTeam: string;
      homeBadge: string | null;
      awayBadge: string | null;
      status: string;
      matchState: string;
      homeScore: number | null;
      awayScore: number | null;
      homeXG: number | null;
      awayXG: number | null;
      homeWinProb: number;
      drawProb: number;
      awayWinProb: number;
      over15Prob: number | null;
      over25Prob: number | null;
      over35Prob: number | null;
      bttsProb: number | null;
      tipKey: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';
      tipName: string;
      tipProb: number;
      predictedAt: string;
    }>;
  } {
    try {
      const rows = sqliteDb.prepare(`
        SELECT 
          fixture_id, league, league_name, stage, match_date, kick_off_time,
          home_team, away_team, home_badge, away_badge, status, match_state,
          home_score, away_score, home_xg, away_xg,
          home_win_prob, draw_prob, away_win_prob,
          over15_prob, over25_prob, over35_prob, btts_prob,
          tip_key, tip_name, tip_prob, predicted_at
        FROM predictions
        ORDER BY match_date ASC, kick_off_time ASC, fixture_id ASC
      `).all() as any[];

      const predictions = rows.map((r) => {
        const hw = Number(r.home_win_prob ?? 0);
        const dr = Number(r.draw_prob ?? 0);
        const aw = Number(r.away_win_prob ?? 0);

        let fallbackTip: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' = 'HOME_WIN';
        let fallbackName = `${r.home_team} Win`;
        let fallbackProb = hw;

        if (hw >= dr && hw >= aw) {
          fallbackTip = 'HOME_WIN';
          fallbackName = `${r.home_team} Win`;
          fallbackProb = hw;
        } else if (aw >= hw && aw >= dr) {
          fallbackTip = 'AWAY_WIN';
          fallbackName = `${r.away_team} Win`;
          fallbackProb = aw;
        } else {
          fallbackTip = 'DRAW';
          fallbackName = 'Draw';
          fallbackProb = dr;
        }

        const tipKey = (r.tip_key === 'HOME_WIN' || r.tip_key === 'DRAW' || r.tip_key === 'AWAY_WIN')
          ? r.tip_key
          : fallbackTip;

        return {
          fixtureId: r.fixture_id,
          league: r.league,
          leagueName: r.league_name,
          stage: r.stage || null,
          matchDate: normalizeDateStr(r.match_date),
          kickOffTime: r.kick_off_time || 'TBD',
          homeTeam: r.home_team,
          awayTeam: r.away_team,
          homeBadge: r.home_badge || null,
          awayBadge: r.away_badge || null,
          status: r.status || 'SCHEDULED',
          matchState: r.match_state || 'upcoming',
          homeScore: r.home_score !== null && r.home_score !== undefined ? Number(r.home_score) : null,
          awayScore: r.away_score !== null && r.away_score !== undefined ? Number(r.away_score) : null,
          homeXG: r.home_xg !== null && r.home_xg !== undefined ? Number(r.home_xg) : null,
          awayXG: r.away_xg !== null && r.away_xg !== undefined ? Number(r.away_xg) : null,
          homeWinProb: Number(hw.toFixed(3)),
          drawProb: Number(dr.toFixed(3)),
          awayWinProb: Number(aw.toFixed(3)),
          over15Prob: r.over15_prob !== null && r.over15_prob !== undefined ? Number(Number(r.over15_prob).toFixed(3)) : null,
          over25Prob: r.over25_prob !== null && r.over25_prob !== undefined ? Number(Number(r.over25_prob).toFixed(3)) : null,
          over35Prob: r.over35_prob !== null && r.over35_prob !== undefined ? Number(Number(r.over35_prob).toFixed(3)) : null,
          bttsProb: r.btts_prob !== null && r.btts_prob !== undefined ? Number(Number(r.btts_prob).toFixed(3)) : null,
          tipKey,
          tipName: r.tip_name || fallbackName,
          tipProb: Number(Number(r.tip_prob ?? fallbackProb).toFixed(3)),
          predictedAt: r.predicted_at || new Date().toISOString(),
        };
      });

      return {
        format: 'APEX_1X2_PREDICTIONS',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        count: predictions.length,
        predictions,
      };
    } catch (err: any) {
      console.error('[PredictionsDB] Error exporting 1X2 predictions:', err?.message);
      return {
        format: 'APEX_1X2_PREDICTIONS',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        count: 0,
        predictions: [],
      };
    }
  }

  evaluateImportedPredictions(importedPayload: any): {
    success: boolean;
    error?: string;
    summary: {
      totalImported: number;
      evaluatedCount: number;
      pendingCount: number;
      wonCount: number;
      lostCount: number;
      accuracy: number;
      homePicksCount: number;
      drawPicksCount: number;
      awayPicksCount: number;
    };
    evaluated: Array<{
      fixtureId: string;
      league: string;
      leagueName: string;
      matchDate: string;
      kickOffTime: string;
      homeTeam: string;
      awayTeam: string;
      status: string;
      homeScore: number | null;
      awayScore: number | null;
      homeXG: number | null;
      awayXG: number | null;
      homeWinProb: number;
      drawProb: number;
      awayWinProb: number;
      tipKey: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';
      tipName: string;
      tipProb: number;
      actualOutcome: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' | null;
      isCorrect: boolean | null;
      evaluationState: 'WON' | 'LOST' | 'PENDING';
    }>;
  } {
    let rawList: any[] = [];
    if (Array.isArray(importedPayload)) {
      rawList = importedPayload;
    } else if (importedPayload && Array.isArray(importedPayload.predictions)) {
      rawList = importedPayload.predictions;
    } else if (importedPayload && Array.isArray(importedPayload.fixtures)) {
      rawList = importedPayload.fixtures;
    } else {
      return {
        success: false,
        error: 'Invalid JSON format: expected an array of predictions or an object with a "predictions" array.',
        summary: {
          totalImported: 0,
          evaluatedCount: 0,
          pendingCount: 0,
          wonCount: 0,
          lostCount: 0,
          accuracy: 0,
          homePicksCount: 0,
          drawPicksCount: 0,
          awayPicksCount: 0,
        },
        evaluated: [],
      };
    }

    if (rawList.length === 0) {
      return {
        success: false,
        error: 'JSON file contains 0 predictions.',
        summary: {
          totalImported: 0,
          evaluatedCount: 0,
          pendingCount: 0,
          wonCount: 0,
          lostCount: 0,
          accuracy: 0,
          homePicksCount: 0,
          drawPicksCount: 0,
          awayPicksCount: 0,
        },
        evaluated: [],
      };
    }

    // Prepare lookup statements against SQLite database to reconcile actual scores
    const predStmt = sqliteDb.prepare(`
      SELECT status, home_score, away_score
      FROM predictions
      WHERE (fixture_id = ? OR fixture_id = ?)
        OR (LOWER(home_team) = LOWER(?) AND LOWER(away_team) = LOWER(?) AND match_date = ?)
      LIMIT 1
    `);

    const scrapedStmt = sqliteDb.prepare(`
      SELECT status, home_score, away_score
      FROM flashscore_scraped_matches
      WHERE (match_id = ? OR match_id = ?)
        OR (LOWER(home_name) = LOWER(?) AND LOWER(away_name) = LOWER(?) AND SUBSTR(match_date, 1, 10) = ?)
      LIMIT 1
    `);

    const histStmt = sqliteDb.prepare(`
      SELECT fthg as home_score, ftag as away_score
      FROM historical_matches
      WHERE (id = ? OR id = ? OR id = ?)
        OR (LOWER(home_team) = LOWER(?) AND LOWER(away_team) = LOWER(?) AND match_date = ?)
      LIMIT 1
    `);

    const upcomingStmt = sqliteDb.prepare(`
      SELECT status, score_json
      FROM upcoming_fixtures
      WHERE (id = ? OR id = ?)
        OR (LOWER(home_team) = LOWER(?) AND LOWER(away_team) = LOWER(?) AND match_date = ?)
      LIMIT 1
    `);

    let wonCount = 0;
    let lostCount = 0;
    let pendingCount = 0;
    let homePicksCount = 0;
    let drawPicksCount = 0;
    let awayPicksCount = 0;

    const evaluated: any[] = [];

    for (const item of rawList) {
      const fixtureId = String(item.fixtureId || item.id || '').trim();
      const cleanId = getCleanId(fixtureId);
      const homeTeam = String(item.homeTeam || item.home_team || '').trim();
      const awayTeam = String(item.awayTeam || item.away_team || '').trim();
      const matchDate = normalizeDateStr(item.matchDate || item.match_date || getRelativeDateStr(0));
      const kickOffTime = String(item.kickOffTime || item.kick_off_time || 'TBD').trim();
      const league = String(item.league || 'ALL');
      const leagueName = String(item.leagueName || item.league_name || league);

      // Probabilities
      const hw = Number(item.homeWinProb ?? item.home_win_prob ?? item.prediction?.homeWinProb ?? 0);
      const dr = Number(item.drawProb ?? item.draw_prob ?? item.prediction?.drawProb ?? 0);
      const aw = Number(item.awayWinProb ?? item.away_win_prob ?? item.prediction?.awayWinProb ?? 0);

      // Determine predicted 1X2 choice
      let tipKey: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' = 'HOME_WIN';
      let tipName = item.tipName || item.tip_name || '';
      let tipProb = Number(item.tipProb ?? item.tip_prob ?? 0);

      const rawKey = String(item.tipKey || item.tip_key || item.predictedTip || '').toUpperCase();
      if (rawKey === 'HOME_WIN' || rawKey === 'HOME' || rawKey === '1') {
        tipKey = 'HOME_WIN';
      } else if (rawKey === 'AWAY_WIN' || rawKey === 'AWAY' || rawKey === '2') {
        tipKey = 'AWAY_WIN';
      } else if (rawKey === 'DRAW' || rawKey === 'X') {
        tipKey = 'DRAW';
      } else {
        // Evaluate from probabilities
        if (hw >= dr && hw >= aw) {
          tipKey = 'HOME_WIN';
        } else if (aw >= hw && aw >= dr) {
          tipKey = 'AWAY_WIN';
        } else {
          tipKey = 'DRAW';
        }
      }

      if (!tipName) {
        tipName = tipKey === 'HOME_WIN' ? `${homeTeam} Win` : tipKey === 'AWAY_WIN' ? `${awayTeam} Win` : 'Draw';
      }
      if (tipProb <= 0) {
        tipProb = tipKey === 'HOME_WIN' ? hw : tipKey === 'AWAY_WIN' ? aw : dr;
      }

      if (tipKey === 'HOME_WIN') homePicksCount++;
      else if (tipKey === 'DRAW') drawPicksCount++;
      else awayPicksCount++;

      // Reconcile actual scores
      let finalHomeScore: number | null = null;
      let finalAwayScore: number | null = null;
      let matchStatus = String(item.status || 'SCHEDULED').toUpperCase();

      // Priority 1: Was a valid finished score already present in the uploaded file?
      const itemHomeScore = item.homeScore !== undefined ? item.homeScore : item.home_score;
      const itemAwayScore = item.awayScore !== undefined ? item.awayScore : item.away_score;
      if (
        itemHomeScore !== null &&
        itemHomeScore !== undefined &&
        itemAwayScore !== null &&
        itemAwayScore !== undefined &&
        (matchStatus === 'FINISHED' || item.matchState === 'completed' || item.kickOffTime === 'FT')
      ) {
        finalHomeScore = Number(itemHomeScore);
        finalAwayScore = Number(itemAwayScore);
        matchStatus = 'FINISHED';
      }

      // Priority 2: Look up updated result in predictions DB
      if (finalHomeScore === null || finalAwayScore === null) {
        const predRow = predStmt.get(fixtureId, cleanId, homeTeam, awayTeam, matchDate) as any;
        if (predRow && predRow.home_score !== null && predRow.away_score !== null) {
          finalHomeScore = Number(predRow.home_score);
          finalAwayScore = Number(predRow.away_score);
          matchStatus = String(predRow.status || 'FINISHED').toUpperCase();
        }
      }

      // Priority 3: Look up in flashscore_scraped_matches
      if (finalHomeScore === null || finalAwayScore === null) {
        const scrapedRow = scrapedStmt.get(fixtureId, cleanId, homeTeam, awayTeam, matchDate) as any;
        if (scrapedRow && scrapedRow.home_score !== null && scrapedRow.away_score !== null) {
          finalHomeScore = Number(scrapedRow.home_score);
          finalAwayScore = Number(scrapedRow.away_score);
          matchStatus = String(scrapedRow.status || 'FINISHED').toUpperCase();
        }
      }

      // Priority 4: Look up in historical_matches
      if (finalHomeScore === null || finalAwayScore === null) {
        const histRow = histStmt.get(fixtureId, cleanId, `fs_hist_${cleanId}`, homeTeam, awayTeam, matchDate) as any;
        if (histRow && histRow.home_score !== null && histRow.away_score !== null) {
          finalHomeScore = Number(histRow.home_score);
          finalAwayScore = Number(histRow.away_score);
          matchStatus = 'FINISHED';
        }
      }

      // Priority 5: Look up in upcoming_fixtures
      if (finalHomeScore === null || finalAwayScore === null) {
        const upRow = upcomingStmt.get(fixtureId, cleanId, homeTeam, awayTeam, matchDate) as any;
        if (upRow && upRow.score_json) {
          try {
            const parsed = JSON.parse(upRow.score_json);
            if (parsed?.home !== undefined && parsed?.away !== undefined) {
              finalHomeScore = Number(parsed.home);
              finalAwayScore = Number(parsed.away);
              matchStatus = String(upRow.status || 'FINISHED').toUpperCase();
            }
          } catch {}
        }
      }

      // Outcome & Evaluation
      let actualOutcome: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' | null = null;
      let isCorrect: boolean | null = null;
      let evaluationState: 'WON' | 'LOST' | 'PENDING' = 'PENDING';

      if (finalHomeScore !== null && finalAwayScore !== null && !isNaN(finalHomeScore) && !isNaN(finalAwayScore)) {
        if (finalHomeScore > finalAwayScore) actualOutcome = 'HOME_WIN';
        else if (finalAwayScore > finalHomeScore) actualOutcome = 'AWAY_WIN';
        else actualOutcome = 'DRAW';

        isCorrect = tipKey === actualOutcome;
        if (isCorrect) {
          evaluationState = 'WON';
          wonCount++;
        } else {
          evaluationState = 'LOST';
          lostCount++;
        }
      } else {
        evaluationState = 'PENDING';
        pendingCount++;
      }

      evaluated.push({
        fixtureId: fixtureId || `import_${evaluated.length}`,
        league,
        leagueName,
        matchDate,
        kickOffTime,
        homeTeam: homeTeam || 'Home Team',
        awayTeam: awayTeam || 'Away Team',
        status: matchStatus,
        homeScore: finalHomeScore,
        awayScore: finalAwayScore,
        homeXG: item.homeXG !== undefined && item.homeXG !== null ? Number(item.homeXG) : item.home_xg !== undefined && item.home_xg !== null ? Number(item.home_xg) : null,
        awayXG: item.awayXG !== undefined && item.awayXG !== null ? Number(item.awayXG) : item.away_xg !== undefined && item.away_xg !== null ? Number(item.away_xg) : null,
        homeWinProb: Number(hw.toFixed(3)),
        drawProb: Number(dr.toFixed(3)),
        awayWinProb: Number(aw.toFixed(3)),
        tipKey,
        tipName,
        tipProb: Number(tipProb.toFixed(3)),
        actualOutcome,
        isCorrect,
        evaluationState,
      });
    }

    const totalImported = evaluated.length;
    const evaluatedCount = wonCount + lostCount;
    const accuracy = evaluatedCount > 0 ? Number(((wonCount / evaluatedCount) * 100).toFixed(1)) : 0;

    return {
      success: true,
      summary: {
        totalImported,
        evaluatedCount,
        pendingCount,
        wonCount,
        lostCount,
        accuracy,
        homePicksCount,
        drawPicksCount,
        awayPicksCount,
      },
      evaluated,
    };
  }
}

export const predictionsDb = new PredictionsDB();
