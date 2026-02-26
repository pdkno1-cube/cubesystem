# 🛠️ SHARED/STACK.md — 기술 스택 레퍼런스

> 전체 팀 공통 참조 | 버전: v1.0 | 2026.02.26

---

## 전체 스택 한눈에 보기

```
Frontend    Next.js 14 (App Router) + TypeScript + Tailwind CSS
State       Zustand (클라이언트) + React Query (서버 상태)
Backend     Next.js API Routes + Supabase
Database    PostgreSQL (Supabase) + Redis (Upstash)
Auth        Supabase Auth
Deploy      Vercel (Frontend + API) + Cloudflare (CDN/DNS)
Monitor     Sentry (에러) + GA4 + Mixpanel (분석)
Test        Vitest + React Testing Library
```

---

## Frontend

| 항목 | 기술 | 버전 | 비고 |
|---|---|---|---|
| Framework | Next.js | 14.x | App Router 사용 |
| Language | TypeScript | 5.x | strict 모드 필수 |
| Styling | Tailwind CSS | 3.x | 인라인 스타일 금지 |
| UI Components | shadcn/ui | latest | Radix UI 기반 |
| State (전역) | Zustand | 4.x | - |
| State (서버) | TanStack Query | 5.x | React Query |
| Form | react-hook-form | 7.x | zod 연동 |
| Validation | zod | 3.x | API + Form 공통 |
| Animation | Framer Motion | 11.x | 필요 시만 사용 |
| Icons | lucide-react | latest | - |

---

## Backend

| 항목 | 기술 | 버전 | 비고 |
|---|---|---|---|
| Runtime | Node.js | 20.x LTS | - |
| API | Next.js API Routes | 14.x | Edge Runtime 우선 고려 |
| Database | Supabase (PostgreSQL) | latest | RLS 필수 |
| Cache | Upstash Redis | latest | REST API 방식 |
| Auth | Supabase Auth | latest | JWT + RLS |
| File Storage | Supabase Storage | latest | Presigned URL 사용 |
| ORM | Supabase JS Client | 2.x | 직접 SQL 최소화 |
| Email | Resend | latest | - |

---

## 인프라 & 배포

| 항목 | 기술 | 비고 |
|---|---|---|
| Hosting | Vercel | 자동 배포 (main 브랜치) |
| CDN / DNS | Cloudflare | 전 세계 엣지 캐싱 |
| 환경변수 | Vercel Environment Variables | .env.local (로컬), Vercel (프로덕션) |
| 도메인 | Cloudflare DNS | - |

---

## 모니터링 & 분석

| 항목 | 기술 | 용도 |
|---|---|---|
| 에러 추적 | Sentry | 모든 에러 캡처 필수 |
| 웹 분석 | GA4 | 페이지뷰, 이벤트 |
| 제품 분석 | Mixpanel | 유저 행동 퍼널 |
| Uptime | UptimeRobot (권장) | 외부 모니터링 |

---

## 테스트

| 항목 | 기술 | 비고 |
|---|---|---|
| 단위 테스트 | Vitest | Jest 호환 API |
| 컴포넌트 테스트 | React Testing Library | - |
| E2E | Playwright | 핵심 플로우만 |
| 커버리지 목표 | 80% 이상 | - |

---

## 개발 도구

| 항목 | 기술 | 비고 |
|---|---|---|
| 패키지 매니저 | npm | package-lock.json 커밋 |
| Linter | ESLint | Next.js 기본 설정 + custom |
| Formatter | Prettier | .prettierrc 설정 |
| Git Hook | husky | pre-commit lint + type-check |
| CI/CD | GitHub Actions | push 시 자동 실행 |

---

## 환경변수 목록

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # 서버 전용 (NEXT_PUBLIC_ 붙이지 말 것)

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=                # 서버 전용

# Analytics
NEXT_PUBLIC_GA4_MEASUREMENT_ID=
MIXPANEL_TOKEN=

# Email (Resend)
RESEND_API_KEY=                   # 서버 전용

# App
NEXT_PUBLIC_APP_URL=              # https://your-domain.com
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` 등 서버 전용 키는
> 절대 `NEXT_PUBLIC_` 접두사 사용 금지 (클라이언트 노출 방지)

---

## 버전 고정 정책

```
Node.js: .nvmrc 파일로 버전 고정
패키지: package.json에 정확한 버전 명시 (^, ~ 최소화)
Vercel: Node.js 20.x 설정 (vercel.json 또는 대시보드)
```

---

*버전: v1.0 | 2026.02.26 | 스택 변경 시 이 파일 업데이트 필수*
