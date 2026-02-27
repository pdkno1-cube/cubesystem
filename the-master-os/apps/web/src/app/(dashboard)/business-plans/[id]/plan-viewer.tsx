'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import {
  ArrowLeft,
  Download,
  Pencil,
  Check,
  X,
  Loader2,
  Building2,
  Target,
  Lightbulb,
  BarChart3,
  Users,
  Calendar,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { MarketSizeChart } from '@/components/business-plans/MarketSizeChart';
import type { BusinessPlanDetail } from './page';

// ── Types ──────────────────────────────────────────────────────────────────

interface FinancialProjection {
  years?: string[];
  revenue?: number[];
  cost?: number[];
  profit?: number[];
}

interface MarketAnalysis {
  tam?: number;
  sam?: number;
  som?: number;
  description?: string;
}

interface TimelineMilestone {
  quarter?: string;
  label?: string;
}

interface TimelineData {
  milestones?: TimelineMilestone[];
}

interface PlanSections {
  executive_summary?: string;
  problem?: string;
  solution?: string;
  market_analysis?: MarketAnalysis;
  business_model?: string;
  financial_projection?: FinancialProjection;
  team?: string;
  timeline?: TimelineData;
}

type EditableSectionKey = 'executive_summary' | 'problem' | 'solution' | 'business_model' | 'team';

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

// ── Financial Bar Chart Data ───────────────────────────────────────────────

function buildFinancialChartData(projection: FinancialProjection) {
  const years = projection.years ?? [];
  const revenue = projection.revenue ?? [];
  const cost = projection.cost ?? [];
  const profit = projection.profit ?? [];

  return years.map((year, i) => ({
    name: year,
    매출: (revenue[i] ?? 0) / 100_000_000,
    비용: (cost[i] ?? 0) / 100_000_000,
    이익: (profit[i] ?? 0) / 100_000_000,
  }));
}

// ── Section Wrapper ────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  icon: typeof Building2;
  children: React.ReactNode;
  className?: string;
}

function Section({ title, icon: Icon, children, className }: SectionProps) {
  return (
    <div className={clsx('rounded-xl border border-gray-200 bg-white p-6', className)}>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
          <Icon className="h-4 w-4 text-indigo-600" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ── Editable Text Section ──────────────────────────────────────────────────

interface EditableTextSectionProps {
  title: string;
  icon: typeof Building2;
  sectionKey: EditableSectionKey;
  content: string;
  onSave: (key: EditableSectionKey, value: string) => Promise<void>;
}

function EditableTextSection({
  title,
  icon: Icon,
  sectionKey,
  content,
  onSave,
}: EditableTextSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave(sectionKey, editValue);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }, [sectionKey, editValue, onSave]);

  const handleCancel = useCallback(() => {
    setEditValue(content);
    setIsEditing(false);
  }, [content]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
            <Icon className="h-4 w-4 text-indigo-600" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        </div>
        {!isEditing ? (
          <button
            onClick={() => { setIsEditing(true); }}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            편집
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              저장
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              취소
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <textarea
          value={editValue}
          onChange={(e) => { setEditValue(e.target.value); }}
          rows={6}
          className="w-full rounded-lg border border-indigo-200 px-3 py-2.5 text-sm text-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-y"
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
          {content || '내용이 없습니다'}
        </p>
      )}
    </div>
  );
}

// ── Custom Financial Tooltip ───────────────────────────────────────────────

interface FinancialTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function FinancialTooltip({ active, payload, label }: FinancialTooltipProps) {
  if (!active || !payload) {
    return null;
  }
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-sm font-semibold text-gray-800 mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: {entry.value >= 0 ? '' : '-'}{formatKRW(Math.abs(entry.value) * 100_000_000)}원
        </p>
      ))}
    </div>
  );
}

// ── PlanViewer (main) ──────────────────────────────────────────────────────

interface PlanViewerProps {
  plan: BusinessPlanDetail;
}

