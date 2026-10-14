import React from 'react';
import { Menu, RefreshCw } from 'lucide-react';
import { EngineSettings, ProviderStatus } from '../core/types.js';

interface HeaderProps {
  settings: EngineSettings | null;
  providers: ProviderStatus[];
  stats: { totalMatches: number; totalTeams: number; leagues: any[] };
  onOpenSettings: () => void;
  onOpenSeedModal: () => void;
  onSelectAccaCategory?: (cat: 'BANKER' | 'VALUE_HUNTER') => void;
  onProviderChange: (providerId: EngineSettings['activeProvider']) => void;
  isSyncing: boolean;
  onSyncData?: () => void;
  isSyncingData?: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  providers,
  stats,
  onOpenSettings,
  onOpenSeedModal,
  onSelectAccaCategory,
  onProviderChange,
  isSyncing,
  onSyncData,
  isSyncingData,
  theme,
  onToggleTheme,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 lg:px-8 py-2.5 transition-colors border-b border-zinc-200 shadow-xs">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        {/* Brand & Status */}
        <div className="flex items-center min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-base font-extrabold text-black tracking-tight truncate whitespace-nowrap">
                QEMER PREDICTIONS
              </h1>
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium truncate whitespace-nowrap">
              Predictions and Accumulators
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Menu Icon to open Settings & Preferences */}
          <button
            id="open-settings-modal-btn"
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-black transition-colors cursor-pointer shadow-xs"
            title="Menu & Settings"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};


