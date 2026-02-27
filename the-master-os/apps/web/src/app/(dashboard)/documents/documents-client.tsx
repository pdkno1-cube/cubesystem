'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Loader2,
  Search,
  FileText,
  Clock,
  XCircle,
  Archive,
} from 'lucide-react';
import { clsx } from 'clsx';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '../dashboard/stat-card';
import { UploadDialog } from './upload-dialog';
import { DocumentDetailPanel } from './document-detail-panel';
import type { DocumentReview } from './page';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentsClientProps {
  initialReviews: DocumentReview[];
  workspaceId: string;
}

type StatusFilter = 'all' | 'pending' | 'reviewing' | 'approved' | 'rejected' | 'archived';

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

const DEFAULT_STATUS_BADGE = { label: '대기', bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock } as const;

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string; icon: typeof Clock }> = {
  pending: DEFAULT_STATUS_BADGE,
  reviewing: { label: '검증중', bg: 'bg-blue-100', text: 'text-blue-700', icon: Loader2 },
  approved: { label: '승인', bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2 },
  rejected: { label: '반려', bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
  archived: { label: '아카이브', bg: 'bg-purple-100', text: 'text-purple-700', icon: Archive },
};

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '대기' },
  { key: 'reviewing', label: '검증중' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '반려' },
  { key: 'archived', label: '아카이브' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentsClient({
  initialReviews,
  workspaceId,
}: DocumentsClientProps) {
  const [reviews, setReviews] = useState<DocumentReview[]>(initialReviews);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReview, setSelectedReview] = useState<DocumentReview | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Sync initial data
  useEffect(() => {
    setReviews(initialReviews);
  }, [initialReviews]);

  // Fetch reviews from API
  const fetchReviews = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        workspace_id: workspaceId,
        limit: '100',
      });
      const resp = await fetch(`/api/documents?${params.toString()}`);
      if (resp.ok) {
        const body = await resp.json() as { data: DocumentReview[] };
        setReviews(body.data);
      }
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'documents.fetchReviews' } });
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  // Filter reviews
  const filteredReviews = useMemo(() => {
    let filtered = reviews;

    if (statusFilter !== 'all') {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.document_name.toLowerCase().includes(q) ||
          r.document_type.toLowerCase().includes(q),
      );
    }

    return filtered;
  }, [reviews, statusFilter, searchQuery]);

  // KPI calculations
  const totalCount = reviews.length;
  const approvedCount = reviews.filter((r) => r.status === 'approved').length;
  const approvalRate = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0;
  const issueCount = reviews.filter((r) => r.issues.length > 0).length;

  // Handlers
  const handleRowClick = useCallback((review: DocumentReview) => {
    setSelectedReview(review);
    setIsDetailOpen(true);
  }, []);

  const handleDetailClose = useCallback(() => {
    setIsDetailOpen(false);
    setSelectedReview(null);
  }, []);

  const handleDetailUpdated = useCallback(() => {
    handleDetailClose();
    void fetchReviews();
  }, [handleDetailClose, fetchReviews]);

  const handleUploaded = useCallback(() => {
    void fetchReviews();
  }, [fetchReviews]);

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-gray-900">문서검증</h1>
          <p className="text-sm text-gray-500">
            문서 업로드 → 자동 검증 → 분류 → 알림 파이프라인을 관리합니다
          </p>
        </div>
        <button
          onClick={() => { setIsUploadOpen(true); }}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Upload className="h-4 w-4" />
          문서 업로드
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={ClipboardCheck}
          label="총 검증 건"
          value={totalCount}
          suffix="건"
          color="brand"
        />
        <StatCard
          icon={CheckCircle2}
          label="승인률"
          value={approvalRate}
          suffix="%"
          subValue={`${approvedCount}/${totalCount} 건 승인`}
          color="green"
        />
        <StatCard
          icon={AlertTriangle}
          label="이슈 발견 건"
          value={issueCount}
          suffix="건"
          color="amber"
        />
      </div>

      {/* Filter + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status filter tabs */}
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          {FILTER_TABS.map((tab) => {
            const isActive = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setStatusFilter(tab.key); }}
                className={clsx(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); }}
            placeholder="문서 이름 검색..."
            className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {isLoading ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
          ) : null}
        </div>
      </div>

      {/* Document table */}
      {filteredReviews.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="검증된 문서가 없습니다"
          description={
            searchQuery || statusFilter !== 'all'
              ? '조건에 맞는 문서가 없습니다.'
              : '문서를 업로드하여 자동 검증을 시작하세요.'
          }
          action={!searchQuery && statusFilter === 'all' ? { label: '문서 업로드', onClick: () => { setIsUploadOpen(true); } } : undefined}
        />
      ) : (
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-[700px] w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">파일명</th>
              <th className="px-4 py-3 font-medium text-gray-600">문서 유형</th>
              <th className="px-4 py-3 font-medium text-gray-600">상태</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-center">이슈 수</th>
              <th className="px-4 py-3 font-medium text-gray-600">검증일</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-center">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {
              filteredReviews.map((review) => {
                const badge = STATUS_BADGE[review.status] ?? DEFAULT_STATUS_BADGE;
                const BadgeIcon = badge.icon;
                const dateStr = new Date(review.created_at).toLocaleDateString('ko-KR', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <tr
                    key={review.id}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => { handleRowClick(review); }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                        <span className="font-medium text-gray-900 truncate max-w-[200px]">
                          {review.document_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{review.document_type}</td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                          badge.bg,
                          badge.text,
                        )}
                      >
                        <BadgeIcon className="h-3 w-3" />
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {review.issues.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <AlertTriangle className="h-3 w-3" />
                          {review.issues.length}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{dateStr}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(review);
                        }}
                        className="rounded-lg px-3 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                      >
                        상세
                      </button>
                    </td>
                  </tr>
                );
              })
            }
          </tbody>
        </table>
      </div>
      )}

      {/* Upload Dialog */}
      <UploadDialog
        isOpen={isUploadOpen}
        workspaceId={workspaceId}
        onClose={() => { setIsUploadOpen(false); }}
        onUploaded={handleUploaded}
      />

      {/* Document Detail Panel */}
      <DocumentDetailPanel
        review={selectedReview}
        isOpen={isDetailOpen}
        onClose={handleDetailClose}
        onUpdated={handleDetailUpdated}
      />
    </div>
  );
}
