# Claude 1 Phase 0 작업 지시서 -- The Master OS 기반 구축 (핵심 태스크)

> **실행자**: Claude 1 (핵심/무거운 작업 전담)
> **기간**: Phase 0 (2주) -- 2026.02.26 ~ 2026.03.12
> **선행 조건**: Task 1~2는 Claude 2의 Task 1(모노레포 초기화) 완료 후 시작
> **보고 파일**: `PARALLEL/CLAUDE1_PHASE0_REPORT.md`

---

## 작업 규칙

1. 이 파일의 태스크를 **순서대로** 수행한다
2. 각 태스크 완료 시 `PARALLEL/CLAUDE1_PHASE0_REPORT.md`에 결과를 기록한다
3. 참조 문서:
   - `TEAM_G_DESIGN/architecture/ARCH-MASTEROS-v1.md` -- 시스템 아키텍처 (DB 스키마, API 명세)
   - `TEAM_G_DESIGN/architecture/DIR-STRUCTURE.md` -- 디렉토리 구조
   - `TEAM_G_DESIGN/architecture/ENV-CONFIG.md` -- 환경변수
   - `TEAM_G_DESIGN/architecture/TECH-DEPS.md` -- 기술 스택 의존성
   - `TEAM_G_DESIGN/prd/PRD-MASTEROS-v1.md` -- PRD (기능 요구사항)
4. TypeScript strict 모드 필수, `any` 타입 금지
5. Python: type hints 필수, mypy strict 통과 목표
6. 보안 코드는 OWASP Top 10 대응 기준으로 작성
7. console.log 단독 에러 처리 금지 -- Sentry 연동 기반 에러 추적

---

## 의존성 그래프

```
Task 1 (Supabase init)
  |
  v
Task 2 (DB 마이그레이션) ---> Task 3 (RLS 정책)
  |
  v
Task 4 (Auth 셋업)
  |
  v
Task 5 (BFF Auth 라우트) ---> Task 6 (인증 미들웨어)
  |
Task 7 (FastAPI 초기화) --- 독립 실행 가능 (Task 1 이후 언제든)
  |
  v
Task 8 (보안 기본 설정) --- Task 5, 6, 7 완료 후
```

---

## Task 1: Supabase 프로젝트 초기화

**목표**: `the-master-os/supabase/` 디렉토리에 Supabase 로컬 개발 환경을 구성한다.

### 실행 단계

```bash
cd the-master-os

# 1. Supabase CLI 설치 확인
supabase --version  # >= 1.220

# 2. Supabase 프로젝트 초기화
supabase init

# 3. 로컬 Supabase 시작 (Docker 필요)
supabase start
```

### 설정 변경: `supabase/config.toml`

기본 config.toml에서 아래 항목을 수정한다:

```toml
[project]
id = "the-master-os"

[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
major_version = 15

[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]
jwt_expiry = 3600
enable_signup = false  # 회장 단일 사용자 -- 가입 비활성화
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10

[auth.email]
enable_signup = false
double_confirm_changes = true
enable_confirmations = false  # 개발 환경에서는 이메일 확인 비활성화

[auth.mfa]
enabled = true   # MFA TOTP 활성화
max_enrolled_factors = 3

[storage]
enabled = true
file_size_limit = "50MiB"

[realtime]
enabled = true

[studio]
enabled = true
port = 54323

[analytics]
enabled = false  # 로컬 개발에서는 비활성화
```

### `supabase start` 실행 후 출력되는 키를 `.env.local`에 기록하도록 안내 주석을 포함한다.

### 완료 기준
- [ ] `supabase/config.toml` 파일 존재 및 위 설정 반영
- [ ] `supabase start` 실행 시 PostgreSQL, GoTrue(Auth), Storage, Realtime, Studio 모두 기동
- [ ] `http://localhost:54323`에서 Supabase Studio 접근 가능
- [ ] MFA(TOTP) 설정이 활성화되어 있음
- [ ] signup이 비활성화되어 있음 (회장 단일 사용자)

---

## Task 2: DB 마이그레이션 작성

**목표**: ARCH-MASTEROS-v1.md에 정의된 12개 테이블의 DDL을 Supabase 마이그레이션 파일로 작성한다.

### 마이그레이션 파일 목록

마이그레이션은 의존성 순서대로 7개 파일로 분리한다:

