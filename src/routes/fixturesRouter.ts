import { Router } from 'express';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { EngineService } from '../services/engineService.js';
import { providerManager } from '../providers/providerManager.js';
import { ApexEngine } from '../core/poisson.js';
import { EngineSettings, Fixture } from '../core/types.js';
import { getRelativeDateStr } from '../core/seedData.js';
import { isMatchStarted } from '../core/accumulator.js';
import { getLeaguePriority } from '../core/leaguePriority.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';
import { loggerService } from '../services/loggerService.js';
import { OnDemandParser } from '../core/onDemandParser.js';

export const fixturesRouter = Router();

fixturesRouter.get('/', async (req, res) => {
  try {
    const leagueFilter = req.query.league as string | undefined;
    const dateFilter = req.query.dateFilter as string | undefined;
    const dateParam = req.query.date as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    await predictionsDb.init();

    // If predictions database has no records yet, seed non-blockingly in background
    if (predictionsDb.count() === 0) {
      (async () => {
        try {
          const provider = providerManager.getActiveProvider();
          const initialUpcoming = await provider.getUpcomingFixtures();
          await EngineService.predictAndStoreUpcomingFixtures(initialUpcoming);
          const liveInUpcoming = initialUpcoming.filter((f) => f.status === 'LIVE');
          if (liveInUpcoming.length > 0 && predictionsDb.countLivePredictions() === 0) {
            await EngineService.predictAndStoreLiveFixtures(liveInUpcoming);
          }
          loggerService.addLog({
            level: 'SUCCESS',
            category: 'DATA_FETCH',
            source: 'FixturesRouter',
            message: `Background seeding completed with ${initialUpcoming.length} fixtures`,
          });
        } catch (bgErr: any) {
          loggerService.addLog({
            level: 'ERROR',
            category: 'DATA_FETCH',
            source: 'FixturesRouter',
            message: `Background seeding error: ${bgErr?.message}`,
          });
        }
      })().catch(() => {});
    }

    // Display predictions queried directly from the separate predictions db
    const resultFixtures = predictionsDb.getPredictions({
      league: leagueFilter,
      date: dateParam,
      dateFilter,
      startDate,
      endDate,
    });

    res.json({
      success: true,
      provider: 'PREDICTIONS_DB',
      count: resultFixtures.length,
      fixtures: resultFixtures,
    });
  } catch (err: any) {
    console.error('Error fetching fixtures from predictions db:', err);
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
      await EngineService.predictAndStoreLiveFixtures(liveFixtures);
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
      await EngineService.predictAndStoreHistoricalMatches(allHist);
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
    await predictionsDb.init();
    const stored = predictionsDb.getPredictionById(fixtureId);

    if (stored) {
      // Enrich with real scraped H2H details and on-demand parsed raw match statistics
      const cleanId = (stored.id || fixtureId).replace(/^fs_/, '');
      const realH2H = await flashscoreScraperService.getMatchHeadToHead(cleanId, stored.homeTeam, stored.awayTeam);
      const parsedMatch = await OnDemandParser.getParsedMatch(cleanId);

      loggerService.addLog({
        level: 'INFO',
        category: 'DATA_FETCH',
        source: 'MatchDetail',
        message: `Retrieved authoritative prediction for ${stored.homeTeam} vs ${stored.awayTeam} with on-demand parsed data`,
      });

      return res.json({
        success: true,
        fixture: {
          ...stored,
          statistics: parsedMatch?.statistics && parsedMatch.statistics.length > 0 ? parsedMatch.statistics : stored.statistics,
          score: (parsedMatch?.homeScore !== undefined && parsedMatch?.awayScore !== undefined)
            ? { home: parsedMatch.homeScore, away: parsedMatch.awayScore }
            : stored.score,
          measurements: {
            ...stored.measurements,
            h2h: realH2H && realH2H.matchesCount > 0 ? realH2H : stored.measurements?.h2h,
          },
          h2hMatches: realH2H?.recentH2H || [],
        },
      });
    }

    // If fixture was not yet predicted, load from active provider and run through unified engine
    const provider = providerManager.getActiveProvider();
    const fixtures = await provider.getUpcomingFixtures();
    let f = fixtures.find(
      (item) => item.id === fixtureId || item.id === `fs_${fixtureId}` || item.id.replace('fs_', '') === fixtureId
    ) || null;

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

    const allMatches = EngineService.getUnifiedHistoricalUniverse();
    const cleanId = (f.id || fixtureId).replace(/^fs_/, '');
    const realH2H = await flashscoreScraperService.getMatchHeadToHead(cleanId, f.homeTeam, f.awayTeam);

    const tacticalInput = {
      information: f.information,
      restDaysHome: f.restDaysHome,
      restDaysAway: f.restDaysAway,
      stage: f.stage,
    };

    const enrichedFixture = EngineService.predictFixtureUnified(f, allMatches, settings, realH2H, tacticalInput);

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
