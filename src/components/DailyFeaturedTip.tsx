import React, { useState, useEffect, useRef } from 'react';
import { Award, ChevronRight } from 'lucide-react';
import { FeaturedTipDTO, Fixture } from '../core/types.js';
import { formatMatchDateTime } from '../core/dateUtils.js';
import { EngineService } from '../services/engineService.js';
import { Card, LoadingState, SectionHeader } from './ui/index.js';

interface DailyFeaturedTipProps {
  onSelectDetail?: (fixture: Fixture) => void;
  refreshKey?: number;
}

export const DailyFeaturedTip: React.FC<DailyFeaturedTipProps> = ({
  onSelectDetail,
  refreshKey = 0,
}) => {
  const [tips, setTips] = useState<FeaturedTipDTO[]>([]);
  const [totalOdds, setTotalOdds] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
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
          setTotalOdds(res.totalOdds || 1.0);
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

  if (isLoading) {
    return <LoadingState variant="spinner" minHeight="min-h-[140px]" label="Loading today's high confidence tips..." />;
  }

  if (tips.length === 0) {
    return (
      <Card surface="default" padding="none" radius="2xl" className="overflow-hidden">
        <div className="min-h-[44px] px-3.5 py-2 bg-theme-header-grad border-b border-theme-subdued flex items-center">
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
    <Card surface="default" padding="none" radius="2xl" className="overflow-hidden">
      <div className="min-h-[44px] px-3.5 py-2 bg-theme-header-grad border-b border-theme-subdued flex items-center justify-between gap-2 flex-wrap">
        <SectionHeader
          title="Today's Featured Tips (>85%)"
          icon={<Award className="w-4 h-4" />}
          size="md"
        />
        <div className="flex items-center gap-1.5 text-sm tabular-nums">
          <span className="text-theme-sub font-medium">Total Odds:</span>
          <span className="font-bold text-theme-primary">{totalOdds.toFixed(2)}x</span>
          <span aria-hidden="true" className="text-theme-dim">·</span>
          <span className="text-xs text-theme-sub font-medium">
            {tips.length} {tips.length === 1 ? 'match' : 'matches'}
          </span>
        </div>
      </div>

      <div className="divide-y divide-[var(--border-subdued)] max-h-[480px] overflow-y-auto">
        {tips.map(({ fixture, market, odds, hasScrapedOdds }) => {
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
              className="min-h-[46px] flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-theme-card-elevated transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
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
                  <div className="text-xl font-bold text-theme-main tabular-nums leading-none tracking-[-0.025em]">
                    {probPercent}%
                  </div>
                  <div className="text-2xs font-medium text-theme-sub mt-0.5">Conf.</div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-theme-sub group-hover:text-theme-primary transition-colors duration-150" />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
