import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'max-w-md' | 'max-w-2xl' | 'max-w-3xl' | 'max-w-4xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  maxWidth = 'max-w-2xl',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-3 bg-black/70 backdrop-blur-xl animate-in fade-in duration-150 font-sans">
      <div
        className={`bg-white dark:bg-[#121212] text-slate-900 dark:text-neutral-100 rounded-2xl w-full ${maxWidth} max-h-[92vh] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.4)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.9)] border border-slate-200/80 dark:border-neutral-800 flex flex-col animate-in zoom-in-95 duration-100`}
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 flex items-center justify-between shrink-0 border-b border-slate-100 dark:border-neutral-800/80">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div className="p-2 rounded-full bg-[#CCFF00] text-slate-950 shrink-0 font-bold">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm text-slate-950 dark:text-white truncate">{title}</h3>
              {subtitle && <p className="text-[10px] text-slate-500 dark:text-neutral-400 truncate">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7.5 h-7.5 rounded-full bg-slate-100 hover:bg-[#CCFF00] hover:text-slate-950 dark:bg-neutral-800 dark:hover:bg-[#CCFF00] text-slate-700 dark:text-neutral-300 dark:hover:text-slate-950 transition-all cursor-pointer flex items-center justify-center active:scale-95 shrink-0"
            aria-label="Close modal"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto overscroll-contain flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};
