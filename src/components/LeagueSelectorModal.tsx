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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-3.5 bg-black/70 backdrop-blur-xl animate-in fade-in duration-150 font-sans">
      <div className="bg-white dark:bg-[#121216] text-slate-950 dark:text-neutral-100 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-[#CCFF00] text-slate-950 font-black">
              <Globe className="w-4.5 h-4.5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-slate-950 dark:text-white">Global Leagues Directory</h3>
              <p className="text-xs text-slate-500 dark:text-neutral-400 font-semibold">Select from professional football leagues worldwide</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] w-9 h-9 rounded-full bg-slate-100 hover:bg-[#CCFF00] hover:text-slate-950 dark:bg-[#18181D] dark:hover:bg-[#CCFF00] text-slate-700 dark:text-neutral-300 dark:hover:text-slate-950 transition-all cursor-pointer flex items-center justify-center active:scale-95 shrink-0"
            aria-label="Close league selector"
          >
            <X className="w-4.5 h-4.5 stroke-[2.5]" />
          </button>
        </div>

        {/* Search Input Box */}
        <div className="px-4 sm:px-6 pt-1 pb-2 shrink-0">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 dark:text-neutral-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by league name or country..."
              className="w-full bg-slate-100 dark:bg-[#18181D] rounded-full pl-10 pr-4 py-2.5 text-xs sm:text-sm font-extrabold text-slate-950 dark:text-white placeholder:text-slate-400 outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Leagues List */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 space-y-2">
          <div
            onClick={() => {
              onSelectLeague('ALL');
              onClose();
            }}
            className={`flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer transition-all ${
              selectedLeague === 'ALL'
                ? 'bg-slate-200 dark:bg-[#222228] font-black text-slate-950 dark:text-white shadow-xs'
                : 'bg-slate-50 dark:bg-[#18181D] hover:bg-slate-100 dark:hover:bg-[#1e1e24] text-slate-800 dark:text-neutral-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-[#CCFF00] shrink-0" />
              <div>
                <div className="text-xs sm:text-sm font-extrabold">All Leagues Worldwide</div>
                <div className="text-xs text-slate-500 dark:text-neutral-400">All available global matches</div>
              </div>
            </div>
            {selectedLeague === 'ALL' && <Check className="w-4 h-4 text-slate-950 dark:text-[#CCFF00] stroke-[3]" />}
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
                className={`flex items-center justify-between px-4 py-2.5 rounded-full cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-slate-200 dark:bg-[#222228] font-black text-slate-950 dark:text-white shadow-xs'
                    : 'bg-slate-50 dark:bg-[#18181D] hover:bg-slate-100 dark:hover:bg-[#1e1e24] text-slate-800 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-[#CCFF00]' : 'bg-slate-300 dark:bg-slate-700'}`} />
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold truncate">{league.name}</div>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">{league.country || 'International'}</div>
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-[#CCFF00] shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
