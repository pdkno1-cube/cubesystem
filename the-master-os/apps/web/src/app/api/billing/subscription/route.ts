import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { apiError, handleApiError, type ApiErrorBody } from "@/lib/api-response";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkspaceSubscription {
  id: string;
  workspace_id: string;
  plan_id: string;
  plan_name: string;
  plan_slug: string;
  credits_per_month: number;
  price_usd: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: "active" | "cancelled" | "past_due" | "trialing";
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

interface SubscriptionResponse {
  subscription: WorkspaceSubscription | null;
}

interface CreateSubscriptionBody {
  workspace_id: string;
  plan_slug: string;
}

interface CheckoutSimulationResponse {
  message: string;
  checkout_url: string | null;
  subscription: WorkspaceSubscription;
}

interface CancelResponse {
  message: string;
  subscription: WorkspaceSubscription;
}

// ---------------------------------------------------------------------------
// GET /api/billing/subscription — 현재 구독 상태
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse<SubscriptionResponse | ApiErrorBody>> {
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

    const { data: sub, error } = await supabase
      .from("workspace_subscriptions")
      .select(`
        id, workspace_id, plan_id,
        stripe_customer_id, stripe_subscription_id,
        status, current_period_start, current_period_end,
        created_at, updated_at,
        subscription_plans (name, slug, credits_per_month, price_usd)
      `)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (error) {
      Sentry.captureException(error, { tags: { context: "billing.subscription.GET" } });
      return apiError("DB_ERROR", `구독 조회 실패: ${error.message}`, 500);
    }

    if (!sub) {
      return NextResponse.json({ subscription: null });
    }

    const plan = sub.subscription_plans as unknown as {
      name: string;
      slug: string;
      credits_per_month: number;
      price_usd: number;
    } | null;

    const subscription: WorkspaceSubscription = {
      id: sub.id as string,
      workspace_id: sub.workspace_id as string,
      plan_id: sub.plan_id as string,
      plan_name: plan?.name ?? "Unknown",
      plan_slug: plan?.slug ?? "unknown",
      credits_per_month: Number(plan?.credits_per_month ?? 0),
      price_usd: Number(plan?.price_usd ?? 0),
      stripe_customer_id: (sub.stripe_customer_id as string | null) ?? null,
      stripe_subscription_id: (sub.stripe_subscription_id as string | null) ?? null,
      status: sub.status as WorkspaceSubscription["status"],
      current_period_start: (sub.current_period_start as string | null) ?? null,
      current_period_end: (sub.current_period_end as string | null) ?? null,
      created_at: sub.created_at as string,
      updated_at: sub.updated_at as string,
    };

    return NextResponse.json({ subscription });
  } catch (error) {
    return handleApiError(error, "billing.subscription.GET");
  }
}

// ---------------------------------------------------------------------------
// POST /api/billing/subscription — 구독 생성/변경 (Stripe Checkout 시뮬레이션)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<CheckoutSimulationResponse | ApiErrorBody>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "인증이 필요합니다.", 401);
    }

    const body = (await request.json()) as CreateSubscriptionBody;

    if (!body.workspace_id || !body.plan_slug) {
      return apiError(
        "VALIDATION_ERROR",
        "workspace_id와 plan_slug가 필요합니다.",
        400,
      );
    }

    // 플랜 조회
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("id, name, slug, credits_per_month, price_usd")
      .eq("slug", body.plan_slug)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return apiError("NOT_FOUND", "해당 플랜을 찾을 수 없습니다.", 404);
    }

    // 현재 기간 (시뮬레이션: 현재~30일 후)
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 30);

    // Upsert 구독 (workspace_id unique)
    const { data: sub, error: upsertError } = await supabase
      .from("workspace_subscriptions")
      .upsert(
        {
          workspace_id: body.workspace_id,
          plan_id: plan.id as string,
          stripe_customer_id: `cus_simulated_${body.workspace_id.slice(0, 8)}`,
          stripe_subscription_id: `sub_simulated_${crypto.randomUUID().slice(0, 8)}`,
          status: "active" as const,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
        },
        { onConflict: "workspace_id" },
      )
      .select("id, workspace_id, plan_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end, created_at, updated_at")
      .single();

    if (upsertError || !sub) {
      Sentry.captureException(upsertError, { tags: { context: "billing.subscription.POST" } });
      return apiError("DB_ERROR", `구독 생성 실패: ${upsertError?.message ?? "unknown"}`, 500);
    }

    const subscription: WorkspaceSubscription = {
      id: sub.id as string,
      workspace_id: sub.workspace_id as string,
      plan_id: sub.plan_id as string,
      plan_name: plan.name as string,
      plan_slug: plan.slug as string,
      credits_per_month: Number(plan.credits_per_month),
      price_usd: Number(plan.price_usd),
      stripe_customer_id: (sub.stripe_customer_id as string | null) ?? null,
      stripe_subscription_id: (sub.stripe_subscription_id as string | null) ?? null,
      status: sub.status as WorkspaceSubscription["status"],
      current_period_start: (sub.current_period_start as string | null) ?? null,
      current_period_end: (sub.current_period_end as string | null) ?? null,
      created_at: sub.created_at as string,
      updated_at: sub.updated_at as string,
    };

    return NextResponse.json({
      message: `${plan.name as string} 플랜으로 구독이 설정되었습니다. (Stripe 연동 대기중)`,
      checkout_url: null,
      subscription,
    });
  } catch (error) {
    return handleApiError(error, "billing.subscription.POST");
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/billing/subscription — 구독 취소
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
): Promise<NextResponse<CancelResponse | ApiErrorBody>> {
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

    const { data: sub, error } = await supabase
      .from("workspace_subscriptions")
      .update({ status: "cancelled" })
      .eq("workspace_id", workspaceId)
      .select(`
        id, workspace_id, plan_id,
        stripe_customer_id, stripe_subscription_id,
        status, current_period_start, current_period_end,
        created_at, updated_at,
        subscription_plans (name, slug, credits_per_month, price_usd)
      `)
      .single();

    if (error || !sub) {
      Sentry.captureException(error, { tags: { context: "billing.subscription.DELETE" } });
      return apiError("DB_ERROR", `구독 취소 실패: ${error?.message ?? "구독이 없습니다."}`, 500);
    }

    const plan = sub.subscription_plans as unknown as {
      name: string;
      slug: string;
      credits_per_month: number;
      price_usd: number;
    } | null;

    const subscription: WorkspaceSubscription = {
      id: sub.id as string,
      workspace_id: sub.workspace_id as string,
      plan_id: sub.plan_id as string,
      plan_name: plan?.name ?? "Unknown",
      plan_slug: plan?.slug ?? "unknown",
      credits_per_month: Number(plan?.credits_per_month ?? 0),
      price_usd: Number(plan?.price_usd ?? 0),
      stripe_customer_id: (sub.stripe_customer_id as string | null) ?? null,
      stripe_subscription_id: (sub.stripe_subscription_id as string | null) ?? null,
      status: sub.status as WorkspaceSubscription["status"],
      current_period_start: (sub.current_period_start as string | null) ?? null,
      current_period_end: (sub.current_period_end as string | null) ?? null,
      created_at: sub.created_at as string,
      updated_at: sub.updated_at as string,
    };

    return NextResponse.json({
      message: "구독이 취소되었습니다. 현재 기간 종료까지 이용 가능합니다.",
      subscription,
    });
  } catch (error) {
    return handleApiError(error, "billing.subscription.DELETE");
  }
}
