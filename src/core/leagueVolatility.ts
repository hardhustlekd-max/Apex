import { cleanStr, getLeagueAliases } from './leagueMapper.js';
import { ApexEngine } from './poisson.js';
import { HistoricalMatch, LeagueVolatilityRecord } from './types.js';

export interface VolatilityEvaluationSample {
  leagueId: string;
  leagueName: string;
  actual: 'H' | 'D' | 'A';
  pHome: number;
  pDraw: number;
  pAway: number;
}

export interface TierBacktestMetrics {
  matches: number;
  logLoss: number;
  brierScore: number;
  ece: number;
  classwiseEce: number;
  macroRocAuc: number;
}

export interface LeagueVolatilityBacktestReport {
  tunedAlpha: number;
  globalLogLoss: number;
  calibratedLeaguesCount: number;
  fallbackLeaguesCount: number;
  overall: {
    baseline: TierBacktestMetrics;
    calibrated: TierBacktestMetrics;
    logLossDelta: number;
    eceDelta: number;
    rocAucDelta: number;
  };
  highVolatilityTier: {
    leagues: string[];
    baseline: TierBacktestMetrics;
    calibrated: TierBacktestMetrics;
    logLossDelta: number;
    eceDelta: number;
    rocAucDelta: number;
  };
  lowVolatilityTier: {
    leagues: string[];
    baseline: TierBacktestMetrics;
    calibrated: TierBacktestMetrics;
    logLossDelta: number;
    eceDelta: number;
    rocAucDelta: number;
  };
  leagueSummaries: Array<{
    league_id: string;
    league_name: string;
    tier: 'HIGH_VOLATILITY' | 'LOW_VOLATILITY' | 'NEUTRAL_FALLBACK';
    volatility_coefficient: number;
    historical_log_loss: number;
    elo_spread_iqr: number;
    matches_evaluated: number;
    is_fallback: boolean;
  }>;
}

export interface LeagueVolatilityLookup {
  byKey: Map<string, LeagueVolatilityRecord>;
  all: LeagueVolatilityRecord[];
}

const MIN_VL = 0.75;
const MAX_VL = 1.35;
const MIN_MATCHES_FOR_CALIBRATION = 100;

export function clipVolatility(v: number): number {
  if (!Number.isFinite(v)) return 1.0;
  return Number(Math.max(MIN_VL, Math.min(MAX_VL, v)).toFixed(3));
}

function parseMatchMs(dateStr?: string): number {
  if (!dateStr) return 0;
  const parsed = Date.parse(dateStr);
  return Number.isFinite(parsed) ? parsed : 0;
}

function outcomeIndex(ftr: 'H' | 'D' | 'A'): 0 | 1 | 2 {
  return ftr === 'H' ? 0 : ftr === 'D' ? 1 : 2;
}

function normalizeProbs(pH: number, pD: number, pA: number): [number, number, number] {
  const eps = 1e-6;
  const h = Math.max(eps, Number.isFinite(pH) ? pH : 1 / 3);
  const d = Math.max(eps, Number.isFinite(pD) ? pD : 1 / 3);
  const a = Math.max(eps, Number.isFinite(pA) ? pA : 1 / 3);
  const s = h + d + a;
  return [h / s, d / s, a / s];
}

export function computeMulticlassLogLoss(samples: VolatilityEvaluationSample[]): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) {
    const [pH, pD, pA] = normalizeProbs(s.pHome, s.pDraw, s.pAway);
    const pActual = s.actual === 'H' ? pH : s.actual === 'D' ? pD : pA;
    sum += -Math.log(Math.max(1e-7, pActual));
  }
  return Number((sum / samples.length).toFixed(4));
}

export function computeBrierScore(samples: VolatilityEvaluationSample[]): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) {
    const [pH, pD, pA] = normalizeProbs(s.pHome, s.pDraw, s.pAway);
    const yH = s.actual === 'H' ? 1 : 0;
    const yD = s.actual === 'D' ? 1 : 0;
    const yA = s.actual === 'A' ? 1 : 0;
    sum += (pH - yH) ** 2 + (pD - yD) ** 2 + (pA - yA) ** 2;
  }
  return Number((sum / samples.length).toFixed(4));
}

