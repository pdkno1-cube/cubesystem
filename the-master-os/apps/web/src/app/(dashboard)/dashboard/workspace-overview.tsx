'use client';

import Link from 'next/link';
import { Building2, Bot, ExternalLink } from 'lucide-react';
import type { WorkspaceOverview } from './types';

interface WorkspaceOverviewPanelProps {
  workspaces: WorkspaceOverview[];
}

export function WorkspaceOverviewPanel({
  workspaces,
}: WorkspaceOverviewPanelProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">
          워크스페이스
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
        <div className="mt-8 flex flex-col items-center justify-center py-8">
          <Building2 className="h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            아직 워크스페이스가 없습니다
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              href={`/workspaces/${ws.id}`}
              className="flex items-center justify-between rounded-lg border border-gray-100 p-3 transition-colors hover:border-gray-200 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                  <Building2 className="h-4 w-4 text-brand-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {ws.name}
                  </p>
                  {ws.description ? (
                    <p className="mt-0.5 max-w-[200px] truncate text-xs text-gray-500">
                      {ws.description}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Bot className="h-3.5 w-3.5" />
                <span>
                  {ws.active_agents}/{ws.agent_count}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
