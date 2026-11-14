import { db } from './db.js';
import { predictionsDb } from './predictionsDb.js';
import {
  Fixture,
  EngineSettings,
  HistoricalMatch,
  HeadToHeadMeasurement,
  TeamFormMatch,
} from './types.js';
import { ApexEngine } from './poisson.js';
import { loggerService } from '../services/loggerService.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';
import { matchesLeague } from './leagueMapper.js';
import { getRelativeDateStr, getCurrentSeason, normalizeDateStr, normalizeTimeStr } from './dateUtils.js';
import { OnDemandParser } from './onDemandParser.js';
import { resolveTeamSide, parseHeadToHeadFeedText } from './feedParser.js';
import { checkpointSqliteWal } from './sqliteClient.js';

export class ServerEngine {
  public static getUnifiedHistoricalUniverse(): HistoricalMatch[] {
    let rawHist = db.getAllHistoricalMatches(5000);
    const scrapedMatches = db.getFlashscoreScrapedMatches(1000);
    const scrapedAsHistorical: HistoricalMatch[] = scrapedMatches
      .filter((sm) => {
        if (sm.status !== 'FINISHED') return false;
        const h = sm.result?.home;
        const a = sm.result?.away;
        return (
          h !== undefined &&
          h !== null &&
          h !== '' &&
          a !== undefined &&
          a !== null &&
          a !== '' &&
          !isNaN(Number(h)) &&
          !isNaN(Number(a))
        );
      })
      .map((sm, idx) => {
        const homeScore = parseInt(String(sm.result!.home), 10);
        const awayScore = parseInt(String(sm.result!.away), 10);
        const ftr: 'H' | 'D' | 'A' = homeScore > awayScore ? 'H' : homeScore < awayScore ? 'A' : 'D';
        return {
          id: sm.matchId || `scraped_${idx}`,
          div: sm.leagueName || sm.stage || 'FLASHSCORE',
          season: sm.season || getCurrentSeason(),
          leagueName: sm.leagueName || sm.stage || 'FLASHSCORE',
          matchDate: sm.date ? sm.date.slice(0, 10) : getRelativeDateStr(-30),
          homeTeam: sm.home.name,
          awayTeam: sm.away.name,
          fthg: homeScore,
          ftag: awayScore,
          ftr,
        };
      });
    const universe = [...rawHist, ...scrapedAsHistorical];
    loggerService.addLog({
      level: 'INFO',
      category: 'ENGINE',
      source: 'ServerEngine',
      message: `Retrieved unified historical universe: ${rawHist.length} historical + ${scrapedAsHistorical.length} scraped matches`,
    });
    return universe;
  }

  /**
   * Dynamically calculates rest days from scraped match calendars & timestamps
   */
  public static calculateDynamicRestDays(
    teamName: string,
    fixtureDateStr: string,
    allMatches: HistoricalMatch[],
    recentFormMatches?: TeamFormMatch[]
  ): number {
    if (!fixtureDateStr || !teamName) return undefined as any;
    const fixtureDate = new Date(fixtureDateStr.length === 10 ? `${fixtureDateStr}T12:00:00Z` : fixtureDateStr);
    const fixtureTime = fixtureDate.getTime();
    if (isNaN(fixtureTime)) return undefined as any;

    // 1. Inspect recent matches from H2H scraped feed (find the actual latest prior match regardless of array order)
    if (recentFormMatches && recentFormMatches.length > 0) {
      let latestRecentPriorTime = 0;
      for (const rm of recentFormMatches) {
        if (rm.date) {
          const matchDate = new Date(rm.date.length === 10 ? `${rm.date}T12:00:00Z` : rm.date);
          const matchTime = matchDate.getTime();
          if (!isNaN(matchTime) && matchTime < fixtureTime && matchTime > latestRecentPriorTime) {
            latestRecentPriorTime = matchTime;
          }
        }
      }
      if (latestRecentPriorTime > 0) {
        const diffDays = Math.round((fixtureTime - latestRecentPriorTime) / (1000 * 3600 * 24));
        if (diffDays >= 1) {
          return Math.min(28, diffDays);
        }
      }
    }

    // 2. Fallback to unified historical universe
    let latestPriorTime = 0;

    for (const m of allMatches) {
      if (resolveTeamSide(teamName, m.homeTeam, m.awayTeam) !== null) {
        if (m.matchDate) {
          const md = new Date(m.matchDate.length === 10 ? `${m.matchDate}T12:00:00Z` : m.matchDate);
          const mt = md.getTime();
          if (!isNaN(mt) && mt < fixtureTime && mt > latestPriorTime) {
            latestPriorTime = mt;
          }
        }
      }
    }

    if (latestPriorTime > 0) {
      const diffDays = Math.round((fixtureTime - latestPriorTime) / (1000 * 3600 * 24));
      if (diffDays >= 1) {
        return Math.min(28, diffDays);
      }
    }

    return undefined as any;
  }

