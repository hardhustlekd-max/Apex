import {
  HistoricalMatch,
  PoissonPrediction,
  CorrectScoreProb,
  TeamStatsSummary,
  TeamFormMatch,
  MarketOption,
  EngineSettings,
  HeadToHeadMeasurement,
  HeadToHeadMatchRecord,
  PredictionEngineMeasurements,
  EloRatingBreakdown,
  TeamStrengthBreakdown,
  LeagueStandingTable,
  XGBreakdown,
  TacticalContextBreakdown,
  MostLikelyOutcome,
  DixonColesParams,
  MatchTacticalContextInput,
  ScrapedMarketOdds,
} from './types.js';
import { getCurrentSeason, normalizeDateStr } from './dateUtils.js';
import { resolveTeamSide, resolveFixtureAlignment, teamMatchScore, getTeamHistoricalMatches } from './feedParser.js';

/**
 * Evidence-Based Prediction Engine
 * Implements:
 * 1. Composite Team Strength & Form Momentum (CSF) Index (Replaces Elo)
 * 2. Augmented Elo Rating Model in Football + Home Advantage
 * 3. Tactical Context & Team News (rest days, fatigue, absences, motivation)
 * 4. Bivariate Dixon-Coles Goal Model with low-scoring correlation correction
 * 5. Value Betting: distinguishing most likely outcome from profitable (+EV) bet
 */
export class ApexEngine {
  private static universeGoalAvgCache = new WeakMap<HistoricalMatch[], { homeAvg: number; awayAvg: number }>();
  private static teamSortedHistoryCache = new WeakMap<HistoricalMatch[], Map<string, HistoricalMatch[]>>();
  private static dateMsCache = new Map<string, number>();

  private static getDateMs(dateStr?: string): number {
    if (!dateStr) return 0;
    const cached = this.dateMsCache.get(dateStr);
    if (cached !== undefined) return cached;

    let ms = 0;
    if (dateStr.length === 10 && dateStr.charCodeAt(4) === 45 && dateStr.charCodeAt(7) === 45) {
      const y = Number(dateStr.slice(0, 4));
      const m = Number(dateStr.slice(5, 7));
      const d = Number(dateStr.slice(8, 10));
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        ms = Date.UTC(y, m - 1, d);
      }
    } else {
      const parsed = new Date(dateStr).getTime();
      if (!isNaN(parsed)) ms = parsed;
    }

