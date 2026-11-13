import React from 'react';

export interface StatTileProps {
  label: React.ReactNode;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'accent' | 'info' | 'warning' | 'danger';
  surface?: 'card' | 'elevated' | 'subtle';
  className?: string;
}

const TONE_MAP = {
  default: 'text-theme-main',
  accent: 'text-theme-primary',
  info: 'text-sky-600 dark:text-sky-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-rose-600 dark:text-rose-400',
};

const SURFACE_MAP = {
  card: 'bg-theme-card shadow-theme-sm',
  elevated: 'bg-theme-card-elevated',
  subtle: 'bg-theme-subtle',
};

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  subValue,
  icon,
  tone = 'accent',
  surface = 'card',
  className = '',
}) => {
  return (
    <div className={`p-3.5 sm:p-4 rounded-2xl transition-colors ${SURFACE_MAP[surface]} ${className}`}>
      <div className="flex items-center gap-1.5 text-theme-sub text-[11px] font-semibold mb-1 min-w-0">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-lg sm:text-xl font-black font-mono tabular-nums leading-tight ${TONE_MAP[tone]}`}>
        {value}
        {subValue && <span className="text-xs font-bold text-theme-sub ml-1">{subValue}</span>}
      </div>
    </div>
  );
};
