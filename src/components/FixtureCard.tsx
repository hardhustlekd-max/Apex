import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Fixture } from '../core/types.js';
import { formatMatchDateTime } from '../core/dateUtils.js';
import { Badge, Card, TeamAvatar } from './ui/index.js';

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
  const probs = fixture.probs;
  const hasPred = Boolean(fixture.hasPrediction || fixture.prediction || probs);
  const pick = fixture.authoritativePick || null;
  const topPredictionLabel = pick
    ? `${pick.label} (${pick.probabilityFormatted})`
    : null;

  const isHighConfidence = Boolean(pick && pick.probabilityPercent >= 65);
  const { dateStr: localDate, timeStr: localTime } = formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp);

  const homePct = probs ? probs.home : (fixture.prediction ? Math.round((fixture.prediction.homeWinProb ?? 0) * 1000) / 10 : 0);
  const drawPct = probs ? probs.draw : (fixture.prediction ? Math.round((fixture.prediction.drawProb ?? 0) * 1000) / 10 : 0);
  const awayPct = probs ? probs.away : (fixture.prediction ? Math.round((fixture.prediction.awayWinProb ?? 0) * 1000) / 10 : 0);

  return (
    <Card
      id={`fixture-card-${fixture.id}`}
      surface={isSelected ? 'selected' : 'interactive'}
      padding="none"
      role="button"
      tabIndex={0}
      onClick={() => onSelectDetail(fixture)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectDetail(fixture);
        }
      }}
      className="p-3 sm:p-3.5 flex flex-col justify-between"
    >
      <div>
        {/* Top bar: League, Time, Stage / Status */}
        <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-hidden text-theme-sub">
            <span className="font-extrabold text-theme-main truncate max-w-[170px] text-xs sm:text-sm">
              {fixture.stage || fixture.leagueName}
            </span>
            <span aria-hidden="true" className="text-theme-dim shrink-0">·</span>
            <span className="text-xs font-mono tabular-nums whitespace-nowrap shrink-0 text-theme-sub">
              {fixture.status === 'LIVE' ? (fixture.minute ? `${fixture.minute}'` : 'Live') : fixture.status === 'FINISHED' ? 'FT' : `${localDate} · ${localTime}`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            {fixture.status === 'LIVE' ? (
              <Badge variant="live" pill size="xs">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span>LIVE</span>
              </Badge>
            ) : isHighConfidence ? (
              <Badge variant="accent" pill size="xs">
                HIGH CONFIDENCE
              </Badge>
            ) : !hasPred && fixture.status !== 'FINISHED' ? (
              <Badge variant="default" pill size="xs" className="font-medium text-theme-sub">
                UNPREDICTED
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Teams Display */}
        <div className="grid grid-cols-12 items-center gap-2 my-2">
          {/* Home Team */}
          <div className="col-span-5 flex flex-col min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-nowrap">
              <TeamAvatar src={fixture.homeBadge} name={fixture.homeTeam} size="md" />
              <span className="text-xs sm:text-sm font-bold text-theme-main truncate whitespace-nowrap" title={fixture.homeTeam}>
                {fixture.homeTeam}
              </span>
            </div>
          </div>

          {/* VS Divider or Match Score */}
          <div className="col-span-2 flex flex-col items-center justify-center shrink-0">
            {fixture.score && fixture.score.home !== undefined ? (
              <span className="text-xs sm:text-sm font-mono tabular-nums font-black text-theme-main whitespace-nowrap bg-theme-subtle px-2 py-0.5 rounded-full">
                {fixture.score.home} : {fixture.score.away}
              </span>
            ) : (
              <span className="text-[10.5px] font-bold text-theme-sub uppercase tracking-wider whitespace-nowrap">VS</span>
            )}
          </div>

          {/* Away Team */}
          <div className="col-span-5 flex flex-col items-end text-right min-w-0">
            <div className="flex items-center justify-end gap-2 min-w-0 flex-nowrap w-full">
              <span className="text-xs sm:text-sm font-bold text-theme-main truncate whitespace-nowrap" title={fixture.awayTeam}>
                {fixture.awayTeam}
              </span>
              <TeamAvatar src={fixture.awayBadge} name={fixture.awayTeam} size="md" />
            </div>
          </div>
        </div>

        {/* Probability Bar Indicator */}
        {hasPred && (
          <div className="my-2 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-theme-sub">
              <span className="font-bold text-theme-main">1: {homePct.toFixed(1)}%</span>
              <span className="font-medium text-theme-sub">X: {drawPct.toFixed(1)}%</span>
              <span className="font-bold text-theme-main">2: {awayPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full bg-theme-subtle rounded-full flex overflow-hidden gap-0.5">
              <div
                style={{ width: `${homePct}%` }}
                className="bg-theme-primary rounded-full transition-all duration-300"
                title={`Home Win: ${homePct.toFixed(1)}%`}
              />
              <div
                style={{ width: `${drawPct}%` }}
                className="bg-theme-dim/40 rounded-full transition-all duration-300"
                title={`Draw: ${drawPct.toFixed(1)}%`}
              />
              <div
                style={{ width: `${awayPct}%` }}
                className="bg-theme-main/70 rounded-full transition-all duration-300"
                title={`Away Win: ${awayPct.toFixed(1)}%`}
              />
            </div>
          </div>
        )}

        {/* Highest Predicted Outcome */}
        {hasPred && topPredictionLabel && (
          <div className="mt-2 p-2 rounded-xl bg-theme-card-elevated flex items-center justify-between text-xs min-w-0">
            <div className="flex items-center gap-2 min-w-0 truncate">
              <span className="text-theme-sub font-medium shrink-0">Predicted Pick:</span>
              <span className="font-bold px-2 py-0.5 rounded-md bg-theme-primary-subtle text-theme-model-pick truncate font-mono tabular-nums text-xs">
                {topPredictionLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="mt-2 pt-2 flex items-center justify-end">
        <div className="flex items-center gap-1 text-xs font-bold text-theme-primary">
          <span>Analysis</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </Card>
  );
};
