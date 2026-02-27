import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { apiError, handleApiError, type ApiErrorBody } from "@/lib/api-response";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BillingMode = "live" | "simulated";

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
  mode: BillingMode;
}

interface CreateSubscriptionBody {
  workspace_id: string;
  plan_slug: string;
}

interface CheckoutResponse {
  message: string;
  checkout_url: string | null;
  subscription: WorkspaceSubscription;
  mode: BillingMode;
}

interface CancelResponse {
  message: string;
  subscription: WorkspaceSubscription;
  mode: BillingMode;
}

// ---------------------------------------------------------------------------
// Stripe mode detection
// ---------------------------------------------------------------------------

function getStripeSecretKey(): string | null {
  return process.env["STRIPE_SECRET_KEY"] ?? null;
}

function getBillingMode(): BillingMode {
  return getStripeSecretKey() ? "live" : "simulated";
}

// ---------------------------------------------------------------------------
// Helpers — subscription row to typed response
// ---------------------------------------------------------------------------

interface PlanJoin {
  name: string;
  slug: string;
  credits_per_month: number;
  price_usd: number;
}

function toSubscription(
  sub: Record<string, unknown>,
  plan: PlanJoin | null,
): WorkspaceSubscription {
  return {
    id: sub["id"] as string,
    workspace_id: sub["workspace_id"] as string,
    plan_id: sub["plan_id"] as string,
    plan_name: plan?.name ?? "Unknown",
    plan_slug: plan?.slug ?? "unknown",
    credits_per_month: Number(plan?.credits_per_month ?? 0),
    price_usd: Number(plan?.price_usd ?? 0),
    stripe_customer_id: (sub["stripe_customer_id"] as string | null) ?? null,
    stripe_subscription_id: (sub["stripe_subscription_id"] as string | null) ?? null,
    status: sub["status"] as WorkspaceSubscription["status"],
    current_period_start: (sub["current_period_start"] as string | null) ?? null,
    current_period_end: (sub["current_period_end"] as string | null) ?? null,
    created_at: sub["created_at"] as string,
    updated_at: sub["updated_at"] as string,
  };
}

// ---------------------------------------------------------------------------
// GET /api/billing/subscription — 현재 구독 상태
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse<SubscriptionResponse | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const mode = getBillingMode();

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
      return NextResponse.json({ subscription: null, mode });
    }

    const plan = sub.subscription_plans as unknown as PlanJoin | null;
    const subscription = toSubscription(sub as unknown as Record<string, unknown>, plan);

    return NextResponse.json({ subscription, mode });
  } catch (error) {
    return handleApiError(error, "billing.subscription.GET");
  }
}

