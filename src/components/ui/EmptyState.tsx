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
  minHeight = 'min-h-[320px]',
  className = '',
}) => {
  return (
    <div
      className={`bg-theme-card rounded-2xl sm:rounded-3xl p-8 sm:p-10 flex-1 ${minHeight} flex flex-col items-center justify-center text-center space-y-4 shadow-theme-sm font-sans ${className}`}
    >
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-theme-primary-subtle flex items-center justify-center text-theme-primary shrink-0">
          {icon}
        </div>
      )}
      <div className="max-w-md space-y-1">
        <h3 className="text-sm font-extrabold text-theme-main">{title}</h3>
        {description && <p className="text-xs text-theme-sub">{description}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {actions}
        </div>
      )}
    </div>
  );
};
