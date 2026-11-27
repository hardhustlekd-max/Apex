import React from 'react';
import { Check, Info, AlertCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export interface ToastProps {
  message: string | null;
  type?: 'success' | 'info' | 'danger';
  onDismiss?: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  onDismiss,
}) => {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onDismiss}
          className="fixed inset-0 z-[120] bg-black/55 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.86, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            onClick={(e) => {
              e.stopPropagation();
              onDismiss?.();
            }}
            className={`bg-theme-card border rounded-2xl px-7 py-6 flex flex-col items-center gap-3 text-center max-w-xs w-full shadow-theme-md ${
              type === 'danger' ? 'border-rose-500/45' : 'border-theme-accent'
            }`}
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 460, damping: 22, delay: 0.05 }}
              className={`w-11 h-11 rounded-full flex items-center justify-center ${
                type === 'success'
                  ? 'bg-theme-primary text-theme-primary-text'
                  : type === 'danger'
                  ? 'bg-rose-500/15 text-theme-danger border border-rose-500/35'
                  : 'bg-theme-primary-subtle text-theme-primary border border-theme-accent'
              }`}
            >
              {type === 'success' ? (
                <Check className="w-5 h-5 stroke-[2.5]" />
              ) : type === 'danger' ? (
                <AlertCircle className="w-5 h-5 stroke-[2.25]" />
              ) : (
                <Info className="w-5 h-5 stroke-[2.25]" />
              )}
            </motion.div>
            <span className="text-base font-bold text-theme-main tracking-[-0.015em] break-words leading-snug">
              {message}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
