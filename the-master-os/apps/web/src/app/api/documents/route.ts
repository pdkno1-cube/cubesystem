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

interface UploadBody {
  workspace_id: string;
  document_name: string;
  document_type?: string;
  file_url?: string;
}

// ── GET /api/documents ─────────────────────────────────────────────────────

export async function GET(
  request: Request,
): Promise<NextResponse<{ data: DocumentReviewItem[]; total: number } | ApiErrorBody>> {
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
      // Dev fallback: query Supabase directly
      const statusFilter = searchParams.get('status');
      const documentType = searchParams.get('document_type');

      let query = supabase
        .from('document_reviews')
        .select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }
      if (documentType) {
        query = query.eq('document_type', documentType);
      }

      const page = parseInt(searchParams.get('page') ?? '1', 10);
      const limit = parseInt(searchParams.get('limit') ?? '20', 10);
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        return apiError('DB_ERROR', error.message, 500);
      }
      return NextResponse.json({ data: data ?? [], total: count ?? 0 });
    }

    const params = new URLSearchParams({ workspace_id: workspaceId });
    const statusFilter = searchParams.get('status');
    const documentType = searchParams.get('document_type');
    const page = searchParams.get('page') ?? '1';
    const limit = searchParams.get('limit') ?? '20';
    if (statusFilter) {
      params.set('status', statusFilter);
    }
    if (documentType) {
      params.set('document_type', documentType);
    }
    params.set('page', page);
    params.set('limit', limit);

    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/documents/reviews?${params.toString()}`,
      { headers: { 'X-User-Id': user.id } },
    );

    if (!resp.ok) {
      const text = await resp.text();
      return apiError('FASTAPI_ERROR', text, resp.status);
    }

    const body = await resp.json() as { data: DocumentReviewItem[]; total: number };
    return NextResponse.json(body);
  } catch (error) {
    return handleApiError(error, 'documents.GET');
  }
}

// ── POST /api/documents ────────────────────────────────────────────────────

export async function POST(
  request: Request,
): Promise<NextResponse<{ data: DocumentReviewItem } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const body = await request.json() as UploadBody;
    if (!body.workspace_id || !body.document_name) {
      return apiError('VALIDATION_ERROR', 'workspace_id와 document_name은 필수입니다.', 400);
    }

    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';
    if (!FASTAPI_URL) {
      const { data, error } = await supabase
        .from('document_reviews')
        .insert({
          workspace_id: body.workspace_id,
          document_name: body.document_name,
          document_type: body.document_type ?? 'general',
          file_url: body.file_url ?? null,
          status: 'pending',
          issues: [],
        })
        .select()
        .single();

      if (error) {
        return apiError('DB_ERROR', error.message, 500);
      }
      return NextResponse.json({ data: data as DocumentReviewItem }, { status: 201 });
    }

    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/documents/upload`,
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

    const respData = await resp.json() as { data: DocumentReviewItem };
    return NextResponse.json(respData, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'documents.POST');
  }
}
