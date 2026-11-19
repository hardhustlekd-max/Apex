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
  bodyClassName = 'p-3 sm:p-3.5 overflow-y-auto overscroll-contain flex-1',
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
        mobileSheet ? 'items-end sm:items-center p-0 sm:p-3' : 'items-center p-2.5 sm:p-3.5'
      }`}
    >
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative z-10 bg-theme-card border border-theme text-theme-main w-full ${maxWidth} overflow-hidden shadow-theme-md flex flex-col animate-in zoom-in-95 duration-150 ${
          mobileSheet
            ? 'rounded-t-2xl sm:rounded-2xl max-h-[86vh]'
            : 'rounded-2xl max-h-[86vh]'
        }`}
      >
        {mobileSheet && (
          <div className="w-8 h-1 bg-theme-dim/40 rounded-full mx-auto mt-1.5 mb-0.5 sm:hidden shrink-0 opacity-70" />
        )}

        {/* Header */}
        <div className="min-h-[38px] px-3 py-1.5 bg-theme-header-grad border-b border-theme flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <span className="text-theme-primary shrink-0 flex items-center justify-center">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h3 className="font-semibold text-lg text-theme-main truncate tracking-[-0.015em]">
                {title}
              </h3>
              {subtitle && <p className="text-xs font-normal text-theme-sub truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="w-[30px] h-[30px] rounded-full hover:bg-theme-subtle text-theme-sub hover:text-theme-main transition-colors cursor-pointer flex items-center justify-center active:scale-95 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
              aria-label={closeLabel}
            >
              <X className="w-4 h-4 stroke-[2.25]" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className={bodyClassName}>{children}</div>

        {/* Optional Footer */}
        {footer && (
          <div className="px-3 py-2 bg-theme-card-elevated border-t border-theme shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
