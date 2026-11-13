import React from 'react';

export interface ProgressBarProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md';
  trackSurface?: 'card' | 'subtle';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  size = 'md',
  trackSurface = 'subtle',
  className = '',
}) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const trackHeight = size === 'sm' ? 'h-2' : 'h-2.5';
  const trackBg = trackSurface === 'card' ? 'bg-theme-card' : 'bg-theme-subtle';

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`w-full ${trackBg} rounded-full ${trackHeight} overflow-hidden ${className}`}
    >
      <div
        className="bg-theme-primary h-full rounded-full transition-all duration-300 shadow-theme-glow"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};