    if (this.dateMsCache.size > 10000) {
      this.dateMsCache.clear();
    }
    this.dateMsCache.set(dateStr, ms);
    return ms;
  }

  private static getTeamSortedHistoricalMatches(teamName: string, allMatches: HistoricalMatch[]): HistoricalMatch[] {
    if (!teamName || !allMatches || allMatches.length === 0) return [];
    let map = this.teamSortedHistoryCache.get(allMatches);
    if (!map) {
      map = new Map<string, HistoricalMatch[]>();
      this.teamSortedHistoryCache.set(allMatches, map);
    }
    const cached = map.get(teamName);
    if (cached) return cached;

    const sorted = [...getTeamHistoricalMatches(teamName, allMatches)].sort(
      (a, b) => this.getDateMs(b.matchDate) - this.getDateMs(a.matchDate)
    );
    map.set(teamName, sorted);
    return sorted;
  }

  private static getUniverseGoalAverages(matches: HistoricalMatch[]): { homeAvg: number; awayAvg: number } {
    let cached = this.universeGoalAvgCache.get(matches);
    if (cached) return cached;
    let totH = 0;
    let totA = 0;
    for (const m of matches) {
      totH += m.fthg || 0;
      totA += m.ftag || 0;
    }
    const len = matches.length || 1;
    cached = {
      homeAvg: totH / len,
      awayAvg: totA / len,
    };
    this.universeGoalAvgCache.set(matches, cached);
    return cached;
  }

  /**
   * Factorial calculation with memoization
   */
  private static factorialCache: number[] = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
  private static factorial(n: number): number {
    if (n < 0) return 1;
    if (this.factorialCache[n] !== undefined) return this.factorialCache[n];
    let res = this.factorialCache[this.factorialCache.length - 1];
    for (let i = this.factorialCache.length; i <= n; i++) {
      res *= i;
      this.factorialCache[i] = res;
    }
    return res;
  }

  /**
   * Poisson Probability Mass Function: P(k; λ) = (λ^k * e^-λ) / k!
   */
  public static poissonProb(k: number, lambda: number): number {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / this.factorial(k);
  }

  /**
   * Dixon-Coles Low-Scoring Correlation Factor τ(x, y; λ, μ, ρ)
   * Dixon & Coles (1997) "Modelling Association Football Scores"
   * Corrects the standard Poisson underestimation of low-scoring results and draws.
   * Parameter ρ typically ranges between -0.09 and -0.13 in top flight leagues.
   */
  public static dixonColesTau(
    x: number,
    y: number,
    lambda: number,
    mu: number,
    rho = -0.11
  ): number {
    if (x === 0 && y === 0) {
      return Math.max(0.01, 1 - (lambda * mu * rho));
    }
    if (x === 0 && y === 1) {
      return Math.max(0.01, 1 + (lambda * rho));
    }
    if (x === 1 && y === 0) {
      return Math.max(0.01, 1 + (mu * rho));
    }
    if (x === 1 && y === 1) {
      return Math.max(0.01, 1 - rho);
    }
    return 1.0;
  }

  private static resolveSeasonRecentMatches(
    teamName: string,
    allMatches: HistoricalMatch[],
    windowSize = 15,
    scrapedRecent?: TeamFormMatch[]
  ): TeamFormMatch[] {
    const limit = Math.min(20, Math.max(8, windowSize));

    if (scrapedRecent && scrapedRecent.length > 0) {
      return [...scrapedRecent]
        .sort((a, b) => this.getDateMs(b.date) - this.getDateMs(a.date))
        .slice(0, limit);
    }

    const currentSeason = getCurrentSeason();
    const now = new Date();
    const prevYear = now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 2 : 1);
    const prevSeason = `${prevYear}/${prevYear + 1}`;
    const clubMatches = this.getTeamSortedHistoricalMatches(teamName, allMatches)
      .filter((m) => m.season === currentSeason || m.season === prevSeason)
      .slice(0, limit);

    const recentMatchesList: TeamFormMatch[] = [];
    for (const m of clubMatches) {
      const side = resolveTeamSide(teamName, m.homeTeam, m.awayTeam);
      if (!side) continue;
      const isHome = side === 'HOME';
      const gf = isHome ? m.fthg : m.ftag;
      const ga = isHome ? m.ftag : m.fthg;
      const res: 'W' | 'D' | 'L' = gf > ga ? 'W' : ga > gf ? 'L' : 'D';

      recentMatchesList.push({
        date: m.matchDate,
        opponent: isHome ? m.awayTeam : m.homeTeam,
        isHome,
        goalsFor: gf,
        goalsAgainst: ga,
        result: res,
        competition: m.div,
        shotsFor: isHome ? m.hs : m.asShots,
        shotsAgainst: isHome ? m.asShots : m.hs,
        shotsOnTargetFor: isHome ? m.hst : m.ast,
        shotsOnTargetAgainst: isHome ? m.ast : m.hst,
      });
    }

    return recentMatchesList;
  }

  // =========================================================================
  // PILLAR 1: COMPOSITE TEAM STRENGTH & FORM MOMENTUM (CSF) INDEX
  // Replaces legacy Elo rating with empirical multi-factor model
  // =========================================================================

  /**
   * Computes the Composite Team Strength & Form Momentum (CSF) Profile:
   * 1. Decayed Goal & Form Dominance (45%): Recency-weighted goal supremacy over 8-10 matches
   * 2. League Standings & Table Momentum (30%): PPG velocity, rank position, goal difference
   * 3. Attacking & Defensive Shot Efficiency (25%): Clinical finishing and defensive resistance per SOT
   * 4. Dynamic Home/Away venue performance splits
   */
  public static computeTeamStrengthProfile(
    teamName: string,
    allMatches: HistoricalMatch[],
    standings?: LeagueStandingTable | null,
    isHomeVenue = true,
    windowSize = 15,
    decayRate = 0.90,
    scrapedRecent?: TeamFormMatch[],
    eloRatings?: Map<string, number>,
    preResolvedRecent?: TeamFormMatch[]
  ): {
    strengthRating: number;
    formDominance: number;
    tableMomentum: number;
    shotEfficiency: number;
    venueModifier: number;
    recentMatches: TeamFormMatch[];
  } {
    const recentMatchesList =
      preResolvedRecent ??
      this.resolveSeasonRecentMatches(teamName, allMatches, windowSize, scrapedRecent);

    // 1. Decayed Opponent-Adjusted Form & Goal Dominance
    let weightedFormSum = 0;
    let formWeightTotal = 0;
    let venueMatchesCount = 0;
    let venueSuccessCount = 0;

    for (let i = 0; i < recentMatchesList.length; i++) {
      const m = recentMatchesList[i];
      let baseWeight = Math.pow(decayRate, i);

      if (m.isHome === isHomeVenue) {
        baseWeight *= 1.10;
        venueMatchesCount++;
        if (m.result === 'W') venueSuccessCount += 1.0;
        else if (m.result === 'D') venueSuccessCount += 0.45;
      }

      const points = m.result === 'W' ? 3 : m.result === 'D' ? 1 : 0;
      const resultFactor = (points / 3.0) * 100;

      const gd = Math.max(-4, Math.min(4, m.goalsFor - m.goalsAgainst));
      const marginFactor = Math.max(0, Math.min(100, 50 + (gd * 11.5)));

      const oppElo = eloRatings && eloRatings.size > 0 ? this.getTeamElo(m.opponent, eloRatings) : 1500;
      const oppPerfBonus = Math.max(-18, Math.min(18, (oppElo - 1500) / 14));

      const matchDominance = Math.max(0, Math.min(100, (0.62 * resultFactor) + (0.38 * marginFactor) + oppPerfBonus));
      weightedFormSum += matchDominance * baseWeight;
      formWeightTotal += baseWeight;
    }

    const n = recentMatchesList.length;
    const sampleShrink = n / (n + 5);
    const rawFormDominance = formWeightTotal > 0 ? (weightedFormSum / formWeightTotal) : 50.0;
    const formDominance = Number((50.0 + (rawFormDominance - 50.0) * sampleShrink).toFixed(1));

    // 2. League Standings & Table Momentum (only weighted distinctly when actual standings exist)
    let hasStandingsEntry = false;
    let tableMomentum = formDominance;
    if (standings && Array.isArray(standings.table) && standings.table.length > 0) {
      let entry = standings.table[0];
      let bestScore = 0;
      for (const e of standings.table) {
        const s = teamMatchScore(teamName, e.teamName);
        if (s > bestScore) {
          bestScore = s;
          entry = e;
        }
      }
      if (bestScore === 0) entry = undefined as any;

      if (entry) {
        hasStandingsEntry = true;
        const totalTeams = Math.max(10, standings.table.length);
        const rankScore = Math.max(0, Math.min(100, ((totalTeams - entry.rank + 1) / totalTeams) * 100));
        const ppg = entry.played > 0 ? entry.points / entry.played : 1.35;
        const ppgScore = Math.max(0, Math.min(100, (ppg / 3.0) * 100));
        const gdPerGame = entry.played > 0 ? entry.goalDifference / entry.played : 0;
        const gdScore = Math.max(0, Math.min(100, 50 + (gdPerGame * 20)));

        tableMomentum = Number(((0.40 * ppgScore) + (0.35 * rankScore) + (0.25 * gdScore)).toFixed(1));
      }
    }

    // 3. Attacking & Defensive Shot Efficiency (shrunk toward 50 when sample is small)
    let totalSotFor = 0;
    let totalGoalsFor = 0;
    let totalSotAgainst = 0;
    let totalGoalsAgainst = 0;

    for (const m of recentMatchesList) {
      if (m.shotsOnTargetFor !== undefined) {
        totalSotFor += m.shotsOnTargetFor;
      }
      if (m.shotsOnTargetAgainst !== undefined) {
        totalSotAgainst += m.shotsOnTargetAgainst;
      }
      totalGoalsFor += m.goalsFor;
      totalGoalsAgainst += m.goalsAgainst;
    }

    let shotEfficiency = 50.0;
    if (totalSotFor > 0 || totalSotAgainst > 0) {
      const sotShare = (totalSotFor / Math.max(1, totalSotFor + totalSotAgainst)) * 100;
      const attackConversion = totalGoalsFor / Math.max(1, totalSotFor);
      const attackScore = Math.max(15, Math.min(90, (attackConversion / 0.35) * 50));
      const defConversion = totalGoalsAgainst / Math.max(1, totalSotAgainst);
      const defScore = Math.max(15, Math.min(90, 100 - (defConversion / 0.35) * 50));

      const rawShotEff = (0.40 * sotShare) + (0.35 * attackScore) + (0.25 * defScore);
      shotEfficiency = Number((50.0 + (rawShotEff - 50.0) * sampleShrink).toFixed(1));
    } else if (n > 0) {
      const avgNetGoals = (totalGoalsFor - totalGoalsAgainst) / n;
      const rawEff = Math.max(20, Math.min(80, 50 + (avgNetGoals * 14)));
      shotEfficiency = Number((50.0 + (rawEff - 50.0) * sampleShrink).toFixed(1));
    }

    // 4. Symmetric, Shrunk Venue Modifier around 1.00 (base home advantage is modeled separately)
    const venueShrink = venueMatchesCount / (venueMatchesCount + 6);
    let venueModifier = 1.0;
    if (isHomeVenue) {
      const homeRate = venueMatchesCount > 0 ? (venueSuccessCount / venueMatchesCount) : 0.45;
      venueModifier = Number(Math.max(0.95, Math.min(1.06, 1.0 + ((homeRate - 0.45) * 0.14 * venueShrink))).toFixed(3));
    } else {
      const awayRate = venueMatchesCount > 0 ? (venueSuccessCount / venueMatchesCount) : 0.35;
      venueModifier = Number(Math.max(0.94, Math.min(1.06, 1.0 + ((awayRate - 0.35) * 0.14 * venueShrink))).toFixed(3));
    }

    // 5. Composite Team Strength Rating (TSR)
    const rawStrength = hasStandingsEntry
      ? (0.55 * formDominance) + (0.20 * tableMomentum) + (0.25 * shotEfficiency)
      : (0.75 * formDominance) + (0.25 * shotEfficiency);
    const strengthRating = Number(Math.max(15.0, Math.min(90.0, rawStrength)).toFixed(1));

    return {
      strengthRating,
      formDominance,
      tableMomentum,
      shotEfficiency,
      venueModifier,
      recentMatches: recentMatchesList,
    };
  }

  /**
   * Derives 1X2 win expectancy and strength difference from CSF profiles
   */
  public static getTeamStrengthExpectancy(
    homeProfile: { strengthRating: number; venueModifier: number },
    awayProfile: { strengthRating: number; venueModifier: number },
    homeAdvantageSetting = 1.12
  ): {
    homeWinExpectancy: number;
    drawExpectancy: number;
    awayWinExpectancy: number;
    strengthDifference: number;
  } {
    const venueHome = homeProfile.strengthRating * (homeProfile.venueModifier || 1.0);
    const venueAway = awayProfile.strengthRating * (awayProfile.venueModifier || 1.0);
    const homeBonus = (homeAdvantageSetting - 1.0) * 32; // ~+3.8 pts for 1.12 home advantage
    const strengthDifference = Number((venueHome + homeBonus - venueAway).toFixed(1));

    // Empirical football draw parity curve peaked at parity (27.5%)
    const drawExpectancy = Number((0.275 * Math.exp(-Math.pow(strengthDifference / 42, 2))).toFixed(4));

    // Calibrated logistic win expectancy (divisor 52 prevents single-streak 87% spikes)
    const homeRaw = 1 / (1 + Math.pow(10, -strengthDifference / 52));
    const awayRaw = 1 / (1 + Math.pow(10, strengthDifference / 52));
    const sumRaw = homeRaw + awayRaw || 1.0;

    const remaining = Math.max(0.10, 1.0 - drawExpectancy);
    const homeWinExpectancy = Number(((homeRaw / sumRaw) * remaining).toFixed(4));
    const awayWinExpectancy = Number(((awayRaw / sumRaw) * remaining).toFixed(4));

    const total = homeWinExpectancy + drawExpectancy + awayWinExpectancy;
    return {
      homeWinExpectancy: Number((homeWinExpectancy / total).toFixed(4)),
      drawExpectancy: Number((drawExpectancy / total).toFixed(4)),
      awayWinExpectancy: Number((awayWinExpectancy / total).toFixed(4)),
      strengthDifference,
    };
  }

  /**
   * Augments base historical matches with deduplicated team form & H2H records
   * so Elo ratings cover international, cross-league, and non-cached clubs accurately.
   */
  public static augmentHistoricalMatchesWithH2H(
    baseMatches: HistoricalMatch[],
    h2hEntries: Iterable<HeadToHeadMeasurement>
  ): HistoricalMatch[] {
    const seen = new Set<string>();
    const out: HistoricalMatch[] = [];

    const addMatch = (m: HistoricalMatch) => {
      const t1 = (m.homeTeam || '').toLowerCase().trim();
      const t2 = (m.awayTeam || '').toLowerCase().trim();
      if (!t1 || !t2 || t1 === t2) return;
      const dateKey = (m.matchDate || '').slice(0, 10);
      const key = `${dateKey}__${t1}__${t2}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(m);
    };

    for (const m of baseMatches) {
      addMatch(m);
    }

    for (const h of h2hEntries) {
      if (!h) continue;
      if (h.homeClub && Array.isArray(h.homeRecentMatches)) {
        for (const rm of h.homeRecentMatches) {
          const homeTeam = rm.isHome ? h.homeClub : rm.opponent;
          const awayTeam = rm.isHome ? rm.opponent : h.homeClub;
          const fthg = rm.isHome ? rm.goalsFor : rm.goalsAgainst;
          const ftag = rm.isHome ? rm.goalsAgainst : rm.goalsFor;
          addMatch({
            id: `h2h_${rm.date}_${homeTeam}_${awayTeam}`,
            div: rm.competition || 'INT',
            season: getCurrentSeason(),
            matchDate: rm.date,
            homeTeam,
            awayTeam,
            fthg,
            ftag,
            ftr: fthg > ftag ? 'H' : fthg < ftag ? 'A' : 'D',
          });
        }
      }
      if (h.awayClub && Array.isArray(h.awayRecentMatches)) {
        for (const rm of h.awayRecentMatches) {
          const homeTeam = rm.isHome ? h.awayClub : rm.opponent;
          const awayTeam = rm.isHome ? rm.opponent : h.awayClub;
          const fthg = rm.isHome ? rm.goalsFor : rm.goalsAgainst;
          const ftag = rm.isHome ? rm.goalsAgainst : rm.goalsFor;
          addMatch({
            id: `h2h_${rm.date}_${homeTeam}_${awayTeam}`,
            div: rm.competition || 'INT',
            season: getCurrentSeason(),
            matchDate: rm.date,
            homeTeam,
            awayTeam,
            fthg,
            ftag,
            ftr: fthg > ftag ? 'H' : fthg < ftag ? 'A' : 'D',
          });
        }
      }
      if (Array.isArray(h.recentH2H)) {
        for (const r of h.recentH2H) {
          const parts = (r.score || '').split('-');
          if (parts.length !== 2) continue;
          const hg = parseInt(parts[0], 10);
          const ag = parseInt(parts[1], 10);
          if (isNaN(hg) || isNaN(ag)) continue;
          addMatch({
            id: `h2h_${r.date}_${r.homeTeam}_${r.awayTeam}`,
            div: r.competition || 'INT',
            season: getCurrentSeason(),
            matchDate: r.date,
            homeTeam: r.homeTeam,
            awayTeam: r.awayTeam,
            fthg: hg,
            ftag: ag,
            ftr: hg > ag ? 'H' : hg < ag ? 'A' : 'D',
          });
        }
      }
    }

    return out;
  }

  /**
   * Multi-pass recency-weighted Augmented Elo ratings across the full match graph
   */
  public static computeAugmentedEloRatings(allMatches: HistoricalMatch[]): Map<string, number> {
    const ratings = new Map<string, number>();
    const sorted = [...allMatches].sort(
      (a, b) => this.getDateMs(a.matchDate) - this.getDateMs(b.matchDate)
    );
    const now = Date.now();
    const passKs = [32, 24, 16];

    // Precompute pass-invariant match metadata once outside the 3 Elo passes
    const precomputed = sorted.map((m) => {
      const gd = Math.abs(m.fthg - m.ftag);
      const marginMult = gd >= 3 ? 1.5 : gd === 2 ? 1.25 : 1.0;
      const dateMs = this.getDateMs(m.matchDate);
      const ageDays = dateMs > 0 ? Math.max(0, (now - dateMs) / 86400000) : 180;
      const recency = ageDays > 730 ? 0.35 : Math.exp(-ageDays / 450);
      return {
        hKey: m.homeTeam.toLowerCase().trim(),
        aKey: m.awayTeam.toLowerCase().trim(),
        actualHome: m.ftr === 'H' ? 1.0 : m.ftr === 'D' ? 0.5 : 0.0,
        marginMult,
        recency,
      };
    });

    for (const baseK of passKs) {
      for (let i = 0; i < precomputed.length; i++) {
        const item = precomputed[i];
        const hElo = ratings.get(item.hKey) ?? 1500;
        const aElo = ratings.get(item.aKey) ?? 1500;

        const expHome = 1 / (1 + Math.pow(10, (aElo - (hElo + 55)) / 400));
        const delta = baseK * item.marginMult * item.recency * (item.actualHome - expHome);

        ratings.set(item.hKey, Math.round(hElo + delta));
        ratings.set(item.aKey, Math.round(aElo - delta));
      }
    }
    return ratings;
  }

  private static eloLookupCache = new WeakMap<Map<string, number>, Map<string, number>>();

  public static getTeamElo(teamName: string, ratingsMap: Map<string, number>): number {
    const clean = teamName.toLowerCase().trim();
    if (ratingsMap.has(clean)) return ratingsMap.get(clean)!;
    let mapCache = this.eloLookupCache.get(ratingsMap);
    if (!mapCache) {
      mapCache = new Map<string, number>();
      this.eloLookupCache.set(ratingsMap, mapCache);
    }
    if (mapCache.has(clean)) return mapCache.get(clean)!;
    let bestScore = 0;
    let bestVal = 1500;
    for (const [key, val] of ratingsMap.entries()) {
      const s = teamMatchScore(clean, key);
      if (s > bestScore) {
        bestScore = s;
        bestVal = val;
      }
    }
    const resolved = bestScore > 0 ? bestVal : 1500; // Strictly neutral baseline for unknown teams
    mapCache.set(clean, resolved);
    return resolved;
  }

  public static getEloWinExpectancy(
    homeElo: number,
    awayElo: number,
    homeAdvantage = 55
  ): { homeWinProb: number; drawProb: number; awayWinProb: number; eloDifference: number } {
    const diff = (homeElo + homeAdvantage) - awayElo;
    const drawProb = Number((0.275 * Math.exp(-Math.pow(diff / 280, 2))).toFixed(4));
    const homeRaw = 1 / (1 + Math.pow(10, -(diff - 20) / 400));
    const awayRaw = 1 / (1 + Math.pow(10, (diff + 20) / 400));
    const remaining = Math.max(0.1, 1 - drawProb);
    const sumRaw = homeRaw + awayRaw || 1.0;
    const homeWinProb = Number(((homeRaw / sumRaw) * remaining).toFixed(4));
    const awayWinProb = Number(((awayRaw / sumRaw) * remaining).toFixed(4));
    const total = homeWinProb + drawProb + awayWinProb;
    return {
      homeWinProb: Number((homeWinProb / total).toFixed(4)),
      drawProb: Number((drawProb / total).toFixed(4)),
      awayWinProb: Number((awayWinProb / total).toFixed(4)),
      eloDifference: diff,
    };
  }

  // =========================================================================
  // PILLAR 1: EXPECTED GOALS (xG) + RECENT PERFORMANCE (5-10 MATCHES)
  // =========================================================================

  /**
   * Evaluates the quality of chances created and conceded over the last 5-10 matches,
   * adjusted for opponent strength (avoiding reliance solely on wins/losses).
   *
   * Chance Quality Formulation:
   * - If shots on target and shots are present:
   *     xG = (Shots on Target * 0.31) + ((Shots - SoT) * 0.06)
   * - If only final scores exist:
   *     xG = (Goals * 0.72) + 0.35
   *
   * Opponent Strength Adjustment:
   * - Chances created against high-defense teams get boosted.
   * - Chances conceded against weak attacks indicate elevated defensive vulnerability.
   */
  public static computeOpponentAdjustedXG(
    teamName: string,
    allMatches: HistoricalMatch[],
    eloRatings: Map<string, number>,
    windowSize = 15,
    decayRate = 0.92,
    scrapedRecent?: TeamFormMatch[],
    preResolvedRecent?: TeamFormMatch[]
  ): {
    rawXG: number;
    rawXGA: number;
    adjustedXG: number;
    adjustedXGA: number;
    opponentAdjustmentFactor: number;
    rollingMatchesCount: number;
    formattedRecent: TeamFormMatch[];
  } {
    const recentMatchesList =
      preResolvedRecent ??
      this.resolveSeasonRecentMatches(teamName, allMatches, windowSize, scrapedRecent);

    if (recentMatchesList.length === 0) {
      return {
        rawXG: 0.0,
        rawXGA: 0.0,
        adjustedXG: 0.0,
        adjustedXGA: 0.0,
        opponentAdjustmentFactor: 1.0,
        rollingMatchesCount: 0,
        formattedRecent: [],
      };
    }

    let weightedXGCreated = 0;
    let weightedXGConceded = 0;
    let weightedRawXG = 0;
    let weightedRawXGA = 0;
    let totalWeight = 0;
    let opponentStrengthSum = 0;
    const effectiveDecay = Math.max(0.88, Math.min(0.95, decayRate));

    for (let i = 0; i < recentMatchesList.length; i++) {
      const m = recentMatchesList[i];
      const weight = Math.pow(effectiveDecay, i);

      // 1. Chance quality calculation (no-shot fallback avoids 0.35 floor inflation on 0-goal matches)
      let matchXG = 0;
      let matchXGA = 0;

      if (m.shotsOnTargetFor !== undefined && m.shotsFor !== undefined) {
        const offTarget = Math.max(0, m.shotsFor - m.shotsOnTargetFor);
        matchXG = (m.shotsOnTargetFor * 0.31) + (offTarget * 0.06);
      } else {
        matchXG = (m.goalsFor * 0.85) + 0.14;
      }

      if (m.shotsOnTargetAgainst !== undefined && m.shotsAgainst !== undefined) {
        const offTargetAgainst = Math.max(0, m.shotsAgainst - m.shotsOnTargetAgainst);
        matchXGA = (m.shotsOnTargetAgainst * 0.31) + (offTargetAgainst * 0.06);
      } else {
        matchXGA = (m.goalsAgainst * 0.85) + 0.14;
      }

      // Bound single-match extremes
      matchXG = Math.max(0.12, Math.min(4.2, matchXG));
      matchXGA = Math.max(0.12, Math.min(4.2, matchXGA));

      // 2. Meaningful opponent strength adjustment based on opponent Elo
      const oppElo = this.getTeamElo(m.opponent, eloRatings);
      opponentStrengthSum += oppElo;

      const oppFactor = Math.max(0.55, Math.min(1.80, Math.pow(10, (oppElo - 1500) / 700)));

      const matchAdjustedXG = matchXG * oppFactor;
      const matchAdjustedXGA = matchXGA * (1 / oppFactor);

      weightedRawXG += matchXG * weight;
      weightedRawXGA += matchXGA * weight;
      weightedXGCreated += matchAdjustedXG * weight;
      weightedXGConceded += matchAdjustedXGA * weight;
      totalWeight += weight;
    }

    const avgOppElo = opponentStrengthSum / (recentMatchesList.length || 1);
    const opponentAdjustmentFactor = Number((avgOppElo / 1500).toFixed(3));

    const rawXG = Number((weightedRawXG / totalWeight).toFixed(2));
    const rawXGA = Number((weightedRawXGA / totalWeight).toFixed(2));
    const adjustedXG = Number((weightedXGCreated / totalWeight).toFixed(2));
    const adjustedXGA = Number((weightedXGConceded / totalWeight).toFixed(2));

    return {
      rawXG,
      rawXGA,
      adjustedXG,
      adjustedXGA,
      opponentAdjustmentFactor,
      rollingMatchesCount: recentMatchesList.length,
      formattedRecent: recentMatchesList,
    };
  }

  // =========================================================================
  // PILLAR 3: TEAM NEWS AND TACTICAL CONTEXT
  // =========================================================================

  /**
   * Evaluates team news, rest days, injuries, suspensions, and tactical motivation.
   * As specified by evidence-based research:
   * "Use these as adjustments, not as reasons to ignore the statistical evidence."
   * Applies bounded adjustments within [0.90, 1.10].
   */
  public static computeTacticalAdjustments(
    homeTeam: string,
    awayTeam: string,
    context?: MatchTacticalContextInput
  ): TacticalContextBreakdown {
    const restHome = context?.restDaysHome;
    const restAway = context?.restDaysAway;
    const restDiff = (restHome !== undefined && restAway !== undefined) ? (restHome - restAway) : 0;

    let fatigueHome = 1.0;
    let fatigueAway = 1.0;
    const tacticalNotes: string[] = [];

    // Rest days impact: matches with <= 3 days rest experience acute fatigue
    if (restHome !== undefined) {
      if (restHome <= 3) {
        fatigueHome *= 0.94;
        tacticalNotes.push(`${homeTeam} short turnaround (${restHome} days rest)`);
      } else if (restHome >= 6) {
        fatigueHome *= 1.02;
      }
    }

    if (restAway !== undefined) {
      if (restAway <= 3) {
        fatigueAway *= 0.94;
        tacticalNotes.push(`${awayTeam} short turnaround (${restAway} days rest)`);
      } else if (restAway >= 6) {
        fatigueAway *= 1.02;
      }
    }

    // Evaluate information items (injuries, suspensions, referee, venue)
    if (context?.information && context.information.length > 0) {
      for (const item of context.information) {
        const cat = item.category?.toLowerCase() || '';
        const val = item.value?.toLowerCase() || '';

        if (cat.includes('missing') || cat.includes('injury') || cat.includes('suspension')) {
          if (val.includes(homeTeam.toLowerCase())) {
            fatigueHome *= 0.96;
            tacticalNotes.push(`${homeTeam} squad rotation / missing personnel noted`);
          }
          if (val.includes(awayTeam.toLowerCase())) {
            fatigueAway *= 0.96;
            tacticalNotes.push(`${awayTeam} squad rotation / missing personnel noted`);
          }
        }

        if (cat.includes('referee') || cat.includes('venue')) {
          tacticalNotes.push(`${item.category}: ${item.value}`);
        }
      }
    }

    // Keep within rigorous evidence-based bounds [0.90, 1.10]
    fatigueHome = Math.max(0.90, Math.min(1.10, Number(fatigueHome.toFixed(3))));
    fatigueAway = Math.max(0.90, Math.min(1.10, Number(fatigueAway.toFixed(3))));

    return {
      restDaysHome: restHome,
      restDaysAway: restAway,
      restDifferential: restDiff,
      fatigueAdjustmentHome: fatigueHome,
      fatigueAdjustmentAway: fatigueAway,
      tacticalNotes,
    };
  }

  // =========================================================================
  // PILLAR 4: BIVARIATE DIXON-COLES GOAL MODEL & PROBABILITY CALCULATION
  // =========================================================================

  /**
   * Generates a complete match probability prediction using the full Evidence-Based framework:
   * - Opponent-adjusted xG created/conceded over 5-10 matches
   * - Augmented Elo Ratings with home field advantage
   * - Tactical context & rest day adjustments
   * - Bivariate Dixon-Coles goal model with low-scoring correlation correction (ρ = -0.11)
   */
  public static predictMatch(
    homeTeam: string,
    awayTeam: string,
    leagueHistoricalMatches: HistoricalMatch[] = [],
    settings?: EngineSettings,
    realScrapedH2H?: HeadToHeadMeasurement | null,
    allHistoricalMatches?: HistoricalMatch[],
    tacticalInput?: MatchTacticalContextInput,
    standings?: LeagueStandingTable | null,
    eloRatingsMapOverride?: Map<string, number>,
    marketOdds?: ScrapedMarketOdds | null
  ): { prediction: PoissonPrediction; homeStats: TeamStatsSummary; awayStats: TeamStatsSummary } {
    const historicalUniverse = allHistoricalMatches && allHistoricalMatches.length > 0
      ? allHistoricalMatches
      : leagueHistoricalMatches;

    // 1. Augmented Elo Ratings (augment with realScrapedH2H if override lacks either team)
    let eloRatingsMap = eloRatingsMapOverride || this.computeAugmentedEloRatings(historicalUniverse);
    let homeElo = this.getTeamElo(homeTeam, eloRatingsMap);
    let awayElo = this.getTeamElo(awayTeam, eloRatingsMap);
    if (
      realScrapedH2H &&
      (homeElo === 1500 || awayElo === 1500) &&
      ((realScrapedH2H.homeRecentMatches && realScrapedH2H.homeRecentMatches.length > 0) ||
        (realScrapedH2H.awayRecentMatches && realScrapedH2H.awayRecentMatches.length > 0))
    ) {
      const augmented = this.augmentHistoricalMatchesWithH2H(historicalUniverse, [
        { ...realScrapedH2H, homeClub: realScrapedH2H.homeClub || homeTeam, awayClub: realScrapedH2H.awayClub || awayTeam },
      ]);
      eloRatingsMap = this.computeAugmentedEloRatings(augmented);
      homeElo = this.getTeamElo(homeTeam, eloRatingsMap);
      awayElo = this.getTeamElo(awayTeam, eloRatingsMap);
    }

    const homeAdvantageElo = 55;
    const eloExpectancy = this.getEloWinExpectancy(homeElo, awayElo, homeAdvantageElo);

    const rollingWindow = settings?.rollingMatchWindow || 15;
    const formDecay = settings?.formDecayRate || 0.90;
    const csfUniverse = historicalUniverse.length > 0 ? historicalUniverse : leagueHistoricalMatches;

    const homeSeasonRecent = this.resolveSeasonRecentMatches(
      homeTeam,
      csfUniverse,
      rollingWindow,
      realScrapedH2H?.homeRecentMatches
    );
    const awaySeasonRecent = this.resolveSeasonRecentMatches(
      awayTeam,
      csfUniverse,
      rollingWindow,
      realScrapedH2H?.awayRecentMatches
    );

    const homeCSF = this.computeTeamStrengthProfile(
      homeTeam,
      csfUniverse,
      standings,
      true,
      rollingWindow,
      formDecay,
      realScrapedH2H?.homeRecentMatches,
      eloRatingsMap,
      homeSeasonRecent
    );

    const awayCSF = this.computeTeamStrengthProfile(
      awayTeam,
      csfUniverse,
      standings,
      false,
      rollingWindow,
      formDecay,
      realScrapedH2H?.awayRecentMatches,
      eloRatingsMap,
      awaySeasonRecent
    );

    const csfExpectancy = this.getTeamStrengthExpectancy(
      homeCSF,
      awayCSF,
      settings?.homeAdvantageFactor || 1.12
    );

    const teamStrength: TeamStrengthBreakdown = {
      homeStrengthRating: homeCSF.strengthRating,
      awayStrengthRating: awayCSF.strengthRating,
      formDominanceHome: homeCSF.formDominance,
      formDominanceAway: awayCSF.formDominance,
      tableMomentumHome: homeCSF.tableMomentum,
      tableMomentumAway: awayCSF.tableMomentum,
      shotEfficiencyHome: homeCSF.shotEfficiency,
      shotEfficiencyAway: awayCSF.shotEfficiency,
      venueModifierHome: homeCSF.venueModifier,
      venueModifierAway: awayCSF.venueModifier,
      strengthDifference: csfExpectancy.strengthDifference,
      homeWinExpectancy: csfExpectancy.homeWinExpectancy,
      drawExpectancy: csfExpectancy.drawExpectancy,
      awayWinExpectancy: csfExpectancy.awayWinExpectancy,
    };

    const eloBreakdown: EloRatingBreakdown = {
      homeElo,
      awayElo,
      eloDifference: eloExpectancy.eloDifference,
      homeAdvantageElo,
      homeWinProbElo: eloExpectancy.homeWinProb,
      drawProbElo: eloExpectancy.drawProb,
      awayWinProbElo: eloExpectancy.awayWinProb,
    };

    // 2. Opponent-Adjusted xG over 8-20 recent matches
    const homeXGProfile = this.computeOpponentAdjustedXG(
      homeTeam,
      historicalUniverse,
      eloRatingsMap,
      rollingWindow,
      0.92,
      realScrapedH2H?.homeRecentMatches,
      homeSeasonRecent
    );

    const awayXGProfile = this.computeOpponentAdjustedXG(
      awayTeam,
      historicalUniverse,
      eloRatingsMap,
      rollingWindow,
      0.92,
      realScrapedH2H?.awayRecentMatches,
      awaySeasonRecent
    );

    const xgBreakdown: XGBreakdown = {
      homeRawXG: homeXGProfile.rawXG,
      homeAdjustedXG: homeXGProfile.adjustedXG,
      awayRawXG: awayXGProfile.rawXG,
      awayAdjustedXG: awayXGProfile.adjustedXG,
      opponentAdjustmentFactorHome: homeXGProfile.opponentAdjustmentFactor,
      opponentAdjustmentFactorAway: awayXGProfile.opponentAdjustmentFactor,
      homeRollingMatchesEvaluated: homeXGProfile.rollingMatchesCount,
      awayRollingMatchesEvaluated: awayXGProfile.rollingMatchesCount,
    };

    // 3. Team News & Tactical Context
    const tacticalContext = this.computeTacticalAdjustments(homeTeam, awayTeam, tacticalInput);

    // 4. Head to Head record directly from scraper feed or historical records (recency-weighted)
    const hasRealScrapedH2H = Boolean(
      realScrapedH2H &&
      (realScrapedH2H.matchesCount > 0 ||
        (realScrapedH2H.homeRecentMatches && realScrapedH2H.homeRecentMatches.length > 0) ||
        (realScrapedH2H.awayRecentMatches && realScrapedH2H.awayRecentMatches.length > 0) ||
        (realScrapedH2H.recentH2H && realScrapedH2H.recentH2H.length > 0))
    );
    let h2h = hasRealScrapedH2H
      ? realScrapedH2H!
      : this.computeHeadToHead(homeTeam, awayTeam, historicalUniverse.length > 0 ? historicalUniverse : leagueHistoricalMatches);

    // Compute recency-weighted H2H multipliers so 20-year-old games don't dilute recent domination
    let h2hMultiplierHome = h2h.h2hMultiplierHome ?? 1.0;
    let h2hMultiplierAway = h2h.h2hMultiplierAway ?? 1.0;
    if (h2h.recentH2H && h2h.recentH2H.length > 0) {
      const nowMs = Date.now();
      let wDiff = 0;
      let wGoals = 0;
      let wTot = 0;
      for (const r of h2h.recentH2H) {
        const parts = (r.score || '').split('-');
        if (parts.length !== 2) continue;
        const g1 = parseInt(parts[0], 10);
        const g2 = parseInt(parts[1], 10);
        if (isNaN(g1) || isNaN(g2)) continue;
        const align = resolveFixtureAlignment(homeTeam, awayTeam, r.homeTeam, r.awayTeam);
        const isHMatch = align.matched ? align.isHomeFixture : teamMatchScore(homeTeam, r.homeTeam) >= teamMatchScore(homeTeam, r.awayTeam);
        const hg = isHMatch ? g1 : g2;
        const ag = isHMatch ? g2 : g1;
        const dMs = this.getDateMs(r.date);
        const ageYears = dMs > 0 ? Math.max(0, (nowMs - dMs) / (365 * 86400000)) : 1.0;
        const wt = Math.exp(-ageYears * 0.45);
        wDiff += (hg > ag ? 1 : hg < ag ? -1 : 0) * wt;
        wGoals += (hg - ag) * wt;
        wTot += wt;
      }
      if (wTot > 0) {
        const swing = (wDiff / wTot) * 0.14 + (wGoals / wTot) * 0.05;
        h2hMultiplierHome = Number(Math.max(0.80, Math.min(1.25, 1.0 + swing)).toFixed(3));
        h2hMultiplierAway = Number(Math.max(0.80, Math.min(1.25, 1.0 - swing)).toFixed(3));
        if (h2hMultiplierHome !== h2h.h2hMultiplierHome || h2hMultiplierAway !== h2h.h2hMultiplierAway) {
          h2h = { ...h2h, h2hMultiplierHome, h2hMultiplierAway };
        }
      }
    }

    const measurements: PredictionEngineMeasurements = {
      h2h,
    };

    // League baseline scoring averages
    let leagueHomeAvg = 1.48;
    let leagueAwayAvg = 1.18;
    const matchesForAvg = (leagueHistoricalMatches && leagueHistoricalMatches.length >= 5)
      ? leagueHistoricalMatches
      : (historicalUniverse.length > 0 ? historicalUniverse : leagueHistoricalMatches);
    if (matchesForAvg.length > 0) {
      const avgs = this.getUniverseGoalAverages(matchesForAvg);
      leagueHomeAvg = Math.max(1.10, Math.min(2.10, avgs.homeAvg));
      leagueAwayAvg = Math.max(0.90, Math.min(1.80, avgs.awayAvg));
    }

    // 5. Dixon-Coles Expected Goals (λ and μ) with Bayesian small-sample shrinkage
    const hShrink = homeXGProfile.rollingMatchesCount / (homeXGProfile.rollingMatchesCount + 10);
    const aShrink = awayXGProfile.rollingMatchesCount / (awayXGProfile.rollingMatchesCount + 10);

    const homeAttackPower = homeXGProfile.rollingMatchesCount > 0
      ? 1.0 + ((homeXGProfile.adjustedXG / leagueHomeAvg) - 1.0) * hShrink
      : 1.0;
    const awayDefensePower = awayXGProfile.rollingMatchesCount > 0
      ? 1.0 + ((awayXGProfile.adjustedXGA / leagueHomeAvg) - 1.0) * aShrink
      : 1.0;
    const awayAttackPower = awayXGProfile.rollingMatchesCount > 0
      ? 1.0 + ((awayXGProfile.adjustedXG / leagueAwayAvg) - 1.0) * aShrink
      : 1.0;
    const homeDefensePower = homeXGProfile.rollingMatchesCount > 0
      ? 1.0 + ((homeXGProfile.adjustedXGA / leagueAwayAvg) - 1.0) * hShrink
      : 1.0;

    // Gentle Elo rate factor (avoids double-counting with opponent-adjusted xG)
    const eloPureDiff = homeElo - awayElo;
    const eloMultiplierHome = Math.max(0.65, Math.min(1.55, Math.pow(10, eloPureDiff / 1300)));
    const eloMultiplierAway = Math.max(0.65, Math.min(1.55, Math.pow(10, -eloPureDiff / 1300)));

    // Single, non-compounded home advantage & subtle venue modifier
    const baseHomeAdvantage = settings?.homeAdvantageFactor || 1.12;
    const venueRatio = Math.sqrt((homeCSF.venueModifier || 1.0) / Math.max(0.85, awayCSF.venueModifier || 1.0));
    const effectiveHomeAdvantage = Number(Math.max(1.03, Math.min(1.22, baseHomeAdvantage * venueRatio)).toFixed(3));
    const effectiveAwayBaseline = 0.96;

    const homeCombinedPower = Math.pow(Math.max(0.25, homeAttackPower * awayDefensePower), 0.55);
    const awayCombinedPower = Math.pow(Math.max(0.25, awayAttackPower * homeDefensePower), 0.55);

    let homeLambda =
      leagueHomeAvg *
      homeCombinedPower *
      effectiveHomeAdvantage *
      eloMultiplierHome *
      tacticalContext.fatigueAdjustmentHome *
      h2hMultiplierHome;

    let awayMu =
      leagueAwayAvg *
      awayCombinedPower *
      effectiveAwayBaseline *
      eloMultiplierAway *
      tacticalContext.fatigueAdjustmentAway *
      h2hMultiplierAway;

    // Coherent Market Odds Calibration: anchor goal rates λ & μ and probabilities when valid bookmaker odds exist
    let marketOddsWeight = 0;
    let mktHomeProb = 0;
    let mktDrawProb = 0;
    let mktAwayProb = 0;
    if (
      marketOdds &&
      marketOdds.homeImpliedProb !== undefined &&
      marketOdds.drawImpliedProb !== undefined &&
      marketOdds.awayImpliedProb !== undefined &&
      marketOdds.homeImpliedProb > 0 &&
      marketOdds.awayImpliedProb > 0
    ) {
      const mSum = marketOdds.homeImpliedProb + marketOdds.drawImpliedProb + marketOdds.awayImpliedProb;
      if (mSum > 0) {
        mktHomeProb = marketOdds.homeImpliedProb / mSum;
        mktDrawProb = marketOdds.drawImpliedProb / mSum;
        mktAwayProb = marketOdds.awayImpliedProb / mSum;
        marketOddsWeight = (marketOdds.bookmakersCount || 0) >= 5 ? 0.55 : 0.45;
        const mktRatio = Math.max(0.25, Math.min(4.0, Math.pow(Math.max(0.02, mktHomeProb) / Math.max(0.02, mktAwayProb), 1 / 1.45)));
        const totalGoalsBase = marketOdds.over25ImpliedProb !== undefined && marketOdds.over25ImpliedProb > 0
          ? Math.max(1.7, Math.min(3.8, 1.55 + marketOdds.over25ImpliedProb * 1.95))
          : (homeLambda + awayMu);
        const mktLambda = (totalGoalsBase * mktRatio) / (1 + mktRatio);
        const mktMu = totalGoalsBase - mktLambda;
        homeLambda = (1 - marketOddsWeight) * homeLambda + marketOddsWeight * mktLambda;
        awayMu = (1 - marketOddsWeight) * awayMu + marketOddsWeight * mktMu;
      }
    }

    // Realistic bounds check
    homeLambda = Math.max(0.22, Math.min(4.2, homeLambda));
    awayMu = Math.max(0.22, Math.min(4.2, awayMu));

    // 6. Bivariate Dixon-Coles Probability Matrix (7x7 for up to 6 goals)
    const MAX_GOALS = 6;
    const RHO = -0.11; // Empirical Dixon-Coles correlation coefficient
    const matrix: number[][] = [];
    let sumTotalProb = 0;

    let homeWinProbRaw = 0;
    let drawProbRaw = 0;
    let awayWinProbRaw = 0;
    let over15ProbRaw = 0;
    let over25ProbRaw = 0;
    let over35ProbRaw = 0;
    let bttsProbRaw = 0;

    const scoresList: CorrectScoreProb[] = [];

    const awayProbs: number[] = new Array(MAX_GOALS + 1);
    for (let a = 0; a <= MAX_GOALS; a++) {
      awayProbs[a] = this.poissonProb(a, awayMu);
    }

    for (let h = 0; h <= MAX_GOALS; h++) {
      const row: number[] = new Array(MAX_GOALS + 1);
      matrix[h] = row;
      const pH = this.poissonProb(h, homeLambda);

      for (let a = 0; a <= MAX_GOALS; a++) {
        const tau = this.dixonColesTau(h, a, homeLambda, awayMu, RHO);
        const pJoint = pH * awayProbs[a] * tau;

        row[a] = pJoint;
        sumTotalProb += pJoint;
      }
    }

    // Normalize matrix over the goal space and calculate market probabilities
    for (let h = 0; h <= MAX_GOALS; h++) {
      for (let a = 0; a <= MAX_GOALS; a++) {
        const normalizedProb = matrix[h][a] / (sumTotalProb || 1.0);
        matrix[h][a] = Number(normalizedProb.toFixed(4));

        scoresList.push({
          homeGoals: h,
          awayGoals: a,
          score: `${h}-${a}`,
          probability: Number(normalizedProb.toFixed(4)),
        });

        if (h > a) homeWinProbRaw += normalizedProb;
        else if (h === a) drawProbRaw += normalizedProb;
        else awayWinProbRaw += normalizedProb;

        const totalGoals = h + a;
        if (totalGoals > 1.5) over15ProbRaw += normalizedProb;
        if (totalGoals > 2.5) over25ProbRaw += normalizedProb;
        if (totalGoals > 3.5) over35ProbRaw += normalizedProb;
        if (h > 0 && a > 0) bttsProbRaw += normalizedProb;
      }
    }

    // Sort top 5 correct scores
    scoresList.sort((a, b) => b.probability - a.probability);
    const topCorrectScores = scoresList.slice(0, 5);

    // Coherent blend: primarily Dixon-Coles (82%) + Elo (12%) + CSF (6%)
    let finalHomeWin = (0.82 * homeWinProbRaw) + (0.12 * eloExpectancy.homeWinProb) + (0.06 * csfExpectancy.homeWinExpectancy);
    let finalDraw = (0.82 * drawProbRaw) + (0.12 * eloExpectancy.drawProb) + (0.06 * csfExpectancy.drawExpectancy);
    let finalAwayWin = (0.82 * awayWinProbRaw) + (0.12 * eloExpectancy.awayWinProb) + (0.06 * csfExpectancy.awayWinExpectancy);

    if (marketOddsWeight > 0) {
      const probBlend = marketOddsWeight * 0.5;
      finalHomeWin = (1 - probBlend) * finalHomeWin + probBlend * mktHomeProb;
      finalDraw = (1 - probBlend) * finalDraw + probBlend * mktDrawProb;
      finalAwayWin = (1 - probBlend) * finalAwayWin + probBlend * mktAwayProb;
    }

    const sum1X2 = finalHomeWin + finalDraw + finalAwayWin || 1.0;
    finalHomeWin /= sum1X2;
    finalDraw /= sum1X2;
    finalAwayWin /= sum1X2;

    const dixonColesParams: DixonColesParams = {
      rho: RHO,
      homeLambda: Number(homeLambda.toFixed(2)),
      awayMu: Number(awayMu.toFixed(2)),
      tau00: Number(this.dixonColesTau(0, 0, homeLambda, awayMu, RHO).toFixed(3)),
      tau10: Number(this.dixonColesTau(1, 0, homeLambda, awayMu, RHO).toFixed(3)),
      tau01: Number(this.dixonColesTau(0, 1, homeLambda, awayMu, RHO).toFixed(3)),
      tau11: Number(this.dixonColesTau(1, 1, homeLambda, awayMu, RHO).toFixed(3)),
    };

    const homeStats = this.computeTeamStats(
      homeTeam,
      historicalUniverse,
      settings?.rollingMatchWindow || 15,
      settings?.formDecayRate || 0.85,
      realScrapedH2H?.homeRecentMatches
    );
    homeStats.teamStrengthRating = homeCSF.strengthRating;
    homeStats.eloRating = homeElo;
    homeStats.opponentAdjustedXG = homeXGProfile.adjustedXG;
    homeStats.opponentAdjustedXGA = homeXGProfile.adjustedXGA;

    const awayStats = this.computeTeamStats(
      awayTeam,
      historicalUniverse,
      settings?.rollingMatchWindow || 15,
      settings?.formDecayRate || 0.85,
      realScrapedH2H?.awayRecentMatches
    );
    awayStats.teamStrengthRating = awayCSF.strengthRating;
    awayStats.eloRating = awayElo;
    awayStats.opponentAdjustedXG = awayXGProfile.adjustedXG;
    awayStats.opponentAdjustedXGA = awayXGProfile.adjustedXGA;

    const prediction: PoissonPrediction = {
      homeXG: Number(homeLambda.toFixed(2)),
      awayXG: Number(awayMu.toFixed(2)),
      homeWinProb: Number(finalHomeWin.toFixed(3)),
      drawProb: Number(finalDraw.toFixed(3)),
      awayWinProb: Number(finalAwayWin.toFixed(3)),
      over15Prob: Number(over15ProbRaw.toFixed(3)),
      over25Prob: Number(over25ProbRaw.toFixed(3)),
      over35Prob: Number(over35ProbRaw.toFixed(3)),
      bttsProb: Number(bttsProbRaw.toFixed(3)),
      topCorrectScores,
      homeAttackStrength: Number(homeAttackPower.toFixed(2)),
      homeDefenseStrength: Number(homeDefensePower.toFixed(2)),
      awayAttackStrength: Number(awayAttackPower.toFixed(2)),
      awayDefenseStrength: Number(awayDefensePower.toFixed(2)),
      homeFormMultiplier: Number(tacticalContext.fatigueAdjustmentHome.toFixed(2)),
      awayFormMultiplier: Number(tacticalContext.fatigueAdjustmentAway.toFixed(2)),
      probabilityMatrix: matrix,
      measurements,
      modelType: 'DIXON_COLES_EVIDENCE_BASED',
      teamStrength,
      eloRatings: eloBreakdown,
      xgBreakdown,
      tacticalContext,
      dixonColesParams,
    };

    return { prediction, homeStats, awayStats };
  }

  // =========================================================================
  // PILLAR 5: VALUE BETTING & MOST LIKELY OUTCOME VS PROFITABLE BET
  // =========================================================================

  /**
   * Distinguishes between:
   * 1. The MOST LIKELY outcome (highest estimated probability)
   * 2. A PROFITABLE bet (+EV positive expected value edge over bookmaker odds)
   *
   * As emphasized by football prediction literature:
   * "A team can be the most likely winner and still be a poor bet if the odds are too low."
   */
  /**
   * Refactored to remove all odds-related calculations.
   * Focuses strictly on market probabilities and identifying "Banker" status.
   */
  public static calculateMarkets(
    prediction: PoissonPrediction,
    settings: EngineSettings,
    homeTeam: string,
    awayTeam: string
  ): {
    markets: MarketOption[];
    mostLikelyOutcome?: MostLikelyOutcome;
  } {
    const markets: MarketOption[] = [];

    const addMarket = (
      key: MarketOption['key'],
      name: string,
      prob: number
    ) => {
      const isBanker = prob >= (settings.safeWinThreshold || 0.70);

      markets.push({
        key,
        name,
        probability: prob,
        isBanker,
      });
    };

    // 1X2 Match Outcomes
    addMarket('HOME_WIN', `${homeTeam} to Win`, prediction.homeWinProb);
    addMarket('DRAW', 'Draw', prediction.drawProb);
    addMarket('AWAY_WIN', `${awayTeam} to Win`, prediction.awayWinProb);

    // Goal Totals
    addMarket('OVER_25', 'Over 2.5 Goals', prediction.over25Prob);
    addMarket('UNDER_25', 'Under 2.5 Goals', Number((1 - prediction.over25Prob).toFixed(3)));

    // Both Teams to Score
    addMarket('BTTS_YES', 'Both Teams to Score', prediction.bttsProb);
    addMarket('BTTS_NO', 'Both Teams to Score No', Number((1 - prediction.bttsProb).toFixed(3)));

    // Double Chance
    const dc1XProb = Number((prediction.homeWinProb + prediction.drawProb).toFixed(3));
    addMarket('DOUBLE_CHANCE_1X', `${homeTeam} or Draw (1X)`, dc1XProb);

    const dcX2Prob = Number((prediction.awayWinProb + prediction.drawProb).toFixed(3));
    addMarket('DOUBLE_CHANCE_X2', `Draw or ${awayTeam} (X2)`, dcX2Prob);

    // Identify MOST LIKELY Outcome
    let mostLikelyMarket = markets[0];
    for (const m of markets) {
      if (m.probability > (mostLikelyMarket?.probability || 0)) {
        mostLikelyMarket = m;
      }
    }

    let mostLikelyOutcome: MostLikelyOutcome | undefined;
    if (mostLikelyMarket) {
      const commentary = `${mostLikelyMarket.name} is the most likely outcome with a ${(mostLikelyMarket.probability * 100).toFixed(1)}% probability.`;

      mostLikelyOutcome = {
        selection: mostLikelyMarket.name,
        marketKey: mostLikelyMarket.key,
        probability: mostLikelyMarket.probability,
        commentary,
      };

      mostLikelyMarket.isMostLikely = true;
    }

    return {
      markets,
      mostLikelyOutcome,
    };
  }

  // =========================================================================
  // BACKWARD-COMPATIBLE STATS HELPERS
  // =========================================================================

  public static computeTeamStats(
    teamName: string,
    allMatches: HistoricalMatch[],
    windowLimit = 8,
    formDecayRate = 0.88,
    scrapedRecentMatches?: TeamFormMatch[]
  ): TeamStatsSummary {
    let formList: ('W' | 'D' | 'L')[] = [];
    let formattedRecent: TeamFormMatch[] = [];
    let homeMatchesCount = 0;
    let awayMatchesCount = 0;
    let homeGoalsScored = 0;
    let homeGoalsConceded = 0;
    let awayGoalsScored = 0;
    let awayGoalsConceded = 0;

    if (scrapedRecentMatches && scrapedRecentMatches.length > 0) {
      formattedRecent = [...scrapedRecentMatches]
        .sort((a, b) => normalizeDateStr(b.date).localeCompare(normalizeDateStr(a.date)))
        .slice(0, Math.min(10, Math.max(5, windowLimit)));
      for (const m of formattedRecent) {
        formList.push(m.result);
        if (m.isHome) {
          homeMatchesCount++;
          homeGoalsScored += m.goalsFor;
          homeGoalsConceded += m.goalsAgainst;
        } else {
          awayMatchesCount++;
          awayGoalsScored += m.goalsFor;
          awayGoalsConceded += m.goalsAgainst;
        }
      }
    } else {
      const teamMatches = this.getTeamSortedHistoricalMatches(teamName, allMatches)
        .slice(0, Math.min(10, Math.max(5, windowLimit)));

      for (const m of teamMatches) {
        const side = resolveTeamSide(teamName, m.homeTeam, m.awayTeam);
        if (!side) continue;
        const isHome = side === 'HOME';
        const gf = isHome ? m.fthg : m.ftag;
        const ga = isHome ? m.ftag : m.fthg;
        const res: 'W' | 'D' | 'L' = gf > ga ? 'W' : ga > gf ? 'L' : 'D';

        formList.push(res);
        formattedRecent.push({
          date: m.matchDate,
          opponent: isHome ? m.awayTeam : m.homeTeam,
          isHome,
          goalsFor: gf,
          goalsAgainst: ga,
          result: res,
          competition: m.div,
          shotsFor: isHome ? m.hs : m.asShots,
          shotsAgainst: isHome ? m.asShots : m.hs,
          shotsOnTargetFor: isHome ? m.hst : m.ast,
          shotsOnTargetAgainst: isHome ? m.ast : m.hst,
        });

        if (isHome) {
          homeMatchesCount++;
          homeGoalsScored += gf;
          homeGoalsConceded += ga;
        } else {
          awayMatchesCount++;
          awayGoalsScored += gf;
          awayGoalsConceded += ga;
        }
      }
    }

    let leagueHomeAvg = 1.52;
    let leagueAwayAvg = 1.22;
    if (allMatches.length > 0) {
      const avgs = this.getUniverseGoalAverages(allMatches);
      leagueHomeAvg = avgs.homeAvg || 1.52;
      leagueAwayAvg = avgs.awayAvg || 1.22;
    }

    const homeAttack = homeMatchesCount > 0 ? (homeGoalsScored / homeMatchesCount) / leagueHomeAvg : 1.0;
    const homeDefense = homeMatchesCount > 0 ? (homeGoalsConceded / homeMatchesCount) / leagueAwayAvg : 1.0;
    const awayAttack = awayMatchesCount > 0 ? (awayGoalsScored / awayMatchesCount) / leagueAwayAvg : 1.0;
    const awayDefense = awayMatchesCount > 0 ? (awayGoalsConceded / awayMatchesCount) / leagueHomeAvg : 1.0;

    const last5 = formList.slice(0, 5);
    let weightedFormPoints = 0;
    let totalWeight = 0;
    for (let i = 0; i < last5.length; i++) {
      const weight = Math.pow(formDecayRate, i);
      const points = last5[i] === 'W' ? 3 : last5[i] === 'D' ? 1 : 0;
      weightedFormPoints += points * weight;
      totalWeight += 3 * weight;
    }

    const formRatio = totalWeight > 0 ? weightedFormPoints / totalWeight : 0.5;
    const formScore = Number((0.88 + formRatio * 0.27).toFixed(3));

    const totalGoalsScored = homeGoalsScored + awayGoalsScored;
    const totalGoalsConceded = homeGoalsConceded + awayGoalsConceded;
    const matchesPlayed = formattedRecent.length || 1;

    return {
      teamName,
      homeAttack: Number(Math.max(0.4, Math.min(2.5, homeAttack)).toFixed(3)),
      homeDefense: Number(Math.max(0.4, Math.min(2.5, homeDefense)).toFixed(3)),
      awayAttack: Number(Math.max(0.4, Math.min(2.5, awayAttack)).toFixed(3)),
      awayDefense: Number(Math.max(0.4, Math.min(2.5, awayDefense)).toFixed(3)),
      recentForm: formList.slice(0, 5),
      formScore,
      matchesPlayed,
      goalsScored: totalGoalsScored,
      goalsConceded: totalGoalsConceded,
      avgGoalsScored: Number((totalGoalsScored / matchesPlayed).toFixed(2)),
      avgGoalsConceded: Number((totalGoalsConceded / matchesPlayed).toFixed(2)),
      recentMatches: formattedRecent,
    };
  }

  public static computeHeadToHead(
    homeTeam: string,
    awayTeam: string,
    allMatches: HistoricalMatch[]
  ): HeadToHeadMeasurement {
    const twoYearsAgoTime = Date.now() - (730 * 24 * 60 * 60 * 1000);

    const h2hMatches = getTeamHistoricalMatches(homeTeam, allMatches)
      .filter((m) => {
        const alignment = resolveFixtureAlignment(homeTeam, awayTeam, m.homeTeam, m.awayTeam);
        if (!alignment.matched) return false;
        if (!m.matchDate) return true;
        const mTime = new Date(m.matchDate).getTime();
        return isNaN(mTime) || mTime >= twoYearsAgoTime;
      })
      .sort((a, b) => normalizeDateStr(b.matchDate).localeCompare(normalizeDateStr(a.matchDate)));

    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    let homeGoalsTotal = 0;
    let awayGoalsTotal = 0;
    let weightedWinDiff = 0;
    let weightedGoalDiff = 0;
    let weightTotal = 0;
    const nowMs = Date.now();
    const recentH2H: HeadToHeadMatchRecord[] = [];

    for (const m of h2hMatches) {
      const { isHomeFixture } = resolveFixtureAlignment(homeTeam, awayTeam, m.homeTeam, m.awayTeam);
      const hGoals = isHomeFixture ? m.fthg : m.ftag;
      const aGoals = isHomeFixture ? m.ftag : m.fthg;
      homeGoalsTotal += hGoals;
      awayGoalsTotal += aGoals;

      if (hGoals > aGoals) homeWins++;
      else if (aGoals > hGoals) awayWins++;
      else draws++;

      const dMs = this.getDateMs(m.matchDate);
      const ageYears = dMs > 0 ? Math.max(0, (nowMs - dMs) / (365 * 86400000)) : 1.0;
      const wt = Math.exp(-ageYears * 0.45);
      weightedWinDiff += (hGoals > aGoals ? 1 : aGoals > hGoals ? -1 : 0) * wt;
      weightedGoalDiff += (hGoals - aGoals) * wt;
      weightTotal += wt;

      if (recentH2H.length < 5) {
        recentH2H.push({
          date: normalizeDateStr(m.matchDate),
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          score: `${m.fthg}-${m.ftag}`,
          winner: m.fthg > m.ftag ? 'HOME' : m.ftag > m.fthg ? 'AWAY' : 'DRAW',
          competition: m.div,
        });
      }
    }

    const matchesCount = h2hMatches.length;
    const homeGoalsAvg = matchesCount > 0 ? Number((homeGoalsTotal / matchesCount).toFixed(2)) : 0;
    const awayGoalsAvg = matchesCount > 0 ? Number((awayGoalsTotal / matchesCount).toFixed(2)) : 0;

    let h2hMultiplierHome = 1.0;
    let h2hMultiplierAway = 1.0;

    if (matchesCount > 0 && weightTotal > 0) {
      const swing = (weightedWinDiff / weightTotal) * 0.14 + (weightedGoalDiff / weightTotal) * 0.05;
      h2hMultiplierHome = Number(Math.max(0.80, Math.min(1.25, 1.0 + swing)).toFixed(3));
      h2hMultiplierAway = Number(Math.max(0.80, Math.min(1.25, 1.0 - swing)).toFixed(3));
    }

    return {
      matchesCount,
      homeWins,
      draws,
      awayWins,
      homeGoalsAvg,
      awayGoalsAvg,
      h2hMultiplierHome,
      h2hMultiplierAway,
      recentH2H,
    };
  }
}
