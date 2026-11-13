import React from 'react';
import { Filter, Search } from 'lucide-react';
import { getDateFilterDisplayLabel, resolveDateFilter } from '../core/dateUtils.js';
import { Button, Input, Modal, Select } from './ui/index.js';

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
  const canonicalDateFilter = resolveDateFilter(dateFilter).canonicalKey;
  const hasMatchingDateOption = dateOptions.some((opt) => opt.key === canonicalDateFilter);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-sm"
      title="Filters"
      icon={<Filter className="w-3.5 h-3.5" />}
      closeLabel="Close filters"
      bodyClassName="p-4 flex flex-col gap-3 overflow-y-auto overscroll-contain"
      headerActions={
        activeFilterCount > 0 && onResetFilters ? (
          <button
            type="button"
            onClick={onResetFilters}
            className="text-xs font-bold text-rose-500 hover:text-rose-600 hover:underline cursor-pointer px-1.5 py-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
          >
            Reset All
          </button>
        ) : null
      }
      footer={
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && onResetFilters && (
            <Button variant="subtle" size="sm" onClick={onResetFilters}>
              Reset
            </Button>
          )}
          <Button variant="primary" size="md" fullWidth onClick={onClose}>
            <Filter className="w-3.5 h-3.5" />
            <span>Apply Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}</span>
          </Button>
        </div>
      }
    >
      <div className="w-full relative min-w-0">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-bold text-theme-sub uppercase tracking-wider truncate">
            League Filter
          </label>
          <button
            type="button"
            onClick={() => {
              setIsLeagueModalOpen(true);
              onClose();
            }}
            className="text-xs font-bold text-theme-primary hover:underline cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
          >
            Browse All Leagues...
          </button>
        </div>
        <Select
          value={selectedLeague}
          onChange={(e) => onSelectLeague(e.target.value)}
          containerClassName="w-full"
        >
          {leagueOptions.map((opt, idx) => (
            <option key={`${opt.code}-${idx}`} value={opt.code} className="bg-theme-card text-theme-main">
              {opt.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="relative min-w-0">
          <label className="text-[11px] font-bold text-theme-sub uppercase tracking-wider block mb-1">
            Date Range
          </label>
          <Select
            value={canonicalDateFilter}
            onChange={(e) => setDateFilter(resolveDateFilter(e.target.value).canonicalKey)}
            containerClassName="w-full"
          >
            {!hasMatchingDateOption && (
              <option value={canonicalDateFilter} className="bg-theme-card text-theme-main">
                {getDateFilterDisplayLabel(canonicalDateFilter)}
              </option>
            )}
            {dateOptions.map((opt) => (
              <option key={opt.key} value={opt.key} className="bg-theme-card text-theme-main">
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="relative min-w-0">
          <label className="text-[11px] font-bold text-theme-sub uppercase tracking-wider block mb-1">
            Market
          </label>
          <Select
            value={marketChoiceFilter}
            onChange={(e) => setMarketChoiceFilter(e.target.value)}
            containerClassName="w-full"
          >
            {marketOptions.map((opt) => (
              <option key={opt.key} value={opt.key} className="bg-theme-card text-theme-main">
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="relative min-w-0">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-bold text-theme-sub uppercase tracking-wider block">
            Sort by Percentage
          </label>
          {sortBy && sortBy !== 'DEFAULT' && (
            <button
              type="button"
              onClick={() => onSelectSortBy?.('DEFAULT')}
              className="text-xs font-bold text-rose-500 hover:underline cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            >
              Reset Sort
            </button>
          )}
        </div>
        <Select
          id="sort-predictions-by-percentage"
          value={sortBy || 'DEFAULT'}
          onChange={(e) => onSelectSortBy?.(e.target.value)}
          containerClassName="w-full"
        >
          {sortOptions.map((opt) => (
            <option key={opt.key} value={opt.key} className="bg-theme-card text-theme-main">
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-theme-sub uppercase tracking-wider block">Search Team</label>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs font-bold text-theme-sub hover:text-theme-main cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            >
              Clear
            </button>
          )}
        </div>
        <Input
          type="text"
          placeholder="Find team (e.g., Arsenal, Real Madrid)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onClear={() => setSearchQuery('')}
          leftIcon={<Search className="w-3.5 h-3.5" />}
        />
      </div>
    </Modal>
  );
};
