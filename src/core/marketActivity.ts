import {
  SPECIFIC_MARKET_OPTIONS_BY_CATEGORY,
  getGenericMarketLabel,
  isZeroFiveGoalsKey,
  normalizeMarketKey,
} from './marketEvaluator.js';

export interface MarketActivityRecord {
  count: number;
  lastSelectedAt: number;
}

export interface PopularMarketEntry {
  key: string;
  label: string;
  shortLabel: string;
  count: number;
  isFromActivity: boolean;
}

export const DEFAULT_POPULAR_MARKET_KEYS: readonly string[] = [
  'OVER_25',
  'BTTS_YES',
  'DOUBLE_CHANCE_1X',
];

const STORAGE_KEY = 'apex_user_market_activity_v1';
const ACTIVITY_EVENT = 'apex:market-activity-updated';

const CATEGORY_REPRESENTATIVE_MARKET: Record<string, string> = {
  '1X2': 'HOME_WIN',
  OVER_UNDER: 'OVER_25',
  DOUBLE_CHANCE: 'DOUBLE_CHANCE_1X',
  BTTS: 'BTTS_YES',
  COMBOS: 'COMBO_1X_OVER_15',
  TEAM_GOALS: 'HOME_OVER_15',
  SPECIALS: 'MULTIGOALS_1_3',
};

const KNOWN_MARKET_LABELS: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const list of Object.values(SPECIFIC_MARKET_OPTIONS_BY_CATEGORY)) {
    for (const opt of list) {
      map.set(opt.key, opt.label);
    }
  }
  return map;
})();

const VALID_SPECIFIC_MARKET_KEYS = new Set<string>(KNOWN_MARKET_LABELS.keys());

export function getShortMarketTag(rawKey: string): string {
  const k = normalizeMarketKey(rawKey);
  switch (k) {
    case 'HOME_WIN': return 'Home (1)';
    case 'DRAW': return 'Draw (X)';
    case 'AWAY_WIN': return 'Away (2)';
    case 'DOUBLE_CHANCE_1X': return '1X';
    case 'DOUBLE_CHANCE_X2': return 'X2';
    case 'DOUBLE_CHANCE_12': return '12';
    case 'DNB_HOME': return '1 DNB';
    case 'DNB_AWAY': return '2 DNB';
    case 'OVER_15': return 'Over 1.5';
    case 'UNDER_15': return 'Under 1.5';
    case 'OVER_25': return 'Over 2.5';
    case 'UNDER_25': return 'Under 2.5';
    case 'OVER_35': return 'Over 3.5';
    case 'UNDER_35': return 'Under 3.5';
    case 'OVER_45': return 'Over 4.5';
    case 'UNDER_45': return 'Under 4.5';
    case 'BTTS_YES': return 'BTTS Yes';
    case 'BTTS_NO': return 'BTTS No';
    case 'HOME_OVER_15': return 'Home O1.5';
    case 'HOME_UNDER_15': return 'Home U1.5';
    case 'HOME_OVER_25': return 'Home O2.5';
    case 'HOME_UNDER_25': return 'Home U2.5';
    case 'AWAY_OVER_15': return 'Away O1.5';
    case 'AWAY_UNDER_15': return 'Away U1.5';
    case 'AWAY_OVER_25': return 'Away O2.5';
    case 'AWAY_UNDER_25': return 'Away U2.5';
    case 'HOME_CLEAN_SHEET': return 'Home CS';
    case 'AWAY_CLEAN_SHEET': return 'Away CS';
    case 'HOME_WIN_TO_NIL': return 'Home Win to Nil';
    case 'AWAY_WIN_TO_NIL': return 'Away Win to Nil';
    case 'HANDICAP_HOME_MINUS_1': return 'Home -1.5';
    case 'HANDICAP_AWAY_MINUS_1': return 'Away -1.5';
    case 'MULTIGOALS_1_3': return 'MG 1-3';
    case 'MULTIGOALS_2_4': return 'MG 2-4';
    case 'MULTIGOALS_2_5': return 'MG 2-5';
    case 'GOALS_ODD': return 'Odd Goals';
    case 'GOALS_EVEN': return 'Even Goals';
    default:
      return KNOWN_MARKET_LABELS.get(k) || getGenericMarketLabel(k, 'Home', 'Away');
  }
}

export function getMarketDisplayLabel(rawKey: string): string {
  const k = normalizeMarketKey(rawKey);
  return KNOWN_MARKET_LABELS.get(k) || getGenericMarketLabel(k, 'Home', 'Away');
}

