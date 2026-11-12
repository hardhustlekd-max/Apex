import React, { useEffect, useState } from 'react';
import { Fixture } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import { CheckCircle2, XCircle, RefreshCw, BarChart3, ShieldCheck, Target, Layers, Database } from 'lucide-react';
import { getLeaguePriority } from '../core/leaguePriority.js';
import { normalizeDateStr, normalizeTimeStr } from '../core/dateUtils.js';

interface PredictionHistoryViewProps {
  isProcessingActive?: boolean;
  onTriggerFullSync?: () => void;
  onSelectDetail?: (fixture: Fixture) => void;
}

export const PredictionHistoryView: React.FC<PredictionHistoryViewProps> = ({
  isProcessingActive = false,
  onTriggerFullSync,
  onSelectDetail,
}) => {
  const [history, setHistory] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSyncingHistory, setIsSyncingHistory] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [limit, setLimit] = useState<number>(50);

  const fetchHistory = async (recordLimit = limit, showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const data = await EngineService.getHistoricalMatches('ALL', recordLimit);
      const completedOnly = (data || []).filter(f => f.status === 'FINISHED' && f.score?.home !== undefined && f.score?.away !== undefined);
      const sorted = completedOnly.slice().sort((a, b) => {
        const dateA = normalizeDateStr(a.matchDate);
        const dateB = normalizeDateStr(b.matchDate);
        
        // Date Descending
        if (dateA !== dateB) return dateB.localeCompare(dateA);

        // Time Descending (Time can be 'FT' or 'HH:mm')
        const timeA = normalizeTimeStr(a.kickOffTime || '00:00');
        const timeB = normalizeTimeStr(b.kickOffTime || '00:00');
        return timeB.localeCompare(timeA);
      });
      setHistory(sorted);
    } catch (err) {
      console.error('Error fetching historical predictions:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleSyncHistoryScraper = async () => {
    setIsSyncingHistory(true);
    setSyncToast('Historical archive scraper running: fetching multi-year league feeds from Flashscore...');
    try {
      const res = await EngineService.syncHistoryOnly();
      if (res.success) {
        setSyncToast(res.message || 'Historical database populated with fresh archive scraper data!');
        await fetchHistory(limit, true);
      } else {
        setSyncToast(res.message || 'Historical scraper sync encountered an issue.');
      }
    } catch (err) {
      console.error('Error syncing historical scraper:', err);
      setSyncToast('Failed to execute historical archive scraper.');
    } finally {
      setIsSyncingHistory(false);
      setTimeout(() => setSyncToast(null), 4500);
    }
  };

  useEffect(() => {
    fetchHistory(limit);
  }, [limit]);

  const evaluatePrediction = (f: Fixture) => {
    const hG = f.score?.home ?? 0;
    const aG = f.score?.away ?? 0;
    const pred = f.prediction;

    let isCorrect = false;
    let predictedLabel = 'Unknown';
    let topProb = 0;
    let predicted1X2 = 'HOME_WIN';

    if (pred) {
      const hw = pred.homeWinProb || 0;
      const dr = pred.drawProb || 0;
      const aw = pred.awayWinProb || 0;
      if (hw >= dr && hw >= aw) {
        predicted1X2 = 'HOME_WIN';
        predictedLabel = `${f.homeTeam} Win`;
        topProb = hw;
      } else if (aw >= hw && aw >= dr) {
        predicted1X2 = 'AWAY_WIN';
        predictedLabel = `${f.awayTeam} Win`;
        topProb = aw;
      } else {
        predicted1X2 = 'DRAW';
        predictedLabel = 'Draw';
        topProb = dr;
      }
    } else {
      predicted1X2 = 'HOME_WIN';
      predictedLabel = `${f.homeTeam} Win`;
      topProb = 0.45;
    }

    const actual1X2 = hG > aG ? 'HOME_WIN' : hG < aG ? 'AWAY_WIN' : 'DRAW';
    isCorrect = predicted1X2 === actual1X2;

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
      <div className="bg-theme-card rounded-3xl p-10 text-center font-sans shadow-xs border border-theme">
        <div className="w-8 h-8 rounded-full border-4 border-theme-primary border-t-transparent animate-spin mx-auto" />
        <span className="mt-4 block text-xs font-bold text-theme-sub">Loading historical model predictions from server database...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 font-sans">
      {/* Toast Notification for Scraper Sync */}
      {syncToast && (
        <div className="p-3 rounded-2xl bg-theme-card text-theme-primary border border-theme text-xs font-mono font-bold flex items-center justify-between gap-2 shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <Database className={`w-4 h-4 shrink-0 ${isSyncingHistory ? 'animate-spin text-theme-primary' : 'text-theme-primary'}`} />
            <span>{syncToast}</span>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h2 className="text-sm sm:text-base font-extrabold text-theme-main flex items-center gap-1.5 tracking-tight">
            <BarChart3 className="w-4 h-4 text-theme-primary" />
            Historical Prediction Evaluation
          </h2>
          <p className="text-xs text-theme-sub mt-0.5">
            Compare stored predictions against historical match results from the database
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3 py-1.5 min-h-[35px] rounded-full bg-theme-subtle border border-theme text-xs font-bold text-theme-main focus:outline-none shadow-xs cursor-pointer font-mono tabular-nums"
          >
            <option value={30}>30 Matches</option>
            <option value={50}>50 Matches</option>
            <option value={100}>100 Matches</option>
            <option value={200}>200 Matches</option>
          </select>

          {/* Sync Historical Data Scraper Button */}
          <button
            onClick={handleSyncHistoryScraper}
            disabled={isSyncingHistory || isRefreshing || isProcessingActive}
            className="inline-flex items-center gap-1.5 min-h-[35px] px-3.5 py-1.5 rounded-full text-xs font-black bg-theme-main text-theme-card hover:opacity-90 transition-all disabled:opacity-50 active:scale-95 shadow-xs cursor-pointer"
            title="Run historical archive scraper to populate database with multi-year results"
          >
            <Database className={`w-3.5 h-3.5 ${isSyncingHistory ? 'animate-spin text-theme-primary' : 'text-theme-primary'}`} />
            <span>{isSyncingHistory ? 'Syncing Scraper...' : 'Sync Historical Data'}</span>
          </button>

          <button
            onClick={() => fetchHistory(limit, true)}
            disabled={isRefreshing || isSyncingHistory || isProcessingActive}
            className="inline-flex items-center gap-1 min-h-[35px] px-3.5 py-1.5 rounded-full text-xs font-black bg-theme-primary hover:opacity-90 text-theme-primary-text transition-all disabled:opacity-50 active:scale-95 shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Summary Stats Cards */}
      {totalEvaluated > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div className="bg-theme-card border border-theme rounded-2xl p-4 shadow-xs">
            <div className="flex items-center gap-1 text-theme-sub text-xs font-semibold mb-1">
              <Layers className="w-3.5 h-3.5 text-theme-primary" />
              <span>Evaluated Matches</span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-theme-main">
              {totalEvaluated}
            </div>
          </div>

          <div className="bg-theme-card border border-theme rounded-2xl p-4 shadow-xs">
            <div className="flex items-center gap-1 text-theme-sub text-xs font-semibold mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-theme-primary" />
              <span>Model Accuracy</span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-theme-primary">
              {accuracyPct}%
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-theme-card border border-theme rounded-2xl p-4 shadow-xs">
            <div className="flex items-center gap-1 text-theme-sub text-xs font-semibold mb-1">
              <Target className="w-3.5 h-3.5 text-theme-primary" />
              <span>Correct Hits</span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-theme-main">
              {correctCount} <span className="text-xs font-bold text-theme-sub">/ {totalEvaluated}</span>
            </div>
          </div>
        </div>
      )}

      {/* Fixtures List */}
      {history.length === 0 ? (
        <div className="bg-theme-card border border-theme rounded-2xl p-8 text-center text-xs shadow-xs space-y-4">
          <div className="w-10 h-10 rounded-2xl bg-theme-primary-subtle flex items-center justify-center text-theme-primary mx-auto shadow-xs">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-theme-main">
              No historical predictions recorded in database yet
            </h3>
            <p className="text-xs text-theme-sub font-medium max-w-sm mx-auto">
              Run a full sync to fetch Flashscore match archives, evaluate Poisson predictions, and build accuracy logs.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {onTriggerFullSync && (
              <button
                type="button"
                onClick={onTriggerFullSync}
                className="inline-flex items-center gap-2 min-h-[36px] px-4 py-2 rounded-full text-xs font-black bg-theme-primary text-theme-primary-text transition-all active:scale-95 shadow-md cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Start Full Sync & Update Data</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => fetchHistory(limit, true)}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-4 py-2 rounded-full text-xs font-bold bg-theme-subtle text-theme-main transition-all active:scale-95 shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Evaluate Historical Database</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden bg-theme-card border border-theme shadow-xs">
          {history.map((f) => {
            const evalResult = evaluatePrediction(f);

            return (
              <div
                key={f.id}
                onClick={() => onSelectDetail?.(f)}
                className="px-4 py-2.5 hover:bg-theme-subtle transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10.5px] cursor-pointer group"
                role="button"
                tabIndex={0}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-extrabold text-theme-main text-[10.5px] sm:text-xs">
                      {f.homeTeam} <span className="text-theme-sub font-normal">vs</span> {f.awayTeam}
                    </span>
                    <span className="text-[8.5px] font-mono tabular-nums font-bold px-1.5 py-0.5 rounded-full bg-theme-subtle text-theme-sub">
                      {f.leagueName || f.league}
                    </span>
                    <span className="text-[8.5px] font-mono tabular-nums text-theme-sub">
                      {f.matchDate}
                    </span>
                  </div>

                  <div className="text-[9.5px] text-theme-sub font-mono tabular-nums flex items-center gap-2 flex-wrap">
                    <span>
                      Final Score: <strong className="text-theme-main font-black">{evalResult.hG} - {evalResult.aG}</strong>
                    </span>
                    <span className="text-theme-sub">•</span>
                    <span>
                      Model Pick: <strong className="text-theme-main font-black">{evalResult.predictedLabel}</strong> ({(evalResult.topProb * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9.5px] font-black ${
                      evalResult.isCorrect
                        ? 'bg-theme-primary text-theme-primary-text font-mono tabular-nums'
                        : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 font-mono tabular-nums'
                    }`}
                  >
                    {evalResult.isCorrect ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-theme-primary-text" />
                        <span>Hit</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3 text-rose-500" />
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

