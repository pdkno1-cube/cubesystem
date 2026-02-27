'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorRetryProps {
  message: string;
  onRetry: () => void;
  isRetrying?: boolean;
  className?: string;
}

export function ErrorRetry({
  message,
  onRetry,
  isRetrying = false,
  className,
}: ErrorRetryProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-12 text-center',
        className,
      )}
    >
      <AlertCircle className="h-10 w-10 text-red-400" />
      <p className="mt-3 text-sm font-medium text-red-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={isRetrying}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRetrying ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        다시 시도
      </button>
    </div>
  );
}
