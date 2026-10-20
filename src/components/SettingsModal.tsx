import React, { useState } from 'react';
import { X, Settings, Cpu, Check, Sun, Database, RefreshCw, RotateCcw, HardDrive } from 'lucide-react';
import { EngineSettings, ProviderStatus } from '../core/types.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EngineSettings | null;
  providers: ProviderStatus[];
  onSaveSettings: (newSettings: Partial<EngineSettings>) => void;
  onResetDatabase?: () => void;
  isResettingDatabase?: boolean;
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
  onResetDatabase,
  isResettingDatabase,
  theme,
  onToggleTheme,
  onProviderChange,
  onSyncData,
  isSyncingData,
}) => {
  if (!isOpen || !settings) return null;

  const [activeTab, setActiveTab] = useState<'ENGINE' | 'DATA' | 'UI'>('ENGINE');
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
              <p className="text-xs text-slate-500">Configure engine, data, and UI</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer shadow-xs"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs: Engine, Data Management, UI */}
        <div className="px-5 sm:px-6 py-2.5 bg-zinc-50 border-b border-zinc-200 flex items-center gap-2 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('ENGINE')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ENGINE'
                ? 'bg-black text-white shadow-xs'
                : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Engine</span>
          </button>
          <button
            onClick={() => setActiveTab('DATA')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'DATA'
                ? 'bg-black text-white shadow-xs'
                : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Data Management</span>
          </button>
          <button
            onClick={() => setActiveTab('UI')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'UI'
                ? 'bg-black text-white shadow-xs'
                : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>UI Settings</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {activeTab === 'ENGINE' && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-600 font-medium">Select active prediction provider:</p>
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
                            v{p.version || '1.0'}
                          </span>
                          <span className="text-xs font-mono text-zinc-600 font-semibold">{p.latencyMs}ms</span>
                        </div>
                        <p className="text-xs text-zinc-500">{p.description}</p>
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-black" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'DATA' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-black">Data Synchronization</h3>
                  {isSyncingData && (
                    <div className="text-xs text-zinc-500 font-medium flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Syncing...
                    </div>
                  )}
                </div>
                
                {isSyncingData && (
                  <div className="w-full bg-zinc-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-black h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                  </div>
                )}
                
                <button
                  onClick={onSyncData}
                  disabled={isSyncingData}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-black hover:bg-zinc-800 text-white font-semibold transition-colors cursor-pointer disabled:opacity-50 text-sm"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncingData ? 'animate-spin' : ''}`} />
                  {isSyncingData ? 'Syncing...' : 'Trigger Full Data Sync'}
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-3">
                <h3 className="text-sm font-bold text-rose-900">Danger Zone</h3>
                <p className="text-xs text-rose-800">
                  Reset the entire database and all raw feeds. This action is irreversible.
                </p>
                <button
                  onClick={() => onResetDatabase?.()}
                  disabled={isResettingDatabase}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors cursor-pointer text-sm disabled:opacity-50"
                >
                  <RotateCcw className={`w-4 h-4 ${isResettingDatabase ? 'animate-spin' : ''}`} />
                  {isResettingDatabase ? 'Resetting...' : 'Reset Database & Raw Feeds'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'UI' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-black">Appearance</h3>
                  <p className="text-xs text-zinc-500">Toggle light/dark mode</p>
                </div>
                <button
                  onClick={onToggleTheme}
                  className="p-2 rounded-xl bg-white border border-zinc-200 text-black transition-colors cursor-pointer"
                >
                  {theme === 'light' ? <Sun className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}  {/* Toast Notification */}
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
