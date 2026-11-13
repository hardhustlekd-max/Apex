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
    ? 'Recalculating Predictions'
    : 'Data Sync in Progress');

  const progress = Math.min(100, Math.max(5, job?.progress ?? 15));

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

        {/* Live Step Description & Progress Bar */}
        <div className="w-full space-y-2.5 p-4 rounded-2xl bg-theme-subtle">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="font-bold text-theme-main flex items-center gap-2 truncate">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-theme-primary shrink-0" />
              <span className="truncate">{job?.currentStep || 'Processing background calculations and SQLite persistence...'}</span>
            </span>
            <span className="text-[11px] font-mono tabular-nums font-black text-theme-primary shrink-0">
              {progress}%
              {job?.stepIndex && job?.totalSteps ? ` (Step ${job.stepIndex}/${job.totalSteps})` : ''}
            </span>
          </div>

          <ProgressBar value={progress} trackSurface="card" />

          {/* Live Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 text-[10.5px] font-mono tabular-nums pt-1 text-theme-sub">
            <div className="text-center">
              <span className="block text-[9.5px] text-theme-sub uppercase font-sans">Processed</span>
              <strong className="text-theme-primary font-black text-xs">{job?.matchesCount ?? 0}</strong>
            </div>
            <div className="text-center px-1">
              <span className="block text-[9.5px] text-theme-sub uppercase font-sans">Upcoming</span>
              <strong className="text-theme-main font-black text-xs">{job?.upcomingCount ?? 0}</strong>
            </div>
            <div className="text-center">
              <span className="block text-[9.5px] text-theme-sub uppercase font-sans">Predictions</span>
              <strong className="text-theme-primary font-black text-xs">{job?.predictionsCount ?? 0}</strong>
            </div>
          </div>
        </div>

        {/* Lock Info & Cancel Action */}
        <div className="flex items-center justify-between w-full pt-1 text-xs">
          <Badge variant="warning" pill className="px-3 py-1.5 text-[10.5px]">
            <AlertCircle className="w-3.5 h-3.5" />
            UI Locked Until Process Finishes
          </Badge>

          {job?.id && onCancel && (
            <Button
              variant="subtle"
              size="xs"
              onClick={() => onCancel(job.id)}
              className="hover:bg-rose-500/10 hover:text-rose-600"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel Job</span>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