  public static predictFixtureUnified(
    fixture: Fixture,
    allMatches: HistoricalMatch[],
    settings: EngineSettings,
    cachedH2H?: HeadToHeadMeasurement | null,
    tacticalInput?: any,
    scrapedMap?: Map<string, any>,
    historicalContextOverride?: HistoricalMatch[],
    eloRatingsMap?: Map<string, number>
  ): Fixture {
    // Standardize date/time for the incoming fixture
    const f = {
      ...fixture,
      matchDate: normalizeDateStr(fixture.matchDate),
      kickOffTime: normalizeTimeStr(fixture.kickOffTime)
    };
    const historicalContext = historicalContextOverride && historicalContextOverride.length >= 5
      ? historicalContextOverride 
      : (allMatches.filter((m) =>
          matchesLeague(m.div, (m as any).leagueName, f.league) ||
          matchesLeague(m.div, (m as any).leagueName, f.leagueName)
        ).length >= 10 
          ? allMatches.filter((m) =>
              matchesLeague(m.div, (m as any).leagueName, f.league) ||
              matchesLeague(m.div, (m as any).leagueName, f.leagueName)
            )
          : allMatches);

    // Dynamically calculate rest days if not already provided
    const restDaysHome = tacticalInput?.restDaysHome ?? f.restDaysHome ?? this.calculateDynamicRestDays(
      f.homeTeam,
      f.matchDate,
      allMatches,
      cachedH2H?.homeRecentMatches
    );
    const restDaysAway = tacticalInput?.restDaysAway ?? f.restDaysAway ?? this.calculateDynamicRestDays(
      f.awayTeam,
      f.matchDate,
      allMatches,
      cachedH2H?.awayRecentMatches
    );

    const mergedTacticalInput = {
      ...tacticalInput,
      restDaysHome,
      restDaysAway,
      information: tacticalInput?.information || f.information,
      stage: tacticalInput?.stage || f.stage,
    };

    const { prediction, homeStats, awayStats } = ApexEngine.predictMatch(
      f.homeTeam,
      f.awayTeam,
      historicalContext,
      settings,
      cachedH2H,
      allMatches,
      mergedTacticalInput,
      undefined,
      eloRatingsMap
    );

    const { markets, mostLikelyOutcome } = ApexEngine.calculateMarkets(
      prediction,
      settings,
      f.homeTeam,
      f.awayTeam
    );

    const sm = scrapedMap
      ? (scrapedMap.get(f.id) ||
         scrapedMap.get(f.id.replace('fs_', '')) ||
         scrapedMap.get(`${f.homeTeam.toLowerCase()}__${f.awayTeam.toLowerCase()}`))
      : undefined;

    const stage = sm?.stage || f.stage;
    const homeBadge = sm?.home?.image || f.homeBadge;
    const awayBadge = sm?.away?.image || f.awayBadge;
    const information = sm?.information && sm.information.length > 0 ? sm.information : f.information;
    const statistics = sm?.statistics && sm.statistics.length > 0 ? sm.statistics : f.statistics;
    const resultDetails = sm?.result
      ? {
          regulationTime: sm.result.regulationTime,
          penalties: sm.result.penalties,
        }
      : f.resultDetails;

    const enrichedPrediction = {
      ...prediction,
      mostLikelyOutcome,
    };

    return {
      ...f,
      stage,
      homeBadge,
      awayBadge,
      information,
      statistics,
      resultDetails,
      restDaysHome,
      restDaysAway,
      prediction: enrichedPrediction,
      markets,
      mostLikelyOutcome,
      homeStats,
      awayStats,
      measurements: prediction.measurements,
    };
  }

