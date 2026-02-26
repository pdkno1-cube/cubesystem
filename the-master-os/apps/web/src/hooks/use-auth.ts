'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { createClient } from '@/lib/supabase/client';

export function useAuth() {
  const store = useAuthStore();

  useEffect(() => {
    // Initial session check
    store.fetchCurrentUser();

    // Listen for auth state changes via Supabase realtime
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        store.fetchCurrentUser();
      }

      if (event === 'SIGNED_OUT') {
        store.setUser(null);
        store.setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    user: store.user,
    isLoading: store.isLoading,
    isAuthenticated: store.isAuthenticated,
    mfaChallenge: store.mfaChallenge,
    login: store.login,
    logout: store.logout,
    refreshSession: store.refreshSession,
    verifyMfa: store.verifyMfa,
  };
}
