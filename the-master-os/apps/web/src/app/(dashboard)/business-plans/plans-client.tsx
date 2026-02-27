'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import {
  BookOpen,
  Plus,
  Trash2,
  FileText,
  Loader2,
  Building2,
  Target,
  TrendingUp,
} from 'lucide-react';
import { clsx } from 'clsx';
import { EmptyState } from '@/components/ui/empty-state';
import type { BusinessPlanSummary } from './page';
import { CreatePlanWizard } from '@/components/business-plans/CreatePlanWizard';

// ── Helpers ────────────────────────────────────────────────────────────────

function formatKRW(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(1)}조`;
  }
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(0)}억`;
  }
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(0)}만`;
  }
  return `${value}`;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: '초안', color: 'bg-gray-100 text-gray-600' },
  generating: { label: '생성 중', color: 'bg-blue-100 text-blue-700' },
  completed: { label: '완료', color: 'bg-green-100 text-green-700' },
  exported: { label: '내보내기 완료', color: 'bg-purple-100 text-purple-700' },
};

// ── Plan Card ──────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  onDelete,
  isDeleting,
}: {
  plan: BusinessPlanSummary;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const statusConfig = STATUS_CONFIG[plan.status] ?? { label: '초안', color: 'bg-gray-100 text-gray-600' };
  const createdDate = new Date(plan.created_at).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="group relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-indigo-200">
      {/* Status badge */}
      <div className="flex items-center justify-between mb-3">
        <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-medium', statusConfig.color)}>
          {statusConfig.label}
        </span>
        <span className="text-xs text-gray-400">{createdDate}</span>
      </div>

      {/* Title */}
      <Link
        href={`/business-plans/${plan.id}`}
        className="block"
      >
        <h3 className="text-base font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
          {plan.title}
        </h3>
      </Link>

      {/* Meta info */}
      <div className="mt-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{plan.company_name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Target className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{plan.industry} / {plan.target_market}</span>
        </div>
        {plan.som_value > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <TrendingUp className="h-3.5 w-3.5 shrink-0" />
            <span>SOM {formatKRW(plan.som_value)}원</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        <Link
          href={`/business-plans/${plan.id}`}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
        >
          <FileText className="h-3.5 w-3.5" />
          상세 보기
        </Link>
        <button
          onClick={() => { onDelete(plan.id); }}
          disabled={isDeleting}
          className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          삭제
        </button>
      </div>
    </div>
  );
}

// ── Main Client Component ──────────────────────────────────────────────────

interface PlansClientProps {
  initialPlans: BusinessPlanSummary[];
  workspaceId: string;
}

export function PlansClient({ initialPlans, workspaceId }: PlansClientProps) {
  const [plans, setPlans] = useState<BusinessPlanSummary[]>(initialPlans);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const resp = await fetch(`/api/business-plans/${id}`, { method: 'DELETE' });
      if (resp.ok) {
        setPlans((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'business-plans.delete' } });
    } finally {
      setDeletingId(null);
    }
  }, []);

  const handleCreated = useCallback((newPlan: BusinessPlanSummary) => {
    setPlans((prev) => [newPlan, ...prev]);
    setIsWizardOpen(false);
  }, []);

  // Stats
  const totalPlans = plans.length;
  const completedPlans = plans.filter((p) => p.status === 'completed' || p.status === 'exported').length;
  const generatingPlans = plans.filter((p) => p.status === 'generating').length;

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-gray-900">사업계획서</h1>
          <p className="text-sm text-gray-500">
            AI가 10분 만에 전문적인 사업계획서를 생성합니다
          </p>
        </div>
        <button
          onClick={() => { setIsWizardOpen(true); }}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          새 사업계획서
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs text-gray-500">전체</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{totalPlans}</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-xs text-green-600">완료</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{completedPlans}</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs text-blue-600">생성 중</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">{generatingPlans}</p>
        </div>
      </div>

      {/* Plans Grid or Empty State */}
      {plans.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="사업계획서가 없습니다"
          description="AI로 10분 만에 전문적인 사업계획서를 생성해보세요."
          action={{ label: '새 계획서 작성', onClick: () => { setIsWizardOpen(true); } }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onDelete={handleDelete}
              isDeleting={deletingId === plan.id}
            />
          ))}
        </div>
      )}

      {/* Create Wizard Dialog */}
      <CreatePlanWizard
        isOpen={isWizardOpen}
        onClose={() => { setIsWizardOpen(false); }}
        onCreated={handleCreated}
        workspaceId={workspaceId}
      />
    </div>
  );
}
