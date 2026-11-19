import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Terminal, RefreshCw, Trash2, Search, AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { TerminalLogEntry } from '../services/loggerService.js';
import { EngineService } from '../services/engineService.js';
import { Badge, Button, Input, Modal, Select } from './ui/index.js';

interface StackFrame {
  raw: string;
  fn: string;
  location: string;
}

function parseStackFrames(stackInput: any): StackFrame[] {
  let stackStr = '';
  if (typeof stackInput === 'string') {
    stackStr = stackInput;
  } else if (stackInput && typeof stackInput === 'object') {
    stackStr = stackInput.stack || stackInput.error || JSON.stringify(stackInput);
  }
  if (!stackStr || typeof stackStr !== 'string') return [];

  const lines = stackStr.split('\n');
  const frames: StackFrame[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('at ')) {
      const match = trimmed.match(/^at\s+(.*?)\s+\((.*?)\)$/) || trimmed.match(/^at\s+(.*)$/);
      if (match) {
        frames.push({
          raw: trimmed,
          fn: match[1] || 'anonymous',
          location: match[2] || match[1] || '',
        });
      } else {
        frames.push({ raw: trimmed, fn: 'anonymous', location: trimmed });
      }
    }
  }
  return frames;
}

interface TerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TerminalModal: React.FC<TerminalModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<TerminalLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const data = await EngineService.getTerminalLogs({ limit: 300 });
      setLogs(data);
    } catch (err) {
      console.error('Failed to load terminal logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
      const interval = setInterval(fetchLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleClear = async () => {
    await EngineService.clearTerminalLogs();
    await fetchLogs();
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedCategory !== 'ALL' && log.category !== selectedCategory) {
        return false;
      }
      if (selectedLevel !== 'ALL' && log.level !== selectedLevel) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          log.message.toLowerCase().includes(q) ||
          log.source.toLowerCase().includes(q) ||
          log.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, selectedCategory, selectedLevel, searchQuery]);

  const stats = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    let successes = 0;
    for (const l of logs) {
      if (l.level === 'ERROR') errors++;
      else if (l.level === 'WARN') warnings++;
      else if (l.level === 'SUCCESS') successes++;
    }
    return { total: logs.length, errors, warnings, successes };
  }, [logs]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Terminal"
      icon={<Terminal className="w-4 h-4 stroke-[2.5]" />}
      maxWidth="max-w-3xl"
      closeLabel="Close terminal"
      bodyClassName="p-0 flex flex-col min-h-0 flex-1 overflow-hidden text-xs tabular-nums"
      headerActions={
        <>
          <button
            type="button"
            onClick={fetchLogs}
            disabled={isLoading}
            className="w-[30px] h-[30px] rounded-full hover:bg-theme-subtle hover:text-theme-primary text-theme-sub transition-colors duration-150 cursor-pointer flex items-center justify-center active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            title="Refresh"
            aria-label="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-theme-primary' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="w-[30px] h-[30px] rounded-full hover:bg-rose-500/15 hover:text-rose-500 text-theme-sub transition-colors duration-150 cursor-pointer flex items-center justify-center active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            title="Clear Terminal"
            aria-label="Clear terminal logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      }
      footer={
        <div className="flex items-center justify-between text-sm">
          <span className="text-theme-sub font-semibold">Apex Engine</span>
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {/* Filter bar */}
      <div className="px-3 py-1.5 bg-theme-subtle border-b border-theme flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* Category Tabs */}
        <div
          role="tablist"
          aria-label="Log category filter"
          className="flex items-center gap-0.5 h-[30px] min-h-[30px] p-[3px] rounded-xl bg-theme-card border border-theme overflow-x-auto no-scrollbar max-w-full"
        >
          {['ALL', 'DATABASE', 'DATA_FETCH', 'PREDICTION', 'SCRAPER', 'ENGINE'].map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat}
              onClick={() => setSelectedCategory(cat)}
              className={`h-full px-2.5 rounded-lg text-sm transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                selectedCategory === cat
                  ? 'bg-theme-primary text-theme-primary-text font-semibold shadow-theme-sm'
                  : 'text-theme-sub font-medium hover:text-theme-main hover:bg-theme-subtle'
              }`}
            >
              {cat === 'ALL'
                ? 'All Logs'
                : cat === 'DATABASE'
                ? 'Database'
                : cat === 'DATA_FETCH'
                ? 'Data Fetch'
                : cat === 'PREDICTION'
                ? 'Predictions'
                : cat === 'SCRAPER'
                ? 'Scraper'
                : 'Engine'}
            </button>
          ))}
        </div>

        {/* Level Filter and Search */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select
            aria-label="Filter log level"
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            surface="card"
            selectSize="sm"
            options={[
              { value: 'ALL', label: 'All Levels' },
              { value: 'ERROR', label: 'Errors Only' },
              { value: 'WARN', label: 'Warnings Only' },
              { value: 'SUCCESS', label: 'Success Only' },
              { value: 'INFO', label: 'Info Only' },
            ]}
          />

          <div className="flex-1 sm:w-44">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery('')}
              placeholder="Filter terminal..."
              leftIcon={<Search className="w-3.5 h-3.5" />}
              inputSize="sm"
              surface="card"
            />
          </div>
        </div>
      </div>

      {/* Quick summary stats banner */}
      <div className="min-h-[30px] px-3 py-1 bg-theme-header-grad border-b border-theme-subdued text-xs flex items-center justify-between text-theme-sub shrink-0">
        <div className="flex items-center gap-2.5 tabular-nums flex-wrap font-normal">
          <span>
            Total <strong className="text-theme-main font-semibold">{stats.total}</strong>
          </span>
          <span>
            Success <strong className="text-theme-success font-semibold">{stats.successes}</strong>
          </span>
          <span>
            Warnings <strong className="text-amber-500 font-semibold">{stats.warnings}</strong>
          </span>
          <span>
            Errors <strong className={`font-semibold ${stats.errors > 0 ? 'text-rose-500' : 'text-theme-sub'}`}>{stats.errors}</strong>
          </span>
        </div>
        <label className="h-[24px] inline-flex items-center gap-1.5 cursor-pointer text-theme-sub hover:text-theme-main select-none font-medium">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded bg-theme-subtle accent-[var(--accent-default)] focus-visible:ring-2 focus-visible:ring-theme-accent w-3.5 h-3.5 cursor-pointer"
          />
          <span>Auto scroll</span>
        </label>
      </div>

      {/* Terminal Console Output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto divide-y divide-white/[0.06] bg-[#060a10] select-text min-h-[195px] max-h-[46vh]"
      >
        {filteredLogs.length === 0 ? (
          <div className="py-10 text-center text-zinc-500 text-sm">
            No log entries match the selected filters.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const time = log.timestamp.slice(11, 19);
            return (
              <div
                key={log.id}
                className={`px-3.5 py-2 flex items-start gap-2 transition-colors duration-150 ${
                  log.level === 'ERROR'
                    ? 'bg-rose-500/[0.06] text-rose-200'
                    : log.level === 'WARN'
                    ? 'bg-amber-500/[0.05] text-amber-200'
                    : log.level === 'SUCCESS'
                    ? 'bg-emerald-500/[0.04] text-emerald-200'
                    : 'text-zinc-300'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {log.level === 'ERROR' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
                  {log.level === 'WARN' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                  {log.level === 'SUCCESS' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  {log.level === 'INFO' && <Info className="w-3.5 h-3.5 text-sky-400" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="text-zinc-400 text-xs font-normal tabular-nums">{time}</span>
                    <Badge
                      variant={
                        log.level === 'ERROR'
                          ? 'danger'
                          : log.level === 'WARN'
                          ? 'warning'
                          : log.level === 'SUCCESS'
                          ? 'success'
                          : 'default'
                      }
                      size="xs"
                    >
                      {log.level}
                    </Badge>
                    <span className="text-xs text-zinc-400 font-medium">
                      {log.category} · {log.source}
                    </span>
                  </div>

                  <p className="text-sm font-normal leading-snug break-words text-zinc-100">{log.message}</p>

                  {log.details && (
                    <div className="mt-1.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-zinc-300 overflow-x-auto space-y-0.5">
                      {(() => {
                        const stack = typeof log.details === 'object' ? log.details?.stack : null;
                        const frames = parseStackFrames(stack || log.details);
                        if (frames.length > 0) {
                          return (
                            <div>
                              <div className="font-semibold text-rose-400 mb-0.5">
                                Stack Trace ({frames.length} frames)
                              </div>
                              <div className="space-y-0.5 text-xs">
                                {frames.map((frame, idx) => (
                                  <div key={idx} className="flex items-start gap-1.5">
                                    <span className="text-zinc-500 w-6 text-right shrink-0">#{idx}</span>
                                    <span className="text-emerald-400 shrink-0 font-medium">{frame.fn}</span>
                                    <span className="text-zinc-400 truncate font-normal" title={frame.location}>
                                      {frame.location}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <pre className="text-zinc-400 whitespace-pre-wrap break-words font-sans font-normal">
                            {typeof log.details === 'object'
                              ? JSON.stringify(log.details, null, 2)
                              : String(log.details)}
                          </pre>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
};