#### `supabase/migrations/00001_create_users.sql`
- `users` 테이블 생성
- 인덱스: `idx_users_email` (UNIQUE, WHERE deleted_at IS NULL)
- ARCH 2.2절의 users DDL 그대로 적용

#### `supabase/migrations/00002_create_workspaces.sql`
- `workspaces` 테이블 생성
- `workspace_members` 테이블 생성
- 인덱스: `idx_workspaces_slug`, `idx_workspaces_owner`, `idx_wm_workspace`, `idx_wm_user`
- FK: workspaces.owner_id -> users.id, workspace_members.workspace_id -> workspaces.id 등

#### `supabase/migrations/00003_create_agents.sql`
- `agents` 테이블 생성
- `agent_assignments` 테이블 생성
- 인덱스: `idx_agents_slug`, `idx_agents_category`, `idx_agents_active`, `idx_aa_workspace`, `idx_aa_agent`, `idx_aa_status`
- FK: agent_assignments -> agents, workspaces, users

#### `supabase/migrations/00004_create_pipelines.sql`
- `pipelines` 테이블 생성
- `pipeline_executions` 테이블 생성
- `pipeline_steps` 테이블 생성
- 인덱스: ARCH 2.2절의 모든 인덱스 적용
- FK: pipeline_executions -> pipelines, workspaces, users / pipeline_steps -> pipeline_executions, agents

#### `supabase/migrations/00005_create_vault.sql`
- `secret_vault` 테이블 생성
- `mcp_connections` 테이블 생성
- 인덱스: `idx_sv_workspace`, `idx_sv_expires`, `idx_mcp_workspace`, `idx_mcp_provider`
- FK: secret_vault -> workspaces, users / mcp_connections -> workspaces, secret_vault

#### `supabase/migrations/00006_create_billing.sql`
- `credits` 테이블 생성 (INSERT-only 불변 테이블)
- 인덱스: `idx_credits_workspace`, `idx_credits_workspace_created`, `idx_credits_ref`

#### `supabase/migrations/00007_create_audit_logs.sql`
- `audit_logs` 테이블 생성
- 인덱스: `idx_al_workspace`, `idx_al_user`, `idx_al_action`, `idx_al_created`, `idx_al_severity`
- FK: audit_logs -> workspaces, users, agents (모두 nullable)

### 공통 규약 (모든 테이블에 적용)
- `id`: UUID PK, DEFAULT gen_random_uuid()
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT now()
- Soft Delete: `deleted_at` TIMESTAMPTZ nullable (audit_logs, credits 제외 -- 불변 테이블)
- `updated_at` 자동 갱신 트리거 생성:

