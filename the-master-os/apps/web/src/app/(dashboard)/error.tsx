'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { context: 'dashboard.error-boundary' } });
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <AlertTriangle className="h-12 w-12 text-semantic-error" />
      <h2 className="text-lg font-semibold text-ink-primary">문제가 발생했습니다</h2>
      <p className="text-sm text-ink-secondary">{error.message || '예상치 못한 오류가 발생했습니다.'}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        다시 시도
      </button>
    </div>
  );
}
