import React, { useState } from 'react';
import { AlertCircle, Copy, Check, RefreshCw, Terminal, Trash2, Database } from 'lucide-react';
import { TerminalLogEntry } from '../services/loggerService.js';
import { Badge, Button, Card, Modal } from './ui/index.js';

interface ErrorLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  errors: TerminalLogEntry[];
  isLoading?: boolean;
  onRefresh?: () => void | Promise<void>;
  onClearErrors?: () => void | Promise<void>;
  onOpenTerminal?: () => void;
}

export const ErrorLogModal: React.FC<ErrorLogModalProps> = ({
  isOpen,
  onClose,
  errors,
  isLoading = false,
  onRefresh,
  onClearErrors,
  onOpenTerminal,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const hasDatabaseError = errors.some(
    (e) =>
      e.category === 'DATABASE' ||
      e.message.toLowerCase().includes('malformed') ||
      e.message.toLowerCase().includes('sqlite')
  );

  const handleCopyLogs = async () => {
    try {
      const text = errors
        .map((e, idx) => {
          const ts = e.timestamp || '';
          const details = e.details
            ? `\nDetails: ${typeof e.details === 'string' ? e.details : JSON.stringify(e.details, null, 2)}`
            : '';
          return `error ${idx}: [${ts}] [${e.category}] [${e.source}] ${e.message}${details}`;
        })
        .join('\n\n');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored if clipboard permissions are restricted
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Error Log"
      icon={<AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 stroke-[2.25]" />}
      maxWidth="max-w-2xl"
      closeLabel="Close error log"
      bodyClassName="p-3 sm:p-3.5 space-y-2.5 overflow-y-auto flex-1 min-h-0"
      headerActions={
        <>
          <Badge variant="danger" size="xs">
            {errors.length} {errors.length === 1 ? 'Error' : 'Errors'}
          </Badge>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="w-[30px] h-[30px] rounded-full hover:bg-theme-subtle text-theme-sub hover:text-theme-main transition-colors cursor-pointer flex items-center justify-center active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
              title="Refresh error logs"
              aria-label="Refresh error logs"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-theme-primary' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyLogs}
            className="w-[30px] h-[30px] rounded-full hover:bg-theme-subtle text-theme-sub hover:text-theme-main transition-colors cursor-pointer flex items-center justify-center active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            title="Copy error log"
            aria-label="Copy error log"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onOpenTerminal && (
              <Button variant="secondary" size="sm" onClick={onOpenTerminal}>
                <Terminal className="w-3.5 h-3.5" />
                <span>Full Terminal</span>
              </Button>
            )}
            {onClearErrors && errors.length > 0 && (
              <Button variant="subtle" size="sm" onClick={onClearErrors}>
                <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>Clear Logs</span>
              </Button>
            )}
          </div>
          <Button variant="primary" size="sm" onClick={onClose}>
            Dismiss
          </Button>
        </div>
      }
    >
      {hasDatabaseError && (
        <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-700 dark:text-rose-400">
            <Database className="w-3.5 h-3.5 shrink-0" />
            <span>Database / SQLite Error Detected</span>
          </div>
          <p className="text-sm font-normal text-theme-sub leading-relaxed">
            A database read/write issue occurred. Automatic recovery runs if a malformed disk image is detected.
          </p>
        </div>
      )}

      {errors.length === 0 ? (
        <div className="py-8 text-center text-sm text-theme-sub">
          No active error entries recorded.
        </div>
      ) : (
        <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden divide-y divide-[var(--border-subdued)] max-h-[52vh] overflow-y-auto select-text">
          {errors.map((err, idx) => {
            const time = err.timestamp ? err.timestamp.slice(11, 19) : '';
            const detailsText = err.details
              ? typeof err.details === 'string'
                ? err.details
                : err.details?.stack || JSON.stringify(err.details, null, 2)
              : null;

            return (
              <div key={err.id || idx} className="p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap text-xs tabular-nums">
                    <Badge variant="danger" size="xs">
                      ERROR
                    </Badge>
                    <span className="font-medium text-theme-sub">{err.category}</span>
                    <span aria-hidden="true" className="text-theme-dim">·</span>
                    <span className="font-semibold text-theme-main">{err.source}</span>
                  </div>
                  {time && (
                    <span className="text-xs font-normal tabular-nums text-theme-dim">
                      {time}
                    </span>
                  )}
                </div>

                <p className="text-sm font-medium text-rose-700 dark:text-rose-400 break-words leading-relaxed">
                  {err.message}
                </p>

                {detailsText && (
                  <pre className="p-2.5 rounded-lg bg-theme-card border border-theme-subdued text-xs font-normal text-theme-sub overflow-x-auto max-h-32 whitespace-pre-wrap break-words tabular-nums">
                    {detailsText}
                  </pre>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </Modal>
  );
};