export function computeExpectedCalibrationError(
  samples: VolatilityEvaluationSample[],
  numBins = 10
): { ece: number; classwiseEce: number } {
  if (samples.length === 0) return { ece: 0, classwiseEce: 0 };

  const confBins = Array.from({ length: numBins }, () => ({ count: 0, confSum: 0, accSum: 0 }));
  const classBins: Array<Array<{ count: number; probSum: number; freqSum: number }>> = [
    Array.from({ length: numBins }, () => ({ count: 0, probSum: 0, freqSum: 0 })),
    Array.from({ length: numBins }, () => ({ count: 0, probSum: 0, freqSum: 0 })),
    Array.from({ length: numBins }, () => ({ count: 0, probSum: 0, freqSum: 0 })),
  ];

  for (const s of samples) {
    const probs = normalizeProbs(s.pHome, s.pDraw, s.pAway);
    const actualIdx = outcomeIndex(s.actual);

    let bestIdx = 0;
    if (probs[1] > probs[bestIdx]) bestIdx = 1;
    if (probs[2] > probs[bestIdx]) bestIdx = 2;

    const conf = probs[bestIdx];
    const confBin = Math.min(numBins - 1, Math.max(0, Math.floor(conf * numBins)));
    confBins[confBin].count++;
    confBins[confBin].confSum += conf;
    confBins[confBin].accSum += bestIdx === actualIdx ? 1 : 0;

    for (let c = 0; c < 3; c++) {
      const p = probs[c];
      const b = Math.min(numBins - 1, Math.max(0, Math.floor(p * numBins)));
      classBins[c][b].count++;
      classBins[c][b].probSum += p;
      classBins[c][b].freqSum += c === actualIdx ? 1 : 0;
    }
  }

  let ece = 0;
  for (const bin of confBins) {
    if (bin.count === 0) continue;
    const avgConf = bin.confSum / bin.count;
    const avgAcc = bin.accSum / bin.count;
    ece += (bin.count / samples.length) * Math.abs(avgAcc - avgConf);
  }

  let classwiseSum = 0;
  for (let c = 0; c < 3; c++) {
    let classEce = 0;
    for (const bin of classBins[c]) {
      if (bin.count === 0) continue;
      classEce += (bin.count / samples.length) * Math.abs(bin.freqSum / bin.count - bin.probSum / bin.count);
    }
    classwiseSum += classEce;
  }

  return {
    ece: Number(ece.toFixed(4)),
    classwiseEce: Number((classwiseSum / 3).toFixed(4)),
  };
}

function computeBinaryRocAuc(scores: number[], labels: number[]): number {
  const n = scores.length;
  let totalPos = 0;
  for (const y of labels) if (y === 1) totalPos++;
  const totalNeg = n - totalPos;
  if (totalPos === 0 || totalNeg === 0) return 0.5;

  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[b] - scores[a]);
  let tp = 0;
  let fp = 0;
  let prevTp = 0;
  let prevFp = 0;
  let area = 0;

  let i = 0;
  while (i < n) {
    const score = scores[order[i]];
    while (i < n && scores[order[i]] === score) {
      if (labels[order[i]] === 1) tp++;
      else fp++;
      i++;
    }
    area += ((fp - prevFp) * (tp + prevTp)) / 2;
    prevTp = tp;
    prevFp = fp;
  }

  return area / (totalPos * totalNeg);
}

export function computeMacroOvRRocAuc(samples: VolatilityEvaluationSample[]): number {
  if (samples.length === 0) return 0.5;
  const hScores = samples.map((s) => s.pHome);
  const dScores = samples.map((s) => s.pDraw);
  const aScores = samples.map((s) => s.pAway);

  const hLabels = samples.map((s) => (s.actual === 'H' ? 1 : 0));
  const dLabels = samples.map((s) => (s.actual === 'D' ? 1 : 0));
  const aLabels = samples.map((s) => (s.actual === 'A' ? 1 : 0));

  const aucH = computeBinaryRocAuc(hScores, hLabels);
  const aucD = computeBinaryRocAuc(dScores, dLabels);
  const aucA = computeBinaryRocAuc(aScores, aLabels);

  return Number(((aucH + aucD + aucA) / 3).toFixed(4));
}