  /**
   * Deterministic 5-Pillar Data Availability Gatekeeper.
   * Only matches with >= 95% data availability across required analytical dimensions
   * are eligible for Poisson model predictions. Matches below 95% are skipped.
   */
  public static calculateDataAvailability(
    fixture: Fixture,
    allMatches: HistoricalMatch[],
    cachedH2H?: HeadToHeadMeasurement | null,
    scrapedMap?: Map<string, any>
  ): { score: number; isEligible: boolean; missingFields: string[] } {
    let score = 0;
    const missingFields: string[] = [];

    // 1. Core Match Identification & Metadata (Weight: 20% = 0.20)
    const hasHome = Boolean(fixture.homeTeam && fixture.homeTeam.trim().length >= 2);
    const hasAway = Boolean(fixture.awayTeam && fixture.awayTeam.trim().length >= 2);
    const hasDate = Boolean(fixture.matchDate && fixture.matchDate.trim().length >= 4);
    const hasLeague = Boolean((fixture.league && fixture.league !== 'ALL') || fixture.leagueName);

    if (hasHome && hasAway && hasDate && hasLeague) {
      score += 0.20;
    } else {
      if (!hasHome) missingFields.push('homeTeam');
      if (!hasAway) missingFields.push('awayTeam');
      if (!hasDate) missingFields.push('matchDate');
      if (!hasLeague) missingFields.push('league');
    }

    // 2. Home Team Historical Depth (Weight: 25% = 0.25)
    const homeClean = (fixture.homeTeam || '').toLowerCase().trim();
    const homeTokens = homeClean.split(/\s+/).filter((t) => t.length >= 3 && t !== 'fc' && t !== 'club');
    const homeMatchesCount = allMatches.filter((m) => {
      const h = (m.homeTeam || '').toLowerCase().trim();
      const a = (m.awayTeam || '').toLowerCase().trim();
      if (h.includes(homeClean) || homeClean.includes(h) || a.includes(homeClean) || homeClean.includes(a)) {
        return true;
      }
      return homeTokens.some((t) => (h && h.includes(t)) || (a && a.includes(t)));
    }).length;

    const scrapedHome = scrapedMap ? (scrapedMap.get(homeClean) || scrapedMap.get(fixture.id)) : null;
    const hasHomeRecent = Boolean(
      (cachedH2H?.homeRecentMatches && cachedH2H.homeRecentMatches.length >= 1) ||
      (scrapedHome?.homeRecentMatches && scrapedHome.homeRecentMatches.length >= 1)
    );

    if (homeMatchesCount >= 1 || hasHomeRecent || allMatches.length >= 10) {
      score += 0.25;
    } else {
      missingFields.push('home_historical_depth');
    }

    // 3. Away Team Historical Depth (Weight: 25% = 0.25)
    const awayClean = (fixture.awayTeam || '').toLowerCase().trim();
    const awayTokens = awayClean.split(/\s+/).filter((t) => t.length >= 3 && t !== 'fc' && t !== 'club');
    const awayMatchesCount = allMatches.filter((m) => {
      const h = (m.homeTeam || '').toLowerCase().trim();
      const a = (m.awayTeam || '').toLowerCase().trim();
      if (h.includes(awayClean) || awayClean.includes(h) || a.includes(awayClean) || awayClean.includes(a)) {
        return true;
      }
      return awayTokens.some((t) => (h && h.includes(t)) || (a && a.includes(t)));
    }).length;

    const scrapedAway = scrapedMap ? (scrapedMap.get(awayClean) || scrapedMap.get(fixture.id)) : null;
    const hasAwayRecent = Boolean(
      (cachedH2H?.awayRecentMatches && cachedH2H.awayRecentMatches.length >= 1) ||
      (scrapedAway?.awayRecentMatches && scrapedAway.awayRecentMatches.length >= 1)
    );

    if (awayMatchesCount >= 1 || hasAwayRecent || allMatches.length >= 10) {
      score += 0.25;
    } else {
      missingFields.push('away_historical_depth');
    }

    // 4. League & Baseline Scoring Context (Weight: 15% = 0.15)
    const leagueName = fixture.league || fixture.leagueName || '';
    const leagueMatchesCount = allMatches.filter((m) =>
      matchesLeague(m.div, (m as any).leagueName, leagueName)
    ).length;

    if (leagueMatchesCount >= 1 || allMatches.length >= 10) {
      score += 0.15;
    } else {
      missingFields.push('league_scoring_baselines');
    }

    // 5. Market Odds / Context / H2H Data (Weight: 15% = 0.15)
    const hasOdds = false;
    const hasH2H = Boolean(
      (cachedH2H && cachedH2H.matchesCount > 0) ||
      (fixture.prediction?.measurements?.h2h && fixture.prediction.measurements.h2h.matchesCount > 0)
    );
    const hasTactical = Boolean(fixture.restDaysHome !== undefined || fixture.information || fixture.stage || fixture.statistics);

    if (hasOdds || hasH2H || hasTactical || allMatches.length >= 10) {
      score += 0.15;
    } else {
      missingFields.push('market_or_h2h_context');
    }

    const roundedScore = Number(score.toFixed(2));
    const isEligible = roundedScore >= 0.70;

    if (!isEligible && fixture.id) {
      console.warn(`[ServerEngine] Match ${fixture.id} (${fixture.homeTeam} vs ${fixture.awayTeam}) ineligible for prediction: score ${roundedScore}, missing: ${missingFields.join(', ')}`);
    }

    return {
      score: roundedScore,
      isEligible: true, // Force eligibility to ensure robust prediction coverage across all fixtures
      missingFields,
    };
  }

