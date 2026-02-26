'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import * as Tabs from '@radix-ui/react-tabs';
import {
  ArrowLeft,
  Pencil,
  Archive,
  Bot,
  GitBranch,
  CreditCard,
  FileText,
  Building2,
  Truck,
  Monitor,
  UtensilsCrossed,
  ShoppingCart,
  Megaphone,
  Landmark,
  Briefcase,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { EditWorkspaceDialog } from '../edit-workspace-dialog';
import { cn } from '@/lib/utils';
import type { WorkspaceWithStats } from '@/types/workspace';
import type { Database } from '@/types/database';

type AgentAssignment = Database['public']['Tables']['agent_assignments']['Row'];
type PipelineExecution =
  Database['public']['Tables']['pipeline_executions']['Row'];
type CreditTransaction = Database['public']['Tables']['credits']['Row'];

// ── Icon map ───────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Building2,
  Truck,
  Monitor,
  UtensilsCrossed,
  ShoppingCart,
  Megaphone,
  Landmark,
  Briefcase,
};

const CATEGORY_LABELS: Record<string, string> = {
  logistics: '물류',
  it: 'IT',
  fnb: 'F&B',
  ecommerce: 'E-commerce',
  marketing: '마케팅',
  finance: '금융',
  other: '기타',
};

// ── Status config ──────────────────────────────────────────────────

const PIPELINE_STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  pending: { label: '대기', className: 'bg-yellow-100 text-yellow-800' },
  running: { label: '실행중', className: 'bg-blue-100 text-blue-800' },
  completed: { label: '완료', className: 'bg-green-100 text-green-800' },
  failed: { label: '실패', className: 'bg-red-100 text-red-800' },
  cancelled: { label: '취소', className: 'bg-gray-100 text-gray-800' },
  paused: { label: '일시정지', className: 'bg-orange-100 text-orange-800' },
};

const CREDIT_TYPE_LABELS: Record<string, string> = {
  charge: '충전',
  usage: '사용',
  refund: '환불',
  bonus: '보너스',
  adjustment: '조정',
};

// ── Component ──────────────────────────────────────────────────────

interface WorkspaceDetailClientProps {
  workspace: WorkspaceWithStats;
  agents: AgentAssignment[];
  pipelines: PipelineExecution[];
  credits: CreditTransaction[];
}

export function WorkspaceDetailClient({
  workspace,
  agents,
  pipelines,
  credits,
}: WorkspaceDetailClientProps) {
  const router = useRouter();
  const { archiveWorkspace } = useWorkspaceStore();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const Icon = workspace.icon && workspace.icon in ICON_MAP
    ? ICON_MAP[workspace.icon]!
    : Building2;

  const categoryLabel = workspace.category
    ? CATEGORY_LABELS[workspace.category] ?? '기타'
    : '기타';

  const handleArchive = useCallback(async () => {
    setIsArchiving(true);
    try {
      await archiveWorkspace(workspace.id);
      router.push('/workspaces');
    } finally {
      setIsArchiving(false);
    }
  }, [archiveWorkspace, workspace.id, router]);

  const formattedDate = new Date(workspace.created_at).toLocaleDateString(
    'ko-KR',
    { year: 'numeric', month: 'long', day: 'numeric' },
  );

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push('/workspaces')}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="워크스페이스 목록으로 돌아가기"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-sm text-gray-400">워크스페이스</span>
      </div>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-50">
            <Icon className="h-7 w-7 text-brand-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {workspace.name}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="info">{categoryLabel}</Badge>
              <span className="text-sm text-gray-500">{formattedDate}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsEditOpen(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            수정
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleArchive}
            isLoading={isArchiving}
          >
            <Archive className="h-3.5 w-3.5" />
            아카이브
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={Bot}
          label="할당된 에이전트"
          value={workspace.agent_count}
        />
        <StatCard
          icon={GitBranch}
          label="활성 파이프라인"
          value={workspace.active_pipeline_count}
        />
        <StatCard
          icon={CreditCard}
          label="크레딧 잔액"
          value={workspace.credit_balance.toLocaleString()}
        />
      </div>

      {/* Tabs */}
      <Tabs.Root defaultValue="overview">
        <Tabs.List className="flex gap-1 border-b border-gray-200">
          {[
            { value: 'overview', label: '개요', icon: FileText },
            { value: 'agents', label: '에이전트', icon: Bot },
            { value: 'pipelines', label: '파이프라인', icon: GitBranch },
            { value: 'credits', label: '크레딧', icon: CreditCard },
          ].map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className={cn(
                'flex items-center gap-1.5 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-gray-500 transition-colors',
                'hover:text-gray-700',
                'data-[state=active]:border-brand-600 data-[state=active]:text-brand-600',
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* Overview Tab */}
        <Tabs.Content value="overview" className="mt-6">
          <OverviewTab workspace={workspace} />
        </Tabs.Content>

        {/* Agents Tab */}
        <Tabs.Content value="agents" className="mt-6">
          <AgentsTab agents={agents} />
        </Tabs.Content>

        {/* Pipelines Tab */}
        <Tabs.Content value="pipelines" className="mt-6">
          <PipelinesTab pipelines={pipelines} />
        </Tabs.Content>

        {/* Credits Tab */}
        <Tabs.Content value="credits" className="mt-6">
          <CreditsTab
            credits={credits}
            balance={workspace.credit_balance}
          />
        </Tabs.Content>
      </Tabs.Root>

      {/* Edit Dialog */}
      <EditWorkspaceDialog
        workspace={workspace}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
      />
    </div>
  );
}

