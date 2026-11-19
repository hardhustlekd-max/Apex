import React, { useEffect, useState, useRef } from 'react';
import { Fixture } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  BarChart3,
  ShieldCheck,
  Target,
  Layers,
  Database,
  Upload,
  FileSpreadsheet,
  Clock,
  X,
  AlertTriangle,
} from 'lucide-react';
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
  refreshKey?: number;
}

interface EvaluatedImportItem {
  fixtureId: string;
  league: string;
  leagueName: string;
  matchDate: string;
  kickOffTime: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeXG?: number | null;
  awayXG?: number | null;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  tipKey: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';
  tipName: string;
  tipProb: number;
  actualOutcome: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' | null;
  isCorrect: boolean | null;
  evaluationState: 'WON' | 'LOST' | 'PENDING';
}

interface ImportedEvaluationData {
  fileName: string;
  summary: {
    totalImported: number;
    evaluatedCount: number;
    pendingCount: number;
    wonCount: number;
    lostCount: number;
    accuracy: number;
    homePicksCount: number;
    drawPicksCount: number;
    awayPicksCount: number;
  };
  evaluated: EvaluatedImportItem[];
}

interface HistoryMatchRowProps {
  homeTeam: string;
  awayTeam: string;
  leagueLabel: string;
  matchDate: string;
  scoreLabel: React.ReactNode;
  pickLabel: string;
  pickProbPercent: string;
  xGLabel?: string | null;
  statusBadge: React.ReactNode;
  onClick?: () => void;
}

const HistoryMatchRow: React.FC<HistoryMatchRowProps> = ({
  homeTeam,
  awayTeam,
  leagueLabel,
  matchDate,
  scoreLabel,
  pickLabel,
  pickProbPercent,
  xGLabel,
  statusBadge,
  onClick,
}) => (
  <div
    onClick={onClick}
    onKeyDown={
      onClick
        ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick();
            }
          }
        : undefined
    }
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    className={`min-h-[42px] px-3 py-1.5 hover:bg-theme-card-elevated transition-colors duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm ${
      onClick ? 'cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent' : ''
    }`}
  >
    <div className="min-w-0 space-y-0.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-semibold text-theme-main text-base tracking-[-0.01em]">
          {homeTeam} <span className="text-theme-sub font-normal">vs</span> {awayTeam}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-theme-sub tabular-nums flex-wrap">
        <span className="font-medium">{leagueLabel}</span>
        <span aria-hidden="true">·</span>
        <span className="font-normal">{matchDate}</span>
      </div>

      <div className="text-sm text-theme-sub font-normal tabular-nums flex items-center gap-1.5 flex-wrap">
        <span>{scoreLabel}</span>
        <span className="text-theme-sub" aria-hidden="true">•</span>
        <span>
          Model Pick: <strong className="text-theme-main font-semibold">{pickLabel}</strong> ({pickProbPercent}%)
        </span>
        {xGLabel && (
          <>
            <span className="text-theme-sub" aria-hidden="true">•</span>
            <span>xG: {xGLabel}</span>
          </>
        )}
      </div>
    </div>

    <div className="shrink-0 flex items-center gap-1.5">{statusBadge}</div>
  </div>
);

