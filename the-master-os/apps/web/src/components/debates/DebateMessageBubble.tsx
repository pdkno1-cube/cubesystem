'use client';

import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DebateMessage {
  id: string;
  debate_id: string;
  agent_id: string;
  agent_role: string;
  message_content: string;
  reasoning: string | null;
  confidence_score: number;
  sequence_order: number;
  created_at: string;
  agent: {
    id: string;
    name: string;
    icon: string | null;
    category: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Role config
// ---------------------------------------------------------------------------

const ROLE_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; borderColor: string; barColor: string; iconBg: string }
> = {
  optimist: {
    label: '낙관론자',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    barColor: 'bg-green-500',
    iconBg: 'bg-green-500',
  },
  pessimist: {
    label: '비관론자',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    barColor: 'bg-red-500',
    iconBg: 'bg-red-500',
  },
  realist: {
    label: '현실주의자',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    barColor: 'bg-blue-500',
    iconBg: 'bg-blue-500',
  },
  critic: {
    label: '비평가',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    barColor: 'bg-amber-500',
    iconBg: 'bg-amber-500',
  },
};

const DEFAULT_ROLE_CONFIG = {
  label: '참여자',
  color: 'text-gray-700',
  bgColor: 'bg-gray-50',
  borderColor: 'border-gray-200',
  barColor: 'bg-gray-500',
  iconBg: 'bg-gray-500',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DebateMessageBubbleProps {
  message: DebateMessage;
}

export function DebateMessageBubble({ message }: DebateMessageBubbleProps) {
  const config = ROLE_CONFIG[message.agent_role] ?? DEFAULT_ROLE_CONFIG;
  const confidencePercent = Math.round(message.confidence_score * 100);
  const agentName = message.agent?.name ?? '알 수 없는 에이전트';

  return (
    <div className={cn('flex gap-3 rounded-xl border p-4', config.bgColor, config.borderColor)}>
      {/* Agent Icon */}
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white',
          config.iconBg
        )}
      >
        <Bot className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Header: Agent name + Role badge */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{agentName}</span>
          <span
            className={cn(
              'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium',
              config.bgColor,
              config.color
            )}
          >
            {config.label}
          </span>
          <span className="ml-auto text-[10px] text-gray-400">
            {formatTime(message.created_at)}
          </span>
        </div>

        {/* Message content */}
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
          {message.message_content}
        </p>

        {/* Reasoning (expandable) */}
        {message.reasoning ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
              추론 과정 보기
            </summary>
            <p className="mt-1 rounded-lg bg-white/60 px-3 py-2 text-xs text-gray-600">
              {message.reasoning}
            </p>
          </details>
        ) : null}

        {/* Confidence bar */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] font-medium text-gray-500">확신도</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
            <div
              className={cn('h-full rounded-full transition-all', config.barColor)}
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <span className={cn('text-[10px] font-bold', config.color)}>
            {confidencePercent}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}
