import crypto from 'crypto';
import { db } from '../core/db.js';
import { predictionsDb, LeagueModelAccuracyRecord } from '../core/predictionsDb.js';
import { getSqliteGateState, isSqliteEnabled, registerDbMutationListener } from '../core/sqliteClient.js';
import { getScrapingGateState, isScrapingEnabled } from '../core/scrapingGate.js';
import {
  cleanFixtureId,
  DEFAULT_ENGINE_SETTINGS,
  Fixture,
  FeaturedTipDTO,
  FeaturedTipsResponse,
  LeagueGroupDTO,
  LeagueOptionDTO,
  MarketOption,
  ScrapedMarketOdds,
  StandingsCatalogItem,
} from '../core/types.js';
import { ApexEngine } from '../core/poisson.js';
import { matchesResolvedDateFilter, resolveDateFilter } from '../core/dateUtils.js';
import { cleanStr, getLeagueAliases, isSimulationLeague, matchesLeague } from '../core/leagueMapper.js';
import { GLOBAL_LEAGUES_DATASET } from '../core/globalLeaguesDataset.js';
import { isKnownVolatileLeague } from '../core/volatileLeagues.js';
import {
  getFixtureSortableDateTime,
  getLeaguePopularityScore,
  sortFixturesByPopularityInPlace,
} from '../core/leaguePriority.js';
import {
  getHistoryMarketCategory,
  isZeroFiveGoalsKey,
  normalizeMarketKey,
  parseUpcomingMarketFilter,
} from '../core/marketEvaluator.js';
import { DEFAULT_POPULAR_MARKET_KEYS } from '../core/marketActivity.js';
import { flashscoreScraperService } from './flashscoreScraperService.js';
import { LiveScore } from '../providers/types.js';

export type SortByOption = 'DEFAULT' | 'PROB_DESC' | 'PROB_ASC' | 'HOME_DESC' | 'DRAW_DESC' | 'AWAY_DESC';
export type MarketFilterOption = string;

export interface WorkerQueryParams {
  league?: string;
  dateFilter?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: string;
  marketFilter?: string;
  popularMarkets?: string[];
  forceRefresh?: boolean;
}

interface WorkerIndexedRecord {
  slimFixture: Fixture;
  fullMarkets?: MarketOption[];
  marketOdds?: ScrapedMarketOdds;
  cleanId: string;
  sortableDateTime: number;
  searchBlob: string;
  isLiveInDb: boolean;
}

interface CachedSerializedResponse {
  jsonPayload: string;
  etag: string;
  timestamp: number;
}

function round1(val: number): number {
  const normalized = val > 1.0 ? val : val * 100;
  return Math.round(normalized * 10) / 10;
}

function format1(val: number): string {
  return `${round1(val).toFixed(1)}%`;
}

export function extractFlashscoreOddsServer(
  marketKey: string,
  marketOdds?: ScrapedMarketOdds
): number | null {
  if (!marketOdds) return null;
  let odd: number | undefined;
  switch (marketKey) {
    case 'HOME_WIN':
      odd = marketOdds.homeOdds;
      break;
    case 'DRAW':
      odd = marketOdds.drawOdds;
      break;
    case 'AWAY_WIN':
      odd = marketOdds.awayOdds;
      break;
    case 'BTTS_YES':
      odd = marketOdds.bttsYesOdds;
      break;
    case 'BTTS_NO':
      odd = marketOdds.bttsNoOdds;
      break;
    case 'DOUBLE_CHANCE_1X':
      odd =
        marketOdds.dc1XOdds ??
        (marketOdds.homeOdds && marketOdds.drawOdds
          ? Number((1 / (1 / marketOdds.homeOdds + 1 / marketOdds.drawOdds)).toFixed(2))
          : undefined);
      break;
    case 'DOUBLE_CHANCE_X2':
      odd =
        marketOdds.dcX2Odds ??
        (marketOdds.awayOdds && marketOdds.drawOdds
          ? Number((1 / (1 / marketOdds.awayOdds + 1 / marketOdds.drawOdds)).toFixed(2))
          : undefined);
      break;
    case 'OVER_15':
      odd = marketOdds.over15Odds;
      break;
    case 'UNDER_15':
      odd = marketOdds.under15Odds;
      break;
    case 'OVER_25':
      odd = marketOdds.over25Odds;
      break;
    case 'UNDER_25':
      odd = marketOdds.under25Odds;
      break;
    case 'OVER_35':
      odd = marketOdds.over35Odds;
      break;
    case 'UNDER_35':
      odd = marketOdds.under35Odds;
      break;
    default:
      odd = undefined;
  }
  if (odd !== undefined && odd !== null && !isNaN(odd) && odd > 1.0) {
    return Number(odd.toFixed(2));
  }
  return null;
}

const WORKER_TRIVIAL_EXTREME_KEYS = new Set<MarketOption['key']>([
  'UNDER_45',
  'HOME_UNDER_25',
  'AWAY_UNDER_25',
]);

function getShortMarketLabel(key: MarketOption['key'], fallbackName?: string): string {
  switch (key) {
    case 'HOME_WIN': return '1';
    case 'DRAW': return 'X';
    case 'AWAY_WIN': return '2';
    case 'DOUBLE_CHANCE_1X': return '1X';
    case 'DOUBLE_CHANCE_X2': return 'X2';
    case 'DOUBLE_CHANCE_12': return '12';
    case 'DNB_HOME': return 'DNB 1';
    case 'DNB_AWAY': return 'DNB 2';
    case 'OVER_15': return 'O1.5';
    case 'UNDER_15': return 'U1.5';
    case 'OVER_25': return 'O2.5';
    case 'UNDER_25': return 'U2.5';
    case 'OVER_35': return 'O3.5';
    case 'UNDER_35': return 'U3.5';
    case 'OVER_45': return 'O4.5';
    case 'UNDER_45': return 'U4.5';
    case 'BTTS_YES': return 'GG';
    case 'BTTS_NO': return 'NG';
    case 'COMBO_1_OVER_15': return '1 & O1.5';
    case 'COMBO_2_OVER_15': return '2 & O1.5';
    case 'COMBO_1_OVER_25': return '1 & O2.5';
    case 'COMBO_2_OVER_25': return '2 & O2.5';
    case 'COMBO_1_OVER_35': return '1 & O3.5';
    case 'COMBO_2_OVER_35': return '2 & O3.5';
    case 'COMBO_1_UNDER_25': return '1 & U2.5';
    case 'COMBO_2_UNDER_25': return '2 & U2.5';
    case 'COMBO_1_UNDER_35': return '1 & U3.5';
    case 'COMBO_2_UNDER_35': return '2 & U3.5';
    case 'COMBO_X_UNDER_25': return 'X & U2.5';
    case 'COMBO_X_OVER_15': return 'X & O1.5';
    case 'COMBO_1_BTTS': return '1 & GG';
    case 'COMBO_2_BTTS': return '2 & GG';
    case 'COMBO_X_BTTS': return 'X & GG';
    case 'COMBO_1X_OVER_15': return '1X & O1.5';
    case 'COMBO_X2_OVER_15': return 'X2 & O1.5';
    case 'COMBO_12_OVER_15': return '12 & O1.5';
    case 'COMBO_1X_OVER_25': return '1X & O2.5';
    case 'COMBO_X2_OVER_25': return 'X2 & O2.5';
    case 'COMBO_12_OVER_25': return '12 & O2.5';
    case 'COMBO_1X_UNDER_25': return '1X & U2.5';
    case 'COMBO_X2_UNDER_25': return 'X2 & U2.5';
    case 'COMBO_1X_UNDER_35': return '1X & U3.5';
    case 'COMBO_X2_UNDER_35': return 'X2 & U3.5';
    case 'COMBO_12_UNDER_35': return '12 & U3.5';
    case 'COMBO_1X_BTTS': return '1X & GG';
    case 'COMBO_X2_BTTS': return 'X2 & GG';
    case 'COMBO_12_BTTS': return '12 & GG';
    case 'COMBO_BTTS_OVER_25': return 'GG & O2.5';
    case 'COMBO_BTTS_OVER_35': return 'GG & O3.5';
    case 'COMBO_BTTS_UNDER_35': return 'GG & U3.5';
    case 'COMBO_BTTS_NO_UNDER_25': return 'NG & U2.5';
    case 'HOME_WIN_TO_NIL': return '1 Nil';
    case 'AWAY_WIN_TO_NIL': return '2 Nil';
    case 'HOME_OVER_15': return 'H O1.5';
    case 'HOME_UNDER_15': return 'H U1.5';
    case 'HOME_OVER_25': return 'H O2.5';
    case 'AWAY_OVER_15': return 'A O1.5';
    case 'AWAY_UNDER_15': return 'A U1.5';
    case 'AWAY_OVER_25': return 'A O2.5';
    case 'HOME_CLEAN_SHEET': return 'H CS';
    case 'AWAY_CLEAN_SHEET': return 'A CS';
    case 'HANDICAP_HOME_MINUS_1': return 'H -1.5';
    case 'HANDICAP_AWAY_MINUS_1': return 'A -1.5';
    case 'MULTIGOALS_1_3': return '1-3 G';
    case 'MULTIGOALS_2_4': return '2-4 G';
    case 'MULTIGOALS_2_5': return '2-5 G';
    case 'GOALS_ODD': return 'Odd';
    case 'GOALS_EVEN': return 'Even';
    default:
      return fallbackName ? fallbackName.slice(0, 12) : String(key).slice(0, 12);
  }
}

