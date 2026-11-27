import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Award, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FeaturedTipDTO,
  FeaturedTipComboOptionDTO,
  Fixture,
  MarketOption,
  BetSelection,
} from '../core/types.js';
import { formatMatchDateTime } from '../core/dateUtils.js';
import { EngineService } from '../services/engineService.js';
import { Card, LoadingState, SectionHeader, SegmentedTabs, SegmentedTabItem } from './ui/index.js';

interface DailyFeaturedTipProps {
  onSelectDetail?: (fixture: Fixture) => void;
  onAddSelection?: (selection: BetSelection) => void;
  onAddCombo?: (selections: BetSelection[]) => void;
  selectedSelections?: BetSelection[];
  refreshKey?: number;
}

type FeaturedMarketCategory =
  | 'ALL'
  | '1X2'
  | 'DOUBLE_CHANCE'
  | 'OVER_UNDER'
  | 'BTTS'
  | 'COMBOS'
  | 'TEAM_GOALS'
  | 'SPECIALS';

type ComboSubFilter = 'ALL' | 'WIN_GOALS' | 'DC_GOALS' | 'BTTS_COMBOS';

const MARKET_CATEGORY_META: Array<{ id: Exclude<FeaturedMarketCategory, 'ALL'>; label: string }> = [
  { id: '1X2', label: '1X2' },
  { id: 'DOUBLE_CHANCE', label: 'Double Chance' },
  { id: 'OVER_UNDER', label: 'O/U' },
  { id: 'BTTS', label: 'BTTS' },
  { id: 'COMBOS', label: 'Combos' },
  { id: 'TEAM_GOALS', label: 'Team Markets' },
  { id: 'SPECIALS', label: 'Specials' },
];

const COMBO_SUBFILTER_META: Array<{ id: ComboSubFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'WIN_GOALS', label: 'Win & Goals' },
  { id: 'DC_GOALS', label: 'DC & Goals' },
  { id: 'BTTS_COMBOS', label: 'BTTS Combos' },
];

function getMarketCategory(key: MarketOption['key']): Exclude<FeaturedMarketCategory, 'ALL'> {
  if (key === 'HOME_WIN' || key === 'DRAW' || key === 'AWAY_WIN') return '1X2';
  if (key.startsWith('DOUBLE_CHANCE_') || key.startsWith('DNB_')) return 'DOUBLE_CHANCE';
  if (key.startsWith('OVER_') || key.startsWith('UNDER_')) return 'OVER_UNDER';
  if (key.startsWith('BTTS_')) return 'BTTS';
  if (key.startsWith('COMBO_') || key === 'HOME_WIN_TO_NIL' || key === 'AWAY_WIN_TO_NIL') return 'COMBOS';
  if (key.startsWith('HOME_') || key.startsWith('AWAY_')) return 'TEAM_GOALS';
  return 'SPECIALS';
}

function getComboSubGroup(key: string): Exclude<ComboSubFilter, 'ALL'> {
  if (key.includes('BTTS')) return 'BTTS_COMBOS';
  if (key.startsWith('COMBO_1X_') || key.startsWith('COMBO_X2_') || key.startsWith('COMBO_12_')) return 'DC_GOALS';
  return 'WIN_GOALS';
}

function computeClientFallbackOdds(prob: number): number {
  const raw = prob > 0 ? 1 / prob : 1.5;
  return Number(Math.max(1.02, Math.min(50, raw)).toFixed(2));
}