// ---------------------------------------------------------------------------
// POST /api/billing/subscription — 구독 생성/변경
// ---------------------------------------------------------------------------
// - STRIPE_SECRET_KEY 있으면: Stripe Checkout Session 생성 (TODO)
// - 없으면: 시뮬레이션 모드 (즉시 활성화)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<CheckoutResponse | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const mode = getBillingMode();
    const stripeKey = getStripeSecretKey();

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
      .select("id, name, slug, credits_per_month, price_usd, stripe_price_id")
      .eq("slug", body.plan_slug)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return apiError("NOT_FOUND", "해당 플랜을 찾을 수 없습니다.", 404);
    }

    // -----------------------------------------------------------------
    // LIVE MODE — Stripe Checkout Session
    // -----------------------------------------------------------------
    if (stripeKey) {
      // TODO: Stripe 연동 시 아래 주석을 해제하고 구현
      //
      // import Stripe from 'stripe';
      // const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' });
      //
      // 1) 기존 stripe_customer_id 조회 또는 신규 고객 생성
      // const { data: existingSub } = await supabase
      //   .from("workspace_subscriptions")
      //   .select("stripe_customer_id")
      //   .eq("workspace_id", body.workspace_id)
      //   .maybeSingle();
      //
      // let customerId = existingSub?.stripe_customer_id as string | null;
      // if (!customerId) {
      //   const customer = await stripe.customers.create({
      //     email: user.email,
      //     metadata: { workspace_id: body.workspace_id, user_id: user.id },
      //   });
      //   customerId = customer.id;
      // }
      //
      // 2) Checkout Session 생성
      // const session = await stripe.checkout.sessions.create({
      //   customer: customerId,
      //   mode: 'subscription',
      //   line_items: [{ price: plan.stripe_price_id as string, quantity: 1 }],
      //   success_url: `${request.nextUrl.origin}/billing?checkout=success`,
      //   cancel_url: `${request.nextUrl.origin}/billing?checkout=cancel`,
      //   metadata: { workspace_id: body.workspace_id, plan_slug: body.plan_slug },
      // });
      //
      // 3) customer_id를 미리 저장 (webhook에서 subscription 확정)
      // await supabase
      //   .from("workspace_subscriptions")
      //   .upsert({
      //     workspace_id: body.workspace_id,
      //     plan_id: plan.id as string,
      //     stripe_customer_id: customerId,
      //     status: 'trialing',
      //   }, { onConflict: "workspace_id" });
      //
      // return NextResponse.json({
      //   message: "Stripe Checkout 페이지로 이동합니다.",
      //   checkout_url: session.url,
      //   subscription: { ... },
      //   mode: "live",
      // });

      // Stripe SDK 미설치 상태 — 키는 있지만 SDK가 없으므로 에러 반환
      return apiError(
        "NOT_IMPLEMENTED",
        "Stripe SDK가 설치되지 않았습니다. npm install stripe 후 live 모드를 사용해주세요.",
        501,
      );
    }

    // -----------------------------------------------------------------
    // SIMULATED MODE — 즉시 활성화
    // -----------------------------------------------------------------
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 30);

    const { data: sub, error: upsertError } = await supabase
      .from("workspace_subscriptions")
      .upsert(
        {
          workspace_id: body.workspace_id,
          plan_id: plan.id as string,
          stripe_customer_id: `cus_sim_${body.workspace_id.slice(0, 8)}`,
          stripe_subscription_id: `sub_sim_${crypto.randomUUID().slice(0, 8)}`,
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

    const planJoin: PlanJoin = {
      name: plan.name as string,
      slug: plan.slug as string,
      credits_per_month: Number(plan.credits_per_month),
      price_usd: Number(plan.price_usd),
    };

    const subscription = toSubscription(sub as unknown as Record<string, unknown>, planJoin);

    return NextResponse.json({
      message: `${planJoin.name} 플랜으로 구독이 설정되었습니다. (시뮬레이션 모드)`,
      checkout_url: null,
      subscription,
      mode,
    });
  } catch (error) {
    return handleApiError(error, "billing.subscription.POST");
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/billing/subscription — 구독 취소
// ---------------------------------------------------------------------------
// - LIVE: Stripe API로 subscription cancel (TODO)
// - SIMULATED: DB 상태만 변경
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
): Promise<NextResponse<CancelResponse | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const mode = getBillingMode();
    const stripeKey = getStripeSecretKey();

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

    // -----------------------------------------------------------------
    // LIVE MODE — Stripe subscription cancel
    // -----------------------------------------------------------------
    if (stripeKey) {
      // TODO: Stripe 연동 시 아래 주석을 해제하고 구현
      //
      // import Stripe from 'stripe';
      // const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' });
      //
      // const { data: existingSub } = await supabase
      //   .from("workspace_subscriptions")
      //   .select("stripe_subscription_id")
      //   .eq("workspace_id", workspaceId)
      //   .single();
      //
      // if (existingSub?.stripe_subscription_id) {
      //   await stripe.subscriptions.update(existingSub.stripe_subscription_id as string, {
      //     cancel_at_period_end: true,
      //   });
      // }
      //
      // DB 업데이트는 webhook (customer.subscription.updated) 에서 처리

      return apiError(
        "NOT_IMPLEMENTED",
        "Stripe SDK가 설치되지 않았습니다. npm install stripe 후 live 모드를 사용해주세요.",
        501,
      );
    }

    // -----------------------------------------------------------------
    // SIMULATED MODE — DB만 업데이트
    // -----------------------------------------------------------------
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

    const plan = sub.subscription_plans as unknown as PlanJoin | null;
    const subscription = toSubscription(sub as unknown as Record<string, unknown>, plan);

    return NextResponse.json({
      message: "구독이 취소되었습니다. 현재 기간 종료까지 이용 가능합니다.",
      subscription,
      mode,
    });
  } catch (error) {
    return handleApiError(error, "billing.subscription.DELETE");
  }
}
