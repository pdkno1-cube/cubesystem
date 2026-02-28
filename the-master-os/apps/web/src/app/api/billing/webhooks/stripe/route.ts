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

/**
 * DB subscription status — must match the CHECK constraint in
 * workspace_subscriptions.status column.
 */
type DbSubscriptionStatus = "active" | "cancelled" | "past_due" | "trialing";

/**
 * Exhaustive mapping from Stripe subscription statuses to our DB statuses.
 * Stripe sends: active, past_due, canceled, unpaid, trialing,
 *               incomplete, incomplete_expired, paused
 */
const STRIPE_STATUS_MAP: Record<string, DbSubscriptionStatus> = {
  active: "active",
  past_due: "past_due",
  canceled: "cancelled",
  cancelled: "cancelled", // defensive — Stripe uses "canceled" (US spelling)
  trialing: "trialing",
  unpaid: "past_due",
  incomplete: "trialing",
  incomplete_expired: "cancelled",
  paused: "cancelled", // Stripe Billing "pause" — treat as cancelled until resumed
};

const DEFAULT_DB_STATUS: DbSubscriptionStatus = "active";

// ---------------------------------------------------------------------------
// Idempotency — in-memory processed-event cache (per instance)
// ---------------------------------------------------------------------------
// Stripe may send duplicate webhook events. We keep a bounded LRU-style set
// of recently processed event IDs to skip duplicates. This is best-effort;
// across multiple serverless instances events may still be processed more
// than once, but all handlers are written to be idempotent (upsert / update).
// ---------------------------------------------------------------------------

const PROCESSED_EVENT_IDS_MAX = 1000;
const processedEventIds = new Set<string>();

function markEventProcessed(eventId: string): void {
  if (processedEventIds.size >= PROCESSED_EVENT_IDS_MAX) {
    // Evict oldest entries (Set preserves insertion order)
    const iterator = processedEventIds.values();
    const first = iterator.next();
    if (!first.done) {
      processedEventIds.delete(first.value);
    }
  }
  processedEventIds.add(eventId);
}

