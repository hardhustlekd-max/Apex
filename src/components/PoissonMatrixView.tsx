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

  // Refined heatmap color palette based on Apex UI design system (Pitch Black & Electric Lime)
  const getHeatmapColor = (prob: number) => {
    const intensity = Math.min(1, prob / maxProb);
    if (intensity < 0.08) return 'bg-slate-50 dark:bg-[#121212] border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400';
    if (intensity < 0.25) return 'bg-lime-100 dark:bg-[#CCFF00]/10 border-lime-300 dark:border-[#CCFF00]/30 text-slate-900 dark:text-[#CCFF00] font-bold';
    if (intensity < 0.55) return 'bg-lime-300 dark:bg-[#CCFF00]/30 text-slate-950 dark:text-[#CCFF00] border-lime-400 dark:border-[#CCFF00]/50 font-bold';
    if (intensity < 0.8) return 'bg-lime-400 dark:bg-[#CCFF00]/60 text-slate-950 border-lime-500 dark:border-[#CCFF00]/80 font-black';
    return 'bg-[#CCFF00] text-slate-950 border-[#CCFF00] font-black shadow-xs';
  };

  return (
    <div className="space-y-3 font-sans text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between">
        <h4 className="text-[10.5px] font-black uppercase tracking-wider text-slate-900 dark:text-white">
          Scoreline Probability Grid (Poisson)
        </h4>
        <div className="text-[9.5px] font-mono text-slate-500 dark:text-slate-400">
          <span className="font-bold text-slate-900 dark:text-white">{homeTeam} ({prediction.homeXG})</span>
          <span className="px-1 text-slate-400">vs</span>
          <span className="font-bold text-slate-900 dark:text-white">({prediction.awayXG}) {awayTeam}</span>
        </div>
      </div>

      <div className="overflow-x-auto no-scrollbar">
        <div className="inline-block min-w-full">
          <div className="grid grid-cols-7 gap-1 text-center font-mono">
            {/* Top Header Row (Away Goals) */}
            <div className="p-1 text-slate-400 dark:text-slate-500 text-[8.5px] flex items-center justify-center font-bold">
              H \ A
            </div>
            {[0, 1, 2, 3, 4, 5].map((ag) => (
              <div
                key={`away-h-${ag}`}
                className="p-1.5 bg-slate-100 dark:bg-[#1E1E1E] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-slate-100 font-bold text-[10px]"
              >
                {ag}
              </div>
            ))}

            {/* Matrix Rows (Home Goals) */}
            {[0, 1, 2, 3, 4, 5].map((hg) => (
              <React.Fragment key={`row-${hg}`}>
                <div className="p-1.5 bg-slate-100 dark:bg-[#1E1E1E] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-slate-100 font-bold text-[10px] flex items-center justify-center">
                  {hg}
                </div>
                {[0, 1, 2, 3, 4, 5].map((ag) => {
                  const prob = matrix[hg]?.[ag] || 0;
                  const pct = (prob * 100).toFixed(1);
                  return (
                    <div
                      key={`cell-${hg}-${ag}`}
                      className={`p-1.5 rounded-lg border transition-colors text-[8.5px] flex flex-col items-center justify-center font-mono ${getHeatmapColor(
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
        <div className="pt-1.5">
          <h5 className="text-[10.5px] font-black uppercase tracking-wider text-slate-900 dark:text-white mb-1.5">
            Most Probable Scorelines
          </h5>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {prediction.topCorrectScores.map((score, idx) => (
              <div
                key={score.score}
                className={`p-2 rounded-xl border text-center font-mono ${
                  idx === 0
                    ? 'bg-[#CCFF00]/10 border-[#CCFF00]/40 text-slate-950 dark:text-[#CCFF00]'
                    : 'bg-slate-50 dark:bg-[#1E1E1E] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="text-[10.5px] font-black">{score.score}</div>
                <div className="text-[8.5px] font-bold">
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
