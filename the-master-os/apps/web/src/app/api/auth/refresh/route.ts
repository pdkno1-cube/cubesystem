import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api-response';

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { session },
      error,
    } = await supabase.auth.refreshSession();

    if (error || !session) {
      return NextResponse.json(
        {
          error: {
            code: 'REFRESH_FAILED',
            message: 'Failed to refresh session. Please log in again.',
          },
        },
        { status: 401 }
      );
    }

    // SECURITY: Do not expose tokens in the response body.
    // Supabase SSR manages sessions via HttpOnly cookies automatically.
    return NextResponse.json({
      data: {
        expiresAt: session.expires_at ?? 0,
      },
    });
  } catch (error) {
    return handleApiError(error, "auth-refresh.POST");
  }
}
