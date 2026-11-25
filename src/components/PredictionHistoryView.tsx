import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Fixture, MarketOption } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  BarChart3,
  ShieldCheck,
  Target,
  Layers,
  Database,
  Upload,
  FileSpreadsheet,
  Clock,
  X,
  AlertTriangle,
  Calendar,
  Percent,
  Filter,
  RotateCcw,
  Search,
  ChevronDown,
  ChevronUp,
  MinusCircle,
} from 'lucide-react';
import {
  normalizeDateStr,
  normalizeTimeStr,
  getHistoryDateFilterOptions,
  matchesDateFilter,
} from '../core/dateUtils.js';
import {
  EvaluatedMarketDetail,
  HistoryMarketCategory,
  HISTORY_MARKET_CATEGORIES,
  MarketOutcomeState,
  SPECIFIC_MARKET_OPTIONS_BY_CATEGORY,
  TRIVIAL_EXTREME_LINES,
  evaluateFixtureForMarketFilter,
  evaluateMarketOutcome,
  getGenericMarketLabel,
  getHistoryMarketCategory,
  normalizeMarketKey,
} from '../core/marketEvaluator.js';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  PaginationBar,
  SectionHeader,
  SegmentedTabs,
  Select,
  StatTile,
} from './ui/index.js';

interface PredictionHistoryViewProps {
  isProcessingActive?: boolean;
  onTriggerFullSync?: () => void;
  onSelectDetail?: (fixture: Fixture) => void;
  refreshKey?: number;
}

interface EvaluatedImportItem {
  fixtureId: string;
  league: string;
  leagueName: string;
  matchDate: string;
  kickOffTime: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeXG?: number | null;
  awayXG?: number | null;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  over15Prob?: number | null;
  over25Prob?: number | null;
  over35Prob?: number | null;
  bttsProb?: number | null;
  tipKey: string;
  tipName: string;
  tipProb: number;
  markets?: MarketOption[];
  actualOutcome: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' | null;
  isCorrect: boolean | null;
  evaluationState: 'WON' | 'LOST' | 'PENDING';
}

interface ImportedEvaluationData {
  fileName: string;
  summary: {
    totalImported: number;
    evaluatedCount: number;
    pendingCount: number;
    wonCount: number;
    lostCount: number;
    accuracy: number;
    homePicksCount: number;
    drawPicksCount: number;
    awayPicksCount: number;
  };
  evaluated: EvaluatedImportItem[];
}

export type EvaluationOutcomeFilter = 'ALL' | 'WON' | 'LOST' | 'VOID' | 'PENDING';
export type HistorySortMode = 'DATE_DESC' | 'PROB_DESC' | 'PROB_ASC';

interface EvaluatedRowModel {
  rowKey: string;
  fixtureId: string;
  fixture?: Fixture;
  homeTeam: string;
  awayTeam: string;
  leagueLabel: string;
  matchDate: string;
  kickOffTime: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeXG?: number | null;
  awayXG?: number | null;
  pickKey: string;
  predictedLabel: string;
  pickCategory: Exclude<HistoryMarketCategory, 'ALL'>;
  topProb: number;
  outcomeState: 'WON' | 'LOST' | 'VOID' | 'PENDING';
  allEvaluatedMarkets: EvaluatedMarketDetail[];
  hasPendingScore: boolean;
}

const CATEGORY_LABEL_MAP: Record<HistoryMarketCategory, string> = Object.fromEntries(
  HISTORY_MARKET_CATEGORIES.map((c) => [c.id, c.label])
) as Record<HistoryMarketCategory, string>;

const COMPACT_CATEGORY_LABELS: Record<HistoryMarketCategory, string> = {
  ALL: 'All',
  COMBOS: 'Combos',
  '1X2': '1X2',
  DOUBLE_CHANCE: 'DC / DNB',
  OVER_UNDER: 'O/U',
  BTTS: 'BTTS',
  TEAM_GOALS: 'Team',
  SPECIALS: 'Specials',
};

export const PROB_RANGE_OPTIONS = [
  { value: 'ALL', label: 'All Probabilities' },
  { value: '75_PLUS', label: '≥ 75% High Confidence' },
  { value: '65_75', label: '65% – 75% Moderate-High' },
  { value: '55_65', label: '55% – 65% Balanced' },
  { value: 'UNDER_55', label: '< 55% Low / Toss-up' },
];

export function matchesProbabilityRange(prob: number, range: string): boolean {
  if (range === 'ALL') return true;
  const normalized = prob > 1.0 ? prob / 100 : prob;
  if (range === '75_PLUS') return normalized >= 0.75;
  if (range === '65_75') return normalized >= 0.65 && normalized < 0.75;
  if (range === '55_65') return normalized >= 0.55 && normalized < 0.65;
  if (range === 'UNDER_55') return normalized < 0.55;
  return true;
}

