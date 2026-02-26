# The Master OS — 설계 통합 검토 보고서

> 작성: Claude 1 (PRIME) | 2026.02.26
> 상태: ✅ 전체 설계 완료 (Claude 1 + Claude 2 모두 완료)

---

## 1. 산출물 현황

### Claude 1 (핵심 설계) — 완료

| # | 산출물 | 경로 | 상태 |
|---|---|---|---|
| 1 | PRD 문서 | `TEAM_G_DESIGN/prd/PRD-MASTEROS-v1.md` | ✅ 완료 |
| 2 | 시스템 아키텍처 | `TEAM_G_DESIGN/architecture/ARCH-MASTEROS-v1.md` | ✅ 완료 |

### Claude 2 (경량 태스크) — 완료

| # | 산출물 | 경로 | 상태 | 품질 |
|---|---|---|---|---|
| 1 | UI 페이지 구조 | `TEAM_G_DESIGN/architecture/UI-PAGES.md` | ✅ 완료 | A — 9페이지, 컴포넌트+API 매핑 |
| 2 | 디렉토리 구조 | `TEAM_G_DESIGN/architecture/DIR-STRUCTURE.md` | ✅ 완료 | A — Turborepo 모노레포, App Router 구조 |
| 3 | MCP 통합 매핑 | `TEAM_G_DESIGN/architecture/MCP-INTEGRATION.md` | ✅ 완료 | A — 6서비스 상세 매핑 + Circuit Breaker |
| 4 | 에이전트 카탈로그 | `TEAM_G_DESIGN/architecture/AGENT-CATALOG.md` | ✅ 완료 | A — 6카테고리 21개 에이전트 템플릿 |
| 5 | 환경변수 & 설정 | `TEAM_G_DESIGN/architecture/ENV-CONFIG.md` | ✅ 완료 | A — 9카테고리 50+ 변수 |
| 6 | 기술 스택 의존성 | `TEAM_G_DESIGN/architecture/TECH-DEPS.md` | ✅ 완료 | A — FE 30+, BE 30+, 인프라 10+ |

---

## 2. PRD 검토 요약

### 구조 평가: A+
- TEAM_G AGENT.md 형식 완전 준수
- 사용자 스토리 7건 (US-01~US-07): 단일 회장 + B2B 확장 고려
- 필수 기능 9건 (F-01~F-09): 체크리스트 총 55항목
- 선택 기능 4건 (N-01~N-04)
- 비기능 요구사항 4대 영역: 성능, 보안, 확장성, 가용성
- 핵심 플로우 3가지 + Edge Cases 완비
- 완료 기준 9건 (AC-01~AC-09)
- 위험 요소 5건 + 완화 전략
- 6 Phase 마일스톤 (총 15주)

### 핵심 기능 커버리지

| themasteros.md 요구사항 | PRD 커버 여부 |
|---|---|
| God Mode 대시보드 | ✅ F-09, US-01 |
| 무한 워크스페이스 | ✅ F-02, US-02 |
| 에이전트 Drag & Drop | ✅ F-03, US-03 |
| 4대 파이프라인 | ✅ F-04, US-04 |
| 크레딧/과금 | ✅ F-05, US-05 |
| 시크릿 볼트 (AES-256) | ✅ F-06, US-06 |
| MCP 연동 | ✅ F-08 |
| 감사 로그 | ✅ F-07 |
| B2B SaaS 피봇 | ✅ US-07, Phase 5 |
| Auto-Healing | ✅ F-04 내 포함 |

---

## 3. 아키텍처 검토 요약

### 구조 평가: A+
- 5계층 레이어 아키텍처 (Client → BFF → Orchestration → Data → External)
- 12개 DB 테이블 완전 DDL + RLS 정책
- 65+ API 엔드포인트 명세 (BFF + FastAPI)
- 4대 LangGraph 워크플로우 그래프 설계
- 보안 아키텍처 6대 영역 커버
- 확장성 전략 (파티셔닝, 큐잉, 워커 스케일링)

### 레이어별 아키텍처 요약

