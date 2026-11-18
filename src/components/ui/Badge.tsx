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
  default: 'bg-theme-subtle text-theme-main border border-theme-subdued font-medium',
  accent: 'bg-theme-primary-subtle text-theme-primary border border-theme-neon font-semibold',
  solid: 'bg-theme-primary text-theme-primary-text border border-theme-neon font-semibold shadow-theme-glow',
  success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 font-semibold',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/25 font-semibold',
  danger: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25 font-semibold',
  info: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/25 font-semibold',
  live: 'bg-theme-live text-white border border-rose-400/40 font-bold',
};

const SIZE_STYLES: Record<'xs' | 'sm', string> = {
  xs: 'h-[20px] px-1.5 text-2xs leading-none',
  sm: 'h-[24px] px-2 text-xs leading-none',
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
      className={`inline-flex items-center gap-1 whitespace-nowrap shrink-0 tracking-wide font-sans tabular-nums ${
        pill ? 'rounded-full' : 'rounded-lg'
      } ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
