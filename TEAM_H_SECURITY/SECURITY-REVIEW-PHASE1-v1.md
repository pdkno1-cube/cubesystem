# SECURITY REVIEW -- Phase 0+1

**Project**: The Master OS
**Reviewer**: TEAM_H Security Agent
**Date**: 2026-02-26
**Scope**: Phase 0+1 전체 보안 코드 (Auth, API, DB, FastAPI, Secret Vault)
**Standard**: OWASP Top 10 2021 + PRIME Security-by-Design Protocol

---

## 요약

| 심각도 | 건수 | 설명 |
|--------|------|------|
| **Critical** | 3 | 시크릿 평문 저장, DEV_AUTH_BYPASS 프로덕션 유출, 감사 로그 INSERT 실패 |
| **High** | 5 | Refresh Token 응답 노출, 에이전트 created_by 누락, 워크스페이스 멤버 중복 삽입, ILIKE 와일드카드 인젝션, API 미들웨어 인증 우회 |
| **Medium** | 5 | 로그인 잠금 인메모리, MFA 시크릿 응답 노출, 에이전트 model_name 컬럼 불일치, CORS allow_headers 와일드카드, profiles 테이블 미존재 |
| **Low** | 3 | RLS Phase 0 과도한 허용, Pagination limit 미검증, untyped() 타입 안전성 |
| **Info** | 3 | 보안 헤더 양호, Sentry PII 비전송, 감사 로그 불변성 트리거 |

**총 발견 건수: 19건**

---

## 발견 사항

---

### [Critical-01] 시크릿 볼트 -- 평문 저장 (A02 Cryptographic Failures)

- **파일**: `apps/web/src/app/api/vault/route.ts:157-170`
- **설명**: Vault POST 라우트에서 시크릿 값을 `encrypted_value` 컬럼에 **암호화 없이 평문 그대로** 저장하고 있다. `iv`와 `auth_tag` 필드에는 `'plaintext-phase1'`이라는 플레이스홀더 문자열이 입력된다. 코드 주석에 "Phase 2 will add AES-256-GCM encryption"이라고 명시되어 있으나, 이 상태로 배포 시 DB 접근 권한을 가진 모든 주체가 시크릿 원문을 열람할 수 있다.
  ```typescript
  // Phase 1: plaintext storage (Phase 2 will add AES-256-GCM encryption)
  const placeholderIv = 'plaintext-phase1';
  const placeholderAuthTag = 'plaintext-phase1';
  // ...
  encrypted_value: value,  // <-- 평문 그대로 저장
  ```
- **영향**: API 키, OAuth 토큰, 비밀번호 등 Vault에 저장된 모든 시크릿이 DB 접근(관리자, SQL injection, 백업 유출)을 통해 즉시 노출된다. 공격자가 서드파티 API 키를 탈취하여 횡적 이동(lateral movement)이 가능하다.
- **권장 조치**:
  1. `crypto.createCipheriv('aes-256-gcm', ...)` 또는 `@supabase/vault` 확장을 사용하여 저장 전 암호화를 즉시 구현한다.
  2. `VAULT_ENCRYPTION_KEY` 환경변수(이미 FastAPI config에 정의됨)를 Next.js 서버에서도 사용하여 AES-256-GCM 암호화를 적용한다.
  3. 기존 평문 데이터를 마이그레이션하여 암호화한다.
- **우선순위**: **즉시 (배포 차단 사유)**

---

### [Critical-02] DEV_AUTH_BYPASS -- 프로덕션 유출 위험 (A04 Insecure Design)

- **파일**: `apps/web/src/middleware.ts:7-20`
- **설명**: `DEV_AUTH_BYPASS` 환경변수가 `'true'`이면 모든 인증이 우회된다. 이 값은 `process.env`에서 읽히며, 프로덕션 환경에서 실수로 설정되면 **모든 사용자가 인증 없이 모든 보호된 페이지에 접근**할 수 있다. 현재 환경 체크(`NODE_ENV !== 'production'` 등)가 없다.
  ```typescript
  const DEV_AUTH_BYPASS = process.env.DEV_AUTH_BYPASS === 'true';
  if (DEV_AUTH_BYPASS) {
    // 모든 인증 우회 -- 환경 체크 없음!
    return NextResponse.next();
  }
  ```
