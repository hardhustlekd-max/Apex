import React, { useState, useEffect, useCallback } from 'react';
import PullToRefresh from 'react-simple-pull-to-refresh';
import { Header } from './components/Header.js';
import { MainTabBar } from './components/MainTabBar.js';
import { FixturesList } from './components/FixturesList.js';
import { PrebuiltAccumulators } from './components/PrebuiltAccumulators.js';
import { LeagueStandings } from './components/LeagueStandings.js';
import { PredictionHistoryView } from './components/PredictionHistoryView.js';
import { MatchDetailModal } from './components/MatchDetailModal.js';
import { SettingsModal } from './components/SettingsModal.js';
import { TerminalModal } from './components/TerminalModal.js';
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
    return 'light';
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

  // Modals
  const [selectedDetailFixture, setSelectedDetailFixture] = useState<Fixture | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [isSyncingData, setIsSyncingData] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const handleResetAndSyncData = async () => {
    try {
      setIsSyncingData(true);
      showNotification('Purging database & raw feeds, restarting sync from zero...', 'info');
      
      const currentTheme = localStorage.getItem('theme');
      localStorage.clear();
      sessionStorage.clear();
      if (currentTheme) {
        localStorage.setItem('theme', currentTheme);
      }

      const res = await EngineService.resetAndSyncDatabase();
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
    <div className="min-h-screen bg-[#f6f8fa] dark:bg-[#0d1117] text-[#1f2328] dark:text-[#f0f6fc] flex flex-col font-sans transition-colors">
      {/* Toast Notification (GitHub Primer Flash Banner) */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-[100] bg-white dark:bg-[#161b22] text-[#1f2328] dark:text-[#f0f6fc] font-medium text-xs px-3.5 py-2.5 rounded-md shadow-lg border border-[#d0d7de] dark:border-[#30363d] flex items-center gap-2 animate-in slide-in-from-bottom-2">
          <span className="w-2 h-2 rounded-full bg-[#1a7f37] dark:bg-[#3fb950] shrink-0" />
          <span className="truncate max-w-[320px]">{notification.message}</span>
        </div>
      )}

      {/* Header */}
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
      />

      {/* Main Tab Bar */}
      <MainTabBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Main Content Dashboard */}
      <PullToRefresh onRefresh={handleRefresh} pullingContent="" refreshingContent="Refreshing...">
        <main className="flex-1 max-w-[99%] sm:max-w-[98%] w-full mx-auto px-2 sm:px-3 py-4 space-y-4 flex flex-col pb-12">
        {activeTab === 'FIXTURES' && (
          <FixturesList
            fixtures={fixtures}
            liveScores={liveScores}
            isLoading={isLoadingFixtures}
            onSelectDetail={(f) => setSelectedDetailFixture(f)}
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
          />
        )}

        {activeTab === 'ACCAS' && (
          <PrebuiltAccumulators
            fixtures={fixtures}
            settings={settings}
            onSelectDetail={(f) => setSelectedDetailFixture(f)}
          />
        )}

        {activeTab === 'STANDINGS' && (
          <LeagueStandings
            selectedLeague={selectedLeague}
            onSelectLeague={setSelectedLeague}
          />
        )}
        {activeTab === 'HISTORY' && (
          <PredictionHistoryView />
        )}
      </main>
      </PullToRefresh>

      {/* Match Detail Modal (Poisson Heatmap & Radar) */}
      {selectedDetailFixture && (
        <MatchDetailModal
          fixture={selectedDetailFixture}
          onClose={() => setSelectedDetailFixture(null)}
        />
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
      />
    </div>
  );
}

