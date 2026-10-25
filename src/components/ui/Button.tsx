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
    primary: 'bg-[#CCFF00] hover:bg-[#b8e600] text-slate-950 font-black shadow-md active:scale-95',
    secondary: 'bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 text-slate-900 dark:text-neutral-100 font-bold shadow-xs active:scale-95',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs active:scale-95',
    ghost: 'bg-transparent hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-neutral-300 font-bold active:scale-95',
  };

  return (
    <button
      className={`px-4 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
