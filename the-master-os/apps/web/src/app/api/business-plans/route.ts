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

// ── Mock sections generator ────────────────────────────────────────────────

function generateMockSections(body: CreatePlanBody): Record<string, unknown> {
  return {
    executive_summary: `${body.company_name}은(는) ${body.industry} 산업에서 ${body.target_market}을(를) 대상으로 혁신적인 솔루션을 제공합니다. ${body.company_description ?? ''}`,
    problem: `${body.target_market} 시장에서 기존 솔루션은 비효율적이며, 사용자 경험이 부족합니다. 현재 시장의 주요 문제점은 높은 비용, 복잡한 프로세스, 낮은 접근성입니다.`,
    solution: `${body.company_name}의 솔루션은 AI 기반 자동화와 직관적인 UX를 통해 기존 문제를 해결합니다. 핵심 차별점은 10배 빠른 처리 속도, 50% 비용 절감, 원클릭 자동화입니다.`,
    market_analysis: {
      tam: body.tam_value ?? 0,
      sam: body.sam_value ?? 0,
      som: body.som_value ?? 0,
      description: `${body.industry} 산업의 전체 시장(TAM)은 ${formatKRW(body.tam_value ?? 0)}이며, 서비스 가능 시장(SAM)은 ${formatKRW(body.sam_value ?? 0)}, 획득 가능 시장(SOM)은 ${formatKRW(body.som_value ?? 0)}입니다.`,
    },
    business_model: `B2B SaaS 구독 모델을 기반으로, 월간/연간 구독료와 사용량 기반 과금을 병행합니다. 평균 고객 단가(ARPU)는 월 50만원이며, 고객 생애 가치(LTV)는 1,800만원입니다.`,
    financial_projection: {
      years: ['1년차', '2년차', '3년차'],
      revenue: [500000000, 2000000000, 5000000000],
      cost: [800000000, 1500000000, 2500000000],
      profit: [-300000000, 500000000, 2500000000],
    },
    team: `창업자: CEO (${body.industry} 10년 경력)\nCTO: 기술 총괄 (AI/ML 전문가)\nCMO: 마케팅 총괄 (B2B SaaS 성장 전문)\nCOO: 운영 총괄 (스타트업 스케일업 경험)`,
    timeline: {
      milestones: [
        { quarter: 'Q1', label: 'MVP 출시 및 초기 고객 확보' },
        { quarter: 'Q2', label: '제품 고도화 및 시리즈A 투자 유치' },
        { quarter: 'Q3', label: '팀 확장 및 마케팅 본격화' },
        { quarter: 'Q4', label: '해외 시장 진출 준비' },
      ],
    },
  };
}

function formatKRW(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(1)}조원`;
  }
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(0)}억원`;
  }
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(0)}만원`;
  }
  return `${value}원`;
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

    // Generate sections (mock AI generation)
    const sections = generateMockSections(body);

    const { data, error } = await supabase
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
        sections,
        status: 'completed',
        generated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return apiError('DB_ERROR', error.message, 500);
    }

    return NextResponse.json(
      { data: data as unknown as BusinessPlanRow },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, 'business-plans.POST');
  }
}
