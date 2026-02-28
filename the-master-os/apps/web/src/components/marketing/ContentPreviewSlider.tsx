'use client';

import { useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { X, Send, XCircle, Calendar } from 'lucide-react';
import {
  type ScheduleItem,
  type ScheduleChannel,
  CHANNEL_COLORS,
  STATUS_LABELS,
} from '@/stores/marketingStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContentPreviewSliderProps {
  schedule: ScheduleItem | null;
  isOpen: boolean;
  onClose: () => void;
  onCancelSchedule: (id: string) => Promise<void>;
  onSendNow?: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    pending:   'bg-amber-100 text-amber-700',
    running:   'bg-blue-100 text-blue-700 animate-pulse',
    completed: 'bg-green-100 text-green-700',
    failed:    'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-600',
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        colorMap[status] ?? 'bg-gray-100 text-gray-600',
      )}
    >
      {STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}
    </span>
  );
}

function ContentSection({ content }: { content: Record<string, unknown> }) {
  if (!content || Object.keys(content).length === 0) {
    return <p className="text-sm text-gray-400 italic">콘텐츠 없음</p>;
  }

  const entries = Object.entries(content).slice(0, 6);
  return (
    <dl className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{key}</dt>
          <dd className="mt-0.5 text-sm text-gray-700 line-clamp-3 whitespace-pre-line">
            {typeof value === 'string'
              ? value
              : JSON.stringify(value, null, 2).slice(0, 300)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// ContentPreviewSlider
// ---------------------------------------------------------------------------

export function ContentPreviewSlider({
  schedule,
  isOpen,
  onClose,
  onCancelSchedule,
  onSendNow,
}: ContentPreviewSliderProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handler);
    }
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Focus trap into panel when opened
  useEffect(() => {
    if (isOpen) {
      panelRef.current?.focus();
    }
  }, [isOpen]);

  const colors = schedule
    ? (CHANNEL_COLORS[schedule.channel as ScheduleChannel] ?? CHANNEL_COLORS.blog)
    : CHANNEL_COLORS.blog;

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <aside
        ref={panelRef}
        tabIndex={-1}
        aria-label="콘텐츠 상세"
        className={clsx(
          'fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col',
          'bg-white shadow-2xl transition-transform duration-300 ease-in-out',
          'focus:outline-none',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                colors.bg,
                colors.text,
              )}
            >
              <span className={clsx('mr-1.5 h-2 w-2 rounded-full', colors.dot)} />
              {colors.label}
            </span>
            {schedule && <StatusBadge status={schedule.status} />}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        {schedule ? (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Title */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{schedule.title}</h2>
              {schedule.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {schedule.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Schedule info */}
            <div className="rounded-xl bg-gray-50 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className="font-medium">예약 시각:</span>
                <span>{formatDateTime(schedule.scheduled_at)}</span>
              </div>
              {schedule.published_at && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Send className="h-4 w-4 text-green-500" />
                  <span className="font-medium">발행 완료:</span>
                  <span>{formatDateTime(schedule.published_at)}</span>
                </div>
              )}
              {schedule.recurrence !== 'none' && (
                <div className="text-sm text-gray-500">
                  반복: {schedule.recurrence}
                </div>
              )}
            </div>

            {/* Content preview */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">콘텐츠 미리보기</h3>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <ContentSection content={schedule.content} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
            항목을 선택하세요
          </div>
        )}

        {/* Footer actions */}
        {schedule && schedule.status === 'pending' && (
          <div className="border-t border-gray-200 px-5 py-4 flex gap-3">
            {onSendNow && (
              <button
                onClick={() => void onSendNow(schedule.id)}
                className={clsx(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5',
                  'bg-violet-600 text-sm font-medium text-white',
                  'hover:bg-violet-700 transition-colors',
                )}
              >
                <Send className="h-4 w-4" />
                {schedule.channel === 'newsletter' ? '지금 발송' : '지금 발행'}
              </button>
            )}
            <button
              onClick={() => void onCancelSchedule(schedule.id)}
              className={clsx(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5',
                'border border-red-200 bg-red-50 text-sm font-medium text-red-600',
                'hover:bg-red-100 transition-colors',
              )}
            >
              <XCircle className="h-4 w-4" />
              예약 취소
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
