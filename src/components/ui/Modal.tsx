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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xl animate-in fade-in duration-150 font-sans">
      <div
        className={`bg-white dark:bg-[#121212] text-slate-900 dark:text-neutral-100 rounded-3xl w-full ${maxWidth} max-h-[92vh] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.4)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.9)] border border-slate-200/80 dark:border-neutral-800 flex flex-col animate-in zoom-in-95 duration-100`}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 flex items-center justify-between shrink-0 border-b border-slate-100 dark:border-neutral-800/80">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="p-2.5 rounded-full bg-[#CCFF00] text-slate-950 shrink-0 font-bold">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-extrabold text-base text-slate-950 dark:text-white truncate">{title}</h3>
              {subtitle && <p className="text-xs text-slate-500 dark:text-neutral-400 truncate">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-[#CCFF00] hover:text-slate-950 dark:bg-neutral-800 dark:hover:bg-[#CCFF00] text-slate-700 dark:text-neutral-300 dark:hover:text-slate-950 transition-all cursor-pointer flex items-center justify-center active:scale-95 shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto overscroll-contain flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};
