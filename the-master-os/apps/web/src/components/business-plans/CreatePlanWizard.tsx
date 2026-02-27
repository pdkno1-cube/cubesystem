'use client';

import { useCallback, useState, type ChangeEvent, type FormEvent } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Building2,
  FileText,
  TrendingUp,
  Users,
  Plus,
  Trash2,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { BusinessPlanSummary } from '@/app/(dashboard)/business-plans/page';

// ── Types ──────────────────────────────────────────────────────────────────

interface Competitor {
  name: string;
  description: string;
}

interface WizardFormData {
  company_name: string;
  industry: string;
  target_market: string;
  company_description: string;
  tam_value: string;
  sam_value: string;
  som_value: string;
  competitors: Competitor[];
}

interface CreatePlanWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (plan: BusinessPlanSummary) => void;
  workspaceId: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STEP_LABELS = ['기본 정보', '회사 설명', '시장 규모', '경쟁사'] as const;

const STEP_ICONS = [Building2, FileText, TrendingUp, Users] as const;

const INDUSTRY_OPTIONS = [
  'IT/소프트웨어',
  '이커머스',
  '핀테크',
  '헬스케어',
  '에듀테크',
  '푸드테크',
  '물류/유통',
  '제조',
  '부동산/프롭테크',
  '엔터테인먼트',
  '환경/에너지',
  '기타',
] as const;

// ── Number formatting ──────────────────────────────────────────────────────

function parseNumericString(value: string): number {
  return Number(value.replace(/[^0-9]/g, '')) || 0;
}

function formatNumberInput(value: string): string {
  const num = parseNumericString(value);
  if (num === 0) {
    return '';
  }
  return num.toLocaleString('ko-KR');
}

function formatDisplayKRW(value: string): string {
  const num = parseNumericString(value);
  if (num === 0) {
    return '';
  }
  if (num >= 1_000_000_000_000) {
    return `(${(num / 1_000_000_000_000).toFixed(1)}조원)`;
  }
  if (num >= 100_000_000) {
    return `(${(num / 100_000_000).toFixed(0)}억원)`;
  }
  if (num >= 10_000) {
    return `(${(num / 10_000).toFixed(0)}만원)`;
  }
  return `(${num}원)`;
}

// ── Wizard Component ───────────────────────────────────────────────────────