```sql
-- updated_at 자동 갱신 함수 (최초 마이그레이션에서 1회 생성)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 각 테이블에 트리거 적용 (예)
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### SQL 원본

모든 DDL은 ARCH-MASTEROS-v1.md 2.2절의 SQL을 정확히 따른다. 다음 12개 테이블:
1. users
2. workspaces
3. workspace_members
4. agents
5. agent_assignments
6. pipelines
7. pipeline_executions
8. pipeline_steps
9. mcp_connections
10. secret_vault
11. credits
12. audit_logs

### 완료 기준
- [ ] 7개 마이그레이션 파일이 `supabase/migrations/` 디렉토리에 존재
- [ ] `supabase db push` 또는 `supabase db reset` 실행 시 모든 마이그레이션 성공
- [ ] Supabase Studio에서 12개 테이블 확인 가능
- [ ] 모든 인덱스가 정상 생성됨 (pg_indexes 조회)
- [ ] updated_at 트리거가 정상 작동 (UPDATE 시 자동 갱신)
- [ ] FK 제약 조건이 정상 작동 (잘못된 참조 시 에러)

---

## Task 3: RLS 정책 구현

**목표**: 모든 테이블에 Row Level Security 정책을 적용한다.

### 마이그레이션 파일

#### `supabase/migrations/00008_enable_rls.sql`

ARCH-MASTEROS-v1.md 2.2절의 각 테이블별 RLS 정책을 단일 파일로 통합한다.

### RLS 정책 요약

| 테이블 | 정책명 | 규칙 |
|--------|--------|------|
| users | users_self_access | `auth.uid() = id` |
| users | users_self_update | FOR UPDATE: `auth.uid() = id` |
| workspaces | workspaces_owner_access | `owner_id = auth.uid()` |
| workspace_members | wm_member_access | workspace_id가 자신이 멤버인 워크스페이스에 포함 |
| agent_assignments | aa_workspace_access | workspace_id 기반 멤버 확인 |
| pipeline_executions | pe_workspace_access | workspace_id 기반 멤버 확인 |
| mcp_connections | mcp_workspace_access | workspace_id 기반 멤버 확인 |
| secret_vault | sv_admin_access | workspace_id 기반 + role IN ('owner', 'admin') |
| credits | credits_workspace_access | workspace_id 기반 멤버 확인 |
| audit_logs | al_access | 시스템 이벤트는 owner만, 워크스페이스 이벤트는 멤버 |

### 추가 정책: Service Role 우회

```sql
-- Service Role은 모든 RLS을 우회해야 한다.
-- Supabase의 service_role 키는 기본적으로 RLS를 우회하므로
-- 별도 정책 불필요. 그러나 BFF에서 사용하는 anon 키 기반 요청은
-- 반드시 RLS 적용을 받아야 한다.
```

### 테스트 시나리오

RLS 검증을 위한 seed 데이터와 테스트 쿼리를 작성한다:

```sql
-- supabase/seed/seed.sql에 포함
-- 테스트용 사용자 2명 생성
-- 테스트용 워크스페이스 2개 생성 (각각 다른 owner)
-- User A가 User B의 워크스페이스 데이터에 접근 불가함을 검증
```

### 완료 기준
- [ ] 모든 12개 테이블에 RLS ENABLE 확인
- [ ] 각 테이블에 최소 1개 이상의 RLS 정책 존재
- [ ] User A로 인증 시 User B의 워크스페이스 데이터 조회 불가 확인
- [ ] secret_vault에 owner/admin 역할만 접근 가능 확인
- [ ] service_role 키로는 모든 데이터 접근 가능 확인

---

## Task 4: Supabase Auth 셋업

**목표**: Supabase Auth를 활용한 인증 시스템을 구성한다. 이메일+비밀번호 + MFA TOTP.

### 구현 범위

1. **초기 사용자 시드**: 회장 계정 1개를 seed.sql로 생성
2. **MFA TOTP 활성화**: config.toml에서 이미 활성화 (Task 1), 여기서는 enroll 로직 구현
3. **JWT 설정**: 액세스 토큰 30분 만료, 리프레시 토큰 7일 만료, 로테이션 활성화

### 생성할 파일

#### `supabase/seed/seed.sql`

```sql
-- 초기 회장 계정 생성 (Supabase Auth + users 테이블 동기)
-- 주의: Supabase Auth는 auth.users 테이블을 관리하고,
--       우리의 public.users는 프로필 확장 테이블이다.

-- 1. auth.users에 회장 계정 생성 (Supabase CLI로 별도 처리 필요)
-- supabase에서는 seed.sql로 auth.users 직접 INSERT가 가능하지 않을 수 있음
-- 대안: 아래 SQL은 public.users 프로필만 생성하고,
--       auth 계정은 supabase start 후 Studio UI에서 수동 생성

-- 2. 기본 에이전트 템플릿 시드
INSERT INTO agents (name, slug, description, icon, category, model_provider, model_name, system_prompt, is_system, cost_per_run) VALUES
  ('낙관론자', 'optimist', '긍정적 관점에서 사업 기회를 분석하는 에이전트', '🌟', 'planning', 'anthropic', 'claude-sonnet-4-6', '당신은 낙관론자입니다. 모든 사업 기회에서 성장 가능성을 찾아 제시합니다.', true, 0.05),
  ('비관론자', 'pessimist', '리스크와 위험 요소를 식별하는 에이전트', '⚠️', 'planning', 'anthropic', 'claude-sonnet-4-6', '당신은 비관론자입니다. 모든 사업 기회에서 리스크와 위험 요소를 날카롭게 지적합니다.', true, 0.05),
  ('현실주의자', 'realist', '실현 가능성과 ROI를 분석하는 에이전트', '📊', 'planning', 'anthropic', 'claude-sonnet-4-6', '당신은 현실주의자입니다. 데이터와 팩트에 기반하여 실현 가능성과 ROI를 분석합니다.', true, 0.05),
  ('마케팅 카피라이터', 'copywriter', '마케팅 카피를 생성하는 에이전트', '✍️', 'marketing', 'anthropic', 'claude-sonnet-4-6', '당신은 전환율을 극대화하는 마케팅 카피라이터입니다.', true, 0.03),
  ('OCR 검사관', 'ocr-inspector', '서류를 판독하고 누락을 확인하는 에이전트', '🔍', 'ocr', 'anthropic', 'claude-sonnet-4-6', '당신은 서류 검사 전문가입니다. OCR 결과를 분석하고 누락/오류를 식별합니다.', true, 0.04),
  ('DevOps 모니터', 'devops-monitor', '시스템 상태를 모니터링하는 에이전트', '🛠️', 'devops', 'anthropic', 'claude-haiku-4-5-20251001', '당신은 시스템 모니터링 전문가입니다. 장애를 감지하고 즉시 대응합니다.', true, 0.02);

