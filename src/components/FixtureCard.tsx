import React from 'react';
import { Info, ArrowRight } from 'lucide-react';
import { Fixture } from '../core/types.js';
import { formatProb, getAuthoritative1X2Pick } from '../core/formatters.js';

interface FixtureCardProps {
  fixture: Fixture;
  onSelectDetail: (fixture: Fixture) => void;
}

export const FixtureCard: React.FC<FixtureCardProps> = ({
  fixture,
  onSelectDetail,
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
      className={`rounded-3xl p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md border ${
        isPositiveEv
          ? 'bg-gradient-to-br from-white via-white to-slate-50 dark:from-[#161616] dark:via-[#161616] dark:to-neutral-900 border-slate-200 dark:border-neutral-800 hover:border-[#CCFF00] dark:hover:border-[#CCFF00]'
          : 'bg-white dark:bg-[#121212] border-slate-200/80 dark:border-neutral-800/80 hover:border-slate-300 dark:hover:border-neutral-700'
      }`}
    >
      <div>
        {/* Top bar: League, Time, Stage / Status */}
        <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-hidden">
            <span className="px-3 py-1 rounded-full text-[11px] font-extrabold bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-neutral-200 truncate max-w-[180px]">
              {fixture.stage || fixture.leagueName}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-neutral-400 font-bold whitespace-nowrap shrink-0">
              {fixture.status === 'LIVE' ? 'Live' : fixture.status === 'FINISHED' ? 'FT' : `${fixture.matchDate} · ${fixture.kickOffTime}`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            {fixture.status === 'LIVE' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#CCFF00] text-slate-950">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />
                LIVE
              </span>
            ) : isPositiveEv ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#CCFF00] text-slate-950">
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
              {fixture.homeBadge && (
                <img
                  src={fixture.homeBadge}
                  alt=""
                  className="w-5 h-5 object-contain shrink-0 rounded-full"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              )}
              <span className="text-xs sm:text-sm font-extrabold text-slate-950 dark:text-white truncate whitespace-nowrap" title={fixture.homeTeam}>
                {fixture.homeTeam}
              </span>
            </div>
          </div>

          {/* VS Divider or Match Score */}
          <div className="col-span-2 flex flex-col items-center justify-center shrink-0">
            {fixture.score && fixture.score.home !== undefined ? (
              <span className="text-xs sm:text-sm font-mono font-black text-slate-950 dark:text-white whitespace-nowrap bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
                {fixture.score.home}:{fixture.score.away}
              </span>
            ) : (
              <span className="text-[10px] font-black text-slate-400 dark:text-neutral-500 uppercase tracking-wider whitespace-nowrap">VS</span>
            )}
          </div>

          {/* Away Team */}
          <div className="col-span-5 flex flex-col items-end text-right min-w-0">
            <div className="flex items-center justify-end gap-2 min-w-0 flex-nowrap w-full">
              <span className="text-xs sm:text-sm font-extrabold text-slate-950 dark:text-white truncate whitespace-nowrap" title={fixture.awayTeam}>
                {fixture.awayTeam}
              </span>
              {fixture.awayBadge && (
                <img
                  src={fixture.awayBadge}
                  alt=""
                  className="w-5 h-5 object-contain shrink-0 rounded-full"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Probability Bar Indicator */}
        {pred && (
          <div className="my-3 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-600 dark:text-neutral-400">
              <span className="font-extrabold text-slate-900 dark:text-neutral-200">1: {formatProb(pred.homeWinProb, 1)}</span>
              <span className="font-bold text-slate-500">X: {formatProb(pred.drawProb, 1)}</span>
              <span className="font-extrabold text-slate-900 dark:text-neutral-200">2: {formatProb(pred.awayWinProb, 1)}</span>
            </div>
            <div className="h-2 w-full bg-slate-100 dark:bg-neutral-800 rounded-full flex overflow-hidden p-0.5">
              <div
                style={{ width: `${pred.homeWinProb * 100}%` }}
                className="bg-[#CCFF00] rounded-full transition-all duration-300"
                title={`Home Win: ${formatProb(pred.homeWinProb, 1)}`}
              />
              <div
                style={{ width: `${pred.drawProb * 100}%` }}
                className="bg-slate-300 dark:bg-neutral-600 rounded-full transition-all duration-300"
                title={`Draw: ${formatProb(pred.drawProb, 1)}`}
              />
              <div
                style={{ width: `${pred.awayWinProb * 100}%` }}
                className="bg-slate-900 dark:bg-white rounded-full transition-all duration-300"
                title={`Away Win: ${formatProb(pred.awayWinProb, 1)}`}
              />
            </div>
          </div>
        )}

        {/* Highest Predicted Outcome */}
        {topPredictionLabel && (
          <div className="mt-3 p-2.5 rounded-2xl bg-slate-100/70 dark:bg-neutral-800/60 flex items-center justify-between text-[11px] min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <span className="text-slate-500 dark:text-neutral-400 font-semibold">Predicted Pick:</span>
              <span className="font-extrabold text-slate-950 dark:text-white truncate">{topPredictionLabel}</span>
            </div>
          </div>
        )}
      </div>

      {/* Action Footer with Apex Circular Electric Lime Arrow Button */}
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-neutral-800/80 flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span>Detailed Model Stats</span>
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectDetail(fixture);
          }}
          className="w-9 h-9 rounded-full bg-[#CCFF00] text-slate-950 flex items-center justify-center font-black transition-all hover:scale-110 active:scale-95 shadow-xs"
          title="View Match Analytics"
        >
          <ArrowRight className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
};