- **영향**: 프로덕션에서 `DEV_AUTH_BYPASS=true`가 설정되면 인증 체계 전체가 무력화된다. 모든 API 라우트가 미들웨어 matcher에서 `/api`를 제외하고 있으므로 API 자체는 영향이 없으나, 대시보드/UI 페이지에 대한 무단 접근이 가능하다.
- **권장 조치**:
  1. 환경 가드 추가:
     ```typescript
     const DEV_AUTH_BYPASS =
       process.env.NODE_ENV === 'development' &&
       process.env.DEV_AUTH_BYPASS === 'true';
     ```
  2. 프로덕션 빌드 시 해당 코드를 완전히 제거하는 것이 가장 안전하다.
  3. CI/CD 파이프라인에서 프로덕션 배포 시 `DEV_AUTH_BYPASS` 환경변수가 설정되지 않았음을 검증하는 체크를 추가한다.
- **우선순위**: **즉시 (배포 차단 사유)**

---

### [Critical-03] 감사 로그 INSERT -- category NOT NULL 누락 (A09 Logging Failures)

- **파일**: `apps/web/src/app/api/agents/route.ts:241-248`, `agents/[id]/route.ts:152-159,214-221`, `agents/assign/route.ts:110-124`, `agents/release/route.ts:86-98`
- **DB 스키마**: `supabase/migrations/20260226000006_create_credits_and_audit.sql:44`
- **설명**: `audit_logs` 테이블의 `category` 컬럼은 `VARCHAR NOT NULL`로 정의되어 있다. 그러나 **모든 Next.js API 라우트에서 감사 로그 INSERT 시 `category` 필드를 포함하지 않는다.** 이로 인해 모든 감사 로그 기록이 DB NOT NULL 제약 조건 위반으로 실패한다.
  ```typescript
  // 모든 audit_logs insert에서 category 누락
  await db.from('audit_logs').insert({
    user_id: user.id,
    action: 'agent.create',
    resource_type: 'agent',
    resource_id: agent.id,
    details: { name: agent.name, category: agent.category },
    severity: 'info',
    // category 필드 없음!
  });
  ```
  ```sql
  -- DB 스키마
  category VARCHAR NOT NULL,  -- DEFAULT 없음
  ```
- **영향**: 감사 로그가 전혀 기록되지 않는다. 보안 감사 추적(audit trail)이 완전히 무력화되어, 보안 사고 발생 시 추적이 불가능하다. 또한 `await`로 호출되므로 에러가 catch되지 않으면 원래 작업도 실패할 수 있다.
- **권장 조치**:
  1. 모든 `audit_logs` INSERT에 `category` 필드를 추가한다 (예: `'agent'`, `'workspace'`, `'auth'` 등).
  2. 또는 DB 스키마에 `DEFAULT 'general'`을 추가한다.
  3. 감사 로그 INSERT 실패가 원본 작업에 영향을 주지 않도록 에러 핸들링을 추가한다.
- **우선순위**: **즉시**

---

### [High-01] Refresh Token -- 응답에 토큰 노출 (A07 Auth Failures)

- **파일**: `apps/web/src/app/api/auth/refresh/route.ts:25-30`
- **설명**: `/api/auth/refresh` 엔드포인트가 `accessToken`과 `refreshToken`을 JSON 응답 바디에 포함하여 반환한다. Supabase SSR은 쿠키 기반 세션 관리를 사용하므로, 토큰을 응답 바디에 노출할 필요가 없다. 클라이언트 JavaScript에서 토큰에 접근 가능하면 XSS 공격 시 토큰 탈취가 가능하다.
  ```typescript
  return NextResponse.json({
    data: {
      accessToken: session.access_token,    // 노출 불필요
      refreshToken: session.refresh_token,  // 특히 위험
      expiresAt: session.expires_at ?? 0,
    },
  });
  ```
