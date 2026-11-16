import React, { useState, useEffect, useMemo } from 'react';
import { Award, ChevronRight, TrendingUp } from 'lucide-react';
import { Fixture, MarketOption, ScrapedMarketOdds } from '../core/types.js';
import { formatMatchDateTime, matchesDateFilter } from '../core/dateUtils.js';
import { EngineService } from '../services/engineService.js';
import { Card, LoadingState, SectionHeader } from './ui/index.js';

interface DailyFeaturedTipProps {
  onSelectDetail?: (fixture: Fixture) => void;
  fixtures?: Fixture[];
  isLoading?: boolean;
}

interface HighConfidenceTip {
  fixture: Fixture;
  market: MarketOption;
  odds: number;
  hasScrapedOdds: boolean;
}

export function extractFlashscoreOdds(marketKey: string, marketOdds?: ScrapedMarketOdds): number | null {
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
      odd = marketOdds.dc1XOdds ?? (marketOdds.homeOdds && marketOdds.drawOdds ? Number((1 / (1 / marketOdds.homeOdds + 1 / marketOdds.drawOdds)).toFixed(2)) : undefined);
      break;
    case 'DOUBLE_CHANCE_X2':
      odd = marketOdds.dcX2Odds ?? (marketOdds.awayOdds && marketOdds.drawOdds ? Number((1 / (1 / marketOdds.awayOdds + 1 / marketOdds.drawOdds)).toFixed(2)) : undefined);
      break;
    default:
      odd = undefined;
  }
  if (odd !== undefined && odd !== null && !isNaN(odd) && odd > 1.0) {
    return Number(odd.toFixed(2));
  }
  return null;
}

export const DailyFeaturedTip: React.FC<DailyFeaturedTipProps> = ({
  onSelectDetail,
  fixtures: propFixtures,
  isLoading: propIsLoading,
}) => {
  const [fetchedFixtures, setFetchedFixtures] = useState<Fixture[]>([]);
  const [isFetching, setIsFetching] = useState<boolean>(propFixtures === undefined);
  const [enrichedOddsMap, setEnrichedOddsMap] = useState<Record<string, ScrapedMarketOdds>>({});

  useEffect(() => {
    if (propFixtures !== undefined) {
      setIsFetching(false);
      return;
    }
    async function fetchFixtures() {
      try {
        setIsFetching(true);
        const response = await fetch('/api/fixtures?dateFilter=TODAY', { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setFetchedFixtures(data.fixtures || []);
      } catch (err) {
        console.error('Error fetching featured tip data:', err);
      } finally {
        setIsFetching(false);
      }
    }
    fetchFixtures();
  }, [propFixtures]);

  const fixtures = propFixtures !== undefined ? propFixtures : fetchedFixtures;
  const isLoading = propFixtures !== undefined ? Boolean(propIsLoading) : isFetching;

  // Filter strictly for TODAY's matches with >85% confidence
  const highConfidenceTips = useMemo(() => {
    const tips: HighConfidenceTip[] = [];
    const seenFixtureIds = new Set<string>();

    for (const f of fixtures) {
      if (!f.prediction || !f.markets) continue;
      if (seenFixtureIds.has(f.id)) continue;

      // Strictly include ONLY today's matches that are not finished
      const isTodayMatch = matchesDateFilter(f, 'TODAY');
      if (!isTodayMatch) continue;
      if (f.status === 'FINISHED' || f.status === 'CANCELLED' || f.status === 'POSTPONED') continue;

      // Find the highest confidence market pick with >= 85% probability
      let bestMarket: MarketOption | null = null;
      let maxProb = 0;

      for (const market of f.markets) {
        if (market.probability >= 0.85 && market.probability > maxProb) {
          maxProb = market.probability;
          bestMarket = market;
        }
      }

      if (bestMarket && maxProb >= 0.85) {
        const cleanId = (f.id || '').replace(/^fs_/, '');
        const effectiveOdds =
          enrichedOddsMap[f.id] ||
          enrichedOddsMap[cleanId] ||
          f.marketOdds ||
          f.prediction?.marketOdds;

        const fsOdd = extractFlashscoreOdds(bestMarket.key, effectiveOdds);
        const hasScraped = fsOdd !== null;
        const odds = fsOdd ?? (maxProb > 0 ? Number((1 / maxProb).toFixed(2)) : 1.50);

        tips.push({
          fixture: f,
          market: bestMarket,
          odds,
          hasScrapedOdds: hasScraped,
        });
        seenFixtureIds.add(f.id);
      }
    }

    tips.sort((a, b) => b.market.probability - a.market.probability);
    return tips;
  }, [fixtures, enrichedOddsMap]);

  // Fetch actual Flashscore market odds on demand if not yet cached for today's high confidence matches
  useEffect(() => {
    let isCancelled = false;
    highConfidenceTips.forEach(({ fixture, hasScrapedOdds }) => {
      const cleanId = (fixture.id || '').replace(/^fs_/, '');
      if (!hasScrapedOdds && fixture.id && !enrichedOddsMap[fixture.id] && !enrichedOddsMap[cleanId]) {
        EngineService.getMatchDetail(fixture.id)
          .then((detail) => {
            if (!isCancelled && detail?.marketOdds) {
              setEnrichedOddsMap((prev) => ({
                ...prev,
                [fixture.id]: detail.marketOdds!,
                [cleanId]: detail.marketOdds!,
              }));
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [highConfidenceTips, enrichedOddsMap]);

  const totalOdds = useMemo(() => {
    if (highConfidenceTips.length === 0) return 1.0;
    return highConfidenceTips.reduce((acc, tip) => acc * tip.odds, 1.0);
  }, [highConfidenceTips]);

  if (isLoading) {
    return <LoadingState variant="spinner" minHeight="min-h-[140px]" label="Loading today's high confidence tips..." />;
  }

  if (highConfidenceTips.length === 0) {
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
            ({highConfidenceTips.length} {highConfidenceTips.length === 1 ? 'match' : 'matches'})
          </span>
        </div>
      </div>

      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
        {highConfidenceTips.map(({ fixture, market, odds, hasScrapedOdds }) => {
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
