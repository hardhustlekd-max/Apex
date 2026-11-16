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
      icon={<AlertCircle className="w-4 h-4 text-rose-500 stroke-[2.5]" />}
      maxWidth="max-w-2xl"
      closeLabel="Close error log"
      bodyClassName="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1 min-h-0"
      headerActions={
        <>
          <Badge variant="danger" size="xs" pill>
            {errors.length} {errors.length === 1 ? 'Error' : 'Errors'}
          </Badge>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="w-8 h-8 rounded-full bg-theme-subtle hover:bg-theme-primary hover:text-theme-primary-text text-theme-main transition-all duration-150 cursor-pointer flex items-center justify-center active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
              title="Refresh error logs"
              aria-label="Refresh error logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-theme-primary' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyLogs}
            className="w-8 h-8 rounded-full bg-theme-subtle hover:bg-theme-primary hover:text-theme-primary-text text-theme-main transition-all duration-150 cursor-pointer flex items-center justify-center active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            title="Copy error log"
            aria-label="Copy error log"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onOpenTerminal && (
              <Button variant="subtle" size="sm" pill onClick={onOpenTerminal}>
                <Terminal className="w-3.5 h-3.5" />
                <span>Full Terminal</span>
              </Button>
            )}
            {onClearErrors && errors.length > 0 && (
              <Button variant="subtle" size="sm" pill onClick={onClearErrors}>
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Clear Logs</span>
              </Button>
            )}
          </div>
          <Button variant="primary" size="sm" pill onClick={onClose}>
            Dismiss
          </Button>
        </div>
      }
    >
      {hasDatabaseError && (
        <Card surface="subtle" padding="md" radius="2xl" className="bg-rose-500/10 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-extrabold text-rose-600 dark:text-rose-400">
            <Database className="w-4 h-4 shrink-0" />
            <span>Database / SQLite Error Detected</span>
          </div>
          <p className="text-[11px] text-theme-sub leading-relaxed">
            A database read/write or integrity issue occurred. Automatic recovery runs if a malformed SQLite disk image is detected. Review the bound error entries below for exact details.
          </p>
        </Card>
      )}

      {errors.length === 0 ? (
        <Card surface="subtle" padding="lg" radius="2xl" className="text-center text-xs text-theme-sub">
          No active error entries recorded.
        </Card>
      ) : (
        <div className="space-y-2.5 max-h-[52vh] overflow-y-auto pr-0.5 select-text">
          {errors.map((err, idx) => {
            const time = err.timestamp ? err.timestamp.slice(11, 19) : '';
            const detailsText = err.details
              ? typeof err.details === 'string'
                ? err.details
                : err.details?.stack || JSON.stringify(err.details, null, 2)
              : null;

            return (
              <Card
                key={err.id || idx}
                surface="subtle"
                padding="md"
                radius="2xl"
                className="space-y-2 border border-rose-500/20"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="danger" size="xs" pill>
                      ERROR
                    </Badge>
                    <Badge variant="default" size="xs" pill>
                      {err.category}
                    </Badge>
                    <span className="text-[11px] font-mono font-bold text-theme-main">
                      [{err.source}]
                    </span>
                  </div>
                  {time && (
                    <span className="text-[10px] font-mono tabular-nums text-theme-sub">
                      {time}
                    </span>
                  )}
                </div>

                <p className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400 break-words leading-relaxed">
                  {err.message}
                </p>

                {detailsText && (
                  <pre className="p-2.5 rounded-xl bg-theme-card text-[10px] font-mono text-theme-sub overflow-x-auto max-h-36 whitespace-pre-wrap break-words">
                    {detailsText}
                  </pre>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Modal>
  );
};
