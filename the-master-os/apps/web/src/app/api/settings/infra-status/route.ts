import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import {
  worstStatus,
  type ConnectionStatus,
  type InfraStatusResponse,
  type ServiceData,
  type UsageMetric,
} from '@/components/settings/infra-service-config';

export const dynamic = 'force-dynamic';

// ─── env var 파싱 헬퍼 ─────────────────────────────────────────
/** Parse env var as number. Returns { value, source } — null value if env var is absent. */
function envNumOrNull(key: string): { value: number | null; source: 'env' | 'not_configured' } {
  const v = process.env[key];
  if (!v || v.trim().length === 0) {
    return { value: null, source: 'not_configured' };
  }
  const n = parseFloat(v);
  return isNaN(n) ? { value: null, source: 'not_configured' } : { value: n, source: 'env' };
}

/** Legacy helper — returns number with fallback (still used for budget limits). */
function envNum(key: string, fallback: number): number {
  const v = process.env[key];
  const n = v ? parseFloat(v) : NaN;
  return isNaN(n) ? fallback : n;
}

/** env var 존재 여부로 connection status 판정 */
function envConnectionStatus(...keys: string[]): ConnectionStatus {
  for (const key of keys) {
    const val = process.env[key];
    if (val && val.trim().length > 0) {
      return 'connected';
    }
  }
  return 'not_configured';
}

// ─── Supabase Management API 실데이터 조회 ──────────────────────
interface SupabaseLiveMetrics {
  dbSizeMB: number;
  activeConnections: number;
  region: string;
  pgVersion: string;
  fetched: boolean;
}

async function fetchSupabaseMetrics(): Promise<SupabaseLiveMetrics> {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF ?? process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF;
  const fallback: SupabaseLiveMetrics = {
    dbSizeMB: 0,
    activeConnections: 0,
    region: '',
    pgVersion: '',
    fetched: false,
  };

  if (!accessToken || !projectRef) {
    return fallback;
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
        new Error(`Supabase Management API ${String(resp.status)}: ${resp.statusText}`),
        { tags: { context: 'infra-status.supabase-api' } },
      );
      return fallback;
    }

    const project = (await resp.json()) as {
      database?: { size?: number; active_connections?: number; version?: string };
      disk_usage?: number;
      region?: string;
    };

    // disk_usage는 bytes 단위 — MB로 변환
    const diskBytes = project.disk_usage ?? project.database?.size ?? 0;
    const dbSizeMB = Math.round((diskBytes / (1024 * 1024)) * 10) / 10;
    const activeConnections = project.database?.active_connections ?? 0;
    const region = project.region ?? '';
    const pgVersion = project.database?.version ?? '';

    return { dbSizeMB, activeConnections, region, pgVersion, fetched: true };
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'infra-status.supabase-api' } });
    return fallback;
  }
}

// ─── LLM 크레딧 사용량 집계 (credits + agents 조인) ─────────
interface ProviderCreditUsage {
  anthropicCredits: number;
  openaiCredits: number;
  otherCredits: number;
  fetched: boolean;
}

async function fetchProviderCreditUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ProviderCreditUsage> {
  const fallback: ProviderCreditUsage = {
    anthropicCredits: 0,
    openaiCredits: 0,
    otherCredits: 0,
    fetched: false,
  };

  try {
    // 이번 달 시작일
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // 이번 달 usage 트랜잭션 조회 (agent_id 포함)
    const { data: usageRows, error: usageError } = await supabase
      .from('credits')
      .select('agent_id, amount')
      .eq('transaction_type', 'usage')
      .gte('created_at', monthStart);

    if (usageError) {
      Sentry.captureException(usageError, { tags: { context: 'infra-status.credit-usage' } });
      return fallback;
    }

    if (!usageRows || usageRows.length === 0) {
      return { ...fallback, fetched: true };
    }

    // 사용된 에이전트 ID 수집
    const agentIds = [
      ...new Set(
        usageRows
          .map((r) => r.agent_id as string | null)
          .filter((id): id is string => id !== null),
      ),
    ];

    // 에이전트별 model_provider 조회
    const providerMap = new Map<string, string>();
    if (agentIds.length > 0) {
      const { data: agents } = await supabase
        .from('agents')
        .select('id, model_provider')
        .in('id', agentIds);

      for (const ag of agents ?? []) {
        providerMap.set(ag.id as string, ag.model_provider as string);
      }
    }

    // 프로바이더별 크레딧 합산
    let anthropicCredits = 0;
    let openaiCredits = 0;
    let otherCredits = 0;

    for (const row of usageRows) {
      const amount = Math.abs(Number(row.amount ?? 0));
      const agentId = row.agent_id as string | null;
      const provider = agentId ? (providerMap.get(agentId) ?? 'unknown') : 'unknown';

      if (provider === 'anthropic') {
        anthropicCredits += amount;
      } else if (provider === 'openai') {
        openaiCredits += amount;
      } else {
        otherCredits += amount;
      }
    }

    return {
      anthropicCredits: Math.round(anthropicCredits * 100) / 100,
      openaiCredits: Math.round(openaiCredits * 100) / 100,
      otherCredits: Math.round(otherCredits * 100) / 100,
      fetched: true,
    };
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'infra-status.credit-usage' } });
    return fallback;
  }
}