function mapMarketToPickType(
  key: MarketOption['key']
): NonNullable<Fixture['highestPick']>['type'] {
  if (key === 'HOME_WIN') return '1';
  if (key === 'DRAW') return 'X';
  if (key === 'AWAY_WIN') return '2';
  if (key === 'OVER_15' || key === 'OVER_25' || key === 'OVER_35' || key === 'OVER_45') return 'O2.5';
  if (key === 'UNDER_15' || key === 'UNDER_25' || key === 'UNDER_35' || key === 'UNDER_45') return 'U2.5';
  if (key === 'BTTS_YES') return 'BTTS_Y';
  if (key === 'BTTS_NO') return 'BTTS_N';
  if (key === 'DOUBLE_CHANCE_1X') return '1X';
  if (key === 'DOUBLE_CHANCE_X2') return 'X2';
  if (key.startsWith('COMBO_') || key === 'HOME_WIN_TO_NIL' || key === 'AWAY_WIN_TO_NIL') return 'COMBO';
  return 'MARKET';
}

function computePrecomputedFields(
  f: Fixture
): {
  authoritativePick?: Fixture['authoritativePick'];
  highestPick?: Fixture['highestPick'];
  comboPick?: Fixture['comboPick'];
  dcPick?: Fixture['dcPick'];
  probs?: Fixture['probs'];
  popularityScore: number;
  slimPrediction?: Fixture['prediction'];
  resolvedMarkets?: MarketOption[];
  hasPrediction: boolean;
} {
  const popularityScore = getLeaguePopularityScore(f.league, f.leagueName, f.stage);
  const pred = f.prediction;

  if (!pred) {
    return {
      popularityScore,
      hasPrediction: false,
    };
  }

  const hw = Number(pred.homeWinProb ?? 0);
  const dr = Number(pred.drawProb ?? 0);
  const aw = Number(pred.awayWinProb ?? 0);
  const o25 = Number(pred.over25Prob ?? 0);
  const u25 = Math.max(0, 1 - o25);
  const bttsY = Number(pred.bttsProb ?? 0);
  const bttsN = Math.max(0, 1 - bttsY);

  let authKey: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' = 'HOME_WIN';
  let authType: '1' | 'X' | '2' = '1';
  let authLabel = `${f.homeTeam} Win`;
  let authProb = hw;

  if (aw >= hw && aw >= dr) {
    authKey = 'AWAY_WIN';
    authType = '2';
    authLabel = `${f.awayTeam} Win`;
    authProb = aw;
  } else if (dr >= hw && dr >= aw) {
    authKey = 'DRAW';
    authType = 'X';
    authLabel = 'Draw';
    authProb = dr;
  }

  const authPercent = round1(authProb);
  const authoritativePick: Fixture['authoritativePick'] = {
    key: authKey,
    type: authType,
    label: authLabel,
    shortLabel: authType,
    probability: authProb,
    probabilityPercent: authPercent,
    probabilityFormatted: format1(authProb),
  };

  // Resolve full markets list including Over/Under >=1.5 and all combo markets (never 0.5 goals)
  const hasStoredCombos =
    Array.isArray(f.markets) && f.markets.some((m) => m.key.startsWith('COMBO_'));
  const hasStoredTotals =
    Array.isArray(f.markets) && f.markets.some((m) => m.key === 'OVER_25');
  let resolvedMarkets: MarketOption[];
  let calcMostLikely = f.mostLikelyOutcome || pred.mostLikelyOutcome;

  if (hasStoredCombos && hasStoredTotals && f.markets) {
    resolvedMarkets = f.markets.filter((m) => !isZeroFiveGoalsKey(m.key));
  } else {
    const calc = ApexEngine.calculateMarkets(
      pred,
      DEFAULT_ENGINE_SETTINGS,
      f.homeTeam,
      f.awayTeam,
      f.marketOdds || pred.marketOdds
    );
    resolvedMarkets = (calc.markets || []).filter((m) => !isZeroFiveGoalsKey(m.key));
    if (!calcMostLikely) {
      calcMostLikely = calc.mostLikelyOutcome;
    }
  }

  const marketCandidates = resolvedMarkets.filter((m) => !WORKER_TRIVIAL_EXTREME_KEYS.has(m.key));
  const bestMarket = (marketCandidates.length > 0 ? marketCandidates : resolvedMarkets)
    .slice()
    .sort((a, b) => b.probability - a.probability)[0];

  const highestProb = bestMarket ? bestMarket.probability : authProb;
  const highestPercent = round1(highestProb);
  const highestKey = bestMarket ? bestMarket.key : authKey;
  const highestLabel = bestMarket ? bestMarket.name : authLabel;

  const highestPick: Fixture['highestPick'] = {
    key: highestKey,
    type: bestMarket ? mapMarketToPickType(bestMarket.key) : authType,
    label: highestLabel,
    shortLabel: getShortMarketLabel(highestKey, highestLabel),
    probability: highestProb,
    probabilityPercent: highestPercent,
    probabilityFormatted: format1(highestProb),
  };

  const bestCombo = resolvedMarkets
    .filter((m) => m.key.startsWith('COMBO_') || m.key === 'HOME_WIN_TO_NIL' || m.key === 'AWAY_WIN_TO_NIL')
    .slice()
    .sort((a, b) => b.probability - a.probability)[0];

  const comboPick: Fixture['comboPick'] = bestCombo
    ? {
        key: bestCombo.key,
        label: bestCombo.name,
        shortLabel: getShortMarketLabel(bestCombo.key, bestCombo.name),
        probability: bestCombo.probability,
        probabilityPercent: round1(bestCombo.probability),
        probabilityFormatted: format1(bestCombo.probability),
      }
    : undefined;

  const bestDc = resolvedMarkets
    .filter((m) => m.key.startsWith('DOUBLE_CHANCE_'))
    .slice()
    .sort((a, b) => b.probability - a.probability)[0];

  const dcPick: Fixture['dcPick'] = bestDc
    ? {
        key: bestDc.key,
        label: bestDc.name,
        shortLabel: getShortMarketLabel(bestDc.key, bestDc.name),
        probability: bestDc.probability,
        probabilityPercent: round1(bestDc.probability),
        probabilityFormatted: format1(bestDc.probability),
      }
    : undefined;

  const over25Pct = round1(o25);
  const under25Pct = Number((100 - over25Pct).toFixed(1));
  const bttsYesPct = round1(bttsY);
  const bttsNoPct = Number((100 - bttsYesPct).toFixed(1));

  const probs: Fixture['probs'] = {
    home: round1(hw),
    draw: round1(dr),
    away: round1(aw),
    over25: over25Pct,
    under25: under25Pct,
    bttsYes: bttsYesPct,
    bttsNo: bttsNoPct,
    tipProbMostLikely: highestPercent,
    tipProbOverUnder: Math.max(over25Pct, under25Pct),
    tipProbBtts: Math.max(bttsYesPct, bttsNoPct),
    tipProb1X2: authoritativePick.probabilityPercent,
    tipProbCombo: comboPick?.probabilityPercent,
    tipProbDoubleChance: dcPick?.probabilityPercent,
  };

  // Minimal prediction summary for list views (eliminates heavy 6x6 matrix, H2H, elo, stats blobs)
  const slimPrediction = {
    homeXG: pred.homeXG,
    awayXG: pred.awayXG,
    homeWinProb: pred.homeWinProb,
    drawProb: pred.drawProb,
    awayWinProb: pred.awayWinProb,
    over15Prob: pred.over15Prob,
    over25Prob: pred.over25Prob,
    over35Prob: pred.over35Prob,
    bttsProb: pred.bttsProb,
    mostLikelyOutcome: calcMostLikely,
  } as Fixture['prediction'];

  return {
    authoritativePick,
    highestPick,
    comboPick,
    dcPick,
    probs,
    popularityScore,
    slimPrediction,
    resolvedMarkets,
    hasPrediction: true,
  };
}

