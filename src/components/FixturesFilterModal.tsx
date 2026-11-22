import React from 'react';
import { Filter } from 'lucide-react';
import { getDateFilterDisplayLabel, resolveDateFilter } from '../core/dateUtils.js';
import { Button, Modal, Select } from './ui/index.js';

interface FixturesFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLeague: string;
  onSelectLeague: (league: string) => void;
  dateFilter: string;
  setDateFilter: (d: string) => void;
  marketChoiceFilter: string;
  setMarketChoiceFilter: (m: string) => void;
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
      icon={<Filter className="w-4 h-4" />}
      closeLabel="Close filters"
      bodyClassName="p-3 sm:p-3.5 flex flex-col gap-2.5 overflow-y-auto overscroll-contain"
      headerActions={
        activeFilterCount > 0 && onResetFilters ? (
          <button
            type="button"
            onClick={onResetFilters}
            className="h-[30px] inline-flex items-center text-xs font-medium text-rose-500 hover:bg-rose-500/10 cursor-pointer px-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
          >
            Reset All
          </button>
        ) : null
      }
      footer={
        <Button variant="primary" size="md" fullWidth onClick={onClose}>
          <Filter className="w-3.5 h-3.5" />
          <span>Apply Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}</span>
        </Button>
      }
    >
      <div className="w-full relative min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-2xs font-medium text-theme-sub uppercase tracking-[0.06em] truncate">
            League Filter
          </label>
          <button
            type="button"
            onClick={() => {
              setIsLeagueModalOpen(true);
              onClose();
            }}
            className="text-xs font-medium text-theme-primary hover:underline cursor-pointer rounded-lg px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
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

      <div className="grid grid-cols-2 gap-2.5">
        <div className="relative min-w-0">
          <label className="text-2xs font-medium text-theme-sub uppercase tracking-[0.06em] block mb-1.5">
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
          <label className="text-2xs font-medium text-theme-sub uppercase tracking-[0.06em] block mb-1.5">
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
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-2xs font-medium text-theme-sub uppercase tracking-[0.06em] block">
            Sort by Percentage
          </label>
          {sortBy && sortBy !== 'DEFAULT' && (
            <button
              type="button"
              onClick={() => onSelectSortBy?.('DEFAULT')}
              className="text-xs font-medium text-rose-500 hover:underline cursor-pointer rounded-lg px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
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
    </Modal>
  );
};
