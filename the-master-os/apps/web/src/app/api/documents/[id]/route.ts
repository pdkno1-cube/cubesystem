import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

// ── Types ──────────────────────────────────────────────────────────────────

interface IssueItem {
  code: string;
  severity: string;
  message: string;
  field?: string | null;
}

interface DocumentReviewItem {
  id: string;
  workspace_id: string;
  pipeline_execution_id: string | null;
  document_name: string;
  document_type: string;
  file_url: string | null;
  status: string;
  issues: IssueItem[];
  reviewer_notes: string | null;
  gdrive_file_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PatchBody {
  status?: string;
  reviewer_notes?: string;
  issues?: IssueItem[];
  gdrive_file_id?: string;
}

// ── GET /api/documents/[id] ────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<{ data: DocumentReviewItem } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';
    if (!FASTAPI_URL) {
      const { data, error } = await supabase
        .from('document_reviews')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error || !data) {
        return apiError('NOT_FOUND', `Document review '${params.id}' not found`, 404);
      }
      return NextResponse.json({ data: data as DocumentReviewItem });
    }

    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/documents/reviews/${params.id}`,
      { headers: { 'X-User-Id': user.id } },
    );

    if (!resp.ok) {
      const text = await resp.text();
      return apiError('FASTAPI_ERROR', text, resp.status);
    }

    const respData = await resp.json() as { data: DocumentReviewItem };
    return NextResponse.json(respData);
  } catch (error) {
    return handleApiError(error, 'documents.[id].GET');
  }
}

// ── PATCH /api/documents/[id] ──────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<{ data: DocumentReviewItem } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const body = await request.json() as PatchBody;

    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';
    if (!FASTAPI_URL) {
      const updateData: Record<string, unknown> = {};
      if (body.status !== undefined) {
        updateData.status = body.status;
      }
      if (body.reviewer_notes !== undefined) {
        updateData.reviewer_notes = body.reviewer_notes;
      }
      if (body.issues !== undefined) {
        updateData.issues = body.issues;
      }
      if (body.gdrive_file_id !== undefined) {
        updateData.gdrive_file_id = body.gdrive_file_id;
      }

      const { data, error } = await supabase
        .from('document_reviews')
        .update(updateData)
        .eq('id', params.id)
        .select()
        .single();

      if (error) {
        return apiError('DB_ERROR', error.message, 500);
      }
      if (!data) {
        return apiError('NOT_FOUND', `Document review '${params.id}' not found`, 404);
      }
      return NextResponse.json({ data: data as DocumentReviewItem });
    }

    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/documents/reviews/${params.id}`,
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

    const respData = await resp.json() as { data: DocumentReviewItem };
    return NextResponse.json(respData);
  } catch (error) {
    return handleApiError(error, 'documents.[id].PATCH');
  }
}
