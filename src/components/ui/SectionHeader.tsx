import React from 'react';

export interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  icon,
  action,
  size = 'md',
  className = '',
}) => {
  const titleCls =
    size === 'sm'
      ? 'text-base font-semibold text-theme-main tracking-[-0.01em]'
      : 'text-lg font-bold text-theme-main tracking-[-0.015em]';

  return (
    <div className={`flex items-center justify-between gap-2 min-w-0 font-sans ${className}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        {icon && (
          <span className="flex items-center justify-center shrink-0 text-theme-primary">
            {icon}
          </span>
        )}
        <h2 className={`${titleCls} truncate`}>{title}</h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
