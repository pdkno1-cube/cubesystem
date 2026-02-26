# ARCH-MASTEROS-v1: The Master OS 시스템 아키텍처

> 버전: v1.0 | TEAM_G (ARCHITECT) | 2026.02.26
> 상태: DRAFT -- TEAM_H 보안 검토 전

---

## 목차

1. [시스템 구성도](#1-시스템-구성도)
2. [DB 스키마 (ERD)](#2-db-스키마-erd)
3. [API 엔드포인트 명세](#3-api-엔드포인트-명세)
4. [LangGraph 워크플로우 설계](#4-langgraph-워크플로우-설계)
5. [보안 아키텍처](#5-보안-아키텍처)
6. [확장성 고려사항](#6-확장성-고려사항)

---

## 1. 시스템 구성도

### 1.1 전체 레이어 다이어그램

```
==========================================================================
 [L1] CLIENT LAYER — Browser
==========================================================================
  Next.js 14 App Router (SSR/RSC)
  +-- React Flow (에이전트 Drag & Drop 캔버스)
  +-- Tailwind CSS + Framer Motion (반응형 UI + 인터랙션)
  +-- Zustand (클라이언트 상태)
  +-- WebSocket Client (실시간 파이프라인 상태 수신)
         |
         | HTTPS (REST + WebSocket Upgrade)
         | Cloudflare Tunnel (로컬 -> 퍼블릭 안전 노출)
         v
==========================================================================
 [L2] BFF LAYER — Next.js API Routes (Edge/Node Runtime)
==========================================================================
  /api/auth/*          -- Supabase Auth 프록시 + JWT 검증
  /api/workspaces/*    -- 워크스페이스 CRUD
  /api/agents/*        -- 에이전트 관리/할당
  /api/pipelines/*     -- 파이프라인 관리/실행 트리거
  /api/vault/*         -- Secret Vault 프록시 (읽기 금지, 주입만 허용)
  /api/credits/*       -- 크레딧 조회/충전
  /api/audit/*         -- 감사 로그 조회
         |
         | Internal HTTP (Bearer JWT 전달)
         | (동일 네트워크 내 통신, Cloudflare Tunnel 밖)
         v
==========================================================================
 [L3] ORCHESTRATION LAYER — Python FastAPI + LangGraph
==========================================================================
  FastAPI Application Server
  +-- /orchestrate/pipeline/*   -- 파이프라인 실행/상태/중단
  +-- /orchestrate/agent/*      -- 에이전트 런타임 할당/해제
  +-- /orchestrate/health       -- 헬스체크
  +-- LangGraph Engine
  |     +-- Grant Factory Graph
  |     +-- Document Verification Graph
  |     +-- OSMU Marketing Graph
  |     +-- Auto-Healing Graph
  +-- Celery Worker Pool (비동기 장시간 작업)
  +-- Redis (태스크 큐 + 캐시 + 실시간 pub/sub)
         |
         | DB 연결 (asyncpg) / 벡터 검색 (chromadb client)
         v
==========================================================================
 [L4] DATA LAYER
==========================================================================
  [Supabase PostgreSQL]        [ChromaDB]           [Redis]
  +-- RLS 격리                 +-- RAG 벡터 저장     +-- 태스크 큐
  +-- 핵심 비즈니스 데이터       +-- 문서 임베딩       +-- 세션 캐시
  +-- Auth (GoTrue)            +-- 유사도 검색       +-- pub/sub
  +-- Realtime (변경 전파)
         |
         v
==========================================================================
 [L5] EXTERNAL INTEGRATION LAYER — MCP Servers
==========================================================================
  [FireCrawl]     -- 웹 스크래핑 (공고 수집, 시장 데이터)
  [PaddleOCR]     -- 서류 판독 (사업자등록증, 입찰서류)
  [Google Drive]  -- 문서 입출력 (보고서 저장/공유)
  [Figma API]     -- 비주얼 렌더링 (마케팅 이미지)
  [Slack API]     -- 결재/보고 알림 (워크플로우 트리거)
  [OpenAI/Claude] -- LLM 추론 (에이전트 두뇌)
```

### 1.2 레이어별 역할 상세

| 레이어 | 기술 스택 | 핵심 역할 | 스케일링 전략 |
|---|---|---|---|
| L1 Client | Next.js 14 + React Flow + Tailwind + Framer Motion | 에이전트 캔버스 렌더링, Optimistic UI, WebSocket 실시간 상태 표시 | CDN 정적 캐시 (Vercel Edge) |
| L2 BFF | Next.js API Routes (Node Runtime) | JWT 검증, 요청 집계/변환, FastAPI 프록시, CORS/Rate Limit 게이트 | Vercel Serverless 자동 확장 |
| L3 Orchestration | FastAPI + LangGraph + Celery + Redis | 에이전트 오케스트레이션, 파이프라인 그래프 실행, 비동기 태스크 처리 | Celery Worker 수평 확장 |
| L4 Data | Supabase PostgreSQL + ChromaDB + Redis | 비즈니스 데이터 영속화, 벡터 검색, 태스크 큐잉 | DB Read Replica, 파티셔닝 |
| L5 External | MCP Server Protocol | 외부 서비스 표준 인터페이스, 장애 격리, 재시도 로직 | MCP별 독립 인스턴스 |

### 1.3 데이터 흐름 (메인 시나리오: 파이프라인 실행)

```
[1] 회장이 대시보드에서 에이전트를 법인 워크스페이스로 Drag & Drop
     |
[2] React Flow onDrop -> Zustand 상태 갱신 (Optimistic UI)
     |
[3] POST /api/agents/assign {agentId, workspaceId} -> BFF
     |
[4] BFF: JWT 검증 -> Supabase agent_assignments INSERT
         + POST /orchestrate/agent/assign -> FastAPI
     |
[5] 회장이 "파이프라인 실행" 클릭
     |
[6] POST /api/pipelines/execute {pipelineId, workspaceId, params}
     |
[7] BFF -> POST /orchestrate/pipeline/start -> FastAPI
     |
[8] FastAPI: LangGraph 그래프 인스턴스 생성 -> Celery 태스크 디스패치
     |
[9] Celery Worker: 그래프 노드 순차 실행
     +-- 각 노드: LLM 호출, MCP 서버 호출, DB 읽기/쓰기
     +-- 노드 완료마다 pipeline_steps UPDATE + Redis pub/sub
     |
[10] Redis pub/sub -> FastAPI WebSocket -> BFF WebSocket -> Client
      (실시간 진행률 표시)
     |
[11] 전체 파이프라인 완료 -> pipeline_executions 상태 'completed'
      + Slack 알림 전송 + audit_logs INSERT
```

---

## 2. DB 스키마 (ERD)

### 2.1 공통 규약

- 모든 테이블: `id` (UUID, PK, default gen_random_uuid())
- 모든 테이블: `created_at`, `updated_at` (timestamptz, default now())
- Soft Delete: `deleted_at` (timestamptz, nullable) -- 물리 삭제 없음
- workspace_id 기반 RLS 격리 (users, workspaces 제외)
- 명명: snake_case, 복수형 테이블명

### 2.2 테이블 정의

#### users

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    avatar_url      TEXT,
    role            TEXT NOT NULL DEFAULT 'owner'
                    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- 인덱스
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- RLS: 자기 자신의 레코드만 조회/수정 가능
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self_access ON users
    USING (auth.uid() = id);
CREATE POLICY users_self_update ON users
    FOR UPDATE USING (auth.uid() = id);
```

#### workspaces

```sql
CREATE TABLE workspaces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    description     TEXT,
    icon_url        TEXT,
    owner_id        UUID NOT NULL REFERENCES users(id),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    settings        JSONB NOT NULL DEFAULT '{}',
    -- settings 예: {"timezone": "Asia/Seoul", "language": "ko", "max_agents": 50}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- 인덱스
CREATE UNIQUE INDEX idx_workspaces_slug ON workspaces(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);

-- RLS: owner만 접근 (현재 1인 체제, 향후 workspace_members로 확장)
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspaces_owner_access ON workspaces
    USING (owner_id = auth.uid());
```

#### workspace_members

```sql
CREATE TABLE workspace_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    invited_by      UUID REFERENCES users(id),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    UNIQUE(workspace_id, user_id)
);

-- 인덱스
CREATE INDEX idx_wm_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_wm_user ON workspace_members(user_id);

-- RLS: 해당 워크스페이스 멤버만 접근
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY wm_member_access ON workspace_members
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );
```

#### agents

```sql
CREATE TABLE agents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    description     TEXT,
    icon            TEXT,                          -- 이모지 또는 아이콘 URL
    category        TEXT NOT NULL
                    CHECK (category IN (
                        'planning', 'writing', 'marketing',
                        'audit', 'devops', 'ocr', 'scraping',
                        'analytics', 'finance', 'general'
                    )),
    model_provider  TEXT NOT NULL DEFAULT 'openai'
                    CHECK (model_provider IN ('openai', 'anthropic', 'google', 'local')),
    model_name      TEXT NOT NULL DEFAULT 'gpt-4o',
    system_prompt   TEXT NOT NULL,
    parameters      JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- parameters 예: {"temperature": 0.7, "max_tokens": 4096, "top_p": 1.0}
    is_system       BOOLEAN NOT NULL DEFAULT false,  -- 시스템 기본 에이전트 여부
    is_active       BOOLEAN NOT NULL DEFAULT true,
    cost_per_run    DECIMAL(10,4) NOT NULL DEFAULT 0.0, -- 1회 실행당 크레딧 비용
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- 인덱스
CREATE UNIQUE INDEX idx_agents_slug ON agents(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_category ON agents(category);
CREATE INDEX idx_agents_active ON agents(is_active) WHERE is_active = true;
```

#### agent_assignments

```sql
CREATE TABLE agent_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    assigned_by     UUID NOT NULL REFERENCES users(id),
    position_x      FLOAT,   -- React Flow 캔버스 X 좌표
    position_y      FLOAT,   -- React Flow 캔버스 Y 좌표
    config_override JSONB DEFAULT '{}',
    -- config_override: 워크스페이스별 에이전트 설정 오버라이드
    status          TEXT NOT NULL DEFAULT 'idle'
                    CHECK (status IN ('idle', 'running', 'paused', 'error')),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    UNIQUE(agent_id, workspace_id)
);

-- 인덱스
CREATE INDEX idx_aa_workspace ON agent_assignments(workspace_id);
CREATE INDEX idx_aa_agent ON agent_assignments(agent_id);
CREATE INDEX idx_aa_status ON agent_assignments(status) WHERE status = 'running';

-- RLS: 해당 워크스페이스 멤버만 접근
ALTER TABLE agent_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY aa_workspace_access ON agent_assignments
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );
```

#### pipelines

```sql
CREATE TABLE pipelines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    description     TEXT,
    category        TEXT NOT NULL
                    CHECK (category IN (
                        'grant_factory', 'document_verification',
                        'osmu_marketing', 'auto_healing', 'custom'
                    )),
    graph_definition JSONB NOT NULL,
    -- graph_definition: LangGraph 그래프 구조 (노드, 엣지, 조건 분기)
    -- 예: {"nodes": [...], "edges": [...], "entry_point": "start"}
    required_agents JSONB NOT NULL DEFAULT '[]',
    -- required_agents: 이 파이프라인에 필요한 에이전트 slug 목록
    required_mcps   JSONB NOT NULL DEFAULT '[]',
    -- required_mcps: 이 파이프라인에 필요한 MCP 연결 slug 목록
    is_system       BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- 인덱스
CREATE UNIQUE INDEX idx_pipelines_slug ON pipelines(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_pipelines_category ON pipelines(category);
```

#### pipeline_executions

```sql
CREATE TABLE pipeline_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id     UUID NOT NULL REFERENCES pipelines(id),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id),
    triggered_by    UUID NOT NULL REFERENCES users(id),
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                        'pending', 'running', 'completed',
                        'failed', 'cancelled', 'paused'
                    )),
    input_params    JSONB NOT NULL DEFAULT '{}',
    output_result   JSONB,
    error_message   TEXT,
    total_credits   DECIMAL(10,4) NOT NULL DEFAULT 0.0,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER,                        -- 실행 소요 시간 (밀리초)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_pe_workspace ON pipeline_executions(workspace_id);
CREATE INDEX idx_pe_pipeline ON pipeline_executions(pipeline_id);
CREATE INDEX idx_pe_status ON pipeline_executions(status) WHERE status IN ('pending', 'running');
CREATE INDEX idx_pe_created ON pipeline_executions(created_at DESC);

-- 파티셔닝 전략: 월별 RANGE 파티셔닝 (created_at 기준) -- 3.6절 참조
-- RLS
ALTER TABLE pipeline_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY pe_workspace_access ON pipeline_executions
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );
```

#### pipeline_steps

```sql
CREATE TABLE pipeline_steps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id    UUID NOT NULL REFERENCES pipeline_executions(id) ON DELETE CASCADE,
    step_name       TEXT NOT NULL,                  -- LangGraph 노드 이름
    step_order      INTEGER NOT NULL,               -- 실행 순서
    agent_id        UUID REFERENCES agents(id),     -- 이 단계를 실행한 에이전트
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                        'pending', 'running', 'completed',
                        'failed', 'skipped', 'retrying'
                    )),
    input_data      JSONB,
    output_data     JSONB,
    error_message   TEXT,
    credits_used    DECIMAL(10,4) NOT NULL DEFAULT 0.0,
    retry_count     INTEGER NOT NULL DEFAULT 0,
    max_retries     INTEGER NOT NULL DEFAULT 3,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_ps_execution ON pipeline_steps(execution_id);
