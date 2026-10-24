import { Router } from 'express';
import { providerManager } from '../providers/providerManager.js';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { EngineSettings, Fixture } from '../core/types.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';
import { ServerEngine } from '../core/serverEngine.js';
import { getRelativeDateStr } from '../core/dateUtils.js';
import { loggerService } from '../services/loggerService.js';

export const providersRouter = Router();

providersRouter.get('/', (req, res) => {
  try {
    const list = providerManager.getAllProvidersStatus();
    const activeProvider = providerManager.getActiveProvider();

    res.json({
      success: true,
      activeProviderId: activeProvider.id,
      providers: list,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to list providers' });
  }
});

providersRouter.post('/switch', async (req, res) => {
  try {
    const { providerId } = req.body;
    if (!providerId) {
      return res.status(400).json({ success: false, error: 'providerId is required' });
    }

    const switched = providerManager.setActiveProvider(providerId as EngineSettings['activeProvider']);
    if (!switched) {
      return res.status(400).json({ success: false, error: 'Invalid provider ID' });
    }

    const activeProvider = providerManager.getActiveProvider();
    // Optional sync
    const syncRes = await activeProvider.syncHistoricalData();

    res.json({
      success: true,
      activeProvider: activeProvider.name,
      message: `Active provider hot-swapped to ${activeProvider.name}`,
      syncDetails: syncRes,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to switch provider' });
  }
});

providersRouter.get('/live-scores', async (req, res) => {
  try {
    const activeProvider = providerManager.getActiveProvider();
    const scores = await activeProvider.getLiveScores().catch((err) => {
      loggerService.addLog({
        level: 'WARN',
        category: 'SCRAPER',
        source: 'ProvidersRouter',
        message: `Live scores fetch failed gracefully: ${err?.message || 'Network error'}`,
      });
      return [];
    });

    // Ensure live match predictions are calculated and kept fresh in predictionsDb
    await predictionsDb.init();
    if (scores && scores.length > 0) {
      const liveFixtures: Fixture[] = scores.map((s) => ({
        id: s.fixtureId,
        providerId: 'FLASHSCORE',
        league: s.league || 'ALL',
        leagueName: s.leagueName || 'Live In-Play',
        matchDate: getRelativeDateStr(0),
        kickOffTime: s.status === 'FINISHED' ? 'FT' : `${s.minute}'`,
        homeTeam: s.homeTeam,
        awayTeam: s.awayTeam,
        status: 'LIVE' as const,
        minute: s.minute,
        score: { home: s.homeScore, away: s.awayScore },
        odds: {
          homeWin: 2.10,
          draw: 3.30,
          awayWin: 3.40,
          over25: 1.85,
          under25: 1.95,
        },
      }));
      await ServerEngine.predictAndStoreLiveFixtures(liveFixtures);
    }

    res.json({
      success: true,
      provider: 'PREDICTIONS_DB',
      scores: scores || [],
    });
  } catch (err: any) {
    loggerService.addLog({
      level: 'ERROR',
      category: 'DATA_FETCH',
      source: 'ProvidersRouter',
      message: `Failed to get live scores: ${err?.message || 'Unknown error'}`,
      details: { error: err?.message, stack: err?.stack },
    });
    res.json({ success: true, provider: 'PREDICTIONS_DB', scores: [] });
  }
});

// Flashscore Scraper specific endpoints
providersRouter.get('/flashscore/scrape', async (req, res) => {
  try {
    const date = req.query.date as string | undefined;
    const fixtures = await flashscoreScraperService.getUpcomingFixtures(date);
    res.json({
      success: true,
      count: fixtures.length,
      fixtures,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to scrape Flashscore' });
  }
});

async function runSyncWorkflow(options: { resetDatabase: boolean; resetRawFeeds: boolean }) {
  if (options.resetDatabase || options.resetRawFeeds) {
    loggerService.addLog({
      level: 'INFO',
      category: 'DATABASE',
      source: 'SyncEngine',
      message: 'Purging database tables, raw feeds, and cached predictions...',
    });
    db.clearAllData(options.resetRawFeeds);
    predictionsDb.clearAll();
    flashscoreScraperService.clearCaches();
  }

  loggerService.addLog({
    level: 'INFO',
    category: 'DATABASE',
    source: 'SyncEngine',
    message: 'Starting Flashscore historical & upcoming feeds synchronization...',
  });

  const syncRes = await flashscoreScraperService.syncHistoricalData(7);
  const upcoming = await flashscoreScraperService.getUpcomingFixtures();
  const predRes = await ServerEngine.predictAndStoreUpcomingFixtures(upcoming);

  // Predict and store historical matches in predictions db
  const rawMatches = db.getAllHistoricalMatches(1500);
  const scrapedMatches = db.getFlashscoreScrapedMatches(500);
  const scrapedAsHistorical: any[] = scrapedMatches
    .filter((sm) => sm.result?.home !== undefined && sm.result?.away !== undefined)
    .map((sm, idx) => ({
      id: sm.matchId || `scraped_${idx}`,
      div: sm.leagueName || sm.stage || 'FLASHSCORE',
      leagueName: sm.leagueName || sm.stage || 'FLASHSCORE',
      matchDate: sm.date ? sm.date.slice(0, 10) : '2024-01-01',
      homeTeam: sm.home.name,
      awayTeam: sm.away.name,
      fthg: parseInt(sm.result!.home!, 10) || 0,
      ftag: parseInt(sm.result!.away!, 10) || 0,
      ftr: (parseInt(sm.result!.home!, 10) || 0) > (parseInt(sm.result!.away!, 10) || 0) ? 'H' : (parseInt(sm.result!.home!, 10) || 0) < (parseInt(sm.result!.away!, 10) || 0) ? 'A' : 'D',
    }));
  const allHist = [...rawMatches, ...scrapedAsHistorical];
  const histPredRes = await ServerEngine.predictAndStoreHistoricalMatches(allHist);

  // Update live predictions if any live games are active
  const activeProvider = providerManager.getActiveProvider();
  const liveScores = await activeProvider.getLiveScores().catch(() => []);
  let livePredCount = 0;
  if (liveScores && liveScores.length > 0) {
    const liveFixtures: Fixture[] = liveScores.map((s) => ({
      id: s.fixtureId,
      providerId: 'FLASHSCORE',
      league: s.league || 'ALL',
      leagueName: s.leagueName || 'Live In-Play',
      matchDate: getRelativeDateStr(0),
      kickOffTime: s.status === 'FINISHED' ? 'FT' : `${s.minute}'`,
      homeTeam: s.homeTeam,
      awayTeam: s.awayTeam,
      status: 'LIVE' as const,
      minute: s.minute,
      score: { home: s.homeScore, away: s.awayScore },
      odds: {
        homeWin: 2.10,
        draw: 3.30,
        awayWin: 3.40,
        over25: 1.85,
        under25: 1.95,
      },
    }));
    const liveRes = await ServerEngine.predictAndStoreLiveFixtures(liveFixtures);
    livePredCount = liveRes.count;
  }

  const updatedStats = {
    ...db.getStatsSummary(),
    rawFeedsCount: db.getRawFeedsCount(),
    upcomingCount: db.getUpcomingFixturesCount(),
    predictionsCount: predictionsDb.count(),
  };

  loggerService.addLog({
    level: 'SUCCESS',
    category: 'DATA_FETCH',
    source: 'SyncEngine',
    message: `Sync completed: ${upcoming.length} upcoming fixtures, ${allHist.length} historical, ${livePredCount} live predicted`,
  });

  return {
    success: true,
    message: options.resetDatabase || options.resetRawFeeds
      ? `Database & raw feeds reset and fully synchronized (${predRes.count} upcoming, ${livePredCount} live, ${histPredRes.count} historical predictions)`
      : `Predictions updated in database (${predRes.count} upcoming, ${livePredCount} live, ${histPredRes.count} historical)`,
    matchesCount: syncRes.matchesCount,
    upcomingCount: upcoming.length,
    predictionsCount: predRes.count,
    historicalPredictionsCount: histPredRes.count,
    livePredictionsCount: livePredCount,
    stats: updatedStats,
  };
}

// Unified Reset Database, Raw Feeds & Full Data Sync
providersRouter.post('/flashscore/reset-and-sync', async (req, res) => {
  try {
    const result = await runSyncWorkflow({ resetDatabase: true, resetRawFeeds: true });
    res.json(result);
  } catch (err: any) {
    loggerService.addLog({
      level: 'ERROR',
      category: 'DATA_FETCH',
      source: 'SyncEngine',
      message: `Failed to reset and sync Flashscore data: ${err?.message}`,
    });
    res.status(500).json({ success: false, error: err?.message || 'Failed to reset and sync Flashscore data' });
  }
});

// Standard sync route with optional reset support
providersRouter.post('/flashscore/sync', async (req, res) => {
  try {
    const resetDatabase = req.body?.resetDatabase ?? true;
    const resetRawFeeds = req.body?.resetRawFeeds ?? true;
    const result = await runSyncWorkflow({ resetDatabase, resetRawFeeds });
    res.json(result);
  } catch (err: any) {
    loggerService.addLog({
      level: 'ERROR',
      category: 'DATA_FETCH',
      source: 'SyncEngine',
      message: `Failed to sync Flashscore data: ${err?.message}`,
    });
    res.status(500).json({ success: false, error: err?.message || 'Failed to sync Flashscore data' });
  }
});

providersRouter.get('/flashscore/matches', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 500;
    const leagueFilter = (req.query.league as string || '').toLowerCase().trim();
    const countryFilter = (req.query.country as string || '').toLowerCase().trim();

    let matches = db.getFlashscoreScrapedMatches(limit);

    if (countryFilter) {
      matches = matches.filter((m) => (m.country || '').toLowerCase().includes(countryFilter));
    }

    if (leagueFilter) {
      matches = matches.filter((m) =>
        (m.leagueName || '').toLowerCase().includes(leagueFilter) ||
        (m.stage || '').toLowerCase().includes(leagueFilter)
      );
    }

    res.json({
      success: true,
      count: matches.length,
      matches,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to retrieve Flashscore matches' });
  }
});

providersRouter.get('/flashscore/export', (req, res) => {
  try {
    const format = (req.query.format as 'json' | 'json-array') || 'json';
    const matches = db.getFlashscoreScrapedMatches(500);
    const exported = flashscoreScraperService.exportData(matches, format);

    res.setHeader('Content-Type', 'application/json');
    res.send(exported);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to export Flashscore data' });
  }
});
