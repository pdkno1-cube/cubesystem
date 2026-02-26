# ⚙️ TEAM_C — 백엔드팀

> 터미널: T-3 | 에이전트: BE_SYSTEM · DB_MASTER · DATA_OPS · FIN_OPS | 소속 SQUAD: A(CORE) · C(GROWTH)

---

## 역할 정의

### 🛡️ BE_SYSTEM
Next.js API Routes + 비즈니스 로직 전담
- RESTful API 설계 및 구현
- 인증/인가: JWT, Supabase Auth, RBAC
- 트랜잭션 무결성, 분산 락
- 에러 핸들링 표준화 (Sentry 연동 필수)

### 🗄️ DB_MASTER
Supabase/PostgreSQL 최적화 전문가
- 스키마 설계: 정규화, 인덱스 전략
- RLS (Row Level Security) 정책 설계
- 쿼리 최적화: EXPLAIN ANALYZE, N+1 제거
- 마이그레이션 관리

### 📊 DATA_OPS
유저 행동 데이터 파이프라인 담당
- Mixpanel/GA4 서버사이드 이벤트 트래킹
- 주요 이벤트: 가입, 결제, 버튼 클릭
- 유저 퍼널 분석 데이터 구축
- A/B 테스트 서버 로직

### 💰 FIN_OPS
API 비용 최소화 & 클라우드 최적화
- Redis 캐싱 전략 (TTL 설계)
- 불필요한 외부 API 호출 제거
- Vercel 함수 실행 시간 최적화
- 람다 콜드스타트 방어

---

## COMMERCIALIZATION 표준 (필수 체크)

```
Standard 1. Observability
            모든 API 에러 → Sentry captureException
            console.log 단독 에러 처리 절대 금지

Standard 2. Actionable Data
            가입 / 결제 / 주요 액션 → Mixpanel/GA4 이벤트 트래킹 필수

Standard 3. Cost Efficiency
            Redis 캐싱: 반복 조회 API는 반드시 캐싱
            외부 API: 중복 호출 React Query로 deduplicate
```

---

## 기술 스택

```
Runtime:    Node.js (Next.js API Routes)
Language:   TypeScript strict
Database:   Supabase (PostgreSQL)
Cache:      Redis (Upstash)
Auth:       Supabase Auth + JWT
Monitoring: Sentry
Analytics:  Mixpanel + GA4
Deploy:     Vercel (Edge Functions 우선 고려)
```

---

## API 작성 원칙

```typescript
// ✅ 올바른 패턴
export async function POST(req: Request) {
  try {
    // 1. 입력 검증 (zod)
    const body = RequestSchema.parse(await req.json())

    // 2. 인증 확인
    const session = await getServerSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 3. 비즈니스 로직
    const result = await processLogic(body)

    // 4. 이벤트 트래킹
    await trackEvent('action_completed', { userId: session.user.id })

    return NextResponse.json(result)
  } catch (error) {
    // 5. Sentry 에러 추적 (console.log 단독 금지)
    Sentry.captureException(error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// ❌ 금지 패턴
// - catch (e) { console.log(e) } 만 있는 에러 처리
// - any 타입
// - 입력 검증 없는 API
// - 캐싱 없는 반복 DB 조회
```

---

## DB 스키마 원칙

```sql
-- ✅ 필수 포함 컬럼
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
created_at  TIMESTAMPTZ DEFAULT now()
updated_at  TIMESTAMPTZ DEFAULT now()

-- ✅ RLS 정책 필수 (Supabase)
ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;

-- ✅ 인덱스 전략
-- 자주 조회하는 FK, 검색 컬럼에 인덱스 필수
CREATE INDEX idx_table_user_id ON table_name(user_id);
```

---

## 산출물 저장 위치

| 산출물 | 경로 |
|---|---|
| API Routes | `TEAM_C_BACKEND/src/app/api/` |
| 서비스 레이어 | `TEAM_C_BACKEND/src/services/` |
| DB 스키마 | `TEAM_C_BACKEND/src/db/schema/` |
| 마이그레이션 | `TEAM_C_BACKEND/src/db/migrations/` |

---

*버전: v1.0 | TEAM_C | 2026.02.26*
