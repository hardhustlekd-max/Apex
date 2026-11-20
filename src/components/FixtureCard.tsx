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
      className="p-3 flex flex-col justify-between"
    >
      <div>
        {/* Top Metadata */}
        <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-hidden text-theme-sub">
            <span className="font-medium text-theme-main truncate max-w-[165px] text-xs">
              {fixture.stage || fixture.leagueName}
            </span>
            <span aria-hidden="true" className="text-theme-dim shrink-0">·</span>
            <span className="text-xs font-normal tabular-nums whitespace-nowrap shrink-0 text-theme-sub">
              {fixture.status === 'LIVE' ? (fixture.minute ? `${fixture.minute}'` : 'Live') : fixture.status === 'FINISHED' ? 'FT' : `${localDate} · ${localTime}`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            {isHighConfidence ? (
              <span className="text-xs font-semibold text-theme-primary tracking-wide">
                High Conf.
              </span>
            ) : null}
          </div>
        </div>

        {/* Teams Display */}
        <div className="grid grid-cols-12 items-center gap-1.5 my-2">
          <div className="col-span-5 flex items-center gap-1.5 min-w-0">
            <TeamAvatar src={fixture.homeBadge} name={fixture.homeTeam} size="sm" />
            <span className="text-base font-semibold text-theme-main truncate whitespace-nowrap" title={fixture.homeTeam}>
              {fixture.homeTeam}
            </span>
          </div>

          <div className="col-span-2 flex items-center justify-center shrink-0">
            {fixture.score && fixture.score.home !== undefined ? (
              <span className={`text-base tabular-nums font-bold whitespace-nowrap ${fixture.status === 'LIVE' ? 'text-theme-live' : 'text-theme-main'}`}>
                {fixture.score.home} - {fixture.score.away}
              </span>
            ) : (
              <span className="text-2xs font-medium text-theme-dim uppercase tracking-wider whitespace-nowrap">vs</span>
            )}
          </div>

          <div className="col-span-5 flex items-center justify-end gap-1.5 min-w-0 text-right">
            <span className="text-base font-semibold text-theme-main truncate whitespace-nowrap" title={fixture.awayTeam}>
              {fixture.awayTeam}
            </span>
            <TeamAvatar src={fixture.awayBadge} name={fixture.awayTeam} size="sm" />
          </div>
        </div>

        {/* Probability Bar Indicator */}
        {hasPred && (
          <div className="my-2 space-y-1">
            <div className="flex items-center justify-between text-xs tabular-nums text-theme-sub">
              <span className="font-semibold text-theme-main">1 · {homePct.toFixed(0)}%</span>
              <span className="font-normal text-theme-sub">X · {drawPct.toFixed(0)}%</span>
              <span className="font-semibold text-theme-main">2 · {awayPct.toFixed(0)}%</span>
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
      </div>

      {/* Hairline Footer: Pick & Action */}
      <div className="mt-2 pt-2 border-t border-theme-subdued flex items-center justify-between gap-2 text-xs min-w-0">
        {hasPred && topPredictionLabel ? (
          <div className="flex items-center gap-1.5 min-w-0 truncate text-sm">
            <span className="text-theme-sub font-normal shrink-0">Pick:</span>
            <span className="font-semibold text-theme-model-pick truncate tabular-nums">
              {topPredictionLabel}
            </span>
          </div>
        ) : (
          <span className="text-xs font-normal text-theme-dim">Unpredicted</span>
        )}
        <div className="flex items-center gap-1 text-xs font-medium text-theme-primary shrink-0">
          <span>Analysis</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </Card>
  );
};