// ─── Vault 시크릿 존재 여부 확인 ──────────────────────────────
interface VaultSecretStatus {
  resendConfigured: boolean;
  fetched: boolean;
}

async function fetchVaultSecretStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<VaultSecretStatus> {
  const fallback: VaultSecretStatus = { resendConfigured: false, fetched: false };

  try {
    // service_name이 'resend'인 시크릿 존재 여부 확인
    const { data: resendSecrets, error } = await supabase
      .from('secret_vault')
      .select('id')
      .eq('service_name', 'resend')
      .is('deleted_at', null)
      .limit(1);

    if (error) {
      Sentry.captureException(error, { tags: { context: 'infra-status.vault-check' } });
      return fallback;
    }

    return {
      resendConfigured: (resendSecrets ?? []).length > 0,
      fetched: true,
    };
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'infra-status.vault-check' } });
    return fallback;
  }
}

// ─── Resend 이메일 발송 수 집계 (content_schedules) ───────────
interface ResendEmailCount {
  sentCount: number;
  fetched: boolean;
}

async function fetchResendEmailCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ResendEmailCount> {
  const fallback: ResendEmailCount = { sentCount: 0, fetched: false };

  try {
    // 이번 달 시작일
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // content_schedules에서 이번 달 newsletter 채널의 completed 건수 집계
    const { count, error } = await supabase
      .from('content_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'newsletter')
      .eq('status', 'completed')
      .gte('published_at', monthStart)
      .is('deleted_at', null);

    if (error) {
      Sentry.captureException(error, { tags: { context: 'infra-status.resend-email-count' } });
      return fallback;
    }

    return { sentCount: count ?? 0, fetched: true };
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'infra-status.resend-email-count' } });
    return fallback;
  }
}

