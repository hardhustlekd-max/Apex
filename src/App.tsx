import React, { useState, useEffect, useCallback } from 'react';
import PullToRefresh from 'react-simple-pull-to-refresh';
import { Header } from './components/Header.js';
import { DesktopSidebar } from './components/DesktopSidebar.js';
import { FixturesList } from './components/FixturesList.js';
import { PrebuiltAccumulators } from './components/PrebuiltAccumulators.js';
import { LeagueStandings } from './components/LeagueStandings.js';
import { PredictionHistoryView } from './components/PredictionHistoryView.js';
import { MatchDetailModal, MatchDetailView } from './components/MatchDetailModal.js';
import { SettingsModal } from './components/SettingsModal.js';
import { TerminalModal } from './components/TerminalModal.js';
import { BottomNavDock } from './components/BottomNavDock.js';
import {
  Fixture,
  EngineSettings,
  ProviderStatus,
} from './core/types.js';
import { LiveScore } from './providers/types.js';
import { EngineService } from './services/engineService.js';
import { getRelativeDateStr, getPossibleDateStrs } from './core/dateUtils.js';

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
  const [dateFilter, setDateFilter] = useState<'TODAY' | 'TOMORROW' | 'NEXT_3_DAYS' | 'THIS_WEEK' | 'CUSTOM'>('TODAY');
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
      setSyncJobProgress({ progress: 5, currentStep: 'Initializing background sync worker...' });
      showNotification('Starting background database reset & synchronization...', 'info');
      
      const currentTheme = localStorage.getItem('theme');
      localStorage.clear();
      sessionStorage.clear();
      if (currentTheme) {
        localStorage.setItem('theme', currentTheme);
      }

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
        showNotification(res.message || 'Database and raw feeds reset! Fresh predictions synchronized.', 'success');
      } else {
        showNotification(res.message || 'Failed to sync data', 'info');
      }
    } catch (err: any) {
      console.error('Error resetting and syncing:', err);
      showNotification('Error resetting database and syncing data', 'info');
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

  // Fetch initial fixtures and settings
  const fetchFixtures = useCallback(async () => {
    try {
      setIsLoadingFixtures(true);
      const data = await EngineService.getFixtures('ALL');
      setFixtures(data);
      const todayStrs = getPossibleDateStrs(0);
      const tomorrowStrs = getPossibleDateStrs(1);
      const hasTodayMatches = data.some(f => todayStrs.includes(f.matchDate) && f.status !== 'LIVE');
      const hasTomorrowMatches = data.some(f => tomorrowStrs.includes(f.matchDate) && f.status !== 'LIVE');
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
      // non-blocking
    }
  }, []);

  useEffect(() => {
    fetchSettingsAndProviders();
    fetchFixtures();
    fetchLiveScores();

    const interval = setInterval(fetchLiveScores, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectLeague = (league: string) => {
    setSelectedLeague(league);
  };

  const handleProviderChange = async (providerId: EngineSettings['activeProvider']) => {
    try {
      await EngineService.switchProvider(providerId);
      setSettings((prev) => (prev ? { ...prev, activeProvider: providerId } : null));
      showNotification(`Hot-swapped provider to ${providerId}`);
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
      fetchFixtures('ALL'),
      fetchLiveScores()
    ]);
  };

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
        onProviderChange={handleProviderChange}
        isSyncing={isLoadingFixtures}
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
          isSyncing={isLoadingFixtures || isSyncingData}
        />

        {/* Content Viewport */}
        <div className="flex-1 min-w-0 flex flex-col">
          <PullToRefresh onRefresh={handleRefresh} pullingContent="" refreshingContent="Refreshing...">
            <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 py-3.5 space-y-4 pb-20 lg:pb-8">
              {activeTab === 'FIXTURES' && (
                <div className="w-full grid grid-cols-12 gap-4 lg:gap-5 items-start">
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
                <div className="max-w-4xl mx-auto w-full">
                  <PrebuiltAccumulators
                    fixtures={fixtures}
                    settings={settings}
                    onSelectDetail={handleSelectFixture}
                  />
                </div>
              )}

              {activeTab === 'STANDINGS' && (
                <div className="max-w-5xl mx-auto w-full">
                  <LeagueStandings
                    selectedLeague={selectedLeague}
                    onSelectLeague={setSelectedLeague}
                  />
                </div>
              )}

              {activeTab === 'HISTORY' && (
                <div className="max-w-4xl mx-auto w-full">
                  <PredictionHistoryView />
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
        onProviderChange={handleProviderChange}
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

