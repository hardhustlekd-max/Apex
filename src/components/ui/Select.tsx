import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[];
  selectSize?: 'xs' | 'sm' | 'md';
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
  const sizeCls =
    selectSize === 'xs'
      ? 'h-[26px] min-h-[26px] px-2 text-xs pr-6'
      : selectSize === 'sm'
      ? 'h-[30px] min-h-[30px] px-2.5 text-sm pr-7'
      : 'h-[34px] min-h-[34px] px-3 text-base pr-7';
  const bgCls =
    surface === 'card'
      ? 'bg-theme-card border border-theme'
      : 'bg-theme-subtle border border-theme-subdued';

  return (
    <div className={`relative inline-flex items-center font-sans ${containerClassName}`}>
      <select
        className={`w-full ${sizeCls} ${bgCls} rounded-xl font-medium text-theme-main appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-theme-accent focus:border-theme-accent focus:bg-theme-card-elevated transition-all ${className}`}
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
