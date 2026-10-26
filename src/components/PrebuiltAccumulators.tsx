import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Layers,
  Loader2,
  ChevronDown,
  Info,
} from 'lucide-react';
import { Fixture, AccumulatorSlip, EngineSettings } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import { getRelativeDateStr } from '../core/dateUtils.js';
import { isMatchStarted } from '../core/accumulator.js';

interface PrebuiltAccumulatorsProps {
  fixtures: Fixture[];
  settings: EngineSettings | null;
  onSelectDetail?: (fixture: Fixture) => void;
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
  const odds = slip.combinedOdds;

  if (prob >= 0.60 || odds <= 2.5) {
    return {
      level: 'LOW',
      label: 'Low Risk',
      badgeBg: 'bg-emerald-500/10',
      textColor: 'text-emerald-700 dark:text-emerald-400',
    };
  }

  if (prob >= 0.35 || odds <= 5.5) {
    return {
      level: 'MEDIUM',
      label: 'Moderate',
      badgeBg: 'bg-amber-500/10',
      textColor: 'text-amber-700 dark:text-amber-400',
    };
  }

  if (prob >= 0.15 || odds <= 15.0) {
    return {
      level: 'HIGH',
      label: 'High Risk',
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
      id: 'VALUE_HUNTER' as const,
      title: 'Value',
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
      <div className="p-10 flex-1 min-h-[320px] flex flex-col items-center justify-center text-center bg-white dark:bg-[#121216] rounded-3xl border border-slate-100 dark:border-[#27272A] space-y-3 font-sans shadow-xs">
        <Loader2 className="w-8 h-8 text-[#CCFF00] animate-spin shrink-0 mx-auto" />
        <h3 className="text-xs font-bold text-slate-900 dark:text-white">
          Generating Poisson Accumulators...
        </h3>
      </div>
    );
  }

  if (!fixtures || fixtures.length === 0) {
    return (
      <div className="p-10 flex-1 min-h-[320px] flex flex-col items-center justify-center text-center bg-white dark:bg-[#121216] rounded-3xl border border-slate-100 dark:border-[#27272A] space-y-2 font-sans shadow-xs">
        <Layers className="w-8 h-8 text-slate-400 dark:text-neutral-600 mx-auto" />
        <h3 className="text-xs font-bold text-slate-900 dark:text-white">
          No Fixtures Available
        </h3>
      </div>
    );
  }

  const risk = activeSlip ? calculateRiskProfile(activeSlip) : null;
  const potentialPayout = activeSlip ? (stakeBenchmark * activeSlip.combinedOdds).toFixed(2) : '0.00';

