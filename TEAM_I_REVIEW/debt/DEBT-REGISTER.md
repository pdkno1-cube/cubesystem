# TEAM_I Technical Debt Register

> Last updated: 2026-02-26
> Source: Phase 1 Code Review (CODE-REVIEW-PHASE1-v1.md)

---

## DEBT-001: Plaintext Secret Storage

- **Location**: `apps/web/src/app/api/vault/route.ts:157-172`
- **Type**: Security
- **Severity**: HIGH
- **Description**: Secrets are stored in plaintext in the `encrypted_value` column with placeholder `iv` and `auth_tag` values (`'plaintext-phase1'`). The DB schema expects encrypted data but receives raw values. Any database access (backup, log, admin panel) exposes all secrets.
- **Resolution**: Implement AES-256-GCM encryption using Node.js `crypto` module before storing. Generate real `iv` and `auth_tag` values. Add a migration to encrypt existing plaintext values.
- **Priority**: This Sprint (BLOCKER for production)
- **Registered**: 2026-02-26

---

## DEBT-002: N+1 Queries in Pipelines API

- **Location**: `apps/web/src/app/api/pipelines/route.ts:69-126`
- **Type**: Performance
- **Severity**: HIGH
- **Description**: For each pipeline, 4 separate Supabase queries are executed (total executions, last execution, running count, error count). With N pipelines, this results in 4N+1 database round-trips. At 50 pipelines, this means 201 queries per API call.
- **Resolution**: Create a Supabase RPC function or database view that joins `pipelines` with aggregated `pipeline_executions` data in a single query.
- **Priority**: This Sprint
- **Registered**: 2026-02-26

---

## DEBT-003: Full-Table Scan in Credits API

- **Location**: `apps/web/src/app/api/credits/route.ts:57-60`
- **Type**: Performance
- **Severity**: HIGH
- **Description**: The credits endpoint fetches ALL records from the `credits` table to compute aggregates (total_charged, total_used, total_balance) in JavaScript. As the table grows, this causes increasing memory usage and latency.
- **Resolution**: Move aggregation to a Supabase RPC or SQL view. Use `SUM(CASE WHEN ...)` for per-type totals. Fetch only `recent_transactions` with `.limit(20)`.
- **Priority**: This Sprint
- **Registered**: 2026-02-26

---

## DEBT-004: errorResponse Helper Duplicated Across 5 Files

- **Location**: `api/audit-logs/route.ts:31`, `api/credits/route.ts:38`, `api/pipelines/route.ts:33`, `api/vault/route.ts:37`, `api/vault/[id]/route.ts:29`
- **Type**: Duplication (DRY violation)
- **Severity**: MEDIUM
- **Description**: The identical `errorResponse(code, message, status)` function is copy-pasted in every API route file.
- **Resolution**: Extract to `src/lib/api/response.ts` and import in all route files.
- **Priority**: Next Sprint
- **Registered**: 2026-02-26

---

## DEBT-005: sanitizeSecret Duplicated in Vault Routes

- **Location**: `api/vault/route.ts:56-68`, `api/vault/[id]/route.ts:37-47`
- **Type**: Duplication (DRY violation)
- **Severity**: MEDIUM
- **Description**: The `sanitizeSecret` function exists in two vault route files with slightly different type signatures.
- **Resolution**: Extract to `src/lib/vault/sanitize.ts` with a unified type signature.
- **Priority**: Next Sprint
- **Registered**: 2026-02-26

---

## DEBT-006: Missing Error Observability (Sentry)

- **Location**: All API route `catch {}` blocks
- **Type**: Observability
- **Severity**: MEDIUM
- **Description**: All API routes use bare `catch {}` blocks that return generic error responses without logging the actual exception. This violates PRIME Commercialization Standard 1 (Observability) and makes debugging production issues impossible.
- **Resolution**: Integrate `@sentry/nextjs` and add `Sentry.captureException(error)` in all catch blocks. Create a shared `handleApiError()` utility.
- **Priority**: This Sprint
- **Registered**: 2026-02-26

---

## DEBT-007: Missing Authorization Scope on API Endpoints

- **Location**: `api/credits/route.ts`, `api/audit-logs/route.ts`, `api/pipelines/route.ts`
- **Type**: Security
- **Severity**: MEDIUM
- **Description**: API endpoints verify authentication (user exists) but do not scope queries to the user's authorized workspaces. Any authenticated user can read all credits, audit logs, and pipelines across all workspaces.
- **Resolution**: Implement Supabase Row Level Security (RLS) policies that filter by workspace membership, or add explicit workspace membership checks in the API layer.
- **Priority**: This Sprint
- **Registered**: 2026-02-26

---

## DEBT-008: No React Query Adoption for Client Data Fetching

- **Location**: `vault/page.tsx`, `settings/page.tsx`
- **Type**: Performance / DX
- **Severity**: MEDIUM
- **Description**: Client-side data fetching uses raw `fetch` + `useState` + `useEffect` instead of `@tanstack/react-query` (already in dependencies). This misses automatic caching, background refetching, optimistic updates, and retry logic -- all of which are required by PRIME Zero-Latency protocol.
- **Resolution**: Migrate data fetching to React Query hooks (`useQuery`, `useMutation`). Create custom hooks like `useVaultSecrets()`, `useWorkspaces()`.
- **Priority**: Next Sprint
- **Registered**: 2026-02-26

---

## DEBT-009: Zero Test Coverage

- **Location**: All 12 reviewed files
- **Type**: Quality
- **Severity**: HIGH
- **Description**: None of the Phase 1 files have corresponding test files. PRIME Code Quality standard requires 80% test coverage. API routes need integration tests; UI components need component tests.
- **Resolution**: Write tests in priority order: (1) API routes with mock Supabase client, (2) vault page component tests, (3) canvas component tests.
- **Priority**: Phase 2 (immediate backlog)
- **Registered**: 2026-02-26

---

*Debt Register maintained by TEAM_I (DEBT_HUNTER)*
*Version: v1.0 | 2026-02-26*
