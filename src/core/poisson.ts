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
  LeagueStandingEntry,
  LeagueStandingGroup,
  TeamStandingsSnapshot,
  StandingsPredictionContext,
  XGBreakdown,
  TacticalContextBreakdown,
  MostLikelyOutcome,
  DixonColesParams,
  MatchTacticalContextInput,
  ScrapedMarketOdds,
  VolatilityCalibrationContext,
  MonteCarloSimulationSummary,
  ValueBetRecommendation,
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

  private static getStandingsGroups(standings?: LeagueStandingTable | null): LeagueStandingGroup[] {
    if (!standings) return [];
    if (Array.isArray(standings.groups) && standings.groups.length > 0) {
      return standings.groups.filter((g) => Array.isArray(g.table) && g.table.length > 0);
    }
    if (Array.isArray(standings.table) && standings.table.length > 0) {
      return [{ name: 'Standings', table: standings.table }];
    }
    return [];
  }

  private static findTeamStandingsEntry(
    teamName: string,
    groups: LeagueStandingGroup[]
  ): { entry: LeagueStandingEntry; group: LeagueStandingGroup } | null {
    if (!teamName || groups.length === 0) return null;
    let bestScore = 0;
    let bestEntry: LeagueStandingEntry | null = null;
    let bestGroup: LeagueStandingGroup | null = null;

    for (const group of groups) {
      for (const e of group.table) {
        const s = teamMatchScore(teamName, e.teamName);
        if (s > bestScore) {
          bestScore = s;
          bestEntry = e;
          bestGroup = group;
        }
      }
    }

    if (!bestEntry || !bestGroup || bestScore <= 0 || bestEntry.played <= 0) {
      return null;
    }

    return { entry: bestEntry, group: bestGroup };
  }

  public static findMatchedStandingsPair(
    homeTeam: string,
    awayTeam: string,
    standings?: LeagueStandingTable | null
  ): {
    homeMatch: { entry: LeagueStandingEntry; group: LeagueStandingGroup } | null;
    awayMatch: { entry: LeagueStandingEntry; group: LeagueStandingGroup } | null;
  } {
    const groups = this.getStandingsGroups(standings);
    if (groups.length === 0) {
      return { homeMatch: null, awayMatch: null };
    }

    let bestPairScore = 0;
    let sameGroupPair: {
      homeMatch: { entry: LeagueStandingEntry; group: LeagueStandingGroup };
      awayMatch: { entry: LeagueStandingEntry; group: LeagueStandingGroup };
    } | null = null;

    for (const group of groups) {
      let bestHScore = 0;
      let bestHEntry: LeagueStandingEntry | null = null;
      let bestAScore = 0;
      let bestAEntry: LeagueStandingEntry | null = null;

      for (const e of group.table) {
        const hs = teamMatchScore(homeTeam, e.teamName);
        if (hs > bestHScore) {
          bestHScore = hs;
          bestHEntry = e;
        }
        const as = teamMatchScore(awayTeam, e.teamName);
        if (as > bestAScore) {
          bestAScore = as;
          bestAEntry = e;
        }
      }

      if (
        bestHEntry &&
        bestAEntry &&
        bestHScore > 0 &&
        bestAScore > 0 &&
        bestHEntry.played > 0 &&
        bestAEntry.played > 0 &&
        bestHEntry.teamName !== bestAEntry.teamName
      ) {
        const combined = bestHScore + bestAScore;
        if (combined > bestPairScore) {
          bestPairScore = combined;
          sameGroupPair = {
            homeMatch: { entry: bestHEntry, group },
            awayMatch: { entry: bestAEntry, group },
          };
        }
      }
    }

    if (sameGroupPair) {
      return sameGroupPair;
    }

    return {
      homeMatch: this.findTeamStandingsEntry(homeTeam, groups),
      awayMatch: this.findTeamStandingsEntry(awayTeam, groups),
    };
  }

  private static computeGroupAvgGoalsPerGame(rows: LeagueStandingEntry[]): number {
    let totalGF = 0;
    let totalPlayed = 0;
    for (const r of rows) {
      if (r.played > 0 && Number.isFinite(r.goalsFor)) {
        totalGF += r.goalsFor;
        totalPlayed += r.played;
      }
    }
    if (totalPlayed <= 0 || totalGF <= 0) return 0;
    return Math.max(0.65, Math.min(2.50, totalGF / totalPlayed));
  }

  private static buildTeamStandingsSnapshot(
    entry: LeagueStandingEntry,
    group: LeagueStandingGroup,
    volatilityCoefficient = 1.0
  ): TeamStandingsSnapshot {
    const played = Math.max(1, entry.played);
    const totalTeams = Math.max(entry.rank || 1, group.table.length);
    const vL = Math.max(0.75, Math.min(1.35, volatilityCoefficient || 1.0));
    const priorWeight = 6 * vL;
    const reliabilityWeight = Number((played / (played + priorWeight)).toFixed(3));
    return {
      rank: entry.rank,
      totalTeams,
      played,
      won: entry.won,
      drawn: entry.drawn,
      lost: entry.lost,
      goalsFor: entry.goalsFor,
      goalsAgainst: entry.goalsAgainst,
      goalDifference: entry.goalDifference,
      points: entry.points,
      ppg: Number((entry.points / played).toFixed(2)),
      gfPerGame: Number((entry.goalsFor / played).toFixed(2)),
      gaPerGame: Number((entry.goalsAgainst / played).toFixed(2)),
      gdPerGame: Number((entry.goalDifference / played).toFixed(2)),
      form: entry.form && entry.form.length > 0 ? entry.form.slice(0, 5) : undefined,
      zoneCode: entry.zoneCode,
      zoneLabel: entry.zoneLabel,
      groupName: group.name && group.name !== 'Standings' ? group.name : undefined,
      reliabilityWeight,
    };
  }

  private static computeTableFormScore(form?: ('W' | 'D' | 'L')[]): number | null {
    if (!form || form.length === 0) return null;
    let weightedPts = 0;
    let maxWeightedPts = 0;
    for (let i = 0; i < form.length; i++) {
      const w = Math.pow(0.85, i);
      const pts = form[i] === 'W' ? 3 : form[i] === 'D' ? 1 : 0;
      weightedPts += pts * w;
      maxWeightedPts += 3 * w;
    }
    if (maxWeightedPts <= 0) return null;
    return Math.max(0, Math.min(100, (weightedPts / maxWeightedPts) * 100));
  }

  private static classifyZoneStakes(
    snap?: TeamStandingsSnapshot
  ): 'TITLE_OR_QUALIFICATION' | 'PLAYOFF' | 'RELEGATION' | 'NONE' {
    if (!snap || snap.played < 15) return 'NONE';
    const z = (snap.zoneCode || '').toLowerCase();
    const lbl = (snap.zoneLabel || '').toLowerCase();

    if (z.startsWith('r') || lbl.includes('relegat')) {
      return 'RELEGATION';
    }
    if (
      z.startsWith('q') ||
      lbl.includes('champion') ||
      lbl.includes('promot') ||
      lbl.includes('title') ||
      lbl.includes('europa') ||
      lbl.includes('conference')
    ) {
      return 'TITLE_OR_QUALIFICATION';
    }
    if (z.startsWith('p') || lbl.includes('playoff') || lbl.includes('play-off')) {
      return 'PLAYOFF';
    }

    if (snap.totalTeams >= 12 && snap.played >= 20) {
      if (snap.rank <= 3) return 'TITLE_OR_QUALIFICATION';
      if (snap.rank >= snap.totalTeams - 2) return 'RELEGATION';
    }

    return 'NONE';
  }

  private static computeZoneStakesMotivation(
    homeTeam: string,
    awayTeam: string,
    homeSnap?: TeamStandingsSnapshot,
    awaySnap?: TeamStandingsSnapshot
  ): {
    homeMult: number;
    awayMult: number;
    notes: string[];
  } {
    const homeStakes = this.classifyZoneStakes(homeSnap);
    const awayStakes = this.classifyZoneStakes(awaySnap);
    const notes: string[] = [];

    const formatZoneName = (stakes: ReturnType<typeof ApexEngine.classifyZoneStakes>, snap?: TeamStandingsSnapshot) => {
      if (snap?.zoneLabel) return snap.zoneLabel;
      if (stakes === 'RELEGATION') return 'relegation battle';
      if (stakes === 'PLAYOFF') return 'playoff race';
      return 'top qualification race';
    };

    let homeMult = 1.0;
    let awayMult = 1.0;

    if (homeStakes !== 'NONE' && awayStakes === 'NONE' && homeSnap) {
      homeMult = 1.03;
      awayMult = 0.985;
      notes.push(`${homeTeam} (#${homeSnap.rank}/${homeSnap.totalTeams}) motivated for ${formatZoneName(homeStakes, homeSnap)}`);
    } else if (awayStakes !== 'NONE' && homeStakes === 'NONE' && awaySnap) {
      awayMult = 1.03;
      homeMult = 0.985;
      notes.push(`${awayTeam} (#${awaySnap.rank}/${awaySnap.totalTeams}) motivated for ${formatZoneName(awayStakes, awaySnap)}`);
    } else if (homeStakes !== 'NONE' && awayStakes !== 'NONE' && homeSnap && awaySnap) {
      homeMult = 1.015;
      awayMult = 1.015;
      notes.push(`High-stakes clash: #${homeSnap.rank} ${homeTeam} vs #${awaySnap.rank} ${awayTeam}`);
    }

    return {
      homeMult: Math.max(0.96, Math.min(1.04, Number(homeMult.toFixed(3)))),
      awayMult: Math.max(0.96, Math.min(1.04, Number(awayMult.toFixed(3)))),
      notes,
    };
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
    preResolvedRecent?: TeamFormMatch[],
    volatilityCoefficient = 1.0
  ): {
    strengthRating: number;
    formDominance: number;
    tableMomentum: number;
    shotEfficiency: number;
    venueModifier: number;
    recentMatches: TeamFormMatch[];
  } {
    const vL = Math.max(0.75, Math.min(1.35, volatilityCoefficient || 1.0));
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

    // Point B: Early-Season Prior Shrinkage — scale Bayesian prior weight by V_L:
    // Metric_adj = (n * Metric_curr + W_prior * V_L * Metric_prior) / (n + W_prior * V_L)
    const n = recentMatchesList.length;
    const effectiveFormPrior = 5 * vL;
    const rawFormDominance = formWeightTotal > 0 ? (weightedFormSum / formWeightTotal) : 50.0;
    const formDominance = Number(
      (((n * rawFormDominance) + (effectiveFormPrior * 50.0)) / (n + effectiveFormPrior)).toFixed(1)
    );
    const sampleShrink = n / (n + effectiveFormPrior);

    // 2. League Standings & Table Momentum (group-scoped & V_L-adjusted sample-size weighted)
    let hasStandingsEntry = false;
    let standingsReliability = 0;
    let tableMomentum = formDominance;
    const groups = this.getStandingsGroups(standings);
    const matched = this.findTeamStandingsEntry(teamName, groups);

    if (matched) {
      const snap = this.buildTeamStandingsSnapshot(matched.entry, matched.group, vL);
      hasStandingsEntry = true;
      standingsReliability = snap.reliabilityWeight;

      const rankScore =
        snap.totalTeams > 1
          ? Math.max(0, Math.min(100, ((snap.totalTeams - snap.rank) / (snap.totalTeams - 1)) * 100))
          : 50.0;
      const ppgScore = Math.max(0, Math.min(100, (snap.ppg / 3.0) * 100));
      const gdScore = Math.max(0, Math.min(100, 50 + snap.gdPerGame * 20));
      const tableFormScore = this.computeTableFormScore(snap.form);

      const rawMomentum =
        tableFormScore !== null
          ? (0.35 * ppgScore) + (0.30 * rankScore) + (0.20 * gdScore) + (0.15 * tableFormScore)
          : (0.42 * ppgScore) + (0.33 * rankScore) + (0.25 * gdScore);

      // Smoothly shrink early-season table momentum toward match form prior with W_prior * V_L
      tableMomentum = Number(
        (formDominance + (rawMomentum - formDominance) * standingsReliability).toFixed(1)
      );
    }

    // 3. Attacking & Defensive Shot Efficiency (shrunk toward 50 with prior W_prior * V_L)
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

    // 4. Symmetric, Shrunk Venue Modifier around 1.00 (prior scaled by V_L)
    const venueShrink = venueMatchesCount / (venueMatchesCount + 6 * vL);
    let venueModifier = 1.0;
    if (isHomeVenue) {
      const homeRate = venueMatchesCount > 0 ? (venueSuccessCount / venueMatchesCount) : 0.45;
      venueModifier = Number(Math.max(0.95, Math.min(1.06, 1.0 + ((homeRate - 0.45) * 0.14 * venueShrink))).toFixed(3));
    } else {
      const awayRate = venueMatchesCount > 0 ? (venueSuccessCount / venueMatchesCount) : 0.35;
      venueModifier = Number(Math.max(0.94, Math.min(1.06, 1.0 + ((awayRate - 0.35) * 0.14 * venueShrink))).toFixed(3));
    }

    // 5. Composite Team Strength Rating (TSR)
    const tableWeight = hasStandingsEntry ? 0.25 * standingsReliability : 0;
    const formWeight = 0.75 - tableWeight;
    const rawStrength = (formWeight * formDominance) + (tableWeight * tableMomentum) + (0.25 * shotEfficiency);
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
    const rawDiff = homeProfile.strengthRating - awayProfile.strengthRating;
    const dynamicHomeBonus = Math.max(
      0.8,
      Math.min(5.0, (homeAdvantageSetting - 1.0) * 32 * (1 / (1 + Math.exp(-(rawDiff + 8) / 16))))
    );
    const strengthDifference = Number((venueHome + dynamicHomeBonus - venueAway).toFixed(1));

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
   * Multi-pass recency-weighted Augmented Elo ratings across the full match graph.
   * Point A: Scales post-match learning rate inversely by League Volatility Coefficient:
   *   K_effective = K_base / V_L
   */
  public static computeAugmentedEloRatings(
    allMatches: HistoricalMatch[],
    getVolatility?: (div?: string, leagueName?: string) => number
  ): Map<string, number> {
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
      const rawVl = getVolatility ? getVolatility(m.div, m.leagueName) : 1.0;
      const volatility = Math.max(0.75, Math.min(1.35, Number.isFinite(rawVl) ? rawVl : 1.0));
      return {
        hKey: m.homeTeam.toLowerCase().trim(),
        aKey: m.awayTeam.toLowerCase().trim(),
        actualHome: m.ftr === 'H' ? 1.0 : m.ftr === 'D' ? 0.5 : 0.0,
        marginMult,
        recency,
        volatility,
      };
    });

    for (const baseK of passKs) {
      for (let i = 0; i < precomputed.length; i++) {
        const item = precomputed[i];
        const hElo = ratings.get(item.hKey) ?? 1500;
        const aElo = ratings.get(item.aKey) ?? 1500;

        const effectiveK = baseK / item.volatility;
        const expHome = 1 / (1 + Math.pow(10, (aElo - (hElo + 55)) / 400));
        const delta = effectiveK * item.marginMult * item.recency * (item.actualHome - expHome);

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
  // VOLATILITY CALIBRATION HELPERS (POINTS C & D)
  // =========================================================================

  /**
   * Point C: Post-Processing Probability Calibration (Temperature Scaling)
   * P_calibrated_i = exp(log(P_raw_i) / T) / sum_j exp(log(P_raw_j) / T), where T = V_L ^ alpha
   */
  public static applyTemperatureScaling(
    homeWinRaw: number,
    drawRaw: number,
    awayWinRaw: number,
    volatilityCoefficient = 1.0,
    alpha = 1.0
  ): {
    homeWinProb: number;
    drawProb: number;
    awayWinProb: number;
    temperature: number;
  } {
    const vL = Math.max(0.75, Math.min(1.35, Number.isFinite(volatilityCoefficient) ? volatilityCoefficient : 1.0));
    const safeAlpha = Math.max(0.5, Math.min(1.5, Number.isFinite(alpha) ? alpha : 1.0));
    const temperature = Math.pow(vL, safeAlpha);

    const eps = 1e-6;
    const raw = [
      Math.max(eps, homeWinRaw),
      Math.max(eps, drawRaw),
      Math.max(eps, awayWinRaw),
    ];
    const scaledLogits = raw.map((p) => Math.log(p) / temperature);
    const maxLogit = Math.max(scaledLogits[0], scaledLogits[1], scaledLogits[2]);
    const exps = scaledLogits.map((l) => Math.exp(l - maxLogit));
    const sumExp = exps[0] + exps[1] + exps[2] || 1.0;

    return {
      homeWinProb: exps[0] / sumExp,
      drawProb: exps[1] / sumExp,
      awayWinProb: exps[2] / sumExp,
      temperature: Number(temperature.toFixed(4)),
    };
  }

  private static createSeededRng(seedStr: string): () => number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h += 0x6d2b79f5;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private static sampleStandardNormal(rng: () => number): number {
    const u1 = Math.max(1e-9, rng());
    const u2 = rng();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  /**
   * Marsaglia-Tsang Gamma(shape, scale) sampler with mean = mu and std = sigma
   */
  private static sampleGammaMeanStd(mu: number, sigma: number, rng: () => number): number {
    const safeMu = Math.max(0.05, mu);
    if (sigma <= 1e-4) return safeMu;
    const variance = sigma * sigma;
    const shape = (safeMu * safeMu) / variance;
    const scale = variance / safeMu;

    if (shape < 1) {
      const u = Math.max(1e-9, rng());
      return this.sampleGammaMeanStd(safeMu * (shape + 1) / shape, sigma, rng) * Math.pow(u, 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (let attempt = 0; attempt < 16; attempt++) {
      const x = this.sampleStandardNormal(rng);
      const vBase = 1 + c * x;
      if (vBase <= 0) continue;
      const v = vBase * vBase * vBase;
      const u = Math.max(1e-9, rng());
      if (u < 1 - 0.0331 * x * x * x * x) return Math.max(0.05, d * v * scale);
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return Math.max(0.05, d * v * scale);
    }
    return safeMu;
  }

  private static samplePoisson(lambda: number, rng: () => number): number {
    const l = Math.max(0.01, Math.min(12.0, lambda));
    const L = Math.exp(-l);
    let k = 0;
    let p = 1.0;
    do {
      k++;
      p *= Math.max(1e-12, rng());
    } while (p > L && k < 15);
    return k - 1;
  }

  /**
   * Point D: Competition-variance Monte Carlo Match Simulation.
   * Samples λ_sim ~ Gamma(μ = λ_pred, σ = σ_base * V_L) before Poisson scoreline realization.
   */
  public static simulateMatchMonteCarlo(
    homeLambda: number,
    awayMu: number,
    volatilityCoefficient = 1.0,
    options?: {
      iterations?: number;
      sigmaBase?: number;
      seedKey?: string;
    }
  ): MonteCarloSimulationSummary {
    const vL = Math.max(0.75, Math.min(1.35, volatilityCoefficient || 1.0));
    const sigmaBase = Math.max(0.05, Math.min(0.6, options?.sigmaBase ?? 0.22));
    const sigmaEffective = Number((sigmaBase * vL).toFixed(4));
    const iterations = Math.max(50, Math.min(10000, Math.round(options?.iterations ?? 400)));
    const rng = this.createSeededRng(
      options?.seedKey || `${homeLambda.toFixed(3)}_${awayMu.toFixed(3)}_${vL.toFixed(3)}`
    );

    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    let over25 = 0;
    let btts = 0;
    const hLambdas = new Array<number>(iterations);
    const aMus = new Array<number>(iterations);

    for (let i = 0; i < iterations; i++) {
      const hSimLambda = this.sampleGammaMeanStd(homeLambda, sigmaEffective, rng);
      const aSimMu = this.sampleGammaMeanStd(awayMu, sigmaEffective, rng);
      hLambdas[i] = hSimLambda;
      aMus[i] = aSimMu;

      const hg = this.samplePoisson(hSimLambda, rng);
      const ag = this.samplePoisson(aSimMu, rng);
      if (hg > ag) homeWins++;
      else if (hg === ag) draws++;
      else awayWins++;
      if (hg + ag >= 3) over25++;
      if (hg > 0 && ag > 0) btts++;
    }

    hLambdas.sort((a, b) => a - b);
    aMus.sort((a, b) => a - b);
    const pct = (arr: number[], q: number) =>
      Number(arr[Math.min(arr.length - 1, Math.max(0, Math.floor((arr.length - 1) * q)))].toFixed(2));

    return {
      iterations,
      sigmaEffective,
      homeWinProb: Number((homeWins / iterations).toFixed(3)),
      drawProb: Number((draws / iterations).toFixed(3)),
      awayWinProb: Number((awayWins / iterations).toFixed(3)),
      over25Prob: Number((over25 / iterations).toFixed(3)),
      bttsProb: Number((btts / iterations).toFixed(3)),
      homeGoalsP10: pct(hLambdas, 0.1),
      homeGoalsP50: pct(hLambdas, 0.5),
      homeGoalsP90: pct(hLambdas, 0.9),
      awayGoalsP10: pct(aMus, 0.1),
      awayGoalsP50: pct(aMus, 0.5),
      awayGoalsP90: pct(aMus, 0.9),
    };
  }

  /**
   * Point D: Monte Carlo Season Simulator using σ_effective = σ_base * V_L match variance shocks.
   */
  public static simulateSeasonMonteCarlo(
    scheduledFixtures: Array<{ homeTeam: string; awayTeam: string; homeLambda: number; awayMu: number }>,
    volatilityCoefficient = 1.0,
    options?: {
      simulations?: number;
      sigmaBase?: number;
      seedKey?: string;
    }
  ): Array<{
    team: string;
    avgPoints: number;
    pointsStdDev: number;
    titleWinProb: number;
    top4Prob: number;
    bottom3Prob: number;
  }> {
    const vL = Math.max(0.75, Math.min(1.35, volatilityCoefficient || 1.0));
    const sigmaBase = Math.max(0.05, Math.min(0.6, options?.sigmaBase ?? 0.22));
    const sigmaEff = sigmaBase * vL;
    const sims = Math.max(20, Math.min(2000, Math.round(options?.simulations ?? 250)));
    const rng = this.createSeededRng(options?.seedKey || `season_${vL.toFixed(3)}_${scheduledFixtures.length}`);

    const teamNamesSet = new Set<string>();
    for (const f of scheduledFixtures) {
      teamNamesSet.add(f.homeTeam);
      teamNamesSet.add(f.awayTeam);
    }
    const teams = Array.from(teamNamesSet);
    if (teams.length === 0) return [];

    const ptsSamples = new Map<string, number[]>(teams.map((t) => [t, []]));
    const titleCounts = new Map<string, number>(teams.map((t) => [t, 0]));
    const top4Counts = new Map<string, number>(teams.map((t) => [t, 0]));
    const bottom3Counts = new Map<string, number>(teams.map((t) => [t, 0]));

    for (let s = 0; s < sims; s++) {
      const tablePts = new Map<string, number>(teams.map((t) => [t, 0]));
      const tableGd = new Map<string, number>(teams.map((t) => [t, 0]));

      for (const f of scheduledFixtures) {
        const hLam = this.sampleGammaMeanStd(f.homeLambda, sigmaEff, rng);
        const aMu = this.sampleGammaMeanStd(f.awayMu, sigmaEff, rng);
        const hg = this.samplePoisson(hLam, rng);
        const ag = this.samplePoisson(aMu, rng);

        tableGd.set(f.homeTeam, (tableGd.get(f.homeTeam) || 0) + (hg - ag));
        tableGd.set(f.awayTeam, (tableGd.get(f.awayTeam) || 0) + (ag - hg));
        if (hg > ag) {
          tablePts.set(f.homeTeam, (tablePts.get(f.homeTeam) || 0) + 3);
        } else if (ag > hg) {
          tablePts.set(f.awayTeam, (tablePts.get(f.awayTeam) || 0) + 3);
        } else {
          tablePts.set(f.homeTeam, (tablePts.get(f.homeTeam) || 0) + 1);
          tablePts.set(f.awayTeam, (tablePts.get(f.awayTeam) || 0) + 1);
        }
      }

      const ranked = [...teams].sort((a, b) => {
        const pDiff = (tablePts.get(b) || 0) - (tablePts.get(a) || 0);
        if (pDiff !== 0) return pDiff;
        return (tableGd.get(b) || 0) - (tableGd.get(a) || 0);
      });

      ranked.forEach((team, idx) => {
        ptsSamples.get(team)!.push(tablePts.get(team) || 0);
        if (idx === 0) titleCounts.set(team, (titleCounts.get(team) || 0) + 1);
        if (idx < 4) top4Counts.set(team, (top4Counts.get(team) || 0) + 1);
        if (idx >= Math.max(0, ranked.length - 3)) bottom3Counts.set(team, (bottom3Counts.get(team) || 0) + 1);
      });
    }

    return teams
      .map((team) => {
        const arr = ptsSamples.get(team)!;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / arr.length;
        return {
          team,
          avgPoints: Number(mean.toFixed(1)),
          pointsStdDev: Number(Math.sqrt(variance).toFixed(2)),
          titleWinProb: Number(((titleCounts.get(team) || 0) / sims).toFixed(3)),
          top4Prob: Number(((top4Counts.get(team) || 0) / sims).toFixed(3)),
          bottom3Prob: Number(((bottom3Counts.get(team) || 0) / sims).toFixed(3)),
        };
      })
      .sort((a, b) => b.avgPoints - a.avgPoints);
  }

  // =========================================================================
  // PILLAR 4: BIVARIATE DIXON-COLES GOAL MODEL & PROBABILITY CALCULATION
  // =========================================================================

  /**
   * Generates a complete match probability prediction using the full Evidence-Based framework:
   * - Opponent-adjusted xG created/conceded over 5-10 matches
   * - Augmented Elo Ratings dampened by League Volatility Coefficient (K / V_L)
   * - Early-season prior shrinkage scaled by V_L
   * - Tactical context & rest day adjustments
   * - Bivariate Dixon-Coles goal model with low-scoring correlation correction (ρ = -0.11)
   * - Post-processing Temperature Scaling (T = V_L ^ α)
   * - Monte Carlo variance simulation (σ = σ_base * V_L)
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
    marketOdds?: ScrapedMarketOdds | null,
    volatilityConfig?: {
      leagueId?: string;
      leagueName?: string;
      volatilityCoefficient?: number;
      temperatureAlpha?: number;
      isFallback?: boolean;
    }
  ): { prediction: PoissonPrediction; homeStats: TeamStatsSummary; awayStats: TeamStatsSummary } {
    const historicalUniverse = allHistoricalMatches && allHistoricalMatches.length > 0
      ? allHistoricalMatches
      : leagueHistoricalMatches;

    const vL = Math.max(
      0.75,
      Math.min(1.35, Number.isFinite(volatilityConfig?.volatilityCoefficient) ? volatilityConfig!.volatilityCoefficient! : 1.0)
    );
    const alpha = Math.max(
      0.5,
      Math.min(1.5, Number.isFinite(volatilityConfig?.temperatureAlpha ?? settings?.volatilityTemperatureAlpha)
        ? (volatilityConfig?.temperatureAlpha ?? settings?.volatilityTemperatureAlpha ?? 1.0)
        : 1.0)
    );

    // 1. Augmented Elo Ratings (augment with realScrapedH2H if override lacks either team)
    let eloRatingsMap =
      eloRatingsMapOverride || this.computeAugmentedEloRatings(historicalUniverse, () => vL);
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
      eloRatingsMap = this.computeAugmentedEloRatings(augmented, () => vL);
      homeElo = this.getTeamElo(homeTeam, eloRatingsMap);
      awayElo = this.getTeamElo(awayTeam, eloRatingsMap);
    }

    const eloDiffRaw = homeElo - awayElo;
    // Dynamic Home Advantage scaled by Elo gap:
    // When homeElo < awayElo (e.g. visiting top-flight favorite), home advantage dampens down towards 15
    // When homeElo >= awayElo, home advantage is full (up to 60)
    const homeAdvantageElo = Math.max(15, Math.min(60, Math.round(50 + eloDiffRaw * 0.08)));
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
      homeSeasonRecent,
      vL
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
      awaySeasonRecent,
      vL
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

    // 3. Team News & Tactical Context + Group-Scoped League Standings Context
    const baseTacticalContext = this.computeTacticalAdjustments(homeTeam, awayTeam, tacticalInput);
    const { homeMatch: homeStandingsMatch, awayMatch: awayStandingsMatch } = this.findMatchedStandingsPair(
      homeTeam,
      awayTeam,
      standings
    );
    const homeSnap = homeStandingsMatch
      ? this.buildTeamStandingsSnapshot(homeStandingsMatch.entry, homeStandingsMatch.group, vL)
      : undefined;
    const awaySnap = awayStandingsMatch
      ? this.buildTeamStandingsSnapshot(awayStandingsMatch.entry, awayStandingsMatch.group, vL)
      : undefined;

    const motivation = this.computeZoneStakesMotivation(homeTeam, awayTeam, homeSnap, awaySnap);
    const tacticalNotes = [...baseTacticalContext.tacticalNotes, ...motivation.notes];
    const tacticalContext: TacticalContextBreakdown = {
      ...baseTacticalContext,
      fatigueAdjustmentHome: Math.max(
        0.88,
        Math.min(1.12, Number((baseTacticalContext.fatigueAdjustmentHome * motivation.homeMult).toFixed(3)))
      ),
      fatigueAdjustmentAway: Math.max(
        0.88,
        Math.min(1.12, Number((baseTacticalContext.fatigueAdjustmentAway * motivation.awayMult).toFixed(3)))
      ),
      tacticalNotes,
    };

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

    // Compute recency-weighted H2H multipliers capped strictly at [0.94, 1.06] (±6% max)
    let h2hMultiplierHome = Math.max(0.94, Math.min(1.06, h2h.h2hMultiplierHome ?? 1.0));
    let h2hMultiplierAway = Math.max(0.94, Math.min(1.06, h2h.h2hMultiplierAway ?? 1.0));
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
        // Capped to ±6% max swing to prevent historical anomalies from overpowering current team quality
        const swing = (wDiff / wTot) * 0.04 + (wGoals / wTot) * 0.02;
        h2hMultiplierHome = Number(Math.max(0.94, Math.min(1.06, 1.0 + swing)).toFixed(3));
        h2hMultiplierAway = Number(Math.max(0.94, Math.min(1.06, 1.0 - swing)).toFixed(3));
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

    // 5. Dixon-Coles Expected Goals (λ and μ) with V_L-scaled Bayesian small-sample prior shrinkage
    const effectiveGoalPriorWeight = 10 * vL;
    const hShrink = homeXGProfile.rollingMatchesCount / (homeXGProfile.rollingMatchesCount + effectiveGoalPriorWeight);
    const aShrink = awayXGProfile.rollingMatchesCount / (awayXGProfile.rollingMatchesCount + effectiveGoalPriorWeight);

    let homeAttackPower = homeXGProfile.rollingMatchesCount > 0
      ? 1.0 + ((homeXGProfile.adjustedXG / leagueHomeAvg) - 1.0) * hShrink
      : 1.0;
    let awayDefensePower = awayXGProfile.rollingMatchesCount > 0
      ? 1.0 + ((awayXGProfile.adjustedXGA / leagueHomeAvg) - 1.0) * aShrink
      : 1.0;
    let awayAttackPower = awayXGProfile.rollingMatchesCount > 0
      ? 1.0 + ((awayXGProfile.adjustedXG / leagueAwayAvg) - 1.0) * aShrink
      : 1.0;
    let homeDefensePower = homeXGProfile.rollingMatchesCount > 0
      ? 1.0 + ((homeXGProfile.adjustedXGA / leagueAwayAvg) - 1.0) * hShrink
      : 1.0;

    // Gentle Elo rate factor (avoids double-counting with opponent-adjusted xG)
    const eloPureDiff = homeElo - awayElo;
    const eloMultiplierHome = Math.max(0.65, Math.min(1.55, Math.pow(10, eloPureDiff / 1300)));
    const eloMultiplierAway = Math.max(0.65, Math.min(1.55, Math.pow(10, -eloPureDiff / 1300)));

    // Dynamic venue scaling based on Elo differential
    const baseHomeAdvantage = settings?.homeAdvantageFactor || 1.12;
    const venueRatio = Math.sqrt((homeCSF.venueModifier || 1.0) / Math.max(0.85, awayCSF.venueModifier || 1.0));
    const eloAdvantageScale = 1.0 / (1.0 + Math.exp(-(eloPureDiff + 50) / 120));
    const dynamicHomeAdvantageFactor = 1.01 + (baseHomeAdvantage - 0.99) * Math.max(0.18, Math.min(1.15, eloAdvantageScale * 1.35));
    const effectiveHomeAdvantage = Number(Math.max(1.02, Math.min(1.22, dynamicHomeAdvantageFactor * venueRatio)).toFixed(3));
    const effectiveAwayBaseline = Number(Math.max(0.94, Math.min(1.04, 0.96 + (awayElo > homeElo ? Math.min(0.06, (awayElo - homeElo) / 2000) : 0))).toFixed(3));

    const preStandingsHomeLambda =
      leagueHomeAvg *
      Math.pow(Math.max(0.25, homeAttackPower * awayDefensePower), 0.55) *
      effectiveHomeAdvantage *
      eloMultiplierHome *
      baseTacticalContext.fatigueAdjustmentHome *
      h2hMultiplierHome;

    const preStandingsAwayMu =
      leagueAwayAvg *
      Math.pow(Math.max(0.25, awayAttackPower * homeDefensePower), 0.55) *
      effectiveAwayBaseline *
      eloMultiplierAway *
      baseTacticalContext.fatigueAdjustmentAway *
      h2hMultiplierAway;

    // Standings Attack & Defense Anchoring (season GF/MP and GA/MP relative to table/group average)
    const homeGroupAvg = homeStandingsMatch ? this.computeGroupAvgGoalsPerGame(homeStandingsMatch.group.table) : 0;
    const awayGroupAvg = awayStandingsMatch ? this.computeGroupAvgGoalsPerGame(awayStandingsMatch.group.table) : 0;
    let attackAnchorHome = 1.0;
    let defenseAnchorHome = 1.0;
    let attackAnchorAway = 1.0;
    let defenseAnchorAway = 1.0;

    if (homeSnap && homeGroupAvg > 0) {
      attackAnchorHome = Number(Math.max(0.55, Math.min(1.85, homeSnap.gfPerGame / homeGroupAvg)).toFixed(3));
      defenseAnchorHome = Number(Math.max(0.55, Math.min(1.85, homeSnap.gaPerGame / homeGroupAvg)).toFixed(3));
      const hTableBlend = 0.55 * homeSnap.reliabilityWeight;
      homeAttackPower = (1 - hTableBlend) * homeAttackPower + hTableBlend * attackAnchorHome;
      homeDefensePower = (1 - hTableBlend) * homeDefensePower + hTableBlend * defenseAnchorHome;
    }

    if (awaySnap && awayGroupAvg > 0) {
      attackAnchorAway = Number(Math.max(0.55, Math.min(1.85, awaySnap.gfPerGame / awayGroupAvg)).toFixed(3));
      defenseAnchorAway = Number(Math.max(0.55, Math.min(1.85, awaySnap.gaPerGame / awayGroupAvg)).toFixed(3));
      const aTableBlend = 0.55 * awaySnap.reliabilityWeight;
      awayAttackPower = (1 - aTableBlend) * awayAttackPower + aTableBlend * attackAnchorAway;
      awayDefensePower = (1 - aTableBlend) * awayDefensePower + aTableBlend * defenseAnchorAway;
    }

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

    const standingsContext: StandingsPredictionContext | undefined =
      standings && (homeSnap || awaySnap)
        ? {
            leagueCode: standings.leagueCode,
            leagueName: standings.leagueName,
            season: standings.season,
            groupName:
              homeSnap?.groupName && awaySnap?.groupName && homeSnap.groupName === awaySnap.groupName
                ? homeSnap.groupName
                : homeSnap?.groupName || awaySnap?.groupName,
            home: homeSnap,
            away: awaySnap,
            tableAvgGoalsPerGame: Number(
              ((homeGroupAvg || awayGroupAvg || (leagueHomeAvg + leagueAwayAvg) / 2)).toFixed(2)
            ),
            attackAnchorHome,
            defenseAnchorHome,
            attackAnchorAway,
            defenseAnchorAway,
            motivationMultiplierHome: motivation.homeMult,
            motivationMultiplierAway: motivation.awayMult,
            xgDeltaPercentHome:
              preStandingsHomeLambda > 0
                ? Number((((homeLambda - preStandingsHomeLambda) / preStandingsHomeLambda) * 100).toFixed(1))
                : undefined,
            xgDeltaPercentAway:
              preStandingsAwayMu > 0
                ? Number((((awayMu - preStandingsAwayMu) / preStandingsAwayMu) * 100).toFixed(1))
                : undefined,
            rankDiff: homeSnap && awaySnap ? Math.abs(homeSnap.rank - awaySnap.rank) : undefined,
            pointsDiff: homeSnap && awaySnap ? Math.abs(homeSnap.points - awaySnap.points) : undefined,
            ppgDiff:
              homeSnap && awaySnap
                ? Number(Math.abs((homeSnap.ppg ?? 0) - (awaySnap.ppg ?? 0)).toFixed(2))
                : undefined,
          }
        : undefined;

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

    // Coherent blend: Dixon-Coles primary + Elo + CSF (raises CSF/Standings share when both teams have reliable table samples)
    const avgStandingsRel =
      homeSnap && awaySnap ? (homeSnap.reliabilityWeight + awaySnap.reliabilityWeight) / 2 : 0;
    const csfWeight = avgStandingsRel >= 0.4 ? 0.18 : 0.10;
    const eloWeight = 0.14;
    const dcWeight = 1.0 - eloWeight - csfWeight;

    let finalHomeWin = (dcWeight * homeWinProbRaw) + (eloWeight * eloExpectancy.homeWinProb) + (csfWeight * csfExpectancy.homeWinExpectancy);
    let finalDraw = (dcWeight * drawProbRaw) + (eloWeight * eloExpectancy.drawProb) + (csfWeight * csfExpectancy.drawExpectancy);
    let finalAwayWin = (dcWeight * awayWinProbRaw) + (eloWeight * eloExpectancy.awayWinProb) + (csfWeight * csfExpectancy.awayWinExpectancy);

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

    // Point C: Post-Processing Probability Calibration (Temperature Scaling T = V_L ^ alpha)
    const calibrated1X2 = this.applyTemperatureScaling(finalHomeWin, finalDraw, finalAwayWin, vL, alpha);
    finalHomeWin = calibrated1X2.homeWinProb;
    finalDraw = calibrated1X2.drawProb;
    finalAwayWin = calibrated1X2.awayWinProb;

    // Structural Favorite Preservation Safeguard:
    // Prevent venue or volatility calibration from inverting clear structural favorites (Elo difference > 150 or PPG gap > 0.50)
    if ((awayElo - homeElo > 150) || (awaySnap && homeSnap && (awaySnap.ppg ?? 0) - (homeSnap.ppg ?? 0) > 0.50)) {
      if (finalHomeWin >= finalAwayWin) {
        const minGap = 0.05;
        const adjustedAway = Math.max(finalAwayWin, finalHomeWin + minGap);
        const diff = adjustedAway - finalAwayWin;
        finalAwayWin = adjustedAway;
        finalHomeWin = Math.max(0.12, finalHomeWin - diff * 0.7);
        finalDraw = Math.max(0.18, finalDraw - diff * 0.3);
        const norm = finalHomeWin + finalDraw + finalAwayWin;
        finalHomeWin /= norm;
        finalDraw /= norm;
        finalAwayWin /= norm;
      }
    } else if ((homeElo - awayElo > 150) || (homeSnap && awaySnap && (homeSnap.ppg ?? 0) - (awaySnap.ppg ?? 0) > 0.50)) {
      if (finalAwayWin >= finalHomeWin) {
        const minGap = 0.05;
        const adjustedHome = Math.max(finalHomeWin, finalAwayWin + minGap);
        const diff = adjustedHome - finalHomeWin;
        finalHomeWin = adjustedHome;
        finalAwayWin = Math.max(0.12, finalAwayWin - diff * 0.7);
        finalDraw = Math.max(0.18, finalDraw - diff * 0.3);
        const norm = finalHomeWin + finalDraw + finalAwayWin;
        finalHomeWin /= norm;
        finalDraw /= norm;
        finalAwayWin /= norm;
      }
    }

    // Point D: Competition-variance Monte Carlo Match Simulation (sigma = sigma_base * V_L)
    const sigmaBase = settings?.monteCarloSigmaBase ?? 0.22;
    const monteCarlo = this.simulateMatchMonteCarlo(homeLambda, awayMu, vL, {
      iterations: 350,
      sigmaBase,
      seedKey: `${homeTeam}_${awayTeam}_${volatilityConfig?.leagueId || ''}`,
    });

    const minEvBase = settings?.minEvBase ?? 0.03;
    const kellyBase = settings?.kellyBaseFraction ?? 0.25;
    const volatilityContext: VolatilityCalibrationContext = {
      leagueId: volatilityConfig?.leagueId || standings?.leagueCode || 'DEFAULT',
      leagueName: volatilityConfig?.leagueName || standings?.leagueName,
      volatilityCoefficient: Number(vL.toFixed(3)),
      temperatureAlpha: Number(alpha.toFixed(3)),
      temperature: calibrated1X2.temperature,
      effectiveEloKs: [32, 24, 16].map((k) => Number((k / vL).toFixed(2))),
      effectivePriorWeight: Number(effectiveGoalPriorWeight.toFixed(2)),
      monteCarloSigma: monteCarlo.sigmaEffective,
      minEvThreshold: Number((minEvBase * vL).toFixed(4)),
      kellyFraction: Number((kellyBase / vL).toFixed(4)),
      isFallback: volatilityConfig?.isFallback ?? (vL === 1.0 && !volatilityConfig?.leagueId),
    };

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
      standingsContext,
      dixonColesParams,
      marketOdds: marketOdds || undefined,
      volatilityContext,
      monteCarlo,
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
    awayTeam: string,
    marketOddsOverride?: ScrapedMarketOdds | null
  ): {
    markets: MarketOption[];
    mostLikelyOutcome?: MostLikelyOutcome;
    bestValueBet?: ValueBetRecommendation;
  } {
    const markets: MarketOption[] = [];

    // Point E: Downstream Risk & Staking Filter scaled by V_L
    const vL = Math.max(
      0.75,
      Math.min(1.35, prediction.volatilityContext?.volatilityCoefficient ?? 1.0)
    );
    const minEvBase = settings?.minEvBase ?? 0.03;
    const kellyBase = settings?.kellyBaseFraction ?? 0.25;
    const minEvEffective = Number((minEvBase * vL).toFixed(4));
    const kellyFractionEffective = Number((kellyBase / vL).toFixed(4));

    const oddsObj = marketOddsOverride || prediction.marketOdds;
    const lookupMarketDecimalOdds = (key: MarketOption['key']): number | undefined => {
      if (!oddsObj) return undefined;
      switch (key) {
        case 'HOME_WIN': return oddsObj.homeOdds;
        case 'DRAW': return oddsObj.drawOdds;
        case 'AWAY_WIN': return oddsObj.awayOdds;
        case 'DOUBLE_CHANCE_1X': return oddsObj.dc1XOdds;
        case 'DOUBLE_CHANCE_12': return oddsObj.dc12Odds;
        case 'DOUBLE_CHANCE_X2': return oddsObj.dcX2Odds;
        case 'OVER_15': return oddsObj.over15Odds;
        case 'UNDER_15': return oddsObj.under15Odds;
        case 'OVER_25': return oddsObj.over25Odds;
        case 'UNDER_25': return oddsObj.under25Odds;
        case 'OVER_35': return oddsObj.over35Odds;
        case 'UNDER_35': return oddsObj.under35Odds;
        case 'BTTS_YES': return oddsObj.bttsYesOdds;
        case 'BTTS_NO': return oddsObj.bttsNoOdds;
        default: return undefined;
      }
    };

    let bestValueBet: ValueBetRecommendation | undefined;

    const addMarket = (
      key: MarketOption['key'],
      name: string,
      prob: number
    ) => {
      const isBanker = prob >= (settings.safeWinThreshold || 0.70);
      const decOdds = lookupMarketDecimalOdds(key);
      let evEdge: number | undefined;
      let isPositiveEV: boolean | undefined;
      let kellyStakeFraction: number | undefined;

      if (decOdds && decOdds > 1.01) {
        evEdge = Number((prob * decOdds - 1).toFixed(4));
        isPositiveEV = evEdge >= minEvEffective;
        const b = decOdds - 1;
        const fullKelly = Math.max(0, (prob * b - (1 - prob)) / b);
        kellyStakeFraction = isPositiveEV
          ? Number(Math.min(0.25, fullKelly * kellyFractionEffective).toFixed(4))
          : 0;

        if (isPositiveEV && (!bestValueBet || evEdge > bestValueBet.evEdge)) {
          bestValueBet = {
            key,
            name,
            probability: prob,
            marketOdds: decOdds,
            evEdge,
            minEvRequired: minEvEffective,
            kellyFraction: kellyStakeFraction,
          };
        }
      }

      markets.push({
        key,
        name,
        probability: prob,
        isBanker,
        marketOdds: decOdds && decOdds > 1.01 ? decOdds : undefined,
        evEdge,
        minEvThreshold: decOdds && decOdds > 1.01 ? minEvEffective : undefined,
        isPositiveEV,
        kellyStakeFraction,
      });
    };

    // 1X2 Match Outcomes
    addMarket('HOME_WIN', `${homeTeam} to Win`, prediction.homeWinProb);
    addMarket('DRAW', 'Draw', prediction.drawProb);
    addMarket('AWAY_WIN', `${awayTeam} to Win`, prediction.awayWinProb);

    // Double Chance
    const dc1XProb = Number(Math.min(0.99, prediction.homeWinProb + prediction.drawProb).toFixed(3));
    addMarket('DOUBLE_CHANCE_1X', `${homeTeam} or Draw (1X)`, dc1XProb);

    const dcX2Prob = Number(Math.min(0.99, prediction.awayWinProb + prediction.drawProb).toFixed(3));
    addMarket('DOUBLE_CHANCE_X2', `Draw or ${awayTeam} (X2)`, dcX2Prob);

    const dc12Prob = Number(Math.min(0.99, prediction.homeWinProb + prediction.awayWinProb).toFixed(3));
    addMarket('DOUBLE_CHANCE_12', `${homeTeam} or ${awayTeam} (12)`, dc12Prob);

    // Draw No Bet (DNB)
    const dnbSum = prediction.homeWinProb + prediction.awayWinProb || 1.0;
    const dnbHomeProb = Number((prediction.homeWinProb / dnbSum).toFixed(3));
    const dnbAwayProb = Number((prediction.awayWinProb / dnbSum).toFixed(3));
    addMarket('DNB_HOME', `Draw No Bet - ${homeTeam}`, dnbHomeProb);
    addMarket('DNB_AWAY', `Draw No Bet - ${awayTeam}`, dnbAwayProb);

    // Derive exact goal & combo probabilities from Poisson probabilityMatrix
    const over15 = prediction.over15Prob ?? 0.75;
    const over35 = prediction.over35Prob ?? 0.25;
    const mat = prediction.probabilityMatrix;

    let over05 = 0;
    let over45 = 0;
    let homeOver05 = 0, homeOver15 = 0, homeOver25 = 0;
    let awayOver05 = 0, awayOver15 = 0, awayOver25 = 0;
    let goalsOdd = 0;
    let homeCleanSheet = 0, awayCleanSheet = 0;
    let homeWinToNil = 0, awayWinToNil = 0;
    let hMinus1 = 0, aMinus1 = 0;
    let mg13 = 0, mg24 = 0, mg25 = 0;
    let c1O15 = 0, c2O15 = 0, c1O25 = 0, c2O25 = 0, c1O35 = 0, c2O35 = 0;
    let c1U25 = 0, c2U25 = 0, c1U35 = 0, c2U35 = 0;
    let cXU25 = 0, cXO15 = 0, cXBtts = 0;
    let c1XO15 = 0, cX2O15 = 0, c12O15 = 0;
    let c1XO25 = 0, cX2O25 = 0, c12O25 = 0;
    let c1XU25 = 0, cX2U25 = 0, c1XU35 = 0, cX2U35 = 0, c12U35 = 0;
    let c1XBtts = 0, cX2Btts = 0, c12Btts = 0;
    let cBttsO25 = 0, cBttsO35 = 0, cBttsU35 = 0, cBttsNoU25 = 0;
    let c1Btts = 0, c2Btts = 0;

    if (mat && Array.isArray(mat) && mat.length > 0) {
      for (let h = 0; h < mat.length; h++) {
        if (!Array.isArray(mat[h])) continue;
        for (let a = 0; a < mat[h].length; a++) {
          const p = mat[h][a] || 0;
          const tot = h + a;
          const bothScored = h > 0 && a > 0;
          if (tot >= 1) over05 += p;
          if (tot >= 5) over45 += p;
          if (h >= 1) homeOver05 += p;
          if (h >= 2) homeOver15 += p;
          if (h >= 3) homeOver25 += p;
          if (a >= 1) awayOver05 += p;
          if (a >= 2) awayOver15 += p;
          if (a >= 3) awayOver25 += p;
          if (tot % 2 === 1) goalsOdd += p;
          if (a === 0) homeCleanSheet += p;
          if (h === 0) awayCleanSheet += p;
          if (h > a && a === 0) homeWinToNil += p;
          if (a > h && h === 0) awayWinToNil += p;
          if (h - a >= 2) hMinus1 += p;
          if (a - h >= 2) aMinus1 += p;
          if (tot >= 1 && tot <= 3) mg13 += p;
          if (tot >= 2 && tot <= 4) mg24 += p;
          if (tot >= 2 && tot <= 5) mg25 += p;

          if (h > a && tot >= 2) c1O15 += p;
          if (a > h && tot >= 2) c2O15 += p;
          if (h > a && tot >= 3) c1O25 += p;
          if (a > h && tot >= 3) c2O25 += p;
          if (h > a && tot >= 4) c1O35 += p;
          if (a > h && tot >= 4) c2O35 += p;
          if (h > a && tot <= 2) c1U25 += p;
          if (a > h && tot <= 2) c2U25 += p;
          if (h > a && tot <= 3) c1U35 += p;
          if (a > h && tot <= 3) c2U35 += p;
          if (h === a && tot <= 2) cXU25 += p;
          if (h === a && tot >= 2) cXO15 += p;
          if (h === a && bothScored) cXBtts += p;

          if (h >= a && tot >= 2) c1XO15 += p;
          if (a >= h && tot >= 2) cX2O15 += p;
          if (h !== a && tot >= 2) c12O15 += p;
          if (h >= a && tot >= 3) c1XO25 += p;
          if (a >= h && tot >= 3) cX2O25 += p;
          if (h !== a && tot >= 3) c12O25 += p;
          if (h >= a && tot <= 2) c1XU25 += p;
          if (a >= h && tot <= 2) cX2U25 += p;
          if (h >= a && tot <= 3) c1XU35 += p;
          if (a >= h && tot <= 3) cX2U35 += p;
          if (h !== a && tot <= 3) c12U35 += p;
          if (h >= a && bothScored) c1XBtts += p;
          if (a >= h && bothScored) cX2Btts += p;
          if (h !== a && bothScored) c12Btts += p;

          if (bothScored && tot >= 3) cBttsO25 += p;
          if (bothScored && tot >= 4) cBttsO35 += p;
          if (bothScored && tot <= 3) cBttsU35 += p;
          if (!bothScored && tot <= 2) cBttsNoU25 += p;
          if (h > a && bothScored) c1Btts += p;
          if (a > h && bothScored) c2Btts += p;
        }
      }
    } else {
      over05 = Math.min(0.97, Math.max(over15, 0.88));
      over45 = Math.max(0.05, over35 * 0.4);
      homeOver05 = Math.min(0.95, prediction.homeWinProb + prediction.drawProb * 0.6);
      homeOver15 = Math.max(0.15, prediction.homeWinProb * 0.7);
      homeOver25 = Math.max(0.05, homeOver15 * 0.45);
      awayOver05 = Math.min(0.90, prediction.awayWinProb + prediction.drawProb * 0.5);
      awayOver15 = Math.max(0.10, prediction.awayWinProb * 0.6);
      awayOver25 = Math.max(0.03, awayOver15 * 0.4);
      goalsOdd = 0.5;
      homeCleanSheet = Number((1 - awayOver05).toFixed(3));
      awayCleanSheet = Number((1 - homeOver05).toFixed(3));
      homeWinToNil = Math.max(0.05, prediction.homeWinProb * 0.35);
      awayWinToNil = Math.max(0.03, prediction.awayWinProb * 0.35);
      hMinus1 = Math.max(0.05, prediction.homeWinProb * 0.45);
      aMinus1 = Math.max(0.03, prediction.awayWinProb * 0.4);
      mg13 = 0.72;
      mg24 = 0.60;
      mg25 = 0.68;
      c1O15 = Number((prediction.homeWinProb * 0.78).toFixed(3));
      c2O15 = Number((prediction.awayWinProb * 0.75).toFixed(3));
      c1O25 = Number((prediction.homeWinProb * prediction.over25Prob).toFixed(3));
      c2O25 = Number((prediction.awayWinProb * prediction.over25Prob).toFixed(3));
      c1O35 = Number((prediction.homeWinProb * over35).toFixed(3));
      c2O35 = Number((prediction.awayWinProb * over35).toFixed(3));
      c1U25 = Number((prediction.homeWinProb * (1 - prediction.over25Prob)).toFixed(3));
      c2U25 = Number((prediction.awayWinProb * (1 - prediction.over25Prob)).toFixed(3));
      c1U35 = Number((prediction.homeWinProb * (1 - over35)).toFixed(3));
      c2U35 = Number((prediction.awayWinProb * (1 - over35)).toFixed(3));
      cXU25 = Number((prediction.drawProb * 0.75).toFixed(3));
      cXO15 = Number((prediction.drawProb * 0.65).toFixed(3));
      cXBtts = Number((prediction.drawProb * 0.65).toFixed(3));
      c1XO15 = Number((dc1XProb * over15).toFixed(3));
      cX2O15 = Number((dcX2Prob * over15).toFixed(3));
      c12O15 = Number((dc12Prob * over15).toFixed(3));
      c1XO25 = Number((dc1XProb * prediction.over25Prob).toFixed(3));
      cX2O25 = Number((dcX2Prob * prediction.over25Prob).toFixed(3));
      c12O25 = Number((dc12Prob * prediction.over25Prob).toFixed(3));
      c1XU25 = Number((dc1XProb * (1 - prediction.over25Prob)).toFixed(3));
      cX2U25 = Number((dcX2Prob * (1 - prediction.over25Prob)).toFixed(3));
      c1XU35 = Number((dc1XProb * (1 - over35)).toFixed(3));
      cX2U35 = Number((dcX2Prob * (1 - over35)).toFixed(3));
      c12U35 = Number((dc12Prob * (1 - over35)).toFixed(3));
      c1XBtts = Number((dc1XProb * prediction.bttsProb).toFixed(3));
      cX2Btts = Number((dcX2Prob * prediction.bttsProb).toFixed(3));
      c12Btts = Number((dc12Prob * prediction.bttsProb).toFixed(3));
      cBttsO25 = Number((prediction.bttsProb * 0.82).toFixed(3));
      cBttsO35 = Number((prediction.bttsProb * over35).toFixed(3));
      cBttsU35 = Number((prediction.bttsProb * (1 - over35)).toFixed(3));
      cBttsNoU25 = Number(((1 - prediction.bttsProb) * (1 - prediction.over25Prob)).toFixed(3));
      c1Btts = Number((prediction.homeWinProb * prediction.bttsProb).toFixed(3));
      c2Btts = Number((prediction.awayWinProb * prediction.bttsProb).toFixed(3));
    }

    const r3 = (v: number) => Number(Math.max(0.001, Math.min(0.999, v)).toFixed(3));

    // Over / Under Goal Totals (excluding 0.5 goals line)
    addMarket('OVER_15', 'Over 1.5 Goals', r3(over15));
    addMarket('UNDER_15', 'Under 1.5 Goals', r3(1 - over15));
    addMarket('OVER_25', 'Over 2.5 Goals', r3(prediction.over25Prob));
    addMarket('UNDER_25', 'Under 2.5 Goals', r3(1 - prediction.over25Prob));
    addMarket('OVER_35', 'Over 3.5 Goals', r3(over35));
    addMarket('UNDER_35', 'Under 3.5 Goals', r3(1 - over35));
    addMarket('OVER_45', 'Over 4.5 Goals', r3(over45));
    addMarket('UNDER_45', 'Under 4.5 Goals', r3(1 - over45));

    // Both Teams to Score
    addMarket('BTTS_YES', 'Both Teams to Score (Yes)', prediction.bttsProb);
    addMarket('BTTS_NO', 'Both Teams to Score (No)', r3(1 - prediction.bttsProb));

    // Match Result & Goals Combos
    addMarket('COMBO_1_OVER_15', `${homeTeam} Win & Over 1.5 Goals`, r3(c1O15));
    addMarket('COMBO_2_OVER_15', `${awayTeam} Win & Over 1.5 Goals`, r3(c2O15));
    addMarket('COMBO_1_OVER_25', `${homeTeam} Win & Over 2.5 Goals`, r3(c1O25));
    addMarket('COMBO_2_OVER_25', `${awayTeam} Win & Over 2.5 Goals`, r3(c2O25));
    addMarket('COMBO_1_OVER_35', `${homeTeam} Win & Over 3.5 Goals`, r3(c1O35));
    addMarket('COMBO_2_OVER_35', `${awayTeam} Win & Over 3.5 Goals`, r3(c2O35));
    addMarket('COMBO_1_UNDER_25', `${homeTeam} Win & Under 2.5 Goals`, r3(c1U25));
    addMarket('COMBO_2_UNDER_25', `${awayTeam} Win & Under 2.5 Goals`, r3(c2U25));
    addMarket('COMBO_1_UNDER_35', `${homeTeam} Win & Under 3.5 Goals`, r3(c1U35));
    addMarket('COMBO_2_UNDER_35', `${awayTeam} Win & Under 3.5 Goals`, r3(c2U35));
    addMarket('COMBO_X_UNDER_25', 'Draw & Under 2.5 Goals', r3(cXU25));
    addMarket('COMBO_X_OVER_15', 'Draw & Over 1.5 Goals', r3(cXO15));
    addMarket('COMBO_1_BTTS', `${homeTeam} Win & BTTS Yes`, r3(c1Btts));
    addMarket('COMBO_2_BTTS', `${awayTeam} Win & BTTS Yes`, r3(c2Btts));
    addMarket('COMBO_X_BTTS', 'Draw & BTTS Yes', r3(cXBtts));
    addMarket('COMBO_1X_OVER_15', `1X & Over 1.5 Goals`, r3(c1XO15));
    addMarket('COMBO_X2_OVER_15', `X2 & Over 1.5 Goals`, r3(cX2O15));
    addMarket('COMBO_12_OVER_15', `12 & Over 1.5 Goals`, r3(c12O15));
    addMarket('COMBO_1X_OVER_25', `1X & Over 2.5 Goals`, r3(c1XO25));
    addMarket('COMBO_X2_OVER_25', `X2 & Over 2.5 Goals`, r3(cX2O25));
    addMarket('COMBO_12_OVER_25', `12 & Over 2.5 Goals`, r3(c12O25));
    addMarket('COMBO_1X_UNDER_25', `1X & Under 2.5 Goals`, r3(c1XU25));
    addMarket('COMBO_X2_UNDER_25', `X2 & Under 2.5 Goals`, r3(cX2U25));
    addMarket('COMBO_1X_UNDER_35', `1X & Under 3.5 Goals`, r3(c1XU35));
    addMarket('COMBO_X2_UNDER_35', `X2 & Under 3.5 Goals`, r3(cX2U35));
    addMarket('COMBO_12_UNDER_35', `12 & Under 3.5 Goals`, r3(c12U35));
    addMarket('COMBO_1X_BTTS', `1X & BTTS Yes`, r3(c1XBtts));
    addMarket('COMBO_X2_BTTS', `X2 & BTTS Yes`, r3(cX2Btts));
    addMarket('COMBO_12_BTTS', `12 & BTTS Yes`, r3(c12Btts));
    addMarket('COMBO_BTTS_OVER_25', 'BTTS Yes & Over 2.5 Goals', r3(cBttsO25));
    addMarket('COMBO_BTTS_OVER_35', 'BTTS Yes & Over 3.5 Goals', r3(cBttsO35));
    addMarket('COMBO_BTTS_UNDER_35', 'BTTS Yes & Under 3.5 Goals', r3(cBttsU35));
    addMarket('COMBO_BTTS_NO_UNDER_25', 'BTTS No & Under 2.5 Goals', r3(cBttsNoU25));

    // Team Goals & Clean Sheets (excluding 0.5 goals lines)
    addMarket('HOME_OVER_15', `${homeTeam} Over 1.5 Goals`, r3(homeOver15));
    addMarket('HOME_UNDER_15', `${homeTeam} Under 1.5 Goals`, r3(1 - homeOver15));
    addMarket('HOME_OVER_25', `${homeTeam} Over 2.5 Goals`, r3(homeOver25));
    addMarket('HOME_UNDER_25', `${homeTeam} Under 2.5 Goals`, r3(1 - homeOver25));

    addMarket('AWAY_OVER_15', `${awayTeam} Over 1.5 Goals`, r3(awayOver15));
    addMarket('AWAY_UNDER_15', `${awayTeam} Under 1.5 Goals`, r3(1 - awayOver15));
    addMarket('AWAY_OVER_25', `${awayTeam} Over 2.5 Goals`, r3(awayOver25));
    addMarket('AWAY_UNDER_25', `${awayTeam} Under 2.5 Goals`, r3(1 - awayOver25));

    addMarket('HOME_CLEAN_SHEET', `${homeTeam} Clean Sheet (Yes)`, r3(homeCleanSheet));
    addMarket('AWAY_CLEAN_SHEET', `${awayTeam} Clean Sheet (Yes)`, r3(awayCleanSheet));

    addMarket('HOME_WIN_TO_NIL', `${homeTeam} Win to Nil`, r3(homeWinToNil));
    addMarket('AWAY_WIN_TO_NIL', `${awayTeam} Win to Nil`, r3(awayWinToNil));
    addMarket('HANDICAP_HOME_MINUS_1', `${homeTeam} (-1.5) Handicap`, r3(hMinus1));
    addMarket('HANDICAP_AWAY_MINUS_1', `${awayTeam} (-1.5) Handicap`, r3(aMinus1));

    // Multi-Goals & Odd/Even Specials
    addMarket('MULTIGOALS_1_3', 'Multi-Goals: 1 - 3 Goals', r3(mg13));
    addMarket('MULTIGOALS_2_4', 'Multi-Goals: 2 - 4 Goals', r3(mg24));
    addMarket('MULTIGOALS_2_5', 'Multi-Goals: 2 - 5 Goals', r3(mg25));
    addMarket('GOALS_ODD', 'Total Goals - Odd', r3(goalsOdd));
    addMarket('GOALS_EVEN', 'Total Goals - Even', r3(1 - goalsOdd));

    // Identify MOST LIKELY Outcome across calculated markets (1X2, Combo Bet Markets, Double Chance, DNB, Over/Under >= 1.5, BTTS, Team Markets & Specials)
    // Exclude trivial extreme goal lines (U4.5, team U2.5) and any 0.5 goal lines so meaningful main & combo markets lead.
    const TRIVIAL_EXTREME_KEYS = new Set<MarketOption['key']>([
      'UNDER_45',
      'HOME_UNDER_25',
      'AWAY_UNDER_25',
    ]);
    const outcomeCandidates = markets.filter(
      (m) =>
        !TRIVIAL_EXTREME_KEYS.has(m.key) &&
        !/(?:^|_)05(?:_|$)/.test(String(m.key).toUpperCase())
    );
    let mostLikelyMarket = outcomeCandidates[0] || markets[0];
    for (const m of outcomeCandidates) {
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
      bestValueBet,
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
      const swing = (weightedWinDiff / weightTotal) * 0.04 + (weightedGoalDiff / weightTotal) * 0.02;
      h2hMultiplierHome = Number(Math.max(0.94, Math.min(1.06, 1.0 + swing)).toFixed(3));
      h2hMultiplierAway = Number(Math.max(0.94, Math.min(1.06, 1.0 - swing)).toFixed(3));
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
