import React from 'react';

export type BadgeVariant =
  | 'default'
  | 'accent'
  | 'solid'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'live';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'xs' | 'sm';
  pill?: boolean;
  className?: string;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: 'bg-theme-subtle text-theme-main font-bold',
  accent: 'bg-theme-primary-subtle text-theme-primary font-bold',
  solid: 'bg-theme-primary text-theme-primary-text font-black',
  success: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 font-bold',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold',
  danger: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 font-bold',
  info: 'bg-sky-500/12 text-sky-700 dark:text-sky-400 font-bold',
  live: 'bg-theme-live text-white font-black',
};

const SIZE_STYLES: Record<'xs' | 'sm', string> = {
  xs: 'px-2 py-0.5 text-[10px]',
  sm: 'px-2.5 py-0.5 text-[11px]',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  pill = false,
  className = '',
  ...props
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap shrink-0 tracking-wide font-mono tabular-nums ${
        pill ? 'rounded-full' : 'rounded-md'
      } ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
