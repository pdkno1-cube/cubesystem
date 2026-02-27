'use client';

import { useState, useCallback, useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  X,
  Bot,
  Building2,
  ArrowRightLeft,
  Cpu,
  Tag,
  CreditCard,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { AgentScorecard } from './AgentScorecard';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/stores/agent-store';
import type { Database } from '@/types/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

type AgentPoolStatus = 'pool' | 'active' | 'paused';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAgentPoolStatus(agent: AgentWithAssignment): AgentPoolStatus {
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

const STATUS_BADGE: Record<
  AgentPoolStatus,
  { label: string; color: string; bg: string; dot: string }
> = {
  pool: {
    label: '미할당',
    color: 'text-gray-600',
    bg: 'bg-gray-100',
    dot: 'bg-gray-400',
  },
  active: {
    label: '가동중',
    color: 'text-green-700',
    bg: 'bg-green-50',
    dot: 'bg-green-400',
  },
  paused: {
    label: '정지',
    color: 'text-red-700',
    bg: 'bg-red-50',
    dot: 'bg-red-400',
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  planning: '기획토론',
  writing: '사업계획서',
  marketing: 'OSMU',
  audit: '감사행정',
  devops: 'DevOps',
  ocr: 'OCR',
  scraping: '스크래핑',
  analytics: '분석',
  finance: '지주회사',
  general: '일반',
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

interface CreditSummary {
  totalCredits: number;
  executionCount: number;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AgentDetailPanelProps {
  agent: AgentWithAssignment;
  workspaces: Workspace[];
  onClose: () => void;
  onAssigned: () => void;
  onReleased: () => void;
}

export function AgentDetailPanel({
  agent,
  workspaces,
  onClose,
  onAssigned,
  onReleased,
}: AgentDetailPanelProps) {
  const { assignAgent, releaseAgent } = useAgentStore();

  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [creditSummary, setCreditSummary] = useState<CreditSummary>({
    totalCredits: 0,
    executionCount: 0,
    loading: true,
  });

  const poolStatus = getAgentPoolStatus(agent);
  const statusBadge = STATUS_BADGE[poolStatus];
  const categoryLabel = CATEGORY_LABELS[agent.category] ?? '일반';
  const iconColor = CATEGORY_ICON_COLORS[agent.category] ?? 'bg-gray-500';

  const activeAssignment = agent.agent_assignments?.find((a) => a.is_active);
  const assignedWorkspace = (
    activeAssignment as typeof activeAssignment & {
      workspaces?: { id: string; name: string; slug: string } | null;
    }
  )?.workspaces;

  // Fetch credit summary (audit logs for this agent)
  useEffect(() => {
    let cancelled = false;

    async function fetchCredits() {
      try {
        const res = await fetch(`/api/agents/${agent.id}`);
        if (!res.ok) {
          throw new Error('Failed to fetch agent details');
        }

        // We estimate credit usage from cost_per_run * approximate pipeline step count
        // In a real system this would query pipeline_steps table
        const costPerRun = agent.cost_per_run ?? 0;
        const hasAssignments = (agent.agent_assignments ?? []).length;

        if (!cancelled) {
          setCreditSummary({
            totalCredits: costPerRun * hasAssignments,
            executionCount: hasAssignments,
            loading: false,
          });
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags: { context: 'agent.detail.credits' },
        });
        if (!cancelled) {
          setCreditSummary({
            totalCredits: 0,
            executionCount: 0,
            loading: false,
          });
        }
      }
    }

    void fetchCredits();

    return () => {
      cancelled = true;
    };
  }, [agent.id, agent.cost_per_run, agent.agent_assignments]);

  const handleAssign = useCallback(
    async (workspaceId: string) => {
      setAssignLoading(true);
      try {
        await assignAgent(agent.id, workspaceId);
        setShowAssignDropdown(false);
        onAssigned();
      } catch (err) {
        Sentry.captureException(err, {
          tags: { context: 'agent.detail.assign' },
        });
      } finally {
        setAssignLoading(false);
      }
    },
    [agent.id, assignAgent, onAssigned]
  );

  const handleRelease = useCallback(async () => {
    if (!activeAssignment) {
      return;
    }
    setReleaseLoading(true);
    try {
      await releaseAgent(agent.id, activeAssignment.workspace_id);
      onReleased();
    } catch (err) {
      Sentry.captureException(err, {
        tags: { context: 'agent.detail.release' },
      });
    } finally {
      setReleaseLoading(false);
    }
  }, [agent.id, activeAssignment, releaseAgent, onReleased]);

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">에이전트 상세</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Agent Identity */}
        <div className="border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white',
                iconColor
              )}
            >
              <Bot className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-bold text-gray-900">
                {agent.name}
              </h3>
              <p className="mt-0.5 truncate text-sm text-gray-500">
                {agent.display_name}
              </p>
            </div>
          </div>

          {agent.description ? (
            <p className="mt-3 text-sm text-gray-600">{agent.description}</p>
          ) : null}

          {/* Badges */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                statusBadge.bg,
                statusBadge.color
              )}
            >
              <span
                className={cn('h-1.5 w-1.5 rounded-full', statusBadge.dot)}
              />
              {statusBadge.label}
            </span>
            <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {categoryLabel}
            </span>
            {agent.is_system ? (
              <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                시스템
              </span>
            ) : null}
          </div>
        </div>

        {/* Model Information */}
        <div className="border-b border-gray-100 px-6 py-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <Cpu className="h-3.5 w-3.5" />
            모델 정보
          </h4>
          <div className="space-y-2">
            <DetailRow label="프로바이더" value={agent.model_provider} />
            <DetailRow label="모델" value={agent.model} />
            <DetailRow label="슬러그" value={agent.slug} />
          </div>
        </div>

        {/* Workspace Assignment */}
        <div className="border-b border-gray-100 px-6 py-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <Building2 className="h-3.5 w-3.5" />
            워크스페이스 배정
          </h4>

          {assignedWorkspace ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg bg-brand-50 px-4 py-3">
                <Building2 className="h-5 w-5 text-brand-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-brand-800">
                    {assignedWorkspace.name}
                  </p>
                  <p className="text-xs text-brand-600">
                    {assignedWorkspace.slug}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRelease}
                disabled={releaseLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
              >
                {releaseLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="h-4 w-4" />
                )}
                풀로 회수
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                현재 배정된 워크스페이스가 없습니다.
              </p>

              {/* Assign dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAssignDropdown(!showAssignDropdown)}
                  disabled={assignLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                >
                  {assignLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="h-4 w-4" />
                  )}
                  워크스페이스 배정
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform',
                      showAssignDropdown ? 'rotate-180' : ''
                    )}
                  />
                </button>

                {showAssignDropdown ? (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                    {workspaces.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-500">
                        사용 가능한 워크스페이스가 없습니다.
                      </p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto">
                        {workspaces.map((ws) => (
                          <button
                            key={ws.id}
                            type="button"
                            onClick={() => void handleAssign(ws.id)}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                          >
                            <Building2 className="h-4 w-4 text-gray-400" />
                            <span className="truncate">{ws.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Credit Summary */}
        <div className="border-b border-gray-100 px-6 py-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <CreditCard className="h-3.5 w-3.5" />
            크레딧 소비 이력
          </h4>

          {creditSummary.loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              불러오는 중...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-500">실행당 비용</p>
                <p className="mt-1 text-lg font-bold text-gray-900">
                  {agent.cost_per_run}
                  <span className="ml-0.5 text-xs font-normal text-gray-500">
                    크레딧
                  </span>
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-500">총 배정 횟수</p>
                <p className="mt-1 text-lg font-bold text-gray-900">
                  {creditSummary.executionCount}
                  <span className="ml-0.5 text-xs font-normal text-gray-500">
                    회
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Scorecard */}
        <AgentScorecard agentId={agent.id} />

        {/* Metadata */}
        <div className="px-6 py-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <Tag className="h-3.5 w-3.5" />
            메타데이터
          </h4>
          <div className="space-y-2">
            <DetailRow label="ID" value={agent.id} mono />
            <DetailRow
              label="생성일"
              value={formatDate(agent.created_at)}
            />
            <DetailRow
              label="수정일"
              value={formatDate(agent.updated_at)}
            />
            <DetailRow
              label="활성 상태"
              value={agent.is_active ? '활성' : '비활성'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span
        className={cn(
          'max-w-[200px] truncate text-xs font-medium text-gray-900',
          mono ? 'font-mono' : ''
        )}
      >
        {value}
      </span>
    </div>
  );
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return isoStr;
  }
}