export function computeTierMetrics(samples: VolatilityEvaluationSample[]): TierBacktestMetrics {
  const { ece, classwiseEce } = computeExpectedCalibrationError(samples, 10);
  return {
    matches: samples.length,
    logLoss: computeMulticlassLogLoss(samples),
    brierScore: computeBrierScore(samples),
    ece,
    classwiseEce,
    macroRocAuc: computeMacroOvRRocAuc(samples),
  };
}

function computePercentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function computeIqr(values: number[]): number {
  if (values.length < 2) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Number((computePercentile(sorted, 0.75) - computePercentile(sorted, 0.25)).toFixed(1));
}

/**
 * Generates strictly leak-free chronological walk-forward 1X2 baseline probabilities
 * for each match in historical chronological order using:
 * - Sequential Elo ratings (K = 24 / vL)
 * - League goal baselines with V_L-scaled Bayesian prior shrinkage (W_prior * vL)
 * - Dixon-Coles goal grid + Temperature Scaling (T = vL ^ alpha)
 */
function runChronologicalWalkForward(
  matches: HistoricalMatch[],
  options?: {
    volatilityLookup?: Map<string, number>;
    temperatureAlpha?: number;
    usePipelineCalibration?: boolean;
  }
): {
  samples: Array<VolatilityEvaluationSample & { matchIndex: number }>;
  finalEloByLeague: Map<string, Map<string, number>>;
} {
  const sorted = [...matches].sort((a, b) => parseMatchMs(a.matchDate) - parseMatchMs(b.matchDate));
  const useCalibration = options?.usePipelineCalibration ?? false;
  const alpha = Math.max(0.5, Math.min(1.5, options?.temperatureAlpha ?? 1.0));

  const teamElo = new Map<string, number>();
  const teamStats = new Map<
    string,
    { wN: number; wGfSum: number; wGaSum: number; count: number }
  >();
  const leagueStats = new Map<
    string,
    { count: number; homeGoals: number; awayGoals: number; teamElos: Map<string, number> }
  >();

  const DECAY = 0.90;
  const samples: Array<VolatilityEvaluationSample & { matchIndex: number }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const leagueId = String(m.div || m.leagueName || 'DEFAULT').trim() || 'DEFAULT';
    const leagueName = String(m.leagueName || leagueId).trim() || leagueId;
    const hKey = m.homeTeam.toLowerCase().trim();
    const aKey = m.awayTeam.toLowerCase().trim();
    if (!hKey || !aKey) continue;

    const vL = useCalibration
      ? clipVolatility(options?.volatilityLookup?.get(leagueId) ?? 1.0)
      : 1.0;

    // Prior metrics strictly before match i
    const lStat = leagueStats.get(leagueId) || {
      count: 0,
      homeGoals: 0,
      awayGoals: 0,
      teamElos: new Map<string, number>(),
    };
    const lPriorW = 20;
    const avgHome = (lStat.homeGoals + lPriorW * 1.48) / (lStat.count + lPriorW);
    const avgAway = (lStat.awayGoals + lPriorW * 1.18) / (lStat.count + lPriorW);

    const hElo = teamElo.get(hKey) ?? 1500;
    const aElo = teamElo.get(aKey) ?? 1500;

    const hSt = teamStats.get(hKey) || { wN: 0, wGfSum: 0, wGaSum: 0, count: 0 };
    const aSt = teamStats.get(aKey) || { wN: 0, wGfSum: 0, wGaSum: 0, count: 0 };

    // Point B: Early-season prior shrinkage scaled by V_L (ApexEngine W_prior = 5)
    const wPrior = useCalibration ? 5 * vL : 5;
    const avgLeaguePerTeam = (avgHome + avgAway) / 2;
    const hAttackAdj = ((hSt.wGfSum + wPrior * avgLeaguePerTeam) / (hSt.wN + wPrior)) / avgLeaguePerTeam;
    const hDefenseAdj = ((hSt.wGaSum + wPrior * avgLeaguePerTeam) / (hSt.wN + wPrior)) / avgLeaguePerTeam;
    const aAttackAdj = ((aSt.wGfSum + wPrior * avgLeaguePerTeam) / (aSt.wN + wPrior)) / avgLeaguePerTeam;
    const aDefenseAdj = ((aSt.wGaSum + wPrior * avgLeaguePerTeam) / (aSt.wN + wPrior)) / avgLeaguePerTeam;

    const lambda = Math.max(
      0.22,
      Math.min(4.0, avgHome * Math.pow(hAttackAdj * aDefenseAdj, 0.90))
    );
    const mu = Math.max(
      0.22,
      Math.min(4.0, avgAway * Math.pow(aAttackAdj * hDefenseAdj, 0.90))
    );

    // Bivariate Dixon-Coles 7x7 raw probabilities
    let pH = 0;
    let pD = 0;
    let pA = 0;
    let totalP = 0;
    const RHO = -0.11;
    for (let hg = 0; hg <= 6; hg++) {
      const phg = ApexEngine.poissonProb(hg, lambda);
      for (let ag = 0; ag <= 6; ag++) {
        const p = phg * ApexEngine.poissonProb(ag, mu) * ApexEngine.dixonColesTau(hg, ag, lambda, mu, RHO);
        totalP += p;
        if (hg > ag) pH += p;
        else if (hg === ag) pD += p;
        else pA += p;
      }
    }
    pH /= totalP || 1;
    pD /= totalP || 1;
    pA /= totalP || 1;

    const eloExp = ApexEngine.getEloWinExpectancy(hElo, aElo, 55);
    let mixH = 0.75 * pH + 0.25 * eloExp.homeWinProb;
    let mixD = 0.75 * pD + 0.25 * eloExp.drawProb;
    let mixA = 0.75 * pA + 0.25 * eloExp.awayWinProb;

    if (useCalibration) {
      // Point C: Post-processing temperature scaling T = V_L ^ alpha
      const scaled = ApexEngine.applyTemperatureScaling(mixH, mixD, mixA, vL, alpha);
      mixH = scaled.homeWinProb;
      mixD = scaled.drawProb;
      mixA = scaled.awayWinProb;
    }

    samples.push({
      matchIndex: i,
      leagueId,
      leagueName,
      actual: m.ftr,
      pHome: mixH,
      pDraw: mixD,
      pAway: mixA,
    });

    // Post-match state updates (Point A: K_eff = K_base / V_L)
    const gd = Math.abs(m.fthg - m.ftag);
    const marginMult = gd >= 3 ? 1.5 : gd === 2 ? 1.25 : 1.0;
    const actualHomeScore = m.ftr === 'H' ? 1.0 : m.ftr === 'D' ? 0.5 : 0.0;
    const expHome = 1 / (1 + Math.pow(10, (aElo - (hElo + 55)) / 400));
    const effectiveK = useCalibration ? 28 / vL : 28;
    const eloDelta = effectiveK * marginMult * (actualHomeScore - expHome);
    const nextHElo = hElo + eloDelta;
    const nextAElo = aElo - eloDelta;

    teamElo.set(hKey, nextHElo);
    teamElo.set(aKey, nextAElo);

    teamStats.set(hKey, {
      wN: hSt.wN * DECAY + 1,
      wGfSum: hSt.wGfSum * DECAY + m.fthg,
      wGaSum: hSt.wGaSum * DECAY + m.ftag,
      count: hSt.count + 1,
    });
    teamStats.set(aKey, {
      wN: aSt.wN * DECAY + 1,
      wGfSum: aSt.wGfSum * DECAY + m.ftag,
      wGaSum: aSt.wGaSum * DECAY + m.fthg,
      count: aSt.count + 1,
    });

    lStat.count++;
    lStat.homeGoals += m.fthg;
    lStat.awayGoals += m.ftag;
    lStat.teamElos.set(hKey, nextHElo);
    lStat.teamElos.set(aKey, nextAElo);
    leagueStats.set(leagueId, lStat);
  }

  const finalEloByLeague = new Map<string, Map<string, number>>();
  for (const [lid, st] of leagueStats.entries()) {
    finalEloByLeague.set(lid, st.teamElos);
  }

  return { samples, finalEloByLeague };
}