export function PlanViewer({ plan }: PlanViewerProps) {
  const [sections, setSections] = useState<PlanSections>(plan.sections as PlanSections);
  const [isExporting, setIsExporting] = useState(false);

  const handleSaveSection = useCallback(
    async (key: EditableSectionKey, value: string) => {
      const updatedSections = { ...sections, [key]: value };
      setSections(updatedSections);

      try {
        await fetch(`/api/business-plans/${plan.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sections: updatedSections }),
        });
      } catch (error) {
        Sentry.captureException(error, {
          tags: { context: 'business-plans.section.save' },
        });
      }
    },
    [sections, plan.id],
  );

  const handleExport = useCallback(() => {
    setIsExporting(true);
    window.open(`/api/business-plans/${plan.id}/export`, '_blank');
    // Brief delay to show loading state
    setTimeout(() => { setIsExporting(false); }, 1000);
  }, [plan.id]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const marketAnalysis = (sections.market_analysis ?? {}) as MarketAnalysis;
  const financialProjection = (sections.financial_projection ?? {}) as FinancialProjection;
  const timeline = (sections.timeline ?? {}) as TimelineData;
  const competitors = plan.competitors ?? [];
  const financialChartData = buildFinancialChartData(financialProjection);

  const createdDate = new Date(plan.created_at).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:hidden">
        <div className="flex items-start gap-3">
          <Link
            href="/business-plans"
            className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{plan.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {plan.company_name} | {plan.industry} | {plan.target_market} | {createdDate}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            PDF 저장
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            HTML 내보내기
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-5">
        {/* 1. Executive Summary */}
        <EditableTextSection
          title="1. Executive Summary"
          icon={Building2}
          sectionKey="executive_summary"
          content={String(sections.executive_summary ?? '')}
          onSave={handleSaveSection}
        />

        {/* 2. Problem */}
        <EditableTextSection
          title="2. 문제 정의"
          icon={AlertCircle}
          sectionKey="problem"
          content={String(sections.problem ?? '')}
          onSave={handleSaveSection}
        />

        {/* 3. Solution */}
        <EditableTextSection
          title="3. 솔루션"
          icon={Lightbulb}
          sectionKey="solution"
          content={String(sections.solution ?? '')}
          onSave={handleSaveSection}
        />

        {/* 4. Market Analysis — TAM/SAM/SOM Chart */}
        <Section title="4. 시장 분석 (TAM-SAM-SOM)" icon={Target}>
          <MarketSizeChart
            tam={marketAnalysis.tam ?? plan.tam_value}
            sam={marketAnalysis.sam ?? plan.sam_value}
            som={marketAnalysis.som ?? plan.som_value}
          />
          {marketAnalysis.description && (
            <p className="mt-4 text-sm text-gray-700">{marketAnalysis.description}</p>
          )}
        </Section>

        {/* 5. Competitors */}
        <Section title="5. 경쟁사 분석" icon={Users}>
          {competitors.length === 0 ? (
            <p className="text-sm text-gray-400">등록된 경쟁사 정보가 없습니다</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {competitors.map((comp, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-4"
                >
                  <p className="text-sm font-semibold text-gray-800">{comp.name}</p>
                  {comp.description && (
                    <p className="mt-1 text-xs text-gray-500">{comp.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 6. Business Model */}
        <EditableTextSection
          title="6. 비즈니스 모델"
          icon={DollarSign}
          sectionKey="business_model"
          content={String(sections.business_model ?? '')}
          onSave={handleSaveSection}
        />

        {/* 7. Financial Projection — BarChart */}
        <Section title="7. 재무 전망 (3개년)" icon={BarChart3}>
          {financialChartData.length === 0 ? (
            <p className="text-sm text-gray-400">재무 전망 데이터가 없습니다</p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financialChartData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickFormatter={(v: number) => `${v}억`}
                  />
                  <Tooltip content={<FinancialTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px' }}
                    iconType="circle"
                  />
                  <Bar dataKey="매출" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="비용" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="이익" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Financial table */}
          {financialChartData.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">기간</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">매출</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">비용</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">이익</th>
                  </tr>
                </thead>
                <tbody>
                  {financialChartData.map((row) => (
                    <tr key={row.name} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-800">{row.name}</td>
                      <td className="px-3 py-2 text-right text-indigo-600">
                        {formatKRW(row['매출'] * 100_000_000)}원
                      </td>
                      <td className="px-3 py-2 text-right text-amber-600">
                        {formatKRW(row['비용'] * 100_000_000)}원
                      </td>
                      <td
                        className={clsx(
                          'px-3 py-2 text-right font-medium',
                          row['이익'] >= 0 ? 'text-green-600' : 'text-red-600',
                        )}
                      >
                        {row['이익'] < 0 ? '-' : ''}{formatKRW(Math.abs(row['이익']) * 100_000_000)}원
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* 8. Team */}
        <EditableTextSection
          title="8. 팀 구성"
          icon={Users}
          sectionKey="team"
          content={String(sections.team ?? '')}
          onSave={handleSaveSection}
        />

        {/* 9. Timeline */}
        <Section title="9. 타임라인" icon={Calendar}>
          {(!timeline.milestones || timeline.milestones.length === 0) ? (
            <p className="text-sm text-gray-400">타임라인 데이터가 없습니다</p>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-indigo-100" />
              <div className="flex flex-col gap-4">
                {timeline.milestones.map((m, i) => (
                  <div key={i} className="flex items-start gap-4 pl-1">
                    <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                      {i + 1}
                    </div>
                    <div className="flex-1 rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <span className="text-xs font-semibold text-indigo-600">
                        {m.quarter ?? ''}
                      </span>
                      <p className="mt-0.5 text-sm text-gray-700">
                        {m.label ?? ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
