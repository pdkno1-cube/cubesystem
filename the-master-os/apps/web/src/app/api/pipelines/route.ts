import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, handleApiError, type ApiErrorBody } from "@/lib/api-response";

// ── Types ──────────────────────────────────────────────────────────

interface PipelineSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  category:
    | "grant_factory"
    | "document_verification"
    | "osmu_marketing"
    | "auto_healing";
  total_executions: number;
  last_executed_at: string | null;
  status: "active" | "inactive" | "error";
  is_system: boolean;
}

interface PipelinesResponse {
  data: PipelineSummary[];
  total: number;
}

// ── GET /api/pipelines ──────────────────────────────────────────────

export async function GET(): Promise<
  NextResponse<PipelinesResponse | ApiErrorBody>
> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "인증이 필요합니다.", 401);
    }

    // Fetch pipelines (soft-delete 필터)
    const { data: pipelines, error: pipelinesError } = await supabase
      .from("pipelines")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (pipelinesError) {
      return apiError(
        "DB_ERROR",
        `파이프라인 조회 실패: ${pipelinesError.message}`,
        500,
      );
    }

    // Batch fetch all pipeline_executions in a single query (avoids N+1)
    const pipelineIds = (pipelines ?? []).map((p) => p.id as string);

    const { data: allExecutions, error: execError } = pipelineIds.length > 0
      ? await supabase
          .from("pipeline_executions")
          .select("pipeline_id, status, created_at")
          .in("pipeline_id", pipelineIds)
      : { data: [] as { pipeline_id: string; status: string; created_at: string }[], error: null };

    if (execError) {
      return apiError(
        "DB_ERROR",
        `실행 통계 조회 실패: ${execError.message}`,
        500,
      );
    }

    // Aggregate execution stats per pipeline in TypeScript
    interface PipelineStats {
      totalExecutions: number;
      runningCount: number;
      errorCount: number;
      lastExecutedAt: string | null;
    }

    const statsMap = new Map<string, PipelineStats>();

    for (const exec of allExecutions ?? []) {
      const pid = exec.pipeline_id as string;
      let stats = statsMap.get(pid);
      if (!stats) {
        stats = { totalExecutions: 0, runningCount: 0, errorCount: 0, lastExecutedAt: null };
        statsMap.set(pid, stats);
      }
      stats.totalExecutions += 1;

      const execStatus = exec.status as string;
      if (execStatus === "running") {
        stats.runningCount += 1;
      }
      if (execStatus === "error") {
        stats.errorCount += 1;
      }

      const createdAt = exec.created_at as string;
      if (!stats.lastExecutedAt || createdAt > stats.lastExecutedAt) {
        stats.lastExecutedAt = createdAt;
      }
    }

    // Build response using aggregated stats
    const data: PipelineSummary[] = (pipelines ?? []).map((pipeline) => {
      const pipelineId = pipeline.id as string;
      const stats = statsMap.get(pipelineId);

      let status: PipelineSummary["status"] = "inactive";
      if (stats && stats.runningCount > 0) {
        status = "active";
      } else if (stats && stats.errorCount > 0) {
        status = "error";
      }

      return {
        id: pipelineId,
        name: pipeline.name as string,
        slug: pipeline.slug as string,
        description: (pipeline.description as string) ?? "",
        category: pipeline.category as PipelineSummary["category"],
        total_executions: stats?.totalExecutions ?? 0,
        last_executed_at: stats?.lastExecutedAt ?? null,
        status,
        is_system: (pipeline.is_system as boolean) ?? false,
      };
    });

    return NextResponse.json({
      data,
      total: data.length,
    });
  } catch (error) {
    return handleApiError(error, "pipelines.GET");
  }
}
