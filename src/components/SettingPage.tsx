import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Settings,
  Cpu,
  Check,
  Database,
  RefreshCw,
  Server,
  Sparkles,
  TrendingUp,
  Download,
  Cloud,
  AlertTriangle,
  Search,
  ShieldAlert,
} from 'lucide-react';
import {
  EngineSettings,
  ProviderStatus,
  SqliteGateState,
  ScrapingGateState,
  LeagueVolatilityRecord,
} from '../core/types.js';
import { KNOWN_VOLATILE_LEAGUES } from '../core/volatileLeagues.js';
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
  AppLogo,
  AppLogoVariant,
  Badge,
  Button,
  Card,
  Input,
  SectionHeader,
  SegmentedTabs,
  Select,
  StatTile,
} from './ui/index.js';

type SettingsTab = 'DATA' | 'PREDICTIONS' | 'UI';

const isViteDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);

interface SettingPageProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EngineSettings | null;
  providers: ProviderStatus[];
  onSaveSettings: (newSettings: Partial<EngineSettings>, options?: { skipOverlay?: boolean }) => void;
  onResetAndSync?: (resetData?: boolean) => void | Promise<void>;
  isResettingAndSyncing?: boolean;
  isSyncingData?: boolean;
  onCalculatePredictions?: (resetData?: boolean) => void | Promise<void>;
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
  sqliteGate?: SqliteGateState | null;
  scrapingGate?: ScrapingGateState | null;
  loadDataEnabled?: boolean;
  isTogglingLoadData?: boolean;
  onToggleLoadData?: (enabled: boolean) => Promise<void> | void;
  onTriggerSavedOverlay?: (message?: string) => void;
  onShowToast?: (message: string, type?: 'success' | 'info' | 'danger') => void;
}