- **영향**: XSS 취약점이 존재할 경우, 공격자가 refresh token을 탈취하여 장기간 세션 하이재킹이 가능하다. Refresh token은 access token보다 유효 기간이 길어 피해가 더 크다.
- **권장 조치**:
  1. 토큰을 응답 바디에서 제거하고, Supabase SSR의 쿠키 기반 세션 갱신만 사용한다.
  2. 응답은 `{ data: { expiresAt: number } }` 정도로 최소화한다.
  3. 불가피하게 토큰을 반환해야 하는 경우, `HttpOnly`, `Secure`, `SameSite=Strict` 쿠키로 설정한다.
- **우선순위**: **Phase 2**

---

### [High-02] 에이전트 생성 -- created_by 누락 (A01 Broken Access Control)

- **파일**: `apps/web/src/app/api/agents/route.ts:210-223`
- **RLS 정책**: `supabase/migrations/20260226000008_create_rls_policies.sql:163-168`
- **설명**: 에이전트 POST 라우트에서 `agents` 테이블에 INSERT할 때 `created_by` 필드를 설정하지 않는다. 그러나 RLS INSERT 정책은 `created_by = auth.uid()`를 요구한다.
  ```typescript
  const insertPayload = {
    name: agentData.name,
    slug: `${slug}-${Date.now()}`,
    // ...
    // created_by 누락!
  };
  ```
  ```sql
  -- RLS 정책
  CREATE POLICY agents_insert ON agents
    FOR INSERT
    WITH CHECK (
      auth.uid() IS NOT NULL
      AND created_by = auth.uid()  -- created_by가 없으면 실패
    );
  ```
- **영향**: 에이전트 생성이 항상 RLS 정책 위반으로 실패한다. 또는 `created_by`가 NULL이면 RLS 정책을 우회하여 소유자 없는 에이전트가 생성될 수 있다.
- **권장 조치**: INSERT 페이로드에 `created_by: user.id`를 추가한다.
- **우선순위**: **즉시**

---

### [High-03] 워크스페이스 생성 -- 멤버 중복 삽입 (A04 Insecure Design)

- **파일**: `apps/web/src/app/api/workspaces/route.ts:201-206`
- **DB 트리거**: `supabase/migrations/20260226000002_create_users_and_workspaces.sql:105-116`
- **설명**: 워크스페이스 생성 시 API 코드에서 `workspace_members` INSERT를 명시적으로 수행하는데, DB에는 이미 `trg_workspace_auto_owner` 트리거가 동일한 작업을 자동으로 수행한다. `workspace_members` 테이블에 `UNIQUE(workspace_id, user_id)` 제약 조건이 있으므로 **중복 삽입 시 유니크 제약 위반 에러**가 발생한다.
  ```typescript
  // API 코드: 수동 삽입 (트리거와 중복)
  await supabase.from('workspace_members').insert({
    workspace_id: workspace.id,
    user_id: user.id,
    role: 'owner',
  });
  ```
  ```sql
  -- DB 트리거: 자동 삽입
  CREATE TRIGGER trg_workspace_auto_owner
    AFTER INSERT ON workspaces
    FOR EACH ROW EXECUTE FUNCTION auto_add_workspace_owner();
  ```
- **영향**: 워크스페이스 생성 후 멤버 INSERT에서 에러가 발생하지만, `await` 결과를 검사하지 않으므로 에러가 무시된다. 그러나 에러 발생 자체가 불필요한 DB 부하이며, 향후 에러 처리 추가 시 워크스페이스 생성이 실패하는 것처럼 보일 수 있다.
- **권장 조치**: API 코드에서 수동 `workspace_members` INSERT를 제거하고 트리거에 위임한다.
- **우선순위**: **즉시**

---

### [High-04] 감사 로그 -- ILIKE 와일드카드 인젝션 (A03 Injection)

- **파일**: `apps/web/src/app/api/audit-logs/route.ts:65`
- **설명**: 감사 로그 조회 시 `action` 파라미터를 Supabase의 `.ilike()` 메서드에 직접 전달한다. Supabase는 내부적으로 파라미터화된 쿼리를 사용하므로 **SQL Injection은 아니지만**, LIKE 패턴 특수문자(`%`, `_`)가 이스케이프되지 않아 와일드카드 인젝션이 가능하다.
  ```typescript
  query = query.ilike("action", `%${action}%`);
  // action = "%" 입력 시 → ILIKE '%%%' → 모든 레코드 매칭
  // action = "_" 입력 시 → 단일 문자 와일드카드
  ```