  return (
    <div className="bg-white dark:bg-[#121216] rounded-3xl p-5 space-y-4 font-sans flex-1 flex flex-col border border-slate-200/80 dark:border-[#27272A] shadow-xs transition-all">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#27272A]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
              Poisson Accumulators
            </h2>
            <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              +EV DB Predictions
            </span>
          </div>
          <p className="text-xs text-slate-400 dark:text-neutral-400 font-medium">Multi-leg parlays compiled from high-value predictions in DB</p>
        </div>

        {/* Date Filter Dropdown */}
        <div className="relative">
          <select
            id="prebuilt-date-scope-dropdown"
            value={dateScope}
            onChange={(e) => setDateScope(e.target.value as any)}
            className="bg-slate-100/80 dark:bg-[#18181D] text-slate-900 dark:text-white rounded-2xl px-4 py-2 text-xs font-bold appearance-none cursor-pointer pr-8 focus:outline-none shadow-xs border border-transparent dark:border-[#27272A]"
          >
            <option value="TODAY">Today's Matches</option>
            <option value="TOMORROW">Tomorrow</option>
            <option value="NEXT_3_DAYS">Next 3 Days</option>
            <option value="ALL">All Available Dates</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
        </div>
      </div>

      {/* Category Pills Switcher */}
      <div className="bg-slate-100/80 dark:bg-[#09090B] p-1.5 rounded-2xl flex items-center gap-1.5 overflow-x-auto no-scrollbar shadow-xs border border-transparent dark:border-[#27272A]">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          const slip = prebuiltSlips[cat.id];

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex-1 min-w-[100px] min-h-[44px] px-4 py-2.5 rounded-full text-xs font-extrabold transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-2 active:scale-95 ${
                isSelected
                  ? 'bg-[#121216] dark:bg-[#CCFF00] text-white dark:text-slate-950 font-black shadow-xs border border-slate-700 dark:border-transparent'
                  : 'text-slate-600 dark:text-neutral-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              <span>{cat.title}</span>
              {slip && (
                <span className={`text-[10px] font-mono tabular-nums font-black px-2 py-0.5 rounded-full ${
                  isSelected ? 'bg-[#CCFF00] text-slate-950 dark:bg-slate-950 dark:text-[#CCFF00]' : 'bg-slate-100 dark:bg-[#18181D] text-slate-700 dark:text-neutral-300'
                }`}>
                  {slip.combinedOdds.toFixed(1)}x
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Slip Details & Stats Bar */}
      {activeSlip && (
        <div className="space-y-4">
          {/* Key Metrics Bar */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar flex-nowrap bg-white dark:bg-[#18181D] p-3 rounded-3xl border border-slate-200/80 dark:border-[#27272A] shadow-xs">
            <div className="flex items-center gap-2 text-xs flex-nowrap shrink-0 overflow-x-auto no-scrollbar">
              <span className="bg-[#121216] text-white dark:bg-[#CCFF00] dark:text-slate-950 px-3.5 py-1.5 rounded-full font-mono tabular-nums font-black text-xs whitespace-nowrap shrink-0 shadow-xs">
                {activeSlip.combinedOdds.toFixed(2)}x Odds
              </span>
              <span className="bg-slate-100 dark:bg-[#09090B] px-3.5 py-1.5 rounded-full font-mono tabular-nums font-black text-slate-900 dark:text-white whitespace-nowrap shrink-0 border border-slate-200/60 dark:border-[#27272A]">
                {(activeSlip.combinedProb * 100).toFixed(0)}% Prob
              </span>
              {risk && (
                <span className={`px-3.5 py-1.5 rounded-full font-black text-xs ${risk.badgeBg} ${risk.textColor} whitespace-nowrap shrink-0 font-mono tabular-nums`}>
                  {risk.label}
                </span>
              )}
              <span className="bg-slate-100 dark:bg-[#09090B] px-3.5 py-1.5 rounded-full font-mono tabular-nums font-extrabold text-slate-900 dark:text-white whitespace-nowrap shrink-0 border border-slate-200/60 dark:border-[#27272A]">
                Est. Return: £{potentialPayout}
              </span>
            </div>

            {/* Copy Slip Button */}
            <button
              type="button"
              onClick={() => handleCopySlip(activeSlip, activeSlip.id)}
              className="px-4 py-2 min-h-[44px] rounded-full text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shrink-0 bg-[#CCFF00] hover:bg-[#b8e600] text-slate-950 shadow-xs whitespace-nowrap active:scale-95"
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
                  className="bg-slate-50 dark:bg-[#18181D] rounded-2xl p-4 transition-all hover:bg-slate-100/80 dark:hover:bg-[#18181D]/80 border border-slate-200/60 dark:border-[#27272A] flex flex-col justify-between group shadow-xs space-y-3"
                >
                  <div>
                    {/* Top bar: Leg number, League, Time / Date */}
                    <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-nowrap overflow-hidden">
                        <span className="w-5 h-5 rounded-lg bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 font-mono tabular-nums text-xs font-black flex items-center justify-center shrink-0 shadow-xs">
                          {index + 1}
                        </span>
                        <span
                          className="text-xs font-bold px-2.5 py-1 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200/60 dark:border-[#27272A] text-slate-700 dark:text-neutral-300 truncate whitespace-nowrap max-w-[180px] shadow-xs"
                          title={matchedFixture?.stage || matchedFixture?.leagueName || leg.league}
                        >
                          {matchedFixture?.stage || matchedFixture?.leagueName || leg.league}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-neutral-400 font-mono tabular-nums whitespace-nowrap shrink-0 font-medium">
                          {matchedFixture?.kickOffTime || (leg.fixtureDate === getRelativeDateStr(0) ? 'Today' : leg.fixtureDate === getRelativeDateStr(1) ? 'Tomorrow' : leg.fixtureDate)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200/60 dark:border-[#27272A] text-slate-500 dark:text-neutral-400 whitespace-nowrap shadow-xs font-mono tabular-nums">
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
                            className={`text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate whitespace-nowrap ${matchedFixture ? 'cursor-pointer hover:underline' : ''}`}
                            title={leg.homeTeam}
                          >
                            {leg.homeTeam}
                          </span>
                          {pred?.homeWinProb !== undefined && (
                            <span className="font-mono tabular-nums text-xs font-black px-2 py-0.5 rounded-lg bg-white dark:bg-[#09090B] border border-slate-200/60 dark:border-[#27272A] text-slate-900 dark:text-[#CCFF00] shrink-0 whitespace-nowrap shadow-xs">
                              {homeProb}%
                            </span>
                          )}
                        </div>
                        {pred && (
                          <span className="text-xs text-slate-400 dark:text-neutral-400 font-mono tabular-nums whitespace-nowrap shrink-0 mt-1 font-medium">
                            xG: <strong className="text-slate-900 dark:text-white font-bold">{pred.homeXG}</strong>
                          </span>
                        )}
                      </div>

                      {/* VS Divider */}
                      <div className="col-span-2 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] font-black text-slate-400 dark:text-neutral-500 uppercase tracking-wider whitespace-nowrap">VS</span>
                        {matchedFixture && onSelectDetail && (
                          <button
                            onClick={() => onSelectDetail(matchedFixture)}
                            className="mt-0.5 text-xs text-[#CCFF00] font-bold hover:underline flex items-center gap-0.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
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
                            <span className="font-mono tabular-nums text-xs font-black px-2 py-0.5 rounded-lg bg-white dark:bg-[#09090B] border border-slate-200/60 dark:border-[#27272A] text-slate-900 dark:text-cyan-400 shrink-0 whitespace-nowrap shadow-xs">
                              {awayProb}%
                            </span>
                          )}
                          <span
                            onClick={() => matchedFixture && onSelectDetail && onSelectDetail(matchedFixture)}
                            className={`text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate whitespace-nowrap ${matchedFixture ? 'cursor-pointer hover:underline' : ''}`}
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
                          <span className="text-xs text-slate-400 dark:text-neutral-400 font-mono tabular-nums whitespace-nowrap shrink-0 mt-1 font-medium">
                            xG: <strong className="text-slate-900 dark:text-white font-bold">{pred.awayXG}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Pick Selection Badge */}
                    <div className="mt-3 p-3 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200/60 dark:border-[#27272A] flex items-center justify-between text-xs shadow-xs">
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-slate-400 dark:text-neutral-400 font-medium">Selected Leg:</span>
                        <span className="font-bold text-slate-900 dark:text-[#CCFF00]">{leg.selection}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono tabular-nums shrink-0">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {(leg.probability * 100).toFixed(0)}%
                        </span>
                        <span className="font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-[#18181D] text-slate-900 dark:text-white border border-slate-200/60 dark:border-[#27272A]">
                          {leg.odds.toFixed(2)}
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
