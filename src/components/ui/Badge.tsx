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
    default: 'bg-slate-100/90 dark:bg-[#162038] text-slate-700 dark:text-slate-300',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-black',
    danger: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 font-black',
    info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 font-black',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold tracking-wide ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