function buildSyntheticFixtureFromImport(item: EvaluatedImportItem): Fixture {
  const hw = Number(item.homeWinProb ?? 0);
  const dr = Number(item.drawProb ?? 0);
  const aw = Number(item.awayWinProb ?? 0);
  const hasScore =
    item.homeScore !== null &&
    item.homeScore !== undefined &&
    item.awayScore !== null &&
    item.awayScore !== undefined;

  const hasAnyPredictionProb =
    hw > 0 ||
    dr > 0 ||
    aw > 0 ||
    (item.over15Prob !== null && item.over15Prob !== undefined) ||
    (item.over25Prob !== null && item.over25Prob !== undefined) ||
    (item.bttsProb !== null && item.bttsProb !== undefined);

  return {
    id: item.fixtureId,
    providerId: item.fixtureId,
    league: item.league,
    leagueName: item.leagueName || item.league,
    matchDate: item.matchDate,
    kickOffTime: item.kickOffTime,
    homeTeam: item.homeTeam,
    awayTeam: item.awayTeam,
    status: hasScore ? 'FINISHED' : ((String(item.status || 'SCHEDULED').toUpperCase() as Fixture['status']) || 'SCHEDULED'),
    score: hasScore
      ? { home: Number(item.homeScore), away: Number(item.awayScore) }
      : undefined,
    markets: item.markets,
    prediction: hasAnyPredictionProb
      ? {
          homeXG: Number(item.homeXG ?? 1.25),
          awayXG: Number(item.awayXG ?? 1.05),
          homeWinProb: hw,
          drawProb: dr,
          awayWinProb: aw,
          over15Prob: Number(item.over15Prob ?? 0.72),
          over25Prob: Number(item.over25Prob ?? 0.48),
          over35Prob: Number(item.over35Prob ?? 0.24),
          bttsProb: Number(item.bttsProb ?? 0.5),
          topCorrectScores: [],
          homeAttackStrength: 1,
          homeDefenseStrength: 1,
          awayAttackStrength: 1,
          awayDefenseStrength: 1,
          homeFormMultiplier: 1,
          awayFormMultiplier: 1,
          probabilityMatrix: [],
        }
      : undefined,
  };
}

function evaluateImportItemForFilter(
  item: EvaluatedImportItem,
  idx: number,
  category: HistoryMarketCategory,
  specificMarketKey: string
): EvaluatedRowModel | null {
  const hasScore =
    item.homeScore !== null &&
    item.homeScore !== undefined &&
    item.awayScore !== null &&
    item.awayScore !== undefined;
  const hG = hasScore ? Number(item.homeScore) : 0;
  const aG = hasScore ? Number(item.awayScore) : 0;

  const syntheticFixture = buildSyntheticFixtureFromImport(item);
  const marketEval = evaluateFixtureForMarketFilter(
    syntheticFixture,
    category,
    specificMarketKey
  );

  // Use imported pick as baseline when category is ALL & AUTO and item carried an explicit pick
  const normalizedImportedTip = normalizeMarketKey(item.tipKey);
  const importedTipCategory = getHistoryMarketCategory(normalizedImportedTip);

  let pickKey = marketEval.pickKey;
  let predictedLabel = marketEval.predictedLabel;
  let pickCategory = marketEval.pickCategory;
  let topProb = marketEval.topProb;
  let outcomeState: 'WON' | 'LOST' | 'VOID' | 'PENDING' = 'PENDING';
  let allEvaluatedMarkets = marketEval.allEvaluatedMarkets;

  if (allEvaluatedMarkets.length === 0 && normalizedImportedTip) {
    const importedOutcome: MarketOutcomeState = hasScore
      ? evaluateMarketOutcome(normalizedImportedTip, hG, aG)
      : 'LOST';
    const fallbackMarket: EvaluatedMarketDetail = {
      key: normalizedImportedTip,
      name:
        item.tipName ||
        getGenericMarketLabel(normalizedImportedTip, item.homeTeam, item.awayTeam),
      category: importedTipCategory,
      probability: Number(item.tipProb ?? 0),
      outcome: importedOutcome,
      isCorrect: importedOutcome === 'WON',
    };
    allEvaluatedMarkets = [fallbackMarket];

    if (specificMarketKey !== 'AUTO') {
      if (normalizeMarketKey(specificMarketKey) !== normalizedImportedTip) {
        return null;
      }
    } else if (category !== 'ALL' && importedTipCategory !== category) {
      return null;
    }

    pickKey = normalizedImportedTip;
    predictedLabel = fallbackMarket.name;
    pickCategory = importedTipCategory;
    topProb = fallbackMarket.probability;
    outcomeState = hasScore ? importedOutcome : 'PENDING';
  } else if (category === 'ALL' && specificMarketKey === 'AUTO' && normalizedImportedTip) {
    // Respect explicit imported pick when viewing All Markets / Best Pick, while keeping allEvaluatedMarkets populated
    const matchedInMarkets = allEvaluatedMarkets.find((m) => m.key === normalizedImportedTip);
    const importedOutcome: MarketOutcomeState = hasScore
      ? evaluateMarketOutcome(normalizedImportedTip, hG, aG)
      : 'LOST';
    pickKey = normalizedImportedTip;
    predictedLabel =
      item.tipName ||
      matchedInMarkets?.name ||
      getGenericMarketLabel(normalizedImportedTip, item.homeTeam, item.awayTeam);
    pickCategory = importedTipCategory;
    topProb = Number(item.tipProb || matchedInMarkets?.probability || marketEval.topProb || 0);
    outcomeState = hasScore ? importedOutcome : 'PENDING';
  } else {
    if (!marketEval.hasMatch) {
      return null;
    }
    outcomeState = hasScore ? marketEval.outcome : 'PENDING';
  }

  return {
    rowKey: `${item.fixtureId}_${idx}`,
    fixtureId: item.fixtureId,
    homeTeam: item.homeTeam,
    awayTeam: item.awayTeam,
    leagueLabel: item.leagueName || item.league,
    matchDate: item.matchDate,
    kickOffTime: item.kickOffTime || 'TBD',
    status: item.status,
    homeScore: hasScore ? hG : null,
    awayScore: hasScore ? aG : null,
    homeXG: item.homeXG,
    awayXG: item.awayXG,
    pickKey,
    predictedLabel,
    pickCategory,
    topProb,
    outcomeState,
    allEvaluatedMarkets,
    hasPendingScore: !hasScore,
  };
}

interface HistoryMatchRowProps {
  row: EvaluatedRowModel;
  activeMarketCategory: HistoryMarketCategory;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelectDetail?: () => void;
}

