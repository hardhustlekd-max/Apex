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
  default: 'bg-theme-subtle text-theme-main font-medium',
  accent: 'bg-theme-primary-subtle text-theme-primary font-semibold',
  solid: 'bg-theme-primary text-theme-primary-text font-semibold',
  success: 'bg-emerald-500/12 text-theme-success font-semibold',
  warning: 'bg-amber-500/12 text-theme-warning font-semibold',
  danger: 'bg-rose-500/12 text-theme-danger font-semibold',
  info: 'bg-sky-500/12 text-theme-info font-semibold',
  live: 'bg-theme-live text-white font-bold',
};

const SIZE_STYLES: Record<'xs' | 'sm', string> = {
  xs: 'h-[18px] px-1.5 text-2xs leading-none',
  sm: 'h-[21px] px-2 text-xs leading-none',
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
      className={`inline-flex items-center gap-1 whitespace-nowrap shrink-0 tracking-wide font-sans tabular-nums rounded-full ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
