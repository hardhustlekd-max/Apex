import {
  DEFAULT_ENGINE_SETTINGS,
  Fixture,
  MarketKey,
  MarketOption,
} from './types.js';
import { ApexEngine } from './poisson.js';

export type HistoryMarketCategory =
  | 'ALL'
  | 'COMBOS'
  | '1X2'
  | 'DOUBLE_CHANCE'
  | 'OVER_UNDER'
  | 'BTTS'
  | 'TEAM_GOALS'
  | 'SPECIALS';

export type MarketOutcomeState = 'WON' | 'LOST' | 'VOID';

export const HISTORY_MARKET_CATEGORIES: Array<{
  id: HistoryMarketCategory;
  label: string;
}> = [
  { id: 'ALL', label: 'All Markets' },
  { id: 'COMBOS', label: 'Combos' },
  { id: '1X2', label: '1X2' },
  { id: 'DOUBLE_CHANCE', label: 'Double Chance' },
  { id: 'OVER_UNDER', label: 'Over / Under' },
  { id: 'BTTS', label: 'BTTS' },
  { id: 'TEAM_GOALS', label: 'Team Goals' },
  { id: 'SPECIALS', label: 'Specials' },
];

export const TRIVIAL_EXTREME_LINES = new Set<string>([
  'UNDER_45',
  'HOME_UNDER_25',
  'AWAY_UNDER_25',
]);

export function isZeroFiveGoalsKey(rawKey?: string | null): boolean {
  const k = String(rawKey || '').trim().toUpperCase();
  if (!k) return false;
  return (
    k === 'OVER_05' ||
    k === 'UNDER_05' ||
    k === 'HOME_OVER_05' ||
    k === 'HOME_UNDER_05' ||
    k === 'AWAY_OVER_05' ||
    k === 'AWAY_UNDER_05' ||
    /(?:^|_)05(?:_|$)/.test(k)
  );
}

export const SPECIFIC_MARKET_OPTIONS_BY_CATEGORY: Record<
  Exclude<HistoryMarketCategory, 'ALL'>,
  Array<{ key: string; label: string }>
