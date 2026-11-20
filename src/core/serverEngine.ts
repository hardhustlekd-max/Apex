import { db } from './db.js';
import { predictionsDb } from './predictionsDb.js';
import {
  DEFAULT_ENGINE_SETTINGS,
  Fixture,
  EngineSettings,
  HistoricalMatch,
  HeadToHeadMeasurement,
  TeamFormMatch,
  LeagueStandingTable,
} from './types.js';
import { ApexEngine } from './poisson.js';
import { loggerService } from '../services/loggerService.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';
import { matchesLeague, getLeagueAliases, cleanStr } from './leagueMapper.js';
import { getRelativeDateStr, getCurrentSeason, normalizeDateStr, normalizeTimeStr, parseDateMsNoon } from './dateUtils.js';
import { OnDemandParser } from './onDemandParser.js';
import { parseHeadToHeadFeedText, getTeamHistoricalMatches, teamMatchScore } from './feedParser.js';
import { checkpointSqliteWal, sqliteDb } from './sqliteClient.js';

interface StandingsLookupIndex {
  byUrl: Map<string, LeagueStandingTable>;
  byKey: Map<string, LeagueStandingTable[]>;
}

export class ServerEngine {
  public static getUnifiedHistoricalUniverse(scrapedMatchesOverride?: any[]): HistoricalMatch[] {
    let rawHist = db.getAllHistoricalMatches(5000);
    const scrapedMatches = scrapedMatchesOverride ?? db.getFlashscoreScrapedMatches(1000, { includeJsonBlobs: false });
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
    const currentSeason = getCurrentSeason();
    const parts = currentSeason.split('/');
    const prevStart = parseInt(parts[0], 10) - 1;
    const prevEnd = parseInt(parts[1], 10) - 1;
    const prevSeason = `${prevStart}/${prevEnd}`;
    const twoYearsAgoMs = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;

    const filteredUniverse = universe.filter((m) => {
      const s = m.season;
      if (s && (s === currentSeason || s === prevSeason)) return true;
      if (m.matchDate) {
        const d = parseDateMsNoon(m.matchDate);
        if (!isNaN(d) && d >= twoYearsAgoMs) return true;
      }
      return !s;
    });

    loggerService.addLog({
      level: 'INFO',
      category: 'ENGINE',
      source: 'ServerEngine',
      message: `Retrieved unified historical universe (last 2 seasons strictly enforced): ${filteredUniverse.length} matches (from ${universe.length} total)`,
    });
    return filteredUniverse;
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
    const fixtureTime = parseDateMsNoon(fixtureDateStr);
    if (isNaN(fixtureTime)) return undefined as any;

    // 1. Inspect recent matches from H2H scraped feed (find the actual latest prior match regardless of array order)
    if (recentFormMatches && recentFormMatches.length > 0) {
      let latestRecentPriorTime = 0;
      for (const rm of recentFormMatches) {
        if (rm.date) {
          const matchTime = parseDateMsNoon(rm.date);
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

    // 2. Fallback to unified historical universe (O(1) WeakMap-indexed lookup)
    let latestPriorTime = 0;
    const teamHistory = getTeamHistoricalMatches(teamName, allMatches);

    for (const m of teamHistory) {
      if (m.matchDate) {
        const mt = parseDateMsNoon(m.matchDate);
        if (!isNaN(mt) && mt < fixtureTime && mt > latestPriorTime) {
          latestPriorTime = mt;
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

  private static normalizeStandingsUrl(url?: string): string {
    if (!url) return '';
    return url
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/\/+$/, '');
  }

  private static tableContainsFixtureTeam(table: LeagueStandingTable, homeTeam: string, awayTeam: string): boolean {
    if (!table || !Array.isArray(table.table) || table.table.length === 0) return false;
    for (const row of table.table) {
      if (
        (homeTeam && teamMatchScore(homeTeam, row.teamName) > 0) ||
        (awayTeam && teamMatchScore(awayTeam, row.teamName) > 0)
      ) {
        return true;
      }
    }
    return false;
  }

  public static buildStandingsLookup(tables: LeagueStandingTable[]): StandingsLookupIndex {
    const byUrl = new Map<string, LeagueStandingTable>();
    const byKey = new Map<string, LeagueStandingTable[]>();

    const addKey = (rawKey: string | undefined, table: LeagueStandingTable) => {
      if (!rawKey) return;
      const k = rawKey.trim().toLowerCase();
      if (!k) return;
      const list = byKey.get(k);
      if (!list) {
        byKey.set(k, [table]);
      } else if (!list.includes(table)) {
        list.push(table);
      }
    };

    for (const table of tables) {
      if (!table || !Array.isArray(table.table) || table.table.length === 0) continue;

      const normUrl = this.normalizeStandingsUrl(table.leagueUrl);
      if (normUrl && !byUrl.has(normUrl)) {
        byUrl.set(normUrl, table);
      }

      addKey(table.leagueCode, table);
      addKey(cleanStr(table.leagueCode), table);

      if (table.leagueName) {
        addKey(table.leagueName, table);
        addKey(cleanStr(table.leagueName), table);
      }
      if (table.country && table.leagueName) {
        addKey(`${table.country}_${table.leagueName}`, table);
        addKey(cleanStr(`${table.country}_${table.leagueName}`), table);
      }

      for (const alias of getLeagueAliases(table.leagueCode)) {
        addKey(alias, table);
        addKey(cleanStr(alias), table);
      }
      if (table.leagueName) {
        for (const alias of getLeagueAliases(table.leagueName)) {
          addKey(alias, table);
          addKey(cleanStr(alias), table);
        }
      }
    }

    return { byUrl, byKey };
  }

  public static resolveStandingsForFixture(
    fixture: Pick<Fixture, 'league' | 'leagueName' | 'leagueUrl' | 'homeTeam' | 'awayTeam'>,
    lookup: StandingsLookupIndex
  ): LeagueStandingTable | null {
    // 1. Exact tournament URL path match
    const normUrl = this.normalizeStandingsUrl(fixture.leagueUrl);
    if (normUrl) {
      const urlHit = lookup.byUrl.get(normUrl);
      if (urlHit) return urlHit;
    }

    // 2. Canonical code, cleaned slug, and alias lookup with team verification
    const probeKeys = new Set<string>();
    const pushKey = (val?: string) => {
      if (!val || val === 'ALL') return;
      const trimmed = val.trim().toLowerCase();
      if (trimmed) probeKeys.add(trimmed);
      const cleaned = cleanStr(val);
      if (cleaned) probeKeys.add(cleaned);
    };

    pushKey(fixture.league);
    pushKey(fixture.leagueName);
    if (fixture.league) {
      for (const a of getLeagueAliases(fixture.league)) pushKey(a);
    }
    if (fixture.leagueName) {
      for (const a of getLeagueAliases(fixture.leagueName)) pushKey(a);
    }

    let firstCandidate: LeagueStandingTable | null = null;
    for (const key of probeKeys) {
      const candidates = lookup.byKey.get(key);
      if (!candidates) continue;
      for (const cand of candidates) {
        if (!firstCandidate) firstCandidate = cand;
        if (this.tableContainsFixtureTeam(cand, fixture.homeTeam, fixture.awayTeam)) {
          return cand;
        }
      }
    }

    return firstCandidate;
  }

  public static predictFixtureUnified(
    fixture: Fixture,
    allMatches: HistoricalMatch[],
    settings: EngineSettings,
    cachedH2H?: HeadToHeadMeasurement | null,
    tacticalInput?: any,
    scrapedMap?: Map<string, any>,
    historicalContextOverride?: HistoricalMatch[],
    eloRatingsMap?: Map<string, number>,
    standingsOverride?: LeagueStandingTable | null
  ): Fixture {
    // Standardize date/time for the incoming fixture
    const f = {
      ...fixture,
      matchDate: normalizeDateStr(fixture.matchDate),
      kickOffTime: normalizeTimeStr(fixture.kickOffTime)
    };
    let historicalContext: HistoricalMatch[];
    if (historicalContextOverride && historicalContextOverride.length >= 5) {
      historicalContext = historicalContextOverride;
    } else {
      const leagueMatches = allMatches.filter((m) =>
        matchesLeague(m.div, (m as any).leagueName, f.league) ||
        matchesLeague(m.div, (m as any).leagueName, f.leagueName)
      );
      historicalContext = leagueMatches.length >= 10 ? leagueMatches : allMatches;
    }

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

    const resolvedStandings =
      standingsOverride !== undefined
        ? standingsOverride
        : ((db.getLeagueStandings(f.league, f.leagueUrl, f.leagueName) as LeagueStandingTable | null) || null);

    const { prediction, homeStats, awayStats } = ApexEngine.predictMatch(
      f.homeTeam,
      f.awayTeam,
      historicalContext,
      settings,
      cachedH2H,
      allMatches,
      mergedTacticalInput,
      resolvedStandings,
      eloRatingsMap,
      f.marketOdds
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
      standingsClose: Boolean(prediction.standingsClose),
      standingsCloseReason: prediction.standingsCloseReason,
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
    scrapedMap?: Map<string, any>,
    precomputed?: {
      leagueCountCache?: Map<string, number>;
      standingsTable?: LeagueStandingTable | null;
      quiet?: boolean;
    }
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

    // 2. Home Team Historical Depth (Weight: 25% = 0.25) - O(1) WeakMap-indexed lookup
    const homeClean = (fixture.homeTeam || '').toLowerCase().trim();
    const homeMatchesCount = fixture.homeTeam ? getTeamHistoricalMatches(fixture.homeTeam, allMatches).length : 0;

    const scrapedHome = scrapedMap ? (scrapedMap.get(homeClean) || scrapedMap.get(fixture.id)) : null;
    const hasHomeRecent = Boolean(
      (cachedH2H?.homeRecentMatches && cachedH2H.homeRecentMatches.length >= 1) ||
      (scrapedHome?.homeRecentMatches && scrapedHome.homeRecentMatches.length >= 1)
    );

    const hasValidHomeHistory = homeMatchesCount >= 1 || hasHomeRecent;
    if (hasValidHomeHistory) {
      score += 0.25;
    } else {
      missingFields.push('home_historical_depth');
    }

    // 3. Away Team Historical Depth (Weight: 25% = 0.25) - O(1) WeakMap-indexed lookup
    const awayClean = (fixture.awayTeam || '').toLowerCase().trim();
    const awayMatchesCount = fixture.awayTeam ? getTeamHistoricalMatches(fixture.awayTeam, allMatches).length : 0;

    const scrapedAway = scrapedMap ? (scrapedMap.get(awayClean) || scrapedMap.get(fixture.id)) : null;
    const hasAwayRecent = Boolean(
      (cachedH2H?.awayRecentMatches && cachedH2H.awayRecentMatches.length >= 1) ||
      (scrapedAway?.awayRecentMatches && scrapedAway.awayRecentMatches.length >= 1)
    );

    const hasValidAwayHistory = awayMatchesCount >= 1 || hasAwayRecent;
    if (hasValidAwayHistory) {
      score += 0.25;
    } else {
      missingFields.push('away_historical_depth');
    }

    // 4. League & Baseline Scoring Context (Weight: 15% = 0.15) - Memoized per league
    const leagueName = (fixture.league && fixture.league !== 'ALL' ? fixture.league : '') || fixture.leagueName || '';
    const leagueCacheKey = `${fixture.league || ''}::${fixture.leagueName || ''}`;
    let leagueMatchesCount: number;
    if (!leagueName || leagueName === 'ALL') {
      leagueMatchesCount = 0;
    } else if (precomputed?.leagueCountCache?.has(leagueCacheKey)) {
      leagueMatchesCount = precomputed.leagueCountCache.get(leagueCacheKey)!;
    } else {
      leagueMatchesCount = 0;
      for (const m of allMatches) {
        if (matchesLeague(m.div, (m as any).leagueName, leagueName)) {
          leagueMatchesCount++;
          break; // Availability only checks >= 1 match in league
        }
      }
      precomputed?.leagueCountCache?.set(leagueCacheKey, leagueMatchesCount);
    }

    const hasStandingsBaseline = Boolean(
      precomputed?.standingsTable &&
      Array.isArray(precomputed.standingsTable.table) &&
      precomputed.standingsTable.table.some((r) => r.played > 0)
    );

    if (leagueMatchesCount >= 1 || hasStandingsBaseline) {
      score += 0.15;
    } else {
      missingFields.push('league_scoring_baselines');
    }

    // 5. Market Odds / Context / H2H Data (Weight: 15% = 0.15)
    const hasOdds = Boolean(fixture.marketOdds);
    const hasH2H = Boolean(
      (cachedH2H && cachedH2H.matchesCount > 0) ||
      (fixture.prediction?.measurements?.h2h && fixture.prediction.measurements.h2h.matchesCount > 0)
    );
    const hasTactical = Boolean(fixture.restDaysHome !== undefined || fixture.information || fixture.stage || fixture.statistics);

    if (hasOdds || hasH2H || hasTactical) {
      score += 0.15;
    } else {
      missingFields.push('market_or_h2h_context');
    }

    const roundedScore = Number(score.toFixed(2));
    const isEligible = roundedScore >= 0.70 && hasValidHomeHistory && hasValidAwayHistory;

    if (!isEligible && fixture.id && !precomputed?.quiet) {
      console.warn(`[ServerEngine] Match ${fixture.id} (${fixture.homeTeam} vs ${fixture.awayTeam}) ineligible for prediction: score ${roundedScore}, missing: ${missingFields.join(', ')}`);
    }

    return {
      score: roundedScore,
      isEligible,
      missingFields,
    };
  }

  public static async recalculateUpcomingFromDbInChunks(
    upcomingFixtures: Fixture[],
    chunkSize = 150,
    onProgress?: (processed: number, total: number, predicted: number, skipped: number) => void,
    options?: {
      skipRemoteH2H?: boolean;
      shouldCancel?: () => boolean;
      alreadyClearedUpcoming?: boolean;
      collectFixtures?: boolean;
    }
  ): Promise<{ predictedCount: number; skippedCount: number; fixtures: Fixture[] }> {
    const skipRemoteH2H = options?.skipRemoteH2H ?? false;
    const collectFixtures = options?.collectFixtures ?? true;
    const settings: EngineSettings = db.getSettings() || { ...DEFAULT_ENGINE_SETTINGS };

    const seenIds = new Set<string>();
    const validFixtures: Fixture[] = [];
    for (let i = 0; i < upcomingFixtures.length; i++) {
      const f = upcomingFixtures[i];
      if (!f?.id || seenIds.has(f.id)) continue;
      seenIds.add(f.id);
      validFixtures.push(f);
    }

    const scrapedMatches = db.getFlashscoreScrapedMatches(1000);
    const allMatches = this.getUnifiedHistoricalUniverse(scrapedMatches);

    console.log(`[ServerEngine] Recalculating ${validFixtures.length} upcoming fixtures with ${allMatches.length} historical matches in universe.`);

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
    const rawFeedPaths = db.getRawFeedPathsSet();
    const allStandingsTables = db.getAllLeagueStandingsTables();
    const standingsLookup = this.buildStandingsLookup(allStandingsTables);

    // Build augmented match graph (base historical universe + cached H2H form feeds) so international & cup teams get real Elo ratings
    const eloUniverse = ApexEngine.augmentHistoricalMatchesWithH2H(allMatches, cachedH2HMap.values());
    const eloRatingsMap = ApexEngine.computeAugmentedEloRatings(eloUniverse);
    const leagueContextCache = new Map<string, HistoricalMatch[]>();
    const leagueCountCache = new Map<string, number>();
    const getLeagueContext = (league?: string, leagueName?: string): HistoricalMatch[] => {
      const key = `${league || ''}::${leagueName || ''}`;
      const cached = leagueContextCache.get(key);
      if (cached) return cached;
      const targetLeague = league && league !== 'ALL' ? league : '';
      const targetLeagueName = leagueName && leagueName !== 'ALL' ? leagueName : '';
      const filtered = (targetLeague || targetLeagueName)
        ? allMatches.filter((m) =>
            (targetLeague && matchesLeague(m.div, (m as any).leagueName, targetLeague)) ||
            (targetLeagueName && matchesLeague(m.div, (m as any).leagueName, targetLeagueName))
          )
        : [];
      leagueCountCache.set(key, filtered.length);
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
      if (options?.shouldCancel?.()) {
        loggerService.addLog({
          level: 'WARN',
          category: 'PREDICTION',
          source: 'ServerEngine',
          message: `Aborted chunked prediction calculation at ${processed}/${validFixtures.length} matches`,
        });
        break;
      }

      const chunk = validFixtures.slice(i, i + chunkSize);
      const predictedChunk: Fixture[] = [];
      const unpredictedToUpdate: Fixture[] = [];
      const clearUpcomingPredictionIds: string[] = [];
      const skippedIds: string[] = [];
      const newMeasurementsBatch: Array<{ fixtureId: string; h2h: HeadToHeadMeasurement }> = [];

      let sliceStartMs = Date.now();

      for (let j = 0; j < chunk.length; j++) {
        if (options?.shouldCancel?.()) break;
        const f = chunk[j];
        const cleanId = (f.id || '').replace(/^fs_/, '');
        const hasExistingPred = Boolean((f as any)._hasExistingPrediction) || f.prediction !== undefined;

        try {
          let cachedH2H =
            cachedH2HMap.get(cleanId) ||
            cachedH2HMap.get(f.id) ||
            (f.prediction?.measurements?.h2h &&
            ((f.prediction.measurements.h2h.homeRecentMatches && f.prediction.measurements.h2h.homeRecentMatches.length > 0) ||
              (f.prediction.measurements.h2h.awayRecentMatches && f.prediction.measurements.h2h.awayRecentMatches.length > 0))
              ? f.prediction.measurements.h2h
              : null);

          if (!cachedH2H && (rawFeedPaths.has(cleanId) || rawFeedPaths.has(`df_hh_1_${cleanId}`))) {
            // Check local raw SQLite H2H feed only when feed_path is known to exist
            const rawStored = db.getRawFeed(cleanId, true);
            if (rawStored && rawStored.rawText && (rawStored.rawText.includes('KB÷') || rawStored.rawText.includes('KC÷'))) {
              const parsedLocal = parseHeadToHeadFeedText(rawStored.rawText, cleanId, f.homeTeam, f.awayTeam);
              if (parsedLocal) {
                cachedH2H = parsedLocal;
                newMeasurementsBatch.push({ fixtureId: cleanId, h2h: parsedLocal });
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

          const cachedOdds = f.marketOdds || cachedOddsMap.get(cleanId) || cachedOddsMap.get(f.id);
          const fWithOdds = cachedOdds && !f.marketOdds ? { ...f, marketOdds: cachedOdds } : f;

          const leagueHistoricalContext = getLeagueContext(f.league, f.leagueName);
          const fixtureStandings = this.resolveStandingsForFixture(fWithOdds, standingsLookup);
          const availability = this.calculateDataAvailability(fWithOdds, allMatches, cachedH2H, scrapedMap, {
            leagueCountCache,
            standingsTable: fixtureStandings,
            quiet: true,
          });

          if (availability.isEligible) {
            const enriched = this.predictFixtureUnified(
              fWithOdds,
              allMatches,
              settings,
              cachedH2H,
              tacticalInput,
              scrapedMap,
              leagueHistoricalContext,
              eloRatingsMap,
              fixtureStandings
            );
            if (cachedOdds) {
              enriched.marketOdds = cachedOdds;
              if (enriched.prediction) {
                enriched.prediction.marketOdds = cachedOdds;
              }
            }
            predictedChunk.push(enriched);
            if (collectFixtures) allEnriched.push(enriched);
            predictedCount++;
          } else {
            if (hasExistingPred) {
              clearUpcomingPredictionIds.push(f.id);
            } else if (cachedOdds && !f.marketOdds) {
              unpredictedToUpdate.push({ ...fWithOdds, prediction: undefined });
            }
            if (collectFixtures) {
              allEnriched.push({ ...fWithOdds, prediction: undefined });
            }
            skippedIds.push(f.id);
            skippedCount++;
          }
        } catch (fixtureErr: any) {
          loggerService.addLog({
            level: 'WARN',
            category: 'PREDICTION',
            source: 'ServerEngine',
            message: `Skipped fixture ${f.id} (${f.homeTeam} vs ${f.awayTeam}) during prediction calculation: ${fixtureErr?.message || fixtureErr}`,
          });
          if (hasExistingPred) {
            clearUpcomingPredictionIds.push(f.id);
          }
          if (collectFixtures) {
            allEnriched.push({ ...f, prediction: undefined });
          }
          skippedIds.push(f.id);
          skippedCount++;
        }

        // Yield cooperatively during heavy CPU chunks so HTTP polling & watchdog never stall
        if ((j & 15) === 15 && Date.now() - sliceStartMs >= 35) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          sliceStartMs = Date.now();
        }
      }

      if (
        newMeasurementsBatch.length > 0 ||
        predictedChunk.length > 0 ||
        clearUpcomingPredictionIds.length > 0 ||
        unpredictedToUpdate.length > 0 ||
        (skippedIds.length > 0 && !options?.alreadyClearedUpcoming)
      ) {
        try {
          const persistChunkTx = sqliteDb.transaction(() => {
            if (newMeasurementsBatch.length > 0) {
              db.savePredictionMeasurementsBatch(newMeasurementsBatch);
            }
            if (predictedChunk.length > 0) {
              db.saveUpcomingFixturesSync(predictedChunk);
              predictionsDb.savePredictionsSync(predictedChunk, { quiet: true });
            }
            if (clearUpcomingPredictionIds.length > 0) {
              db.clearPredictionsOnUpcomingFixtures(clearUpcomingPredictionIds);
            }
            if (unpredictedToUpdate.length > 0) {
              db.saveUpcomingFixturesSync(unpredictedToUpdate);
            }
            if (skippedIds.length > 0 && !options?.alreadyClearedUpcoming) {
              predictionsDb.removePredictionsSync(skippedIds);
            }
          });
          persistChunkTx();
        } catch (saveErr: any) {
          loggerService.addLog({
            level: 'ERROR',
            category: 'DATABASE',
            source: 'ServerEngine',
            message: `Failed to save prediction chunk (${predictedChunk.length} predicted): ${saveErr?.message}`,
          });
          console.error('[ServerEngine] Prediction chunk save error:', saveErr);
        }
      }

      processed += chunk.length;
      if (onProgress) {
        onProgress(processed, validFixtures.length, predictedCount, skippedCount);
      }

      // Yield to the Node.js event loop between chunks so HTTP polls remain instant
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
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
