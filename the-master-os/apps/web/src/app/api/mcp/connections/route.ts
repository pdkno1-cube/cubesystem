import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';

const FASTAPI_URL = process.env.FASTAPI_URL ?? '';

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization') ?? '';
  const body = await req.json() as {
    workspace_id: string;
    provider: string;
    secret_ref: string;
    name: string;
    endpoint_url?: string;
    config?: Record<string, unknown>;
  };

  if (FASTAPI_URL) {
    const upstream = await fetch(`${FASTAPI_URL}/orchestrate/mcp/connections`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  }

  // Fallback: direct Supabase upsert
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const slug = `${body.provider}-${body.workspace_id.slice(0, 8)}`;
    const { data, error } = await supabase
      .from('mcp_connections')
      .upsert({
        workspace_id: body.workspace_id,
        name: body.name,
        slug,
        service_name: body.provider,
        service_type: 'external',
        provider: body.provider,
        endpoint_url: body.endpoint_url ?? '',
        config: body.config ?? {},
        auth_method: 'api_key',
        secret_ref: body.secret_ref,
        status: 'active',
        health_status: 'unknown',
        is_active: true,
        deleted_at: null,
        created_by: user?.id,
      }, { onConflict: 'workspace_id,slug' })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'mcp.connections.POST' } });
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Failed to create connection' } },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get('workspace_id');
  const connectionId = req.nextUrl.searchParams.get('connection_id');

  if (!workspaceId || !connectionId) {
    return NextResponse.json(
      { error: { code: 'MISSING_PARAM', message: 'workspace_id and connection_id required' } },
      { status: 400 },
    );
  }

  if (FASTAPI_URL) {
    const token = req.headers.get('authorization') ?? '';
    const upstream = await fetch(
      `${FASTAPI_URL}/orchestrate/mcp/connections/${connectionId}?workspace_id=${workspaceId}`,
      { method: 'DELETE', headers: { Authorization: token } },
    );
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('mcp_connections')
      .update({ is_active: false, deleted_at: new Date().toISOString(), status: 'inactive' })
      .eq('id', connectionId)
      .eq('workspace_id', workspaceId)
      .select();

    return NextResponse.json({
      data: { connection_id: connectionId, disconnected: (data ?? []).length > 0 },
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'mcp.connections.DELETE' } });
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Failed to disconnect' } },
      { status: 500 },
    );
  }
}
