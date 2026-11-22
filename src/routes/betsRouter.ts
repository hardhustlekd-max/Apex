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

router.get('/', async (req: Request, res: Response) => {
  try {
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
    const pendingLegs = currentBets.flatMap((b) =>
      (b.selections || []).filter((s) => (s.status || 'PENDING') === 'PENDING')
    );

    let liveScores: Array<{
      fixtureId: string;
      homeScore: number;
      awayScore: number;
      minute?: number;
      status?: string;
    }> = [];

    if (pendingLegs.length > 0 && isScrapingEnabled()) {
      try {
        const liveData = await fixturesWorkerService.getCachedLiveScores(forceLive);
        liveScores = liveData.scores || [];
      } catch {
        liveScores = [];
      }

      // First run evaluation with fresh live feed (which also persisted finished/live matches into SQLite)
      db.evaluateBets(liveScores);

      // For any pending legs NOT in active liveScores whose kickoff has already passed (or unknown),
      // probe lightweight dc_1_<id> match status endpoint directly so newly finished or off-feed matches settle immediately.
      const refreshedBets = db.getAllBets();
      const nowMs = Date.now();
      const nowSec = Math.floor(nowMs / 1000);
      const liveIds = new Set(liveScores.map((s) => cleanFixtureId(s.fixtureId)));

      const candidateLegs = refreshedBets
        .flatMap((b) => b.selections || [])
        .filter((sel) => {
          if ((sel.status || 'PENDING') !== 'PENDING') return false;
          const cid = cleanFixtureId(sel.fixtureId);
          if (!cid || liveIds.has(cid)) return false;
          // Only probe if match is already in-play/finished window (started <= now + 5m) or has no timestamp
          if (sel.timestamp && sel.timestamp > nowSec + 300) return false;
          const lastProbed = directProbeCooldown.get(cid) || 0;
          return nowMs - lastProbed >= DIRECT_PROBE_TTL_MS;
        });

      const uniqueFixtureIds = Array.from(new Set(candidateLegs.map((s) => s.fixtureId))).slice(0, 12);

      if (uniqueFixtureIds.length > 0) {
        const statusUpdates: Array<{
          id: string;
          status: string;
          kickOffTime?: string;
          score?: { home: number; away: number };
        }> = [];

        await Promise.all(
          uniqueFixtureIds.map(async (fid) => {
            const cid = cleanFixtureId(fid);
            directProbeCooldown.set(cid, nowMs);
            try {
              const probe = await flashscoreScraperService.fetchMatchStatusAndScore(fid);
              if (!probe) return;
              if (probe.status === 'FINISHED' || probe.status === 'LIVE' || probe.status === 'CANCELLED' || probe.status === 'POSTPONED') {
                statusUpdates.push({
                  id: fid.startsWith('fs_') ? fid : `fs_${cid}`,
                  status: probe.status,
                  kickOffTime: probe.status === 'FINISHED' ? 'FT' : probe.status === 'CANCELLED' || probe.status === 'POSTPONED' ? probe.status : undefined,
                  score:
                    probe.homeScore !== undefined && probe.awayScore !== undefined
                      ? { home: probe.homeScore, away: probe.awayScore }
                      : undefined,
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
      }
    }

    db.evaluateBets(liveScores);
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
