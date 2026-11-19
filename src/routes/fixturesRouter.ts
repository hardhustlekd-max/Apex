import { Router } from 'express';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { cleanFixtureId } from '../core/types.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';
import { loggerService } from '../services/loggerService.js';
import { OnDemandParser } from '../core/onDemandParser.js';
import { fixturesWorkerService } from '../services/fixturesWorkerService.js';
import { getMatchDetailById } from '../services/matchDetailService.js';

export const fixturesRouter = Router();

function isEtagMatch(clientEtag: string | undefined, serverEtag: string): boolean {
  if (!clientEtag) return false;
  return clientEtag === serverEtag || clientEtag === `W/${serverEtag}`;
}

fixturesRouter.get('/', async (req, res) => {
  try {
    const leagueFilter = req.query.league as string | undefined;
    const dateFilter = req.query.dateFilter as string | undefined;
    const dateParam = req.query.date as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const search = req.query.search as string | undefined;
    const sortBy = req.query.sortBy as string | undefined;
    const marketFilter = req.query.marketFilter as string | undefined;
    const forceRefresh = req.query.force === '1' || req.query.force === 'true';

    const result = await fixturesWorkerService.queryUpcomingFixtures({
      league: leagueFilter,
      date: dateParam,
      dateFilter,
      startDate,
      endDate,
      search,
      sortBy,
      marketFilter,
      forceRefresh,
    });

    res.setHeader('ETag', result.etag);
    res.setHeader('Cache-Control', 'private, no-cache, stale-while-revalidate=60');

    if (isEtagMatch(req.headers['if-none-match'], result.etag)) {
      return res.status(304).end();
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(result.jsonPayload);
  } catch (err: any) {
    loggerService.addLog({
      level: 'ERROR',
      category: 'DATA_FETCH',
      source: 'FixturesRouter',
      message: `Error fetching fixtures: ${err?.message}`,
    });
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch predictions' });
  }
});

fixturesRouter.get('/leagues', (_req, res) => {
  try {
    const catalog = fixturesWorkerService.getSortedLeaguesCatalog();
    res.setHeader('ETag', catalog.etag);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (isEtagMatch(_req.headers['if-none-match'], catalog.etag)) {
      return res.status(304).end();
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(catalog.jsonPayload);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to load leagues catalog' });
  }
});

fixturesRouter.get('/featured-tips', async (req, res) => {
  try {
    const forceRefresh = req.query.force === '1' || req.query.force === 'true';
    const result = await fixturesWorkerService.getFeaturedHighConfidenceTips(forceRefresh);

    res.setHeader('ETag', result.etag);
    res.setHeader('Cache-Control', 'private, no-cache, stale-while-revalidate=60');

    if (isEtagMatch(req.headers['if-none-match'], result.etag)) {
      return res.status(304).end();
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(result.jsonPayload);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to load featured tips' });
  }
});

fixturesRouter.get('/live', async (req, res) => {
  try {
    const league = req.query.league as string | undefined;
    const search = req.query.search as string | undefined;
    const sortBy = req.query.sortBy as string | undefined;
    const marketFilter = req.query.marketFilter as string | undefined;
    const limit = parseInt((req.query.limit as string) || '200', 10);

    const result = await fixturesWorkerService.queryLiveFixtures({
      league,
      search,
      sortBy,
      marketFilter,
      limit,
    });

    res.setHeader('ETag', result.etag);
    res.setHeader('Cache-Control', 'private, no-cache');

    if (isEtagMatch(req.headers['if-none-match'], result.etag)) {
      return res.status(304).end();
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(result.jsonPayload);
  } catch (err: any) {
    console.error('Error fetching live predictions from predictions db:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch live predictions' });
  }
});

fixturesRouter.get('/history', async (req, res) => {
  try {
    const league = req.query.league as string | undefined;
    const search = req.query.search as string | undefined;
    const sortBy = req.query.sortBy as string | undefined;
    const marketFilter = req.query.marketFilter as string | undefined;
    const limit = parseInt((req.query.limit as string) || '300', 10);
    const forceRefresh = req.query.refresh === 'true' || req.query.refresh === '1';

    const result = await fixturesWorkerService.queryHistoryFixtures({
      league,
      search,
      sortBy,
      marketFilter,
      limit,
      forceRefresh,
    });

    res.setHeader('ETag', result.etag);
    res.setHeader('Cache-Control', 'private, no-cache');
    if (isEtagMatch(req.headers['if-none-match'], result.etag)) {
      return res.status(304).end();
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(result.jsonPayload);
  } catch (err: any) {
    console.error('Error fetching historical matches from predictions db:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch history' });
  }
});

fixturesRouter.get('/predictions/export', async (req, res) => {
  try {
    await db.init();
    await predictionsDb.init();
    const sortByProb = req.query.sortByProb as 'desc' | 'asc' | undefined;
    const payload = predictionsDb.export1X2Predictions(sortByProb);

    if (req.query.download === '1' || req.query.download === 'true') {
      const filename = `apex_1x2_predictions_${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(JSON.stringify(payload, null, 2));
    }

    res.json({
      success: true,
      ...payload,
    });
  } catch (err: any) {
    console.error('Error exporting predictions:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to export predictions' });
  }
});

fixturesRouter.post('/predictions/evaluate-imported', async (req, res) => {
  try {
    await db.init();
    await predictionsDb.init();
    const result = predictionsDb.evaluateImportedPredictions(req.body);
    res.json(result);
  } catch (err: any) {
    console.error('Error evaluating imported predictions:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to evaluate imported predictions' });
  }
});

fixturesRouter.get('/standings/catalog', async (req, res) => {
  try {
    const catalog = await fixturesWorkerService.getStandingsCatalog();
    res.setHeader('ETag', catalog.etag);
    res.setHeader('Cache-Control', 'private, no-cache');

    if (isEtagMatch(req.headers['if-none-match'], catalog.etag)) {
      return res.status(304).end();
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(catalog.jsonPayload);
  } catch (err: any) {
    console.error('Error loading standings catalog:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch standings catalog' });
  }
});

fixturesRouter.get('/standings/:league', async (req, res) => {
  try {
    const league = req.params.league || 'england_premier_league';
    const leagueUrl = typeof req.query.leagueUrl === 'string' ? req.query.leagueUrl : undefined;
    const leagueName = typeof req.query.leagueName === 'string' ? req.query.leagueName : undefined;
    const homeTeam = typeof req.query.homeTeam === 'string' ? req.query.homeTeam : undefined;
    const awayTeam = typeof req.query.awayTeam === 'string' ? req.query.awayTeam : undefined;
    const standings = await flashscoreScraperService.getLeagueStandings(league, {
      leagueUrl,
      leagueName,
      homeTeam,
      awayTeam,
    });
    res.json({
      success: true,
      league,
      standings,
    });
  } catch (err: any) {
    console.error('Error fetching league standings:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch league standings' });
  }
});

fixturesRouter.get('/:id/h2h', async (req, res) => {
  try {
    const fixtureId = req.params.id;
    let homeTeam = req.query.home as string | undefined;
    let awayTeam = req.query.away as string | undefined;
    const cleanId = cleanFixtureId(fixtureId);

    // If home or away team not provided in query params, resolve from DB
    if (!homeTeam || !awayTeam) {
      await db.init();
      await predictionsDb.init();
      const stored =
        predictionsDb.getPredictionById(fixtureId) ||
        predictionsDb.getPredictionById(cleanId) ||
        db.getFixtureById(fixtureId) ||
        db.getFixtureById(cleanId);
      if (stored) {
        homeTeam = homeTeam || stored.homeTeam;
        awayTeam = awayTeam || stored.awayTeam;
      }
    }

    let h2h = await flashscoreScraperService.getMatchHeadToHead(cleanId, homeTeam, awayTeam);
    if (
      !h2h ||
      (!h2h.matchesCount &&
        !h2h.homeRecentMatches?.length &&
        !h2h.awayRecentMatches?.length &&
        !h2h.recentH2H?.length)
    ) {
      h2h = await OnDemandParser.getParsedH2H(fixtureId, homeTeam, awayTeam);
    }
    res.json({ success: true, h2h });
  } catch (err: any) {
    console.error('Error fetching fixture H2H:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch H2H' });
  }
});

fixturesRouter.get('/:id', async (req, res) => {
  try {
    const fixture = await getMatchDetailById(req.params.id);
    if (!fixture) {
      return res.status(404).json({ success: false, error: 'Fixture not found in database' });
    }
    return res.json({ success: true, fixture });
  } catch (err: any) {
    loggerService.addLog({
      level: 'ERROR',
      category: 'DATA_FETCH',
      source: 'MatchDetail',
      message: `Error fetching fixture detail for ${req.params.id}: ${err?.message}`,
    });
    console.error('Error fetching fixture detail:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch fixture detail' });
  }
});
