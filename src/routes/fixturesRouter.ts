import { Router } from 'express';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { ServerEngine } from '../core/serverEngine.js';
import { ApexEngine } from '../core/poisson.js';
import { EngineSettings, Fixture } from '../core/types.js';
import { getRelativeDateStr, normalizeDateStr } from '../core/dateUtils.js';
import { isMatchStarted } from '../core/accumulator.js';
import { getLeaguePriority } from '../core/leaguePriority.js';
import { flashscoreScraperService, convertHistoricalMatchToFixture } from '../services/flashscoreScraperService.js';
import { loggerService } from '../services/loggerService.js';
import { OnDemandParser } from '../core/onDemandParser.js';
import { ServerPredictionGeneratorService } from '../services/serverPredictionGeneratorService.js';


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

    // Retrieve predictions strictly as static read-only data from database
    let resultFixtures = await ServerPredictionGeneratorService.getPredictionsForUi({
      league: leagueFilter,
      date: dateParam,
      dateFilter,
      startDate,
      endDate,
    });

    const predictedCount = resultFixtures.filter((f) => Boolean(f.prediction)).length;

    loggerService.addLog({
      level: 'INFO',
      category: 'DATA_FETCH',
      source: 'FixturesRouter',
      message: `Returning ${resultFixtures.length} fixtures (${predictedCount} with stored predictions) for filter (${leagueFilter || 'ALL'}, ${dateFilter || dateParam || 'ALL'})`,
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

    await db.init();
    await predictionsDb.init();

    // Fetch fresh live scores from active provider
    const liveScores = await flashscoreScraperService.getLiveScores().catch(() => []);
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
      }));
    }

    if (liveFixtures.length === 0) {
      const upcoming = db.getUpcomingFixtures();
      const liveFromDb = upcoming.filter((f) => f.status === 'LIVE');
      if (liveFromDb.length > 0) {
        liveFixtures = liveFromDb;
      }
    }

    // Pure read-only lookup for existing pre-match prediction in database
    // If prediction exists in DB, attach it; if not, return live score only without dynamic compute
    const enrichedLive = liveFixtures.map((lf) => {
      const cleanId = (lf.id || '').replace(/^fs_/, '');
      const stored =
        predictionsDb.getPredictionById(lf.id) ||
        predictionsDb.getPredictionById(cleanId) ||
        db.getFixtureById(lf.id) ||
        db.getFixtureById(cleanId);

      if (stored && stored.prediction) {
        return {
          ...lf,
          prediction: stored.prediction,
          markets: stored.markets || lf.markets,
          homeStats: stored.homeStats || lf.homeStats,
          awayStats: stored.awayStats || lf.awayStats,
          measurements: stored.measurements || lf.measurements,
        };
      }

      // Fallback: return live score without prediction object
      return lf;
    });

    if (league && league !== 'ALL') {
      const filterUpper = league.toUpperCase();
      const filtered = enrichedLive.filter((f) => (f.league || '').toUpperCase() === filterUpper);
      return res.json({
        success: true,
        provider: 'PREDICTIONS_DB',
        count: filtered.slice(0, limit).length,
        fixtures: filtered.slice(0, limit),
      });
    }

    res.json({
      success: true,
      provider: 'PREDICTIONS_DB',
      count: enrichedLive.slice(0, limit).length,
      fixtures: enrichedLive.slice(0, limit),
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
    const forceRefresh = req.query.refresh === 'true' || req.query.refresh === '1';

    await db.init();
    await predictionsDb.init();
    await predictionsDb.reconcileAndSyncResults({ force: forceRefresh });

    // Query predictions strictly from unified predictionsDb
    // This is the authoritative source for evaluated model outputs
    const matches = await predictionsDb.getHistoricalPredictionsAsync({ league, limit });
    const summary = predictionsDb.getEvaluationSummary();

    res.json({
      success: true,
      provider: 'PREDICTIONS_DB',
      count: matches.length,
      matches,
      summary,
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
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').replace(/^scraped_/, '').trim();
    const h2h = await OnDemandParser.getParsedH2H(fixtureId, homeTeam, awayTeam) || await flashscoreScraperService.getMatchHeadToHead(cleanId, homeTeam, awayTeam);
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
    let homeTeam = req.query.home as string | undefined;
    let awayTeam = req.query.away as string | undefined;
    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').replace(/^scraped_/, '').trim();

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
    if (!h2h || (!h2h.matchesCount && !h2h.homeRecentMatches?.length)) {
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
    const fixtureId = req.params.id;
    await db.init();
    await predictionsDb.init();

    const cleanId = fixtureId.replace(/^fs_/, '').replace(/^hist_/, '').replace(/^scraped_/, '').trim();
    let stored =
      predictionsDb.getPredictionById(fixtureId) ||
      predictionsDb.getPredictionById(cleanId) ||
      db.getFixtureById(fixtureId) ||
      db.getFixtureById(cleanId);

    if (!stored) {
      const scrapedList = db.getFlashscoreScrapedMatches(2000);
      const foundScraped = scrapedList.find(
        (m) => m.matchId === fixtureId || m.matchId === cleanId || `fs_${m.matchId}` === fixtureId || `hist_${m.matchId}` === fixtureId
      );
      if (foundScraped) {
        const homeScore = foundScraped.result?.home !== undefined ? parseInt(foundScraped.result.home, 10) : undefined;
        const awayScore = foundScraped.result?.away !== undefined ? parseInt(foundScraped.result.away, 10) : undefined;
        stored = {
          id: `fs_${foundScraped.matchId}`,
          providerId: 'FLASHSCORE',
          league: foundScraped.leagueName || foundScraped.stage || 'FLASHSCORE',
          leagueName: foundScraped.leagueName || foundScraped.stage || 'FLASHSCORE',
          matchDate: normalizeDateStr(foundScraped.date ? foundScraped.date.slice(0, 10) : getRelativeDateStr(0)),
          kickOffTime: foundScraped.date && foundScraped.date.length > 10 ? foundScraped.date.slice(11, 16) : 'FT',
          homeTeam: foundScraped.home.name,
          awayTeam: foundScraped.away.name,
          status: foundScraped.status === 'FINISHED' ? 'FINISHED' : foundScraped.status === 'LIVE' ? 'LIVE' : 'SCHEDULED',
          score: homeScore !== undefined && awayScore !== undefined ? { home: homeScore, away: awayScore } : undefined,
          statistics: foundScraped.statistics || [],
          information: foundScraped.information || [],
        };
      }
    }

    if (!stored) {
      const histList = db.getAllHistoricalMatches(5000);
      const foundHist = histList.find(
        (m) => m.id === fixtureId || m.id === cleanId || m.id === `fs_hist_${cleanId}` || m.id === `hist_${cleanId}`
      );
      if (foundHist) {
        stored = convertHistoricalMatchToFixture(foundHist);
      }
    }

    if (!stored) {
      const parsedMatch = await OnDemandParser.getParsedMatch(fixtureId);
      if (parsedMatch) {
        const homeScore = parsedMatch.homeScore;
        const awayScore = parsedMatch.awayScore;
        const isFin = parsedMatch.statusCode === '3';
        const isLive = parsedMatch.statusCode === '2';
        stored = {
          id: `fs_${parsedMatch.matchId}`,
          providerId: 'FLASHSCORE',
          league: parsedMatch.tournament || 'FLASHSCORE',
          leagueName: parsedMatch.tournament || 'FLASHSCORE',
          matchDate: normalizeDateStr(parsedMatch.timestamp ? new Date(parsedMatch.timestamp * 1000).toISOString().slice(0, 10) : getRelativeDateStr(0)),
          kickOffTime: isFin ? 'FT' : '19:00',
          homeTeam: parsedMatch.homeTeam,
          awayTeam: parsedMatch.awayTeam,
          status: isFin ? 'FINISHED' : isLive ? 'LIVE' : 'SCHEDULED',
          score: homeScore !== undefined && awayScore !== undefined ? { home: homeScore, away: awayScore } : undefined,
          statistics: parsedMatch.statistics || [],
        };
      }
    }

    if (!stored) {
      loggerService.addLog({
        level: 'WARN',
        category: 'DATA_FETCH',
        source: 'MatchDetail',
        message: `Fixture ${fixtureId} not found in database for match detail`,
      });
      return res.status(404).json({ success: false, error: 'Fixture not found in database' });
    }

    if (!stored.prediction) {
      const predStored = predictionsDb.getPredictionById(fixtureId) || predictionsDb.getPredictionById(cleanId);
      if (predStored && predStored.prediction) {
        stored.prediction = predStored.prediction;
        stored.markets = predStored.markets;
        stored.homeStats = predStored.homeStats;
        stored.awayStats = predStored.awayStats;
        stored.measurements = predStored.measurements;
      }
    }

    // Ensure H2H measurement is attached
    if (!stored.measurements?.h2h || (!stored.measurements.h2h.matchesCount && !stored.measurements.h2h.homeRecentMatches?.length)) {
      const h2hData = await flashscoreScraperService.getMatchHeadToHead(cleanId, stored.homeTeam, stored.awayTeam);
      if (h2hData && (h2hData.matchesCount > 0 || h2hData.homeRecentMatches?.length || h2hData.recentH2H?.length)) {
        stored.measurements = {
          ...(stored.measurements || {}),
          h2h: h2hData,
        };
        stored.h2hMatches = h2hData.recentH2H || stored.h2hMatches || [];
      }
    }

    // Ensure match information is populated
    if (!stored.information || stored.information.length === 0) {
      stored.information = [
        { category: 'Match Date', value: stored.matchDate },
        { category: 'Competition', value: stored.leagueName || stored.league || 'League' },
        { category: 'Status', value: stored.status === 'FINISHED' ? 'Full Time' : stored.status === 'LIVE' ? 'Live' : 'Scheduled' },
        ...(stored.score ? [{ category: 'Result', value: `${stored.score.home} - ${stored.score.away}` }] : []),
      ];
    }

    // Ensure team stats goals summary is populated from recent matches if missing
    if (!stored.homeStats && stored.measurements?.h2h?.homeRecentMatches?.length) {
      const homeMatches = stored.measurements.h2h.homeRecentMatches;
      const goalsScored = homeMatches.reduce((acc, m) => acc + (m.goalsFor || 0), 0);
      const goalsConceded = homeMatches.reduce((acc, m) => acc + (m.goalsAgainst || 0), 0);
      const matchesPlayed = homeMatches.length;
      stored.homeStats = {
        teamName: stored.homeTeam,
        homeAttack: 1.0,
        homeDefense: 1.0,
        awayAttack: 1.0,
        awayDefense: 1.0,
        recentForm: homeMatches.map((m) => m.result).slice(0, 5),
        formScore: 1.0,
        matchesPlayed,
        goalsScored,
        goalsConceded,
        avgGoalsScored: matchesPlayed > 0 ? Number((goalsScored / matchesPlayed).toFixed(2)) : 0,
        avgGoalsConceded: matchesPlayed > 0 ? Number((goalsConceded / matchesPlayed).toFixed(2)) : 0,
        recentMatches: homeMatches,
      };
    }

    if (!stored.awayStats && stored.measurements?.h2h?.awayRecentMatches?.length) {
      const awayMatches = stored.measurements.h2h.awayRecentMatches;
      const goalsScored = awayMatches.reduce((acc, m) => acc + (m.goalsFor || 0), 0);
      const goalsConceded = awayMatches.reduce((acc, m) => acc + (m.goalsAgainst || 0), 0);
      const matchesPlayed = awayMatches.length;
      stored.awayStats = {
        teamName: stored.awayTeam,
        homeAttack: 1.0,
        homeDefense: 1.0,
        awayAttack: 1.0,
        awayDefense: 1.0,
        recentForm: awayMatches.map((m) => m.result).slice(0, 5),
        formScore: 1.0,
        matchesPlayed,
        goalsScored,
        goalsConceded,
        avgGoalsScored: matchesPlayed > 0 ? Number((goalsScored / matchesPlayed).toFixed(2)) : 0,
        avgGoalsConceded: matchesPlayed > 0 ? Number((goalsConceded / matchesPlayed).toFixed(2)) : 0,
        recentMatches: awayMatches,
      };
    }

    loggerService.addLog({
      level: 'INFO',
      category: 'DATA_FETCH',
      source: 'MatchDetail',
      message: `Retrieved authoritative DB record for match detail: ${stored.homeTeam} vs ${stored.awayTeam}`,
    });

    return res.json({
      success: true,
      fixture: {
        ...stored,
        h2hMatches: stored.measurements?.h2h?.recentH2H || stored.h2hMatches || [],
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
