import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { createServiceClient } from "@/lib/supabase/service";

// ---------------------------------------------------------------------------
// Stripe client (lazy-initialised — only when STRIPE_SECRET_KEY is set)
// ---------------------------------------------------------------------------

function getStripeClient(): Stripe | null {
  const secretKey = process.env["STRIPE_SECRET_KEY"];
  if (!secretKey) {
    return null;
  }
  return new Stripe(secretKey, { apiVersion: "2026-02-25.clover" });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebhookResponse {
  received: boolean;
}

interface WebhookErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

/**
 * checkout.session.completed — Checkout 완료 시 구독 확정
 *
 * Stripe webhook payload:
 *   data.object.customer (string)
 *   data.object.subscription (string)
 *   data.object.metadata.workspace_id (string)
 *   data.object.metadata.plan_slug (string)
 */
async function handleCheckoutCompleted(
  data: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient();

  const customerId = data["customer"] as string | undefined;
  const subscriptionId = data["subscription"] as string | undefined;
  const metadata = data["metadata"] as Record<string, unknown> | undefined;
  const workspaceId = metadata?.["workspace_id"] as string | undefined;
  const planSlug = metadata?.["plan_slug"] as string | undefined;

  if (!workspaceId || !customerId || !subscriptionId) {
    Sentry.captureMessage("Stripe checkout.session.completed: missing required fields", {
      level: "warning",
      extra: { customerId, subscriptionId, workspaceId },
    });
    return;
  }

  // 플랜 조회
  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("id")
    .eq("slug", planSlug ?? "free")
    .eq("is_active", true)
    .maybeSingle();

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

  const { error } = await supabase
    .from("workspace_subscriptions")
    .upsert(
      {
        workspace_id: workspaceId,
        plan_id: (plan?.id as string | undefined) ?? workspaceId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        status: "active" as const,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
      },
      { onConflict: "workspace_id" },
    );

  if (error) {
    Sentry.captureException(error, {
      tags: { context: "stripe.webhook.checkout_completed" },
      extra: { workspaceId, customerId },
    });
  }
}

/**
 * customer.subscription.updated — 구독 상태 변경 (업그레이드, 다운그레이드, 취소 예약 등)
 *
 * Stripe webhook payload:
 *   data.object.id (subscription id)
 *   data.object.customer (string)
 *   data.object.status (string)
 *   data.object.current_period_start (number, unix timestamp)
 *   data.object.current_period_end (number, unix timestamp)
 *   data.object.cancel_at_period_end (boolean)
 */
async function handleSubscriptionUpdated(
  data: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient();

  const subscriptionId = data["id"] as string | undefined;
  const stripeStatus = data["status"] as string | undefined;
  const periodStart = data["current_period_start"] as number | undefined;
  const periodEnd = data["current_period_end"] as number | undefined;
  const cancelAtPeriodEnd = data["cancel_at_period_end"] as boolean | undefined;

  if (!subscriptionId) {
    Sentry.captureMessage("Stripe subscription.updated: missing subscription id", {
      level: "warning",
    });
    return;
  }

  // Map Stripe status to our DB status
  type DbStatus = "active" | "cancelled" | "past_due" | "trialing";
  const STATUS_MAP: Record<string, DbStatus> = {
    active: "active",
    past_due: "past_due",
    canceled: "cancelled",
    cancelled: "cancelled",
    trialing: "trialing",
    unpaid: "past_due",
    incomplete: "trialing",
    incomplete_expired: "cancelled",
  };

  const mappedStatus: DbStatus = STATUS_MAP[stripeStatus ?? ""] ?? "active";
  const effectiveStatus: DbStatus = cancelAtPeriodEnd ? "cancelled" : mappedStatus;

  const updatePayload: Record<string, unknown> = {
    status: effectiveStatus,
  };

  if (periodStart !== undefined) {
    updatePayload["current_period_start"] = new Date(periodStart * 1000).toISOString();
  }
  if (periodEnd !== undefined) {
    updatePayload["current_period_end"] = new Date(periodEnd * 1000).toISOString();
  }

  const { error } = await supabase
    .from("workspace_subscriptions")
    .update(updatePayload)
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    Sentry.captureException(error, {
      tags: { context: "stripe.webhook.subscription_updated" },
      extra: { subscriptionId, stripeStatus },
    });
  }
}

/**
 * invoice.payment_failed — 결제 실패 시 구독 상태를 past_due로 변경
 *
 * Stripe webhook payload:
 *   data.object.subscription (string)
 *   data.object.customer (string)
 *   data.object.attempt_count (number)
 */
async function handlePaymentFailed(
  data: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient();

  const subscriptionId = data["subscription"] as string | undefined;
  const attemptCount = data["attempt_count"] as number | undefined;

  if (!subscriptionId) {
    Sentry.captureMessage("Stripe invoice.payment_failed: missing subscription id", {
      level: "warning",
    });
    return;
  }

  const { error } = await supabase
    .from("workspace_subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    Sentry.captureException(error, {
      tags: { context: "stripe.webhook.payment_failed" },
      extra: { subscriptionId, attemptCount },
    });
  }
}

// ---------------------------------------------------------------------------
// POST /api/billing/webhooks/stripe — Stripe Webhook endpoint
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<WebhookResponse | WebhookErrorResponse>> {
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];

  // No webhook secret configured — skip processing
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret not configured. Skipping." },
      { status: 400 },
    );
  }

  try {
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature") ?? "";

    // ---------------------------------------------------------------
    // Verify webhook signature using Stripe SDK
    // ---------------------------------------------------------------
    const stripe = getStripeClient();

    let event: Stripe.Event;

    if (stripe) {
      // LIVE mode — cryptographic signature verification
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch (verifyErr) {
        Sentry.captureException(verifyErr, {
          tags: { context: "stripe.webhook.verify" },
        });
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 400 },
        );
      }
    } else {
      // DEV fallback — STRIPE_SECRET_KEY not set but STRIPE_WEBHOOK_SECRET is.
      // Parse JSON but log a warning. This path should not exist in production.
      Sentry.captureMessage(
        "Stripe webhook received without STRIPE_SECRET_KEY — signature verification skipped",
        { level: "warning" },
      );
      try {
        const parsed: unknown = JSON.parse(rawBody);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "id" in parsed &&
          "type" in parsed &&
          "data" in parsed
        ) {
          event = parsed as Stripe.Event;
        } else {
          return NextResponse.json(
            { error: "Invalid webhook payload." },
            { status: 400 },
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Failed to parse webhook body." },
          { status: 400 },
        );
      }
    }

    const eventData = event.data.object as unknown as Record<string, unknown>;

    // Route to event-specific handler
    switch (event.type) {
      case "checkout.session.completed": {
        await handleCheckoutCompleted(eventData);
        break;
      }
      case "customer.subscription.updated": {
        await handleSubscriptionUpdated(eventData);
        break;
      }
      case "invoice.payment_failed": {
        await handlePaymentFailed(eventData);
        break;
      }
      default: {
        // Unhandled event type — acknowledge receipt
        Sentry.addBreadcrumb({
          category: "stripe.webhook",
          message: `Unhandled event type: ${event.type}`,
          level: "info",
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { context: "stripe.webhook.POST" },
    });
    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
