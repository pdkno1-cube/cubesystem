'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { useAuth } from '@/hooks/use-auth';

const loginFormSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

const mfaCodeSchema = z
  .string()
  .length(6, 'Code must be exactly 6 digits.')
  .regex(/^\d{6}$/, 'Code must contain only digits.');

type FormStep = 'credentials' | 'mfa';

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
    </form>
  );
}
