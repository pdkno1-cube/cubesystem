/**
 * Supabase untyped client helper.
 *
 * The Database generic type causes `never` inference when chaining
 * `.update().eq().eq()` or `.insert()` on certain tables due to
 * Record<string, never> in Views/Functions/Enums/CompositeTypes.
 *
 * This helper strips the generic and returns a loosely-typed client
 * for write operations where the strict generic chain breaks.
 * Read operations should still use the typed client for full type safety.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function untyped<T>(client: T): any {
  return client;
}
