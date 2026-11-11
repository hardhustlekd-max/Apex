import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Layers,
  Loader2,
  ChevronDown,
  Info,
  RefreshCw,
} from 'lucide-react';
import { Fixture, AccumulatorSlip, EngineSettings } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import { getRelativeDateStr, formatLocalKickoffTime } from '../core/dateUtils.js';
import { isMatchStarted } from '../core/accumulator.js';

interface PrebuiltAccumulatorsProps {
  fixtures: Fixture[];
  settings: EngineSettings | null;
  onSelectDetail?: (fixture: Fixture) => void;
  onTriggerFullSync?: () => void;
}

type PrebuiltCategory = 'BANKER' | 'VALUE_HUNTER' | 'HIGH_GOALS' | 'MEGA_COMBO';

interface RiskProfile {
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  label: string;
  badgeBg: string;
  textColor: string;
}

function calculateRiskProfile(slip: AccumulatorSlip): RiskProfile {
  const prob = slip.combinedProb;

  if (prob >= 0.40) {
    return {
      level: 'LOW',
      label: 'High Confidence',
      badgeBg: 'bg-emerald-500/10',
      textColor: 'text-emerald-700 dark:text-emerald-400',
    };
  }

  if (prob >= 0.20) {
    return {
      level: 'MEDIUM',
      label: 'Moderate',
      badgeBg: 'bg-amber-500/10',
      textColor: 'text-amber-700 dark:text-amber-400',
    };
  }

  if (prob >= 0.05) {
    return {
      level: 'HIGH',
      label: 'Speculative',
      badgeBg: 'bg-orange-500/10',
      textColor: 'text-orange-700 dark:text-orange-400',
    };
  }

  return {
    level: 'EXTREME',
    label: 'Longshot',
    badgeBg: 'bg-rose-500/10',
    textColor: 'text-rose-700 dark:text-rose-400',
  };
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
    {
      id: 'BANKER' as const,
      title: 'Banker',
    },
    {
      id: 'PROBABILITY_CHASE' as const,
      title: 'Confidence',
    },
    {
      id: 'HIGH_GOALS' as const,
      title: 'Goals',
    },
    {
      id: 'MEGA_COMBO' as const,
      title: 'Mega Acca',
    },
  ];

  if (isLoading && (!activeSlip || Object.keys(prebuiltSlips).length === 0)) {
    return (
      <div className="p-10 flex-1 min-h-[320px] flex flex-col items-center justify-center text-center bg-theme-card rounded-3xl space-y-3 font-sans shadow-xs border border-theme">
        <Loader2 className="w-8 h-8 text-theme-primary animate-spin shrink-0 mx-auto" />
        <h3 className="text-xs font-bold text-theme-main">
          Generating Poisson Accumulators...
        </h3>
      </div>
    );
  }

  if (!fixtures || fixtures.length === 0 || !activeSlip) {
    return (
      <div className="p-8 sm:p-12 flex-1 min-h-[340px] flex flex-col items-center justify-center text-center bg-theme-card rounded-3xl space-y-4 font-sans shadow-xs border border-theme">
        <div className="w-12 h-12 rounded-2xl bg-theme-primary-subtle flex items-center justify-center text-theme-primary shadow-xs">
          <RefreshCw className="w-6 h-6" />
        </div>
        <div className="space-y-1.5 max-w-md">
          <h3 className="text-sm font-extrabold text-theme-main">
            No Accumulators Available
          </h3>
          <p className="text-xs text-theme-sub font-medium">
            Accumulator slips require active match fixture predictions. Run a full data sync to calculate high-confidence parlays.
          </p>
        </div>
        {onTriggerFullSync && (
          <button
            type="button"
            onClick={onTriggerFullSync}
            className="px-4 py-2.5 bg-theme-primary text-theme-primary-text hover:bg-theme-primary-hover rounded-xl text-xs font-black transition-all cursor-pointer shadow-md active:scale-95 flex items-center gap-2 mt-1"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Start Full Sync & Update Data</span>
          </button>
        )}
      </div>
    );
  }

  const risk = activeSlip ? calculateRiskProfile(activeSlip) : null;

  return (
    <div className="bg-theme-card rounded-2xl p-4 space-y-3 font-sans flex-1 flex flex-col shadow-xs transition-all border border-theme">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2.5 pb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-extrabold text-theme-main tracking-tight">
              Poisson Accumulators
            </h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-theme-primary-subtle text-theme-primary font-mono tabular-nums">
              AI Predictions
            </span>
          </div>
          <p className="text-xs text-theme-sub font-medium mt-0.5">Multi-leg parlays compiled from high-confidence predictions</p>
        </div>

        {/* Date Filter Dropdown */}
        <div className="relative">
          <select
            id="prebuilt-date-scope-dropdown"
            value={dateScope}
            onChange={(e) => setDateScope(e.target.value as any)}
            className="bg-theme-subtle text-theme-main rounded-xl px-3 py-1.5 text-xs font-bold appearance-none cursor-pointer pr-7 focus:outline-none shadow-xs border border-theme"
          >
            <option value="TODAY">Today's Matches</option>
            <option value="TOMORROW">Tomorrow</option>
            <option value="NEXT_3_DAYS">Next 3 Days</option>
            <option value="ALL">All Available Dates</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-theme-sub absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
        </div>
      </div>

      {/* Category Pills Switcher */}
      <div className="bg-theme-subtle p-1 rounded-2xl flex items-center gap-1 overflow-x-auto no-scrollbar shadow-xs">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          const slip = prebuiltSlips[cat.id];

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex-1 min-w-[80px] min-h-[35px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 ${
                isSelected
                  ? 'bg-theme-primary text-theme-primary-text font-black shadow-xs'
                  : 'text-theme-sub hover:text-theme-main'
              }`}
            >
              <span>{cat.title}</span>
              {slip && (
                <span className={`text-[10.5px] sm:text-xs font-mono tabular-nums font-bold px-1.5 py-0.2 rounded-full ${
                  isSelected ? 'bg-black/20 text-theme-primary-text font-black' : 'bg-black/10 dark:bg-white/10 text-theme-main'
                }`}>
                  {slip.legs.length}L
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Slip Details & Stats Bar */}
      {activeSlip && (
        <div className="space-y-3">
          {/* Key Metrics Bar */}
          <div className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar flex-nowrap bg-theme-card border border-theme p-2.5 rounded-2xl shadow-xs">
            <div className="flex items-center gap-1.5 text-xs flex-nowrap shrink-0 overflow-x-auto no-scrollbar">
              <span className="bg-theme-primary text-theme-primary-text px-2.5 py-1 rounded-full font-mono tabular-nums font-black text-xs whitespace-nowrap shrink-0 shadow-xs">
                {activeSlip.legs.length} Selections
              </span>
              <span className="bg-theme-subtle px-2.5 py-1 rounded-full font-mono tabular-nums font-bold text-theme-main whitespace-nowrap shrink-0">
                {(activeSlip.combinedProb * 100).toFixed(1)}% Combined Prob
              </span>
              {risk && (
                <span className={`px-2.5 py-1 rounded-full font-bold text-xs ${risk.badgeBg} ${risk.textColor} whitespace-nowrap shrink-0 font-mono tabular-nums`}>
                  {risk.label}
                </span>
              )}
            </div>

            {/* Copy Slip Button */}
            <button
              type="button"
              onClick={() => handleCopySlip(activeSlip, activeSlip.id)}
              className="px-3.5 py-1.5 min-h-[35px] rounded-full text-xs font-black flex items-center gap-1 transition-all cursor-pointer shrink-0 bg-theme-primary text-theme-primary-text hover:bg-theme-primary-hover shadow-xs whitespace-nowrap active:scale-95"
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
            </button>
          </div>

          {/* Legs List matching App Design Token Cards */}
          <div className="space-y-3">
            {activeSlip.legs.map((leg, index) => {
              const matchedFixture = fixtures.find((f) => f.id === leg.fixtureId);
              const pred = matchedFixture?.prediction;
              const homeProb = pred?.homeWinProb !== undefined ? Math.round(pred.homeWinProb * 100) : 45;
              const drawProb = pred?.drawProb !== undefined ? Math.round(pred.drawProb * 100) : 28;
              const awayProb = pred?.awayWinProb !== undefined ? Math.round(pred.awayWinProb * 100) : 27;

              return (
                <div
                  key={`${leg.fixtureId}-${leg.marketKey}`}
                  className="bg-theme-card-elevated rounded-2xl p-4 transition-all hover:bg-theme-subtle flex flex-col justify-between group shadow-xs space-y-3 border border-theme"
                >
                  <div>
                    {/* Top bar: Leg number, League, Time / Date */}
                    <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-nowrap overflow-hidden">
                        <span className="w-5 h-5 rounded-lg bg-theme-primary text-theme-primary-text font-mono tabular-nums text-xs font-black flex items-center justify-center shrink-0 shadow-xs">
                          {index + 1}
                        </span>
                        <span
                          className="text-xs font-bold px-2.5 py-1 rounded-xl bg-theme-subtle text-theme-main truncate whitespace-nowrap max-w-[180px] shadow-xs"
                          title={matchedFixture?.stage || matchedFixture?.leagueName || leg.league}
                        >
                          {matchedFixture?.stage || matchedFixture?.leagueName || leg.league}
                        </span>
                        <span className="text-xs text-theme-sub font-mono tabular-nums whitespace-nowrap shrink-0 font-medium">
                          {matchedFixture ? formatLocalKickoffTime(matchedFixture) : (leg.fixtureDate === getRelativeDateStr(0) ? 'Today' : leg.fixtureDate === getRelativeDateStr(1) ? 'Tomorrow' : leg.fixtureDate)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-theme-subtle text-theme-sub whitespace-nowrap shadow-xs font-mono tabular-nums">
                          {leg.fixtureDate === getRelativeDateStr(0) ? 'Today' : leg.fixtureDate === getRelativeDateStr(1) ? 'Tomorrow' : leg.fixtureDate}
                        </span>
                      </div>
                    </div>

                    {/* Teams & Expected Goals Display */}
                    <div className="grid grid-cols-12 items-center gap-2 my-2">
                      {/* Home Team */}
                      <div className="col-span-5 flex flex-col min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-nowrap">
                          {matchedFixture?.homeBadge && (
                            <img
                              src={matchedFixture.homeBadge}
                              alt=""
                              className="w-4 h-4 object-contain shrink-0 rounded-full"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          )}
                          <span
                            onClick={() => matchedFixture && onSelectDetail && onSelectDetail(matchedFixture)}
                            className={`text-xs sm:text-sm font-bold text-theme-main truncate whitespace-nowrap ${matchedFixture ? 'cursor-pointer hover:underline' : ''}`}
                            title={leg.homeTeam}
                          >
                            {leg.homeTeam}
                          </span>
                          {pred?.homeWinProb !== undefined && (
                            <span className="font-mono tabular-nums text-xs font-black px-2 py-0.5 rounded-lg bg-theme-subtle text-theme-primary shrink-0 whitespace-nowrap shadow-xs">
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

                      {/* VS Divider */}
                      <div className="col-span-2 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] font-black text-theme-sub uppercase tracking-wider whitespace-nowrap">VS</span>
                        {matchedFixture && onSelectDetail && (
                          <button
                            onClick={() => onSelectDetail(matchedFixture)}
                            className="mt-0.5 text-xs text-theme-primary font-bold hover:underline flex items-center gap-0.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            title="View Poisson probability matrix"
                          >
                            <Info className="w-3.5 h-3.5" />
                            <span>Grid</span>
                          </button>
                        )}
                      </div>

                      {/* Away Team */}
                      <div className="col-span-5 flex flex-col items-end text-right min-w-0">
                        <div className="flex items-center justify-end gap-2 min-w-0 flex-nowrap w-full">
                          {pred?.awayWinProb !== undefined && (
                            <span className="font-mono tabular-nums text-xs font-black px-2 py-0.5 rounded-lg bg-theme-subtle text-theme-primary shrink-0 whitespace-nowrap shadow-xs">
                              {awayProb}%
                            </span>
                          )}
                          <span
                            onClick={() => matchedFixture && onSelectDetail && onSelectDetail(matchedFixture)}
                            className={`text-xs sm:text-sm font-bold text-theme-main truncate whitespace-nowrap ${matchedFixture ? 'cursor-pointer hover:underline' : ''}`}
                            title={leg.awayTeam}
                          >
                            {leg.awayTeam}
                          </span>
                          {matchedFixture?.awayBadge && (
                            <img
                              src={matchedFixture.awayBadge}
                              alt=""
                              className="w-4 h-4 object-contain shrink-0 rounded-full"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          )}
                        </div>
                        {pred && (
                          <span className="text-xs text-theme-sub font-mono tabular-nums whitespace-nowrap shrink-0 mt-1 font-medium">
                            xG: <strong className="text-theme-main font-bold">{pred.awayXG}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Pick Selection Badge */}
                    <div className="mt-3 p-3 rounded-xl bg-theme-subtle flex items-center justify-between text-xs shadow-xs">
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-theme-sub font-medium">Selection:</span>
                        <span className="font-bold text-theme-primary">{leg.selection}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono tabular-nums shrink-0">
                        <span className="font-bold text-theme-primary">
                          {(leg.probability * 100).toFixed(0)}% AI Confidence
                        </span>
                      </div>
                    </div>
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
