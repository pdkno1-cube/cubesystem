import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export function apiError<T = unknown>(code: string, message: string, status = 400): NextResponse<T | ApiErrorBody> {
  return NextResponse.json({ error: { code, message } } as T | ApiErrorBody, { status });
}

/**
 * Captures the error in Sentry and returns a generic 500 error response.
 * Use this in catch blocks of API route handlers.
 */
export function handleApiError<T = unknown>(error: unknown, context: string): NextResponse<T | ApiErrorBody> {
  Sentry.captureException(error, { tags: { context } });
  return apiError<T>("INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.", 500);
}

/**
 * Escapes LIKE/ILIKE wildcard characters (%, _, \) to prevent
 * wildcard injection in Supabase .ilike() queries.
 */
export function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}
