import React, { useEffect, useRef } from 'react';
import { Filter, X, Search } from 'lucide-react';

interface FixturesFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLeague: string;
  onSelectLeague: (league: string) => void;
  dateFilter: string;
  setDateFilter: (d: string) => void;
  marketChoiceFilter: string;
  setMarketChoiceFilter: (m: string) => void;
  searchQuery: string;
  setSearchQuery: (s: string) => void;
  viewMode?: string;
  sortBy?: string;
  onSelectSortBy?: (s: string) => void;
  setIsLeagueModalOpen: (b: boolean) => void;
  onResetFilters?: () => void;
  activeFilterCount?: number;
  leagueOptions: { code: string; name: string }[];
  dateOptions: { key: string; label: string }[];
  marketOptions: { key: string; label: string }[];
  sortOptions: { key: string; label: string }[];
}

export const FixturesFilterModal: React.FC<FixturesFilterModalProps> = ({
  isOpen,
  onClose,
  selectedLeague,
  onSelectLeague,
  dateFilter,
  setDateFilter,
  marketChoiceFilter,
  setMarketChoiceFilter,
  searchQuery,
  setSearchQuery,
  viewMode,
  sortBy,
  onSelectSortBy,
  setIsLeagueModalOpen,
  onResetFilters,
  activeFilterCount = 0,
  leagueOptions,
  dateOptions,
  marketOptions,
  sortOptions,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-3.5 bg-black/75 backdrop-blur-xl animate-in fade-in duration-150 font-sans">
      <div
        ref={modalRef}
        className="bg-white dark:bg-[#121212] text-slate-900 dark:text-slate-100 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-100"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-slate-100 dark:bg-[#1E1E1E] text-slate-700 dark:text-slate-200">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wide">Match Filters</span>
              {activeFilterCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-xs font-black font-mono">
                  {activeFilterCount} active
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {activeFilterCount > 0 && onResetFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="text-xs font-bold text-rose-500 hover:text-rose-600 hover:underline cursor-pointer"
              >
                Reset All
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-7.5 h-7.5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-[#1E1E1E] dark:hover:bg-white/10 transition-all cursor-pointer hover:scale-105 active:scale-95"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div className="w-full relative min-w-0">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                League Filter
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsLeagueModalOpen(true);
                  onClose();
                }}
                className="text-xs font-bold text-sky-600 dark:text-[#CCFF00] hover:underline cursor-pointer"
              >
                Browse All Leagues...
              </button>
            </div>
            <select
              value={selectedLeague}
              onChange={(e) => onSelectLeague(e.target.value)}
              className="w-full bg-slate-100 dark:bg-[#1E1E1E] rounded-full px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
            >
              {leagueOptions.map((opt, idx) => (
                <option key={`${opt.code}-${idx}`} value={opt.code} className="bg-white dark:bg-[#121212] text-slate-900 dark:text-white">
                  {opt.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="relative min-w-0">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Date Range
              </label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full bg-slate-100 dark:bg-[#1E1E1E] rounded-full px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                {dateOptions.map((opt) => (
                  <option key={opt.key} value={opt.key} className="bg-white dark:bg-[#121212] text-slate-900 dark:text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative min-w-0">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Market
              </label>
              <select
                value={marketChoiceFilter}
                onChange={(e) => setMarketChoiceFilter(e.target.value)}
                className="w-full bg-slate-100 dark:bg-[#1E1E1E] rounded-full px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                {marketOptions.map((opt) => (
                  <option key={opt.key} value={opt.key} className="bg-white dark:bg-[#121212] text-slate-900 dark:text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative min-w-0">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Sort by Percentage
              </label>
              {sortBy && sortBy !== 'DEFAULT' && (
                <button
                  type="button"
                  onClick={() => onSelectSortBy?.('DEFAULT')}
                  className="text-xs font-bold text-rose-500 hover:underline cursor-pointer"
                >
                  Reset Sort
                </button>
              )}
            </div>
            <select
              id="sort-predictions-by-percentage"
              value={sortBy || 'DEFAULT'}
              onChange={(e) => onSelectSortBy?.(e.target.value)}
              className="w-full bg-slate-100 dark:bg-[#1E1E1E] rounded-full px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
            >
              {sortOptions.map((opt) => (
                <option key={opt.key} value={opt.key} className="bg-white dark:bg-[#121212] text-slate-900 dark:text-white">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Search Team</label>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Find team (e.g., Arsenal, Real Madrid)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-100 dark:bg-[#1E1E1E] rounded-full pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none font-semibold"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 pb-4 pt-2.5 flex items-center gap-1.5">
          {activeFilterCount > 0 && onResetFilters && (
            <button
              type="button"
              onClick={() => {
                onResetFilters();
              }}
              className="py-2 px-4 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#1E1E1E] dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 px-4 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-[#CCFF00] dark:hover:bg-[#b5ff00] text-white dark:text-slate-950 text-xs font-black shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Apply Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
