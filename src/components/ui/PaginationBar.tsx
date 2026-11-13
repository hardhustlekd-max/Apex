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
    <div className="px-3 py-2 bg-theme-card flex flex-wrap items-center justify-between gap-2 text-xs rounded-xl sm:rounded-full shadow-theme-sm">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className="text-theme-sub font-mono tabular-nums text-xs whitespace-nowrap">
          Showing{' '}
          <span className="font-extrabold text-theme-primary">
            {startIndex}–{endIndex}
          </span>{' '}
          of{' '}
          <span className="font-extrabold text-theme-main">{totalItems}</span>
        </span>
        <Select
          id="table-page-size-dropdown"
          selectSize="sm"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="font-mono tabular-nums"
          aria-label="Rows per page"
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt} / page
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-1 ml-auto font-mono tabular-nums">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
          className="min-h-[32px] min-w-[32px] p-1.5 rounded-full bg-theme-subtle text-theme-main hover:bg-theme-card-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-95 flex items-center justify-center"
          title="First Page"
          aria-label="First Page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          className="min-h-[32px] flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-full bg-theme-subtle text-theme-main hover:bg-theme-card-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs font-bold cursor-pointer active:scale-95 whitespace-nowrap"
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
                className="px-1 text-theme-sub font-bold text-xs select-none"
              >
                ...
              </span>
            ) : (
              <button
                key={`page-${item}`}
                type="button"
                onClick={() => onPageChange(item)}
                className={`min-w-[32px] min-h-[32px] flex items-center justify-center rounded-full text-xs font-black transition-all cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                  item === currentPage
                    ? 'bg-theme-primary text-theme-primary-text shadow-theme-glow'
                    : 'bg-theme-subtle text-theme-main hover:bg-theme-card-elevated'
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
          className="min-h-[32px] flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-full bg-theme-subtle text-theme-main hover:bg-theme-card-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs font-bold cursor-pointer active:scale-95 whitespace-nowrap"
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
          className="min-h-[32px] min-w-[32px] p-1.5 rounded-full bg-theme-subtle text-theme-main hover:bg-theme-card-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-95 flex items-center justify-center"
          title="Last Page"
          aria-label="Last Page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
