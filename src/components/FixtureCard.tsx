import React from 'react';
import { Info } from 'lucide-react';
import { Fixture } from '../core/types.js';
import { formatProb, getAuthoritative1X2Pick } from '../core/formatters.js';
import { Card } from './ui/Card.js';
import { Badge } from './ui/Badge.js';
import { Button } from './ui/Button.js';

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

  return (
    <Card
      id={`fixture-card-${fixture.id}`}
      className="hover:border-slate-200 dark:hover:border-slate-700 flex flex-col justify-between group hover:shadow-sm"
    >
      <div>
        {/* Top bar: League, Time, Stage / Status */}
        <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-hidden">
            <Badge title={fixture.stage || fixture.leagueName} className="truncate max-w-[180px]">
              {fixture.stage || fixture.leagueName}
            </Badge>
            <span className="text-[10px] text-slate-500 dark:text-slate-500 font-mono whitespace-nowrap shrink-0">
              {fixture.status === 'LIVE' ? 'Live' : fixture.status === 'FINISHED' ? 'FT' : `${fixture.matchDate} ${fixture.kickOffTime}`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            {fixture.status === 'LIVE' ? (
              <Badge variant="danger" className="font-black gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                LIVE
              </Badge>
            ) : fixture.status === 'FINISHED' ? (
              <Badge>
                FT
              </Badge>
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
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate whitespace-nowrap" title={fixture.homeTeam}>
                {fixture.homeTeam}
              </span>
            </div>
          </div>

          {/* VS Divider or Match Score */}
          <div className="col-span-2 flex flex-col items-center justify-center shrink-0">
            {fixture.score && fixture.score.home !== undefined ? (
              <span className="text-xs sm:text-sm font-mono font-black text-slate-900 dark:text-white whitespace-nowrap">
                {fixture.score.home}:{fixture.score.away}
              </span>
            ) : (
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-wider whitespace-nowrap">VS</span>
            )}
          </div>

          {/* Away Team */}
          <div className="col-span-5 flex flex-col items-end text-right min-w-0">
            <div className="flex items-center justify-end gap-2 min-w-0 flex-nowrap w-full">
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate whitespace-nowrap" title={fixture.awayTeam}>
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
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-500">
              <span className="text-slate-900 dark:text-slate-100 font-bold">1: {formatProb(pred.homeWinProb, 1)}</span>
              <span className="font-bold">X: {formatProb(pred.drawProb, 1)}</span>
              <span className="text-slate-900 dark:text-slate-100 font-bold">2: {formatProb(pred.awayWinProb, 1)}</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full flex overflow-hidden">
              <div
                style={{ width: `${pred.homeWinProb * 100}%` }}
                className="bg-slate-900 dark:bg-slate-100 transition-all duration-300"
                title={`Home Win: ${formatProb(pred.homeWinProb, 1)}`}
              />
              <div
                style={{ width: `${pred.drawProb * 100}%` }}
                className="bg-slate-500 dark:bg-slate-600 transition-all duration-300"
                title={`Draw: ${formatProb(pred.drawProb, 1)}`}
              />
              <div
                style={{ width: `${pred.awayWinProb * 100}%` }}
                className="bg-slate-700 dark:bg-slate-400 transition-all duration-300"
                title={`Away Win: ${formatProb(pred.awayWinProb, 1)}`}
              />
            </div>
          </div>
        )}

        {/* Highest Predicted Outcome */}
        {topPredictionLabel && (
          <div className="mt-3 mb-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Pick:</span>
              <span className="font-bold text-slate-900 dark:text-white truncate">{topPredictionLabel}</span>
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end">
        <Button
          type="button"
          onClick={() => onSelectDetail(fixture)}
        >
          <Info className="w-3.5 h-3.5" />
          <span>Analytics</span>
        </Button>
      </div>
    </Card>
  );
};

