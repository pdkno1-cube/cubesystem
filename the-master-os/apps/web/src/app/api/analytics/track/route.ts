import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-response";
import { isAnalyticsConfigured, trackEvent } from "@/lib/analytics";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const trackEventSchema = z.object({
  event: z.string().min(1).max(200),
  properties: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
  userId: z.string().max(200).optional(),
});

// ---------------------------------------------------------------------------
// POST — Track an analytics event
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "\uc778\uc99d\uc774 \ud544\uc694\ud569\ub2c8\ub2e4." } },
        { status: 401 },
      );
    }

    if (!isAnalyticsConfigured()) {
      return NextResponse.json(
        { tracked: false, reason: "Mixpanel is not configured. Set NEXT_PUBLIC_MIXPANEL_TOKEN." },
        { status: 200 },
      );
    }

    const body: unknown = await request.json();
    const parsed = trackEventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
        { status: 400 },
      );
    }

    const { event, properties, userId } = parsed.data;

    await trackEvent({
      event,
      properties,
      userId: userId ?? user.id,
    });

    return NextResponse.json({ tracked: true });
  } catch (error) {
    return handleApiError(error, "analytics.track.POST");
  }
}