> = {
  COMBOS: [
    { key: 'COMBO_1X_OVER_15', label: '1X & Over 1.5 Goals' },
    { key: 'COMBO_X2_OVER_15', label: 'X2 & Over 1.5 Goals' },
    { key: 'COMBO_12_OVER_15', label: '12 & Over 1.5 Goals' },
    { key: 'COMBO_1X_OVER_25', label: '1X & Over 2.5 Goals' },
    { key: 'COMBO_X2_OVER_25', label: 'X2 & Over 2.5 Goals' },
    { key: 'COMBO_12_OVER_25', label: '12 & Over 2.5 Goals' },
    { key: 'COMBO_1X_UNDER_25', label: '1X & Under 2.5 Goals' },
    { key: 'COMBO_X2_UNDER_25', label: 'X2 & Under 2.5 Goals' },
    { key: 'COMBO_1X_UNDER_35', label: '1X & Under 3.5 Goals' },
    { key: 'COMBO_X2_UNDER_35', label: 'X2 & Under 3.5 Goals' },
    { key: 'COMBO_12_UNDER_35', label: '12 & Under 3.5 Goals' },
    { key: 'COMBO_1_OVER_15', label: 'Home Win & Over 1.5' },
    { key: 'COMBO_2_OVER_15', label: 'Away Win & Over 1.5' },
    { key: 'COMBO_1_OVER_25', label: 'Home Win & Over 2.5' },
    { key: 'COMBO_2_OVER_25', label: 'Away Win & Over 2.5' },
    { key: 'COMBO_1_OVER_35', label: 'Home Win & Over 3.5' },
    { key: 'COMBO_2_OVER_35', label: 'Away Win & Over 3.5' },
    { key: 'COMBO_1_UNDER_25', label: 'Home Win & Under 2.5' },
    { key: 'COMBO_2_UNDER_25', label: 'Away Win & Under 2.5' },
    { key: 'COMBO_1_UNDER_35', label: 'Home Win & Under 3.5' },
    { key: 'COMBO_2_UNDER_35', label: 'Away Win & Under 3.5' },
    { key: 'COMBO_X_UNDER_25', label: 'Draw & Under 2.5' },
    { key: 'COMBO_X_OVER_15', label: 'Draw & Over 1.5' },
    { key: 'COMBO_1_BTTS', label: 'Home Win & BTTS Yes' },
    { key: 'COMBO_2_BTTS', label: 'Away Win & BTTS Yes' },
    { key: 'COMBO_X_BTTS', label: 'Draw & BTTS Yes' },
    { key: 'COMBO_1X_BTTS', label: '1X & BTTS Yes' },
    { key: 'COMBO_X2_BTTS', label: 'X2 & BTTS Yes' },
    { key: 'COMBO_12_BTTS', label: '12 & BTTS Yes' },
    { key: 'COMBO_BTTS_OVER_25', label: 'BTTS Yes & Over 2.5' },
    { key: 'COMBO_BTTS_OVER_35', label: 'BTTS Yes & Over 3.5' },
    { key: 'COMBO_BTTS_UNDER_35', label: 'BTTS Yes & Under 3.5' },
    { key: 'COMBO_BTTS_NO_UNDER_25', label: 'BTTS No & Under 2.5' },
    { key: 'HOME_WIN_TO_NIL', label: 'Home Win to Nil' },
    { key: 'AWAY_WIN_TO_NIL', label: 'Away Win to Nil' },
  ],
  '1X2': [
    { key: 'HOME_WIN', label: 'Home Win (1)' },
    { key: 'DRAW', label: 'Draw (X)' },
    { key: 'AWAY_WIN', label: 'Away Win (2)' },
  ],
  DOUBLE_CHANCE: [
    { key: 'DOUBLE_CHANCE_1X', label: 'Home or Draw (1X)' },
    { key: 'DOUBLE_CHANCE_X2', label: 'Draw or Away (X2)' },
    { key: 'DOUBLE_CHANCE_12', label: 'Home or Away (12)' },
    { key: 'DNB_HOME', label: 'Draw No Bet - Home' },
    { key: 'DNB_AWAY', label: 'Draw No Bet - Away' },
  ],
  OVER_UNDER: [
    { key: 'OVER_15', label: 'Over 1.5 Goals' },
    { key: 'UNDER_15', label: 'Under 1.5 Goals' },
    { key: 'OVER_25', label: 'Over 2.5 Goals' },
    { key: 'UNDER_25', label: 'Under 2.5 Goals' },
    { key: 'OVER_35', label: 'Over 3.5 Goals' },
    { key: 'UNDER_35', label: 'Under 3.5 Goals' },
    { key: 'OVER_45', label: 'Over 4.5 Goals' },
    { key: 'UNDER_45', label: 'Under 4.5 Goals' },
  ],
  BTTS: [
    { key: 'BTTS_YES', label: 'Both Teams to Score (Yes)' },
    { key: 'BTTS_NO', label: 'Both Teams to Score (No)' },
  ],
  TEAM_GOALS: [
    { key: 'HOME_OVER_15', label: 'Home Over 1.5 Goals' },
    { key: 'HOME_UNDER_15', label: 'Home Under 1.5 Goals' },
    { key: 'HOME_OVER_25', label: 'Home Over 2.5 Goals' },
    { key: 'HOME_UNDER_25', label: 'Home Under 2.5 Goals' },
    { key: 'AWAY_OVER_15', label: 'Away Over 1.5 Goals' },
    { key: 'AWAY_UNDER_15', label: 'Away Under 1.5 Goals' },
    { key: 'AWAY_OVER_25', label: 'Away Over 2.5 Goals' },
    { key: 'AWAY_UNDER_25', label: 'Away Under 2.5 Goals' },
    { key: 'HOME_CLEAN_SHEET', label: 'Home Clean Sheet' },
    { key: 'AWAY_CLEAN_SHEET', label: 'Away Clean Sheet' },
  ],
  SPECIALS: [
    { key: 'HANDICAP_HOME_MINUS_1', label: 'Home (-1.5) Handicap' },
    { key: 'HANDICAP_AWAY_MINUS_1', label: 'Away (-1.5) Handicap' },
    { key: 'MULTIGOALS_1_3', label: 'Multi-Goals: 1 - 3' },
    { key: 'MULTIGOALS_2_4', label: 'Multi-Goals: 2 - 4' },
    { key: 'MULTIGOALS_2_5', label: 'Multi-Goals: 2 - 5' },
    { key: 'GOALS_ODD', label: 'Total Goals - Odd' },
    { key: 'GOALS_EVEN', label: 'Total Goals - Even' },
  ],
};

