import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  children: React.ReactNode;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  children,
  className = '',
  ...props
}) => {
  const variantStyles = {
    primary:
      'bg-theme-primary hover:bg-theme-primary-hover text-theme-primary-text font-black shadow-xs active:scale-95 focus-visible:ring-2',
    secondary:
      'bg-theme-subtle hover:bg-theme-card-elevated text-theme-main border border-theme font-bold shadow-xs active:scale-95 focus-visible:ring-2',
    danger:
      'bg-theme-live hover:opacity-90 text-white font-bold shadow-xs active:scale-95 focus-visible:ring-2',
    ghost:
      'bg-transparent hover:bg-theme-subtle text-theme-main font-bold active:scale-95 focus-visible:ring-2',
  };

  return (
    <button
      className={`min-h-[44px] px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 font-sans disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
