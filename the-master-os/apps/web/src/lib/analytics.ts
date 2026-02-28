import * as Sentry from "@sentry/nextjs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalyticsEvent {
  event: string;
  properties?: Record<string, string | number | boolean>;
  userId?: string;
}

interface MixpanelPayload {
  event: string;
  properties: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MIXPANEL_TOKEN = process.env["NEXT_PUBLIC_MIXPANEL_TOKEN"] ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when Mixpanel is configured.
 * Use this to decide whether to attempt tracking.
 */
export function isAnalyticsConfigured(): boolean {
  return !!MIXPANEL_TOKEN;
}

// ---------------------------------------------------------------------------
// Core tracking — server-side POST to Mixpanel HTTP API
// ---------------------------------------------------------------------------

/**
 * Tracks a single event to Mixpanel using the server-side HTTP API.
 *
 * When `NEXT_PUBLIC_MIXPANEL_TOKEN` is not set the function is a no-op
 * (graceful degradation).
 *
 * Errors are captured via Sentry and never thrown so callers do not
 * need to wrap this in try/catch.
 */
export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  if (!MIXPANEL_TOKEN) {
    return;
  }

  const payload: MixpanelPayload = {
    event: event.event,
    properties: {
      token: MIXPANEL_TOKEN,
      distinct_id: event.userId ?? "anonymous",
      time: Math.floor(Date.now() / 1000),
      $insert_id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      ...event.properties,
    },
  };

  try {
    const res = await fetch("https://api.mixpanel.com/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/plain",
      },
      body: JSON.stringify([payload]),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      Sentry.captureMessage(
        `Mixpanel track returned ${res.status}: ${res.statusText}`,
        {
          level: "warning",
          tags: { context: "mixpanel.track" },
        },
      );
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: { context: "mixpanel.track" },
    });
  }
}

// ---------------------------------------------------------------------------
// Pre-defined event names
// ---------------------------------------------------------------------------

/**
 * Canonical event names used across The Master OS.
 * Prefer these constants over raw strings to ensure consistency
 * in Mixpanel dashboards.
 */
export const Events = {
  PAGE_VIEW: "Page View",
  AGENT_CREATED: "Agent Created",
  PIPELINE_EXECUTED: "Pipeline Executed",
  BUSINESS_PLAN_GENERATED: "Business Plan Generated",
  DEBATE_STARTED: "Debate Started",
  DOCUMENT_UPLOADED: "Document Uploaded",
  NEWSLETTER_SENT: "Newsletter Sent",
  SUBSCRIPTION_CHANGED: "Subscription Changed",
  MEDIA_GENERATED: "Media Generated",
} as const;
