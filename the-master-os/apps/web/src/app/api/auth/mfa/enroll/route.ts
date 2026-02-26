import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api-response';

export async function POST() {
  try {
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
        { status: 401 }
      );
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'The Master OS TOTP',
    });

    if (error) {
      return NextResponse.json(
        {
          error: {
            code: 'MFA_ENROLL_ERROR',
            message: 'Failed to start MFA enrollment.',
          },
        },
        { status: 500 }
      );
    }

    // SECURITY: Do not expose the raw TOTP secret in the response.
    // The QR code already encodes the secret for scanning.
    return NextResponse.json({
      data: {
        factorId: data.id,
        totpUri: data.totp.uri,
        qrCode: data.totp.qr_code,
      },
    });
  } catch (error) {
    return handleApiError(error, "auth-mfa-enroll.POST");
  }
}
