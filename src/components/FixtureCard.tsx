import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Fixture } from '../core/types.js';
import { formatMatchDateTime } from '../core/dateUtils.js';
import { Badge, Card, TeamAvatar } from './ui/index.js';

interface FixtureCardProps {
  fixture: Fixture;
  onSelectDetail: (fixture: Fixture) => void;
  isSelected?: boolean;
  marketFilter?: 'MOST_LIKELY' | 'COMBOS' | 'DOUBLE_CHANCE' | 'OVER_UNDER' | '1X2' | 'BTTS';
}

export const FixtureCard: React.FC<FixtureCardProps> = ({
  fixture,
  onSelectDetail,
  isSelected = false,
  marketFilter = 'MOST_LIKELY',
}) => {
  const probs = fixture.probs;
  const hasPred = Boolean(fixture.hasPrediction || fixture.prediction || probs);

  const homePct = probs ? probs.home : (fixture.prediction ? Math.round((fixture.prediction.homeWinProb ?? 0) * 1000) / 10 : 0);
  const drawPct = probs ? probs.draw : (fixture.prediction ? Math.round((fixture.prediction.drawProb ?? 0) * 1000) / 10 : 0);
  const awayPct = probs ? probs.away : (fixture.prediction ? Math.round((fixture.prediction.awayWinProb ?? 0) * 1000) / 10 : 0);
  const over25Pct = probs ? probs.over25 : (fixture.prediction ? Math.round((fixture.prediction.over25Prob ?? 0) * 1000) / 10 : 0);
  const under25Pct = probs ? probs.under25 : Number((100 - over25Pct).toFixed(1));
  const bttsYesPct = probs ? probs.bttsYes : (fixture.prediction ? Math.round((fixture.prediction.bttsProb ?? 0) * 1000) / 10 : 0);
  const bttsNoPct = probs ? probs.bttsNo : Number((100 - bttsYesPct).toFixed(1));

  const dc1XPct = Number(Math.min(99, homePct + drawPct).toFixed(1));
  const dcX2Pct = Number(Math.min(99, awayPct + drawPct).toFixed(1));
  const dc12Pct = Number(Math.min(99, homePct + awayPct).toFixed(1));

  const pick = (() => {
    if (!hasPred) return null;
    if (marketFilter === 'COMBOS' && fixture.comboPick) {
      return fixture.comboPick;
    }
    if (marketFilter === 'DOUBLE_CHANCE') {
      if (fixture.dcPick) return fixture.dcPick;
      const bestDc = [
        { label: `${fixture.homeTeam} or Draw (1X)`, pct: dc1XPct },
        { label: `Draw or ${fixture.awayTeam} (X2)`, pct: dcX2Pct },
        { label: `${fixture.homeTeam} or ${fixture.awayTeam} (12)`, pct: dc12Pct },
      ].sort((a, b) => b.pct - a.pct)[0];
      return {
        label: bestDc.label,
        probabilityPercent: bestDc.pct,
        probabilityFormatted: `${bestDc.pct.toFixed(1)}%`,
      };
    }
    if (marketFilter === 'OVER_UNDER') {
      const isOver = over25Pct >= under25Pct;
      const pct = isOver ? over25Pct : under25Pct;
      return {
        label: isOver ? 'Over 2.5 Goals' : 'Under 2.5 Goals',
        probabilityPercent: pct,
        probabilityFormatted: `${pct.toFixed(1)}%`,
      };
    }
    if (marketFilter === 'BTTS') {
      const isYes = bttsYesPct >= bttsNoPct;
      const pct = isYes ? bttsYesPct : bttsNoPct;
      return {
        label: isYes ? 'Both Teams To Score (Yes)' : 'Both Teams To Score (No)',
        probabilityPercent: pct,
        probabilityFormatted: `${pct.toFixed(1)}%`,
      };
    }
    if (marketFilter === 'MOST_LIKELY' && fixture.highestPick) {
      return fixture.highestPick;
    }
    return fixture.authoritativePick || null;
  })();

  const topPredictionLabel = pick
    ? `${pick.label} (${pick.probabilityFormatted})`
    : null;

  const isHighConfidence = Boolean(pick && pick.probabilityPercent >= 65);
  const { dateStr: localDate, timeStr: localTime } = formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp);

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
            {fixture.status === 'LIVE' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20 whitespace-nowrap shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                <span>{fixture.minute ? `${fixture.minute}'` : 'LIVE'}</span>
              </span>
            ) : fixture.status === 'FINISHED' ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap shrink-0">
                FT
              </span>
            ) : (
              <span className="text-xs font-normal tabular-nums whitespace-nowrap shrink-0 text-theme-sub">
                {localDate} · {localTime}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            {isHighConfidence && (
              <span className="text-xs font-semibold text-theme-primary tracking-wide">
                High Conf.
              </span>
            )}
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
            {marketFilter === 'COMBOS' && fixture.comboPick ? (
              <>
                <div className="flex items-center justify-between text-xs tabular-nums text-theme-sub gap-2">
                  <span className="font-semibold text-theme-main truncate">{fixture.comboPick.label}</span>
                  <span className="font-semibold text-theme-primary shrink-0">{fixture.comboPick.probabilityFormatted}</span>
                </div>
                <div className="h-1.5 w-full bg-theme-subtle rounded-full overflow-hidden">
                  <div
                    style={{ width: `${Math.min(100, fixture.comboPick.probabilityPercent)}%` }}
                    className="h-full bg-theme-primary rounded-full transition-all duration-300"
                    title={`${fixture.comboPick.label}: ${fixture.comboPick.probabilityFormatted}`}
                  />
                </div>
              </>
            ) : marketFilter === 'DOUBLE_CHANCE' ? (
              <>
                <div className="flex items-center justify-between text-xs tabular-nums text-theme-sub">
                  <span className="font-semibold text-theme-main">1X · {dc1XPct.toFixed(0)}%</span>
                  <span className="font-normal text-theme-sub">12 · {dc12Pct.toFixed(0)}%</span>
                  <span className="font-semibold text-theme-main">X2 · {dcX2Pct.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 w-full bg-theme-subtle rounded-full flex overflow-hidden gap-0.5">
                  <div
                    style={{ width: `${dc1XPct}%` }}
                    className="bg-theme-primary rounded-full transition-all duration-300"
                    title={`1X: ${dc1XPct.toFixed(1)}%`}
                  />
                </div>
              </>
            ) : marketFilter === 'OVER_UNDER' ? (
              <>
                <div className="flex items-center justify-between text-xs tabular-nums text-theme-sub">
                  <span className="font-semibold text-theme-main">Over 2.5 · {over25Pct.toFixed(0)}%</span>
                  <span className="font-semibold text-theme-main">Under 2.5 · {under25Pct.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 w-full bg-theme-subtle rounded-full flex overflow-hidden gap-0.5">
                  <div
                    style={{ width: `${over25Pct}%` }}
                    className="bg-theme-primary rounded-full transition-all duration-300"
                    title={`Over 2.5: ${over25Pct.toFixed(1)}%`}
                  />
                  <div
                    style={{ width: `${under25Pct}%` }}
                    className="bg-theme-main/70 rounded-full transition-all duration-300"
                    title={`Under 2.5: ${under25Pct.toFixed(1)}%`}
                  />
                </div>
              </>
            ) : marketFilter === 'BTTS' ? (
              <>
                <div className="flex items-center justify-between text-xs tabular-nums text-theme-sub">
                  <span className="font-semibold text-theme-main">BTTS Yes · {bttsYesPct.toFixed(0)}%</span>
                  <span className="font-semibold text-theme-main">BTTS No · {bttsNoPct.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 w-full bg-theme-subtle rounded-full flex overflow-hidden gap-0.5">
                  <div
                    style={{ width: `${bttsYesPct}%` }}
                    className="bg-theme-primary rounded-full transition-all duration-300"
                    title={`BTTS Yes: ${bttsYesPct.toFixed(1)}%`}
                  />
                  <div
                    style={{ width: `${bttsNoPct}%` }}
                    className="bg-theme-main/70 rounded-full transition-all duration-300"
                    title={`BTTS No: ${bttsNoPct.toFixed(1)}%`}
                  />
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
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
