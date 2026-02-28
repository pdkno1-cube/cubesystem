'use client';

import { useState } from 'react';
import {
  Bot,
  MoreVertical,
  ArrowRightLeft,
  Trash2,
  Eye,
  Building2,
  Braces,
  Zap,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';
import type { Database } from '@/types/database';

type AgentRow = Database['public']['Tables']['agents']['Row'];
type AssignmentRow = Database['public']['Tables']['agent_assignments']['Row'];

interface AgentWithAssignment extends AgentRow {
  agent_assignments?: Array<
    AssignmentRow & {
      workspaces?: {
        id: string;
        name: string;
        slug: string;
      } | null;
    }
  >;
}

interface AgentCardProps {
  agent: AgentWithAssignment;
  onAssign: (agentId: string) => void;
  onRelease: (agentId: string, workspaceId: string) => void;
  onDelete: (agentId: string) => void;
  onSelect: (agent: AgentWithAssignment) => void;
  onEditPrompt: (agent: AgentWithAssignment) => void;
  onExecute?: (agent: AgentWithAssignment) => void;
}

const CATEGORY_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  planning: {
    label: '기획토론',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
  },
  writing: {
    label: '사업계획서',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
  },
  marketing: {
    label: 'OSMU',
    color: 'text-pink-700',
    bgColor: 'bg-pink-50',
  },
  audit: {
    label: '감사행정',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
  },
  devops: {
    label: 'DevOps',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
  },
  ocr: {
    label: 'OCR',
    color: 'text-cyan-700',
    bgColor: 'bg-cyan-50',
  },
  scraping: {
    label: '스크래핑',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
  },
  analytics: {
    label: '분석',
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
  },
  finance: {
    label: '지주회사',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
  },
  general: {
    label: '일반',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
  },
};

const CATEGORY_ICON_COLORS: Record<string, string> = {
  planning: 'bg-purple-500',
  writing: 'bg-blue-500',
  marketing: 'bg-pink-500',
  audit: 'bg-amber-500',
  devops: 'bg-green-500',
  ocr: 'bg-cyan-500',
  scraping: 'bg-orange-500',
  analytics: 'bg-indigo-500',
  finance: 'bg-emerald-500',
  general: 'bg-gray-500',
};

type AgentPoolStatus = 'pool' | 'active' | 'paused';

function getAgentPoolStatus(
  agent: AgentWithAssignment
): AgentPoolStatus {
  const activeAssignment = agent.agent_assignments?.find((a) => a.is_active);
  if (!activeAssignment) {
    return 'pool';
  }
  if (
    activeAssignment.status === 'idle' ||
    activeAssignment.status === 'running'
  ) {
    return 'active';
  }
  return 'paused';
}

const STATUS_CONFIG: Record<
  AgentPoolStatus,
  { label: string; dotColor: string; textColor: string; bgColor: string }
> = {
  pool: {
    label: '미할당',
    dotColor: 'bg-gray-400',
    textColor: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  active: {
    label: '가동중',
    dotColor: 'bg-green-400',
    textColor: 'text-green-700',
    bgColor: 'bg-green-50',
  },
  paused: {
    label: '정지',
    dotColor: 'bg-red-400',
    textColor: 'text-red-700',
    bgColor: 'bg-red-50',
  },
};

export function AgentCard({
  agent,
  onAssign,
  onRelease,
  onDelete,
  onSelect,
  onEditPrompt,
  onExecute,
}: AgentCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const poolStatus = getAgentPoolStatus(agent);
  const statusConfig = STATUS_CONFIG[poolStatus] ?? STATUS_CONFIG.pool;
  const catConfig = CATEGORY_CONFIG[agent.category] ?? { label: '일반', color: 'text-gray-700', bgColor: 'bg-gray-50' };
  const iconColor = CATEGORY_ICON_COLORS[agent.category] ?? 'bg-gray-500';

  const activeAssignment = agent.agent_assignments?.find((a) => a.is_active);
  const workspaceName = (
    activeAssignment as typeof activeAssignment & {
      workspaces?: { name: string } | null;
    }
  )?.workspaces?.name;

  return (
    <div
      className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
      onClick={() => onSelect(agent)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(agent);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Top Row: Icon + Name + Menu */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg text-white',
              iconColor
            )}
          >
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-gray-900">
              {agent.name}
            </h3>
            <p className="truncate text-xs text-gray-500">
              {agent.description ?? agent.model}
            </p>
          </div>
        </div>

        <DropdownMenu.Root open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="rounded-md p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-50 min-w-[160px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
              sideOffset={4}
              align="end"
            >
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 outline-none hover:bg-gray-50"
                onSelect={(e) => {
                  e.preventDefault();
                  onSelect(agent);
                }}
              >
                <Eye className="h-4 w-4" />
                상세보기
              </DropdownMenu.Item>

              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 outline-none hover:bg-gray-50"
                onSelect={(e) => {
                  e.preventDefault();
                  onEditPrompt(agent);
                }}
              >
                <Braces className="h-4 w-4" />
                프롬프트 편집
              </DropdownMenu.Item>

              {onExecute && (
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-violet-700 outline-none hover:bg-violet-50"
                  onSelect={(e) => {
                    e.preventDefault();
                    onExecute(agent);
                  }}
                >
                  <Zap className="h-4 w-4" />
                  실행
                </DropdownMenu.Item>
              )}

              {poolStatus === 'pool' ? (
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 outline-none hover:bg-gray-50"
                  onSelect={(e) => {
                    e.preventDefault();
                    onAssign(agent.id);
                  }}
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  워크스페이스 할당
                </DropdownMenu.Item>
              ) : activeAssignment ? (
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 outline-none hover:bg-gray-50"
                  onSelect={(e) => {
                    e.preventDefault();
                    onRelease(agent.id, activeAssignment.workspace_id);
                  }}
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  풀로 회수
                </DropdownMenu.Item>
              ) : null}

              <DropdownMenu.Separator className="my-1 h-px bg-gray-100" />

              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 outline-none hover:bg-red-50"
                onSelect={(e) => {
                  e.preventDefault();
                  onDelete(agent.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
                삭제
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Badges */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Category Badge */}
        <span
          className={cn(
            'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium',
            catConfig.bgColor,
            catConfig.color
          )}
        >
          {catConfig.label}
        </span>

        {/* Status Badge */}
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium',
            statusConfig.bgColor,
            statusConfig.textColor
          )}
        >
          <span
            className={cn('h-1.5 w-1.5 rounded-full', statusConfig.dotColor)}
          />
          {statusConfig.label}
        </span>
      </div>

      {/* Workspace Assignment */}
      {workspaceName ? (
        <div className="mt-3 flex items-center gap-1.5 rounded-md bg-brand-50 px-2.5 py-1.5">
          <Building2 className="h-3 w-3 text-brand-600" />
          <span className="truncate text-xs font-medium text-brand-700">
            {workspaceName}
          </span>
        </div>
      ) : null}

      {/* Quick action buttons */}
      <div className="mt-3 flex gap-2">
        {/* Execute button */}
        {onExecute && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExecute(agent);
            }}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100"
          >
            <Zap className="h-3 w-3" />
            실행
          </button>
        )}
        {poolStatus === 'pool' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAssign(agent.id);
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100"
          >
            <ArrowRightLeft className="h-3 w-3" />
            배정
          </button>
        ) : activeAssignment ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRelease(agent.id, activeAssignment.workspace_id);
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
          >
            <ArrowRightLeft className="h-3 w-3" />
            해제
          </button>
        ) : null}
      </div>
    </div>
  );
}
