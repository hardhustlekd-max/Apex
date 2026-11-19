import React from 'react';
import { RefreshCw, Database, Sparkles, XCircle } from 'lucide-react';
import { SyncJobState } from '../services/syncJobService.js';
import { Button, Card, ProgressBar } from './ui/index.js';

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
  const displayTitle = title || (isPredictionJob ? 'Calculate Predictions' : 'Full Data Sync');

  const progress = Math.min(100, Math.max(5, job?.progress ?? (isPredictionJob ? 15 : 25)));

  return (
    <Card
      surface="default"
      padding="none"
      radius="2xl"
      className="relative w-full overflow-hidden shadow-theme-md backdrop-blur-xl animate-in fade-in duration-200 z-30 my-1"
    >
      <div className="p-4 sm:p-5 flex flex-col items-center text-center max-w-lg mx-auto space-y-3">
        <div className="w-9 h-9 rounded-xl bg-theme-primary text-theme-primary-text flex items-center justify-center shadow-theme-glow">
          {isPredictionJob ? (
            <Sparkles className="w-5 h-5 animate-pulse text-theme-primary-text" />
          ) : (
            <Database className="w-5 h-5 text-theme-primary-text" />
          )}
        </div>

        <div className="space-y-0.5">
          <h3 className="text-lg font-semibold text-theme-main tracking-[-0.015em]">
            {displayTitle}
          </h3>
          {subtitle && (
            <p className="text-sm text-theme-sub leading-relaxed font-normal">
              {subtitle}
            </p>
          )}
        </div>

        {/* Inline Progress Band (no nested card) */}
        <div className="w-full pt-2.5 border-t border-theme-subdued space-y-2 text-left">
          <div className="flex items-center justify-between text-sm gap-2">
            <span className="font-medium text-theme-main flex items-center gap-1.5 truncate">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-theme-primary shrink-0" />
              <span className="truncate">
                {job?.currentStep ||
                  (isPredictionJob
                    ? 'Recalculating 5-Pillar Poisson predictions...'
                    : 'Fetching historical archives, upcoming feeds & H2H...')}
              </span>
            </span>
            <span className="text-sm tabular-nums font-bold text-theme-primary shrink-0">
              {progress}%
              {job?.stepIndex && job?.totalSteps
                ? ` (${job.stepIndex}/${job.totalSteps})`
                : ''}
            </span>
          </div>

          <ProgressBar value={progress} size="md" trackSurface="subtle" />

          {isPredictionJob && (
            <div className="flex items-center justify-between text-xs tabular-nums text-theme-sub">
              <span>
                Predicted:{' '}
                <strong className="text-theme-primary font-semibold">{job?.matchesCount ?? 0}</strong> /{' '}
                {job?.upcomingCount ?? '—'}
              </span>
              <span>
                Skipped (&lt;90% data):{' '}
                <strong className="text-amber-500 font-semibold">{job?.skippedCount ?? 0}</strong>
              </span>
            </div>
          )}
        </div>

        {onCancel && (
          <div className="flex items-center justify-end w-full pt-0.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onCancel(job?.id || '')}
              className="hover:border-rose-500/40 hover:text-rose-500"
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