```
L1 Client    → Next.js 14 + React Flow + Tailwind + Framer Motion + Zustand + WebSocket
L2 BFF       → Next.js API Routes (JWT 검증, 프록시, Rate Limit)
L3 Orch      → FastAPI + LangGraph + Celery + Redis (큐/캐시/pub-sub)
L4 Data      → Supabase PostgreSQL(RLS) + ChromaDB(RAG) + Redis
L5 External  → MCP Servers (FireCrawl, PaddleOCR, Google Drive, Figma, Slack, LLM)
```

### DB 스키마 (12 테이블)

| 테이블 | 역할 | RLS |
|---|---|---|
| users | 사용자 (회장 + 향후 B2B) | ✅ |
| workspaces | 법인 워크스페이스 | ✅ owner_id 기반 |
| workspace_members | 멀티테넌트 멤버십 | ✅ workspace_id |
| agents | 에이전트 정의 (100+) | ✅ |
| agent_assignments | 에이전트↔워크스페이스 할당 | ✅ workspace_id |
| pipelines | 파이프라인 템플릿 | ✅ |
| pipeline_executions | 파이프라인 실행 이력 | ✅ workspace_id |
| pipeline_steps | 실행 단계별 상태 | ✅ |
| mcp_connections | MCP 서버 연결 설정 | ✅ workspace_id |
| secret_vault | AES-256-GCM 암호화 볼트 | ✅ workspace_id |
| credits | 크레딧 거래 내역 | ✅ workspace_id |
| audit_logs | 전수 감사 로그 | ✅ workspace_id |

### 4대 LangGraph 파이프라인 설계

| 파이프라인 | 노드 수 | 핵심 로직 |
|---|---|---|
| Grant Factory | 8 | RAG 자격대조 + 다중페르소나 + 회장 승인 게이트 |
| Document Verification | 6 | OCR + 교차검증 + Drive 분류 |
| OSMU Marketing | 7 | Fan-Out/Fan-In 병렬 스크립트 생성 |
| Auto-Healing | 6 | 에러 분류 → 3갈래 자동 복구 → 에스컬레이션 |

---

## 4. 아키텍처 다이어그램 (전체 조감)

```
┌─────────────────────────────────────────────────────────────┐
│                    👑 THE CREATOR (회장)                      │
│                    God Mode Dashboard                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS + WebSocket
                           │ (Cloudflare Tunnel)
┌──────────────────────────▼──────────────────────────────────┐
│  [L1] NEXT.JS 14 + REACT FLOW + TAILWIND + FRAMER MOTION   │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────┐  │
│  │Dashboard │ │Workspaces │ │Agent Pool│ │Pipeline View │  │
│  │(God Mode)│ │(법인 CRUD) │ │(D&D할당) │ │(실시간 모니터)│  │
│  └──────────┘ └───────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────┐  │
│  │Credits   │ │Secret     │ │Audit     │ │Settings      │  │
│  │(과금통제) │ │Vault(볼트)│ │Logs(감사)│ │(시스템설정)   │  │
│  └──────────┘ └───────────┘ └──────────┘ └──────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────────┐
│  [L2] BFF — NEXT.JS API ROUTES                              │
│  Auth | Workspaces | Agents | Pipelines | Vault | Credits   │
│  JWT 검증 + Rate Limit + CORS                               │
└──────────────────────────┬──────────────────────────────────┘
                           │ Internal HTTP (Bearer JWT)
┌──────────────────────────▼──────────────────────────────────┐
│  [L3] ORCHESTRATION — FASTAPI + LANGGRAPH                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ Grant       │ │ Document    │ │ OSMU        │           │
│  │ Factory     │ │ Verify      │ │ Marketing   │           │
│  │ (입찰팩토리) │ │ (서류검증)  │ │ (마케팅스웜) │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│  ┌─────────────┐ ┌─────────────┐                            │
│  │ Auto-Heal   │ │ Celery      │ ◄── Redis (큐/캐시/pub-sub)│
│  │ (자율복구)   │ │ Workers     │                            │
│  └─────────────┘ └─────────────┘                            │
└──────────┬────────────────┬─────────────────────────────────┘
           │                │
┌──────────▼────┐ ┌────────▼──────────────────────────────────┐
│  [L4] DATA    │ │  [L5] EXTERNAL — MCP SERVERS              │
│               │ │                                            │
│ ┌───────────┐ │ │  FireCrawl  → 웹 스크래핑 (입찰 수집)      │
│ │ Supabase  │ │ │  PaddleOCR  → 서류 판독 (OCR)             │
│ │ PostgreSQL│ │ │  Google Drive → 문서 저장/공유             │
│ │ (RLS격리) │ │ │  Figma API  → 비주얼 렌더링               │
│ └───────────┘ │ │  Slack API  → 결재/보고 알림              │
│ ┌───────────┐ │ │  LLM APIs   → 에이전트 추론               │
│ │ ChromaDB  │ │ │                                            │
│ │ (RAG벡터) │ │ │  ┌────────────────────────────┐           │
│ └───────────┘ │ │  │ Auto-Healing:              │           │
│ ┌───────────┐ │ │  │ 장애감지 → 키스위칭 → 프록시 │           │
│ │ Redis     │ │ │  │ → 핫픽스 → 에스컬레이션     │           │
│ │ (큐/캐시) │ │ │  └────────────────────────────┘           │
│ └───────────┘ │ │                                            │
└───────────────┘ └────────────────────────────────────────────┘

═══ 데이터 격리 ═══
[Workspace 1]  [Workspace 2]  [Workspace 3]  ... [Workspace N]
 엉클로지텍      Cube System     marufnb          신규 법인
 (3PL/물류)     (IT/SaaS)      (F&B/제조)        (무한 확장)
  ↕ RLS          ↕ RLS          ↕ RLS            ↕ RLS
 완전 격리       완전 격리       완전 격리         완전 격리
```

