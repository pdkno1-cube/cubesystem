import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const FASTAPI_URL = process.env.FASTAPI_URL ?? '';

const PROVIDER_META: Record<
  string,
  { label: string; description: string; icon: string; required_secret: string }
> = {
  resend: {
    label: 'Resend',
    description: '이메일 뉴스레터 & 트랜잭션 이메일 발송',
    icon: 'mail',
    required_secret: 'API Key (re_...)',
  },
  google_drive: {
    label: 'Google Drive',
    description: '파이프라인 결과물 자동 저장 & 공유',
    icon: 'hard-drive',
    required_secret: 'Service Account JSON',
  },
  slack: {
    label: 'Slack',
    description: '파이프라인 완료 & 에러 Slack 알림',
    icon: 'message-circle',
    required_secret: 'Bot User OAuth Token (xoxb-...)',
  },
  firecrawl: {
    label: 'FireCrawl',
    description: '웹 스크래핑 & 콘텐츠 추출',
    icon: 'globe',
    required_secret: 'API Key (fc-...)',
  },
  paddleocr: {
    label: 'PaddleOCR',
    description: 'PDF/이미지 문서 텍스트 추출',
    icon: 'file-scan',
    required_secret: 'Endpoint URL (또는 로컬 실행)',
  },
};

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get('workspace_id');
  if (!workspaceId) {
    return NextResponse.json({ error: { code: 'MISSING_PARAM', message: 'workspace_id required' } }, { status: 400 });
  }

  // Proxy to FastAPI if available
  if (FASTAPI_URL) {
    const token = req.headers.get('authorization') ?? '';
    const upstream = await fetch(
      `${FASTAPI_URL}/orchestrate/mcp/providers?workspace_id=${workspaceId}`,
      { headers: { Authorization: token, 'Content-Type': 'application/json' } },
    );
    const body = await upstream.json();
    return NextResponse.json(body, { status: upstream.status });
  }

  // Fallback: Supabase direct query
  try {
    const supabase = await createClient();
    const { data: connections } = await supabase
      .from('mcp_connections')
      .select('id, provider, secret_ref, health_status, last_health_check, test_result')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .is('deleted_at', null);

    type ConnRow = NonNullable<typeof connections>[number];
    const connByProvider: Record<string, ConnRow> = {};
    for (const c of connections ?? []) {
      connByProvider[c.provider as string] = c;
    }

    const statuses = Object.entries(PROVIDER_META).map(([provider, meta]) => {
      const conn = connByProvider[provider];
      return {
        provider,
        ...meta,
        doc_url: `https://example.com/${provider}`,
        connection_id: conn?.id ?? null,
        secret_ref: conn?.secret_ref ?? null,
        health_status: conn ? conn.health_status ?? 'unknown' : 'not_connected',
        last_health_check: conn?.last_health_check ?? null,
        test_result: conn?.test_result ?? null,
        is_connected: !!conn,
      };
    });

    return NextResponse.json({ data: statuses });
  } catch {
    return NextResponse.json({ error: { code: 'DB_ERROR', message: 'Failed to fetch providers' } }, { status: 500 });
  }
}