function isEventAlreadyProcessed(eventId: string): boolean {
  return processedEventIds.has(eventId);
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

  const mappedStatus: DbSubscriptionStatus =
    STRIPE_STATUS_MAP[stripeStatus ?? ""] ?? DEFAULT_DB_STATUS;
  const effectiveStatus: DbSubscriptionStatus =
    cancelAtPeriodEnd ? "cancelled" : mappedStatus;

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
 * customer.subscription.deleted — 구독 영구 삭제 시 Free 플랜으로 다운그레이드
 *
 * Stripe webhook payload:
 *   data.object.id (subscription id)
 *   data.object.customer (string)
 */
async function handleSubscriptionDeleted(
  data: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient();

  const subscriptionId = data["id"] as string | undefined;

  if (!subscriptionId) {
    Sentry.captureMessage("Stripe subscription.deleted: missing subscription id", {
      level: "warning",
    });
    return;
  }

  // Free 플랜 조회
  const { data: freePlan } = await supabase
    .from("subscription_plans")
    .select("id")
    .eq("slug", "free")
    .eq("is_active", true)
    .maybeSingle();

  const { error } = await supabase
    .from("workspace_subscriptions")
    .update({
      status: "cancelled" as const,
      plan_id: (freePlan?.id as string | undefined) ?? undefined,
      stripe_subscription_id: null,
    })
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    Sentry.captureException(error, {
      tags: { context: "stripe.webhook.subscription_deleted" },
      extra: { subscriptionId },
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

/**
 * invoice.paid — 정기 결제 성공 시 구독 기간 갱신 및 크레딧 충전 확인
 *
 * Stripe webhook payload:
 *   data.object.subscription (string)
 *   data.object.customer (string)
 *   data.object.period_start (number, unix timestamp)
 *   data.object.period_end (number, unix timestamp)
 *   data.object.billing_reason (string)
 *
 * This handler:
 *   1. Confirms the subscription status as "active"
 *   2. Updates current_period_start / current_period_end from the invoice
 *
 * Idempotent: upserts/updates by stripe_subscription_id — safe to re-process.
 */
async function handleInvoicePaid(
  data: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient();

  const subscriptionId = data["subscription"] as string | undefined;
  const periodStart = data["period_start"] as number | undefined;
  const periodEnd = data["period_end"] as number | undefined;
  const billingReason = data["billing_reason"] as string | undefined;

  if (!subscriptionId) {
    // One-off invoices (no subscription) — nothing to update
    Sentry.addBreadcrumb({
      category: "stripe.webhook",
      message: "invoice.paid without subscription id — likely one-off invoice, skipping",
      level: "info",
      data: { billingReason },
    });
    return;
  }

  const updatePayload: Record<string, unknown> = {
    status: "active" as DbSubscriptionStatus,
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
      tags: { context: "stripe.webhook.invoice_paid" },
      extra: { subscriptionId, billingReason, periodStart, periodEnd },
    });
  }
}

/**
 * customer.subscription.trial_will_end — 트라이얼 종료 3일 전 알림
 *
 * Stripe webhook payload:
 *   data.object.id (subscription id)
 *   data.object.customer (string)
 *   data.object.trial_end (number, unix timestamp)
 *
 * This handler records a budget alert notification so the workspace owner
 * is informed that their trial is ending soon. No subscription state change.
 */
async function handleTrialWillEnd(
  data: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient();

  const subscriptionId = data["id"] as string | undefined;
  const trialEnd = data["trial_end"] as number | undefined;

  if (!subscriptionId) {
    Sentry.captureMessage("Stripe subscription.trial_will_end: missing subscription id", {
      level: "warning",
    });
    return;
  }

  // Look up the workspace for this subscription
  const { data: sub } = await supabase
    .from("workspace_subscriptions")
    .select("workspace_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  const workspaceId = (sub?.workspace_id as string | undefined) ?? undefined;

  if (!workspaceId) {
    Sentry.captureMessage("Stripe subscription.trial_will_end: workspace not found for subscription", {
      level: "warning",
      extra: { subscriptionId },
    });
    return;
  }

  // Record a notification in budget_alert_notifications for the workspace
  const trialEndDate = trialEnd
    ? new Date(trialEnd * 1000).toISOString()
    : "unknown";

  const { error: insertError } = await supabase
    .from("budget_alert_notifications")
    .insert({
      workspace_id: workspaceId,
      threshold_percent: 100,
      usage_percent: 0,
      alert_type: "email",
      triggered_at: new Date().toISOString(),
      notified: false,
    });

  if (insertError) {
    // Table may not exist or columns may differ — log but do not fail
    Sentry.captureException(insertError, {
      tags: { context: "stripe.webhook.trial_will_end" },
      extra: { subscriptionId, workspaceId, trialEndDate },
    });
  }

  Sentry.addBreadcrumb({
    category: "stripe.webhook",
    message: `Trial ending soon for workspace ${workspaceId} — trial_end: ${trialEndDate}`,
    level: "warning",
    data: { subscriptionId, workspaceId, trialEndDate },
  });
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

    // ---------------------------------------------------------------
    // Idempotency guard — skip duplicate events
    // ---------------------------------------------------------------
    if (isEventAlreadyProcessed(event.id)) {
      Sentry.addBreadcrumb({
        category: "stripe.webhook",
        message: `Duplicate event skipped: ${event.id} (${event.type})`,
        level: "info",
      });
      return NextResponse.json({ received: true });
    }

    const eventData = event.data.object as unknown as Record<string, unknown>;

    // Sentry breadcrumb for every processed event
    Sentry.addBreadcrumb({
      category: "stripe.webhook",
      message: `Processing event: ${event.type}`,
      level: "info",
      data: { eventId: event.id, eventType: event.type },
    });

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
      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(eventData);
        break;
      }
      case "invoice.payment_failed": {
        await handlePaymentFailed(eventData);
        break;
      }
      case "invoice.paid": {
        await handleInvoicePaid(eventData);
        break;
      }
      case "customer.subscription.trial_will_end": {
        await handleTrialWillEnd(eventData);
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

    // Mark event as processed after successful handling
    markEventProcessed(event.id);

    return NextResponse.json({ received: true });
  } catch (error) {
    // ---------------------------------------------------------------
    // Error recovery: Always return 200 to Stripe to prevent retry
    // flooding. The error is captured in Sentry for investigation.
    // Returning 500 would cause Stripe to exponentially retry the
    // same event, which could amplify the problem.
    // ---------------------------------------------------------------
    Sentry.captureException(error, {
      tags: { context: "stripe.webhook.POST" },
    });
    return NextResponse.json({ received: true });
  }
}