export const DailyFeaturedTip: React.FC<DailyFeaturedTipProps> = ({
  onSelectDetail,
  onAddSelection,
  onAddCombo,
  selectedSelections = [],
  refreshKey = 0,
}) => {
  const [tips, setTips] = useState<FeaturedTipDTO[]>([]);
  const [comboMarketsByFixture, setComboMarketsByFixture] = useState<Record<string, FeaturedTipComboOptionDTO[]>>({});
  const [loadingCombosForFixture, setLoadingCombosForFixture] = useState<Record<string, boolean>>({});
  const [expandedTipKeys, setExpandedTipKeys] = useState<Record<string, boolean>>({});
  const [comboSubFilters, setComboSubFilters] = useState<Record<string, ComboSubFilter>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [marketFilter, setMarketFilter] = useState<FeaturedMarketCategory>('ALL');
  const hasLoadedRef = useRef<boolean>(false);

  useEffect(() => {
    let isCancelled = false;
    async function loadFeaturedTips() {
      try {
        if (!hasLoadedRef.current) {
          setIsLoading(true);
        }
        const res = await EngineService.getFeaturedTips(refreshKey > 0);
        if (!isCancelled) {
          const sanitizedTips = (res.tips || []).filter(
            (tip) => !/(?:^|_)05(?:_|$)/.test(String(tip.market?.key || '').toUpperCase())
          );
          setTips(sanitizedTips);
          if (res.comboMarketsByFixture) {
            setComboMarketsByFixture(res.comboMarketsByFixture);
          }
          hasLoadedRef.current = true;
        }
      } catch (err) {
        console.error('Error loading featured tips from server:', err);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }
    void loadFeaturedTips();
    return () => {
      isCancelled = true;
    };
  }, [refreshKey]);

  const loadComboOptionsFallback = useCallback(
    async (fixtureId: string) => {
      if (comboMarketsByFixture[fixtureId]?.length || loadingCombosForFixture[fixtureId]) return;
      setLoadingCombosForFixture((prev) => ({ ...prev, [fixtureId]: true }));
      try {
        const detail = await EngineService.getMatchDetail(fixtureId);
        if (detail?.markets?.length) {
          const mOdds = detail.marketOdds;
          const combos: FeaturedTipComboOptionDTO[] = detail.markets
            .filter(
              (m) =>
                m.key.startsWith('COMBO_') &&
                !/(?:^|_)05(?:_|$)/.test(String(m.key).toUpperCase())
            )
            .map((m) => ({
              market: m,
              odds: computeClientFallbackOdds(m.probability),
              hasScrapedOdds: Boolean(mOdds && m.marketOdds),
            }))
            .sort((a, b) => b.market.probability - a.market.probability);
          setComboMarketsByFixture((prev) => ({ ...prev, [fixtureId]: combos }));
        }
      } catch (err) {
        console.warn('Failed to load match combo options:', err);
      } finally {
        setLoadingCombosForFixture((prev) => ({ ...prev, [fixtureId]: false }));
      }
    },
    [comboMarketsByFixture, loadingCombosForFixture]
  );

  const toggleTipAccordion = (tipKey: string, fixture: Fixture, existingCombos: FeaturedTipComboOptionDTO[]) => {
    const nextExpanded = !expandedTipKeys[tipKey];
    setExpandedTipKeys((prev) => ({ ...prev, [tipKey]: nextExpanded }));
    if (nextExpanded && existingCombos.length === 0) {
      void loadComboOptionsFallback(fixture.id);
    }
  };

  const availableMarketTabs = useMemo<SegmentedTabItem<FeaturedMarketCategory>[]>(() => {
    const counts: Record<Exclude<FeaturedMarketCategory, 'ALL'>, number> = {
      '1X2': 0,
      DOUBLE_CHANCE: 0,
      OVER_UNDER: 0,
      BTTS: 0,
      COMBOS: 0,
      TEAM_GOALS: 0,
      SPECIALS: 0,
    };

    for (const tip of tips) {
      counts[getMarketCategory(tip.market.key)] += 1;
    }

    const tabs: SegmentedTabItem<FeaturedMarketCategory>[] = [
      { id: 'ALL', label: 'All', count: tips.length },
    ];

    for (const meta of MARKET_CATEGORY_META) {
      if (counts[meta.id] > 0) {
        tabs.push({
          id: meta.id,
          label: meta.label,
          count: counts[meta.id],
        });
      }
    }

    return tabs;
  }, [tips]);

  useEffect(() => {
    if (marketFilter !== 'ALL' && !availableMarketTabs.some((t) => t.id === marketFilter)) {
      setMarketFilter('ALL');
    }
  }, [availableMarketTabs, marketFilter]);

  const filteredTips = useMemo(() => {
    if (marketFilter === 'ALL') return tips;
    return tips.filter((tip) => getMarketCategory(tip.market.key) === marketFilter);
  }, [tips, marketFilter]);

  const uniqueMatchComboTips = useMemo(() => {
    const seen = new Set<string>();
    const unique: FeaturedTipDTO[] = [];
    for (const tip of filteredTips) {
      if (seen.has(tip.fixture.id)) continue;
      seen.add(tip.fixture.id);
      unique.push(tip);
    }
    return unique;
  }, [filteredTips]);

  const filteredTotalOdds = useMemo(() => {
    if (uniqueMatchComboTips.length === 0) return 1.0;
    return Number(uniqueMatchComboTips.reduce((acc, tip) => acc * tip.odds, 1.0).toFixed(2));
  }, [uniqueMatchComboTips]);

  if (isLoading) {
    return <LoadingState variant="spinner" minHeight="min-h-[124px]" label="Loading tips..." />;
  }

  if (tips.length === 0) {
    return (
      <Card surface="default" padding="none" radius="2xl" className="overflow-hidden">
        <div className="min-h-[40px] px-3.5 py-2 bg-theme-card-elevated flex items-center">
          <SectionHeader
            title="Today's Featured Tips (>75%)"
            icon={<Award className="w-4 h-4" />}
            size="md"
            className="w-full"
          />
        </div>
        <div className="py-8 px-4 text-center text-sm text-theme-sub">
          No featured tips today.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top Market Filter */}
      <div className="flex items-center justify-between gap-2">
        <SegmentedTabs<FeaturedMarketCategory>
          items={availableMarketTabs}
          value={marketFilter}
          onChange={setMarketFilter}
          variant="card"
          size="md"
          ariaLabel="Filter featured tips by market"
          className="max-w-full"
        />
      </div>

      <Card surface="default" padding="none" radius="2xl" className="overflow-hidden">
        <div className="min-h-[40px] px-3.5 py-2 bg-theme-card-elevated flex items-center justify-between gap-2 flex-wrap">
          <SectionHeader
            title="Today's Featured Tips"
            icon={<Award className="w-4 h-4" />}
            size="md"
          />
          <div className="flex items-center gap-2.5 text-sm tabular-nums flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-theme-sub font-medium">Total Odds:</span>
              <span className="font-bold text-theme-primary">{filteredTotalOdds.toFixed(2)}x</span>
              <span aria-hidden="true" className="text-theme-dim">·</span>
              <span className="text-xs text-theme-sub font-medium">
                {filteredTips.length} {filteredTips.length === 1 ? 'tip' : 'tips'}
                {uniqueMatchComboTips.length !== filteredTips.length
                  ? ` (${uniqueMatchComboTips.length} matches)`
                  : ''}
              </span>
            </div>
            {onAddCombo && uniqueMatchComboTips.length > 0 && (() => {
              const allInSlip = uniqueMatchComboTips.every(({ fixture, market }) =>
                selectedSelections.some((s) => s.fixtureId === fixture.id && s.marketKey === market.key)
              );
              return (
                <button
                  type="button"
                  onClick={() =>
                    onAddCombo(
                      uniqueMatchComboTips.map(({ fixture, market, odds }) => ({
                        fixtureId: fixture.id,
                        homeTeam: fixture.homeTeam,
                        awayTeam: fixture.awayTeam,
                        leagueName: fixture.leagueName,
                        marketKey: market.key,
                        marketName: market.name,
                        odds: Number(odds.toFixed(2)),
                        matchDate: fixture.matchDate,
                        kickOffTime: fixture.kickOffTime,
                        timestamp: fixture.timestamp,
                        score: fixture.score,
                      }))
                    )
                  }
                  className={`h-[30px] px-3 rounded-full text-xs font-semibold flex items-center justify-center transition-all cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                    allInSlip
                      ? 'bg-theme-primary text-theme-primary-text'
                      : 'bg-theme-primary/15 text-theme-primary hover:bg-theme-primary hover:text-theme-primary-text'
                  }`}
                >
                  <span>{allInSlip ? 'Combo in Slip' : `Add ${uniqueMatchComboTips.length}-Fold Combo`}</span>
                </button>
              );
            })()}
          </div>
        </div>

        <div className="divide-y divide-[var(--border-subdued)]">
          {filteredTips.map((tipItem) => {
            const { fixture, market, odds, hasScrapedOdds } = tipItem;
            const tipKey = `${fixture.id}_${market.key}`;
            const accordionId = `tip-combos-${tipKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            const { timeStr } = formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp);
            const probPercent = (market.probability * 100).toFixed(0);
            const isExpanded = Boolean(expandedTipKeys[tipKey]);
            const comboOptions = tipItem.comboMarkets ?? comboMarketsByFixture[fixture.id] ?? [];
            const isLoadingCombos = Boolean(loadingCombosForFixture[fixture.id]);
            const activeComboSubFilter = comboSubFilters[tipKey] ?? 'ALL';
            const filteredComboOptions =
              activeComboSubFilter === 'ALL'
                ? comboOptions
                : comboOptions.filter((c) => getComboSubGroup(c.market.key) === activeComboSubFilter);
            const isTipSelected = selectedSelections.some(
              (s) => s.fixtureId === fixture.id && s.marketKey === market.key
            );

            return (
              <div key={tipKey} className="bg-theme-card">
                {/* Tip Header Row */}
                <div className="min-h-[58px] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5 hover:bg-theme-card-elevated transition-colors group">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectDetail && onSelectDetail(fixture)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && onSelectDetail) {
                        e.preventDefault();
                        onSelectDetail(fixture);
                      }
                    }}
                    className="flex-1 min-w-0 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                  >
                    <div className="flex items-center gap-1.5 text-xs text-theme-sub">
                      <span className="truncate font-medium">{fixture.leagueName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums shrink-0 font-normal">{timeStr}</span>
                    </div>
                    <div className="text-base font-semibold text-theme-main truncate mt-0.5 tracking-[-0.01em] group-hover:text-theme-primary transition-colors">
                      {fixture.homeTeam} <span className="text-theme-sub font-normal">vs</span> {fixture.awayTeam}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-sm tabular-nums flex-wrap">
                      <span className="font-semibold text-theme-model-pick">
                        {market.name}
                      </span>
                      <span aria-hidden="true" className="text-theme-dim">·</span>
                      <span className={hasScrapedOdds ? 'text-theme-primary font-semibold' : 'text-theme-sub font-medium'}>
                        {hasScrapedOdds ? `FS ${odds.toFixed(2)}` : `Odds ${odds.toFixed(2)}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTipAccordion(tipKey, fixture, comboOptions);
                        }}
                        aria-expanded={isExpanded}
                        aria-controls={accordionId}
                        className={`h-[30px] px-2.5 rounded-full text-xs font-semibold flex items-center justify-center transition-all cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                          isExpanded
                            ? 'bg-theme-primary/15 text-theme-primary'
                            : 'bg-theme-subtle text-theme-sub hover:text-theme-main hover:bg-theme-card-elevated'
                        }`}
                        title="Expand match combo bet options"
                      >
                        <span>Combos{comboOptions.length > 0 ? ` (${comboOptions.length})` : ''}</span>
                      </button>

                      {onAddSelection && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddSelection({
                              fixtureId: fixture.id,
                              homeTeam: fixture.homeTeam,
                              awayTeam: fixture.awayTeam,
                              leagueName: fixture.leagueName,
                              marketKey: market.key,
                              marketName: market.name,
                              odds: Number(odds.toFixed(2)),
                              matchDate: fixture.matchDate,
                              kickOffTime: fixture.kickOffTime,
                              timestamp: fixture.timestamp,
                              score: fixture.score,
                            });
                          }}
                          className={`h-[30px] px-2.5 rounded-full text-xs font-semibold flex items-center justify-center transition-all cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                            isTipSelected
                              ? 'bg-theme-primary text-theme-primary-text'
                              : 'bg-theme-subtle text-theme-main hover:bg-theme-primary/10 hover:text-theme-primary'
                          }`}
                          title="Add to Bet Slip"
                          aria-label="Add to Bet Slip"
                        >
                          <span>{isTipSelected ? 'Added' : '+ Slip'}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="text-right">
                        <div className="text-lg font-bold text-theme-main tabular-nums leading-none tracking-[-0.015em]">
                          {probPercent}%
                        </div>
                        <div className="text-2xs font-medium text-theme-sub mt-0.5">Conf.</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-theme-sub group-hover:text-theme-primary transition-colors duration-150" />
                    </div>
                  </div>
                </div>

                {/* Expandable Combo Bet Options Accordion */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      id={accordionId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden bg-theme-subtle/40"
                    >
                      <div className="px-3.5 pt-2.5 pb-2 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-semibold text-theme-main">
                            Combo Bet Options
                          </span>
                          <span aria-hidden="true" className="text-theme-dim">·</span>
                          <span className="text-theme-sub tabular-nums">
                            {comboOptions.length} markets
                          </span>
                        </div>

                        {comboOptions.length > 0 && (
                          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar p-0.5 bg-theme-card rounded-full">
                            {COMBO_SUBFILTER_META.map((sub) => {
                              const subCount =
                                sub.id === 'ALL'
                                  ? comboOptions.length
                                  : comboOptions.filter((c) => getComboSubGroup(c.market.key) === sub.id).length;
                              if (sub.id !== 'ALL' && subCount === 0) return null;
                              const isSubActive = activeComboSubFilter === sub.id;
                              return (
                                <button
                                  key={sub.id}
                                  type="button"
                                  onClick={() =>
                                    setComboSubFilters((prev) => ({
                                      ...prev,
                                      [tipKey]: sub.id,
                                    }))
                                  }
                                  className={`h-[24px] px-2.5 rounded-full text-2xs font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                                    isSubActive
                                      ? 'bg-theme-primary text-theme-primary-text'
                                      : 'text-theme-sub hover:text-theme-main'
                                  }`}
                                >
                                  {sub.label} ({subCount})
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {isLoadingCombos ? (
                        <div className="py-5 px-4 text-center text-xs text-theme-sub">
                          Loading combos...
                        </div>
                      ) : filteredComboOptions.length === 0 ? (
                        <div className="py-5 px-4 text-center text-xs text-theme-sub">
                          No combo options
                        </div>
                      ) : (
                        <div className="px-3 pb-3 pt-1 grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-[360px] overflow-y-auto overscroll-contain">
                          {filteredComboOptions.map((combo) => {
                            const comboProbPct = (combo.market.probability * 100).toFixed(1);
                            const isComboSelected = selectedSelections.some(
                              (s) => s.fixtureId === fixture.id && s.marketKey === combo.market.key
                            );
                            const isHighProb = combo.market.probability >= 0.65;

                            return (
                              <div
                                key={combo.market.key}
                                className="rounded-xl bg-theme-card hover:bg-theme-card-elevated px-3 py-2 flex items-center justify-between gap-2.5 transition-colors"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold text-theme-main truncate" title={combo.market.name}>
                                    {combo.market.name}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5 text-2xs tabular-nums">
                                    <span className={isHighProb ? 'font-bold text-theme-primary' : 'font-semibold text-theme-sub'}>
                                      {comboProbPct}% prob
                                    </span>
                                    <span aria-hidden="true" className="text-theme-dim">·</span>
                                    <span className="font-medium text-theme-sub">
                                      Odds {combo.odds.toFixed(2)}
                                    </span>
                                  </div>
                                </div>

                                {onAddSelection && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onAddSelection({
                                        fixtureId: fixture.id,
                                        homeTeam: fixture.homeTeam,
                                        awayTeam: fixture.awayTeam,
                                        leagueName: fixture.leagueName,
                                        marketKey: combo.market.key,
                                        marketName: combo.market.name,
                                        odds: Number(combo.odds.toFixed(2)),
                                        matchDate: fixture.matchDate,
                                        kickOffTime: fixture.kickOffTime,
                                        timestamp: fixture.timestamp,
                                        score: fixture.score,
                                      })
                                    }
                                    className={`h-[26px] px-2.5 rounded-full text-2xs font-semibold flex items-center justify-center transition-all cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                                      isComboSelected
                                        ? 'bg-theme-primary text-theme-primary-text'
                                        : 'bg-theme-subtle text-theme-main hover:bg-theme-primary/15 hover:text-theme-primary'
                                    }`}
                                    aria-label={`${isComboSelected ? 'Remove' : 'Add'} ${combo.market.name} to Bet Slip`}
                                  >
                                    <span>{isComboSelected ? 'Added' : '+ Slip'}</span>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};


