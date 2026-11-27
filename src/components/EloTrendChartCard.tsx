import React, { useMemo, useState, useId } from 'react';
import { TrendingUp } from 'lucide-react';
import { TeamEloTrendPoint } from '../core/types.js';
import { Card, SectionHeader } from './ui/index.js';

export interface EloTrendChartCardProps {
  homeTeam: string;
  awayTeam: string;
  homeElo: number;
  awayElo: number;
  homeTrend: TeamEloTrendPoint[];
  awayTrend: TeamEloTrendPoint[];
  isLoading?: boolean;
}

type SeriesFocus = 'BOTH' | 'HOME' | 'AWAY';

interface SlotCoordinate {
  slot: number; // 0 = Base, 1..5 = M1..M5
  elo: number;
  point: TeamEloTrendPoint | null; // null on Base slot
}

function buildSlotSeries(trend: TeamEloTrendPoint[], maxMatches = 5): SlotCoordinate[] {
  if (!trend || trend.length === 0) return [];
  const trimmed = trend.slice(-maxMatches);
  const startSlot = maxMatches - trimmed.length;
  const coords: SlotCoordinate[] = [
    {
      slot: startSlot,
      elo: trimmed[0].eloBefore,
      point: null,
    },
  ];
  for (let i = 0; i < trimmed.length; i++) {
    coords.push({
      slot: startSlot + i + 1,
      elo: trimmed[i].eloAfter,
      point: trimmed[i],
    });
  }
  return coords;
}

function formatSignedDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

