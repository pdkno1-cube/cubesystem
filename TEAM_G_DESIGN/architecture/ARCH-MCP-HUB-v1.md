# ARCH-MCP-HUB-v1: MCP Integration Hub 아키텍처

> 작성: TEAM_G (ARCHITECT) | 버전: v1.0 | 2026-02-27
> 참조 PRD: PRD-MCP-HUB-v1.md

---

## 시스템 구성도

```
Browser (Next.js /vault 페이지)
  |
  | GET  /api/mcp/providers
  | POST /api/mcp/connections
  | DEL  /api/mcp/connections/[id]
  | POST /api/mcp/test/[provider]
  |
Next.js API Routes (apps/web/src/app/api/mcp/)
  |  → Authorization 헤더 + workspace_id 검증
  |
FastAPI (apps/api)
  |
  | GET  /orchestrate/mcp/providers
  | POST /orchestrate/mcp/connections
  | DEL  /orchestrate/mcp/connections/{id}
  | POST /orchestrate/mcp/test/{provider}
  |
  +--→ MCPRegistry (app/mcp/registry.py)  [기존]
  |       └─→ ResendClient / SlackClient / GoogleDriveClient / FireCrawlClient
  |
  +--→ Supabase
          ├─ mcp_connections (CRUD)
          └─ secret_vault (READ-ONLY: slug, id 조회용)
```

---

## DB 스키마 변경 (신규 마이그레이션 필요)

### 파일명: `20260227000011_mcp_hub_enhancements.sql`

```sql
-- 1. mcp_connections.provider CHECK 제약에 'resend' 추가
ALTER TABLE mcp_connections
  DROP CONSTRAINT IF EXISTS mcp_connections_provider_check;

ALTER TABLE mcp_connections
  ADD CONSTRAINT mcp_connections_provider_check
  CHECK (provider IN (
    'firecrawl', 'paddleocr', 'google_drive',
    'figma', 'slack', 'resend', 'custom'
  ));

-- 2. last_tested_at 컬럼 추가
ALTER TABLE mcp_connections
  ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ;

-- 3. test_result JSONB 컬럼 추가 (최근 테스트 결과 캐시)
ALTER TABLE mcp_connections
  ADD COLUMN IF NOT EXISTS test_result JSONB;

-- 4. 인덱스
CREATE INDEX IF NOT EXISTS idx_mcp_provider_workspace_active
  ON mcp_connections(provider, workspace_id)
  WHERE is_active = true AND deleted_at IS NULL;
```

---

## API 엔드포인트 설계

| Method | FastAPI Path | Next.js Path | 설명 | Auth |
|---|---|---|---|---|
| GET | `/orchestrate/mcp/providers` | `/api/mcp/providers` | 프로바이더 목록 + 연결 상태 | 필요 |
| POST | `/orchestrate/mcp/connections` | `/api/mcp/connections` | 연결 생성 | 필요 |
| DELETE | `/orchestrate/mcp/connections/{id}` | `/api/mcp/connections/[id]` | 연결 해제 (soft) | 필요 |
| POST | `/orchestrate/mcp/test/{provider}` | `/api/mcp/test/[provider]` | 연결 테스트 | 필요 |

### GET /orchestrate/mcp/providers

Request query: `?workspace_id=<uuid>`

Response:
```json
{
  "data": [
    {
      "provider": "resend",
      "display_name": "Resend",
      "description": "트랜잭션 이메일 발송",
      "icon": "mail",
      "docs_url": "https://resend.com/docs",
      "connection": {
        "id": "uuid",
        "is_active": true,
        "vault_secret_slug": "resend-api-key",
        "health_status": "healthy",
        "last_tested_at": "2026-02-27T10:00:00Z",
        "test_result": { "ok": true, "message": "API 연결 정상" }
      }
    },
    {
      "provider": "slack",
      "display_name": "Slack",
      "description": "채널 메시지 전송 및 알림",
      "icon": "message-square",
      "docs_url": "https://api.slack.com",
      "connection": null
    }
    // ... google_drive, firecrawl
  ]
}
```

### POST /orchestrate/mcp/connections

Request body:
```json
{
  "workspace_id": "uuid",
  "provider": "resend",
  "vault_secret_id": "uuid"
}
```

Response: `201 Created`
```json
{
  "data": {
    "id": "uuid",
    "provider": "resend",
    "vault_secret_slug": "resend-api-key",
    "is_active": true,
    "created_at": "2026-02-27T10:00:00Z"
  }
}
```

