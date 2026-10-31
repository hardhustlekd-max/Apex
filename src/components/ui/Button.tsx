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
    primary: 'bg-[#CCFF00] hover:bg-[#b8e600] text-slate-950 font-black shadow-xs active:scale-95 focus-visible:ring-2 focus-visible:ring-cyan-500',
    secondary: 'bg-slate-100 dark:bg-[#18181D] hover:bg-slate-200 dark:hover:bg-[#27272A] text-slate-900 dark:text-white font-bold shadow-xs active:scale-95 focus-visible:ring-2 focus-visible:ring-cyan-500',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs active:scale-95 focus-visible:ring-2 focus-visible:ring-rose-500',
    ghost: 'bg-transparent hover:bg-slate-100 dark:hover:bg-[#18181D] text-slate-900 dark:text-neutral-200 font-bold active:scale-95 focus-visible:ring-2 focus-visible:ring-cyan-500',
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