- **영향**: 공격자가 `%` 패턴으로 전체 감사 로그를 열람하거나, 복잡한 LIKE 패턴으로 정보를 추출할 수 있다. RLS가 적용되므로 권한 범위 내 데이터만 노출되지만, 의도하지 않은 데이터 접근이 가능하다.
- **권장 조치**: LIKE 특수문자를 이스케이프하는 유틸리티를 추가한다:
  ```typescript
  function escapeLike(str: string): string {
    return str.replace(/[%_\\]/g, '\\$&');
  }
  query = query.ilike("action", `%${escapeLike(action)}%`);
  ```
- **우선순위**: **Phase 2**

---

### [High-05] Next.js API 라우트 -- 미들웨어 인증 미적용 (A01 Broken Access Control)

- **파일**: `apps/web/src/middleware.ts:43-46`
- **설명**: Next.js 미들웨어의 matcher가 `/api` 경로를 **명시적으로 제외**하고 있다:
  ```typescript
  export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
  };
  ```
  이로 인해 모든 `/api/*` 라우트는 미들웨어의 세션 갱신 및 인증 리다이렉트를 받지 않는다. 각 API 라우트에서 개별적으로 `supabase.auth.getUser()`를 호출하여 인증을 확인하고 있지만, 이는 일관성 부족 및 누락 위험이 있다. 새 API 라우트 추가 시 인증 체크를 잊으면 인가되지 않은 접근이 가능하다.
- **영향**: 현재까지 모든 API 라우트에서 개별 인증 체크가 구현되어 있어 즉각적인 위험은 없다. 그러나 새 라우트 추가 시 인증 체크가 누락될 가능성이 높고, 이는 인가되지 않은 데이터 접근으로 이어진다.
- **권장 조치**:
  1. 공통 인증 유틸리티를 만들어 모든 API 라우트에서 재사용한다.
  2. Next.js 미들웨어에서 `/api` 경로에도 Bearer token 또는 쿠키 기반 인증을 적용한다.
  3. 또는 `/api` 라우트를 미들웨어 matcher에 포함시키되, 인증이 필요 없는 라우트만 예외로 둔다.
- **우선순위**: **Phase 2**

---

### [Medium-01] 로그인 잠금 -- 인메모리 저장소 (A07 Auth Failures)

- **파일**: `apps/web/src/app/api/auth/login/route.ts:8-12`
- **설명**: 로그인 시도 횟수를 `Map<string, ...>`으로 인메모리에 저장한다. 서버리스 환경(Vercel)에서는 함수 인스턴스가 요청마다 재생성되므로 잠금 상태가 유지되지 않는다. 또한 다중 인스턴스 환경에서도 상태가 공유되지 않는다.
  ```typescript
  // In-memory store for login attempts. In production, use Redis or a database.
  const loginAttempts = new Map<string, { count: number; lockedUntil: number | null }>();
  ```
- **영향**: 브루트포스 공격 방어가 사실상 작동하지 않는다. 공격자가 새 요청마다 새 서버 인스턴스에 라우팅되면 잠금이 적용되지 않는다.
- **권장 조치**: Redis 또는 Supabase 테이블 기반의 영속적 잠금 저장소로 교체한다. `apps/api/app/config.py`에 이미 `redis_url` 설정이 존재한다.
- **우선순위**: **Phase 2**

---

### [Medium-02] MFA 등록 -- TOTP 시크릿 응답 노출 (A07 Auth Failures)

- **파일**: `apps/web/src/app/api/auth/mfa/enroll/route.ts:42-49`
- **설명**: MFA 등록 응답에 TOTP `secret`이 평문으로 포함된다. `qr_code`는 Base64 인코딩된 QR 이미지이므로 시크릿을 이미 포함하지만, `secret`을 별도로 노출하면 네트워크 로그, 브라우저 개발자 도구 등에서 탈취 위험이 증가한다.
  ```typescript
  return NextResponse.json({
    data: {
      factorId: data.id,
      totpUri: data.totp.uri,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,  // TOTP 시크릿 평문 노출
    },
  });
  ```
