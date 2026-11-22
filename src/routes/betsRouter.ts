import { Router, Request, Response } from 'express';
import { db } from '../core/db.js';
import { getSqliteGateState, isSqliteEnabled } from '../core/sqliteClient.js';
import { isScrapingEnabled } from '../core/scrapingGate.js';
import { cleanFixtureId } from '../core/types.js';
import { fixturesWorkerService } from '../services/fixturesWorkerService.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';

const router = Router();

// Cooldown map so direct dc_1_<id> Flashscore probes aren't spammed on every poll
const directProbeCooldown = new Map<string, number>();
const DIRECT_PROBE_TTL_MS = 20_000;

const isTerminalMatchStatus = (st?: string): boolean =>
  st === 'FINISHED' || st === 'CANCELLED' || st === 'POSTPONED';

const legNeedsSync = (s: {
  status?: string;
  matchStatus?: string;
  score?: { home?: number; away?: number };
}): boolean =>
  (s.status || 'PENDING') === 'PENDING' ||
  !s.score ||
  typeof s.score.home !== 'number' ||
  typeof s.score.away !== 'number' ||
  !isTerminalMatchStatus(s.matchStatus);

const parseLegTimestampSec = (sel: {
  timestamp?: number;
  matchDate?: string;
  kickOffTime?: string;
}): number | null => {
  if (sel.timestamp && Number.isFinite(sel.timestamp) && sel.timestamp > 0) {
    return sel.timestamp > 1e12 ? Math.floor(sel.timestamp / 1000) : Math.floor(sel.timestamp);
  }
  if (sel.matchDate && sel.kickOffTime && /^\d{2}:\d{2}$/.test(sel.kickOffTime.trim())) {
    const ms = Date.parse(`${sel.matchDate.slice(0, 10)}T${sel.kickOffTime.trim()}:00Z`);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  return null;
};

router.get('/', async (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (!isSqliteEnabled()) {
      return res.json({
        success: true,
        sqliteBlocked: true,
        sqliteGate: getSqliteGateState(),
        count: 0,
        bets: [],
      });
    }
    const forceLive = req.query.live === '1' || req.query.force === '1';
    const currentBets = db.getAllBets();
    const legsNeedingSync = currentBets.flatMap((b) =>
      (b.selections || []).filter(legNeedsSync)
    );

    const scoreOverrides: Array<{
      fixtureId: string;
      homeScore?: number;
      awayScore?: number;
      minute?: number;
      status?: string;
      homeTeam?: string;
      awayTeam?: string;
      matchDate?: string;
    }> = [];

    if (legsNeedingSync.length > 0 && isScrapingEnabled()) {
      let liveScores: Array<{
        fixtureId: string;
        homeScore: number;
        awayScore: number;
        minute?: number;
        status?: string;
        homeTeam?: string;
        awayTeam?: string;
      }> = [];
      try {
        const liveData = await fixturesWorkerService.getCachedLiveScores(forceLive);
        liveScores = liveData.scores || [];
      } catch {
        liveScores = [];
      }

      for (const ls of liveScores) {
        scoreOverrides.push({
          fixtureId: ls.fixtureId,
          homeScore: ls.homeScore,
          awayScore: ls.awayScore,
          minute: ls.minute,
          status: ls.status,
          homeTeam: ls.homeTeam,
          awayTeam: ls.awayTeam,
        });
      }

      // First run evaluation with DB tables + live feed so already-finished / in-play legs update immediately
      db.evaluateBets(scoreOverrides);

      // Probe any legs STILL missing final results/scores (including remaining legs on LOST slips and settled legs missing scores)
      const refreshedBets = db.getAllBets();
      const nowMs = Date.now();
      const nowSec = Math.floor(nowMs / 1000);
      const liveIds = new Set(liveScores.map((s) => cleanFixtureId(s.fixtureId)));

      const legByFixture = new Map<string, typeof legsNeedingSync[number]>();
      for (const b of refreshedBets) {
        for (const sel of b.selections || []) {
          if (!legNeedsSync(sel)) continue;
          const cid = cleanFixtureId(sel.fixtureId);
          if (!cid || liveIds.has(cid)) continue;
          const tsSec = parseLegTimestampSec(sel);
          if (tsSec && tsSec > nowSec + 300) continue;
          const lastProbed = directProbeCooldown.get(cid) || 0;
          if (nowMs - lastProbed < DIRECT_PROBE_TTL_MS) continue;
          if (!legByFixture.has(sel.fixtureId)) {
            legByFixture.set(sel.fixtureId, sel);
          }
        }
      }

      const candidateLegs = Array.from(legByFixture.values()).slice(0, 16);

      if (candidateLegs.length > 0) {
        const statusUpdates: Array<{
          id: string;
          status: string;
          kickOffTime?: string;
          score?: { home: number; away: number };
        }> = [];
        const scrapedToPersist: any[] = [];

        await Promise.all(
          candidateLegs.map(async (sel) => {
            const fid = sel.fixtureId;
            const cid = cleanFixtureId(fid);
            directProbeCooldown.set(cid, nowMs);
            try {
              const probe = await flashscoreScraperService.fetchMatchStatusAndScore(fid);
              if (!probe) return;
              if (
                probe.status === 'FINISHED' ||
                probe.status === 'LIVE' ||
                probe.status === 'CANCELLED' ||
                probe.status === 'POSTPONED'
              ) {
                const hasScore =
                  probe.homeScore !== undefined && probe.awayScore !== undefined;
                statusUpdates.push({
                  id: fid.startsWith('fs_') ? fid : `fs_${cid}`,
                  status: probe.status,
                  kickOffTime:
                    probe.status === 'FINISHED'
                      ? 'FT'
                      : probe.status === 'CANCELLED' || probe.status === 'POSTPONED'
                      ? probe.status
                      : probe.minute
                      ? `${probe.minute}'`
                      : undefined,
                  score: hasScore
                    ? { home: probe.homeScore!, away: probe.awayScore! }
                    : undefined,
                });

                scoreOverrides.push({
                  fixtureId: fid,
                  homeScore: probe.homeScore,
                  awayScore: probe.awayScore,
                  minute: probe.minute,
                  status: probe.status,
                  homeTeam: sel.homeTeam,
                  awayTeam: sel.awayTeam,
                  matchDate: sel.matchDate,
                });

                scrapedToPersist.push({
                  matchId: cid,
                  status: probe.status,
                  date: `${sel.matchDate || new Date().toISOString().slice(0, 10)} ${sel.kickOffTime || '00:00'}`,
                  leagueName: sel.leagueName || 'League',
                  home: { name: sel.homeTeam },
                  away: { name: sel.awayTeam },
                  result: {
                    home: probe.homeScore !== undefined ? String(probe.homeScore) : undefined,
                    away: probe.awayScore !== undefined ? String(probe.awayScore) : undefined,
                  },
                });
              }
            } catch {
              // Non-fatal probe failure
            }
          })
        );

        if (statusUpdates.length > 0) {
          db.updateUpcomingFixtureStatuses(statusUpdates);
        }
        if (scrapedToPersist.length > 0) {
          db.saveFlashscoreScrapedMatches(scrapedToPersist);
        }
      }
    }

    db.evaluateBets(scoreOverrides);
    const bets = db.getAllBets();
    res.json({ success: true, count: bets.length, bets });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch bets' });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    if (!isSqliteEnabled()) {
      return res.status(409).json({
        success: false,
        sqliteBlocked: true,
        sqliteGate: getSqliteGateState(),
        error: 'SQLite database is switched off. Enable SQLite DB manually before placing bets.',
      });
    }
    const bet = req.body;
    if (!bet || !bet.id || !Array.isArray(bet.selections)) {
      return res.status(400).json({ success: false, error: 'Invalid bet object format' });
    }
    db.saveBet(bet);
    db.evaluateBets();
    res.json({ success: true, message: 'Bet saved successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save bet' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    if (!isSqliteEnabled()) {
      return res.status(409).json({
        success: false,
        sqliteBlocked: true,
        sqliteGate: getSqliteGateState(),
        error: 'SQLite database is switched off. Enable SQLite DB manually before deleting bets.',
      });
    }
    const { id } = req.params;
    db.deleteBet(id);
    res.json({ success: true, message: 'Bet deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete bet' });
  }
});

export const betsRouter = router;
