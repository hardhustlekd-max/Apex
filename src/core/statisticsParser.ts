/**
 * Dynamic Statistics Parser for Flashscore Match Responses
 * Parses and normalizes dynamic category values (percentages, counts, ratios)
 * and computes visual comparison shares and logical groupings.
 */

export type StatValueType = 'PERCENTAGE' | 'COUNT' | 'RATIO' | 'TEXT';

export type StatCategoryGroup = 'ALL' | 'OVERVIEW' | 'ATTACKING' | 'PASSING' | 'DEFENDING';

export interface ParsedStatValue {
  raw: string;
  numeric: number;
  type: StatValueType;
  unit?: string;
  total?: number;
}

export interface ParsedStatisticItem {
  category: string;
  group: StatCategoryGroup;
  home: ParsedStatValue;
  away: ParsedStatValue;
  homeSharePercent: number; // 0-100 for visual progress comparison
  awaySharePercent: number; // 0-100 for visual progress comparison
  leader: 'HOME' | 'AWAY' | 'TIED';
  isInverseMetric: boolean; // True for Fouls, Cards (higher is worse)
}

export interface ParsedStatisticsSummary {
  items: ParsedStatisticItem[];
  availableGroups: { group: StatCategoryGroup; label: string; count: number }[];
  possession?: { home: number; away: number };
  totalShots?: { home: number; away: number };
  shotsOnTarget?: { home: number; away: number };
  corners?: { home: number; away: number };
  fouls?: { home: number; away: number };
}

/**
 * Parses individual value string or number into structured numerical representation
 */
export function parseStatValue(rawInput?: string | number | null): ParsedStatValue {
  if (rawInput === undefined || rawInput === null) {
    return { raw: '0', numeric: 0, type: 'COUNT' };
  }

  const str = String(rawInput).trim();
  if (!str) {
    return { raw: '0', numeric: 0, type: 'COUNT' };
  }

  // 1. Percentage: e.g. "57%" or "57.5 %"
  if (str.includes('%')) {
    const num = parseFloat(str.replace(/[^0-9.]/g, '')) || 0;
    return {
      raw: str,
      numeric: num,
      type: 'PERCENTAGE',
      unit: '%',
    };
  }

  // 2. Ratio / Compound: e.g. "435/512" or "8/12"
  if (str.includes('/')) {
    const parts = str.split('/');
    const first = parseFloat(parts[0].replace(/[^0-9.]/g, '')) || 0;
    const second = parseFloat(parts[1].replace(/[^0-9.]/g, '')) || 0;
    return {
      raw: str,
      numeric: first,
      total: second,
      type: 'RATIO',
    };
  }

  // 3. Integer / Decimal Count: e.g. "14" or "3.5"
  const cleanNum = parseFloat(str.replace(/[^0-9.-]/g, ''));
  if (!isNaN(cleanNum)) {
    return {
      raw: str,
      numeric: cleanNum,
      type: 'COUNT',
    };
  }

  // 4. Fallback text
  return {
    raw: str,
    numeric: 0,
    type: 'TEXT',
  };
}

/**
 * Categorizes statistic by keyword into logical grouping
 */
export function categorizeStatistic(categoryName: string): StatCategoryGroup {
  const lower = categoryName.toLowerCase();

  // Passing / Possession
  if (
    lower.includes('possession') ||
    lower.includes('pass') ||
    lower.includes('cross') ||
    lower.includes('throw-in')
  ) {
    return 'PASSING';
  }

  // Attacking
  if (
    lower.includes('goal attempt') ||
    lower.includes('shot') ||
    lower.includes('corner') ||
    lower.includes('offside') ||
    lower.includes('attack') ||
    lower.includes('penalty')
  ) {
    return 'ATTACKING';
  }

  // Defending & Discipline
  if (
    lower.includes('save') ||
    lower.includes('tackle') ||
    lower.includes('foul') ||
    lower.includes('card') ||
    lower.includes('block') ||
    lower.includes('clearance') ||
    lower.includes('interception')
  ) {
    return 'DEFENDING';
  }

  return 'OVERVIEW';
}

/**
 * Checks if higher value is generally considered negative for the team (e.g. fouls, yellow/red cards)
 */
export function isNegativeMetric(categoryName: string): boolean {
  const lower = categoryName.toLowerCase();
  return (
    lower.includes('foul') ||
    lower.includes('card') ||
    lower.includes('offside') ||
    lower.includes('conceded')
  );
}

/**
 * Normalizes category label format
 */
