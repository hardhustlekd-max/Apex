import crypto from 'crypto';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { getSqliteGateState, isSqliteEnabled, registerDbMutationListener } from '../core/sqliteClient.js';
import { getScrapingGateState, isScrapingEnabled } from '../core/scrapingGate.js';
import {
  cleanFixtureId,
  Fixture,
  FeaturedTipDTO,
  LeagueGroupDTO,
  LeagueOptionDTO,
  LeagueStandingTable,
  MarketOption,
  ScrapedMarketOdds,
  StandingsCatalogItem,
} from '../core/types.js';
import { ApexEngine } from '../core/poisson.js';
import { matchesResolvedDateFilter, resolveDateFilter } from '../core/dateUtils.js';
import { cleanStr, getLeagueAliases, matchesLeague } from '../core/leagueMapper.js';
import { GLOBAL_LEAGUES_DATASET } from '../core/globalLeaguesDataset.js';
import { teamMatchScore } from '../core/feedParser.js';
import {
  getFixtureSortableDateTime,
  getLeaguePopularityScore,
  sortFixturesByPopularityInPlace,
} from '../core/leaguePriority.js';
import { flashscoreScraperService } from './flashscoreScraperService.js';
import { LiveScore } from '../providers/types.js';

export type SortByOption = 'DEFAULT' | 'PROB_DESC' | 'PROB_ASC' | 'HOME_DESC' | 'DRAW_DESC' | 'AWAY_DESC';
export type MarketFilterOption = 'MOST_LIKELY' | 'OVER_UNDER' | '1X2' | 'BTTS';

export interface WorkerQueryParams {
  league?: string;
  dateFilter?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: string;
  marketFilter?: string;
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
    case 'OVER_25':
      odd = marketOdds.over25Odds;
      break;
    case 'UNDER_25':
      odd = marketOdds.under25Odds;
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
    default:
      odd = undefined;
  }
  if (odd !== undefined && odd !== null && !isNaN(odd) && odd > 1.0) {
    return Number(odd.toFixed(2));
  }
  return null;
}

function buildWorkerStandingsLookup(tables: LeagueStandingTable[]): {
  byUrl: Map<string, LeagueStandingTable>;
  byKey: Map<string, LeagueStandingTable[]>;
} {
  const byUrl = new Map<string, LeagueStandingTable>();
  const byKey = new Map<string, LeagueStandingTable[]>();

  const normUrl = (url?: string) =>
    (url || '').trim().toLowerCase().replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '');

  const addKey = (rawKey: string | undefined, table: LeagueStandingTable) => {
    if (!rawKey) return;
    const k = rawKey.trim().toLowerCase();
    if (!k) return;
    const list = byKey.get(k);
    if (!list) byKey.set(k, [table]);
    else if (!list.includes(table)) list.push(table);
  };

  for (const table of tables) {
    if (!table || !Array.isArray(table.table) || table.table.length === 0) continue;
    const u = normUrl(table.leagueUrl);
    if (u && !byUrl.has(u)) byUrl.set(u, table);

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

function resolveWorkerStandingsClose(
  f: Fixture,
  lookup: ReturnType<typeof buildWorkerStandingsLookup>
): { isClose: boolean; reason?: string } {
  const normUrl = (f.leagueUrl || '').trim().toLowerCase().replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '');
  let table: LeagueStandingTable | undefined = normUrl ? lookup.byUrl.get(normUrl) : undefined;

  if (!table) {
    const probeKeys = new Set<string>();
    const pushKey = (val?: string) => {
      if (!val || val === 'ALL') return;
      const t = val.trim().toLowerCase();
      if (t) probeKeys.add(t);
      const c = cleanStr(val);
      if (c) probeKeys.add(c);
    };
    pushKey(f.league);
    pushKey(f.leagueName);
    if (f.league) for (const a of getLeagueAliases(f.league)) pushKey(a);
    if (f.leagueName) for (const a of getLeagueAliases(f.leagueName)) pushKey(a);

    outer: for (const key of probeKeys) {
      const cands = lookup.byKey.get(key);
      if (!cands) continue;
      for (const cand of cands) {
        if (cand.table.some((r) => teamMatchScore(f.homeTeam, r.teamName) > 0 || teamMatchScore(f.awayTeam, r.teamName) > 0)) {
          table = cand;
          break outer;
        }
      }
    }
  }

  if (table) {
    const { homeMatch, awayMatch } = ApexEngine.findMatchedStandingsPair(f.homeTeam, f.awayTeam, table);
    if (homeMatch && awayMatch) {
      const homeSnap = {
        rank: homeMatch.entry.rank,
        totalTeams: Math.max(homeMatch.entry.rank || 1, homeMatch.group.table.length),
        played: homeMatch.entry.played,
        points: homeMatch.entry.points,
        ppg: Number((homeMatch.entry.points / Math.max(1, homeMatch.entry.played)).toFixed(2)),
        groupName: homeMatch.group.name && homeMatch.group.name !== 'Standings' ? homeMatch.group.name : undefined,
      };
      const awaySnap = {
        rank: awayMatch.entry.rank,
        totalTeams: Math.max(awayMatch.entry.rank || 1, awayMatch.group.table.length),
        played: awayMatch.entry.played,
        points: awayMatch.entry.points,
        ppg: Number((awayMatch.entry.points / Math.max(1, awayMatch.entry.played)).toFixed(2)),
        groupName: awayMatch.group.name && awayMatch.group.name !== 'Standings' ? awayMatch.group.name : undefined,
      };
      const evaluated = ApexEngine.evaluateStandingsCloseStatus(homeSnap, awaySnap);
      return { isClose: evaluated.isClose, reason: evaluated.reason };
    }
  }

  const predClose = f.standingsClose ?? f.prediction?.standingsClose ?? f.prediction?.standingsContext?.standingsClose;
  const predReason = f.standingsCloseReason ?? f.prediction?.standingsCloseReason ?? f.prediction?.standingsContext?.standingsCloseReason;
  if (typeof predClose === 'boolean') {
    return { isClose: predClose, reason: predReason };
  }

  return { isClose: false };
}

