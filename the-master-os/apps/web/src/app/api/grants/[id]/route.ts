import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

// -- Types ------------------------------------------------------------------

interface TenderSubmission {
  id: string;
  workspace_id: string;
  tender_id: string;
  tender_title: string;
  status: string;
  bid_amount: number | null;
  deadline: string | null;
  documents: Record<string, unknown>[];
  updated_at: string;
}

interface PatchBody {
  status?: string;
  bid_amount?: number;
  documents?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
}

// -- PATCH /api/grants/[id] -------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<{ data: TenderSubmission } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const body = await request.json() as PatchBody;

    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';

    if (!FASTAPI_URL) {
      // Dev fallback: update Supabase directly
      const updatePayload: Record<string, unknown> = {};
      if (body.status !== undefined) {
        updatePayload['status'] = body.status;
      }
      if (body.bid_amount !== undefined) {
        updatePayload['bid_amount'] = body.bid_amount;
      }
      if (body.documents !== undefined) {
        updatePayload['documents'] = body.documents;
      }
      if (body.metadata !== undefined) {
        updatePayload['metadata'] = body.metadata;
      }

      const { data, error } = await supabase
        .from('tender_submissions')
        .update(updatePayload)
        .eq('id', params.id)
        .select()
        .single();

      if (error) {
        return apiError('DB_ERROR', error.message, 500);
      }
      if (!data) {
        return apiError('NOT_FOUND', `Submission '${params.id}' not found`, 404);
      }
      return NextResponse.json({ data: data as unknown as TenderSubmission });
    }

    // FastAPI proxy
    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/grants/submissions/${params.id}`,
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

    const respData = await resp.json() as { data: TenderSubmission };
    return NextResponse.json(respData);
  } catch (error) {
    return handleApiError(error, 'grants.[id].PATCH');
  }
}
