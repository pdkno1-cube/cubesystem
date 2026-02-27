import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

// -- Types ------------------------------------------------------------------

interface TenderSubmission {
  id: string;
  workspace_id: string;
  pipeline_execution_id: string | null;
  tender_id: string;
  tender_title: string;
  tender_url: string | null;
  organization: string | null;
  status: string;
  bid_amount: number | null;
  deadline: string | null;
  documents: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface CrawlRequestBody {
  workspace_id: string;
  keywords?: string[];
  source?: string;
}

// -- GET /api/grants  -------------------------------------------------------
// Fetches tender submissions list (proxy to FastAPI or Supabase fallback)

export async function GET(
  request: Request,
): Promise<NextResponse<{ data: TenderSubmission[]; total: number } | ApiErrorBody>> {
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

      let query = supabase
        .from('tender_submissions')
        .select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      const { data, error, count } = await query;

      if (error) {
        return apiError('DB_ERROR', error.message, 500);
      }
      return NextResponse.json({ data: data ?? [], total: count ?? 0 });
    }

    // FastAPI proxy
    const params = new URLSearchParams({ workspace_id: workspaceId });
    const statusParam = searchParams.get('status');
    const page = searchParams.get('page') ?? '1';
    const limit = searchParams.get('limit') ?? '50';
    if (statusParam) {
      params.set('status', statusParam);
    }
    params.set('page', page);
    params.set('limit', limit);

    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/grants/tenders?${params.toString()}`,
      { headers: { 'X-User-Id': user.id } },
    );

    if (!resp.ok) {
      const text = await resp.text();
      return apiError('FASTAPI_ERROR', text, resp.status);
    }

    const body = await resp.json() as { data: TenderSubmission[]; total: number };
    return NextResponse.json(body);
  } catch (error) {
    return handleApiError(error, 'grants.GET');
  }
}

// -- POST /api/grants  ------------------------------------------------------
// Triggers manual crawl

export async function POST(
  request: Request,
): Promise<NextResponse<{ data: { message: string; tenders_found: number; tenders: TenderSubmission[] } } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const body = await request.json() as CrawlRequestBody;
    if (!body.workspace_id) {
      return apiError('VALIDATION_ERROR', 'workspace_id is required', 400);
    }

    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';

    if (!FASTAPI_URL) {
      // Dev fallback: insert simulated tenders directly
      const simulated = [
        {
          workspace_id: body.workspace_id,
          tender_id: 'G2B-2026-0001',
          tender_title: 'AI 기반 문서 자동화 시스템 구축',
          tender_url: 'https://www.g2b.go.kr/pt/detail/1',
          organization: '조달청',
          status: 'crawled',
          bid_amount: 150000000,
          deadline: '2026-04-15T18:00:00+09:00',
          documents: [],
          metadata: { source: body.source ?? 'g2b', keywords: body.keywords ?? [] },
        },
        {
          workspace_id: body.workspace_id,
          tender_id: 'G2B-2026-0002',
          tender_title: '공공데이터 분석 플랫폼 고도화',
          tender_url: 'https://www.g2b.go.kr/pt/detail/2',
          organization: '행정안전부',
          status: 'crawled',
          bid_amount: 280000000,
          deadline: '2026-04-20T18:00:00+09:00',
          documents: [],
          metadata: { source: body.source ?? 'g2b', keywords: body.keywords ?? [] },
        },
      ];

      const inserted: TenderSubmission[] = [];
      for (const tender of simulated) {
        const { data: existing } = await supabase
          .from('tender_submissions')
          .select('id')
          .eq('workspace_id', body.workspace_id)
          .eq('tender_id', tender.tender_id)
          .limit(1);

        if (existing && existing.length > 0) {
          continue;
        }

        const { data, error } = await supabase
          .from('tender_submissions')
          .insert(tender)
          .select()
          .single();

        if (!error && data) {
          inserted.push(data as TenderSubmission);
        }
      }

      return NextResponse.json(
        {
          data: {
            message: `${String(inserted.length)}건의 신규 공고를 수집했습니다.`,
            tenders_found: inserted.length,
            tenders: inserted,
          },
        },
        { status: 202 },
      );
    }

    // FastAPI proxy
    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/grants/crawl`,
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

    const respData = await resp.json() as { data: { message: string; tenders_found: number; tenders: TenderSubmission[] } };
    return NextResponse.json(respData, { status: 202 });
  } catch (error) {
    return handleApiError(error, 'grants.POST');
  }
}