const HistoryMatchRow: React.FC<HistoryMatchRowProps> = ({
  row,
  activeMarketCategory,
  isExpanded,
  onToggleExpand,
  onSelectDetail,
}) => {
  const [drawerCategory, setDrawerCategory] = useState<HistoryMarketCategory>(activeMarketCategory);

  useEffect(() => {
    setDrawerCategory(activeMarketCategory);
  }, [activeMarketCategory]);

  const visibleMarkets = useMemo(() => {
    const filtered =
      drawerCategory === 'ALL'
        ? row.allEvaluatedMarkets.filter((m) => !TRIVIAL_EXTREME_LINES.has(String(m.key)))
        : row.allEvaluatedMarkets.filter((m) => m.category === drawerCategory);
    return filtered.slice().sort((a, b) => b.probability - a.probability);
  }, [row.allEvaluatedMarkets, drawerCategory]);

  const drawerCategoriesWithCounts = useMemo(() => {
    const counts = new Map<HistoryMarketCategory, number>();
    counts.set(
      'ALL',
      row.allEvaluatedMarkets.filter((m) => !TRIVIAL_EXTREME_LINES.has(String(m.key))).length
    );
    for (const m of row.allEvaluatedMarkets) {
      counts.set(m.category, (counts.get(m.category) || 0) + 1);
    }
    return HISTORY_MARKET_CATEGORIES.filter((c) => (counts.get(c.id) || 0) > 0).map((c) => ({
      ...c,
      count: counts.get(c.id) || 0,
    }));
  }, [row.allEvaluatedMarkets]);

  const hasScore = row.homeScore !== null && row.awayScore !== null;
  const pickCatLabel = COMPACT_CATEGORY_LABELS[row.pickCategory] || row.pickCategory;
  const totalMarketsCount = row.allEvaluatedMarkets.length;

  const statusBadge =
    row.outcomeState === 'WON' ? (
      <Badge variant="success" size="sm">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Hit</span>
      </Badge>
    ) : row.outcomeState === 'LOST' ? (
      <Badge variant="danger" size="sm">
        <XCircle className="w-3.5 h-3.5" />
        <span>Missed</span>
      </Badge>
    ) : row.outcomeState === 'VOID' ? (
      <Badge variant="warning" size="sm">
        <MinusCircle className="w-3.5 h-3.5" />
        <span>Void</span>
      </Badge>
    ) : (
      <Badge variant="warning" size="sm">
        <Clock className="w-3.5 h-3.5" />
        <span>Pending</span>
      </Badge>
    );

  return (
    <div className="transition-colors duration-150">
      <div
        onClick={onSelectDetail}
        onKeyDown={
          onSelectDetail
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectDetail();
                }
              }
            : undefined
        }
        role={onSelectDetail ? 'button' : undefined}
        tabIndex={onSelectDetail ? 0 : undefined}
        className={`min-h-[44px] px-3 py-2 hover:bg-theme-card-elevated transition-colors duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm ${
          onSelectDetail
            ? 'cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent'
            : ''
        }`}
      >
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-theme-main text-base tracking-[-0.01em]">
              {row.homeTeam} <span className="text-theme-sub font-normal">vs</span> {row.awayTeam}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-theme-sub tabular-nums flex-wrap">
            <span className="font-medium">{row.leagueLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-normal">{row.matchDate}</span>
            {row.kickOffTime &&
              row.kickOffTime !== 'FT' &&
              row.kickOffTime !== 'TBD' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{row.kickOffTime}</span>
                </>
              )}
          </div>

          <div className="text-sm text-theme-sub font-normal tabular-nums flex items-center gap-1.5 flex-wrap">
            {hasScore ? (
              <span>
                Final Score:{' '}
                <strong className="text-theme-main font-semibold">
                  {row.homeScore} - {row.awayScore}
                </strong>
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400 font-medium">
                Score: {row.status === 'LIVE' ? 'In Play' : 'Awaiting Final Result'}
              </span>
            )}
            <span className="text-theme-sub" aria-hidden="true">
              ·
            </span>
            <span>
              <span className="text-theme-dim">{pickCatLabel}:</span>{' '}
              <strong className="text-theme-main font-semibold">{row.predictedLabel}</strong>{' '}
              <span className="text-theme-primary font-semibold">
                ({(row.topProb * 100).toFixed(0)}%)
              </span>
            </span>
            {row.homeXG !== null &&
              row.homeXG !== undefined &&
              row.awayXG !== null &&
              row.awayXG !== undefined && (
                <>
                  <span className="text-theme-sub" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    xG: {row.homeXG} - {row.awayXG}
                  </span>
                </>
              )}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1.5 self-start sm:self-center">
          {totalMarketsCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              aria-expanded={isExpanded}
              className="h-[28px] min-h-[28px] px-2.5 rounded-full border border-theme-subdued bg-theme-subtle hover:bg-theme-card-elevated hover:border-theme text-xs font-medium text-theme-main inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
              title="Inspect all markets and combo predictions for this match"
            >
              <span>Markets ({totalMarketsCount})</span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-theme-primary" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-theme-sub" />
              )}
            </button>
          )}
          {statusBadge}
        </div>
      </div>

      {isExpanded && totalMarketsCount > 0 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="px-3 pb-3 pt-2 bg-theme-subtle border-t border-theme-subdued space-y-2"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              {drawerCategoriesWithCounts.map((cat) => {
                const isCatActive = drawerCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setDrawerCategory(cat.id)}
                    className={`h-[26px] px-2.5 rounded-full text-2xs font-medium whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                      isCatActive
                        ? 'bg-theme-primary text-theme-primary-text font-semibold shadow-theme-glow'
                        : 'bg-theme-card text-theme-sub hover:text-theme-main border border-theme-subdued'
                    }`}
                  >
                    <span>{COMPACT_CATEGORY_LABELS[cat.id]}</span>
                    <span className="tabular-nums opacity-80">{cat.count}</span>
                  </button>
                );
              })}
            </div>

            <span className="text-2xs text-theme-sub tabular-nums">
              {visibleMarkets.length} markets
              {hasScore && ` · FT ${row.homeScore}-${row.awayScore}`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-[260px] overflow-y-auto pr-0.5">
            {visibleMarkets.map((m) => {
              const isSelectedPick = normalizeMarketKey(String(m.key)) === normalizeMarketKey(row.pickKey);
              const marketOutcome = row.hasPendingScore ? 'PENDING' : m.outcome;

              return (
                <div
                  key={`${row.rowKey}_${m.key}`}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                    isSelectedPick
                      ? 'bg-theme-card border-theme-neon shadow-theme-sm'
                      : 'bg-theme-card/85 border-theme-subdued'
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        marketOutcome === 'WON'
                          ? 'bg-emerald-500'
                          : marketOutcome === 'LOST'
                          ? 'bg-rose-500'
                          : 'bg-amber-500'
                      }`}
                    />
                    <span
                      className={`truncate ${
                        isSelectedPick ? 'font-semibold text-theme-main' : 'font-medium text-theme-main'
                      }`}
                      title={m.name}
                    >
                      {m.name}
                    </span>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5 tabular-nums whitespace-nowrap">
                    <span className="font-semibold text-theme-main">
                      {(m.probability * 100).toFixed(0)}%
                    </span>
                    <span
                      className={`text-2xs font-semibold ${
                        marketOutcome === 'WON'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : marketOutcome === 'LOST'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {marketOutcome === 'WON'
                        ? 'Hit'
                        : marketOutcome === 'LOST'
                        ? 'Miss'
                        : marketOutcome === 'VOID'
                        ? 'Void'
                        : 'Pend'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const PredictionHistoryView: React.FC<PredictionHistoryViewProps> = ({
  isProcessingActive = false,
  onTriggerFullSync,
  onSelectDetail,
  refreshKey = 0,
}) => {
  const [history, setHistory] = useState<Fixture[]>([]);
  const [summary, setSummary] = useState<{
    upcomingFixturesInDb: number;
    totalPredictions: number;
    upcomingPredictions: number;
    livePredictions: number;
    completedWithScore: number;
    completedAwaitingScore: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSyncingHistory, setIsSyncingHistory] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  // Redesigned Top Filter States (All Markets + Combos + Search + Date + Prob + Outcome + Sort)
  const [marketCategory, setMarketCategory] = useState<HistoryMarketCategory>('ALL');
  const [specificMarket, setSpecificMarket] = useState<string>('AUTO');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('ALL');
  const [probFilter, setProbFilter] = useState<string>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<EvaluationOutcomeFilter>('ALL');
  const [sortMode, setSortMode] = useState<HistorySortMode>('DATE_DESC');

  // Bottom Pagination & Expanded Match Audit States
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [expandedRowKeys, setExpandedRowKeys] = useState<Record<string, boolean>>({});

  // Import & Evaluation States
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedEvaluation, setImportedEvaluation] = useState<ImportedEvaluationData | null>(null);

  const fetchHistory = async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      // Fetch complete historical predictions set (limit = 0) and paginate at the bottom
      const { matches, summary: evalSummary } = await EngineService.getHistoricalEvaluation(
        'ALL',
        0,
        showRefreshing
      );
      setSummary(evalSummary);

      const evaluatedOnly = (matches || []).filter(
        (f) =>
          f.prediction !== undefined &&
          f.status === 'FINISHED' &&
          f.score?.home !== undefined &&
          f.score?.away !== undefined
      );

      setHistory(evaluatedOnly);
    } catch (err) {
      console.error('Error fetching historical predictions:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory(false);
  }, [refreshKey]);

  // Reset pagination to page 1 when filters, sort, or mode change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    marketCategory,
    specificMarket,
    searchQuery,
    dateFilter,
    probFilter,
    outcomeFilter,
    sortMode,
    importedEvaluation,
    pageSize,
  ]);

  const handleSyncHistoryScraper = async () => {
    setIsSyncingHistory(true);
    setSyncToast('Historical archive scraper running: fetching multi-year league feeds...');
    try {
      const res = await EngineService.syncHistoryOnly();
      if (res.success) {
        setSyncToast(res.message || 'Historical database populated with fresh archive data.');
        await fetchHistory(true);
      } else {
        setSyncToast(res.message || 'Historical scraper sync encountered an issue.');
      }
    } catch (err) {
      console.error('Error syncing historical scraper:', err);
      setSyncToast('Failed to execute historical archive scraper.');
    } finally {
      setIsSyncingHistory(false);
      setTimeout(() => setSyncToast(null), 4500);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportError(null);

    try {
      const text = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(
          'Selected file is not valid JSON. Please select a JSON file exported from the Prediction Engine.'
        );
      }

      const res = await EngineService.evaluateImportedPredictions(parsed);
      if (res.success && res.summary && res.evaluated) {
        setImportedEvaluation({
          fileName: file.name,
          summary: res.summary,
          evaluated: res.evaluated,
        });
        setOutcomeFilter('ALL');
        setCurrentPage(1);
        setSyncToast(`Evaluated ${res.summary.totalImported} predictions from ${file.name}`);
      } else {
        setImportError(res.error || 'Failed to evaluate imported predictions.');
      }
    } catch (err: any) {
      console.error('Import evaluation error:', err);
      setImportError(err?.message || 'Error processing JSON file.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setSyncToast(null), 5000);
    }
  };

  const resetAllFilters = () => {
    setMarketCategory('ALL');
    setSpecificMarket('AUTO');
    setSearchQuery('');
    setDateFilter('ALL');
    setProbFilter('ALL');
    setOutcomeFilter('ALL');
    setSortMode('DATE_DESC');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    marketCategory !== 'ALL' ||
    specificMarket !== 'AUTO' ||
    searchQuery.trim() !== '' ||
    dateFilter !== 'ALL' ||
    probFilter !== 'ALL' ||
    outcomeFilter !== 'ALL' ||
    sortMode !== 'DATE_DESC';

  // Build evaluated rows across all markets (including combos) for DB or Imported dataset
  const { allEvaluatedRows, categoryCounts } = useMemo(() => {
    const counts: Record<HistoryMarketCategory, number> = {
      ALL: 0,
      COMBOS: 0,
      '1X2': 0,
      DOUBLE_CHANCE: 0,
      OVER_UNDER: 0,
      BTTS: 0,
      TEAM_GOALS: 0,
      SPECIALS: 0,
    };

    const rows: EvaluatedRowModel[] = [];

    if (importedEvaluation) {
      counts.ALL = importedEvaluation.evaluated.length;
      importedEvaluation.evaluated.forEach((item, idx) => {
        const baseline = evaluateImportItemForFilter(item, idx, 'ALL', 'AUTO');
        if (baseline) {
          const presentCats = new Set(baseline.allEvaluatedMarkets.map((m) => m.category));
          for (const cat of presentCats) {
            counts[cat] = (counts[cat] || 0) + 1;
          }
        }

        const evaluated = evaluateImportItemForFilter(
          item,
          idx,
          marketCategory,
          specificMarket
        );
        if (evaluated) {
          rows.push(evaluated);
        }
      });
    } else {
      counts.ALL = history.length;
      for (const f of history) {
        const res = evaluateFixtureForMarketFilter(f, marketCategory, specificMarket);
        const presentCats = new Set(res.allEvaluatedMarkets.map((m) => m.category));
        for (const cat of presentCats) {
          counts[cat] = (counts[cat] || 0) + 1;
        }

        if (!res.hasMatch) continue;

        rows.push({
          rowKey: f.id,
          fixtureId: f.id,
          fixture: f,
          homeTeam: f.homeTeam,
          awayTeam: f.awayTeam,
          leagueLabel: f.leagueName || f.league,
          matchDate: normalizeDateStr(f.matchDate),
          kickOffTime: f.kickOffTime || 'FT',
          status: f.status,
          homeScore: res.hG,
          awayScore: res.aG,
          homeXG: f.prediction?.homeXG !== undefined ? Number(f.prediction.homeXG.toFixed(2)) : null,
          awayXG: f.prediction?.awayXG !== undefined ? Number(f.prediction.awayXG.toFixed(2)) : null,
          pickKey: res.pickKey,
          predictedLabel: res.predictedLabel,
          pickCategory: res.pickCategory,
          topProb: res.topProb,
          outcomeState: res.outcome,
          allEvaluatedMarkets: res.allEvaluatedMarkets,
          hasPendingScore: false,
        });
      }
    }

    return { allEvaluatedRows: rows, categoryCounts: counts };
  }, [history, importedEvaluation, marketCategory, specificMarket]);

  // Apply Search, Date, Probability, Outcome filters + Sorting
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matched = allEvaluatedRows.filter((row) => {
      if (q) {
        const matchesText =
          row.homeTeam.toLowerCase().includes(q) ||
          row.awayTeam.toLowerCase().includes(q) ||
          row.leagueLabel.toLowerCase().includes(q) ||
          row.predictedLabel.toLowerCase().includes(q);
        if (!matchesText) return false;
      }

      if (
        dateFilter !== 'ALL' &&
        !matchesDateFilter(
          { matchDate: row.matchDate, kickOffTime: row.kickOffTime },
          dateFilter
        )
      ) {
        return false;
      }

      if (probFilter !== 'ALL' && !matchesProbabilityRange(row.topProb, probFilter)) {
        return false;
      }

      if (outcomeFilter !== 'ALL' && row.outcomeState !== outcomeFilter) {
        return false;
      }

      return true;
    });

    return matched.slice().sort((a, b) => {
      if (sortMode === 'PROB_DESC') {
        if (b.topProb !== a.topProb) return b.topProb - a.topProb;
      } else if (sortMode === 'PROB_ASC') {
        if (a.topProb !== b.topProb) return a.topProb - b.topProb;
      }

      const dateA = normalizeDateStr(a.matchDate);
      const dateB = normalizeDateStr(b.matchDate);
      if (dateA !== dateB) return dateB.localeCompare(dateA);

      const timeA = normalizeTimeStr(a.kickOffTime || '00:00');
      const timeB = normalizeTimeStr(b.kickOffTime || '00:00');
      return timeB.localeCompare(timeA);
    });
  }, [allEvaluatedRows, searchQuery, dateFilter, probFilter, outcomeFilter, sortMode]);

  // Compute accuracy and summary metrics for current active filter selection
  const metrics = useMemo(() => {
    let wonCount = 0;
    let lostCount = 0;
    let voidCount = 0;
    let pendingCount = 0;
    let probSum = 0;
    let highConfCount = 0;

    for (const row of filteredRows) {
      if (row.outcomeState === 'WON') wonCount++;
      else if (row.outcomeState === 'LOST') lostCount++;
      else if (row.outcomeState === 'VOID') voidCount++;
      else pendingCount++;

      probSum += row.topProb;
      if (row.topProb >= 0.75) highConfCount++;
    }

    const settledCount = wonCount + lostCount;
    const accuracyPct =
      settledCount > 0 ? ((wonCount / settledCount) * 100).toFixed(1) : '0.0';
    const avgConfidencePct =
      filteredRows.length > 0
        ? ((probSum / filteredRows.length) * 100).toFixed(1)
        : '0.0';

    return {
      totalRows: filteredRows.length,
      settledCount,
      wonCount,
      lostCount,
      voidCount,
      pendingCount,
      accuracyPct,
      avgConfidencePct,
      highConfCount,
    };
  }, [filteredRows]);

  // Pagination slice
  const totalItems = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startOffset = (safePage - 1) * pageSize;
  const paginatedRows = useMemo(
    () => filteredRows.slice(startOffset, startOffset + pageSize),
    [filteredRows, startOffset, pageSize]
  );
  const startIndexDisplay = totalItems === 0 ? 0 : startOffset + 1;
  const endIndexDisplay = Math.min(totalItems, startOffset + pageSize);

  const activeCategoryLabel = CATEGORY_LABEL_MAP[marketCategory] || 'All Markets';
  const totalRawCount = importedEvaluation
    ? importedEvaluation.evaluated.length
    : history.length;

  const marketTabItems = useMemo(
    () =>
      HISTORY_MARKET_CATEGORIES.map((cat) => ({
        id: cat.id,
        label: cat.label,
        count: categoryCounts[cat.id] ?? 0,
      })),
    [categoryCounts]
  );

  const toggleRowExpanded = (rowKey: string) => {
    setExpandedRowKeys((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  };

  if (isLoading && !importedEvaluation) {
    return <LoadingState label="Loading historical predictions..." minHeight="min-h-[180px]" />;
  }

  return (
    <div className="space-y-3 font-sans">
      <input
        type="file"
        ref={fileInputRef}
        accept=".json,application/json"
        onChange={handleFileUpload}
        className="hidden"
        aria-hidden="true"
      />

      {syncToast && (
        <div
          role="status"
          className="p-3 rounded-xl bg-theme-card border border-theme-neon text-theme-primary text-sm font-medium flex items-center justify-between gap-2 shadow-theme-md animate-in fade-in slide-in-from-top-2"
        >
          <div className="flex items-center gap-2">
            <Database
              className={`w-4 h-4 shrink-0 ${
                isSyncingHistory || isImporting
                  ? 'animate-spin text-theme-primary'
                  : 'text-theme-primary'
              }`}
            />
            <span>{syncToast}</span>
          </div>
          {importedEvaluation && (
            <Badge variant="accent" size="xs">
              Imported
            </Badge>
          )}
        </div>
      )}

      {importError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/35 text-rose-700 dark:text-rose-400 text-sm font-medium flex items-center justify-between gap-2 shadow-theme-sm"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{importError}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="w-[24px] h-[24px] inline-flex items-center justify-center rounded-full text-rose-600 dark:text-rose-400 hover:bg-rose-500/15 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <SectionHeader
          title={importedEvaluation ? 'Imported Evaluation' : 'Prediction History'}
          icon={
            importedEvaluation ? (
              <FileSpreadsheet className="w-4 h-4" />
            ) : (
              <BarChart3 className="w-4 h-4" />
            )
          }
          size="md"
        />

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {importedEvaluation ? (
            <>
              <Button
                variant="inverse"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                title="Import another prediction JSON file"
              >
                <Upload className={`w-3.5 h-3.5 ${isImporting ? 'animate-bounce' : ''}`} />
                <span>{isImporting ? 'Evaluating...' : 'Import Another File'}</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setImportedEvaluation(null)}
                title="Exit imported evaluation and return to database history"
              >
                <X className="w-3.5 h-3.5" />
                <span>Exit Imported View</span>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="inverse"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting || isProcessingActive}
                title="Import a predictions JSON file exported from the Prediction Engine to evaluate accuracy across all markets"
              >
                <Upload className={`w-3.5 h-3.5 ${isImporting ? 'animate-bounce' : ''}`} />
                <span>{isImporting ? 'Evaluating File...' : 'Import & Evaluate'}</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleSyncHistoryScraper}
                disabled={isSyncingHistory || isRefreshing || isProcessingActive}
                title="Run historical archive scraper to populate database with multi-year results"
              >
                <Database
                  className={`w-3.5 h-3.5 ${
                    isSyncingHistory ? 'animate-spin text-theme-primary' : 'text-theme-primary'
                  }`}
                />
                <span>{isSyncingHistory ? 'Syncing...' : 'Sync History'}</span>
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => fetchHistory(true)}
                disabled={isRefreshing || isSyncingHistory || isProcessingActive}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Redesigned Top Filter Bar: Market Scope Tabs (including Combos) + Full Filter Controls */}
      <Card surface="elevated" padding="sm" radius="2xl" className="space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-theme-main flex-wrap">
            <Filter className="w-3.5 h-3.5 text-theme-primary shrink-0" />
            <span>Market &amp; Evaluation Filters</span>
            <span className="text-2xs font-normal tabular-nums text-theme-sub">
              · {activeCategoryLabel} · {totalItems} of {totalRawCount}{' '}
              {importedEvaluation ? 'imported' : 'historical'} matches
            </span>
          </div>

          {hasActiveFilters && (
            <Button
              variant="subtle"
              size="xs"
              onClick={resetAllFilters}
              title="Reset all market, search, date, confidence, outcome, and sort filters"
            >
              <RotateCcw className="w-3 h-3 text-theme-primary" />
              <span>Reset Filters</span>
            </Button>
          )}
        </div>

        {/* Market Scope Tabs covering All Markets, Combos, 1X2, Double Chance, O/U, BTTS, Team Goals, Specials */}
        <SegmentedTabs
          items={marketTabItems}
          value={marketCategory}
          onChange={(cat) => {
            setMarketCategory(cat);
            setSpecificMarket('AUTO');
          }}
          variant="subtle"
          size="xs"
          className="w-full"
          ariaLabel="Filter historical evaluation by market category"
        />

        {/* Responsive 6-Control Filter Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          {/* Search Team or League */}
          <div className="space-y-1">
            <label
              htmlFor="history-search-input"
              className="text-2xs font-medium text-theme-sub uppercase tracking-[0.05em] flex items-center gap-1"
            >
              <Search className="w-3 h-3 text-theme-primary" />
              <span>Team / League</span>
            </label>
            <Input
              id="history-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery('')}
              placeholder="Search match..."
              inputSize="sm"
              surface="subtle"
              leftIcon={<Search className="w-3.5 h-3.5" />}
            />
          </div>

          {/* Specific Market (including Combo markets) */}
          <div className="space-y-1">
            <label
              htmlFor="history-specific-market"
              className="text-2xs font-medium text-theme-sub uppercase tracking-[0.05em] flex items-center gap-1"
            >
              <Layers className="w-3 h-3 text-theme-primary" />
              <span>Specific Market</span>
            </label>
            <Select
              id="history-specific-market"
              aria-label="Filter by specific market"
              value={specificMarket}
              onChange={(e) => setSpecificMarket(e.target.value)}
              surface="subtle"
              selectSize="sm"
              containerClassName="w-full"
            >
              <option value="AUTO" className="bg-theme-card text-theme-main">
                Best Pick ({activeCategoryLabel})
              </option>
              {marketCategory === 'ALL' ? (
                HISTORY_MARKET_CATEGORIES.filter((c) => c.id !== 'ALL').map((cat) => (
                  <optgroup key={cat.id} label={cat.label}>
                    {SPECIFIC_MARKET_OPTIONS_BY_CATEGORY[
                      cat.id as Exclude<HistoryMarketCategory, 'ALL'>
                    ].map((opt) => (
                      <option
                        key={opt.key}
                        value={opt.key}
                        className="bg-theme-card text-theme-main"
                      >
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                ))
              ) : (
                SPECIFIC_MARKET_OPTIONS_BY_CATEGORY[marketCategory].map((opt) => (
                  <option
                    key={opt.key}
                    value={opt.key}
                    className="bg-theme-card text-theme-main"
                  >
                    {opt.label}
                  </option>
                ))
              )}
            </Select>
          </div>

          {/* Date Filter */}
          <div className="space-y-1">
            <label
              htmlFor="history-date-filter"
              className="text-2xs font-medium text-theme-sub uppercase tracking-[0.05em] flex items-center gap-1"
            >
              <Calendar className="w-3 h-3 text-theme-primary" />
              <span>Date Filter</span>
            </label>
            <Select
              id="history-date-filter"
              aria-label="Filter predictions by date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              surface="subtle"
              selectSize="sm"
              containerClassName="w-full"
              options={getHistoryDateFilterOptions().map((opt) => ({
                value: opt.key,
                label: opt.label,
              }))}
            />
          </div>

          {/* Probability Range Filter */}
          <div className="space-y-1">
            <label
              htmlFor="history-prob-filter"
              className="text-2xs font-medium text-theme-sub uppercase tracking-[0.05em] flex items-center gap-1"
            >
              <Percent className="w-3 h-3 text-theme-primary" />
              <span>Probability %</span>
            </label>
            <Select
              id="history-prob-filter"
              aria-label="Filter predictions by probability range"
              value={probFilter}
              onChange={(e) => setProbFilter(e.target.value)}
              surface="subtle"
              selectSize="sm"
              containerClassName="w-full"
              options={PROB_RANGE_OPTIONS}
            />
          </div>

          {/* Result Status */}
          <div className="space-y-1">
            <label
              htmlFor="history-outcome-filter"
              className="text-2xs font-medium text-theme-sub uppercase tracking-[0.05em] block"
            >
              Result Status
            </label>
            <Select
              id="history-outcome-filter"
              aria-label="Filter by evaluation result status"
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value as EvaluationOutcomeFilter)}
              surface="subtle"
              selectSize="sm"
              containerClassName="w-full"
              options={[
                { value: 'ALL', label: 'All Outcomes' },
                { value: 'WON', label: 'Hits / Won' },
                { value: 'LOST', label: 'Missed / Lost' },
                { value: 'VOID', label: 'Void (DNB Draw)' },
                ...(importedEvaluation
                  ? [{ value: 'PENDING', label: 'Pending FT' }]
                  : []),
              ]}
            />
          </div>

          {/* Sort Order */}
          <div className="space-y-1">
            <label
              htmlFor="history-sort-mode"
              className="text-2xs font-medium text-theme-sub uppercase tracking-[0.05em] block"
            >
              Sort Order
            </label>
            <Select
              id="history-sort-mode"
              aria-label="Sort predictions"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as HistorySortMode)}
              surface="subtle"
              selectSize="sm"
              containerClassName="w-full"
              options={[
                { value: 'DATE_DESC', label: 'Newest Date First' },
                { value: 'PROB_DESC', label: 'Highest Probability %' },
                { value: 'PROB_ASC', label: 'Lowest Probability %' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Imported File Info Strip (when evaluating uploaded JSON) */}
      {importedEvaluation && (
        <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
          <div className="min-h-[38px] px-3 py-1.5 bg-theme-header-grad border-b border-theme-subdued flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="w-4 h-4 text-theme-primary shrink-0" />
              <div className="min-w-0">
                <span className="font-semibold text-base text-theme-main truncate block tracking-[-0.01em]">
                  {importedEvaluation.fileName}
                </span>
                <span className="text-xs font-normal tabular-nums text-theme-sub">
                  {totalItems} matching {activeCategoryLabel} · {importedEvaluation.summary.totalImported} total in file
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 flex-wrap">
              <Button
                variant={outcomeFilter === 'ALL' ? 'primary' : 'subtle'}
                size="xs"
                onClick={() => setOutcomeFilter('ALL')}
              >
                All ({metrics.totalRows})
              </Button>
              <Button
                variant={outcomeFilter === 'WON' ? 'primary' : 'subtle'}
                size="xs"
                onClick={() => setOutcomeFilter('WON')}
              >
                Hits ({metrics.wonCount})
              </Button>
              <Button
                variant={outcomeFilter === 'LOST' ? 'danger' : 'subtle'}
                size="xs"
                onClick={() => setOutcomeFilter('LOST')}
              >
                Missed ({metrics.lostCount})
              </Button>
              {metrics.pendingCount > 0 && (
                <Button
                  variant={outcomeFilter === 'PENDING' ? 'secondary' : 'subtle'}
                  size="xs"
                  onClick={() => setOutcomeFilter('PENDING')}
                >
                  Pending ({metrics.pendingCount})
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* KPI Metrics Strip */}
      {metrics.totalRows > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatTile
            label="Evaluated Matches"
            value={metrics.settledCount}
            subValue={
              importedEvaluation && metrics.pendingCount > 0
                ? `${metrics.pendingCount} pending FT`
                : `${activeCategoryLabel}`
            }
            icon={<Layers className="w-4 h-4" />}
            tone="default"
            surface="card"
          />

          <StatTile
            label="Model Accuracy"
            value={`${metrics.accuracyPct}%`}
            subValue={`${metrics.wonCount} / ${metrics.settledCount} settled`}
            icon={<ShieldCheck className="w-4 h-4" />}
            tone="accent"
            surface="card"
            progress={Number(metrics.accuracyPct)}
          />

          <StatTile
            label="Hits / Missed"
            value={`${metrics.wonCount} / ${metrics.lostCount}`}
            subValue={
              metrics.voidCount > 0
                ? `${metrics.voidCount} void (DNB)`
                : specificMarket !== 'AUTO'
                ? getGenericMarketLabel(specificMarket)
                : activeCategoryLabel
            }
            icon={<Target className="w-4 h-4" />}
            tone="default"
            surface="card"
          />

          <StatTile
            label={importedEvaluation && metrics.pendingCount > 0 ? 'Pending FT' : 'Avg Confidence'}
            value={
              importedEvaluation && metrics.pendingCount > 0
                ? metrics.pendingCount
                : `${metrics.avgConfidencePct}%`
            }
            subValue={
              importedEvaluation && metrics.pendingCount > 0
                ? `Avg ${metrics.avgConfidencePct}% conf`
                : `${metrics.highConfCount} ≥ 75% picks`
            }
            icon={
              importedEvaluation && metrics.pendingCount > 0 ? (
                <Clock className="w-4 h-4" />
              ) : (
                <Percent className="w-4 h-4" />
              )
            }
            tone={importedEvaluation && metrics.pendingCount > 0 ? 'warning' : 'default'}
            surface="card"
          />
        </div>
      )}

      {/* Empty States or Paginated History List */}
      {!importedEvaluation && history.length === 0 ? (
        (() => {
          const awaitingCount = summary?.completedAwaitingScore ?? 0;
          const upcomingPredCount = summary?.upcomingPredictions ?? 0;
          const livePredCount = summary?.livePredictions ?? 0;
          const activePredCount = upcomingPredCount + livePredCount;
          const totalPreds = summary?.totalPredictions ?? 0;
          const fixturesInDb = summary?.upcomingFixturesInDb ?? 0;

          let emptyTitle = 'No Historical Predictions';
          let showFullSyncCta = true;
          let refreshCtaLabel = 'Check Results';

          if (awaitingCount > 0) {
            emptyTitle = `Awaiting Final Scores (${awaitingCount})`;
            showFullSyncCta = false;
            refreshCtaLabel = 'Check Results';
          } else if (activePredCount > 0) {
            emptyTitle = `Pending Matches (${upcomingPredCount} Upcoming, ${livePredCount} Live)`;
            showFullSyncCta = false;
            refreshCtaLabel = 'Check Results';
          } else if (totalPreds === 0 && fixturesInDb > 0) {
            emptyTitle = `No Predictions Generated (${fixturesInDb} Fixtures)`;
            showFullSyncCta = false;
            refreshCtaLabel = 'Refresh';
          }

          return (
            <EmptyState
              icon={<RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />}
              title={emptyTitle}
              actions={
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <Button
                    variant="inverse"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import &amp; Evaluate JSON</span>
                  </Button>

                  {showFullSyncCta && onTriggerFullSync ? (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={onTriggerFullSync}
                        disabled={isProcessingActive || isRefreshing}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Start Full Sync</span>
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => fetchHistory(true)}
                        disabled={isRefreshing || isProcessingActive}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        <span>{isRefreshing ? 'Checking...' : refreshCtaLabel}</span>
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => fetchHistory(true)}
                      disabled={isRefreshing || isProcessingActive}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                      <span>{isRefreshing ? 'Checking Results...' : refreshCtaLabel}</span>
                    </Button>
                  )}
                </div>
              }
            />
          );
        })()
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={<Filter className="w-6 h-6 text-theme-primary" />}
          title="No Predictions Match Selected Filters"
          description={`0 of ${totalRawCount} evaluated matches matched "${activeCategoryLabel}"${
            specificMarket !== 'AUTO' ? ` · ${getGenericMarketLabel(specificMarket)}` : ''
          } with your active filters.`}
          actions={
            <Button variant="primary" size="sm" onClick={resetAllFilters}>
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </Button>
          }
        />
      ) : (
        <Card surface="default" padding="none" radius="2xl" className="overflow-hidden">
          <div className="divide-y divide-[var(--border-subdued)]">
            {paginatedRows.map((row) => (
              <HistoryMatchRow
                key={row.rowKey}
                row={row}
                activeMarketCategory={marketCategory}
                isExpanded={Boolean(expandedRowKeys[row.rowKey])}
                onToggleExpand={() => toggleRowExpanded(row.rowKey)}
                onSelectDetail={
                  row.fixture && onSelectDetail ? () => onSelectDetail(row.fixture!) : undefined
                }
              />
            ))}
          </div>

          <PaginationBar
            embedded
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={totalItems}
            startIndex={startIndexDisplay}
            endIndex={endIndexDisplay}
            pageSize={pageSize}
            pageSizeOptions={[10, 25, 50, 100]}
            onPageChange={(page) => setCurrentPage(page)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        </Card>
      )}
    </div>
  );
};
