import React, { useState, useEffect } from 'react';
import { Copy, Check, Info, RefreshCw } from 'lucide-react';
import { Fixture, AccumulatorSlip, EngineSettings } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import { getRelativeDateStr, formatUtcKickoffTime } from '../core/dateUtils.js';
import { isMatchStarted } from '../core/accumulator.js';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  SectionHeader,
  SegmentedTabs,
  Select,
  TeamAvatar,
} from './ui/index.js';

interface PrebuiltAccumulatorsProps {
  fixtures: Fixture[];
  settings: EngineSettings | null;
  onSelectDetail?: (fixture: Fixture) => void;
  onTriggerFullSync?: () => void;
}

type PrebuiltCategory = 'BANKER' | 'PROBABILITY_CHASE' | 'HIGH_GOALS' | 'MEGA_COMBO';

interface RiskProfile {
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  label: string;
  variant: 'success' | 'warning' | 'danger';
}

function calculateRiskProfile(slip: AccumulatorSlip): RiskProfile {
  const prob = slip.combinedProb;

  if (prob >= 0.40) {
    return { level: 'LOW', label: 'High Confidence', variant: 'success' };
  }
  if (prob >= 0.20) {
    return { level: 'MEDIUM', label: 'Moderate', variant: 'warning' };
  }
  if (prob >= 0.05) {
    return { level: 'HIGH', label: 'Speculative', variant: 'warning' };
  }
  return { level: 'EXTREME', label: 'Longshot', variant: 'danger' };
}

