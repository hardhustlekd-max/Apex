import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`bg-white dark:bg-[#0B0F17] rounded-2xl p-4 shadow-xs border border-slate-100 dark:border-slate-800/80 transition-all ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
