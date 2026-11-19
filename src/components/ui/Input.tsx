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
  const heightCls = inputSize === 'sm' ? 'h-[30px] min-h-[30px] text-sm' : 'h-[34px] min-h-[34px] text-base';
  const bgCls = surface === 'card' ? 'bg-theme-card border border-theme' : 'bg-theme-subtle border border-theme-subdued';
  const padLeft = leftIcon ? (inputSize === 'sm' ? 'pl-7' : 'pl-8') : 'pl-2.5';
  const padRight = onClear && value ? 'pr-7' : 'pr-2.5';

  return (
    <div className={`relative w-full font-sans ${containerClassName}`}>
      {leftIcon && (
        <span
          className={`absolute top-1/2 -translate-y-1/2 text-theme-sub pointer-events-none flex items-center justify-center shrink-0 ${
            inputSize === 'sm' ? 'left-2' : 'left-2.5'
          }`}
        >
          {leftIcon}
        </span>
      )}
      <input
        value={value}
        className={`w-full ${heightCls} ${bgCls} rounded-xl ${padLeft} ${padRight} text-theme-main placeholder:text-theme-dim font-normal focus:outline-none focus:ring-2 focus:ring-theme-accent focus:border-theme-accent focus:bg-theme-card-elevated transition-all ${className}`}
        {...props}
      />
      {onClear && value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-[20px] h-[20px] text-theme-sub hover:text-theme-main hover:bg-theme-card/70 rounded-lg cursor-pointer flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
          aria-label="Clear input"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