---

## 5. 마일스톤 & 다음 단계

### 권장 마일스톤 (15주)

| Phase | 기간 | 범위 |
|---|---|---|
| **Phase 0** | 2주 | 프로젝트 초기화, Supabase, 인증, 기본 레이아웃 |
| **Phase 1** | 3주 | 워크스페이스 CRUD + RLS, 에이전트 풀, God Mode |
| **Phase 2** | 4주 | FastAPI + LangGraph, 4대 파이프라인, MCP 연동 |
| **Phase 3** | 2주 | 크레딧 시스템, 시크릿 볼트, 감사 로그 |
| **Phase 4** | 2주 | 통합 테스트, 성능 최적화, Auto-Healing |
| **Phase 5** | 2주 | 멀티테넌트, B2B 구독 과금, 온보딩 |

### 즉시 다음 단계

1. ~~**Claude 2 경량 태스크 완료 대기**~~ ✅ 완료
2. **TEAM_H 보안 검토** (`/security`) → 볼트 암호화, RLS 침투 테스트, WAF
3. **TEAM_A 티켓 발행** (`/sprint`) → Phase별 에픽 + 스토리 분해
4. **Phase 0 개발 착수** → 프로젝트 초기화, Supabase 셋업, 인증

---

## 6. 핵심 아키텍처 결정 사항 (ADR 요약)

| # | 결정 | 이유 |
|---|---|---|
| ADR-01 | Next.js BFF + FastAPI 분리 | FE는 Vercel 서버리스, BE는 LangGraph/Celery 필요 → 분리가 최적 |
| ADR-02 | Supabase RLS 기반 워크스페이스 격리 | 무한 워크스페이스 생성 시 애플리케이션 레벨 격리보다 DB 레벨이 안전 |
| ADR-03 | LangGraph + Celery 하이브리드 | LangGraph는 그래프 정의, Celery는 장시간 비동기 태스크 처리 |
| ADR-04 | Redis 3역할 (큐+캐시+pub/sub) | 단일 인프라로 태스크큐, 세션캐시, 실시간 상태 전파 통합 |
| ADR-05 | AES-256-GCM 서버사이드 전용 볼트 | 클라이언트 노출 불가, key_version 로테이션으로 키 갱신 안전 |
| ADR-06 | MCP 프로토콜 표준화 | 외부 서비스 장애 격리 + 플러그인 무한 확장 |

---

---

## 7. Claude 2 산출물 검토 결과

### Task 1: UI-PAGES.md
- 9개 페이지 (로그인, God Mode, 워크스페이스, 에이전트, 파이프라인, 크레딧, 볼트, 감사, 설정)
- 각 페이지별 URL, 핵심 컴포넌트, 라이브러리, API 엔드포인트 매핑 완비
- ARCH의 BFF API 명세와 정합성 확인됨

