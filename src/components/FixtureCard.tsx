import React from 'react';
import { Info, ArrowRight } from 'lucide-react';
import { Fixture } from '../core/types.js';
import { formatProb, getAuthoritative1X2Pick } from '../core/formatters.js';
import { formatMatchDateTime } from '../core/dateUtils.js';

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
  const { dateStr: localDate, timeStr: localTime } = formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp);

  return (
    <div
      id={`fixture-card-${fixture.id}`}
      onClick={() => onSelectDetail(fixture)}
      className={`rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 cursor-pointer border ${
        isSelected
          ? 'bg-slate-50 dark:bg-[#1E2027] border-[#FF001F] shadow-sm'
          : 'bg-white dark:bg-[#15161C] border-[#ECEEF2] dark:border-[#20232D] shadow-xs hover:border-slate-300 dark:hover:border-neutral-700'
      }`}
    >
      <div>
        {/* Top bar: League, Time, Stage / Status */}
        <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-hidden text-[#8F92A1] dark:text-[#9EA3B2]">
            <span className="font-extrabold text-slate-900 dark:text-white truncate max-w-[170px] text-xs sm:text-sm">
              {fixture.stage || fixture.leagueName}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-neutral-700 shrink-0">·</span>
            <span className="text-xs font-mono tabular-nums whitespace-nowrap shrink-0">
              {fixture.status === 'LIVE' ? (fixture.minute ? `${fixture.minute}'` : 'Live') : fixture.status === 'FINISHED' ? 'FT' : `${localDate} · ${localTime}`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            {fixture.status === 'LIVE' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#FF001F] text-white font-mono tabular-nums shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </span>
            ) : isPositiveEv ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FF001F]/10 text-[#FF001F] font-mono tracking-wide">
                VALUE PICK
              </span>
            ) : !pred && fixture.status !== 'FINISHED' ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 font-mono tracking-wide">
                UNPREDICTED
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
                  className="w-6 h-6 object-contain shrink-0 rounded-full"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-[#1E2027] text-xs font-bold text-slate-700 dark:text-neutral-300 flex items-center justify-center shrink-0">
                  {fixture.homeTeam.slice(0, 1)}
                </div>
              )}
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate whitespace-nowrap" title={fixture.homeTeam}>
                {fixture.homeTeam}
              </span>
            </div>
          </div>

          {/* VS Divider or Match Score */}
          <div className="col-span-2 flex flex-col items-center justify-center shrink-0">
            {fixture.score && fixture.score.home !== undefined ? (
              <span className="text-xs sm:text-sm font-mono tabular-nums font-black text-slate-900 dark:text-white whitespace-nowrap bg-slate-100 dark:bg-[#1E2027] px-2.5 py-0.5 rounded-full">
                {fixture.score.home} : {fixture.score.away}
              </span>
            ) : (
              <span className="text-[11px] font-bold text-[#8F92A1] dark:text-[#646877] uppercase tracking-wider whitespace-nowrap">VS</span>
            )}
          </div>

          {/* Away Team */}
          <div className="col-span-5 flex flex-col items-end text-right min-w-0">
            <div className="flex items-center justify-end gap-2 min-w-0 flex-nowrap w-full">
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate whitespace-nowrap" title={fixture.awayTeam}>
                {fixture.awayTeam}
              </span>
              {fixture.awayBadge ? (
                <img
                  src={fixture.awayBadge}
                  alt=""
                  className="w-6 h-6 object-contain shrink-0 rounded-full"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-[#1E2027] text-xs font-bold text-slate-700 dark:text-neutral-300 flex items-center justify-center shrink-0">
                  {fixture.awayTeam.slice(0, 1)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Probability Bar Indicator */}
        {pred && (
          <div className="my-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono tabular-nums text-[#8F92A1] dark:text-[#9EA3B2]">
              <span className="font-bold text-slate-900 dark:text-white">1: {formatProb(pred.homeWinProb, 1)}</span>
              <span className="font-medium text-slate-500">X: {formatProb(pred.drawProb, 1)}</span>
              <span className="font-bold text-slate-900 dark:text-white">2: {formatProb(pred.awayWinProb, 1)}</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-[#1E2027] rounded-full flex overflow-hidden">
              <div
                style={{ width: `${pred.homeWinProb * 100}%` }}
                className="bg-[#FF001F] rounded-full transition-all duration-300"
                title={`Home Win: ${formatProb(pred.homeWinProb, 1)}`}
              />
              <div
                style={{ width: `${pred.drawProb * 100}%` }}
                className="bg-slate-300 dark:bg-neutral-600 rounded-full transition-all duration-300"
                title={`Draw: ${formatProb(pred.drawProb, 1)}`}
              />
              <div
                style={{ width: `${pred.awayWinProb * 100}%` }}
                className="bg-slate-800 dark:bg-neutral-300 rounded-full transition-all duration-300"
                title={`Away Win: ${formatProb(pred.awayWinProb, 1)}`}
              />
            </div>
          </div>
        )}

        {/* Highest Predicted Outcome */}
        {topPredictionLabel && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-[#1A1C24] flex items-center justify-between text-xs min-w-0">
            <div className="flex items-center gap-2 min-w-0 truncate">
              <span className="text-[#8F92A1] dark:text-[#9EA3B2] font-medium shrink-0">Predicted Pick:</span>
              <span className="font-bold px-2 py-0.5 rounded-md bg-[#FF001F]/10 text-[#FF001F] truncate font-mono tabular-nums text-xs">
                {topPredictionLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Action Footer with High Contrast Button */}
      <div className="mt-3 pt-2.5 border-t border-[#ECEEF2] dark:border-[#20232D] flex items-center justify-between">
        <span className="text-xs font-medium text-[#8F92A1] dark:text-[#9EA3B2] flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span>Tap for detailed breakdown</span>
        </span>
        <div className="flex items-center gap-1 text-xs font-bold text-[#FF001F]">
          <span>Analysis</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
};
