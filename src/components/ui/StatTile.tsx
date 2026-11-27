import React from 'react';
import { ProgressBar } from './ProgressBar.js';

export interface StatTileProps {
  label: React.ReactNode;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'accent' | 'info' | 'warning' | 'danger';
  surface?: 'card' | 'elevated' | 'subtle' | 'flat';
  progress?: number;
  className?: string;
}

const TONE_MAP = {
  default: 'text-theme-main',
  accent: 'text-theme-primary',
  info: 'text-theme-info',
  warning: 'text-theme-warning',
  danger: 'text-theme-danger',
};

const ICON_TONE_MAP = {
  default: 'text-theme-primary',
  accent: 'text-theme-primary',
  info: 'text-theme-info',
  warning: 'text-theme-warning',
  danger: 'text-theme-danger',
};

const SURFACE_MAP = {
  card: 'bg-theme-card rounded-xl',
  elevated: 'bg-theme-card-elevated rounded-xl',
  subtle: 'bg-theme-subtle/80 rounded-xl',
  flat: 'bg-transparent',
};

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  subValue,
  icon,
  tone = 'accent',
  surface = 'subtle',
  progress,
  className = '',
}) => {
  return (
    <div className={`px-2.5 py-2 transition-colors font-sans ${SURFACE_MAP[surface]} ${className}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        {icon && (
          <span className={`shrink-0 flex items-center ${ICON_TONE_MAP[tone]}`}>
            {icon}
          </span>
        )}
        <span className="text-2xs font-medium uppercase tracking-[0.06em] text-theme-sub truncate">
          {label}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5 flex-wrap mt-1">
        <span className={`text-xl font-bold tabular-nums leading-none tracking-[-0.025em] ${TONE_MAP[tone]}`}>
          {value}
        </span>
        {subValue && (
          <span className="text-xs font-normal text-theme-sub tabular-nums">
            {subValue}
          </span>
        )}
      </div>

      {progress !== undefined && (
        <div className="mt-1.5">
          <ProgressBar value={progress} size="sm" trackSurface={surface === 'subtle' ? 'card' : 'subtle'} />
        </div>
      )}
    </div>
  );
};