export const PredictionHistoryView: React.FC<PredictionHistoryViewProps> = ({
  isProcessingActive = false,
  onTriggerFullSync,
  onSelectDetail,
  refreshKey = 0,
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

  // Import and evaluation states
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedEvaluation, setImportedEvaluation] = useState<ImportedEvaluationData | null>(null);
  const [importedFilter, setImportedFilter] = useState<'ALL' | 'WON' | 'LOST' | 'PENDING'>('ALL');
  const [sortMode, setSortMode] = useState<'DATE_DESC' | 'PROB_DESC' | 'PROB_ASC'>('DATE_DESC');

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
        if (sortMode === 'PROB_DESC') {
          return evaluatePrediction(b).topProb - evaluatePrediction(a).topProb;
        }
        if (sortMode === 'PROB_ASC') {
          return evaluatePrediction(a).topProb - evaluatePrediction(b).topProb;
        }
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportError(null);

    try {
      const text = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('Selected file is not valid JSON. Please select a JSON file exported from the Prediction Engine.');
      }

      const res = await EngineService.evaluateImportedPredictions(parsed);
      if (res.success && res.summary && res.evaluated) {
        setImportedEvaluation({
          fileName: file.name,
          summary: res.summary,
          evaluated: res.evaluated,
        });
        setImportedFilter('ALL');
        setSyncToast(`Evaluated ${res.summary.totalImported} predictions from ${file.name}`);
      } else {
        setImportError(res.error || 'Failed to evaluate imported predictions.');
      }
    } catch (err: any) {
      console.error('Import evaluation error:', err);
      setImportError(err?.message || 'Error processing JSON file.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setSyncToast(null), 5000);
    }
  };

  useEffect(() => {
    fetchHistory(limit);
  }, [limit, refreshKey]);

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

  const filteredImportedMatches = importedEvaluation
    ? importedEvaluation.evaluated
        .filter((item) => {
          if (importedFilter === 'ALL') return true;
          return item.evaluationState === importedFilter;
        })
        .sort((a, b) => {
          if (sortMode === 'PROB_DESC') {
            return b.tipProb - a.tipProb;
          }
          if (sortMode === 'PROB_ASC') {
            return a.tipProb - b.tipProb;
          }
          return b.matchDate.localeCompare(a.matchDate);
        })
    : [];

  if (isLoading && !importedEvaluation) {
    return <LoadingState label="Loading..." minHeight="min-h-[156px]" />;
  }

  return (
    <div className="space-y-3 font-sans">
      <input
        type="file"
        ref={fileInputRef}
        accept=".json,application/json"
        onChange={handleFileUpload}
        className="hidden"
        aria-hidden="true"
      />

      {syncToast && (
        <div
          role="status"
          className="p-3 rounded-xl bg-theme-card border border-theme-neon text-theme-primary text-sm font-medium flex items-center justify-between gap-2 shadow-theme-md animate-in fade-in slide-in-from-top-2"
        >
          <div className="flex items-center gap-2">
            <Database className={`w-4 h-4 shrink-0 ${isSyncingHistory || isImporting ? 'animate-spin text-theme-primary' : 'text-theme-primary'}`} />
            <span>{syncToast}</span>
          </div>
          {importedEvaluation && (
            <Badge variant="accent" size="xs">
              Imported
            </Badge>
          )}
        </div>
      )}

      {importError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/35 text-rose-600 dark:text-rose-400 text-sm font-medium flex items-center justify-between gap-2 shadow-theme-sm"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{importError}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="w-[24px] h-[24px] inline-flex items-center justify-center rounded-lg text-rose-500 hover:bg-rose-500/15 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <SectionHeader
          title={importedEvaluation ? 'Imported Evaluation' : 'Prediction History'}
          icon={importedEvaluation ? <FileSpreadsheet className="w-4 h-4" /> : <BarChart3 className="w-4 h-4" />}
          size="md"
        />

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {importedEvaluation ? (
            <>
              <Button
                variant="inverse"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                title="Import another prediction JSON file"
              >
                <Upload className={`w-3.5 h-3.5 ${isImporting ? 'animate-bounce' : ''}`} />
                <span>{isImporting ? 'Evaluating...' : 'Import Another File'}</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setImportedEvaluation(null)}
                title="Exit imported evaluation and return to database history"
              >
                <X className="w-3.5 h-3.5" />
                <span>Exit Imported View</span>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="inverse"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting || isProcessingActive}
                title="Import a predictions JSON file exported from the Prediction Engine to evaluate accuracy"
              >
                <Upload className={`w-3.5 h-3.5 ${isImporting ? 'animate-bounce' : ''}`} />
                <span>{isImporting ? 'Evaluating File...' : 'Import & Evaluate'}</span>
              </Button>

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

              <Select
                aria-label="Sort predictions"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as any)}
                surface="subtle"
                selectSize="sm"
                options={[
                  { value: 'DATE_DESC', label: 'Sort: Newest Date' },
                  { value: 'PROB_DESC', label: 'Sort: Highest Probability %' },
                  { value: 'PROB_ASC', label: 'Sort: Lowest Probability %' },
                ]}
              />

              <Button
                variant="secondary"
                size="sm"
                onClick={handleSyncHistoryScraper}
                disabled={isSyncingHistory || isRefreshing || isProcessingActive}
                title="Run historical archive scraper to populate database with multi-year results"
              >
                <Database className={`w-3.5 h-3.5 ${isSyncingHistory ? 'animate-spin text-theme-primary' : 'text-theme-primary'}`} />
                <span>{isSyncingHistory ? 'Syncing...' : 'Sync History'}</span>
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => fetchHistory(limit, true)}
                disabled={isRefreshing || isSyncingHistory || isProcessingActive}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* IMPORTED EVALUATION VIEW */}
      {importedEvaluation ? (
        <div className="space-y-3">
          <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
            <div className="min-h-[38px] px-3 py-1.5 bg-theme-header-grad border-b border-theme-subdued flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="w-4 h-4 text-theme-primary shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold text-base text-theme-main truncate block tracking-[-0.01em]">
                    {importedEvaluation.fileName}
                  </span>
                  <span className="text-xs font-normal tabular-nums text-theme-sub">
                    {importedEvaluation.summary.totalImported} predictions evaluated
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 flex-wrap">
                <Button
                  variant={importedFilter === 'ALL' ? 'primary' : 'subtle'}
                  size="xs"
                  onClick={() => setImportedFilter('ALL')}
                >
                  All ({importedEvaluation.summary.totalImported})
                </Button>
                <Button
                  variant={importedFilter === 'WON' ? 'primary' : 'subtle'}
                  size="xs"
                  onClick={() => setImportedFilter('WON')}
                >
                  Won ({importedEvaluation.summary.wonCount})
                </Button>
                <Button
                  variant={importedFilter === 'LOST' ? 'danger' : 'subtle'}
                  size="xs"
                  onClick={() => setImportedFilter('LOST')}
                >
                  Lost ({importedEvaluation.summary.lostCount})
                </Button>
                <Button
                  variant={importedFilter === 'PENDING' ? 'secondary' : 'subtle'}
                  size="xs"
                  onClick={() => setImportedFilter('PENDING')}
                >
                  Pending ({importedEvaluation.summary.pendingCount})
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <StatTile
              label="Evaluated Matches"
              value={`${importedEvaluation.summary.evaluatedCount} / ${importedEvaluation.summary.totalImported}`}
              icon={<Layers className="w-4 h-4" />}
              tone="default"
              surface="card"
            />

            <StatTile
              label="Model Accuracy"
              value={`${importedEvaluation.summary.accuracy}%`}
              icon={<ShieldCheck className="w-4 h-4" />}
              tone="accent"
              surface="card"
              progress={Number(importedEvaluation.summary.accuracy)}
            />

            <StatTile
              label="Won Picks"
              value={importedEvaluation.summary.wonCount}
              subValue={`Lost: ${importedEvaluation.summary.lostCount}`}
              icon={<Target className="w-4 h-4" />}
              tone="accent"
              surface="card"
            />

            <StatTile
              label="Pending Matches"
              value={importedEvaluation.summary.pendingCount}
              subValue="Awaiting FT"
              icon={<Clock className="w-4 h-4" />}
              tone="warning"
              surface="card"
            />
          </div>

          {filteredImportedMatches.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet className="w-6 h-6 text-theme-primary" />}
              title={`No ${importedFilter.toLowerCase()} predictions in imported file`}
            />
          ) : (
            <Card surface="default" padding="none" radius="2xl" className="overflow-hidden divide-y divide-[var(--border-subdued)]">
              {filteredImportedMatches.map((item, idx) => (
                <HistoryMatchRow
                  key={`${item.fixtureId}_${idx}`}
                  homeTeam={item.homeTeam}
                  awayTeam={item.awayTeam}
                  leagueLabel={item.leagueName || item.league}
                  matchDate={item.matchDate}
                  scoreLabel={
                    item.homeScore !== null && item.awayScore !== null ? (
                      <>
                        Final Score: <strong className="text-theme-main font-semibold">{item.homeScore} - {item.awayScore}</strong>
                      </>
                    ) : (
                      <span className="text-amber-500 font-medium">
                        Score: {item.status === 'LIVE' ? 'In Play' : 'Awaiting Final Result'}
                      </span>
                    )
                  }
                  pickLabel={item.tipName}
                  pickProbPercent={(item.tipProb * 100).toFixed(0)}
                  xGLabel={item.homeXG !== null && item.homeXG !== undefined ? `${item.homeXG} - ${item.awayXG}` : null}
                  statusBadge={
                    item.evaluationState === 'WON' ? (
                      <Badge variant="success" size="sm">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Won</span>
                      </Badge>
                    ) : item.evaluationState === 'LOST' ? (
                      <Badge variant="danger" size="sm">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Lost</span>
                      </Badge>
                    ) : (
                      <Badge variant="warning" size="sm">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Pending</span>
                      </Badge>
                    )
                  }
                />
              ))}
            </Card>
          )}
        </div>
      ) : (
        /* DATABASE HISTORICAL PREDICTIONS VIEW */
        <div className="space-y-3">
          {totalEvaluated > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <StatTile
                label="Evaluated Matches"
                value={totalEvaluated}
                icon={<Layers className="w-4 h-4" />}
                tone="default"
                surface="card"
              />

              <StatTile
                label="Model Accuracy"
                value={`${accuracyPct}%`}
                subValue={`n=${totalEvaluated}`}
                icon={<ShieldCheck className="w-4 h-4" />}
                tone="accent"
                surface="card"
                progress={Number(accuracyPct)}
              />

              <StatTile
                label="Correct Hits"
                value={correctCount}
                subValue={`/ ${totalEvaluated}`}
                icon={<Target className="w-4 h-4" />}
                tone="default"
                surface="card"
                className="col-span-2 sm:col-span-1"
              />
            </div>
          )}

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
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                      <Button
                        variant="inverse"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Import &amp; Evaluate JSON</span>
                      </Button>

                      {showFullSyncCta && onTriggerFullSync ? (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={onTriggerFullSync}
                            disabled={isProcessingActive || isRefreshing}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Start Full Sync</span>
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
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
                          size="sm"
                          onClick={() => fetchHistory(limit, true)}
                          disabled={isRefreshing || isProcessingActive}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                          <span>{isRefreshing ? 'Checking Results...' : refreshCtaLabel}</span>
                        </Button>
                      )}
                    </div>
                  }
                />
              );
            })()
          ) : (
            <Card surface="default" padding="none" radius="2xl" className="overflow-hidden divide-y divide-[var(--border-subdued)]">
              {history.map((f) => {
                const evalResult = evaluatePrediction(f);

                return (
                  <HistoryMatchRow
                    key={f.id}
                    homeTeam={f.homeTeam}
                    awayTeam={f.awayTeam}
                    leagueLabel={f.leagueName || f.league}
                    matchDate={f.matchDate}
                    onClick={onSelectDetail ? () => onSelectDetail(f) : undefined}
                    scoreLabel={
                      <>
                        Final Score: <strong className="text-theme-main font-semibold">{evalResult.hG} - {evalResult.aG}</strong>
                      </>
                    }
                    pickLabel={evalResult.predictedLabel}
                    pickProbPercent={(evalResult.topProb * 100).toFixed(0)}
                    statusBadge={
                      <Badge variant={evalResult.isCorrect ? 'solid' : 'danger'} size="sm">
                        {evalResult.isCorrect ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-theme-primary-text" />
                            <span>Hit</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-rose-500" />
                            <span>Missed</span>
                          </>
                        )}
                      </Badge>
                    }
                  />
                );
              })}
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
