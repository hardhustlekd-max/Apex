import React from 'react';

export interface LoadingStateProps {
  label?: string;
  variant?: 'spinner' | 'skeleton';
  rows?: number;
  minHeight?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  label = 'Loading...',
  variant = 'spinner',
  rows = 6,
  minHeight = 'min-h-[320px]',
  className = '',
}) => {
  if (variant === 'skeleton') {
    return (
      <div className={`bg-theme-card rounded-2xl p-5 shadow-theme-sm space-y-2 animate-pulse ${className}`}>
        <div className="h-3.5 bg-theme-subtle rounded-full w-1/3 mb-3" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-7 bg-theme-subtle rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`bg-theme-card rounded-2xl sm:rounded-3xl p-10 flex-1 ${minHeight} flex flex-col items-center justify-center text-center shadow-theme-sm font-sans ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="w-7 h-7 rounded-full border-2 border-[var(--accent-default)] border-t-transparent animate-spin shrink-0 mx-auto" />
      <span className="mt-3 text-xs text-theme-sub font-bold">{label}</span>
    </div>
  );
};