function buildSlimFixture(
  source: Fixture,
  timestamp?: number
): { slimFixture: Fixture; computed: ReturnType<typeof computePrecomputedFields> } {
  const computed = computePrecomputedFields(source);

  const slimFixture: Fixture = {
    id: source.id,
    providerId: source.providerId || 'FLASHSCORE',
    league: source.league,
    leagueName: source.leagueName,
    matchDate: source.matchDate,
    kickOffTime: source.kickOffTime,
    timestamp: timestamp ?? source.timestamp,
    homeTeam: source.homeTeam,
    awayTeam: source.awayTeam,
    homeBadge: source.homeBadge,
    awayBadge: source.awayBadge,
    stage: source.stage,
    status: source.status,
    score: source.score,
    minute: source.minute,
    hasPrediction: computed.hasPrediction,
    prediction: computed.slimPrediction,
    mostLikelyOutcome: computed.slimPrediction?.mostLikelyOutcome,
    authoritativePick: computed.authoritativePick,
    highestPick: computed.highestPick,
    comboPick: computed.comboPick,
    dcPick: computed.dcPick,
    probs: computed.probs,
    popularityScore: computed.popularityScore,
  };

  return { slimFixture, computed };
}

function buildGroupsForFixtures(fixtures: Fixture[]): LeagueGroupDTO[] {
  const map = new Map<string, LeagueGroupDTO>();
  for (const f of fixtures) {
    const leagueKey = f.league || 'ALL';
    const leagueName = f.leagueName || f.league || 'Other Competition';
    const subDivision = f.stage || f.leagueName || f.league;
    const headerKey = `${leagueKey}_${subDivision}`;
    const dt = getFixtureSortableDateTime(f);

    let group = map.get(headerKey);
    if (!group) {
      group = {
        leagueKey,
        leagueName,
        subDivision,
        headerKey,
        popularityScore: f.popularityScore ?? getLeaguePopularityScore(leagueKey, leagueName, f.stage),
        latestDateTime: dt,
        fixtureIds: [],
      };
      map.set(headerKey, group);
    }
    if (dt > group.latestDateTime) {
      group.latestDateTime = dt;
    }
    group.fixtureIds.push(f.id);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.popularityScore !== b.popularityScore) return b.popularityScore - a.popularityScore;
    if (a.latestDateTime !== b.latestDateTime) return b.latestDateTime - a.latestDateTime;
    return (a.subDivision || a.leagueName).localeCompare(b.subDivision || b.leagueName);
  });
}

function resolveMarketPickForMarkets(
  markets: MarketOption[] | undefined,
  marketFilter: string,
  popularMarkets?: string[]
): Fixture['activeMarketPick'] | null | undefined {
  const { category, specificMarket } = parseUpcomingMarketFilter(marketFilter);
  if (category === 'ALL' && specificMarket === 'AUTO') {
    return undefined;
  }

  if (!markets || markets.length === 0) {
    return null;
  }

  let matched: MarketOption | undefined;

  if (specificMarket !== 'AUTO') {
    matched = markets.find((m) => normalizeMarketKey(m.key) === specificMarket);
  } else if (category === 'POPULAR') {
    const cleanPopular = (
      Array.isArray(popularMarkets) && popularMarkets.length > 0
        ? popularMarkets
        : [...DEFAULT_POPULAR_MARKET_KEYS]
    )
      .map((k) => normalizeMarketKey(k))
      .filter((k) => k && !isZeroFiveGoalsKey(k))
      .slice(0, 3);

    const priorityPool =
      cleanPopular.length > 0 ? cleanPopular : [...DEFAULT_POPULAR_MARKET_KEYS];

    const matchingMarkets = markets.filter((m) => {
      const normKey = normalizeMarketKey(m.key);
      return !isZeroFiveGoalsKey(normKey) && priorityPool.includes(normKey);
    });

    if (matchingMarkets.length > 0) {
      matched = matchingMarkets
        .slice()
        .sort((a, b) => {
          const rankA = priorityPool.indexOf(normalizeMarketKey(a.key));
          const rankB = priorityPool.indexOf(normalizeMarketKey(b.key));
          const bonusA = rankA === 0 ? 0.025 : rankA === 1 ? 0.012 : 0;
          const bonusB = rankB === 0 ? 0.025 : rankB === 1 ? 0.012 : 0;
          const scoreA = (a.probability || 0) + bonusA;
          const scoreB = (b.probability || 0) + bonusB;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return rankA - rankB;
        })[0];
    } else {
      const fallbackPool = markets.filter(
        (m) => !isZeroFiveGoalsKey(m.key) && !WORKER_TRIVIAL_EXTREME_KEYS.has(m.key)
      );
      matched = (fallbackPool.length > 0 ? fallbackPool : markets)
        .slice()
        .sort((a, b) => b.probability - a.probability)[0];
    }
  } else if (category === 'DOUBLE_CHANCE') {
    const dcOnly = markets.filter((m) => m.key.startsWith('DOUBLE_CHANCE_'));
    const pool =
      dcOnly.length > 0
        ? dcOnly
        : markets.filter((m) => getHistoryMarketCategory(m.key) === 'DOUBLE_CHANCE');
    matched = pool.slice().sort((a, b) => b.probability - a.probability)[0];
  } else {
    const pool = markets.filter(
      (m) =>
        getHistoryMarketCategory(m.key) === category &&
        !WORKER_TRIVIAL_EXTREME_KEYS.has(m.key)
    );
    const resolvedPool =
      pool.length > 0
        ? pool
        : markets.filter((m) => getHistoryMarketCategory(m.key) === category);
    matched = resolvedPool.slice().sort((a, b) => b.probability - a.probability)[0];
  }

  if (!matched) {
    return null;
  }

  return {
    key: matched.key,
    label: matched.name,
    shortLabel: getShortMarketLabel(matched.key, matched.name),
    probability: matched.probability,
    probabilityPercent: round1(matched.probability),
    probabilityFormatted: format1(matched.probability),
    category: getHistoryMarketCategory(matched.key),
  };
}

function getTipProbForSort(f: Fixture, marketFilter: string): number {
  if (f.activeMarketPick) return f.activeMarketPick.probabilityPercent;
  if (!f.probs) return 0;
  if (marketFilter === 'COMBOS') return f.probs.tipProbCombo ?? f.comboPick?.probabilityPercent ?? 0;
  if (marketFilter === 'DOUBLE_CHANCE') return f.probs.tipProbDoubleChance ?? f.dcPick?.probabilityPercent ?? 0;
  if (marketFilter === 'OVER_UNDER') return f.probs.tipProbOverUnder ?? Math.max(f.probs.over25, f.probs.under25);
  if (marketFilter === 'BTTS') return f.probs.tipProbBtts ?? Math.max(f.probs.bttsYes, f.probs.bttsNo);
  if (marketFilter === '1X2') return f.probs.tipProb1X2 ?? (f.authoritativePick?.probabilityPercent ?? 0);
  return f.probs.tipProbMostLikely ?? (f.highestPick?.probabilityPercent ?? 0);
}

function sortFixturesForQuery(fixtures: Fixture[], sortBy: string, marketFilter: string): Fixture[] {
  if (!sortBy || sortBy === 'DEFAULT') {
    return sortFixturesByPopularityInPlace(fixtures.slice());
  }

  return fixtures.slice().sort((a, b) => {
    if (sortBy === 'PROB_DESC') return getTipProbForSort(b, marketFilter) - getTipProbForSort(a, marketFilter);
    if (sortBy === 'PROB_ASC') return getTipProbForSort(a, marketFilter) - getTipProbForSort(b, marketFilter);
    if (sortBy === 'HOME_DESC') return (b.probs?.home ?? -1) - (a.probs?.home ?? -1);
    if (sortBy === 'DRAW_DESC') return (b.probs?.draw ?? -1) - (a.probs?.draw ?? -1);
    if (sortBy === 'AWAY_DESC') return (b.probs?.away ?? -1) - (a.probs?.away ?? -1);
    return 0;
  });
}

function makeEtag(jsonPayload: string): string {
  const hash = crypto.createHash('md5').update(jsonPayload).digest('hex');
  return `"${hash}"`;
}

class FixturesWorkerService {
  private indexBuiltAt = 0;
  private indexPromise: Promise<void> | null = null;
  private indexVersion = 0;

  private records: WorkerIndexedRecord[] = [];
  private byCleanId = new Map<string, WorkerIndexedRecord>();

  private queryCache = new Map<string, CachedSerializedResponse>();
  private featuredTipsCache: CachedSerializedResponse | null = null;
  private leaguesCatalogCache: CachedSerializedResponse | null = null;
  private standingsCatalogCache: CachedSerializedResponse | null = null;
  private liveQueryCache = new Map<string, CachedSerializedResponse>();

  private liveScoresCache: { scores: LiveScore[]; fetchedAt: number; signature: string } | null = null;
  private liveScoresPromise: Promise<LiveScore[]> | null = null;

  private readonly INDEX_TTL_MS = 5 * 60 * 1000; // Warm 5m index, auto-invalidated on DB writes
  private readonly QUERY_CACHE_MAX = 64;
  private readonly LIVE_SCORES_TTL_MS = 8 * 1000; // 8s live cache deduplicates concurrent pollers while keeping 10s polls fresh

  /**
   * Invalidates all materialized server projections & response caches immediately on DB mutation.
   */
  public invalidate(): void {
    this.indexBuiltAt = 0;
    this.indexVersion++;
    if (!isSqliteEnabled()) {
      this.records = [];
      this.byCleanId.clear();
    }
    this.queryCache.clear();
    this.featuredTipsCache = null;
    this.leaguesCatalogCache = null;
    this.standingsCatalogCache = null;
    this.liveQueryCache.clear();
  }

