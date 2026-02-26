"use client";

import { useEffect, useState } from "react";
import { GitBranch, Clock, Activity, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

// -- Types --
interface PipelineSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  total_executions: number;
  last_executed_at: string | null;
  status: "active" | "inactive" | "error";
  is_system: boolean;
}

// -- 카테고리별 아이콘/색상 맵 --
const CATEGORY_META: Record<string, { color: string; label: string }> = {
  grant_factory: { color: "bg-blue-100 text-blue-700", label: "정부조달" },
  document_verification: { color: "bg-emerald-100 text-emerald-700", label: "서류검증" },
  osmu_marketing: { color: "bg-purple-100 text-purple-700", label: "OSMU" },
  auto_healing: { color: "bg-orange-100 text-orange-700", label: "Auto-Heal" },
};

// -- 상태 뱃지 --
const STATUS_META: Record<string, { color: string; label: string }> = {
  active: { color: "bg-green-100 text-green-700", label: "가동중" },
  inactive: { color: "bg-gray-100 text-gray-500", label: "대기" },
  error: { color: "bg-red-100 text-red-700", label: "에러" },
};

function PipelineCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-4 w-full" />
      </CardHeader>
    </Card>
  );
}

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<PipelineSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchPipelines() {
      try {
        const res = await fetch("/api/pipelines");
        if (!res.ok) {
          throw new Error(`파이프라인 목록 조회 실패: ${res.status}`);
        }
        const json: { data: PipelineSummary[]; total: number } = await res.json();
        setPipelines(json.data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "알 수 없는 에러";
        console.error("[PipelinesPage] fetchPipelines 실패:", message);
      } finally {
        setIsLoading(false);
      }
    }
    void fetchPipelines();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">파이프라인 모니터</h2>
          <p className="mt-1 text-gray-500">
            4대 핵심 파이프라인 실행 현황을 모니터링합니다
          </p>
        </div>
      </div>

      {/* 로딩 상태 */}
      {isLoading ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <PipelineCardSkeleton key={`skeleton-${String(i)}`} />
          ))}
        </div>
      ) : pipelines.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="등록된 파이프라인이 없습니다"
          description="파이프라인을 생성하여 에이전트 워크플로우를 자동화하세요."
        />
      ) : (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {pipelines.map((pipeline) => {
            const categoryMeta = CATEGORY_META[pipeline.category] ?? {
              color: "bg-gray-100 text-gray-700",
              label: pipeline.category,
            };
            const statusMeta = STATUS_META[pipeline.status] ?? {
              color: "bg-gray-100 text-gray-500",
              label: pipeline.status,
            };

            return (
              <Card key={pipeline.id} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${categoryMeta.color}`}
                    >
                      {categoryMeta.label}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusMeta.color}`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>
                  <CardTitle className="mt-2">{pipeline.name}</CardTitle>
                  <CardDescription>{pipeline.description}</CardDescription>
                </CardHeader>
                <CardFooter className="flex items-center gap-6 text-sm text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-4 w-4" />
                    <span>실행 {pipeline.total_executions}회</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    <span>
                      {pipeline.last_executed_at
                        ? new Date(pipeline.last_executed_at).toLocaleDateString("ko-KR")
                        : "미실행"}
                    </span>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Phase 2 안내 */}
      <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <AlertCircle className="h-4 w-4" />
          <span>파이프라인 실행 기능은 Phase 2에서 구현됩니다</span>
        </div>
      </div>
    </div>
  );
}
