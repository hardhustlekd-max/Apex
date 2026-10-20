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
      badgeBg: 'bg-slate-100',
      textColor: 'text-slate-700',
    };
  }

  if (prob >= 0.35 || odds <= 5.5) {
    return {
      level: 'MEDIUM',
      label: 'Moderate',
      badgeBg: 'bg-amber-100',
      textColor: 'text-amber-700',
    };
  }

  if (prob >= 0.15 || odds <= 15.0) {
    return {
      level: 'HIGH',
      label: 'High Risk',
      badgeBg: 'bg-orange-100',
      textColor: 'text-orange-700',
    };
  }

  return {
    level: 'EXTREME',
    label: 'Longshot',
    badgeBg: 'bg-rose-100',
    textColor: 'text-rose-700',
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
      <div className="p-8 flex-1 min-h-[360px] flex flex-col items-center justify-center text-center bg-white rounded-2xl shadow-xs space-y-3 font-sans">
        <Loader2 className="w-7 h-7 text-slate-500 animate-spin shrink-0 mx-auto" />
        <h3 className="text-xs font-bold text-slate-900">
          Loading Accumulators...
        </h3>
      </div>
    );
  }

  if (!fixtures || fixtures.length === 0) {
    return (
      <div className="p-8 flex-1 min-h-[360px] flex flex-col items-center justify-center text-center bg-white rounded-2xl shadow-xs space-y-2 font-sans">
        <Layers className="w-7 h-7 text-slate-400 mx-auto" />
        <h3 className="text-xs font-bold text-slate-900">
          No Fixtures Available
        </h3>
      </div>
    );
  }

  const risk = activeSlip ? calculateRiskProfile(activeSlip) : null;
  const potentialPayout = activeSlip ? (stakeBenchmark * activeSlip.combinedOdds).toFixed(2) : '0.00';

  return (
    <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-xs space-y-3 font-sans flex-1 flex flex-col border border-slate-200">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-100">
        <div>
          <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
            Accumulator Slips
          </h2>
        </div>

        {/* Date Filter Dropdown */}
        <div className="relative">
          <select
            id="prebuilt-date-scope-dropdown"
            value={dateScope}
            onChange={(e) => setDateScope(e.target.value as any)}
            className="bg-slate-50 text-slate-900 rounded-xl px-2.5 py-1.5 text-xs font-bold appearance-none cursor-pointer pr-7 focus:outline-none shadow-xs border border-slate-200"
          >
            <option value="TODAY">Today</option>
            <option value="TOMORROW">Tomorrow</option>
            <option value="NEXT_3_DAYS">Next 3 Days</option>
            <option value="ALL">All Dates</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
        </div>
      </div>

      {/* Category Pills Switcher */}
      <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 overflow-x-auto no-scrollbar shadow-xs">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          const slip = prebuiltSlips[cat.id];

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex-1 min-w-[80px] px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
                isSelected
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>{cat.title}</span>
              {slip && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                  isSelected ? 'bg-slate-100 text-slate-900' : 'text-slate-500'
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
          {/* Key Metrics Chips */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar flex-nowrap bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 text-xs flex-nowrap shrink-0 overflow-x-auto no-scrollbar">
              <span className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs font-mono font-bold text-slate-900 whitespace-nowrap shrink-0">
                {activeSlip.combinedOdds.toFixed(2)}x Odds
              </span>
              <span className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs font-mono font-bold text-slate-900 whitespace-nowrap shrink-0">
                {(activeSlip.combinedProb * 100).toFixed(0)}% Prob
              </span>
              {risk && (
                <span className={`px-3 py-1.5 rounded-lg font-bold text-xs border border-slate-200 shadow-2xs ${risk.badgeBg} ${risk.textColor} whitespace-nowrap shrink-0`}>
                  {risk.label}
                </span>
              )}
              <span className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs font-mono font-bold text-slate-900 whitespace-nowrap shrink-0">
                Payout £{potentialPayout}
              </span>
            </div>

            {/* Copy Button */}
            <button
              type="button"
              onClick={() => handleCopySlip(activeSlip, activeSlip.id)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs shrink-0 bg-black hover:bg-zinc-800 text-white whitespace-nowrap"
            >
              {copiedId === activeSlip.id ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span className="whitespace-nowrap">Copied Slip</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="whitespace-nowrap">Copy Slip</span>
                </>
              )}
            </button>
          </div>

          {/* Legs List matching FixtureCard prediction UI */}
          <div className="space-y-2.5">
            {activeSlip.legs.map((leg, index) => {
              const matchedFixture = fixtures.find((f) => f.id === leg.fixtureId);
              const pred = matchedFixture?.prediction;
              const homeProb = pred?.homeWinProb !== undefined ? Math.round(pred.homeWinProb * 100) : 45;
              const drawProb = pred?.drawProb !== undefined ? Math.round(pred.drawProb * 100) : 28;
              const awayProb = pred?.awayWinProb !== undefined ? Math.round(pred.awayWinProb * 100) : 27;

              return (
                <div
                  key={`${leg.fixtureId}-${leg.marketKey}`}
                  className="bg-white text-slate-900 rounded-2xl p-3.5 transition-all shadow-xs hover:shadow-md border border-slate-200 flex flex-col justify-between group"
                >
                  <div>
                    {/* Top bar: Leg number, League, Time / Date */}
                    <div className="flex items-center justify-between gap-2 mb-2.5 min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-nowrap overflow-hidden">
                        <span className="w-5 h-5 rounded-lg bg-black text-white font-mono text-[11px] font-bold flex items-center justify-center shrink-0 shadow-2xs">
                          {index + 1}
                        </span>
                        <span className="text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 shadow-2xs truncate whitespace-nowrap max-w-[150px] sm:max-w-[200px]" title={matchedFixture?.stage || matchedFixture?.leagueName || leg.league}>
                          {matchedFixture?.stage || matchedFixture?.leagueName || leg.league}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono whitespace-nowrap shrink-0">
                          {matchedFixture?.kickOffTime || (leg.fixtureDate === getRelativeDateStr(0) ? 'Today' : leg.fixtureDate === getRelativeDateStr(1) ? 'Tomorrow' : leg.fixtureDate)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-slate-50 text-slate-500 whitespace-nowrap">
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
                            className={`text-sm font-bold text-black tracking-tight truncate whitespace-nowrap ${matchedFixture ? 'cursor-pointer hover:underline' : ''}`}
                            title={leg.homeTeam}
                          >
                            {leg.homeTeam}
                          </span>
                          {pred?.homeWinProb !== undefined && (
                            <span className="font-mono text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-black shadow-xs shrink-0 whitespace-nowrap" title={`Home Win: ${homeProb}%`}>
                              {homeProb}%
                            </span>
                          )}
                        </div>
                        {pred && (
                          <span className="text-[11px] text-slate-500 font-mono whitespace-nowrap shrink-0 mt-0.5">
                            xG: <strong className="text-black">{pred.homeXG}</strong>
                          </span>
                        )}
                      </div>

                      {/* VS Divider or Match Score */}
                      <div className="col-span-2 flex flex-col items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">VS</span>
                        {matchedFixture && onSelectDetail && (
                          <button
                            onClick={() => onSelectDetail(matchedFixture)}
                            className="mt-0.5 text-[10px] text-black font-semibold hover:underline flex items-center gap-0.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
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
                            <span className="font-mono text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-black shadow-xs shrink-0 whitespace-nowrap" title={`Away Win: ${awayProb}%`}>
                              {awayProb}%
                            </span>
                          )}
                          <span
                            onClick={() => matchedFixture && onSelectDetail && onSelectDetail(matchedFixture)}
                            className={`text-sm font-bold text-black tracking-tight truncate whitespace-nowrap ${matchedFixture ? 'cursor-pointer hover:underline' : ''}`}
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
                          <span className="text-[11px] text-slate-500 font-mono whitespace-nowrap shrink-0 mt-0.5">
                            xG: <strong className="text-black">{pred.awayXG}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Probability Bar Indicator */}
                    {pred && (
                      <div className="my-2 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                          <span className="text-black font-bold">Home: {homeProb}%</span>
                          <span className="text-slate-700 font-bold">Draw: {drawProb}%</span>
                          <span className="text-black font-bold">Away: {awayProb}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden flex">
                          <div
                            className="bg-black h-full transition-all"
                            style={{ width: `${homeProb}%` }}
                            title={`Home Win Probability: ${homeProb}%`}
                          />
                          <div
                            className="bg-slate-400 h-full transition-all"
                            style={{ width: `${drawProb}%` }}
                            title={`Draw Probability: ${drawProb}%`}
                          />
                          <div
                            className="bg-zinc-700 h-full transition-all"
                            style={{ width: `${awayProb}%` }}
                            title={`Away Win Probability: ${awayProb}%`}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer: Selection & Odds Badge */}
                  <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500 font-medium truncate">
                      Market: <strong className="text-slate-900">{leg.marketKey}</strong>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-bold text-xs text-black px-2.5 py-1 rounded-lg bg-slate-100 shadow-2xs">
                        {leg.selection}
                      </span>
                      <span className="font-mono font-bold text-xs text-white px-2.5 py-1 rounded-lg bg-black shadow-2xs">
                        @{leg.odds.toFixed(2)}
                      </span>
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