export function formatCategoryLabel(rawCategory: string): string {
  const trimmed = rawCategory.trim();
  if (!trimmed) return 'Statistic';

  // Specific canonical naming map
  const map: Record<string, string> = {
    'ball possession': 'Ball Possession',
    'goal attempts': 'Goal Attempts',
    'shots on goal': 'Shots on Target',
    'shots on target': 'Shots on Target',
    'shots off goal': 'Shots off Target',
    'shots off target': 'Shots off Target',
    'blocked shots': 'Blocked Shots',
    'corner kicks': 'Corner Kicks',
    'fouls': 'Fouls',
    'yellow cards': 'Yellow Cards',
    'red cards': 'Red Cards',
    'goalkeeper saves': 'Goalkeeper Saves',
    'total passes': 'Total Passes',
    'completed passes': 'Completed Passes',
    'dangerous attacks': 'Dangerous Attacks',
    'attacks': 'Total Attacks',
    'free kicks': 'Free Kicks',
    'offsides': 'Offsides',
  };

  const lower = trimmed.toLowerCase();
  if (map[lower]) return map[lower];

  return trimmed
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Dynamically parses array of raw statistics items from scraper JSON
 */
export function parseDynamicStatistics(
  rawStatistics?: Array<{ category: string; homeValue?: string | number; awayValue?: string | number }> | null
): ParsedStatisticsSummary {
  if (!rawStatistics || !Array.isArray(rawStatistics) || rawStatistics.length === 0) {
    return {
      items: [],
      availableGroups: [{ group: 'ALL', label: 'All', count: 0 }],
    };
  }

  const items: ParsedStatisticItem[] = [];

  for (const raw of rawStatistics) {
    if (!raw.category) continue;

    const formattedCategory = formatCategoryLabel(raw.category);
    const home = parseStatValue(raw.homeValue);
    const away = parseStatValue(raw.awayValue);
    const isInverse = isNegativeMetric(formattedCategory);

    // Calculate comparative visual shares
    let homeShare = 50;
    let awayShare = 50;

    if (home.type === 'PERCENTAGE' && away.type === 'PERCENTAGE') {
      const sum = home.numeric + away.numeric;
      if (sum > 0) {
        homeShare = Math.round((home.numeric / sum) * 100);
        awayShare = 100 - homeShare;
      }
    } else if (home.numeric > 0 || away.numeric > 0) {
      const sum = home.numeric + away.numeric;
      homeShare = Math.round((home.numeric / sum) * 100);
      awayShare = 100 - homeShare;
    }

    let leader: 'HOME' | 'AWAY' | 'TIED' = 'TIED';
    if (home.numeric > away.numeric) {
      leader = isInverse ? 'AWAY' : 'HOME';
    } else if (away.numeric > home.numeric) {
      leader = isInverse ? 'HOME' : 'AWAY';
    }

    const group = categorizeStatistic(formattedCategory);

    items.push({
      category: formattedCategory,
      group,
      home,
      away,
      homeSharePercent: Math.max(8, Math.min(92, homeShare)),
      awaySharePercent: Math.max(8, Math.min(92, awayShare)),
      leader,
      isInverseMetric: isInverse,
    });
  }

  // Derive high-level summary cards if present
  let possession: { home: number; away: number } | undefined;
  let totalShots: { home: number; away: number } | undefined;
  let shotsOnTarget: { home: number; away: number } | undefined;
  let corners: { home: number; away: number } | undefined;
  let fouls: { home: number; away: number } | undefined;

  for (const it of items) {
    const catLower = it.category.toLowerCase();
    if (catLower.includes('possession') && !possession) {
      possession = { home: Math.round(it.home.numeric), away: Math.round(it.away.numeric) };
    } else if ((catLower.includes('goal attempt') || catLower.includes('total shot')) && !totalShots) {
      totalShots = { home: Math.round(it.home.numeric), away: Math.round(it.away.numeric) };
    } else if (catLower.includes('shots on target') && !shotsOnTarget) {
      shotsOnTarget = { home: Math.round(it.home.numeric), away: Math.round(it.away.numeric) };
    } else if (catLower.includes('corner') && !corners) {
      corners = { home: Math.round(it.home.numeric), away: Math.round(it.away.numeric) };
    } else if (catLower.includes('foul') && !fouls) {
      fouls = { home: Math.round(it.home.numeric), away: Math.round(it.away.numeric) };
    }
  }

  // Count by groups
  const groupCounts: Record<StatCategoryGroup, number> = {
    ALL: items.length,
    OVERVIEW: 0,
    ATTACKING: 0,
    PASSING: 0,
    DEFENDING: 0,
  };

  items.forEach((it) => {
    if (groupCounts[it.group] !== undefined) {
      groupCounts[it.group]++;
    }
  });

  const availableGroups: { group: StatCategoryGroup; label: string; count: number }[] = [
    { group: 'ALL', label: 'All', count: items.length },
  ];

  if (groupCounts.ATTACKING > 0) availableGroups.push({ group: 'ATTACKING', label: 'Attacking', count: groupCounts.ATTACKING });
  if (groupCounts.PASSING > 0) availableGroups.push({ group: 'PASSING', label: 'Passing', count: groupCounts.PASSING });
  if (groupCounts.DEFENDING > 0) availableGroups.push({ group: 'DEFENDING', label: 'Defending', count: groupCounts.DEFENDING });

  return {
    items,
    availableGroups,
    possession,
    totalShots,
    shotsOnTarget,
    corners,
    fouls,
  };
}
