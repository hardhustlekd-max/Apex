import { Fixture, MarketOption, PoissonPrediction } from './types.js';

/**
 * Standard probability formatter: strictly 1 decimal place everywhere.
 * Handles both 0.0-1.0 fractions (e.g. 0.395) and 0-100 values (e.g. 39.5).
 */
export function formatProb(prob: number | null | undefined, decimals: number = 1): string {
  if (prob === null || prob === undefined || isNaN(prob)) {
    return '-';
  }
  const normalized = prob > 1.0 ? prob : prob * 100;
  return `${normalized.toFixed(decimals)}%`;
}

/**
 * Returns the numeric percentage value rounded to specified decimal places (e.g. 39.5).
 * Useful for sorting, progress bars, and numeric comparisons.
 */
export function getProbValue(prob: number | null | undefined, decimals: number = 1): number {
  if (prob === null || prob === undefined || isNaN(prob)) {
    return 0;
  }
  const normalized = prob > 1.0 ? prob : prob * 100;
  const factor = Math.pow(10, decimals);
  return Math.round(normalized * factor) / factor;
}

/**
 * Formats European decimal odds to standard 2 decimal places (e.g. 2.45).
 */
export function formatOdds(odds: number | null | undefined): string {
  if (!odds || isNaN(odds) || odds <= 1.0) {
    return '-';
  }
  return odds.toFixed(2);
}

/**
 * Formats expected value (EV) with explicit sign and percentage (e.g. +14.2% or -3.5%).
 */
