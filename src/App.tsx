import React, { useState, useEffect, useCallback } from 'react';
import PullToRefresh from 'react-simple-pull-to-refresh';
import { Header } from './components/Header.js';
import { DesktopSidebar } from './components/DesktopSidebar.js';
import { FixturesList } from './components/FixturesList.js';
import { DailyFeaturedTip } from './components/DailyFeaturedTip.js';
import { LeagueStandings } from './components/LeagueStandings.js';
import { PredictionHistoryView } from './components/PredictionHistoryView.js';
import { MatchDetailModal, MatchDetailView } from './components/MatchDetailModal.js';
import { SettingsModal } from './components/SettingsModal.js';
import { TerminalModal } from './components/TerminalModal.js';
import { BottomNavDock } from './components/BottomNavDock.js';
import { SyncLockOverlay } from './components/SyncLockOverlay.js';
import {
  Fixture,
  EngineSettings,
  ProviderStatus,
} from './core/types.js';
import { LiveScore } from './providers/types.js';
import { EngineService } from './services/engineService.js';
import { getRelativeDateStr, getPossibleDateStrs, normalizeDateStr } from './core/dateUtils.js';
import { indexedDbClient } from './core/indexedDbClient.js';

import { RefreshCw } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'dark';
  });
  const [activeTab, setActiveTab] = useState<'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY'>('FIXTURES');
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [isLoadingFixtures, setIsLoadingFixtures] = useState<boolean>(true);
  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<'TODAY' | 'TOMORROW' | 'NEXT_3_DAYS' | 'THIS_WEEK' | 'CUSTOM' | 'ALL'>('TODAY');
  const [marketChoiceFilter, setMarketChoiceFilter] = useState<'BEST_VALUE' | 'OVER_UNDER' | '1X2' | 'BTTS'>('BEST_VALUE');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'WIREFRAME' | 'CARDS'>('WIREFRAME');
  const [isLeagueModalOpen, setIsLeagueModalOpen] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'DEFAULT' | 'PROB_DESC' | 'PROB_ASC' | 'HOME_DESC' | 'DRAW_DESC' | 'AWAY_DESC'>('DEFAULT');

  const [settings, setSettings] = useState<EngineSettings | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [stats, setStats] = useState<{ totalMatches: number; totalTeams: number; leagues: any[] }>({
    totalMatches: 0,
    totalTeams: 0,
    leagues: [],
  });
  const [liveScores, setLiveScores] = useState<LiveScore[]>([]);

  // Modals & Detail
  const [selectedDetailFixture, setSelectedDetailFixture] = useState<Fixture | null>(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [isSyncingData, setIsSyncingData] = useState<boolean>(false);
  const [activeSyncJob, setActiveSyncJob] = useState<any | null>(null);
  const [syncJobProgress, setSyncJobProgress] = useState<{
    progress: number;
    currentStep: string;
    stepIndex?: number;
    totalSteps?: number;
  } | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

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

  // Pre-select first/best fixture for desktop master-detail pane once loaded
  useEffect(() => {
    if (!selectedDetailFixture && fixtures.length > 0) {
      const highValue = fixtures.find((f) => f.prediction && f.prediction.homeWinProb >= 0.55);
      setSelectedDetailFixture(highValue || fixtures[0]);
    }
  }, [fixtures, selectedDetailFixture]);

  const handleResetAndSyncData = async () => {
    try {
      setIsSyncingData(true);
      setSyncJobProgress({ progress: 5, currentStep: 'Initializing full data & H2H sync worker...' });
      showNotification('Starting full data & H2H synchronization...', 'info');

      const res = await EngineService.resetAndSyncDatabase((job) => {
        setSyncJobProgress({
          progress: job.progress || 10,
          currentStep: job.currentStep || 'Synchronizing...',
          stepIndex: job.stepIndex,
          totalSteps: job.totalSteps,
        });
      });

      if (res.success) {
        await Promise.all([
          fetchFixtures(),
          fetchSettingsAndProviders(),
          fetchLiveScores(),
        ]);
        showNotification(res.message || 'Full data, historical archives, upcoming feeds, and H2H records synchronized!', 'success');
      } else {
        showNotification(res.message || 'Failed to sync data', 'info');
      }
    } catch (err: any) {
      console.error('Error syncing data:', err);
      showNotification('Error executing full data sync', 'info');
    } finally {
      setIsSyncingData(false);
      setSyncJobProgress(null);
    }
  };

  const handleSyncData = handleResetAndSyncData;
  const handleResetDatabase = handleResetAndSyncData;

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    // initialize theme
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Load cached data from IndexedDB immediately on mount for fast offline/instant rendering
  useEffect(() => {
    async function loadCachedIndexedDB() {
      try {
        const cachedFixtures = await indexedDbClient.getTodaysFixtures();
        if (cachedFixtures && cachedFixtures.length > 0) {
          setFixtures(cachedFixtures);
          setIsLoadingFixtures(false);
        }
        const cachedScores = await indexedDbClient.getLiveScores();
        if (cachedScores && cachedScores.length > 0) {
          setLiveScores(cachedScores);
        }
      } catch (err) {
        // Safe catch for IndexedDB initialization
      }
    }
    loadCachedIndexedDB();
  }, []);

  // Fetch initial fixtures and settings
  const fetchFixtures = useCallback(async () => {
    try {
      setIsLoadingFixtures(true);
      const data = await EngineService.getFixtures('ALL');
      setFixtures(data);
      if (data && data.length > 0) {
        // Asynchronously persist to browser IndexedDB and LocalStorage
        indexedDbClient.saveTodaysFixtures(data).catch(() => {});
      }

      const todayStrs = getPossibleDateStrs(0);
      const tomorrowStrs = getPossibleDateStrs(1);
      const hasTodayMatches = data.some(f => todayStrs.includes(normalizeDateStr(f.matchDate)) && f.status !== 'LIVE');
      const hasTomorrowMatches = data.some(f => tomorrowStrs.includes(normalizeDateStr(f.matchDate)) && f.status !== 'LIVE');
      if (hasTodayMatches) {
        setDateFilter('TODAY');
      } else if (hasTomorrowMatches) {
        setDateFilter('TOMORROW');
      } else if (data.length > 0) {
        setDateFilter('ALL');
      }
    } catch (e: any) {
      console.error('Failed to fetch fixtures:', e);
      // Fallback to IndexedDB cached data if server fetch failed
      const cached = await indexedDbClient.getTodaysFixtures();
      if (cached && cached.length > 0) {
        setFixtures(cached);
        showNotification('Using cached data from IndexedDB', 'info');
      } else {
        showNotification('Server Error: ' + (e?.message || 'Failed to fetch fixtures from server'), 'info');
        setFixtures([]);
      }
    } finally {
      setIsLoadingFixtures(false);
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

      // Asynchronously persist to browser IndexedDB and LocalStorage
      indexedDbClient.saveLiveScores(scores).catch(() => {});

      setLiveScores((prev) => {
        if (prev.length !== scores.length) return scores;
        let changed = false;
        for (let i = 0; i < scores.length; i++) {
          const s = scores[i];
          const p = prev[i];
          if (
            !p ||
            s.fixtureId !== p.fixtureId ||
            s.homeScore !== p.homeScore ||
            s.awayScore !== p.awayScore ||
            s.minute !== p.minute ||
            s.status !== p.status
          ) {
            changed = true;
            break;
          }
        }
        return changed ? scores : prev;
      });
    } catch (e) {
      // Non-blocking fallback to IndexedDB cached scores
      indexedDbClient.getLiveScores().then((cached) => {
        if (cached && cached.length > 0) {
          setLiveScores(cached);
        }
      }).catch(() => {});
    }
  }, []);

  const checkActiveSyncJob = useCallback(async () => {
    try {
      const active = await EngineService.getActiveSyncJob();
      if (active && (active.status === 'RUNNING' || active.status === 'PENDING')) {
        setActiveSyncJob(active);
      } else if (activeSyncJob && (activeSyncJob.status === 'RUNNING' || activeSyncJob.status === 'PENDING')) {
        setActiveSyncJob(null);
        setIsSyncingData(false);
        await Promise.all([fetchFixtures(), fetchSettingsAndProviders(), fetchLiveScores()]);
        showNotification('Synchronization & prediction recalculation complete!', 'success');
      } else {
        setActiveSyncJob(null);
      }
    } catch {
      // safe catch
    }
  }, [activeSyncJob, fetchFixtures, fetchSettingsAndProviders, fetchLiveScores]);

  useEffect(() => {
    fetchSettingsAndProviders();
    fetchFixtures();
    fetchLiveScores();

    // Adaptive polling: 15s for live scores
    const liveInterval = setInterval(fetchLiveScores, 15000);

    return () => {
      clearInterval(liveInterval);
    };
  }, [fetchSettingsAndProviders, fetchFixtures, fetchLiveScores]);

  const handleSelectLeague = (league: string) => {
    setSelectedLeague(league);
  };

  const handleProviderChange = async () => {
    try {
      await EngineService.switchProvider();
      showNotification(`Provider switched successfully`);
      fetchFixtures();
    } catch (e) {
      console.error('Failed to switch provider:', e);
    }
  };

  const handleSaveSettings = async (newSettings: Partial<EngineSettings>) => {
    try {
      const updated = await EngineService.updateSettings(newSettings);
      setSettings(updated);
      fetchFixtures();
      fetchSettingsAndProviders();
      showNotification('Poisson parameters updated!');
    } catch (e) {
      console.error('Failed to update settings:', e);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([
      fetchSettingsAndProviders(),
      fetchFixtures(),
      fetchLiveScores()
    ]);
  };

  const isProcessingActive = Boolean(
    isSyncingData ||
    (activeSyncJob && (activeSyncJob.status === 'RUNNING' || activeSyncJob.status === 'PENDING'))
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#09090B] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-16 sm:bottom-5 right-3 z-[100] bg-white dark:bg-[#121216] text-slate-900 dark:text-white font-mono text-xs px-3 py-2 rounded-full shadow-2xl flex items-center gap-2 animate-in slide-in-from-bottom-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#CCFF00] shrink-0 animate-pulse" />
          <span className="truncate max-w-[280px] font-bold">{notification.message}</span>
        </div>
      )}

      {/* Top Application Header */}
      <Header
        liveScores={liveScores}
        settings={settings}
        providers={providers}
        stats={stats}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenTerminal={() => setIsTerminalOpen(true)}
        onOpenSeedModal={() => setIsSettingsOpen(true)}
        onSelectAccaCategory={() => setActiveTab('ACCAS')}
        isSyncing={isLoadingFixtures || isProcessingActive}
        theme={theme}
        onToggleTheme={toggleTheme}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSyncData={handleResetAndSyncData}
      />

      {/* Main Workspace with Desktop Sidebar & Viewport */}
      <div className="flex-1 w-full flex min-w-0">
        {/* Desktop Sidebar (lg:flex, hidden on mobile) */}
        <DesktopSidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          selectedLeague={selectedLeague}
          onSelectLeague={setSelectedLeague}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenTerminal={() => setIsTerminalOpen(true)}
          onOpenLeagueModal={() => setIsLeagueModalOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          totalMatchesCount={fixtures.length}
          liveMatchesCount={liveScores.length}
          isSyncing={isLoadingFixtures || isProcessingActive}
        />

        {/* Content Viewport */}
        <div className="flex-1 min-w-0 flex flex-col">
          <PullToRefresh onRefresh={handleRefresh} pullingContent="" refreshingContent="Refreshing...">
            <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 py-3.5 space-y-4 pb-20 lg:pb-8">
              {/* Blocking Job Overlay when Full Sync or Update Predictions is in progress */}
              {isProcessingActive && (
                <SyncLockOverlay
                  job={activeSyncJob}
                  onCancel={(jobId) => EngineService.cancelSyncJob(jobId)}
                />
              )}

              {/* Notification Banner to Start Full Sync if Database has zero fixtures */}
              {fixtures.length === 0 && !isLoadingFixtures && !isProcessingActive && (
                <div className="bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] text-slate-900 dark:text-white rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#FF001F]/10 flex items-center justify-center text-[#FF001F] shrink-0">
                      <RefreshCw className="w-5 h-5" />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <h3 className="text-xs sm:text-sm font-extrabold tracking-tight">
                        Database Synchronization Prompt
                      </h3>
                      <p className="text-[11px] sm:text-xs text-[#8F92A1] dark:text-[#9EA3B2] font-medium">
                        Start full sync to fetch active Flashscore fixtures, team stats, H2H records, and calculate 5-Pillar Poisson model predictions.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetAndSyncData}
                    className="px-4 py-2.5 rounded-full bg-[#FF001F] text-white hover:bg-[#E6001C] font-bold text-xs transition-all cursor-pointer shadow-sm active:scale-95 shrink-0 whitespace-nowrap flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Start Full Sync & Update Data</span>
                  </button>
                </div>
              )}

              {activeTab === 'FIXTURES' && (
                <div className={`w-full grid grid-cols-12 gap-4 lg:gap-5 items-start ${isProcessingActive ? 'pointer-events-none opacity-40 select-none' : ''}`}>
                  {/* Master Feed Column */}
                  <div className="col-span-12 lg:col-span-7 xl:col-span-7 min-w-0">
                    <FixturesList
                      fixtures={fixtures}
                      liveScores={liveScores}
                      isLoading={isLoadingFixtures}
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
                    />
                  </div>

                  {/* Detail Inspector Column (Desktop Only Live Preview) */}
                  <div className="hidden lg:block lg:col-span-5 xl:col-span-5 sticky top-16 h-[calc(100vh-4.75rem)] rounded-2xl bg-white dark:bg-[#121216] shadow-sm overflow-hidden">
                    <MatchDetailView
                      fixture={selectedDetailFixture}
                      isPanel={true}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'ACCAS' && (
                <div className={`max-w-4xl mx-auto w-full ${isProcessingActive ? 'pointer-events-none opacity-40 select-none' : ''}`}>
                  <DailyFeaturedTip
                    onSelectDetail={handleSelectFixture}
                  />
                </div>
              )}

              {activeTab === 'STANDINGS' && (
                <div className={`max-w-5xl mx-auto w-full ${isProcessingActive ? 'pointer-events-none opacity-40 select-none' : ''}`}>
                  <LeagueStandings
                    selectedLeague={selectedLeague}
                    onSelectLeague={setSelectedLeague}
                    onTriggerFullSync={handleResetAndSyncData}
                  />
                </div>
              )}

              {activeTab === 'HISTORY' && (
                <div className={`max-w-4xl mx-auto w-full ${isProcessingActive ? 'pointer-events-none opacity-40 select-none' : ''}`}>
                  <PredictionHistoryView
                    isProcessingActive={isProcessingActive}
                    onTriggerFullSync={handleResetAndSyncData}
                  />
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
          />
        </div>
      )}

      {/* Terminal Logs Modal */}
      <TerminalModal
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
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
        isResettingAndSyncing={isSyncingData || isSeeding}
        onResetDatabase={handleResetAndSyncData}
        isResettingDatabase={isSyncingData || isSeeding}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSyncData={handleResetAndSyncData}
        isSyncingData={isSyncingData}
        syncProgress={syncJobProgress}
        onOpenTerminal={() => {
          setIsSettingsOpen(false);
          setIsTerminalOpen(true);
        }}
        onRefreshMetrics={fetchSettingsAndProviders}
      />

      {/* Floating Bottom Navigation Dock (Mobile Only) */}
      <BottomNavDock
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onQuickSync={handleResetAndSyncData}
        isSyncing={isSyncingData}
      />
    </div>
  );
}

