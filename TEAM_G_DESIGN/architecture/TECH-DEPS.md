# The Master OS — 기술 스택 의존성 목록

> 2025~2026 기준 최신 안정 버전 기준으로 정리.

---

## 프론트엔드 (package.json)

### Core Framework

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `next` | ^14.2 | React 풀스택 프레임워크 (App Router) |
| `react` | ^18.3 | UI 라이브러리 |
| `react-dom` | ^18.3 | React DOM 렌더러 |
| `typescript` | ^5.5 | 타입 안전 개발 |

### UI & 시각화

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `@xyflow/react` | ^12.4 | 노드 기반 캔버스 (God Mode 조감도, 에이전트 배치, 파이프라인 플로우) |
| `framer-motion` | ^11.15 | 애니메이션/트랜지션 (카드 전환, 드래그, 페이지 전환) |
| `tailwindcss` | ^3.4 | 유틸리티 퍼스트 CSS 프레임워크 |
| `@radix-ui/react-*` | ^1.1 | 접근성 준수 헤드리스 UI 컴포넌트 (모달, 드롭다운, 탭 등) |
| `lucide-react` | ^0.468 | 일관된 아이콘 시스템 (SVG 아이콘 라이브러리) |
| `recharts` | ^2.15 | 차트 라이브러리 (과금 대시보드, 파이프라인 성과) |
| `@dnd-kit/core` | ^6.3 | 드래그 앤 드롭 (에이전트 할당) |
| `clsx` | ^2.1 | 조건부 className 유틸리티 |
| `tailwind-merge` | ^2.6 | Tailwind 클래스 충돌 해소 |

### 상태 관리 & 데이터 페칭

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `zustand` | ^5.0 | 경량 클라이언트 상태 관리 (에이전트 풀, 필터 상태) |
| `@tanstack/react-query` | ^5.62 | 서버 상태 관리 및 캐싱 (API 데이터 동기화) |
| `@tanstack/react-table` | ^8.20 | 고성능 테이블 (감사 로그, 비용 테이블) |

### Supabase & 인증

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `@supabase/supabase-js` | ^2.47 | Supabase 클라이언트 (Auth, DB, Realtime) |
| `@supabase/ssr` | ^0.5 | Next.js SSR용 Supabase 헬퍼 |

### 폼 & 유효성 검증

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `react-hook-form` | ^7.54 | 고성능 폼 라이브러리 |
| `zod` | ^3.24 | 스키마 기반 유효성 검증 (폼 + API 응답) |
| `@hookform/resolvers` | ^3.9 | react-hook-form + zod 브릿지 |

### 날짜 & 유틸리티

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `date-fns` | ^4.1 | 날짜 포맷/계산 (감사 로그, 과금 기간 필터) |

### 모니터링 & 분석

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `@sentry/nextjs` | ^8.45 | 에러 추적 및 성능 모니터링 |
| `mixpanel-browser` | ^2.55 | 사용자 행동 분석 |

### DevDependencies

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `eslint` | ^9.16 | 코드 린트 |
| `eslint-config-next` | ^14.2 | Next.js ESLint 설정 |
| `prettier` | ^3.4 | 코드 포맷터 |
| `@types/react` | ^18.3 | React 타입 정의 |
| `@types/node` | ^22.10 | Node.js 타입 정의 |
| `vitest` | ^2.1 | 단위 테스트 프레임워크 |
| `@testing-library/react` | ^16.1 | React 컴포넌트 테스트 유틸 |
| `autoprefixer` | ^10.4 | CSS 벤더 프리픽스 |
| `postcss` | ^8.4 | CSS 후처리 |

---

## 백엔드 (requirements.txt)

### Core Framework

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `fastapi` | >=0.115 | 고성능 비동기 REST API 프레임워크 |
| `uvicorn[standard]` | >=0.34 | ASGI 서버 (FastAPI 실행) |
| `pydantic` | >=2.10 | 데이터 유효성 검증 및 직렬화 |
| `pydantic-settings` | >=2.7 | 환경변수 기반 설정 관리 |

### AI & 에이전트 오케스트레이션

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `langgraph` | >=0.2 | 에이전트 스웜 워크플로우 그래프 엔진 |
| `langchain` | >=0.3 | LLM 체인, 프롬프트 관리, 도구 바인딩 |
| `langchain-anthropic` | >=0.3 | Claude 모델 연동 |
| `langchain-openai` | >=0.3 | OpenAI 모델 연동 (폴백용) |

