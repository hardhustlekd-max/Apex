import React, { useState, useEffect, useMemo } from 'react';
import { Award, ChevronRight } from 'lucide-react';
import { Fixture } from '../core/types.js';
import { formatMatchDateTime } from '../core/dateUtils.js';
import { Card, LoadingState, SectionHeader } from './ui/index.js';

interface DailyFeaturedTipProps {
  onSelectDetail?: (fixture: Fixture) => void;
}

export const DailyFeaturedTip: React.FC<DailyFeaturedTipProps> = ({ onSelectDetail }) => {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchFixtures() {
      try {
        setIsLoading(true);
        const response = await fetch('/api/fixtures');
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setFixtures(data.fixtures || []);
      } catch (err) {
        console.error('Error fetching featured tip data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchFixtures();
  }, []);

  const featuredTip = useMemo(() => {
    let bestFixture: Fixture | null = null;
    let maxProb = 0;

    for (const f of fixtures) {
      if (!f.prediction) continue;
      if (f.markets) {
        for (const market of f.markets) {
          if (market.probability > maxProb) {
            maxProb = market.probability;
            bestFixture = f;
          }
        }
      }
    }

    if (!bestFixture) return null;

    const bestMarket = bestFixture.markets?.reduce((prev, curr) =>
      curr.probability > prev.probability ? curr : prev
    );

    return { fixture: bestFixture, market: bestMarket };
  }, [fixtures]);

  if (isLoading) {
    return <LoadingState variant="spinner" minHeight="min-h-[120px]" label="Loading featured tip..." />;
  }

  if (!featuredTip) return null;

  const { fixture, market } = featuredTip;

  return (
    <Card surface="interactive" padding="lg" radius="2xl" className="space-y-4">
      <SectionHeader
        title="Featured Tip"
        icon={<Award className="w-5 h-5 text-theme-primary" />}
        size="md"
      />

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
        className="flex items-center justify-between gap-4 cursor-pointer group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
      >
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-theme-sub mb-1">
            {fixture.leagueName} · {formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp).timeStr}
          </div>
          <div className="text-sm font-extrabold text-theme-main truncate">
            {fixture.homeTeam} vs {fixture.awayTeam}
          </div>
          <div className="text-xs font-bold text-theme-model-pick mt-1">
            Pick: {market?.name}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className="text-2xl font-black text-theme-main font-mono tabular-nums">
              {market ? (market.probability * 100).toFixed(0) : 0}%
            </div>
            <div className="text-[10px] font-bold text-theme-sub">Confidence</div>
          </div>
          <ChevronRight className="w-5 h-5 text-theme-sub group-hover:text-theme-main transition-colors duration-150" />
        </div>
      </div>
    </Card>
  );
};
