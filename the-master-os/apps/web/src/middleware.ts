import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC_ROUTES = new Set(['/login', '/auth/callback']);

// DEV_BYPASS: Supabase 미연결 시 인증 우회 (개발 전용)
// SECURITY: Only allow bypass when NOT in production to prevent accidental auth disable
const DEV_AUTH_BYPASS =
  process.env.NODE_ENV !== 'production' &&
  process.env.DEV_AUTH_BYPASS === 'true';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // DEV_BYPASS: 개발 모드에서 인증 우회
  if (DEV_AUTH_BYPASS) {
    if (PUBLIC_ROUTES.has(pathname)) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/dashboard';
      return NextResponse.redirect(dashboardUrl);
    }
    return NextResponse.next();
  }

  // 1. Refresh Supabase session (renews JWT cookie if needed)
  const { supabaseResponse, user } = await updateSession(request);

  // 2. Unauthenticated user trying to access protected route -> redirect to /login
  if (!user && !PUBLIC_ROUTES.has(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 3. Authenticated user accessing /login -> redirect to /dashboard
  if (user && PUBLIC_ROUTES.has(pathname)) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
};
