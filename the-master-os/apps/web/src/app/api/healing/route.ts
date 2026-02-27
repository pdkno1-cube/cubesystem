import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

const FASTAPI_URL = process.env.FASTAPI_URL ?? '';

// ── Types ──────────────────────────────────────────────────────────────────

interface IncidentItem {
  id: string;
  workspace_id: string;
  pipeline_execution_id: string | null;
  incident_type: string;
  source_service: string;
  severity: string;
  status: string;
  resolution_action: string | null;
  resolution_details: Record<string, unknown>;
  detected_at: string;
  resolved_at: string | null;
  created_at: string;
}

interface HealingStats {
  total_incidents: number;
  auto_resolved: number;
  auto_resolve_rate: number;
  avg_recovery_seconds: number;
  active_incidents: number;
  by_severity: Record<string, number>;
  by_type: Record<string, number>;
}

interface GetResponse {
  incidents: IncidentItem[];
  total: number;
  stats: HealingStats;
}

interface TriggerBody {
  workspace_id: string;
  source_service: string;
  incident_type?: string;
  severity?: string;
  description?: string;
}

interface TriggerResponse {
  incident_id: string;
  workspace_id: string;
  source_service: string;
  status: string;
  triggered_at: string;
}

// ── GET /api/healing ───────────────────────────────────────────────────────
// Returns incidents list + stats in a single call to reduce round-trips.

export async function GET(
  request: Request,
): Promise<NextResponse<{ data: GetResponse } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');
    if (!workspaceId) {
      return apiError('VALIDATION_ERROR', 'workspace_id is required', 400);
    }

    const severity = searchParams.get('severity');
    const status = searchParams.get('status');
    const page = searchParams.get('page') ?? '1';
    const limit = searchParams.get('limit') ?? '20';

    // Try FastAPI proxy first
    if (FASTAPI_URL) {
      try {
        const incidentParams = new URLSearchParams({ workspace_id: workspaceId, page, limit });
        if (severity) {
          incidentParams.set('severity', severity);
        }
        if (status) {
          incidentParams.set('status', status);
        }

        const statsParams = new URLSearchParams({ workspace_id: workspaceId, days: '30' });

        const [incidentsResp, statsResp] = await Promise.all([
          fetch(`${FASTAPI_URL}/orchestrate/healing/incidents?${incidentParams.toString()}`, {
            headers: { 'X-User-Id': user.id },
          }),
          fetch(`${FASTAPI_URL}/orchestrate/healing/stats?${statsParams.toString()}`, {
            headers: { 'X-User-Id': user.id },
          }),
        ]);

        if (incidentsResp.ok && statsResp.ok) {
          const incidentsBody = (await incidentsResp.json()) as {
            data: IncidentItem[];
            total: number;
          };
          const statsBody = (await statsResp.json()) as { data: HealingStats };

          return NextResponse.json({
            data: {
              incidents: incidentsBody.data,
              total: incidentsBody.total,
              stats: statsBody.data,
            },
          });
        }
      } catch {
        // Fall through to Supabase fallback
      }
    }

    // Supabase fallback
    let query = supabase
      .from('healing_incidents')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId);

    if (severity) {
      query = query.eq('severity', severity);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    const { data: incidents, error, count } = await query
      .order('detected_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) {
      return apiError('DB_ERROR', error.message, 500);
    }

    // Compute stats from all incidents
    const { data: allIncidents } = await supabase
      .from('healing_incidents')
      .select('severity, status, incident_type, detected_at, resolved_at')
      .eq('workspace_id', workspaceId);

    const rows = allIncidents ?? [];
    let autoResolved = 0;
    let activeCount = 0;
    let totalRecoverySec = 0;
    let resolvedCount = 0;
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const row of rows) {
      const sev = (row.severity as string) ?? 'medium';
      bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;

      const incType = (row.incident_type as string) ?? 'unknown';
      byType[incType] = (byType[incType] ?? 0) + 1;

      const rowStatus = row.status as string;
      if (rowStatus === 'resolved') {
        autoResolved += 1;
        const detectedStr = row.detected_at as string | null;
        const resolvedStr = row.resolved_at as string | null;
        if (detectedStr && resolvedStr) {
          const delta = (new Date(resolvedStr).getTime() - new Date(detectedStr).getTime()) / 1000;
          if (delta >= 0) {
            totalRecoverySec += delta;
            resolvedCount += 1;
          }
        }
      } else if (['detected', 'diagnosing', 'healing'].includes(rowStatus)) {
        activeCount += 1;
      }
    }

    const stats: HealingStats = {
      total_incidents: rows.length,
      auto_resolved: autoResolved,
      auto_resolve_rate: rows.length > 0 ? Math.round((autoResolved / rows.length) * 10000) / 10000 : 0,
      avg_recovery_seconds: resolvedCount > 0 ? Math.round((totalRecoverySec / resolvedCount) * 10) / 10 : 0,
      active_incidents: activeCount,
      by_severity: bySeverity,
      by_type: byType,
    };

    return NextResponse.json({
      data: {
        incidents: (incidents ?? []) as IncidentItem[],
        total: count ?? 0,
        stats,
      },
    });
  } catch (error) {
    return handleApiError(error, 'healing.GET');
  }
}

// ── POST /api/healing ──────────────────────────────────────────────────────
// Manual trigger

export async function POST(
  request: Request,
): Promise<NextResponse<{ data: TriggerResponse } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const body = (await request.json()) as TriggerBody;
    if (!body.workspace_id || !body.source_service) {
      return apiError('VALIDATION_ERROR', 'workspace_id, source_service 필수', 400);
    }

    // FastAPI proxy
    if (FASTAPI_URL) {
      try {
        const resp = await fetch(`${FASTAPI_URL}/orchestrate/healing/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
          body: JSON.stringify(body),
        });

        if (resp.ok) {
          const respData = (await resp.json()) as { data: TriggerResponse };
          return NextResponse.json(respData, { status: 201 });
        }
      } catch {
        // Fall through to Supabase fallback
      }
    }

    // Supabase fallback
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('healing_incidents')
      .insert({
        workspace_id: body.workspace_id,
        incident_type: body.incident_type ?? 'api_failure',
        source_service: body.source_service,
        severity: body.severity ?? 'medium',
        status: 'detected',
        resolution_details: {
          manual_trigger: true,
          description: body.description ?? '',
          triggered_by: user.id,
        },
        detected_at: now,
      })
      .select()
      .single();

    if (error) {
      return apiError('DB_ERROR', error.message, 500);
    }
    if (!data) {
      return apiError('DB_ERROR', 'Failed to create incident', 500);
    }

    return NextResponse.json(
      {
        data: {
          incident_id: data.id as string,
          workspace_id: data.workspace_id as string,
          source_service: data.source_service as string,
          status: 'detected',
          triggered_at: now,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, 'healing.POST');
  }
}
