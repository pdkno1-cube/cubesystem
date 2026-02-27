import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';

const FASTAPI_URL = process.env.FASTAPI_URL ?? process.env.NEXT_PUBLIC_FASTAPI_URL ?? '';

// ─── Types ───────────────────────────────────────────────────────

interface TestResultData {
  healthy: boolean;
  provider: string;
  health_status: 'healthy' | 'down' | 'unknown';
  tested_at: string;
  response_time_ms: number;
  note: string;
}

interface SecretRow {
  id: string;
  encrypted_value: string;
  iv: string;
  auth_tag: string;
}

// ─── Provider-specific ping tests ────────────────────────────────

async function pingResend(apiKey: string): Promise<{ ok: boolean; ms: number; note: string }> {
  const start = Date.now();
  try {
    const resp = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    const ms = Date.now() - start;
    if (resp.ok || resp.status === 200) {
      return { ok: true, ms, note: 'Resend API 연결 성공' };
    }
    if (resp.status === 401) {
      return { ok: false, ms, note: 'API 키가 유효하지 않습니다 (401 Unauthorized)' };
    }
    return { ok: false, ms, note: `Resend API 응답: ${resp.status} ${resp.statusText}` };
  } catch (error) {
    const ms = Date.now() - start;
    Sentry.captureException(error, { tags: { context: 'mcp.test.resend' } });
    return { ok: false, ms, note: 'Resend API 연결 실패 (네트워크 오류)' };
  }
}

async function pingGoogleDrive(serviceAccountJson: string): Promise<{ ok: boolean; ms: number; note: string }> {
  const start = Date.now();
  try {
    // Validate JSON structure only — full OAuth flow requires server-to-server JWT
    const parsed = JSON.parse(serviceAccountJson) as Record<string, unknown>;
    const ms = Date.now() - start;
    if (parsed['type'] === 'service_account' && parsed['client_email'] && parsed['private_key']) {
      return { ok: true, ms, note: `Service Account 확인: ${String(parsed['client_email'])}` };
    }
    return { ok: false, ms, note: 'Service Account JSON 형식이 올바르지 않습니다' };
  } catch {
    const ms = Date.now() - start;
    return { ok: false, ms, note: 'Service Account JSON 파싱 실패' };
  }
}

async function pingSlack(botToken: string): Promise<{ ok: boolean; ms: number; note: string }> {
  const start = Date.now();
  try {
    const resp = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      signal: AbortSignal.timeout(5000),
    });
    const ms = Date.now() - start;
    const body = (await resp.json()) as { ok: boolean; team?: string; error?: string };
    if (body.ok) {
      return { ok: true, ms, note: `Slack 연결 성공 (${body.team ?? 'unknown team'})` };
    }
    return { ok: false, ms, note: `Slack 인증 실패: ${body.error ?? 'unknown'}` };
  } catch (error) {
    const ms = Date.now() - start;
    Sentry.captureException(error, { tags: { context: 'mcp.test.slack' } });
    return { ok: false, ms, note: 'Slack API 연결 실패 (네트워크 오류)' };
  }
}

async function pingFirecrawl(apiKey: string): Promise<{ ok: boolean; ms: number; note: string }> {
  const start = Date.now();
  try {
    const resp = await fetch('https://api.firecrawl.dev/v0/scrape', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com', onlyMainContent: true }),
      signal: AbortSignal.timeout(10000),
    });
    const ms = Date.now() - start;
    if (resp.ok || resp.status === 200) {
      return { ok: true, ms, note: 'FireCrawl API 연결 성공' };
    }
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, ms, note: 'API 키가 유효하지 않습니다' };
    }
    return { ok: false, ms, note: `FireCrawl API 응답: ${resp.status}` };
  } catch (error) {
    const ms = Date.now() - start;
    Sentry.captureException(error, { tags: { context: 'mcp.test.firecrawl' } });
    return { ok: false, ms, note: 'FireCrawl API 연결 실패' };
  }
}

// Provider dispatch map
const PING_HANDLERS: Record<string, (secret: string) => Promise<{ ok: boolean; ms: number; note: string }>> = {
  resend: pingResend,
  google_drive: pingGoogleDrive,
  slack: pingSlack,
  firecrawl: pingFirecrawl,
};

// Providers that exist in the DB enum but are not yet implemented
const UNIMPLEMENTED_PROVIDERS: ReadonlySet<string> = new Set(['figma']);

