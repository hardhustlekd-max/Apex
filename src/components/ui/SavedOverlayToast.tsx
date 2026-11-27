import React from 'react';
import { Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export interface SavedOverlayToastProps {
  isOpen: boolean;
  message?: string;
  onDismiss?: () => void;
}

export const SavedOverlayToast: React.FC<SavedOverlayToastProps> = ({
  isOpen,
  message = 'Settings Saved',
  onDismiss,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
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
            onClick={(e) => e.stopPropagation()}
            className="bg-theme-card border border-theme-accent rounded-2xl px-7 py-6 flex flex-col items-center gap-3 text-center max-w-xs w-full"
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 460, damping: 22, delay: 0.05 }}
              className="w-11 h-11 rounded-full bg-theme-primary text-theme-primary-text flex items-center justify-center"
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
            </motion.div>
            <span className="text-base font-bold text-theme-main tracking-[-0.015em]">
              {message}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
