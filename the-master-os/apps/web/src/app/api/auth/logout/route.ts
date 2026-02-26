import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.signOut();

    if (error) {
      return NextResponse.json(
        {
          error: {
            code: 'LOGOUT_ERROR',
            message: 'Failed to sign out.',
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { success: true } });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred during logout.',
        },
      },
      { status: 500 }
    );
  }
}
