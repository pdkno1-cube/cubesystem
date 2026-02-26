'use client';

import { GitBranch, Clock, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { PipelineExecution } from './types';

interface RecentPipelinesProps {
  executions: PipelineExecution[];
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  pending: { label: '대기', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  running: {
    label: '실행중',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
  },
  completed: {
    label: '완료',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
  },
  failed: { label: '실패', color: 'text-red-700', bgColor: 'bg-red-50' },
  cancelled: {
    label: '취소',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  paused: {
    label: '일시정지',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
  },
};

export function RecentPipelines({ executions }: RecentPipelinesProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">
          최근 파이프라인 실행
        </h3>
        <Link
          href="/pipelines"
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          전체보기
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {executions.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center py-8">
          <GitBranch className="h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            아직 실행된 파이프라인이 없습니다
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="pb-2 text-left text-xs font-medium text-gray-500">
                  이름
                </th>
                <th className="pb-2 text-left text-xs font-medium text-gray-500">
                  워크스페이스
                </th>
                <th className="pb-2 text-left text-xs font-medium text-gray-500">
                  상태
                </th>
                <th className="pb-2 text-right text-xs font-medium text-gray-500">
                  시작일
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {executions.map((exec) => {
                const statusCfg =
                  STATUS_CONFIG[exec.status] ?? { label: '대기', color: 'text-gray-600', bgColor: 'bg-gray-100' };
                const pipelineName =
                  (
                    exec.pipelines as {
                      name: string;
                    } | null
                  )?.name ?? '알 수 없음';
                const wsName =
                  (
                    exec.workspaces as {
                      name: string;
                    } | null
                  )?.name ?? '-';

                return (
                  <tr key={exec.id} className="group">
                    <td className="py-2.5 text-sm font-medium text-gray-900">
                      {pipelineName}
                    </td>
                    <td className="py-2.5 text-sm text-gray-500">{wsName}</td>
                    <td className="py-2.5">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium',
                          statusCfg.bgColor,
                          statusCfg.color
                        )}
                      >
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <span className="flex items-center justify-end gap-1 text-xs text-gray-400">
                        <Clock className="h-3 w-3" />
                        {exec.started_at
                          ? formatDistanceToNow(new Date(exec.started_at), {
                              addSuffix: true,
                              locale: ko,
                            })
                          : '-'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