- **영향**: 등록 시 한 번만 노출되므로 위험도는 제한적이나, 매뉴얼 입력이 필요한 경우가 아니면 불필요한 노출이다.
- **권장 조치**: `secret` 필드를 제거하고 `qrCode`만 반환한다. 매뉴얼 입력이 필요한 경우에만 `secret`을 별도 엔드포인트로 분리하여 rate limit를 적용한다.
- **우선순위**: **Phase 2**

---

### [Medium-03] 에이전트 -- model_name vs model 컬럼 불일치 (A04 Insecure Design)

- **파일**: `apps/web/src/app/api/agents/route.ts:51,217`
- **DB 스키마**: `supabase/migrations/20260226000003_create_agents.sql:25`
- **설명**: 에이전트 생성 API에서 `model_name` 필드를 사용하지만, DB 스키마의 컬럼명은 `model`이다. Supabase 클라이언트는 존재하지 않는 컬럼에 대해 에러를 반환하거나 조용히 무시할 수 있다.
  ```typescript
  // API 코드
  model_name: agentData.model_name,  // 'model_name' 사용
  ```
  ```sql
  -- DB 스키마
  model TEXT NOT NULL DEFAULT 'gpt-4o',  -- 'model' 컬럼
  ```
- **영향**: 에이전트 생성 시 모델 정보가 저장되지 않아 기본값 `gpt-4o`가 사용된다. 사용자가 지정한 모델과 실제 사용되는 모델이 다를 수 있다.
- **권장 조치**: API 코드의 `model_name`을 `model`로 수정하거나, DB 스키마를 `model_name`으로 변경한다. 동일하게 `model_provider` 컬럼 존재 여부를 확인하고 일치시킨다.
- **우선순위**: **즉시**

---

### [Medium-04] FastAPI CORS -- allow_headers 와일드카드 (A05 Security Misconfiguration)

- **파일**: `apps/api/app/main.py:98`
- **설명**: CORS 설정에서 `allow_headers=["*"]`로 설정하여 모든 헤더를 허용한다. `allow_origins`는 환경변수로 제한하고 있지만, 헤더 와일드카드는 비표준 헤더를 통한 잠재적 공격 벡터를 열어둔다.
  ```python
  app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.api_cors_origins,
    allow_headers=["*"],  # 와일드카드
  )
  ```
- **영향**: CORS 프리플라이트 요청에서 모든 커스텀 헤더가 허용되어, 비표준 헤더를 이용한 정보 누출이나 캐시 포이즈닝 등의 공격 벡터가 존재할 수 있다.
- **권장 조치**: 필요한 헤더만 명시적으로 허용한다:
  ```python
  allow_headers=["Authorization", "Content-Type", "X-Request-ID"]
  ```
- **우선순위**: **Phase 2**

---

### [Medium-05] 감사 로그 -- profiles 테이블 미존재 (A04 Insecure Design)

- **파일**: `apps/web/src/app/api/audit-logs/route.ts:117-127`
- **설명**: 감사 로그 조회 시 사용자 이름 해석을 위해 `profiles` 테이블을 쿼리하지만, DB 마이그레이션에 해당 테이블이 정의되어 있지 않다. 사용자 정보는 `users` 테이블에 존재한다.
  ```typescript
  const { data: profiles } = await supabase
    .from("profiles")  // 존재하지 않는 테이블
    .select("id, display_name")
    .in("id", userIds);
  ```
- **영향**: 감사 로그 조회 시 사용자 이름이 항상 `null`로 반환되어 감사 추적의 가독성이 저하된다. Supabase가 에러를 반환할 수 있으나, 에러 핸들링이 없으므로 `profiles`가 `null`이 되어 조용히 실패한다.
- **권장 조치**: `from("profiles")`를 `from("users")`로 변경하고 `display_name`을 `full_name`으로 수정한다.
- **우선순위**: **즉시**

---