-- 3. 기본 파이프라인 템플릿 시드
INSERT INTO pipelines (name, slug, description, category, graph_definition, required_agents, required_mcps, is_system) VALUES
  ('정부조달 입찰 팩토리', 'grant-factory', '정부지원사업/조달 입찰을 자동으로 수집, 검증, 제출하는 파이프라인', 'grant_factory',
   '{"nodes": [{"id": "collect", "type": "scraping", "label": "공고 수집"}, {"id": "qualify", "type": "analysis", "label": "자격 대조"}, {"id": "debate", "type": "planning", "label": "다중 페르소나 검증"}, {"id": "draft", "type": "writing", "label": "제안서 초안"}, {"id": "ocr_verify", "type": "ocr", "label": "서류 OCR 검수"}, {"id": "notify", "type": "notification", "label": "제출 알림"}], "edges": [{"source": "collect", "target": "qualify"}, {"source": "qualify", "target": "debate"}, {"source": "debate", "target": "draft"}, {"source": "draft", "target": "ocr_verify"}, {"source": "ocr_verify", "target": "notify"}], "entry_point": "collect"}',
   '["optimist", "pessimist", "realist", "ocr-inspector"]', '["firecrawl", "paddleocr", "slack"]', true),

  ('서류 자동 검증', 'document-verify', '행정/B2B 서류를 자동으로 검증하고 분류하는 파이프라인', 'document_verification',
   '{"nodes": [{"id": "check_missing", "type": "analysis", "label": "누락 확인"}, {"id": "ocr_scan", "type": "ocr", "label": "OCR 판독"}, {"id": "validate", "type": "analysis", "label": "데이터 검사"}, {"id": "classify", "type": "storage", "label": "Drive 분류"}, {"id": "notify", "type": "notification", "label": "결과 알림"}], "edges": [{"source": "check_missing", "target": "ocr_scan"}, {"source": "ocr_scan", "target": "validate"}, {"source": "validate", "target": "classify"}, {"source": "classify", "target": "notify"}], "entry_point": "check_missing"}',
   '["ocr-inspector"]', '["paddleocr", "google_drive", "slack"]', true),

  ('OSMU 마케팅 스웜', 'osmu-marketing', '아이디어를 다중 채널 콘텐츠로 변환하는 파이프라인', 'osmu_marketing',
   '{"nodes": [{"id": "ideation", "type": "planning", "label": "아이디어 분석"}, {"id": "script_split", "type": "writing", "label": "채널별 스크립트"}, {"id": "visual", "type": "design", "label": "비주얼 렌더링"}, {"id": "preview", "type": "review", "label": "프리뷰"}, {"id": "publish", "type": "storage", "label": "배포 큐"}], "edges": [{"source": "ideation", "target": "script_split"}, {"source": "script_split", "target": "visual"}, {"source": "visual", "target": "preview"}, {"source": "preview", "target": "publish"}], "entry_point": "ideation"}',
   '["copywriter"]', '["figma", "google_drive"]', true),

  ('AI 자율 유지보수', 'auto-healing', '시스템 장애를 자동 감지하고 복구하는 파이프라인', 'auto_healing',
   '{"nodes": [{"id": "detect", "type": "monitoring", "label": "장애 감지"}, {"id": "switch_key", "type": "security", "label": "예비 키 스위칭"}, {"id": "proxy_bypass", "type": "network", "label": "프록시 우회"}, {"id": "hotfix", "type": "devops", "label": "핫픽스"}, {"id": "report", "type": "notification", "label": "보고"}], "edges": [{"source": "detect", "target": "switch_key"}, {"source": "switch_key", "target": "proxy_bypass"}, {"source": "proxy_bypass", "target": "hotfix"}, {"source": "hotfix", "target": "report"}], "entry_point": "detect"}',
   '["devops-monitor"]', '["slack"]', true);
