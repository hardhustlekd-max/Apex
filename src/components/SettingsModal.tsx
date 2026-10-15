import React, { useState } from 'react';
import { X, Settings, Cpu, Check, Sun, Database, RefreshCw, RotateCcw, HardDrive } from 'lucide-react';
import { EngineSettings, ProviderStatus } from '../core/types.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EngineSettings | null;
  providers: ProviderStatus[];
  onSaveSettings: (newSettings: Partial<EngineSettings>) => void;
  onReSeedDatabase: (customCsv?: string, reset?: boolean) => void;
  isSeeding: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onProviderChange?: (providerId: EngineSettings['activeProvider']) => void;
  onSyncData?: () => void;
  isSyncingData?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  providers,
  onSaveSettings,
  onReSeedDatabase,
  isSeeding,
  theme,
  onToggleTheme,
  onProviderChange,
  onSyncData,
  isSyncingData,
}) => {
  if (!isOpen || !settings) return null;

  const [activeTab, setActiveTab] = useState<'PROVIDER' | 'DATABASE'>('PROVIDER');
  const [activeProvider, setActiveProvider] = useState<EngineSettings['activeProvider']>(
    settings.activeProvider
  );
  const [showSavedToast, setShowSavedToast] = useState(false);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white text-slate-900 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 font-sans">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-md px-5 sm:px-6 py-4 flex items-center justify-between z-10 border-b border-slate-200 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-100 text-black shadow-xs">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-black">Settings</h2>
              <p className="text-xs text-slate-500">Configure data provider and database</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer shadow-xs"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs: Provider & Database */}
        <div className="px-5 sm:px-6 py-2.5 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('PROVIDER')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'PROVIDER'
                  ? 'bg-black text-white shadow-xs'
                  : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Provider</span>
            </button>
            <button
              onClick={() => setActiveTab('DATABASE')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'DATABASE'
                  ? 'bg-black text-white shadow-xs'
                  : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Database</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-500 text-xs">Theme:</span>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-black text-xs font-semibold shadow-2xs">
              <Sun className="w-3 h-3 text-amber-500" />
              <span>Light</span>
            </div>
          </div>
        </div>

        {/* Tab Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {activeTab === 'PROVIDER' ? (
            <div className="space-y-3">
              <p className="text-xs text-zinc-600 font-medium">
                Select active prediction provider:
              </p>
              <div className="space-y-2">
                {providers.map((p) => {
                  const isSelected = activeProvider === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleProviderSelect(p.id)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-zinc-50 border-black shadow-sm'
                          : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-black">{p.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-zinc-200 text-zinc-800">
                            v{p.version}
                          </span>
                          <span className="text-xs font-mono text-zinc-600 font-semibold">{p.latencyMs}ms</span>
                        </div>
                        <p className="text-xs text-zinc-500">{p.description}</p>
                        {p.features && p.features.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {p.features.map((feat, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] bg-white border border-zinc-200 text-zinc-700 px-2 py-0.5 rounded-md"
                              >
                                {feat}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0">
                        {isSelected ? (
                          <span className="p-1 rounded-full bg-black text-white flex items-center justify-center w-6 h-6 shadow-xs">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="text-[10px] bg-white border border-zinc-200 text-zinc-600 px-2 py-0.5 rounded-lg shadow-2xs">
                            Select
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-zinc-700" />
                  <span className="font-bold text-xs text-black">SQLite Storage</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 font-bold">
                    Connected
                  </span>
                </div>
                <p className="text-xs text-zinc-500">
                  Persistent local database storing fixtures, prediction snapshots, and live results.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Sync Action */}
                <div className="p-4 rounded-2xl border border-zinc-200 bg-white flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="font-bold text-xs text-black flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-zinc-700" />
                      Live Data Sync
                    </h4>
                    <p className="text-xs text-zinc-500 mt-1">
                      Fetch fresh fixture schedules and live results from the active provider.
                    </p>
                  </div>
                  <button
                    onClick={onSyncData}
                    disabled={isSyncingData}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-black font-bold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingData ? 'animate-spin' : ''}`} />
                    <span>{isSyncingData ? 'Syncing...' : 'Sync Live Data'}</span>
                  </button>
                </div>

                {/* Reset Action */}
                <div className="p-4 rounded-2xl border border-zinc-200 bg-white flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="font-bold text-xs text-black flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-zinc-700" />
                      Reset Database
                    </h4>
                    <p className="text-xs text-zinc-500 mt-1">
                      Clear cached matches and reset tables to empty state.
                    </p>
                  </div>
                  <button
                    onClick={() => onReSeedDatabase(undefined, true)}
                    disabled={isSeeding}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-black font-bold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : ''}`} />
                    <span>{isSeeding ? 'Resetting...' : 'Reset Database'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Toast Notification */}
          {showSavedToast && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Settings saved successfully</span>
            </div>
          )}

          {/* Footer Save Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-black hover:bg-zinc-800 text-white text-xs font-bold shadow-sm hover:shadow-md transition-all cursor-pointer"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
