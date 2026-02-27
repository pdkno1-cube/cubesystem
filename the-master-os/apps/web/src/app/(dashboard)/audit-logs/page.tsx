'use client';

import { useEffect, useState, useCallback } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  FileText,
  Filter,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  X,
  Calendar,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

// -- Types --
interface AuditLogEntry {
  id: string;
  workspace_id: string | null;
  workspace_name: string | null;
  user_id: string | null;
  user_name: string | null;
  agent_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  severity: 'info' | 'warning' | 'error' | 'critical';
  created_at: string;
}

// -- Severity badge metadata --
const SEVERITY_META: Record<string, { color: string; label: string }> = {
  info: { color: 'bg-blue-100 text-blue-700', label: '정보' },
  warning: { color: 'bg-yellow-100 text-yellow-700', label: '경고' },
  error: { color: 'bg-red-100 text-red-700', label: '에러' },
  critical: { color: 'bg-red-200 text-red-900', label: '치명적' },
};

// -- Action filter options (action type) --
const ACTION_TYPE_FILTERS = [
  { value: '', label: '전체 액션' },
  { value: 'CREATE', label: 'CREATE' },
  { value: 'READ', label: 'READ' },
  { value: 'UPDATE', label: 'UPDATE' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'EXECUTE', label: 'EXECUTE' },
  { value: 'vault', label: '볼트' },
  { value: 'auth', label: '인증' },
  { value: 'pipeline', label: '파이프라인' },
  { value: 'agent', label: '에이전트' },
  { value: 'workspace', label: '워크스페이스' },
];

const ITEMS_PER_PAGE = 20;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Filter states
  const [actionFilter, setActionFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [workspaceFilter, setWorkspaceFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Workspace list for filter dropdown
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);

  // ── Fetch workspaces for filter dropdown ──────────────────────

  useEffect(() => {
    const loadWorkspaces = async () => {
      try {
        const res = await fetch('/api/workspaces');
        if (res.ok) {
          const json = (await res.json()) as {
            data: Array<{ id: string; name: string }>;
          };
          setWorkspaces(json.data);
        }
      } catch (error) {
        Sentry.captureException(error, {
          tags: { context: 'audit-logs.workspaces.fetch' },
        });
      }
    };
    void loadWorkspaces();
  }, []);

  // ── Build query params ────────────────────────────────────────

  const buildParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(ITEMS_PER_PAGE),
    });
    if (actionFilter) {
      params.set('action', actionFilter);
    }
    if (severityFilter) {
      params.set('severity', severityFilter);
    }
    if (workspaceFilter) {
      params.set('workspace_id', workspaceFilter);
    }
    if (agentFilter.trim()) {
      params.set('agent_id', agentFilter.trim());
    }
    if (keyword.trim()) {
      params.set('keyword', keyword.trim());
    }
    if (dateFrom) {
      params.set('date_from', dateFrom);
    }
    if (dateTo) {
      params.set('date_to', dateTo);
    }
    return params;
  }, [page, actionFilter, severityFilter, workspaceFilter, agentFilter, keyword, dateFrom, dateTo]);

  // ── Fetch logs ────────────────────────────────────────────────

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = buildParams();
      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`감사 로그 조회 실패: ${res.status}`);
      }
      const json: { data: AuditLogEntry[]; total: number } = await res.json();
      setLogs(json.data);
      setTotal(json.total);
    } catch (err) {
      Sentry.captureException(err, { tags: { context: 'audit-logs.fetch' } });
    } finally {
      setIsLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  // ── CSV Export ────────────────────────────────────────────────

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = buildParams();
      // Remove pagination for export
      params.delete('page');
      params.delete('limit');

      const res = await fetch(`/api/audit-logs/export?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`CSV 내보내기 실패: ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      Sentry.captureException(err, { tags: { context: 'audit-logs.export' } });
    } finally {
      setIsExporting(false);
    }
  };

  // ── Reset filters ─────────────────────────────────────────────

  const resetFilters = () => {
    setActionFilter('');
    setSeverityFilter('');
    setWorkspaceFilter('');
    setAgentFilter('');
    setKeyword('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const hasActiveFilters =
    actionFilter !== '' ||
    severityFilter !== '' ||
    workspaceFilter !== '' ||
    agentFilter.trim() !== '' ||
    keyword.trim() !== '' ||
    dateFrom !== '' ||
    dateTo !== '';

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">감사 로그</h2>
          <p className="mt-1 text-gray-500">
            시스템 전체 액션 이력을 조회합니다
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleExport()}
          isLoading={isExporting}
          disabled={total === 0}
        >
          <Download className="h-4 w-4" />
          CSV 다운로드
        </Button>
      </div>

      {/* Filter bar */}
      <Card className="mt-6">
        <CardContent className="space-y-4 pt-6">
          {/* Row 1: Primary filters */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">필터:</span>
            </div>

            {/* Action type filter */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">액션 타입</label>
              <select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {ACTION_TYPE_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Severity filter */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">심각도</label>
              <select
                value={severityFilter}
                onChange={(e) => {
                  setSeverityFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">전체 심각도</option>
                <option value="info">정보</option>
                <option value="warning">경고</option>
                <option value="error">에러</option>
                <option value="critical">치명적</option>
              </select>
            </div>

            {/* Workspace filter */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">워크스페이스</label>
              <select
                value={workspaceFilter}
                onChange={(e) => {
                  setWorkspaceFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">전체 워크스페이스</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Agent filter */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">에이전트 ID</label>
              <input
                type="text"
                value={agentFilter}
                onChange={(e) => {
                  setAgentFilter(e.target.value);
                  setPage(1);
                }}
                placeholder="에이전트 ID"
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Row 2: Date range + keyword search */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-500">날짜 범위:</span>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">시작일</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">종료일</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {/* Keyword search */}
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-gray-500">키워드 검색</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value);
                    setPage(1);
                  }}
                  placeholder="액션, 리소스 타입 검색..."
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Reset filters */}
            {hasActiveFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="text-gray-500"
              >
                <X className="h-4 w-4" />
                초기화
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Audit log table */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>로그 목록 ({total}건)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton
                  key={`skel-${String(i)}`}
                  className="h-12 w-full"
                />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="감사 로그가 없습니다"
              description="필터 조건을 변경하거나, 시스템 활동이 기록되면 여기에 표시됩니다."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>액션</TableHead>
                    <TableHead>리소스</TableHead>
                    <TableHead>사용자/에이전트</TableHead>
                    <TableHead>워크스페이스</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>심각도</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const sevMeta = SEVERITY_META[log.severity] ?? {
                      color: 'bg-gray-100 text-gray-500',
                      label: log.severity,
                    };
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-xs text-gray-500">
                          {new Date(log.created_at).toLocaleString('ko-KR')}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.action}
                        </TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {log.resource_type}
                          {log.resource_id ? (
                            <span className="ml-1 font-mono text-gray-400">
                              {log.resource_id.slice(0, 8)}...
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.user_name ?? log.agent_id ?? '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.workspace_name ?? '시스템'}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-gray-400">
                          {log.ip_address ?? '-'}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sevMeta.color}`}
                          >
                            {sevMeta.label}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 ? (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    {total}건 중 {(page - 1) * ITEMS_PER_PAGE + 1}~
                    {Math.min(page * ITEMS_PER_PAGE, total)}건 표시
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      이전
                    </Button>
                    <span className="text-sm text-gray-700">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      다음
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
