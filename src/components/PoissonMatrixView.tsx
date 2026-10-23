import React from 'react';
import { PoissonPrediction } from '../core/types.js';

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

  // Find max prob for color scaling
  let maxProb = 0.01;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < (matrix[r]?.length || 0); c++) {
      if (matrix[r][c] > maxProb) maxProb = matrix[r][c];
    }
  }

  // Refined heatmap color palette based on slate design system
  const getHeatmapColor = (prob: number) => {
    const intensity = Math.min(1, prob / maxProb);
    if (intensity < 0.08) return 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400';
    if (intensity < 0.25) return 'bg-sky-100 dark:bg-sky-950 border-sky-200 dark:border-sky-900 text-sky-800 dark:text-sky-300 font-bold';
    if (intensity < 0.55) return 'bg-sky-500 dark:bg-sky-700 text-white border-sky-600 dark:border-sky-600 font-bold';
    if (intensity < 0.8) return 'bg-sky-600 dark:bg-sky-600 text-white border-sky-700 dark:border-sky-700 font-bold';
    return 'bg-sky-900 dark:bg-sky-500 text-white dark:text-slate-900 border-sky-950 dark:border-sky-400 font-black';
  };

  return (
    <div className="space-y-4 font-sans">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-900 dark:text-white">
          Scoreline Probability Grid (Poisson)
        </h4>
        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
          <span className="font-bold text-slate-900 dark:text-white">{homeTeam} ({prediction.homeXG})</span>
          <span className="px-1 text-slate-400">vs</span>
          <span className="font-bold text-slate-900 dark:text-white">({prediction.awayXG}) {awayTeam}</span>
        </div>
      </div>

      <div className="overflow-x-auto no-scrollbar">
        <div className="inline-block min-w-full">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-mono">
            {/* Top Header Row (Away Goals) */}
            <div className="p-1 text-slate-400 dark:text-slate-500 text-[10px] flex items-center justify-center font-bold">
              H \ A
            </div>
            {[0, 1, 2, 3, 4, 5].map((ag) => (
              <div
                key={`away-h-${ag}`}
                className="p-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 font-bold text-xs"
              >
                {ag}
              </div>
            ))}

            {/* Matrix Rows (Home Goals) */}
            {[0, 1, 2, 3, 4, 5].map((hg) => (
              <React.Fragment key={`row-${hg}`}>
                <div className="p-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 font-bold text-xs flex items-center justify-center">
                  {hg}
                </div>
                {[0, 1, 2, 3, 4, 5].map((ag) => {
                  const prob = matrix[hg]?.[ag] || 0;
                  const pct = (prob * 100).toFixed(1);
                  return (
                    <div
                      key={`cell-${hg}-${ag}`}
                      className={`p-2 rounded-lg border transition-colors text-[10px] flex flex-col items-center justify-center ${getHeatmapColor(
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

      {/* Top Correct Scores breakdown */}
      {showTopScores && (
        <div className="pt-2">
          <h5 className="text-xs font-bold text-slate-900 dark:text-white mb-2">
            Most Probable Scorelines
          </h5>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {prediction.topCorrectScores.map((score, idx) => (
              <div
                key={score.score}
                className={`p-2.5 rounded-xl border text-center ${
                  idx === 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-400'
                    : 'bg-slate-50 dark:bg-slate-900/60 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="text-xs font-mono font-black">{score.score}</div>
                <div className="text-[10px] font-mono font-bold">
                  {(score.probability * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
