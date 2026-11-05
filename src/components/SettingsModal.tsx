import React, { useState, useEffect } from 'react';
import { X, Settings, Cpu, Check, Sun, Moon, Terminal, Database, RefreshCw, RotateCcw, HardDrive, AlertTriangle, Server, XCircle, AlertCircle, Sparkles, TrendingUp, Target } from 'lucide-react';
import { EngineSettings, ProviderStatus } from '../core/types.js';
import { EngineService } from '../services/engineService.js';

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
  onProviderChange?: (providerId: EngineSettings['activeProvider']) => void;
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
  onProviderChange,
  onOpenTerminal,
  onRefreshMetrics,
  syncProgress,
}) => {
  const [activeTab, setActiveTab] = useState<'ENGINE' | 'DATA' | 'PREDICTIONS' | 'UI'>('ENGINE');
  const [activeProvider, setActiveProvider] = useState<EngineSettings['activeProvider']>(
    settings?.activeProvider || 'FLASHSCORE'
  );
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [tursoStatus, setTursoStatus] = useState<any>(null);
  const [scraperStatus, setScraperStatus] = useState<any>(null);
  const [localStats, setLocalStats] = useState<any>(stats);
  const [isCheckingTurso, setIsCheckingTurso] = useState<boolean>(false);
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

  const fetchTursoStatus = async () => {
    setIsCheckingTurso(true);
    try {
      const data = await EngineService.getTursoStatus();
      setTursoStatus(data);
    } catch (err) {
      console.error('Error checking Turso DB status:', err);
    } finally {
      setIsCheckingTurso(false);
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
      await Promise.all([fetchTursoStatus(), fetchScraperStatus(), fetchFreshStats()]);
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
    setPredictionProgress(null);
    try {
      const res = await EngineService.updateUpcomingPredictions((job) => {
        setPredictionProgress(job);
      });
      if (res.success) {
        setPredictionResultMsg(res.message || `Updated predictions for upcoming games in database.`);
        setPredictionProgress(null);
        await Promise.all([fetchTursoStatus(), fetchScraperStatus(), fetchFreshStats()]);
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

  const isOperating = Boolean(isResettingAndSyncing || isSyncingData || isResettingDatabase);

  useEffect(() => {
    if (isOpen && (activeTab === 'DATA' || activeTab === 'PREDICTIONS')) {
      fetchTursoStatus();
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

  const handleProviderSelect = (providerId: EngineSettings['activeProvider']) => {
    setActiveProvider(providerId);
    if (onProviderChange) {
      onProviderChange(providerId);
    }
  };

  const handleSave = () => {
    onSaveSettings({
      activeProvider,
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
    });
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-black/75 backdrop-blur-xl animate-in fade-in duration-150 font-sans">
      <div className="bg-white dark:bg-[#121212] text-slate-900 dark:text-slate-100 rounded-2xl w-full max-w-xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 dark:bg-[#121212]/95 backdrop-blur-xl px-4 sm:px-5 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-slate-100 dark:bg-[#1E1E1E] text-slate-700 dark:text-slate-200">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">Settings</h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Configure engine, data, predictions, and UI</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              className="flex items-center justify-center w-7.5 h-7.5 rounded-full bg-slate-100 dark:bg-[#1E1E1E] text-slate-700 dark:text-neutral-200 hover:bg-slate-200 dark:hover:bg-white/10 transition-all cursor-pointer active:scale-95"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
            </button>

            {/* Quick Terminal Button */}
            {onOpenTerminal && (
              <button
                id="settings-open-terminal-btn"
                onClick={onOpenTerminal}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-[#1E1E1E] text-slate-800 dark:text-neutral-200 hover:bg-[#CCFF00] hover:text-slate-950 dark:hover:bg-[#CCFF00] dark:hover:text-slate-950 transition-all cursor-pointer text-[10.5px] font-black active:scale-95"
                title="Terminal Logs"
              >
                <Terminal className="w-3 h-3" />
                <span className="hidden sm:inline">Terminal</span>
              </button>
            )}

            {/* Close Modal Button */}
            <button
              onClick={onClose}
              className="w-7.5 h-7.5 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-[#1E1E1E] dark:hover:bg-white/10 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer hover:scale-105 active:scale-95 ml-0.5"
              aria-label="Close settings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Navigation Tabs: Engine, Data Management, Predictions, UI */}
        <div className="px-4 sm:px-5 pb-1.5 pt-1">
          <div className="p-1 bg-slate-100 dark:bg-[#1E1E1E] rounded-full flex items-center gap-1 text-[10.5px] overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('ENGINE')}
              className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-full font-black text-[10.5px] transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'ENGINE'
                  ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3 h-3" />
              <span>Engine</span>
            </button>
            <button
              onClick={() => setActiveTab('DATA')}
              className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-full font-black text-[10.5px] transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'DATA'
                  ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Database className="w-3 h-3" />
              <span>Data Management</span>
            </button>
            <button
              onClick={() => setActiveTab('PREDICTIONS')}
              className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-full font-black text-[10.5px] transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'PREDICTIONS'
                  ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-400" />
              <span>Predictions</span>
            </button>
            <button
              onClick={() => setActiveTab('UI')}
              className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-full font-black text-[10.5px] transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'UI'
                  ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Sun className="w-3 h-3" />
              <span>UI Settings</span>
            </button>
          </div>
        </div>

        {/* Tab Body */}
        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
          {activeTab === 'ENGINE' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Select active prediction provider:</p>
              <div className="space-y-2">
                {providers.map((p) => {
                  const isSelected = activeProvider === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleProviderSelect(p.id as any)}
                      className={`p-4 rounded-2xl transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-slate-200 dark:bg-[#252525] text-slate-900 dark:text-white shadow-xs'
                          : 'bg-slate-50 dark:bg-[#1A1A1A] hover:bg-slate-100 dark:hover:bg-[#1E1E1E]'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-slate-900 dark:text-white">{p.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200 dark:bg-[#121212] text-slate-800 dark:text-slate-300">
                            v{(p as any).version || '1.0'}
                          </span>
                          <span className="text-xs font-mono text-slate-500 dark:text-[#CCFF00] font-bold">{p.latencyMs}ms</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{p.description}</p>
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-slate-950 dark:text-[#CCFF00] shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'DATA' && (
            <div className="space-y-4">
              {/* Live Database Metrics Overview */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#1E1E1E] space-y-3 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                    Live Database & Feed Metrics
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleRefreshMetrics}
                      disabled={isRefreshingMetrics}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-bold bg-white dark:bg-[#121212] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                      title="Refresh live metrics & feed stats"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRefreshingMetrics ? 'animate-spin text-[#CCFF00]' : ''}`} />
                      <span>Refresh</span>
                    </button>
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-[#CCFF00] font-bold flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 dark:bg-[#CCFF00]/10">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-[#CCFF00] animate-pulse"></span>
                      SQLite Active
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-[#121212] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Upcoming Fixtures</span>
                    <span className="text-lg font-black text-slate-900 dark:text-[#CCFF00] font-mono">
                      {localStats?.upcomingCount !== undefined ? localStats.upcomingCount : (stats?.upcomingCount !== undefined ? stats.upcomingCount : '—')}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-[#121212] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Model Predictions</span>
                    <span className="text-lg font-black text-slate-900 dark:text-[#CCFF00] font-mono">
                      {localStats?.predictionsCount !== undefined ? localStats.predictionsCount : (stats?.predictionsCount !== undefined ? stats.predictionsCount : '—')}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-[#121212] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Stored Raw Feeds</span>
                    <span className="text-lg font-black text-slate-900 dark:text-[#CCFF00] font-mono">
                      {localStats?.rawFeedsCount !== undefined ? localStats.rawFeedsCount : (stats?.rawFeedsCount !== undefined ? stats.rawFeedsCount : '—')}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-[#121212] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Historical Matches</span>
                    <span className="text-lg font-black text-slate-900 dark:text-[#CCFF00] font-mono">
                      {localStats?.totalMatches !== undefined ? localStats.totalMatches : (stats?.totalMatches !== undefined ? stats.totalMatches : '—')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Scraper Engine & Circuit Breaker Diagnostics Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#1E1E1E] space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-[#CCFF00]" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Scraper Engine & Circuit Breaker Health
                    </h3>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black flex items-center gap-1 ${
                    scraperStatus?.circuit?.state === 'OPEN'
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      : scraperStatus?.circuit?.state === 'HALF_OPEN'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-[#CCFF00]'
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                    CIRCUIT: {scraperStatus?.circuit?.state || 'CLOSED'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                  <div className="p-3 rounded-2xl bg-white dark:bg-[#121212] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans font-medium">Circuit Failures</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">{scraperStatus?.circuit?.failureCount ?? 0}</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-white dark:bg-[#121212] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans font-medium">Cached Raw Feeds</span>
                    <span className="text-sm font-black text-slate-900 dark:text-[#CCFF00]">{scraperStatus?.rawFeedsCount ?? localStats?.rawFeedsCount ?? stats?.rawFeedsCount ?? 0}</span>
                  </div>
                </div>

                {/* Feed Mirrors & CDN Endpoint Status */}
                {scraperStatus?.mirrors && scraperStatus.mirrors.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 space-y-1.5">
                    <span className="text-[10px] uppercase font-mono font-bold text-slate-500 dark:text-slate-400 block">
                      Active Scraper Feed Mirrors & CDN Endpoints
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10.5px] font-mono">
                      {scraperStatus.mirrors.map((m: any, idx: number) => (
                        <div key={idx} className="p-2 rounded-xl bg-white dark:bg-[#121212] flex items-center justify-between gap-2 shadow-xs">
                          <span className="truncate text-slate-700 dark:text-slate-300 font-medium">{m.name}</span>
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-[#CCFF00] shrink-0">
                            {m.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Turso DBs Connection Status Section */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#1E1E1E] space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-[#CCFF00]" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Turso Cloud DBs Connection Status
                    </h3>
                  </div>
                  <button
                    onClick={fetchTursoStatus}
                    disabled={isCheckingTurso}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold bg-white dark:bg-[#121212] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isCheckingTurso ? 'animate-spin' : ''}`} />
                    <span>Test Connection</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Football Turso DB */}
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-[#121212] space-y-2 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-indigo-400" />
                        Football Turso DB
                      </span>
                      {tursoStatus?.footballDb?.status === 'CONNECTED' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-emerald-500/10 text-emerald-600 dark:text-[#CCFF00] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-[#CCFF00] animate-pulse"></span>
                          CONNECTED ({tursoStatus.footballDb.latencyMs}ms)
                        </span>
                      ) : tursoStatus?.footballDb?.status === 'DISCONNECTED' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          DISCONNECTED
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          LOCAL SQLite
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 space-y-0.5">
                      <div className="truncate">
                        Endpoint: <span className="text-slate-700 dark:text-slate-300 font-semibold">{tursoStatus?.footballDb?.url || 'Local Memory/Disk SQLite'}</span>
                      </div>
                      {tursoStatus?.footballDb?.error && (
                        <p className="text-[10px] text-rose-600 dark:text-rose-400 truncate">
                          Err: {tursoStatus.footballDb.error}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Predictions Turso DB */}
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-[#121212] space-y-2 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-sky-400" />
                        Predictions Turso DB
                      </span>
                      {tursoStatus?.predictionsDb?.status === 'CONNECTED' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-emerald-500/10 text-emerald-600 dark:text-[#CCFF00] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-[#CCFF00] animate-pulse"></span>
                          CONNECTED ({tursoStatus.predictionsDb.latencyMs}ms)
                        </span>
                      ) : tursoStatus?.predictionsDb?.status === 'DISCONNECTED' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          DISCONNECTED
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          LOCAL SQLite
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 space-y-0.5">
                      <div className="truncate">
                        Endpoint: <span className="text-slate-700 dark:text-slate-300 font-semibold">{tursoStatus?.predictionsDb?.url || 'Local Memory/Disk SQLite'}</span>
                      </div>
                      {tursoStatus?.predictionsDb?.error && (
                        <p className="text-[10px] text-rose-600 dark:text-rose-400 truncate">
                          Err: {tursoStatus.predictionsDb.error}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Full Data & H2H Sync Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#1E1E1E] space-y-4 shadow-xs">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-full bg-lime-500/10 text-lime-600 dark:text-[#CCFF00]">
                        <RefreshCw className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Full Sync (Historical Data, Upcoming Feeds & H2H)
                      </h3>
                    </div>
                    {isOperating && (
                      <span className="text-xs text-lime-600 dark:text-[#CCFF00] font-semibold flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        In Progress...
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
                    Fetches fresh Flashscore raw feeds for historical match results, upcoming fixtures, Head-to-Head (H2H) records, and live scores, recalculating Poisson prediction models without deleting existing database records.
                  </p>
                </div>

                {isOperating && (
                  <div className="space-y-2.5 p-4 rounded-2xl bg-white dark:bg-[#121212] shadow-xs">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-bold text-slate-800 dark:text-neutral-200 flex items-center gap-2 truncate">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#CCFF00] shrink-0" />
                        <span className="truncate">{syncProgress?.currentStep || 'Fetching historical archives, upcoming feeds & H2H...'}</span>
                      </span>
                      <span className="text-[11px] font-mono tabular-nums font-black text-slate-900 dark:text-white shrink-0">
                        {syncProgress?.progress ?? 50}%
                        {syncProgress?.stepIndex && syncProgress?.totalSteps ? ` (Step ${syncProgress.stepIndex}/${syncProgress.totalSteps})` : ''}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-lime-500 via-emerald-400 to-[#CCFF00] h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(5, syncProgress?.progress ?? 25))}%` }}
                      />
                    </div>
                  </div>
                )}

                {!isOperating && !isConfirmingReset && (
                  <button
                    onClick={() => setIsConfirmingReset(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 font-black transition-all cursor-pointer text-xs uppercase tracking-wide active:scale-[0.99]"
                  >
                    <RefreshCw className="w-4 h-4 text-[#CCFF00] dark:text-slate-950" />
                    <span>Trigger Full Data & H2H Sync</span>
                  </button>
                )}

                {!isOperating && isConfirmingReset && (
                  <div className="p-4 rounded-2xl bg-lime-500/10 dark:bg-[#CCFF00]/10 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <RefreshCw className="w-4 h-4 text-slate-900 dark:text-[#CCFF00] shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          Start Full Data & H2H Synchronization?
                        </p>
                        <p className="text-[11px] text-slate-700 dark:text-slate-300">
                          This will fetch the latest historical match archives, upcoming fixture feeds, H2H team records, and live score updates from Flashscore.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleExecuteResetAndSync}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-[#CCFF00] dark:hover:bg-lime-400 text-white dark:text-slate-950 font-black text-xs transition-colors cursor-pointer active:scale-95"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Confirm & Trigger Full Sync</span>
                      </button>
                      <button
                        onClick={() => setIsConfirmingReset(false)}
                        className="px-4 py-2.5 rounded-full bg-white dark:bg-[#121212] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer active:scale-95"
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
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#1E1E1E] space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Upcoming Predictions Engine</h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">5-Pillar Poisson Model & Database Persistence</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10.5px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-[#CCFF00]">
                    DB Persisted
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1 font-mono">
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-[#121212] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans font-medium">Upcoming Fixtures</span>
                    <span className="text-lg font-black text-slate-900 dark:text-[#CCFF00]">
                      {localStats?.upcomingCount ?? stats?.upcomingCount ?? '—'}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-[#121212] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans font-medium">Stored Model Predictions</span>
                    <span className="text-lg font-black text-slate-900 dark:text-[#CCFF00]">
                      {localStats?.predictionsCount ?? stats?.predictionsCount ?? '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Card: Trigger Predictions Update for Upcoming Games */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#1E1E1E] space-y-4 shadow-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-full bg-slate-900 dark:bg-[#CCFF00] text-white dark:text-slate-950 font-bold">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Recalculate Upcoming Predictions
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
                    Recalculates Poisson model predictions for <strong>upcoming games only</strong> directly from the internal database. Matches must have at least <strong>90% data completeness</strong> to be predicted; incomplete fixtures are skipped.
                  </p>
                </div>

                {/* Real-time Background Job Progress Panel */}
                {isUpdatingPredictions && (
                  <div className="space-y-2.5 p-4 rounded-2xl bg-white dark:bg-[#121212] shadow-xs border border-amber-500/20 dark:border-[#CCFF00]/20">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-bold text-slate-800 dark:text-neutral-200 flex items-center gap-2 truncate">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500 dark:text-[#CCFF00] shrink-0" />
                        <span className="truncate">{predictionProgress?.currentStep || 'Recalculating 5-Pillar Poisson predictions...'}</span>
                      </span>
                      <span className="text-[11px] font-mono tabular-nums font-black text-slate-900 dark:text-white shrink-0">
                        {predictionProgress?.progress ?? 15}%
                        {predictionProgress?.stepIndex && predictionProgress?.totalSteps ? ` (Step ${predictionProgress.stepIndex}/${predictionProgress.totalSteps})` : ''}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-amber-500 via-emerald-400 to-[#CCFF00] h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(5, predictionProgress?.progress ?? 15))}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10.5px] font-mono text-slate-500 dark:text-slate-400 pt-0.5">
                      <span>Predicted: <strong className="text-slate-900 dark:text-[#CCFF00]">{predictionProgress?.matchesCount ?? 0}</strong> / {predictionProgress?.upcomingCount ?? localStats?.upcomingCount ?? '—'}</span>
                      <span>Skipped (&lt;90% data): <strong className="text-amber-600 dark:text-amber-400">{predictionProgress?.skippedCount ?? 0}</strong></span>
                    </div>
                  </div>
                )}

                {/* Feedback Alerts */}
                {predictionResultMsg && (
                  <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-800 dark:text-[#CCFF00] text-xs font-bold flex items-center gap-2 font-mono">
                    <Check className="w-4 h-4 text-emerald-600 dark:text-[#CCFF00] shrink-0" />
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
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-[#CCFF00] dark:hover:bg-[#b5ff00] text-white dark:text-slate-950 font-black transition-all cursor-pointer text-xs uppercase tracking-wide shadow-xs active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isUpdatingPredictions ? 'animate-spin' : ''}`} />
                  <span>{isUpdatingPredictions ? 'Calculating & Updating DB...' : 'Update Predictions'}</span>
                </button>
              </div>

              {/* Calculated Market Categories Info */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#1E1E1E] space-y-2 text-xs">
                <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[10px] block font-mono">
                  Market Categories & Calculation Scope
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
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
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#1E1E1E] space-y-3 shadow-xs">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Theme & Appearance</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Choose between light and dark modes</p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => theme !== 'light' && onToggleTheme()}
                    className={`p-3.5 rounded-2xl flex items-center justify-between transition-all cursor-pointer ${
                      theme === 'light'
                        ? 'bg-white text-slate-950 shadow-md'
                        : 'bg-white/60 dark:bg-[#121212] text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-full bg-amber-100 text-amber-600">
                        <Sun className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <span className="text-xs font-bold block text-slate-900 dark:text-white">Light Mode</span>
                        <span className="text-[10px] text-slate-500">Day visual mode</span>
                      </div>
                    </div>
                    {theme === 'light' && <Check className="w-4 h-4 text-slate-950" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => theme !== 'dark' && onToggleTheme()}
                    className={`p-3.5 rounded-2xl flex items-center justify-between transition-all cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-[#18181D] text-white shadow-md'
                        : 'bg-white/60 dark:bg-[#121212] text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-full bg-[#1E1E1E] text-amber-400">
                        <Moon className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <span className="text-xs font-bold block text-slate-900 dark:text-white">Dark Mode</span>
                        <span className="text-[10px] text-slate-400">Night visual mode</span>
                      </div>
                    </div>
                    {theme === 'dark' && <Check className="w-4 h-4 text-[#CCFF00]" />}
                  </button>
                </div>
              </div>

              {/* Terminal Logs & Console Section */}
              {onOpenTerminal && (
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#1E1E1E] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-full bg-slate-900 dark:bg-[#CCFF00] text-white dark:text-slate-950 font-bold">
                        <Terminal className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">System Terminal & Logs</h3>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      View live background logs, scraper events, and Poisson engine calculations
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={onOpenTerminal}
                    className="px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#CCFF00] dark:hover:bg-[#b5ff00] dark:text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
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
            <div className="p-3 rounded-full bg-emerald-500/10 dark:bg-[#CCFF00]/10 text-emerald-800 dark:text-[#CCFF00] text-xs font-black flex items-center gap-2 shadow-xs font-mono">
              <Check className="w-4 h-4 text-emerald-600 dark:text-[#CCFF00]" />
              <span>Settings saved successfully</span>
            </div>
          )}

          {/* Footer Save Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-full bg-slate-100 dark:bg-[#1E1E1E] hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer active:scale-95"
            >
              Close
            </button>
            {/* Save Settings Action */}
            <button
              onClick={handleSave}
              className="px-6 py-2.5 rounded-full bg-slate-950 text-[#CCFF00] hover:bg-slate-900 dark:bg-[#CCFF00] dark:hover:bg-[#b5ff00] dark:text-slate-950 text-xs font-black shadow-xs transition-all cursor-pointer active:scale-95"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>

  );
};