### [Low-01] RLS 정책 -- Phase 0 과도한 허용 (A01 Broken Access Control)

- **파일**: `supabase/migrations/20260226000008_create_rls_policies.sql:154-160,229-235`
- **설명**: `agents`와 `pipelines` 테이블의 SELECT RLS 정책에 `OR auth.uid() IS NOT NULL` 조건이 포함되어 있다. 이는 Phase 0 단일 테넌트 환경을 위한 의도적 설계이나, 다른 조건(`is_system = true OR created_by = auth.uid()`)을 사실상 무력화한다.
  ```sql
  -- 실질적으로 모든 인증된 사용자가 모든 에이전트를 볼 수 있음
  USING (
    is_system = true
    OR created_by = auth.uid()
    OR auth.uid() IS NOT NULL  -- 이 조건이 위 조건들을 무력화
  );
  ```
- **영향**: Phase 0에서는 의도된 동작이지만, B2B 멀티테넌트 전환 시 이 정책이 그대로 유지되면 테넌트 간 데이터 격리가 깨진다.
- **권장 조치**: Phase 1 완료 시점에 해당 `OR auth.uid() IS NOT NULL` 조건을 제거하고 적절한 워크스페이스 기반 접근 제어로 교체하는 마이그레이션을 준비한다. TODO 주석으로 명시한다.
- **우선순위**: **Phase 2 (B2B 전환 시)**

---

### [Low-02] Pagination -- limit 미검증 (A04 Insecure Design)

- **파일**: `apps/web/src/app/api/audit-logs/route.ts:51`
- **설명**: 감사 로그의 `limit` 파라미터를 `parseInt`로 파싱하지만 최대값 제한이 없다. 공격자가 `limit=999999`를 전달하면 대량의 데이터가 반환되어 DoS 공격 벡터가 된다.
  ```typescript
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  // 최대값 검증 없음
  ```
- **영향**: 서버 메모리 과부하, 응답 시간 증가, 네트워크 대역폭 소모를 통한 DoS 가능.
- **권장 조치**: `Math.min(limit, 100)` 등으로 최대값을 제한한다. Zod 스키마로 검증하는 것이 더 바람직하다.
- **우선순위**: **Phase 2**

---

### [Low-03] untyped() 헬퍼 -- 타입 안전성 무력화 (Code Quality)

- **파일**: `apps/web/src/lib/supabase/untyped.ts:14`
- **설명**: `untyped()` 함수가 `any`를 반환하여 TypeScript 타입 체크를 완전히 무력화한다. 이는 잘못된 컬럼명, 누락된 필드 등의 오류를 컴파일 타임에 잡지 못하게 한다. 실제로 [Medium-03]의 `model_name` 불일치가 이 문제로 인해 컴파일 에러 없이 통과되었다.
  ```typescript
  export function untyped<T>(client: T): any {
    return client;
  }
  ```
- **영향**: 런타임 에러 증가, 보안 관련 필드 누락 시 컴파일 타임 감지 불가.
- **권장 조치**: Supabase 타입 정의를 수정하여 `untyped()` 사용을 최소화한다. 불가피한 경우 `unknown` 타입을 사용하고 런타임 검증을 추가한다.
- **우선순위**: **Phase 3**

---

### [Info-01] 보안 헤더 -- 양호

- **파일**: `apps/api/app/middleware/security_headers.py:20-38`
- **설명**: FastAPI의 보안 헤더 미들웨어가 OWASP 권장 사항을 충실히 구현하고 있다:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  - `Content-Security-Policy`: script-src 'self', frame-ancestors 'none' 등
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

---

### [Info-02] Sentry -- PII 비전송 설정

- **파일**: `apps/api/app/main.py:60`
- **설명**: Sentry 초기화 시 `send_default_pii=False`로 설정하여 개인식별정보(PII)가 에러 보고에 포함되지 않는다. 이는 GDPR/개인정보보호법 준수에 적합하다.

---

### [Info-03] 감사 로그 -- 불변성 보장

