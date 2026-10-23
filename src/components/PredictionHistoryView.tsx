import React, { useEffect, useState } from 'react';
import { Fixture } from '../core/types';
import { predictionsDb } from '../core/predictionsDb';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

export const PredictionHistoryView: React.FC = () => {
  const [history, setHistory] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await predictionsDb.getHistoricalPredictions({ limit: 50 });
        setHistory(data);
      } catch (err) {
        console.error('Error fetching historical predictions:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, []);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center font-sans shadow-xs">
        <div className="w-8 h-8 rounded-full border-4 border-slate-900 dark:border-slate-100 border-t-transparent animate-spin mx-auto" />
        <span className="mt-4 block text-xs font-bold text-slate-500 dark:text-slate-400">Loading prediction history...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans">
      <div className="flex items-center justify-between">
        <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
          Historical Model Evaluation
        </h2>
        <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
          {history.length} records
        </span>
      </div>

      {history.length === 0 ? (
        <div className="bg-white dark:bg-[#0B0F17] rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center text-xs font-medium text-slate-500 dark:text-slate-400 shadow-xs">
          No historical predictions recorded in database yet.
        </div>
      ) : (
        <div className="border border-slate-100 dark:border-slate-800/80 rounded-2xl overflow-hidden bg-white dark:bg-[#0B0F17] divide-y divide-slate-100 dark:divide-slate-800 shadow-xs">
          {history.map((f) => {
            const isCorrect = (f.score?.home ?? 0) === (f.score?.away ?? 0)
              ? f.prediction?.drawProb && f.prediction.drawProb > 0.35
              : f.score?.home && f.score.away && (
                  (f.score.home > f.score.away && f.prediction?.homeWinProb && f.prediction.homeWinProb > 0.45) ||
                  (f.score.away > f.score.home && f.prediction?.awayWinProb && f.prediction.awayWinProb > 0.45)
                );

            return (
              <div
                key={f.id}
                className="px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors flex items-center justify-between gap-4 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {f.homeTeam} <span className="text-slate-500 dark:text-slate-400">vs</span> {f.awayTeam}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500">
                      ({f.matchDate})
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 font-mono">
                    Score: <strong className="text-slate-900 dark:text-white">{f.score?.home ?? 0} - {f.score?.away ?? 0}</strong>
                    {' '}· Predicted Home Win: {((f.prediction?.homeWinProb ?? 0) * 100).toFixed(0)}%
                  </div>
                </div>

                <div className="shrink-0">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold border ${
                      isCorrect
                        ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40'
                        : 'bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-400 border-rose-200 dark:border-rose-900/40'
                    }`}
                  >
                    {isCorrect ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Correct</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Incorrect</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
