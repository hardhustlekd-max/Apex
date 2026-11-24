import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { Button, Card } from './ui/index.js';

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
        <div className="min-h-screen bg-theme-bg text-theme-main flex items-center justify-center p-3.5 font-sans">
          <Card radius="2xl" padding="none" className="max-w-md w-full shadow-theme-md overflow-hidden">
            <div className="min-h-[38px] px-3 py-2 bg-theme-header-grad border-b border-theme flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-theme-primary shrink-0" />
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-theme-main tracking-[-0.015em]">
                  Application Encountered an Issue
                </h2>
                <p className="text-xs font-normal text-theme-sub">Poisson Football Engine UI Recovery</p>
              </div>
            </div>

            <div className="p-3.5 space-y-3">
              <div className="bg-theme-subtle rounded-xl p-3 text-sm text-theme-sub overflow-auto max-h-32 tabular-nums">
                <p className="text-rose-700 dark:text-rose-400 font-medium mb-1">
                  {this.state.error?.name || 'Error'}: {this.state.error?.message || 'Unknown render error'}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-xs font-normal text-theme-dim whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack.slice(0, 300)}
                  </pre>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Button variant="primary" size="md" fullWidth onClick={this.handleReload}>
                  <RefreshCw className="w-4 h-4" />
                  <span>Reload Application</span>
                </Button>

                <Button variant="secondary" size="md" fullWidth onClick={this.handleResetCache}>
                  <Trash2 className="w-4 h-4 text-theme-sub" />
                  <span>Clear Cache &amp; Reset Application State</span>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
