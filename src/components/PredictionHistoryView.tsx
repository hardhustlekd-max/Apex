import React, { useEffect, useState } from 'react';
import { Fixture } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import { CheckCircle2, XCircle, RefreshCw, BarChart3, ShieldCheck, Target, Layers } from 'lucide-react';

export const PredictionHistoryView: React.FC = () => {
  const [history, setHistory] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [limit, setLimit] = useState<number>(50);

  const fetchHistory = async (recordLimit = limit, showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const data = await EngineService.getHistoricalMatches('ALL', recordLimit);
      setHistory(data);
    } catch (err) {
      console.error('Error fetching historical predictions:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory(limit);
  }, [limit]);

  const evaluatePrediction = (f: Fixture) => {
    const hG = f.score?.home ?? 0;
    const aG = f.score?.away ?? 0;
    const hProb = f.prediction?.homeWinProb ?? 0;
    const dProb = f.prediction?.drawProb ?? 0;
    const aProb = f.prediction?.awayWinProb ?? 0;

    let predictedWinner: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' = 'HOME_WIN';
    let topProb = hProb;

    if (dProb > hProb && dProb > aProb) {
      predictedWinner = 'DRAW';
      topProb = dProb;
    } else if (aProb > hProb && aProb > dProb) {
      predictedWinner = 'AWAY_WIN';
      topProb = aProb;
    }

    const actualWinner: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' =
      hG > aG ? 'HOME_WIN' : hG < aG ? 'AWAY_WIN' : 'DRAW';

    const isCorrect = predictedWinner === actualWinner;

    return {
      hG,
      aG,
      predictedWinner,
      actualWinner,
      topProb,
      isCorrect,
    };
  };

  const totalEvaluated = history.length;
  const correctCount = history.reduce((acc, f) => acc + (evaluatePrediction(f).isCorrect ? 1 : 0), 0);
  const accuracyPct = totalEvaluated > 0 ? ((correctCount / totalEvaluated) * 100).toFixed(1) : '0.0';

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-[#101728] rounded-3xl p-10 text-center font-sans shadow-[0_4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
        <div className="w-8 h-8 rounded-full border-4 border-slate-900 dark:border-[#A3FF12] border-t-transparent animate-spin mx-auto" />
        <span className="mt-4 block text-xs font-bold text-slate-400 dark:text-slate-500">Loading historical model predictions from server database...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2 tracking-tight">
            <BarChart3 className="w-4 h-4 text-emerald-500" />
            Historical Model Evaluation
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Backtested Poisson & Apex-Engine accuracy across stored historical database fixtures
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#162038] text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none shadow-xs"
          >
            <option value={30}>30 Matches</option>
            <option value={50}>50 Matches</option>
            <option value={100}>100 Matches</option>
            <option value={200}>200 Matches</option>
          </select>

          <button
            onClick={() => fetchHistory(limit, true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 dark:bg-[#A3FF12] dark:hover:bg-[#b5ff36] text-white dark:text-slate-950 transition-all disabled:opacity-50 hover:scale-105 active:scale-95 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Summary Stats Cards */}
      {totalEvaluated > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div className="bg-white dark:bg-[#101728] rounded-2xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-xs font-semibold mb-1">
              <Layers className="w-3.5 h-3.5 text-sky-500" />
              <span>Evaluated Matches</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {totalEvaluated}
            </div>
          </div>

          <div className="bg-white dark:bg-[#101728] rounded-2xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-xs font-semibold mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Model Accuracy</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {accuracyPct}%
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-white dark:bg-[#101728] rounded-2xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-xs font-semibold mb-1">
              <Target className="w-3.5 h-3.5 text-indigo-500" />
              <span>Correct Hits</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {correctCount} <span className="text-xs font-medium text-slate-400">/ {totalEvaluated}</span>
            </div>
          </div>
        </div>
      )}

      {/* Fixtures List */}
      {history.length === 0 ? (
        <div className="bg-white dark:bg-[#101728] rounded-2xl p-8 text-center text-xs font-medium text-slate-400 dark:text-slate-500 shadow-[0_4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] space-y-2.5">
          <p>No historical predictions recorded in database yet.</p>
          <button
            onClick={() => fetchHistory(limit, true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#A3FF12] hover:bg-[#b5ff36] text-slate-950 transition-all hover:scale-105 active:scale-95 shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Evaluate Historical Database
          </button>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden bg-white dark:bg-[#101728] divide-y divide-slate-100/60 dark:divide-[#18233a]/50 shadow-[0_4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
          {history.map((f) => {
            const evalResult = evaluatePrediction(f);
            const labelMap = {
              HOME_WIN: `${f.homeTeam} Win`,
              DRAW: 'Draw',
              AWAY_WIN: `${f.awayTeam} Win`,
            };

            return (
              <div
                key={f.id}
                className="px-4 py-2.5 sm:py-3 hover:bg-slate-50 dark:hover:bg-[#151f36] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-[13px]">
                      {f.homeTeam} <span className="text-slate-400 dark:text-slate-500 font-normal">vs</span> {f.awayTeam}
                    </span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-[#162038] text-slate-600 dark:text-slate-400">
                      {f.leagueName || f.league}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                      {f.matchDate}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-2.5 flex-wrap">
                    <span>
                      Final Score: <strong className="text-slate-900 dark:text-white font-bold">{evalResult.hG} - {evalResult.aG}</strong>
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span>
                      Predicted Top Pick: <strong className="text-slate-900 dark:text-white font-bold">{labelMap[evalResult.predictedWinner]}</strong> ({(evalResult.topProb * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-black ${
                      evalResult.isCorrect
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {evalResult.isCorrect ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        <span>Correct</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3 text-rose-500" />
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

