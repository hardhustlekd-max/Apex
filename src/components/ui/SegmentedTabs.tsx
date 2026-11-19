import React from 'react';

export interface SegmentedTabItem<T extends string = string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number | string;
  buttonId?: string;
}

export interface SegmentedTabsProps<T extends string = string> {
  items: SegmentedTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'card' | 'subtle' | 'pill';
  size?: 'xs' | 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function SegmentedTabs<T extends string = string>({
  items,
  value,
  onChange,
  variant = 'subtle',
  size = 'sm',
  fullWidth = false,
  className = '',
  ariaLabel = 'Tabs',
}: SegmentedTabsProps<T>) {
  const containerBg =
    variant === 'card'
      ? 'bg-theme-card border border-theme shadow-theme-sm p-[3px] rounded-xl'
      : 'bg-theme-subtle border border-theme-subdued p-[3px] rounded-xl';

  const containerSize =
    size === 'xs'
      ? 'h-[30px] min-h-[30px]'
      : size === 'md'
      ? 'h-[38px] min-h-[38px]'
      : 'h-[34px] min-h-[34px]';

  const btnHeight =
    size === 'xs'
      ? 'h-full px-2 text-sm'
      : size === 'md'
      ? 'h-full px-2.5 sm:px-3 text-base'
      : 'h-full px-2.5 text-base';

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-0.5 overflow-x-auto no-scrollbar flex-nowrap font-sans ${containerSize} ${containerBg} ${
        fullWidth ? 'w-full' : 'shrink-0'
      } ${className}`}
    >
      {items.map((item) => {
        const isActive = value === item.id;
        return (
          <button
            key={item.id}
            id={item.buttonId}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={`${
              fullWidth ? 'flex-1 min-w-0' : 'shrink-0'
            } ${btnHeight} rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
              isActive
                ? 'bg-theme-primary text-theme-primary-text font-semibold shadow-theme-glow'
                : 'text-theme-sub hover:text-theme-main font-medium'
            }`}
          >
            {item.icon}
            <span className="whitespace-nowrap">{item.label}</span>
            {item.count !== undefined && (
              <span
                className={`h-[18px] min-w-[18px] px-1 rounded-md inline-flex items-center justify-center text-2xs leading-none tabular-nums font-semibold ${
                  isActive
                    ? 'bg-black/20 text-theme-primary-text'
                    : 'bg-theme-card text-theme-main'
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
