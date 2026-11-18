import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { Select } from './Select.js';

export interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  embedded?: boolean;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  pageSize,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
  embedded = false,
}) => {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => {
      if (totalPages <= 5) return true;
      if (p === 1 || p === totalPages) return true;
      return Math.abs(p - currentPage) <= 1;
    })
    .reduce<(number | string)[]>((acc, p, idx, arr) => {
      if (
        idx > 0 &&
        typeof arr[idx - 1] === 'number' &&
        (p as number) - (arr[idx - 1] as number) > 1
      ) {
        acc.push('...');
      }
      acc.push(p);
      return acc;
    }, []);

  return (
    <div
      className={
        embedded
          ? 'px-3 py-2 bg-theme-card-elevated border-t border-theme-subdued flex flex-wrap items-center justify-between gap-2 text-xs font-sans'
          : 'px-3 py-2 bg-theme-card border border-theme flex flex-wrap items-center justify-between gap-2 text-xs rounded-2xl shadow-theme-sm font-sans'
      }
    >
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className="text-theme-sub tabular-nums text-xs font-normal whitespace-nowrap">
          <span className="font-semibold text-theme-primary">
            {startIndex}–{endIndex}
          </span>{' '}
          of{' '}
          <span className="font-semibold text-theme-main">{totalItems}</span>
        </span>
        <Select
          id="table-page-size-dropdown"
          selectSize="xs"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="tabular-nums"
          aria-label="Rows per page"
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt} / page
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-0.5 ml-auto tabular-nums">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
          className="h-[30px] w-[30px] rounded-lg text-theme-sub hover:bg-theme-subtle hover:text-theme-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center"
          title="First Page"
          aria-label="First Page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          className="h-[30px] flex items-center justify-center gap-0.5 px-2 rounded-lg text-theme-sub hover:bg-theme-subtle hover:text-theme-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-medium cursor-pointer whitespace-nowrap"
          title="Previous Page"
          aria-label="Previous Page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </button>

        <div className="flex items-center gap-0.5">
          {pages.map((item, idx) =>
            typeof item === 'string' ? (
              <span
                key={`ellipsis-${idx}`}
                className="px-1 text-theme-sub font-medium text-xs select-none"
              >
                ...
              </span>
            ) : (
              <button
                key={`page-${item}`}
                type="button"
                onClick={() => onPageChange(item)}
                className={`w-[30px] h-[30px] flex items-center justify-center rounded-lg text-xs transition-all cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                  item === currentPage
                    ? 'bg-theme-primary text-theme-primary-text font-semibold shadow-theme-glow'
                    : 'text-theme-sub hover:bg-theme-subtle hover:text-theme-main font-medium'
                }`}
              >
                {item}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          className="h-[30px] flex items-center justify-center gap-0.5 px-2 rounded-lg text-theme-sub hover:bg-theme-subtle hover:text-theme-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-medium cursor-pointer whitespace-nowrap"
          title="Next Page"
          aria-label="Next Page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          className="h-[30px] w-[30px] rounded-lg text-theme-sub hover:bg-theme-subtle hover:text-theme-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center"
          title="Last Page"
          aria-label="Last Page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
