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
        typedAlert.alert_type,
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
// Notification dispatch — record alert trigger to budget_alert_notifications
// ---------------------------------------------------------------------------

interface AlertNotificationPayload {
  alert_id: string;
  workspace_id: string;
  threshold_percent: number;
  usage_percent: number;
  alert_type: BudgetAlert["alert_type"];
  triggered_at: string;
  notified: boolean;
}

/**
 * Records the budget alert notification in the `budget_alert_notifications` table
 * and adds a Sentry breadcrumb. Email/Slack delivery is handled by a separate
 * background worker or future integration.
 */
async function dispatchAlertNotification(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: AlertNotificationPayload,
): Promise<void> {
  const triggeredAt = payload.triggered_at;

  // Insert notification record into Supabase
  const { error: insertError } = await supabase
    .from("budget_alert_notifications")
    .insert({
      alert_id: payload.alert_id,
      workspace_id: payload.workspace_id,
      threshold_percent: payload.threshold_percent,
      usage_percent: Math.round(payload.usage_percent * 100) / 100,
      alert_type: payload.alert_type,
      triggered_at: triggeredAt,
      notified: true,
    });

  if (insertError) {
    // If the table doesn't exist yet, log via Sentry but don't crash
    Sentry.captureException(insertError, {
      tags: { context: "billing.alerts.dispatchNotification" },
      extra: {
        workspace_id: payload.workspace_id,
        threshold_percent: payload.threshold_percent,
        usage_percent: payload.usage_percent,
      },
    });
  }

  // Add Sentry breadcrumb for observability regardless of DB insert result
  Sentry.addBreadcrumb({
    category: "billing.alert.notification",
    message: `Budget alert dispatched: ${String(Math.round(payload.usage_percent))}% usage >= ${String(payload.threshold_percent)}% threshold`,
    level: "warning",
    data: {
      workspace_id: payload.workspace_id,
      alert_id: payload.alert_id,
      alert_type: payload.alert_type,
      threshold_percent: payload.threshold_percent,
      usage_percent: payload.usage_percent,
      triggered_at: triggeredAt,
    },
  });
}

// ---------------------------------------------------------------------------
// Threshold check helper
// ---------------------------------------------------------------------------

/**
 * 워크스페이스의 현재 월 크레딧 사용 비율이 threshold_percent 이상이면
 * budget_alerts.last_triggered_at을 현재 시각으로 업데이트하고
 * 알림 기록을 budget_alert_notifications 테이블에 저장한다.
 *
 * @returns true if threshold was exceeded and trigger was recorded
 */
async function checkAndTriggerThreshold(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  thresholdPercent: number,
  alertId: string,
  alertType: BudgetAlert["alert_type"],
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
      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from("budget_alerts")
        .update({ last_triggered_at: now })
        .eq("id", alertId);

      if (updateError) {
        Sentry.captureException(updateError, {
          tags: { context: "billing.alerts.triggerThreshold" },
          extra: { workspaceId, usagePercent, thresholdPercent },
        });
      }

      // Dispatch notification record
      await dispatchAlertNotification(supabase, {
        alert_id: alertId,
        workspace_id: workspaceId,
        threshold_percent: thresholdPercent,
        usage_percent: usagePercent,
        alert_type: alertType,
        triggered_at: now,
        notified: true,
      });

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
