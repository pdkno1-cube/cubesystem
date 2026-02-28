'use client';

import { useState, useRef, useEffect } from 'react';
import {
  X,
  Play,
  Square,
  Copy,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  Coins,
} from 'lucide-react';
import * as Sentry from '@sentry/nextjs';
import { cn } from '@/lib/utils';
import { useAgentStream } from '@/hooks/use-agent-stream';
import type { Database } from '@/types/database';

type AgentRow = Database['public']['Tables']['agents']['Row'];

interface AgentExecutePanelProps {
  agent: AgentRow;
  workspaces: Array<{ id: string; name: string; slug: string }>;
  onClose: () => void;
}

export function AgentExecutePanel({
  agent,
  workspaces,
  onClose,
}: AgentExecutePanelProps) {
  const [input, setInput] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('');
  const [showStats, setShowStats] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  const {
    output,
    isStreaming,
    isDone,
    error,
    tokensIn,
    tokensOut,
    costUsd,
    taskId,
    execute,
    reset,
    stop,
  } = useAgentStream(agent.id);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleExecute = async () => {
    if (!input.trim() || isStreaming) { return; }
    reset();
    try {
      await execute(input.trim(), selectedWorkspace || undefined);
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      void handleExecute();
    }
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(output);
  };

  const modelShort =
    agent.model?.split('-').slice(0, 2).join('-') ?? 'claude';

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[480px] flex-col border-l border-gray-200 bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">{agent.name}</p>
            <p className="text-xs text-white/70">
              {modelShort} · {agent.category ?? 'general'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Workspace selector */}
      {workspaces.length > 0 && (
        <div className="border-b border-gray-100 px-5 py-3">
          <select
            value={selectedWorkspace}
            onChange={(e) => { setSelectedWorkspace(e.target.value); }}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
          >
            <option value="">법인 선택 (선택사항)</option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Output area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {output || isStreaming || error ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Output header */}
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2">
              <span className="text-xs font-medium text-gray-500">응답</span>
              <div className="flex items-center gap-2">
                {isDone && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <Copy className="h-3 w-3" />
                    복사
                  </button>
                )}
                {isStreaming && (
                  <span className="flex items-center gap-1 text-[10px] text-violet-600">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
                    생성 중...
                  </span>
                )}
              </div>
            </div>

            {/* Output content */}
            <div
              ref={outputRef}
              className="flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-4 font-mono text-sm leading-relaxed text-gray-800"
            >
              {error ? (
                <p className="text-red-500">{error}</p>
              ) : (
                output
              )}
              {isStreaming && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-violet-500" />
              )}
            </div>

            {/* Stats bar */}
            {isDone && (
              <div className="border-t border-gray-100 bg-gray-50">
                <button
                  type="button"
                  onClick={() => { setShowStats((s) => !s); }}
                  className="flex w-full items-center justify-between px-4 py-2 text-xs text-gray-500 hover:bg-gray-100"
                >
                  <span>실행 통계</span>
                  {showStats ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
                {showStats && (
                  <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 bg-white px-4 py-3">
                    <div className="flex items-center gap-1.5 pr-4">
                      <Coins className="h-3.5 w-3.5 text-amber-500" />
                      <div>
                        <p className="text-[10px] text-gray-400">비용</p>
                        <p className="text-xs font-semibold text-gray-800">
                          ${costUsd.toFixed(4)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-4">
                      <Zap className="h-3.5 w-3.5 text-violet-500" />
                      <div>
                        <p className="text-[10px] text-gray-400">토큰</p>
                        <p className="text-xs font-semibold text-gray-800">
                          {tokensIn + tokensOut}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pl-4">
                      <Clock className="h-3.5 w-3.5 text-green-500" />
                      <div>
                        <p className="text-[10px] text-gray-400">Task ID</p>
                        <p className="max-w-[80px] truncate font-mono text-[10px] text-gray-600">
                          {taskId?.slice(0, 8) ?? '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50">
                <Zap className="h-8 w-8 text-violet-400" />
              </div>
              <p className="mt-4 text-sm font-medium text-gray-700">
                에이전트 실행 준비
              </p>
              <p className="mt-1 text-xs text-gray-400">
                아래 입력창에 메시지를 입력하고 실행하세요
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 bg-white p-4">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => { setInput(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요... (Ctrl+Enter로 실행)"
            rows={4}
            disabled={isStreaming}
            className={cn(
              'w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3',
              'text-sm text-gray-800 placeholder-gray-400 transition-colors',
              'focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-violet-400',
              'disabled:opacity-60',
            )}
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[10px] text-gray-400">Ctrl+Enter로 실행</p>
            <div className="flex items-center gap-2">
              {(isStreaming || isDone || output) && (
                <button
                  type="button"
                  onClick={() => { reset(); setInput(''); }}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  초기화
                </button>
              )}
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stop}
                  className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600"
                >
                  <Square className="h-3 w-3" />
                  중지
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { void handleExecute(); }}
                  disabled={!input.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="h-3 w-3" />
                  실행
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
