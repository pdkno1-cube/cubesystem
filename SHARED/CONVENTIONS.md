# 📐 SHARED/CONVENTIONS.md — 코딩 규약

> 모든 팀 필수 준수 | 버전: v1.0 | 2026.02.26

---

## 1. TypeScript

```typescript
// ✅ strict 모드 필수 (tsconfig.json)
// "strict": true, "noImplicitAny": true

// ✅ 타입 정의
interface User {
  id: string
  email: string
  createdAt: Date
}

// ❌ 금지
const data: any = {}           // any 타입 금지
let x                          // 타입 추론 불가한 암묵적 any 금지
```

---

## 2. 네이밍 규칙

| 대상 | 규칙 | 예시 |
|---|---|---|
| 변수 / 함수 | camelCase | `getUserById`, `isLoading` |
| 컴포넌트 | PascalCase | `UserProfile`, `LoginButton` |
| 타입 / 인터페이스 | PascalCase | `UserType`, `ApiResponse` |
| 상수 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 파일 (컴포넌트) | PascalCase | `UserProfile.tsx` |
| 파일 (유틸/훅) | camelCase | `useAuth.ts`, `formatDate.ts` |
| API Route | kebab-case | `/api/user-profile` |
| DB 테이블 | snake_case | `user_profiles` |
| DB 컬럼 | snake_case | `created_at`, `user_id` |
| 환경변수 | UPPER_SNAKE_CASE | `NEXT_PUBLIC_API_URL` |

---

## 3. 에러 처리 표준

```typescript
// ✅ 올바른 패턴 — Sentry 연동 필수
import * as Sentry from '@sentry/nextjs'

try {
  const result = await riskyOperation()
  return result
} catch (error) {
  Sentry.captureException(error, {
    extra: { context: 'getUserById', userId }
  })
  throw new Error('사용자 조회 실패')
}

// ❌ 금지 패턴
try {
  ...
} catch (e) {
  console.log(e)  // console.log 단독 금지
}
```

---

## 4. 컴포넌트 구조

```typescript
// ✅ 컴포넌트 파일 구조 순서
// 1. imports
// 2. 타입 정의
// 3. 컴포넌트 함수
// 4. 내부 헬퍼 함수
// 5. export

'use client' // 클라이언트 컴포넌트만

import { useState } from 'react'
import type { FC } from 'react'

interface Props {
  title: string
  onClose: () => void
}

const Modal: FC<Props> = ({ title, onClose }) => {
  const [isVisible, setIsVisible] = useState(true)

  return (
    <div role="dialog" aria-label={title}>
      {/* 내용 */}
    </div>
  )
}

export default Modal
```

---

## 5. API Route 구조

```typescript
// ✅ API Route 표준 구조
import { NextResponse } from 'next/server'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'

const RequestSchema = z.object({
  email: z.string().email(),
})

export async function POST(req: Request) {
  try {
    // 1. 입력 검증
    const body = RequestSchema.parse(await req.json())

    // 2. 인증 확인
    // 3. 비즈니스 로직
    // 4. 응답

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    Sentry.captureException(error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
```

---

## 6. import 순서

```typescript
// 1. React / Next.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// 2. 외부 라이브러리
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'

// 3. 내부 모듈 (절대경로 @/)
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/Button'

// 4. 타입
import type { User } from '@/types'

// 5. 스타일 (필요 시)
import styles from './Component.module.css'
```

---

## 7. Zustand 스토어 패턴

```typescript
// ✅ 표준 스토어 구조
interface AuthState {
  user: User | null
  isLoading: boolean
  setUser: (user: User | null) => void
  reset: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  setUser: (user) => set({ user }),
  reset: () => set({ user: null, isLoading: false }),
}))
```

---

## 8. 금지 목록

```
❌ any 타입
❌ console.log 단독 에러 처리
❌ 하드코딩된 API 키 / 시크릿
❌ // @ts-ignore (ts-expect-error도 최소화)
❌ useEffect 의존성 배열 빈 채로 방치 (의도적이면 주석 명시)
❌ 인라인 스타일 남발 (Tailwind 사용)
❌ 캐싱 없는 반복 API 호출
❌ RLS 없는 Supabase 테이블
```

---

*버전: v1.0 | 2026.02.26 | 전체 팀 적용*