  public clearLiveCache(): void {
    this.liveScoresCache = null;
    this.liveScoresPromise = null;
    this.liveQueryCache.clear();
    this.queryCache.clear();
  }

  /**
   * Ensures the warm server-side projection index is loaded and merged once from SQLite.
   */
  public async ensureIndexReady(forceRefresh = false): Promise<void> {
    if (!isSqliteEnabled()) {
      this.records = [];
      this.byCleanId.clear();
      this.indexBuiltAt = 0;
      return;
    }

    const now = Date.now();
    if (!forceRefresh && this.indexBuiltAt > 0 && now - this.indexBuiltAt < this.INDEX_TTL_MS) {
      return;
    }

    if (this.indexPromise && !forceRefresh) {
      return this.indexPromise;
    }

    this.indexPromise = (async () => {
      try {
        await db.init();
        await predictionsDb.init();

        const upcomingList = db.getUpcomingFixtures({ skipSort: true, skipPredictionBlobs: true });
        const predictionsList = await predictionsDb.getPredictionsAsync({ state: 'all', skipSort: true });
        const oddsMap = db.getAllMatchOddsCache();

        // Run multi-day coverage sync asynchronously only when remote data scraping is enabled
        if (isScrapingEnabled()) {
          void flashscoreScraperService.ensureUpcomingMultiDayCoverage().catch(() => {});
        }

        const predMap = new Map<string, Fixture>();
        for (const p of predictionsList) {
          if (p.id) {
            predMap.set(p.id, p);
            predMap.set(p.id.replace(/^fs_/, ''), p);
          }
        }

        const mergedMap = new Map<string, WorkerIndexedRecord>();

        if (upcomingList.length > 0) {
          for (const f of upcomingList) {
            if (isSimulationLeague(f.league, f.leagueName, undefined, f.leagueUrl, f.stage, f.homeTeam, f.awayTeam)) {
              continue;
            }
            const cleanId = cleanFixtureId(f.id);
            const p = predMap.get(f.id) || predMap.get(cleanId);
            const resolvedOdds =
              f.marketOdds || p?.marketOdds || p?.prediction?.marketOdds || oddsMap.get(cleanId) || oddsMap.get(f.id);
            const resolvedTimestamp =
              f.timestamp ||
              p?.timestamp ||
              (f.matchDate && f.kickOffTime && f.kickOffTime.includes(':')
                ? Math.floor(new Date(`${f.matchDate}T${f.kickOffTime}:00.000Z`).getTime() / 1000)
                : undefined);

            const mergedSource: Fixture =
              p && p.prediction
                ? {
                    ...f,
                    timestamp: resolvedTimestamp,
                    prediction: p.prediction,
                    markets: p.markets || f.markets,
                    mostLikelyOutcome: p.mostLikelyOutcome || f.mostLikelyOutcome,
                  }
                : {
                    ...f,
                    timestamp: resolvedTimestamp,
                    prediction: undefined,
                  };

            const { slimFixture, computed } = buildSlimFixture(mergedSource, resolvedTimestamp);
            const rec: WorkerIndexedRecord = {
              slimFixture,
              fullMarkets: computed.resolvedMarkets || p?.markets || f.markets,
              marketOdds: resolvedOdds,
              cleanId,
              sortableDateTime: getFixtureSortableDateTime(slimFixture),
              searchBlob: `${slimFixture.homeTeam || ''} ${slimFixture.awayTeam || ''} ${slimFixture.leagueName || ''}`.toLowerCase(),
              isLiveInDb: slimFixture.status === 'LIVE',
            };
            mergedMap.set(cleanId, rec);
          }

          for (const p of predictionsList) {
            if ((p as any).match_state === 'completed' || p.status === 'FINISHED') continue;
            if (isSimulationLeague(p.league, p.leagueName, undefined, p.leagueUrl, p.stage, p.homeTeam, p.awayTeam)) {
              continue;
            }
            const cleanId = cleanFixtureId(p.id);
            if (!mergedMap.has(cleanId)) {
              const pTimestamp =
                p.timestamp ||
                (p.matchDate && p.kickOffTime && p.kickOffTime.includes(':')
                  ? Math.floor(new Date(`${p.matchDate}T${p.kickOffTime}:00.000Z`).getTime() / 1000)
                  : undefined);
              const resolvedOdds =
                p.marketOdds || p.prediction?.marketOdds || oddsMap.get(cleanId) || oddsMap.get(p.id);
              const { slimFixture, computed } = buildSlimFixture(p, pTimestamp);
              const rec: WorkerIndexedRecord = {
                slimFixture,
                fullMarkets: computed.resolvedMarkets || p.markets,
                marketOdds: resolvedOdds,
                cleanId,
                sortableDateTime: getFixtureSortableDateTime(slimFixture),
                searchBlob: `${slimFixture.homeTeam || ''} ${slimFixture.awayTeam || ''} ${slimFixture.leagueName || ''}`.toLowerCase(),
                isLiveInDb: slimFixture.status === 'LIVE',
              };
              mergedMap.set(cleanId, rec);
            }
          }
        } else {
          for (const p of predictionsList) {
            if (isSimulationLeague(p.league, p.leagueName, undefined, p.leagueUrl, p.stage, p.homeTeam, p.awayTeam)) {
              continue;
            }
            const cleanId = cleanFixtureId(p.id);
            const resolvedOdds =
              p.marketOdds || p.prediction?.marketOdds || oddsMap.get(cleanId) || oddsMap.get(p.id);
            const { slimFixture, computed } = buildSlimFixture(p, p.timestamp);
            const rec: WorkerIndexedRecord = {
              slimFixture,
              fullMarkets: computed.resolvedMarkets || p.markets,
              marketOdds: resolvedOdds,
              cleanId,
              sortableDateTime: getFixtureSortableDateTime(slimFixture),
              searchBlob: `${slimFixture.homeTeam || ''} ${slimFixture.awayTeam || ''} ${slimFixture.leagueName || ''}`.toLowerCase(),
              isLiveInDb: slimFixture.status === 'LIVE',
            };
            mergedMap.set(cleanId, rec);
          }
        }

        const allRecords = Array.from(mergedMap.values());
        const sortedFixtures = allRecords.map((r) => r.slimFixture);
        sortFixturesByPopularityInPlace(sortedFixtures);

        const recByObj = new Map<Fixture, WorkerIndexedRecord>();
        for (const rec of allRecords) {
          recByObj.set(rec.slimFixture, rec);
        }

        this.records = sortedFixtures.map((f) => recByObj.get(f)!);
        this.byCleanId.clear();
        for (const rec of this.records) {
          this.byCleanId.set(rec.cleanId, rec);
          if (rec.slimFixture.id) {
            this.byCleanId.set(rec.slimFixture.id, rec);
          }
        }

        this.indexBuiltAt = Date.now();
        this.queryCache.clear();
        this.featuredTipsCache = null;
        this.leaguesCatalogCache = null;
        this.liveQueryCache.clear();
      } finally {
        this.indexPromise = null;
      }
    })();

    return this.indexPromise;
  }

  /**
   * Cached, deduplicated Live Scores fetcher shared across routers.
   */
  public async getCachedLiveScores(forceRefresh = false): Promise<{
    scores: LiveScore[];
    liveIdSet: Set<string>;
    signature: string;
  }> {
    if (!isScrapingEnabled()) {
      this.liveScoresCache = null;
      return {
        scores: [],
        liveIdSet: new Set<string>(),
        signature: 'SCRAPING_OFF',
      };
    }

    const now = Date.now();
    if (!forceRefresh && this.liveScoresCache && now - this.liveScoresCache.fetchedAt < this.LIVE_SCORES_TTL_MS) {
      const liveIdSet = new Set<string>();
      for (const s of this.liveScoresCache.scores) {
        if (s.fixtureId) {
          liveIdSet.add(s.fixtureId);
          liveIdSet.add(s.fixtureId.replace(/^fs_/, ''));
          liveIdSet.add(`fs_${s.fixtureId.replace(/^fs_/, '')}`);
        }
      }
      return {
        scores: this.liveScoresCache.scores,
        liveIdSet,
        signature: this.liveScoresCache.signature,
      };
    }

    if (!this.liveScoresPromise || forceRefresh) {
      this.liveScoresPromise = flashscoreScraperService
        .getLiveScores()
        .catch(() => [] as LiveScore[])
        .finally(() => {
          this.liveScoresPromise = null;
        });
    }

    const scores = await this.liveScoresPromise;
    if (isSqliteEnabled() && scores && scores.length > 0) {
      try {
        const updates = scores.map((s) => ({
          id: s.fixtureId,
          status: s.status === 'FINISHED' ? 'FINISHED' : 'LIVE',
          kickOffTime: s.status === 'FINISHED' ? 'FT' : s.minute ? `${s.minute}'` : 'Live',
          score: { home: s.homeScore, away: s.awayScore },
        }));
        db.updateUpcomingFixtureStatuses(updates);
        db.evaluateBets(scores);
      } catch (syncErr: any) {
        console.warn('[FixturesWorker] Notice syncing live status to SQLite:', syncErr?.message);
      }
    }

    const signature = scores
      .map((s) => `${s.fixtureId}:${s.homeScore}-${s.awayScore}:${s.minute}:${s.status}`)
      .join('|');

    this.liveScoresCache = {
      scores,
      fetchedAt: Date.now(),
      signature,
    };

    const liveIdSet = new Set<string>();
    for (const s of scores) {
      if (s.fixtureId) {
        liveIdSet.add(s.fixtureId);
        liveIdSet.add(s.fixtureId.replace(/^fs_/, ''));
        liveIdSet.add(`fs_${s.fixtureId.replace(/^fs_/, '')}`);
      }
    }

    return { scores, liveIdSet, signature };
  }

