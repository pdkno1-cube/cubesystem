'use client';

import { MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DebateMessageBubble } from './DebateMessageBubble';
import type { DebateMessage } from './DebateMessageBubble';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DebateDetail {
  id: string;
  workspace_id: string;
  topic: string;
  status: string;
  summary: string | null;
  conclusion: string | null;
  created_at: string;
  messages: DebateMessage[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DebateTimelineProps {
  debate: DebateDetail;
  onBack: () => void;
}

export function DebateTimeline({ debate, onBack }: DebateTimelineProps) {
  const isConcluded = debate.status === 'concluded';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onBack}
            className="mb-2 text-sm text-brand-600 hover:text-brand-700"
          >
            ← 토론 목록으로
          </button>
          <h2 className="text-xl font-bold text-gray-900">{debate.topic}</h2>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                isConcluded
                  ? 'bg-gray-100 text-gray-600'
                  : 'bg-green-50 text-green-700'
              )}
            >
              {isConcluded ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <MessageSquare className="h-3 w-3" />
              )}
              {isConcluded ? '토론 종료' : '토론 진행중'}
            </span>
            <span className="text-xs text-gray-400">
              {formatDate(debate.created_at)}
            </span>
            <span className="text-xs text-gray-400">
              {debate.messages.length}개 메시지
            </span>
          </div>
        </div>
      </div>

      {/* Message Timeline */}
      <div className="space-y-3">
        {debate.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-12">
            <MessageSquare className="h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">아직 메시지가 없습니다.</p>
          </div>
        ) : (
          debate.messages.map((msg) => (
            <DebateMessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Conclusion Card */}
      {isConcluded && (debate.summary || debate.conclusion) ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-indigo-900">토론 결론</h3>
          </div>

          {debate.summary ? (
            <div className="mt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                요약
              </h4>
              <p className="mt-1 text-sm text-indigo-800">{debate.summary}</p>
            </div>
          ) : null}

          {debate.conclusion ? (
            <div className="mt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                최종 결론
              </h4>
              <p className="mt-1 text-sm font-medium text-indigo-900">
                {debate.conclusion}
              </p>
            </div>
          ) : null}

          {/* Consensus indicator */}
          <div className="mt-4 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
              {debate.conclusion ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  합의 도출
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3" />
                  비합의
                </>
              )}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return isoStr;
  }
}
