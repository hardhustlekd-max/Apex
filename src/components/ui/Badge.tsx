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
    default: 'bg-slate-100 dark:bg-[#18181D] text-slate-800 dark:text-neutral-200',
    success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold',
    warning: 'bg-[#CCFF00] text-slate-950 font-black',
    danger: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 font-bold',
    info: 'bg-cyan-50 dark:bg-[#09090B] text-cyan-700 dark:text-cyan-400 font-bold',
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
