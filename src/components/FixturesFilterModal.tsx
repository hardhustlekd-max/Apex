import React from 'react';
import { Filter, Layers } from 'lucide-react';
import { getDateFilterDisplayLabel, resolveDateFilter } from '../core/dateUtils.js';
import {
  HISTORY_MARKET_CATEGORIES,
  HistoryMarketCategory,
  SPECIFIC_MARKET_OPTIONS_BY_CATEGORY,
  UPCOMING_MARKET_CATEGORIES,
  parseUpcomingMarketFilter,
} from '../core/marketEvaluator.js';
import { PopularMarketEntry, getTopPopularMarkets } from '../core/marketActivity.js';
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
  marketOptions?: { key: string; label: string }[];
  popularMarkets?: PopularMarketEntry[];
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
  popularMarkets,
  sortOptions,
}) => {
  const canonicalDateFilter = resolveDateFilter(dateFilter).canonicalKey;
  const hasMatchingDateOption = dateOptions.some((opt) => opt.key === canonicalDateFilter);

  const categoryOptions =
    marketOptions && marketOptions.length >= UPCOMING_MARKET_CATEGORIES.length
      ? marketOptions
      : UPCOMING_MARKET_CATEGORIES;

  const { category: parsedCategory, specificMarket: parsedSpecificMarket } =
    parseUpcomingMarketFilter(marketChoiceFilter);

  const resolvedPopularMarkets =
    popularMarkets && popularMarkets.length > 0 ? popularMarkets : getTopPopularMarkets(3);

  const selectedCategoryValue = parsedCategory === 'ALL' ? 'MOST_LIKELY' : parsedCategory;
  const selectedCategoryLabel =
    parsedCategory === 'POPULAR'
      ? 'Popular Top 3'
      : HISTORY_MARKET_CATEGORIES.find((c) => c.id === parsedCategory)?.label || 'All Markets';

  const handleCategoryChange = (nextCategoryValue: string) => {
    setMarketChoiceFilter(nextCategoryValue || 'MOST_LIKELY');
  };

  const handleSpecificMarketChange = (nextSpecificKey: string) => {
    if (!nextSpecificKey || nextSpecificKey === 'AUTO') {
      setMarketChoiceFilter(selectedCategoryValue);
    } else {
      setMarketChoiceFilter(nextSpecificKey);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-md"
      title="Filters"
      icon={<Filter className="w-4 h-4" />}
      closeLabel="Close filters"
      bodyClassName="p-3 sm:p-3.5 flex flex-col gap-2.5 overflow-y-auto overscroll-contain"
      headerActions={
        activeFilterCount > 0 && onResetFilters ? (
          <button
            type="button"
            onClick={onResetFilters}
            className="h-[30px] inline-flex items-center text-xs font-medium text-theme-danger hover:bg-rose-500/10 cursor-pointer px-2.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
          >
            Reset All
          </button>
        ) : null
      }
      footer={
        <Button variant="primary" size="md" fullWidth onClick={onClose}>
          <span>Apply Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}</span>
        </Button>
      }
    >
      {/* League Filter */}
      <div className="w-full relative min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <label
            className="text-2xs font-medium text-theme-sub uppercase tracking-[0.06em] truncate"
          >
            League Filter
          </label>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsLeagueModalOpen(true);
            onClose();
          }}
          className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-theme-subtle hover:bg-theme-card-elevated text-theme-main text-sm font-medium flex items-center justify-between transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
        >
          <span className="truncate">
            {selectedLeague === 'ALL' ? 'All Leagues & Competitions' : leagueOptions.find((l) => l.code === selectedLeague)?.name || selectedLeague}
          </span>
          <span className="text-xs font-semibold text-theme-primary px-2.5 py-1 rounded-full bg-theme-primary/15 shrink-0">
            Browse All Leagues
          </span>
        </button>
      </div>

      {/* Date Range & Market Category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="relative min-w-0">
          <label
            htmlFor="upcoming-date-filter"
            className="text-2xs font-medium text-theme-sub uppercase tracking-[0.06em] block mb-1.5"
          >
            Date Range
          </label>
          <Select
            id="upcoming-date-filter"
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
          <label
            htmlFor="upcoming-market-category-filter"
            className="text-2xs font-medium text-theme-sub uppercase tracking-[0.06em] block mb-1.5"
          >
            Market Category
          </label>
          <Select
            id="upcoming-market-category-filter"
            value={selectedCategoryValue}
            onChange={(e) => handleCategoryChange(e.target.value)}
            containerClassName="w-full"
          >
            {categoryOptions.map((opt) => (
              <option key={opt.key} value={opt.key} className="bg-theme-card text-theme-main">
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Filter by Specific Market Type (All Market Types Including Combo Markets) */}
      <div className="relative min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <label
            htmlFor="upcoming-market-type-filter"
            className="text-2xs font-medium text-theme-sub uppercase tracking-[0.06em] flex items-center gap-1"
          >
            <Layers className="w-3.5 h-3.5 text-theme-primary" />
            <span>Market Type</span>
          </label>
          {marketChoiceFilter !== 'MOST_LIKELY' && (
            <button
              type="button"
              onClick={() => setMarketChoiceFilter('MOST_LIKELY')}
              className="text-xs font-medium text-theme-danger hover:underline cursor-pointer rounded-full px-2 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            >
              Reset Market
            </button>
          )}
        </div>
        <Select
          id="upcoming-market-type-filter"
          aria-label="Filter upcoming fixtures by market type"
          value={parsedSpecificMarket}
          onChange={(e) => handleSpecificMarketChange(e.target.value)}
          containerClassName="w-full"
        >
          <option value="AUTO" className="bg-theme-card text-theme-main">
            {parsedCategory === 'ALL'
              ? 'Best Pick (All Markets)'
              : `Best Pick (${selectedCategoryLabel})`}
          </option>
          {parsedCategory === 'POPULAR' ? (
            <>
              <optgroup label="Top 3 Popular (User Activity)">
                {resolvedPopularMarkets.map((pm, idx) => (
                  <option
                    key={`pop_${pm.key}`}
                    value={pm.key}
                    className="bg-theme-card text-theme-main"
                  >
                    #{idx + 1} {pm.label}{pm.count > 0 ? ` (${pm.count})` : ''}
                  </option>
                ))}
              </optgroup>
              {HISTORY_MARKET_CATEGORIES.filter((c) => c.id !== 'ALL').map((cat) => (
                <optgroup key={cat.id} label={cat.label}>
                  {SPECIFIC_MARKET_OPTIONS_BY_CATEGORY[
                    cat.id as Exclude<HistoryMarketCategory, 'ALL'>
                  ].map((opt) => (
                    <option
                      key={opt.key}
                      value={opt.key}
                      className="bg-theme-card text-theme-main"
                    >
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </>
          ) : parsedCategory === 'ALL' ? (
            <>
              <optgroup label="Popular (Top 3 by Activity)">
                {resolvedPopularMarkets.map((pm, idx) => (
                  <option
                    key={`top_${pm.key}`}
                    value={pm.key}
                    className="bg-theme-card text-theme-main"
                  >
                    #{idx + 1} {pm.label}{pm.count > 0 ? ` (${pm.count})` : ''}
                  </option>
                ))}
              </optgroup>
              {HISTORY_MARKET_CATEGORIES.filter((c) => c.id !== 'ALL').map((cat) => (
                <optgroup key={cat.id} label={cat.label}>
                  {SPECIFIC_MARKET_OPTIONS_BY_CATEGORY[
                    cat.id as Exclude<HistoryMarketCategory, 'ALL'>
                  ].map((opt) => (
                    <option
                      key={opt.key}
                      value={opt.key}
                      className="bg-theme-card text-theme-main"
                    >
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </>
          ) : (
            SPECIFIC_MARKET_OPTIONS_BY_CATEGORY[parsedCategory].map((opt) => (
              <option
                key={opt.key}
                value={opt.key}
                className="bg-theme-card text-theme-main"
              >
                {opt.label}
              </option>
            ))
          )}
        </Select>
      </div>

      {/* Sort by Percentage */}
      <div className="relative min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <label
            htmlFor="sort-predictions-by-percentage"
            className="text-2xs font-medium text-theme-sub uppercase tracking-[0.06em] block"
          >
            Sort by Percentage
          </label>
          {sortBy && sortBy !== 'DEFAULT' && (
            <button
              type="button"
              onClick={() => onSelectSortBy?.('DEFAULT')}
              className="text-xs font-medium text-theme-danger hover:underline cursor-pointer rounded-full px-2 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
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
