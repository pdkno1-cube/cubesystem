'use client';

import { useCallback, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  X,
  FileText,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Archive,
  Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { DocumentReview, IssueItem } from './page';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentDetailPanelProps {
  review: DocumentReview | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const DEFAULT_STATUS_CONFIG = { label: '대기', color: 'text-gray-500', icon: Clock } as const;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: DEFAULT_STATUS_CONFIG,
  reviewing: { label: '검증중', color: 'text-blue-600', icon: Loader2 },
  approved: { label: '승인', color: 'text-green-600', icon: CheckCircle2 },
  rejected: { label: '반려', color: 'text-red-600', icon: XCircle },
  archived: { label: '아카이브', color: 'text-purple-600', icon: Archive },
};

const SEVERITY_STYLES: Record<string, string> = {
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  critical: 'bg-red-100 text-red-800 border-red-300',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentDetailPanel({
  review,
  isOpen,
  onClose,
  onUpdated,
}: DocumentDetailPanelProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [notes, setNotes] = useState('');

  const handleStatusChange = useCallback(
    async (newStatus: string) => {
      if (!review) {
        return;
      }

      setIsUpdating(true);
      try {
        const resp = await fetch(`/api/documents/${review.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: newStatus,
            ...(notes.trim() ? { reviewer_notes: notes.trim() } : {}),
          }),
        });

        if (resp.ok) {
          onUpdated();
        }
      } catch (error) {
        Sentry.captureException(error, { tags: { context: 'documents.detail.statusChange' } });
      } finally {
        setIsUpdating(false);
      }
    },
    [review, notes, onUpdated],
  );

  if (!isOpen || !review) {
    return null;
  }

  const statusCfg = STATUS_CONFIG[review.status] ?? DEFAULT_STATUS_CONFIG;
  const StatusIcon = statusCfg.icon;
  const createdDate = new Date(review.created_at).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="닫기"
      />

      {/* Panel */}
      <div className="relative ml-auto h-full w-full max-w-md overflow-y-auto bg-white shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">문서 상세</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Document info */}
          <div>
            <h3 className="text-base font-semibold text-gray-900">{review.document_name}</h3>
            <div className="mt-2 space-y-1.5 text-sm text-gray-500">
              <p>유형: <span className="font-medium text-gray-700">{review.document_type}</span></p>
              <p>
                상태:{' '}
                <span className={clsx('inline-flex items-center gap-1 font-medium', statusCfg.color)}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {statusCfg.label}
                </span>
              </p>
              <p>등록일: {createdDate}</p>
            </div>
          </div>

          {/* File URL / GDrive link */}
          {(review.file_url ?? review.gdrive_file_id) ? (
            <div>
              <h4 className="text-sm font-medium text-gray-700">파일 링크</h4>
              <div className="mt-2 space-y-2">
                {review.file_url ? (
                  <a
                    href={review.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    원본 파일 보기
                  </a>
                ) : null}
                {review.gdrive_file_id ? (
                  <a
                    href={`https://drive.google.com/file/d/${review.gdrive_file_id}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Google Drive에서 보기
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Issues */}
          <div>
            <h4 className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <AlertTriangle className="h-4 w-4" />
              이슈 목록 ({review.issues.length})
            </h4>
            {review.issues.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">발견된 이슈가 없습니다.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {review.issues.map((issue: IssueItem, idx: number) => (
                  <li
                    key={`${issue.code}-${idx}`}
                    className={clsx(
                      'rounded-lg border p-3 text-sm',
                      SEVERITY_STYLES[issue.severity] ?? SEVERITY_STYLES.warning,
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{issue.code}</span>
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium uppercase">
                        {issue.severity}
                      </span>
                    </div>
                    <p className="mt-1">{issue.message}</p>
                    {issue.field ? (
                      <p className="mt-0.5 text-xs opacity-70">필드: {issue.field}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Reviewer notes */}
          <div>
            <h4 className="text-sm font-medium text-gray-700">검증 노트</h4>
            {review.reviewer_notes ? (
              <p className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
                {review.reviewer_notes}
              </p>
            ) : null}
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); }}
              placeholder="검증 결과 노트를 입력하세요..."
              rows={3}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              disabled={isUpdating}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void handleStatusChange('approved')}
              disabled={isUpdating || review.status === 'approved'}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                review.status === 'approved'
                  ? 'cursor-not-allowed bg-green-100 text-green-400'
                  : 'bg-green-600 text-white hover:bg-green-700',
              )}
            >
              <CheckCircle2 className="h-4 w-4" />
              승인
            </button>
            <button
              onClick={() => void handleStatusChange('rejected')}
              disabled={isUpdating || review.status === 'rejected'}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                review.status === 'rejected'
                  ? 'cursor-not-allowed bg-red-100 text-red-400'
                  : 'bg-red-600 text-white hover:bg-red-700',
              )}
            >
              <XCircle className="h-4 w-4" />
              반려
            </button>
            <button
              onClick={() => void handleStatusChange('archived')}
              disabled={isUpdating || review.status === 'archived'}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                review.status === 'archived'
                  ? 'cursor-not-allowed bg-purple-100 text-purple-400'
                  : 'bg-purple-600 text-white hover:bg-purple-700',
              )}
            >
              <Archive className="h-4 w-4" />
              아카이브
            </button>
            {isUpdating ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-400 self-center" />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
