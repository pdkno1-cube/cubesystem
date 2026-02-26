# CODE REVIEW -- Phase 1

> Reviewer: TEAM_I (CODE_REVIEWER / DEBT_HUNTER / REFACTOR_LEAD)
> Date: 2026-02-26
> Protocol: PRIME 4-Protocol (SRP / DRY / TypeSafe / Security)

---

## Summary

- Total files reviewed: 12
- Issues: **Critical 2** / **Major 7** / **Minor 9** / **Suggestion 6**

| Severity | Count | Description |
|----------|-------|-------------|
| Critical | 2 | Plaintext secret storage, SQL injection via ilike |
| Major | 7 | N+1 queries, DRY violations, missing authorization scope, type safety gaps |
| Minor | 9 | Missing error logging, hardcoded strings, unused interfaces, navigation method |
| Suggestion | 6 | Pagination, React Query adoption, component extraction, test coverage |

---

## File-by-File Review

---

### 1. `apps/web/src/app/api/audit-logs/route.ts`

**Grade: B (Good)**

#### Issues

- **[Major] N+2 query pattern (lines 104-127)** -- After fetching audit logs, the code makes two additional queries (workspaces, profiles) to resolve names. This is acceptable for bounded result sets, but will degrade as data grows. Consider a SQL view or join approach via Supabase `.select('*, workspaces(name), profiles:user_id(display_name)')`.
  - Recommendation: Create a Supabase view `audit_logs_with_names` or use relational query syntax.

- **[Major] SQL injection risk in ilike filter (line 65)** -- The `action` parameter is injected directly into an `ilike` pattern (`%${action}%`). While Supabase parameterizes the value, the `%` wildcards allow users to craft patterns that bypass intended filtering. A malicious user could pass `%` to match everything or use `_` as single-char wildcards.
  - Recommendation: Sanitize the input by escaping `%` and `_` characters before passing to `ilike`, or use `eq` for exact match filtering.

- **[Minor] No limit validation (lines 50-51)** -- `page` and `limit` are parsed via `parseInt` but never validated for range. A user could pass `limit=100000` and retrieve excessive data.
  - Recommendation: Clamp `limit` to a max value (e.g., `Math.min(Math.max(limit, 1), 100)`).

- **[Minor] Missing error logging (line 153)** -- The outer catch block returns a generic error response but does not log the actual error. PRIME Commercialization Standard requires Sentry-level observability.
  - Recommendation: Add structured error logging (e.g., Sentry `captureException`) in the catch block.

- **[Minor] Unused interface `AuditLogsErrorResponse` (line 27)** -- Defined but only used as a union member in the return type. The `errorResponse` helper constructs the shape inline.
  - Note: Not harmful but could be removed if errorResponse already ensures the shape.

#### Good Points

- Well-typed response interfaces with proper `AuditLogEntry` definition.
- `errorResponse` helper function promotes consistent error formatting.
- Auth check at the top of the handler.
- Proper use of `{ count: "exact" }` for total count.
- Type-safe severity union type.

---

### 2. `apps/web/src/app/api/credits/route.ts`

**Grade: B- (Good with issues)**

#### Issues

- **[Major] Fetches ALL credit records without pagination (line 57-60)** -- `allCredits` selects every record in the `credits` table to compute aggregates client-side. As the table grows, this will cause severe performance degradation and memory pressure on the server.
  - Recommendation: Use Supabase RPC (database function) or SQL view to compute `total_charged`, `total_used`, and `total_balance` server-side. For `recent_transactions`, use `.limit(20)` directly.

- **[Minor] Missing error logging (line 159)** -- Same pattern as audit-logs: catch block swallows the actual error.
  - Recommendation: Log to Sentry.

- **[Minor] Hardcoded limit 20 (line 99)** -- `records.slice(0, 20)` is a magic number.
  - Recommendation: Extract to a named constant `const RECENT_TRANSACTION_LIMIT = 20`.

- **[Suggestion] No authorization scope** -- The query fetches all credits without filtering by user or workspace membership. Any authenticated user can see all credits across all workspaces.
  - Recommendation: Add RLS policies in Supabase or filter by user's workspace membership.

#### Good Points

- Clean separation of `overview`, `recent_transactions`, and `workspace_usage` in the response.
- Proper workspace name resolution pattern.
- Well-defined TypeScript interfaces for all response shapes.
- Consistent error response pattern.

