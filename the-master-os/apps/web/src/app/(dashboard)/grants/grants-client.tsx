'use client';

import { useState, useCallback, useMemo } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  Search,
  RefreshCw,
  Play,
  ExternalLink,
  Loader2,
  FileText,
  TrendingUp,
  Clock,
  Trophy,
} from 'lucide-react';
import { clsx } from 'clsx';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorRetry } from '@/components/ui/error-retry';
import type { TenderSubmission } from './page';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | 'crawled' | 'eligible' | 'reviewing' | 'docs_ready' | 'submitted' | 'won' | 'lost';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'crawled', label: '탐색중' },
  { key: 'eligible', label: '검증중' },
  { key: 'reviewing', label: '검토중' },
  { key: 'docs_ready', label: '서류준비' },
  { key: 'submitted', label: '제출완료' },
  { key: 'won', label: '낙찰' },
];

const DEFAULT_GRANT_BADGE = { bg: 'bg-gray-100', text: 'text-gray-600', label: '초안' } as const;

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  draft: DEFAULT_GRANT_BADGE,
  crawled: { bg: 'bg-sky-100', text: 'text-sky-700', label: '탐색완료' },
  eligible: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: '적격' },
  reviewing: { bg: 'bg-amber-100', text: 'text-amber-700', label: '검토중' },
  docs_ready: { bg: 'bg-purple-100', text: 'text-purple-700', label: '서류준비' },
  submitted: { bg: 'bg-blue-100', text: 'text-blue-700', label: '제출완료' },
  won: { bg: 'bg-green-100', text: 'text-green-700', label: '낙찰' },
  lost: { bg: 'bg-red-100', text: 'text-red-700', label: '미낙찰' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) {
    return '-';
  }
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) {
    return '-';
  }
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function isDeadlineNear(dateStr: string | null): boolean {
  if (!dateStr) {
    return false;
  }
  const deadline = new Date(dateStr);
  const now = new Date();
  const diffDays = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 7;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GrantsClientProps {
  initialTenders: TenderSubmission[];
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// KPI Cards
// ---------------------------------------------------------------------------

function KpiCards({ tenders }: { tenders: TenderSubmission[] }) {
  const activeCount = tenders.filter(
    (t) => !['won', 'lost', 'draft'].includes(t.status),
  ).length;
  const inProgressCount = tenders.filter(
    (t) => ['eligible', 'reviewing', 'docs_ready', 'submitted'].includes(t.status),
  ).length;
  const wonCount = tenders.filter((t) => t.status === 'won').length;
  const totalResolved = tenders.filter(
    (t) => t.status === 'won' || t.status === 'lost',
  ).length;
  const winRate = totalResolved > 0 ? Math.round((wonCount / totalResolved) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-sky-600" />
          <p className="text-xs font-medium text-sky-600">활성 공고</p>
        </div>
        <p className="mt-2 text-3xl font-bold text-sky-800">{activeCount}</p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-600" />
          <p className="text-xs font-medium text-amber-600">진행중 입찰</p>
        </div>
        <p className="mt-2 text-3xl font-bold text-amber-800">{inProgressCount}</p>
      </div>

      <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-green-600" />
          <p className="text-xs font-medium text-green-600">낙찰률</p>
        </div>
        <p className="mt-2 text-3xl font-bold text-green-800">{winRate}%</p>
        <p className="mt-0.5 text-xs text-green-600">
          {wonCount}/{totalResolved} 건
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function GrantsClient({ initialTenders, workspaceId }: GrantsClientProps) {
  const [tenders, setTenders] = useState<TenderSubmission[]>(initialTenders);
  const [activeTab, setActiveTab] = useState<StatusFilter>('all');
  const [isCrawling, setIsCrawling] = useState(false);
  const [isRunningPipeline, setIsRunningPipeline] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Filtered tenders
  const filteredTenders = useMemo(() => {
    let result = tenders;
    if (activeTab !== 'all') {
      result = result.filter((t) => t.status === activeTab);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (t) =>
          t.tender_title.toLowerCase().includes(q) ||
          (t.organization ?? '').toLowerCase().includes(q) ||
          t.tender_id.toLowerCase().includes(q),
      );
    }
    return result;
  }, [tenders, activeTab, searchQuery]);

  // -- Fetch tenders (used for retry) --
  const fetchTenders = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setError(null);
    try {
      const resp = await fetch(
        `/api/grants?workspace_id=${encodeURIComponent(workspaceId)}`,
      );
      if (!resp.ok) {
        throw new Error('입찰 공고를 불러오는 데 실패했습니다.');
      }
      const body = await resp.json() as { data: TenderSubmission[] };
      setTenders(body.data);
    } catch (err) {
      Sentry.captureException(err, { tags: { context: 'grants.fetchTenders' } });
      setError('입찰 공고를 불러오는 중 오류가 발생했습니다.');
    }
  }, [workspaceId]);

  // -- Crawl trigger --
  const handleCrawl = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setIsCrawling(true);
    setError(null);
    try {
      const resp = await fetch('/api/grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          keywords: [],
          source: 'g2b',
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => null);
        const msg = (errBody as { error?: { message?: string } } | null)?.error?.message ?? '크롤링 실패';
        throw new Error(msg);
      }

      const body = await resp.json() as {
        data: { tenders: TenderSubmission[] };
      };

      if (body.data.tenders.length > 0) {
        setTenders((prev) => [...body.data.tenders, ...prev]);
      }

      // Refetch full list
      const refetch = await fetch(
        `/api/grants?workspace_id=${encodeURIComponent(workspaceId)}`,
      );
      if (refetch.ok) {
        const refetchBody = await refetch.json() as { data: TenderSubmission[] };
        setTenders(refetchBody.data);
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { context: 'grants.crawl' } });
      setError('공고 수집 중 오류가 발생했습니다.');
    } finally {
      setIsCrawling(false);
    }
  }, [workspaceId]);

  // -- Run pipeline on a specific tender --
  const handleRunPipeline = useCallback(
    async (tender: TenderSubmission) => {
      if (!workspaceId) {
        return;
      }
      setIsRunningPipeline(tender.id);
      try {
        // Execute grant-factory pipeline via the pipeline execute BFF
        const resp = await fetch('/api/pipelines/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipeline_id: '30000000-0000-0000-0000-000000000001',
            workspace_id: workspaceId,
            input_params: {
              tender_id: tender.tender_id,
              tender_title: tender.tender_title,
              tender_url: tender.tender_url,
              organization: tender.organization,
            },
          }),
        });

        if (!resp.ok) {
          const errBody = await resp.json().catch(() => null);
          const msg = (errBody as { error?: { message?: string } } | null)?.error?.message ?? '파이프라인 실행 실패';
          throw new Error(msg);
        }

        // Update tender status locally to "reviewing"
        setTenders((prev) =>
          prev.map((t) => {
            if (t.id === tender.id) {
              return { ...t, status: 'reviewing' };
            }
            return t;
          }),
        );
      } catch (pipelineError) {
        Sentry.captureException(pipelineError, {
          tags: { context: 'grants.runPipeline' },
        });
      } finally {
        setIsRunningPipeline(null);
      }
    },
    [workspaceId],
  );

  // -- Update status --
  const handleStatusUpdate = useCallback(
    async (id: string, newStatus: string) => {
      try {
        const resp = await fetch(`/api/grants/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });

        if (!resp.ok) {
          throw new Error('상태 업데이트 실패');
        }

        const body = await resp.json() as { data: TenderSubmission };
        setTenders((prev) =>
          prev.map((t) => {
            if (t.id === id) {
              return body.data;
            }
            return t;
          }),
        );
      } catch (statusError) {
        Sentry.captureException(statusError, {
          tags: { context: 'grants.statusUpdate' },
        });
      }
    },
    [],
  );

  if (error) {
    return <ErrorRetry message={error} onRetry={() => { void fetchTenders(); }} />;
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">조달입찰</h2>
          <p className="mt-1 text-gray-500">
            나라장터/G2B 공고 탐색, 적격 검증, 입찰 서류 자동 준비
          </p>
        </div>
        <button
          type="button"
          onClick={handleCrawl}
          disabled={isCrawling || !workspaceId}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCrawling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {isCrawling ? '크롤링 중...' : '공고 수집'}
        </button>
      </div>

      {/* KPI Cards */}
      <KpiCards tenders={tenders} />

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-1">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.key === 'all'
              ? tenders.length
              : tenders.filter((t) => t.status === tab.key).length;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setActiveTab(tab.key); }}
              className={clsx(
                'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'border-b-2 border-brand-600 text-brand-600'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {tab.label}
              <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); }}
          placeholder="공고명, 기관명, 공고번호로 검색..."
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Tenders table */}
      {filteredTenders.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="아직 조달 입찰 공고가 없습니다"
          description={
            tenders.length === 0
              ? '공고 수집 버튼을 클릭하여 나라장터 공고를 크롤링하세요.'
              : '해당 조건에 맞는 공고가 없습니다.'
          }
          action={tenders.length === 0 ? { label: '크롤링 시작', onClick: () => { void handleCrawl(); } } : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-[700px] w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  공고
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  기관
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  마감일
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  금액
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                  상태
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                  액션
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredTenders.map((tender) => {
                const badge = STATUS_BADGE[tender.status] ?? DEFAULT_GRANT_BADGE;
                const deadlineNear = isDeadlineNear(tender.deadline);

                return (
                  <tr key={tender.id} className="hover:bg-gray-50 transition-colors">
                    {/* Title + tender_id */}
                    <td className="max-w-xs px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {tender.tender_title}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {tender.tender_id}
                          </p>
                        </div>
                        {tender.tender_url ? (
                          <a
                            href={tender.tender_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-gray-400 hover:text-brand-600"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                    </td>

                    {/* Organization */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {tender.organization ?? '-'}
                    </td>

                    {/* Deadline */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={clsx(
                          deadlineNear
                            ? 'font-semibold text-red-600'
                            : 'text-gray-600',
                        )}
                      >
                        {formatDate(tender.deadline)}
                      </span>
                      {deadlineNear ? (
                        <span className="ml-1.5 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                          임박
                        </span>
                      ) : null}
                    </td>

                    {/* Bid amount */}
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-800">
                      {formatCurrency(tender.bid_amount)}
                    </td>

                    {/* Status badge */}
                    <td className="whitespace-nowrap px-4 py-3 text-center">
                      <span
                        className={clsx(
                          'inline-block rounded-full px-2.5 py-1 text-xs font-medium',
                          badge.bg,
                          badge.text,
                        )}
                      >
                        {badge.label}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="whitespace-nowrap px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* Run pipeline button */}
                        {['crawled', 'eligible'].includes(tender.status) ? (
                          <button
                            type="button"
                            onClick={() => { void handleRunPipeline(tender); }}
                            disabled={isRunningPipeline === tender.id}
                            title="Grant Factory 파이프라인 실행"
                            className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isRunningPipeline === tender.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                            분석
                          </button>
                        ) : null}

                        {/* Mark as submitted */}
                        {tender.status === 'docs_ready' ? (
                          <button
                            type="button"
                            onClick={() => { void handleStatusUpdate(tender.id, 'submitted'); }}
                            className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
                          >
                            <TrendingUp className="h-3.5 w-3.5" />
                            제출
                          </button>
                        ) : null}

                        {/* Won / Lost buttons for submitted */}
                        {tender.status === 'submitted' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => { void handleStatusUpdate(tender.id, 'won'); }}
                              className="rounded-md bg-green-100 px-2.5 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-200"
                            >
                              낙찰
                            </button>
                            <button
                              type="button"
                              onClick={() => { void handleStatusUpdate(tender.id, 'lost'); }}
                              className="rounded-md bg-red-100 px-2.5 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-200"
                            >
                              미낙찰
                            </button>
                          </>
                        ) : null}
                      </div>
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
