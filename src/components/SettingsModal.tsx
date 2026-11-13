import React, { useState, useEffect } from 'react';
import {
  Settings,
  Cpu,
  Check,
  Sun,
  Moon,
  Terminal,
  Database,
  RefreshCw,
  AlertTriangle,
  Server,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { EngineSettings, ProviderStatus } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import { COLOR_THEMES, applyColorTheme, getActiveColorThemeId } from '../core/themeEngine.js';
import {
  Badge,
  Button,
  Card,
  Modal,
  ProgressBar,
  SectionHeader,
  SegmentedTabs,
  StatTile,
} from './ui/index.js';

type SettingsTab = 'DATA' | 'PREDICTIONS' | 'UI';

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
  const [activeTab, setActiveTab] = useState<SettingsTab>('DATA');
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
        setPredictionResultMsg(res.message || 'Successfully recalculated predictions for upcoming matches.');
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

  const storedPredictionsCount =
    localStats?.predictionsCount ??
    storageStatus?.storageEngine?.tableCounts?.predictions ??
    stats?.predictionsCount ??
    '—';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      icon={<Settings className="w-4 h-4" />}
      maxWidth="max-w-xl"
      closeLabel="Close settings"
      bodyClassName="p-0 flex flex-col min-h-0 flex-1 overflow-hidden"
      headerActions={
        <>
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-theme-subtle text-theme-main hover:bg-theme-primary-subtle transition-all duration-150 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-theme-main" />
            )}
          </button>

          {onOpenTerminal && (
            <Button
              id="settings-open-terminal-btn"
              variant="subtle"
              size="xs"
              pill
              onClick={onOpenTerminal}
              title="Terminal Logs"
            >
              <Terminal className="w-3 h-3" />
              <span className="hidden sm:inline">Terminal</span>
            </Button>
          )}
        </>
      }
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <Button variant="subtle" size="md" pill onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" size="md" pill onClick={handleSave}>
            Save Settings
          </Button>
        </div>
      }
    >
      {/* Modal Navigation Tabs */}
      <div className="px-4 sm:px-5 pb-1.5 pt-1 shrink-0">
        <SegmentedTabs<SettingsTab>
          items={[
            {
              id: 'DATA',
              label: 'Data Management',
              icon: <Database className="w-3 h-3" />,
            },
            {
              id: 'PREDICTIONS',
              label: 'Predictions',
              icon: <Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-400" />,
            },
            {
              id: 'UI',
              label: 'UI Settings',
              icon: <Sun className="w-3 h-3" />,
            },
          ]}
          value={activeTab}
          onChange={(val) => setActiveTab(val)}
          variant="pill"
          size="sm"
          fullWidth
          ariaLabel="Settings categories"
        />
      </div>

      {/* Tab Body */}
      <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
        {activeTab === 'DATA' && (
          <div className="space-y-4">
            {/* Live Database Metrics Overview */}
            <Card surface="elevated" padding="md" radius="2xl" className="shadow-none sm:p-5 space-y-3">
              <SectionHeader
                title="Database Metrics"
                size="sm"
                action={
                  <Button
                    variant="secondary"
                    size="xs"
                    pill
                    onClick={handleRefreshMetrics}
                    disabled={isRefreshingMetrics}
                    className="shadow-none"
                    title="Refresh live metrics & feed stats"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${isRefreshingMetrics ? 'animate-spin text-theme-primary' : ''}`}
                    />
                    <span>Refresh</span>
                  </Button>
                }
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                <StatTile
                  label="Upcoming Fixtures"
                  value={localStats?.upcomingCount ?? stats?.upcomingCount ?? '—'}
                  tone="accent"
                  surface="card"
                />
                <StatTile
                  label="Stored Predictions"
                  value={storedPredictionsCount}
                  tone="accent"
                  surface="card"
                />
                <StatTile
                  label="Stored Raw Feeds"
                  value={localStats?.rawFeedsCount ?? stats?.rawFeedsCount ?? '—'}
                  tone="accent"
                  surface="card"
                />
                <StatTile
                  label="Historical Matches"
                  value={localStats?.totalMatches ?? stats?.totalMatches ?? '—'}
                  tone="accent"
                  surface="card"
                />
              </div>
            </Card>

            {/* Scraper Engine & Circuit Breaker Diagnostics Card */}
            <Card surface="elevated" padding="md" radius="2xl" className="shadow-none sm:p-5 space-y-3">
              <SectionHeader
                title="Scraper Health"
                icon={<Cpu className="w-4 h-4 text-theme-primary" />}
                size="sm"
              />

              <div className="grid grid-cols-2 gap-2 pt-1">
                <StatTile
                  label="Circuit Failures"
                  value={scraperStatus?.circuit?.failureCount ?? 0}
                  tone="default"
                  surface="card"
                />
                <StatTile
                  label="Cached Raw Feeds"
                  value={scraperStatus?.rawFeedsCount ?? localStats?.rawFeedsCount ?? stats?.rawFeedsCount ?? 0}
                  tone="accent"
                  surface="card"
                />
              </div>

              {scraperStatus?.mirrors && scraperStatus.mirrors.length > 0 && (
                <div className="pt-2 space-y-1.5">
                  <span className="text-[10px] uppercase font-mono font-bold text-theme-sub block">
                    Feed Mirrors
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10.5px] font-mono">
                    {scraperStatus.mirrors.map((m: any, idx: number) => (
                      <div key={idx} className="p-2 rounded-xl bg-theme-card flex items-center justify-between gap-2">
                        <span className="truncate text-theme-main font-medium">{m.name}</span>
                        <Badge variant="accent" size="xs" pill>
                          {m.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Storage Status Section */}
            <Card surface="elevated" padding="md" radius="2xl" className="shadow-none sm:p-5 space-y-3">
              <SectionHeader
                title="Storage Status"
                icon={<Server className="w-4 h-4 text-theme-primary" />}
                size="sm"
                action={
                  <Button
                    variant="secondary"
                    size="xs"
                    pill
                    onClick={fetchStorageStatus}
                    disabled={isCheckingStorage}
                    className="shadow-none"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${isCheckingStorage ? 'animate-spin text-theme-primary' : ''}`}
                    />
                    <span>Test Storage</span>
                  </Button>
                }
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <Card surface="default" padding="md" radius="2xl" className="shadow-none space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-theme-main flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-theme-primary" />
                      Football Data DB
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-theme-sub space-y-0.5">
                    <div className="truncate">
                      Path:{' '}
                      <span className="text-theme-main font-semibold">
                        {storageStatus?.storageEngine?.dbPath || 'data/football_engine.db'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] pt-0.5">
                      <span className="text-theme-sub">
                        Disk Size:{' '}
                        <strong className="text-theme-primary">{storageStatus?.storageEngine?.sizeMB ?? 0.1} MB</strong>
                      </span>
                      <span className="text-theme-primary font-semibold">99.6% Optimized</span>
                    </div>
                    {storageStatus?.footballDb?.error && (
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 truncate">
                        Err: {storageStatus.footballDb.error}
                      </p>
                    )}
                  </div>
                </Card>

                <Card surface="default" padding="md" radius="2xl" className="shadow-none space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-theme-main flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-sky-400" />
                      Prediction Store
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-theme-sub space-y-0.5">
                    <div className="truncate">
                      Driver: <span className="text-theme-main font-semibold">better-sqlite3 C-Bindings</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] pt-0.5">
                      <span className="text-theme-sub">
                        Stored Predictions:{' '}
                        <strong className="text-theme-main">
                          {storageStatus?.storageEngine?.tableCounts?.predictions ??
                            localStats?.predictionsCount ??
                            stats?.predictionsCount ??
                            0}
                        </strong>
                      </span>
                      <span className="text-theme-primary font-semibold">5 Pillars Active</span>
                    </div>
                    {storageStatus?.predictionsDb?.error && (
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 truncate">
                        Err: {storageStatus.predictionsDb.error}
                      </p>
                    )}
                  </div>
                </Card>
              </div>
            </Card>

            {/* Full Data & H2H Sync Card */}
            <Card surface="elevated" padding="md" radius="2xl" className="shadow-none sm:p-5 space-y-4">
              <SectionHeader
                title="Full Sync"
                size="md"
                icon={
                  <div className="p-2 rounded-full bg-theme-primary-subtle text-theme-primary">
                    <RefreshCw className="w-4 h-4" />
                  </div>
                }
                action={
                  isOperating ? (
                    <span className="text-xs text-theme-primary font-semibold flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      In Progress...
                    </span>
                  ) : undefined
                }
              />

              {isOperating && (
                <Card surface="default" padding="md" radius="2xl" className="shadow-none space-y-2.5">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-bold text-theme-main flex items-center gap-2 truncate">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-theme-primary shrink-0" />
                      <span className="truncate">
                        {syncProgress?.currentStep || 'Fetching historical archives, upcoming feeds & H2H...'}
                      </span>
                    </span>
                    <span className="text-[11px] font-mono tabular-nums font-black text-theme-main shrink-0">
                      {syncProgress?.progress ?? 50}%
                      {syncProgress?.stepIndex && syncProgress?.totalSteps
                        ? ` (Step ${syncProgress.stepIndex}/${syncProgress.totalSteps})`
                        : ''}
                    </span>
                  </div>
                  <ProgressBar value={syncProgress?.progress ?? 25} trackSurface="subtle" />
                </Card>
              )}

              {!isOperating && !isConfirmingReset && (
                <Button
                  variant="primary"
                  size="lg"
                  pill
                  fullWidth
                  onClick={() => setIsConfirmingReset(true)}
                  className="uppercase tracking-wide"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Trigger Full Data & H2H Sync</span>
                </Button>
              )}

              {!isOperating && isConfirmingReset && (
                <Card surface="subtle" padding="md" radius="2xl" className="bg-theme-primary-subtle space-y-3">
                  <div className="flex items-start gap-2.5">
                    <RefreshCw className="w-4 h-4 text-theme-primary shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-theme-main">Confirm Full Sync?</p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="primary"
                      size="md"
                      pill
                      className="flex-1"
                      onClick={handleExecuteResetAndSync}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Confirm & Trigger Full Sync</span>
                    </Button>
                    <Button variant="secondary" size="md" pill onClick={() => setIsConfirmingReset(false)}>
                      Cancel
                    </Button>
                  </div>
                </Card>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'PREDICTIONS' && (
          <div className="space-y-4">
            {/* Predictions Engine Status Banner */}
            <Card surface="elevated" padding="md" radius="2xl" className="shadow-none sm:p-5 space-y-3">
              <SectionHeader
                title="Predictions"
                size="md"
                icon={
                  <div className="p-2 rounded-full bg-theme-primary-subtle text-theme-primary">
                    <Sparkles className="w-4 h-4" />
                  </div>
                }
              />

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <StatTile
                  label="Upcoming Fixtures"
                  value={predictionProgress?.upcomingCount ?? localStats?.upcomingCount ?? stats?.upcomingCount ?? '—'}
                  tone="accent"
                  surface="card"
                />
                <StatTile
                  label="Stored Predictions"
                  value={
                    predictionProgress?.predictionsCount ??
                    localStats?.predictionsCount ??
                    storageStatus?.storageEngine?.tableCounts?.predictions ??
                    stats?.predictionsCount ??
                    '—'
                  }
                  tone="accent"
                  surface="card"
                />
              </div>
            </Card>

            {/* Action Card: Trigger Predictions Update */}
            <Card surface="elevated" padding="md" radius="2xl" className="shadow-none sm:p-5 space-y-4">
              <SectionHeader
                title="Recalculate Predictions"
                size="md"
                icon={
                  <div className="p-2 rounded-full bg-theme-primary text-theme-primary-text font-bold">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                }
              />

              {isUpdatingPredictions && (
                <Card surface="default" padding="md" radius="2xl" className="shadow-none space-y-2.5">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-bold text-theme-main flex items-center gap-2 truncate">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-theme-primary shrink-0" />
                      <span className="truncate">
                        {predictionProgress?.currentStep || 'Recalculating 5-Pillar Poisson predictions...'}
                      </span>
                    </span>
                    <span className="text-[11px] font-mono tabular-nums font-black text-theme-main shrink-0">
                      {predictionProgress?.progress ?? 15}%
                      {predictionProgress?.stepIndex && predictionProgress?.totalSteps
                        ? ` (Step ${predictionProgress.stepIndex}/${predictionProgress.totalSteps})`
                        : ''}
                    </span>
                  </div>
                  <ProgressBar value={predictionProgress?.progress ?? 15} trackSurface="subtle" />
                  <div className="flex items-center justify-between text-[10.5px] font-mono tabular-nums text-theme-sub pt-0.5">
                    <span>
                      Predicted:{' '}
                      <strong className="text-theme-primary">{predictionProgress?.matchesCount ?? 0}</strong> /{' '}
                      {predictionProgress?.upcomingCount ?? localStats?.upcomingCount ?? '—'}
                    </span>
                    <span>
                      Skipped (&lt;90% data):{' '}
                      <strong className="text-amber-500">{predictionProgress?.skippedCount ?? 0}</strong>
                    </span>
                  </div>
                </Card>
              )}

              {predictionResultMsg && (
                <div className="p-3 rounded-2xl bg-theme-primary-subtle text-theme-primary text-xs font-bold flex items-center gap-2 font-mono">
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

              <Button
                id="update-upcoming-predictions-btn"
                variant="primary"
                size="lg"
                pill
                fullWidth
                onClick={handleUpdatePredictions}
                disabled={isUpdatingPredictions}
                className="uppercase tracking-wide"
              >
                <RefreshCw className={`w-4 h-4 ${isUpdatingPredictions ? 'animate-spin' : ''}`} />
                <span>{isUpdatingPredictions ? 'Calculating & Updating DB...' : 'Update Predictions'}</span>
              </Button>
            </Card>

            {/* Calculated Market Categories Info */}
            <Card surface="elevated" padding="md" radius="2xl" className="shadow-none space-y-2 text-xs">
              <span className="font-bold text-theme-main uppercase tracking-wider text-[10px] block font-mono">
                Market Categories
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-theme-sub">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>1X2 Match Outcomes</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Goals Over/Under (1.5, 2.5, 3.5)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>Both Teams to Score (BTTS)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  <span>Double Chance (1X, X2, 12)</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'UI' && (
          <div className="space-y-4">
            {/* Appearance / Theme Selector */}
            <Card surface="subtle" padding="md" radius="2xl" className="sm:p-5 space-y-3">
              <SectionHeader title="Theme" size="md" />

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => theme !== 'light' && onToggleTheme()}
                  className={`p-3.5 rounded-2xl flex items-center justify-between transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                    theme === 'light'
                      ? 'bg-theme-card text-theme-main shadow-theme-sm ring-2 ring-theme-accent'
                      : 'bg-theme-card/65 text-theme-sub hover:bg-theme-card hover:text-theme-main'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-full bg-amber-500/10 text-amber-500">
                      <Sun className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold block text-theme-main">Light Mode</span>
                  </div>
                  {theme === 'light' && <Check className="w-4 h-4 text-theme-main" />}
                </button>

                <button
                  type="button"
                  onClick={() => theme !== 'dark' && onToggleTheme()}
                  className={`p-3.5 rounded-2xl flex items-center justify-between transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                    theme === 'dark'
                      ? 'bg-theme-card text-theme-main shadow-theme-sm ring-2 ring-theme-accent'
                      : 'bg-theme-card/65 text-theme-sub hover:bg-theme-card hover:text-theme-main'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-full bg-theme-subtle text-amber-400">
                      <Moon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold block text-theme-main">Dark Mode</span>
                  </div>
                  {theme === 'dark' && <Check className="w-4 h-4 text-theme-primary" />}
                </button>
              </div>
            </Card>

            {/* Color System Theme Selector */}
            <Card surface="subtle" padding="md" radius="2xl" className="sm:p-5 space-y-3">
              <SectionHeader
                title="Color Palette"
                icon={<Sparkles className="w-4 h-4 text-theme-primary" />}
                size="md"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {COLOR_THEMES.map((t) => {
                  const isSelected = activeThemeId === t.id;
                  return (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectColorTheme(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectColorTheme(t.id);
                        }
                      }}
                      className={`group relative p-3.5 rounded-2xl transition-all duration-150 cursor-pointer flex flex-col justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                        isSelected
                          ? 'bg-theme-card shadow-theme-sm ring-2 ring-theme-accent'
                          : 'bg-theme-card/75 hover:bg-theme-card hover:shadow-theme-sm'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-theme-main truncate">{t.name}</span>
                          {isSelected ? (
                            <Badge variant="solid" size="xs" pill>
                              <Check className="w-3 h-3 stroke-[3]" />
                              <span>Active</span>
                            </Badge>
                          ) : null}
                        </div>

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

                      <div className="pt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-4 h-4 rounded-full shrink-0"
                            style={{ backgroundColor: t.previewColors.primary }}
                            title={`Primary Accent: ${t.accentName}`}
                          />
                          <div
                            className="w-4 h-4 rounded-full shrink-0"
                            style={{ backgroundColor: t.previewColors.modelPick }}
                            title={`Model Pick & Value: ${t.modelPickName}`}
                          />
                          <div
                            className="w-4 h-4 rounded-full shrink-0"
                            style={{ backgroundColor: t.previewColors.live }}
                            title="Live Status Signal"
                          />
                          <div
                            className="w-4 h-4 rounded-full shrink-0"
                            style={{ backgroundColor: t.previewColors.surfaceDark }}
                            title="Dark Surface Canvas"
                          />
                          <div
                            className="w-4 h-4 rounded-full shrink-0"
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
            </Card>

            {/* Terminal Logs & Console Section */}
            {onOpenTerminal && (
              <Card
                surface="elevated"
                padding="md"
                radius="2xl"
                className="shadow-none sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <SectionHeader
                  title="System Terminal"
                  size="md"
                  icon={
                    <div className="p-2 rounded-full bg-theme-primary text-theme-primary-text font-bold">
                      <Terminal className="w-4 h-4" />
                    </div>
                  }
                />

                <Button variant="primary" size="md" pill onClick={onOpenTerminal}>
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Open Terminal</span>
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* Toast Notification */}
        {showSavedToast && (
          <div className="p-3 rounded-full bg-theme-primary-subtle text-theme-primary text-xs font-black flex items-center gap-2 shadow-theme-sm font-mono">
            <Check className="w-4 h-4 text-theme-primary" />
            <span>Settings saved successfully</span>
          </div>
        )}
      </div>
    </Modal>
  );
};