```

### Supabase 클라이언트 헬퍼 파일

#### `apps/web/src/lib/supabase/client.ts`
브라우저 환경 Supabase 클라이언트 (CSR)

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

#### `apps/web/src/lib/supabase/server.ts`
서버 컴포넌트 / Route Handler용 Supabase 클라이언트 (SSR)

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );
}
```

### 완료 기준
- [ ] seed.sql 실행 시 기본 에이전트 6개 + 기본 파이프라인 4개 생성
- [ ] Supabase Auth로 이메일+비밀번호 로그인 가능
- [ ] MFA TOTP enroll 및 verify 가능 (Supabase Studio에서 테스트)
- [ ] 브라우저 클라이언트와 서버 클라이언트가 정상 생성됨
- [ ] JWT 토큰 만료 시 리프레시 토큰으로 자동 갱신

---

## Task 5: Next.js BFF Auth 라우트

**목표**: `/api/auth/*` 경로에 인증 관련 BFF API 라우트를 구현한다.

### 생성할 파일

#### `apps/web/src/app/api/auth/login/route.ts`
```
POST /api/auth/login
Body: { email: string, password: string }
Response: { user: User, session: Session } | { error: ... }

로직:
1. 요청 body에서 email, password 추출 (zod 유효성 검증)
2. Supabase Auth signInWithPassword 호출
3. 성공 시 세션 쿠키 설정 + user/session 반환
4. 실패 시 적절한 에러 코드 반환 (INVALID_CREDENTIALS, ACCOUNT_LOCKED 등)
5. 감사 로그 기록 (auth.login 성공/실패)
```

#### `apps/web/src/app/api/auth/logout/route.ts`
```
POST /api/auth/logout
Auth: Required (Bearer JWT)
Response: { success: true }

로직:
1. JWT 검증
2. Supabase Auth signOut 호출
3. 세션 쿠키 삭제
4. 감사 로그 기록 (auth.logout)
```

#### `apps/web/src/app/api/auth/refresh/route.ts`
```
POST /api/auth/refresh
Body: { refresh_token: string }
Response: { session: Session } | { error: ... }

로직:
1. refresh_token 추출
2. Supabase Auth refreshSession 호출
3. 새 세션 쿠키 설정
4. 리프레시 토큰 로테이션 적용 (사용된 토큰 즉시 무효화)
```

#### `apps/web/src/app/api/auth/me/route.ts`
```
GET /api/auth/me
Auth: Required
Response: { user: User }

로직:
1. JWT에서 사용자 ID 추출
2. public.users 테이블에서 프로필 조회
3. last_login_at 업데이트
```

#### `apps/web/src/app/api/auth/mfa/enroll/route.ts`
```
POST /api/auth/mfa/enroll
Auth: Required
Response: { totp_uri: string, qr_code: string, secret: string }

로직:
1. Supabase Auth MFA enroll 호출 (factor_type: 'totp')
2. TOTP URI, QR 코드 데이터 반환
3. 프론트엔드에서 QR 코드 표시 -> 사용자가 인증 앱에 등록
```

#### `apps/web/src/app/api/auth/mfa/verify/route.ts`
```
POST /api/auth/mfa/verify
Body: { factor_id: string, code: string }
Response: { success: true } | { error: ... }

로직:
1. TOTP 코드 검증
2. 성공 시 MFA 인증 완료 세션 갱신
3. 실패 시 남은 시도 횟수 반환
```

### 공통 유틸리티

#### `apps/web/src/lib/api-response.ts`
API 응답 헬퍼 (일관된 응답 형식 보장):

```typescript
import { NextResponse } from "next/server";

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function apiError(code: string, message: string, status = 400) {
  return NextResponse.json(
    { error: { code, message } },
    { status },
  );
}
```

### 완료 기준
- [ ] POST /api/auth/login으로 이메일+비밀번호 로그인 성공
- [ ] POST /api/auth/logout으로 세션 종료
- [ ] POST /api/auth/refresh로 토큰 갱신
- [ ] GET /api/auth/me로 현재 사용자 정보 조회
- [ ] MFA enroll + verify 플로우 동작
- [ ] 잘못된 자격증명 시 적절한 에러 응답 (401)
- [ ] 모든 응답이 `{ data: ... }` 또는 `{ error: { code, message } }` 형식

