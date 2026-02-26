import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    return NextResponse.json({
      data: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at ?? 0,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred during session refresh.',
        },
      },
      { status: 500 }
    );
  }
}