export function normalizeMarketKey(rawKey?: string | null): string {
  const k = String(rawKey || '').trim().toUpperCase();
  if (k === 'HOME' || k === '1') return 'HOME_WIN';
  if (k === 'AWAY' || k === '2') return 'AWAY_WIN';
  if (k === 'X') return 'DRAW';
  if (k === '1X') return 'DOUBLE_CHANCE_1X';
  if (k === 'X2') return 'DOUBLE_CHANCE_X2';
  if (k === '12') return 'DOUBLE_CHANCE_12';
  if (k === 'BTTS') return 'BTTS_YES';
  return k;
}

export function getHistoryMarketCategory(key: string): Exclude<HistoryMarketCategory, 'ALL'> {
  const k = normalizeMarketKey(key);
  if (k === 'HOME_WIN' || k === 'DRAW' || k === 'AWAY_WIN') return '1X2';
  if (k.startsWith('DOUBLE_CHANCE_') || k.startsWith('DNB_')) return 'DOUBLE_CHANCE';
  if (k.startsWith('OVER_') || k.startsWith('UNDER_')) return 'OVER_UNDER';
  if (k.startsWith('BTTS_')) return 'BTTS';
  if (k.startsWith('COMBO_') || k === 'HOME_WIN_TO_NIL' || k === 'AWAY_WIN_TO_NIL') return 'COMBOS';
  if (k.startsWith('HOME_') || k.startsWith('AWAY_')) return 'TEAM_GOALS';
  return 'SPECIALS';
}

export type UpcomingMarketCategoryKey =
  | 'MOST_LIKELY'
  | 'POPULAR'
  | Exclude<HistoryMarketCategory, 'ALL'>;

export const UPCOMING_MARKET_CATEGORIES: Array<{
  key: UpcomingMarketCategoryKey;
  label: string;
}> = [
  { key: 'MOST_LIKELY', label: 'Most Likely (All Markets)' },
  { key: 'POPULAR', label: 'Popular (Top 3 Markets)' },
  { key: 'COMBOS', label: 'Combo Bet Markets' },
  { key: '1X2', label: '1X2 Match Winner' },
  { key: 'DOUBLE_CHANCE', label: 'Double Chance & DNB' },
  { key: 'OVER_UNDER', label: 'Over / Under Goals' },
  { key: 'BTTS', label: 'Both Teams to Score' },
  { key: 'TEAM_GOALS', label: 'Team Goals & Clean Sheets' },
  { key: 'SPECIALS', label: 'Specials (Handicaps & Multi-Goals)' },
];

const UPCOMING_CATEGORY_KEYS = new Set<string>(UPCOMING_MARKET_CATEGORIES.map((c) => c.key));

export function parseUpcomingMarketFilter(rawFilter?: string | null): {
  category: HistoryMarketCategory | 'POPULAR';
  specificMarket: string;
} {
  const normalized = String(rawFilter || 'MOST_LIKELY').trim().toUpperCase();
  if (!normalized || normalized === 'MOST_LIKELY' || normalized === 'ALL') {
    return { category: 'ALL', specificMarket: 'AUTO' };
  }
  if (normalized === 'POPULAR') {
    return { category: 'POPULAR', specificMarket: 'AUTO' };
  }
  if (UPCOMING_CATEGORY_KEYS.has(normalized)) {
    return {
      category: normalized as Exclude<HistoryMarketCategory, 'ALL'>,
      specificMarket: 'AUTO',
    };
  }
  const canonicalKey = normalizeMarketKey(normalized);
  return {
    category: getHistoryMarketCategory(canonicalKey),
    specificMarket: canonicalKey,
  };
}

