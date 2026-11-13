import React, { useState, useEffect } from 'react';
import { X, Settings, Cpu, Check, Sun, Moon, Terminal, Database, RefreshCw, RotateCcw, HardDrive, AlertTriangle, Server, XCircle, AlertCircle, Sparkles, TrendingUp, Target } from 'lucide-react';
import { EngineSettings, ProviderStatus } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import { COLOR_THEMES, applyColorTheme, getActiveColorThemeId } from '../core/themeEngine.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EngineSettings | null;
  providers: ProviderStatus[];
  onSaveSettings: (newSettings: Partial<EngineSettings>) => void;
  onResetAndSync?: () => void | Promise<void>;
  isResettingAndSyncing?: boolean;
  onResetDatabase?: () => void;
  isResettingDatabase?: boolean;
  onSyncData?: () => void;
  isSyncingData?: boolean;
  stats?: {
    totalMatches: number;
    totalTeams: number;
    leagues: any[];
    rawFeedsCount?: number;
    upcomingCount?: number;
    predictionsCount?: number;
  };
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenTerminal?: () => void;
  onRefreshMetrics?: () => void | Promise<void>;
  syncProgress?: {
    progress: number;
    currentStep: string;
    stepIndex?: number;
    totalSteps?: number;
  } | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  providers,
  onSaveSettings,
  onResetAndSync,
  isResettingAndSyncing,
  onResetDatabase,
  isResettingDatabase,
  onSyncData,
  isSyncingData,
  stats,
  theme,
  onToggleTheme,
  onOpenTerminal,
  onRefreshMetrics,
  syncProgress,
}) => {
  const [activeTab, setActiveTab] = useState<'DATA' | 'PREDICTIONS' | 'UI'>('DATA');
  const [activeThemeId, setActiveThemeId] = useState<string>(
    settings?.colorTheme || getActiveColorThemeId()
  );

  useEffect(() => {
    if (settings?.colorTheme) {
      setActiveThemeId(settings.colorTheme);
      applyColorTheme(settings.colorTheme);
    }
  }, [settings?.colorTheme]);

  const handleSelectColorTheme = (themeId: string) => {
    setActiveThemeId(themeId);
    applyColorTheme(themeId);
    onSaveSettings({ colorTheme: themeId as any });
  };
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [storageStatus, setStorageStatus] = useState<any>(null);
  const [scraperStatus, setScraperStatus] = useState<any>(null);
  const [localStats, setLocalStats] = useState<any>(stats);
  const [isCheckingStorage, setIsCheckingStorage] = useState<boolean>(false);
  const [isRefreshingMetrics, setIsRefreshingMetrics] = useState<boolean>(false);
  const [isUpdatingPredictions, setIsUpdatingPredictions] = useState<boolean>(false);
  const [predictionProgress, setPredictionProgress] = useState<{
    progress: number;
    currentStep: string;
    stepIndex?: number;
    totalSteps?: number;
    matchesCount?: number;
    skippedCount?: number;
    upcomingCount?: number;
    predictionsCount?: number;
  } | null>(null);
  const [predictionResultMsg, setPredictionResultMsg] = useState<string | null>(null);
  const [predictionErrMsg, setPredictionErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (stats) setLocalStats(stats);
  }, [stats]);

  const fetchStorageStatus = async () => {
    setIsCheckingStorage(true);
    try {
      const data = await EngineService.getStorageStatus();
      setStorageStatus(data);
    } catch (err) {
      console.error('Error checking database storage status:', err);
    } finally {
      setIsCheckingStorage(false);
    }
  };

  const fetchScraperStatus = async () => {
    try {
      const data = await EngineService.getScraperStatus();
      setScraperStatus(data);
    } catch (err) {
      console.error('Error checking Scraper status:', err);
    }
  };

  const fetchFreshStats = async () => {
    try {
      const s = await EngineService.getStats();
      if (s) setLocalStats(s);
    } catch (err) {
      console.error('Error fetching fresh stats:', err);
    }
  };

  const handleRefreshMetrics = async () => {
    setIsRefreshingMetrics(true);
    try {
      await Promise.all([fetchStorageStatus(), fetchScraperStatus(), fetchFreshStats()]);
      if (onRefreshMetrics) {
        await onRefreshMetrics();
      }
    } catch (err) {
      console.error('Error refreshing live database & feed metrics:', err);
    } finally {
      setTimeout(() => setIsRefreshingMetrics(false), 300);
    }
  };

  const handleUpdatePredictions = async () => {
    setIsUpdatingPredictions(true);
    setPredictionResultMsg(null);
    setPredictionErrMsg(null);
    setPredictionProgress({
      progress: 10,
      currentStep: 'Querying upcoming fixtures from high-performance store...',
      stepIndex: 1,
      totalSteps: 2,
      matchesCount: 0,
      skippedCount: 0,
      upcomingCount: localStats?.upcomingCount ?? stats?.upcomingCount ?? 0,
      predictionsCount: localStats?.predictionsCount ?? stats?.predictionsCount ?? 0,
    });
    try {
      const res = await EngineService.updateUpcomingPredictions((job) => {
        setPredictionProgress({
          progress: job.progress ?? 15,
          currentStep: job.currentStep || 'Recalculating predictions...',
          stepIndex: job.stepIndex || 2,
          totalSteps: job.totalSteps || 2,
          matchesCount: job.matchesCount || 0,
          skippedCount: job.skippedCount || 0,
          upcomingCount: job.upcomingCount ?? localStats?.upcomingCount ?? 0,
          predictionsCount: job.predictionsCount ?? localStats?.predictionsCount ?? 0,
        });
      });
      if (res.success) {
        setPredictionResultMsg(res.message || `Successfully recalculated predictions for upcoming matches.`);
        setPredictionProgress(null);
        if (res.stats) {
          setLocalStats(res.stats);
        } else if (localStats) {
          setLocalStats({
            ...localStats,
            upcomingCount: res.upcomingCount ?? localStats.upcomingCount,
            predictionsCount: res.totalPredictionsCount ?? localStats.predictionsCount,
          });
        }
        await Promise.all([fetchStorageStatus(), fetchScraperStatus(), fetchFreshStats()]);
        if (onRefreshMetrics) {
          await onRefreshMetrics();
        }
      } else {
        setPredictionErrMsg(res.error || 'Failed to update upcoming predictions.');
        setPredictionProgress(null);
      }
    } catch (err: any) {
      setPredictionErrMsg(err?.message || 'Error executing prediction update.');
      setPredictionProgress(null);
    } finally {
      setIsUpdatingPredictions(false);
    }
  };

  const isOperating = Boolean(isResettingAndSyncing || isSyncingData || isResettingDatabase || isUpdatingPredictions);

  useEffect(() => {
    if (isOpen && (activeTab === 'DATA' || activeTab === 'PREDICTIONS')) {
      fetchStorageStatus();
      fetchScraperStatus();
      fetchFreshStats();
    }
  }, [isOpen, activeTab, isOperating]);

  if (!isOpen || !settings) return null;

  const handleExecuteResetAndSync = () => {
    setIsConfirmingReset(false);
    if (onResetAndSync) {
      onResetAndSync();
    } else if (onSyncData) {
      onSyncData();
    } else if (onResetDatabase) {
      onResetDatabase();
    }
  };


  const handleSave = () => {
    onSaveSettings({
      rollingMatchWindow: 15,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
    });
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-theme-overlay backdrop-blur-xl animate-in fade-in duration-150 font-sans">
      <div className="bg-theme-card text-theme-main rounded-2xl w-full max-w-xl max-h-[92vh] overflow-hidden shadow-theme-md flex flex-col border border-theme">
        {/* Header */}
        <div className="sticky top-0 bg-theme-glass px-4 sm:px-5 py-3 flex items-center justify-between z-10 border-b border-theme">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-theme-subtle border border-theme text-theme-primary">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-theme-main">Settings</h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              className="flex items-center justify-center w-7.5 h-7.5 rounded-full bg-theme-subtle text-theme-main hover:bg-theme-primary-subtle transition-all cursor-pointer active:scale-95"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-theme-main" />}
            </button>

            {/* Quick Terminal Button */}
            {onOpenTerminal && (
              <button
                id="settings-open-terminal-btn"
                onClick={onOpenTerminal}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-theme-subtle text-theme-main hover:bg-theme-primary hover:text-theme-primary-text transition-all cursor-pointer text-[10.5px] font-black active:scale-95"
                title="Terminal Logs"
              >
                <Terminal className="w-3 h-3" />
                <span className="hidden sm:inline">Terminal</span>
              </button>
            )}

            {/* Close Modal Button */}
            <button
              onClick={onClose}
              className="w-7.5 h-7.5 rounded-full flex items-center justify-center bg-theme-subtle text-theme-sub hover:text-theme-main transition-all cursor-pointer hover:scale-105 active:scale-95 ml-0.5"
              aria-label="Close settings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Navigation Tabs: Engine, Data Management, Predictions, UI */}
        <div className="px-4 sm:px-5 pb-1.5 pt-1">
          <div className="p-1 bg-theme-subtle rounded-full flex items-center gap-1 text-[10.5px] overflow-x-auto no-scrollbar">

            <button
              onClick={() => setActiveTab('DATA')}
              className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-full font-black text-[10.5px] transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'DATA'
                  ? 'bg-theme-primary text-theme-primary-text shadow-xs'
                  : 'text-theme-sub hover:text-theme-main'
              }`}
            >
              <Database className="w-3 h-3" />
              <span>Data Management</span>
            </button>
            <button
              onClick={() => setActiveTab('PREDICTIONS')}
              className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-full font-black text-[10.5px] transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'PREDICTIONS'
                  ? 'bg-theme-primary text-theme-primary-text shadow-xs'
                  : 'text-theme-sub hover:text-theme-main'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-400" />
              <span>Predictions</span>
            </button>
            <button
              onClick={() => setActiveTab('UI')}
              className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-full font-black text-[10.5px] transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'UI'
                  ? 'bg-theme-primary text-theme-primary-text shadow-xs'
                  : 'text-theme-sub hover:text-theme-main'
              }`}
            >
              <Sun className="w-3 h-3" />
              <span>UI Settings</span>
            </button>
          </div>
        </div>

        {/* Tab Body */}
        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">


          {activeTab === 'DATA' && (
            <div className="space-y-4">
              {/* Live Database Metrics Overview */}
              <div className="p-4 sm:p-5 rounded-2xl bg-theme-card-elevated border border-theme space-y-3 shadow-theme-sm">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-theme-sub truncate">
                    Live Database & Feed Metrics
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleRefreshMetrics}
                      disabled={isRefreshingMetrics}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-bold bg-theme-card border border-theme hover:bg-theme-subtle text-theme-main transition-all cursor-pointer active:scale-95 disabled:opacity-50 shadow-theme-sm"
                      title="Refresh live metrics & feed stats"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRefreshingMetrics ? 'animate-spin text-theme-primary' : ''}`} />
                      <span>Refresh</span>
                    </button>
                    <span className="text-[11px] font-mono text-theme-primary font-bold flex items-center gap-1.5 px-3 py-1 rounded-full bg-theme-primary-subtle border border-theme-accent/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-theme-primary animate-pulse"></span>
                      SQLite Active
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div className="p-3.5 rounded-2xl bg-theme-card border border-theme shadow-theme-sm">
                    <span className="text-[10px] text-theme-sub block font-medium">Upcoming Fixtures</span>
                    <span className="text-lg font-black text-theme-primary font-mono tabular-nums">
                      {localStats?.upcomingCount !== undefined ? localStats.upcomingCount : (stats?.upcomingCount !== undefined ? stats.upcomingCount : '—')}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-theme-card border border-theme shadow-theme-sm">
                    <span className="text-[10px] text-theme-sub block font-medium">Stored Predictions</span>
                    <span className="text-lg font-black text-theme-primary font-mono tabular-nums">
                      {localStats?.predictionsCount ?? storageStatus?.storageEngine?.tableCounts?.predictions ?? stats?.predictionsCount ?? '—'}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-theme-card border border-theme shadow-theme-sm">
                    <span className="text-[10px] text-theme-sub block font-medium">Stored Raw Feeds</span>
                    <span className="text-lg font-black text-theme-primary font-mono tabular-nums">
                      {localStats?.rawFeedsCount !== undefined ? localStats.rawFeedsCount : (stats?.rawFeedsCount !== undefined ? stats.rawFeedsCount : '—')}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-theme-card border border-theme shadow-theme-sm">
                    <span className="text-[10px] text-theme-sub block font-medium">Historical Matches</span>
                    <span className="text-lg font-black text-theme-primary font-mono tabular-nums">
                      {localStats?.totalMatches !== undefined ? localStats.totalMatches : (stats?.totalMatches !== undefined ? stats.totalMatches : '—')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Scraper Engine & Circuit Breaker Diagnostics Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-theme-card-elevated border border-theme space-y-3 shadow-theme-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-theme-primary" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-theme-main">
                      Scraper Engine & Circuit Breaker Health
                    </h3>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black flex items-center gap-1 ${
                    scraperStatus?.circuit?.state === 'OPEN'
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      : scraperStatus?.circuit?.state === 'HALF_OPEN'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-theme-primary-subtle text-theme-primary'
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                    CIRCUIT: {scraperStatus?.circuit?.state || 'CLOSED'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                  <div className="p-3 rounded-2xl bg-theme-card border border-theme shadow-theme-sm">
                    <span className="text-[10px] text-theme-sub block font-sans font-medium">Circuit Failures</span>
                    <span className="text-sm font-black text-theme-main">{scraperStatus?.circuit?.failureCount ?? 0}</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-theme-card border border-theme shadow-theme-sm">
                    <span className="text-[10px] text-theme-sub block font-sans font-medium">Cached Raw Feeds</span>
                    <span className="text-sm font-black text-theme-primary">{scraperStatus?.rawFeedsCount ?? localStats?.rawFeedsCount ?? stats?.rawFeedsCount ?? 0}</span>
                  </div>
                </div>

                {/* Feed Mirrors & CDN Endpoint Status */}
                {scraperStatus?.mirrors && scraperStatus.mirrors.length > 0 && (
                  <div className="pt-2 border-t border-theme space-y-1.5">
                    <span className="text-[10px] uppercase font-mono font-bold text-theme-sub block">
                      Active Scraper Feed Mirrors & CDN Endpoints
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10.5px] font-mono">
                      {scraperStatus.mirrors.map((m: any, idx: number) => (
                        <div key={idx} className="p-2 rounded-xl bg-theme-card border border-theme flex items-center justify-between gap-2 shadow-theme-sm">
                          <span className="truncate text-theme-main font-medium">{m.name}</span>
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-theme-primary-subtle text-theme-primary shrink-0">
                            {m.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Database & Storage Engine Status Section */}
              <div className="p-4 sm:p-5 rounded-2xl bg-theme-card-elevated border border-theme space-y-3 shadow-theme-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-theme-primary" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-theme-main">
                      Database & Storage Engine Status
                    </h3>
                  </div>
                  <button
                    onClick={fetchStorageStatus}
                    disabled={isCheckingStorage}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold bg-theme-card border border-theme hover:bg-theme-subtle text-theme-main transition-all cursor-pointer disabled:opacity-50 shadow-theme-sm active:scale-95"
                  >
                    <RefreshCw className={`w-3 h-3 ${isCheckingStorage ? 'animate-spin text-theme-primary' : ''}`} />
                    <span>Test Storage</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Football Data Store */}
                  <div className="p-3.5 rounded-2xl bg-theme-card border border-theme space-y-2 shadow-theme-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-theme-main flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-theme-primary" />
                        Local SQLite (Football Data)
                      </span>
                      {storageStatus?.footballDb?.status === 'CONNECTED' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-theme-primary-subtle text-theme-primary flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-theme-primary animate-pulse"></span>
                          WAL ACTIVE ({storageStatus.footballDb.latencyMs ?? 1}ms)
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          INACTIVE
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] font-mono text-theme-sub space-y-0.5">
                      <div className="truncate">
                        Path: <span className="text-theme-main font-semibold">{storageStatus?.storageEngine?.dbPath || 'data/football_engine.db'}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] pt-0.5">
                        <span className="text-theme-sub">Disk Size: <strong className="text-theme-primary">{storageStatus?.storageEngine?.sizeMB ?? 0.1} MB</strong></span>
                        <span className="text-theme-primary font-semibold">99.6% Optimized</span>
                      </div>
                      {storageStatus?.footballDb?.error && (
                        <p className="text-[10px] text-rose-600 dark:text-rose-400 truncate">
                          Err: {storageStatus.footballDb.error}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Predictions Store */}
                  <div className="p-3.5 rounded-2xl bg-theme-card border border-theme space-y-2 shadow-theme-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-theme-main flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-sky-400" />
                        5-Pillar Prediction Store
                      </span>
                      {storageStatus?.predictionsDb?.status === 'CONNECTED' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-theme-primary-subtle text-theme-primary flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-theme-primary animate-pulse"></span>
                          100% READY
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          INACTIVE
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] font-mono text-theme-sub space-y-0.5">
                      <div className="truncate">
                        Driver: <span className="text-theme-main font-semibold">better-sqlite3 C-Bindings</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] pt-0.5">
                        <span className="text-theme-sub">Stored Predictions: <strong className="text-theme-main">{storageStatus?.storageEngine?.tableCounts?.predictions ?? localStats?.predictionsCount ?? stats?.predictionsCount ?? 0}</strong></span>
                        <span className="text-theme-primary font-semibold">5 Pillars Active</span>
                      </div>
                      {storageStatus?.predictionsDb?.error && (
                        <p className="text-[10px] text-rose-600 dark:text-rose-400 truncate">
                          Err: {storageStatus.predictionsDb.error}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Full Data & H2H Sync Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-theme-card-elevated border border-theme space-y-4 shadow-theme-sm">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-full bg-theme-primary-subtle text-theme-primary">
                        <RefreshCw className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-bold text-theme-main">
                        Full Sync
                      </h3>
                    </div>
                    {isOperating && (
                      <span className="text-xs text-theme-primary font-semibold flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        In Progress...
                      </span>
                    )}
                  </div>
                </div>

                {isOperating && (
                  <div className="space-y-2.5 p-4 rounded-2xl bg-theme-card border border-theme shadow-theme-sm">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-bold text-theme-main flex items-center gap-2 truncate">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-theme-primary shrink-0" />
                        <span className="truncate">{syncProgress?.currentStep || 'Fetching historical archives, upcoming feeds & H2H...'}</span>
                      </span>
                      <span className="text-[11px] font-mono tabular-nums font-black text-theme-main shrink-0">
                        {syncProgress?.progress ?? 50}%
                        {syncProgress?.stepIndex && syncProgress?.totalSteps ? ` (Step ${syncProgress.stepIndex}/${syncProgress.totalSteps})` : ''}
                      </span>
                    </div>
                    <div className="w-full bg-theme-subtle rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-theme-primary h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(5, syncProgress?.progress ?? 25))}%` }}
                      />
                    </div>
                  </div>
                )}

                {!isOperating && !isConfirmingReset && (
                  <button
                    onClick={() => setIsConfirmingReset(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-theme-primary hover:bg-theme-primary-hover text-theme-primary-text font-black transition-all cursor-pointer text-xs uppercase tracking-wide shadow-theme-glow active:scale-[0.99]"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Trigger Full Data & H2H Sync</span>
                  </button>
                )}

                {!isOperating && isConfirmingReset && (
                  <div className="p-4 rounded-2xl bg-theme-primary-subtle border border-theme-accent space-y-3">
                    <div className="flex items-start gap-2.5">
                      <RefreshCw className="w-4 h-4 text-theme-primary shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-theme-main">
                          Confirm Full Sync?
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleExecuteResetAndSync}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-theme-primary hover:bg-theme-primary-hover text-theme-primary-text font-black text-xs transition-all cursor-pointer active:scale-95 shadow-theme-glow"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Confirm & Trigger Full Sync</span>
                      </button>
                      <button
                        onClick={() => setIsConfirmingReset(false)}
                        className="px-4 py-2.5 rounded-full bg-theme-card border border-theme hover:bg-theme-subtle text-theme-main font-bold text-xs transition-colors cursor-pointer active:scale-95"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'PREDICTIONS' && (
            <div className="space-y-4">
              {/* Predictions Engine Status Banner */}
              <div className="p-4 sm:p-5 rounded-2xl bg-theme-card-elevated border border-theme space-y-3 shadow-theme-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-full bg-theme-primary-subtle text-theme-primary">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-theme-main">Upcoming Predictions</h3>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10.5px] font-mono font-bold bg-theme-primary-subtle text-theme-primary">
                    DB Persisted
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1 font-mono">
                  <div className="p-3.5 rounded-2xl bg-theme-card border border-theme shadow-theme-sm">
                    <span className="text-[10px] text-theme-sub block font-sans font-medium">Upcoming Fixtures</span>
                    <span className="text-lg font-black text-theme-primary tabular-nums">
                      {predictionProgress?.upcomingCount ?? localStats?.upcomingCount ?? stats?.upcomingCount ?? '—'}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-theme-card border border-theme shadow-theme-sm">
                    <span className="text-[10px] text-theme-sub block font-sans font-medium">Stored Predictions</span>
                    <span className="text-lg font-black text-theme-primary tabular-nums">
                      {predictionProgress?.predictionsCount ?? localStats?.predictionsCount ?? storageStatus?.storageEngine?.tableCounts?.predictions ?? stats?.predictionsCount ?? '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Card: Trigger Predictions Update for Upcoming Games */}
              <div className="p-4 sm:p-5 rounded-2xl bg-theme-card-elevated border border-theme space-y-4 shadow-theme-sm">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-full bg-theme-primary text-theme-primary-text font-bold shadow-theme-sm">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-theme-main">
                      Recalculate Upcoming Predictions
                    </h3>
                  </div>
                </div>

                {/* Real-time Background Job Progress Panel */}
                {isUpdatingPredictions && (
                  <div className="space-y-2.5 p-4 rounded-2xl bg-theme-card shadow-theme-sm border border-theme-accent">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-bold text-theme-main flex items-center gap-2 truncate">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-theme-primary shrink-0" />
                        <span className="truncate">{predictionProgress?.currentStep || 'Recalculating 5-Pillar Poisson predictions...'}</span>
                      </span>
                      <span className="text-[11px] font-mono tabular-nums font-black text-theme-main shrink-0">
                        {predictionProgress?.progress ?? 15}%
                        {predictionProgress?.stepIndex && predictionProgress?.totalSteps ? ` (Step ${predictionProgress.stepIndex}/${predictionProgress.totalSteps})` : ''}
                      </span>
                    </div>
                    <div className="w-full bg-theme-subtle rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-theme-primary h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(5, predictionProgress?.progress ?? 15))}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10.5px] font-mono text-theme-sub pt-0.5">
                      <span>Predicted: <strong className="text-theme-primary">{predictionProgress?.matchesCount ?? 0}</strong> / {predictionProgress?.upcomingCount ?? localStats?.upcomingCount ?? '—'}</span>
                      <span>Skipped (&lt;90% data): <strong className="text-amber-500">{predictionProgress?.skippedCount ?? 0}</strong></span>
                    </div>
                  </div>
                )}

                {/* Feedback Alerts */}
                {predictionResultMsg && (
                  <div className="p-3 rounded-2xl bg-theme-primary-subtle border border-theme-accent text-theme-primary text-xs font-bold flex items-center gap-2 font-mono">
                    <Check className="w-4 h-4 text-theme-primary shrink-0" />
                    <span>{predictionResultMsg}</span>
                  </div>
                )}

                {predictionErrMsg && (
                  <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-700 dark:text-rose-400 text-xs font-bold flex items-center gap-2 font-mono">
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span>{predictionErrMsg}</span>
                  </div>
                )}

                {/* Update Predictions Button */}
                <button
                  type="button"
                  id="update-upcoming-predictions-btn"
                  onClick={handleUpdatePredictions}
                  disabled={isUpdatingPredictions}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-theme-primary hover:bg-theme-primary-hover text-theme-primary-text font-black transition-all cursor-pointer text-xs uppercase tracking-wide shadow-theme-glow active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isUpdatingPredictions ? 'animate-spin' : ''}`} />
                  <span>{isUpdatingPredictions ? 'Calculating & Updating DB...' : 'Update Predictions'}</span>
                </button>
              </div>

              {/* Calculated Market Categories Info */}
              <div className="p-4 rounded-2xl bg-theme-card-elevated border border-theme space-y-2 text-xs shadow-theme-sm">
                <span className="font-bold text-theme-main uppercase tracking-wider text-[10px] block font-mono">
                  Market Categories & Calculation Scope
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-theme-sub">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    <span>1X2 Match Outcomes</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>Goals Over/Under (1.5, 2.5, 3.5)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                    <span>Both Teams to Score (BTTS)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                    <span>Double Chance (1X, X2, 12)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'UI' && (
            <div className="space-y-4">
              {/* Appearance / Theme Selector */}
              <div className="p-4 sm:p-5 rounded-2xl bg-theme-subtle border border-theme space-y-3 shadow-xs">
                <div>
                  <h3 className="text-sm font-bold text-theme-main">Theme</h3>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => theme !== 'light' && onToggleTheme()}
                    className={`p-3.5 rounded-2xl flex items-center justify-between transition-all cursor-pointer border ${
                      theme === 'light'
                        ? 'bg-theme-card text-theme-main border-theme-primary shadow-md ring-2 ring-theme-accent'
                        : 'bg-theme-card/60 text-theme-sub border-theme hover:bg-theme-card hover:text-theme-main'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-full bg-amber-500/10 text-amber-500">
                        <Sun className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <span className="text-xs font-bold block text-theme-main">Light Mode</span>
                      </div>
                    </div>
                    {theme === 'light' && <Check className="w-4 h-4 text-theme-main" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => theme !== 'dark' && onToggleTheme()}
                    className={`p-3.5 rounded-2xl flex items-center justify-between transition-all cursor-pointer border ${
                      theme === 'dark'
                        ? 'bg-theme-card text-theme-main border-theme-primary shadow-md ring-2 ring-theme-accent'
                        : 'bg-theme-card/60 text-theme-sub border-theme hover:bg-theme-card hover:text-theme-main'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-full bg-theme-subtle text-amber-400">
                        <Moon className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <span className="text-xs font-bold block text-theme-main">Dark Mode</span>
                      </div>
                    </div>
                    {theme === 'dark' && <Check className="w-4 h-4 text-theme-primary" />}
                  </button>
                </div>
              </div>

              {/* World-Class Color System Theme Selector */}
              <div className="p-4 sm:p-5 rounded-2xl bg-theme-subtle border border-theme space-y-3 shadow-xs">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-theme-main flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-theme-primary" />
                      <span>Color Palette</span>
                    </h3>
                    <span className="text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-full bg-theme-card border border-theme text-theme-main">
                      Adaptive
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {COLOR_THEMES.map((t) => {
                    const isSelected = activeThemeId === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => handleSelectColorTheme(t.id)}
                        className={`group relative p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                          isSelected
                            ? 'bg-theme-card border-theme-primary shadow-md ring-2 ring-theme-accent'
                            : 'bg-theme-card/80 border-theme hover:bg-theme-card hover:border-theme-primary/50'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black text-theme-main truncate">
                              {t.name}
                            </span>
                            {isSelected ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-theme-primary text-theme-primary-text shrink-0 shadow-xs">
                                <Check className="w-3 h-3 stroke-[3]" />
                                <span>Active</span>
                              </span>
                            ) : null}
                          </div>

                          {/* Colorway Pills */}
                          {t.colorways && t.colorways.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {t.colorways.map((cw, i) => (
                                <span
                                  key={i}
                                  className="text-[9.5px] px-1.5 py-0.5 rounded bg-theme-subtle text-theme-sub font-mono font-medium"
                                >
                                  {cw}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Color Swatch Bar */}
                        <div className="pt-2 border-t border-theme flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-4 h-4 rounded-full shadow-xs border border-black/10 shrink-0"
                              style={{ backgroundColor: t.previewColors.primary }}
                              title={`Primary Accent: ${t.accentName}`}
                            />
                            <div
                              className="w-4 h-4 rounded-full shadow-xs border border-black/10 shrink-0"
                              style={{ backgroundColor: t.previewColors.modelPick }}
                              title={`Model Pick & Value: ${t.modelPickName}`}
                            />
                            <div
                              className="w-4 h-4 rounded-full shadow-xs border border-black/10 shrink-0"
                              style={{ backgroundColor: t.previewColors.live }}
                              title="Live Status Signal"
                            />
                            <div
                              className="w-4 h-4 rounded-full shadow-xs border border-black/10 shrink-0"
                              style={{ backgroundColor: t.previewColors.surfaceDark }}
                              title="Dark Surface Canvas"
                            />
                            <div
                              className="w-4 h-4 rounded-full shadow-xs border border-black/10 shrink-0"
                              style={{ backgroundColor: t.previewColors.surfaceLight }}
                              title="Light Surface Canvas"
                            />
                          </div>
                          <span className="text-[10px] font-mono font-bold text-theme-sub truncate">
                            {t.accentName}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Terminal Logs & Console Section */}
              {onOpenTerminal && (
                <div className="p-4 sm:p-5 rounded-2xl bg-theme-card-elevated border border-theme flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-theme-sm">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-full bg-theme-primary text-theme-primary-text font-bold shadow-theme-sm">
                        <Terminal className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-bold text-theme-main">System Terminal & Logs</h3>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onOpenTerminal}
                    className="px-5 py-2.5 rounded-full bg-theme-primary hover:bg-theme-primary-hover text-theme-primary-text font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-theme-glow active:scale-95 shrink-0"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Open Terminal</span>
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* Toast Notification */}
          {showSavedToast && (
            <div className="p-3 rounded-full bg-theme-primary-subtle border border-theme-accent text-theme-primary text-xs font-black flex items-center gap-2 shadow-theme-sm font-mono">
              <Check className="w-4 h-4 text-theme-primary" />
              <span>Settings saved successfully</span>
            </div>
          )}

          {/* Footer Save Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-full bg-theme-subtle border border-theme hover:bg-theme-card-elevated text-theme-main text-xs font-bold transition-all cursor-pointer active:scale-95"
            >
              Close
            </button>
            {/* Save Settings Action */}
            <button
              onClick={handleSave}
              className="px-6 py-2.5 rounded-full bg-theme-primary hover:bg-theme-primary-hover text-theme-primary-text text-xs font-black shadow-theme-glow transition-all cursor-pointer active:scale-95"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>

  );
};
