import React, { useState, useEffect, useCallback, useRef } from 'react';
import PullToRefresh from 'react-simple-pull-to-refresh';
import { RefreshCw } from 'lucide-react';
import { Header } from './components/Header.js';
import { DesktopSidebar } from './components/DesktopSidebar.js';
import { FixturesList } from './components/FixturesList.js';
import { DailyFeaturedTip } from './components/DailyFeaturedTip.js';
import { LeagueStandings } from './components/LeagueStandings.js';
import { PredictionHistoryView } from './components/PredictionHistoryView.js';
import { MatchDetailModal, MatchDetailView } from './components/MatchDetailModal.js';
import { SettingsModal } from './components/SettingsModal.js';
import { TerminalModal } from './components/TerminalModal.js';
import { ErrorLogModal } from './components/ErrorLogModal.js';
import { BottomNavDock } from './components/BottomNavDock.js';
import { SyncLockOverlay } from './components/SyncLockOverlay.js';
import { BetsView } from './components/BetsView.js';
import { BetSlipDrawer } from './components/BetSlipDrawer.js';
import { Button, Card, Toast } from './components/ui/index.js';
import {
  Fixture,
  LeagueGroupDTO,
  LeagueOptionDTO,
  EngineSettings,
  ProviderStatus,
  BetSelection,
} from './core/types.js';
import { LiveScore } from './providers/types.js';
import { EngineService } from './services/engineService.js';
import { TerminalLogEntry } from './services/loggerService.js';
import type { SyncJobState } from './services/syncJobService.js';
import { applyColorTheme, getActiveColorThemeId, setThemeMode, getSavedThemeMode } from './core/themeEngine.js';
import { ClientCache } from './core/clientCache.js';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = getSavedThemeMode();
    return saved === 'light' ? 'light' : 'dark';
  });
  const [activeTab, setActiveTab] = useState<'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY' | 'BETS'>('FIXTURES');
  const [betSelections, setBetSelections] = useState<BetSelection[]>([]);

  const handleToggleSelection = (selection: BetSelection) => {
    setBetSelections((prev) => {
      const exists = prev.some((s) => s.fixtureId === selection.fixtureId && s.marketKey === selection.marketKey);
      if (exists) {
        return prev.filter((s) => !(s.fixtureId === selection.fixtureId && s.marketKey === selection.marketKey));
      } else {
        const filtered = prev.filter((s) => s.fixtureId !== selection.fixtureId);
        return [...filtered, selection];
      }
    });
  };

  const handleRemoveSelection = (fixtureId: string) => {
    setBetSelections((prev) => prev.filter((s) => s.fixtureId !== fixtureId));
  };

  const handleClearSelections = () => {
    setBetSelections([]);
  };

  const handleAddComboSelections = (items: BetSelection[]) => {
    setBetSelections((prev) => {
      const incomingMap = new Map(items.map((item) => [item.fixtureId, item]));
      const merged = prev.filter((s) => !incomingMap.has(s.fixtureId));
      return [...merged, ...items];
    });
    showNotification(`Added ${items.length}-Fold Combo to Bet Slip`, 'success');
  };
  const [activeScope, setActiveScope] = useState<'UPCOMING' | 'LIVE' | 'HISTORY'>('UPCOMING');
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [fixtureGroups, setFixtureGroups] = useState<LeagueGroupDTO[]>([]);
  const [totalDatabaseCount, setTotalDatabaseCount] = useState<number>(0);
  const [leaguesCatalog, setLeaguesCatalog] = useState<LeagueOptionDTO[]>([]);
  const [isLoadingFixtures, setIsLoadingFixtures] = useState<boolean>(true);
  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('TODAY');
  const [marketChoiceFilter, setMarketChoiceFilter] = useState<'MOST_LIKELY' | 'OVER_UNDER' | '1X2' | 'BTTS'>('MOST_LIKELY');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'WIREFRAME' | 'CARDS'>('WIREFRAME');
  const [isLeagueModalOpen, setIsLeagueModalOpen] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'DEFAULT' | 'PROB_DESC' | 'PROB_ASC' | 'HOME_DESC' | 'DRAW_DESC' | 'AWAY_DESC'>('DEFAULT');

  const [settings, setSettings] = useState<EngineSettings | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [stats, setStats] = useState<{ totalMatches: number; totalTeams: number; leagues: any[]; upcomingCount?: number; predictionsCount?: number }>({
    totalMatches: 0,
    totalTeams: 0,
    leagues: [],
  });
  const [liveScores, setLiveScores] = useState<LiveScore[]>([]);
  const [liveFixtures, setLiveFixtures] = useState<Fixture[]>([]);
  const [liveGroups, setLiveGroups] = useState<LeagueGroupDTO[]>([]);
  const [isLoadingLivePredictions, setIsLoadingLivePredictions] = useState<boolean>(false);

  // Modals & Detail
  const [selectedDetailFixture, setSelectedDetailFixture] = useState<Fixture | null>(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false);
  const [errorLogs, setErrorLogs] = useState<TerminalLogEntry[]>([]);
  const [isErrorLogModalOpen, setIsErrorLogModalOpen] = useState<boolean>(false);
  const [isLoadingErrorLogs, setIsLoadingErrorLogs] = useState<boolean>(false);
  const acknowledgedErrorIdsRef = useRef<Set<string>>(new Set());
  const [isSeeding] = useState<boolean>(false);
  const [isSyncingData, setIsSyncingData] = useState<boolean>(false);
  const [isCalculatingPredictions, setIsCalculatingPredictions] = useState<boolean>(false);
  const [activeSyncJob, setActiveSyncJob] = useState<SyncJobState | null>(null);
  const [dataRefreshVersion, setDataRefreshVersion] = useState<number>(0);

  const hasInitializedDateFilterRef = useRef<boolean>(false);
  const skipNextDateFilterFetchRef = useRef<boolean>(false);
  const fixturesCountRef = useRef<number>(0);
  fixturesCountRef.current = fixtures.length;
  const liveFixturesCountRef = useRef<number>(0);
  liveFixturesCountRef.current = liveFixtures.length;
  const upcomingAbortRef = useRef<AbortController | null>(null);
  const latestQueryParamsRef = useRef({
    selectedLeague,
    dateFilter,
    debouncedSearchQuery,
    sortBy,
    marketChoiceFilter,
  });
  latestQueryParamsRef.current = {
    selectedLeague,
    dateFilter,
    debouncedSearchQuery,
    sortBy,
    marketChoiceFilter,
  };

  const syncAbortControllerRef = useRef<AbortController | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const isIgnoredHmrWebSocketError = useCallback((message: string, details?: any): boolean => {
    const msg = String(message || '').toLowerCase();
    const detailStr =
      typeof details === 'string'
        ? details.toLowerCase()
        : JSON.stringify(details || {}).toLowerCase();
    const combined = `${msg} ${detailStr}`;
    return (
      combined.includes('/@vite/client') ||
      combined.includes('websocket closed without opened') ||
      combined.includes('failed to connect to websocket') ||
      (combined.includes('websocket') && combined.includes('vite'))
    );
  }, []);

  const checkForNewErrorLogs = useCallback(async () => {
    try {
      setIsLoadingErrorLogs(true);
      const rawErrs = await EngineService.getTerminalLogs({ level: 'ERROR', limit: 50 });
      if (!Array.isArray(rawErrs)) return;
      const errs = rawErrs.filter((e) => !isIgnoredHmrWebSocketError(e.message, e.details));
      setErrorLogs(errs);
      const hasUnacknowledged = errs.some((e) => e.id && !acknowledgedErrorIdsRef.current.has(e.id));
      if (hasUnacknowledged) {
        setIsErrorLogModalOpen(true);
      }
    } catch {
      // Ignore background log polling network hiccups
    } finally {
      setIsLoadingErrorLogs(false);
    }
  }, [isIgnoredHmrWebSocketError]);

  const handleDismissErrorLogModal = useCallback(() => {
    for (const err of errorLogs) {
      if (err.id) acknowledgedErrorIdsRef.current.add(err.id);
    }
    setIsErrorLogModalOpen(false);
  }, [errorLogs]);

  const showNotification = (message: string, type: 'success' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const handleSelectFixture = (f: Fixture) => {
    setSelectedDetailFixture(f);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsMobileDetailOpen(true);
    }
  };

  // Pre-select first/best fixture and keep selectedDetailFixture in sync when SQLite predictions reload
  useEffect(() => {
    if (fixtures.length === 0 && liveFixtures.length === 0) return;
    setSelectedDetailFixture((prev) => {
      if (!prev && fixtures.length > 0) {
        const highValue = fixtures.find((f) => f.prediction && f.prediction.homeWinProb >= 0.55);
        return highValue || fixtures.find((f) => Boolean(f.prediction)) || fixtures[0];
      }
      if (!prev) return prev;
      const cleanPrevId = (prev.id || '').replace(/^fs_/, '');
      const updated =
        fixtures.find((f) => f.id === prev.id || (f.id || '').replace(/^fs_/, '') === cleanPrevId) ||
        liveFixtures.find((f) => f.id === prev.id || (f.id || '').replace(/^fs_/, '') === cleanPrevId);
      return updated || prev;
    });
  }, [fixtures, liveFixtures]);

  const handleResetAndSyncData = async () => {
    if (isSyncingData || isCalculatingPredictions) return;
    syncAbortControllerRef.current?.abort();
    const controller = new AbortController();
    syncAbortControllerRef.current = controller;

    try {
      setIsSyncingData(true);
      setActiveSyncJob({
        id: '',
        status: 'RUNNING',
        jobType: 'FULL',
        progress: 5,
        currentStep: 'Initializing Full Data Sync worker...',
        stepIndex: 1,
        totalSteps: 8,
        matchesCount: 0,
        upcomingCount: 0,
        predictionsCount: 0,
        historicalPredictionsCount: 0,
        livePredictionsCount: 0,
        startTime: Date.now(),
        lastUpdatedAt: Date.now(),
      });
      showNotification('Starting Full Data Sync...', 'info');

      const res = await EngineService.resetAndSyncDatabase((job) => {
        if (!controller.signal.aborted) {
          setActiveSyncJob(job);
        }
      }, controller.signal);

      if (controller.signal.aborted || res.cancelled) {
        showNotification('Full Data Sync cancelled.', 'info');
        return;
      }

      if (res.success) {
        setActiveSyncJob((prev) =>
          prev
            ? {
                ...prev,
                status: 'RUNNING',
                progress: 98,
                currentStep: 'Loading synchronized data from SQLite database...',
              }
            : prev
        );
        await Promise.all([
          fetchFixtures({ forceRefresh: true }),
          fetchSettingsAndProviders(),
          fetchLiveScores(),
          fetchLivePredictions(),
        ]);
        setDataRefreshVersion((v) => v + 1);
        showNotification(res.message || 'Full Data Sync completed cleanly!', 'success');
      } else {
        showNotification(res.message || 'Failed to run Full Data Sync', 'info');
        void checkForNewErrorLogs();
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        console.error('Error syncing data:', err);
        showNotification(err?.message || 'Error executing Full Data Sync', 'info');
        void checkForNewErrorLogs();
      }
    } finally {
      if (syncAbortControllerRef.current === controller) {
        syncAbortControllerRef.current = null;
        setIsSyncingData(false);
        setActiveSyncJob(null);
      }
    }
  };

  const handleCalculatePredictions = async () => {
    if (isSyncingData || isCalculatingPredictions) return;
    syncAbortControllerRef.current?.abort();
    const controller = new AbortController();
    syncAbortControllerRef.current = controller;

    try {
      setIsCalculatingPredictions(true);
      setActiveSyncJob({
        id: '',
        status: 'RUNNING',
        jobType: 'PREDICTIONS',
        progress: 10,
        currentStep: 'Querying upcoming fixtures from SQLite database...',
        stepIndex: 1,
        totalSteps: 3,
        matchesCount: 0,
        skippedCount: 0,
        upcomingCount: (stats as any)?.upcomingCount ?? fixtures.length ?? 0,
        predictionsCount: (stats as any)?.predictionsCount ?? 0,
        historicalPredictionsCount: 0,
        livePredictionsCount: 0,
        startTime: Date.now(),
        lastUpdatedAt: Date.now(),
      });
      showNotification('Starting Calculate Predictions...', 'info');

      const res = await EngineService.updateUpcomingPredictions((job) => {
        if (!controller.signal.aborted) {
          setActiveSyncJob(job);
        }
      }, controller.signal);

      if (controller.signal.aborted || res.cancelled) {
        showNotification('Calculate Predictions cancelled.', 'info');
        return;
      }

      if (res.success) {
        setActiveSyncJob((prev) =>
          prev
            ? {
                ...prev,
                status: 'RUNNING',
                progress: 98,
                currentStep: 'Loading predictions from predictions SQLite database...',
              }
            : prev
        );
        await Promise.all([
          fetchFixtures({ forceRefresh: true }),
          fetchSettingsAndProviders(),
          fetchLiveScores(),
          fetchLivePredictions(),
        ]);
        setDataRefreshVersion((v) => v + 1);
        showNotification(res.message || 'Successfully recalculated predictions for upcoming matches.', 'success');
      } else {
        showNotification(res.error || 'Failed to calculate predictions', 'info');
        void checkForNewErrorLogs();
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        console.error('Error calculating predictions:', err);
        showNotification(err?.message || 'Error executing Calculate Predictions', 'info');
        void checkForNewErrorLogs();
      }
    } finally {
      if (syncAbortControllerRef.current === controller) {
        syncAbortControllerRef.current = null;
        setIsCalculatingPredictions(false);
        setActiveSyncJob(null);
      }
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    setThemeMode(nextTheme);
  };

  useEffect(() => {
    setThemeMode(theme);
  }, [theme]);

  // Synchronize theme changes across open tabs without OS/browser media queries
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
        setTheme(e.newValue);
        setThemeMode(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Debounce search input cleanly before triggering server-side queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchFixtures = useCallback(async (options?: { forceRefresh?: boolean }) => {
    upcomingAbortRef.current?.abort();
    const controller = new AbortController();
    upcomingAbortRef.current = controller;

    const params = latestQueryParamsRef.current;
    const isInitialAuto = !hasInitializedDateFilterRef.current;
    const queryDateFilter = isInitialAuto ? 'AUTO' : params.dateFilter;

    try {
      const cacheKey = EngineService.buildQueryFixturesCacheKey({
        league: params.selectedLeague,
        dateFilter: queryDateFilter,
        search: params.debouncedSearchQuery,
        sortBy: params.sortBy,
        marketFilter: params.marketChoiceFilter,
      });

      if (!options?.forceRefresh) {
        const cached = await ClientCache.getCachedQueryResponse(cacheKey);
        if (controller.signal.aborted) return;
        if (cached?.data && Array.isArray(cached.data.fixtures)) {
          setFixtures(cached.data.fixtures);
          setFixtureGroups(cached.data.groups || []);
          setTotalDatabaseCount(cached.data.totalDatabaseCount ?? cached.data.fixtures.length);
          setIsLoadingFixtures(false);
        } else if (fixturesCountRef.current === 0) {
          setIsLoadingFixtures(true);
        }
      } else if (fixturesCountRef.current === 0) {
        setIsLoadingFixtures(true);
      }

      const res = await EngineService.queryFixtures(
        {
          league: params.selectedLeague,
          dateFilter: queryDateFilter,
          search: params.debouncedSearchQuery,
          sortBy: params.sortBy,
          marketFilter: params.marketChoiceFilter,
        },
        { forceRefresh: options?.forceRefresh, signal: controller.signal }
      );

      if (controller.signal.aborted) return;

      if (res && Array.isArray(res.fixtures)) {
        setFixtures(res.fixtures);
        setFixtureGroups(res.groups || []);
        setTotalDatabaseCount(res.totalDatabaseCount ?? res.fixtures.length);

        if (isInitialAuto) {
          hasInitializedDateFilterRef.current = true;
          if (res.resolvedDateFilter && res.resolvedDateFilter !== params.dateFilter) {
            skipNextDateFilterFetchRef.current = true;
            setDateFilter(res.resolvedDateFilter);
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Failed to fetch fixtures:', e);
        if (fixturesCountRef.current === 0) {
          showNotification('Server Error: ' + (e?.message || 'Failed to fetch fixtures from server'), 'info');
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingFixtures(false);
      }
    }
  }, []);

  const fetchSettingsAndProviders = useCallback(async () => {
    try {
      const [sData, pData, statsData] = await Promise.all([
        EngineService.getSettings(),
        EngineService.getProviders(),
        EngineService.getStats(),
      ]);

      setSettings(sData);
      setProviders(pData);
      setStats(statsData);
    } catch (e) {
      console.error('Failed to fetch settings/providers/stats:', e);
    }
  }, []);

  const fetchLiveScores = useCallback(async () => {
    try {
      const scores = await EngineService.getLiveScores();
      if (!scores || !Array.isArray(scores)) return;
      setLiveScores(scores);
    } catch (e) {
      console.error('Failed to fetch live scores:', e);
    }
  }, []);

  const fetchLivePredictions = useCallback(async () => {
    const params = latestQueryParamsRef.current;
    try {
      if (liveFixturesCountRef.current === 0) {
        setIsLoadingLivePredictions(true);
      }
      const res = await EngineService.queryLiveFixtures({
        league: params.selectedLeague,
        search: params.debouncedSearchQuery,
        sortBy: params.sortBy,
        marketFilter: params.marketChoiceFilter,
        limit: 200,
      });
      setLiveFixtures(res.fixtures || []);
      setLiveGroups(res.groups || []);
    } catch (err) {
      console.error('Failed to load live fixtures from worker:', err);
    } finally {
      setIsLoadingLivePredictions(false);
    }
  }, []);

  // Execute server-side fixtures query on mount and when filter parameters change
  useEffect(() => {
    if (skipNextDateFilterFetchRef.current) {
      skipNextDateFilterFetchRef.current = false;
      return;
    }
    void fetchFixtures();
  }, [
    selectedLeague,
    dateFilter,
    debouncedSearchQuery,
    sortBy,
    marketChoiceFilter,
    dataRefreshVersion,
    fetchFixtures,
  ]);

  // Query live matches only when LIVE scope is active (and refresh every 15s with ETag 304 while active)
  useEffect(() => {
    if (activeScope !== 'LIVE') return;
    void fetchLivePredictions();
    const interval = setInterval(() => {
      void fetchLivePredictions();
    }, 15000);
    return () => clearInterval(interval);
  }, [
    activeScope,
    selectedLeague,
    debouncedSearchQuery,
    sortBy,
    marketChoiceFilter,
    dataRefreshVersion,
    fetchLivePredictions,
  ]);

  // One-time mount initialization (settings, catalog, badge live-score polling, error logs, sync job resume)
  useEffect(() => {
    applyColorTheme(getActiveColorThemeId());
    void fetchSettingsAndProviders();
    void EngineService.getLeaguesCatalog().then((catalog) => {
      if (Array.isArray(catalog)) setLeaguesCatalog(catalog);
    });
    void fetchLiveScores();
    void checkForNewErrorLogs();

    const liveInterval = setInterval(() => {
      void fetchLiveScores();
    }, 15000);
    const errInterval = setInterval(() => {
      void checkForNewErrorLogs();
    }, 10000);

    const handleWindowError = (event: ErrorEvent) => {
      const details = {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      };
      if (isIgnoredHmrWebSocketError(event.message || '', details)) {
        return;
      }
      void EngineService.recordTerminalLog({
        level: 'ERROR',
        category: 'ENGINE',
        source: 'BrowserWindow',
        message: event.message || 'Unhandled browser runtime error',
        details,
      }).then(() => checkForNewErrorLogs());
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : String(reason || 'Unhandled promise rejection');
      const details = reason instanceof Error ? { stack: reason.stack } : reason;
      if (isIgnoredHmrWebSocketError(msg, details)) {
        event.preventDefault();
        return;
      }
      void EngineService.recordTerminalLog({
        level: 'ERROR',
        category: 'ENGINE',
        source: 'BrowserPromise',
        message: msg,
        details,
      }).then(() => checkForNewErrorLogs());
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Attach to any in-flight background job if browser refreshed mid-sync or mid-calculation
    const resumeController = new AbortController();
    void (async () => {
      try {
        const runningJob = await EngineService.getActiveSyncJob();
        if (!runningJob || resumeController.signal.aborted || syncAbortControllerRef.current) return;
        syncAbortControllerRef.current = resumeController;
        const isPred = runningJob.jobType === 'PREDICTIONS';
        if (isPred) setIsCalculatingPredictions(true);
        else setIsSyncingData(true);
        setActiveSyncJob(runningJob);

        const pollRes = await EngineService.pollBackgroundJob(runningJob.id, {
          onProgress: (updatedJob) => {
            if (!resumeController.signal.aborted) {
              setActiveSyncJob(updatedJob);
            }
          },
          signal: resumeController.signal,
          pollIntervalMs: 900,
          inactivityTimeoutMs: 135_000,
          maxDurationMs: isPred ? 6 * 60 * 1000 : 9 * 60 * 1000,
        });

        if (pollRes.success && !resumeController.signal.aborted) {
          await Promise.all([
            fetchFixtures({ forceRefresh: true }),
            fetchSettingsAndProviders(),
            fetchLiveScores(),
          ]);
          setDataRefreshVersion((v) => v + 1);
          showNotification(pollRes.job?.message || 'Background process completed!', 'success');
        } else if (!pollRes.cancelled && !resumeController.signal.aborted) {
          showNotification(pollRes.error || 'Background process failed.', 'info');
          void checkForNewErrorLogs();
        }
      } catch {
        // Non-fatal check
      } finally {
        if (syncAbortControllerRef.current === resumeController) {
          syncAbortControllerRef.current = null;
          setIsSyncingData(false);
          setIsCalculatingPredictions(false);
          setActiveSyncJob(null);
        }
      }
    })();

    return () => {
      upcomingAbortRef.current?.abort();
      resumeController.abort();
      clearInterval(liveInterval);
      clearInterval(errInterval);
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [fetchSettingsAndProviders, fetchFixtures, fetchLiveScores, checkForNewErrorLogs, isIgnoredHmrWebSocketError]);

  const handleSaveSettings = async (newSettings: Partial<EngineSettings>) => {
    try {
      const updated = await EngineService.updateSettings(newSettings);
      setSettings(updated);
      await fetchFixtures({ forceRefresh: true });
      await fetchSettingsAndProviders();
    } catch (e) {
      console.error('Failed to update settings:', e);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([
      fetchSettingsAndProviders(),
      fetchFixtures({ forceRefresh: true }),
      fetchLiveScores(),
      activeScope === 'LIVE' ? fetchLivePredictions() : Promise.resolve(),
    ]);
  };

  const isProcessingActive = Boolean(
    isSyncingData ||
    isCalculatingPredictions ||
    (activeSyncJob && (activeSyncJob.status === 'RUNNING' || activeSyncJob.status === 'PENDING'))
  );

  return (
    <div className="min-h-screen bg-theme-bg text-theme-main flex flex-col font-sans transition-colors">
      {/* Toast Notification */}
      <Toast message={notification?.message ?? null} type={notification?.type ?? 'info'} />

      {/* Top Application Header */}
      <Header
        activeTab={activeTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Workspace with Desktop Sidebar & Viewport */}
      <div className="flex-1 w-full flex min-w-0">
        {/* Desktop Sidebar (lg:flex, hidden on mobile) */}
        <DesktopSidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          selectedLeague={selectedLeague}
          onSelectLeague={setSelectedLeague}
          onOpenTerminal={() => setIsTerminalOpen(true)}
          onOpenLeagueModal={() => setIsLeagueModalOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          totalMatchesCount={totalDatabaseCount || stats?.upcomingCount || fixtures.length}
          liveMatchesCount={liveScores.length}
        />

        {/* Content Viewport */}
        <div className="flex-1 min-w-0 flex flex-col">
          <PullToRefresh
            onRefresh={handleRefresh}
            pullingContent=""
            refreshingContent={
              <div className="flex items-center justify-center py-3">
                <div
                  className="w-9 h-9 rounded-full bg-theme-card border border-theme shadow-theme-md flex items-center justify-center text-theme-primary"
                  role="status"
                  aria-label="Refreshing"
                >
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="currentColor"
                      strokeWidth="2.75"
                      className="opacity-20"
                    />
                    <path
                      d="M12 3a9 9 0 0 1 9 9"
                      stroke="currentColor"
                      strokeWidth="2.75"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
            }
          >
            <main className="flex-1 w-full max-w-7xl mx-auto px-2.5 sm:px-4 lg:px-5 py-2.5 space-y-2.5 pb-16 lg:pb-5">
              {/* Blocking Job Overlay when Full Data Sync or Calculate Predictions is in progress */}
              {isProcessingActive && (
                <SyncLockOverlay
                  job={activeSyncJob}
                  onCancel={async (jobId) => {
                    syncAbortControllerRef.current?.abort();
                    syncAbortControllerRef.current = null;
                    setActiveSyncJob(null);
                    setIsSyncingData(false);
                    setIsCalculatingPredictions(false);
                    if (jobId) {
                      await EngineService.cancelSyncJob(jobId);
                    }
                  }}
                />
              )}



              {activeTab === 'FIXTURES' && (
                <div className={`w-full grid grid-cols-12 gap-3 lg:gap-3.5 items-start ${isProcessingActive ? 'pointer-events-none opacity-40 select-none' : ''}`}>
                  {/* Master Feed Column */}
                  <div className="col-span-12 lg:col-span-7 xl:col-span-7 min-w-0">
                    <FixturesList
                      fixtures={fixtures}
                      fixtureGroups={fixtureGroups}
                      totalDatabaseCount={totalDatabaseCount}
                      liveScores={liveScores}
                      liveFixtures={liveFixtures}
                      liveGroups={liveGroups}
                      leaguesCatalog={leaguesCatalog}
                      activeScope={activeScope}
                      onSelectScope={setActiveScope}
                      isLoading={isLoadingFixtures}
                      isLoadingLive={isLoadingLivePredictions}
                      onSelectDetail={handleSelectFixture}
                      selectedLeague={selectedLeague}
                      onSelectLeague={setSelectedLeague}
                      dateFilter={dateFilter}
                      setDateFilter={setDateFilter}
                      marketChoiceFilter={marketChoiceFilter}
                      setMarketChoiceFilter={setMarketChoiceFilter}
                      searchQuery={searchQuery}
                      setSearchQuery={setSearchQuery}
                      viewMode={viewMode}
                      setViewMode={setViewMode}
                      isLeagueModalOpen={isLeagueModalOpen}
                      setIsLeagueModalOpen={setIsLeagueModalOpen}
                      sortBy={sortBy}
                      onSelectSortBy={setSortBy}
                      selectedFixtureId={selectedDetailFixture?.id}
                      isProcessingActive={isProcessingActive}
                      onTriggerFullSync={handleResetAndSyncData}
                      refreshKey={dataRefreshVersion}
                    />
                  </div>

                  {/* Detail Inspector Column (Desktop Only Live Preview) */}
                  <div className="hidden lg:block lg:col-span-5 xl:col-span-5 sticky top-[47px] h-[calc(100vh-58px)] rounded-2xl bg-theme-card border border-theme shadow-theme-md overflow-hidden">
                    <MatchDetailView
                      fixture={selectedDetailFixture}
                      isPanel={true}
                      onAddSelection={handleToggleSelection}
                      selectedSelections={betSelections}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'ACCAS' && (
                <div className={`max-w-4xl mx-auto w-full ${isProcessingActive ? 'pointer-events-none opacity-40 select-none' : ''}`}>
                  <DailyFeaturedTip
                    onSelectDetail={handleSelectFixture}
                    onAddSelection={handleToggleSelection}
                    onAddCombo={handleAddComboSelections}
                    selectedSelections={betSelections}
                    refreshKey={dataRefreshVersion}
                  />
                </div>
              )}

              {activeTab === 'STANDINGS' && (
                <div className={`max-w-6xl mx-auto w-full ${isProcessingActive ? 'pointer-events-none opacity-40 select-none' : ''}`}>
                  <LeagueStandings
                    selectedLeague={selectedLeague}
                    onSelectLeague={setSelectedLeague}
                    onTriggerFullSync={handleResetAndSyncData}
                    refreshKey={dataRefreshVersion}
                  />
                </div>
              )}

              {activeTab === 'HISTORY' && (
                <div className={`max-w-4xl mx-auto w-full ${isProcessingActive ? 'pointer-events-none opacity-40 select-none' : ''}`}>
                  <PredictionHistoryView
                    isProcessingActive={isProcessingActive}
                    onTriggerFullSync={handleResetAndSyncData}
                    onSelectDetail={handleSelectFixture}
                    refreshKey={dataRefreshVersion}
                  />
                </div>
              )}

              {activeTab === 'BETS' && (
                <div className={`max-w-4xl mx-auto w-full ${isProcessingActive ? 'pointer-events-none opacity-40 select-none' : ''}`}>
                  <BetsView refreshKey={dataRefreshVersion} />
                </div>
              )}
            </main>
          </PullToRefresh>
        </div>
      </div>

      {/* Mobile Match Detail Drawer Modal (only visible on mobile screens) */}
      {isMobileDetailOpen && selectedDetailFixture && (
        <div className="lg:hidden">
          <MatchDetailModal
            fixture={selectedDetailFixture}
            onClose={() => setIsMobileDetailOpen(false)}
            onAddSelection={handleToggleSelection}
            selectedSelections={betSelections}
          />
        </div>
      )}

      {/* Floating Bet Slip Builder Tray */}
      {betSelections.length > 0 && (
        <BetSlipDrawer
          selections={betSelections}
          onRemoveSelection={handleRemoveSelection}
          onClearSelections={handleClearSelections}
          onBetPlaced={() => {
            void fetchFixtures({ forceRefresh: true });
            setDataRefreshVersion((v) => v + 1);
          }}
          showToast={showNotification}
        />
      )}

      {/* Terminal Logs Modal */}
      <TerminalModal
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
      />

      {/* Auto-Bound Error Log Modal (surfaces SQLite/database/runtime errors immediately) */}
      <ErrorLogModal
        isOpen={isErrorLogModalOpen}
        onClose={handleDismissErrorLogModal}
        errors={errorLogs}
        isLoading={isLoadingErrorLogs}
        onRefresh={checkForNewErrorLogs}
        onClearErrors={async () => {
          await EngineService.clearTerminalLogs();
          acknowledgedErrorIdsRef.current.clear();
          setErrorLogs([]);
          setIsErrorLogModalOpen(false);
        }}
        onOpenTerminal={() => {
          handleDismissErrorLogModal();
          setIsTerminalOpen(true);
        }}
      />

      {/* Settings & Ingestion Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        providers={providers}
        stats={stats}
        onSaveSettings={handleSaveSettings}
        onResetAndSync={handleResetAndSyncData}
        isResettingAndSyncing={isProcessingActive || isSeeding}
        theme={theme}
        onToggleTheme={toggleTheme}
        isSyncingData={isProcessingActive}
        onCalculatePredictions={handleCalculatePredictions}
        onOpenTerminal={() => {
          setIsSettingsOpen(false);
          setIsTerminalOpen(true);
        }}
        onRefreshMetrics={handleRefresh}
      />

      {/* Floating Bottom Navigation Dock (Mobile Only) */}
      <BottomNavDock
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />
    </div>
  );
}
