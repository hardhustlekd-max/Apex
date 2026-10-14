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

  const getHeatmapColor = (prob: number) => {
    const intensity = Math.min(1, prob / maxProb);
    if (intensity < 0.1) return 'bg-slate-100 dark:bg-slate-900/60 text-slate-400 dark:text-slate-500 shadow-2xs';
    if (intensity < 0.3) return 'bg-slate-50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-300 shadow-2xs';
    if (intensity < 0.6) return 'bg-slate-100 dark:bg-slate-900/60 text-slate-900 dark:text-slate-200 font-semibold shadow-2xs';
    return 'bg-slate-600 text-white font-bold shadow-xs shadow-slate-500/20';
  };

  return (
    <div className="space-y-3 font-sans">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
          Scoreline Probability Heatmap
        </h4>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
          <span className="text-slate-600 dark:text-slate-400 font-bold">{homeTeam} {prediction.homeXG}</span>
          <span className="text-slate-400 px-1 font-normal">vs</span>
          <span className="text-cyan-600 dark:text-cyan-400 font-bold">{prediction.awayXG} {awayTeam}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-mono">
            {/* Top Header Row (Away Goals) */}
            <div className="p-1 text-slate-400 dark:text-slate-500 font-sans text-[10px] flex items-center justify-center">
              Goals
            </div>
            {[0, 1, 2, 3, 4, 5].map((ag) => (
              <div key={`away-h-${ag}`} className="p-1.5 bg-slate-100 dark:bg-slate-900/60 rounded-xl text-cyan-700 dark:text-cyan-400 font-bold text-[11px] shadow-2xs">
                {ag}
              </div>
            ))}

            {/* Matrix Rows (Home Goals) */}
            {[0, 1, 2, 3, 4, 5].map((hg) => (
              <React.Fragment key={`row-${hg}`}>
                <div className="p-1.5 bg-slate-100 dark:bg-slate-900/60 rounded-xl text-slate-700 dark:text-slate-400 font-bold text-[11px] flex items-center justify-center shadow-2xs">
                  {hg}
                </div>
                {[0, 1, 2, 3, 4, 5].map((ag) => {
                  const prob = matrix[hg]?.[ag] || 0;
                  const pct = (prob * 100).toFixed(1);
                  return (
                    <div
                      key={`cell-${hg}-${ag}`}
                      className={`p-1.5 rounded-xl transition-colors text-[11px] flex flex-col items-center justify-center ${getHeatmapColor(
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

      {/* Top Correct Scores breakdown (optional) */}
      {showTopScores && (
        <div className="pt-2">
          <h5 className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mb-2">
            Top Scorelines
          </h5>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {prediction.topCorrectScores.map((score, idx) => (
              <div
                key={score.score}
                className={`p-2.5 rounded-xl text-center shadow-xs ${
                  idx === 0
                    ? 'bg-slate-50 dark:bg-slate-950/40 text-slate-900 dark:text-slate-300 shadow-sm'
                    : 'bg-white dark:bg-[#070A0F] text-slate-800 dark:text-slate-300'
                }`}
              >
                <div className="text-xs font-mono font-bold">{score.score}</div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
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

