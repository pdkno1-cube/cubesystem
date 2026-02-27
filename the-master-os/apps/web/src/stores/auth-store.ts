import { create } from 'zustand';
import * as Sentry from '@sentry/nextjs';
import type { User, LoginResult, MfaChallenge } from '@/types/auth';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mfaChallenge: MfaChallenge | null;

  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setMfaChallenge: (challenge: MfaChallenge | null) => void;

  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  verifyMfa: (
    factorId: string,
    challengeId: string,
    code: string
  ) => Promise<boolean>;
  fetchCurrentUser: () => Promise<void>;
}

async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<{ data?: T; error?: { code: string; message: string } }> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  const json: unknown = await response.json();
  const result = json as {
    data?: T;
    error?: { code: string; message: string };
  };

  if (!response.ok) {
    return {
      error: result.error ?? {
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred.',
      },
    };
  }

  return result;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  mfaChallenge: null,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: user !== null,
    }),

  setLoading: (loading) => set({ isLoading: loading }),

  setMfaChallenge: (challenge) => set({ mfaChallenge: challenge }),

  login: async (email, password) => {
    set({ isLoading: true });

    try {
      const result = await apiFetch<{
        success: boolean;
        requiresMfa: boolean;
        mfaChallenge: MfaChallenge | null;
        user: User | null;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (result.error) {
        set({ isLoading: false });
        return {
          success: false,
          user: null,
          requiresMfa: false,
          mfaChallenge: null,
          error: result.error.message,
        };
      }

      const data = result.data;

      if (data?.requiresMfa && data.mfaChallenge) {
        set({
          isLoading: false,
          mfaChallenge: data.mfaChallenge,
        });
        return {
          success: true,
          user: null,
          requiresMfa: true,
          mfaChallenge: data.mfaChallenge,
          error: null,
        };
      }

      if (data?.user) {
        set({
          user: data.user,
          isAuthenticated: true,
          isLoading: false,
          mfaChallenge: null,
        });
      }

      return {
        success: true,
        user: data?.user ?? null,
        requiresMfa: false,
        mfaChallenge: null,
        error: null,
      };
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'auth.login' } });
      set({ isLoading: false });
      return {
        success: false,
        user: null,
        requiresMfa: false,
        mfaChallenge: null,
        error: 'Network error. Please check your connection.',
      };
    }
  },

  logout: async () => {
    set({ isLoading: true });

    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        mfaChallenge: null,
      });
    }
  },

  refreshSession: async () => {
    try {
      const result = await apiFetch<{
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
      }>('/api/auth/refresh', { method: 'POST' });

      if (result.error) {
        // Session expired, clear auth state
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'auth.refreshSession' } });
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  verifyMfa: async (factorId, challengeId, code) => {
    set({ isLoading: true });

    try {
      const result = await apiFetch<{ success: boolean }>('/api/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ factorId, challengeId, code }),
      });

      if (result.error) {
        set({ isLoading: false });
        return false;
      }

      // MFA verified successfully, fetch full user data
      await get().fetchCurrentUser();
      set({ mfaChallenge: null });

      return true;
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'auth.verifyMfa' } });
      set({ isLoading: false });
      return false;
    }
  },

  fetchCurrentUser: async () => {
    set({ isLoading: true });

    try {
      const result = await apiFetch<User>('/api/auth/me');

      if (result.error) {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return;
      }

      if (result.data) {
        set({
          user: result.data,
          isAuthenticated: true,
          isLoading: false,
        });
      }
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'auth.fetchCurrentUser' } });
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },
}));
