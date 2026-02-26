import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

type UserRow = Database['public']['Tables']['users']['Row'];

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Not authenticated.',
          },
        },
        { status: 401 }
      );
    }

    // Fetch extended user profile from users table
    const { data: rawProfile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    const profile = rawProfile as UserRow | null;

    return NextResponse.json({
      data: {
        id: user.id,
        email: user.email ?? '',
        displayName:
          profile?.display_name ??
          (user.user_metadata?.['display_name'] as string) ??
          '',
        avatarUrl:
          profile?.avatar_url ??
          (user.user_metadata?.['avatar_url'] as string) ??
          null,
        role: profile?.role ?? 'owner',
        isActive: profile?.is_active ?? true,
        lastLoginAt: profile?.last_login_at ?? null,
        createdAt: profile?.created_at ?? user.created_at,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
        },
      },
      { status: 500 }
    );
  }
}