/**
 * Computes offline League Volatility Coefficients V_L across all leagues in historical matches:
 *   V_L = clip(LL_league / LL_global, 0.75, 1.35)
 * Enforces strict fallback V_L = 1.00 when matches_evaluated < 100.
 */
export function computeLeagueVolatilities(
  matches: HistoricalMatch[],
  options?: {
    temperatureAlpha?: number;
    minMatchesForCalibration?: number;
    eloRatingsOverride?: Map<string, number>;
  }
): {
  records: LeagueVolatilityRecord[];
  globalLogLoss: number;
} {
  if (!matches || matches.length === 0) {
    return { records: [], globalLogLoss: 1.0 };
  }

  const minMatches = options?.minMatchesForCalibration ?? MIN_MATCHES_FOR_CALIBRATION;
  const alpha = Math.max(0.5, Math.min(1.5, options?.temperatureAlpha ?? 1.0));

  const { samples, finalEloByLeague } = runChronologicalWalkForward(matches, {
    usePipelineCalibration: false,
  });

  // Skip the earliest 10 warm-up matches per league when estimating league log-loss if league >= minMatches
  const byLeague = new Map<
    string,
    {
      leagueName: string;
      allSamples: VolatilityEvaluationSample[];
      evalSamples: VolatilityEvaluationSample[];
      teams: Set<string>;
    }
  >();

  const leagueTeamSets = new Map<string, Set<string>>();
  for (const m of matches) {
    const lid = String(m.div || m.leagueName || 'DEFAULT').trim() || 'DEFAULT';
    if (!leagueTeamSets.has(lid)) leagueTeamSets.set(lid, new Set());
    leagueTeamSets.get(lid)!.add(m.homeTeam.toLowerCase().trim());
    leagueTeamSets.get(lid)!.add(m.awayTeam.toLowerCase().trim());
  }

  for (const s of samples) {
    if (!byLeague.has(s.leagueId)) {
      byLeague.set(s.leagueId, {
        leagueName: s.leagueName,
        allSamples: [],
        evalSamples: [],
        teams: leagueTeamSets.get(s.leagueId) || new Set(),
      });
    }
    const bucket = byLeague.get(s.leagueId)!;
    bucket.allSamples.push(s);
  }

  const globalPool: VolatilityEvaluationSample[] = [];
  const eligibleLogLosses = new Map<string, number>();

  for (const [lid, bucket] of byLeague.entries()) {
    const warmup = bucket.allSamples.length >= minMatches ? 15 : 0;
    bucket.evalSamples = bucket.allSamples.slice(warmup);
    const ll = computeMulticlassLogLoss(bucket.evalSamples);
    if (bucket.allSamples.length >= minMatches) {
      eligibleLogLosses.set(lid, ll);
      globalPool.push(...bucket.evalSamples);
    }
  }

  const globalLogLoss =
    globalPool.length > 0
      ? computeMulticlassLogLoss(globalPool)
      : computeMulticlassLogLoss(samples) || 1.0;

  const updatedAt = new Date().toISOString();
  const records: LeagueVolatilityRecord[] = [];

  for (const [lid, bucket] of byLeague.entries()) {
    const matchesEvaluated = bucket.allSamples.length;
    const isFallback = matchesEvaluated < minMatches;
    const histLl = computeMulticlassLogLoss(bucket.evalSamples);
    const vL = isFallback ? 1.0 : clipVolatility(histLl / Math.max(0.25, globalLogLoss));

    let eloIqr = 0;
    const leagueEloMap = finalEloByLeague.get(lid);
    if (options?.eloRatingsOverride && bucket.teams.size >= 2) {
      const vals = Array.from(bucket.teams).map((t) => options.eloRatingsOverride!.get(t) ?? 1500);
      eloIqr = computeIqr(vals);
    } else if (leagueEloMap && leagueEloMap.size >= 2) {
      eloIqr = computeIqr(Array.from(leagueEloMap.values()));
    }

    records.push({
      league_id: lid,
      league_name: bucket.leagueName,
      volatility_coefficient: vL,
      historical_log_loss: histLl,
      elo_spread_iqr: eloIqr,
      matches_evaluated: matchesEvaluated,
      temperature_alpha: alpha,
      is_fallback: isFallback,
      updated_at: updatedAt,
    });
  }

  records.sort((a, b) => b.matches_evaluated - a.matches_evaluated || a.league_name.localeCompare(b.league_name));
  return { records, globalLogLoss };
}