---

### 3. `apps/web/src/app/api/pipelines/route.ts`

**Grade: C (Needs Improvement)**

#### Issues

- **[Critical-downgraded-to-Major] N+1 query -- 3 queries per pipeline (lines 69-126)** -- For each pipeline, the code executes 3 additional Supabase queries (`totalExecutions`, `lastExecution`, `runningCount`, `errorCount` -- actually 4 queries). With 20 pipelines, this results in 80+ database round-trips. This is the most severe performance issue in the Phase 1 codebase.
  - Recommendation: Replace with a single SQL query using aggregation:
    ```sql
    SELECT p.*,
      COUNT(pe.id) as total_executions,
      MAX(pe.created_at) as last_executed_at,
      COUNT(pe.id) FILTER (WHERE pe.status = 'running') as running_count,
      COUNT(pe.id) FILTER (WHERE pe.status = 'error') as error_count
    FROM pipelines p
    LEFT JOIN pipeline_executions pe ON pe.pipeline_id = p.id
    WHERE p.deleted_at IS NULL
    GROUP BY p.id
    ```
    Implement via Supabase RPC or database view.

- **[Major] No pagination (line 54-58)** -- Fetches all pipelines without limit. Combined with the N+1 problem, this can bring down the API endpoint under load.
  - Recommendation: Add pagination parameters similar to audit-logs.

- **[Minor] Missing error logging (line 132-138)** -- Same catch-swallow pattern.

- **[Minor] `select("*")` overfetch (line 56)** -- Selects all columns from pipelines when only a subset is needed.
  - Recommendation: Select only needed columns: `id, name, slug, description, category, is_system, created_at`.

#### Good Points

- Proper soft-delete filtering with `.is("deleted_at", null)`.
- Clean status derivation logic (running > error > inactive).
- Well-typed `PipelineSummary` interface with proper union types.

---

### 4. `apps/web/src/app/api/vault/route.ts`

**Grade: B (Good)**

#### Issues

- **[Critical] Plaintext secret storage (lines 157-172)** -- The code stores secrets in plaintext with placeholder `iv` and `auth_tag` values (`'plaintext-phase1'`). The comment states "Phase 1: plaintext storage (Phase 2 will add AES-256-GCM encryption)" but this is a significant security risk if this code reaches any environment with real secrets.
  - Recommendation: This MUST be gated behind a feature flag and logged as a Critical debt item. Add a prominent `// SECURITY: DO NOT DEPLOY TO PRODUCTION` warning. Better yet, implement AES-256-GCM encryption now since the `crypto` module is available in Node.js.

- **[Major] `untyped()` helper bypasses type safety (line 163)** -- The `untyped()` function returns `any`, completely disabling TypeScript's type checking for the entire insert chain. While the comment in `untyped.ts` explains the rationale (Supabase generic inference issues), this creates a blind spot for type errors.
  - Recommendation: At minimum, type the return value of the insert operation explicitly. Consider creating a typed wrapper specifically for `secret_vault` write operations.

- **[Minor] `eslint-disable` comments (line 162)** -- Multiple eslint rules are suppressed inline.
  - Note: Acceptable given the `untyped()` workaround, but should be tracked as debt.

- **[Suggestion] Zod validation on GET (line 72)** -- The GET endpoint does not validate query parameters (though it currently takes none). If pagination is added later, validation should be included.

#### Good Points

- Zod schema validation on POST body with proper Korean error messages.
- `sanitizeSecret()` function properly strips sensitive fields (`encrypted_value`, `iv`, `auth_tag`) from API responses -- defense in depth.
- Proper duplicate detection via Postgres error code `23505`.
- Clean slug generation function.
- Workspace name resolution via Supabase join syntax.

---

### 5. `apps/web/src/app/api/vault/[id]/route.ts`

**Grade: B+ (Good)**

#### Issues

- **[Minor] Existence check is a separate query (lines 75-85, 152-161)** -- Both DELETE and PATCH first fetch the record to check existence, then perform the mutation. This creates a TOCTOU (time-of-check-time-of-use) race condition and doubles the query count.
  - Recommendation: For DELETE, just update with a `WHERE deleted_at IS NULL` clause and check the affected row count. For PATCH, similarly update and check the result.

- **[Minor] `eslint-disable` comments (lines 90, 177)** -- Same `untyped()` pattern as vault/route.ts.

