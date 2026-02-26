'use client';

import { FileText, ExternalLink, Clock } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { AuditLog } from './types';

interface RecentAuditProps {
  logs: AuditLog[];
}

const SEVERITY_CONFIG: Record<
  string,
  { dotColor: string }
> = {
  info: { dotColor: 'bg-blue-400' },
  warning: { dotColor: 'bg-amber-400' },
  error: { dotColor: 'bg-red-400' },
  critical: { dotColor: 'bg-red-600' },
};

function formatAction(action: string): string {
  const actionMap: Record<string, string> = {
    'agent.create': '에이전트 생성',
    'agent.update': '에이전트 수정',
    'agent.delete': '에이전트 삭제',
    'agent.assign': '에이전트 할당',
    'agent.release': '에이전트 회수',
    'workspace.create': '워크스페이스 생성',
    'workspace.update': '워크스페이스 수정',
    'workspace.delete': '워크스페이스 삭제',
    'pipeline.start': '파이프라인 시작',
    'pipeline.complete': '파이프라인 완료',
    'pipeline.fail': '파이프라인 실패',
    'vault.access': '시크릿 접근',
    'vault.create': '시크릿 생성',
    'vault.rotate': '키 로테이션',
  };
  return actionMap[action] ?? action;
}

function formatResourceType(type: string): string {
  const typeMap: Record<string, string> = {
    agent: '에이전트',
    agent_assignment: '에이전트 할당',
    workspace: '워크스페이스',
    pipeline: '파이프라인',
    pipeline_execution: '파이프라인 실행',
    secret: '시크릿',
    credit: '크레딧',
  };
  return typeMap[type] ?? type;
}

export function RecentAudit({ logs }: RecentAuditProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">
          최근 감사 로그
        </h3>
        <Link
          href="/audit-logs"
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          전체보기
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {logs.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center py-8">
          <FileText className="h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            아직 기록된 로그가 없습니다
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {logs.map((log) => {
            const severityCfg =
              SEVERITY_CONFIG[log.severity] ?? { dotColor: 'bg-blue-400' };

            return (
              <div
                key={log.id}
                className="flex items-start gap-3 rounded-lg border border-gray-50 p-3 transition-colors hover:bg-gray-50"
              >
                <span
                  className={cn(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    severityCfg.dotColor
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {formatAction(log.action)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatResourceType(log.resource_type)}
                    {log.resource_id
                      ? ` (${log.resource_id.slice(0, 8)}...)`
                      : ''}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(log.created_at), {
                    addSuffix: true,
                    locale: ko,
                  })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
