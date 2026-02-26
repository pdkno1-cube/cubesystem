# Claude 2 작업 지시서 — The Master OS 설계 (경량 태스크)

> **작업 규칙**
>
> 1. 이 파일을 읽고 아래 태스크를 순서대로 수행
> 2. 각 태스크 완료 시 `PARALLEL/CLAUDE2_REPORT.md`에 결과 기록
> 3. `themasteros.md` (프로젝트 루트)를 반드시 먼저 읽을 것
> 4. 산출물은 지정된 경로에 저장
> 5. 모든 태스크 완료 후 REPORT 파일에 `## 완료 상태: DONE` 추가

---

## Task 1: UI 페이지 구조 & 컴포넌트 인벤토리

**산출물**: `TEAM_G_DESIGN/architecture/UI-PAGES.md`

The Master OS 대시보드의 전체 페이지 목록과 각 페이지의 핵심 컴포넌트를 정리하라.

### 필수 포함 페이지

1. **로그인 / 인증** — 회장 단일 사용자 인증
2. **God Mode 대시보드** — 전체 법인 현황 조감도 (카드형)
3. **법인 워크스페이스 관리** — 법인 CRUD, 법인별 상세 뷰
4. **에이전트 풀 관리** — 에이전트 대기열, Drag & Drop 할당 UI
5. **파이프라인 모니터** — 4대 핵심 파이프라인 실행 현황
6. **크레딧/과금 대시보드** — 토큰 소모량, 비용 차트
7. **시크릿 볼트 관리** — API 키, 자격증명 관리
8. **감사 로그** — 전체 시스템 액션 로그
9. **설정** — 시스템 전역 설정

### 각 페이지별 기록 항목

- 페이지 URL 경로 (예: `/dashboard`, `/workspaces/:id`)
- 핵심 컴포넌트 목록 (예: WorkspaceCard, AgentPoolSidebar)
- 사용하는 주요 라이브러리 (React Flow, Framer Motion 등)
- 연결되는 API 엔드포인트 (예: GET /api/workspaces)

---

## Task 2: 프로젝트 디렉토리 구조 설계

**산출물**: `TEAM_G_DESIGN/architecture/DIR-STRUCTURE.md`

The Master OS의 모노레포 또는 멀티레포 프로젝트 디렉토리 구조를 설계하라.

### 요구사항

- **프론트엔드**: Next.js 14 App Router
- **백엔드**: Python FastAPI + LangGraph
- **DB**: Supabase (로컬 개발 포함)
- **공통**: 타입 정의, 공유 유틸리티

### 포함할 내용

```text
root/
├── apps/
│   ├── web/          ← Next.js 프론트엔드
│   └── api/          ← FastAPI 백엔드
├── packages/
│   └── shared/       ← 공유 타입/유틸
├── supabase/
│   ├── migrations/
│   └── seed/
├── langgraph/
│   └── workflows/    ← 에이전트 워크플로우
└── ...
```

위는 예시이므로, themasteros.md의 요구사항에 맞게 최적화하여 설계.

---

## Task 3: MCP 통합 매핑표

**산출물**: `TEAM_G_DESIGN/architecture/MCP-INTEGRATION.md`

themasteros.md에 언급된 외부 서비스 연동 매핑표를 작성하라.

### 매핑 대상

| 서비스       | 용도          | 연동 방식            | 비고               |
| ------------ | ------------- | -------------------- | ------------------ |
| FireCrawl    | 웹 스크래핑   | MCP Server           | 정부조달/입찰 수집 |
| PaddleOCR    | 서류 판독     | MCP Server / API     | 행정서류 검증      |
| Google Drive | 문서 입출력   | MCP Server / OAuth   | 서류 저장소        |
| Figma        | 이미지 렌더링 | MCP Server / API     | OSMU 마케팅        |
| Slack        | 결재/보고     | MCP Server / Webhook | 알림 채널          |
| ChromaDB     | RAG 벡터DB    | 직접 연동            | 자격 대조          |

### 각 서비스별 기록

- 연동 프로토콜 (REST, gRPC, WebSocket, MCP)
- 인증 방식 (API Key, OAuth, Service Account)
- 데이터 흐름 방향 (단방향/양방향)
- 에러 시 폴백 전략

---

## Task 4: 에이전트 카탈로그 (핵심 에이전트 역할 정의)

**산출물**: `TEAM_G_DESIGN/architecture/AGENT-CATALOG.md`

The Master OS에서 운용할 핵심 에이전트 유형을 카테고리별로 정리하라.
(전체 100개가 아닌, **카테고리별 대표 에이전트 템플릿**을 정의)

### 카테고리

1. **기획/토론 스웜** — 낙관론자, 비관론자, 현실주의자
2. **사업계획서 스웜** — TAM-SAM-SOM 분석, 초안 작성
3. **OSMU 마케팅 스웜** — 블로그, 인스타, 뉴스레터, 숏폼
4. **감사/행정 스웜** — OCR, 입찰가 검증, 데이터 검사
5. **DevOps 스웜** — 모니터링, 핫픽스, 프록시 관리
6. **지주회사 에이전트** — COO, CFO, 씽크탱크, SOP센터

### 각 에이전트 템플릿

```text
이름: [에이전트명]
카테고리: [소속 스웜]
역할: [한 줄 설명]
입력: [필요한 인풋]
출력: [생산하는 아웃풋]
사용 모델: [Claude/GPT/로컬LLM]
MCP 의존성: [연동 서비스]
```

---

## Task 5: 환경변수 & 설정 목록

**산출물**: `TEAM_G_DESIGN/architecture/ENV-CONFIG.md`

시스템 운영에 필요한 전체 환경변수와 설정값 목록을 정리하라.

### 설정 카테고리

- Supabase (URL, anon key, service role key)
- FastAPI (포트, CORS, 시크릿)
- LangGraph (모델 설정, 워커 수)
- 외부 서비스 API 키 (FireCrawl, Slack, Google, Figma)
- 보안 (AES-256 키, JWT 시크릿)
- 모니터링 (Sentry DSN, Mixpanel 토큰)

### 형식

```text
# 카테고리명
VARIABLE_NAME=설명 | 기본값 | 필수여부
```

---

## Task 6: 기술 스택 의존성 목록

**산출물**: `TEAM_G_DESIGN/architecture/TECH-DEPS.md`

프론트엔드/백엔드/인프라별 의존성 패키지를 정리하라.

### 프론트엔드 (package.json)

- next, react, react-dom
- @xyflow/react (React Flow), framer-motion
- tailwindcss, @radix-ui, lucide-react
- @supabase/supabase-js, @tanstack/react-query
- zustand (상태관리)
- sentry, mixpanel

### 백엔드 (requirements.txt)

- fastapi, uvicorn, pydantic
- langgraph, langchain
- supabase-py, chromadb
- python-jose (JWT), cryptography (AES-256)
- httpx, tenacity

### 각 패키지별

- 용도 한 줄 설명
- 권장 버전 (2025~2026 기준 최신 안정 버전)

---

## 완료 후

1. 모든 산출물을 지정 경로에 저장
2. `PARALLEL/CLAUDE2_REPORT.md`에 각 태스크 완료 현황 기록
3. 마지막에 `## 완료 상태: DONE` 추가
