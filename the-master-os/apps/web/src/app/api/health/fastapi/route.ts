import { NextResponse } from 'next/server';

const FASTAPI_URL = process.env.FASTAPI_URL ?? '';

interface FastApiHealthResponse {
  status: string;
}

export async function GET() {
  if (!FASTAPI_URL) {
    return NextResponse.json(
      { healthy: false, reason: 'FASTAPI_URL not configured' },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`${FASTAPI_URL}/orchestrate/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { healthy: false, reason: `upstream responded ${res.status}` },
        { status: 502 },
      );
    }

    const data: FastApiHealthResponse = await res.json();
    const healthy = data.status === 'healthy';

    return NextResponse.json({ healthy, upstream: data });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown fetch error';
    return NextResponse.json(
      { healthy: false, reason: message },
      { status: 502 },
    );
  }
}