### Task 2: DIR-STRUCTURE.md
- Turborepo 모노레포 채택 (apps/web + apps/api + packages/shared)
- Next.js App Router 라우트 그룹: `(auth)`, `(dashboard)`
- LangGraph 워크플로우, Supabase 마이그레이션, 인프라(Docker/CF) 분리 구조
- PRD Phase 0의 "프로젝트 초기화"를 즉시 실행 가능한 수준

### Task 3: MCP-INTEGRATION.md
- 6개 서비스 상세 매핑 (FireCrawl, PaddleOCR, Google Drive, Figma, Slack, ChromaDB)
- 서비스별 프로토콜, 인증, 주요 API, 폴백 전략 완비
- Circuit Breaker 패턴 공통 에러 처리 원칙 포함
- ARCH의 L5 External Layer 설계와 정합

### Task 4: AGENT-CATALOG.md
- 6 카테고리 / 21개 대표 에이전트 템플릿
- 기획토론(3) + 사업계획서(3) + OSMU(4) + 감사행정(4) + DevOps(3) + 지주회사(4)
- 각 에이전트: 이름, 역할, 입출력, 모델, MCP 의존성 명시
- themasteros.md의 에이전트 스웜 풀(L4) 설계를 구체화

### Task 5: ENV-CONFIG.md
- 9개 카테고리 / 50+ 환경변수
- Supabase, FastAPI, Next.js, LangGraph, 외부API, 보안, ChromaDB, 모니터링, 인프라
- Dev/Staging/Prod 환경별 체크리스트 포함
- Phase 0 셋업 시 즉시 `.env.example` 생성 가능

### Task 6: TECH-DEPS.md
- FE 30+ 패키지 (Next.js 14, React Flow, Framer Motion, Zustand 등)
- BE 30+ 패키지 (FastAPI, LangGraph, Celery, ChromaDB 등)
- 인프라 10+ (Docker, Turborepo, Cloudflare 등)
- 2025~2026 안정 버전 기준, 의존성 관리 원칙 5개 항목

### 정합성 교차 검증

| 검증 항목 | Claude 1 (ARCH) | Claude 2 (산출물) | 정합 |
|---|---|---|---|
| API 엔드포인트 | 65+ 명세 | UI-PAGES에서 참조 | ✅ |
| DB 12 테이블 | DDL + RLS | ENV-CONFIG에서 연결정보 | ✅ |
| 5계층 아키텍처 | L1~L5 정의 | DIR-STRUCTURE로 물리 매핑 | ✅ |
| MCP 6서비스 | ARCH L5 | MCP-INTEGRATION 상세화 | ✅ |
| 에이전트 스웜 | PRD F-03 | AGENT-CATALOG 21개 정의 | ✅ |
| 기술 스택 | PRD 기술 스택 표 | TECH-DEPS 버전 포함 | ✅ |

---

## 8. 최종 설계 산출물 총괄 (8건)

| # | 문서 | 담당 | 경로 |
|---|---|---|---|
| 1 | PRD (기능/비기능/플로우/AC) | Claude 1 | `prd/PRD-MASTEROS-v1.md` |
| 2 | ARCH (아키텍처/ERD/API/LangGraph) | Claude 1 | `architecture/ARCH-MASTEROS-v1.md` |
| 3 | UI 페이지 & 컴포넌트 | Claude 2 | `architecture/UI-PAGES.md` |
| 4 | 디렉토리 구조 | Claude 2 | `architecture/DIR-STRUCTURE.md` |
| 5 | MCP 통합 매핑 | Claude 2 | `architecture/MCP-INTEGRATION.md` |
| 6 | 에이전트 카탈로그 | Claude 2 | `architecture/AGENT-CATALOG.md` |
| 7 | 환경변수 & 설정 | Claude 2 | `architecture/ENV-CONFIG.md` |
| 8 | 기술 스택 의존성 | Claude 2 | `architecture/TECH-DEPS.md` |

**전체 설계 품질: A** — themasteros.md 요구사항 100% 커버, 교차 정합성 확인 완료.

---

*전체 설계 통합 검토 완료 | Claude 1 + Claude 2 | 2026.02.26*
