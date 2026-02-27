import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

interface ScheduleItem {
  id: string;
  workspace_id: string;
  channel: string;
  title: string;
  status: string;
  scheduled_at: string;
  published_at: string | null;
}

interface PatchBody {
  status?: string;
  error_message?: string;
  scheduled_at?: string;
  content?: Record<string, unknown>;
}

// ── PATCH /api/marketing/schedules/[id] ───────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<{ data: ScheduleItem } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const body = await request.json() as PatchBody;

    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';
    if (!FASTAPI_URL) {
      const { data, error } = await supabase
        .from('content_schedules')
        .update({
          ...body,
          ...(body.status === 'completed' ? { published_at: new Date().toISOString() } : {}),
        })
        .eq('id', params.id)
        .select()
        .single();

      if (error) {
        return apiError('DB_ERROR', error.message, 500);
      }
      if (!data) {
        return apiError('NOT_FOUND', `Schedule '${params.id}' not found`, 404);
      }
      return NextResponse.json({ data: data as ScheduleItem });
    }

    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/marketing/schedules/${params.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify(body),
      },
    );

    if (!resp.ok) {
      const text = await resp.text();
      return apiError('FASTAPI_ERROR', text, resp.status);
    }

    const respData = await resp.json() as { data: ScheduleItem };
    return NextResponse.json(respData);
  } catch (error) {
    return handleApiError(error, 'marketing.schedules.[id].PATCH');
  }
}

// ── DELETE /api/marketing/schedules/[id] ──────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<{ data: { deleted: boolean } } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const { error } = await supabase
      .from('content_schedules')
      .update({
        status: 'cancelled',
        deleted_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    if (error) {
      return apiError('DB_ERROR', error.message, 500);
    }
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return handleApiError(error, 'marketing.schedules.[id].DELETE');
  }
}
