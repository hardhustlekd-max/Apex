import { Router } from 'express';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { ServerEngine } from '../core/serverEngine.js';
import { providerManager } from '../providers/providerManager.js';
import { ApexEngine } from '../core/poisson.js';
import { EngineSettings, Fixture } from '../core/types.js';
import { getRelativeDateStr, normalizeDateStr } from '../core/dateUtils.js';
import { isMatchStarted } from '../core/accumulator.js';
import { getLeaguePriority } from '../core/leaguePriority.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';
import { loggerService } from '../services/loggerService.js';
import { OnDemandParser } from '../core/onDemandParser.js';
import { ServerPredictionGeneratorService } from '../services/serverPredictionGeneratorService.js';
import { DEFAULT_HISTORICAL_MATCHES } from '../core/defaultHistoricalMatches.js';

export const fixturesRouter = Router();

fixturesRouter.get('/', async (req, res) => {
  try {
    const leagueFilter = req.query.league as string | undefined;
    const dateFilter = req.query.dateFilter as string | undefined;
    const dateParam = req.query.date as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    await db.init();
    await predictionsDb.init();

    const dbCount = db.getUpcomingFixturesCount();
    const predCount = predictionsDb.count();

    // If both upcoming fixtures database and predictions database have 0 records, trigger background ingestion or generate from DB
    if (dbCount === 0 && predCount === 0) {
      loggerService.addLog({
        level: 'INFO',
        category: 'DATA_FETCH',
        source: 'FixturesRouter',
        message: 'No upcoming fixtures in database. Attempting scraper fetch or server-side prediction generation from DB...',
      });
      try {
        const initialUpcoming = await Promise.race([
          flashscoreScraperService.getUpcomingFixtures(),
          new Promise<Fixture[]>((_, reject) => setTimeout(() => reject(new Error('Feed timeout')), 8000))
        ]).catch(() => []);

        if (initialUpcoming && initialUpcoming.length > 0) {
          await ServerEngine.predictAndStoreUpcomingFixtures(initialUpcoming);
          const liveInUpcoming = initialUpcoming.filter((f) => f.status === 'LIVE');
          if (liveInUpcoming.length > 0) {
            await ServerEngine.predictAndStoreLiveFixtures(liveInUpcoming);
          }
        } else {
          await ServerPredictionGeneratorService.generateAndStorePredictionsFromDb();
        }
      } catch (err: any) {
        console.warn('Initial ingestion notice:', err?.message);
        await ServerPredictionGeneratorService.generateAndStorePredictionsFromDb();
      }
    }

    // Retrieve predictions using ServerPredictionGeneratorService
    let resultFixtures = await ServerPredictionGeneratorService.getPredictionsForUi({
      league: leagueFilter,
      date: dateParam,
      dateFilter,
      startDate,
      endDate,
    });

    loggerService.addLog({
      level: 'INFO',
      category: 'DATA_FETCH',
      source: 'FixturesRouter',
      message: `Returning ${resultFixtures.length} upcoming fixtures for filter (${leagueFilter || 'ALL'}, ${dateFilter || dateParam || 'ALL'})`,
    });

    res.json({
      success: true,
      provider: 'FLASHSCORE',
      count: resultFixtures.length,
      fixtures: resultFixtures,
    });
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

fixturesRouter.get('/live', async (req, res) => {
  try {
    const league = req.query.league as string | undefined;
    const limit = parseInt((req.query.limit as string) || '100', 10);

    await predictionsDb.init();

    // Fetch fresh live scores and ensure live predictions are up-to-date
    const activeProvider = providerManager.getActiveProvider();
    const liveScores = await activeProvider.getLiveScores();
    let liveFixtures: Fixture[] = [];
    if (liveScores && liveScores.length > 0) {
      liveFixtures = liveScores.map((s) => ({
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
    }

    if (liveFixtures.length === 0 && predictionsDb.countLivePredictions() === 0) {
      const upcoming = db.getUpcomingFixtures();
      const liveFromDb = upcoming.filter((f) => f.status === 'LIVE');
      if (liveFromDb.length > 0) {
        liveFixtures = liveFromDb;
      }
    }

    if (liveFixtures.length > 0) {
      await ServerEngine.predictAndStoreLiveFixtures(liveFixtures);
    }

    const livePredictions = predictionsDb.getLivePredictions({ league, limit });

    res.json({
      success: true,
      provider: 'PREDICTIONS_DB',
      count: livePredictions.length,
      fixtures: livePredictions,
    });
  } catch (err: any) {
    console.error('Error fetching live predictions from predictions db:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch live predictions' });
  }
});

fixturesRouter.get('/history', async (req, res) => {
  try {
    const league = req.query.league as string | undefined;
    const limit = parseInt((req.query.limit as string) || '300', 10);

    await predictionsDb.init();

    // If historical predictions db has no records yet, populate with raw historical and scraped matches
    if (predictionsDb.countHistoricalPredictions() === 0) {
      let rawMatches = db.getAllHistoricalMatches(1500);
      if (rawMatches.length === 0) {
        db.insertHistoricalMatches(DEFAULT_HISTORICAL_MATCHES);
        rawMatches = DEFAULT_HISTORICAL_MATCHES;
      }
      const scrapedMatches = db.getFlashscoreScrapedMatches(500);
      const scrapedAsHistorical: any[] = scrapedMatches
        .filter((sm) => sm.result?.home !== undefined && sm.result?.away !== undefined)
        .map((sm, idx) => ({
          id: sm.matchId || `scraped_${idx}`,
          div: sm.leagueName || sm.stage || 'FLASHSCORE',
          leagueName: sm.leagueName || sm.stage || 'FLASHSCORE',
          matchDate: normalizeDateStr(sm.date ? sm.date.slice(0, 10) : getRelativeDateStr(-365)),
          homeTeam: sm.home.name,
          awayTeam: sm.away.name,
          fthg: parseInt(sm.result!.home!, 10) || 0,
          ftag: parseInt(sm.result!.away!, 10) || 0,
          ftr: (parseInt(sm.result!.home!, 10) || 0) > (parseInt(sm.result!.away!, 10) || 0) ? 'H' : (parseInt(sm.result!.home!, 10) || 0) < (parseInt(sm.result!.away!, 10) || 0) ? 'A' : 'D',
        }));
      const allHist = [...rawMatches, ...scrapedAsHistorical];
      await ServerEngine.predictAndStoreHistoricalMatches(allHist);
    }

    // Load predictions from predictions db
    const matches = predictionsDb.getHistoricalPredictions({ league, limit });

    res.json({
      success: true,
      provider: 'PREDICTIONS_DB',
      count: matches.length,
      matches,
    });
  } catch (err: any) {
    console.error('Error fetching historical matches from predictions db:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch history' });
  }
});

fixturesRouter.get('/club/:clubName/recent', async (req, res) => {
  try {
    const clubName = req.params.clubName;
    const matchId = (req.query.matchId || req.query.fixtureId) as string | undefined;
    const matches = await flashscoreScraperService.getClubRecentMatches(clubName, matchId);
    res.json({
      success: true,
      club: clubName,
      matchesCount: matches.length,
      matches,
    });
  } catch (err: any) {
    console.error(`Error fetching recent matches for club ${req.params.clubName}:`, err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch club recent matches' });
  }
});

fixturesRouter.get('/:id/recent-matches', async (req, res) => {
  try {
    const fixtureId = req.params.id;
    const homeTeam = req.query.home as string | undefined;
    const awayTeam = req.query.away as string | undefined;
    const cleanId = fixtureId.replace(/^fs_/, '');
    const h2h = await flashscoreScraperService.getMatchHeadToHead(cleanId, homeTeam, awayTeam);
    res.json({
      success: true,
      fixtureId,
      homeClub: h2h.homeClub || homeTeam,
      awayClub: h2h.awayClub || awayTeam,
      homeRecentMatches: h2h.homeRecentMatches || [],
      awayRecentMatches: h2h.awayRecentMatches || [],
    });
  } catch (err: any) {
    console.error('Error fetching fixture recent matches:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch fixture recent matches' });
  }
});

fixturesRouter.get('/:id/h2h', async (req, res) => {
  try {
    const fixtureId = req.params.id;
    const homeTeam = req.query.home as string | undefined;
    const awayTeam = req.query.away as string | undefined;
    const cleanId = fixtureId.replace(/^fs_/, '');
    const h2h = await flashscoreScraperService.getMatchHeadToHead(cleanId, homeTeam, awayTeam);
    // h2h is already saved by the service
    res.json({ success: true, h2h });
  } catch (err: any) {
    console.error('Error fetching fixture H2H:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch H2H' });
  }
});

fixturesRouter.get('/:id', async (req, res) => {
  try {
    const fixtureId = req.params.id;
    await db.init();
    let stored = db.getFixtureById(fixtureId);
    if (!stored) {
      try {
        await predictionsDb.init();
        stored = predictionsDb.getPredictionById(fixtureId);
      } catch {
        // ignore
      }
    }

    if (stored) {
      // Enrich with real scraped H2H details and on-demand parsed raw match statistics
      const cleanId = (stored.id || fixtureId).replace(/^fs_/, '');
      const realH2H = await flashscoreScraperService.getMatchHeadToHead(cleanId, stored.homeTeam, stored.awayTeam);
      const parsedMatch = await OnDemandParser.getParsedMatch(cleanId);

      const settings: EngineSettings = db.getSettings() || {
        activeProvider: 'FLASHSCORE',
        rollingMatchWindow: 15,
        minEVThreshold: 1.10,
        safeWinThreshold: 0.72,
        homeAdvantageFactor: 1.12,
        formDecayRate: 0.85,
        autoSyncDaily: true,
      };

      const allMatches = ServerEngine.getUnifiedHistoricalUniverse();
      const restDaysHome = ServerEngine.calculateDynamicRestDays(
        stored.homeTeam,
        stored.matchDate,
        allMatches,
        realH2H?.homeRecentMatches
      );
      const restDaysAway = ServerEngine.calculateDynamicRestDays(
        stored.awayTeam,
        stored.matchDate,
        allMatches,
        realH2H?.awayRecentMatches
      );

      const tacticalInput = {
        information: stored.information,
        restDaysHome,
        restDaysAway,
        stage: stored.stage,
      };

      const enrichedStored = ServerEngine.predictFixtureUnified(
        {
          ...stored,
          statistics: parsedMatch?.statistics && parsedMatch.statistics.length > 0 ? parsedMatch.statistics : stored.statistics,
          score: (parsedMatch?.homeScore !== undefined && parsedMatch?.awayScore !== undefined)
            ? { home: parsedMatch.homeScore, away: parsedMatch.awayScore }
            : stored.score,
        },
        allMatches,
        settings,
        realH2H,
        tacticalInput
      );

      db.saveUpcomingFixtures([enrichedStored]);
      try {
        predictionsDb.savePredictions([enrichedStored]);
      } catch {
        // safe persistence
      }

      loggerService.addLog({
        level: 'INFO',
        category: 'DATA_FETCH',
        source: 'MatchDetail',
        message: `Retrieved authoritative prediction for ${stored.homeTeam} vs ${stored.awayTeam} with dynamic rest days (${restDaysHome}d vs ${restDaysAway}d)`,
      });

      return res.json({
        success: true,
        fixture: {
          ...enrichedStored,
          measurements: {
            ...enrichedStored.measurements,
            h2h: realH2H && realH2H.matchesCount > 0 ? realH2H : enrichedStored.measurements?.h2h,
          },
          h2hMatches: realH2H?.recentH2H || [],
        },
      });
    }

    // If fixture was not yet predicted, load from active provider and run through unified engine
    let f = db.getUpcomingFixtures().find(
      (item) => item.id === fixtureId || item.id === `fs_${fixtureId}` || item.id.replace('fs_', '') === fixtureId
    ) || predictionsDb.getPredictionById(fixtureId) || null;

    if (!f) {
      const fixtures = await flashscoreScraperService.getUpcomingFixtures();
      f = fixtures.find(
        (item) => item.id === fixtureId || item.id === `fs_${fixtureId}` || item.id.replace('fs_', '') === fixtureId
      ) || null;
    }

    if (!f) {
      return res.status(404).json({ success: false, error: 'Fixture not found' });
    }

    const settings: EngineSettings = db.getSettings() || {
      activeProvider: 'FLASHSCORE',
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    const allMatches = ServerEngine.getUnifiedHistoricalUniverse();
    const cleanId = (f.id || fixtureId).replace(/^fs_/, '');
    const realH2H = await flashscoreScraperService.getMatchHeadToHead(cleanId, f.homeTeam, f.awayTeam);

    const tacticalInput = {
      information: f.information,
      restDaysHome: f.restDaysHome,
      restDaysAway: f.restDaysAway,
      stage: f.stage,
    };

    const enrichedFixture = ServerEngine.predictFixtureUnified(f, allMatches, settings, realH2H, tacticalInput);

    db.saveUpcomingFixtures([enrichedFixture]);
    try {
      predictionsDb.savePredictions([enrichedFixture]);
    } catch {
      // safe persistence
    }

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'PREDICTION',
      source: 'ApexEngine',
      message: `Generated unified 5-pillar prediction for unpredicted match ${f.homeTeam} vs ${f.awayTeam}`,
    });

    res.json({
      success: true,
      fixture: {
        ...enrichedFixture,
        h2hMatches: realH2H.recentH2H,
      },
    });
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

fixturesRouter.get('/standings/:league', async (req, res) => {
  try {
    const league = req.params.league || 'england_premier_league';
    const standings = await flashscoreScraperService.getLeagueStandings(league);
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

fixturesRouter.get('/standings', async (req, res) => {
  try {
    const league = (req.query.league as string) || 'england_premier_league';
    const standings = await flashscoreScraperService.getLeagueStandings(league);
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
