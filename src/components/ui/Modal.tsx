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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-3 bg-theme-overlay backdrop-blur-xl animate-in fade-in duration-150 font-sans">
      <div
        className={`bg-theme-card border border-theme text-theme-main rounded-2xl w-full ${maxWidth} max-h-[92vh] overflow-hidden shadow-theme-md flex flex-col animate-in zoom-in-95 duration-100`}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-theme-glass border-b border-theme flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="p-2.5 rounded-xl bg-theme-primary text-theme-primary-text shrink-0 font-extrabold shadow-theme-glow">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-extrabold text-base sm:text-lg text-theme-main truncate">{title}</h3>
              {subtitle && <p className="text-xs text-theme-sub truncate">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] w-9 h-9 rounded-full bg-theme-subtle hover:bg-theme-primary hover:text-theme-primary-text text-theme-main transition-all cursor-pointer flex items-center justify-center active:scale-95 shrink-0 focus-visible:outline-none"
            aria-label="Close modal"
          >
            <X className="w-4.5 h-4.5 stroke-[2.5]" />
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
