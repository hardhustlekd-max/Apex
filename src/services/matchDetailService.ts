import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { isSqliteEnabled } from '../core/sqliteClient.js';
import { cleanFixtureId, DEFAULT_ENGINE_SETTINGS, Fixture, TeamFormMatch, TeamStatsSummary } from '../core/types.js';
import { getRelativeDateStr, normalizeDateStr } from '../core/dateUtils.js';
import { convertHistoricalMatchToFixture, flashscoreScraperService } from './flashscoreScraperService.js';
import { OnDemandParser } from '../core/onDemandParser.js';
import { ApexEngine } from '../core/poisson.js';
import { isSimulationLeague } from '../core/leagueMapper.js';
import { loggerService } from './loggerService.js';

function buildFallbackTeamStats(teamName: string, recentMatches: TeamFormMatch[]): TeamStatsSummary {
  const goalsScored = recentMatches.reduce((acc, m) => acc + (m.goalsFor || 0), 0);
  const goalsConceded = recentMatches.reduce((acc, m) => acc + (m.goalsAgainst || 0), 0);
  const matchesPlayed = recentMatches.length;

  return {
    teamName,
    homeAttack: 1.0,
    homeDefense: 1.0,
    awayAttack: 1.0,
    awayDefense: 1.0,
    recentForm: recentMatches.map((m) => m.result).slice(0, 5),
    formScore: 1.0,
    matchesPlayed,
    goalsScored,
    goalsConceded,
    avgGoalsScored: matchesPlayed > 0 ? Number((goalsScored / matchesPlayed).toFixed(2)) : 0,
    avgGoalsConceded: matchesPlayed > 0 ? Number((goalsConceded / matchesPlayed).toFixed(2)) : 0,
    recentMatches,
  };
}

/**
 * Resolves full fixture details on-demand across predictions DB, upcoming DB,
 * indexed scraped/historical rows, H2H measurements, odds, and fallback team stats.
 */
