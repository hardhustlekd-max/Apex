import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  elevated?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  elevated = false,
  ...props
}) => {
  return (
    <div
      className={`${
        elevated ? 'bg-theme-card-elevated' : 'bg-theme-card'
      } border border-theme text-theme-main rounded-xl sm:rounded-2xl p-3.5 sm:p-4 shadow-xs transition-colors font-sans ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
