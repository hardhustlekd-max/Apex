import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // Ignore storage clear issues
    }
    window.location.href = '/';
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center space-x-3 text-emerald-400">
              <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <AlertTriangle className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Application Encountered an Issue</h2>
                <p className="text-xs text-slate-400">Poisson Football Engine UI Recovery</p>
              </div>
            </div>

            <div className="bg-slate-950/70 rounded-xl p-3 border border-slate-800/80 text-xs font-mono text-slate-400 overflow-auto max-h-32">
              <p className="text-rose-400 font-semibold mb-1">
                {this.state.error?.name || 'Error'}: {this.state.error?.message || 'Unknown render error'}
              </p>
              {this.state.errorInfo?.componentStack && (
                <pre className="text-[10px] text-slate-500 whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack.slice(0, 300)}
                </pre>
              )}
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                onClick={this.handleReload}
                className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium rounded-xl transition text-sm shadow-lg shadow-emerald-950/40"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>

              <button
                onClick={this.handleResetCache}
                className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-850 text-slate-300 font-medium rounded-xl transition text-sm border border-slate-700/60"
              >
                <Trash2 className="w-4 h-4 text-slate-400" />
                <span>Clear Cache & Reset Application State</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
