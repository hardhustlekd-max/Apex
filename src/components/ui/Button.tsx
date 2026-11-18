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
    'bg-theme-primary bg-theme-primary-hover text-theme-primary-text font-semibold border border-theme-neon shadow-theme-glow',
  secondary:
    'bg-theme-card hover:bg-theme-card-elevated text-theme-main font-medium border border-theme hover:border-theme-accent shadow-theme-sm',
  subtle:
    'bg-theme-subtle hover:bg-theme-card-elevated text-theme-main font-medium border border-theme-subdued',
  ghost:
    'bg-transparent hover:bg-theme-subtle text-theme-sub hover:text-theme-main font-medium border border-transparent',
  danger:
    'bg-theme-live hover:brightness-110 text-white font-semibold border border-rose-400/35',
  inverse:
    'bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 font-semibold border border-theme-accent shadow-theme-sm',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-[28px] min-h-[28px] px-2.5 text-xs gap-1',
  sm: 'h-[36px] min-h-[36px] px-3 text-sm gap-1.5',
  md: 'h-[40px] min-h-[40px] px-3.5 text-base gap-1.5',
  lg: 'h-[44px] min-h-[44px] px-4 text-base gap-2',
  icon: 'h-[36px] w-[36px] min-h-[36px] min-w-[36px] p-0 justify-center',
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
  const radiusCls = pill || size === 'icon' ? 'rounded-full' : 'rounded-xl';

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
