import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

// ── Types ──────────────────────────────────────────────────────────────────

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  tags: string[];
  status: string;
  subscribed_at: string;
}

interface AddSubscriberBody {
  email: string;
  name?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ── GET /api/marketing/subscribers ────────────────────────────────────────

export async function GET(
  request: Request,
): Promise<NextResponse<{ data: Subscriber[]; total: number } | ApiErrorBody>> {
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
      // Dev fallback: direct Supabase query
      const { data, error, count } = await supabase
        .from('newsletter_subscribers')
        .select('id, email, name, tags, status, subscribed_at', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('subscribed_at', { ascending: false });

      if (error) {
        return apiError('DB_ERROR', error.message, 500);
      }
      return NextResponse.json({ data: data ?? [], total: count ?? 0 });
    }

    const params = new URLSearchParams({ workspace_id: workspaceId });
    const tag = searchParams.get('tag');
    const status = searchParams.get('status');
    const page = searchParams.get('page') ?? '1';
    const limit = searchParams.get('limit') ?? '50';
    if (tag) {
      params.set('tag', tag);
    }
    if (status) {
      params.set('status', status);
    }
    params.set('page', page);
    params.set('limit', limit);

    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/marketing/subscribers?${params.toString()}`,
      { headers: { 'X-User-Id': user.id } },
    );

    if (!resp.ok) {
      const text = await resp.text();
      return apiError('FASTAPI_ERROR', text, resp.status);
    }

    const body = await resp.json() as { data: Subscriber[]; total: number };
    return NextResponse.json(body);
  } catch (error) {
    return handleApiError(error, 'marketing.subscribers.GET');
  }
}

// ── POST /api/marketing/subscribers ───────────────────────────────────────

export async function POST(
  request: Request,
): Promise<NextResponse<{ data: Subscriber } | ApiErrorBody>> {
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

    const body = await request.json() as AddSubscriberBody;
    if (!body.email) {
      return apiError('VALIDATION_ERROR', 'email is required', 400);
    }

    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';
    if (!FASTAPI_URL) {
      const { data, error } = await supabase
        .from('newsletter_subscribers')
        .upsert(
          {
            workspace_id: workspaceId,
            email: body.email,
            name: body.name ?? null,
            tags: body.tags ?? [],
            metadata: body.metadata ?? {},
            status: 'active',
            subscribed_at: new Date().toISOString(),
            deleted_at: null,
          },
          { onConflict: 'email,workspace_id' },
        )
        .select()
        .single();

      if (error) {
        return apiError('DB_ERROR', error.message, 500);
      }
      return NextResponse.json({ data: data as Subscriber }, { status: 201 });
    }

    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/marketing/subscribers?workspace_id=${workspaceId}`,
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

    const respData = await resp.json() as { data: Subscriber };
    return NextResponse.json(respData, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'marketing.subscribers.POST');
  }
}
