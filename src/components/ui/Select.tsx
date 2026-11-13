import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[];
  selectSize?: 'sm' | 'md';
  surface?: 'subtle' | 'card';
  containerClassName?: string;
}

export const Select: React.FC<SelectProps> = ({
  options,
  selectSize = 'md',
  surface = 'subtle',
  containerClassName = '',
  className = '',
  children,
  ...props
}) => {
  const sizeCls = selectSize === 'sm' ? 'min-h-[32px] px-3 py-1 text-[11px] pr-7' : 'min-h-[36px] px-3.5 py-2 text-xs pr-8';
  const bgCls = surface === 'card' ? 'bg-theme-card' : 'bg-theme-subtle';

  return (
    <div className={`relative inline-flex items-center ${containerClassName}`}>
      <select
        className={`w-full ${sizeCls} ${bgCls} rounded-full font-bold text-theme-main appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-theme-accent focus:bg-theme-card-elevated transition-colors ${className}`}
        {...props}
      >
        {options
          ? options.map((opt, idx) => (
              <option key={`${opt.value}-${idx}`} value={opt.value} className="bg-theme-card text-theme-main">
                {opt.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-theme-sub absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
    </div>
  );
};
