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
    const totalGoals = hG + aG;
    const isBtts = hG > 0 && aG > 0;

    // Use stored pick (bestValueMarket) or fallback to most likely outcome
    const pick = f.bestValueMarket || f.mostLikelyOutcome || {
      key: 'HOME_WIN',
      name: `${f.homeTeam} Win`,
      probability: f.prediction?.homeWinProb ?? 0,
    };

    let isCorrect = false;
    let predictedLabel = pick.name;
    const topProb = pick.probability;

    switch (pick.key) {
      case 'HOME_WIN':
        isCorrect = hG > aG;
        break;
      case 'DRAW':
        isCorrect = hG === aG;
        break;
      case 'AWAY_WIN':
        isCorrect = hG < aG;
        break;
      case 'OVER_25':
        isCorrect = totalGoals > 2.5;
        break;
      case 'UNDER_25':
        isCorrect = totalGoals < 2.5;
        break;
      case 'BTTS_YES':
        isCorrect = isBtts;
        break;
      case 'BTTS_NO':
        isCorrect = !isBtts;
        break;
      case 'DOUBLE_CHANCE_1X':
        isCorrect = hG >= aG;
        break;
      case 'DOUBLE_CHANCE_X2':
        isCorrect = aG >= hG;
        break;
      default:
        // Fallback for 1X2 if market key is unknown
        const predictedWinner = hG > aG ? 'HOME_WIN' : hG < aG ? 'AWAY_WIN' : 'DRAW';
        isCorrect = pick.key === predictedWinner;
    }

    return {
      hG,
      aG,
      predictedLabel,
      topProb,
      isCorrect,
    };
  };

  const totalEvaluated = history.length;
  const correctCount = history.reduce((acc, f) => acc + (evaluatePrediction(f).isCorrect ? 1 : 0), 0);
  const accuracyPct = totalEvaluated > 0 ? ((correctCount / totalEvaluated) * 100).toFixed(1) : '0.0';

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-[#121212] rounded-3xl p-10 text-center font-sans border border-slate-200/80 dark:border-neutral-800 shadow-sm">
        <div className="w-8 h-8 rounded-full border-4 border-[#CCFF00] border-t-transparent animate-spin mx-auto" />
        <span className="mt-4 block text-xs font-bold text-slate-500 dark:text-neutral-400">Loading historical model predictions from server database...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-extrabold text-slate-950 dark:text-white flex items-center gap-2 tracking-tight">
            <BarChart3 className="w-5 h-5 text-[#CCFF00]" />
            Historical Model Evaluation
          </h2>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
            Backtested Poisson & Apex-Engine accuracy across stored historical database fixtures
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3.5 py-2 rounded-full bg-white dark:bg-neutral-800 border border-slate-200/80 dark:border-neutral-700 text-xs font-bold text-slate-900 dark:text-neutral-100 focus:outline-none shadow-xs"
          >
            <option value={30}>30 Matches</option>
            <option value={50}>50 Matches</option>
            <option value={100}>100 Matches</option>
            <option value={200}>200 Matches</option>
          </select>

          <button
            onClick={() => fetchHistory(limit, true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black bg-[#CCFF00] hover:bg-[#b8e600] text-slate-950 transition-all disabled:opacity-50 active:scale-95 shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Summary Stats Cards */}
      {totalEvaluated > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white dark:bg-[#121212] rounded-3xl p-5 border border-slate-200/80 dark:border-neutral-800 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-neutral-400 text-xs font-semibold mb-1">
              <Layers className="w-3.5 h-3.5 text-[#CCFF00]" />
              <span>Evaluated Matches</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-slate-950 dark:text-white">
              {totalEvaluated}
            </div>
          </div>

          <div className="bg-white dark:bg-[#121212] rounded-3xl p-5 border border-slate-200/80 dark:border-neutral-800 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-neutral-400 text-xs font-semibold mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#CCFF00]" />
              <span>Model Accuracy</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-slate-950 dark:text-[#CCFF00]">
              {accuracyPct}%
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-white dark:bg-[#121212] rounded-3xl p-5 border border-slate-200/80 dark:border-neutral-800 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-neutral-400 text-xs font-semibold mb-1">
              <Target className="w-3.5 h-3.5 text-[#CCFF00]" />
              <span>Correct Hits</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-slate-950 dark:text-white">
              {correctCount} <span className="text-xs font-bold text-slate-500 dark:text-neutral-500">/ {totalEvaluated}</span>
            </div>
          </div>
        </div>
      )}

      {/* Fixtures List */}
      {history.length === 0 ? (
        <div className="bg-white dark:bg-[#121212] rounded-3xl p-8 text-center text-xs font-medium text-slate-500 dark:text-neutral-400 border border-slate-200/80 dark:border-neutral-800 shadow-sm space-y-3">
          <p>No historical predictions recorded in database yet.</p>
          <button
            onClick={() => fetchHistory(limit, true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-black bg-[#CCFF00] text-slate-950 transition-all active:scale-95 shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Evaluate Historical Database
          </button>
        </div>
      ) : (
        <div className="rounded-3xl overflow-hidden bg-white dark:bg-[#121212] border border-slate-200/80 dark:border-neutral-800 divide-y divide-slate-100 dark:divide-neutral-800 shadow-sm">
          {history.map((f) => {
            const evalResult = evaluatePrediction(f);

            return (
              <div
                key={f.id}
                className="px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-neutral-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-slate-950 dark:text-white text-xs sm:text-[13px]">
                      {f.homeTeam} <span className="text-slate-400 dark:text-neutral-500 font-normal">vs</span> {f.awayTeam}
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-neutral-200">
                      {f.leagueName || f.league}
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-neutral-400">
                      {f.matchDate}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-neutral-400 font-mono tabular-nums flex items-center gap-2.5 flex-wrap">
                    <span>
                      Final Score: <strong className="text-slate-950 dark:text-white font-black">{evalResult.hG} - {evalResult.aG}</strong>
                    </span>
                    <span className="text-slate-300 dark:text-neutral-700">•</span>
                    <span>
                      Model Pick: <strong className="text-slate-950 dark:text-white font-black">{evalResult.predictedLabel}</strong> ({(evalResult.topProb * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black ${
                      evalResult.isCorrect
                        ? 'bg-[#CCFF00] text-slate-950'
                        : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {evalResult.isCorrect ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-950" />
                        <span>Hit</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 text-rose-500" />
                        <span>Missed</span>
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

