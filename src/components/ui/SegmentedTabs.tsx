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
      ? 'bg-theme-card shadow-theme-sm p-0.5 rounded-xl'
      : variant === 'pill'
      ? 'bg-theme-subtle p-1 rounded-full'
      : 'bg-theme-subtle p-1 rounded-2xl';

  const btnHeight =
    size === 'xs'
      ? 'min-h-[28px] px-2.5 py-1 text-[10.5px]'
      : size === 'md'
      ? 'min-h-[36px] px-3.5 py-1.5 text-xs'
      : 'min-h-[32px] px-3 py-1 text-xs';

  const btnRadius =
    variant === 'pill' ? 'rounded-full' : variant === 'card' ? 'rounded-lg' : 'rounded-xl';

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-1 overflow-x-auto no-scrollbar flex-nowrap ${containerBg} ${
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
              fullWidth ? 'flex-1 min-w-[70px]' : 'shrink-0'
            } ${btnHeight} ${btnRadius} font-bold transition-all duration-150 whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
              isActive
                ? 'bg-theme-primary text-theme-primary-text font-black shadow-theme-sm'
                : 'text-theme-sub hover:text-theme-main'
            }`}
          >
            {item.icon}
            <span className="whitespace-nowrap">{item.label}</span>
            {item.count !== undefined && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums font-bold ${
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
