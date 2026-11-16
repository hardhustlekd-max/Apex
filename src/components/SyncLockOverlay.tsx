import React from 'react';
import { RefreshCw, Database, Sparkles, AlertCircle, XCircle } from 'lucide-react';
import { SyncJobState } from '../services/syncJobService.js';
import { Badge, Button, Card, ProgressBar } from './ui/index.js';

interface SyncLockOverlayProps {
  job: SyncJobState | null;
  onCancel?: (jobId: string) => void;
  title?: string;
  subtitle?: string;
}

export const SyncLockOverlay: React.FC<SyncLockOverlayProps> = ({
  job,
  onCancel,
  title,
  subtitle,
}) => {
  const isPredictionJob = job?.jobType === 'PREDICTIONS';
  const displayTitle = title || (isPredictionJob
    ? 'Calculate Predictions'
    : 'Full Data Sync');

  const progress = Math.min(100, Math.max(5, job?.progress ?? (isPredictionJob ? 15 : 25)));

  return (
    <Card
      surface="default"
      radius="3xl"
      className="relative w-full overflow-hidden p-6 sm:p-8 shadow-theme-md backdrop-blur-xl animate-in fade-in duration-200 z-30 my-2"
    >
      <div className="flex flex-col items-center text-center max-w-xl mx-auto space-y-5">
        {/* Animated Icon Ring */}
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-theme-primary text-theme-primary-text flex items-center justify-center shadow-theme-glow">
            {isPredictionJob ? (
              <Sparkles className="w-8 h-8 animate-pulse text-theme-primary-text" />
            ) : (
              <Database className="w-8 h-8 text-theme-primary-text" />
            )}
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-theme-sm animate-spin">
            <RefreshCw className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h3 className="text-base sm:text-lg font-black text-theme-main tracking-tight">
            {displayTitle}
          </h3>
          {subtitle && (
            <p className="text-xs text-theme-sub leading-relaxed font-medium">
              {subtitle}
            </p>
          )}
        </div>

        {/* Exact Modal-Style Progress Card */}
        <Card surface="subtle" padding="md" radius="2xl" className="w-full shadow-none space-y-2.5 text-left">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="font-bold text-theme-main flex items-center gap-2 truncate">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-theme-primary shrink-0" />
              <span className="truncate">
                {job?.currentStep ||
                  (isPredictionJob
                    ? 'Recalculating 5-Pillar Poisson predictions...'
                    : 'Fetching historical archives, upcoming feeds & H2H...')}
              </span>
            </span>
            <span className="text-[11px] font-mono tabular-nums font-black text-theme-main shrink-0">
              {progress}%
              {job?.stepIndex && job?.totalSteps
                ? ` (Step ${job.stepIndex}/${job.totalSteps})`
                : ''}
            </span>
          </div>

          <ProgressBar value={progress} trackSurface="card" />

          {isPredictionJob && (
            <div className="flex items-center justify-between text-[10.5px] font-mono tabular-nums text-theme-sub pt-0.5">
              <span>
                Predicted:{' '}
                <strong className="text-theme-primary">{job?.matchesCount ?? 0}</strong> /{' '}
                {job?.upcomingCount ?? '—'}
              </span>
              <span>
                Skipped (&lt;90% data):{' '}
                <strong className="text-amber-500">{job?.skippedCount ?? 0}</strong>
              </span>
            </div>
          )}
        </Card>

        {/* Cancel Action */}
        {onCancel && (
          <div className="flex items-center justify-end w-full pt-1 text-xs">
            <Button
              variant="subtle"
              size="xs"
              onClick={() => onCancel(job?.id || '')}
              className="hover:bg-rose-500/10 hover:text-rose-600"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel Job</span>
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};
