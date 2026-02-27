'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import * as Sentry from '@sentry/nextjs';
import { cn } from '@/lib/utils';
import { DebateMessageBubble } from './DebateMessageBubble';
import type { DebateMessage } from './DebateMessageBubble';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DebateDetail {
  id: string;
  workspace_id: string;
  topic: string;
  status: string;
  summary: string | null;
  conclusion: string | null;
  created_at: string;
  messages: DebateMessage[];
}

interface NextRoundResponse {
  data: DebateDetail;
  meta?: {
    round_number: number;
    new_messages_count: number;
    ai_generated: boolean;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DebateTimelineProps {
  debate: DebateDetail;
  onBack: () => void;
  /** Optional: called when debate data is updated (e.g., after next round) */
  onDebateUpdate?: (updated: DebateDetail) => void;
}

export function DebateTimeline({ debate: initialDebate, onBack, onDebateUpdate }: DebateTimelineProps) {
  const [debate, setDebate] = useState<DebateDetail>(initialDebate);
  const [isGenerating, setIsGenerating] = useState(false);
  const [roundInfo, setRoundInfo] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isConcluded = debate.status === 'concluded';

  // Scroll to new messages after generation
  useEffect(() => {
    if (messagesEndRef.current && !isGenerating) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [debate.messages.length, isGenerating]);

  // Sync with parent when initialDebate prop changes
  useEffect(() => {
    setDebate(initialDebate);
  }, [initialDebate]);

  const handleNextRound = useCallback(async () => {
    if (isGenerating || isConcluded) {
      return;
    }

    setIsGenerating(true);
    setRoundInfo(null);

    try {
      const res = await fetch(`/api/debates/${debate.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errBody: unknown = await res.json().catch(() => null);
        const errMsg =
          (errBody as { error?: { message?: string } } | null)?.error?.message ??
          `서버 오류 (${res.status})`;
        throw new Error(errMsg);
      }

      const json = (await res.json()) as NextRoundResponse;
      const updatedDebate = json.data;
      const meta = json.meta;

      setDebate(updatedDebate);
      onDebateUpdate?.(updatedDebate);

      if (meta) {
        const modeLabel = meta.ai_generated ? 'AI 생성' : '시뮬레이션';
        setRoundInfo(
          `라운드 ${meta.round_number} 완료 (${modeLabel}, ${meta.new_messages_count}개 메시지)`
        );
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { context: 'debates.nextRound' } });
      setRoundInfo(
        err instanceof Error
          ? `오류: ${err.message}`
          : '다음 라운드 생성에 실패했습니다.'
      );
    } finally {
      setIsGenerating(false);
    }
  }, [debate.id, isGenerating, isConcluded, onDebateUpdate]);

  // Compute round count for display
  const uniqueAgentCount = new Set(debate.messages.map((m) => m.agent_id)).size;
  const currentRound = uniqueAgentCount > 0
    ? Math.ceil(debate.messages.length / uniqueAgentCount)
    : 0;

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
            &larr; 토론 목록으로
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
            {currentRound > 0 ? (
              <span className="text-xs text-gray-400">
                라운드 {currentRound}
              </span>
            ) : null}
          </div>
        </div>

        {/* Next Round Button */}
        {!isConcluded ? (
          <button
            type="button"
            onClick={() => void handleNextRound()}
            disabled={isGenerating}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-all',
              isGenerating
                ? 'cursor-not-allowed bg-gray-400'
                : 'bg-brand-600 hover:bg-brand-700 active:scale-[0.98]'
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 토론 생성중...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4" />
                다음 라운드 생성
              </>
            )}
          </button>
        ) : null}
      </div>

      {/* Round info toast */}
      {roundInfo ? (
        <div
          className={cn(
            'rounded-lg border px-4 py-2.5 text-sm',
            roundInfo.startsWith('오류')
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700'
          )}
        >
          {roundInfo}
        </div>
      ) : null}

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

        {/* Loading skeleton during generation */}
        {isGenerating ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-300">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        ) : null}

        <div ref={messagesEndRef} />
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
