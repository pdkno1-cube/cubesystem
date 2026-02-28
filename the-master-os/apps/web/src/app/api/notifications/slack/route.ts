import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-response";
import { isSlackConfigured, sendAlert } from "@/lib/slack";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const sendNotificationSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(4000),
  severity: z.enum(["info", "warning", "critical"]),
  channel: z.string().max(80).optional(),
  link: z.string().url().optional(),
});

// ---------------------------------------------------------------------------
// POST — Send a Slack notification
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

    if (!isSlackConfigured()) {
      return NextResponse.json(
        {
          sent: false,
          error: "Slack is not configured. Set SLACK_BOT_TOKEN or SLACK_WEBHOOK_URL.",
        },
        { status: 200 },
      );
    }

    const body: unknown = await request.json();
    const parsed = sendNotificationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
        { status: 400 },
      );
    }

    const { title, message, severity, channel, link } = parsed.data;

    const sent = await sendAlert({ title, message, severity, channel, link });

    return NextResponse.json({ sent });
  } catch (error) {
    return handleApiError(error, "notifications.slack.POST");
  }
}