// ─── POST /api/mcp/test/[provider] ──────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const workspaceId = req.nextUrl.searchParams.get('workspace_id');
  const token = req.headers.get('authorization') ?? '';

  if (!workspaceId) {
    return NextResponse.json(
      { error: { code: 'MISSING_PARAM', message: 'workspace_id required' } },
      { status: 400 },
    );
  }

  // Guard: providers that exist in DB enum but have no implementation yet
  if (UNIMPLEMENTED_PROVIDERS.has(provider)) {
    const result: TestResultData = {
      healthy: false,
      provider,
      health_status: 'unknown',
      tested_at: new Date().toISOString(),
      response_time_ms: 0,
      note: `${provider.charAt(0).toUpperCase() + provider.slice(1)} integration not yet implemented`,
    };
    return NextResponse.json({ data: result });
  }

  // 1) FastAPI가 있으면 upstream으로 프록시
  if (FASTAPI_URL) {
    try {
      const upstream = await fetch(
        `${FASTAPI_URL}/orchestrate/mcp/test/${provider}?workspace_id=${workspaceId}`,
        {
          method: 'POST',
          headers: { Authorization: token, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
        },
      );
      return NextResponse.json(await upstream.json(), { status: upstream.status });
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'mcp.test.upstream' } });
      // FastAPI 연결 실패 시 BFF 직접 테스트로 fallback
    }
  }

  // 2) BFF 직접 테스트 — vault에서 시크릿 조회 후 ping
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다' } },
        { status: 401 },
      );
    }

    // mcp_connections에서 해당 프로바이더의 secret_ref 조회
    const { data: connection } = await supabase
      .from('mcp_connections')
      .select('id, secret_ref')
      .eq('workspace_id', workspaceId)
      .eq('provider', provider)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    const secretRef = connection?.secret_ref as string | null;

    if (!secretRef) {
      const result: TestResultData = {
        healthy: false,
        provider,
        health_status: 'down',
        tested_at: new Date().toISOString(),
        response_time_ms: 0,
        note: 'API 키가 설정되지 않았습니다 — Vault에서 시크릿을 등록하고 MCP에 연결하세요',
      };
      return NextResponse.json({ data: result });
    }

    // vault에서 시크릿 값 복호화
    const { data: secretRow } = await supabase
      .from('secret_vault')
      .select('id, encrypted_value, iv, auth_tag')
      .eq('id', secretRef)
      .is('deleted_at', null)
      .maybeSingle();

    const typedSecret = secretRow as SecretRow | null;

    if (!typedSecret) {
      const result: TestResultData = {
        healthy: false,
        provider,
        health_status: 'down',
        tested_at: new Date().toISOString(),
        response_time_ms: 0,
        note: '연결된 시크릿을 찾을 수 없습니다 — Vault를 확인하세요',
      };
      return NextResponse.json({ data: result });
    }

    let decryptedValue: string;
    try {
      decryptedValue = decrypt(
        typedSecret.encrypted_value,
        typedSecret.iv,
        typedSecret.auth_tag,
      );
    } catch (decryptError) {
      Sentry.captureException(decryptError, { tags: { context: 'mcp.test.decrypt' } });
      const result: TestResultData = {
        healthy: false,
        provider,
        health_status: 'down',
        tested_at: new Date().toISOString(),
        response_time_ms: 0,
        note: '시크릿 복호화 실패 — VAULT_ENCRYPTION_KEY를 확인하세요',
      };
      return NextResponse.json({ data: result });
    }

    // 프로바이더별 ping 테스트 실행
    const handler = PING_HANDLERS[provider];
    if (!handler) {
      // 지원하지 않는 프로바이더는 시크릿 존재만 확인
      const result: TestResultData = {
        healthy: true,
        provider,
        health_status: 'healthy',
        tested_at: new Date().toISOString(),
        response_time_ms: 0,
        note: `시크릿 등록 확인됨 (${provider} 직접 ping 미지원)`,
      };
      return NextResponse.json({ data: result });
    }

    const pingResult = await handler(decryptedValue);

    // mcp_connections health 상태 업데이트 (fire-and-forget)
    if (connection?.id) {
      void supabase
        .from('mcp_connections')
        .update({
          health_status: pingResult.ok ? 'healthy' : 'down',
          last_health_check: new Date().toISOString(),
          test_result: { ok: pingResult.ok, ms: pingResult.ms, note: pingResult.note },
        })
        .eq('id', connection.id)
        .then();
    }

    const result: TestResultData = {
      healthy: pingResult.ok,
      provider,
      health_status: pingResult.ok ? 'healthy' : 'down',
      tested_at: new Date().toISOString(),
      response_time_ms: pingResult.ms,
      note: pingResult.note,
    };

    return NextResponse.json({ data: result });
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'mcp.test.bff' } });
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'MCP 테스트 실행 중 오류 발생' } },
      { status: 500 },
    );
  }
}
