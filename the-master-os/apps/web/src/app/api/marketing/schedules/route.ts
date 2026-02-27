import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

// ── Types ──────────────────────────────────────────────────────────────────

interface ScheduleItem {
  id: string;
  workspace_id: string;
  pipeline_id: string | null;
  channel: string;
  title: string;
  content: Record<string, unknown>;
  status: string;
  scheduled_at: string;
  published_at: string | null;
  recurrence: string;
  tags: string[];
  created_at: string;
}

interface CreateScheduleBody {
  workspace_id: string;
  pipeline_id?: string;
  channel: string;
  title: string;
  content?: Record<string, unknown>;
  scheduled_at: string;
  recurrence?: string;
  tags?: string[];
}

// ── GET /api/marketing/schedules ──────────────────────────────────────────

export async function GET(
  request: Request,
): Promise<NextResponse<{ data: ScheduleItem[]; total: number } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');
    if (!workspaceId) {
      return apiError('VALIDATION_ERROR', 'workspace_id is required', 400);
    }

    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';
    if (!FASTAPI_URL) {
      // Dev fallback: query Supabase directly
      const { data, error, count } = await supabase
        .from('content_schedules')
        .select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('scheduled_at', { ascending: true });

      if (error) {
        return apiError('DB_ERROR', error.message, 500);
      }
      return NextResponse.json({ data: data ?? [], total: count ?? 0 });
    }

    const params = new URLSearchParams({ workspace_id: workspaceId });
    const status = searchParams.get('status');
    const channel = searchParams.get('channel');
    const page = searchParams.get('page') ?? '1';
    const limit = searchParams.get('limit') ?? '20';
    if (status) {
      params.set('status', status);
    }
    if (channel) {
      params.set('channel', channel);
    }
    params.set('page', page);
    params.set('limit', limit);

    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/marketing/schedules?${params.toString()}`,
      { headers: { 'X-User-Id': user.id } },
    );

    if (!resp.ok) {
      const text = await resp.text();
      return apiError('FASTAPI_ERROR', text, resp.status);
    }

    const body = await resp.json() as { data: ScheduleItem[]; total: number };
    return NextResponse.json(body);
  } catch (error) {
    return handleApiError(error, 'marketing.schedules.GET');
  }
}

// ── POST /api/marketing/schedules ─────────────────────────────────────────

export async function POST(
  request: Request,
): Promise<NextResponse<{ data: ScheduleItem } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const body = await request.json() as CreateScheduleBody;
    if (!body.workspace_id || !body.channel || !body.title || !body.scheduled_at) {
      return apiError('VALIDATION_ERROR', 'workspace_id, channel, title, scheduled_at 필수', 400);
    }

    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';
    if (!FASTAPI_URL) {
      const { data, error } = await supabase
        .from('content_schedules')
        .insert({
          workspace_id: body.workspace_id,
          pipeline_id: body.pipeline_id ?? null,
          channel: body.channel,
          title: body.title,
          content: body.content ?? {},
          status: 'pending',
          scheduled_at: body.scheduled_at,
          recurrence: body.recurrence ?? 'none',
          tags: body.tags ?? [],
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        return apiError('DB_ERROR', error.message, 500);
      }
      return NextResponse.json({ data: data as ScheduleItem }, { status: 201 });
    }

    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/marketing/schedules`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify(body),
      },
    );

    if (!resp.ok) {
      const text = await resp.text();
      return apiError('FASTAPI_ERROR', text, resp.status);
    }

    const respData = await resp.json() as { data: ScheduleItem };
    return NextResponse.json(respData, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'marketing.schedules.POST');
  }
}
