import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import {
  worstStatus,
  type InfraStatusResponse,
  type ServiceData,
  type UsageMetric,
} from '@/components/settings/infra-service-config';

export const dynamic = 'force-dynamic';

// env var 파싱 헬퍼 (없으면 기본값)
function envNum(key: string, fallback: number): number {
  const v = process.env[key];
  const n = v ? parseFloat(v) : NaN;
  return isNaN(n) ? fallback : n;
}

// ─── Supabase Management API 실데이터 조회 ──────────────────────
interface SupabaseLiveMetrics {
  dbSizeMB: number;
  /** null = API 호출 실패 (fallback 사용) */
  fetched: boolean;
}

async function fetchSupabaseMetrics(): Promise<SupabaseLiveMetrics> {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF ?? process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF;

  if (!accessToken || !projectRef) {
    return { dbSizeMB: 0, fetched: false };
  }

  try {
    const resp = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        next: { revalidate: 300 }, // 5분 캐시
      },
    );

    if (!resp.ok) {
      Sentry.captureException(
        new Error(`Supabase Management API ${resp.status}: ${resp.statusText}`),
        { tags: { context: 'infra-status.supabase-api' } },
      );
      return { dbSizeMB: 0, fetched: false };
    }

    const project = (await resp.json()) as {
      database?: { size?: number };
      disk_usage?: number;
    };

    // disk_usage는 bytes 단위로 반환됨 — MB로 변환
    const diskBytes = project.disk_usage ?? project.database?.size ?? 0;
    const dbSizeMB = Math.round((diskBytes / (1024 * 1024)) * 10) / 10;

    return { dbSizeMB, fetched: true };
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'infra-status.supabase-api' } });
    return { dbSizeMB: 0, fetched: false };
  }
}

