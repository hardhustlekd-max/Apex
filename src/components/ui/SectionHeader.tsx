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
      ? 'text-xs font-extrabold text-theme-main tracking-tight'
      : 'text-sm sm:text-base font-extrabold text-theme-main tracking-tight';

  return (
    <div className={`flex items-center justify-between gap-2 min-w-0 ${className}`}>
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="shrink-0 text-theme-primary">{icon}</span>}
        <h2 className={`${titleCls} truncate`}>{title}</h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
