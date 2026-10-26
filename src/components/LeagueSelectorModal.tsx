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
      <div className="bg-white dark:bg-[#121212] text-slate-950 dark:text-neutral-100 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.85)] border border-slate-200/80 dark:border-neutral-800 flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 flex items-center justify-between shrink-0 border-b border-slate-100 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-full bg-[#CCFF00] text-slate-950 font-black">
              <Globe className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-extrabold text-xs sm:text-sm text-slate-950 dark:text-white">Global Leagues Directory</h3>
              <p className="text-[10.5px] text-slate-500 dark:text-neutral-400">Select from professional football leagues worldwide</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7.5 h-7.5 rounded-full bg-slate-100 hover:bg-[#CCFF00] hover:text-slate-950 dark:bg-neutral-800 dark:hover:bg-[#CCFF00] text-slate-700 dark:text-neutral-300 dark:hover:text-slate-950 transition-all cursor-pointer flex items-center justify-center active:scale-95 shrink-0"
            aria-label="Close league selector"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Search Input Box */}
        <div className="px-4 sm:px-5 pt-2.5 pb-1.5 shrink-0">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by league name or country..."
              className="w-full bg-slate-100 dark:bg-neutral-800/80 border border-slate-200/80 dark:border-neutral-700 rounded-full pl-9 pr-3.5 py-2 text-[11px] sm:text-xs font-extrabold text-slate-950 dark:text-white placeholder:text-slate-400 outline-none focus:border-[#CCFF00]"
              autoFocus
            />
          </div>
        </div>

        {/* Leagues List */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-2 space-y-1.5">
          <div
            onClick={() => {
              onSelectLeague('ALL');
              onClose();
            }}
            className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all border ${
              selectedLeague === 'ALL'
                ? 'bg-slate-100 dark:bg-neutral-800 border-[#CCFF00] font-black text-slate-950 dark:text-white shadow-xs'
                : 'bg-white dark:bg-[#121212] border-slate-100 dark:border-neutral-800/60 hover:bg-slate-50 dark:hover:bg-neutral-800/50 text-slate-800 dark:text-neutral-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#CCFF00] shrink-0" />
              <div>
                <div className="text-[11px] sm:text-xs font-extrabold">All Leagues Worldwide</div>
                <div className="text-[9.5px] text-slate-500 dark:text-neutral-400">All available global matches</div>
              </div>
            </div>
            {selectedLeague === 'ALL' && <Check className="w-3.5 h-3.5 text-slate-950 dark:text-[#CCFF00] stroke-[3]" />}
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
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-full cursor-pointer transition-all border ${
                  isSelected
                    ? 'bg-slate-100 dark:bg-[#1E1E1E] border-[#CCFF00] font-black text-slate-950 dark:text-white shadow-xs'
                    : 'bg-white dark:bg-[#121212] border-slate-100 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-800 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-[#CCFF00]' : 'bg-slate-300 dark:bg-slate-700'}`} />
                  <div className="min-w-0">
                    <div className="text-[11px] sm:text-xs font-bold truncate">{league.name}</div>
                    <div className="text-[9.5px] font-mono text-slate-500 dark:text-slate-400 truncate">{league.country || 'International'}</div>
                  </div>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-[#CCFF00] shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
