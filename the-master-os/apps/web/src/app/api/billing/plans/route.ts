import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { apiError, handleApiError, type ApiErrorBody } from "@/lib/api-response";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  credits_per_month: number;
  price_usd: number;
  features: string[];
  is_active: boolean;
  created_at: string;
}

interface PlansResponse {
  plans: SubscriptionPlan[];
}

// ---------------------------------------------------------------------------
// GET /api/billing/plans — 구독 플랜 목록
// ---------------------------------------------------------------------------

export async function GET(): Promise<
  NextResponse<PlansResponse | ApiErrorBody>
> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "인증이 필요합니다.", 401);
    }

    const { data: plans, error } = await supabase
      .from("subscription_plans")
      .select("id, name, slug, credits_per_month, price_usd, features, is_active, created_at")
      .eq("is_active", true)
      .order("price_usd", { ascending: true });

    if (error) {
      Sentry.captureException(error, { tags: { context: "billing.plans.GET" } });
      return apiError("DB_ERROR", `플랜 조회 실패: ${error.message}`, 500);
    }

    const typedPlans: SubscriptionPlan[] = (plans ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      slug: p.slug as string,
      credits_per_month: Number(p.credits_per_month),
      price_usd: Number(p.price_usd),
      features: (p.features ?? []) as string[],
      is_active: p.is_active as boolean,
      created_at: p.created_at as string,
    }));

    return NextResponse.json({ plans: typedPlans });
  } catch (error) {
    return handleApiError(error, "billing.plans.GET");
  }
}