function computePrecomputedFields(
  f: Fixture,
  standingsOverride?: { isClose: boolean; reason?: string }
): {
  authoritativePick?: Fixture['authoritativePick'];
  highestPick?: Fixture['highestPick'];
  probs?: Fixture['probs'];
  popularityScore: number;
  slimPrediction?: Fixture['prediction'];
  hasPrediction: boolean;
  standingsClose: boolean;
  standingsCloseReason?: string;
} {
  const popularityScore = getLeaguePopularityScore(f.league, f.leagueName, f.stage);
  const pred = f.prediction;
  const isStandingsClose = Boolean(
    standingsOverride?.isClose ??
      f.standingsClose ??
      pred?.standingsClose ??
      pred?.standingsContext?.standingsClose
  );
  const standingsCloseReason =
    standingsOverride?.reason ??
    f.standingsCloseReason ??
    pred?.standingsCloseReason ??
    pred?.standingsContext?.standingsCloseReason;

  if (!pred) {
    return {
      popularityScore,
      hasPrediction: false,
      standingsClose: isStandingsClose,
      standingsCloseReason,
    };
  }

  const hw = Number(pred.homeWinProb ?? 0);
  const dr = Number(pred.drawProb ?? 0);
  const aw = Number(pred.awayWinProb ?? 0);
  const o25 = Number(pred.over25Prob ?? 0);
  const u25 = Math.max(0, 1 - o25);
  const bttsY = Number(pred.bttsProb ?? 0);
  const bttsN = Math.max(0, 1 - bttsY);

  const non1x2Candidates: Array<{
    key: MarketOption['key'];
    type: 'O2.5' | 'U2.5' | 'BTTS_Y' | 'BTTS_N';
    label: string;
    shortLabel: string;
    probability: number;
  }> = [
    { key: 'OVER_25', type: 'O2.5', label: 'Over 2.5 Goals', shortLabel: 'O 2.5', probability: o25 },
    { key: 'UNDER_25', type: 'U2.5', label: 'Under 2.5 Goals', shortLabel: 'U 2.5', probability: u25 },
    { key: 'BTTS_YES', type: 'BTTS_Y', label: 'Both Teams To Score (Yes)', shortLabel: 'BTTS Y', probability: bttsY },
    { key: 'BTTS_NO', type: 'BTTS_N', label: 'Both Teams To Score (No)', shortLabel: 'BTTS N', probability: bttsN },
  ];

  let authoritativePick: Fixture['authoritativePick'];

  if (isStandingsClose) {
    const sortedAlt = non1x2Candidates.slice().sort((a, b) => b.probability - a.probability);
    const bestAlt = sortedAlt[0];
    const altPercent = round1(bestAlt.probability);
    authoritativePick = {
      key: bestAlt.key,
      type: bestAlt.type,
      label: bestAlt.label,
      shortLabel: bestAlt.shortLabel,
      probability: bestAlt.probability,
      probabilityPercent: altPercent,
      probabilityFormatted: format1(bestAlt.probability),
      isStandingsCloseFallback: true,
    };
  } else {
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
    authoritativePick = {
      key: authKey,
      type: authType,
      label: authLabel,
      shortLabel: authType,
      probability: authProb,
      probabilityPercent: authPercent,
      probabilityFormatted: format1(authProb),
    };
  }

  const candidates: Array<{
    type: '1' | 'X' | '2' | 'O2.5' | 'U2.5' | 'BTTS_Y' | 'BTTS_N';
    label: string;
    shortLabel: string;
    probability: number;
  }> = [
    ...(isStandingsClose
      ? []
      : [
          { type: '1' as const, label: `${f.homeTeam} Win`, shortLabel: '1', probability: hw },
          { type: 'X' as const, label: 'Draw', shortLabel: 'X', probability: dr },
          { type: '2' as const, label: `${f.awayTeam} Win`, shortLabel: '2', probability: aw },
        ]),
    ...non1x2Candidates.map((c) => ({
      type: c.type,
      label: c.label,
      shortLabel: c.shortLabel,
      probability: c.probability,
    })),
  ];

  candidates.sort((a, b) => b.probability - a.probability);
  const best = candidates[0];
  const highestPercent = round1(best.probability);

  const highestPick: Fixture['highestPick'] = {
    type: best.type,
    label: best.label,
    shortLabel: best.shortLabel,
    probability: best.probability,
    probabilityPercent: highestPercent,
    probabilityFormatted: format1(best.probability),
  };

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
    tipProb1X2: isStandingsClose ? undefined : authoritativePick.probabilityPercent,
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
    standingsClose: isStandingsClose,
    standingsCloseReason,
  } as Fixture['prediction'];

  return {
    authoritativePick,
    highestPick,
    probs,
    popularityScore,
    slimPrediction,
    hasPrediction: true,
    standingsClose: isStandingsClose,
    standingsCloseReason,
  };
}