---

## Task 6: 인증 미들웨어

**목표**: Next.js 미들웨어를 구현하여 JWT 검증, 세션 관리, 보호 라우트 가드를 적용한다.

### 생성할 파일

#### `apps/web/src/middleware.ts`

```
역할:
1. 모든 요청에서 Supabase 세션 확인
2. 세션 없는 사용자가 보호 라우트 접근 시 /login으로 리다이렉트
3. 세션 있는 사용자가 /login 접근 시 /dashboard로 리다이렉트
4. JWT 토큰 만료 임박 시 자동 갱신

보호 라우트: /dashboard, /workspaces, /agents, /pipelines, /billing, /vault, /audit-logs, /settings
공개 라우트: /login, /api/auth/login, /api/auth/refresh

구현 참고:
- @supabase/ssr의 createServerClient 사용
- middleware matcher 설정으로 정적 파일(_next/static, favicon 등) 제외
- 쿠키 기반 세션 관리 (httpOnly, secure, sameSite)
```

#### `apps/web/src/hooks/use-auth.ts`

```
클라이언트 사이드 인증 훅:
- 현재 사용자 정보 조회 (React Query 기반)
- 로그인/로그아웃 함수
- 세션 상태 (authenticated / unauthenticated / loading)
- MFA 상태 (enrolled / not_enrolled)
```

#### `apps/web/src/stores/auth-store.ts`

```
Zustand 인증 스토어:
- user: User | null
- session: Session | null
- isAuthenticated: boolean
- isMfaVerified: boolean
- setUser / clearUser
- setSession / clearSession
```

### 완료 기준
- [ ] 비인증 사용자가 /dashboard 접근 시 /login으로 리다이렉트
- [ ] 인증 사용자가 /login 접근 시 /dashboard로 리다이렉트
- [ ] JWT 만료 시 자동 갱신 (사용자 경험에 영향 없음)
- [ ] 보호 API 라우트에 미인증 요청 시 401 응답
- [ ] use-auth 훅이 로딩/인증/미인증 상태를 정확히 반환
- [ ] auth-store가 Zustand persist로 새로고침 후에도 상태 유지

---

## Task 7: FastAPI 프로젝트 초기화

**목표**: `apps/api/`에 FastAPI 애플리케이션을 구성하고 기본 헬스체크 엔드포인트를 구현한다.

### 실행 단계

```bash
cd the-master-os/apps/api

# Python 가상환경 (uv 사용)
uv venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate   # Windows

# 패키지 설치
uv pip install fastapi>=0.115 uvicorn[standard]>=0.34 pydantic>=2.10 pydantic-settings>=2.7
uv pip install supabase>=2.11 httpx>=0.28
uv pip install python-jose[cryptography]>=3.3 cryptography>=44.0 passlib[bcrypt]>=1.7 pyotp>=2.9
uv pip install sentry-sdk[fastapi]>=2.19

# Dev 패키지
uv pip install pytest>=8.3 pytest-asyncio>=0.24 ruff>=0.8 mypy>=1.13

# requirements.txt 생성
uv pip freeze > requirements.txt
```

### 생성할 파일

#### `apps/api/pyproject.toml`
```toml
[project]
name = "masteros-api"
version = "0.1.0"
description = "The Master OS - Orchestration Engine"
requires-python = ">=3.12"

[tool.ruff]
target-version = "py312"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP", "B", "A", "SIM", "TCH"]
ignore = ["E501"]

[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_configs = true

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

#### `apps/api/src/config.py`
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # FastAPI
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_env: str = "development"
    api_debug: bool = True
    api_cors_origins: str = "http://localhost:3000"
    api_secret_key: str = "change-me"
    api_rate_limit_per_minute: int = 100

    # Supabase
    supabase_url: str = "http://localhost:54321"
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    # JWT
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30

    # Sentry
    sentry_dsn: str = ""
    sentry_environment: str = "development"
    sentry_traces_sample_rate: float = 0.1

    # Logging
    log_level: str = "INFO"
    log_format: str = "json"

    class Config:
        env_file = "../../.env.local"
        env_file_encoding = "utf-8"

settings = Settings()
```

#### `apps/api/src/main.py`
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sentry_sdk
from .config import settings

# Sentry 초기화
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
    )