  /**
   * Executes filtered, sorted, pre-grouped server-side query over the warm index.
   * Resolves dateFilter='AUTO' on server so the client never downloads all dates just to pick Today/Tomorrow.
   */
  public async queryUpcomingFixtures(
    params: WorkerQueryParams = {}
  ): Promise<{ jsonPayload: string; etag: string; resolvedDateFilter: string; count: number }> {
    if (!isSqliteEnabled()) {
      const payloadObj = {
        success: true,
        sqliteBlocked: true,
        sqliteGate: getSqliteGateState(),
        provider: 'FLASHSCORE',
        count: 0,
        totalDatabaseCount: 0,
        resolvedDateFilter: params.dateFilter || 'ALL',
        fixtures: [],
        groups: [],
      };
      const jsonPayload = JSON.stringify(payloadObj);
      return {
        jsonPayload,
        etag: makeEtag(jsonPayload),
        resolvedDateFilter: params.dateFilter || 'ALL',
        count: 0,
      };
    }

    if (params.forceRefresh) {
      this.invalidate();
    }

    await this.ensureIndexReady(Boolean(params.forceRefresh));
    const liveData = await this.getCachedLiveScores(false);

    const league = params.league || 'ALL';
    const rawDateFilter = (params.dateFilter || 'ALL').trim();
    const dateParam = params.date;
    const startDate = params.startDate;
    const endDate = params.endDate;
    const search = (params.search || '').trim().toLowerCase();
    const sortBy = (params.sortBy || 'DEFAULT').toUpperCase();
    const marketFilter = (params.marketFilter || 'MOST_LIKELY').toUpperCase();
    const popularMarkets =
      marketFilter === 'POPULAR' && Array.isArray(params.popularMarkets)
        ? params.popularMarkets.slice(0, 3)
        : undefined;

    const excludeVolatile = db.getSettings()?.excludeVolatileLeagues !== false;
    const cacheKey = JSON.stringify({
      v: this.indexVersion,
      liveSig: liveData.signature,
      league,
      rawDateFilter,
      dateParam,
      startDate,
      endDate,
      search,
      sortBy,
      marketFilter,
      popularMarkets,
      excludeVolatile,
    });

    const cached = this.queryCache.get(cacheKey);
    if (cached && !params.forceRefresh) {
      // Also parse resolvedDateFilter cheaply? Only needed inside server if logged; return directly
      return {
        jsonPayload: cached.jsonPayload,
        etag: cached.etag,
        resolvedDateFilter: rawDateFilter,
        count: 0,
      };
    }

    // Filter out live matches
    const nonLiveRecords = this.records.filter((r) => {
      if (r.isLiveInDb) return false;
      if (liveData.liveIdSet.has(r.cleanId) || liveData.liveIdSet.has(r.slimFixture.id)) return false;
      return true;
    });

    // Resolve 'AUTO' -> 'TODAY' -> 'TOMORROW' -> 'ALL' cleanly on server with pre-resolved date descriptors
    let resolvedDateFilter = rawDateFilter;
    let resolvedDateObj = resolveDateFilter(rawDateFilter);
    if (rawDateFilter.toUpperCase() === 'AUTO') {
      const todayResolved = resolveDateFilter('TODAY');
      if (nonLiveRecords.some((r) => matchesResolvedDateFilter(r.slimFixture, todayResolved))) {
        resolvedDateFilter = 'TODAY';
        resolvedDateObj = todayResolved;
      } else {
        const tomorrowResolved = resolveDateFilter('TOMORROW');
        if (nonLiveRecords.some((r) => matchesResolvedDateFilter(r.slimFixture, tomorrowResolved))) {
          resolvedDateFilter = 'TOMORROW';
          resolvedDateObj = tomorrowResolved;
        } else {
          resolvedDateFilter = 'ALL';
          resolvedDateObj = { kind: 'ALL', canonicalKey: 'ALL' };
        }
      }
    } else if (!dateParam && !startDate && !endDate) {
      resolvedDateFilter = resolvedDateObj.canonicalKey;
    }

    const activeSingleDateObj = dateParam ? resolveDateFilter(dateParam) : null;
    const checkLeague = league !== 'ALL';
    const hasSearch = search.length > 0;
    const hasDateRange = Boolean(startDate && endDate);

    const filtered: Fixture[] = [];
    for (const r of nonLiveRecords) {
      const f = r.slimFixture;

      if (isSimulationLeague(f.league, f.leagueName, undefined, f.leagueUrl, f.stage, f.homeTeam, f.awayTeam)) {
        continue;
      }

      if (activeSingleDateObj) {
        if (!matchesResolvedDateFilter(f, activeSingleDateObj)) continue;
      } else if (hasDateRange) {
        if (f.matchDate < startDate! || f.matchDate > endDate!) continue;
      } else if (resolvedDateFilter !== 'ALL') {
        if (!matchesResolvedDateFilter(f, resolvedDateObj)) continue;
      }

      if (checkLeague && !matchesLeague(f.league, f.leagueName, league)) {
        continue;
      }

      if (!checkLeague && excludeVolatile && (isKnownVolatileLeague(f.league) || isKnownVolatileLeague(f.leagueName))) {
        continue;
      }

      if (hasSearch && !r.searchBlob.includes(search)) {
        continue;
      }

      const activeMarketPick = resolveMarketPickForMarkets(r.fullMarkets, marketFilter, popularMarkets);
      if (activeMarketPick === null) {
        continue;
      }

      filtered.push(activeMarketPick ? { ...f, activeMarketPick } : f);
    }

    const sorted =
      sortBy === 'DEFAULT'
        ? filtered // already sorted by popularity + datetime descending in index!
        : sortFixturesForQuery(filtered, sortBy, marketFilter);

    const groups = buildGroupsForFixtures(sorted);

    const payloadObj = {
      success: true,
      provider: 'FLASHSCORE',
      count: sorted.length,
      totalDatabaseCount: nonLiveRecords.length,
      resolvedDateFilter,
      fixtures: sorted,
      groups,
    };

    const jsonPayload = JSON.stringify(payloadObj);
    const etag = makeEtag(jsonPayload);

    if (this.queryCache.size >= this.QUERY_CACHE_MAX) {
      const firstKey = this.queryCache.keys().next().value;
      if (firstKey !== undefined) this.queryCache.delete(firstKey);
    }
    this.queryCache.set(cacheKey, {
      jsonPayload,
      etag,
      timestamp: Date.now(),
    });

    return {
      jsonPayload,
      etag,
      resolvedDateFilter,
      count: sorted.length,
    };
  }

  /**
   * Pre-enriches, filters, sorts, and groups LIVE fixtures using O(1) warm-index lookups (zero N+1 SQLite queries).
   */
  public async queryLiveFixtures(params?: {
    league?: string;
    search?: string;
    sortBy?: string;
    marketFilter?: string;
    popularMarkets?: string[];
    limit?: number;
  }): Promise<{ jsonPayload: string; etag: string }> {
    if (!isSqliteEnabled()) {
      const jsonPayload = JSON.stringify({
        success: true,
        sqliteBlocked: true,
        sqliteGate: getSqliteGateState(),
        provider: 'FLASHSCORE',
        count: 0,
        fixtures: [],
        groups: [],
      });
      return { jsonPayload, etag: makeEtag(jsonPayload) };
    }

    await this.ensureIndexReady(false);
    const liveData = await this.getCachedLiveScores(false);

    const league = params?.league || 'ALL';
    const search = (params?.search || '').trim().toLowerCase();
    const sortBy = (params?.sortBy || 'DEFAULT').toUpperCase();
    const marketFilter = (params?.marketFilter || 'MOST_LIKELY').toUpperCase();
    const popularMarkets =
      marketFilter === 'POPULAR' && Array.isArray(params?.popularMarkets)
        ? params.popularMarkets.slice(0, 3)
        : undefined;
    const limit = params?.limit && params.limit > 0 ? params.limit : 200;

    const excludeVolatile = db.getSettings()?.excludeVolatileLeagues !== false;
    const cacheKey = JSON.stringify({
      v: this.indexVersion,
      liveSig: liveData.signature,
      league,
      search,
      sortBy,
      marketFilter,
      popularMarkets,
      limit,
      excludeVolatile,
    });

    const cached = this.liveQueryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.LIVE_SCORES_TTL_MS) {
      return { jsonPayload: cached.jsonPayload, etag: cached.etag };
    }

