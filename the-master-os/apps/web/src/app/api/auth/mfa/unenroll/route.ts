import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';

const unenrollSchema = z.object({
  factorId: z.string().min(1, 'Factor ID is required'),
});

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = unenrollSchema.safeParse(body);

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
        { status: 400 },
      );
    }

    const { factorId } = parsed.data;

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Not authenticated.',
          },
        },
        { status: 401 },
      );
    }

    const { error } = await supabase.auth.mfa.unenroll({
      factorId,
    });

    if (error) {
      return NextResponse.json(
        {
          error: {
            code: 'MFA_UNENROLL_ERROR',
            message: 'Failed to unenroll MFA factor.',
          },
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: {
        success: true,
      },
    });
  } catch (error) {
    return handleApiError(error, 'auth-mfa-unenroll.POST');
  }
}
