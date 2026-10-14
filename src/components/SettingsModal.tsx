import React, { useState } from 'react';
import { X, Settings, Cpu, Check, Sun, Moon, Database, FileText, RefreshCw } from 'lucide-react';
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

  const [activeProvider, setActiveProvider] = useState<EngineSettings['activeProvider']>(
    settings.activeProvider
  );
  const [rollingWindow, setRollingWindow] = useState<number>(settings.rollingMatchWindow);
  const [minEV, setMinEV] = useState<number>(settings.minEVThreshold);
  const [safeWin, setSafeWin] = useState<number>(settings.safeWinThreshold);
  const [homeAdv, setHomeAdv] = useState<number>(settings.homeAdvantageFactor);
  const [formDecay, setFormDecay] = useState<number>(settings.formDecayRate);

  const [activeTab, setActiveTab] = useState<'ENGINE' | 'PROVIDERS' | 'DATABASE'>('ENGINE');
  const [customCsvText, setCustomCsvText] = useState('');
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
      rollingMatchWindow: rollingWindow,
      minEVThreshold: minEV,
      safeWinThreshold: safeWin,
      homeAdvantageFactor: homeAdv,
      formDecayRate: formDecay,
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
              <h2 className="text-base font-extrabold text-black">Settings &amp; Preferences</h2>
              <p className="text-xs text-slate-500">Configure active data provider and engine parameters</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer shadow-xs"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Preferences Bar: Provider Selector */}
        <div className="px-5 sm:px-6 py-3 bg-zinc-50 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-600 text-xs">Appearance:</span>
            <div className="inline-flex items-center bg-zinc-200 p-1 rounded-xl shadow-inner">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-white text-black shadow-xs">
                <Sun className="w-3.5 h-3.5 text-black" />
                <span>White / Black Accent</span>
              </span>
            </div>
          </div>

          {/* Provider Selector Dropdown */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-600 text-xs">Provider:</span>
            <div className="flex items-center gap-1.5 bg-white rounded-xl px-2.5 py-1.5 border border-zinc-200 shadow-xs">
              <Cpu className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <select
                id="modal-provider-selector-dropdown"
                value={activeProvider}
                onChange={(e) => handleProviderSelect(e.target.value as any)}
                className="bg-transparent text-xs font-bold text-black focus:outline-none cursor-pointer pr-1"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id} className="bg-white text-black">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-2 px-5 sm:px-6 pt-3 text-xs border-b border-zinc-100">
          <button
            onClick={() => setActiveTab('ENGINE')}
            className={`pb-2.5 font-bold px-2.5 transition-all cursor-pointer ${
              activeTab === 'ENGINE'
                ? 'text-black border-b-2 border-black'
                : 'text-zinc-500 hover:text-black'
            }`}
          >
            Poisson Parameters
          </button>
          <button
            onClick={() => setActiveTab('PROVIDERS')}
            className={`pb-2.5 font-bold px-2.5 transition-all cursor-pointer ${
              activeTab === 'PROVIDERS'
                ? 'text-black border-b-2 border-black'
                : 'text-zinc-500 hover:text-black'
            }`}
          >
            Data Providers
          </button>
          <button
            onClick={() => setActiveTab('DATABASE')}
            className={`pb-2.5 font-bold px-2.5 transition-all cursor-pointer ${
              activeTab === 'DATABASE'
                ? 'text-black border-b-2 border-black'
                : 'text-zinc-500 hover:text-black'
            }`}
          >
            SQLite &amp; CSV Ingestion
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          {activeTab === 'ENGINE' && (
            <div className="space-y-3.5">
              {/* Rolling Match Window */}
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-black">
                  <span>Rolling Match Window for Team Form:</span>
                  <span className="font-mono text-black font-bold bg-white px-2.5 py-0.5 rounded-lg border border-zinc-200 shadow-xs">
                    {rollingWindow} Matches
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={30}
                  step={1}
                  value={rollingWindow}
                  onChange={(e) => setRollingWindow(parseInt(e.target.value, 10))}
                  className="w-full accent-black bg-zinc-200 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                <p className="text-[11px] text-zinc-500">
                  Adjust whether team attack and defense metrics are calculated on the last 10, 15, or 20 matches.
                </p>
              </div>

              {/* Minimum EV Threshold */}
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-black">
                  <span>Positive Expected Value (+EV) Threshold:</span>
                  <span className="font-mono text-black font-bold bg-white px-2.5 py-0.5 rounded-lg border border-zinc-200 shadow-xs">
                    {minEV.toFixed(2)}x ({(minEV * 100 - 100).toFixed(0)}% Edge)
                  </span>
                </div>
                <input
                  type="range"
                  min={1.02}
                  max={1.25}
                  step={0.01}
                  value={minEV}
                  onChange={(e) => setMinEV(parseFloat(e.target.value))}
                  className="w-full accent-black bg-zinc-200 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                <p className="text-[11px] text-zinc-500">
                  Matches where model probability multiplied by decimal odds exceeds this threshold are marked as value selections.
                </p>
              </div>

              {/* Home Advantage & Form Decay Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-zinc-800">
                    <span>Home Advantage Factor:</span>
                    <span className="font-mono font-bold text-black">{homeAdv.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={1.00}
                    max={1.30}
                    step={0.02}
                    value={homeAdv}
                    onChange={(e) => setHomeAdv(parseFloat(e.target.value))}
                    className="w-full accent-black bg-zinc-200 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-zinc-800">
                    <span>Form Decay Factor:</span>
                    <span className="font-mono font-bold text-black">{formDecay.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.80}
                    max={1.00}
                    step={0.01}
                    value={formDecay}
                    onChange={(e) => setFormDecay(parseFloat(e.target.value))}
                    className="w-full accent-black bg-zinc-200 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'PROVIDERS' && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-600 mb-2">
                Select active prediction provider and data source engine:
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
                          <span className="text-[10px] font-mono px-2 py-0.2 rounded-lg bg-zinc-200 text-zinc-800">
                            v{p.version}
                          </span>
                          <span className="text-xs font-mono text-zinc-600 font-semibold">{p.latencyMs}ms</span>
                        </div>
                        <p className="text-xs text-zinc-500">{p.description}</p>
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
          )}

          {activeTab === 'DATABASE' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 shadow-xs space-y-3">
                <div>
                  <h4 className="text-sm font-bold text-black">Re-Seed from Football-Data CSV</h4>
                  <p className="text-xs text-zinc-500">Restore default historical leagues and fixture dataset.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onReSeedDatabase(undefined, true)}
                    disabled={isSeeding}
                    className="px-4 py-2 rounded-xl bg-black hover:bg-zinc-800 text-white text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : ''}`} />
                    <span>{isSeeding ? 'Seeding Database...' : 'Reset & Re-Seed SQLite'}</span>
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 shadow-xs space-y-2">
                <div>
                  <h4 className="text-sm font-bold text-black">Custom CSV Ingestion</h4>
                  <p className="text-xs text-zinc-500">Paste custom CSV data (Date,HomeTeam,AwayTeam,FTHAG,FTAG) to ingest.</p>
                </div>
                <textarea
                  rows={4}
                  value={customCsvText}
                  onChange={(e) => setCustomCsvText(e.target.value)}
                  placeholder="Date,HomeTeam,AwayTeam,FTHG,FTAG&#10;2026-10-15,Arsenal,Chelsea,2,1"
                  className="w-full bg-white border border-zinc-200 rounded-xl p-3 font-mono text-[11px] text-black placeholder:text-zinc-400 focus:outline-none shadow-xs"
                />
                <button
                  onClick={() => {
                    if (!customCsvText.trim()) return;
                    onReSeedDatabase(customCsvText, false);
                    setCustomCsvText('');
                  }}
                  disabled={isSeeding || !customCsvText.trim()}
                  className="px-4 py-2 rounded-xl bg-black hover:bg-zinc-800 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  Ingest Custom CSV Data
                </button>
              </div>
            </div>
          )}

          {/* Footer Save Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-zinc-100">
            <button
              onClick={onSyncData}
              disabled={isSyncingData}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-black font-bold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Sync Live Data from Flashscore"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingData ? 'animate-spin' : ''}`} />
              <span>{isSyncingData ? 'Syncing...' : 'Sync Live Data'}</span>
            </button>
            
            <div className="flex items-center gap-2">
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
                Apply Parameters
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