// ─── 메인 핸들러 ─────────────────────────────────────────────
export async function GET() {
  // 인증 확인
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 비동기 데이터 4종 병렬 조회
  const [supabaseLive, creditUsage, vaultStatus, resendEmails] = await Promise.all([
    fetchSupabaseMetrics(),
    fetchProviderCreditUsage(supabase),
    fetchVaultSecretStatus(supabase),
    fetchResendEmailCount(supabase),
  ]);

  // ─── 사용량 값 (live query > env var > null) ─────────────────────
  const vercelBandwidth    = envNumOrNull('VERCEL_BANDWIDTH_GB');
  const vercelFnInvoc      = envNumOrNull('VERCEL_FN_INVOCATIONS');
  const railwayUsage       = envNumOrNull('RAILWAY_CURRENT_USAGE_USD');
  const railwayMemory      = envNumOrNull('RAILWAY_MEMORY_MB');

  // Supabase: 실데이터 > env var > null
  const supabaseDbMB: { value: number | null; source: 'live' | 'env' | 'not_configured' } =
    supabaseLive.fetched
      ? { value: supabaseLive.dbSizeMB, source: 'live' }
      : (() => {
          const env = envNumOrNull('SUPABASE_DB_MB');
          return { value: env.value, source: env.source };
        })();
  const supabaseMau        = envNumOrNull('SUPABASE_MAU');
  const supabaseBandwidth  = envNumOrNull('SUPABASE_BANDWIDTH_GB');

  // LLM: 크레딧 테이블 실데이터 > env var > null
  const anthropicSpend: { value: number | null; source: 'live' | 'env' | 'not_configured' } =
    creditUsage.fetched && creditUsage.anthropicCredits > 0
      ? { value: creditUsage.anthropicCredits, source: 'live' }
      : (() => {
          const env = envNumOrNull('ANTHROPIC_MONTHLY_SPEND_USD');
          return { value: env.value, source: env.source };
        })();
  const anthropicBudgetUsd   = envNum('ANTHROPIC_MONTHLY_BUDGET_USD', 50);
  const openaiSpend: { value: number | null; source: 'live' | 'env' | 'not_configured' } =
    creditUsage.fetched && creditUsage.openaiCredits > 0
      ? { value: creditUsage.openaiCredits, source: 'live' }
      : (() => {
          const env = envNumOrNull('OPENAI_MONTHLY_SPEND_USD');
          return { value: env.value, source: env.source };
        })();
  const openaiBudgetUsd      = envNum('OPENAI_MONTHLY_BUDGET_USD', 20);

  // Resend: content_schedules 실데이터 > env var > null
  const resendSent: { value: number | null; source: 'live' | 'env' | 'not_configured' } =
    resendEmails.fetched
      ? { value: resendEmails.sentCount, source: 'live' }
      : (() => {
          const env = envNumOrNull('RESEND_EMAILS_SENT');
          return { value: env.value, source: env.source };
        })();
  const sentryEvents       = envNumOrNull('SENTRY_EVENTS_USED');
  const gdriveStorage      = envNumOrNull('GDRIVE_STORAGE_GB');

  // ─── connection status 계산 ───────────────────────────────────
  const anthropicConnStatus  = envConnectionStatus('ANTHROPIC_API_KEY');
  const openaiConnStatus     = envConnectionStatus('OPENAI_API_KEY');
  const sentryConnStatus     = envConnectionStatus('SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN');
  const resendConnStatus: ConnectionStatus = vaultStatus.fetched
    ? (vaultStatus.resendConfigured ? 'connected' : 'not_configured')
    : 'not_configured';

  // Supabase는 Management API 응답 성공 여부로 판정
  const supabaseConnStatus: ConnectionStatus = supabaseLive.fetched ? 'connected' : (
    process.env.NEXT_PUBLIC_SUPABASE_URL ? 'connected' : 'not_configured'
  );

  // Railway는 FASTAPI_URL 존재 여부로 판정
  const railwayConnStatus = envConnectionStatus('FASTAPI_URL', 'NEXT_PUBLIC_FASTAPI_URL');

  // Vercel은 배포 환경이면 항상 connected
  const vercelConnStatus: ConnectionStatus = process.env.VERCEL ? 'connected' : (
    envConnectionStatus('VERCEL_URL', 'NEXT_PUBLIC_VERCEL_URL')
  );

  // Google Drive는 MCP connection 기반 — env var 또는 vault
  const gdriveConnStatus = envConnectionStatus('GOOGLE_SERVICE_ACCOUNT_KEY');

  // ─── 메트릭 빌더 ───────────────────────────────────────────────
  function metric(
    label: string,
    current: number | null,
    limit: number,
    unit: string,
    source: 'live' | 'env' | 'not_configured' = 'live',
  ): UsageMetric {
    const pct = current !== null ? Math.min(Math.round((current / limit) * 100), 100) : 0;
    return { label, current, limit, unit, usagePercent: pct, source };
  }

  // ─── 서비스 목록 ───────────────────────────────────────────────
  const services: ServiceData[] = [
    // 1. Vercel
    (() => {
      const metrics = [
        metric('대역폭', vercelBandwidth.value, 100, 'GB', vercelBandwidth.source),
        metric('함수 호출', vercelFnInvoc.value, 100_000, '회', vercelFnInvoc.source),
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
        connectionStatus: vercelConnStatus,
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
      const railwayCostValue = railwayUsage.value ?? 0;
      const metrics = [
        metric('크레딧 사용', railwayUsage.value, 5, 'USD', railwayUsage.source),
        metric('메모리', railwayMemory.value, 512, 'MB', railwayMemory.source),
      ];
      return {
        id: 'railway',
        name: 'Railway',
        description: 'FastAPI 백엔드 서버 (파이프라인 오케스트레이션)',
        category: 'backend' as const,
        currentPlan: 'Hobby ($5 크레딧/월)',
        monthlyCostUsd: railwayCostValue,
        isVariableCost: true,
        costLabel: railwayUsage.value !== null
          ? `$${railwayCostValue.toFixed(2)} / $5.00`
          : '미설정',
        status: worstStatus(metrics),
        connectionStatus: railwayConnStatus,
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
      const dbLabel = supabaseDbMB.source === 'live' ? 'DB 용량 (실시간)' : 'DB 용량';
      const metrics = [
        metric(dbLabel, supabaseDbMB.value, 500, 'MB', supabaseDbMB.source),
        metric('월간 활성 유저', supabaseMau.value, 50_000, 'MAU', supabaseMau.source),
        metric('대역폭', supabaseBandwidth.value, 5, 'GB', supabaseBandwidth.source),
      ];
      // 실시간 연결 수 메트릭 추가 (API 성공 시)
      if (supabaseLive.fetched && supabaseLive.activeConnections > 0) {
        metrics.push(metric('활성 연결', supabaseLive.activeConnections, 60, '개', 'live'));
      }
      const descParts = ['PostgreSQL DB + 인증 + 스토리지 (BaaS)'];
      if (supabaseLive.fetched) {
        descParts.push('실시간 조회');
      }
      if (supabaseLive.region) {
        descParts.push(supabaseLive.region);
      }
      return {
        id: 'supabase',
        name: 'Supabase',
        description: descParts.join(' — '),
        category: 'database' as const,
        currentPlan: 'Free',
        monthlyCostUsd: 0,
        isVariableCost: false,
        costLabel: '무료',
        status: worstStatus(metrics),
        connectionStatus: supabaseConnStatus,
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
      const anthropicCostValue = anthropicSpend.value ?? 0;
      const metrics = [
        metric('월 예산 사용', anthropicSpend.value, anthropicBudgetUsd, 'USD', anthropicSpend.source),
      ];
      const usageSuffix = anthropicSpend.source === 'live'
        ? ' (크레딧 실데이터)'
        : '';
      return {
        id: 'anthropic',
        name: 'Anthropic (Claude API)',
        description: `AI 파이프라인 핵심 LLM — 에이전트 추론 엔진${usageSuffix}`,
        category: 'ai' as const,
        currentPlan: 'Pay-as-you-go',
        monthlyCostUsd: anthropicCostValue,
        isVariableCost: true,
        costLabel: anthropicSpend.value !== null
          ? `$${anthropicCostValue.toFixed(2)} 이번 달`
          : '미설정',
        status: worstStatus(metrics),
        connectionStatus: anthropicConnStatus,
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
        metric('월 발송 이메일', resendSent.value, 3_000, '통', resendSent.source),
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
        connectionStatus: resendConnStatus,
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
        metric('월 에러 이벤트', sentryEvents.value, 5_000, '건', sentryEvents.source),
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
        connectionStatus: sentryConnStatus,
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
        metric('스토리지', gdriveStorage.value, 15, 'GB', gdriveStorage.source),
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
        connectionStatus: gdriveConnStatus,
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
      const openaiSpendValue = openaiSpend.value ?? 0;
      const hasSpend = openaiSpend.value !== null && openaiSpend.value > 0;
      const usagePercent = hasSpend && openaiBudgetUsd > 0
        ? Math.round((openaiSpendValue / openaiBudgetUsd) * 100)
        : 0;
      const metrics: UsageMetric[] = hasSpend
        ? [{ label: '월 예산 사용', current: openaiSpendValue, limit: openaiBudgetUsd, unit: 'USD', usagePercent, source: openaiSpend.source }]
        : [];
      const usageSuffix = openaiSpend.source === 'live'
        ? ' (크레딧 실데이터)'
        : '';
      return {
        id: 'openai',
        name: 'OpenAI API',
        description: `GPT 모델 — 현재 미사용 (선택적 연동)${usageSuffix}`,
        category: 'ai' as const,
        currentPlan: hasSpend ? 'Pay-as-you-go' : '미연결',
        monthlyCostUsd: openaiSpendValue,
        isVariableCost: true,
        costLabel: hasSpend ? `$${openaiSpendValue.toFixed(2)} 이번 달` : '미사용',
        status: metrics.length > 0 ? worstStatus(metrics) : 'stable',
        connectionStatus: openaiConnStatus,
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