export function getUpcomingMarketFilterDisplayLabel(rawFilter?: string | null): string {
  const normalized = String(rawFilter || 'MOST_LIKELY').trim().toUpperCase();
  const catMatch = UPCOMING_MARKET_CATEGORIES.find((c) => c.key === normalized);
  if (catMatch) return catMatch.label;
  const canonicalKey = normalizeMarketKey(normalized);
  for (const cat of Object.keys(SPECIFIC_MARKET_OPTIONS_BY_CATEGORY) as Array<
    Exclude<HistoryMarketCategory, 'ALL'>
  >) {
    const found = SPECIFIC_MARKET_OPTIONS_BY_CATEGORY[cat].find((m) => m.key === canonicalKey);
    if (found) return found.label;
  }
  return normalized || 'Most Likely (All Markets)';
}

export function evaluateMarketOutcome(
  rawMarketKey: string,
  hG: number,
  aG: number
): MarketOutcomeState {
  const k = normalizeMarketKey(rawMarketKey);
  const totalGoals = hG + aG;
  const bothScored = hG > 0 && aG > 0;

  const csMatch = /^CORRECT_SCORE_(\d+)_(\d+)$/.exec(k);
  if (csMatch) {
    return hG === Number(csMatch[1]) && aG === Number(csMatch[2]) ? 'WON' : 'LOST';
  }

  switch (k) {
    case 'HOME_WIN':
      return hG > aG ? 'WON' : 'LOST';
    case 'AWAY_WIN':
      return aG > hG ? 'WON' : 'LOST';
    case 'DRAW':
      return hG === aG ? 'WON' : 'LOST';

    case 'DOUBLE_CHANCE_1X':
      return hG >= aG ? 'WON' : 'LOST';
    case 'DOUBLE_CHANCE_X2':
      return aG >= hG ? 'WON' : 'LOST';
    case 'DOUBLE_CHANCE_12':
      return hG !== aG ? 'WON' : 'LOST';

    case 'DNB_HOME':
      return hG === aG ? 'VOID' : hG > aG ? 'WON' : 'LOST';
    case 'DNB_AWAY':
      return hG === aG ? 'VOID' : aG > hG ? 'WON' : 'LOST';

    case 'OVER_05':
      return totalGoals >= 1 ? 'WON' : 'LOST';
    case 'UNDER_05':
      return totalGoals === 0 ? 'WON' : 'LOST';
    case 'OVER_15':
      return totalGoals >= 2 ? 'WON' : 'LOST';
    case 'UNDER_15':
      return totalGoals <= 1 ? 'WON' : 'LOST';
    case 'OVER_25':
      return totalGoals >= 3 ? 'WON' : 'LOST';
    case 'UNDER_25':
      return totalGoals <= 2 ? 'WON' : 'LOST';
    case 'OVER_35':
      return totalGoals >= 4 ? 'WON' : 'LOST';
    case 'UNDER_35':
      return totalGoals <= 3 ? 'WON' : 'LOST';
    case 'OVER_45':
      return totalGoals >= 5 ? 'WON' : 'LOST';
    case 'UNDER_45':
      return totalGoals <= 4 ? 'WON' : 'LOST';

    case 'BTTS_YES':
      return bothScored ? 'WON' : 'LOST';
    case 'BTTS_NO':
      return !bothScored ? 'WON' : 'LOST';

    case 'COMBO_1_OVER_15':
      return hG > aG && totalGoals >= 2 ? 'WON' : 'LOST';
    case 'COMBO_2_OVER_15':
      return aG > hG && totalGoals >= 2 ? 'WON' : 'LOST';
    case 'COMBO_1_OVER_25':
      return hG > aG && totalGoals >= 3 ? 'WON' : 'LOST';
    case 'COMBO_2_OVER_25':
      return aG > hG && totalGoals >= 3 ? 'WON' : 'LOST';
    case 'COMBO_1_OVER_35':
      return hG > aG && totalGoals >= 4 ? 'WON' : 'LOST';
    case 'COMBO_2_OVER_35':
      return aG > hG && totalGoals >= 4 ? 'WON' : 'LOST';
    case 'COMBO_1_UNDER_25':
      return hG > aG && totalGoals <= 2 ? 'WON' : 'LOST';
    case 'COMBO_2_UNDER_25':
      return aG > hG && totalGoals <= 2 ? 'WON' : 'LOST';
    case 'COMBO_1_UNDER_35':
      return hG > aG && totalGoals <= 3 ? 'WON' : 'LOST';
    case 'COMBO_2_UNDER_35':
      return aG > hG && totalGoals <= 3 ? 'WON' : 'LOST';
    case 'COMBO_X_UNDER_25':
      return hG === aG && totalGoals <= 2 ? 'WON' : 'LOST';
    case 'COMBO_X_OVER_15':
      return hG === aG && totalGoals >= 2 ? 'WON' : 'LOST';
    case 'COMBO_X_BTTS':
      return hG === aG && bothScored ? 'WON' : 'LOST';
    case 'COMBO_1_BTTS':
      return hG > aG && bothScored ? 'WON' : 'LOST';
    case 'COMBO_2_BTTS':
      return aG > hG && bothScored ? 'WON' : 'LOST';
    case 'COMBO_1X_OVER_15':
      return hG >= aG && totalGoals >= 2 ? 'WON' : 'LOST';
    case 'COMBO_X2_OVER_15':
      return aG >= hG && totalGoals >= 2 ? 'WON' : 'LOST';
    case 'COMBO_12_OVER_15':
      return hG !== aG && totalGoals >= 2 ? 'WON' : 'LOST';
    case 'COMBO_1X_OVER_25':
      return hG >= aG && totalGoals >= 3 ? 'WON' : 'LOST';
    case 'COMBO_X2_OVER_25':
      return aG >= hG && totalGoals >= 3 ? 'WON' : 'LOST';
    case 'COMBO_12_OVER_25':
      return hG !== aG && totalGoals >= 3 ? 'WON' : 'LOST';
    case 'COMBO_1X_UNDER_25':
      return hG >= aG && totalGoals <= 2 ? 'WON' : 'LOST';
    case 'COMBO_X2_UNDER_25':
      return aG >= hG && totalGoals <= 2 ? 'WON' : 'LOST';
    case 'COMBO_1X_UNDER_35':
      return hG >= aG && totalGoals <= 3 ? 'WON' : 'LOST';
    case 'COMBO_X2_UNDER_35':
      return aG >= hG && totalGoals <= 3 ? 'WON' : 'LOST';
    case 'COMBO_12_UNDER_35':
      return hG !== aG && totalGoals <= 3 ? 'WON' : 'LOST';
    case 'COMBO_1X_BTTS':
      return hG >= aG && bothScored ? 'WON' : 'LOST';
    case 'COMBO_X2_BTTS':
      return aG >= hG && bothScored ? 'WON' : 'LOST';
    case 'COMBO_12_BTTS':
      return hG !== aG && bothScored ? 'WON' : 'LOST';
    case 'COMBO_BTTS_OVER_25':
      return bothScored && totalGoals >= 3 ? 'WON' : 'LOST';
    case 'COMBO_BTTS_OVER_35':
      return bothScored && totalGoals >= 4 ? 'WON' : 'LOST';
    case 'COMBO_BTTS_UNDER_35':
      return bothScored && totalGoals <= 3 ? 'WON' : 'LOST';
    case 'COMBO_BTTS_NO_UNDER_25':
      return !bothScored && totalGoals <= 2 ? 'WON' : 'LOST';

    case 'HOME_OVER_05':
      return hG >= 1 ? 'WON' : 'LOST';
    case 'HOME_UNDER_05':
      return hG === 0 ? 'WON' : 'LOST';
    case 'HOME_OVER_15':
      return hG >= 2 ? 'WON' : 'LOST';
    case 'HOME_UNDER_15':
      return hG <= 1 ? 'WON' : 'LOST';
    case 'HOME_OVER_25':
      return hG >= 3 ? 'WON' : 'LOST';
    case 'HOME_UNDER_25':
      return hG <= 2 ? 'WON' : 'LOST';

    case 'AWAY_OVER_05':
      return aG >= 1 ? 'WON' : 'LOST';
    case 'AWAY_UNDER_05':
      return aG === 0 ? 'WON' : 'LOST';
    case 'AWAY_OVER_15':
      return aG >= 2 ? 'WON' : 'LOST';
    case 'AWAY_UNDER_15':
      return aG <= 1 ? 'WON' : 'LOST';
    case 'AWAY_OVER_25':
      return aG >= 3 ? 'WON' : 'LOST';
    case 'AWAY_UNDER_25':
      return aG <= 2 ? 'WON' : 'LOST';

    case 'HOME_CLEAN_SHEET':
      return aG === 0 ? 'WON' : 'LOST';
    case 'AWAY_CLEAN_SHEET':
      return hG === 0 ? 'WON' : 'LOST';

    case 'HOME_WIN_TO_NIL':
      return hG > aG && aG === 0 ? 'WON' : 'LOST';
    case 'AWAY_WIN_TO_NIL':
      return aG > hG && hG === 0 ? 'WON' : 'LOST';
    case 'HANDICAP_HOME_MINUS_1':
      return hG - aG >= 2 ? 'WON' : 'LOST';
    case 'HANDICAP_AWAY_MINUS_1':
      return aG - hG >= 2 ? 'WON' : 'LOST';

    case 'MULTIGOALS_1_3':
      return totalGoals >= 1 && totalGoals <= 3 ? 'WON' : 'LOST';
    case 'MULTIGOALS_2_4':
      return totalGoals >= 2 && totalGoals <= 4 ? 'WON' : 'LOST';
    case 'MULTIGOALS_2_5':
      return totalGoals >= 2 && totalGoals <= 5 ? 'WON' : 'LOST';
    case 'GOALS_ODD':
      return totalGoals % 2 === 1 ? 'WON' : 'LOST';
    case 'GOALS_EVEN':
      return totalGoals % 2 === 0 ? 'WON' : 'LOST';

    default:
      return 'LOST';
  }
}

