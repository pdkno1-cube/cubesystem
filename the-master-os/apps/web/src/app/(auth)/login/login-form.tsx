'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';

const loginFormSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

const mfaCodeSchema = z
  .string()
  .length(6, 'Code must be exactly 6 digits.')
  .regex(/^\d{6}$/, 'Code must contain only digits.');

type FormStep = 'credentials' | 'mfa';

function GoogleLoginButton({ disabled }: { disabled: boolean }) {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <button
      type="button"
      onClick={handleGoogleLogin}
      disabled={disabled || loading}
      className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
      {loading ? '연결 중...' : 'Google로 로그인'}
    </button>
  );
}

export function LoginForm() {
  const router = useRouter();
  const { login, verifyMfa, mfaChallenge, isLoading } = useAuth();

  const [step, setStep] = useState<FormStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleCredentialsSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setFieldErrors({});

      const validation = loginFormSchema.safeParse({ email, password });
      if (!validation.success) {
        const errors: Record<string, string> = {};
        for (const err of validation.error.errors) {
          const field = err.path[0];
          if (typeof field === 'string') {
            errors[field] = err.message;
          }
        }
        setFieldErrors(errors);
        return;
      }

      const result = await login(email, password);

      if (!result.success) {
        setError(result.error ?? 'Login failed.');
        return;
      }

      if (result.requiresMfa) {
        setStep('mfa');
        return;
      }

      router.push('/dashboard');
    },
    [email, password, login, router]
  );

  const handleMfaSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);

      const validation = mfaCodeSchema.safeParse(mfaCode);
      if (!validation.success) {
        setError(validation.error.errors[0]?.message ?? 'Invalid code.');
        return;
      }

      if (!mfaChallenge) {
        setError('MFA challenge is missing. Please try logging in again.');
        setStep('credentials');
        return;
      }

      const success = await verifyMfa(
        mfaChallenge.factorId,
        mfaChallenge.challengeId,
        mfaCode
      );

      if (!success) {
        setError('Invalid verification code. Please try again.');
        setMfaCode('');
        return;
      }

      router.push('/dashboard');
    },
    [mfaCode, mfaChallenge, verifyMfa, router]
  );

  if (step === 'mfa') {
    return (
      <form onSubmit={handleMfaSubmit} className="space-y-4">
        <div>
          <p className="mb-4 text-sm text-ink-secondary">
            Enter the 6-digit code from your authenticator app.
          </p>
          <label
            htmlFor="mfa-code"
            className="mb-1.5 block text-sm font-medium text-ink-primary"
          >
            Verification Code
          </label>
          <input
            id="mfa-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-lg tracking-widest text-ink-primary placeholder-ink-disabled focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            placeholder="000000"
            disabled={isLoading}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-semantic-error"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Verifying...' : 'Verify'}
        </button>

        <button
          type="button"
          onClick={() => {
            setStep('credentials');
            setMfaCode('');
            setError(null);
          }}
          className="w-full text-sm text-ink-tertiary transition-colors hover:text-ink-secondary"
        >
          Back to login
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleCredentialsSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-sm font-medium text-ink-primary"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-ink-primary placeholder-ink-disabled focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          placeholder="admin@masteros.com"
          disabled={isLoading}
        />
        {fieldErrors['email'] && (
          <p className="mt-1 text-xs text-semantic-error">
            {fieldErrors['email']}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium text-ink-primary"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-ink-primary placeholder-ink-disabled focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          placeholder="Enter your password"
          disabled={isLoading}
        />
        {fieldErrors['password'] && (
          <p className="mt-1 text-xs text-semantic-error">
            {fieldErrors['password']}
          </p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-semantic-error"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? 'Signing in...' : 'Sign In'}
      </button>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-2 text-gray-400">or</span>
        </div>
      </div>

      <GoogleLoginButton disabled={isLoading} />
    </form>
  );
}