- **[Suggestion] PATCH does not allow updating the secret value** -- The `updateSecretSchema` only allows `name` and `category` changes. If a user needs to rotate a secret value, they must delete and recreate.
  - Recommendation: Consider adding a dedicated `POST /api/vault/:id/rotate` endpoint for secret value rotation.

#### Good Points

- UUID validation via Zod on path parameter.
- Proper soft-delete implementation (sets `deleted_at` instead of hard delete).
- Partial update pattern with explicit field checking (`name !== undefined`).
- Consistent error response format.
- Clear separation of DELETE and PATCH handlers.

---

### 6. `apps/web/src/app/(auth)/login/page.tsx`

**Grade: A (Excellent)**

#### Issues

- None significant.

#### Good Points

- Clean server component that delegates to the `LoginForm` client component.
- Single responsibility: renders layout and imports form.
- Appropriate use of Tailwind utility classes.
- Bilingual content (Korean) matches the product requirements.

---

### 7. `apps/web/src/app/(dashboard)/settings/page.tsx`

**Grade: B (Good)**

#### Issues

- **[Major] `process.version` access in client component (line 234)** -- `process.version` is a Node.js API and will be `undefined` in the browser. While the ternary check `typeof process !== "undefined"` prevents a crash, it will always show `N/A` on the client side since `process.version` is not available in browser builds.
  - Recommendation: Move this to a server component or fetch it from an API endpoint.

- **[Minor] Hardcoded version strings (lines 206-209)** -- `version: "0.1.0"` and `nextVersion: "14.2"` are hardcoded magic strings that will become stale.
  - Recommendation: Read from `package.json` at build time or via environment variables.

- **[Minor] MFASection uses `useEffect` for one-shot fetch (lines 116-130)** -- This is an acceptable pattern but would benefit from React Query for caching, error retry, and stale-while-revalidate.
  - Recommendation: Migrate to `useQuery` from `@tanstack/react-query`.

- **[Suggestion] Large file with 3 section components (304 lines)** -- While each section is well-defined, the file could be split into individual component files for better maintainability.
  - Recommendation: Extract `ProfileSection`, `MFASection`, `SystemInfoSection` into separate files under `settings/`.

#### Good Points

- Clean tab-based layout using Radix UI components.
- `ProfileSection` properly uses the `useAuth` hook for real data.
- `MFASection` checks actual TOTP enrollment status from Supabase.
- `SystemInfoSection` includes a live Supabase connectivity check.
- Good use of `useCallback` to memoize the `checkSupabase` function.
- Proper loading states with skeleton UI.

---

### 8. `apps/web/src/app/(dashboard)/vault/page.tsx`

**Grade: A- (Very Good)**

#### Issues

- **[Minor] `handleDeleteConfirm` is async but called via `void` (line 589)** -- The `onConfirm={() => void handleDeleteConfirm()}` pattern correctly handles the floating promise, but a `try-catch` inside ensures errors are caught. This is fine.

- **[Minor] Error state shared between fetch and delete (line 416, 499)** -- `fetchError` is used for both the initial load error and the delete error. A delete failure will show an error banner that says to "retry" but the retry button calls `fetchSecrets()`, not the delete operation.
  - Recommendation: Use separate error states for fetch and mutation operations, or use a toast notification for mutation errors.

- **[Suggestion] No React Query usage** -- All data fetching is manual with `useState`/`useEffect`/`fetch`. This misses caching, background refetching, and optimistic updates.
  - Recommendation: Migrate to React Query (`useQuery` for fetch, `useMutation` for create/delete) to align with PRIME Zero-Latency protocol.

#### Good Points

- Excellent component decomposition: `VaultSkeleton`, `SecretCard`, `CreateSecretDialog`, `DeleteConfirmDialog`, main `VaultPage`.
- Proper form validation in `CreateSecretDialog` with user-friendly Korean error messages.
- Optimistic-like UI update on create (`handleCreated` prepends to list) and delete (filters out immediately).
- `CATEGORY_OPTIONS`, `CATEGORY_BADGE_VARIANT`, `CATEGORY_LABELS` are well-structured constant maps.
- Clean `formatDate` helper with error handling.
- Proper empty state handling.
- Type-safe props interfaces for all sub-components.

---

### 9. `apps/web/src/app/(dashboard)/dashboard/god-mode-canvas.tsx`

**Grade: B+ (Good)**

