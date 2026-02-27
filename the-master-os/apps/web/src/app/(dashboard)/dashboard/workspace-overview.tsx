'use client';

import Link from 'next/link';
import { Building2, Bot, GitBranch, CreditCard, ExternalLink, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkspaceOverview } from './types';

interface WorkspaceOverviewPanelProps {
  workspaces: WorkspaceOverview[];
}

function PipelineStatusDots({
  queued,
  running,
  completed,
  error,
}: {
  queued: number;
  running: number;
  completed: number;
  error: number;
}) {
  const total = queued + running + completed + error;

  if (total === 0) {
    return <span className="text-xs text-gray-400">파이프라인 없음</span>;
  }

  return (
    <div className="flex items-center gap-2 text-[10px]">
      {queued > 0 ? (
        <span className="flex items-center gap-0.5 text-gray-500">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
          {queued}
        </span>
      ) : null}
      {running > 0 ? (
        <span className="flex items-center gap-0.5 text-blue-600">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          {running}
        </span>
      ) : null}
      {completed > 0 ? (
        <span className="flex items-center gap-0.5 text-green-600">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          {completed}
        </span>
      ) : null}
      {error > 0 ? (
        <span className="flex items-center gap-0.5 text-red-600">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          {error}
        </span>
      ) : null}
    </div>
  );
}

function WorkspaceMiniCard({ ws }: { ws: WorkspaceOverview }) {
  const hasError = ws.pipeline_error > 0;

  return (
    <Link
      href={`/workspaces/${ws.id}`}
      className={cn(
        'group flex flex-col rounded-xl border p-4 transition-all hover:shadow-md',
        hasError
          ? 'border-red-200 bg-red-50/30 hover:border-red-300'
          : 'border-gray-200 bg-white hover:border-gray-300',
      )}
    >
      {/* Header: Name + error indicator */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50">
            <Building2 className="h-4 w-4 text-brand-600" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900 group-hover:text-brand-700">
              {ws.name}
            </p>
            {ws.description ? (
              <p className="max-w-[140px] truncate text-[10px] text-gray-400">
                {ws.description}
              </p>
            ) : null}
          </div>
        </div>
        {hasError ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
        ) : null}
      </div>

      {/* Stats Grid */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {/* Agents */}
        <div className="flex items-center gap-1.5 rounded-md bg-gray-50 px-2 py-1">
          <Bot className="h-3 w-3 text-gray-400" />
          <span className="text-xs text-gray-600">
            <span className="font-medium text-gray-900">{ws.active_agents}</span>
            /{ws.agent_count}
          </span>
        </div>

        {/* Credits */}
        <div className="flex items-center gap-1.5 rounded-md bg-gray-50 px-2 py-1">
          <CreditCard className="h-3 w-3 text-gray-400" />
          <span className="text-xs font-medium text-gray-900">
            {ws.credit_balance.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Pipeline Status */}
      <div className="mt-2 flex items-center gap-1.5">
        <GitBranch className="h-3 w-3 text-gray-400" />
        <PipelineStatusDots
          queued={ws.pipeline_queued}
          running={ws.pipeline_running}
          completed={ws.pipeline_completed}
          error={ws.pipeline_error}
        />
      </div>
    </Link>
  );
}

export function WorkspaceOverviewPanel({
  workspaces,
}: WorkspaceOverviewPanelProps) {
  const displayWorkspaces = workspaces.slice(0, 12);
  const hasMore = workspaces.length > 12;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">
          워크스페이스 현황
        </h3>
        <Link
          href="/workspaces"
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          전체보기
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {workspaces.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-12">
          <Building2 className="h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            아직 워크스페이스가 없습니다
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayWorkspaces.map((ws) => (
              <WorkspaceMiniCard key={ws.id} ws={ws} />
            ))}
          </div>
          {hasMore ? (
            <div className="mt-3 text-center">
              <Link
                href="/workspaces"
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                더보기 &rarr;
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
