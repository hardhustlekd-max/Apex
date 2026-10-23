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
      badgeBg: 'bg-[#dafbe1] dark:bg-[#23863626] border border-[#4ac26b66]',
      textColor: 'text-[#1a7f37] dark:text-[#3fb950]',
    };
  }

  if (prob >= 0.35 || odds <= 5.5) {
    return {
      level: 'MEDIUM',
      label: 'Moderate',
      badgeBg: 'bg-[#fff8c5] dark:bg-[#bb800926] border border-[#eac54f80]',
      textColor: 'text-[#9a6700] dark:text-[#d29922]',
    };
  }

  if (prob >= 0.15 || odds <= 15.0) {
    return {
      level: 'HIGH',
      label: 'High Risk',
      badgeBg: 'bg-[#fff1e5] dark:bg-[#bd561d26] border border-[#fd8c7366]',
      textColor: 'text-[#bc4c00] dark:text-[#ff8182]',
    };
  }

  return {
    level: 'EXTREME',
    label: 'Longshot',
    badgeBg: 'bg-[#ffebe9] dark:bg-[#f8514926] border border-[#ff818266]',
    textColor: 'text-[#cf222e] dark:text-[#f85149]',
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
      <div className="p-10 flex-1 min-h-[320px] flex flex-col items-center justify-center text-center bg-white dark:bg-[#0B0F17] rounded-3xl border border-slate-100 dark:border-slate-800 space-y-3 font-sans shadow-xs">
        <Loader2 className="w-8 h-8 text-slate-900 dark:text-slate-100 animate-spin shrink-0 mx-auto" />
        <h3 className="text-xs font-bold text-slate-900 dark:text-white">
          Generating Poisson Accumulators...
        </h3>
      </div>
    );
  }

  if (!fixtures || fixtures.length === 0) {
    return (
      <div className="p-10 flex-1 min-h-[320px] flex flex-col items-center justify-center text-center bg-white dark:bg-[#0B0F17] rounded-3xl border border-slate-100 dark:border-slate-800 space-y-2 font-sans shadow-xs">
        <Layers className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto" />
        <h3 className="text-xs font-bold text-slate-900 dark:text-white">
          No Fixtures Available
        </h3>
      </div>
    );
  }

  const risk = activeSlip ? calculateRiskProfile(activeSlip) : null;
  const potentialPayout = activeSlip ? (stakeBenchmark * activeSlip.combinedOdds).toFixed(2) : '0.00';

  return (
    <div className="bg-white dark:bg-[#0B0F17] rounded-3xl p-5 space-y-4 font-sans flex-1 flex flex-col border border-slate-100 dark:border-slate-800 shadow-xs">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
            Poisson Accumulators
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Algorithmic multi-leg parlays ranked by EV</p>
        </div>

        {/* Date Filter Dropdown */}
        <div className="relative">
          <select
            id="prebuilt-date-scope-dropdown"
            value={dateScope}
            onChange={(e) => setDateScope(e.target.value as any)}
            className="bg-slate-50 dark:bg-slate-900/80 text-slate-900 dark:text-white rounded-xl px-4 py-2 text-xs font-bold appearance-none cursor-pointer pr-8 focus:outline-none border border-slate-200 dark:border-slate-800 shadow-xs"
          >
            <option value="TODAY">Today's Matches</option>
            <option value="TOMORROW">Tomorrow</option>
            <option value="NEXT_3_DAYS">Next 3 Days</option>
            <option value="ALL">All Available Dates</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
        </div>
      </div>

      {/* Category Pills Switcher */}
      <div className="bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl flex items-center gap-1 overflow-x-auto no-scrollbar border border-slate-200 dark:border-slate-800 shadow-inner">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          const slip = prebuiltSlips[cat.id];

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex-1 min-w-[80px] px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-2 ${
                isSelected
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>{cat.title}</span>
              {slip && (
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-lg ${
                  isSelected ? 'bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'
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
        <div className="space-y-3">
          {/* Key Metrics Bar */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar flex-nowrap bg-[#f6f8fa] dark:bg-[#21262d] p-2.5 rounded-md border border-[#d0d7de] dark:border-[#30363d]">
            <div className="flex items-center gap-2 text-xs flex-nowrap shrink-0 overflow-x-auto no-scrollbar">
              <span className="bg-white dark:bg-[#161b22] px-2.5 py-1 rounded-md border border-[#d0d7de] dark:border-[#30363d] font-mono font-bold text-[#1f2328] dark:text-[#f0f6fc] whitespace-nowrap shrink-0">
                {activeSlip.combinedOdds.toFixed(2)}x Odds
              </span>
              <span className="bg-white dark:bg-[#161b22] px-2.5 py-1 rounded-md border border-[#d0d7de] dark:border-[#30363d] font-mono font-bold text-[#1f2328] dark:text-[#f0f6fc] whitespace-nowrap shrink-0">
                {(activeSlip.combinedProb * 100).toFixed(0)}% Prob
              </span>
              {risk && (
                <span className={`px-2.5 py-1 rounded-md font-semibold text-xs ${risk.badgeBg} ${risk.textColor} whitespace-nowrap shrink-0`}>
                  {risk.label}
                </span>
              )}
              <span className="bg-white dark:bg-[#161b22] px-2.5 py-1 rounded-md border border-[#d0d7de] dark:border-[#30363d] font-mono font-semibold text-[#1f2328] dark:text-[#f0f6fc] whitespace-nowrap shrink-0">
                Est. Return: £{potentialPayout}
              </span>
            </div>

            {/* Copy Slip Button */}
            <button
              type="button"
              onClick={() => handleCopySlip(activeSlip, activeSlip.id)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 bg-[#1f883d] hover:bg-[#1a7f37] text-white border border-[#1b1f2426] shadow-[0_1px_0_rgba(27,31,36,0.1)] whitespace-nowrap"
            >
              {copiedId === activeSlip.id ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Slip</span>
                </>
              )}
            </button>
          </div>

          {/* Legs List matching Primer Box List */}
          <div className="space-y-2">
            {activeSlip.legs.map((leg, index) => {
              const matchedFixture = fixtures.find((f) => f.id === leg.fixtureId);
              const pred = matchedFixture?.prediction;
              const homeProb = pred?.homeWinProb !== undefined ? Math.round(pred.homeWinProb * 100) : 45;
              const drawProb = pred?.drawProb !== undefined ? Math.round(pred.drawProb * 100) : 28;
              const awayProb = pred?.awayWinProb !== undefined ? Math.round(pred.awayWinProb * 100) : 27;

              return (
                <div
                  key={`${leg.fixtureId}-${leg.marketKey}`}
                  className="bg-white dark:bg-[#161b22] text-[#1f2328] dark:text-[#f0f6fc] rounded-md p-3 transition-colors border border-[#d0d7de] dark:border-[#30363d] hover:border-[#0969da] flex flex-col justify-between group shadow-[0_1px_0_rgba(27,31,36,0.04)]"
                >
                  <div>
                    {/* Top bar: Leg number, League, Time / Date */}
                    <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-nowrap overflow-hidden">
                        <span className="w-5 h-5 rounded-md bg-[#24292f] dark:bg-[#f0f6fc] text-white dark:text-[#1f2328] font-mono text-xs font-bold flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#f6f8fa] dark:bg-[#21262d] text-[#656d76] dark:text-[#8d96a0] border border-[#d0d7de] dark:border-[#30363d] truncate whitespace-nowrap max-w-[180px]"
                          title={matchedFixture?.stage || matchedFixture?.leagueName || leg.league}
                        >
                          {matchedFixture?.stage || matchedFixture?.leagueName || leg.league}
                        </span>
                        <span className="text-xs text-[#656d76] dark:text-[#8d96a0] font-mono whitespace-nowrap shrink-0">
                          {matchedFixture?.kickOffTime || (leg.fixtureDate === getRelativeDateStr(0) ? 'Today' : leg.fixtureDate === getRelativeDateStr(1) ? 'Tomorrow' : leg.fixtureDate)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#f6f8fa] dark:bg-[#21262d] text-[#656d76] dark:text-[#8d96a0] border border-[#d0d7de] dark:border-[#30363d] whitespace-nowrap">
                          {leg.fixtureDate === getRelativeDateStr(0) ? 'Today' : leg.fixtureDate === getRelativeDateStr(1) ? 'Tomorrow' : leg.fixtureDate}
                        </span>
                      </div>
                    </div>

                    {/* Teams & Expected Goals Display */}
                    <div className="grid grid-cols-12 items-center gap-2 my-2">
                      {/* Home Team */}
                      <div className="col-span-5 flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 flex-nowrap">
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
                            className={`text-sm font-semibold text-[#1f2328] dark:text-[#f0f6fc] truncate whitespace-nowrap ${matchedFixture ? 'cursor-pointer hover:underline' : ''}`}
                            title={leg.homeTeam}
                          >
                            {leg.homeTeam}
                          </span>
                          {pred?.homeWinProb !== undefined && (
                            <span className="font-mono text-xs font-semibold px-1.5 py-0.2 rounded bg-[#f6f8fa] dark:bg-[#21262d] text-[#1f2328] dark:text-[#f0f6fc] border border-[#d0d7de] dark:border-[#30363d] shrink-0 whitespace-nowrap">
                              {homeProb}%
                            </span>
                          )}
                        </div>
                        {pred && (
                          <span className="text-xs text-[#656d76] dark:text-[#8d96a0] font-mono whitespace-nowrap shrink-0 mt-0.5">
                            xG: <strong className="text-[#1f2328] dark:text-[#f0f6fc]">{pred.homeXG}</strong>
                          </span>
                        )}
                      </div>

                      {/* VS Divider */}
                      <div className="col-span-2 flex flex-col items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-[#8c959f] dark:text-[#6e7681] uppercase tracking-wider whitespace-nowrap">VS</span>
                        {matchedFixture && onSelectDetail && (
                          <button
                            onClick={() => onSelectDetail(matchedFixture)}
                            className="mt-0.5 text-xs text-[#0969da] dark:text-[#2f81f7] font-semibold hover:underline flex items-center gap-0.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            title="View Poisson probability matrix"
                          >
                            <Info className="w-3 h-3" />
                            <span>Grid</span>
                          </button>
                        )}
                      </div>

                      {/* Away Team */}
                      <div className="col-span-5 flex flex-col items-end text-right min-w-0">
                        <div className="flex items-center justify-end gap-1.5 min-w-0 flex-nowrap w-full">
                          {pred?.awayWinProb !== undefined && (
                            <span className="font-mono text-xs font-semibold px-1.5 py-0.2 rounded bg-[#f6f8fa] dark:bg-[#21262d] text-[#1f2328] dark:text-[#f0f6fc] border border-[#d0d7de] dark:border-[#30363d] shrink-0 whitespace-nowrap">
                              {awayProb}%
                            </span>
                          )}
                          <span
                            onClick={() => matchedFixture && onSelectDetail && onSelectDetail(matchedFixture)}
                            className={`text-sm font-semibold text-[#1f2328] dark:text-[#f0f6fc] truncate whitespace-nowrap ${matchedFixture ? 'cursor-pointer hover:underline' : ''}`}
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
                          <span className="text-xs text-[#656d76] dark:text-[#8d96a0] font-mono whitespace-nowrap shrink-0 mt-0.5">
                            xG: <strong className="text-[#1f2328] dark:text-[#f0f6fc]">{pred.awayXG}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Pick Badge Bar */}
                    <div className="mt-2.5 p-2 rounded-md bg-[#f6f8fa] dark:bg-[#21262d] border border-[#d0d7de] dark:border-[#30363d] flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-[#656d76] dark:text-[#8d96a0] font-medium">Selected Leg:</span>
                        <span className="font-bold text-[#1f2328] dark:text-[#f0f6fc]">{leg.selection}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono shrink-0">
                        <span className="font-bold text-[#1a7f37] dark:text-[#3fb950]">
                          {(leg.probability * 100).toFixed(0)}%
                        </span>
                        <span className="font-bold px-1.5 py-0.2 rounded bg-white dark:bg-[#161b22] border border-[#d0d7de] dark:border-[#30363d] text-[#1f2328] dark:text-[#f0f6fc]">
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