#### Issues

- **[Minor] `window.location.href` for navigation (line 121)** -- Using `window.location.href` causes a full page reload instead of client-side navigation. This violates the Zero-Latency UX protocol.
  - Recommendation: Use Next.js `useRouter().push()` for SPA-style navigation.

- **[Minor] Type assertion in node click handler (line 120)** -- `(node.data as { slug: string }).slug` uses a type assertion. The node data type should already be known from the node type.
  - Recommendation: Use type narrowing based on `node.type === 'workspace'` and the typed node definitions.

- **[Suggestion] `proOptions={{ hideAttribution: true }}` (line 151)** -- Hiding React Flow attribution requires a paid license. Verify license compliance.

#### Good Points

- Proper use of `useMemo` for nodes and edges computation.
- Clean layout calculation in `buildNodes` with configurable constants.
- Well-typed node types using React Flow generics.
- Empty state handling when no workspaces exist.
- Good edge styling with animated dashed lines and arrow markers.

---

### 10. `apps/web/src/app/(dashboard)/dashboard/canvas-nodes.tsx`

**Grade: A (Excellent)**

#### Issues

- None significant.

#### Good Points

- Proper use of `memo()` to prevent unnecessary re-renders -- critical for React Flow performance.
- Clean, well-typed node data interfaces exported for reuse.
- Semantic HTML with ARIA labels on emoji elements.
- Responsive truncation with `max-w-[140px]` and `max-w-[180px]`.
- Good separation between `WorkspaceNode` and `AgentPoolNode`.
- Handle positioning follows React Flow conventions.

---

### 11. `apps/web/src/app/(dashboard)/dashboard/dashboard-client.tsx`

**Grade: A- (Very Good)**

#### Issues

- **[Suggestion] No loading/error state handling** -- The component assumes `data` is always present and valid. If the parent server component fails to fetch data, this would crash.
  - Recommendation: Add optional chaining or a boundary error handler.

- **[Suggestion] `animate-fade-in` class (line 24)** -- Ensure this custom animation class is defined in the Tailwind config.

#### Good Points

- Clean composition pattern: delegates to specialized sub-components.
- Good use of the KPI strip pattern with `StatCard`.
- Proper grid layout with responsive breakpoints.
- `GodModeCanvas` integration with proper height container.
- Semantic HTML structure with clear section headers.

---

### 12. `apps/api/pyproject.toml`

**Grade: A (Excellent)**

#### Issues

- **[Suggestion] `httpx` appears in both `dependencies` and `dev` dependencies (lines 20, 44)** -- The dev dependency is likely for test client usage, but having it in both is redundant.
  - Recommendation: Keep only in `dependencies` since it is needed at runtime.

#### Good Points

- Strict mypy configuration (`strict = true`, `disallow_untyped_defs`, `disallow_any_generics`).
- Comprehensive ruff lint rules including security checks (flake8-bandit).
- Proper Python 3.12+ requirement.
- Good dependency choices: Sentry SDK for monitoring, slowapi for rate limiting, tenacity for retry logic.
- Hatchling as modern build backend.

---

## Common Pattern Issues

### 1. DRY Violation: `errorResponse` helper duplicated across 4 files

The identical `errorResponse(code, message, status)` function is defined in:
- `api/audit-logs/route.ts` (line 31)
- `api/credits/route.ts` (line 38)
- `api/pipelines/route.ts` (line 33)
- `api/vault/route.ts` (line 37)
- `api/vault/[id]/route.ts` (line 29)

**Recommendation**: Extract to a shared utility:
```typescript
// src/lib/api/response.ts
export function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
```

### 2. DRY Violation: `sanitizeSecret` duplicated in vault routes

The `sanitizeSecret` function is defined in both `vault/route.ts` and `vault/[id]/route.ts` with slightly different signatures.

**Recommendation**: Extract to `src/lib/vault/sanitize.ts`.

### 3. Missing Error Observability (PRIME Commercialization Standard 1 Violation)

All API routes use a bare `catch {}` block that returns a generic error without logging the actual exception. This violates the Sentry-level observability requirement.

**Recommendation**: Create a shared error handler:
```typescript
// src/lib/api/error-handler.ts
import * as Sentry from '@sentry/nextjs';

export function handleApiError(error: unknown, context: string) {
  Sentry.captureException(error, { tags: { context } });
  return errorResponse('INTERNAL_ERROR', 'Server error occurred.', 500);
}
```

