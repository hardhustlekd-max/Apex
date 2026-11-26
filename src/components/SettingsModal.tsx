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
  Power,
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
  isTogglingSqlite?: boolean;
  onToggleSqlite?: (enabled: boolean) => Promise<void> | void;
  scrapingGate?: ScrapingGateState | null;
  isTogglingScraping?: boolean;
  onToggleScraping?: (enabled: boolean) => Promise<void> | void;
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
  sqliteGate,
  isTogglingSqlite = false,
  onToggleSqlite,
  scrapingGate,
  isTogglingScraping = false,
  onToggleScraping,
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
  const [resetFullSyncData, setResetFullSyncData] = useState<boolean>(false);
  const [isConfirmingCalc, setIsConfirmingCalc] = useState(false);
  const [resetCalcData, setResetCalcData] = useState<boolean>(false);
  const [storageStatus, setStorageStatus] = useState<any>(null);
  const [scraperStatus, setScraperStatus] = useState<any>(null);
  const [localStats, setLocalStats] = useState<any>(stats);
  const [isCheckingStorage, setIsCheckingStorage] = useState<boolean>(false);
  const [isRefreshingMetrics, setIsRefreshingMetrics] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportToast, setExportToast] = useState<string | null>(null);

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

  const [internalTogglingSqlite, setInternalTogglingSqlite] = useState<boolean>(false);
  const [internalTogglingScraping, setInternalTogglingScraping] = useState<boolean>(false);

  const handleManualSqliteToggle = async (nextEnabled: boolean) => {
    setInternalTogglingSqlite(true);
    try {
      if (onToggleSqlite) {
        await onToggleSqlite(nextEnabled);
      } else {
        await EngineService.toggleSqliteDb(nextEnabled);
      }
      await Promise.all([fetchStorageStatus(), fetchScraperStatus(), fetchFreshStats()]);
      if (isViteDev && getDriveAccessToken()) {
        await checkDriveBackupStatus(getDriveAccessToken());
      }
    } finally {
      setInternalTogglingSqlite(false);
    }
  };

  const handleManualScrapingToggle = async (nextEnabled: boolean) => {
    setInternalTogglingScraping(true);
    try {
      if (onToggleScraping) {
        await onToggleScraping(nextEnabled);
      } else {
        await EngineService.toggleScraping(nextEnabled);
      }
      await Promise.all([fetchStorageStatus(), fetchScraperStatus()]);
    } finally {
      setInternalTogglingScraping(false);
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

  const isSqliteTogglingNow = Boolean(isTogglingSqlite || internalTogglingSqlite);
  const isScrapingTogglingNow = Boolean(isTogglingScraping || internalTogglingScraping);
  const effectiveGate: SqliteGateState | null = storageStatus?.sqliteGate || sqliteGate || null;
  const effectiveScrapingGate: ScrapingGateState | null =
    storageStatus?.scrapingGate || scraperStatus?.scrapingGate || scrapingGate || null;
  const isSqliteActive = effectiveGate ? effectiveGate.enabled : storageStatus?.storageEngine?.enabled !== false;
  const isScrapingActive = effectiveScrapingGate ? effectiveScrapingGate.enabled : false;
  const isOperating = Boolean(isResettingAndSyncing || isSyncingData || isSqliteTogglingNow || isScrapingTogglingNow);

  useEffect(() => {
    if (!isOpen) {
      setIsConfirmingReset(false);
      setResetFullSyncData(false);
      setIsConfirmingCalc(false);
      setResetCalcData(false);
      setPendingDriveConfirm(null);
    }
  }, [isOpen]);

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
    onSaveSettings({ excludeVolatileLeagues: enabled });
  };

  const handleSave = () => {
    onSaveSettings({
      rollingMatchWindow: 15,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      excludeVolatileLeagues: excludeVolatileLeaguesLocal,
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
              <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center justify-between gap-2 flex-wrap">
                <SectionHeader
                  title="Scraper Health"
                  icon={<Cpu className="w-3.5 h-3.5" />}
                  size="sm"
                />
                <div className="flex items-center gap-2">
                  <Badge variant={isScrapingActive ? 'accent' : 'warning'} size="xs">
                    {isScrapingActive ? 'ONLINE' : 'BLOCKED · OFF'}
                  </Badge>
                  <span className="text-xs font-normal tabular-nums text-theme-sub">
                    Circuit Failures:{' '}
                    <strong className="text-theme-main font-semibold">{scraperStatus?.circuit?.failureCount ?? 0}</strong>
                  </span>
                </div>
              </div>

              <div className="px-3.5 py-2.5 border-b border-theme-subdued space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span className="font-semibold text-theme-main">Flashscore Data Scraping</span>
                    <div className="text-xs text-theme-sub mt-0.5">
                      {isScrapingActive
                        ? 'Manually switched ON (live polling & sync active)'
                        : 'Turned off on app initialization until switched ON manually'}
                    </div>
                  </div>
                  <Button
                    id="manual-scraping-toggle-btn"
                    variant={isScrapingActive ? 'secondary' : 'primary'}
                    size="xs"
                    onClick={() => void handleManualScrapingToggle(!isScrapingActive)}
                    disabled={isScrapingTogglingNow || Boolean(isResettingAndSyncing || isSyncingData)}
                    title={
                      isScrapingActive
                        ? 'Switch data scraping OFF (blocks all Flashscore HTTP requests)'
                        : 'Switch data scraping ON manually'
                    }
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>
                      {isScrapingTogglingNow
                        ? isScrapingActive
                          ? 'Switching Off...'
                          : 'Switching On...'
                        : isScrapingActive
                        ? 'Switch Scraping OFF'
                        : 'Switch Scraping ON'}
                    </span>
                  </Button>
                </div>

                {!isScrapingActive && (
                  <div className="px-2.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-theme-main flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      Remote data scraping is completely turned off on startup. Switch Scraping ON manually above to enable live scores and sync feeds.
                    </span>
                  </div>
                )}
              </div>

              {scraperStatus?.mirrors && scraperStatus.mirrors.length > 0 && (
                <div className="divide-y divide-[var(--border-subdued)] text-sm">
                  {scraperStatus.mirrors.map((m: any, idx: number) => (
                    <div key={idx} className="min-h-[32px] px-3 py-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-theme-main font-medium">{m.name}</span>
                      <span className={`text-xs font-semibold shrink-0 ${isScrapingActive ? 'text-theme-primary' : 'text-amber-700 dark:text-amber-400'}`}>
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
                    <div className="flex items-center gap-1.5">
                      <Badge variant={isSqliteActive ? 'accent' : 'warning'} size="xs">
                        {isSqliteActive ? 'ONLINE' : 'BLOCKED · OFF'}
                      </Badge>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={fetchStorageStatus}
                        disabled={isCheckingStorage}
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isCheckingStorage ? 'animate-spin text-theme-primary' : ''}`}
                        />
                        <span>Test</span>
                      </Button>
                    </div>
                  }
                />
              </div>

              <div className="px-3.5 py-2.5 space-y-2 text-sm tabular-nums">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span className="font-semibold text-theme-main">SQLite Storage Engine</span>
                    <div className="text-xs text-theme-sub mt-0.5">
                      {effectiveGate?.dbExists
                        ? 'football_engine.db present on disk'
                        : 'No football_engine.db file on preview'}
                      {' · '}
                      {isSqliteActive ? 'Manually Switched ON' : 'Auto-init blocked until switched ON'}
                    </div>
                  </div>
                  <Button
                    id="manual-sqlite-toggle-btn"
                    variant={isSqliteActive ? 'secondary' : 'primary'}
                    size="xs"
                    onClick={() => void handleManualSqliteToggle(!isSqliteActive)}
                    disabled={isSqliteTogglingNow || Boolean(isResettingAndSyncing || isSyncingData)}
                    title={
                      isSqliteActive
                        ? 'Switch SQLite DB OFF (closes connection and blocks auto-init)'
                        : 'Switch SQLite DB ON manually'
                    }
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>
                      {isSqliteTogglingNow
                        ? isSqliteActive
                          ? 'Switching Off...'
                          : 'Switching On...'
                        : isSqliteActive
                        ? 'Switch SQLite OFF'
                        : 'Switch SQLite ON'}
                    </span>
                  </Button>
                </div>

                {!isSqliteActive && (
                  <div className="px-2.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-theme-main flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      SQLite initialization is blocked on app startup and when{' '}
                      <span className="font-mono">football_engine.db</span> is missing on preview. Switch ON manually above or restore a backup from Google Drive below.
                    </span>
                  </div>
                )}

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
                    {storageStatus?.storageEngine?.journalMode || (isSqliteActive ? 'WAL Mode' : 'BLOCKED')}
                  </span>
                </div>
                {(storageStatus?.footballDb?.error || storageStatus?.predictionsDb?.error) && (
                  <p className="text-xs text-rose-700 dark:text-rose-400 truncate font-medium">
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
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400'
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
                          className="inline-flex items-center justify-center gap-2.5 h-[38px] px-4 rounded-full bg-white text-[#1f1f1f] border border-[#747775]/40 hover:bg-[#f8f9fa] active:bg-[#f1f3f4] font-medium text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-60 shrink-0"
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
                            <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
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
                            disabled={!isSqliteActive || isDriveMutating || isOperating}
                            title={!isSqliteActive ? 'Switch SQLite DB ON manually before backing up to Drive' : undefined}
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
                            disabled={!driveFileMeta || isDriveMutating || Boolean(isResettingAndSyncing || isSyncingData)}
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
                              <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                              <span className="text-rose-700 dark:text-rose-400">Delete</span>
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

              {(!isSqliteActive || !isScrapingActive) && (
                <p className="text-xs text-theme-sub">
                  {!isSqliteActive && !isScrapingActive
                    ? 'Switch both SQLite DB and Data Scraping ON manually above before running Full Data Sync.'
                    : !isSqliteActive
                    ? 'Switch SQLite DB ON manually in Storage Status above before running Full Data Sync.'
                    : 'Switch Data Scraping ON manually in Scraper Health above before running Full Data Sync.'}
                </p>
              )}

              <label
                htmlFor="full-sync-reset-data-checkbox"
                className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-colors cursor-pointer select-none ${
                  resetFullSyncData
                    ? 'bg-amber-500/10 border-amber-500/35'
                    : 'bg-theme-card border-theme-subdued hover:border-theme'
                } ${!isSqliteActive || !isScrapingActive || isOperating ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <input
                  id="full-sync-reset-data-checkbox"
                  type="checkbox"
                  checked={resetFullSyncData}
                  onChange={(e) => setResetFullSyncData(e.target.checked)}
                  disabled={!isSqliteActive || !isScrapingActive || isOperating}
                  className="mt-0.5 h-4 w-4 rounded border-theme text-amber-600 focus:ring-amber-500 shrink-0 cursor-pointer"
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-theme-main">
                      Reset existing data before sync
                    </span>
                    {resetFullSyncData && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="w-3 h-3" />
                        Wipes DB &amp; cache
                      </span>
                    )}
                  </div>
                  <p className="text-2xs text-theme-sub leading-relaxed">
                    {resetFullSyncData
                      ? 'Clears all synced matches, upcoming fixtures, standings, raw feeds, stored predictions, and browser cache before fetching fresh data.'
                      : 'Retains existing historical matches, completed predictions, and cached feeds while merging newly scraped fixtures and results.'}
                  </p>
                </div>
              </label>

              {!isConfirmingReset ? (
                <Button
                  id="full-data-sync-btn"
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={() => setIsConfirmingReset(true)}
                  disabled={!isSqliteActive || !isScrapingActive || isOperating}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{resetFullSyncData ? 'Reset & Full Data Sync' : 'Full Data Sync'}</span>
                </Button>
              ) : (
                <div className="pt-1 space-y-2">
                  <p className="text-sm font-semibold text-theme-main flex items-center gap-1.5">
                    {resetFullSyncData ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
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
                      <RefreshCw className="w-3.5 h-3.5" />
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
                className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-colors cursor-pointer select-none ${
                  resetCalcData
                    ? 'bg-amber-500/10 border-amber-500/35'
                    : 'bg-theme-card border-theme-subdued hover:border-theme'
                } ${!isSqliteActive || isOperating ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <input
                  id="calc-predictions-reset-data-checkbox"
                  type="checkbox"
                  checked={resetCalcData}
                  onChange={(e) => setResetCalcData(e.target.checked)}
                  disabled={!isSqliteActive || isOperating}
                  className="mt-0.5 h-4 w-4 rounded border-theme text-amber-600 focus:ring-amber-500 shrink-0 cursor-pointer"
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-theme-main">
                      Reset existing prediction data
                    </span>
                    {resetCalcData && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="w-3 h-3" />
                        Clears stored predictions
                      </span>
                    )}
                  </div>
                  <p className="text-2xs text-theme-sub leading-relaxed">
                    {resetCalcData
                      ? 'Wipes all stored upcoming and historical predictions, fixture market/stats caches, and H2H measurement matrices before recalculating all markets & combo bet markets.'
                      : 'Preserves evaluated historical predictions (and refreshes their combo markets) while recalculating all markets including combo bet markets for upcoming fixtures.'}
                  </p>
                </div>
              </label>

              {!isConfirmingCalc ? (
                <Button
                  id="update-upcoming-predictions-btn"
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={() => setIsConfirmingCalc(true)}
                  disabled={!isSqliteActive || isOperating}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{resetCalcData ? 'Reset & Calculate Predictions' : 'Calculate Predictions'}</span>
                </Button>
              ) : (
                <div className="pt-1 space-y-2">
                  <p className="text-sm font-semibold text-theme-main flex items-center gap-1.5">
                    {resetCalcData ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
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
                      disabled={!isSqliteActive || isOperating}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
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
              <div className="min-h-[38px] px-3.5 py-2 border-b border-theme-subdued flex items-center justify-between gap-2 flex-wrap">
                <SectionHeader
                  title="Volatile Leagues Filter & Exclusions"
                  size="sm"
                  icon={<ShieldAlert className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />}
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
                    <Power className="w-3.5 h-3.5" />
                    <span>{excludeVolatileLeaguesLocal ? 'Turn Off Filter' : 'Exclude Volatile Leagues'}</span>
                  </Button>
                </div>
              </div>

              <div className="p-3.5 space-y-2.5 text-xs text-theme-sub">
                <p className="leading-relaxed">
                  Competitions with elevated upset variance (<span className="font-mono">V_L &gt; 1.10</span>), high draw skew (~30%+), or compressed squad parity (EFL Championship, 2. Bundesliga, Serie B, MLS, Süper Lig, etc.) are automatically excluded from the main prediction feed and accumulator selections when enabled.
                </p>

                <div className="pt-1">
                  <Input
                    placeholder="Search 10 known volatile leagues by name, country, or code..."
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
                      l.code.toLowerCase().includes(q) ||
                      l.reason.toLowerCase().includes(q)
                    );
                  }).map((l) => (
                    <div key={l.id} className="pt-1.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-theme-main text-sm">{l.name}</span>
                          <span className="text-2xs font-normal text-theme-sub">({l.country})</span>
                          <Badge variant="default" size="xs">
                            {l.code}
                          </Badge>
                          <Badge variant="warning" size="xs">
                            V_L ~ {l.typicalVl.toFixed(2)}x
                          </Badge>
                        </div>
                        <p className="text-2xs text-theme-dim mt-0.5 line-clamp-2 leading-relaxed">
                          {l.reason}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <span
                          className={`text-2xs font-semibold px-2.5 py-0.5 rounded-full ${
                            excludeVolatileLeaguesLocal
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/25'
                          }`}
                        >
                          {excludeVolatileLeaguesLocal ? 'EXCLUDED FROM FEED' : 'INCLUDED'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Calibration Card: League Volatility Coefficient (V_L) - ALL LEAGUES LISTED */}
            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[38px] px-3.5 py-2 border-b border-theme-subdued flex items-center justify-between gap-2 flex-wrap">
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
                  disabled={!isSqliteActive || isCalibratingVolatility || isOperating}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCalibratingVolatility ? 'animate-spin text-theme-primary' : ''}`} />
                  <span>{isCalibratingVolatility ? 'Calibrating...' : 'Calibrate V_L'}</span>
                </Button>
              </div>

              <div className="px-3.5 py-2 text-xs text-theme-sub space-y-2">
                <p className="leading-relaxed">
                  Scales Elo K-rate (<span className="font-mono">K/V_L</span>), Bayesian prior shrinkage (<span className="font-mono">W·V_L</span>), temperature (<span className="font-mono">T=V_L^α</span>), and Monte Carlo variance.
                </p>
                {volatilityMessage && (
                  <div className="px-2.5 py-1.5 rounded-lg bg-theme-primary-subtle border border-theme-neon text-theme-primary font-medium">
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
                <div className="px-3.5 py-3 text-xs text-theme-dim border-t border-theme-subdued">
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
                    <div className="border-t border-theme-subdued">
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-left text-xs tabular-nums">
                          <thead className="sticky top-0 bg-theme-subtle/95 backdrop-blur-xs text-2xs uppercase tracking-[0.06em] text-theme-sub z-10 border-b border-theme-subdued">
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
                                  No leagues matched search &quot;{volatilitySearch}&quot;
                                </td>
                              </tr>
                            ) : (
                              filtered.map((row) => (
                                <tr key={row.league_id} className="hover:bg-theme-card-elevated">
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
                                          ? 'text-amber-700 dark:text-amber-400'
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
                      <div className="px-3 py-1.5 bg-theme-subtle/50 border-t border-theme-subdued text-2xs text-theme-dim flex items-center justify-between">
                        <span>Showing {filtered.length} of {leagueVolatilities.length} leagues in database</span>
                        <span>* Fallback (N &lt; 100)</span>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="px-3.5 py-2.5 text-xs text-theme-dim border-t border-theme-subdued">
                  {isSqliteActive
                    ? 'No volatility records stored yet. Run Calibrate V_L to analyze historical leagues.'
                    : 'Enable SQLite DB manually in Data Management to view or calibrate league volatility.'}
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

              <p className="text-sm font-normal text-theme-sub leading-relaxed font-sans">
                Export all calculated market predictions (1X2, Over/Under, Combo Bet Markets, Double Chance, BTTS, Team Goals &amp; Specials) to JSON.
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
                disabled={!isSqliteActive || isExporting || isOperating}
              >
                <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
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
                  className={`h-[34px] px-3.5 rounded-full border flex items-center justify-between transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                    theme === 'light'
                      ? 'bg-theme-card text-theme-main font-semibold border-theme-accent shadow-theme-glow'
                      : 'bg-theme-card/60 border-theme-subdued text-theme-sub font-medium hover:bg-theme-card hover:text-theme-main'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span className="text-base text-theme-main">Light</span>
                  </div>
                  {theme === 'light' && <Check className="w-4 h-4 text-theme-primary stroke-[2.5]" />}
                </button>

                <button
                  type="button"
                  onClick={() => theme !== 'dark' && onToggleTheme()}
                  className={`h-[34px] px-3.5 rounded-full border flex items-center justify-between transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
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
                              <Check className="w-3 h-3 stroke-[3]" />
                              <span>Active</span>
                            </Badge>
                          ) : null}
                        </div>

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
                      className={`rounded-xl border p-2 space-y-1.5 transition-colors ${
                        isCurrentPalette
                          ? 'border-theme-accent bg-theme-primary-subtle'
                          : 'border-theme-subdued bg-theme-card'
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
                          className={`p-1.5 rounded-lg border flex flex-col items-center gap-1 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                            isCurrentPalette && theme === 'light'
                              ? 'border-theme-accent ring-1 ring-theme-accent'
                              : 'border-slate-300/70 hover:border-theme-accent'
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
                          className={`p-1.5 rounded-lg border flex flex-col items-center gap-1 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                            isCurrentPalette && theme === 'dark'
                              ? 'border-theme-accent ring-1 ring-theme-accent'
                              : 'border-white/10 hover:border-theme-accent'
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
