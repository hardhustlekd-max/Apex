import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  minHeight?: string;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actions,
  minHeight = 'min-h-[156px]',
  className = '',
}) => {
  return (
    <div
      className={`bg-theme-card rounded-2xl p-4 sm:p-5 flex-1 ${minHeight} flex flex-col items-center justify-center text-center space-y-2 font-sans ${className}`}
    >
      {icon && (
        <div className="text-theme-sub shrink-0 flex items-center justify-center">
          {icon}
        </div>
      )}
      <div className="max-w-md space-y-1">
        <p className="text-sm font-medium text-theme-sub">{title}</p>
        {description && <p className="text-xs font-normal text-theme-dim">{description}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
          {actions}
        </div>
      )}
    </div>
  );
};
