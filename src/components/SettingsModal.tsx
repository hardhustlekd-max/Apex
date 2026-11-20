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
  Server,
  Sparkles,
  TrendingUp,
  Download,
  Upload,
  Cloud,
  Trash2,
  LogOut,
  AlertTriangle,
} from 'lucide-react';
import { EngineSettings, ProviderStatus } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import {
  initDriveAuth,
  googleDriveSignIn,
  googleDriveSignInViaGis,
  preloadGoogleIdentityServices,
  getDriveAccessToken,
  clearDriveAccessToken,
  driveLogout,
  getCurrentDriveUser,
  DriveUserProfile,
} from '../core/googleDriveAuth.js';
import { COLOR_THEMES, applyColorTheme, getActiveColorThemeId } from '../core/themeEngine.js';
import {
  Badge,
  Button,
  Card,
  Modal,
  SectionHeader,
  SegmentedTabs,
  Select,
  StatTile,
} from './ui/index.js';

type SettingsTab = 'DATA' | 'PREDICTIONS' | 'UI';

const isViteDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EngineSettings | null;
  providers: ProviderStatus[];
  onSaveSettings: (newSettings: Partial<EngineSettings>) => void;
  onResetAndSync?: () => void | Promise<void>;
  isResettingAndSyncing?: boolean;
  isSyncingData?: boolean;
  onCalculatePredictions?: () => void | Promise<void>;
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
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onResetAndSync,
  isResettingAndSyncing,
  isSyncingData,
  onCalculatePredictions,
  stats,
  theme,
  onToggleTheme,
  onOpenTerminal,
  onRefreshMetrics,
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
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportToast, setExportToast] = useState<string | null>(null);

  const [exportSort, setExportSort] = useState<'default' | 'desc' | 'asc'>('default');

  // Dev Preview Only: Google Drive SQLite Sync state (token strictly kept in memory)
  const isDevPreviewClient = Boolean(isViteDev) && storageStatus?.storageEngine?.isDevPreview !== false;
  const [driveUser, setDriveUser] = useState<DriveUserProfile | null>(() => getCurrentDriveUser());
  const [driveToken, setDriveToken] = useState<string | null>(() => getDriveAccessToken());
  const [driveNeedsAuth, setDriveNeedsAuth] = useState<boolean>(() => !getDriveAccessToken());
  const [isDriveLoggingIn, setIsDriveLoggingIn] = useState<boolean>(false);
  const [showDirectOAuthFallback, setShowDirectOAuthFallback] = useState<boolean>(false);
  const [isCheckingDrive, setIsCheckingDrive] = useState<boolean>(false);
  const [isDriveMutating, setIsDriveMutating] = useState<boolean>(false);
  const [driveFileMeta, setDriveFileMeta] = useState<{
    id: string;
    name: string;
    size?: string;
    modifiedTime?: string;
  } | null>(null);
  const [driveNotice, setDriveNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingDriveConfirm, setPendingDriveConfirm] = useState<'UPLOAD' | 'RESTORE' | 'DELETE' | null>(null);

  const checkDriveBackupStatus = async (tokenOverride?: string | null) => {
    if (!isViteDev) return;
    const tok = tokenOverride ?? getDriveAccessToken();
    if (!tok) {
      setDriveNeedsAuth(true);
      setDriveFileMeta(null);
      return;
    }
    setIsCheckingDrive(true);
    try {
      const res = await EngineService.getDriveDbStatus(tok);
      if (res.needsReauth) {
        clearDriveAccessToken();
        setDriveToken(null);
        setDriveNeedsAuth(true);
        setDriveFileMeta(null);
        setDriveNotice({
          type: 'error',
          text: res.error || 'Google Drive session expired or missing permissions. Please sign in again.',
        });
        return;
      }
      if (res.success) {
        setDriveNeedsAuth(false);
        setDriveFileMeta(res.driveFile || null);
      } else if (res.error) {
        setDriveNotice({ type: 'error', text: res.error });
      }
    } finally {
      setIsCheckingDrive(false);
    }
  };

  useEffect(() => {
    if (!isViteDev) return;
    void preloadGoogleIdentityServices();
    const unsub = initDriveAuth(
      (u, tok) => {
        setDriveUser(u);
        setDriveToken(tok);
        setDriveNeedsAuth(false);
        setShowDirectOAuthFallback(false);
      },
      () => {
        setDriveUser(getCurrentDriveUser());
        setDriveToken(null);
        setDriveNeedsAuth(true);
        setDriveFileMeta(null);
      }
    );
    return () => unsub();
  }, []);

  const handleDriveSignIn = async (mode: 'FIREBASE' | 'GIS' = 'FIREBASE') => {
    setIsDriveLoggingIn(true);
    setDriveNotice(null);
    try {
      const res = mode === 'GIS' ? await googleDriveSignInViaGis() : await googleDriveSignIn();
      if (res) {
        setDriveUser(res.user);
        setDriveToken(res.accessToken);
        setDriveNeedsAuth(false);
        setShowDirectOAuthFallback(false);
        await checkDriveBackupStatus(res.accessToken);
      }
    } catch (err: any) {
      if (mode === 'FIREBASE') {
        setShowDirectOAuthFallback(true);
      }
      setDriveNotice({ type: 'error', text: err?.message || 'Google sign-in failed.' });
    } finally {
      setIsDriveLoggingIn(false);
    }
  };

  const handleDriveSignOut = async () => {
    setPendingDriveConfirm(null);
    await driveLogout();
    setDriveUser(null);
    setDriveToken(null);
    setDriveNeedsAuth(true);
    setDriveFileMeta(null);
    setDriveNotice(null);
  };

  const handleExecuteConfirmedDriveAction = async () => {
    const action = pendingDriveConfirm;
    if (!action) return;
    const tok = driveToken || getDriveAccessToken();
    if (!tok) {
      setPendingDriveConfirm(null);
      setDriveNeedsAuth(true);
      setDriveNotice({ type: 'error', text: 'Please sign in with Google first.' });
      return;
    }

    setPendingDriveConfirm(null);
    setIsDriveMutating(true);
    setDriveNotice(null);

    try {
      if (action === 'UPLOAD') {
        const res = await EngineService.uploadDbToDrive(tok, driveFileMeta?.id);
        if (res.needsReauth) {
          clearDriveAccessToken();
          setDriveToken(null);
          setDriveNeedsAuth(true);
          setDriveNotice({ type: 'error', text: res.error || 'Please sign in again.' });
          return;
        }
        if (res.success && res.driveFile) {
          setDriveFileMeta(res.driveFile);
          const mb = ((res.sizeBytes || Number(res.driveFile.size || 0)) / (1024 * 1024)).toFixed(2);
          setDriveNotice({
            type: 'success',
            text: `${res.action === 'UPDATED' ? 'Updated' : 'Uploaded'} '${res.driveFile.name}' (${mb} MB) in Google Drive.`,
          });
        } else {
          setDriveNotice({ type: 'error', text: res.error || 'Failed to save database to Google Drive.' });
        }
      } else if (action === 'RESTORE') {
        if (!driveFileMeta?.id) {
          setDriveNotice({ type: 'error', text: 'No backup file selected to restore.' });
          return;
        }
        const res = await EngineService.restoreDbFromDrive(tok, driveFileMeta.id);
        if (res.needsReauth) {
          clearDriveAccessToken();
          setDriveToken(null);
          setDriveNeedsAuth(true);
          setDriveNotice({ type: 'error', text: res.error || 'Please sign in again.' });
          return;
        }
        if (res.success) {
          const mb = ((res.sizeBytes || 0) / (1024 * 1024)).toFixed(2);
          setDriveNotice({
            type: 'success',
            text: `Restored '${driveFileMeta.name}' (${mb} MB) into local dev preview SQLite database.`,
          });
          await handleRefreshMetrics();
        } else {
          setDriveNotice({ type: 'error', text: res.error || 'Failed to restore SQLite database from Google Drive.' });
        }
      } else if (action === 'DELETE') {
        if (!driveFileMeta?.id) return;
        const deletedName = driveFileMeta.name;
        const res = await EngineService.deleteDriveDbFile(tok, driveFileMeta.id);
        if (res.needsReauth) {
          clearDriveAccessToken();
          setDriveToken(null);
          setDriveNeedsAuth(true);
          setDriveNotice({ type: 'error', text: res.error || 'Please sign in again.' });
          return;
        }
        if (res.success) {
          setDriveFileMeta(null);
          setDriveNotice({ type: 'success', text: `Deleted '${deletedName}' from Google Drive.` });
        } else {
          setDriveNotice({ type: 'error', text: res.error || 'Failed to delete Google Drive backup.' });
        }
      }
    } finally {
      setIsDriveMutating(false);
    }
  };

  const handleExportPredictions = async () => {
    setIsExporting(true);
    setExportToast(null);
    try {
      const sortParam = exportSort === 'default' ? undefined : exportSort;
      const res = await EngineService.downloadPredictionsJson(sortParam);
      if (res.success) {
        setExportToast(`Exported ${res.count ?? 0} predictions to ${res.filename}`);
      } else {
        setExportToast(res.error || 'Failed to export predictions.');
      }
    } catch (err: any) {
      setExportToast(err?.message || 'Error exporting predictions.');
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportToast(null), 4500);
    }
  };

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

  const isOperating = Boolean(isResettingAndSyncing || isSyncingData);

  useEffect(() => {
    if (!isOpen) {
      setIsConfirmingReset(false);
      setPendingDriveConfirm(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && (activeTab === 'DATA' || activeTab === 'PREDICTIONS')) {
      fetchStorageStatus();
      fetchScraperStatus();
      fetchFreshStats();
      if (isViteDev && getDriveAccessToken()) {
        void checkDriveBackupStatus(getDriveAccessToken());
      }
    }
  }, [isOpen, activeTab, isOperating]);

  if (!isOpen || !settings) return null;

  const handleExecuteResetAndSync = () => {
    setIsConfirmingReset(false);
    onClose();
    if (onResetAndSync) {
      onResetAndSync();
    }
  };

  const handleCalculatePredictions = () => {
    onClose();
    if (onCalculatePredictions) {
      onCalculatePredictions();
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
        onOpenTerminal ? (
          <Button
            id="settings-open-terminal-btn"
            variant="subtle"
            size="sm"
            onClick={onOpenTerminal}
            title="Terminal Logs"
          >
            <Terminal className="w-3.5 h-3.5 text-theme-primary" />
            <span className="hidden sm:inline">Terminal</span>
          </Button>
        ) : undefined
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="subtle" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            Save Settings
          </Button>
        </div>
      }
    >
      {/* Modal Navigation Tabs */}
      <div className="px-3.5 sm:px-4 pt-2.5 pb-1 shrink-0">
        <SegmentedTabs<SettingsTab>
          items={[
            {
              id: 'DATA',
              label: 'Data Management',
              icon: <Database className="w-3.5 h-3.5" />,
            },
            {
              id: 'PREDICTIONS',
              label: 'Predictions',
              icon: <Sparkles className="w-3.5 h-3.5" />,
            },
            {
              id: 'UI',
              label: 'UI Themes',
              icon: <Sun className="w-3.5 h-3.5" />,
            },
          ]}
          value={activeTab}
          onChange={(val) => setActiveTab(val)}
          variant="subtle"
          size="xs"
          fullWidth
          ariaLabel="Settings categories"
        />
      </div>

      {/* Tab Body */}
      <div className="p-3 space-y-2.5 overflow-y-auto flex-1">
        {activeTab === 'DATA' && (
          <div className="space-y-2.5">
            {/* Live Database Metrics Overview */}
            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
                <SectionHeader
                  title="Database Metrics"
                  icon={<Database className="w-3.5 h-3.5" />}
                  size="sm"
                  className="w-full"
                  action={
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={handleRefreshMetrics}
                      disabled={isRefreshingMetrics}
                      title="Refresh live metrics & feed stats"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isRefreshingMetrics ? 'animate-spin text-theme-primary' : ''}`}
                      />
                      <span>Refresh</span>
                    </Button>
                  }
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-[var(--border-subdued)]">
                <StatTile
                  label="Upcoming"
                  value={localStats?.upcomingCount ?? stats?.upcomingCount ?? '—'}
                  tone="accent"
                  surface="flat"
                />
                <StatTile
                  label="Predictions"
                  value={storedPredictionsCount}
                  tone="accent"
                  surface="flat"
                />
                <StatTile
                  label="Raw Feeds"
                  value={localStats?.rawFeedsCount ?? stats?.rawFeedsCount ?? '—'}
                  tone="accent"
                  surface="flat"
                />
                <StatTile
                  label="Historical"
                  value={localStats?.totalMatches ?? stats?.totalMatches ?? '—'}
                  tone="accent"
                  surface="flat"
                />
              </div>
            </Card>

            {/* Scraper Engine & Circuit Breaker Diagnostics Card */}
            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center justify-between gap-2">
                <SectionHeader
                  title="Scraper Health"
                  icon={<Cpu className="w-3.5 h-3.5" />}
                  size="sm"
                />
                <span className="text-xs font-normal tabular-nums text-theme-sub">
                  Circuit Failures:{' '}
                  <strong className="text-theme-main font-semibold">{scraperStatus?.circuit?.failureCount ?? 0}</strong>
                </span>
              </div>

              {scraperStatus?.mirrors && scraperStatus.mirrors.length > 0 && (
                <div className="divide-y divide-[var(--border-subdued)] text-sm">
                  {scraperStatus.mirrors.map((m: any, idx: number) => (
                    <div key={idx} className="min-h-[32px] px-3 py-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-theme-main font-medium">{m.name}</span>
                      <span className="text-xs font-semibold text-theme-primary shrink-0">
                        {m.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Storage Status Section (flattened - single card) */}
            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
                <SectionHeader
                  title="Storage Status"
                  icon={<Server className="w-3.5 h-3.5" />}
                  size="sm"
                  className="w-full"
                  action={
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={fetchStorageStatus}
                      disabled={isCheckingStorage}
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isCheckingStorage ? 'animate-spin text-theme-primary' : ''}`}
                      />
                      <span>Test Storage</span>
                    </Button>
                  }
                />
              </div>

              <div className="px-3.5 py-2.5 space-y-1.5 text-sm tabular-nums">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-semibold text-theme-main">SQLite Storage Engine</span>
                  <span className="text-xs font-medium text-theme-primary">
                    better-sqlite3 · 5 Pillars
                  </span>
                </div>

                <div className="truncate text-theme-sub text-xs font-normal">
                  Path:{' '}
                  <span className="text-theme-main font-medium">
                    {storageStatus?.storageEngine?.dbPath || 'data/football_engine.db'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-normal">
                  <span className="text-theme-sub">
                    Disk Size:{' '}
                    <strong className="text-theme-primary font-semibold">{storageStatus?.storageEngine?.sizeMB ?? 0.1} MB</strong>
                  </span>
                  <span className="text-theme-primary font-medium">WAL Mode</span>
                </div>
                {(storageStatus?.footballDb?.error || storageStatus?.predictionsDb?.error) && (
                  <p className="text-xs text-rose-500 dark:text-rose-400 truncate font-medium">
                    Err: {storageStatus?.footballDb?.error || storageStatus?.predictionsDb?.error}
                  </p>
                )}
              </div>
            </Card>

            {/* Dev Preview Only: Google Drive SQLite Storage Card */}
            {isDevPreviewClient && (
              <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
                <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center justify-between gap-2">
                  <SectionHeader
                    title="Google Drive DB Backup"
                    icon={<Cloud className="w-3.5 h-3.5" />}
                    size="sm"
                  />
                  <Badge variant="accent" size="xs">
                    Dev Preview Only
                  </Badge>
                </div>

                <div className="p-3.5 space-y-2.5 text-sm">
                  <p className="text-xs text-theme-sub leading-relaxed">
                    Store or restore <span className="font-mono text-theme-main">football_engine.db</span> ({storageStatus?.storageEngine?.sizeMB ?? 0} MB) in your Google Drive strictly for dev server preview sessions.
                  </p>

                  {driveNotice && (
                    <div
                      className={`px-2.5 py-2 rounded-xl text-xs font-medium flex items-start gap-2 border ${
                        driveNotice.type === 'success'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-500 dark:text-rose-400'
                      }`}
                    >
                      {driveNotice.type === 'success' ? (
                        <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      )}
                      <span className="break-words">{driveNotice.text}</span>
                    </div>
                  )}

                  {driveNeedsAuth || !driveToken ? (
                    <div className="pt-0.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <span className="text-xs text-theme-dim">
                        Sign in to connect Google Drive for dev preview database sync.
                      </span>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleDriveSignIn('FIREBASE')}
                          disabled={isDriveLoggingIn}
                          className="inline-flex items-center justify-center gap-2.5 h-[38px] px-4 rounded-xl bg-white text-[#1f1f1f] border border-[#747775]/40 hover:bg-[#f8f9fa] active:bg-[#f1f3f4] font-medium text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-60 shrink-0"
                        >
                          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                          </svg>
                          <span>{isDriveLoggingIn ? 'Signing in...' : 'Sign in with Google'}</span>
                        </button>
                        {showDirectOAuthFallback && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleDriveSignIn('GIS')}
                            disabled={isDriveLoggingIn}
                            title="Connect directly via Google Identity Services OAuth popup"
                          >
                            <span>Direct Google OAuth</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="px-2.5 py-2 rounded-xl bg-theme-subtle border border-theme-subdued flex items-center justify-between gap-2 flex-wrap text-xs">
                        <div className="min-w-0">
                          <div className="font-semibold text-theme-main truncate">
                            {driveUser?.email || driveUser?.displayName || 'Google Drive Connected'}
                          </div>
                          <div className="text-theme-sub mt-0.5 tabular-nums">
                            {isCheckingDrive
                              ? 'Checking Drive backup...'
                              : driveFileMeta
                              ? `Drive File: ${driveFileMeta.name} (${(Number(driveFileMeta.size || 0) / (1024 * 1024)).toFixed(2)} MB) · Updated ${
                                  driveFileMeta.modifiedTime ? new Date(driveFileMeta.modifiedTime).toLocaleString() : 'recently'
                                }`
                              : 'No football_engine.db backup in Google Drive yet'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => void checkDriveBackupStatus()}
                            disabled={isCheckingDrive || isDriveMutating}
                            title="Refresh Google Drive backup status"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingDrive ? 'animate-spin text-theme-primary' : ''}`} />
                            <span>Check</span>
                          </Button>
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => void handleDriveSignOut()}
                            disabled={isDriveMutating}
                            title="Sign out of Google Drive"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Sign out</span>
                          </Button>
                        </div>
                      </div>

                      {pendingDriveConfirm ? (
                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                          <p className="text-xs font-semibold text-theme-main flex items-start gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <span>
                              {pendingDriveConfirm === 'UPLOAD'
                                ? driveFileMeta
                                  ? `Overwrite '${driveFileMeta.name}' in your Google Drive with the current local SQLite database (${storageStatus?.storageEngine?.sizeMB ?? 0} MB)?`
                                  : `Upload and create 'football_engine.db' (${storageStatus?.storageEngine?.sizeMB ?? 0} MB) in your Google Drive?`
                                : pendingDriveConfirm === 'RESTORE'
                                ? `Replace the local dev preview SQLite database with '${driveFileMeta?.name}' (${(Number(driveFileMeta?.size || 0) / (1024 * 1024)).toFixed(2)} MB) from Google Drive?`
                                : `Permanently delete '${driveFileMeta?.name}' (${(Number(driveFileMeta?.size || 0) / (1024 * 1024)).toFixed(2)} MB) from your Google Drive? This action cannot be undone.`}
                            </span>
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant={pendingDriveConfirm === 'DELETE' ? 'danger' : 'primary'}
                              size="xs"
                              onClick={() => void handleExecuteConfirmedDriveAction()}
                              disabled={isDriveMutating}
                            >
                              <span>
                                {pendingDriveConfirm === 'DELETE'
                                  ? 'Confirm Delete'
                                  : pendingDriveConfirm === 'RESTORE'
                                  ? 'Confirm Restore'
                                  : driveFileMeta
                                  ? 'Confirm Overwrite'
                                  : 'Confirm Upload'}
                              </span>
                            </Button>
                            <Button
                              variant="secondary"
                              size="xs"
                              onClick={() => setPendingDriveConfirm(null)}
                              disabled={isDriveMutating}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setPendingDriveConfirm('UPLOAD')}
                            disabled={isDriveMutating || isOperating}
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>
                              {isDriveMutating
                                ? 'Syncing Drive...'
                                : driveFileMeta
                                ? 'Update Drive Backup'
                                : 'Save DB to Drive'}
                            </span>
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setPendingDriveConfirm('RESTORE')}
                            disabled={!driveFileMeta || isDriveMutating || isOperating}
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Restore from Drive</span>
                          </Button>
                          {driveFileMeta && (
                            <Button
                              variant="subtle"
                              size="sm"
                              onClick={() => setPendingDriveConfirm('DELETE')}
                              disabled={isDriveMutating || isOperating}
                              title="Delete backup file from Google Drive"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              <span className="text-rose-500">Delete</span>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Full Data Sync Card (no nested card) */}
            <Card surface="elevated" padding="sm" radius="2xl" className="sm:p-3.5 space-y-2.5">
              <SectionHeader
                title="Full Data Sync"
                size="sm"
                icon={<RefreshCw className="w-3.5 h-3.5" />}
              />

              {!isConfirmingReset ? (
                <Button
                  id="full-data-sync-btn"
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={() => setIsConfirmingReset(true)}
                  disabled={isOperating}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Full Data Sync</span>
                </Button>
              ) : (
                <div className="pt-1 space-y-2">
                  <p className="text-sm font-semibold text-theme-main flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-theme-primary shrink-0" />
                    <span>Confirm Full Data Sync?</span>
                  </p>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      onClick={handleExecuteResetAndSync}
                      disabled={isOperating}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Confirm &amp; Start Sync</span>
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setIsConfirmingReset(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'PREDICTIONS' && (
          <div className="space-y-3">
            {/* Action Card: Calculate Predictions */}
            <Card surface="elevated" padding="sm" radius="2xl" className="sm:p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <SectionHeader
                  title="Calculate Predictions"
                  size="sm"
                  icon={<TrendingUp className="w-3.5 h-3.5" />}
                />
                <span className="text-xs font-normal tabular-nums text-theme-sub">
                  {storedPredictionsCount} stored · {localStats?.upcomingCount ?? stats?.upcomingCount ?? '—'} upcoming
                </span>
              </div>

              <Button
                id="update-upcoming-predictions-btn"
                variant="primary"
                size="md"
                fullWidth
                onClick={handleCalculatePredictions}
                disabled={isOperating}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Calculate Predictions</span>
              </Button>
            </Card>

            {/* Action Card: Export 1X2 Predictions to JSON */}
            <Card surface="elevated" padding="sm" radius="2xl" className="sm:p-3.5 space-y-2.5">
              <SectionHeader
                title="Export Predictions"
                size="sm"
                icon={<Download className="w-3.5 h-3.5" />}
              />

              <p className="text-sm font-normal text-theme-sub leading-relaxed font-sans">
                Export all 1X2 model predictions to JSON for offline archiving or accuracy evaluation.
              </p>

              {exportToast && (
                <div className="p-2.5 rounded-xl bg-theme-primary-subtle border border-theme-neon text-theme-primary text-sm font-medium flex items-center gap-2">
                  <Check className="w-4 h-4 text-theme-primary shrink-0" />
                  <span>{exportToast}</span>
                </div>
              )}

              <div className="space-y-1 pt-0.5">
                <label className="text-2xs font-medium text-theme-sub uppercase tracking-[0.06em] block">
                  Sort Order (Probability %)
                </label>
                <Select
                  aria-label="Export sort order"
                  value={exportSort}
                  onChange={(e) => setExportSort(e.target.value as any)}
                  surface="subtle"
                  selectSize="md"
                  options={[
                    { value: 'default', label: 'Default Date Order' },
                    { value: 'desc', label: 'Highest Probability First (Descending)' },
                    { value: 'asc', label: 'Lowest Probability First (Ascending)' },
                  ]}
                />
              </div>

              <Button
                id="export-predictions-json-btn"
                variant="inverse"
                size="md"
                fullWidth
                onClick={handleExportPredictions}
                disabled={isExporting || isOperating}
              >
                <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
                <span>{isExporting ? 'Exporting Predictions...' : 'Export 1X2 Predictions (JSON)'}</span>
              </Button>
            </Card>

            {/* Calculated Market Categories Info */}
            <Card surface="elevated" padding="sm" radius="2xl" className="sm:p-3.5 space-y-2">
              <SectionHeader title="Market Categories" size="sm" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm font-normal text-theme-main">
                <div className="min-h-[28px] px-2.5 py-1 rounded-lg bg-theme-subtle/75 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm bg-amber-400 shrink-0" />
                  <span>1X2 Match Outcomes</span>
                </div>
                <div className="min-h-[28px] px-2.5 py-1 rounded-lg bg-theme-subtle/75 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm bg-emerald-400 shrink-0" />
                  <span>Goals Over/Under (1.5, 2.5, 3.5)</span>
                </div>
                <div className="min-h-[28px] px-2.5 py-1 rounded-lg bg-theme-subtle/75 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm bg-indigo-400 shrink-0" />
                  <span>Both Teams to Score (BTTS)</span>
                </div>
                <div className="min-h-[28px] px-2.5 py-1 rounded-lg bg-theme-subtle/75 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm bg-sky-400 shrink-0" />
                  <span>Double Chance (1X, X2, 12)</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'UI' && (
          <div className="space-y-2.5">
            {/* Appearance / Theme Selector */}
            <Card surface="elevated" padding="sm" radius="2xl" className="sm:p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <SectionHeader title="Display Mode" size="sm" />
                <span className="text-xs font-medium text-theme-sub">
                  App Controlled
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => theme !== 'light' && onToggleTheme()}
                  className={`h-[34px] px-3 rounded-xl border flex items-center justify-between transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                    theme === 'light'
                      ? 'bg-theme-card text-theme-main font-semibold border-theme-accent shadow-theme-glow'
                      : 'bg-theme-card/60 border-theme-subdued text-theme-sub font-medium hover:bg-theme-card hover:text-theme-main'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-base text-theme-main">Light</span>
                  </div>
                  {theme === 'light' && <Check className="w-4 h-4 text-theme-primary stroke-[2.5]" />}
                </button>

                <button
                  type="button"
                  onClick={() => theme !== 'dark' && onToggleTheme()}
                  className={`h-[34px] px-3 rounded-xl border flex items-center justify-between transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                    theme === 'dark'
                      ? 'bg-theme-card text-theme-main font-semibold border-theme-accent shadow-theme-glow'
                      : 'bg-theme-card/60 border-theme-subdued text-theme-sub font-medium hover:bg-theme-card hover:text-theme-main'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Moon className="w-4 h-4 text-theme-primary shrink-0" />
                    <span className="text-base text-theme-main">Dark</span>
                  </div>
                  {theme === 'dark' && <Check className="w-4 h-4 text-theme-primary stroke-[2.5]" />}
                </button>
              </div>
            </Card>

            {/* Color System Theme Selector */}
            <Card surface="elevated" padding="sm" radius="2xl" className="sm:p-3.5 space-y-2.5">
              <SectionHeader
                title="Neon Theme Palette"
                icon={<Sparkles className="w-3.5 h-3.5" />}
                size="sm"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                      className={`group relative rounded-2xl border overflow-hidden transition-all duration-150 cursor-pointer flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                        isSelected
                          ? 'bg-theme-card border-theme-accent shadow-theme-glow'
                          : 'bg-theme-card border-theme hover:border-theme-accent hover:shadow-theme-sm'
                      }`}
                    >
                      {/* Theme Accent Gradient Strip Header */}
                      <div
                        className="h-1.5 w-full"
                        style={{ background: t.previewColors.gradient }}
                      />

                      <div className="p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-base font-semibold text-theme-main truncate tracking-[-0.01em]">{t.name}</span>
                          {isSelected ? (
                            <Badge variant="solid" size="xs">
                              <Check className="w-3 h-3 stroke-[3]" />
                              <span>Active</span>
                            </Badge>
                          ) : null}
                        </div>

                        <p className="text-sm font-normal text-theme-sub truncate">{t.tagline}</p>

                        {t.colorways && t.colorways.length > 0 && (
                          <p className="text-xs font-normal text-theme-dim truncate">
                            {t.colorways.join(' · ')}
                          </p>
                        )}

                        <div className="pt-1.5 border-t border-theme-subdued flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-4 h-4 rounded-md shrink-0 shadow-sm"
                              style={{ background: t.previewColors.gradient }}
                              title={`Primary Accent: ${t.accentName}`}
                            />
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: t.previewColors.modelPick }}
                              title={`Model Pick & Value: ${t.modelPickName}`}
                            />
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: t.previewColors.live }}
                              title="Live Status Signal"
                            />
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: t.previewColors.surfaceDark }}
                              title="Dark Surface Canvas"
                            />
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: t.previewColors.surfaceLight }}
                              title="Light Surface Canvas"
                            />
                          </div>
                          <span className="text-xs font-medium text-theme-sub truncate">
                            {t.accentName}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* Toast Notification */}
        {showSavedToast && (
          <div className="p-2.5 rounded-xl bg-theme-primary-subtle border border-theme-neon text-theme-primary text-sm font-medium flex items-center gap-2 shadow-theme-glow">
            <Check className="w-4 h-4 text-theme-primary" />
            <span>Settings saved successfully</span>
          </div>
        )}
      </div>
    </Modal>
  );
};