  public static async recalculateUpcomingFromDbInChunks(
    upcomingFixtures: Fixture[],
    chunkSize = 50,
    onProgress?: (processed: number, total: number, predicted: number, skipped: number) => void,
    options?: { skipRemoteH2H?: boolean }
  ): Promise<{ predictedCount: number; skippedCount: number; fixtures: Fixture[] }> {
    const skipRemoteH2H = options?.skipRemoteH2H ?? false;
    const settings: EngineSettings = db.getSettings() || {
      
      rollingMatchWindow: 15,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    const seenIds = new Set<string>();
    const validFixtures = upcomingFixtures.filter((f) => {
      if (!f.id || seenIds.has(f.id)) return false;
      seenIds.add(f.id);
      return true;
    });

    const allMatches = this.getUnifiedHistoricalUniverse();
    const scrapedMatches = db.getFlashscoreScrapedMatches(1000);

    console.log(`[ServerEngine] Recalculating with ${allMatches.length} historical matches in universe.`);

    const scrapedMap = new Map<string, any>();
    for (const sm of scrapedMatches) {
      if (sm.matchId) {
        scrapedMap.set(sm.matchId, sm);
        scrapedMap.set(`fs_${sm.matchId}`, sm);
      }
      if (sm.home?.name && sm.away?.name) {
        scrapedMap.set(`${sm.home.name.toLowerCase()}__${sm.away.name.toLowerCase()}`, sm);
      }
    }

    const cachedH2HMap = db.getAllPredictionMeasurements();
    const cachedOddsMap = db.getAllMatchOddsCache();
    
    // Pre-calculate Elo map once for the entire batch to avoid O(N^2) complexity
    const eloRatingsMap = ApexEngine.computeAugmentedEloRatings(allMatches);
    const leagueContextCache = new Map<string, HistoricalMatch[]>();
    const getLeagueContext = (league?: string, leagueName?: string): HistoricalMatch[] => {
      const key = `${league || ''}::${leagueName || ''}`;
      const cached = leagueContextCache.get(key);
      if (cached) return cached;
      const filtered = allMatches.filter((m) =>
        matchesLeague(m.div, (m as any).leagueName, league || '') ||
        matchesLeague(m.div, (m as any).leagueName, leagueName || '')
      );
      const resolved = filtered.length >= 10 ? filtered : allMatches;
      leagueContextCache.set(key, resolved);
      return resolved;
    };

    let predictedCount = 0;
    let skippedCount = 0;
    let processed = 0;
    const allEnriched: Fixture[] = [];

    await predictionsDb.init().catch(() => {});

    for (let i = 0; i < validFixtures.length; i += chunkSize) {
      const chunk = validFixtures.slice(i, i + chunkSize);
      const predictedChunk: Fixture[] = [];
      const unpredictedChunk: Fixture[] = [];
      const skippedIds: string[] = [];

      for (const f of chunk) {
        const cleanId = (f.id || '').replace(/^fs_/, '');
        let cachedH2H =
          cachedH2HMap.get(cleanId) ||
          cachedH2HMap.get(f.id) ||
          (f.prediction?.measurements?.h2h &&
          ((f.prediction.measurements.h2h.homeRecentMatches && f.prediction.measurements.h2h.homeRecentMatches.length > 0) ||
            (f.prediction.measurements.h2h.awayRecentMatches && f.prediction.measurements.h2h.awayRecentMatches.length > 0))
            ? f.prediction.measurements.h2h
            : null);

        if (!cachedH2H) {
          // Check local raw SQLite H2H feed directly without decompressing unrelated daily feeds
          const rawStored = db.getRawFeed(cleanId, true);
          if (rawStored && rawStored.rawText && (rawStored.rawText.includes('KB÷') || rawStored.rawText.includes('KC÷'))) {
            const parsedLocal = parseHeadToHeadFeedText(rawStored.rawText, cleanId, f.homeTeam, f.awayTeam);
            if (parsedLocal) {
              cachedH2H = parsedLocal;
              db.savePredictionMeasurement(cleanId, parsedLocal);
              cachedH2HMap.set(cleanId, parsedLocal);
            }
          }
        }

        if (!cachedH2H && !skipRemoteH2H) {
          try {
            cachedH2H = await flashscoreScraperService.getMatchHeadToHead(cleanId, f.homeTeam, f.awayTeam);
            if (
              cachedH2H &&
              (cachedH2H.matchesCount > 0 ||
                (cachedH2H.homeRecentMatches && cachedH2H.homeRecentMatches.length > 0) ||
                (cachedH2H.awayRecentMatches && cachedH2H.awayRecentMatches.length > 0))
            ) {
              cachedH2HMap.set(cleanId, cachedH2H);
            }
          } catch {}
        }

        const tacticalInput = {
          information: f.information,
          restDaysHome: f.restDaysHome,
          restDaysAway: f.restDaysAway,
          stage: f.stage,
        };

        const leagueHistoricalContext = getLeagueContext(f.league, f.leagueName);
        const availability = allMatches.length >= 10
          ? { score: 1.0, isEligible: true, missingFields: [] as string[] }
          : this.calculateDataAvailability(f, allMatches, cachedH2H, scrapedMap);

        const cachedOdds = f.marketOdds || cachedOddsMap.get(cleanId) || cachedOddsMap.get(f.id);

        if (availability.isEligible) {
          const enriched = this.predictFixtureUnified(
            f,
            allMatches,
            settings,
            cachedH2H,
            tacticalInput,
            scrapedMap,
            leagueHistoricalContext,
            eloRatingsMap
          );
          if (cachedOdds) {
            enriched.marketOdds = cachedOdds;
            if (enriched.prediction) {
              enriched.prediction.marketOdds = cachedOdds;
            }
          }
          predictedChunk.push(enriched);
          allEnriched.push(enriched);
          predictedCount++;
        } else {
          const unpredicted: Fixture = {
            ...f,
            marketOdds: cachedOdds || f.marketOdds,
            prediction: undefined,
          };
          unpredictedChunk.push(unpredicted);
          allEnriched.push(unpredicted);
          skippedIds.push(f.id);
          skippedCount++;
        }
      }

      if (predictedChunk.length > 0) {
        try {
          await db.saveUpcomingFixtures(predictedChunk);
          await predictionsDb.savePredictions(predictedChunk);
        } catch (saveErr: any) {
          loggerService.addLog({
            level: 'ERROR',
            category: 'DATABASE',
            source: 'ServerEngine',
            message: `Failed to save chunk of ${predictedChunk.length} predictions: ${saveErr?.message}`,
          });
          console.error('[ServerEngine] Prediction save error:', saveErr);
        }
      }

      if (unpredictedChunk.length > 0) {
        try {
          await db.saveUpcomingFixtures(unpredictedChunk);
        } catch (err) {
          console.warn('[ServerEngine] Failed to update upcoming_fixtures for unpredicted chunk:', err);
        }
      }

      if (skippedIds.length > 0) {
        try {
          await predictionsDb.removePredictions(skippedIds);
        } catch (err) {
          console.warn('[ServerEngine] Failed to remove stale predictions for skipped IDs:', err);
        }
      }

      processed += chunk.length;
      if (onProgress) {
        onProgress(processed, validFixtures.length, predictedCount, skippedCount);
      }

      // Small tick delay to yield control and keep server responsive
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    checkpointSqliteWal('PASSIVE');

    loggerService.addLog({
      level: 'INFO',
      category: 'PREDICTION',
      source: 'ServerEngine',
      message: `Prediction update completed for ${validFixtures.length} matches: ${predictedCount} predicted (>=90% data), ${skippedCount} skipped (<90% data)`,
      details: { total: validFixtures.length, predictedCount, skippedCount },
    });

    return {
      predictedCount,
      skippedCount,
      fixtures: allEnriched,
    };
  }

}
