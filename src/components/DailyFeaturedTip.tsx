import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Award, ChevronRight } from 'lucide-react';
import { FeaturedTipDTO, Fixture, MarketOption } from '../core/types.js';
import { formatMatchDateTime } from '../core/dateUtils.js';
import { EngineService } from '../services/engineService.js';
import { Card, LoadingState, SectionHeader, SegmentedTabs, SegmentedTabItem } from './ui/index.js';

interface DailyFeaturedTipProps {
  onSelectDetail?: (fixture: Fixture) => void;
  refreshKey?: number;
}

type FeaturedMarketCategory = 'ALL' | '1X2' | 'DOUBLE_CHANCE' | 'OVER_UNDER' | 'BTTS';

const MARKET_CATEGORY_META: Array<{ id: Exclude<FeaturedMarketCategory, 'ALL'>; label: string }> = [
  { id: '1X2', label: '1X2' },
  { id: 'DOUBLE_CHANCE', label: 'Double Chance' },
  { id: 'OVER_UNDER', label: 'Over / Under' },
  { id: 'BTTS', label: 'BTTS' },
];

function getMarketCategory(key: MarketOption['key']): Exclude<FeaturedMarketCategory, 'ALL'> {
  if (key === 'DOUBLE_CHANCE_1X' || key === 'DOUBLE_CHANCE_X2') return 'DOUBLE_CHANCE';
  if (key === 'OVER_25' || key === 'UNDER_25') return 'OVER_UNDER';
  if (key === 'BTTS_YES' || key === 'BTTS_NO') return 'BTTS';
  return '1X2';
}

export const DailyFeaturedTip: React.FC<DailyFeaturedTipProps> = ({
  onSelectDetail,
  refreshKey = 0,
}) => {
  const [tips, setTips] = useState<FeaturedTipDTO[]>([]);
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
          setTips(res.tips || []);
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

  const availableMarketTabs = useMemo<SegmentedTabItem<FeaturedMarketCategory>[]>(() => {
    const counts: Record<Exclude<FeaturedMarketCategory, 'ALL'>, number> = {
      '1X2': 0,
      DOUBLE_CHANCE: 0,
      OVER_UNDER: 0,
      BTTS: 0,
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

  const filteredTotalOdds = useMemo(() => {
    if (filteredTips.length === 0) return 1.0;
    return Number(filteredTips.reduce((acc, tip) => acc * tip.odds, 1.0).toFixed(2));
  }, [filteredTips]);

  if (isLoading) {
    return <LoadingState variant="spinner" minHeight="min-h-[124px]" label="Loading today's high confidence tips..." />;
  }

  if (tips.length === 0) {
    return (
      <Card surface="default" padding="none" radius="2xl" className="overflow-hidden">
        <div className="min-h-[40px] px-3.5 py-2 bg-theme-header-grad border-b border-theme-subdued flex items-center">
          <SectionHeader
            title="Today's Featured Tips (>85%)"
            icon={<Award className="w-4 h-4" />}
            size="md"
            className="w-full"
          />
        </div>
        <div className="py-8 px-4 text-center text-sm text-theme-sub">
          No matches today with &gt;85% confidence currently available.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SegmentedTabs<FeaturedMarketCategory>
          items={availableMarketTabs}
          value={marketFilter}
          onChange={setMarketFilter}
          variant="card"
          size="md"
          ariaLabel="Filter featured tips by available market option"
          className="max-w-full"
        />
      </div>

      <Card surface="default" padding="none" radius="2xl" className="overflow-hidden">
        <div className="min-h-[40px] px-3.5 py-2 bg-theme-header-grad border-b border-theme-subdued flex items-center justify-between gap-2 flex-wrap">
          <SectionHeader
            title="Today's Featured Tips (>85%)"
            icon={<Award className="w-4 h-4" />}
            size="md"
          />
          <div className="flex items-center gap-1.5 text-sm tabular-nums">
            <span className="text-theme-sub font-medium">Total Odds:</span>
            <span className="font-bold text-theme-primary">{filteredTotalOdds.toFixed(2)}x</span>
            <span aria-hidden="true" className="text-theme-dim">·</span>
            <span className="text-xs text-theme-sub font-medium">
              {filteredTips.length} {filteredTips.length === 1 ? 'match' : 'matches'}
            </span>
          </div>
        </div>

        <div className="divide-y divide-[var(--border-subdued)]">
          {filteredTips.map(({ fixture, market, odds, hasScrapedOdds }) => {
            const { timeStr } = formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp);
            const probPercent = (market.probability * 100).toFixed(0);

            return (
              <div
                key={fixture.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectDetail && onSelectDetail(fixture)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && onSelectDetail) {
                    e.preventDefault();
                    onSelectDetail(fixture);
                  }
                }}
                className="min-h-[54px] flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-theme-card-elevated transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-theme-sub">
                    <span className="truncate font-medium">{fixture.leagueName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums shrink-0 font-normal">{timeStr}</span>
                  </div>
                  <div className="text-base font-semibold text-theme-main truncate mt-0.5 tracking-[-0.01em]">
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

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <div className="text-lg font-bold text-theme-main tabular-nums leading-none tracking-[-0.015em]">
                      {probPercent}%
                    </div>
                    <div className="text-2xs font-medium text-theme-sub mt-0.5">Conf.</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-theme-sub group-hover:text-theme-primary transition-colors duration-150" />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

