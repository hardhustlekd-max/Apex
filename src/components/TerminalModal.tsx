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
      icon={<Terminal className="w-3.5 h-3.5 stroke-[2.5]" />}
      maxWidth="max-w-3xl"
      closeLabel="Close terminal"
      bodyClassName="p-0 flex flex-col min-h-0 flex-1 overflow-hidden font-mono text-[10.5px]"
      headerActions={
        <>
          <button
            type="button"
            onClick={fetchLogs}
            disabled={isLoading}
            className="w-8 h-8 rounded-full bg-theme-subtle hover:bg-theme-primary hover:text-theme-primary-text text-theme-main transition-all duration-150 cursor-pointer flex items-center justify-center active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            title="Refresh"
            aria-label="Refresh logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-theme-primary' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="w-8 h-8 rounded-full bg-theme-subtle hover:bg-rose-500 hover:text-white text-theme-main transition-all duration-150 cursor-pointer flex items-center justify-center active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            title="Clear Terminal"
            aria-label="Clear terminal logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      }
      footer={
        <div className="flex items-center justify-between font-sans text-[10.5px]">
          <span className="text-theme-sub font-mono font-bold">Apex Engine</span>
          <Button variant="primary" size="sm" pill={false} onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {/* Filter bar */}
      <div className="px-4 py-2.5 bg-theme-subtle flex flex-wrap items-center justify-between gap-2 font-sans shrink-0">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
          {['ALL', 'DATA_FETCH', 'PREDICTION', 'SCRAPER', 'ENGINE'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full text-[10px] font-extrabold transition-all duration-150 cursor-pointer whitespace-nowrap active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                selectedCategory === cat
                  ? 'bg-theme-primary text-theme-primary-text'
                  : 'bg-theme-card text-theme-sub hover:text-theme-main hover:bg-theme-card-elevated'
              }`}
            >
              {cat === 'ALL'
                ? 'All Logs'
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
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
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
              leftIcon={<Search className="w-3 h-3" />}
              inputSize="sm"
              surface="card"
            />
          </div>
        </div>
      </div>

      {/* Quick summary stats banner */}
      <div className="px-4 py-1.5 bg-theme-card-elevated text-[10px] font-sans flex items-center justify-between text-theme-sub shrink-0">
        <div className="flex items-center gap-2.5 font-mono tabular-nums">
          <span>
            Total: <strong className="text-theme-main">{stats.total}</strong>
          </span>
          <span>
            Success: <strong className="text-theme-success">{stats.successes}</strong>
          </span>
          <span>
            Warnings: <strong className="text-amber-500">{stats.warnings}</strong>
          </span>
          <span>
            Errors:{' '}
            <strong className={stats.errors > 0 ? 'text-rose-500' : 'text-theme-sub'}>{stats.errors}</strong>
          </span>
        </div>
        <label className="flex items-center gap-1 cursor-pointer text-theme-sub hover:text-theme-main select-none">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded-md bg-theme-subtle accent-[var(--accent-default)] focus:ring-0 w-3 h-3"
          />
          <span>Auto scroll</span>
        </label>
      </div>

      {/* Terminal Console Output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-1.5 bg-[#070c14] select-text min-h-[300px] max-h-[50vh]"
      >
        {filteredLogs.length === 0 ? (
          <div className="py-10 text-center text-zinc-500 font-sans">
            No log entries match the selected filters.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const time = log.timestamp.slice(11, 19);
            return (
              <div
                key={log.id}
                className={`p-2.5 rounded-xl flex items-start gap-2.5 transition-colors duration-150 ${
                  log.level === 'ERROR'
                    ? 'bg-rose-500/10 text-rose-300'
                    : log.level === 'WARN'
                    ? 'bg-amber-500/10 text-amber-300'
                    : log.level === 'SUCCESS'
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : 'bg-[#101728] text-zinc-300'
                }`}
              >
                {/* Level Icon */}
                <div className="shrink-0 mt-0.5">
                  {log.level === 'ERROR' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
                  {log.level === 'WARN' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                  {log.level === 'SUCCESS' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  {log.level === 'INFO' && <Info className="w-3.5 h-3.5 text-sky-400" />}
                </div>

                {/* Log Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="text-zinc-500 text-[9px] tabular-nums">{time}</span>
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
                      pill
                      className="text-[8px]"
                    >
                      {log.level}
                    </Badge>
                    <span className="px-1.5 py-0.5 rounded-full text-[8px] bg-[#162038] text-zinc-400 font-bold">
                      {log.category}
                    </span>
                    <span className="text-zinc-400 font-semibold text-[10px]">[{log.source}]</span>
                  </div>

                  <p className="text-[10px] leading-relaxed break-words font-mono text-zinc-100">{log.message}</p>

                  {log.details && (
                    <div className="mt-1.5 p-2 rounded-lg bg-black/40 text-[9px] text-zinc-300 overflow-x-auto space-y-1">
                      {(() => {
                        const stack = typeof log.details === 'object' ? log.details?.stack : null;
                        const frames = parseStackFrames(stack || log.details);
                        if (frames.length > 0) {
                          return (
                            <div>
                              <div className="font-semibold text-rose-400 mb-0.5 flex items-center gap-1">
                                <span>Stack Trace ({frames.length} frames):</span>
                              </div>
                              <div className="space-y-0.5 font-mono text-[8.5px]">
                                {frames.map((frame, idx) => (
                                  <div key={idx} className="flex items-start gap-1.5 py-0.5">
                                    <span className="text-zinc-500 w-4 text-right shrink-0">#{idx}</span>
                                    <span className="text-emerald-400 shrink-0 font-medium">{frame.fn}</span>
                                    <span className="text-zinc-400 truncate" title={frame.location}>
                                      {frame.location}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <pre className="font-mono text-zinc-400">
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