/**
 * Out-of-Sample Walk-Forward Cross-Validation & Backtest Verification:
 * - Split 1 (0% -> 50% chronological per league): Offline calibration to estimate V_L
 * - Split 2 (50% -> 72%): Cross-validate temperature exponent alpha in [0.5, 1.5]
 * - Split 3 (72% -> 100%): Strictly out-of-sample evaluation across High-V_L & Low-V_L tiers
 */
export function runOutOfSampleVolatilityBacktest(
  matches: HistoricalMatch[],
  options?: {
    minMatchesForCalibration?: number;
  }
): LeagueVolatilityBacktestReport {
  const minMatches = options?.minMatchesForCalibration ?? MIN_MATCHES_FOR_CALIBRATION;
  const sorted = [...matches].sort((a, b) => parseMatchMs(a.matchDate) - parseMatchMs(b.matchDate));

  // Chronological per-league partitioning so every league contributes equally to calibration / CV / test splits
  const leagueGroups = new Map<string, HistoricalMatch[]>();
  for (const m of sorted) {
    const lid = String(m.div || m.leagueName || 'DEFAULT').trim() || 'DEFAULT';
    if (!leagueGroups.has(lid)) leagueGroups.set(lid, []);
    leagueGroups.get(lid)!.push(m);
  }

  const calibrationTrain: HistoricalMatch[] = [];
  const cvIds = new Set<string>();
  const testIds = new Set<string>();

  for (const [, list] of leagueGroups.entries()) {
    if (list.length < minMatches) {
      for (const m of list) testIds.add(m.id);
      continue;
    }
    const split1 = Math.floor(list.length * 0.50);
    const split2 = Math.floor(list.length * 0.72);
    for (let i = 0; i < list.length; i++) {
      if (i < split1) calibrationTrain.push(list[i]);
      else if (i < split2) cvIds.add(list[i].id);
      else testIds.add(list[i].id);
    }
  }

  // Fit V_L on historical training window (up to split1), tagging each league by total full-window or train size >= minMatches
  const { records: trainRecords, globalLogLoss } = computeLeagueVolatilities(calibrationTrain, {
    minMatchesForCalibration: Math.min(minMatches, 80),
  });

  // Ensure any league whose full historical sample < minMatches strictly receives fallback V_L = 1.00
  const adjustedRecords = trainRecords.map((rec) => {
    const totalCount = leagueGroups.get(rec.league_id)?.length ?? rec.matches_evaluated;
    if (totalCount < minMatches) {
      return {
        ...rec,
        matches_evaluated: totalCount,
        volatility_coefficient: 1.0,
        is_fallback: true,
      };
    }
    return {
      ...rec,
      matches_evaluated: totalCount,
    };
  });

  // Include fallback-only leagues not in calibrationTrain
  for (const [lid, list] of leagueGroups.entries()) {
    if (!adjustedRecords.some((r) => r.league_id === lid)) {
      adjustedRecords.push({
        league_id: lid,
        league_name: list[0]?.leagueName || lid,
        volatility_coefficient: 1.0,
        historical_log_loss: 0,
        elo_spread_iqr: 0,
        matches_evaluated: list.length,
        temperature_alpha: 1.0,
        is_fallback: list.length < minMatches,
        updated_at: new Date().toISOString(),
      });
    }
  }

  const vlMap = new Map<string, number>();
  for (const rec of adjustedRecords) {
    vlMap.set(rec.league_id, rec.is_fallback ? 1.0 : rec.volatility_coefficient);
  }

  // Cross-validate alpha in [0.5, 1.5] minimizing combined Log-Loss + ECE on validation split
  const alphaCandidates = [0.5, 0.75, 1.0, 1.25, 1.5];
  let bestAlpha = 1.0;
  let bestScore = Infinity;

  const cvIdArray = new Set<number>();
  const testIndexSet = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    if (cvIds.has(sorted[i].id)) cvIdArray.add(i);
    if (testIds.has(sorted[i].id)) testIndexSet.add(i);
  }

  for (const candAlpha of alphaCandidates) {
    const walk = runChronologicalWalkForward(sorted, {
      volatilityLookup: vlMap,
      temperatureAlpha: candAlpha,
      usePipelineCalibration: true,
    });
    const cvSamples = walk.samples.filter((s) => cvIdArray.has(s.matchIndex));
    if (cvSamples.length === 0) continue;
    const ll = computeMulticlassLogLoss(cvSamples);
    const { ece } = computeExpectedCalibrationError(cvSamples, 10);
    const objective = ll + 0.5 * ece;
    if (objective < bestScore) {
      bestScore = objective;
      bestAlpha = candAlpha;
    }
  }

  const finalRecords = adjustedRecords.map((r) => ({
    ...r,
    temperature_alpha: bestAlpha,
  }));

  const baselineWalk = runChronologicalWalkForward(sorted, {
    usePipelineCalibration: false,
  });
  const calibratedWalk = runChronologicalWalkForward(sorted, {
    volatilityLookup: vlMap,
    temperatureAlpha: bestAlpha,
    usePipelineCalibration: true,
  });

  const baseTestSamples = baselineWalk.samples.filter((s) => testIndexSet.has(s.matchIndex));
  const calTestSamples = calibratedWalk.samples.filter((s) => testIndexSet.has(s.matchIndex));

  const highLeagues = new Set(
    finalRecords.filter((r) => !r.is_fallback && r.volatility_coefficient > 1.0).map((r) => r.league_id)
  );
  const lowLeagues = new Set(
    finalRecords.filter((r) => !r.is_fallback && r.volatility_coefficient < 1.0).map((r) => r.league_id)
  );

  const baseHigh = baseTestSamples.filter((s) => highLeagues.has(s.leagueId));
  const calHigh = calTestSamples.filter((s) => highLeagues.has(s.leagueId));
  const baseLow = baseTestSamples.filter((s) => lowLeagues.has(s.leagueId));
  const calLow = calTestSamples.filter((s) => lowLeagues.has(s.leagueId));

  const overallBase = computeTierMetrics(baseTestSamples);
  const overallCal = computeTierMetrics(calTestSamples);
  const highBase = computeTierMetrics(baseHigh);
  const highCal = computeTierMetrics(calHigh);
  const lowBase = computeTierMetrics(baseLow);
  const lowCal = computeTierMetrics(calLow);

  return {
    tunedAlpha: bestAlpha,
    globalLogLoss,
    calibratedLeaguesCount: finalRecords.filter((r) => !r.is_fallback).length,
    fallbackLeaguesCount: finalRecords.filter((r) => r.is_fallback).length,
    overall: {
      baseline: overallBase,
      calibrated: overallCal,
      logLossDelta: Number((overallCal.logLoss - overallBase.logLoss).toFixed(4)),
      eceDelta: Number((overallCal.ece - overallBase.ece).toFixed(4)),
      rocAucDelta: Number((overallCal.macroRocAuc - overallBase.macroRocAuc).toFixed(4)),
    },
    highVolatilityTier: {
      leagues: Array.from(highLeagues),
      baseline: highBase,
      calibrated: highCal,
      logLossDelta: Number((highCal.logLoss - highBase.logLoss).toFixed(4)),
      eceDelta: Number((highCal.ece - highBase.ece).toFixed(4)),
      rocAucDelta: Number((highCal.macroRocAuc - highBase.macroRocAuc).toFixed(4)),
    },
    lowVolatilityTier: {
      leagues: Array.from(lowLeagues),
      baseline: lowBase,
      calibrated: lowCal,
      logLossDelta: Number((lowCal.logLoss - lowBase.logLoss).toFixed(4)),
      eceDelta: Number((lowCal.ece - lowBase.ece).toFixed(4)),
      rocAucDelta: Number((lowCal.macroRocAuc - lowBase.macroRocAuc).toFixed(4)),
    },
    leagueSummaries: finalRecords.map((r) => ({
      league_id: r.league_id,
      league_name: r.league_name,
      tier: r.is_fallback
        ? 'NEUTRAL_FALLBACK'
        : r.volatility_coefficient >= 1.0
        ? 'HIGH_VOLATILITY'
        : 'LOW_VOLATILITY',
      volatility_coefficient: r.volatility_coefficient,
      historical_log_loss: r.historical_log_loss,
      elo_spread_iqr: r.elo_spread_iqr,
      matches_evaluated: r.matches_evaluated,
      is_fallback: Boolean(r.is_fallback),
    })),
  };
}