export async function getMatchDetailById(fixtureId: string): Promise<Fixture | null> {
  if (!isSqliteEnabled()) {
    return null;
  }
  await db.init();
  await predictionsDb.init();

  const cleanId = cleanFixtureId(fixtureId);
  let stored =
    predictionsDb.getPredictionById(fixtureId) ||
    predictionsDb.getPredictionById(cleanId) ||
    db.getFixtureById(fixtureId) ||
    db.getFixtureById(cleanId);

  if (!stored) {
    const foundScraped = db.getFlashscoreScrapedMatchById(fixtureId);
    if (foundScraped) {
      const homeScore =
        foundScraped.result?.home !== undefined ? parseInt(foundScraped.result.home, 10) : undefined;
      const awayScore =
        foundScraped.result?.away !== undefined ? parseInt(foundScraped.result.away, 10) : undefined;
      stored = {
        id: `fs_${foundScraped.matchId}`,
        providerId: 'FLASHSCORE',
        league: foundScraped.leagueName || foundScraped.stage || 'FLASHSCORE',
        leagueName: foundScraped.leagueName || foundScraped.stage || 'FLASHSCORE',
        matchDate: normalizeDateStr(foundScraped.date ? foundScraped.date.slice(0, 10) : getRelativeDateStr(0)),
        kickOffTime:
          foundScraped.date && foundScraped.date.length > 10 ? foundScraped.date.slice(11, 16) : 'FT',
        homeTeam: foundScraped.home.name,
        awayTeam: foundScraped.away.name,
        status:
          foundScraped.status === 'FINISHED'
            ? 'FINISHED'
            : foundScraped.status === 'LIVE'
            ? 'LIVE'
            : 'SCHEDULED',
        score:
          homeScore !== undefined && awayScore !== undefined
            ? { home: homeScore, away: awayScore }
            : undefined,
        statistics: foundScraped.statistics || [],
        information: foundScraped.information || [],
      };
    }
  }

  if (!stored) {
    const foundHist = db.getHistoricalMatchById(fixtureId);
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
        matchDate: normalizeDateStr(
          parsedMatch.timestamp
            ? new Date(parsedMatch.timestamp * 1000).toISOString().slice(0, 10)
            : getRelativeDateStr(0)
        ),
        kickOffTime: isFin
          ? 'FT'
          : parsedMatch.timestamp
          ? new Date(parsedMatch.timestamp * 1000).toISOString().slice(11, 16)
          : '19:00',
        timestamp: parsedMatch.timestamp,
        homeTeam: parsedMatch.homeTeam,
        awayTeam: parsedMatch.awayTeam,
        status: isFin ? 'FINISHED' : isLive ? 'LIVE' : 'SCHEDULED',
        score:
          homeScore !== undefined && awayScore !== undefined
            ? { home: homeScore, away: awayScore }
            : undefined,
        statistics: parsedMatch.statistics || [],
      };
    }
  }

  if (!stored || isSimulationLeague(stored.league, stored.leagueName, undefined, stored.leagueUrl, stored.stage, stored.homeTeam, stored.awayTeam)) {
    loggerService.addLog({
      level: 'WARN',
      category: 'DATA_FETCH',
      source: 'MatchDetail',
      message: `Fixture ${fixtureId} not found in database for match detail`,
    });
    return null;
  }

  if (!stored.prediction) {
    const predStored =
      predictionsDb.getPredictionById(fixtureId) || predictionsDb.getPredictionById(cleanId);
    if (predStored && predStored.prediction) {
      stored.prediction = predStored.prediction;
      stored.markets = predStored.markets;
      stored.homeStats = predStored.homeStats;
      stored.awayStats = predStored.awayStats;
      stored.measurements = predStored.measurements;
    }
  }

  // Ensure H2H & Team Form measurement is attached whenever recent form arrays are missing
  const existingH2H = stored.measurements?.h2h;
  const hasExistingTeamForm = Boolean(
    existingH2H &&
      ((existingH2H.homeRecentMatches && existingH2H.homeRecentMatches.length > 0) ||
        (existingH2H.awayRecentMatches && existingH2H.awayRecentMatches.length > 0))
  );
  if (!hasExistingTeamForm) {
    const h2hData = await flashscoreScraperService.getMatchHeadToHead(
      cleanId,
      stored.homeTeam,
      stored.awayTeam
    );
    if (
      h2hData &&
      (h2hData.matchesCount > 0 ||
        h2hData.homeRecentMatches?.length ||
        h2hData.awayRecentMatches?.length ||
        h2hData.recentH2H?.length)
    ) {
      stored.measurements = {
        ...(stored.measurements || {}),
        h2h: h2hData,
      };
      if (stored.prediction) {
        stored.prediction = {
          ...stored.prediction,
          measurements: {
            ...(stored.prediction.measurements || {}),
            h2h: h2hData,
          },
        };
      }
      stored.h2hMatches = h2hData.recentH2H || stored.h2hMatches || [];
    }
  }

  if (!stored.marketOdds) {
    const cachedOdds = db.getMatchOddsCache(cleanId);
    if (cachedOdds) {
      stored.marketOdds = cachedOdds;
    } else if (stored.status !== 'FINISHED') {
      const fetchedOdds = await flashscoreScraperService
        .fetchMatchOdds(cleanId, {
          homeParticipantId: stored.homeParticipantId,
          awayParticipantId: stored.awayParticipantId,
        })
        .catch(() => null);
      if (fetchedOdds) {
        stored.marketOdds = fetchedOdds;
      }
    }
  }

  if (!stored.information || stored.information.length === 0) {
    stored.information = [
      { category: 'Match Date', value: stored.matchDate },
      { category: 'Competition', value: stored.leagueName || stored.league || 'League' },
      {
        category: 'Status',
        value:
          stored.status === 'FINISHED'
            ? 'Full Time'
            : stored.status === 'LIVE'
            ? 'Live'
            : 'Scheduled',
      },
      ...(stored.score
        ? [{ category: 'Result', value: `${stored.score.home} - ${stored.score.away}` }]
        : []),
    ];
  }

  if (!stored.homeStats && stored.measurements?.h2h?.homeRecentMatches?.length) {
    stored.homeStats = buildFallbackTeamStats(
      stored.homeTeam,
      stored.measurements.h2h.homeRecentMatches
    );
  }

  if (!stored.awayStats && stored.measurements?.h2h?.awayRecentMatches?.length) {
    stored.awayStats = buildFallbackTeamStats(
      stored.awayTeam,
      stored.measurements.h2h.awayRecentMatches
    );
  }

  // Ensure comprehensive markets (including 1X2) and EV edges are populated on stored predictions
  if (stored.prediction) {
    const has1x2Markets = Array.isArray(stored.markets) && stored.markets.some((m) => m.key === 'HOME_WIN');
    const hasComprehensiveMarkets = Array.isArray(stored.markets) && stored.markets.some((m) => m.key === 'COMBO_1X_BTTS');
    const needsEvPopulation = Boolean(
      stored.marketOdds &&
        stored.markets &&
        !stored.markets.some((m) => m.marketOdds !== undefined)
    );

    if (!has1x2Markets || !hasComprehensiveMarkets || needsEvPopulation) {
      const settings = db.getSettings() || DEFAULT_ENGINE_SETTINGS;
      const updatedPrediction = {
        ...stored.prediction,
        marketOdds: stored.marketOdds || stored.prediction.marketOdds,
      };
      const recalc = ApexEngine.calculateMarkets(
        updatedPrediction,
        settings,
        stored.homeTeam,
        stored.awayTeam,
        stored.marketOdds
      );
      stored.prediction = {
        ...updatedPrediction,
        mostLikelyOutcome: recalc.mostLikelyOutcome,
        bestValueBet: recalc.bestValueBet,
      };
      stored.markets = recalc.markets;
      stored.mostLikelyOutcome = recalc.mostLikelyOutcome;
    }
  }

  loggerService.addLog({
    level: 'INFO',
    category: 'DATA_FETCH',
    source: 'MatchDetail',
    message: `Retrieved authoritative DB record for match detail: ${stored.homeTeam} vs ${stored.awayTeam}`,
  });

  return {
    ...stored,
    h2hMatches: stored.measurements?.h2h?.recentH2H || stored.h2hMatches || [],
  };
}
