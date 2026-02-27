import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { apiError, handleApiError, type ApiErrorBody } from "@/lib/api-response";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BudgetAlert {
  id: string;
  workspace_id: string;
  threshold_percent: number;
  alert_type: "email" | "slack" | "both";
  is_enabled: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

interface AlertsResponse {
  alert: BudgetAlert | null;
}

interface PatchAlertBody {
  workspace_id: string;
  threshold_percent?: number;
  alert_type?: "email" | "slack" | "both";
  is_enabled?: boolean;
}

// ---------------------------------------------------------------------------
// GET /api/billing/alerts — 예산 알림 설정 조회
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse<AlertsResponse | ApiErrorBody>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "인증이 필요합니다.", 401);
    }

    const workspaceId = request.nextUrl.searchParams.get("workspace_id");

    if (!workspaceId) {
      return apiError("VALIDATION_ERROR", "workspace_id가 필요합니다.", 400);
    }

    const { data: alert, error } = await supabase
      .from("budget_alerts")
      .select("id, workspace_id, threshold_percent, alert_type, is_enabled, last_triggered_at, created_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (error) {
      Sentry.captureException(error, { tags: { context: "billing.alerts.GET" } });
      return apiError("DB_ERROR", `알림 설정 조회 실패: ${error.message}`, 500);
    }

    if (!alert) {
      return NextResponse.json({ alert: null });
    }

    const typedAlert: BudgetAlert = {
      id: alert.id as string,
      workspace_id: alert.workspace_id as string,
      threshold_percent: Number(alert.threshold_percent),
      alert_type: alert.alert_type as BudgetAlert["alert_type"],
      is_enabled: alert.is_enabled as boolean,
      last_triggered_at: (alert.last_triggered_at as string | null) ?? null,
      created_at: alert.created_at as string,
    };

    return NextResponse.json({ alert: typedAlert });
  } catch (error) {
    return handleApiError(error, "billing.alerts.GET");
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/billing/alerts — 알림 설정 업데이트
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
): Promise<NextResponse<AlertsResponse | ApiErrorBody>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "인증이 필요합니다.", 401);
    }

    const body = (await request.json()) as PatchAlertBody;

    if (!body.workspace_id) {
      return apiError("VALIDATION_ERROR", "workspace_id가 필요합니다.", 400);
    }

    // Validate threshold_percent
    if (
      body.threshold_percent !== undefined &&
      (body.threshold_percent < 1 || body.threshold_percent > 100)
    ) {
      return apiError(
        "VALIDATION_ERROR",
        "threshold_percent는 1~100 사이여야 합니다.",
        400,
      );
    }

    // Validate alert_type
    const validAlertTypes = ["email", "slack", "both"] as const;
    if (
      body.alert_type !== undefined &&
      !validAlertTypes.includes(body.alert_type)
    ) {
      return apiError(
        "VALIDATION_ERROR",
        "alert_type은 email, slack, both 중 하나여야 합니다.",
        400,
      );
    }

    // Build upsert payload
    const upsertPayload: Record<string, unknown> = {
      workspace_id: body.workspace_id,
    };

    if (body.threshold_percent !== undefined) {
      upsertPayload["threshold_percent"] = body.threshold_percent;
    }
    if (body.alert_type !== undefined) {
      upsertPayload["alert_type"] = body.alert_type;
    }
    if (body.is_enabled !== undefined) {
      upsertPayload["is_enabled"] = body.is_enabled;
    }

    const { data: alert, error } = await supabase
      .from("budget_alerts")
      .upsert(upsertPayload, { onConflict: "workspace_id" })
      .select("id, workspace_id, threshold_percent, alert_type, is_enabled, last_triggered_at, created_at")
      .single();

    if (error) {
      Sentry.captureException(error, { tags: { context: "billing.alerts.PATCH" } });
      return apiError("DB_ERROR", `알림 설정 저장 실패: ${error.message}`, 500);
    }

    const typedAlert: BudgetAlert = {
      id: alert.id as string,
      workspace_id: alert.workspace_id as string,
      threshold_percent: Number(alert.threshold_percent),
      alert_type: alert.alert_type as BudgetAlert["alert_type"],
      is_enabled: alert.is_enabled as boolean,
      last_triggered_at: (alert.last_triggered_at as string | null) ?? null,
      created_at: alert.created_at as string,
    };

    return NextResponse.json({ alert: typedAlert });
  } catch (error) {
    return handleApiError(error, "billing.alerts.PATCH");
  }
}
