import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

// ── Types ──────────────────────────────────────────────────────────────────

interface NewsletterSendBody {
  workspace_id: string;
  subject: string;
  html?: string;
  text?: string;
  tags?: string[];
  from_address?: string;
}

interface NewsletterSendResult {
  sent_count: number;
  failed_count: number;
  email_ids: string[];
  workspace_id: string;
}

// ── POST /api/marketing/newsletter ────────────────────────────────────────

export async function POST(
  request: Request,
): Promise<NextResponse<{ data: NewsletterSendResult } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);

    const body = await request.json() as NewsletterSendBody;

    if (!body.workspace_id || !body.subject) {
      return apiError('VALIDATION_ERROR', 'workspace_id와 subject는 필수입니다.', 400);
    }
    if (!body.html && !body.text) {
      return apiError('VALIDATION_ERROR', 'html 또는 text 중 하나는 필수입니다.', 400);
    }

    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';
    if (!FASTAPI_URL) {
      // Mock response in dev (no Resend configured)
      return NextResponse.json({
        data: {
          sent_count: 0,
          failed_count: 0,
          email_ids: [],
          workspace_id: body.workspace_id,
        },
      });
    }

    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/marketing/newsletter/send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': user.id,
        },
        body: JSON.stringify(body),
      },
    );

    if (!resp.ok) {
      const text = await resp.text();
      return apiError('FASTAPI_ERROR', text, resp.status);
    }

    const respData = await resp.json() as { data: NewsletterSendResult };
    return NextResponse.json(respData, { status: 202 });
  } catch (error) {
    return handleApiError(error, 'marketing.newsletter.POST');
  }
}