CREATE INDEX idx_ps_execution_order ON pipeline_steps(execution_id, step_order);
CREATE INDEX idx_ps_status ON pipeline_steps(status) WHERE status IN ('pending', 'running');
```

#### mcp_connections

```sql
CREATE TABLE mcp_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    provider        TEXT NOT NULL
                    CHECK (provider IN (
                        'firecrawl', 'paddleocr', 'google_drive',
                        'figma', 'slack', 'custom'
                    )),
    endpoint_url    TEXT NOT NULL,
    auth_method     TEXT NOT NULL DEFAULT 'api_key'
                    CHECK (auth_method IN ('api_key', 'oauth2', 'basic', 'none')),
    secret_ref      UUID REFERENCES secret_vault(id), -- 암호화된 자격증명 참조
    config          JSONB NOT NULL DEFAULT '{}',
    -- config: {"timeout_ms": 30000, "retry_count": 3, "rate_limit_rpm": 60}
    health_status   TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (health_status IN ('healthy', 'degraded', 'down', 'unknown')),
    last_health_at  TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    UNIQUE(workspace_id, slug)
);

-- 인덱스
CREATE INDEX idx_mcp_workspace ON mcp_connections(workspace_id);
CREATE INDEX idx_mcp_provider ON mcp_connections(provider);