### 데이터베이스 & 벡터DB

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `supabase` | >=2.11 | Supabase Python 클라이언트 (Auth, DB, Storage) |
| `chromadb` | >=0.5 | 벡터DB 클라이언트 (RAG용 임베딩 저장/검색) |

### 보안

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `python-jose[cryptography]` | >=3.3 | JWT 토큰 생성/검증 |
| `cryptography` | >=44.0 | AES-256 암복호화 (Vault 시크릿) |
| `passlib[bcrypt]` | >=1.7 | 비밀번호 해싱 |
| `pyotp` | >=2.9 | TOTP MFA 생성/검증 |

### HTTP & 네트워크

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `httpx` | >=0.28 | 비동기 HTTP 클라이언트 (외부 API 호출) |
| `tenacity` | >=9.0 | 재시도 로직 (exponential backoff) |
| `websockets` | >=14.1 | WebSocket 지원 (실시간 파이프라인 로그) |

### MCP 서비스 클라이언트

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `firecrawl-py` | >=1.6 | FireCrawl 공식 Python SDK |
| `paddleocr` | >=2.9 | PaddleOCR 추론 엔진 |
| `google-api-python-client` | >=2.157 | Google Drive API 클라이언트 |
| `google-auth` | >=2.37 | Google OAuth 인증 |
| `slack-sdk` | >=3.34 | Slack API 공식 SDK |

### 모니터링

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `sentry-sdk[fastapi]` | >=2.19 | 에러 추적 및 성능 모니터링 (FastAPI 통합) |

### DevDependencies

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `pytest` | >=8.3 | 테스트 프레임워크 |
| `pytest-asyncio` | >=0.24 | 비동기 테스트 지원 |
| `pytest-cov` | >=6.0 | 테스트 커버리지 |
| `ruff` | >=0.8 | 초고속 Python 린터/포맷터 |
| `mypy` | >=1.13 | 정적 타입 체커 |
| `pre-commit` | >=4.0 | Git 훅 기반 코드 검사 |

---

## 인프라 & 도구

### 데이터베이스 & 스토리지

| 도구 | 버전 | 용도 |
|------|------|------|
| Supabase CLI | >=1.220 | 로컬 Supabase 개발 환경 (PostgreSQL + Auth + Storage) |
| PostgreSQL | 15+ | 메인 데이터베이스 (Supabase 내장) |
| ChromaDB Server | >=0.5 | 벡터DB 서버 (RAG 검색) |

### 빌드 & 모노레포

| 도구 | 버전 | 용도 |
|------|------|------|
| pnpm | >=9.14 | 빠른 패키지 매니저 (모노레포 워크스페이스) |
| Turborepo | >=2.3 | 모노레포 빌드 파이프라인 오케스트레이션 |
| Docker | >=27.0 | 컨테이너 기반 로컬 개발/배포 |
| Docker Compose | >=2.31 | 멀티 서비스 로컬 환경 구성 |

### CI/CD & 배포

| 도구 | 버전 | 용도 |
|------|------|------|
| GitHub Actions | — | CI/CD 파이프라인 (린트, 테스트, 빌드, 배포) |
| Vercel | — | Next.js 프론트엔드 배포 |
| Cloudflare Tunnels | — | 로컬 서버 → 외부 안전 접속 (FastAPI 노출) |

### 개발 도구

| 도구 | 버전 | 용도 |
|------|------|------|
| Node.js | >=20 LTS | JavaScript 런타임 |
| Python | >=3.12 | 백엔드 런타임 |
| uv | >=0.5 | 빠른 Python 패키지 매니저 |

---

## 의존성 관리 원칙

1. **버전 고정**: production 배포 시 lockfile (pnpm-lock.yaml, uv.lock) 활용
2. **보안 스캔**: `pnpm audit` / `pip-audit`로 주기적 취약점 검사
3. **업데이트 주기**: 매월 1회 의존성 업데이트 검토 (Renovate/Dependabot)
4. **최소 의존성**: 동일 기능 수행 패키지 중복 설치 금지
5. **번들 크기**: 프론트엔드 tree-shaking 가능 패키지 우선 선택
