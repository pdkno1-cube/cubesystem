import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const mfaVerifySchema = z.object({
  factorId: z.string().min(1, 'Factor ID is required'),
  challengeId: z.string().min(1, 'Challenge ID is required'),
  code: z
    .string()
    .length(6, 'TOTP code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'TOTP code must contain only digits'),
});

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = mfaVerifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors
              .map((e) => e.message)
              .join(', '),
          },
        },
        { status: 400 }
      );
    }

    const { factorId, challengeId, code } = parsed.data;

    const supabase = await createClient();

    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code,
    });

    if (error) {
      return NextResponse.json(
        {
          error: {
            code: 'MFA_VERIFY_FAILED',
            message: 'Invalid TOTP code. Please try again.',
          },
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      data: {
        success: true,
        user: data.user
          ? {
              id: data.user.id,
              email: data.user.email ?? '',
            }
          : null,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred during MFA verification.',
        },
      },
      { status: 500 }
    );
  }
}