-- RLS
ALTER TABLE mcp_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcp_workspace_access ON mcp_connections
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );
```

#### secret_vault

```sql
CREATE TABLE secret_vault (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,                  -- 사람이 읽을 수 있는 이름
    slug            TEXT NOT NULL,
    encrypted_value BYTEA NOT NULL,                 -- AES-256-GCM 암호화된 값
    iv              BYTEA NOT NULL,                 -- 초기화 벡터 (12바이트)
    auth_tag        BYTEA NOT NULL,                 -- GCM 인증 태그 (16바이트)
    key_version     INTEGER NOT NULL DEFAULT 1,     -- 암호화 키 버전 (로테이션 대비)
    category        TEXT NOT NULL DEFAULT 'api_key'
                    CHECK (category IN (
                        'api_key', 'oauth_token', 'password',
                        'certificate', 'webhook_secret', 'other'
                    )),
    expires_at      TIMESTAMPTZ,                    -- 만료 시각 (선택)
    last_rotated_at TIMESTAMPTZ,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    UNIQUE(workspace_id, slug)
);

-- 인덱스
CREATE INDEX idx_sv_workspace ON secret_vault(workspace_id);
CREATE INDEX idx_sv_expires ON secret_vault(expires_at) WHERE expires_at IS NOT NULL;

-- RLS: 워크스페이스 owner/admin만 접근 (민감 데이터)
ALTER TABLE secret_vault ENABLE ROW LEVEL SECURITY;
CREATE POLICY sv_admin_access ON secret_vault
    USING (
        workspace_id IN (
            SELECT wm.workspace_id FROM workspace_members wm
            WHERE wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin')
            AND wm.deleted_at IS NULL
        )
    );

-- 주의: encrypted_value는 절대 클라이언트에 노출 금지
-- BFF에서도 조회 불가, FastAPI 서버사이드에서만 복호화 허용
```

#### credits

```sql
CREATE TABLE credits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL
                    CHECK (transaction_type IN (
                        'charge', 'usage', 'refund', 'bonus', 'adjustment'
                    )),
    amount          DECIMAL(12,4) NOT NULL,         -- 양수: 충전, 음수: 사용
    balance_after   DECIMAL(12,4) NOT NULL,         -- 거래 후 잔액
    description     TEXT,
    reference_type  TEXT,                            -- 'pipeline_execution', 'agent_run', 'manual'
    reference_id    UUID,                            -- pipeline_executions.id 등 참조
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스 (불변 테이블: UPDATE 없음, INSERT-only)
CREATE INDEX idx_credits_workspace ON credits(workspace_id);
CREATE INDEX idx_credits_workspace_created ON credits(workspace_id, created_at DESC);
CREATE INDEX idx_credits_ref ON credits(reference_type, reference_id)
    WHERE reference_id IS NOT NULL;

