import React from 'react';
import { PoissonPrediction } from '../core/types.js';
import { SectionHeader } from './ui/index.js';

interface PoissonMatrixViewProps {
  prediction: PoissonPrediction;
  homeTeam: string;
  awayTeam: string;
  showTopScores?: boolean;
}

export const PoissonMatrixView: React.FC<PoissonMatrixViewProps> = ({
  prediction,
  homeTeam,
  awayTeam,
  showTopScores = false,
}) => {
  const matrix = prediction.probabilityMatrix || [];

  let maxProb = 0.01;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < (matrix[r]?.length || 0); c++) {
      if (matrix[r][c] > maxProb) maxProb = matrix[r][c];
    }
  }

  const getHeatmapColor = (prob: number) => {
    const intensity = Math.min(1, prob / maxProb);
    if (intensity < 0.08) return 'bg-theme-subtle text-theme-sub';
    if (intensity < 0.25) return 'bg-theme-primary-subtle text-theme-primary font-bold';
    if (intensity < 0.55) return 'bg-theme-primary-subtle text-theme-primary font-black';
    if (intensity < 0.8) return 'bg-theme-primary/60 text-theme-primary-text font-black';
    return 'bg-theme-primary text-theme-primary-text font-black';
  };

  return (
    <div className="space-y-3 font-sans text-theme-main">
      <SectionHeader
        title="Scoreline Grid"
        size="sm"
        action={
          <div className="text-[10px] font-mono tabular-nums text-theme-sub whitespace-nowrap">
            <span className="font-bold text-theme-main">
              {homeTeam} ({prediction.homeXG})
            </span>
            <span className="px-1 text-theme-dim">vs</span>
            <span className="font-bold text-theme-main">
              ({prediction.awayXG}) {awayTeam}
            </span>
          </div>
        }
      />

      <div className="overflow-x-auto no-scrollbar">
        <div className="inline-block min-w-full">
          <div className="grid grid-cols-7 gap-1 text-center font-mono tabular-nums">
            <div className="p-1 text-theme-dim text-[8.5px] flex items-center justify-center font-bold">
              H \ A
            </div>
            {[0, 1, 2, 3, 4, 5].map((ag) => (
              <div
                key={`away-h-${ag}`}
                className="p-1.5 bg-theme-subtle rounded-lg text-theme-main font-bold text-[10px]"
              >
                {ag}
              </div>
            ))}

            {[0, 1, 2, 3, 4, 5].map((hg) => (
              <React.Fragment key={`row-${hg}`}>
                <div className="p-1.5 bg-theme-subtle rounded-lg text-theme-main font-bold text-[10px] flex items-center justify-center">
                  {hg}
                </div>
                {[0, 1, 2, 3, 4, 5].map((ag) => {
                  const prob = matrix[hg]?.[ag] || 0;
                  const pct = (prob * 100).toFixed(1);
                  return (
                    <div
                      key={`cell-${hg}-${ag}`}
                      className={`p-1.5 rounded-lg transition-colors duration-150 text-[9px] flex flex-col items-center justify-center font-mono tabular-nums ${getHeatmapColor(
                        prob
                      )}`}
                      title={`${homeTeam} ${hg} - ${ag} ${awayTeam}: ${pct}%`}
                    >
                      <span>{pct}%</span>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {showTopScores && (
        <div className="pt-1.5 space-y-1.5">
          <SectionHeader title="Top Scorelines" size="sm" />
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {prediction.topCorrectScores?.map((score, idx) => (
              <div
                key={score.score}
                className={`p-2 rounded-xl text-center font-mono tabular-nums transition-colors duration-150 ${
                  idx === 0
                    ? 'bg-theme-primary-subtle text-theme-primary font-extrabold'
                    : 'bg-theme-subtle text-theme-main'
                }`}
              >
                <div className="text-[11px] font-black">{score.score}</div>
                <div className="text-[9px] font-bold">{(score.probability * 100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