    let rawLive: Fixture[] = [];

    if (liveData.scores.length > 0) {
      const todayResolved = resolveDateFilter('TODAY');
      const todayTargetDate = todayResolved.kind === 'SINGLE' ? todayResolved.targetDate : '';
      rawLive = liveData.scores.map((s) => {
        const cleanId = cleanFixtureId(s.fixtureId);
        const existing = this.byCleanId.get(s.fixtureId) || this.byCleanId.get(cleanId);

        if (existing) {
          return {
            ...existing.slimFixture,
            status: 'LIVE' as const,
            minute: s.minute,
            score: { home: s.homeScore, away: s.awayScore },
            kickOffTime: s.status === 'FINISHED' ? 'FT' : s.minute ? `${s.minute}'` : 'Live',
          };
        }

        const baseLive: Fixture = {
          id: s.fixtureId.startsWith('fs_') ? s.fixtureId : `fs_${s.fixtureId}`,
          providerId: 'FLASHSCORE',
          league: s.league || 'ALL',
          leagueName: s.leagueName || 'Live In-Play',
          matchDate: todayTargetDate,
          kickOffTime: s.status === 'FINISHED' ? 'FT' : s.minute ? `${s.minute}'` : 'Live',
          homeTeam: s.homeTeam,
          awayTeam: s.awayTeam,
          status: 'LIVE' as const,
          minute: s.minute,
          score: { home: s.homeScore, away: s.awayScore },
          popularityScore: getLeaguePopularityScore(s.league || 'ALL', s.leagueName || 'Live In-Play'),
        };
        return baseLive;
      });
    } else {
      rawLive = this.records
        .filter((r) => r.isLiveInDb)
        .map((r) => r.slimFixture);
    }

    const filtered: Fixture[] = [];
    for (const f of rawLive) {
      if (isSimulationLeague(f.league, f.leagueName, undefined, f.leagueUrl, f.stage, f.homeTeam, f.awayTeam)) continue;
      if (league !== 'ALL' && !matchesLeague(f.league, f.leagueName, league)) continue;
      if (league === 'ALL' && excludeVolatile && (isKnownVolatileLeague(f.league) || isKnownVolatileLeague(f.leagueName))) continue;
      if (search.length > 0) {
        const blob = `${f.homeTeam || ''} ${f.awayTeam || ''} ${f.leagueName || ''}`.toLowerCase();
        if (!blob.includes(search)) continue;
      }
      const cleanId = cleanFixtureId(f.id);
      const existingRec = this.byCleanId.get(f.id) || this.byCleanId.get(cleanId);
      const activeMarketPick = resolveMarketPickForMarkets(existingRec?.fullMarkets, marketFilter, popularMarkets);
      if (activeMarketPick === null) continue;
      filtered.push(activeMarketPick ? { ...f, activeMarketPick } : f);
    }

    const sorted = sortFixturesForQuery(filtered, sortBy, marketFilter).slice(0, limit);
    const groups = buildGroupsForFixtures(sorted);

    const payloadObj = {
      success: true,
      scrapingBlocked: !isScrapingEnabled(),
      scrapingGate: getScrapingGateState(),
      provider: 'FLASHSCORE',
      count: sorted.length,
      fixtures: sorted,
      groups,
    };

    const jsonPayload = JSON.stringify(payloadObj);
    const etag = makeEtag(jsonPayload);

    if (this.liveQueryCache.size > 32) {
      this.liveQueryCache.clear();
    }
    this.liveQueryCache.set(cacheKey, {
      jsonPayload,
      etag,
      timestamp: Date.now(),
    });

