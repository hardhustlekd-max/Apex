import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`bg-white dark:bg-[#121212] rounded-2xl p-4 border border-slate-200/80 dark:border-neutral-800 shadow-sm transition-all ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