export function getGenericMarketLabel(key: string, homeTeam = 'Home', awayTeam = 'Away'): string {
  const k = normalizeMarketKey(key);
  for (const cat of Object.keys(SPECIFIC_MARKET_OPTIONS_BY_CATEGORY) as Array<
    Exclude<HistoryMarketCategory, 'ALL'>
  >) {
    const found = SPECIFIC_MARKET_OPTIONS_BY_CATEGORY[cat].find((m) => m.key === k);
    if (found) {
      return found.label
        .replace(/^Home\b/, homeTeam)
        .replace(/^Away\b/, awayTeam);
    }
  }
  return k;
}

export function getFixtureMarketsForEvaluation(f: Fixture): MarketOption[] {
  if (f.markets && f.markets.length > 0 && f.markets.some((m) => m.key === 'OVER_25')) {
    return f.markets.filter((m) => !isZeroFiveGoalsKey(m.key));
  }
  if (f.prediction) {
    try {
      const calc = ApexEngine.calculateMarkets(
        f.prediction,
        DEFAULT_ENGINE_SETTINGS,
        f.homeTeam,
        f.awayTeam
      );
      return (calc.markets || []).filter((m) => !isZeroFiveGoalsKey(m.key));
    } catch {
      const p = f.prediction;
      const hw = Number(p.homeWinProb ?? 0);
      const dr = Number(p.drawProb ?? 0);
      const aw = Number(p.awayWinProb ?? 0);
      const o25 = Number(p.over25Prob ?? 0.5);
      const btts = Number(p.bttsProb ?? 0.5);
      return [
        { key: 'HOME_WIN', name: `${f.homeTeam} to Win`, probability: hw, isBanker: hw >= 0.72 },
        { key: 'DRAW', name: 'Draw', probability: dr, isBanker: dr >= 0.72 },
        { key: 'AWAY_WIN', name: `${f.awayTeam} to Win`, probability: aw, isBanker: aw >= 0.72 },
        { key: 'DOUBLE_CHANCE_1X', name: `${f.homeTeam} or Draw (1X)`, probability: Math.min(0.99, hw + dr), isBanker: hw + dr >= 0.72 },
        { key: 'DOUBLE_CHANCE_X2', name: `Draw or ${f.awayTeam} (X2)`, probability: Math.min(0.99, aw + dr), isBanker: aw + dr >= 0.72 },
        { key: 'OVER_25', name: 'Over 2.5 Goals', probability: o25, isBanker: o25 >= 0.72 },
        { key: 'UNDER_25', name: 'Under 2.5 Goals', probability: Math.max(0, 1 - o25), isBanker: 1 - o25 >= 0.72 },
        { key: 'BTTS_YES', name: 'Both Teams to Score (Yes)', probability: btts, isBanker: btts >= 0.72 },
        { key: 'BTTS_NO', name: 'Both Teams to Score (No)', probability: 1 - btts, isBanker: 1 - btts >= 0.72 },
      ];
    }
  }
  if (f.markets && f.markets.length > 0) {
    return f.markets.filter((m) => !isZeroFiveGoalsKey(m.key));
  }
  return [];
}

