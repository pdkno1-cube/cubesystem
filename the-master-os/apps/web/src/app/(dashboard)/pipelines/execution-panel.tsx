'use client';

import { useCallback, useMemo } from 'react';
import { X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useExecutionStore } from '@/stores/execution-store';

// ---------------------------------------------------------------------------
// Step status icon mapping
// ---------------------------------------------------------------------------

function StepIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <span className="text-green-500">&#x2705;</span>;
    case 'running':
      return (
        <span className="inline-block animate-pulse text-blue-500">
          &#x23F3;
        </span>
      );
    case 'failed':
      return <span className="text-red-500">&#x274C;</span>;
    case 'pending':
    default:
      return <span className="text-gray-300">&#x2B1C;</span>;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) { return `${ms}ms`; }
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExecutionPanel() {
  const {
    currentExecutionId,
    pipelineName,
    status,
    steps,
    totalCost,
    error,
    reset,
  } = useExecutionStore();

  const handleClose = useCallback(() => {
    reset();
  }, [reset]);

  // Calculate progress
  const { completedCount, totalCount, progressPercent, totalDuration } =
    useMemo(() => {
      const total = steps.length;
      const completed = steps.filter(
        (s) => s.status === 'completed' || s.status === 'failed',
      ).length;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

      let duration = 0;
      for (const step of steps) {
        if (step.durationMs) {
          duration += step.durationMs;
        }
      }

      return {
        completedCount: completed,
        totalCount: total,
        progressPercent: percent,
        totalDuration: duration,
      };
    }, [steps]);

  // Don't render if no execution is active
  if (!currentExecutionId) {
    return null;
  }

  const isFinished = status === 'completed' || status === 'failed';

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-3">
          {status === 'running' ? (
            <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
          ) : status === 'completed' ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-500" />
          )}
          <h3 className="text-sm font-semibold text-gray-900">
            {pipelineName}{' '}
            {status === 'running'
              ? '실행 중...'
              : status === 'completed'
                ? '완료'
                : '실패'}
          </h3>
        </div>
        {isFinished && (
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="px-6 pt-4">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {completedCount} / {totalCount} 스텝 완료
          </span>
          <span>{progressPercent}%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              status === 'failed' ? 'bg-red-500' : 'bg-brand-600',
            )}
            style={{ width: `${String(progressPercent)}%` }}
          />
        </div>
      </div>

      {/* Steps list */}
      <div className="px-6 py-4">
        <ul className="space-y-2">
          {steps.map((step) => (
            <li key={step.nodeId} className="flex items-center gap-3">
              <StepIcon status={step.status} />
              <span
                className={cn(
                  'flex-1 text-sm',
                  step.status === 'completed'
                    ? 'text-gray-700'
                    : step.status === 'running'
                      ? 'font-medium text-gray-900'
                      : step.status === 'failed'
                        ? 'text-red-600'
                        : 'text-gray-400',
                )}
              >
                {step.label}
              </span>
              {step.durationMs !== null && step.durationMs !== undefined && (
                <span className="text-xs text-gray-400">
                  {formatDuration(step.durationMs)}
                </span>
              )}
              {step.status === 'running' && (
                <span className="text-xs text-blue-500">처리 중...</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-6 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Footer: cost + duration */}
      <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3 text-xs text-gray-500">
        <span>총 비용: {formatCost(totalCost)}</span>
        <span>소요시간: {formatDuration(totalDuration)}</span>
      </div>
    </div>
  );
}
