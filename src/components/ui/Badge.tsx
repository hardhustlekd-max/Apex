import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  className = '',
  ...props
}) => {
  const variantStyles = {
    default: 'bg-theme-subtle border border-theme text-theme-main',
    success: 'bg-theme-primary-subtle text-theme-primary font-bold',
    warning: 'bg-theme-primary text-theme-primary-text font-black',
    danger: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 font-bold',
    info: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 font-bold',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wide font-sans tabular-nums ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
