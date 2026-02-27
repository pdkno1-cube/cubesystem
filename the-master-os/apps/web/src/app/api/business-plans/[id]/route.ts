import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

// ── Types ──────────────────────────────────────────────────────────────────

interface BusinessPlanRow {
  id: string;
  workspace_id: string;
  title: string;
  industry: string;
  target_market: string;
  status: string;
  company_name: string;
  company_description: string;
  tam_value: number;
  sam_value: number;
  som_value: number;
  competitors: Record<string, unknown>[];
  sections: Record<string, unknown>;
  generated_at: string | null;
  exported_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PatchBody {
  title?: string;
  sections?: Record<string, unknown>;
  status?: string;
}

// ── GET /api/business-plans/[id] ───────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<{ data: BusinessPlanRow } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const { data, error } = await supabase
      .from('business_plans')
      .select('*')
      .eq('id', params.id)
      .is('deleted_at', null)
      .single();

    if (error) {
      return apiError('DB_ERROR', error.message, 500);
    }
    if (!data) {
      return apiError('NOT_FOUND', `Business plan '${params.id}' not found`, 404);
    }

    return NextResponse.json({ data: data as unknown as BusinessPlanRow });
  } catch (error) {
    return handleApiError(error, 'business-plans.[id].GET');
  }
}

// ── PATCH /api/business-plans/[id] ─────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<{ data: BusinessPlanRow } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const body = await request.json() as PatchBody;

    const updatePayload: Record<string, unknown> = {};
    if (body.title !== undefined) {
      updatePayload.title = body.title;
    }
    if (body.sections !== undefined) {
      updatePayload.sections = body.sections;
    }
    if (body.status !== undefined) {
      updatePayload.status = body.status;
    }

    const { data, error } = await supabase
      .from('business_plans')
      .update(updatePayload)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      return apiError('DB_ERROR', error.message, 500);
    }
    if (!data) {
      return apiError('NOT_FOUND', `Business plan '${params.id}' not found`, 404);
    }

    return NextResponse.json({ data: data as unknown as BusinessPlanRow });
  } catch (error) {
    return handleApiError(error, 'business-plans.[id].PATCH');
  }
}

// ── DELETE /api/business-plans/[id] ────────────────────────────────────────

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
      .from('business_plans')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', params.id);

    if (error) {
      return apiError('DB_ERROR', error.message, 500);
    }

    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return handleApiError(error, 'business-plans.[id].DELETE');
  }
}
