import React, { useEffect, useState } from 'react';
import { Fixture } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import { CheckCircle2, XCircle, RefreshCw, BarChart3, ShieldCheck, Target, Layers, Database } from 'lucide-react';
import { normalizeDateStr, normalizeTimeStr } from '../core/dateUtils.js';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  SectionHeader,
  Select,
  StatTile,
} from './ui/index.js';

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
  const [summary, setSummary] = useState<{
    upcomingFixturesInDb: number;
    totalPredictions: number;
    upcomingPredictions: number;
    livePredictions: number;
    completedWithScore: number;
    completedAwaitingScore: number;
  } | null>(null);
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
      const { matches, summary: evalSummary } = await EngineService.getHistoricalEvaluation('ALL', recordLimit, showRefreshing);
      setSummary(evalSummary);

      const evaluatedOnly = (matches || []).filter(
        (f) =>
          f.prediction !== undefined &&
          f.status === 'FINISHED' &&
          f.score?.home !== undefined &&
          f.score?.away !== undefined
      );

      const sorted = evaluatedOnly.slice().sort((a, b) => {
        const dateA = normalizeDateStr(a.matchDate);
        const dateB = normalizeDateStr(b.matchDate);

        if (dateA !== dateB) return dateB.localeCompare(dateA);

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

    if (!pred) {
      return { hG, aG, predictedLabel: 'N/A', topProb: 0, isCorrect: false };
    }

    let isCorrect = false;
    let predictedLabel = 'Unknown';
    let topProb = 0;
    let predicted1X2 = 'HOME_WIN';

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
    return <LoadingState label="Loading..." minHeight="min-h-[240px]" />;
  }

  return (
    <div className="space-y-3 font-sans">
      {/* Toast Notification for Scraper Sync */}
      {syncToast && (
        <div
          role="status"
          className="p-3 rounded-2xl bg-theme-card text-theme-primary text-xs font-mono font-bold flex items-center justify-between gap-2 shadow-theme-md animate-in fade-in slide-in-from-top-2"
        >
          <div className="flex items-center gap-2">
            <Database className={`w-4 h-4 shrink-0 ${isSyncingHistory ? 'animate-spin text-theme-primary' : 'text-theme-primary'}`} />
            <span>{syncToast}</span>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <SectionHeader
          title="Prediction History"
          icon={<BarChart3 className="w-4 h-4 text-theme-primary" />}
          size="md"
        />

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <Select
            aria-label="History match limit"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            surface="subtle"
            selectSize="sm"
            options={[
              { value: 30, label: '30 Matches' },
              { value: 50, label: '50 Matches' },
              { value: 100, label: '100 Matches' },
              { value: 200, label: '200 Matches' },
            ]}
          />

          <Button
            variant="inverse"
            size="sm"
            pill
            onClick={handleSyncHistoryScraper}
            disabled={isSyncingHistory || isRefreshing || isProcessingActive}
            title="Run historical archive scraper to populate database with multi-year results"
          >
            <Database className={`w-3.5 h-3.5 ${isSyncingHistory ? 'animate-spin text-theme-primary' : 'text-theme-primary'}`} />
            <span>{isSyncingHistory ? 'Syncing Scraper...' : 'Sync Historical Data'}</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            pill
            onClick={() => fetchHistory(limit, true)}
            disabled={isRefreshing || isSyncingHistory || isProcessingActive}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Summary Stats Cards */}
      {totalEvaluated > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <StatTile
            label="Evaluated Matches"
            value={totalEvaluated}
            icon={<Layers className="w-3.5 h-3.5 text-theme-primary" />}
            tone="default"
            surface="card"
          />

          <StatTile
            label="Model Accuracy"
            value={`${accuracyPct}%`}
            icon={<ShieldCheck className="w-3.5 h-3.5 text-theme-primary" />}
            tone="accent"
            surface="card"
          />

          <StatTile
            label="Correct Hits"
            value={correctCount}
            subValue={`/ ${totalEvaluated}`}
            icon={<Target className="w-3.5 h-3.5 text-theme-primary" />}
            tone="default"
            surface="card"
            className="col-span-2 sm:col-span-1"
          />
        </div>
      )}

      {/* Fixtures List */}
      {history.length === 0 ? (
        (() => {
          const awaitingCount = summary?.completedAwaitingScore ?? 0;
          const upcomingPredCount = summary?.upcomingPredictions ?? 0;
          const livePredCount = summary?.livePredictions ?? 0;
          const activePredCount = upcomingPredCount + livePredCount;
          const totalPreds = summary?.totalPredictions ?? 0;
          const fixturesInDb = summary?.upcomingFixturesInDb ?? 0;

          let emptyTitle = 'No Historical Predictions';
          let showFullSyncCta = true;
          let refreshCtaLabel = 'Check Results';

          if (awaitingCount > 0) {
            emptyTitle = `Awaiting Final Scores (${awaitingCount})`;
            showFullSyncCta = false;
            refreshCtaLabel = 'Check Results';
          } else if (activePredCount > 0) {
            emptyTitle = `Pending Matches (${upcomingPredCount} Upcoming, ${livePredCount} Live)`;
            showFullSyncCta = false;
            refreshCtaLabel = 'Check Results';
          } else if (totalPreds === 0 && fixturesInDb > 0) {
            emptyTitle = `No Predictions Generated (${fixturesInDb} Fixtures)`;
            showFullSyncCta = false;
            refreshCtaLabel = 'Refresh';
          }

          return (
            <EmptyState
              icon={<RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />}
              title={emptyTitle}
              actions={
                showFullSyncCta && onTriggerFullSync ? (
                  <>
                    <Button
                      variant="primary"
                      size="md"
                      pill
                      onClick={onTriggerFullSync}
                      disabled={isProcessingActive || isRefreshing}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Start Full Sync & Update Data</span>
                    </Button>
                    <Button
                      variant="subtle"
                      size="md"
                      pill
                      onClick={() => fetchHistory(limit, true)}
                      disabled={isRefreshing || isProcessingActive}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                      <span>{isRefreshing ? 'Checking...' : refreshCtaLabel}</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    size="md"
                    pill
                    onClick={() => fetchHistory(limit, true)}
                    disabled={isRefreshing || isProcessingActive}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'Checking Flashscore Results...' : refreshCtaLabel}</span>
                  </Button>
                )
              }
            />
          );
        })()
      ) : (
        <Card surface="default" padding="none" radius="2xl" className="overflow-hidden">
          {history.map((f) => {
            const evalResult = evaluatePrediction(f);

            return (
              <div
                key={f.id}
                onClick={() => onSelectDetail?.(f)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && onSelectDetail) {
                    e.preventDefault();
                    onSelectDetail(f);
                  }
                }}
                className="px-4 py-2.5 odd:bg-theme-card even:bg-theme-card-elevated/45 hover:bg-theme-subtle/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent transition-colors duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10.5px] cursor-pointer group"
                role="button"
                tabIndex={0}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-extrabold text-theme-main text-[11px] sm:text-xs">
                      {f.homeTeam} <span className="text-theme-sub font-normal">vs</span> {f.awayTeam}
                    </span>
                    <Badge variant="default" size="xs" pill>
                      {f.leagueName || f.league}
                    </Badge>
                    <span className="text-[9px] font-mono tabular-nums text-theme-sub">{f.matchDate}</span>
                  </div>

                  <div className="text-[10px] text-theme-sub font-mono tabular-nums flex items-center gap-2 flex-wrap">
                    <span>
                      Final Score: <strong className="text-theme-main font-black">{evalResult.hG} - {evalResult.aG}</strong>
                    </span>
                    <span className="text-theme-sub" aria-hidden="true">•</span>
                    <span>
                      Model Pick: <strong className="text-theme-main font-black">{evalResult.predictedLabel}</strong> ({(evalResult.topProb * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  <Badge variant={evalResult.isCorrect ? 'solid' : 'danger'} size="sm" pill>
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
                  </Badge>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
};
