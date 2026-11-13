import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'max-w-sm' | 'max-w-md' | 'max-w-xl' | 'max-w-2xl' | 'max-w-3xl' | 'max-w-4xl';
  mobileSheet?: boolean;
  bodyClassName?: string;
  closeLabel?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  headerActions,
  footer,
  children,
  maxWidth = 'max-w-2xl',
  mobileSheet = false,
  bodyClassName = 'p-4 sm:p-5 overflow-y-auto overscroll-contain flex-1',
  closeLabel = 'Close modal',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`fixed inset-0 z-50 flex justify-center bg-theme-overlay backdrop-blur-xl animate-in fade-in duration-150 font-sans ${
        mobileSheet ? 'items-end sm:items-center p-0 sm:p-3.5' : 'items-center p-2.5 sm:p-3.5'
      }`}
    >
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative z-10 bg-theme-card text-theme-main w-full ${maxWidth} overflow-hidden shadow-theme-md flex flex-col animate-in zoom-in-95 duration-150 ${
          mobileSheet
            ? 'rounded-t-3xl sm:rounded-2xl max-h-[92vh]'
            : 'rounded-2xl sm:rounded-3xl max-h-[92vh]'
        }`}
      >
        {mobileSheet && (
          <div className="w-10 h-1 bg-theme-dim/40 rounded-full mx-auto mt-2 mb-0.5 sm:hidden shrink-0 opacity-70" />
        )}

        {/* Header */}
        <div className="px-4 sm:px-5 py-3 bg-theme-glass flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div className="p-2 rounded-full bg-theme-primary text-theme-primary-text shrink-0 font-black shadow-theme-glow">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base text-theme-main truncate">{title}</h3>
              {subtitle && <p className="text-xs text-theme-sub truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[36px] min-w-[36px] w-8 h-8 rounded-full bg-theme-subtle hover:bg-theme-primary hover:text-theme-primary-text text-theme-sub hover:text-theme-primary-text transition-all cursor-pointer flex items-center justify-center active:scale-95 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
              aria-label={closeLabel}
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className={bodyClassName}>{children}</div>

        {/* Optional Footer */}
        {footer && (
          <div className="px-4 sm:px-5 py-3 bg-theme-card-elevated shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