export function CreatePlanWizard({
  isOpen,
  onClose,
  onCreated,
  workspaceId,
}: CreatePlanWizardProps) {
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<WizardFormData>({
    company_name: '',
    industry: '',
    target_market: '',
    company_description: '',
    tam_value: '',
    sam_value: '',
    som_value: '',
    competitors: [{ name: '', description: '' }],
  });

  const resetForm = useCallback(() => {
    setStep(0);
    setFormData({
      company_name: '',
      industry: '',
      target_market: '',
      company_description: '',
      tam_value: '',
      sam_value: '',
      som_value: '',
      competitors: [{ name: '', description: '' }],
    });
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const handleFieldChange = useCallback(
    (field: keyof Omit<WizardFormData, 'competitors'>) =>
      (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const val = e.target.value;
        setFormData((prev) => ({ ...prev, [field]: val }));
      },
    [],
  );

  const handleNumericChange = useCallback(
    (field: 'tam_value' | 'sam_value' | 'som_value') =>
      (e: ChangeEvent<HTMLInputElement>) => {
        const formatted = formatNumberInput(e.target.value);
        setFormData((prev) => ({ ...prev, [field]: formatted }));
      },
    [],
  );

  const handleCompetitorChange = useCallback(
    (index: number, field: keyof Competitor) =>
      (e: ChangeEvent<HTMLInputElement>) => {
        setFormData((prev) => {
          const updated = [...prev.competitors];
          const existing = updated[index];
          if (existing) {
            updated[index] = { ...existing, [field]: e.target.value };
          }
          return { ...prev, competitors: updated };
        });
      },
    [],
  );

  const addCompetitor = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      competitors: [...prev.competitors, { name: '', description: '' }],
    }));
  }, []);

  const removeCompetitor = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      competitors: prev.competitors.filter((_, i) => i !== index),
    }));
  }, []);

  const canProceed = useCallback((): boolean => {
    switch (step) {
      case 0:
        return formData.company_name.trim().length > 0
          && formData.industry.trim().length > 0
          && formData.target_market.trim().length > 0;
      case 1:
        return formData.company_description.trim().length > 0;
      case 2:
        return true; // TAM/SAM/SOM optional
      case 3:
        return true; // competitors optional
      default:
        return false;
    }
  }, [step, formData]);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const competitors = formData.competitors
        .filter((c) => c.name.trim().length > 0)
        .map((c) => ({ name: c.name, description: c.description }));

      const resp = await fetch('/api/business-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          company_name: formData.company_name.trim(),
          industry: formData.industry.trim(),
          target_market: formData.target_market.trim(),
          company_description: formData.company_description.trim(),
          tam_value: parseNumericString(formData.tam_value),
          sam_value: parseNumericString(formData.sam_value),
          som_value: parseNumericString(formData.som_value),
          competitors,
        }),
      });

      if (!resp.ok) {
        const errorBody = await resp.json() as { error?: { message?: string } };
        throw new Error(errorBody.error?.message ?? 'Failed to create business plan');
      }

      const result = await resp.json() as { data: BusinessPlanSummary };
      onCreated(result.data);
      resetForm();
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'business-plans.create' } });
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, workspaceId, onCreated, resetForm]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">새 사업계획서 만들기</h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-6 pt-4">
          {STEP_LABELS.map((label, i) => {
            const Icon = STEP_ICONS[i] ?? Building2;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={label} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={clsx(
                    'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : isDone
                        ? 'bg-indigo-100 text-indigo-600'
                        : 'bg-gray-100 text-gray-400',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span
                  className={clsx(
                    'text-[10px] font-medium',
                    isActive ? 'text-indigo-600' : 'text-gray-400',
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Form content */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 min-h-[260px]">
            {/* Step 1: Basic Info */}
            {step === 0 && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    회사명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.company_name}
                    onChange={handleFieldChange('company_name')}
                    placeholder="예: 큐브시스템"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    산업 분류 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.industry}
                    onChange={handleFieldChange('industry')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">산업을 선택하세요</option>
                    {INDUSTRY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    타겟 시장 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.target_market}
                    onChange={handleFieldChange('target_market')}
                    placeholder="예: 중소기업 대표, 1인 기업가"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Company Description */}
            {step === 1 && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    회사/서비스 설명 <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    회사의 핵심 가치, 제공하는 서비스, 차별점 등을 자유롭게 작성해주세요
                  </p>
                  <textarea
                    value={formData.company_description}
                    onChange={handleFieldChange('company_description')}
                    placeholder="예: AI 기반 마케팅 자동화 SaaS를 제공합니다. 기존 솔루션 대비 10배 빠른 콘텐츠 생성이 가능하며..."
                    rows={6}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    {formData.company_description.length}/1000자
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: TAM-SAM-SOM */}
            {step === 2 && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-gray-500">
                  시장 규모를 원 단위로 입력하세요. 자동으로 억/조 단위로 변환됩니다.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    TAM (전체 시장 규모)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.tam_value}
                      onChange={handleNumericChange('tam_value')}
                      placeholder="예: 10,000,000,000,000"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none pr-20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-500 font-medium">
                      {formatDisplayKRW(formData.tam_value)}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SAM (서비스 가능 시장)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.sam_value}
                      onChange={handleNumericChange('sam_value')}
                      placeholder="예: 2,000,000,000,000"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none pr-20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-500 font-medium">
                      {formatDisplayKRW(formData.sam_value)}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SOM (획득 가능 시장)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.som_value}
                      onChange={handleNumericChange('som_value')}
                      placeholder="예: 100,000,000,000"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none pr-20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-500 font-medium">
                      {formatDisplayKRW(formData.som_value)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Competitors */}
            {step === 3 && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-gray-500">
                  주요 경쟁사를 추가하세요. (선택 사항)
                </p>
                <div className="max-h-[240px] overflow-y-auto space-y-3 pr-1">
                  {formData.competitors.map((comp, i) => (
                    <div key={i} className="flex gap-2">
                      <div className="flex-1 space-y-1.5">
                        <input
                          type="text"
                          value={comp.name}
                          onChange={handleCompetitorChange(i, 'name')}
                          placeholder="경쟁사명"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                        <input
                          type="text"
                          value={comp.description}
                          onChange={handleCompetitorChange(i, 'description')}
                          placeholder="특징 / 차별점"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      {formData.competitors.length > 1 && (
                        <button
                          type="button"
                          onClick={() => { removeCompetitor(i); }}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors self-center"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addCompetitor}
                  className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  <Plus className="h-4 w-4" />
                  경쟁사 추가
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={() => { setStep((s) => Math.max(0, s - 1)); }}
              disabled={step === 0}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                step === 0
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-600 hover:bg-gray-100',
              )}
            >
              <ChevronLeft className="h-4 w-4" />
              이전
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={() => { setStep((s) => Math.min(3, s + 1)); }}
                disabled={!canProceed()}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  canProceed()
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed',
                )}
              >
                다음
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    생성 중...
                  </>
                ) : (
                  '생성 시작'
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
