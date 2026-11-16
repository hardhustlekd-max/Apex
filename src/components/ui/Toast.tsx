import React from 'react';
import { CheckCircle2, Info, AlertCircle } from 'lucide-react';

export interface ToastProps {
  message: string | null;
  type?: 'success' | 'info' | 'danger';
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'info' }) => {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-16 sm:bottom-5 right-3 z-[100] bg-theme-glass text-theme-main font-mono text-xs px-3.5 py-2 rounded-full shadow-theme-md flex items-center gap-2 animate-in slide-in-from-bottom-2"
    >
      {type === 'success' ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-theme-primary shrink-0" />
      ) : type === 'danger' ? (
        <AlertCircle className="w-3.5 h-3.5 text-theme-live shrink-0" />
      ) : (
        <Info className="w-3.5 h-3.5 text-theme-primary shrink-0" />
      )}
      <span className="truncate max-w-[280px] font-bold">{message}</span>
    </div>
  );
};
