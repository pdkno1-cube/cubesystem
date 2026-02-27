import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
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

interface CreatePlanBody {
  workspace_id: string;
  company_name: string;
  industry: string;
  target_market: string;
  company_description?: string;
  tam_value?: number;
  sam_value?: number;
  som_value?: number;
  competitors?: Record<string, unknown>[];
}

interface FastApiSections {
  executive_summary: string;
  problem: string;
  solution: string;
  market_analysis: {
    tam: number;
    sam: number;
    som: number;
    description: string;
  };
  competitors: string;
  business_model: string;
  financial_projection: {
    years: string[];
    revenue: number[];
    cost: number[];
    profit: number[];
  };
  team: string;
  timeline: {
    milestones: Array<{ quarter: string; label: string }>;
  };
}

interface FastApiGenerateResponse {
  data: {
    sections: FastApiSections;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost: number;
  };
  meta: Record<string, unknown>;
}

// ── FastAPI LLM 호출 ──────────────────────────────────────────────────────

async function generateSectionsViaLLM(
  body: CreatePlanBody,
  userToken: string,
  fastapiUrl: string,
): Promise<{ sections: Record<string, unknown>; source: string }> {
  const resp = await fetch(
    `${fastapiUrl}/orchestrate/business-plans/generate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        company_name: body.company_name,
        industry: body.industry,
        target_market: body.target_market,
        company_description: body.company_description ?? '',
        tam_value: body.tam_value ?? 0,
        sam_value: body.sam_value ?? 0,
        som_value: body.som_value ?? 0,
        competitors: (body.competitors ?? []).map((c) => ({
          name: String(c['name'] ?? ''),
          strength: String(c['strength'] ?? ''),
          weakness: String(c['weakness'] ?? ''),
        })),
      }),
    },
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`FastAPI responded ${String(resp.status)}: ${errorText}`);
  }

  const result = await resp.json() as FastApiGenerateResponse;
  const meta = result.meta ?? {};
  const source = String(meta['source'] ?? 'llm');

  return { sections: result.data.sections as unknown as Record<string, unknown>, source };
}

// ── GET /api/business-plans ────────────────────────────────────────────────

export async function GET(
  request: Request,
): Promise<NextResponse<{ data: BusinessPlanRow[]; total: number } | ApiErrorBody>> {
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

    const { data, error, count } = await supabase
      .from('business_plans')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      return apiError('DB_ERROR', error.message, 500);
    }

    return NextResponse.json({
      data: (data ?? []) as unknown as BusinessPlanRow[],
      total: count ?? 0,
    });
  } catch (error) {
    return handleApiError(error, 'business-plans.GET');
  }
}

// ── POST /api/business-plans ───────────────────────────────────────────────

export async function POST(
  request: Request,
): Promise<NextResponse<{ data: BusinessPlanRow } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const body = await request.json() as CreatePlanBody;
    if (!body.workspace_id || !body.company_name || !body.industry || !body.target_market) {
      return apiError(
        'VALIDATION_ERROR',
        'workspace_id, company_name, industry, target_market 필수',
        400,
      );
    }

    // 1) Insert with status 'generating'
    const { data: insertedRow, error: insertError } = await supabase
      .from('business_plans')
      .insert({
        workspace_id: body.workspace_id,
        title: `${body.company_name} 사업계획서`,
        company_name: body.company_name,
        industry: body.industry,
        target_market: body.target_market,
        company_description: body.company_description ?? '',
        tam_value: body.tam_value ?? 0,
        sam_value: body.sam_value ?? 0,
        som_value: body.som_value ?? 0,
        competitors: body.competitors ?? [],
        sections: {},
        status: 'generating',
      })
      .select()
      .single();

    if (insertError) {
      return apiError('DB_ERROR', insertError.message, 500);
    }

    const planId = (insertedRow as unknown as BusinessPlanRow).id;

    // 2) Try FastAPI LLM generation
    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';

    if (!FASTAPI_URL) {
      await supabase
        .from('business_plans')
        .update({ status: 'failed' })
        .eq('id', planId);
      return apiError(
        'SERVICE_UNAVAILABLE',
        'LLM 생성 서비스(FASTAPI_URL)가 구성되지 않았습니다. 관리자에게 문의하세요.',
        503,
      );
    }

    // Get session token for FastAPI auth
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token ?? '';

    let sections: Record<string, unknown>;
    let source: string;

    try {
      const result = await generateSectionsViaLLM(body, accessToken, FASTAPI_URL);
      sections = result.sections;
      source = result.source;
    } catch (llmError) {
      Sentry.captureException(llmError, {
        tags: { context: 'business-plans.POST.llm' },
      });
      await supabase
        .from('business_plans')
        .update({ status: 'failed' })
        .eq('id', planId);
      return apiError(
        'SERVICE_UNAVAILABLE',
        '사업계획서 생성에 실패했습니다. LLM 서비스가 일시적으로 사용 불가합니다. 잠시 후 다시 시도해주세요.',
        503,
      );
    }

    const finalStatus = 'completed';

    // 3) Update with generated sections
    const { data: updatedRow, error: updateError } = await supabase
      .from('business_plans')
      .update({
        sections,
        status: finalStatus,
        generated_at: new Date().toISOString(),
      })
      .eq('id', planId)
      .select()
      .single();

    if (updateError) {
      // Update failed — mark as draft so user can retry
      await supabase
        .from('business_plans')
        .update({ status: 'draft' })
        .eq('id', planId);

      return apiError('DB_ERROR', updateError.message, 500);
    }

    const responseRow = updatedRow as unknown as BusinessPlanRow;

    return NextResponse.json(
      { data: responseRow, meta: { source } },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, 'business-plans.POST');
  }
}
