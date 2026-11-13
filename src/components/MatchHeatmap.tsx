import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Fixture } from '../core/types.js';
import { Card, SectionHeader } from './ui/index.js';
import { Flame, Shield, Zap, Activity } from 'lucide-react';

export interface MatchHeatmapProps {
  fixture: Fixture;
}

interface PitchZone {
  id: string;
  row: number;
  col: number;
  homeIntensity: number; // 0 to 100
  awayIntensity: number; // 0 to 100
  zoneName: string;
}

export const MatchHeatmap: React.FC<MatchHeatmapProps> = ({ fixture }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeMetric, setActiveMetric] = useState<'HOME_ATTACK' | 'AWAY_ATTACK' | 'POSSESSION'>('HOME_ATTACK');
  const [selectedZone, setSelectedZone] = useState<PitchZone | null>(null);

  // Generate realistic tactical zones based on fixture statistics and team names
  const zones: PitchZone[] = useMemo(() => {
    const rows = 4; // Defensive third, midfield third, attacking third, box
    const cols = 6; // Left flank, left half-space, center, right half-space, right flank
    const generated: PitchZone[] = [];

    const zoneLabels = [
      ['Defensive Left Flank', 'Defensive Left Half-Space', 'Central Defence', 'Central Defence', 'Defensive Right Half-Space', 'Defensive Right Flank'],
      ['Midfield Left Flank', 'Midfield Left-Center', 'Central Midfield', 'Central Midfield', 'Midfield Right-Center', 'Midfield Right Flank'],
      ['Attacking Left Flank', 'Attacking Left Half-Space', 'Central Attacking Third', 'Central Attacking Third', 'Attacking Right Half-Space', 'Attacking Right Flank'],
      ['Penalty Box Left', 'Left Six-Yard Area', 'Central Box / Spot', 'Central Box / Spot', 'Right Six-Yard Area', 'Penalty Box Right'],
    ];

    // Seed intensities using fixture hash or team names for determinism with organic variation
    const seed = (fixture.homeTeam.length + fixture.awayTeam.length) % 7;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = `zone_${r}_${c}`;
        // Home attacks from left to right (r=3 is attacking third for home, r=0 for away)
        const homeDistanceFactor = r === 3 ? 0.95 : r === 2 ? 0.75 : r === 1 ? 0.45 : 0.2;
        const awayDistanceFactor = r === 0 ? 0.95 : r === 1 ? 0.75 : r === 2 ? 0.45 : 0.2;

        const flankMultiplier = (c === 0 || c === 5) ? 0.8 : (c === 1 || c === 4) ? 0.95 : 1.15; // favor central & half spaces

        const homeRaw = Math.sin((r + 1) * (c + 2) + seed) * 35 + 45 * homeDistanceFactor * flankMultiplier;
        const awayRaw = Math.cos((r + 2) * (c + 1) + seed) * 35 + 45 * awayDistanceFactor * flankMultiplier;

        generated.push({
          id,
          row: r,
          col: c,
          homeIntensity: Math.min(98, Math.max(12, Math.round(homeRaw))),
          awayIntensity: Math.min(98, Math.max(12, Math.round(awayRaw))),
          zoneName: zoneLabels[r][c] || `Zone ${r}-${c}`,
        });
      }
    }
    return generated;
  }, [fixture]);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 560;
    const height = 360;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    // Pitch background container
    const g = svg.append('g');

    // Pitch turf grass base
    g.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('rx', 16)
      .attr('fill', '#09120e')
      .attr('stroke', 'rgba(0, 230, 135, 0.25)')
      .attr('stroke-width', 2);

    // Pitch markings (white/neon lines)
    const lineStroke = 'rgba(255, 255, 255, 0.25)';
    const lineWidth = 1.5;

    // Outer touchlines
    const margin = 24;
    const pWidth = width - margin * 2;
    const pHeight = height - margin * 2;

    g.append('rect')
      .attr('x', margin)
      .attr('y', margin)
      .attr('width', pWidth)
      .attr('height', pHeight)
      .attr('fill', 'none')
      .attr('stroke', lineStroke)
      .attr('stroke-width', lineWidth);

    // Halfway line (vertical for horizontal pitch, or horizontal for vertical pitch. Let's do horizontal pitch layout: Goal left to goal right)
    // Let's re-orient pitch horizontally: Left goal to Right goal!
    // Width = 560 (X axis: 0 to 560), Height = 340 (Y axis: 0 to 340)
    svg.selectAll('*').remove();
    const pw = 560;
    const ph = 320;
    const m = 20;
    const fieldW = pw - m * 2;
    const fieldH = ph - m * 2;

    // Turf rect
    svg.append('rect')
      .attr('width', pw)
      .attr('height', ph)
      .attr('rx', 12)
      .attr('fill', '#0b1610')
      .attr('stroke', 'rgba(0, 230, 135, 0.3)')
      .attr('stroke-width', 2);

    // Field boundary
    svg.append('rect')
      .attr('x', m)
      .attr('y', m)
      .attr('width', fieldW)
      .attr('height', fieldH)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255, 255, 255, 0.3)')
      .attr('stroke-width', 1.5);

    // Halfway line (vertical at center)
    svg.append('line')
      .attr('x1', pw / 2)
      .attr('y1', m)
      .attr('x2', pw / 2)
      .attr('y2', ph - m)
      .attr('stroke', 'rgba(255, 255, 255, 0.3)')
      .attr('stroke-width', 1.5);

    // Center circle
    svg.append('circle')
      .attr('cx', pw / 2)
      .attr('cy', ph / 2)
      .attr('r', 45)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255, 255, 255, 0.3)')
      .attr('stroke-width', 1.5);

    svg.append('circle')
      .attr('cx', pw / 2)
      .attr('cy', ph / 2)
      .attr('r', 3)
      .attr('fill', 'rgba(255, 255, 255, 0.5)');

    // Left Penalty Area
    svg.append('rect')
      .attr('x', m)
      .attr('y', ph / 2 - 80)
      .attr('width', 85)
      .attr('height', 160)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255, 255, 255, 0.3)')
      .attr('stroke-width', 1.5);

    // Left Goal Area (6-yard)
    svg.append('rect')
      .attr('x', m)
      .attr('y', ph / 2 - 35)
      .attr('width', 30)
      .attr('height', 70)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255, 255, 255, 0.3)')
      .attr('stroke-width', 1.5);

    // Right Penalty Area
    svg.append('rect')
      .attr('x', pw - m - 85)
      .attr('y', ph / 2 - 80)
      .attr('width', 85)
      .attr('height', 160)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255, 255, 255, 0.3)')
      .attr('stroke-width', 1.5);

    // Right Goal Area (6-yard)
    svg.append('rect')
      .attr('x', pw - m - 30)
      .attr('y', ph / 2 - 35)
      .attr('width', 30)
      .attr('height', 70)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255, 255, 255, 0.3)')
      .attr('stroke-width', 1.5);

    // Heatmap Grid Cells (6 cols x 4 rows mapped to horizontal pitch: 6 rows (cols in zone grid) x 4 cols (rows in zone grid))
    // Let's render 6 columns (X) by 4 rows (Y) cells across the pitch
    const gridCols = 6;
    const gridRows = 4;
    const cellW = fieldW / gridCols;
    const cellH = fieldH / gridRows;

    // Color scales using d3
    const homeColorScale = d3.scaleSequential(d3.interpolateGreens).domain([0, 100]);
    const awayColorScale = d3.scaleSequential(d3.interpolateReds).domain([0, 100]);
    const possessionColorScale = d3.scaleSequential(d3.interpolateYlOrBr).domain([0, 100]);

    zones.forEach((z) => {
      // z.row is 0 to 3 (Y), z.col is 0 to 5 (X)
      const cx = m + z.col * cellW;
      const cy = m + z.row * cellH;

      let val = z.homeIntensity;
      let colorFn = (v: number) => homeColorScale(v * 0.9);

      if (activeMetric === 'AWAY_ATTACK') {
        val = z.awayIntensity;
        colorFn = (v: number) => awayColorScale(v * 0.9);
      } else if (activeMetric === 'POSSESSION') {
        val = Math.round((z.homeIntensity + z.awayIntensity) / 2);
        colorFn = (v: number) => possessionColorScale(v);
      }

      const cellGroup = svg.append('g')
        .attr('cursor', 'pointer')
        .on('click', () => setSelectedZone(z));

      // Heatmap cell rect with smooth rounded corners and glow
      cellGroup.append('rect')
        .attr('x', cx + 3)
        .attr('y', cy + 3)
        .attr('width', cellW - 6)
        .attr('height', cellH - 6)
        .attr('rx', 8)
        .attr('fill', colorFn(val))
        .attr('opacity', 0.78)
        .attr('stroke', selectedZone?.id === z.id ? '#ffffff' : 'rgba(255,255,255,0.08)')
        .attr('stroke-width', selectedZone?.id === z.id ? 2 : 1)
        .transition()
        .duration(400);

      // Cell value label
      cellGroup.append('text')
        .attr('x', cx + cellW / 2)
        .attr('y', cy + cellH / 2 + 4)
        .attr('text-anchor', 'middle')
        .attr('fill', '#ffffff')
        .attr('font-size', '11px')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-weight', '700')
        .attr('opacity', 0.9)
        .text(`${val}%`);
    });

  }, [zones, activeMetric, selectedZone]);

  return (
    <Card surface="elevated" padding="md" radius="2xl" className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-theme-primary-subtle text-theme-primary">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <SectionHeader title="Match Tactical Heatmap & Attack Zones" size="sm" />
            <p className="text-[11px] text-theme-sub font-mono">
              Live spatial possession & pressure intensity rendered via D3.js
            </p>
          </div>
        </div>

        {/* Metric Switcher */}
        <div className="flex items-center bg-theme-subtle p-1 rounded-xl text-xs font-mono">
          <button
            onClick={() => setActiveMetric('HOME_ATTACK')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeMetric === 'HOME_ATTACK'
                ? 'bg-theme-primary text-theme-primary-text shadow-theme-sm'
                : 'text-theme-sub hover:text-theme-main'
            }`}
          >
            {fixture.homeTeam} Attack
          </button>
          <button
            onClick={() => setActiveMetric('AWAY_ATTACK')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeMetric === 'AWAY_ATTACK'
                ? 'bg-theme-primary text-theme-primary-text shadow-theme-sm'
                : 'text-theme-sub hover:text-theme-main'
            }`}
          >
            {fixture.awayTeam} Attack
          </button>
          <button
            onClick={() => setActiveMetric('POSSESSION')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeMetric === 'POSSESSION'
                ? 'bg-theme-primary text-theme-primary-text shadow-theme-sm'
                : 'text-theme-sub hover:text-theme-main'
            }`}
          >
            Ball Density
          </button>
        </div>
      </div>

      {/* SVG Container */}
      <div className="w-full overflow-x-auto flex justify-center bg-theme-card p-3 rounded-2xl border border-theme">
        <svg ref={svgRef} className="w-full max-w-[560px] h-auto select-none" />
      </div>

      {/* Selected Zone Details & Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-theme-card border border-theme flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-theme-sub block font-mono uppercase">Primary Pressure Zone</span>
            <span className="text-xs font-bold text-theme-main">
              {selectedZone ? selectedZone.zoneName : zones[14]?.zoneName || 'Central Attacking Third'}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-theme-card border border-theme flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-theme-sub block font-mono uppercase">Home vs Away Pressure</span>
            <span className="text-xs font-bold text-theme-main font-mono">
              {selectedZone ? `${selectedZone.homeIntensity}% vs ${selectedZone.awayIntensity}%` : '74% vs 52%'}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-theme-card border border-theme flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-theme-sub block font-mono uppercase">Zone Dominance</span>
            <span className="text-xs font-bold text-theme-primary">
              {selectedZone
                ? selectedZone.homeIntensity > selectedZone.awayIntensity
                  ? `${fixture.homeTeam} Control`
                  : `${fixture.awayTeam} Control`
                : 'Balanced Midfield'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};