export function buildLeagueVolatilityLookup(records: LeagueVolatilityRecord[]): LeagueVolatilityLookup {
  const byKey = new Map<string, LeagueVolatilityRecord>();
  const register = (rawKey: string | undefined, rec: LeagueVolatilityRecord) => {
    if (!rawKey) return;
    const rawLower = rawKey.trim().toLowerCase();
    const cleaned = cleanStr(rawKey);
    if (rawLower && !byKey.has(rawLower)) byKey.set(rawLower, rec);
    if (cleaned && !byKey.has(cleaned)) byKey.set(cleaned, rec);
  };

  for (const r of records) {
    const normalized: LeagueVolatilityRecord = {
      ...r,
      is_fallback: Boolean(r.is_fallback) || r.matches_evaluated < MIN_MATCHES_FOR_CALIBRATION,
      volatility_coefficient:
        Boolean(r.is_fallback) || r.matches_evaluated < MIN_MATCHES_FOR_CALIBRATION
          ? 1.0
          : clipVolatility(r.volatility_coefficient),
    };
    register(normalized.league_id, normalized);
    register(normalized.league_name, normalized);
    for (const alias of getLeagueAliases(normalized.league_id)) {
      register(alias, normalized);
    }
    if (normalized.league_name) {
      for (const alias of getLeagueAliases(normalized.league_name)) {
        register(alias, normalized);
      }
    }
  }

  return { byKey, all: records };
}