export async function GET() {
  // 인증 확인
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ─── Supabase 실데이터 조회 (비동기) ──────────────────────────
  const supabaseLive = await fetchSupabaseMetrics();

  // ─── 사용량 값 (env var 주입 or 기본 mock) ─────────────────────
  const vercelBandwidthGB    = envNum('VERCEL_BANDWIDTH_GB', 12.4);
  const vercelFnInvocations  = envNum('VERCEL_FN_INVOCATIONS', 8200);
  const railwayUsageUsd      = envNum('RAILWAY_CURRENT_USAGE_USD', 2.80);
  const railwayMemoryMB      = envNum('RAILWAY_MEMORY_MB', 380);
  // Supabase: 실데이터 > env var > 기본값 순서
  const supabaseDbMB         = supabaseLive.fetched
    ? supabaseLive.dbSizeMB
    : envNum('SUPABASE_DB_MB', 47);
  const supabaseMau          = envNum('SUPABASE_MAU', 3);
  const supabaseBandwidthGB  = envNum('SUPABASE_BANDWIDTH_GB', 0.8);
  const anthropicSpendUsd    = envNum('ANTHROPIC_MONTHLY_SPEND_USD', 3.20);
  const anthropicBudgetUsd   = envNum('ANTHROPIC_MONTHLY_BUDGET_USD', 50);
  const resendEmailsSent     = envNum('RESEND_EMAILS_SENT', 127);
  const sentryEventsUsed     = envNum('SENTRY_EVENTS_USED', 230);
  const gdriveStorageGB      = envNum('GDRIVE_STORAGE_GB', 0.31);
  const openaiSpendUsd       = envNum('OPENAI_MONTHLY_SPEND_USD', 0);
  const openaiBudgetUsd      = envNum('OPENAI_MONTHLY_BUDGET_USD', 20);

  // ─── 메트릭 빌더 ───────────────────────────────────────────────
  function metric(label: string, current: number, limit: number, unit: string): UsageMetric {
    return { label, current, limit, unit, usagePercent: Math.min(Math.round((current / limit) * 100), 100) };
  }

  // ─── 서비스 목록 ───────────────────────────────────────────────
  const services: ServiceData[] = [
    // 1. Vercel
    (() => {
      const metrics = [
        metric('대역폭', vercelBandwidthGB, 100, 'GB'),
        metric('함수 호출', vercelFnInvocations, 100_000, '회'),
      ];
      return {
        id: 'vercel',
        name: 'Vercel',
        description: '프론트엔드 호스팅 & Edge 배포 플랫폼',
        category: 'hosting' as const,
        currentPlan: 'Hobby (무료)',
        monthlyCostUsd: 0,
        isVariableCost: false,
        costLabel: '무료',
        status: worstStatus(metrics),
        metrics,
        logoEmoji: '▲',
        upgrade: {
          nextPlan: 'Pro',
          nextPlanCostUsd: 20,
          keyBenefit: '팀 협업, 커스텀 도메인 무제한, 더 많은 함수 실행',
          consoleUrl: 'https://vercel.com/dashboard',
          triggerCondition: '팀원 추가 필요 또는 대역폭 80GB 초과 시',
        },
      } satisfies ServiceData;
    })(),

    // 2. Railway
    (() => {
      const metrics = [
        metric('크레딧 사용', railwayUsageUsd, 5, 'USD'),
        metric('메모리', railwayMemoryMB, 512, 'MB'),
      ];
      return {
        id: 'railway',
        name: 'Railway',
        description: 'FastAPI 백엔드 서버 (파이프라인 오케스트레이션)',
        category: 'backend' as const,
        currentPlan: 'Hobby ($5 크레딧/월)',
        monthlyCostUsd: railwayUsageUsd,
        isVariableCost: true,
        costLabel: `$${railwayUsageUsd.toFixed(2)} / $5.00`,
        status: worstStatus(metrics),
        metrics,
        logoEmoji: '🚂',
        upgrade: {
          nextPlan: 'Pro',
          nextPlanCostUsd: 20,
          keyBenefit: 'vCPU 8코어, RAM 32GB, 지연 없는 스케일 아웃',
          consoleUrl: 'https://railway.com/dashboard',
          triggerCondition: '크레딧 소진 또는 메모리 400MB 초과 시',
        },
      } satisfies ServiceData;
    })(),

    // 3. Supabase
    (() => {
      const dbLabel = supabaseLive.fetched ? 'DB 용량 (실시간)' : 'DB 용량';
      const metrics = [
        metric(dbLabel, supabaseDbMB, 500, 'MB'),
        metric('월간 활성 유저', supabaseMau, 50_000, 'MAU'),
        metric('대역폭', supabaseBandwidthGB, 5, 'GB'),
      ];
      const descSuffix = supabaseLive.fetched ? ' — DB 실시간 조회' : '';
      return {
        id: 'supabase',
        name: 'Supabase',
        description: `PostgreSQL DB + 인증 + 스토리지 (BaaS)${descSuffix}`,
        category: 'database' as const,
        currentPlan: 'Free',
        monthlyCostUsd: 0,
        isVariableCost: false,
        costLabel: '무료',
        status: worstStatus(metrics),
        metrics,
        logoEmoji: '⚡',
        upgrade: {
          nextPlan: 'Pro',
          nextPlanCostUsd: 25,
          keyBenefit: 'DB 8GB, 대역폭 250GB, 일일 백업, PITR',
          consoleUrl: 'https://supabase.com/dashboard',
          triggerCondition: 'DB 400MB 초과 또는 MAU 40,000 초과 시',
        },
      } satisfies ServiceData;
    })(),

    // 4. Anthropic Claude API
    (() => {
      const metrics = [
        metric('월 예산 사용', anthropicSpendUsd, anthropicBudgetUsd, 'USD'),
      ];
      return {
        id: 'anthropic',
        name: 'Anthropic (Claude API)',
        description: 'AI 파이프라인 핵심 LLM — 에이전트 추론 엔진',
        category: 'ai' as const,
        currentPlan: 'Pay-as-you-go',
        monthlyCostUsd: anthropicSpendUsd,
        isVariableCost: true,
        costLabel: `$${anthropicSpendUsd.toFixed(2)} 이번 달`,
        status: worstStatus(metrics),
        metrics,
        logoEmoji: '🤖',
        upgrade: {
          nextPlan: 'Tier 2 (Usage-based)',
          nextPlanCostUsd: 0,
          keyBenefit: 'Rate limit 상향 (50만 토큰/분), 우선 처리',
          consoleUrl: 'https://console.anthropic.com',
          triggerCondition: '월 $100 초과 또는 Rate Limit 에러 빈발 시',
        },
      } satisfies ServiceData;
    })(),

    // 5. Resend
    (() => {
      const metrics = [
        metric('월 발송 이메일', resendEmailsSent, 3_000, '통'),
      ];
      return {
        id: 'resend',
        name: 'Resend',
        description: '뉴스레터 발송 & 트랜잭션 이메일',
        category: 'email' as const,
        currentPlan: 'Free (3,000통/월)',
        monthlyCostUsd: 0,
        isVariableCost: false,
        costLabel: '무료',
        status: worstStatus(metrics),
        metrics,
        logoEmoji: '📧',
        upgrade: {
          nextPlan: 'Pro',
          nextPlanCostUsd: 20,
          keyBenefit: '50,000통/월, 커스텀 도메인, 웹훅, 분석',
          consoleUrl: 'https://resend.com/overview',
          triggerCondition: '월 2,400통(80%) 초과 시',
        },
      } satisfies ServiceData;
    })(),

    // 6. Sentry
    (() => {
      const metrics = [
        metric('월 에러 이벤트', sentryEventsUsed, 5_000, '건'),
      ];
      return {
        id: 'sentry',
        name: 'Sentry',
        description: '에러 트래킹 & 성능 모니터링',
        category: 'monitoring' as const,
        currentPlan: 'Developer (무료)',
        monthlyCostUsd: 0,
        isVariableCost: false,
        costLabel: '무료',
        status: worstStatus(metrics),
        metrics,
        logoEmoji: '🔍',
        upgrade: {
          nextPlan: 'Team',
          nextPlanCostUsd: 26,
          keyBenefit: '50,000 이벤트/월, 무제한 멤버, 14일 데이터 보존',
          consoleUrl: 'https://sentry.io/organizations/',
          triggerCondition: '월 4,000건(80%) 초과 시',
        },
      } satisfies ServiceData;
    })(),

    // 7. Google Drive
    (() => {
      const metrics = [
        metric('스토리지', gdriveStorageGB, 15, 'GB'),
      ];
      return {
        id: 'gdrive',
        name: 'Google Drive (MCP)',
        description: '파이프라인 산출물 파일 저장소 (MCP 통합)',
        category: 'storage' as const,
        currentPlan: 'Free (15GB)',
        monthlyCostUsd: 0,
        isVariableCost: false,
        costLabel: '무료',
        status: worstStatus(metrics),
        metrics,
        logoEmoji: '📁',
        upgrade: {
          nextPlan: 'Google One 100GB',
          nextPlanCostUsd: 2.99,
          keyBenefit: '100GB 스토리지, Google Meet 녹화 포함',
          consoleUrl: 'https://drive.google.com',
          triggerCondition: '스토리지 12GB(80%) 초과 시',
        },
      } satisfies ServiceData;
    })(),

    // 8. OpenAI
    (() => {
      const usagePercent = openaiBudgetUsd > 0 ? Math.round((openaiSpendUsd / openaiBudgetUsd) * 100) : 0;
      const metrics: UsageMetric[] = openaiSpendUsd > 0
        ? [{ label: '월 예산 사용', current: openaiSpendUsd, limit: openaiBudgetUsd, unit: 'USD', usagePercent }]
        : [];
      return {
        id: 'openai',
        name: 'OpenAI API',
        description: 'GPT 모델 — 현재 미사용 (선택적 연동)',
        category: 'ai' as const,
        currentPlan: openaiSpendUsd > 0 ? 'Pay-as-you-go' : '미연결',
        monthlyCostUsd: openaiSpendUsd,
        isVariableCost: true,
        costLabel: openaiSpendUsd > 0 ? `$${openaiSpendUsd.toFixed(2)} 이번 달` : '미사용',
        status: metrics.length > 0 ? worstStatus(metrics) : 'stable',
        metrics,
        logoEmoji: '🧠',
        upgrade: {
          nextPlan: 'Tier 2',
          nextPlanCostUsd: 0,
          keyBenefit: 'Rate limit 상향, GPT-4o 우선 접근',
          consoleUrl: 'https://platform.openai.com/usage',
          triggerCondition: '월 $100 초과 또는 Rate Limit 에러 빈발 시',
        },
      } satisfies ServiceData;
    })(),
  ];

  // 상태가 심각한 순 → 비용 순으로 정렬
  const statusOrder: Record<string, number> = { critical: 0, warning: 1, caution: 2, good: 3, stable: 4 };
  services.sort((a, b) => {
    const diff = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
    return diff !== 0 ? diff : b.monthlyCostUsd - a.monthlyCostUsd;
  });

  const totalMonthlyCostUsd = services.reduce((sum, s) => sum + s.monthlyCostUsd, 0);

  const body: InfraStatusResponse = {
    services,
    totalMonthlyCostUsd,
    lastUpdated: new Date().toISOString(),
  };

  return NextResponse.json(body);
}
