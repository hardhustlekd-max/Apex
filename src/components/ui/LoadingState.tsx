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
  minHeight = 'min-h-[180px]',
  className = '',
}) => {
  if (variant === 'skeleton') {
    return (
      <div className={`bg-theme-card border border-theme rounded-2xl p-3 shadow-theme-sm space-y-1.5 animate-pulse font-sans ${className}`}>
        <div className="h-3 bg-theme-subtle rounded-lg w-1/3 mb-2" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-[28px] bg-theme-subtle rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`bg-theme-card border border-theme rounded-2xl p-5 flex-1 ${minHeight} flex flex-col items-center justify-center text-center shadow-theme-sm font-sans ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="w-6 h-6 rounded-full border-2 border-[var(--accent-default)] border-t-transparent animate-spin shrink-0 mx-auto" />
      <span className="mt-2.5 text-sm text-theme-sub font-medium">{label}</span>
    </div>
  );
};
