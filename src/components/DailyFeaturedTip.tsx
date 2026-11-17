import React, { useState, useEffect, useRef } from 'react';
import { Award, ChevronRight, TrendingUp } from 'lucide-react';
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
      <Card surface="interactive" padding="lg" radius="2xl" className="space-y-3">
        <SectionHeader
          title="Today's Featured Tips (>85% Confidence)"
          icon={<Award className="w-5 h-5 text-theme-primary" />}
          size="md"
        />
        <div className="py-6 text-center text-xs text-theme-sub font-mono">
          No matches today with &gt;85% confidence currently available.
        </div>
      </Card>
    );
  }

  return (
    <Card surface="interactive" padding="lg" radius="2xl" className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SectionHeader
          title="Today's Featured Tips (>85% Confidence)"
          icon={<Award className="w-5 h-5 text-theme-primary" />}
          size="md"
        />
        <div className="flex items-center gap-2 bg-theme-card px-3 py-1.5 rounded-xl border border-theme shadow-theme-sm">
          <TrendingUp className="w-4 h-4 text-theme-primary" />
          <span className="text-xs font-bold text-theme-sub">Total Odds:</span>
          <span className="text-xs font-black font-mono tabular-nums text-theme-primary">
            {totalOdds.toFixed(2)}x
          </span>
          <span className="text-[10px] text-theme-sub font-medium">
            ({tips.length} {tips.length === 1 ? 'match' : 'matches'})
          </span>
        </div>
      </div>

      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
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
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-theme-card hover:bg-theme-subtle transition-colors cursor-pointer group border border-theme-subdued focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[11px] text-theme-sub mb-0.5">
                  <span className="truncate font-semibold">{fixture.leagueName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums shrink-0">{timeStr}</span>
                </div>
                <div className="text-xs sm:text-sm font-extrabold text-theme-main truncate">
                  {fixture.homeTeam} vs {fixture.awayTeam}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[11px] font-bold text-theme-model-pick font-mono bg-theme-primary-subtle px-2 py-0.5 rounded">
                    {market.name}
                  </span>
                  <span
                    className={`text-[11px] font-mono tabular-nums font-bold ${
                      hasScrapedOdds ? 'text-theme-primary' : 'text-theme-sub'
                    }`}
                  >
                    {hasScrapedOdds ? `Flashscore: ${odds.toFixed(2)}` : `Odds: ${odds.toFixed(2)}`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <div className="text-base sm:text-lg font-black text-theme-main font-mono tabular-nums">
                    {probPercent}%
                  </div>
                  <div className="text-[9.5px] font-bold text-theme-sub">Confidence</div>
                </div>
                <ChevronRight className="w-4 h-4 text-theme-sub group-hover:text-theme-main transition-colors duration-150" />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
