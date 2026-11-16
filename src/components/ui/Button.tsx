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
    'bg-theme-primary hover:bg-theme-primary-hover text-theme-primary-text font-black shadow-theme-glow',
  secondary:
    'bg-theme-card hover:bg-theme-subtle text-theme-main font-bold shadow-theme-sm',
  subtle:
    'bg-theme-subtle hover:bg-theme-card-elevated text-theme-main font-bold',
  ghost:
    'bg-transparent hover:bg-theme-subtle text-theme-sub hover:text-theme-main font-bold',
  danger:
    'bg-theme-live hover:opacity-90 text-white font-bold',
  inverse:
    'bg-theme-main text-theme-card hover:opacity-90 font-black',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'min-h-[32px] px-3 py-1 text-xs gap-1.5',
  sm: 'min-h-[36px] px-3.5 py-1.5 text-xs gap-1.5',
  md: 'min-h-[40px] sm:min-h-[40px] px-4 py-2 text-xs sm:text-sm gap-2',
  lg: 'min-h-[44px] px-5 py-2.5 text-xs sm:text-sm gap-2',
  icon: 'min-h-[36px] min-w-[36px] w-9 h-9 p-0 justify-center',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'subtle',
  size = 'md',
  fullWidth = false,
  pill = true,
  type = 'button',
  children,
  className = '',
  ...props
}) => {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center whitespace-nowrap shrink-0 font-sans transition-all duration-150 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${
        pill ? 'rounded-full' : 'rounded-xl'
      } ${fullWidth ? 'w-full' : ''} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