### 4. Missing Authorization Scope

API endpoints for `credits`, `audit-logs`, and `pipelines` authenticate the user but do not scope queries to the user's authorized workspaces. Any authenticated user can read all data.

**Recommendation**: Implement Row Level Security (RLS) in Supabase and/or add workspace membership checks in the API layer.

### 5. No React Query Adoption

All client-side data fetching uses raw `fetch` + `useState` + `useEffect`. This misses:
- Automatic cache management
- Background refetching
- Optimistic updates (PRIME Zero-Latency Rule 1)
- Stale-while-revalidate

**Recommendation**: Migrate to `@tanstack/react-query` which is already in `package.json` dependencies.

### 6. No Test Coverage

None of the 12 reviewed files have corresponding test files. PRIME Code Quality standard requires 80% test coverage.

**Recommendation**: Prioritize API route tests (integration tests with mock Supabase) and component tests for the vault page.

---

## Technical Debt Items (registered in DEBT-REGISTER.md)

| ID | Title | Severity | File(s) |
|----|-------|----------|---------|
| DEBT-001 | Plaintext secret storage | HIGH | vault/route.ts |
| DEBT-002 | N+1 queries in pipelines API | HIGH | pipelines/route.ts |
| DEBT-003 | Full-table scan in credits API | HIGH | credits/route.ts |
| DEBT-004 | errorResponse DRY violation (5 files) | MEDIUM | All API routes |
| DEBT-005 | sanitizeSecret DRY violation | MEDIUM | vault routes |
| DEBT-006 | Missing error observability (Sentry) | MEDIUM | All API routes |
| DEBT-007 | Missing authorization scope | MEDIUM | credits, audit-logs, pipelines |
| DEBT-008 | No React Query adoption | MEDIUM | vault/page.tsx, settings/page.tsx |
| DEBT-009 | Zero test coverage | HIGH | All files |

---

## Grade Summary

| # | File | Grade | Critical | Major | Minor |
|---|------|-------|----------|-------|-------|
| 1 | api/audit-logs/route.ts | B | 0 | 1 | 3 |
| 2 | api/credits/route.ts | B- | 0 | 1 | 2 |
| 3 | api/pipelines/route.ts | C | 0 | 2 | 2 |
| 4 | api/vault/route.ts | B | 1 | 1 | 1 |
| 5 | api/vault/[id]/route.ts | B+ | 0 | 0 | 2 |
| 6 | (auth)/login/page.tsx | A | 0 | 0 | 0 |
| 7 | (dashboard)/settings/page.tsx | B | 0 | 1 | 2 |
| 8 | (dashboard)/vault/page.tsx | A- | 0 | 0 | 2 |
| 9 | dashboard/god-mode-canvas.tsx | B+ | 0 | 0 | 2 |
| 10 | dashboard/canvas-nodes.tsx | A | 0 | 0 | 0 |
| 11 | dashboard/dashboard-client.tsx | A- | 0 | 0 | 0 |
| 12 | apps/api/pyproject.toml | A | 0 | 0 | 0 |

---

## Merge Approval Status

- [ ] APPROVE
- [x] **REQUEST_CHANGES (Conditional Approval -- fix Critical items before merge)**
- [ ] REJECT

### Required Before Merge

1. **[Critical] DEBT-001**: Plaintext secret storage in `vault/route.ts` must at minimum have a prominent security warning, feature flag, and be blocked from production deployment. Ideally, implement AES-256-GCM encryption now.
2. **[Critical-Adjacent] DEBT-002**: The N+1 query in `pipelines/route.ts` (4 queries x N pipelines) will cause production outages at scale. Replace with aggregated SQL query.

### Recommended Before Merge (Major)

3. DEBT-003: Credits API full-table scan -- use server-side aggregation.
4. DEBT-006: Add Sentry error logging to all catch blocks.
5. DEBT-007: Add authorization scope to credit/audit/pipeline queries.

### Acceptable as Follow-up (Minor/Suggestion)

6. DEBT-004/005: DRY refactoring of shared utilities.
7. DEBT-008: React Query migration.
8. DEBT-009: Test coverage (should be addressed in Phase 2).

---

*Review by TEAM_I | CODE_REVIEWER + DEBT_HUNTER + REFACTOR_LEAD*
*Version: v1.0 | 2026-02-26*