-- RLS
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY credits_workspace_access ON credits
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );
```

#### audit_logs

```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID REFERENCES workspaces(id),  -- NULL = 시스템 레벨 이벤트
    user_id         UUID REFERENCES users(id),       -- NULL = 시스템/에이전트 액션
    agent_id        UUID REFERENCES agents(id),      -- NULL = 사람 액션
    action          TEXT NOT NULL,
    -- action 예: 'workspace.create', 'agent.assign', 'pipeline.start',
    --           'vault.access', 'auth.login', 'auth.logout'
    resource_type   TEXT NOT NULL,                    -- 'workspace', 'agent', 'pipeline', ...
    resource_id     UUID,
    details         JSONB NOT NULL DEFAULT '{}',
    -- details: 변경 전후 값, 요청 파라미터 등
    ip_address      INET,
    user_agent      TEXT,
    severity        TEXT NOT NULL DEFAULT 'info'
                    CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_al_workspace ON audit_logs(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX idx_al_user ON audit_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_al_action ON audit_logs(action);
CREATE INDEX idx_al_created ON audit_logs(created_at DESC);
CREATE INDEX idx_al_severity ON audit_logs(severity) WHERE severity IN ('error', 'critical');

-- 파티셔닝: 월별 RANGE 파티셔닝 (created_at 기준) -- 6.1절 참조
-- RLS: 해당 워크스페이스 멤버 + 시스템 관리자만 열람
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY al_access ON audit_logs
    USING (
        workspace_id IS NULL  -- 시스템 이벤트는 owner만
        AND auth.uid() IN (SELECT id FROM users WHERE role = 'owner')
        OR workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );
```

### 2.3 ERD 관계도

```
users (1) ──────────< workspaces (N)
  |                       |
  |                       |──────────< workspace_members (N)
  |                       |──────────< agent_assignments (N)
  |                       |──────────< mcp_connections (N)
  |                       |──────────< secret_vault (N)
  |                       |──────────< credits (N)
  |                       |──────────< pipeline_executions (N)
  |                       |──────────< audit_logs (N)
  |
  +--- workspace_members.user_id
  +--- agent_assignments.assigned_by
  +--- pipeline_executions.triggered_by
  +--- secret_vault.created_by
  +--- credits.created_by
  +--- audit_logs.user_id

agents (1) ────────< agent_assignments (N)
  |
  +────────────────< pipeline_steps.agent_id (N)
  +────────────────< audit_logs.agent_id (N)

pipelines (1) ─────< pipeline_executions (N)

pipeline_executions (1) ──< pipeline_steps (N)

secret_vault (1) ──< mcp_connections.secret_ref (N)
```

### 2.4 인덱스 전략 요약

| 패턴 | 인덱스 타입 | 적용 테이블 |
|---|---|---|
| workspace_id 기반 조회 | B-tree | 거의 모든 테이블 |
| status 기반 필터 (active 건만) | Partial Index (WHERE 조건) | agent_assignments, pipeline_executions, pipeline_steps |
| created_at DESC 정렬 | B-tree DESC | pipeline_executions, credits, audit_logs |
| UNIQUE 제약 (soft delete 호환) | Partial Unique (WHERE deleted_at IS NULL) | users.email, workspaces.slug, agents.slug |
| JSONB 검색 | GIN (필요시 추가) | agents.parameters, pipelines.graph_definition |

---

## 3. API 엔드포인트 명세

### 3.1 Next.js BFF (API Routes)

모든 인증 요청은 `Authorization: Bearer <supabase_jwt>` 헤더 필수.
에러 응답 형식: `{ "error": { "code": "ERROR_CODE", "message": "설명" } }`

#### 인증 (Auth)

| Method | Path | 설명 | Auth | 요청 Body / 쿼리 | 응답 |
|---|---|---|---|---|---|
| POST | /api/auth/login | 이메일+비밀번호 로그인 | No | `{email, password}` | `{user, session}` |
| POST | /api/auth/logout | 로그아웃 (세션 파기) | Yes | -- | `{success: true}` |
| POST | /api/auth/refresh | JWT 토큰 갱신 | Yes | `{refresh_token}` | `{session}` |
| GET | /api/auth/me | 현재 사용자 정보 | Yes | -- | `{user}` |

#### 워크스페이스 (Workspaces)

| Method | Path | 설명 | Auth | 요청 / 쿼리 | 응답 |
|---|---|---|---|---|---|
| GET | /api/workspaces | 워크스페이스 목록 | Yes | `?page=1&limit=20` | `{data: Workspace[], total}` |
| POST | /api/workspaces | 워크스페이스 생성 | Yes | `{name, slug, description}` | `{data: Workspace}` |
| GET | /api/workspaces/:id | 워크스페이스 상세 | Yes | -- | `{data: Workspace}` |
| PATCH | /api/workspaces/:id | 워크스페이스 수정 | Yes | `{name?, description?, settings?}` | `{data: Workspace}` |
| DELETE | /api/workspaces/:id | 워크스페이스 비활성화 (soft) | Yes | -- | `{success: true}` |
| GET | /api/workspaces/:id/members | 멤버 목록 | Yes | -- | `{data: Member[]}` |
| POST | /api/workspaces/:id/members | 멤버 추가 | Yes | `{user_id, role}` | `{data: Member}` |
| DELETE | /api/workspaces/:id/members/:userId | 멤버 제거 | Yes | -- | `{success: true}` |

#### 에이전트 (Agents)

| Method | Path | 설명 | Auth | 요청 / 쿼리 | 응답 |
|---|---|---|---|---|---|
| GET | /api/agents | 전체 에이전트 풀 조회 | Yes | `?category=planning&active=true` | `{data: Agent[]}` |
| GET | /api/agents/:id | 에이전트 상세 | Yes | -- | `{data: Agent}` |
| POST | /api/agents | 커스텀 에이전트 생성 | Yes | `{name, slug, category, model_provider, model_name, system_prompt, parameters}` | `{data: Agent}` |
| PATCH | /api/agents/:id | 에이전트 수정 | Yes | 부분 업데이트 | `{data: Agent}` |
| DELETE | /api/agents/:id | 에이전트 비활성화 | Yes | -- | `{success: true}` |

#### 에이전트 할당 (Agent Assignments)

| Method | Path | 설명 | Auth | 요청 / 쿼리 | 응답 |
|---|---|---|---|---|---|
| GET | /api/workspaces/:wid/agents | 워크스페이스에 할당된 에이전트 목록 | Yes | -- | `{data: Assignment[]}` |
| POST | /api/workspaces/:wid/agents/assign | 에이전트를 워크스페이스에 할당 | Yes | `{agent_id, position_x, position_y, config_override?}` | `{data: Assignment}` |
| PATCH | /api/workspaces/:wid/agents/:assignmentId | 할당 정보 수정 (위치, 설정) | Yes | `{position_x?, position_y?, config_override?}` | `{data: Assignment}` |
| DELETE | /api/workspaces/:wid/agents/:assignmentId | 에이전트 할당 해제 | Yes | -- | `{success: true}` |

#### 파이프라인 (Pipelines)

| Method | Path | 설명 | Auth | 요청 / 쿼리 | 응답 |
|---|---|---|---|---|---|
| GET | /api/pipelines | 파이프라인 템플릿 목록 | Yes | `?category=grant_factory` | `{data: Pipeline[]}` |
| GET | /api/pipelines/:id | 파이프라인 상세 | Yes | -- | `{data: Pipeline}` |
| POST | /api/pipelines | 커스텀 파이프라인 생성 | Yes | `{name, slug, category, graph_definition, required_agents, required_mcps}` | `{data: Pipeline}` |
| PATCH | /api/pipelines/:id | 파이프라인 수정 | Yes | 부분 업데이트 | `{data: Pipeline}` |

#### 파이프라인 실행 (Pipeline Executions)

| Method | Path | 설명 | Auth | 요청 / 쿼리 | 응답 |
|---|---|---|---|---|---|
| POST | /api/pipelines/:id/execute | 파이프라인 실행 시작 | Yes | `{workspace_id, input_params}` | `{data: Execution}` |
| GET | /api/executions | 실행 이력 목록 | Yes | `?workspace_id=...&status=running&page=1` | `{data: Execution[], total}` |
| GET | /api/executions/:id | 실행 상세 (단계 포함) | Yes | -- | `{data: Execution, steps: Step[]}` |
| POST | /api/executions/:id/cancel | 실행 취소 | Yes | -- | `{success: true}` |
| POST | /api/executions/:id/pause | 실행 일시정지 | Yes | -- | `{success: true}` |
| POST | /api/executions/:id/resume | 실행 재개 | Yes | -- | `{success: true}` |

#### MCP 연결 (MCP Connections)

| Method | Path | 설명 | Auth | 요청 / 쿼리 | 응답 |
|---|---|---|---|---|---|
| GET | /api/workspaces/:wid/mcp | MCP 연결 목록 | Yes | -- | `{data: McpConnection[]}` |
| POST | /api/workspaces/:wid/mcp | MCP 연결 생성 | Yes | `{name, slug, provider, endpoint_url, auth_method, secret_data, config}` | `{data: McpConnection}` |
| PATCH | /api/workspaces/:wid/mcp/:id | MCP 연결 수정 | Yes | 부분 업데이트 | `{data: McpConnection}` |
| DELETE | /api/workspaces/:wid/mcp/:id | MCP 연결 삭제 | Yes | -- | `{success: true}` |
| POST | /api/workspaces/:wid/mcp/:id/health | MCP 헬스체크 실행 | Yes | -- | `{status: 'healthy'/'degraded'/'down'}` |

#### Secret Vault (암호화 볼트)

| Method | Path | 설명 | Auth | 요청 / 쿼리 | 응답 |
|---|---|---|---|---|---|
| GET | /api/workspaces/:wid/vault | 볼트 항목 목록 (값 제외) | Yes | -- | `{data: SecretMeta[]}` |
| POST | /api/workspaces/:wid/vault | 시크릿 저장 (서버에서 암호화) | Yes | `{name, slug, value, category, expires_at?}` | `{data: SecretMeta}` |
| PATCH | /api/workspaces/:wid/vault/:id | 시크릿 값 갱신 (로테이션) | Yes | `{value}` | `{data: SecretMeta}` |
| DELETE | /api/workspaces/:wid/vault/:id | 시크릿 삭제 | Yes | -- | `{success: true}` |

> **주의**: GET 요청에서 `encrypted_value`는 절대 응답에 포함하지 않음.
> SecretMeta = `{id, name, slug, category, key_version, expires_at, last_rotated_at, created_at}`

#### 크레딧 (Credits)

| Method | Path | 설명 | Auth | 요청 / 쿼리 | 응답 |
|---|---|---|---|---|---|
| GET | /api/workspaces/:wid/credits | 크레딧 잔액 조회 | Yes | -- | `{balance, currency: 'credits'}` |
| GET | /api/workspaces/:wid/credits/history | 크레딧 거래 이력 | Yes | `?page=1&limit=50&type=usage` | `{data: Credit[], total}` |
| POST | /api/workspaces/:wid/credits/charge | 크레딧 충전 (관리자) | Yes | `{amount, description}` | `{data: Credit}` |

#### 감사 로그 (Audit Logs)

| Method | Path | 설명 | Auth | 요청 / 쿼리 | 응답 |
|---|---|---|---|---|---|
| GET | /api/audit | 전체 감사 로그 (owner 전용) | Yes | `?workspace_id=...&action=...&severity=error&from=...&to=...&page=1` | `{data: AuditLog[], total}` |
| GET | /api/audit/:id | 감사 로그 상세 | Yes | -- | `{data: AuditLog}` |

#### WebSocket

| Path | 설명 | Auth |
|---|---|---|
| /api/ws/pipeline/:executionId | 파이프라인 실행 실시간 상태 스트림 | Yes (JWT query param) |
| /api/ws/workspace/:workspaceId | 워크스페이스 이벤트 스트림 (에이전트 상태 변경 등) | Yes |

### 3.2 FastAPI (Orchestration Engine)

내부 전용 API. BFF에서만 호출. Bearer JWT + 내부 API Key 이중 인증.

#### 파이프라인 오케스트레이션

| Method | Path | 설명 | 요청 Body |
|---|---|---|---|
| POST | /orchestrate/pipeline/start | 파이프라인 실행 시작 | `{execution_id, pipeline_id, workspace_id, input_params, assigned_agents}` |
| GET | /orchestrate/pipeline/{execution_id}/status | 실행 상태 조회 | -- |
| POST | /orchestrate/pipeline/{execution_id}/cancel | 실행 취소 | -- |
| POST | /orchestrate/pipeline/{execution_id}/pause | 실행 일시정지 | -- |
| POST | /orchestrate/pipeline/{execution_id}/resume | 실행 재개 | -- |
| GET | /orchestrate/pipeline/{execution_id}/steps | 단계별 상세 상태 | -- |

#### 에이전트 런타임

| Method | Path | 설명 | 요청 Body |
|---|---|---|---|
| POST | /orchestrate/agent/assign | 에이전트 런타임 할당 | `{agent_id, workspace_id, config_override}` |
| POST | /orchestrate/agent/release | 에이전트 런타임 해제 | `{agent_id, workspace_id}` |
| GET | /orchestrate/agent/{agent_id}/status | 에이전트 런타임 상태 | -- |
| POST | /orchestrate/agent/execute | 단일 에이전트 즉시 실행 | `{agent_id, workspace_id, prompt, context}` |

#### MCP 프록시

| Method | Path | 설명 | 요청 Body |
|---|---|---|---|
| POST | /orchestrate/mcp/{connection_id}/invoke | MCP 서버 호출 프록시 | `{method, params}` |
| GET | /orchestrate/mcp/{connection_id}/health | MCP 헬스체크 | -- |

#### 시스템

| Method | Path | 설명 |
|---|---|---|
| GET | /orchestrate/health | 헬스체크 |
| GET | /orchestrate/metrics | Prometheus 메트릭스 |
| GET | /orchestrate/workers/status | Celery 워커 상태 |

---

## 4. LangGraph 워크플로우 설계

### 4.1 공통 구조

모든 파이프라인 그래프는 다음 공통 패턴을 따른다.

```
START -> [validate_input] -> [main_workflow_nodes...] -> [finalize] -> END
                |                                              |
                v (validation fail)                            v (any error)
           [handle_error] ──────────────────────────> [notify_and_log] -> END
```

공통 상태 스키마 (TypedDict):
```python
class PipelineState(TypedDict):
    execution_id: str
    workspace_id: str
    pipeline_id: str
    current_step: str
    step_results: dict[str, Any]
    error: Optional[str]
    retry_count: int
    credits_used: float
    metadata: dict[str, Any]
```

### 4.2 Grant Factory (정부지원사업/조달입찰 팩토리)

```
                          +-----------------+
                          |     START       |
                          +--------+--------+
                                   |
                                   v
                     +----------------------------+
                     |   validate_input            |
                     |  검색 키워드, 자격 조건 검증  |
                     +-------------+--------------+
                                   |
                          (valid)  |  (invalid) --> [handle_error]
                                   v
                     +----------------------------+
                     |   crawl_announcements       |
                     |  MCP:FireCrawl              |
                     |  나라장터/SBIR/공고사이트    |
                     |  스크래핑                    |
                     +-------------+--------------+
                                   |
                                   v
                     +----------------------------+
                     |   filter_by_qualification   |
                     |  MCP:ChromaDB (RAG)         |
                     |  워크스페이스 자격 정보 vs    |
                     |  공고 참가 자격 대조         |
                     +-------------+--------------+
                                   |
                          (match)  |  (no match) --> [log_skip] -> END
                                   v
                     +----------------------------+
                     |   multi_persona_review      |
                     |  Agent: 낙관론자 분석        |
                     |  Agent: 비관론자 리스크 지적  |
                     |  Agent: 현실주의자 종합 판단  |
                     +-------------+--------------+
                                   |
                       (go)        |  (no-go) --> [archive_result] -> END
                                   v
                     +----------------------------+
                     |   draft_proposal             |
                     |  Agent: 사업계획서 작성기     |
                     |  TAM-SAM-SOM + 예산 편성    |
                     |  + 일정표 자동 생성           |
                     +-------------+--------------+
                                   |
                                   v
                     +----------------------------+
                     |   ocr_document_review       |
                     |  MCP:PaddleOCR               |
                     |  첨부 서류 판독 + 누락 체크  |
                     +-------------+--------------+
                                   |
                     (pass)        |  (fail) --> [request_human_review]
                                   v                        |
                     +----------------------------+         |
                     |   submit_via_rpa            |         |
                     |  최종 제출 (RPA 자동화)      |<--------+
                     |  (회장 승인 후 실행)         |  (승인 후)
                     +-------------+--------------+
                                   |
                                   v
                     +----------------------------+
                     |   finalize                   |
                     |  결과 저장 + Slack 알림      |
                     |  + audit_log + 크레딧 정산   |
                     +----------------------------+
                                   |
                                   v
                              +----+----+
                              |   END   |
                              +---------+
```

**조건부 분기 (Conditional Edges)**:
- `filter_by_qualification`: RAG 유사도 > 0.75 --> `multi_persona_review` / else --> `log_skip`
- `multi_persona_review`: 3인 합의 (2/3 이상 go) --> `draft_proposal` / else --> `archive_result`
- `ocr_document_review`: 누락 0건 AND 불일치 0건 --> `submit_via_rpa` / else --> `request_human_review`
- `request_human_review`: 회장 승인 콜백 --> `submit_via_rpa` / 거절 --> `archive_result`

### 4.3 Document Verification (행정/B2B 서류 자동 검증)

```
                          +-----------------+
                          |     START       |
                          +--------+--------+
                                   |
                                   v
                     +----------------------------+
                     |   validate_input            |
                     |  서류 파일 목록, 검증 규칙   |
                     +-------------+--------------+
                                   |
                                   v
                     +----------------------------+
                     |   check_completeness        |
                     |  필수 서류 체크리스트 대조   |
                     |  (사업자등록증, 재무제표,    |
                     |   납세증명서 등)             |
                     +-------------+--------------+
                                   |
                     (complete)    |  (missing) --> [generate_missing_report]
                                   v                        |
                     +----------------------------+         |
                     |   ocr_parse_documents       |         |
                     |  MCP:PaddleOCR              |<--------+
                     |  전 서류 텍스트 추출 +       |  (보완 후 재진입)
                     |  날짜/금액/서명 위치 인식    |
                     +-------------+--------------+
                                   |
                                   v
                     +----------------------------+
                     |   data_validation           |
                     |  Agent: 데이터 양식 검사기   |
                     |  - 날짜 범위 유효성          |
                     |  - 금액 일치 여부            |
                     |  - 필수 필드 존재 여부       |
                     |  - 교차 검증 (서류 간 불일치)|
                     +-------------+--------------+
                                   |
                     (pass)        |  (fail) --> [flag_discrepancies]
                                   v                        |
                     +----------------------------+         |
                     |   classify_and_store        |         |
                     |  MCP:Google Drive            |         |
                     |  폴더 구조에 맞게 분류 저장  |         |
                     +-------------+--------------+         |
                                   |                        |
                                   v                        v
                     +----------------------------+
                     |   notify_result              |
                     |  MCP:Slack                   |
                     |  검증 완료/오류 보고서 전송  |
                     |  + audit_log 기록            |
                     +----------------------------+
                                   |
                                   v
                              +----+----+
                              |   END   |
                              +---------+
```

**조건부 분기**:
- `check_completeness`: 필수 서류 100% --> `ocr_parse_documents` / else --> `generate_missing_report` (Slack 누락 목록 전송, 보완 대기)
- `data_validation`: 불일치 0건 --> `classify_and_store` / else --> `flag_discrepancies` (심각도별 분류 후 Slack 경고)

### 4.4 OSMU Marketing (원소스 멀티유즈 마케팅 스웜)

```
                          +-----------------+
                          |     START       |
                          +--------+--------+
                                   |
                                   v
                     +----------------------------+
                     |   validate_input            |
                     |  아이디어/원본 콘텐츠 입력   |
                     |  + 타깃 채널 선택            |
                     +-------------+--------------+
                                   |
                                   v
                     +----------------------------+
                     |   ideation_expand           |
                     |  Agent: 크리에이티브 디렉터  |
                     |  원본 아이디어 -> 5개 앵글   |
                     |  (SEO, 감성, 정보, 바이럴,  |
                     |   커뮤니티)                  |
                     +-------------+--------------+
                                   |
                                   v
                     +----------------------------+
                     |   script_generation         |
                     |  [병렬 실행 - Fan-Out]       |
                     |  +-----------------------+  |
                     |  | blog_script           |  |
                     |  | instagram_caption     |  |
                     |  | newsletter_body       |  |
                     |  | short_form_script     |  |
                     |  | press_release         |  |
                     |  +-----------------------+  |
                     +-------------+--------------+
                                   |
                                   v (Fan-In: 5개 결과 수집)
                     +----------------------------+
                     |   visual_rendering           |
                     |  MCP:Figma API               |
                     |  각 채널별 비주얼 에셋 생성   |
                     |  (썸네일, 카드뉴스, 배너)    |
                     +-------------+--------------+
                                   |
                                   v
                     +----------------------------+
                     |   quality_review             |
                     |  Agent: 브랜드 가디언        |
                     |  톤앤매너/팩트체크/법적 검토  |
                     +-------------+--------------+
                                   |
                     (approved)    |  (revision needed)
                                   v         |
                     +-------------------+   |
                     |   ab_test_setup   |   +---> [revise_content] --+
                     |  A/B 테스트 변수   |                            |
                     |  설정 + 배포       |<---------------------------+
                     +--------+----------+
                              |
                              v
                     +----------------------------+
                     |   monitor_and_learn         |
                     |  성과 데이터 수집 (24h 후)   |
                     |  CTR/전환율 분석             |
                     |  RAG 저장 (학습 데이터)      |
                     +----------------------------+
                              |
                              v
                         +----+----+
                         |   END   |
                         +---------+
```

**조건부 분기**:
- `script_generation`: Fan-Out 패턴 -- 5개 에이전트 병렬 실행 후 Fan-In으로 결과 수집
- `quality_review`: 브랜드 일관성 점수 > 0.8 AND 법적 리스크 0건 --> `ab_test_setup` / else --> `revise_content` (최대 2회 반복 후 사람 검토)
- `monitor_and_learn`: 비동기 (24시간 후 Celery scheduled task로 실행)

### 4.5 Auto-Healing (AI 119 자율 유지보수)

```
                     +----------------------------+
                     |   ERROR EVENT TRIGGER       |
                     |  (Sentry / Health Check /   |
                     |   MCP Failure / Exception)  |
                     +-------------+--------------+
                                   |
                                   v
                     +----------------------------+
                     |   classify_error            |
                     |  Agent: 진단 전문가          |
                     |  에러 유형 분류:             |
                     |  - api_key_exhausted        |
                     |  - rate_limited             |
                     |  - network_blocked          |
                     |  - schema_mismatch          |
                     |  - unknown                  |
                     +-------------+--------------+
                                   |
              +--------------------+--------------------+
              |                    |                     |
              v                    v                     v
  +------------------+  +------------------+  +------------------+
  | api_key_rotation |  | proxy_bypass     |  | hotfix_apply     |
  | Secret Vault에서 |  | IP 프록시 풀     |  | Agent: DevOps    |
  | 예비 키 조회 +   |  | 순환 전환        |  | 코드 패치 생성   |
  | 자동 스위칭      |  | + 쿨다운 설정    |  | + 테스트 실행    |
  +--------+---------+  +--------+---------+  +--------+---------+
           |                      |                     |
           +----------------------+---------------------+
                                  |
                                  v
                     +----------------------------+
                     |   verify_fix                 |
                     |  수정 후 재실행 테스트        |
                     +-------------+--------------+
                                   |
                     (success)     |  (fail + retry < 3)
                                   v         |
                     +-------------------+   +---> [retry with escalation]
                     |   restore_service |              |
                     |  서비스 정상화     |   (fail + retry >= 3)
                     |  + 메트릭 복구    |         |
                     +--------+---------+          v
                              |          +-------------------+
                              |          | escalate_to_human |
                              |          | Slack 긴급 알림   |
                              |          | + 서비스 격리     |
                              |          +--------+----------+
                              |                   |
                              v                   v
                     +----------------------------+
                     |   post_mortem_log           |
                     |  인시던트 보고서 생성        |
                     |  + audit_log (critical)     |
                     |  + RAG 저장 (재발 방지)      |
                     +----------------------------+
                              |
                              v
                         +----+----+
                         |   END   |
                         +---------+
```

**조건부 분기**:
- `classify_error`:
  - `api_key_exhausted` OR `rate_limited` --> `api_key_rotation`
  - `network_blocked` --> `proxy_bypass`
  - `schema_mismatch` OR `unknown` --> `hotfix_apply`
- `verify_fix`:
  - 성공 --> `restore_service`
  - 실패 AND retry_count < 3 --> 다음 전략으로 에스컬레이션 재시도
  - 실패 AND retry_count >= 3 --> `escalate_to_human`

---

## 5. 보안 아키텍처

### 5.1 인증/인가 (Authentication & Authorization)

```
+-------------------+    JWT     +-------------------+
|   Browser         | ---------> |   BFF (Next.js)   |
|   (Supabase Auth  |            |   - JWT 검증      |
|    Client SDK)    | <--------- |   - RBAC 체크     |
+-------------------+  session   +--------+----------+
                                          |
                                 Internal |  Bearer JWT + API Key
                                          v
                                 +-------------------+
                                 |   FastAPI          |
                                 |   - JWT 재검증     |
                                 |   - 내부 API Key   |
                                 |     이중 인증      |
                                 +-------------------+
```

**인증 흐름**:
1. Supabase Auth (GoTrue) 기반 이메일/비밀번호 로그인
2. JWT 발급 (access_token: 1시간, refresh_token: 7일)
3. BFF에서 `@supabase/ssr` 미들웨어로 모든 요청 JWT 자동 검증
4. FastAPI 호출 시 JWT + 내부 API Key 동시 전달 (이중 인증)

**인가 (RBAC)**:

| 역할 | 워크스페이스 CRUD | 에이전트 할당 | 파이프라인 실행 | Vault 접근 | 감사 로그 |
|---|---|---|---|---|---|
| owner | 전체 | 전체 | 전체 | 읽기/쓰기 | 전체 |
| admin | 수정 | 전체 | 전체 | 읽기/쓰기 | 해당 WS |
| member | 조회 | 조회 | 실행 | 불가 | 해당 WS |
| viewer | 조회 | 조회 | 조회 | 불가 | 불가 |

### 5.2 암호화 (Encryption)

#### AES-256-GCM Secret Vault

```
[저장 흐름]
1. 클라이언트 -> BFF: POST /api/workspaces/:wid/vault {value: "sk-abc123..."}
2. BFF -> FastAPI: 평문 value 전달 (내부 네트워크, TLS)
3. FastAPI:
   a. MASTER_KEY (환경변수, 절대 DB 저장 금지) 로드
   b. 12바이트 랜덤 IV 생성
   c. AES-256-GCM 암호화 -> (ciphertext, auth_tag)
   d. DB 저장: encrypted_value=ciphertext, iv=iv, auth_tag=auth_tag
4. 응답: {id, name, slug} (값 제외)

[사용 흐름]
1. LangGraph 노드에서 MCP 호출 시 secret_ref 참조
2. FastAPI가 서버 메모리에서 MASTER_KEY로 복호화
3. 복호화된 값을 MCP 호출 파라미터로 주입 (일회성)
4. 메모리에서 즉시 제거 (zeroize)

[키 로테이션]
- key_version 컬럼으로 버전 관리
- 새 MASTER_KEY 배포 시 background job으로 전체 재암호화
- 이전 키 버전은 30일 유예 후 폐기
```

> **절대 원칙**: 복호화된 값은 HTTP 응답으로 반환 금지. 로그에 기록 금지. 클라이언트 도달 금지.

#### 통신 암호화

| 구간 | 프로토콜 | 비고 |
|---|---|---|
| Browser -- Cloudflare | TLS 1.3 (HTTPS) | Cloudflare 관리형 인증서 |
| Cloudflare -- BFF | Cloudflare Tunnel (QUIC) | 로컬 서버 포트 노출 없음 |
| BFF -- FastAPI | HTTP over loopback/내부 네트워크 | 동일 머신 또는 Docker network |
| FastAPI -- Supabase | TLS 1.2+ (pg_ssl) | Supabase 관리형 |
| FastAPI -- ChromaDB | HTTP (동일 Docker network) | 외부 노출 차단 |

### 5.3 네트워크 보안 (Cloudflare Tunnel)

```
[인터넷]
    |
    v
+-------------------+
| Cloudflare Edge   |
| - DDoS 방어       |
| - WAF 규칙        |
| - Rate Limiting   |
| - Bot Detection   |
+--------+----------+
         |
         | Cloudflare Tunnel (암호화된 아웃바운드 연결)
         | (인바운드 포트 오픈 불필요)
         v
+-------------------+
| 로컬 서버         |
| - Next.js :3000   |
| - FastAPI :8000   |
| - 방화벽: 전포트  |
|   인바운드 차단    |
+-------------------+
```

**장점**:
- 서버의 실제 IP 주소 은폐
- 인바운드 포트 개방 불필요 (Zero Trust)
- Cloudflare의 DDoS/WAF 자동 방어

### 5.4 데이터 격리 (Supabase RLS)

모든 비즈니스 데이터 테이블에 workspace_id 기반 RLS 정책 적용.

```sql
-- 예시: 범용 RLS 헬퍼 함수
CREATE OR REPLACE FUNCTION auth.user_workspace_ids()
RETURNS SETOF UUID AS $$
    SELECT workspace_id
    FROM workspace_members
    WHERE user_id = auth.uid()
    AND deleted_at IS NULL
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 적용 패턴 (모든 workspace_id 테이블에 동일 적용)
CREATE POLICY workspace_isolation ON [table_name]
    USING (workspace_id IN (SELECT auth.user_workspace_ids()));
```

**격리 보증**:
- 법인 A의 데이터는 법인 B에서 절대 조회 불가
- 새 워크스페이스 생성 시 자동으로 격리 적용 (RLS 정책이 workspace_members 기반)
- service_role 키는 FastAPI 서버에서만 사용 (RLS 바이패스 필요 시)

### 5.5 API 보안

| 보안 계층 | 구현 | 적용 위치 |
|---|---|---|
| Rate Limiting | Cloudflare Rate Rules (분당 100회/IP) + Next.js 미들웨어 (유저별 분당 60회) | L1-L2 |
| CORS | Next.js: `Access-Control-Allow-Origin` 도메인 화이트리스트 | L2 |
| CSRF | SameSite=Strict 쿠키 + Origin 헤더 검증 | L2 |
| Input Validation | Zod (BFF) + Pydantic (FastAPI) 이중 검증 | L2-L3 |
| SQL Injection | Supabase Client (parameterized) + SQLAlchemy (ORM) | L3-L4 |
| XSS | React 기본 이스케이프 + CSP 헤더 | L1-L2 |
| Dependency Audit | `npm audit` + `pip audit` CI/CD 파이프라인 | 빌드 시 |

### 5.6 감사 (Audit)

**기록 대상 (전수 감사)**:

| 카테고리 | 액션 예시 | 심각도 |
|---|---|---|
| 인증 | `auth.login`, `auth.logout`, `auth.token_refresh` | info |
| 워크스페이스 | `workspace.create`, `workspace.delete`, `workspace.settings_change` | info~warning |
| 에이전트 | `agent.assign`, `agent.release`, `agent.config_change` | info |
| 파이프라인 | `pipeline.start`, `pipeline.complete`, `pipeline.fail` | info~error |
| 볼트 | `vault.create`, `vault.rotate`, `vault.delete`, `vault.access` | warning |
| 시스템 | `system.error`, `system.auto_heal`, `system.escalate` | error~critical |

**보존 정책**:
- 최근 90일: PostgreSQL 핫 스토리지 (즉시 조회)
- 90일~1년: 월별 파티션 아카이브 (조회 가능, 느림)
- 1년 이상: S3/R2 콜드 스토리지 (규정 준수용)

---

## 6. 확장성 고려사항

### 6.1 DB 파티셔닝 전략

워크스페이스 무한 생성 시 데이터 폭증 대비:

```sql
-- pipeline_executions: 월별 RANGE 파티셔닝
CREATE TABLE pipeline_executions (
    -- 컬럼 정의 생략 (2.2절 참조)
) PARTITION BY RANGE (created_at);

CREATE TABLE pipeline_executions_2026_01
    PARTITION OF pipeline_executions
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE pipeline_executions_2026_02
    PARTITION OF pipeline_executions
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- 자동 파티션 생성: pg_partman 확장 활용

-- audit_logs: 동일 월별 RANGE 파티셔닝
CREATE TABLE audit_logs (
    -- 컬럼 정의 생략
) PARTITION BY RANGE (created_at);

-- credits: 동일 월별 RANGE 파티셔닝 (INSERT-only, 빠르게 증가)
```

**파티셔닝 대상 기준**:
- 월 100만 행 이상 예상 테이블: pipeline_executions, pipeline_steps, audit_logs, credits
- 워크스페이스 수 증가에 비례: 위 테이블은 모두 workspace_id + created_at 복합 인덱스

### 6.2 에이전트 100+ 동시 실행: 큐잉/워커 전략

```
+-------------------+     +-------------------+     +-------------------+
|   FastAPI         |     |   Redis           |     |   Celery Workers  |
|   (API Server)    | --> |   (Broker + Queue) | --> |   (N개 인스턴스)  |
|                   |     |                   |     |                   |
|   요청 수신 후    |     |   우선순위 큐:     |     |   Worker Pool:    |
|   태스크 발행     |     |   - critical (P0)  |     |   - CPU Worker x4 |
|                   |     |   - high (P1)      |     |   - IO Worker x8  |
|                   |     |   - normal (P2)    |     |   - GPU Worker x2 |
|                   |     |   - low (P3)       |     |     (OCR/임베딩)  |
+-------------------+     +-------------------+     +-------------------+
                                                             |
                                                    Concurrency:
                                                    - 워커당 4 동시 태스크
                                                    - 총 56 동시 태스크
                                                    - 큐 백프레셔: 200 대기
```

**큐잉 전략**:
| 우선순위 | 용도 | 타임아웃 | 재시도 |
|---|---|---|---|
| P0 critical | Auto-Healing, 긴급 수정 | 60초 | 즉시 3회 |
| P1 high | 실시간 사용자 요청 (에이전트 실행) | 120초 | 30초 간격 3회 |
| P2 normal | 파이프라인 단계 실행 | 300초 | 60초 간격 3회 |
| P3 low | 보고서 생성, 학습 데이터 적재 | 600초 | 300초 간격 2회 |

**수평 확장 시나리오**:
```
[Phase 1] 단일 서버 (현재)
  FastAPI x1 + Celery Worker x3 + Redis x1
  동시 에이전트: ~12

[Phase 2] 다중 워커 (에이전트 50+)
  FastAPI x1 + Celery Worker x8 + Redis x1 (Sentinel)
  동시 에이전트: ~32
  Docker Compose로 워커 수평 확장

[Phase 3] 분산 (에이전트 100+)
  FastAPI x2 (로드밸런서) + Celery Worker x16 + Redis Cluster x3
  동시 에이전트: ~64
  Kubernetes 오토스케일링
  ChromaDB 샤딩 (컬렉션 단위)
```

### 6.3 LangGraph 워크플로우 수평 확장

**문제**: LangGraph 그래프 인스턴스는 상태를 메모리에 보유. 단일 프로세스 한계.

**해법**:

```
[1] 상태 외부화 (State Externalization)
    - LangGraph 체크포인트를 Redis에 저장
    - 그래프 노드 실행 간 상태를 Redis에서 로드/저장
    - 워커 간 상태 공유 가능

[2] 노드 단위 태스크 분리
    - 각 LangGraph 노드를 Celery 태스크로 래핑
    - 그래프 컨트롤러: 노드 완료 이벤트 수신 -> 다음 노드 디스패치
    - 노드 간 의존성은 Celery Canvas (chain, group, chord) 활용

[3] Fan-Out/Fan-In 패턴 (OSMU 등)
    - group(): 병렬 에이전트 실행
    - chord(): 병렬 완료 후 콜백 (Fan-In)
    - 최대 병렬 수: 워커 수 * concurrency

[4] 장시간 실행 그래프 복구
    - 체크포인트 기반 재개 (워커 crash 시 다른 워커가 이어받음)
    - 최대 실행 시간: 30분 (초과 시 자동 타임아웃 + 회장 알림)
```

### 6.4 모니터링 및 관측성

| 계층 | 도구 | 메트릭 |
|---|---|---|
| Application | Sentry (에러 추적) | 에러율, 에러 분류, 스택 트레이스 |
| API | Prometheus + Grafana | 요청 수, 응답 시간 (p50/p95/p99), 상태 코드 분포 |
| 큐 | Flower (Celery 모니터링) | 큐 깊이, 워커 활성 수, 태스크 성공/실패율 |
| DB | Supabase Dashboard + pg_stat | 쿼리 응답 시간, 연결 수, 캐시 히트율 |
| 인프라 | Cloudflare Analytics | 트래픽, 캐시율, WAF 차단 수 |

---

## 부록 A: 기술 스택 요약

| 영역 | 기술 | 버전/비고 |
|---|---|---|
| Frontend | Next.js 14 (App Router) | TypeScript strict |
| UI Components | Tailwind CSS + Framer Motion | |
| Canvas | React Flow | 에이전트 Drag & Drop |
| Client State | Zustand | |
| BFF | Next.js API Routes | Node Runtime |
| Orchestration | Python FastAPI | async |
| Workflow Engine | LangGraph | 그래프 기반 에이전트 오케스트레이션 |
| Task Queue | Celery + Redis | 비동기 장시간 태스크 |
| Primary DB | Supabase PostgreSQL | RLS, Realtime |
| Vector DB | ChromaDB | RAG 검색 |
| Cache/Queue | Redis | 태스크 큐 + 캐시 + pub/sub |
| Auth | Supabase Auth (GoTrue) | JWT, RBAC |
| Encryption | AES-256-GCM | Secret Vault |
| Tunnel | Cloudflare Tunnels | Zero Trust 네트워크 |
| MCP | FireCrawl, PaddleOCR, Google Drive, Figma, Slack | 표준 MCP 프로토콜 |
| Monitoring | Sentry + Prometheus + Grafana + Flower | |

## 부록 B: 다음 단계

```
1. [TEAM_H] 보안 검토 요청
   - Secret Vault 암호화 구현 상세 리뷰
   - RLS 정책 침투 테스트 시나리오 작성
   - Cloudflare WAF 규칙 세트 검토

2. [TEAM_A] PRD 발행 요청
   - PRD-MASTEROS-DASHBOARD-v1: 메인 대시보드 UI
   - PRD-MASTEROS-AGENT-CANVAS-v1: React Flow 에이전트 캔버스
   - PRD-MASTEROS-PIPELINE-v1: 파이프라인 빌더/실행 UI
   - PRD-MASTEROS-VAULT-v1: Secret Vault 관리 UI

3. [TEAM_G] 후속 설계
   - ARCH-MASTEROS-FRONTEND-v1: 프론트엔드 컴포넌트 아키텍처
   - ARCH-MASTEROS-LANGGRAPH-v1: LangGraph 구현 상세 설계
   - ARCH-MASTEROS-MCP-v1: MCP 서버 연동 인터페이스 설계
```

---

*버전: v1.0 | TEAM_G (ARCHITECT) | 2026.02.26*
*다음 리뷰어: TEAM_H (보안 검토) -> TEAM_A (티켓 발행)*
