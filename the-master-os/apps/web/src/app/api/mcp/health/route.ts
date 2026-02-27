import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectionRow {
  id: string;
  provider: string;
  health_status: string | null;
  last_health_check: string | null;
  test_result: Record<string, unknown> | null;
  is_active: boolean;
}

interface ProviderHealthResponse {
  provider: string;
  health_status: string;
  last_health_check: string | null;
  test_result: Record<string, unknown> | null;
  is_connected: boolean;
}

// ---------------------------------------------------------------------------
// GET /api/mcp/health — Aggregate health status for all providers
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get('workspace_id');

  if (!workspaceId) {
    return NextResponse.json(
      { error: { code: 'MISSING_PARAM', message: 'workspace_id required' } },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();

    const { data: connections, error } = await supabase
      .from('mcp_connections')
      .select('id, provider, health_status, last_health_check, test_result, is_active')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (error) {
      Sentry.captureException(error, { tags: { context: 'mcp.health.GET.query' } });
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    const typedConnections = (connections ?? []) as ConnectionRow[];

    const statuses: ProviderHealthResponse[] = typedConnections.map((conn) => ({
      provider: conn.provider,
      health_status: conn.health_status ?? 'unknown',
      last_health_check: conn.last_health_check,
      test_result: conn.test_result,
      is_connected: conn.is_active,
    }));

    // Compute summary
    const totalConnected = statuses.length;
    const healthyCount = statuses.filter((s) => s.health_status === 'healthy').length;
    const downCount = statuses.filter((s) => s.health_status === 'down').length;
    const uptimePercent = totalConnected > 0 ? Math.round((healthyCount / totalConnected) * 100) : 0;

    return NextResponse.json({
      data: {
        providers: statuses,
        summary: {
          total_connected: totalConnected,
          healthy: healthyCount,
          down: downCount,
          unknown: totalConnected - healthyCount - downCount,
          uptime_percent: uptimePercent,
          checked_at: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'mcp.health.GET' } });
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Failed to fetch health status' } },
      { status: 500 },
    );
  }
}
