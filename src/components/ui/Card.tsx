import React from 'react';

export type CardSurface = 'default' | 'elevated' | 'subtle' | 'interactive' | 'selected';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';
export type CardRadius = 'xl' | '2xl' | '3xl';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  surface?: CardSurface;
  elevated?: boolean;
  padding?: CardPadding;
  radius?: CardRadius;
  className?: string;
}

const SURFACE_CLASSES: Record<CardSurface, string> = {
  default: 'bg-theme-card shadow-theme-sm',
  elevated: 'bg-theme-card-elevated shadow-theme-sm',
  subtle: 'bg-theme-subtle',
  interactive:
    'bg-theme-card shadow-theme-sm hover:bg-theme-card-elevated hover:shadow-theme-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent',
  selected:
    'bg-theme-card-elevated ring-2 ring-theme-accent shadow-theme-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent',
};

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-3.5 sm:p-4',
  lg: 'p-4 sm:p-5',
};

const RADIUS_CLASSES: Record<CardRadius, string> = {
  xl: 'rounded-xl',
  '2xl': 'rounded-xl sm:rounded-2xl',
  '3xl': 'rounded-2xl sm:rounded-3xl',
};

export const Card: React.FC<CardProps> = ({
  children,
  surface,
  elevated = false,
  padding = 'md',
  radius = '2xl',
  className = '',
  ...props
}) => {
  const resolvedSurface: CardSurface = surface ?? (elevated ? 'elevated' : 'default');

  return (
    <div
      className={`text-theme-main transition-all duration-150 font-sans ${SURFACE_CLASSES[resolvedSurface]} ${PADDING_CLASSES[padding]} ${RADIUS_CLASSES[radius]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
