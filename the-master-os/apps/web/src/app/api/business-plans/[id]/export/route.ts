import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

// ── Types ──────────────────────────────────────────────────────────────────

interface FinancialProjection {
  years?: string[];
  revenue?: number[];
  cost?: number[];
  profit?: number[];
}

interface MarketAnalysis {
  tam?: number;
  sam?: number;
  som?: number;
  description?: string;
}

interface TimelineMilestone {
  quarter?: string;
  label?: string;
}

interface TimelineData {
  milestones?: TimelineMilestone[];
}

interface PlanSections {
  executive_summary?: string;
  problem?: string;
  solution?: string;
  market_analysis?: MarketAnalysis;
  business_model?: string;
  financial_projection?: FinancialProjection;
  team?: string;
  timeline?: TimelineData;
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
}

// ── GET /api/business-plans/[id]/export ────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse<string | ApiErrorBody>> {
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

    const plan = data as Record<string, unknown>;
    const sections = (plan.sections ?? {}) as PlanSections;
    const marketAnalysis = sections.market_analysis ?? {};
    const financialProjection = sections.financial_projection ?? {};
    const timeline = sections.timeline ?? {};

    // Mark as exported
    await supabase
      .from('business_plans')
      .update({ status: 'exported', exported_at: new Date().toISOString() })
      .eq('id', params.id);

    const companyName = String(plan.company_name ?? '');
    const industry = String(plan.industry ?? '');
    const targetMarket = String(plan.target_market ?? '');

    // Build financial table rows
    const years = financialProjection.years ?? [];
    const revenue = financialProjection.revenue ?? [];
    const cost = financialProjection.cost ?? [];
    const profit = financialProjection.profit ?? [];

    const financialRows = years.map((year, i) => {
      const rev = revenue[i] ?? 0;
      const c = cost[i] ?? 0;
      const p = profit[i] ?? 0;
      return `<tr>
        <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(String(year))}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${formatKRW(rev)}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${formatKRW(c)}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;${p < 0 ? 'color:red;' : 'color:green;'}">${formatKRW(p)}</td>
      </tr>`;
    }).join('');

    // Build timeline
    const milestones = timeline.milestones ?? [];
    const timelineHtml = milestones.map((m) =>
      `<li style="margin-bottom:8px;"><strong>${escapeHtml(String(m.quarter ?? ''))}</strong>: ${escapeHtml(String(m.label ?? ''))}</li>`,
    ).join('');

    // Build competitor list
    const competitors = (plan.competitors ?? []) as Record<string, unknown>[];
    const competitorHtml = competitors.length > 0
      ? competitors.map((c) =>
          `<li style="margin-bottom:4px;">${escapeHtml(String(c.name ?? ''))}: ${escapeHtml(String(c.description ?? ''))}</li>`,
        ).join('')
      : '<li>등록된 경쟁사 정보 없음</li>';

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escapeHtml(companyName)} 사업계획서</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
    }
    body {
      font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 24px;
      color: #1f2937;
      line-height: 1.7;
    }
    h1 { font-size: 28px; color: #111827; border-bottom: 3px solid #6366f1; padding-bottom: 12px; }
    h2 { font-size: 20px; color: #4f46e5; margin-top: 32px; border-left: 4px solid #6366f1; padding-left: 12px; }
    .meta { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    .section { margin-bottom: 24px; }
    .market-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 16px 0; }
    .market-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center; }
    .market-card .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; }
    .market-card .value { font-size: 24px; font-weight: 700; color: #4f46e5; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background: #f3f4f6; padding: 8px; border: 1px solid #e5e7eb; text-align: left; font-size: 14px; }
    td { font-size: 14px; }
    ul { padding-left: 20px; }
    .print-btn {
      position: fixed; bottom: 24px; right: 24px;
      background: #4f46e5; color: white; border: none; border-radius: 8px;
      padding: 12px 24px; cursor: pointer; font-size: 14px; font-weight: 600;
      box-shadow: 0 4px 12px rgba(79,70,229,0.3);
    }
    .print-btn:hover { background: #4338ca; }
  </style>
</head>
<body>
  <h1>${escapeHtml(companyName)} 사업계획서</h1>
  <div class="meta">
    <p>산업: ${escapeHtml(industry)} | 타겟 시장: ${escapeHtml(targetMarket)}</p>
    <p>생성일: ${new Date(String(plan.created_at ?? '')).toLocaleDateString('ko-KR')}</p>
  </div>

  <h2>1. Executive Summary</h2>
  <div class="section">
    <p>${escapeHtml(String(sections.executive_summary ?? ''))}</p>
  </div>

  <h2>2. 문제 정의</h2>
  <div class="section">
    <p>${escapeHtml(String(sections.problem ?? ''))}</p>
  </div>

  <h2>3. 솔루션</h2>
  <div class="section">
    <p>${escapeHtml(String(sections.solution ?? ''))}</p>
  </div>

  <h2>4. 시장 분석 (TAM-SAM-SOM)</h2>
  <div class="section">
    <div class="market-grid">
      <div class="market-card">
        <div class="label">TAM (전체 시장)</div>
        <div class="value">${formatKRW(marketAnalysis.tam ?? 0)}</div>
      </div>
      <div class="market-card">
        <div class="label">SAM (서비스 가능 시장)</div>
        <div class="value">${formatKRW(marketAnalysis.sam ?? 0)}</div>
      </div>
      <div class="market-card">
        <div class="label">SOM (획득 가능 시장)</div>
        <div class="value">${formatKRW(marketAnalysis.som ?? 0)}</div>
      </div>
    </div>
    <p>${escapeHtml(String(marketAnalysis.description ?? ''))}</p>
  </div>

  <h2>5. 경쟁사 분석</h2>
  <div class="section">
    <ul>${competitorHtml}</ul>
  </div>

  <h2>6. 비즈니스 모델</h2>
  <div class="section">
    <p>${escapeHtml(String(sections.business_model ?? ''))}</p>
  </div>

  <h2>7. 재무 전망</h2>
  <div class="section">
    <table>
      <thead>
        <tr>
          <th>기간</th>
          <th style="text-align:right;">매출</th>
          <th style="text-align:right;">비용</th>
          <th style="text-align:right;">이익</th>
        </tr>
      </thead>
      <tbody>${financialRows}</tbody>
    </table>
  </div>

  <h2>8. 팀 구성</h2>
  <div class="section">
    <p>${escapeHtml(String(sections.team ?? ''))}</p>
  </div>

  <h2>9. 타임라인</h2>
  <div class="section">
    <ul>${timelineHtml}</ul>
  </div>

  <button class="print-btn no-print" onclick="window.print()">PDF로 저장</button>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    return handleApiError(error, 'business-plans.[id].export.GET');
  }
}
