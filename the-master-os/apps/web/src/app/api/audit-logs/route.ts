import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, escapeLike, type ApiErrorBody } from '@/lib/api-response';

const MAX_PAGE_LIMIT = 100;

interface AuditLogEntry {
  id: string;
  workspace_id: string | null;
  workspace_name: string | null;
  user_id: string | null;
  user_name: string | null;
  agent_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  severity: 'info' | 'warning' | 'error' | 'critical';
  created_at: string;
}

interface AuditLogsResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<AuditLogsResponse | ApiErrorBody>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const { searchParams } = request.nextUrl;
    const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10), 1);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') ?? '20', 10), 1),
      MAX_PAGE_LIMIT,
    );
    const action = searchParams.get('action');
    const workspaceId = searchParams.get('workspace_id');
    const severity = searchParams.get('severity');
    const agentId = searchParams.get('agent_id');
    const keyword = searchParams.get('keyword');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (action) {
      query = query.ilike('action', `%${escapeLike(action)}%`);
    }
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }
    if (severity) {
      query = query.eq('severity', severity);
    }
    if (agentId) {
      query = query.eq('agent_id', agentId);
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      // Add time to end of day for inclusive range
      const endDate = dateTo.includes('T') ? dateTo : `${dateTo}T23:59:59.999Z`;
      query = query.lte('created_at', endDate);
    }
    if (keyword) {
      query = query.or(
        `action.ilike.%${escapeLike(keyword)}%,resource_type.ilike.%${escapeLike(keyword)}%`,
      );
    }

    query = query.range(offset, offset + limit - 1);

    const { data: logs, error: logsError, count } = await query;

    if (logsError) {
      return apiError(
        'DB_ERROR',
        `감사 로그 조회 실패: ${logsError.message}`,
        500,
      );
    }

    // Collect unique workspace_ids and user_ids for name resolution
    const workspaceIds = [
      ...new Set(
        (logs ?? [])
          .map((log) => log.workspace_id as string | null)
          .filter((id): id is string => id !== null),
      ),
    ];
    const userIds = [
      ...new Set(
        (logs ?? [])
          .map((log) => log.user_id as string | null)
          .filter((id): id is string => id !== null),
      ),
    ];

    // Fetch workspace names
    const workspaceNameMap = new Map<string, string>();
    if (workspaceIds.length > 0) {
      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id, name')
        .in('id', workspaceIds);
      for (const ws of workspaces ?? []) {
        workspaceNameMap.set(ws.id as string, ws.name as string);
      }
    }

    // Fetch user display names from users table
    const userNameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', userIds);
      for (const userRecord of users ?? []) {
        userNameMap.set(
          userRecord.id as string,
          userRecord.display_name as string,
        );
      }
    }

    const data: AuditLogEntry[] = (logs ?? []).map((log) => ({
      id: log.id as string,
      workspace_id: (log.workspace_id as string) ?? null,
      workspace_name:
        workspaceNameMap.get(log.workspace_id as string) ?? null,
      user_id: (log.user_id as string) ?? null,
      user_name: userNameMap.get(log.user_id as string) ?? null,
      agent_id: (log.agent_id as string) ?? null,
      action: log.action as string,
      resource_type: log.resource_type as string,
      resource_id: (log.resource_id as string) ?? null,
      details: (log.details as Record<string, unknown>) ?? {},
      ip_address: (log.ip_address as string) ?? null,
      severity: log.severity as AuditLogEntry['severity'],
      created_at: log.created_at as string,
    }));

    return NextResponse.json({
      data,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    return handleApiError(error, 'audit-logs.GET');
  }
}
