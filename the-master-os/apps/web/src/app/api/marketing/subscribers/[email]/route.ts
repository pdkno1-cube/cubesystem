import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

// ── DELETE /api/marketing/subscribers/[email] ─────────────────────────────

export async function DELETE(
  request: Request,
  { params }: { params: { email: string } },
): Promise<NextResponse<{ data: { email: string; unsubscribed: boolean } } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');
    if (!workspaceId) return apiError('VALIDATION_ERROR', 'workspace_id is required', 400);

    const email = decodeURIComponent(params.email);

    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';
    if (!FASTAPI_URL) {
      const { data, error } = await supabase
        .from('newsletter_subscribers')
        .update({
          status: 'unsubscribed',
          deleted_at: new Date().toISOString(),
        })
        .eq('email', email)
        .eq('workspace_id', workspaceId)
        .select();

      if (error) return apiError('DB_ERROR', error.message, 500);
      return NextResponse.json({
        data: { email, unsubscribed: (data ?? []).length > 0 },
      });
    }

    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/marketing/subscribers/${encodeURIComponent(email)}?workspace_id=${workspaceId}`,
      {
        method: 'DELETE',
        headers: { 'X-User-Id': user.id },
      },
    );

    if (!resp.ok) {
      const text = await resp.text();
      return apiError('FASTAPI_ERROR', text, resp.status);
    }

    const respData = await resp.json() as { data: { email: string; unsubscribed: boolean } };
    return NextResponse.json(respData);
  } catch (error) {
    return handleApiError(error, 'marketing.subscribers.[email].DELETE');
  }
}
