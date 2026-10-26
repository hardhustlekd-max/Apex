import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Terminal, X, RefreshCw, Trash2, Search, AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { TerminalLogEntry, LogCategory, LogLevel } from '../services/loggerService.js';
import { EngineService } from '../services/engineService.js';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/70 backdrop-blur-xl animate-in fade-in duration-150 font-sans">
      <div className="bg-[#121212] text-slate-100 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-[0_24px_64px_rgba(0,0,0,0.85)] border border-neutral-800 overflow-hidden font-mono text-[10.5px]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-[#121212] border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-full bg-[#CCFF00] text-slate-950 font-black">
              <Terminal className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-xs sm:text-sm tracking-wide font-sans">Terminal Logs</span>
                <span className="px-2 py-0.5 rounded-full text-[8.5px] bg-neutral-800 text-neutral-200 font-mono tabular-nums font-bold">
                  {filteredLogs.length} events
                </span>
              </div>
              <p className="text-[10px] text-neutral-400 font-sans">
                Real-time data fetching, prediction engine, and system diagnostics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="w-7.5 h-7.5 rounded-full bg-neutral-800 hover:bg-[#CCFF00] hover:text-slate-950 text-neutral-200 transition-all cursor-pointer flex items-center justify-center active:scale-95"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#CCFF00]' : ''}`} />
            </button>
            <button
              onClick={handleClear}
              className="w-7.5 h-7.5 rounded-full bg-neutral-800 hover:bg-rose-500 hover:text-white text-neutral-200 transition-all cursor-pointer flex items-center justify-center active:scale-95"
              title="Clear Terminal"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="w-7.5 h-7.5 rounded-full bg-neutral-800 hover:bg-[#CCFF00] hover:text-slate-950 text-neutral-200 transition-all cursor-pointer flex items-center justify-center active:scale-95"
              title="Close"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="px-4 py-2.5 bg-[#161616] border-b border-neutral-800/80 flex flex-wrap items-center justify-between gap-2 font-sans">
          {/* Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            {['ALL', 'DATA_FETCH', 'PREDICTION', 'SCRAPER', 'ENGINE'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-[10px] font-extrabold transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                  selectedCategory === cat
                    ? 'bg-[#CCFF00] text-slate-950 shadow-xs'
                    : 'bg-neutral-800 text-neutral-300 hover:text-white'
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
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="bg-neutral-800 rounded-full px-3 py-1 text-[10px] font-bold text-neutral-200 outline-none cursor-pointer border border-neutral-700 focus:border-[#CCFF00]"
            >
              <option value="ALL">All Levels</option>
              <option value="ERROR">Errors Only</option>
              <option value="WARN">Warnings Only</option>
              <option value="SUCCESS">Success Only</option>
              <option value="INFO">Info Only</option>
            </select>

            <div className="relative flex-1 sm:w-40">
              <Search className="w-3 h-3 absolute left-2.5 top-2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter terminal..."
                className="w-full bg-neutral-800 border border-neutral-700 rounded-full pl-7 pr-3 py-1 text-[10px] font-bold text-neutral-200 placeholder-neutral-500 outline-none focus:border-[#CCFF00]"
              />
            </div>
          </div>
        </div>

        {/* Quick summary stats banner */}
        <div className="px-4 py-1.5 bg-[#070c14] text-[10px] font-sans flex items-center justify-between text-zinc-400">
          <div className="flex items-center gap-2.5">
            <span>
              Total: <strong className="text-zinc-200">{stats.total}</strong>
            </span>
            <span>
              Success: <strong className="text-emerald-400">{stats.successes}</strong>
            </span>
            <span>
              Warnings: <strong className="text-amber-400">{stats.warnings}</strong>
            </span>
            <span>
              Errors: <strong className={stats.errors > 0 ? 'text-rose-400' : 'text-zinc-400'}>{stats.errors}</strong>
            </span>
          </div>
          <label className="flex items-center gap-1 cursor-pointer text-zinc-400 hover:text-zinc-200 select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded-md bg-[#162038] border-none text-[#A3FF12] focus:ring-0 w-3 h-3"
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
                  className={`p-2.5 rounded-xl flex items-start gap-2.5 transition-colors ${
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
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-zinc-500 text-[9px]">{time}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[8px] font-extrabold ${
                          log.level === 'ERROR'
                            ? 'bg-rose-500/20 text-rose-200'
                            : log.level === 'WARN'
                            ? 'bg-amber-500/20 text-amber-200'
                            : log.level === 'SUCCESS'
                            ? 'bg-emerald-500/20 text-emerald-200'
                            : 'bg-zinc-800 text-zinc-300'
                        }`}
                      >
                        {log.level}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-full text-[8px] bg-[#162038] text-zinc-400 font-bold">
                        {log.category}
                      </span>
                      <span className="text-zinc-400 font-semibold text-[10px]">
                        [{log.source}]
                      </span>
                    </div>

                    <p className="text-[10px] leading-relaxed break-words font-mono text-zinc-100">
                      {log.message}
                    </p>

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
                                      <span className="text-zinc-400 truncate" title={frame.location}>{frame.location}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <pre className="font-mono text-zinc-400">
                              {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
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

        {/* Footer */}
        <div className="px-4 py-2 bg-[#101728] flex items-center justify-between font-sans text-[10.5px]">
          <span className="text-zinc-400">
            Unified Apex Engine active • 5-Pillar Dixon-Coles model
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-[#A3FF12] hover:bg-[#92e610] text-black font-extrabold transition-all cursor-pointer active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
