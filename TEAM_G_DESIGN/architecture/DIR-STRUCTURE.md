# The Master OS — 프로젝트 디렉토리 구조 설계

## 레포 전략: Turborepo 모노레포

프론트엔드(Next.js)와 백엔드(FastAPI)를 하나의 레포에서 관리하되,
패키지 경계를 명확히 분리하여 독립 배포가 가능한 모노레포 구조를 채택한다.

---

## 전체 디렉토리 트리

```
the-master-os/
├── .github/
│   ├── workflows/
│   │   ├── ci-web.yml              # 프론트엔드 CI (lint, type-check, test, build)
│   │   ├── ci-api.yml              # 백엔드 CI (lint, pytest, type-check)
│   │   └── deploy.yml              # 배포 워크플로우
│   └── CODEOWNERS
│
├── apps/
│   ├── web/                         # ── Next.js 14 App Router ──
│   │   ├── public/
│   │   │   └── favicon.ico
│   │   ├── src/
│   │   │   ├── app/                 # App Router 페이지
│   │   │   │   ├── (auth)/
│   │   │   │   │   └── login/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── (dashboard)/
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── workspaces/
│   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   └── [id]/
│   │   │   │   │   │       └── page.tsx
│   │   │   │   │   ├── agents/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── pipelines/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── billing/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── vault/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── audit-logs/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── settings/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── api/             # Next.js Route Handlers (BFF)
│   │   │   │   │   ├── auth/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── proxy/
│   │   │   │   │       └── [...path]/
│   │   │   │   │           └── route.ts  # FastAPI 프록시
│   │   │   │   ├── layout.tsx
│   │   │   │   └── not-found.tsx
│   │   │   │
│   │   │   ├── components/          # UI 컴포넌트
│   │   │   │   ├── ui/              # 공통 Radix UI 래퍼 (Button, Modal, etc.)
│   │   │   │   ├── dashboard/       # God Mode 대시보드 전용
│   │   │   │   ├── workspace/       # 법인 워크스페이스 전용
│   │   │   │   ├── agent/           # 에이전트 풀 전용
│   │   │   │   ├── pipeline/        # 파이프라인 모니터 전용
│   │   │   │   ├── billing/         # 과금 대시보드 전용
│   │   │   │   ├── vault/           # 시크릿 볼트 전용
│   │   │   │   ├── audit/           # 감사 로그 전용
│   │   │   │   └── layout/          # Sidebar, Header, Footer
│   │   │   │
│   │   │   ├── hooks/               # 커스텀 훅
│   │   │   │   ├── use-auth.ts
│   │   │   │   ├── use-workspace.ts
│   │   │   │   └── use-realtime.ts
│   │   │   │
│   │   │   ├── stores/              # Zustand 스토어
│   │   │   │   ├── auth-store.ts
│   │   │   │   ├── workspace-store.ts
│   │   │   │   └── agent-store.ts
│   │   │   │
│   │   │   ├── lib/                 # 유틸리티
│   │   │   │   ├── supabase/
│   │   │   │   │   ├── client.ts    # 브라우저 클라이언트
│   │   │   │   │   └── server.ts    # 서버 컴포넌트 클라이언트
│   │   │   │   ├── api-client.ts    # FastAPI 호출 래퍼
│   │   │   │   └── utils.ts
│   │   │   │
│   │   │   └── types/               # 프론트엔드 전용 타입
│   │   │       └── index.ts
│   │   │
│   │   ├── tailwind.config.ts
│   │   ├── next.config.mjs
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── api/                         # ── Python FastAPI + LangGraph ──
│       ├── src/
│       │   ├── main.py              # FastAPI 엔트리포인트
│       │   ├── config.py            # 환경변수 로딩 (pydantic-settings)
│       │   │
│       │   ├── routers/             # API 라우터
│       │   │   ├── auth.py
│       │   │   ├── workspaces.py
│       │   │   ├── agents.py
│       │   │   ├── pipelines.py
│       │   │   ├── billing.py
│       │   │   ├── vault.py
│       │   │   ├── audit_logs.py
│       │   │   └── settings.py
│       │   │
│       │   ├── services/            # 비즈니스 로직
│       │   │   ├── workspace_service.py
│       │   │   ├── agent_service.py
│       │   │   ├── pipeline_service.py
│       │   │   ├── billing_service.py
│       │   │   ├── vault_service.py
│       │   │   └── audit_service.py
│       │   │
│       │   ├── models/              # Pydantic 모델 / DB 스키마
│       │   │   ├── workspace.py
│       │   │   ├── agent.py
│       │   │   ├── pipeline.py
│       │   │   └── billing.py
│       │   │
│       │   ├── db/                  # Supabase 클라이언트
│       │   │   ├── client.py
│       │   │   └── queries/         # 쿼리 모듈
│       │   │       ├── workspace_queries.py
│       │   │       └── agent_queries.py
│       │   │
│       │   ├── mcp/                 # MCP 서버 연동 클라이언트
│       │   │   ├── firecrawl.py
│       │   │   ├── paddleocr.py
│       │   │   ├── google_drive.py
│       │   │   ├── figma.py
│       │   │   └── slack.py
│       │   │
│       │   ├── security/            # 보안 모듈
│       │   │   ├── encryption.py    # AES-256 암복호화
│       │   │   ├── jwt.py           # JWT 토큰
│       │   │   └── rls.py           # RLS 정책 헬퍼
│       │   │
│       │   └── middleware/          # 미들웨어
│       │       ├── auth.py          # 인증 미들웨어
│       │       ├── audit.py         # 감사 로깅
│       │       └── rate_limit.py    # 속도 제한
│       │
│       ├── tests/
│       │   ├── conftest.py
│       │   ├── test_workspaces.py
│       │   └── test_agents.py
│       │
│       ├── pyproject.toml
│       └── requirements.txt
│
├── packages/
│   └── shared/                      # ── 프론트/백 공유 타입 & 상수 ──
│       ├── src/
│       │   ├── types/               # 공유 TypeScript 타입 (→ Python 모델과 동기)
│       │   │   ├── workspace.ts
│       │   │   ├── agent.ts
│       │   │   ├── pipeline.ts
│       │   │   └── billing.ts
│       │   ├── constants/           # 공유 상수 (에이전트 카테고리, 파이프라인 타입 등)
│       │   │   └── index.ts
│       │   └── index.ts
│       ├── tsconfig.json
│       └── package.json
│
├── langgraph/                       # ── LangGraph 에이전트 워크플로우 ──
│   ├── workflows/
│   │   ├── grant_factory.py         # 정부지원사업/조달 입찰 팩토리
│   │   ├── document_verify.py       # 행정/B2B 서류 검증
│   │   ├── osmu_marketing.py        # OSMU 마케팅 스웜
│   │   └── auto_healing.py          # AI 119 자율 유지보수
│   │
│   ├── agents/                      # 에이전트 정의
│   │   ├── base_agent.py            # 베이스 에이전트 클래스
│   │   ├── planning_swarm.py        # 기획/토론 스웜
│   │   ├── business_plan_swarm.py   # 사업계획서 스웜
│   │   ├── marketing_swarm.py       # OSMU 마케팅 스웜
│   │   ├── audit_swarm.py           # 내부 감사/행정 스웜
│   │   ├── devops_swarm.py          # DevOps 스웜
│   │   └── holding_agents.py        # 지주회사 에이전트 (COO, CFO 등)
│   │
│   ├── tools/                       # LangGraph 도구 정의
│   │   ├── web_scraper.py
│   │   ├── ocr_tool.py
│   │   └── rag_tool.py
│   │
│   └── tests/
│       └── test_workflows.py
│
├── supabase/                        # ── Supabase 로컬 개발 ──
│   ├── config.toml                  # supabase init 설정
│   ├── migrations/
│   │   ├── 00001_create_workspaces.sql
│   │   ├── 00002_create_agents.sql
│   │   ├── 00003_create_pipelines.sql
│   │   ├── 00004_create_billing.sql
│   │   ├── 00005_create_vault.sql
│   │   ├── 00006_create_audit_logs.sql
│   │   └── 00007_enable_rls.sql
│   └── seed/
│       └── seed.sql                 # 초기 데이터 (기본 에이전트 템플릿 등)
│
├── infra/                           # ── 인프라/배포 설정 ──
│   ├── docker/
│   │   ├── Dockerfile.web
│   │   ├── Dockerfile.api
│   │   └── docker-compose.yml       # 로컬 풀스택 개발
│   └── cloudflare/
│       └── tunnel-config.yml        # Cloudflare Tunnel 설정
│
├── docs/                            # ── 프로젝트 문서 ──
│   ├── architecture/                # 아키텍처 문서 (이 파일들)
│   └── api/                         # API 문서 (자동 생성)
│
├── turbo.json                       # Turborepo 파이프라인 설정
├── package.json                     # 루트 package.json (workspaces)
├── pnpm-workspace.yaml              # pnpm 워크스페이스 설정
├── .env.example                     # 환경변수 템플릿
├── .gitignore
└── README.md
```

