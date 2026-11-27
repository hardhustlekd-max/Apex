import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'ghost' | 'danger' | 'inverse';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  pill?: boolean;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-theme-primary bg-theme-primary-hover text-theme-primary-text font-semibold',
  secondary:
    'bg-theme-card hover:bg-theme-card-elevated text-theme-main font-medium border border-theme-subdued hover:border-theme',
  subtle:
    'bg-theme-subtle hover:bg-theme-card-elevated text-theme-main font-medium',
  ghost:
    'bg-transparent hover:bg-theme-subtle text-theme-sub hover:text-theme-main font-medium',
  danger:
    'bg-theme-live hover:brightness-110 text-white font-semibold',
  inverse:
    'bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 font-semibold',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-[24px] min-h-[24px] px-2 text-xs gap-1',
  sm: 'h-[30px] min-h-[30px] px-2.5 text-sm gap-1.5',
  md: 'h-[34px] min-h-[34px] px-3 text-base gap-1.5',
  lg: 'h-[38px] min-h-[38px] px-3.5 text-base gap-1.5',
  icon: 'h-[30px] w-[30px] min-h-[30px] min-w-[30px] p-0 justify-center',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'subtle',
  size = 'md',
  fullWidth = false,
  pill = false,
  type = 'button',
  children,
  className = '',
  ...props
}) => {
  const radiusCls = 'rounded-full';

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center whitespace-nowrap shrink-0 font-sans transition-all duration-150 cursor-pointer active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${radiusCls} ${
        fullWidth ? 'w-full' : ''
      } ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
