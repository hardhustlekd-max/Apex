import React from 'react';
import { Info, ArrowRight } from 'lucide-react';
import { Fixture } from '../core/types.js';
import { formatProb, getAuthoritative1X2Pick } from '../core/formatters.js';

interface FixtureCardProps {
  fixture: Fixture;
  onSelectDetail: (fixture: Fixture) => void;
  isSelected?: boolean;
}

export const FixtureCard: React.FC<FixtureCardProps> = ({
  fixture,
  onSelectDetail,
  isSelected = false,
}) => {
  const pred = fixture.prediction;
  const pick = pred ? getAuthoritative1X2Pick(fixture) : null;
  const topPredictionLabel = pick
    ? `${pick.label} (${pick.probabilityFormatted})`
    : null;

  const isPositiveEv = pick && pick.probabilityPercent >= 55;

  return (
    <div
      id={`fixture-card-${fixture.id}`}
      onClick={() => onSelectDetail(fixture)}
      className={`rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md ${
        isSelected
          ? 'bg-slate-100/90 dark:bg-[#1E1E26]'
          : isPositiveEv
          ? 'bg-gradient-to-br from-white via-white to-slate-50 dark:from-[#121216] dark:via-[#121216] dark:to-[#18181D]'
          : 'bg-white dark:bg-[#121216]'
      }`}
    >
      <div>
        {/* Top bar: League, Time, Stage / Status */}
        <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-hidden text-slate-500 dark:text-neutral-400">
            <span className="font-extrabold text-slate-900 dark:text-white truncate max-w-[170px] text-sm">
              {fixture.stage || fixture.leagueName}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-neutral-700 shrink-0">·</span>
            <span className="text-xs sm:text-sm font-mono tabular-nums whitespace-nowrap shrink-0">
              {fixture.status === 'LIVE' ? 'Live' : fixture.status === 'FINISHED' ? 'FT' : `${fixture.matchDate} · ${fixture.kickOffTime}`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            {fixture.status === 'LIVE' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-rose-600 text-white dark:bg-[#CCFF00] dark:text-slate-950 font-mono tabular-nums shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-slate-950 animate-pulse" />
                LIVE
              </span>
            ) : isPositiveEv ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-slate-950 text-[#CCFF00] border border-[#CCFF00]/30 dark:bg-[#CCFF00] dark:text-slate-950 font-mono tracking-wide shadow-xs">
                VALUE PICK
              </span>
            ) : null}
          </div>
        </div>

        {/* Teams Display */}
        <div className="grid grid-cols-12 items-center gap-2 my-3">
          {/* Home Team */}
          <div className="col-span-5 flex flex-col min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-nowrap">
              {fixture.homeBadge ? (
                <img
                  src={fixture.homeBadge}
                  alt=""
                  className="w-5.5 h-5.5 object-contain shrink-0 rounded-full"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-5.5 h-5.5 rounded-full bg-slate-100 dark:bg-[#18181D] text-xs font-black flex items-center justify-center shrink-0">
                  {fixture.homeTeam.slice(0, 1)}
                </div>
              )}
              <span className="text-sm sm:text-base font-extrabold text-slate-950 dark:text-white truncate whitespace-nowrap" title={fixture.homeTeam}>
                {fixture.homeTeam}
              </span>
            </div>
          </div>

          {/* VS Divider or Match Score */}
          <div className="col-span-2 flex flex-col items-center justify-center shrink-0">
            {fixture.score && fixture.score.home !== undefined ? (
              <span className="text-sm sm:text-base font-mono tabular-nums font-black text-slate-950 dark:text-white whitespace-nowrap bg-slate-100 dark:bg-[#18181D] px-2.5 py-1 rounded-full">
                {fixture.score.home}:{fixture.score.away}
              </span>
            ) : (
              <span className="text-xs font-black text-slate-400 dark:text-neutral-500 uppercase tracking-wider whitespace-nowrap">VS</span>
            )}
          </div>

          {/* Away Team */}
          <div className="col-span-5 flex flex-col items-end text-right min-w-0">
            <div className="flex items-center justify-end gap-2 min-w-0 flex-nowrap w-full">
              <span className="text-sm sm:text-base font-extrabold text-slate-950 dark:text-white truncate whitespace-nowrap" title={fixture.awayTeam}>
                {fixture.awayTeam}
              </span>
              {fixture.awayBadge && (
                <img
                  src={fixture.awayBadge}
                  alt=""
                  className="w-5.5 h-5.5 object-contain shrink-0 rounded-full"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Probability Bar Indicator */}
        {pred && (
          <div className="my-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs sm:text-sm font-mono tabular-nums text-slate-600 dark:text-neutral-400">
              <span className="font-extrabold text-slate-950 dark:text-[#CCFF00]">1: {formatProb(pred.homeWinProb, 1)}</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">X: {formatProb(pred.drawProb, 1)}</span>
              <span className="font-extrabold text-cyan-700 dark:text-cyan-400">2: {formatProb(pred.awayWinProb, 1)}</span>
            </div>
            <div className="h-2.5 w-full bg-slate-100 dark:bg-[#18181D] rounded-full flex overflow-hidden p-0.5">
              <div
                style={{ width: `${pred.homeWinProb * 100}%` }}
                className="bg-slate-950 dark:bg-[#CCFF00] rounded-full transition-all duration-300"
                title={`Home Win: ${formatProb(pred.homeWinProb, 1)}`}
              />
              <div
                style={{ width: `${pred.drawProb * 100}%` }}
                className="bg-amber-500 dark:bg-amber-500 rounded-full transition-all duration-300"
                title={`Draw: ${formatProb(pred.drawProb, 1)}`}
              />
              <div
                style={{ width: `${pred.awayWinProb * 100}%` }}
                className="bg-cyan-600 dark:bg-cyan-400 rounded-full transition-all duration-300"
                title={`Away Win: ${formatProb(pred.awayWinProb, 1)}`}
              />
            </div>
          </div>
        )}

        {/* Highest Predicted Outcome */}
        {topPredictionLabel && (
          <div className="mt-3 p-3 rounded-2xl bg-slate-50 dark:bg-[#18181D] flex items-center justify-between text-xs sm:text-sm min-w-0">
            <div className="flex items-center gap-2 min-w-0 truncate">
              <span className="text-slate-500 dark:text-neutral-400 font-semibold shrink-0">Predicted Pick:</span>
              <span className="font-extrabold px-2.5 py-0.5 rounded-lg bg-slate-950 text-[#CCFF00] dark:bg-[#CCFF00] dark:text-slate-950 truncate font-mono tabular-nums text-xs sm:text-[13px] shadow-xs">
                {topPredictionLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Action Footer with High Contrast Button */}
      <div className="mt-3 pt-3 flex items-center justify-between">
        <span className="text-xs sm:text-sm font-bold text-slate-500 dark:text-neutral-400 flex items-center gap-1.5">
          <Info className="w-4.5 h-4.5 text-slate-400" />
          <span>Detailed Model Stats</span>
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectDetail(fixture);
          }}
          className="min-h-[44px] min-w-[44px] w-11 h-11 rounded-full bg-slate-950 text-[#CCFF00] hover:bg-slate-900 dark:bg-[#CCFF00] dark:text-slate-950 dark:hover:bg-[#b8e600] flex items-center justify-center font-black transition-all hover:scale-105 active:scale-95 shadow-xs cursor-pointer"
          title="View Match Analytics"
          aria-label="View Match Analytics"
        >
          <ArrowRight className="w-5 h-5 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
};

