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
  threshold_exceeded?: boolean;
}

interface PatchAlertBody {
  workspace_id: string;
  threshold_percent?: number;
  alert_type?: "email" | "slack" | "both";
  is_enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toTypedAlert(alert: Record<string, unknown>): BudgetAlert {
  return {
    id: alert["id"] as string,
    workspace_id: alert["workspace_id"] as string,
    threshold_percent: Number(alert["threshold_percent"]),
    alert_type: alert["alert_type"] as BudgetAlert["alert_type"],
    is_enabled: alert["is_enabled"] as boolean,
    last_triggered_at: (alert["last_triggered_at"] as string | null) ?? null,
    created_at: alert["created_at"] as string,
  };
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

    const typedAlert = toTypedAlert(alert as unknown as Record<string, unknown>);

    return NextResponse.json({ alert: typedAlert });
  } catch (error) {
    return handleApiError(error, "billing.alerts.GET");
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/billing/alerts — 알림 설정 업데이트 + 임계치 초과 감지
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

    const typedAlert = toTypedAlert(alert as unknown as Record<string, unknown>);

    // -----------------------------------------------------------------
    // Threshold exceeded check — 크레딧 사용량이 임계치 이상이면
    // last_triggered_at을 업데이트하고 응답에 threshold_exceeded 포함
    // -----------------------------------------------------------------
    let thresholdExceeded = false;

    if (typedAlert.is_enabled && typedAlert.threshold_percent > 0) {
      const usageExceeded = await checkAndTriggerThreshold(
        supabase,
        body.workspace_id,
        typedAlert.threshold_percent,
        typedAlert.id,
      );
      thresholdExceeded = usageExceeded;
    }

    return NextResponse.json({
      alert: thresholdExceeded
        ? { ...typedAlert, last_triggered_at: new Date().toISOString() }
        : typedAlert,
      threshold_exceeded: thresholdExceeded,
    });
  } catch (error) {
    return handleApiError(error, "billing.alerts.PATCH");
  }
}

// ---------------------------------------------------------------------------
// Threshold check helper
// ---------------------------------------------------------------------------

/**
 * 워크스페이스의 현재 월 크레딧 사용 비율이 threshold_percent 이상이면
 * budget_alerts.last_triggered_at을 현재 시각으로 업데이트한다.
 *
 * @returns true if threshold was exceeded and trigger was recorded
 */
async function checkAndTriggerThreshold(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  thresholdPercent: number,
  alertId: string,
): Promise<boolean> {
  try {
    // 워크스페이스 크레딧 한도 조회
    const { data: limitRow } = await supabase
      .from("workspace_credit_limits")
      .select("monthly_limit")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const monthlyLimit = Number((limitRow as Record<string, unknown> | null)?.["monthly_limit"] ?? 0);

    if (monthlyLimit <= 0) {
      // 한도가 설정되지 않은 경우 — 임계치 체크 불가
      return false;
    }

    // 이번 달 사용량 조회
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: usageRows } = await supabase
      .from("credit_transactions")
      .select("amount")
      .eq("workspace_id", workspaceId)
      .eq("transaction_type", "usage")
      .gte("created_at", startOfMonth.toISOString());

    const totalUsed = (usageRows ?? []).reduce((sum: number, row: Record<string, unknown>) => {
      return sum + Math.abs(Number(row["amount"] ?? 0));
    }, 0);

    const usagePercent = (totalUsed / monthlyLimit) * 100;

    if (usagePercent >= thresholdPercent) {
      // 임계치 초과 — last_triggered_at 업데이트
      const { error: updateError } = await supabase
        .from("budget_alerts")
        .update({ last_triggered_at: new Date().toISOString() })
        .eq("id", alertId);

      if (updateError) {
        Sentry.captureException(updateError, {
          tags: { context: "billing.alerts.triggerThreshold" },
          extra: { workspaceId, usagePercent, thresholdPercent },
        });
      }

      // TODO: 실제 알림 발송 (이메일/Slack) 구현
      // 현재는 DB에 trigger 기록만 수행
      Sentry.addBreadcrumb({
        category: "billing.alert",
        message: `Budget threshold triggered: ${String(Math.round(usagePercent))}% >= ${String(thresholdPercent)}%`,
        level: "warning",
        data: { workspaceId, usagePercent, thresholdPercent },
      });

      return true;
    }

    return false;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { context: "billing.alerts.checkThreshold" },
      extra: { workspaceId, thresholdPercent },
    });
    return false;
  }
}
