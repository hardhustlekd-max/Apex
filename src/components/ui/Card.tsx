import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`bg-white dark:bg-[#121216] rounded-2xl p-4 sm:p-5 shadow-xs transition-all font-sans ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