export const SettingPage: React.FC<SettingPageProps> = ({
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
  sqliteGate,
  scrapingGate,
  loadDataEnabled,
  isTogglingLoadData = false,
  onToggleLoadData,
  onTriggerSavedOverlay,
  onShowToast,
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

  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [resetFullSyncData, setResetFullSyncData] = useState<boolean>(false);
  const [isConfirmingCalc, setIsConfirmingCalc] = useState(false);
  const [resetCalcData, setResetCalcData] = useState<boolean>(false);
  const [storageStatus, setStorageStatus] = useState<any>(null);
  const [scraperStatus, setScraperStatus] = useState<any>(null);
  const [localStats, setLocalStats] = useState<any>(stats);
  const [isCheckingStorage, setIsCheckingStorage] = useState<boolean>(false);
  const [isRefreshingMetrics, setIsRefreshingMetrics] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const [exportSort, setExportSort] = useState<'default' | 'desc' | 'asc'>('default');
  const [leagueVolatilities, setLeagueVolatilities] = useState<LeagueVolatilityRecord[]>([]);
  const [isLoadingVolatility, setIsLoadingVolatility] = useState<boolean>(false);
  const [isCalibratingVolatility, setIsCalibratingVolatility] = useState<boolean>(false);
  const [volatilityMessage, setVolatilityMessage] = useState<string | null>(null);

  const [excludeVolatileLeaguesLocal, setExcludeVolatileLeaguesLocal] = useState<boolean>(
    settings?.excludeVolatileLeagues !== false
  );
  const [volatilitySearch, setVolatilitySearch] = useState<string>('');
  const [volatilityTierFilter, setVolatilityTierFilter] = useState<'ALL' | 'HIGH' | 'STANDARD'>('ALL');
  const [volatileLeaguesSearch, setVolatileLeaguesSearch] = useState<string>('');

  useEffect(() => {
    if (settings?.excludeVolatileLeagues !== undefined) {
      setExcludeVolatileLeaguesLocal(settings.excludeVolatileLeagues);
    }
  }, [settings?.excludeVolatileLeagues]);

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
          onTriggerSavedOverlay?.('Settings Saved');
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
    try {
      const sortParam = exportSort === 'default' ? undefined : exportSort;
      const res = await EngineService.downloadPredictionsJson(sortParam);
      if (res.success) {
        onShowToast?.(`Exported ${res.count ?? 0} predictions to ${res.filename}`, 'success');
      } else {
        onShowToast?.(res.error || 'Failed to export predictions.', 'danger');
      }
    } catch (err: any) {
      onShowToast?.(err?.message || 'Error exporting predictions.', 'danger');
    } finally {
      setIsExporting(false);
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

  const fetchLeagueVolatilities = async () => {
    setIsLoadingVolatility(true);
    try {
      const res = await EngineService.getLeagueVolatilities();
      if (res.success) {
        setLeagueVolatilities(res.leagues);
      }
    } finally {
      setIsLoadingVolatility(false);
    }
  };

  const handleCalibrateVolatility = async () => {
    setIsCalibratingVolatility(true);
    setVolatilityMessage(null);
    try {
      const res = await EngineService.calibrateLeagueVolatilities();
      if (res.success && Array.isArray(res.leagues)) {
        setLeagueVolatilities(res.leagues);
        setVolatilityMessage(
          `Calibrated ${res.calibratedCount ?? 0} leagues (>=100 matches) + ${res.fallbackCount ?? 0} fallback · LL_global=${(res.globalLogLoss ?? 0).toFixed(4)}`
        );
      } else {
        setVolatilityMessage(res.error || 'Calibration failed.');
      }
    } finally {
      setIsCalibratingVolatility(false);
    }
  };

  const [internalTogglingLoadData, setInternalTogglingLoadData] = useState<boolean>(false);

  const handleManualLoadDataToggle = async (nextEnabled: boolean) => {
    setInternalTogglingLoadData(true);
    try {
      if (onToggleLoadData) {
        await onToggleLoadData(nextEnabled);
      } else {
        await EngineService.toggleLoadData(nextEnabled);
      }
      await Promise.all([fetchStorageStatus(), fetchScraperStatus(), fetchFreshStats()]);
      if (isViteDev && getDriveAccessToken()) {
        await checkDriveBackupStatus(getDriveAccessToken());
      }
    } finally {
      setInternalTogglingLoadData(false);
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

  const isLoadDataTogglingNow = Boolean(isTogglingLoadData || internalTogglingLoadData);
  const effectiveGate: SqliteGateState | null = storageStatus?.sqliteGate || sqliteGate || null;
  const effectiveScrapingGate: ScrapingGateState | null =
    storageStatus?.scrapingGate || scraperStatus?.scrapingGate || scrapingGate || null;
  const isSqliteActive = effectiveGate ? effectiveGate.enabled : storageStatus?.storageEngine?.enabled !== false;
  const isScrapingActive = effectiveScrapingGate ? effectiveScrapingGate.enabled : false;
  const isLoadDataActive =
    typeof loadDataEnabled === 'boolean' && storageStatus == null
      ? loadDataEnabled
      : Boolean(isSqliteActive && isScrapingActive);
  const isOperating = Boolean(isResettingAndSyncing || isSyncingData || isLoadDataTogglingNow);

  useEffect(() => {
    if (!isOpen) {
      setIsConfirmingReset(false);
      setResetFullSyncData(false);
      setIsConfirmingCalc(false);
      setResetCalcData(false);
      setPendingDriveConfirm(null);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && (activeTab === 'DATA' || activeTab === 'PREDICTIONS')) {
      fetchStorageStatus();
      fetchScraperStatus();
      fetchFreshStats();
      if (activeTab === 'PREDICTIONS') {
        void fetchLeagueVolatilities();
      }
      if (isViteDev && getDriveAccessToken()) {
        void checkDriveBackupStatus(getDriveAccessToken());
      }
    }
  }, [isOpen, activeTab, isOperating]);

  if (!isOpen || !settings) return null;

  const handleExecuteResetAndSync = () => {
    const shouldReset = resetFullSyncData;
    setIsConfirmingReset(false);
    onClose();
    if (onResetAndSync) {
      onResetAndSync(shouldReset);
    }
  };

  const handleCalculatePredictions = () => {
    const shouldReset = resetCalcData;
    setIsConfirmingCalc(false);
    onClose();
    if (onCalculatePredictions) {
      onCalculatePredictions(shouldReset);
    }
  };

  const handleToggleExcludeVolatile = (enabled: boolean) => {
    setExcludeVolatileLeaguesLocal(enabled);
    onSaveSettings({ excludeVolatileLeagues: enabled }, { skipOverlay: true });
  };

  const handleSave = () => {
    onSaveSettings({
      rollingMatchWindow: 15,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      excludeVolatileLeagues: excludeVolatileLeaguesLocal,
    });
  };

  const storedPredictionsCount =
    localStats?.predictionsCount ??
    storageStatus?.storageEngine?.tableCounts?.predictions ??
    stats?.predictionsCount ??
    '—';

  return (
    <div
      role="region"
      aria-label="Settings Page"
      className="fixed inset-0 z-50 bg-theme-bg text-theme-main flex flex-col overflow-hidden font-sans animate-in fade-in duration-150"
    >
      {/* Full-Page Top Bar */}
      <header className="bg-theme-card border-b border-theme-subdued shrink-0 pt-[env(safe-area-inset-top)]">
        <div className="max-w-4xl mx-auto w-full px-3 sm:px-5">
          <div className="min-h-[48px] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 -ml-1.5 rounded-full hover:bg-theme-subtle text-theme-main transition-colors cursor-pointer flex items-center justify-center shrink-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                aria-label="Back"
                title="Back"
              >
                <ArrowLeft className="w-4 h-4 stroke-[2.25]" />
              </button>
              <Settings className="w-4 h-4 text-theme-primary shrink-0" />
              <h1 className="text-lg font-bold text-theme-main tracking-[-0.015em] truncate">
                Settings
              </h1>
            </div>

            {onOpenTerminal && (
              <Button
                id="settings-open-terminal-btn"
                variant="subtle"
                size="sm"
                onClick={onOpenTerminal}
                title="Terminal Logs"
              >
                <span>Terminal</span>
              </Button>
            )}
          </div>

          <div className="pb-2.5">
            <SegmentedTabs<SettingsTab>
              items={[
                { id: 'DATA', label: 'Data Management' },
                { id: 'PREDICTIONS', label: 'Predictions' },
                { id: 'UI', label: 'UI Themes' },
              ]}
              value={activeTab}
              onChange={(val) => setActiveTab(val)}
              variant="subtle"
              size="xs"
              fullWidth
              ariaLabel="Settings categories"
            />
          </div>
        </div>
      </header>

      {/* Full-Page Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-4xl mx-auto w-full p-3 sm:p-5 space-y-3">
        {activeTab === 'DATA' && (
          <div className="space-y-2.5">
            {/* Unified Load Data Switch (SQLite DB + Live Scraping) */}
            <Card surface="elevated" padding="sm" radius="2xl" className="sm:p-3.5">
              <div className="flex items-center justify-between gap-2.5 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-theme-main">Load Data</span>
                    <Badge variant={isLoadDataActive ? 'accent' : 'warning'} size="xs">
                      {isLoadDataActive ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                  <div className="text-xs text-theme-sub mt-0.5 tabular-nums">
                    SQLite: {isSqliteActive ? 'Active' : 'Off'} · Scraping: {isScrapingActive ? 'Online' : 'Off'} ·{' '}
                    {effectiveGate?.dbExists ? 'Local DB present' : 'No local DB'}
                  </div>
                </div>
                <Button
                  id="manual-load-data-toggle-btn"
                  variant={isLoadDataActive ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => void handleManualLoadDataToggle(!isLoadDataActive)}
                  disabled={isLoadDataTogglingNow || Boolean(isResettingAndSyncing || isSyncingData)}
                  title={isLoadDataActive ? 'Switch Load Data OFF' : 'Switch Load Data ON'}
                >
                  <span>
                    {isLoadDataTogglingNow
                      ? isLoadDataActive
                        ? 'Switching Off...'
                        : 'Switching On...'
                      : isLoadDataActive
                      ? 'Load Data OFF'
                      : 'Load Data ON'}
                  </span>
                </Button>
              </div>
            </Card>

            {/* Live Database Metrics Overview */}
            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[34px] px-3.5 pt-2.5 pb-1.5 flex items-center">
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
                      <span>{isRefreshingMetrics ? 'Refreshing...' : 'Refresh'}</span>
                    </Button>
                  }
                />
              </div>

              <div className="p-3 pt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatTile
                  label="Upcoming"
                  value={localStats?.upcomingCount ?? stats?.upcomingCount ?? '—'}
                  tone="accent"
                  surface="card"
                />
                <StatTile
                  label="Predictions"
                  value={storedPredictionsCount}
                  tone="accent"
                  surface="card"
                />
                <StatTile
                  label="Raw Feeds"
                  value={localStats?.rawFeedsCount ?? stats?.rawFeedsCount ?? '—'}
                  tone="accent"
                  surface="card"
                />
                <StatTile
                  label="Historical"
                  value={localStats?.totalMatches ?? stats?.totalMatches ?? '—'}
                  tone="accent"
                  surface="card"
                />
              </div>
            </Card>

            {/* Scraper Engine & Circuit Breaker Diagnostics Card */}
            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[34px] px-3.5 pt-2.5 pb-1.5 flex items-center justify-between gap-2 flex-wrap">
                <SectionHeader
                  title="Scraper Health"
                  icon={<Cpu className="w-3.5 h-3.5" />}
                  size="sm"
                />
                <div className="flex items-center gap-2">
                  <Badge variant={isScrapingActive ? 'accent' : 'warning'} size="xs">
                    {isScrapingActive ? 'ONLINE' : 'OFF'}
                  </Badge>
                  <span className="text-xs font-normal tabular-nums text-theme-sub">
                    Circuit Failures:{' '}
                    <strong className="text-theme-main font-semibold">{scraperStatus?.circuit?.failureCount ?? 0}</strong>
                  </span>
                </div>
              </div>

              {scraperStatus?.mirrors && scraperStatus.mirrors.length > 0 && (
                <div className="divide-y divide-[var(--border-subdued)] text-sm">
                  {scraperStatus.mirrors.map((m: any, idx: number) => (
                    <div key={idx} className="min-h-[32px] px-3.5 py-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-theme-main font-medium">{m.name}</span>
                      <span className={`text-xs font-semibold shrink-0 ${isScrapingActive ? 'text-theme-primary' : 'text-theme-warning'}`}>
                        {m.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Storage Status Section (flattened - single card) */}
            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[34px] px-3.5 pt-2.5 pb-1.5 flex items-center">
                <SectionHeader
                  title="Storage Status"
                  icon={<Server className="w-3.5 h-3.5" />}
                  size="sm"
                  className="w-full"
                  action={
                    <div className="flex items-center gap-1.5">
                      <Badge variant={isSqliteActive ? 'accent' : 'warning'} size="xs">
                        {isSqliteActive ? 'ONLINE' : 'OFF'}
                      </Badge>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={fetchStorageStatus}
                        disabled={isCheckingStorage}
                      >
                        <span>{isCheckingStorage ? 'Testing...' : 'Test'}</span>
                      </Button>
                    </div>
                  }
                />
              </div>

              <div className="px-3.5 pb-3 pt-1 space-y-2 text-sm tabular-nums">
                <div className="truncate text-theme-sub text-xs font-normal">
                  Path:{' '}
                  <span className="text-theme-main font-medium">
                    {storageStatus?.storageEngine?.dbPath || 'data/football_engine.db'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-normal">
                  <span className="text-theme-sub">
                    Disk Size:{' '}
                    <strong className="text-theme-primary font-semibold">{storageStatus?.storageEngine?.sizeMB ?? 0} MB</strong>
                  </span>
                  <span className="text-theme-primary font-medium">
                    {storageStatus?.storageEngine?.journalMode || (isSqliteActive ? 'WAL Mode' : 'OFF')}
                  </span>
                </div>
                {(storageStatus?.footballDb?.error || storageStatus?.predictionsDb?.error) && (
                  <p className="text-xs text-theme-danger truncate font-medium">
                    Err: {storageStatus?.footballDb?.error || storageStatus?.predictionsDb?.error}
                  </p>
                )}
              </div>
            </Card>

            {/* Dev Preview Only: Google Drive SQLite Storage Card */}
            {isDevPreviewClient && (
              <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
                <div className="min-h-[34px] px-3.5 pt-2.5 pb-1.5 flex items-center justify-between gap-2">
                  <SectionHeader
                    title="Google Drive DB Backup"
                    icon={<Cloud className="w-3.5 h-3.5" />}
                    size="sm"
                  />
                  <Badge variant="accent" size="xs">
                    Dev Preview Only
                  </Badge>
                </div>

                <div className="px-3.5 pb-3.5 pt-1.5 space-y-2.5 text-sm">
                  {driveNotice && (
                    <div
                      className={`px-2.5 py-2 rounded-xl text-xs font-medium flex items-start gap-2 ${
                        driveNotice.type === 'success'
                          ? 'bg-emerald-500/12 text-theme-success'
                          : 'bg-rose-500/12 text-theme-danger'
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
                        Connect Google Drive
                      </span>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleDriveSignIn('FIREBASE')}
                          disabled={isDriveLoggingIn}
                          className="inline-flex items-center justify-center h-[38px] px-4 rounded-full bg-white text-[#1f1f1f] border border-[#747775]/40 hover:bg-[#f8f9fa] active:bg-[#f1f3f4] font-medium text-sm transition-colors cursor-pointer disabled:opacity-60 shrink-0"
                        >
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
                      <div className="px-2.5 py-2 rounded-xl bg-theme-card flex items-center justify-between gap-2 flex-wrap text-xs">
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
                            <span>{isCheckingDrive ? 'Checking...' : 'Check'}</span>
                          </Button>
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => void handleDriveSignOut()}
                            disabled={isDriveMutating}
                            title="Sign out of Google Drive"
                          >
                            <span>Sign out</span>
                          </Button>
                        </div>
                      </div>

                      {pendingDriveConfirm ? (
                        <div className="p-2.5 rounded-xl bg-amber-500/10 space-y-2">
                          <p className="text-xs font-semibold text-theme-main flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-theme-warning shrink-0" />
                            <span>
                              {pendingDriveConfirm === 'UPLOAD'
                                ? driveFileMeta
                                  ? `Overwrite '${driveFileMeta.name}' (${storageStatus?.storageEngine?.sizeMB ?? 0} MB)?`
                                  : `Upload 'football_engine.db' (${storageStatus?.storageEngine?.sizeMB ?? 0} MB)?`
                                : pendingDriveConfirm === 'RESTORE'
                                ? `Restore '${driveFileMeta?.name}' (${(Number(driveFileMeta?.size || 0) / (1024 * 1024)).toFixed(2)} MB)?`
                                : `Delete '${driveFileMeta?.name}' from Google Drive?`}
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
                            disabled={!isLoadDataActive || isDriveMutating || isOperating}
                            title={!isLoadDataActive ? 'Switch Load Data ON before backing up to Drive' : undefined}
                          >
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
                            disabled={!driveFileMeta || isDriveMutating || Boolean(isResettingAndSyncing || isSyncingData)}
                          >
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
                              <span className="text-theme-danger">Delete</span>
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
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <SectionHeader
                  title="Full Data Sync"
                  size="sm"
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                />
                <Badge variant={resetFullSyncData ? 'warning' : 'default'} size="xs">
                  {resetFullSyncData ? 'RESET & SYNC' : 'MERGE & RETAIN'}
                </Badge>
              </div>

              {!isLoadDataActive && (
                <p className="text-xs text-theme-sub">
                  Requires Load Data ON
                </p>
              )}

              <label
                htmlFor="full-sync-reset-data-checkbox"
                className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-colors cursor-pointer select-none ${
                  resetFullSyncData
                    ? 'bg-amber-500/12'
                    : 'bg-theme-card hover:bg-theme-subtle'
                } ${!isLoadDataActive || isOperating ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <input
                  id="full-sync-reset-data-checkbox"
                  type="checkbox"
                  checked={resetFullSyncData}
                  onChange={(e) => setResetFullSyncData(e.target.checked)}
                  disabled={!isLoadDataActive || isOperating}
                  className="h-4 w-4 rounded border-theme text-amber-600 focus:ring-amber-500 shrink-0 cursor-pointer"
                />
                <div className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-theme-main">
                    Reset existing data before sync
                  </span>
                  {resetFullSyncData && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-theme-warning">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Wipes DB &amp; cache
                    </span>
                  )}
                </div>
              </label>

              {!isConfirmingReset ? (
                <Button
                  id="full-data-sync-btn"
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={() => setIsConfirmingReset(true)}
                  disabled={!isLoadDataActive || isOperating}
                >
                  <span>{resetFullSyncData ? 'Reset & Full Data Sync' : 'Full Data Sync'}</span>
                </Button>
              ) : (
                <div className="pt-1 space-y-2">
                  <p className="text-sm font-semibold text-theme-main flex items-center gap-1.5">
                    {resetFullSyncData ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-theme-warning shrink-0" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-theme-primary shrink-0" />
                    )}
                    <span>
                      {resetFullSyncData ? 'Confirm Reset & Full Data Sync?' : 'Confirm Full Data Sync?'}
                    </span>
                  </p>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      onClick={handleExecuteResetAndSync}
                      disabled={isOperating}
                    >
                      <span>{resetFullSyncData ? 'Reset & Start Sync' : 'Confirm & Start Sync'}</span>
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
            <Card surface="elevated" padding="sm" radius="2xl" className="sm:p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <SectionHeader
                  title="Calculate Predictions"
                  size="sm"
                  icon={<TrendingUp className="w-3.5 h-3.5" />}
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs font-normal tabular-nums text-theme-sub">
                    {storedPredictionsCount} stored · {localStats?.upcomingCount ?? stats?.upcomingCount ?? '—'} upcoming
                  </span>
                  <Badge variant={resetCalcData ? 'warning' : 'default'} size="xs">
                    {resetCalcData ? 'RESET & RECALC' : 'UPCOMING ONLY'}
                  </Badge>
                </div>
              </div>

              <label
                htmlFor="calc-predictions-reset-data-checkbox"
                className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-colors cursor-pointer select-none ${
                  resetCalcData
                    ? 'bg-amber-500/12'
                    : 'bg-theme-card hover:bg-theme-subtle'
                } ${!isSqliteActive || isOperating ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <input
                  id="calc-predictions-reset-data-checkbox"
                  type="checkbox"
                  checked={resetCalcData}
                  onChange={(e) => setResetCalcData(e.target.checked)}
                  disabled={!isSqliteActive || isOperating}
                  className="h-4 w-4 rounded border-theme text-amber-600 focus:ring-amber-500 shrink-0 cursor-pointer"
                />
                <div className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-theme-main">
                    Reset existing prediction data
                  </span>
                  {resetCalcData && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-theme-warning">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Clears stored predictions
                    </span>
                  )}
                </div>
              </label>

              {!isConfirmingCalc ? (
                <Button
                  id="update-upcoming-predictions-btn"
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={() => setIsConfirmingCalc(true)}
                  disabled={!isLoadDataActive || isOperating}
                >
                  <span>{resetCalcData ? 'Reset & Calculate Predictions' : 'Calculate Predictions'}</span>
                </Button>
              ) : (
                <div className="pt-1 space-y-2">
                  <p className="text-sm font-semibold text-theme-main flex items-center gap-1.5">
                    {resetCalcData ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-theme-warning shrink-0" />
                    ) : (
                      <TrendingUp className="w-3.5 h-3.5 text-theme-primary shrink-0" />
                    )}
                    <span>
                      {resetCalcData
                        ? 'Confirm Reset & Calculate Predictions?'
                        : 'Confirm Calculate Predictions?'}
                    </span>
                  </p>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      onClick={handleCalculatePredictions}
                      disabled={!isLoadDataActive || isOperating}
                    >
                      <span>{resetCalcData ? 'Reset & Calculate' : 'Confirm & Calculate'}</span>
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setIsConfirmingCalc(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            {/* Dedicated Card: Volatile Competitions & High Parity Exclusions */}
            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[38px] px-3.5 pt-2.5 pb-1.5 flex items-center justify-between gap-2 flex-wrap">
                <SectionHeader
                  title="Volatile Leagues Filter & Exclusions"
                  size="sm"
                  icon={<ShieldAlert className="w-3.5 h-3.5 text-theme-warning" />}
                />
                <div className="flex items-center gap-2">
                  <Badge variant={excludeVolatileLeaguesLocal ? 'accent' : 'warning'} size="xs">
                    {excludeVolatileLeaguesLocal ? 'EXCLUSIONS ACTIVE' : 'EXCLUSIONS OFF'}
                  </Badge>
                  <Button
                    id="toggle-exclude-volatile-btn"
                    variant={excludeVolatileLeaguesLocal ? 'secondary' : 'primary'}
                    size="xs"
                    onClick={() => handleToggleExcludeVolatile(!excludeVolatileLeaguesLocal)}
                    title="Toggle whether high-volatility/parity leagues are excluded from default feeds and predictions"
                  >
                    <span>{excludeVolatileLeaguesLocal ? 'Turn Off Filter' : 'Exclude Volatile Leagues'}</span>
                  </Button>
                </div>
              </div>

              <div className="px-3.5 pb-3.5 pt-1.5 space-y-2.5 text-xs text-theme-sub">
                <div>
                  <Input
                    placeholder="Search volatile leagues..."
                    value={volatileLeaguesSearch}
                    onChange={(e) => setVolatileLeaguesSearch(e.target.value)}
                    leftIcon={<Search className="w-3.5 h-3.5" />}
                    onClear={() => setVolatileLeaguesSearch('')}
                    inputSize="sm"
                    surface="subtle"
                  />
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5 divide-y divide-[var(--border-subdued)]">
                  {KNOWN_VOLATILE_LEAGUES.filter((l) => {
                    if (!volatileLeaguesSearch.trim()) return true;
                    const q = volatileLeaguesSearch.trim().toLowerCase();
                    return (
                      l.name.toLowerCase().includes(q) ||
                      l.country.toLowerCase().includes(q) ||
                      l.code.toLowerCase().includes(q)
                    );
                  }).map((l) => (
                    <div key={l.id} className="pt-1.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-theme-main text-sm">{l.name}</span>
                        <span className="text-2xs font-normal text-theme-sub">({l.country})</span>
                        <Badge variant="default" size="xs">
                          {l.code}
                        </Badge>
                        <Badge variant="warning" size="xs">
                          V_L ~ {l.typicalVl.toFixed(2)}x
                        </Badge>
                      </div>
                      <div className="shrink-0">
                        <span
                          className={`text-2xs font-semibold px-2.5 py-0.5 rounded-full ${
                            excludeVolatileLeaguesLocal
                              ? 'bg-emerald-500/12 text-theme-success'
                              : 'bg-amber-500/12 text-theme-warning'
                          }`}
                        >
                          {excludeVolatileLeaguesLocal ? 'EXCLUDED' : 'INCLUDED'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Calibration Card: League Volatility Coefficient (V_L) - ALL LEAGUES LISTED */}
            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[38px] px-3.5 pt-2.5 pb-1.5 flex items-center justify-between gap-2 flex-wrap">
                <SectionHeader
                  title="League Volatility Calibration (V_L)"
                  size="sm"
                  icon={<TrendingUp className="w-3.5 h-3.5" />}
                />
                <Button
                  id="calibrate-volatility-btn"
                  variant="secondary"
                  size="xs"
                  onClick={() => void handleCalibrateVolatility()}
                  disabled={!isLoadDataActive || isCalibratingVolatility || isOperating}
                >
                  <span>{isCalibratingVolatility ? 'Calibrating...' : 'Calibrate V_L'}</span>
                </Button>
              </div>

              <div className="px-3.5 py-2 text-xs text-theme-sub space-y-2">
                {volatilityMessage && (
                  <div className="px-2.5 py-1.5 rounded-lg bg-theme-primary-subtle text-theme-primary font-medium">
                    {volatilityMessage}
                  </div>
                )}

                {/* Filter and Search Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <div className="flex-1">
                    <Input
                      placeholder="Search all calibrated leagues..."
                      value={volatilitySearch}
                      onChange={(e) => setVolatilitySearch(e.target.value)}
                      leftIcon={<Search className="w-3.5 h-3.5" />}
                      onClear={() => setVolatilitySearch('')}
                      inputSize="sm"
                      surface="subtle"
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant={volatilityTierFilter === 'ALL' ? 'primary' : 'subtle'}
                      size="xs"
                      onClick={() => setVolatilityTierFilter('ALL')}
                    >
                      All ({leagueVolatilities.length})
                    </Button>
                    <Button
                      variant={volatilityTierFilter === 'HIGH' ? 'primary' : 'subtle'}
                      size="xs"
                      onClick={() => setVolatilityTierFilter('HIGH')}
                    >
                      High (V_L &gt; 1.05)
                    </Button>
                    <Button
                      variant={volatilityTierFilter === 'STANDARD' ? 'primary' : 'subtle'}
                      size="xs"
                      onClick={() => setVolatilityTierFilter('STANDARD')}
                    >
                      Standard
                    </Button>
                  </div>
                </div>
              </div>

              {isLoadingVolatility ? (
                <div className="px-3.5 py-3 text-xs text-theme-dim">
                  Loading volatility calibration table...
                </div>
              ) : leagueVolatilities.length > 0 ? (
                (() => {
                  const filtered = leagueVolatilities.filter((r) => {
                    if (volatilityTierFilter === 'HIGH' && r.volatility_coefficient <= 1.05) return false;
                    if (volatilityTierFilter === 'STANDARD' && r.volatility_coefficient > 1.05) return false;
                    if (volatilitySearch.trim()) {
                      const q = volatilitySearch.trim().toLowerCase();
                      return r.league_name.toLowerCase().includes(q) || r.league_id.toLowerCase().includes(q);
                    }
                    return true;
                  });

                  return (
                    <div>
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-left text-xs tabular-nums">
                          <thead className="sticky top-0 bg-theme-card text-2xs uppercase tracking-[0.06em] text-theme-sub z-10">
                            <tr>
                              <th className="px-3 py-1.5 font-semibold">League</th>
                              <th className="px-2 py-1.5 font-semibold text-right">Matches</th>
                              <th className="px-2 py-1.5 font-semibold text-right">Log-Loss</th>
                              <th className="px-2 py-1.5 font-semibold text-right">Elo IQR</th>
                              <th className="px-3 py-1.5 font-semibold text-right">V_L</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subdued)]">
                            {filtered.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-3 py-4 text-center text-xs text-theme-dim">
                                  No leagues found
                                </td>
                              </tr>
                            ) : (
                              filtered.map((row) => (
                                <tr key={row.league_id} className="hover:bg-theme-card">
                                  <td className="px-3 py-1.5 font-medium text-theme-main max-w-[190px] truncate">
                                    {row.league_name}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-theme-sub">{row.matches_evaluated}</td>
                                  <td className="px-2 py-1.5 text-right text-theme-sub">
                                    {row.historical_log_loss.toFixed(3)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-theme-sub">
                                    {row.elo_spread_iqr.toFixed(0)}
                                  </td>
                                  <td className="px-3 py-1.5 text-right font-semibold">
                                    <span
                                      className={
                                        row.is_fallback
                                          ? 'text-theme-dim'
                                          : row.volatility_coefficient > 1.05
                                          ? 'text-theme-warning'
                                          : 'text-theme-primary'
                                      }
                                    >
                                      {row.volatility_coefficient.toFixed(2)}
                                      {row.is_fallback ? '*' : ''}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-3 py-1.5 bg-theme-card/60 text-2xs text-theme-dim flex items-center justify-between">
                        <span>Showing {filtered.length} of {leagueVolatilities.length} leagues in database</span>
                        <span>* Fallback (N &lt; 100)</span>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="px-3.5 py-2.5 text-xs text-theme-dim">
                  No volatility data found
                </div>
              )}
            </Card>

            {/* Action Card: Export All-Market Predictions to JSON */}
            <Card surface="elevated" padding="sm" radius="2xl" className="sm:p-3.5 space-y-2.5">
              <SectionHeader
                title="Export Predictions"
                size="sm"
                icon={<Download className="w-3.5 h-3.5" />}
              />

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
                disabled={!isLoadDataActive || isExporting || isOperating}
              >
                <span>{isExporting ? 'Exporting Predictions...' : 'Export All-Market Predictions (JSON)'}</span>
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
                  <span>Goals Over/Under (1.5, 2.5, 3.5, 4.5)</span>
                </div>
                <div className="min-h-[28px] px-2.5 py-1 rounded-lg bg-theme-subtle/75 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm bg-indigo-400 shrink-0" />
                  <span>Both Teams to Score (BTTS)</span>
                </div>
                <div className="min-h-[28px] px-2.5 py-1 rounded-lg bg-theme-subtle/75 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm bg-sky-400 shrink-0" />
                  <span>Double Chance &amp; Draw No Bet</span>
                </div>
                <div className="min-h-[28px] px-2.5 py-1 rounded-lg bg-theme-subtle/75 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm bg-rose-400 shrink-0" />
                  <span>Combo Bet Markets (Result/DC/BTTS + Goals)</span>
                </div>
                <div className="min-h-[28px] px-2.5 py-1 rounded-lg bg-theme-subtle/75 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm bg-violet-400 shrink-0" />
                  <span>Team Goals, Win to Nil &amp; Specials</span>
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
                  className={`h-[34px] px-3.5 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                    theme === 'light'
                      ? 'bg-theme-primary text-theme-primary-text font-semibold'
                      : 'bg-theme-card text-theme-sub font-medium hover:bg-theme-subtle hover:text-theme-main'
                  }`}
                >
                  <span className="text-base">Light</span>
                </button>

                <button
                  type="button"
                  onClick={() => theme !== 'dark' && onToggleTheme()}
                  className={`h-[34px] px-3.5 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                    theme === 'dark'
                      ? 'bg-theme-primary text-theme-primary-text font-semibold'
                      : 'bg-theme-card text-theme-sub font-medium hover:bg-theme-subtle hover:text-theme-main'
                  }`}
                >
                  <span className="text-base">Dark</span>
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
                      className={`group relative rounded-2xl overflow-hidden transition-all duration-150 cursor-pointer flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                        isSelected
                          ? 'bg-theme-card ring-2 ring-theme-accent'
                          : 'bg-theme-card hover:bg-theme-subtle/50'
                      }`}
                    >
                      {/* Flat Theme Accent Strip Header */}
                      <div
                        className="h-1.5 w-full"
                        style={{ backgroundColor: t.previewColors.primary }}
                      />

                      <div className="p-2.5 space-y-1.5">
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <AppLogo
                              variant={t.id as AppLogoVariant}
                              mode={theme}
                              size={32}
                              title={`${t.name} (${theme} mode crest)`}
                            />
                            <div className="min-w-0 flex-1">
                              <span className="text-base font-semibold text-theme-main truncate block tracking-[-0.01em]">{t.name}</span>
                              <p className="text-xs font-normal text-theme-sub truncate">{t.tagline}</p>
                            </div>
                          </div>
                          {isSelected ? (
                            <Badge variant="solid" size="xs" className="shrink-0">
                              <Check className="w-3.5 h-3.5 stroke-[2.75]" />
                              <span>Active</span>
                            </Badge>
                          ) : null}
                        </div>

                        {t.colorways && t.colorways.length > 0 && (
                          <p className="text-xs font-normal text-theme-dim truncate">
                            {t.colorways.join(' · ')}
                          </p>
                        )}

                        <div className="pt-1.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-4 h-4 rounded-md shrink-0"
                              style={{ backgroundColor: t.previewColors.primary }}
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

            {/* App Crest Varieties (Light & Dark Mode Preview) */}
            <Card surface="elevated" padding="sm" radius="2xl" className="sm:p-3.5 space-y-2.5">
              <SectionHeader
                title="App Emblem Varieties (Light & Dark)"
                icon={<Sparkles className="w-3.5 h-3.5" />}
                size="sm"
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {COLOR_THEMES.map((t) => {
                  const isCurrentPalette = activeThemeId === t.id;
                  return (
                    <div
                      key={t.id}
                      className={`rounded-xl p-2 space-y-1.5 transition-all ${
                        isCurrentPalette
                          ? 'bg-theme-primary-subtle ring-2 ring-theme-accent'
                          : 'bg-theme-card'
                      }`}
                    >
                      <div className="text-2xs font-semibold text-theme-main truncate text-center">
                        {t.accentName}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (theme !== 'light') onToggleTheme();
                            handleSelectColorTheme(t.id);
                          }}
                          className={`p-1.5 rounded-lg flex flex-col items-center gap-1 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                            isCurrentPalette && theme === 'light'
                              ? 'ring-2 ring-theme-accent'
                              : 'hover:ring-1 hover:ring-theme-accent'
                          }`}
                          style={{ backgroundColor: t.previewColors.surfaceLight }}
                          title={`Apply ${t.name} in Light mode`}
                        >
                          <AppLogo variant={t.id as AppLogoVariant} mode="light" size={28} />
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-700">Light</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (theme !== 'dark') onToggleTheme();
                            handleSelectColorTheme(t.id);
                          }}
                          className={`p-1.5 rounded-lg flex flex-col items-center gap-1 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                            isCurrentPalette && theme === 'dark'
                              ? 'ring-2 ring-theme-accent'
                              : 'hover:ring-1 hover:ring-theme-accent'
                          }`}
                          style={{ backgroundColor: t.previewColors.surfaceDark }}
                          title={`Apply ${t.name} in Dark mode`}
                        >
                          <AppLogo variant={t.id as AppLogoVariant} mode="dark" size={28} />
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-200">Dark</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        </div>
      </div>

      {/* Full-Page Footer Action Bar */}
      <footer className="bg-theme-card border-t border-theme-subdued shrink-0 px-3 sm:px-5 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+10px)]">
        <div className="max-w-4xl mx-auto w-full flex items-center justify-end gap-2">
          <Button variant="subtle" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button id="save-settings-btn" variant="primary" size="sm" onClick={handleSave}>
            Save Settings
          </Button>
        </div>
      </footer>
    </div>
  );
};
