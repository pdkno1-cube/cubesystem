# 🧠 MEMORY.md — 프로젝트 컨텍스트

> 세션 간 인수인계용 | 마지막 업데이트: 2026.02.26

---

## 프로젝트 정보

| 항목 | 내용 |
|---|---|
| 프로젝트명 | The Master OS |
| 시작일 | 2026.02.26 |
| 현재 단계 | **Phase 1 진행중** — 연결 작업 완료, UI/API 구축중 |
| 스택 | Next.js 14 + TypeScript + Tailwind + Framer Motion + React Flow (FE) / FastAPI + LangGraph (BE) / Supabase + ChromaDB (DB) / Vercel + Cloudflare Tunnels (Infra) |

---

## 현재 상태

### 완료된 작업
- [2026.02.26] 멀티 에이전트 시스템 v5.2 초기 세팅
  - 11개 팀 AGENT.md / TASKS.md 생성
  - SHARED 파일 4종 생성 (CONVENTIONS, STACK, TEAM_STATUS, SKILL_REGISTRY)
  - 슬래시 명령어 12개, 서브에이전트 11개 설정
  - .claude/settings.json (권한 + TS자동검사 + 자동포맷 + 위험명령 차단)
- [2026.02.26] TEAM_G PRD 작성 완료
  - `TEAM_G_DESIGN/prd/PRD-MASTEROS-v1.md` 생성
  - 9개 필수 기능(F-01~F-09), 4개 선택 기능(N-01~N-04) 정의
  - 사용자 스토리 7개 (US-01~US-07), 완료 기준 9개 (AC-01~AC-09)
  - 핵심 플로우 3개: 법인생성->에이전트할당->파이프라인가동 / 정부조달입찰 / OSMU마케팅
  - 6 Phase 마일스톤 (총 15주) 권장

- [2026.02.26] TEAM_G 아키텍처 설계 완료
  - `TEAM_G_DESIGN/architecture/ARCH-MASTEROS-v1.md` 생성
  - 5계층 시스템 구성도 (Client -> BFF -> Orchestration -> Data -> External)
  - DB 스키마 12 테이블 (users, workspaces, workspace_members, agents, agent_assignments, pipelines, pipeline_executions, pipeline_steps, mcp_connections, secret_vault, credits, audit_logs)
  - RLS 정책 전테이블 적용 (workspace_id 기반 격리)
  - API 명세: BFF 50+ 엔드포인트, FastAPI 15+ 엔드포인트, WebSocket 2개
  - LangGraph 4대 파이프라인 그래프 설계 (Grant Factory, Document Verification, OSMU Marketing, Auto-Healing)
  - 보안 아키텍처: AES-256-GCM 볼트, Cloudflare Tunnel, RBAC 4단계, 감사 전수 기록
  - 확장성: 월별 파티셔닝, Celery 3단계 스케일링 (12->32->64 동시 에이전트), LangGraph 상태 외부화

- [2026.02.26] **Phase 0 전체 완료 (Claude 1 + Claude 2 통합)**
  - Supabase 로컬 환경 정상 가동 (Docker + supabase start)
  - DB 마이그레이션 8개 적용, 12 테이블 생성
  - RLS 정책 전 테이블 적용 (`auth.*` → `public.*` 함수 스키마 수정 완료)
  - Seed 데이터: 사용자 1, 워크스페이스 2, 에이전트 6, 파이프라인 4, 할당 9, 감사로그 3
  - Auth 라우트 6개 (login/logout/refresh/me/mfa-enroll/mfa-verify)
  - 인증 미들웨어 + use-auth 훅 + Zustand auth-store
  - FastAPI 앱 (health/agents/pipelines 라우터, 보안미들웨어 4종)
  - Next.js 보안 헤더 5종 적용, 9개 라우팅 페이지 스켈레톤
  - .env.local 생성 (Supabase 키 자동 입력)
  - 통합 검증: Next.js dev(3000) + Supabase(54321~54323) 정상 확인

- [2026.02.26] Phase 1 연결 작업 완료 (5개 파일)
  - Login 페이지 → LoginForm 컴포넌트 연결
  - Audit Logs API → Supabase 실연동 (mock 제거)
  - Credits API → Supabase 실연동 (mock 제거)
  - Settings 페이지 → useAuth 훅 연동 (프로필/MFA/시스템상태)
  - Dashboard Auth Guard → middleware가 이미 처리 확인 (중복 제거)
  - Dev 서버 전 페이지 200 OK 검증 완료

