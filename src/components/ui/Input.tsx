import React from 'react';
import { X } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  onClear?: () => void;
  inputSize?: 'sm' | 'md';
  surface?: 'subtle' | 'card';
  containerClassName?: string;
}

export const Input: React.FC<InputProps> = ({
  leftIcon,
  onClear,
  inputSize = 'md',
  surface = 'subtle',
  containerClassName = '',
  className = '',
  value,
  ...props
}) => {
  const heightCls = inputSize === 'sm' ? 'h-8 py-1 text-[11px]' : 'h-10 py-2 text-xs';
  const bgCls = surface === 'card' ? 'bg-theme-card' : 'bg-theme-subtle';
  const padLeft = leftIcon ? 'pl-9' : 'pl-3.5';
  const padRight = onClear && value ? 'pr-8' : 'pr-3.5';

  return (
    <div className={`relative w-full ${containerClassName}`}>
      {leftIcon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-sub pointer-events-none flex items-center justify-center shrink-0">
          {leftIcon}
        </span>
      )}
      <input
        value={value}
        className={`w-full ${heightCls} ${bgCls} rounded-full ${padLeft} ${padRight} text-theme-main placeholder:text-theme-sub font-semibold focus:outline-none focus:ring-2 focus:ring-theme-accent focus:bg-theme-card-elevated transition-colors ${className}`}
        {...props}
      />
      {onClear && value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-sub hover:text-theme-main p-1 rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
          aria-label="Clear input"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
