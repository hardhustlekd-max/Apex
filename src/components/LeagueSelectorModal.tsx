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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-black/85 backdrop-blur-xl animate-in fade-in duration-150 font-sans">
      <div className="bg-white dark:bg-[#101728] text-slate-900 dark:text-slate-100 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.3)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.8)] flex flex-col">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-slate-100 dark:bg-[#162038] text-slate-700 dark:text-slate-300">
              <Globe className="w-5 h-5 text-[#2563EB] dark:text-[#A3FF12]" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">Global Leagues Directory</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Select from professional football leagues worldwide</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-[#162038] dark:hover:bg-[#1e2b48] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer hover:scale-105 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input Box */}
        <div className="px-5 sm:px-6 pb-3 shrink-0">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by league name or country..."
              className="w-full bg-slate-100 dark:bg-[#162038] rounded-2xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#A3FF12]"
              autoFocus
            />
          </div>
        </div>

        {/* Leagues List */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 pb-4 space-y-1.5">
          <div
            onClick={() => {
              onSelectLeague('ALL');
              onClose();
            }}
            className={`flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer transition-all ${
              selectedLeague === 'ALL'
                ? 'bg-slate-100 dark:bg-[#1a253c] font-bold text-slate-900 dark:text-white shadow-xs'
                : 'hover:bg-slate-50 dark:hover:bg-[#141d33] text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
              <div>
                <div className="text-xs sm:text-sm font-bold">All Leagues Worldwide</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">All available global matches</div>
              </div>
            </div>
            {selectedLeague === 'ALL' && <Check className="w-4 h-4 text-[#A3FF12]" />}
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
                className={`flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-slate-100 dark:bg-[#1a253c] font-bold text-slate-900 dark:text-white shadow-xs'
                    : 'hover:bg-slate-50 dark:hover:bg-[#141d33] text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSelected ? 'bg-[#A3FF12]' : 'bg-slate-300 dark:bg-slate-700'}`} />
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold truncate">{league.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{league.country || 'International'}</div>
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-[#A3FF12] shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