- [2026.02.26] **TEAM_I 코드 리뷰 Critical/High 수정 완료 (Claude 2)**
  - [High-01] Pipelines N+1 쿼리 제거 — 파이프라인별 4개 개별 쿼리 → 단일 배치 쿼리 + TS 집계로 변경 (`apps/web/src/app/api/pipelines/route.ts`)
  - [High-02] agents POST `created_by: user.id` 필드 누락 수정 (`apps/web/src/app/api/agents/route.ts`)
  - [High-03] workspaces POST `workspace_members` 중복 INSERT 제거 — DB 트리거(trg_workspace_auto_owner)가 이미 처리 (`apps/web/src/app/api/workspaces/route.ts`)
  - [Medium-03] agents POST 컬럼명 `model_name` → `model` 수정 (DB 스키마 일치) (`apps/web/src/app/api/agents/route.ts`)
  - TypeScript 타입 파일 `database.ts` 동기화: `model_name` → `model`, `created_by` 필드 추가 (`apps/web/src/types/database.ts`)

### 다음 작업 (Phase 1)
- [x] 로그인 UI 구현 (LoginForm + MFA 인증) ← 완료
- [ ] Vault 시크릿 관리 페이지 구현 (진행중)
- [ ] Pipelines API Supabase 연동 (진행중)
- [ ] 대시보드 God Mode Canvas 구현 (React Flow)
- [ ] 에이전트 Drag & Drop 할당 UI
- [ ] FastAPI Python 환경 셋업 (uv venv + 패키지 설치 + 실행 테스트)
- [ ] TEAM_H 보안 검토 요청 (Phase 0+1 산출물)

---

## 주요 결정 사항

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026.02.26 | 멀티 에이전트 v5.2 채택 | 11팀 25에이전트 구조, 토큰 최적화 내장 |
| 2026.02.26 | The Master OS PRD v1 확정 | 1인 100에이전트 자율 경영 OS, 5단계 피라미드, 4대 파이프라인 |
| 2026.02.26 | 듀얼 백엔드 아키텍처 결정 | Next.js API Routes (CRUD) + FastAPI/LangGraph (에이전트 오케스트레이션) |
| 2026.02.26 | B2B 피봇 사전 설계 | 초기부터 tenant_id + RLS 기반 멀티테넌트 구조 반영 |
| 2026.02.26 | Celery+Redis 비동기 아키텍처 | LangGraph 장시간 워크플로우를 Celery 태스크로 분리, 수평 확장 가능 |
| 2026.02.26 | 월별 DB 파티셔닝 | pipeline_executions, audit_logs, credits 월별 RANGE 파티셔닝 (pg_partman) |
| 2026.02.26 | AES-256-GCM Secret Vault | 서버사이드 전용 복호화, MASTER_KEY 환경변수 관리, key_version 기반 로테이션 |
| 2026.02.26 | 2-Claude 병렬 개발 체제 | Claude 1(핵심: DB/인증/API/보안) + Claude 2(경량: 스캐폴딩/UI/설정) 분리, 의존성 최소화 |
| 2026.02.26 | Phase 0 범위 확정 | Claude 1: 8 tasks (Supabase+Auth+FastAPI+보안), Claude 2: 7 tasks (Turborepo+Next.js+Layout+Types) |

---

## 세션 인수인계 노트

> 다음 세션이 이 파일만 읽으면 컨텍스트를 이어받을 수 있도록 작성

```
현재 시점: Phase 1 진행중 (연결 작업 완료, UI/API 구축중)
선행 조건:
  - Docker Desktop 실행 필요
  - supabase start 실행 필요 (the-master-os/ 디렉토리에서)
  - config.toml 수정 이력: [general] 제거, refresh_token_rotation_enabled 제거, auth.* → public.* 함수 스키마 변경
  - pnpm dev --filter=@masteros/web (패키지명 @masteros/web, 'web' 아님)
다음 세션에서 할 것:
  1. TEAM_H 보안 리뷰 (Phase 0 산출물)
  2. Phase 1: 로그인 UI → 대시보드 → 워크스페이스 CRUD → 에이전트 할당
  3. FastAPI Python 환경: uv venv + pip install 후 uvicorn 실행 테스트
참고 파일:
  - TEAM_G_DESIGN/prd/PRD-MASTEROS-v1.md (PRD 원본)
  - TEAM_G_DESIGN/architecture/ARCH-MASTEROS-v1.md (아키텍처 설계)
  - TEAM_H_SECURITY/SECURITY-REVIEW-MASTEROS-v1.md (보안 리뷰)
```

---

*이 파일은 매 주요 작업 완료 시 업데이트합니다.*
