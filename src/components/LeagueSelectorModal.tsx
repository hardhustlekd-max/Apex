import React, { useState, useMemo } from 'react';
import { Search, X, Globe, Check } from 'lucide-react';
import { GLOBAL_LEAGUES_DATASET, GlobalLeagueReference } from '../core/globalLeaguesDataset.js';

interface LeagueSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLeague: string;
  onSelectLeague: (code: string) => void;
}

export const LeagueSelectorModal: React.FC<LeagueSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedLeague,
  onSelectLeague,
}) => {
  const [search, setSearch] = useState('');

  const filteredLeagues = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return GLOBAL_LEAGUES_DATASET;
    return GLOBAL_LEAGUES_DATASET.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.country && l.country.toLowerCase().includes(q))
    );
  }, [search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden shadow-2xl shadow-slate-900/10 dark:shadow-black/60 font-sans flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 dark:bg-[#0B0F17]/95 backdrop-blur-md px-5 sm:px-6 py-4 flex items-center justify-between z-10 shadow-xs border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-xs">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">Global Leagues Directory</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Select from professional football leagues worldwide</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shadow-xs"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="px-5 sm:px-6 py-3 bg-slate-50 dark:bg-slate-900/60 flex items-center shadow-xs border-b border-slate-100 dark:border-slate-800">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by league name or country (England, La Liga, Brazil)..."
              className="w-full bg-white dark:bg-slate-950 rounded-xl pl-9 pr-4 py-2 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none shadow-xs"
              autoFocus
            />
          </div>
        </div>

        {/* Leagues List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800/40">
          {/* All Leagues option */}
          <div
            onClick={() => {
              onSelectLeague('ALL');
              onClose();
            }}
            className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all shadow-xs ${
              selectedLeague === 'ALL'
                ? 'bg-slate-50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-300 font-bold shadow-sm'
                : 'hover:bg-slate-50 dark:hover:bg-slate-900/60 text-slate-800 dark:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
              <div>
                <div className="text-xs sm:text-sm font-bold">All Leagues Worldwide</div>
                <div className="text-[10px] text-slate-400">Global Coverage</div>
              </div>
            </div>
            {selectedLeague === 'ALL' && <Check className="w-4 h-4 text-slate-600 dark:text-slate-400" />}
          </div>

          {filteredLeagues.map((league, idx) => {
            const isSelected = selectedLeague.toUpperCase() === league.code.toUpperCase() || selectedLeague.toLowerCase() === league.name.toLowerCase();
            return (
              <div
                key={`${league.reep_id}-${idx}`}
                onClick={() => {
                  onSelectLeague(league.code);
                  onClose();
                }}
                className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all shadow-xs ${
                  isSelected
                    ? 'bg-slate-50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-300 font-bold shadow-sm'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-900/60 text-slate-800 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-mono text-[10px] font-bold text-slate-500 uppercase shrink-0 shadow-2xs">
                    {league.code.slice(0, 3)}
                  </div>
                  <div className="truncate min-w-0 flex-1">
                    <div className="text-xs sm:text-sm font-bold truncate whitespace-nowrap">{league.name}</div>
                    <div className="text-[10px] text-slate-400 truncate whitespace-nowrap">{league.country || 'Global International'}</div>
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0 ml-2" />}
              </div>
            );
          })}

          {filteredLeagues.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-xs">
              No leagues found matching &quot;{search}&quot;.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
