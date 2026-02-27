import { NextResponse } from 'next/server';
import { handleApiError, type ApiErrorBody } from '@/lib/api-response';

// ── POST /api/marketing/webhooks/resend ───────────────────────────────────
// Resend email webhook receiver — no auth required (external webhook).

export async function POST(
  request: Request,
): Promise<NextResponse<{ data: { status: string; type: string } } | ApiErrorBody>> {
  try {
    const body = (await request.json()) as { type?: string; data?: Record<string, unknown> };

    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';
    if (FASTAPI_URL) {
      const resp = await fetch(
        `${FASTAPI_URL}/orchestrate/marketing/webhooks/resend`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!resp.ok) {
        const text = await resp.text();
        return NextResponse.json(
          { error: { code: 'FASTAPI_ERROR', message: text } },
          { status: resp.status },
        );
      }
      const result = (await resp.json()) as { data: { status: string; type: string } };
      return NextResponse.json(result);
    }

    // Dev fallback: just acknowledge
    return NextResponse.json({
      data: { status: 'received', type: body.type ?? 'unknown' },
    });
  } catch (error) {
    return handleApiError(error, 'marketing.webhooks.resend.POST');
  }
}