내부 처리:
1. vault_secret_id로 secret_vault 레코드 존재 + 권한 확인
2. 동일 (workspace_id, provider) 활성 연결 중복 체크 → 409 Conflict
3. `mcp_connections` INSERT (slug 자동 생성: `{provider}-{workspace_short_id}`)
4. `endpoint_url`은 프로바이더 기본값 사용 (예: resend → "https://api.resend.com")

### DELETE /orchestrate/mcp/connections/{connection_id}

처리: `is_active = false`, `deleted_at = NOW()` 설정
캐시 무효화: `MCPRegistry.invalidate_cache(mcp_name=provider, workspace_id=workspace_id)`

### POST /orchestrate/mcp/test/{provider}

Request body: `{ "workspace_id": "uuid" }`

Response:
```json
{
  "data": {
    "provider": "resend",
    "ok": true,
    "message": "Resend API 연결 정상 (domains 조회 성공)",
    "tested_at": "2026-02-27T10:05:00Z"
  }
}
```

내부 처리:
1. `MCPRegistry.health_check(provider, workspace_id)` 호출
2. 결과를 `mcp_connections.last_tested_at`, `test_result` 에 업데이트
3. health_status도 동시 업데이트 ('healthy' / 'down')

---

## 구현 파일 목록

### DB 마이그레이션
```
the-master-os/supabase/migrations/
  20260227000011_mcp_hub_enhancements.sql   [신규]
```

### FastAPI (Backend)
```
the-master-os/apps/api/app/
  routers/
    mcp_hub.py                              [신규] 4개 엔드포인트
  schemas/
    mcp_hub.py                              [신규] Pydantic 스키마
  main.py                                   [수정] mcp_hub 라우터 등록
```

### Next.js API Routes
```
the-master-os/apps/web/src/app/api/mcp/
  providers/
    route.ts                                [신규] GET proxy
  connections/
    route.ts                                [신규] POST proxy
    [id]/
      route.ts                              [신규] DELETE proxy
  test/
    [provider]/
      route.ts                              [신규] POST proxy
```

### Next.js 프론트엔드 컴포넌트
```
the-master-os/apps/web/src/
  types/
    mcp.ts                                  [신규] MCP 관련 TypeScript 타입
  hooks/
    useMcpProviders.ts                      [신규] 프로바이더 목록/상태 조회 훅
  components/mcp/
    McpProviderSection.tsx                  [신규] Vault 페이지 내 섹션 컨테이너
    McpProviderCard.tsx                     [신규] 개별 프로바이더 카드
    ConnectProviderModal.tsx                [신규] 연결 생성 모달
    DisconnectConfirmDialog.tsx             [신규] 연결 해제 확인 다이얼로그
  app/(dashboard)/vault/
    page.tsx                                [수정] McpProviderSection 추가
```

---

## 데이터 흐름

### 연결 생성 플로우

```
1. User: ConnectProviderModal에서 시크릿 선택 후 "연결" 클릭
2. FE: Optimistic UI — 카드 상태 즉시 "연결됨"으로 전환
3. FE: POST /api/mcp/connections { workspace_id, provider, vault_secret_id }
4. Next.js API Route: Authorization 헤더 추출 → FastAPI 프록시
5. FastAPI mcp_hub.py:
   a. get_current_user 인증 확인
   b. secret_vault 레코드 존재 + workspace 소속 확인
   c. 중복 활성 연결 체크 (409 반환)
   d. mcp_connections INSERT
6. Supabase: 레코드 저장
7. FastAPI → Next.js → Browser: 201 + connection 데이터
8. FE: Toast "연결 완료" + useMcpProviders 캐시 업데이트
```

### 테스트 플로우

```
1. User: "테스트" 버튼 클릭
2. FE: 버튼 로딩 상태 (Optimistic)
3. FE: POST /api/mcp/test/resend { workspace_id }
4. FastAPI: MCPRegistry.health_check("resend", workspace_id) 호출
   → get_client() → mcp_connections 조회 → secret_vault 복호화 → ResendClient 생성
   → client.health_check() → GET https://api.resend.com/domains
5. FastAPI: mcp_connections.last_tested_at, test_result, health_status 업데이트
6. 응답: { ok: true/false, message: "...", tested_at: "..." }
7. FE: Toast 표시 + 카드 last_tested_at 업데이트
```

---

## UI 컴포넌트 구조

### McpProviderSection (섹션 컨테이너)
```
McpProviderSection
  ├─ 섹션 헤더 ("MCP 프로바이더 연동" + 부제목)
  ├─ 로딩 상태: ProviderCardSkeleton × 4
  ├─ grid(2열) → McpProviderCard × 4 (resend, slack, google_drive, firecrawl)
  ├─ ConnectProviderModal (open 상태로 제어)
  └─ DisconnectConfirmDialog
```

