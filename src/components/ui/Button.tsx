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
    primary: 'bg-[#A3FF12] hover:bg-[#92e610] text-black font-extrabold shadow-xs active:scale-95',
    secondary: 'bg-slate-100 dark:bg-[#162038] hover:bg-slate-200 dark:hover:bg-[#1e2d4d] text-slate-700 dark:text-slate-300 shadow-xs active:scale-95',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs active:scale-95',
    ghost: 'bg-transparent hover:bg-slate-100 dark:hover:bg-[#162038] text-slate-600 dark:text-slate-400 active:scale-95',
  };

  return (
    <button
      className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