export function formatEV(ev: number | null | undefined): string {
  if (ev === null || ev === undefined || isNaN(ev)) {
    return '-';
  }
  const pct = ev * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}% EV`;
}

/**
 * Formats fair odds derived from probability (1 / prob).
 */
export function formatFairOdds(prob: number | null | undefined): string {
  if (!prob || prob <= 0) return '-';
  const val = prob > 1 ? prob / 100 : prob;
  return (1 / val).toFixed(2);
}

export interface PickInfo {
  type: '1' | 'X' | '2' | 'O2.5' | 'U2.5' | 'BTTS_Y' | 'BTTS_N';
  label: string;
  shortLabel: string;
  probability: number; // 0.0 to 1.0
  probabilityPercent: number; // e.g. 58.2
  probabilityFormatted: string; // "58.2%"
}

/**
 * Computes the authoritative highest probability 1X2 pick for a match.
 */
export function getAuthoritative1X2Pick(fixture: Fixture): PickInfo {
  const p = fixture.prediction;
  if (!p) {
    return {
      type: '1',
      label: `${fixture.homeTeam} Win`,
      shortLabel: '1',
      probability: 0.45,
      probabilityPercent: 45.0,
      probabilityFormatted: '45.0%',
    };
  }

  const h = p.homeWinProb ?? 0;
  const d = p.drawProb ?? 0;
  const a = p.awayWinProb ?? 0;

  if (h >= a && h >= d) {
    return {
      type: '1',
      label: `${fixture.homeTeam} Win`,
      shortLabel: '1',
      probability: h,
      probabilityPercent: getProbValue(h, 1),
      probabilityFormatted: formatProb(h, 1),
    };
  }

  if (a >= h && a >= d) {
    return {
      type: '2',
      label: `${fixture.awayTeam} Win`,
      shortLabel: '2',
      probability: a,
      probabilityPercent: getProbValue(a, 1),
      probabilityFormatted: formatProb(a, 1),
    };
  }

  return {
    type: 'X',
    label: 'Draw',
    shortLabel: 'X',
    probability: d,
    probabilityPercent: getProbValue(d, 1),
    probabilityFormatted: formatProb(d, 1),
  };
}

/**
 * Computes the highest prediction percentage across ALL market categories (1X2, Over/Under 2.5, BTTS).
 */
export function getHighestPredictionAcrossAllMarkets(fixture: Fixture): PickInfo {
  const p = fixture.prediction;
  if (!p) return getAuthoritative1X2Pick(fixture);

  const h = p.homeWinProb ?? 0;
  const d = p.drawProb ?? 0;
  const a = p.awayWinProb ?? 0;
  const o25 = p.over25Prob ?? 0;
  const u25 = 1 - o25;
  const bttsY = p.bttsProb ?? 0;
  const bttsN = 1 - bttsY;

  const candidates: Array<{ type: PickInfo['type']; label: string; shortLabel: string; probability: number }> = [
    { type: '1', label: `${fixture.homeTeam} Win`, shortLabel: '1', probability: h },
    { type: 'X', label: 'Draw', shortLabel: 'X', probability: d },
    { type: '2', label: `${fixture.awayTeam} Win`, shortLabel: '2', probability: a },
    { type: 'O2.5', label: 'Over 2.5 Goals', shortLabel: 'O 2.5', probability: o25 },
    { type: 'U2.5', label: 'Under 2.5 Goals', shortLabel: 'U 2.5', probability: u25 },
    { type: 'BTTS_Y', label: 'Both Teams To Score (Yes)', shortLabel: 'BTTS Y', probability: bttsY },
    { type: 'BTTS_N', label: 'Both Teams To Score (No)', shortLabel: 'BTTS N', probability: bttsN },
  ];

  candidates.sort((x, y) => y.probability - x.probability);
  const best = candidates[0];

  return {
    type: best.type,
    label: best.label,
    shortLabel: best.shortLabel,
    probability: best.probability,
    probabilityPercent: getProbValue(best.probability, 1),
    probabilityFormatted: formatProb(best.probability, 1),
  };
}

export interface ValueBetInfo {
  hasValue: boolean;
  marketKey?: MarketOption['key'];
  selection: string;
  shortLabel: string;
  odds: number;
  probability: number;
  probabilityFormatted: string;
  expectedValue: number;
  evFormatted: string;
  edgePercent: number;
}

/**
 * Resolves the authoritative value bet (+EV) for a fixture, if one exists with EV >= +2%.
 */
export function getAuthoritativeValueBet(fixture: Fixture): ValueBetInfo {
  // First check if already resolved by Dixon-Coles engine
  if (fixture.profitableBet && fixture.profitableBet.expectedValue > 0.02) {
    const pb = fixture.profitableBet;
    const shortLabel = getShortMarketLabel(pb.marketKey, pb.selection);
    return {
      hasValue: true,
      marketKey: pb.marketKey,
      selection: pb.selection,
      shortLabel,
      odds: pb.odds,
      probability: pb.probability,
      probabilityFormatted: formatProb(pb.probability, 1),
      expectedValue: pb.expectedValue,
      evFormatted: formatEV(pb.expectedValue),
      edgePercent: pb.edgePercent,
    };
  }

  if (fixture.bestValueMarket && fixture.bestValueMarket.expectedValue > 0.02) {
    const bvm = fixture.bestValueMarket;
    const shortLabel = getShortMarketLabel(bvm.key, bvm.name);
    return {
      hasValue: true,
      marketKey: bvm.key,
      selection: bvm.name,
      shortLabel,
      odds: bvm.odds,
      probability: bvm.probability,
      probabilityFormatted: formatProb(bvm.probability, 1),
      expectedValue: bvm.expectedValue,
      evFormatted: formatEV(bvm.expectedValue),
      edgePercent: bvm.valueEdge || 0,
    };
  }

  // Look through markets if available
  if (fixture.markets && fixture.markets.length > 0) {
    const positiveEV = fixture.markets
      .filter((m) => m.expectedValue > 0.02)
      .sort((a, b) => b.expectedValue - a.expectedValue);

    if (positiveEV.length > 0) {
      const best = positiveEV[0];
      return {
        hasValue: true,
        marketKey: best.key,
        selection: best.name,
        shortLabel: getShortMarketLabel(best.key, best.name),
        odds: best.odds,
        probability: best.probability,
        probabilityFormatted: formatProb(best.probability, 1),
        expectedValue: best.expectedValue,
        evFormatted: formatEV(best.expectedValue),
        edgePercent: best.valueEdge || 0,
      };
    }
  }

  return {
    hasValue: false,
    selection: 'Fair Price',
    shortLabel: '-',
    odds: 0,
    probability: 0,
    probabilityFormatted: '-',
    expectedValue: 0,
    evFormatted: '-',
    edgePercent: 0,
  };
}

/**
 * Compact market label for badges in dense tables.
 */
export function getShortMarketLabel(key?: MarketOption['key'], name?: string): string {
  switch (key) {
    case 'HOME_WIN':
      return '1';
    case 'DRAW':
      return 'X';
    case 'AWAY_WIN':
      return '2';
    case 'OVER_25':
      return 'O 2.5';
    case 'UNDER_25':
      return 'U 2.5';
    case 'BTTS_YES':
      return 'BTTS Y';
    case 'BTTS_NO':
      return 'BTTS N';
    case 'DOUBLE_CHANCE_1X':
      return '1X';
    case 'DOUBLE_CHANCE_X2':
      return 'X2';
    default:
      return name ? name.substring(0, 6) : '-';
  }
}