---

## 레이어 설명

### `apps/web` — 프론트엔드
- **프레임워크**: Next.js 14 App Router
- **라우트 그룹**: `(auth)` 비인증 페이지, `(dashboard)` 인증 필수 페이지
- **BFF 패턴**: Next.js Route Handlers가 FastAPI로 프록시하여 CORS/인증 처리
- **상태 관리**: Zustand (클라이언트), React Query (서버)

### `apps/api` — 백엔드
- **프레임워크**: FastAPI + Uvicorn
- **라우터-서비스-DB 3계층**: 관심사 분리
- **보안**: AES-256 암복호화, JWT 인증, RLS 헬퍼 모듈 분리
- **MCP 클라이언트**: 외부 서비스별 독립 모듈

### `langgraph/` — 에이전트 오케스트레이션
- FastAPI 서비스에서 호출하는 LangGraph 워크플로우
- 에이전트 정의와 워크플로우(파이프라인) 분리
- 도구(tools)는 LangGraph 에이전트가 사용하는 기능 단위

### `supabase/` — 데이터베이스
- Supabase CLI 기반 로컬 개발
- 마이그레이션 파일로 스키마 버전 관리
- RLS 정책을 별도 마이그레이션으로 관리

### `packages/shared` — 공유 코드
- TypeScript 타입을 프론트-백 공유
- Python 모델과 수동 동기 (타입 변경 시 양쪽 업데이트)

### `infra/` — 인프라
- Docker Compose로 로컬 풀스택 환경 구성
- Cloudflare Tunnel로 외부 접속 설정

---

## 빌드 & 개발 명령어

| 명령어 | 설명 |
|--------|------|
| `pnpm dev` | Turborepo로 web + api 동시 실행 |
| `pnpm dev --filter=web` | 프론트엔드만 실행 |
| `pnpm build` | 전체 빌드 |
| `pnpm lint` | 전체 린트 |
| `pnpm test` | 전체 테스트 |
| `supabase start` | 로컬 Supabase 시작 |
| `supabase db push` | 마이그레이션 적용 |
