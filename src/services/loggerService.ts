export type LogLevel = 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
export type LogCategory = 'DATA_FETCH' | 'PREDICTION' | 'SCRAPER' | 'ENGINE' | 'DATABASE';

export interface TerminalLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  source: string;
  message: string;
  details?: any;
}

class LoggerService {
  private logs: TerminalLogEntry[] = [];
  private maxLogs = 500;
  private listeners: Array<(entry: TerminalLogEntry) => void> = [];

  constructor() {
    this.addLog({
      level: 'INFO',
      category: 'ENGINE',
      source: 'System',
      message: 'Apex Prediction Engine and Terminal Logger initialized',
    });
  }

  public addLog(entry: {
    level: LogLevel;
    category: LogCategory;
    source: string;
    message: string;
    details?: any;
  }): TerminalLogEntry {
    const fullEntry: TerminalLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };

    this.logs.unshift(fullEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Notify listeners
    this.listeners.forEach((listener) => {
      try {
        listener(fullEntry);
      } catch (e) {
        console.error('Error in log listener:', e);
      }
    });

    // Also output to console in development
    const prefix = `[${fullEntry.timestamp.slice(11, 19)}] [${fullEntry.category}] [${fullEntry.source}]`;
    if (fullEntry.level === 'ERROR') {
      console.error(prefix, fullEntry.message, fullEntry.details || '');
    } else if (fullEntry.level === 'WARN') {
      console.warn(prefix, fullEntry.message, fullEntry.details || '');
    } else {
      console.log(prefix, fullEntry.message);
    }

    return fullEntry;
  }

  public getLogs(filter?: {
    category?: LogCategory;
    level?: LogLevel;
    search?: string;
    limit?: number;
  }): TerminalLogEntry[] {
    let result = this.logs;

    if (filter?.category) {
      result = result.filter((l) => l.category === filter.category);
    }

    if (filter?.level) {
      result = result.filter((l) => l.level === filter.level);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (l) =>
          l.message.toLowerCase().includes(q) ||
          l.source.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q)
      );
    }

    const limit = filter?.limit || 200;
    return result.slice(0, limit);
  }

  public clearLogs(): void {
    this.logs = [];
    this.addLog({
      level: 'INFO',
      category: 'ENGINE',
      source: 'Terminal',
      message: 'Terminal logs cleared',
    });
  }

  public subscribe(listener: (entry: TerminalLogEntry) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}

export const loggerService = new LoggerService();
