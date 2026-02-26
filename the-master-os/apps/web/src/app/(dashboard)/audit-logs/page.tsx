"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

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
  severity: "info" | "warning" | "error" | "critical";
  created_at: string;
}

// -- 심각도 뱃지 --
const SEVERITY_META: Record<string, { color: string; label: string }> = {
  info: { color: "bg-blue-100 text-blue-700", label: "정보" },
  warning: { color: "bg-yellow-100 text-yellow-700", label: "경고" },
  error: { color: "bg-red-100 text-red-700", label: "에러" },
  critical: { color: "bg-red-200 text-red-900", label: "치명적" },
};

// -- 액션 필터 옵션 --
const ACTION_FILTERS = [
  { value: "", label: "전체" },
  { value: "workspace", label: "워크스페이스" },
  { value: "agent", label: "에이전트" },
  { value: "pipeline", label: "파이프라인" },
  { value: "vault", label: "시크릿 볼트" },
  { value: "auth", label: "인증" },
];

const ITEMS_PER_PAGE = 20;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(ITEMS_PER_PAGE),
      });
      if (actionFilter) {
        params.set("action", actionFilter);
      }
      if (severityFilter) {
        params.set("severity", severityFilter);
      }

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`감사 로그 조회 실패: ${res.status}`);
      }
      const json: { data: AuditLogEntry[]; total: number } = await res.json();
      setLogs(json.data);
      setTotal(json.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : "알 수 없는 에러";
      console.error("[AuditLogsPage] fetchLogs 실패:", message);
    } finally {
      setIsLoading(false);
    }
  }, [page, actionFilter, severityFilter]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">감사 로그</h2>
      <p className="mt-1 text-gray-500">시스템 전체 액션 이력을 조회합니다</p>

      {/* 필터 바 */}
      <Card className="mt-6">
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">필터:</span>
          </div>

          {/* 액션 유형 필터 */}
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {ACTION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          {/* 심각도 필터 */}
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
        </CardContent>
      </Card>

      {/* 감사 로그 테이블 */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>로그 목록 ({total}건)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={`skel-${String(i)}`} className="h-12 w-full" />
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
                      color: "bg-gray-100 text-gray-500",
                      label: log.severity,
                    };
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-xs text-gray-500">
                          {new Date(log.created_at).toLocaleString("ko-KR")}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{log.action}</TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {log.resource_type}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.user_name ?? log.agent_id ?? "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.workspace_name ?? "시스템"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-gray-400">
                          {log.ip_address ?? "-"}
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

              {/* 페이지네이션 */}
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