export function resolveLeagueVolatility(
  lookup: LeagueVolatilityLookup | null | undefined,
  leagueId?: string,
  leagueName?: string
): {
  volatilityCoefficient: number;
  temperatureAlpha: number;
  isFallback: boolean;
  record: LeagueVolatilityRecord | null;
} {
  if (!lookup || lookup.byKey.size === 0) {
    return { volatilityCoefficient: 1.0, temperatureAlpha: 1.0, isFallback: true, record: null };
  }

  const probes: string[] = [];
  if (leagueId) {
    probes.push(leagueId.trim().toLowerCase(), cleanStr(leagueId));
    for (const a of getLeagueAliases(leagueId)) probes.push(a.toLowerCase(), cleanStr(a));
  }
  if (leagueName) {
    probes.push(leagueName.trim().toLowerCase(), cleanStr(leagueName));
    for (const a of getLeagueAliases(leagueName)) probes.push(a.toLowerCase(), cleanStr(a));
  }

  for (const p of probes) {
    if (!p) continue;
    const hit = lookup.byKey.get(p);
    if (hit) {
      const isFallback = Boolean(hit.is_fallback) || hit.matches_evaluated < MIN_MATCHES_FOR_CALIBRATION;
      return {
        volatilityCoefficient: isFallback ? 1.0 : clipVolatility(hit.volatility_coefficient),
        temperatureAlpha: Number.isFinite(hit.temperature_alpha) ? hit.temperature_alpha! : 1.0,
        isFallback,
        record: hit,
      };
    }
  }

  return { volatilityCoefficient: 1.0, temperatureAlpha: 1.0, isFallback: true, record: null };
}