### McpProviderCard (개별 카드)

```
McpProviderCard
  ├─ CardHeader
  │   ├─ [아이콘] + 프로바이더 이름
  │   └─ Badge: "연결됨" (green) / "미연결" (gray) / "테스트 실패" (red)
  ├─ CardContent
  │   ├─ [연결됨] 시크릿 slug (마스킹: "resend-a...")
  │   └─ [연결됨] 마지막 테스트: "2026-02-27 10:05"
  └─ CardFooter
      ├─ [미연결] <Button onClick=onConnect> 연결 </Button>
      └─ [연결됨]
          ├─ <Button onClick=onTest isLoading=isTesting> 테스트 </Button>
          └─ <Button variant="ghost" onClick=onDisconnect> 연결 해제 </Button>
```

### ConnectProviderModal

```
ConnectProviderModal
  ├─ DialogHeader: "[Provider] 연결"
  ├─ DialogDescription: "API 키를 Vault 시크릿과 연결합니다."
  ├─ Form
  │   ├─ Select "워크스페이스" (workspaces 목록)
  │   └─ Select "시크릿" (category=api_key 필터된 vault secrets)
  │       └─ 없으면: "시크릿이 없습니다. 먼저 Vault에 등록해주세요." + 링크
  └─ DialogFooter: 취소 / 연결
```

---

## 프로바이더 정적 메타데이터

```typescript
// types/mcp.ts 에 정의
const MCP_PROVIDER_META = {
  resend: {
    display_name: 'Resend',
    description: '트랜잭션 이메일 발송',
    icon: 'Mail',
    docs_url: 'https://resend.com/docs',
    default_endpoint: 'https://api.resend.com',
  },
  slack: {
    display_name: 'Slack',
    description: '채널 메시지 전송 및 알림',
    icon: 'MessageSquare',
    docs_url: 'https://api.slack.com',
    default_endpoint: 'https://slack.com/api',
  },
  google_drive: {
    display_name: 'Google Drive',
    description: '파일 업로드 및 폴더 관리',
    icon: 'HardDrive',
    docs_url: 'https://developers.google.com/drive',
    default_endpoint: 'https://www.googleapis.com/drive/v3',
  },
  firecrawl: {
    display_name: 'FireCrawl',
    description: '웹 크롤링 및 스크래핑',
    icon: 'Globe',
    docs_url: 'https://docs.firecrawl.dev',
    default_endpoint: 'https://api.firecrawl.dev',
  },
} as const;
```

---

## 보안 고려사항 (TEAM_H 협의 항목)

| 위험 | 완화 방안 |
|---|---|
| API 키 노출 | 응답에 `encrypted_value` 절대 포함 금지, slug/id만 반환 |
| SSRF (endpoint_url 조작) | 기존 `ssrf_guard.py` 미들웨어 적용, 프로바이더별 허용 도메인 화이트리스트 고려 |
| 타 workspace 연결 접근 | Supabase RLS `workspace_id = auth.uid()의 workspace` 필터 + FastAPI workspace 소속 검증 이중화 |
| 연결 테스트 남용 (Rate Limit) | `/orchestrate/mcp/test/*` 에 rate_limiter 미들웨어 10req/min 적용 |
| 삭제된 시크릿 참조 | mcp_connections 조회 시 `secret_vault.deleted_at IS NULL` JOIN 조건 포함 |

---

## 확장성 고려사항

- **신규 프로바이더 추가**: `MCP_PROVIDER_META` 상수 + `_CLIENT_FACTORIES` dict에 항목 추가만으로 확장
- **OAuth2 프로바이더 (Figma 등)**: `auth_method = 'oauth2'` 분기 처리를 `mcp_hub.py`에 확장 포인트로 설계
- **연결 수 증가 시**: `mcp_connections` 테이블의 `idx_mcp_provider_workspace_active` 복합 인덱스로 쿼리 성능 보장
- **캐시 전략**: `useMcpProviders` 훅에 React Query `staleTime: 60s` 적용으로 중복 GET 방지

---

## Phase 5 Session 1 완료 기준

```
[ ] DB 마이그레이션 파일 작성 완료
[ ] FastAPI mcp_hub.py 라우터 구현 완료
[ ] Pydantic 스키마 정의 완료
[ ] Next.js API 프록시 라우트 4개 구현 완료
[ ] McpProviderSection + McpProviderCard 컴포넌트 구현 완료
[ ] ConnectProviderModal 구현 완료
[ ] vault/page.tsx에 McpProviderSection 통합 완료
[ ] TypeScript strict 통과, any 타입 0개
[ ] 연결 생성 → 테스트 → 해제 E2E 동작 확인
```
