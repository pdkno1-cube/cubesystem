import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

const FASTAPI_URL = process.env.FASTAPI_URL ?? '';

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

// ── GET /api/healing/[id] ──────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<{ data: IncidentItem } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    // FastAPI proxy
    if (FASTAPI_URL) {
      try {
        const resp = await fetch(
          `${FASTAPI_URL}/orchestrate/healing/incidents/${params.id}`,
          { headers: { 'X-User-Id': user.id } },
        );

        if (resp.ok) {
          const body = (await resp.json()) as { data: IncidentItem };
          return NextResponse.json(body);
        }
      } catch {
        // Fall through to Supabase fallback
      }
    }

    // Supabase fallback
    const { data, error } = await supabase
      .from('healing_incidents')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) {
      return apiError('DB_ERROR', error.message, 500);
    }
    if (!data) {
      return apiError('NOT_FOUND', `Incident '${params.id}' not found`, 404);
    }

    return NextResponse.json({ data: data as IncidentItem });
  } catch (error) {
    return handleApiError(error, 'healing.[id].GET');
  }
}