export const PrebuiltAccumulators: React.FC<PrebuiltAccumulatorsProps> = ({
  fixtures,
  onSelectDetail,
  onTriggerFullSync,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<PrebuiltCategory>('BANKER');
  const [dateScope, setDateScope] = useState<'TODAY' | 'TOMORROW' | 'NEXT_3_DAYS' | 'ALL'>('TODAY');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [stakeBenchmark] = useState<number>(10);
  const [prebuiltSlips, setPrebuiltSlips] = useState<Record<string, AccumulatorSlip>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const unstartedFixtures = (fixtures || []).filter((f) => !isMatchStarted(f));

    EngineService.getPrebuiltAccumulators(dateScope, stakeBenchmark, unstartedFixtures)
      .then((slips) => {
        if (isMounted) {
          setPrebuiltSlips(slips);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load prebuilt accumulators:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [fixtures, dateScope, stakeBenchmark]);

  const activeSlip = prebuiltSlips[selectedCategory] || prebuiltSlips['BANKER'];

  const handleCopySlip = (slip: AccumulatorSlip, id: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(slip.summaryText);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  const categories = [
    { id: 'BANKER' as const, label: 'Banker' },
    { id: 'PROBABILITY_CHASE' as const, label: 'Confidence' },
    { id: 'HIGH_GOALS' as const, label: 'Goals' },
    { id: 'MEGA_COMBO' as const, label: 'Mega Acca' },
  ].map((cat) => ({
    ...cat,
    count: prebuiltSlips[cat.id] ? `${prebuiltSlips[cat.id].legs.length}L` : undefined,
  }));

  if (isLoading && (!activeSlip || Object.keys(prebuiltSlips).length === 0)) {
    return <LoadingState label="Loading..." minHeight="min-h-[320px]" />;
  }

  if (!fixtures || fixtures.length === 0 || !activeSlip) {
    return (
      <EmptyState
        icon={<RefreshCw className="w-6 h-6" />}
        title="No Accumulators Available"
        minHeight="min-h-[340px]"
        className="flex-1"
        actions={
          onTriggerFullSync ? (
            <Button variant="primary" size="md" pill={false} onClick={onTriggerFullSync}>
              <RefreshCw className="w-4 h-4" />
              <span>Start Full Sync & Update Data</span>
            </Button>
          ) : undefined
        }
      />
    );
  }

  const risk = activeSlip ? calculateRiskProfile(activeSlip) : null;

  return (
    <Card surface="default" padding="md" radius="2xl" className="space-y-3 font-sans flex-1 flex flex-col">
      {/* Header Bar */}
      <SectionHeader
        title="Accumulators"
        size="md"
        className="pb-2"
        action={
          <Select
            id="prebuilt-date-scope-dropdown"
            aria-label="Accumulator date scope"
            value={dateScope}
            onChange={(e) => setDateScope(e.target.value as any)}
            surface="subtle"
            selectSize="sm"
            options={[
              { value: 'TODAY', label: "Today's Matches" },
              { value: 'TOMORROW', label: 'Tomorrow' },
              { value: 'NEXT_3_DAYS', label: 'Next 3 Days' },
              { value: 'ALL', label: 'All Available Dates' },
            ]}
          />
        }
      />

      {/* Category Pills Switcher */}
      <SegmentedTabs<PrebuiltCategory>
        items={categories}
        value={selectedCategory}
        onChange={(val) => setSelectedCategory(val)}
        variant="subtle"
        size="md"
        fullWidth
        ariaLabel="Accumulator strategy categories"
      />

      {/* Slip Details & Stats Bar */}
      {activeSlip && (
        <div className="space-y-3">
          {/* Key Metrics Bar */}
          <div className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar flex-nowrap bg-theme-card-elevated p-2.5 rounded-2xl">
            <div className="flex items-center gap-1.5 text-xs flex-nowrap shrink-0 overflow-x-auto no-scrollbar">
              <Badge variant="solid" size="sm" pill>
                {activeSlip.legs.length} Selections
              </Badge>
              <Badge variant="default" size="sm" pill>
                {(activeSlip.combinedProb * 100).toFixed(1)}% Combined Prob
              </Badge>
              {risk && (
                <Badge variant={risk.variant} size="sm" pill>
                  {risk.label}
                </Badge>
              )}
            </div>

            {/* Copy Slip Button */}
            <Button
              variant="primary"
              size="sm"
              pill
              onClick={() => handleCopySlip(activeSlip, activeSlip.id)}
            >
              {copiedId === activeSlip.id ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Copy Slip</span>
                </>
              )}
            </Button>
          </div>

          {/* Legs List matching App Design Token Cards */}
          <div className="space-y-3">
            {activeSlip.legs.map((leg, index) => {
              const matchedFixture = fixtures.find((f) => f.id === leg.fixtureId);
              const pred = matchedFixture?.prediction;
              const homeProb = pred?.homeWinProb !== undefined ? Math.round(pred.homeWinProb * 100) : 45;
              const awayProb = pred?.awayWinProb !== undefined ? Math.round(pred.awayWinProb * 100) : 27;

              return (
                <Card
                  key={`${leg.fixtureId}-${leg.marketKey}`}
                  surface="elevated"
                  padding="md"
                  radius="2xl"
                  className="shadow-none hover:shadow-theme-sm flex flex-col justify-between group space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-nowrap overflow-hidden">
                        <span className="w-5 h-5 rounded-lg bg-theme-primary text-theme-primary-text font-mono tabular-nums text-xs font-black flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <span
                          className="text-xs font-bold px-2.5 py-1 rounded-xl bg-theme-subtle text-theme-main truncate whitespace-nowrap max-w-[180px]"
                          title={matchedFixture?.stage || matchedFixture?.leagueName || leg.league}
                        >
                          {matchedFixture?.stage || matchedFixture?.leagueName || leg.league}
                        </span>
                        <span className="text-xs text-theme-sub font-mono tabular-nums whitespace-nowrap shrink-0 font-medium">
                          {matchedFixture
                            ? formatUtcKickoffTime(matchedFixture)
                            : leg.fixtureDate === getRelativeDateStr(0)
                            ? 'Today'
                            : leg.fixtureDate === getRelativeDateStr(1)
                            ? 'Tomorrow'
                            : leg.fixtureDate}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-theme-subtle text-theme-sub whitespace-nowrap font-mono tabular-nums">
                          {leg.fixtureDate === getRelativeDateStr(0)
                            ? 'Today'
                            : leg.fixtureDate === getRelativeDateStr(1)
                            ? 'Tomorrow'
                            : leg.fixtureDate}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-12 items-center gap-2 my-2">
                      <div className="col-span-5 flex flex-col min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-nowrap">
                          <TeamAvatar src={matchedFixture?.homeBadge} name={leg.homeTeam} size="xs" />
                          <span
                            onClick={() => matchedFixture && onSelectDetail && onSelectDetail(matchedFixture)}
                            className={`text-xs sm:text-sm font-bold text-theme-main truncate whitespace-nowrap ${
                              matchedFixture ? 'cursor-pointer hover:underline' : ''
                            }`}
                            title={leg.homeTeam}
                          >
                            {leg.homeTeam}
                          </span>
                          {pred?.homeWinProb !== undefined && (
                            <span className="font-mono tabular-nums text-xs font-black px-2 py-0.5 rounded-lg bg-theme-subtle text-theme-primary shrink-0 whitespace-nowrap">
                              {homeProb}%
                            </span>
                          )}
                        </div>
                        {pred && (
                          <span className="text-xs text-theme-sub font-mono tabular-nums whitespace-nowrap shrink-0 mt-1 font-medium">
                            xG: <strong className="text-theme-main font-bold">{pred.homeXG}</strong>
                          </span>
                        )}
                      </div>

                      <div className="col-span-2 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] font-black text-theme-sub uppercase tracking-wider whitespace-nowrap">
                          VS
                        </span>
                        {matchedFixture && onSelectDetail && (
                          <button
                            type="button"
                            onClick={() => onSelectDetail(matchedFixture)}
                            className="mt-0.5 text-xs text-theme-primary font-bold hover:underline flex items-center gap-0.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent rounded"
                            title="View Poisson probability matrix"
                          >
                            <Info className="w-3.5 h-3.5" />
                            <span>Grid</span>
                          </button>
                        )}
                      </div>

                      <div className="col-span-5 flex flex-col items-end text-right min-w-0">
                        <div className="flex items-center justify-end gap-2 min-w-0 flex-nowrap w-full">
                          {pred?.awayWinProb !== undefined && (
                            <span className="font-mono tabular-nums text-xs font-black px-2 py-0.5 rounded-lg bg-theme-subtle text-theme-primary shrink-0 whitespace-nowrap">
                              {awayProb}%
                            </span>
                          )}
                          <span
                            onClick={() => matchedFixture && onSelectDetail && onSelectDetail(matchedFixture)}
                            className={`text-xs sm:text-sm font-bold text-theme-main truncate whitespace-nowrap ${
                              matchedFixture ? 'cursor-pointer hover:underline' : ''
                            }`}
                            title={leg.awayTeam}
                          >
                            {leg.awayTeam}
                          </span>
                          <TeamAvatar src={matchedFixture?.awayBadge} name={leg.awayTeam} size="xs" />
                        </div>
                        {pred && (
                          <span className="text-xs text-theme-sub font-mono tabular-nums whitespace-nowrap shrink-0 mt-1 font-medium">
                            xG: <strong className="text-theme-main font-bold">{pred.awayXG}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 p-3 rounded-xl bg-theme-subtle flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-theme-sub font-medium">Selection:</span>
                        <span className="font-bold text-theme-primary">{leg.selection}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono tabular-nums shrink-0">
                        <span className="font-bold text-theme-primary">
                          {(leg.probability * 100).toFixed(0)}% Confidence
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
};