- **파일**: `supabase/migrations/20260226000006_create_credits_and_audit.sql:70-79`
- **설명**: `audit_logs` 테이블에 `no_modify_audit_logs` 트리거가 설정되어 UPDATE/DELETE를 DB 레벨에서 차단한다. 이는 감사 로그 무결성 보장에 매우 효과적이다.

---

## .env 및 시크릿 관리 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| `.env` 파일 `.gitignore` 등록 | 양호 | `.env`, `.env.local`, `.env.*.local` 모두 제외됨 |
| `.env` 파일 git 추적 | 양호 | `git ls-files`에 .env 파일 없음 |
| `.env.example` 시크릿 평문 | 양호 | 플레이스홀더 값만 포함 |
| `apps/api/.env` (로컬 개발용) | 주의 | `API_SECRET_KEY=local-dev-secret-key-change-in-production` -- 개발용 문자열이나 프로덕션에서 변경 필수 |
| 하드코딩된 시크릿 | 양호 | 소스코드 내 하드코딩된 실제 시크릿 없음 |

---

## SSRF 방어 상태

- **파일**: `apps/api/app/middleware/ssrf_guard.py`
- **상태**: 양호. 사설 IP 대역(10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16), IPv6 루프백/링크로컬, 클라우드 메타데이터 엔드포인트를 모두 차단한다. DNS 리바인딩 방어를 위한 DNS 해석 후 IP 검증도 포함되어 있다.
- **참고**: SSRF 가드가 현재 미들웨어로 등록되지 않고 유틸리티 함수로만 존재한다. 실제 외부 요청 시 `validate_url()`을 호출하는지 확인이 필요하다.

---

## 수정 우선순위 매트릭스

| 순위 | ID | 제목 | 예상 공수 |
|------|----|------|----------|
| 1 | Critical-01 | 시크릿 평문 저장 → AES-256-GCM 암호화 | 4-8h |
| 2 | Critical-02 | DEV_AUTH_BYPASS 환경 가드 추가 | 0.5h |
| 3 | Critical-03 | audit_logs category 필드 추가 | 1h |
| 4 | High-02 | 에이전트 created_by 추가 | 0.5h |
| 5 | High-03 | 워크스페이스 멤버 중복 삽입 제거 | 0.5h |
| 6 | Medium-03 | model_name → model 컬럼명 수정 | 0.5h |
| 7 | Medium-05 | profiles → users 테이블 수정 | 0.5h |
| 8 | High-01 | Refresh Token 응답 제거 | 1h |
| 9 | High-04 | ILIKE 와일드카드 이스케이프 | 0.5h |
| 10 | High-05 | API 라우트 공통 인증 미들웨어 | 2-4h |
| 11 | Medium-01 | 로그인 잠금 Redis 전환 | 2-4h |
| 12 | Medium-02 | MFA 시크릿 응답 최소화 | 0.5h |
| 13 | Medium-04 | CORS allow_headers 명시 | 0.5h |
| 14 | Low-01 | RLS Phase 0 조건 제거 | 1h |
| 15 | Low-02 | Pagination limit 제한 | 0.5h |
| 16 | Low-03 | untyped() 개선 | 2-4h |

---

## 보안 승인 상태

- [ ] 프로덕션 배포 승인
- [x] **조건부 승인**
- [ ] 거부

### 조건

프로덕션 배포를 위해 다음 항목이 반드시 해결되어야 한다:

1. **[Critical-01]** 시크릿 볼트 AES-256-GCM 암호화 구현
2. **[Critical-02]** DEV_AUTH_BYPASS에 `NODE_ENV === 'development'` 가드 추가
3. **[Critical-03]** audit_logs INSERT에 `category` 필드 추가 (또는 DB DEFAULT 추가)
4. **[High-02]** agents INSERT에 `created_by: user.id` 추가
5. **[High-03]** workspaces POST에서 중복 workspace_members INSERT 제거
6. **[Medium-03]** agents INSERT의 `model_name` → `model` 컬럼명 수정
7. **[Medium-05]** audit-logs의 `profiles` → `users` 테이블 참조 수정

**위 7개 항목 해결 후 TEAM_H 재검토를 거쳐 프로덕션 배포를 승인한다.**

---

*Generated by TEAM_H Security Agent on 2026-02-26*