function readStoredActivity(): Record<string, MarketActivityRecord> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const cleaned: Record<string, MarketActivityRecord> = {};
    for (const [key, val] of Object.entries(parsed as Record<string, any>)) {
      const norm = normalizeMarketKey(key);
      if (!norm || isZeroFiveGoalsKey(norm)) continue;
      if (
        norm === 'MOST_LIKELY' ||
        norm === 'ALL' ||
        norm === 'AUTO' ||
        norm === 'POPULAR' ||
        CATEGORY_REPRESENTATIVE_MARKET[norm]
      ) {
        continue;
      }
      const count = Number(val?.count ?? 0);
      const lastSelectedAt = Number(val?.lastSelectedAt ?? 0);
      if (Number.isFinite(count) && count > 0) {
        cleaned[norm] = {
          count,
          lastSelectedAt: Number.isFinite(lastSelectedAt) ? lastSelectedAt : 0,
        };
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeStoredActivity(map: Record<string, MarketActivityRecord>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function resolveTrackedMarketKey(rawKey?: string | null): {
  marketKey: string | null;
  isCategoryLevel: boolean;
} {
  const k = normalizeMarketKey(rawKey);
  if (!k || k === 'MOST_LIKELY' || k === 'ALL' || k === 'AUTO' || k === 'POPULAR') {
    return { marketKey: null, isCategoryLevel: false };
  }
  if (CATEGORY_REPRESENTATIVE_MARKET[k]) {
    const rep = CATEGORY_REPRESENTATIVE_MARKET[k];
    return isZeroFiveGoalsKey(rep)
      ? { marketKey: null, isCategoryLevel: true }
      : { marketKey: rep, isCategoryLevel: true };
  }
  if (isZeroFiveGoalsKey(k)) {
    return { marketKey: null, isCategoryLevel: false };
  }
  if (VALID_SPECIFIC_MARKET_KEYS.has(k) || k.startsWith('COMBO_') || k.startsWith('CORRECT_SCORE_')) {
    return { marketKey: k, isCategoryLevel: false };
  }
  return { marketKey: null, isCategoryLevel: false };
}

export function recordMarketActivity(
  marketOrFilterKey?: string | null,
  source: 'SPECIFIC_FILTER' | 'CATEGORY_FILTER' | 'BET_SLIP' = 'SPECIFIC_FILTER'
): PopularMarketEntry[] {
  const { marketKey, isCategoryLevel } = resolveTrackedMarketKey(marketOrFilterKey);
  if (!marketKey) {
    return getTopPopularMarkets(3);
  }

  const current = readStoredActivity();
  const weight = isCategoryLevel ? 1 : source === 'BET_SLIP' || source === 'SPECIFIC_FILTER' ? 2 : 1;
  const prev = current[marketKey] || { count: 0, lastSelectedAt: 0 };

  current[marketKey] = {
    count: prev.count + weight,
    lastSelectedAt: Date.now(),
  };

  writeStoredActivity(current);
  return getTopPopularMarkets(3);
}

export function getTopPopularMarkets(limit = 3): PopularMarketEntry[] {
  const stored = readStoredActivity();
  const sortedEntries = Object.entries(stored)
    .filter(([key, val]) => !isZeroFiveGoalsKey(key) && val.count > 0)
    .sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return b[1].lastSelectedAt - a[1].lastSelectedAt;
    })
    .slice(0, limit);

  const result: PopularMarketEntry[] = sortedEntries.map(([key, val]) => ({
    key,
    label: getMarketDisplayLabel(key),
    shortLabel: getShortMarketTag(key),
    count: val.count,
    isFromActivity: true,
  }));

  for (const fallbackKey of DEFAULT_POPULAR_MARKET_KEYS) {
    if (result.length >= limit) break;
    if (result.some((item) => item.key === fallbackKey)) continue;
    result.push({
      key: fallbackKey,
      label: getMarketDisplayLabel(fallbackKey),
      shortLabel: getShortMarketTag(fallbackKey),
      count: 0,
      isFromActivity: false,
    });
  }

  return result;
}

export function getPopularMarketKeys(limit = 3): string[] {
  return getTopPopularMarkets(limit).map((m) => m.key);
}

export function subscribeMarketActivity(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onCustom = () => listener();
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener(ACTIVITY_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(ACTIVITY_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
