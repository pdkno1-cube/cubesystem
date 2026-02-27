import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExecuteRequest {
  pipeline_id: string;
  workspace_id: string;
  input_params: Record<string, unknown>;
}

interface ExecuteResponseData {
  execution_id: string;
  status: string;
  message: string;
}

// ---------------------------------------------------------------------------
// POST /api/pipelines/execute
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
): Promise<NextResponse<{ data: ExecuteResponseData } | ApiErrorBody>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const body = (await request.json()) as ExecuteRequest;

    if (!body.pipeline_id || !body.workspace_id) {
      return apiError(
        'VALIDATION_ERROR',
        'pipeline_id와 workspace_id는 필수입니다.',
        400,
      );
    }

    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';

    // If FastAPI is not configured, return mock response for development
    if (!FASTAPI_URL) {
      return NextResponse.json({
        data: {
          execution_id: crypto.randomUUID(),
          status: 'running',
          message:
            'Pipeline started (mock mode - FastAPI not connected)',
        },
      });
    }

    // Proxy to FastAPI orchestration service
    const resp = await fetch(
      `${FASTAPI_URL}/orchestrate/pipeline/start`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': user.id,
        },
        body: JSON.stringify({
          pipeline_id: body.pipeline_id,
          workspace_id: body.workspace_id,
          input_params: body.input_params ?? {},
          user_id: user.id,
        }),
      },
    );

    if (!resp.ok) {
      const errorText = await resp.text();
      return apiError(
        'FASTAPI_ERROR',
        `FastAPI 오류: ${errorText}`,
        resp.status,
      );
    }

    const data = (await resp.json()) as ExecuteResponseData;
    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error, 'pipelines.execute.POST');
  }
}
