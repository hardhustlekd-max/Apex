import React, { useState, useEffect } from 'react';
import { X, Settings, Cpu, Check, Sun, Database, RefreshCw, RotateCcw, HardDrive, AlertTriangle, Server, XCircle, AlertCircle } from 'lucide-react';
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
}) => {
  const [activeTab, setActiveTab] = useState<'ENGINE' | 'DATA' | 'UI'>('ENGINE');
  const [activeProvider, setActiveProvider] = useState<EngineSettings['activeProvider']>(
    settings?.activeProvider || 'FLASHSCORE'
  );
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [tursoStatus, setTursoStatus] = useState<any>(null);
  const [isCheckingTurso, setIsCheckingTurso] = useState<boolean>(false);

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

  useEffect(() => {
    if (isOpen && activeTab === 'DATA') {
      fetchTursoStatus();
    }
  }, [isOpen, activeTab]);

  if (!isOpen || !settings) return null;

  const isOperating = Boolean(isResettingAndSyncing || isSyncingData || isResettingDatabase);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-150 font-sans">
      <div className="bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden shadow-2xl shadow-slate-900/10 dark:shadow-black/70 border border-slate-100 dark:border-slate-800/80 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 dark:bg-[#0B0F17]/95 backdrop-blur-md px-5 sm:px-6 py-4 flex items-center justify-between z-10 shadow-xs border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 shadow-xs">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Settings</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Configure engine, data, and UI</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shadow-xs"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs: Engine, Data Management, UI */}
        <div className="px-5 sm:px-6 py-2.5 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/60 flex items-center gap-2 text-xs overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('ENGINE')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ENGINE'
                ? 'bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Engine</span>
          </button>
          <button
            onClick={() => setActiveTab('DATA')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'DATA'
                ? 'bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Data Management</span>
          </button>
          <button
            onClick={() => setActiveTab('UI')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'UI'
                ? 'bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>UI Settings</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {activeTab === 'ENGINE' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Select active prediction provider:</p>
              <div className="space-y-2">
                {providers.map((p) => {
                  const isSelected = activeProvider === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleProviderSelect(p.id)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-900 dark:border-slate-500 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">{p.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-300">
                            v{p.version || '1.0'}
                          </span>
                          <span className="text-xs font-mono text-slate-600 dark:text-slate-400 font-semibold">{p.latencyMs}ms</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{p.description}</p>
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-slate-900 dark:text-white" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'DATA' && (
            <div className="space-y-4">
              {/* Live Database Metrics Overview */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Live Database & Feed Metrics
                  </h3>
                  <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    SQLite Active
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Upcoming Fixtures</span>
                    <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                      {stats?.upcomingCount !== undefined ? stats.upcomingCount : '—'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Model Predictions</span>
                    <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                      {stats?.predictionsCount !== undefined ? stats.predictionsCount : '—'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Stored Raw Feeds</span>
                    <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                      {stats?.rawFeedsCount !== undefined ? stats.rawFeedsCount : '—'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Historical Matches</span>
                    <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                      {stats?.totalMatches !== undefined ? stats.totalMatches : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Turso DBs Connection Status Section */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-sky-500" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Turso Cloud DBs Connection Status
                    </h3>
                  </div>
                  <button
                    onClick={fetchTursoStatus}
                    disabled={isCheckingTurso}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isCheckingTurso ? 'animate-spin' : ''}`} />
                    <span>Test Connection</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Football Turso DB */}
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-indigo-500" />
                        Football Turso DB
                      </span>
                      {tursoStatus?.footballDb?.status === 'CONNECTED' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          CONNECTED ({tursoStatus.footballDb.latencyMs}ms)
                        </span>
                      ) : tursoStatus?.footballDb?.status === 'DISCONNECTED' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          DISCONNECTED
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          LOCAL SQLite ONLY
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
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-sky-500" />
                        Predictions Turso DB
                      </span>
                      {tursoStatus?.predictionsDb?.status === 'CONNECTED' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          CONNECTED ({tursoStatus.predictionsDb.latencyMs}ms)
                        </span>
                      ) : tursoStatus?.predictionsDb?.status === 'DISCONNECTED' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          DISCONNECTED
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          LOCAL SQLite ONLY
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

              {/* Merged Reset Database & Trigger Full Data Sync Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                        <RotateCcw className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Reset Database, Raw Feeds & Trigger Full Sync
                      </h3>
                    </div>
                    {isOperating && (
                      <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        In Progress...
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
                    Purges all local SQLite database tables, relational statistics, cached raw Flashscore feeds, and prediction models, then immediately executes a complete end-to-end sync to fetch fresh feeds and regenerate Poisson predictions from zero.
                  </p>
                </div>

                {isOperating && (
                  <div className="space-y-2 p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <RefreshCw className="w-3 h-3 animate-spin text-rose-600 dark:text-rose-400" />
                        Purging database & raw feeds, rebuilding Poisson predictions...
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">Executing...</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-700/80 rounded-full h-2 overflow-hidden">
                      <div className="bg-gradient-to-r from-rose-600 via-amber-500 to-emerald-500 h-2 rounded-full animate-pulse w-full"></div>
                    </div>
                  </div>
                )}

                {!isOperating && !isConfirmingReset && (
                  <button
                    onClick={() => setIsConfirmingReset(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 font-bold transition-all cursor-pointer text-sm shadow-xs hover:shadow-sm"
                  >
                    <RotateCcw className="w-4 h-4 text-rose-400 dark:text-rose-600" />
                    <span>Reset Database & Trigger Full Data Sync</span>
                  </button>
                )}

                {!isOperating && isConfirmingReset && (
                  <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-rose-900 dark:text-rose-300">
                          Are you sure you want to proceed?
                        </p>
                        <p className="text-[11px] text-rose-700 dark:text-rose-400">
                          This will permanently purge all database records and raw feed cache, then re-sync all live fixtures from Flashscore.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleExecuteResetAndSync}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Confirm Reset & Full Sync</span>
                      </button>
                      <button
                        onClick={() => setIsConfirmingReset(false)}
                        className="px-3 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'UI' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Appearance</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Toggle light/dark mode</p>
                </div>
                <button
                  onClick={onToggleTheme}
                  className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 transition-colors cursor-pointer"
                >
                  {theme === 'light' ? <Sun className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}
          
          {/* Toast Notification */}
          {showSavedToast && (
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500" />
              <span>Settings saved successfully</span>
            </div>
          )}

          {/* Footer Save Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-bold shadow-sm hover:shadow-md transition-all cursor-pointer"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>

  );
};