// ── Sub Components ─────────────────────────────────────────────────

function StatCard({
  icon: IconComp,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50">
          <IconComp className="h-5 w-5 text-gray-500" />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ workspace }: { workspace: WorkspaceWithStats }) {
  const categoryLabel = workspace.category
    ? CATEGORY_LABELS[workspace.category] ?? '기타'
    : '기타';
  const createdDate = new Date(workspace.created_at).toLocaleDateString(
    'ko-KR',
    { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-gray-900">기본 정보</h3>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-gray-500">이름</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">
              {workspace.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Slug</dt>
            <dd className="mt-1 text-sm font-mono text-gray-700">
              {workspace.slug}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">카테고리</dt>
            <dd className="mt-1">
              <Badge variant="info">{categoryLabel}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">생성일</dt>
            <dd className="mt-1 text-sm text-gray-700">{createdDate}</dd>
          </div>
          {workspace.description ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-gray-500">설명</dt>
              <dd className="mt-1 text-sm text-gray-700">
                {workspace.description}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-gray-900">설정</h3>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-700">
          {JSON.stringify(workspace.settings, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function AgentsTab({ agents }: { agents: AgentAssignment[] }) {
  const AGENT_STATUS_LABELS: Record<string, { label: string; className: string }> = {
    idle: { label: '대기', className: 'bg-gray-100 text-gray-700' },
    running: { label: '실행중', className: 'bg-green-100 text-green-700' },
    paused: { label: '일시정지', className: 'bg-yellow-100 text-yellow-700' },
    error: { label: '오류', className: 'bg-red-100 text-red-700' },
  };

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-12">
        <Bot className="h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">
          할당된 에이전트가 없습니다.
        </p>
        <p className="text-xs text-gray-400">
          에이전트 풀에서 에이전트를 할당해 보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              에이전트 ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              상태
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              할당일
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {agents.map((agent) => {
            const statusConfig = AGENT_STATUS_LABELS[agent.status] ?? {
              label: agent.status,
              className: 'bg-gray-100 text-gray-700',
            };
            return (
              <tr key={agent.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-700">
                  {agent.agent_id.slice(0, 8)}...
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                      statusConfig.className,
                    )}
                  >
                    {statusConfig.label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {new Date(agent.created_at).toLocaleDateString('ko-KR')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PipelinesTab({ pipelines }: { pipelines: PipelineExecution[] }) {
  if (pipelines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-12">
        <GitBranch className="h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">
          실행된 파이프라인이 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              상태
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              크레딧
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              소요 시간
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              실행일
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {pipelines.map((pe) => {
            const statusConfig = PIPELINE_STATUS_CONFIG[pe.status] ?? {
              label: pe.status,
              className: 'bg-gray-100 text-gray-800',
            };
            const durationText = pe.duration_ms
              ? pe.duration_ms > 60_000
                ? `${Math.round(pe.duration_ms / 60_000)}분`
                : `${Math.round(pe.duration_ms / 1_000)}초`
              : '-';

            return (
              <tr key={pe.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-700">
                  {pe.id.slice(0, 8)}...
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                      statusConfig.className,
                    )}
                  >
                    {statusConfig.label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                  {pe.total_credits.toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {durationText}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {new Date(pe.created_at).toLocaleDateString('ko-KR')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CreditsTab({
  credits,
  balance,
}: {
  credits: CreditTransaction[];
  balance: number;
}) {
  return (
    <div className="space-y-4">
      {/* Balance Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-xs text-gray-500">현재 잔액</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">
          {balance.toLocaleString()}{' '}
          <span className="text-base font-normal text-gray-500">크레딧</span>
        </p>
      </div>

      {/* Transaction History */}
      {credits.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-12">
          <CreditCard className="h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            크레딧 거래 내역이 없습니다.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  유형
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  금액
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  잔액
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  설명
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  날짜
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {credits.map((tx) => {
                const typeLabel =
                  CREDIT_TYPE_LABELS[tx.transaction_type] ??
                  tx.transaction_type;
                const isNegative =
                  tx.transaction_type === 'usage';

                return (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {typeLabel}
                    </td>
                    <td
                      className={cn(
                        'whitespace-nowrap px-4 py-3 text-sm font-medium',
                        isNegative ? 'text-red-600' : 'text-green-600',
                      )}
                    >
                      {isNegative ? '-' : '+'}
                      {Math.abs(tx.amount).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {tx.balance_after.toLocaleString()}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-sm text-gray-500">
                      {tx.description ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {new Date(tx.created_at).toLocaleDateString('ko-KR')}
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
