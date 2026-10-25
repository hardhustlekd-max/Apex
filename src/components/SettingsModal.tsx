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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 dark:bg-black/85 backdrop-blur-xl animate-in fade-in duration-150 font-sans">
      <div className="bg-white dark:bg-[#101728] text-slate-900 dark:text-slate-100 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.3)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.8)] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 dark:bg-[#101728]/95 backdrop-blur-xl px-5 sm:px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-slate-100 dark:bg-[#162038] text-slate-700 dark:text-slate-300">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Settings</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Configure engine, data, and UI</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-[#162038] dark:hover:bg-[#1e2b48] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer hover:scale-105 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs: Engine, Data Management, UI */}
        <div className="px-5 sm:px-6 pb-2">
          <div className="p-1 bg-slate-100 dark:bg-[#070c14] rounded-2xl flex items-center gap-1 text-xs overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('ENGINE')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'ENGINE'
                  ? 'bg-white dark:bg-[#162038] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Engine</span>
            </button>
            <button
              onClick={() => setActiveTab('DATA')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'DATA'
                  ? 'bg-white dark:bg-[#162038] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Data Management</span>
            </button>
            <button
              onClick={() => setActiveTab('UI')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'UI'
                  ? 'bg-white dark:bg-[#162038] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>UI Settings</span>
            </button>
          </div>
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
                      className={`p-4 rounded-2xl transition-all cursor-pointer flex items-center justify-between gap-3 shadow-xs ${
                        isSelected
                          ? 'bg-slate-100 dark:bg-[#1a253c] text-slate-900 dark:text-white ring-2 ring-[#A3FF12]'
                          : 'bg-slate-50 dark:bg-[#141d33] hover:bg-slate-100 dark:hover:bg-[#162038]'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">{p.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-slate-200/70 dark:bg-[#0d1424] text-slate-800 dark:text-slate-300">
                            v{p.version || '1.0'}
                          </span>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 font-semibold">{p.latencyMs}ms</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{p.description}</p>
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-[#A3FF12] shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'DATA' && (
            <div className="space-y-4">
              {/* Live Database Metrics Overview */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#141d33] shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Live Database & Feed Metrics
                  </h3>
                  <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    SQLite Active
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div className="p-3 rounded-2xl bg-white dark:bg-[#101728] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Upcoming Fixtures</span>
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white font-mono">
                      {stats?.upcomingCount !== undefined ? stats.upcomingCount : '—'}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-white dark:bg-[#101728] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Model Predictions</span>
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white font-mono">
                      {stats?.predictionsCount !== undefined ? stats.predictionsCount : '—'}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-white dark:bg-[#101728] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Stored Raw Feeds</span>
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white font-mono">
                      {stats?.rawFeedsCount !== undefined ? stats.rawFeedsCount : '—'}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-white dark:bg-[#101728] shadow-xs">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Historical Matches</span>
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white font-mono">
                      {stats?.totalMatches !== undefined ? stats.totalMatches : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Turso DBs Connection Status Section */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#141d33] shadow-xs space-y-3">
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-white dark:bg-[#101728] hover:bg-slate-100 dark:hover:bg-[#162038] text-slate-700 dark:text-slate-300 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isCheckingTurso ? 'animate-spin' : ''}`} />
                    <span>Test Connection</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Football Turso DB */}
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-[#101728] shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-indigo-500" />
                        Football Turso DB
                      </span>
                      {tursoStatus?.footballDb?.status === 'CONNECTED' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          CONNECTED ({tursoStatus.footballDb.latencyMs}ms)
                        </span>
                      ) : tursoStatus?.footballDb?.status === 'DISCONNECTED' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          DISCONNECTED
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center gap-1">
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
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-[#101728] shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-sky-500" />
                        Predictions Turso DB
                      </span>
                      {tursoStatus?.predictionsDb?.status === 'CONNECTED' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          CONNECTED ({tursoStatus.predictionsDb.latencyMs}ms)
                        </span>
                      ) : tursoStatus?.predictionsDb?.status === 'DISCONNECTED' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          DISCONNECTED
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center gap-1">
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
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#141d33] shadow-xs space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
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
                  <div className="space-y-2 p-3.5 rounded-2xl bg-white dark:bg-[#101728] shadow-xs">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <RefreshCw className="w-3 h-3 animate-spin text-rose-600 dark:text-rose-400" />
                        Purging database & raw feeds, rebuilding Poisson predictions...
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">Executing...</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div className="bg-gradient-to-r from-rose-600 via-amber-500 to-[#A3FF12] h-2 rounded-full animate-pulse w-full"></div>
                    </div>
                  </div>
                )}

                {!isOperating && !isConfirmingReset && (
                  <button
                    onClick={() => setIsConfirmingReset(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold transition-all cursor-pointer text-sm shadow-xs hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <RotateCcw className="w-4 h-4 text-rose-400 dark:text-rose-600" />
                    <span>Reset Database & Trigger Full Data Sync</span>
                  </button>
                )}

                {!isOperating && isConfirmingReset && (
                  <div className="p-4 rounded-2xl bg-rose-500/10 space-y-3">
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
                        className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs active:scale-95"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Confirm Reset & Full Sync</span>
                      </button>
                      <button
                        onClick={() => setIsConfirmingReset(false)}
                        className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#101728] hover:bg-slate-100 dark:hover:bg-[#162038] text-slate-700 dark:text-slate-300 font-semibold text-xs shadow-xs transition-colors cursor-pointer active:scale-95"
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
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#141d33] shadow-xs flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Appearance</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Toggle light / dark mode</p>
                </div>
                <button
                  onClick={onToggleTheme}
                  className="p-3 rounded-2xl bg-white dark:bg-[#101728] text-slate-900 dark:text-slate-100 shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  {theme === 'light' ? <Sun className="w-5 h-5 text-amber-500" /> : <Settings className="w-5 h-5 text-sky-400" />}
                </button>
              </div>
            </div>
          )}
          
          {/* Toast Notification */}
          {showSavedToast && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 shadow-xs">
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Settings saved successfully</span>
            </div>
          )}

          {/* Footer Save Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-[#141d33] hover:bg-slate-200 dark:hover:bg-[#162038] text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all cursor-pointer active:scale-95"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2.5 rounded-2xl bg-[#A3FF12] hover:bg-[#92e610] text-black text-xs font-extrabold shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-95"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>

  );
};
