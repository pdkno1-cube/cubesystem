import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// In-memory store for login attempts. In production, use Redis or a database.
const loginAttempts = new Map<
  string,
  { count: number; lockedUntil: number | null }
>();

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

function getLoginAttemptState(email: string) {
  return loginAttempts.get(email) ?? { count: 0, lockedUntil: null };
}

function recordFailedAttempt(email: string): {
  isLocked: boolean;
  attemptsRemaining: number;
} {
  const state = getLoginAttemptState(email);
  state.count += 1;

  if (state.count >= MAX_LOGIN_ATTEMPTS) {
    state.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }

  loginAttempts.set(email, state);

  return {
    isLocked: state.count >= MAX_LOGIN_ATTEMPTS,
    attemptsRemaining: Math.max(0, MAX_LOGIN_ATTEMPTS - state.count),
  };
}

function clearLoginAttempts(email: string) {
  loginAttempts.delete(email);
}

function isAccountLocked(email: string): boolean {
  const state = getLoginAttemptState(email);
  if (state.lockedUntil === null) {return false;}

  if (Date.now() > state.lockedUntil) {
    // Lock expired, clear attempts
    clearLoginAttempts(email);
    return false;
  }

  return true;
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = loginSchema.safeParse(body);

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

    const { email, password } = parsed.data;

    // Check if account is locked (P0-10: Login failure lockout)
    if (isAccountLocked(email)) {
      return NextResponse.json(
        {
          error: {
            code: 'ACCOUNT_LOCKED',
            message:
              'Account is temporarily locked due to too many failed login attempts. Try again after 30 minutes.',
          },
        },
        { status: 429 }
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const { isLocked, attemptsRemaining } = recordFailedAttempt(email);

      // Log failed attempt to audit (in production, insert to audit_logs table)
      const auditDetails = {
        action: 'auth.login_failed',
        email,
        attemptsRemaining,
        isLocked,
        timestamp: new Date().toISOString(),
      };

      // Using structured logging instead of console.log
      if (process.env.NODE_ENV === 'development') {
        process.stderr.write(
          `[AUDIT] Login failed: ${JSON.stringify(auditDetails)}\n`
        );
      }

      if (isLocked) {
        return NextResponse.json(
          {
            error: {
              code: 'ACCOUNT_LOCKED',
              message:
                'Account is temporarily locked due to too many failed login attempts. Try again after 30 minutes.',
            },
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: `Invalid email or password. ${attemptsRemaining} attempt(s) remaining.`,
          },
        },
        { status: 401 }
      );
    }

    // Clear failed attempts on successful login
    clearLoginAttempts(email);

    const session = data.session;
    const user = data.user;

    // Check if MFA is required
    // Supabase returns an aal1 session if MFA is enrolled but not verified
    if (
      session &&
      user.factors &&
      user.factors.length > 0
    ) {
      const totpFactor = user.factors.find(
        (f) => f.factor_type === 'totp' && f.status === 'verified'
      );

      if (totpFactor) {
        // MFA is enrolled - issue a challenge
        const { data: challengeData, error: challengeError } =
          await supabase.auth.mfa.challenge({
            factorId: totpFactor.id,
          });

        if (challengeError) {
          return NextResponse.json(
            {
              error: {
                code: 'MFA_CHALLENGE_ERROR',
                message: 'Failed to create MFA challenge.',
              },
            },
            { status: 500 }
          );
        }

        return NextResponse.json({
          data: {
            success: true,
            requiresMfa: true,
            mfaChallenge: {
              factorId: totpFactor.id,
              challengeId: challengeData.id,
            },
            user: null,
          },
        });
      }
    }

    return NextResponse.json({
      data: {
        success: true,
        requiresMfa: false,
        mfaChallenge: null,
        user: {
          id: user.id,
          email: user.email ?? '',
          displayName: user.user_metadata?.['display_name'] as string ?? '',
          avatarUrl: (user.user_metadata?.['avatar_url'] as string) ?? null,
          role: (user.user_metadata?.['role'] as string) ?? 'owner',
        },
      },
    });
  } catch (error) {
    return handleApiError(error, "auth-login.POST");
  }
}