export interface EvaluatedMarketDetail {
  key: MarketKey | string;
  name: string;
  category: Exclude<HistoryMarketCategory, 'ALL'>;
  probability: number;
  outcome: MarketOutcomeState;
  isCorrect: boolean;
}

export interface FixtureEvaluationResult {
  hasMatch: boolean;
  hG: number;
  aG: number;
  pickKey: string;
  predictedLabel: string;
  pickCategory: Exclude<HistoryMarketCategory, 'ALL'>;
  topProb: number;
  outcome: MarketOutcomeState;
  isCorrect: boolean;
  allEvaluatedMarkets: EvaluatedMarketDetail[];
}

export function evaluateFixtureForMarketFilter(
  f: Fixture,
  category: HistoryMarketCategory = 'ALL',
  specificMarketKey = 'AUTO'
): FixtureEvaluationResult {
  const hG = f.score?.home ?? 0;
  const aG = f.score?.away ?? 0;
  const markets = getFixtureMarketsForEvaluation(f);

  const allEvaluatedMarkets: EvaluatedMarketDetail[] = markets.map((m) => {
    const normKey = normalizeMarketKey(m.key);
    const outcome = evaluateMarketOutcome(normKey, hG, aG);
    return {
      key: normKey,
      name: m.name,
      category: getHistoryMarketCategory(normKey),
      probability: Number(m.probability ?? 0),
      outcome,
      isCorrect: outcome === 'WON',
    };
  });

  if (allEvaluatedMarkets.length === 0) {
    return {
      hasMatch: false,
      hG,
      aG,
      pickKey: 'N/A',
      predictedLabel: 'N/A',
      pickCategory: '1X2',
      topProb: 0,
      outcome: 'LOST',
      isCorrect: false,
      allEvaluatedMarkets: [],
    };
  }

  let selected: EvaluatedMarketDetail | undefined;

  if (specificMarketKey && specificMarketKey !== 'AUTO') {
    const targetKey = normalizeMarketKey(specificMarketKey);
    selected = allEvaluatedMarkets.find((m) => m.key === targetKey);
  } else {
    let pool =
      category === 'ALL'
        ? allEvaluatedMarkets.filter((m) => !TRIVIAL_EXTREME_LINES.has(String(m.key)))
        : allEvaluatedMarkets.filter((m) => m.category === category);

    if (pool.length === 0 && category === 'ALL') {
      pool = allEvaluatedMarkets;
    }

    if (pool.length > 0) {
      selected = pool.reduce((best, cur) =>
        cur.probability > best.probability ? cur : best
      );
    }
  }

  if (!selected) {
    return {
      hasMatch: false,
      hG,
      aG,
      pickKey: specificMarketKey || 'N/A',
      predictedLabel: getGenericMarketLabel(specificMarketKey, f.homeTeam, f.awayTeam),
      pickCategory: category === 'ALL' ? '1X2' : category,
      topProb: 0,
      outcome: 'LOST',
      isCorrect: false,
      allEvaluatedMarkets,
    };
  }

  return {
    hasMatch: true,
    hG,
    aG,
    pickKey: String(selected.key),
    predictedLabel: selected.name,
    pickCategory: selected.category,
    topProb: selected.probability,
    outcome: selected.outcome,
    isCorrect: selected.isCorrect,
    allEvaluatedMarkets,
  };
}
