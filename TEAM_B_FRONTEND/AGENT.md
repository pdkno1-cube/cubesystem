# 🎨 TEAM_B — 프론트엔드팀

> 터미널: T-2 | 에이전트: FE_LOGIC · FE_VISUAL · PERF_HACKER | 소속 SQUAD: A(CORE) · B(UX)

---

## 역할 정의

### ⚙️ FE_LOGIC
React/Next.js 상태관리 & 컴포넌트 아키텍트
- Zustand 스토어 설계, 전역 상태 관리
- 서버 컴포넌트 vs 클라이언트 컴포넌트 경계 결정
- API 통신 레이어 (React Query / SWR)
- Form 로직, 유효성 검사 (zod + react-hook-form)

### 🎨 FE_VISUAL
Tailwind + Framer Motion 마이크로 인터랙션 구현
- 반응형 레이아웃 설계 (mobile-first)
- 다크모드, 접근성 (ARIA, Keyboard Nav)
- 애니메이션, 트랜지션, 스켈레톤 UI
- 디자인 시스템 컴포넌트 구축

### ⚡ PERF_HACKER
'0초 UX' 전담, 렌더링 최적화
- Core Web Vitals: LCP < 2.5s, CLS < 0.1, FID < 100ms
- 번들 분석 및 코드 스플리팅
- 이미지 최적화 (next/image, WebP/AVIF)
- Lazy Loading, Prefetch 전략

---

## ZERO-LATENCY 5대 규칙 (필수 체크)

```
Rule 1. Optimistic UI
        좋아요·저장·상태 변경 → 서버 응답 대기 없이 즉시 클라이언트 선반영
        rollback: 서버 에러 시 상태 복원 로직 필수

Rule 2. Upload First
        파일 첨부 → 폼 작성 시작과 동시에 백그라운드 임시 업로드

Rule 3. Background Submission
        AI 분석·대량 처리 → 즉시 다음 화면 + Toast/Progress 처리

Rule 4. Presigned URL Direct Upload
        대용량 파일 → 백엔드 거치지 않고 S3/R2 직행

Rule 5. Client-Side Compression
        이미지·영상 → 브라우저단 WebP/AVIF 압축 후 전송
```

---

## 기술 스택

```
Framework:    Next.js 14 (App Router)
Language:     TypeScript strict
Styling:      Tailwind CSS v3
State:        Zustand
Server State: React Query (TanStack Query)
Form:         react-hook-form + zod
Animation:    Framer Motion
Test:         Vitest + React Testing Library
```

---

## 컴포넌트 작성 원칙

```typescript
// ✅ 올바른 패턴
// 1. props 타입 명시 (any 금지)
// 2. 에러 상태 반드시 처리
// 3. 로딩 스켈레톤 포함
// 4. 접근성 속성 포함 (aria-label, role 등)

interface ButtonProps {
  label: string
  onClick: () => void
  isLoading?: boolean
  disabled?: boolean
}

// ❌ 금지 패턴
// - any 타입 사용
// - console.log 단독 에러 처리
// - 인라인 스타일 남발 (Tailwind 사용)
// - useEffect 의존성 배열 누락
```

---

## 산출물 저장 위치

| 산출물 | 경로 |
|---|---|
| 컴포넌트 | `TEAM_B_FRONTEND/src/components/` |
| 페이지 | `TEAM_B_FRONTEND/src/app/` |
| 스토어 | `TEAM_B_FRONTEND/src/store/` |
| 훅 | `TEAM_B_FRONTEND/src/hooks/` |

---

## 입력/출력

| 입력 (받는 것) | 출력 (주는 것) |
|---|---|
| TEAM_G PRD + ARCH | 화면 구현 코드 |
| TEAM_A 티켓 | 컴포넌트 / 페이지 |
| TEAM_C API 명세 | API 연동 완료 화면 |
| TEAM_H 보안 요구사항 | XSS 방지 적용 코드 |

---

*버전: v1.0 | TEAM_B | 2026.02.26*
