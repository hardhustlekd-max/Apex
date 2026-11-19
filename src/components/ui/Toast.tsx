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
      className="fixed bottom-[56px] sm:bottom-3.5 right-3 z-[100] bg-theme-glass border border-theme-neon text-theme-main font-sans text-sm px-3 py-1.5 rounded-2xl shadow-theme-md flex items-center gap-2 animate-in slide-in-from-bottom-2"
    >
      {type === 'success' ? (
        <CheckCircle2 className="w-4 h-4 text-theme-primary shrink-0" />
      ) : type === 'danger' ? (
        <AlertCircle className="w-4 h-4 text-theme-live shrink-0" />
      ) : (
        <Info className="w-4 h-4 text-theme-primary shrink-0" />
      )}
      <span className="truncate max-w-[260px] font-medium">{message}</span>
    </div>
  );
};