app = FastAPI(
    title="The Master OS - Orchestration Engine",
    version="0.1.0",
    docs_url="/orchestrate/docs" if settings.api_debug else None,
    redoc_url="/orchestrate/redoc" if settings.api_debug else None,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.api_cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 헬스체크
@app.get("/orchestrate/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "0.1.0",
        "environment": settings.api_env,
    }

# 루트
@app.get("/")
async def root():
    return {"message": "The Master OS Orchestration Engine"}
```

#### `apps/api/src/__init__.py`
빈 파일 (Python 패키지)

#### `apps/api/tests/conftest.py`
```python
import pytest
from fastapi.testclient import TestClient
from src.main import app

@pytest.fixture
def client():
    return TestClient(app)
```

#### `apps/api/tests/test_health.py`
```python
def test_health_check(client):
    response = client.get("/orchestrate/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data
```

### 완료 기준
- [ ] `uvicorn src.main:app --reload --port 8000` 실행 시 서버 기동
- [ ] GET /orchestrate/health 응답 200 + `{"status": "healthy"}`
- [ ] /orchestrate/docs에서 Swagger UI 접근 가능 (개발 모드)
- [ ] CORS 설정이 `http://localhost:3000`을 허용
- [ ] `pytest` 실행 시 헬스체크 테스트 통과
- [ ] Sentry DSN 설정 시 에러 추적 활성화

---

## Task 8: 보안 기본 설정

**목표**: Rate Limiting, CORS 강화, CSRF 방어, 보안 헤더를 구현한다.

### BFF 측 (Next.js)

#### `apps/web/next.config.mjs` -- 보안 헤더 추가

```javascript
// Helmet 스타일 보안 헤더
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
```

### FastAPI 측

#### `apps/api/src/middleware/rate_limit.py`

```
인메모리 Rate Limiter (추후 Redis 기반으로 교체):
- 기본: 분당 100회 (API_RATE_LIMIT_PER_MINUTE)
- IP 기반 제한
- 429 Too Many Requests 응답
- X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset 헤더
```

#### `apps/api/src/middleware/auth.py`

```
FastAPI 인증 미들웨어:
- Bearer JWT 토큰 검증
- Supabase JWT 시크릿으로 서명 검증
- 토큰 만료 확인
- 사용자 정보를 Request.state에 주입
- 미인증 시 401, 권한 부족 시 403
```

#### `apps/api/src/middleware/audit.py`

```
감사 로깅 미들웨어:
- 모든 상태 변경 요청 (POST, PUT, PATCH, DELETE) 자동 기록
- 기록 항목: user_id, action, resource_type, resource_id, ip_address, user_agent, 결과
- audit_logs 테이블에 비동기 INSERT
- 민감 데이터 (password, token) 자동 마스킹
```

### 완료 기준
- [ ] Next.js 응답에 보안 헤더 포함 (X-Frame-Options, X-Content-Type-Options 등)
- [ ] FastAPI Rate Limiter 동작 확인 (분당 100회 초과 시 429)
- [ ] FastAPI 인증 미들웨어가 유효하지 않은 JWT 차단 (401)
- [ ] 감사 로깅 미들웨어가 POST/PUT/PATCH/DELETE 요청을 자동 기록
- [ ] 민감 데이터가 감사 로그에 마스킹 처리

---

## 완료 후 체크리스트

모든 태스크 완료 후 아래를 확인한다:

1. [ ] `supabase start` 성공 + 12개 테이블 생성됨
2. [ ] RLS 정책이 전 테이블에 적용되어 데이터 격리 확인
3. [ ] Supabase Auth로 로그인/로그아웃/MFA 동작
4. [ ] `/api/auth/*` BFF 라우트 6개 정상 동작
5. [ ] 미들웨어가 보호 라우트를 가드함 (미인증 -> /login 리다이렉트)
6. [ ] FastAPI `/orchestrate/health` 응답 200
7. [ ] Rate Limiter, 보안 헤더, 감사 로깅 동작 확인
8. [ ] `PARALLEL/CLAUDE1_PHASE0_REPORT.md`에 모든 태스크 결과 기록
9. [ ] REPORT 파일 마지막에 `## 완료 상태: DONE` 추가

---

*버전: v1.0 | TEAM_G (ARCHITECT + PRD_MASTER) | Phase 0 핵심 태스크 | 2026.02.26*