    return { jsonPayload, etag };
  }

  /**
   * Computes today's >75% high-confidence featured tips and odds purely on the server,
   * strictly restricted to the highest leagues by Prediction history Model Accuracy.
   */
  public async getFeaturedHighConfidenceTips(forceRefresh = false): Promise<{ jsonPayload: string; etag: string }> {
    if (!isSqliteEnabled()) {
      const jsonPayload = JSON.stringify({
        success: true,
        sqliteBlocked: true,
        sqliteGate: getSqliteGateState(),
        count: 0,
        totalOdds: 1.0,
        tips: [],
      });
      return { jsonPayload, etag: makeEtag(jsonPayload) };
    }

    if (forceRefresh) {
      this.featuredTipsCache = null;
    }

    await this.ensureIndexReady(forceRefresh);

    if (this.featuredTipsCache && !forceRefresh) {
      return {
        jsonPayload: this.featuredTipsCache.jsonPayload,
        etag: this.featuredTipsCache.etag,
      };
    }

    // Retrieve authoritative league model accuracy statistics from historical prediction results
    const leagueAccMap = predictionsDb.getLeagueModelAccuracies();

    const lookupLeagueAccuracy = (league?: string, leagueName?: string): LeagueModelAccuracyRecord | null => {
      const keys = [
        cleanStr(leagueName || ''),
        cleanStr(league || ''),
        (leagueName || '').trim().toLowerCase(),
        (league || '').trim().toLowerCase(),
      ];
      for (const k of keys) {
        if (k && leagueAccMap.has(k)) {
          return leagueAccMap.get(k)!;
        }
      }
      return null;
    };

    const excludeVolatile = db.getSettings()?.excludeVolatileLeagues !== false;

    // Resolve target date: prioritize calendar TODAY, fallback to closest date with active predictions
    const todayResolved = resolveDateFilter('TODAY');
    const hasTodayMatches = this.records.some(
      (r) =>
        r.slimFixture.hasPrediction &&
        matchesResolvedDateFilter(r.slimFixture, todayResolved) &&
        r.slimFixture.status !== 'FINISHED' &&
        r.slimFixture.status !== 'CANCELLED' &&
        r.slimFixture.status !== 'POSTPONED'
    );

    let targetDateFilter = todayResolved;
    if (!hasTodayMatches) {
      const availableDates = Array.from(
        new Set(
          this.records
            .filter(
              (r) =>
                r.slimFixture.hasPrediction &&
                r.slimFixture.status !== 'FINISHED' &&
                r.slimFixture.status !== 'CANCELLED' &&
                r.slimFixture.status !== 'POSTPONED'
            )
            .map((r) => r.slimFixture.matchDate)
            .filter(Boolean)
        )
      ).sort();

      if (availableDates.length > 0) {
        targetDateFilter = resolveDateFilter(availableDates[0]);
      }
    }

    // Pass 1: Collect high-confidence candidate tips (>= 75% probability, excluding trivial 0.5 lines)
    interface CandidateTipEntry {
      record: WorkerIndexedRecord;
      market: MarketOption;
      odds: number;
      hasScrapedOdds: boolean;
      leagueAccuracy: number;
      leagueSettledMatches: number;
      leagueWonMatches: number;
    }

    const candidateEntries: CandidateTipEntry[] = [];

    for (const rec of this.records) {
      const f = rec.slimFixture;
      if (!f.hasPrediction || !rec.fullMarkets || rec.fullMarkets.length === 0) continue;
      if (isSimulationLeague(f.league, f.leagueName, undefined, f.leagueUrl, f.stage, f.homeTeam, f.awayTeam)) continue;
      if (excludeVolatile && (isKnownVolatileLeague(f.league) || isKnownVolatileLeague(f.leagueName))) continue;

      if (!matchesResolvedDateFilter(f, targetDateFilter)) continue;
      if (f.status === 'FINISHED' || f.status === 'CANCELLED' || f.status === 'POSTPONED') continue;

      // STRICT REQUIREMENT: League must have settled prediction history
      const accStat = lookupLeagueAccuracy(f.league, f.leagueName);
      if (!accStat || accStat.settled === 0) {
        // Exclude leagues with no prediction history
        continue;
      }

      for (const market of rec.fullMarkets) {
        if (isZeroFiveGoalsKey(market.key)) continue;
        if (market.probability >= 0.75) {
          const fsOdd = extractFlashscoreOddsServer(market.key, rec.marketOdds);
          if (fsOdd === null || fsOdd <= 1.0) {
            continue;
          }
          const odds = fsOdd;
          const hasScrapedOdds = true;

          candidateEntries.push({
            record: rec,
            market,
            odds,
            hasScrapedOdds,
            leagueAccuracy: accStat.accuracy,
            leagueSettledMatches: accStat.settled,
            leagueWonMatches: accStat.won,
          });
        }
      }
    }

    // Determine the highest league accuracy among available candidate leagues
    let maxLeagueAccuracy = 0;
    for (const entry of candidateEntries) {
      if (entry.leagueAccuracy > maxLeagueAccuracy) {
        maxLeagueAccuracy = entry.leagueAccuracy;
      }
    }

    // Highest leagues tier threshold:
    // If top accuracy is >= 75%, threshold is within 15% (or 75%, whichever is higher).
    // If top accuracy is < 75%, threshold is strictly the top accuracy (with a minimum floor of 50%).
    const accuracyThreshold = maxLeagueAccuracy >= 75 ? Math.max(75, maxLeagueAccuracy - 15) : maxLeagueAccuracy;

    // Filter strictly to highest leagues by model accuracy (minimum 50% floor)
    const qualifyingEntries = candidateEntries.filter(
      (entry) => entry.leagueAccuracy >= accuracyThreshold && entry.leagueAccuracy >= 50
    );

    // Build final tips array
    const tips: FeaturedTipDTO[] = qualifyingEntries.map((entry) => ({
      fixture: entry.record.slimFixture,
      market: entry.market,
      odds: entry.odds,
      hasScrapedOdds: entry.hasScrapedOdds,
      leagueAccuracy: entry.leagueAccuracy,
      leagueSettledMatches: entry.leagueSettledMatches,
      leagueWonMatches: entry.leagueWonMatches,
      isHighestAccuracyLeague: entry.leagueAccuracy === maxLeagueAccuracy,
    }));

    // Sort tips strictly by:
    // 1. Highest league accuracy descending
    // 2. Highest settled matches descending
    // 3. Highest tip probability descending
    tips.sort((a, b) => {
      const accDiff = (b.leagueAccuracy ?? 0) - (a.leagueAccuracy ?? 0);
      if (accDiff !== 0) return accDiff;
      const settledDiff = (b.leagueSettledMatches ?? 0) - (a.leagueSettledMatches ?? 0);
      if (settledDiff !== 0) return settledDiff;
      return b.market.probability - a.market.probability;
    });

    // Populate combos exclusively for qualifying fixtures
    const qualifyingFixtureIds = new Set(tips.map((t) => t.fixture.id));
    const comboMarketsByFixture: Record<string, Array<{ market: MarketOption; odds: number; hasScrapedOdds: boolean }>> = {};

    for (const entry of qualifyingEntries) {
      const f = entry.record.slimFixture;
      if (qualifyingFixtureIds.has(f.id) && !comboMarketsByFixture[f.id]) {
        comboMarketsByFixture[f.id] = (entry.record.fullMarkets || [])
          .filter((m) => m.key.startsWith('COMBO_') && !isZeroFiveGoalsKey(m.key))
          .map((m) => {
            const fsOdd = extractFlashscoreOddsServer(m.key, entry.record.marketOdds);
            const hasScrapedOdds = fsOdd !== null;
            const odds = fsOdd ?? (m.probability > 0 ? Number(Math.max(1.02, Math.min(50, 1 / m.probability)).toFixed(2)) : 1.5);
            return {
              market: m,
              odds,
              hasScrapedOdds,
            };
          })
          .sort((a, b) => b.market.probability - a.market.probability);
      }
    }

    const seenComboFixtures = new Set<string>();
    const uniqueMatchTips = tips.filter((t) => {
      if (seenComboFixtures.has(t.fixture.id)) return false;
      seenComboFixtures.add(t.fixture.id);
      return true;
    });

    const totalOdds =
      uniqueMatchTips.length === 0
        ? 1.0
        : Number(uniqueMatchTips.reduce((acc, tip) => acc * tip.odds, 1.0).toFixed(2));

    const payloadObj: FeaturedTipsResponse = {
      success: true,
      count: tips.length,
      totalOdds,
      tips,
      comboMarketsByFixture,
      highestAccuracyThreshold: accuracyThreshold,
      maxLeagueAccuracy,
    };

    const jsonPayload = JSON.stringify(payloadObj);
    const etag = makeEtag(jsonPayload);

    this.featuredTipsCache = {
      jsonPayload,
      etag,
      timestamp: Date.now(),
    };

    return { jsonPayload, etag };
  }

  /**
   * Slims, filters, sorts, and pre-groups historical predictions on the server so History scope has zero client computation.
   */
  public async queryHistoryFixtures(params?: {
    league?: string;
    search?: string;
    sortBy?: string;
    marketFilter?: string;
    popularMarkets?: string[];
    dateFilter?: string;
    limit?: number;
    forceRefresh?: boolean;
  }): Promise<{ jsonPayload: string; etag: string }> {
    if (!isSqliteEnabled()) {
      const jsonPayload = JSON.stringify({
        success: true,
        sqliteBlocked: true,
        sqliteGate: getSqliteGateState(),
        provider: 'PREDICTIONS_DB',
        count: 0,
        matches: [],
        groups: [],
        summary: predictionsDb.getEvaluationSummary(),
      });
      return { jsonPayload, etag: makeEtag(jsonPayload) };
    }

    await db.init();
    await predictionsDb.init();
    await predictionsDb.reconcileAndSyncResults({ force: Boolean(params?.forceRefresh) });

    const effectiveLimit = params?.limit === 0 ? 0 : (params?.limit || 300);
    const rawMatches = await predictionsDb.getHistoricalPredictionsAsync({
      league: params?.league,
      limit: effectiveLimit,
    });
    const summary = predictionsDb.getEvaluationSummary();

    const search = (params?.search || '').trim().toLowerCase();
    const sortBy = (params?.sortBy || 'DEFAULT').toUpperCase();
    const marketFilter = (params?.marketFilter || 'MOST_LIKELY').toUpperCase();
    const popularMarkets =
      marketFilter === 'POPULAR' && Array.isArray(params?.popularMarkets)
        ? params.popularMarkets.slice(0, 3)
        : undefined;
    const resolvedDate = params?.dateFilter && params.dateFilter !== 'ALL' ? resolveDateFilter(params.dateFilter) : null;

    const slimmed: Fixture[] = [];
    for (const m of rawMatches) {
      if (!m.prediction) continue;
      if (isSimulationLeague(m.league, m.leagueName, undefined, m.leagueUrl, m.stage, m.homeTeam, m.awayTeam)) continue;
      if (resolvedDate && !matchesResolvedDateFilter(m, resolvedDate)) continue;
      if (search.length > 0) {
        const blob = `${m.homeTeam || ''} ${m.awayTeam || ''} ${m.leagueName || ''}`.toLowerCase();
        if (!blob.includes(search)) continue;
      }
      const { slimFixture } = buildSlimFixture(m, m.timestamp);
      const hasStoredOverUnder = Array.isArray(m.markets) && m.markets.some((mk) => mk.key === 'OVER_25');
      const rawMarketsSource =
        m.markets && m.markets.length > 0 && hasStoredOverUnder
          ? m.markets
          : ApexEngine.calculateMarkets(
              m.prediction,
              DEFAULT_ENGINE_SETTINGS,
              m.homeTeam,
              m.awayTeam
            ).markets;
      const rawMarkets = (rawMarketsSource || []).filter((mk) => !isZeroFiveGoalsKey(mk.key));
      if (rawMarkets.length > 0) {
        slimFixture.markets = rawMarkets.map((mk) => ({
          key: mk.key,
          name: mk.name,
          probability: Number(Number(mk.probability ?? 0).toFixed(3)),
          isBanker: Boolean(mk.isBanker),
        }));
      }
      const activeMarketPick = resolveMarketPickForMarkets(rawMarkets, marketFilter, popularMarkets);
      if (activeMarketPick === null) continue;
      if (activeMarketPick) {
        slimFixture.activeMarketPick = activeMarketPick;
      }
      slimmed.push(slimFixture);
    }

    const sorted = sortFixturesForQuery(slimmed, sortBy, marketFilter);
    const groups = buildGroupsForFixtures(sorted);

    const jsonPayload = JSON.stringify({
      success: true,
      provider: 'PREDICTIONS_DB',
      count: sorted.length,
      matches: sorted,
      groups,
      summary,
    });
    const etag = makeEtag(jsonPayload);
    return { jsonPayload, etag };
  }

  /**
   * Returns pre-sorted global & upcoming leagues catalog from SQLite and in-memory index.
   */
  public async getSortedLeaguesCatalog(): Promise<{ jsonPayload: string; etag: string }> {
    const sqliteActive = isSqliteEnabled();
    if (sqliteActive) {
      await db.init();
      await predictionsDb.init();
    }

    if (this.leaguesCatalogCache) {
      return {
        jsonPayload: this.leaguesCatalogCache.jsonPayload,
        etag: this.leaguesCatalogCache.etag,
      };
    }

    const parseCountryAndName = (rawName: string, fallbackStage?: string): { name: string; country: string } => {
      const trimmed = String(rawName || '').trim();
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const prefix = trimmed.slice(0, colonIdx).trim();
        const suffix = trimmed.slice(colonIdx + 1).trim();
        if (suffix) {
          return {
            country: prefix.replace(/\b\w/g, (c) => c.toUpperCase()),
            name: suffix,
          };
        }
      }
      const stageTrimmed = String(fallbackStage || '').trim();
      const stageColon = stageTrimmed.indexOf(':');
      if (stageColon > 0) {
        return {
          country: stageTrimmed.slice(0, stageColon).trim(),
          name: trimmed,
        };
      }
      return {
        country: stageTrimmed || 'Global',
        name: trimmed,
      };
    };

    const map = new Map<string, { code: string; name: string; country?: string }>();
    for (const l of GLOBAL_LEAGUES_DATASET) {
      if (!isSimulationLeague(l.code, l.name, l.country)) {
        map.set(l.code.toLowerCase(), {
          code: l.code,
          name: l.name,
          country: l.country,
        });
      }
    }

    if (sqliteActive) {
      try {
        const dbLeagues = db.getAllUpcomingLeagues ? db.getAllUpcomingLeagues() : [];
        for (const dl of dbLeagues) {
          if (dl.league && dl.leagueName) {
            const code = String(dl.league).trim();
            const rawName = String(dl.leagueName).trim();
            const key = code.toLowerCase();
            if (!isSimulationLeague(code, rawName, undefined, undefined, dl.stage)) {
              const parsed = parseCountryAndName(rawName, dl.stage);
              if (!map.has(key)) {
                map.set(key, {
                  code,
                  name: parsed.name,
                  country: parsed.country,
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn('[FixturesWorker] Error loading db leagues catalog:', e);
      }
    }

    if (this.records.length > 0) {
      for (const r of this.records) {
        const f = r.slimFixture;
        if (f.league && f.leagueName) {
          const code = String(f.league).trim();
          const rawName = String(f.leagueName).trim();
          const key = code.toLowerCase();
          if (!isSimulationLeague(code, rawName, undefined, f.leagueUrl, f.stage)) {
            const parsed = parseCountryAndName(rawName, f.stage);
            if (!map.has(key)) {
              map.set(key, {
                code,
                name: parsed.name,
                country: parsed.country,
              });
            }
          }
        }
      }
    }

    const sorted: LeagueOptionDTO[] = Array.from(map.values()).sort((a, b) => {
      const scoreA = getLeaguePopularityScore(a.code, a.name, a.country ? `${a.country}: ${a.name}` : a.name);
      const scoreB = getLeaguePopularityScore(b.code, b.name, b.country ? `${b.country}: ${b.name}` : b.name);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.name.localeCompare(b.name);
    });

    const jsonPayload = JSON.stringify({
      success: true,
      count: sorted.length,
      leagues: sorted,
    });
    const etag = makeEtag(jsonPayload);

    this.leaguesCatalogCache = {
      jsonPayload,
      etag,
      timestamp: Date.now(),
    };

    return { jsonPayload, etag };
  }

  /**
   * Returns merged catalog of all synced and discovered leagues for the Standings page,
   * prioritized by table availability and league popularity, with ETag caching.
   */
  public async getStandingsCatalog(): Promise<{ jsonPayload: string; etag: string }> {
    const sqliteActive = isSqliteEnabled();
    if (sqliteActive && this.standingsCatalogCache) {
      return {
        jsonPayload: this.standingsCatalogCache.jsonPayload,
        etag: this.standingsCatalogCache.etag,
      };
    }

    if (sqliteActive) {
      await db.init();
    }
    const summaries = sqliteActive ? db.getAllLeagueStandingsSummaries() : [];
    const discovered = sqliteActive ? db.getDiscoveredTournamentsFromDb() : [];

    const items: StandingsCatalogItem[] = [];
    const byUrl = new Map<string, StandingsCatalogItem>();
    const byAlias = new Map<string, StandingsCatalogItem>();

    const cleanDisplayName = (rawName: string, country: string): string => {
      const trimmed = (rawName || '').trim();
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const prefix = trimmed.slice(0, colonIdx).trim();
        const suffix = trimmed.slice(colonIdx + 1).trim();
        if (suffix && (!country || country === 'International' || prefix.toLowerCase() === country.toLowerCase())) {
          return suffix;
        }
      }
      return trimmed || rawName;
    };

    const findExisting = (code: string, name: string, country: string, leagueUrl?: string): StandingsCatalogItem | undefined => {
      if (leagueUrl && byUrl.has(leagueUrl)) return byUrl.get(leagueUrl);
      const codeKey = cleanStr(code);
      if (codeKey && byAlias.has(codeKey)) return byAlias.get(codeKey);

      for (const alias of getLeagueAliases(code)) {
        const a = cleanStr(alias);
        if (a && byAlias.has(a)) return byAlias.get(a);
      }

      const fullSlug = cleanStr(`${country}_${name}`);
      if (fullSlug && byAlias.has(fullSlug)) return byAlias.get(fullSlug);

      return undefined;
    };

    const registerItem = (item: StandingsCatalogItem) => {
      items.push(item);
      if (item.leagueUrl) byUrl.set(item.leagueUrl, item);
      const codeKey = cleanStr(item.code);
      if (codeKey) byAlias.set(codeKey, item);
      const fullSlug = cleanStr(`${item.country}_${item.name}`);
      if (fullSlug) byAlias.set(fullSlug, item);
      for (const alias of getLeagueAliases(item.code)) {
        const a = cleanStr(alias);
        if (a && !byAlias.has(a)) byAlias.set(a, item);
      }
    };

    // 1. Register all synced leagues already stored in league_standings
    for (const s of summaries) {
      const country = (s.country || 'International').trim();
      const name = cleanDisplayName(s.leagueName, country);
      if (isSimulationLeague(s.leagueCode, name, country, s.leagueUrl)) continue;
      const existing = findExisting(s.leagueCode, name, country, s.leagueUrl);
      if (existing) {
        if (!existing.hasStandings && s.teamCount > 0) {
          existing.hasStandings = true;
          existing.teamCount = s.teamCount;
          existing.groupCount = s.groupCount;
          existing.updatedAt = s.updatedAt;
        }
        if (!existing.leagueUrl && s.leagueUrl) {
          existing.leagueUrl = s.leagueUrl;
          byUrl.set(s.leagueUrl, existing);
        }
        continue;
      }

      const item: StandingsCatalogItem = {
        code: s.leagueCode,
        name,
        country,
        leagueUrl: s.leagueUrl,
        hasStandings: s.teamCount > 0,
        teamCount: s.teamCount,
        groupCount: s.groupCount,
        updatedAt: s.updatedAt || undefined,
        popularityScore: getLeaguePopularityScore(s.leagueCode, name, `${country}: ${name}`),
      };
      registerItem(item);
    }

    // 2. Merge discovered competitions from Flashscore raw daily feeds & upcoming_fixtures
    for (const d of discovered) {
      const country = (d.country || 'International').trim();
      const name = cleanDisplayName(d.tournament, country);
      const fallbackCode = cleanStr(`${country}_${name}`) || cleanStr(name);
      const code = (d.leagueCode || fallbackCode).toLowerCase();
      if (isSimulationLeague(code, name, country, d.leagueUrl, d.tournament)) continue;
      const existing = findExisting(code, name, country, d.leagueUrl);
      if (existing) {
        if (!existing.leagueUrl && d.leagueUrl) {
          existing.leagueUrl = d.leagueUrl;
          byUrl.set(d.leagueUrl, existing);
        }
        continue;
      }

      registerItem({
        code,
        name,
        country,
        leagueUrl: d.leagueUrl,
        hasStandings: false,
        teamCount: 0,
        groupCount: 0,
        popularityScore: getLeaguePopularityScore(code, name, `${country}: ${name}`),
      });
    }

    // 3. Merge Global Leagues Dataset entries if not already present
    for (const g of GLOBAL_LEAGUES_DATASET) {
      const country = (g.country || 'International').trim();
      if (isSimulationLeague(g.code, g.name, country)) continue;
      const existing = findExisting(g.code, g.name, country);
      if (existing) continue;

      registerItem({
        code: g.code.toLowerCase(),
        name: g.name,
        country,
        hasStandings: false,
        teamCount: 0,
        groupCount: 0,
        popularityScore: getLeaguePopularityScore(g.code, g.name, `${country}: ${g.name}`),
      });
    }

    items.sort((a, b) => {
      if (a.hasStandings !== b.hasStandings) return a.hasStandings ? -1 : 1;
      if (a.popularityScore !== b.popularityScore) return b.popularityScore - a.popularityScore;
      const cCmp = a.country.localeCompare(b.country);
      if (cCmp !== 0) return cCmp;
      return a.name.localeCompare(b.name);
    });

    const syncedCount = items.filter((i) => i.hasStandings).length;
    const jsonPayload = JSON.stringify({
      success: true,
      count: items.length,
      syncedCount,
      leagues: items,
    });
    const etag = makeEtag(jsonPayload);

    if (sqliteActive) {
      this.standingsCatalogCache = {
        jsonPayload,
        etag,
        timestamp: Date.now(),
      };
    }

    return { jsonPayload, etag };
  }
}

export const fixturesWorkerService = new FixturesWorkerService();
registerDbMutationListener(() => fixturesWorkerService.invalidate());
