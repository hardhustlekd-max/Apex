import React, { useState, useEffect, useCallback } from 'react';
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
import { BottomNavDock } from './components/BottomNavDock.js';
import { SyncLockOverlay } from './components/SyncLockOverlay.js';
import { Button, Card, Toast } from './components/ui/index.js';
import {
  Fixture,
  EngineSettings,
  ProviderStatus,
} from './core/types.js';
import { LiveScore } from './providers/types.js';
import { EngineService } from './services/engineService.js';
import { matchesDateFilter } from './core/dateUtils.js';
import { applyColorTheme, getActiveColorThemeId, setThemeMode, getSavedThemeMode } from './core/themeEngine.js';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = getSavedThemeMode();
    return saved === 'light' ? 'light' : 'dark';
  });
  const [activeTab, setActiveTab] = useState<'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'HISTORY'>('FIXTURES');
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [isLoadingFixtures, setIsLoadingFixtures] = useState<boolean>(true);
  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('TODAY');
  const [marketChoiceFilter, setMarketChoiceFilter] = useState<'MOST_LIKELY' | 'OVER_UNDER' | '1X2' | 'BTTS'>('MOST_LIKELY');
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
  const [livePredictions, setLivePredictions] = useState<Fixture[]>([]);
  const [isLoadingLivePredictions, setIsLoadingLivePredictions] = useState<boolean>(false);

  // Modals & Detail
  const [selectedDetailFixture, setSelectedDetailFixture] = useState<Fixture | null>(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false);
  const [isSeeding] = useState<boolean>(false);
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
          fetchLivePredictions(),
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

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    setThemeMode(nextTheme);
  };

  useEffect(() => {
    setThemeMode(theme);
  }, [theme]);

  const fetchFixtures = useCallback(async () => {
    try {
      setIsLoadingFixtures(true);
      const data = await EngineService.getFixtures('ALL');
      setFixtures(data);

      const hasTodayMatches = data.some(f => f.status !== 'LIVE' && matchesDateFilter(f, 'TODAY'));
      const hasTomorrowMatches = data.some(f => f.status !== 'LIVE' && matchesDateFilter(f, 'TOMORROW'));
      if (hasTodayMatches) {
        setDateFilter('TODAY');
      } else if (hasTomorrowMatches) {
        setDateFilter('TOMORROW');
      } else if (data.length > 0) {
        setDateFilter('ALL');
      }
    } catch (e: any) {
      console.error('Failed to fetch fixtures:', e);
      showNotification('Server Error: ' + (e?.message || 'Failed to fetch fixtures from server'), 'info');
      setFixtures([]);
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
      setLiveScores(scores);
    } catch (e) {
      console.error('Failed to fetch live scores:', e);
    }
  }, []);

  const fetchLivePredictions = useCallback(async () => {
    try {
      setIsLoadingLivePredictions(true);
      const data = await EngineService.getLivePredictions(selectedLeague, 100);
      setLivePredictions(data || []);
    } catch (err) {
      console.error('Failed to load live predictions from db:', err);
    } finally {
      setIsLoadingLivePredictions(false);
    }
  }, [selectedLeague]);

  useEffect(() => {
    applyColorTheme(settings?.colorTheme || getActiveColorThemeId());
    fetchSettingsAndProviders();
    fetchFixtures();
    fetchLiveScores();
    fetchLivePredictions();

    const liveInterval = setInterval(fetchLiveScores, 15000);
    const predInterval = setInterval(fetchLivePredictions, 60000);

    return () => {
      clearInterval(liveInterval);
      clearInterval(predInterval);
    };
  }, [fetchSettingsAndProviders, fetchFixtures, fetchLiveScores, fetchLivePredictions]);

  const handleSaveSettings = async (newSettings: Partial<EngineSettings>) => {
    try {
      const updated = await EngineService.updateSettings(newSettings);
      setSettings(updated);
      fetchFixtures();
      fetchSettingsAndProviders();
    } catch (e) {
      console.error('Failed to update settings:', e);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([
      fetchSettingsAndProviders(),
      fetchFixtures(),
      fetchLiveScores(),
      fetchLivePredictions()
    ]);
  };

  const isProcessingActive = Boolean(
    isSyncingData ||
    (activeSyncJob && (activeSyncJob.status === 'RUNNING' || activeSyncJob.status === 'PENDING'))
  );

  return (
    <div className="min-h-screen bg-theme-bg text-theme-main flex flex-col font-sans transition-colors">
      {/* Toast Notification */}
      <Toast message={notification?.message ?? null} type={notification?.type ?? 'info'} />

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
          <PullToRefresh
            onRefresh={handleRefresh}
            pullingContent=""
            refreshingContent={
              <div className="flex items-center justify-center py-3">
                <div
                  className="w-9 h-9 rounded-full bg-theme-card shadow-theme-md flex items-center justify-center text-theme-primary"
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
            <main className="flex-1 w-full max-w-7xl mx-auto px-2.5 sm:px-4 lg:px-5 py-2.5 sm:py-3 space-y-3 pb-16 lg:pb-6">
              {/* Blocking Job Overlay when Full Sync or Update Predictions is in progress */}
              {isProcessingActive && (
                <SyncLockOverlay
                  job={activeSyncJob}
                  onCancel={(jobId) => {
                    setActiveSyncJob(null);
                    return EngineService.cancelSyncJob(jobId);
                  }}
                />
              )}

              {/* Notification Banner to Start Full Sync if Database has zero fixtures */}
              {fixtures.length === 0 && !isLoadingFixtures && !isProcessingActive && (
                <Card className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-theme-primary-subtle flex items-center justify-center text-theme-primary shrink-0">
                      <RefreshCw className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-extrabold tracking-tight truncate">
                        No Fixtures in Database
                      </h3>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleResetAndSyncData}
                    className="font-black"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Start Full Sync</span>
                  </Button>
                </Card>
              )}

              {activeTab === 'FIXTURES' && (
                <div className={`w-full grid grid-cols-12 gap-3 lg:gap-4 items-start ${isProcessingActive ? 'pointer-events-none opacity-40 select-none' : ''}`}>
                  {/* Master Feed Column */}
                  <div className="col-span-12 lg:col-span-7 xl:col-span-7 min-w-0">
                    <FixturesList
                      fixtures={fixtures}
                      liveScores={liveScores}
                      livePredictions={livePredictions}
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
                    />
                  </div>

                  {/* Detail Inspector Column (Desktop Only Live Preview) */}
                  <div className="hidden lg:block lg:col-span-5 xl:col-span-5 sticky top-14 h-[calc(100vh-4.25rem)] rounded-xl sm:rounded-2xl bg-theme-card shadow-theme-md overflow-hidden">
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
                    onSelectDetail={handleSelectFixture}
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
        onRefreshMetrics={handleRefresh}
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
