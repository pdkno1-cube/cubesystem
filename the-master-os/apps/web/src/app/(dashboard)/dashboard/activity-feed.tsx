'use client';

import Link from 'next/link';
import {
  GitBranch,
  Bot,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Building2,
  Key,
  RotateCcw,
  FileText,
  ExternalLink,
  Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { AuditLog } from './types';

interface ActivityFeedProps {
  logs: AuditLog[];
}

interface ActionConfig {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  label: string;
}

const ACTION_CONFIG_MAP: Record<string, ActionConfig> = {
  'pipeline.start': {
    icon: GitBranch,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    label: '파이프라인 시작',
  },
  'pipeline.complete': {
    icon: CheckCircle2,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-50',
    label: '파이프라인 완료',
  },
  'pipeline.fail': {
    icon: XCircle,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-50',
    label: '파이프라인 실패',
  },
  'agent.assign': {
    icon: Bot,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-50',
    label: '에이전트 할당',
  },
  'agent.release': {
    icon: Bot,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-50',
    label: '에이전트 회수',
  },
  'agent.create': {
    icon: Bot,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-50',
    label: '에이전트 생성',
  },
  'agent.delete': {
    icon: Bot,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-50',
    label: '에이전트 삭제',
  },
  'vault.access': {
    icon: Shield,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-50',
    label: '시크릿 접근',
  },
  'vault.create': {
    icon: Key,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    label: '시크릿 생성',
  },
  'vault.rotate': {
    icon: RotateCcw,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50',
    label: '키 로테이션',
  },
  'workspace.create': {
    icon: Building2,
    iconColor: 'text-brand-600',
    iconBg: 'bg-brand-50',
    label: '워크스페이스 생성',
  },
  'workspace.update': {
    icon: Building2,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    label: '워크스페이스 수정',
  },
  'workspace.delete': {
    icon: Building2,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-50',
    label: '워크스페이스 삭제',
  },
};

const SEVERITY_BORDER: Record<string, string> = {
  info: 'border-l-blue-300',
  warning: 'border-l-amber-400',
  error: 'border-l-red-400',
  critical: 'border-l-red-600',
};

const DEFAULT_CONFIG: ActionConfig = {
  icon: FileText,
  iconColor: 'text-gray-500',
  iconBg: 'bg-gray-50',
  label: '활동',
};

function formatResourceInfo(log: AuditLog): string {
  const details = log.details;
  if (typeof details === 'object' && details !== null) {
    const name = (details as Record<string, unknown>).name;
    if (typeof name === 'string') {
      return name;
    }
    const agentName = (details as Record<string, unknown>).agent_name;
    if (typeof agentName === 'string') {
      return agentName;
    }
  }
  if (log.resource_id) {
    return log.resource_id.slice(0, 8) + '...';
  }
  return '';
}

export function ActivityFeed({ logs }: ActivityFeedProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">
          최근 활동 피드
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
            아직 기록된 활동이 없습니다
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {logs.map((log) => {
            const config = ACTION_CONFIG_MAP[log.action] ?? DEFAULT_CONFIG;
            const Icon = config.icon;
            const severityBorder = SEVERITY_BORDER[log.severity] ?? 'border-l-gray-200';
            const resourceInfo = formatResourceInfo(log);

            return (
              <div
                key={log.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border border-gray-50 border-l-2 p-3 transition-colors hover:bg-gray-50',
                  severityBorder,
                )}
              >
                <div
                  className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                    config.iconBg,
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5', config.iconColor)} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {config.label}
                  </p>
                  {resourceInfo ? (
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {resourceInfo}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(log.created_at), {
                    addSuffix: true,
                    locale: ko,
                  })}
                </div>

                {log.severity === 'error' || log.severity === 'critical' ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
