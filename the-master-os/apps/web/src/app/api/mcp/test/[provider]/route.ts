import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_URL = process.env.FASTAPI_URL ?? '';

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

  if (FASTAPI_URL) {
    const upstream = await fetch(
      `${FASTAPI_URL}/orchestrate/mcp/test/${provider}?workspace_id=${workspaceId}`,
      { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' } },
    );
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  }

  // Dev fallback — return a mock test result with simulated response time
  const mockResponseTimeMs = Math.round(Math.random() * 500 + 100);
  return NextResponse.json({
    data: {
      healthy: false,
      provider,
      health_status: 'down',
      tested_at: new Date().toISOString(),
      response_time_ms: mockResponseTimeMs,
      note: 'FastAPI unavailable — connect FASTAPI_URL to run real tests',
    },
  });
}