export const EloTrendChartCard: React.FC<EloTrendChartCardProps> = ({
  homeTeam,
  awayTeam,
  homeElo,
  awayElo,
  homeTrend,
  awayTrend,
  isLoading = false,
}) => {
  const uid = useId().replace(/:/g, '');
  const [focus, setFocus] = useState<SeriesFocus>('BOTH');
  const [activeSlot, setActiveSlot] = useState<number>(5);

  const homeSeries = useMemo(() => buildSlotSeries(homeTrend, 5), [homeTrend]);
  const awaySeries = useMemo(() => buildSlotSeries(awayTrend, 5), [awayTrend]);

  const hasData = homeSeries.length >= 2 || awaySeries.length >= 2;

  const homeNet = useMemo(() => {
    if (homeTrend.length === 0) return 0;
    return homeTrend[homeTrend.length - 1].eloAfter - homeTrend[0].eloBefore;
  }, [homeTrend]);

  const awayNet = useMemo(() => {
    if (awayTrend.length === 0) return 0;
    return awayTrend[awayTrend.length - 1].eloAfter - awayTrend[0].eloBefore;
  }, [awayTrend]);

  const homeAvgOppElo = useMemo(() => {
    if (homeTrend.length === 0) return null;
    const sum = homeTrend.reduce((acc, p) => acc + p.opponentElo, 0);
    return Math.round(sum / homeTrend.length);
  }, [homeTrend]);

  const awayAvgOppElo = useMemo(() => {
    if (awayTrend.length === 0) return null;
    const sum = awayTrend.reduce((acc, p) => acc + p.opponentElo, 0);
    return Math.round(sum / awayTrend.length);
  }, [awayTrend]);

  const chartGeometry = useMemo(() => {
    const visibleValues: number[] = [];
    if (focus !== 'AWAY') {
      for (const s of homeSeries) visibleValues.push(s.elo);
    }
    if (focus !== 'HOME') {
      for (const s of awaySeries) visibleValues.push(s.elo);
    }
    if (visibleValues.length === 0) {
      visibleValues.push(homeElo || 1500, awayElo || 1500);
    }

    const rawMin = Math.min(...visibleValues);
    const rawMax = Math.max(...visibleValues);
    const spread = Math.max(40, rawMax - rawMin);
    const pad = Math.max(18, Math.round(spread * 0.22));
    const step = spread > 240 ? 50 : 25;
    const yMin = Math.floor((rawMin - pad) / step) * step;
    const yMax = Math.ceil((rawMax + pad) / step) * step;
    const safeSpan = Math.max(step, yMax - yMin);

    const width = 460;
    const height = 164;
    const padLeft = 42;
    const padRight = 16;
    const padTop = 14;
    const padBottom = 24;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const xForSlot = (slot: number) => padLeft + (slot / 5) * plotW;
    const yForElo = (elo: number) => padTop + (1 - (elo - yMin) / safeSpan) * plotH;

    // Generate 3-4 clean horizontal gridlines
    const ticks: number[] = [];
    const tickCount = 4;
    for (let i = 0; i <= tickCount; i++) {
      ticks.push(Math.round(yMin + (safeSpan * i) / tickCount));
    }

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotW,
      plotH,
      yMin,
      yMax,
      ticks,
      xForSlot,
      yForElo,
    };
  }, [focus, homeSeries, awaySeries, homeElo, awayElo]);

  const buildPathD = (coords: SlotCoordinate[]) => {
    if (coords.length === 0) return '';
    return coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${chartGeometry.xForSlot(c.slot).toFixed(1)} ${chartGeometry.yForElo(c.elo).toFixed(1)}`)
      .join(' ');
  };

  const buildAreaD = (coords: SlotCoordinate[]) => {
    if (coords.length < 2) return '';
    const baseY = (chartGeometry.padTop + chartGeometry.plotH).toFixed(1);
    const firstX = chartGeometry.xForSlot(coords[0].slot).toFixed(1);
    const lastX = chartGeometry.xForSlot(coords[coords.length - 1].slot).toFixed(1);
    return `${buildPathD(coords)} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  };

  const homeCoordAtSlot = useMemo(
    () => homeSeries.find((s) => s.slot === activeSlot) || null,
    [homeSeries, activeSlot]
  );
  const awayCoordAtSlot = useMemo(
    () => awaySeries.find((s) => s.slot === activeSlot) || null,
    [awaySeries, activeSlot]
  );

  const slotLabels = ['Start', 'M1', 'M2', 'M3', 'M4', 'M5'];

  if (isLoading && !hasData) {
    return (
      <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
        <div className="min-h-[34px] px-3 pt-2.5 pb-1 flex items-center">
          <SectionHeader
            title="Elo Rating Trend"
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            size="sm"
            className="w-full"
          />
        </div>
        <div className="p-3 space-y-2.5 animate-pulse">
          <div className="grid grid-cols-2 gap-2">
            <div className="h-10 rounded-lg bg-theme-subtle" />
            <div className="h-10 rounded-lg bg-theme-subtle" />
          </div>
          <div className="h-[148px] w-full rounded-xl bg-theme-subtle" />
        </div>
      </Card>
    );
  }

  if (!hasData) {
    return (
      <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
        <div className="min-h-[34px] px-3 pt-2.5 pb-1 flex items-center justify-between gap-2">
          <SectionHeader
            title="Elo Rating Trend"
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            size="sm"
          />
          <span className="text-xs text-theme-dim tabular-nums">
            {homeElo} vs {awayElo}
          </span>
        </div>
        <div className="px-3 py-5 text-center text-xs text-theme-sub">
          No recent match history
        </div>
      </Card>
    );
  }

  const showHome = focus !== 'AWAY' && homeSeries.length >= 2;
  const showAway = focus !== 'HOME' && awaySeries.length >= 2;

  return (
    <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
      {/* Header Row */}
      <div className="min-h-[36px] px-3 pt-2.5 pb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <SectionHeader
            title="Elo Rating Trend"
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            size="sm"
          />
          <span aria-hidden="true" className="text-theme-dim text-xs hidden sm:inline">·</span>
          <span className="text-xs text-theme-dim hidden sm:inline truncate">Last 5 matches</span>
        </div>

        {/* Interactive Focus Switcher */}
        <div
          role="group"
          aria-label="Filter Elo trend series"
          className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-theme-card shrink-0"
        >
          {(
            [
              { id: 'BOTH', label: 'Both' },
              { id: 'HOME', label: 'Home' },
              { id: 'AWAY', label: 'Away' },
            ] as const
          ).map((item) => {
            const active = focus === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFocus(item.id)}
                aria-pressed={active}
                className={`h-[24px] px-2.5 rounded-full text-2xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                  active
                    ? 'bg-theme-primary text-theme-primary-text'
                    : 'text-theme-sub hover:text-theme-main'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Team Current Elo & 5-Match Net Momentum Strip */}
      <div className="px-2.5 pb-1.5 grid grid-cols-2 gap-1.5 tabular-nums">
        <div className="px-2.5 py-2 rounded-xl bg-theme-card min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                aria-hidden="true"
                className="w-2.5 h-[2.5px] rounded-full bg-theme-primary shrink-0"
              />
              <span className="text-xs font-semibold text-theme-main truncate">{homeTeam}</span>
            </div>
            <span className="text-sm font-bold text-theme-primary shrink-0">{homeElo}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-1 text-2xs text-theme-sub">
            <span>
              5M:{' '}
              <span
                className={`font-semibold ${
                  homeNet > 0
                    ? 'text-theme-success'
                    : homeNet < 0
                    ? 'text-theme-danger'
                    : 'text-theme-sub'
                }`}
              >
                {formatSignedDelta(homeNet)} pts
              </span>
            </span>
            {homeAvgOppElo !== null && (
              <span className="text-theme-dim truncate">Avg opp {homeAvgOppElo}</span>
            )}
          </div>
        </div>

        <div className="px-2.5 py-2 rounded-xl bg-theme-card min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                aria-hidden="true"
                className="w-2.5 h-[2.5px] rounded-full bg-[var(--status-info)] shrink-0"
              />
              <span className="text-xs font-semibold text-theme-main truncate">{awayTeam}</span>
            </div>
            <span className="text-sm font-bold text-theme-info shrink-0">{awayElo}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-1 text-2xs text-theme-sub">
            <span>
              5M:{' '}
              <span
                className={`font-semibold ${
                  awayNet > 0
                    ? 'text-theme-success'
                    : awayNet < 0
                    ? 'text-theme-danger'
                    : 'text-theme-sub'
                }`}
              >
                {formatSignedDelta(awayNet)} pts
              </span>
            </span>
            {awayAvgOppElo !== null && (
              <span className="text-theme-dim truncate">Avg opp {awayAvgOppElo}</span>
            )}
          </div>
        </div>
      </div>

      {/* Interactive SVG Dual-Line Trajectory */}
      <div className="px-2.5 pt-2 pb-1">
        <svg
          viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
          className="w-full h-auto block select-none overflow-visible"
          role="img"
          aria-label={`Last 5 matches Elo rating trend for ${homeTeam} and ${awayTeam}`}
        >
          {/* Horizontal Gridlines & Y-Axis Labels */}
          {chartGeometry.ticks.map((tick) => {
            const y = chartGeometry.yForElo(tick);
            const isNeutral = tick === 1500;
            return (
              <g key={tick}>
                <line
                  x1={chartGeometry.padLeft}
                  y1={y}
                  x2={chartGeometry.width - chartGeometry.padRight}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={isNeutral ? 0.18 : 0.07}
                  strokeDasharray={isNeutral ? '3 3' : undefined}
                  strokeWidth={1}
                />
                <text
                  x={chartGeometry.padLeft - 6}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-[var(--text-muted)] text-[10px] tabular-nums"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* 1500 Baseline Reference if not already a grid tick */}
          {1500 > chartGeometry.yMin &&
            1500 < chartGeometry.yMax &&
            !chartGeometry.ticks.includes(1500) && (
              <line
                x1={chartGeometry.padLeft}
                y1={chartGeometry.yForElo(1500)}
                x2={chartGeometry.width - chartGeometry.padRight}
                y2={chartGeometry.yForElo(1500)}
                stroke="currentColor"
                strokeOpacity={0.18}
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            )}

          {/* Active Vertical Crosshair */}
          <line
            x1={chartGeometry.xForSlot(activeSlot)}
            y1={chartGeometry.padTop}
            x2={chartGeometry.xForSlot(activeSlot)}
            y2={chartGeometry.padTop + chartGeometry.plotH}
            stroke="currentColor"
            strokeOpacity={0.22}
            strokeDasharray="2 3"
            strokeWidth={1}
          />

          {/* Trajectory Paths */}
          {showAway && (
            <path
              d={buildPathD(awaySeries)}
              fill="none"
              stroke="var(--status-info)"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {showHome && (
            <path
              d={buildPathD(homeSeries)}
              fill="none"
              stroke="var(--accent-default)"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Away Data Nodes */}
          {showAway &&
            awaySeries.map((c) => {
              const cx = chartGeometry.xForSlot(c.slot);
              const cy = chartGeometry.yForElo(c.elo);
              const isSelected = c.slot === activeSlot;
              return (
                <g key={`away-${c.slot}`}>
                  {isSelected && (
                    <circle cx={cx} cy={cy} r={8} fill="var(--status-info)" fillOpacity={0.18} />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 4.5 : 3.2}
                    fill="var(--bg-card)"
                    stroke="var(--status-info)"
                    strokeWidth={2}
                  />
                </g>
              );
            })}

          {/* Home Data Nodes */}
          {showHome &&
            homeSeries.map((c) => {
              const cx = chartGeometry.xForSlot(c.slot);
              const cy = chartGeometry.yForElo(c.elo);
              const isSelected = c.slot === activeSlot;
              return (
                <g key={`home-${c.slot}`}>
                  {isSelected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={8}
                      fill="var(--accent-default)"
                      fillOpacity={0.2}
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 4.5 : 3.3}
                    fill="var(--accent-default)"
                    stroke="var(--bg-card)"
                    strokeWidth={1.6}
                  />
                </g>
              );
            })}

          {/* X-Axis Labels */}
          {slotLabels.map((lbl, slot) => {
            const x = chartGeometry.xForSlot(slot);
            const isActive = slot === activeSlot;
            return (
              <text
                key={lbl}
                x={x}
                y={chartGeometry.height - 5}
                textAnchor="middle"
                className={`text-[10px] font-semibold tabular-nums ${
                  isActive ? 'fill-[var(--text-primary)]' : 'fill-[var(--text-muted)]'
                }`}
              >
                {slot === 5 ? 'Now' : lbl}
              </text>
            );
          })}

          {/* Interactive Column Hit Targets */}
          {slotLabels.map((lbl, slot) => {
            const colWidth = chartGeometry.plotW / 5;
            const x = chartGeometry.xForSlot(slot) - colWidth / 2;
            return (
              <rect
                key={`hit-${lbl}`}
                x={x}
                y={0}
                width={colWidth}
                height={chartGeometry.height}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setActiveSlot(slot)}
                onClick={() => setActiveSlot(slot)}
              />
            );
          })}
        </svg>

        {/* Keyboard & Touch Step Selector Row */}
        <div
          role="tablist"
          aria-label="Select match step in 5-match Elo trend"
          className="mt-1 grid grid-cols-6 gap-1"
        >
          {slotLabels.map((lbl, slot) => {
            const isActive = slot === activeSlot;
            return (
              <button
                key={`step-${lbl}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveSlot(slot)}
                className={`min-h-[28px] rounded-lg text-2xs font-semibold tabular-nums whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                  isActive
                    ? 'bg-theme-subtle text-theme-main'
                    : 'text-theme-dim hover:text-theme-main hover:bg-theme-subtle/50'
                }`}
              >
                {slot === 5 ? 'M5 · Now' : lbl}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Step Context Inspector */}
      <div className="divide-y divide-[var(--border-subdued)] text-xs tabular-nums pt-0.5 pb-1">
        {focus !== 'AWAY' && (
          <div className="px-3 py-2 flex items-center justify-between gap-2 min-w-0">
            {homeCoordAtSlot ? (
              homeCoordAtSlot.point ? (
                <>
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="font-semibold text-theme-primary shrink-0">
                      {homeCoordAtSlot.point.result}
                    </span>
                    <span className="text-theme-dim shrink-0">
                      {homeCoordAtSlot.point.isHome ? 'H' : 'A'}
                    </span>
                    <span className="text-theme-main font-medium truncate">
                      vs {homeCoordAtSlot.point.opponent}
                    </span>
                    <span className="text-theme-dim shrink-0 hidden sm:inline">
                      ({homeCoordAtSlot.point.opponentElo})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-theme-sub">
                      {homeCoordAtSlot.point.goalsFor}-{homeCoordAtSlot.point.goalsAgainst}
                    </span>
                    <span
                      className={`font-semibold ${
                        homeCoordAtSlot.point.eloDelta > 0
                          ? 'text-theme-success'
                          : homeCoordAtSlot.point.eloDelta < 0
                          ? 'text-theme-danger'
                          : 'text-theme-sub'
                      }`}
                    >
                      {formatSignedDelta(homeCoordAtSlot.point.eloDelta)}
                    </span>
                    <span className="font-bold text-theme-main">{homeCoordAtSlot.elo}</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-theme-sub truncate">
                    {homeTeam} · Baseline
                  </span>
                  <span className="font-bold text-theme-primary shrink-0">{homeCoordAtSlot.elo}</span>
                </>
              )
            ) : (
              <>
                <span className="text-theme-dim truncate">{homeTeam} · No match</span>
                <span className="text-theme-dim shrink-0">-</span>
              </>
            )}
          </div>
        )}

        {focus !== 'HOME' && (
          <div className="px-3 py-2 flex items-center justify-between gap-2 min-w-0">
            {awayCoordAtSlot ? (
              awayCoordAtSlot.point ? (
                <>
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="font-semibold text-theme-info shrink-0">
                      {awayCoordAtSlot.point.result}
                    </span>
                    <span className="text-theme-dim shrink-0">
                      {awayCoordAtSlot.point.isHome ? 'H' : 'A'}
                    </span>
                    <span className="text-theme-main font-medium truncate">
                      vs {awayCoordAtSlot.point.opponent}
                    </span>
                    <span className="text-theme-dim shrink-0 hidden sm:inline">
                      ({awayCoordAtSlot.point.opponentElo})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-theme-sub">
                      {awayCoordAtSlot.point.goalsFor}-{awayCoordAtSlot.point.goalsAgainst}
                    </span>
                    <span
                      className={`font-semibold ${
                        awayCoordAtSlot.point.eloDelta > 0
                          ? 'text-theme-success'
                          : awayCoordAtSlot.point.eloDelta < 0
                          ? 'text-theme-danger'
                          : 'text-theme-sub'
                      }`}
                    >
                      {formatSignedDelta(awayCoordAtSlot.point.eloDelta)}
                    </span>
                    <span className="font-bold text-theme-main">{awayCoordAtSlot.elo}</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-theme-sub truncate">
                    {awayTeam} · Baseline
                  </span>
                  <span className="font-bold text-theme-info shrink-0">
                    {awayCoordAtSlot.elo}
                  </span>
                </>
              )
            ) : (
              <>
                <span className="text-theme-dim truncate">{awayTeam} · No match</span>
                <span className="text-theme-dim shrink-0">-</span>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