function buildSlimFixture(
  source: Fixture,
  timestamp?: number,
  standingsOverride?: { isClose: boolean; reason?: string }
): { slimFixture: Fixture; computed: ReturnType<typeof computePrecomputedFields> } {
  const computed = computePrecomputedFields(source, standingsOverride);

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
    standingsClose: computed.standingsClose,
    standingsCloseReason: computed.standingsCloseReason,
    prediction: computed.slimPrediction,
    authoritativePick: computed.authoritativePick,
    highestPick: computed.highestPick,
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

function getTipProbForSort(f: Fixture, marketFilter: string): number {
  if (!f.probs) return 0;
  if (marketFilter === 'OVER_UNDER') return f.probs.tipProbOverUnder ?? Math.max(f.probs.over25, f.probs.under25);
  if (marketFilter === 'BTTS') return f.probs.tipProbBtts ?? Math.max(f.probs.bttsYes, f.probs.bttsNo);
  if (marketFilter === '1X2') return f.standingsClose ? -1 : (f.probs.tipProb1X2 ?? (f.authoritativePick?.probabilityPercent ?? 0));
  return f.probs.tipProbMostLikely ?? (f.highestPick?.probabilityPercent ?? 0);
}

function sortFixturesForQuery(fixtures: Fixture[], sortBy: string, marketFilter: string): Fixture[] {
  if (!sortBy || sortBy === 'DEFAULT') {
    return sortFixturesByPopularityInPlace(fixtures.slice());
  }

  return fixtures.slice().sort((a, b) => {
    if (sortBy === 'PROB_DESC') return getTipProbForSort(b, marketFilter) - getTipProbForSort(a, marketFilter);
    if (sortBy === 'PROB_ASC') return getTipProbForSort(a, marketFilter) - getTipProbForSort(b, marketFilter);
    if (sortBy === 'HOME_DESC') return (b.standingsClose ? -1 : (b.probs?.home ?? -1)) - (a.standingsClose ? -1 : (a.probs?.home ?? -1));
    if (sortBy === 'DRAW_DESC') return (b.standingsClose ? -1 : (b.probs?.draw ?? -1)) - (a.standingsClose ? -1 : (a.probs?.draw ?? -1));
    if (sortBy === 'AWAY_DESC') return (b.standingsClose ? -1 : (b.probs?.away ?? -1)) - (a.standingsClose ? -1 : (a.probs?.away ?? -1));
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
  private readonly LIVE_SCORES_TTL_MS = 12 * 1000; // 12s live cache deduplicates concurrent pollers

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
        const standingsLookup = buildWorkerStandingsLookup(db.getAllLeagueStandingsTables());

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
                    standingsClose: p.standingsClose ?? f.standingsClose,
                    standingsCloseReason: p.standingsCloseReason ?? f.standingsCloseReason,
                  }
                : {
                    ...f,
                    timestamp: resolvedTimestamp,
                    prediction: undefined,
                  };

            const standingsStatus = resolveWorkerStandingsClose(mergedSource, standingsLookup);
            const rawMarkets = p?.markets || f.markets;
            const filteredMarkets =
              standingsStatus.isClose && rawMarkets
                ? rawMarkets.filter((m) => m.key !== 'HOME_WIN' && m.key !== 'DRAW' && m.key !== 'AWAY_WIN')
                : rawMarkets;

            const { slimFixture } = buildSlimFixture(mergedSource, resolvedTimestamp, standingsStatus);
            const rec: WorkerIndexedRecord = {
              slimFixture,
              fullMarkets: filteredMarkets,
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
            const cleanId = cleanFixtureId(p.id);
            if (!mergedMap.has(cleanId)) {
              const pTimestamp =
                p.timestamp ||
                (p.matchDate && p.kickOffTime && p.kickOffTime.includes(':')
                  ? Math.floor(new Date(`${p.matchDate}T${p.kickOffTime}:00.000Z`).getTime() / 1000)
                  : undefined);
              const resolvedOdds =
                p.marketOdds || p.prediction?.marketOdds || oddsMap.get(cleanId) || oddsMap.get(p.id);
              const standingsStatus = resolveWorkerStandingsClose(p, standingsLookup);
              const filteredMarkets =
                standingsStatus.isClose && p.markets
                  ? p.markets.filter((m) => m.key !== 'HOME_WIN' && m.key !== 'DRAW' && m.key !== 'AWAY_WIN')
                  : p.markets;
              const { slimFixture } = buildSlimFixture(p, pTimestamp, standingsStatus);
              const rec: WorkerIndexedRecord = {
                slimFixture,
                fullMarkets: filteredMarkets,
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
            const cleanId = cleanFixtureId(p.id);
            const resolvedOdds =
              p.marketOdds || p.prediction?.marketOdds || oddsMap.get(cleanId) || oddsMap.get(p.id);
            const standingsStatus = resolveWorkerStandingsClose(p, standingsLookup);
            const filteredMarkets =
              standingsStatus.isClose && p.markets
                ? p.markets.filter((m) => m.key !== 'HOME_WIN' && m.key !== 'DRAW' && m.key !== 'AWAY_WIN')
                : p.markets;
            const { slimFixture } = buildSlimFixture(p, p.timestamp, standingsStatus);
            const rec: WorkerIndexedRecord = {
              slimFixture,
              fullMarkets: filteredMarkets,
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

      if (hasSearch && !r.searchBlob.includes(search)) {
        continue;
      }

      filtered.push(f);
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
    const limit = params?.limit && params.limit > 0 ? params.limit : 200;

    const cacheKey = JSON.stringify({
      v: this.indexVersion,
      liveSig: liveData.signature,
      league,
      search,
      sortBy,
      marketFilter,
      limit,
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

    const filtered = rawLive.filter((f) => {
      if (league !== 'ALL' && !matchesLeague(f.league, f.leagueName, league)) return false;
      if (search.length > 0) {
        const blob = `${f.homeTeam || ''} ${f.awayTeam || ''} ${f.leagueName || ''}`.toLowerCase();
        if (!blob.includes(search)) return false;
      }
      return true;
    });

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
   * Computes today's >85% high-confidence featured tips and odds purely on the server,
   * eliminating client-side scanning of all DB fixtures and N parallel getMatchDetail requests.
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

    const tips: FeaturedTipDTO[] = [];
    const seenIds = new Set<string>();
    const todayResolved = resolveDateFilter('TODAY');

    for (const rec of this.records) {
      const f = rec.slimFixture;
      if (!f.hasPrediction || !rec.fullMarkets || rec.fullMarkets.length === 0) continue;

      if (!matchesResolvedDateFilter(f, todayResolved)) continue;
      if (f.status === 'FINISHED' || f.status === 'CANCELLED' || f.status === 'POSTPONED') continue;

      for (const market of rec.fullMarkets) {
        if (
          f.standingsClose &&
          (market.key === 'HOME_WIN' || market.key === 'DRAW' || market.key === 'AWAY_WIN')
        ) {
          continue;
        }
        if (market.probability >= 0.75) {
          const fsOdd = extractFlashscoreOddsServer(market.key, rec.marketOdds);
          const hasScrapedOdds = fsOdd !== null;
          const odds = fsOdd ?? (market.probability > 0 ? Number((1 / market.probability).toFixed(2)) : 1.5);

          tips.push({
            fixture: f,
            market,
            odds,
            hasScrapedOdds,
          });
        }
      }
    }

    tips.sort((a, b) => b.market.probability - a.market.probability);

    const totalOdds =
      tips.length === 0
        ? 1.0
        : Number(tips.reduce((acc, tip) => acc * tip.odds, 1.0).toFixed(2));

    const payloadObj = {
      success: true,
      count: tips.length,
      totalOdds,
      tips,
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

    const rawMatches = await predictionsDb.getHistoricalPredictionsAsync({
      league: params?.league,
      limit: params?.limit || 300,
    });
    const summary = predictionsDb.getEvaluationSummary();

    const search = (params?.search || '').trim().toLowerCase();
    const sortBy = (params?.sortBy || 'DEFAULT').toUpperCase();
    const marketFilter = (params?.marketFilter || 'MOST_LIKELY').toUpperCase();

    const slimmed: Fixture[] = [];
    for (const m of rawMatches) {
      if (!m.prediction) continue;
      if (search.length > 0) {
        const blob = `${m.homeTeam || ''} ${m.awayTeam || ''} ${m.leagueName || ''}`.toLowerCase();
        if (!blob.includes(search)) continue;
      }
      const { slimFixture } = buildSlimFixture(m, m.timestamp);
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
   * Returns pre-sorted global leagues catalog once from server memory (avoids shipping & sorting dataset on client).
   */
  public getSortedLeaguesCatalog(): { jsonPayload: string; etag: string } {
    if (this.leaguesCatalogCache) {
      return {
        jsonPayload: this.leaguesCatalogCache.jsonPayload,
        etag: this.leaguesCatalogCache.etag,
      };
    }

    const sorted: LeagueOptionDTO[] = GLOBAL_LEAGUES_DATASET.slice()
      .sort((a, b) => {
        const scoreA = getLeaguePopularityScore(a.code, a.name, a.country ? `${a.country}: ${a.name}` : a.name);
        const scoreB = getLeaguePopularityScore(b.code, b.name, b.country ? `${b.country}: ${b.name}` : b.name);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.name.localeCompare(b.name);
      })
      .map((l) => ({
        code: l.code,
        name: l.name,
        country: l.country,
      }));

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
