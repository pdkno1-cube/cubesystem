import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, escapeLike } from '@/lib/api-response';

const MAX_EXPORT_ROWS = 5000;

function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * GET /api/audit-logs/export
 * Exports audit logs as CSV with the same filters as the main listing endpoint.
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const { searchParams } = request.nextUrl;
    const action = searchParams.get('action');
    const workspaceId = searchParams.get('workspace_id');
    const severity = searchParams.get('severity');
    const agentId = searchParams.get('agent_id');
    const keyword = searchParams.get('keyword');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_ROWS);

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
      query = query.lte('created_at', dateTo);
    }
    if (keyword) {
      query = query.or(
        `action.ilike.%${escapeLike(keyword)}%,resource_type.ilike.%${escapeLike(keyword)}%`,
      );
    }

    const { data: logs, error: logsError } = await query;

    if (logsError) {
      return apiError(
        'DB_ERROR',
        `감사 로그 내보내기 실패: ${logsError.message}`,
        500,
      );
    }

    // Build CSV
    const headers = [
      '날짜',
      '액션',
      '카테고리',
      '리소스 타입',
      '리소스 ID',
      '사용자 ID',
      '에이전트 ID',
      '워크스페이스 ID',
      'IP',
      '심각도',
      '상세',
    ];

    const rows = (logs ?? []).map((log) => [
      escapeCSVField(String(log.created_at ?? '')),
      escapeCSVField(String(log.action ?? '')),
      escapeCSVField(String(log.category ?? '')),
      escapeCSVField(String(log.resource_type ?? '')),
      escapeCSVField(String(log.resource_id ?? '')),
      escapeCSVField(String(log.user_id ?? '')),
      escapeCSVField(String(log.agent_id ?? '')),
      escapeCSVField(String(log.workspace_id ?? '')),
      escapeCSVField(String(log.ip_address ?? '')),
      escapeCSVField(String(log.severity ?? '')),
      escapeCSVField(JSON.stringify(log.details ?? {})),
    ]);

    const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility
    const csv = bom + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'audit-logs.export');
  }
}
