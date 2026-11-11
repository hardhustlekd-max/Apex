import React, { useState, useEffect, useMemo } from 'react';
import { Target, TrendingUp, Award, ChevronRight, Loader2 } from 'lucide-react';
import { Fixture } from '../core/types.js';
import { formatMatchDateTime } from '../core/dateUtils.js';

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
    // Find the fixture with the highest confidence prediction
    let bestFixture: Fixture | null = null;
    let maxProb = 0;

    for (const f of fixtures) {
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

    // Find the actual best market for that fixture
    const bestMarket = bestFixture.markets?.reduce((prev, curr) => 
      curr.probability > prev.probability ? curr : prev
    );

    return { fixture: bestFixture, market: bestMarket };
  }, [fixtures]);

  if (isLoading) {
    return (
      <div className="bg-theme-card rounded-2xl p-8 flex items-center justify-center border border-theme">
        <Loader2 className="w-8 h-8 text-theme-primary animate-spin" />
      </div>
    );
  }

  if (!featuredTip) return null;

  const { fixture, market } = featuredTip;

  return (
    <div className="bg-theme-card rounded-2xl p-5 shadow-xs border border-theme space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-theme-primary">
          <Award className="w-5 h-5" />
          <h2 className="text-sm font-black uppercase tracking-wider text-theme-main">Daily Featured Tip</h2>
        </div>
        <span className="text-[10px] font-mono tabular-nums font-bold bg-theme-subtle text-theme-main px-2 py-1 rounded-full">
          Highest Confidence
        </span>
      </div>

      <div 
        className="flex items-center justify-between gap-4 cursor-pointer group"
        onClick={() => onSelectDetail && onSelectDetail(fixture)}
      >
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-theme-sub mb-1">
            {fixture.leagueName} · {formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp).timeStr}
          </div>
          <div className="text-sm font-extrabold text-theme-main truncate">
            {fixture.homeTeam} vs {fixture.awayTeam}
          </div>
          <div className="text-xs font-bold text-theme-model-pick mt-1">
            Pick: {market?.name} @ {market?.odds.toFixed(2)}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-2xl font-black text-theme-main font-mono tabular-nums">
              {(market?.probability! * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] font-bold text-theme-sub">Confidence</div>
          </div>
          <ChevronRight className="w-5 h-5 text-theme-sub group-hover:text-theme-main transition-colors" />
        </div>
      </div>
    </div>
  );
};
