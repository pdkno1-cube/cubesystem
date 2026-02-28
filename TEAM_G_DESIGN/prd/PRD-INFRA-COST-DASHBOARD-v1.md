# PRD-INFRA-COST-DASHBOARD-v1: 인프라 비용 & 서비스 현황 대시보드

> 팀: TEAM_G (ARCHITECT + PRD_MASTER) | 버전: v1.0 | 날짜: 2026-02-27

---

## 개요

설정 페이지에 "인프라" 탭을 추가하여, The Master OS가 의존하는 모든 외부 서비스의
요금제 · 사용량 · 비용 · 상태를 한 화면에서 파악하고, 스케일업 시점을 사전에 인지할 수 있게 한다.

---

## 배경 & 목적

- 서비스가 성장하면서 어느 티어에서 병목·비용 폭발이 발생할지 선제 파악 필요
- 현재 정보가 각 서비스 콘솔에 분산되어 있어 한눈에 파악 불가
- FIN_OPS (PRIME SQUAD C) 원칙: 클라우드 비용 가시성 확보 → 불필요 지출 차단

---

## 사용자 스토리

- As an Owner, I want to see all infrastructure costs on one screen, so that I can make informed upgrade decisions.
- As an Owner, I want a visual health status for each service, so that I know when a service is approaching its limit.
- As an Owner, I want upgrade path information per service, so that I know exactly what to do before hitting a wall.

---

## 5단계 상태 시스템

| 단계 | 레이블 | 색상 | 조건 (사용량 기준) | 권고 행동 |
|------|--------|------|--------------------|-----------|
| 1 | 안정 (Stable) | green-500 | 0 ~ 50% | 현행 유지 |
| 2 | 양호 (Good) | blue-400 | 51 ~ 70% | 모니터링 강화 |
| 3 | 주의 (Caution) | yellow-500 | 71 ~ 85% | 업그레이드 검토 시작 |
| 4 | 위험 (Warning) | orange-500 | 86 ~ 95% | 즉시 업그레이드 예약 |
| 5 | 폭발직전 (Critical) | red-600 | 96 ~ 100% | 긴급 업그레이드 실행 |

- 퍼센트 계산 불가 서비스(고정 요금)는 상태를 "연결됨 / 미연결"로 단순 표시
- 상태값은 서비스 API 또는 미리 정의된 정적 임계값 기반으로 결정

---

## 기능 요구사항

### 필수 (Must Have)

- [ ] 설정 페이지 Tabs에 "인프라" 탭 추가 (TabsTrigger value="infra")
- [ ] 상단 헤더 카드: 전체 월 예상 비용 합산 + 설명 텍스트
- [ ] 서비스별 카드 목록 (8개 서비스): 각 카드에 아래 정보 포함
  - 서비스명 + 공식 아이콘/로고 텍스트 배지
  - 현재 요금제 (Plan)
  - 핵심 사용량 지표 (최대 2개)
  - 월 비용 (USD / 무료면 "Free" 표시)
  - 5단계 상태 배지
  - 업그레이드 경로 1줄 요약
  - 공식 콘솔 바로가기 링크 (ExternalLink 아이콘)
- [ ] 카드 그리드 레이아웃: 2열 (md 이상) / 1열 (모바일)
- [ ] 전체 새로고침 버튼 (수동 갱신)
- [ ] 정적 데이터 기반 (API 폴링 없음, 설계 단계에서 정적 config 방식 결정)

### 선택 (Nice to Have)

- [ ] 각 카드 "상세 보기" 토글: 추가 한도 항목 표시
- [ ] 총 비용 추이 라인 차트 (월별 히스토리 — Phase 후속 구현)
- [ ] 서비스 상태 자동 갱신 (30분 인터벌 — Phase 후속)

---

## 비기능 요구사항

- 성능: 페이지 초기 로드 < 200ms (정적 데이터이므로 서버 요청 없음)
- 보안: 비용 데이터는 서버사이드 환경변수에서만 제공, 클라이언트 직접 노출 금지
  - BFF API Route `/api/settings/infra-status` 를 통해 마스킹된 데이터만 전달
- 접근성: WCAG 2.1 AA — 상태 색상에 텍스트 레이블 병행 표시 (색맹 대응)
- TypeScript: strict 모드, any 타입 금지

---

## 상단 헤더 설명 텍스트

```
인프라 비용 & 서비스 현황

The Master OS가 현재 사용 중인 모든 외부 서비스의 요금제·사용량·예상 비용을 한눈에 확인합니다.
각 카드의 상태 배지를 통해 업그레이드 시점을 사전에 파악하세요.

이 달 예상 총 비용: $XX.XX / 월
(API 호출량에 따라 실제 비용은 달라질 수 있습니다)
```

---

## 서비스 카드 상세 정의

### 1. Vercel

| 필드 | 값 |
|------|----|
| 현재 요금제 | Hobby (Free) |
| 핵심 지표 1 | 서버리스 함수 실행 시간: 100GB-Hrs / 월 한도 |
| 핵심 지표 2 | Edge 요청 수: 1,000,000회 / 월 한도 |
| 월 비용 | $0 |
| 업그레이드 경로 | Hobby → Pro ($20/월): 팀 협업, 암호화 헤더, 사용량 초과 허용 |
| 다음 티어 한도 | Pro: 1TB 대역폭, 무제한 서버리스 실행 시간 |
| 콘솔 URL | https://vercel.com/dashboard |
| 상태 계산 방식 | 정적 (현재 사용량 미집계, "안정" 고정 표시) |

### 2. Railway

| 필드 | 값 |
|------|----|
| 현재 요금제 | Hobby ($5 크레딧/월 포함) |
| 핵심 지표 1 | vCPU 사용량 (FastAPI 컨테이너) |
| 핵심 지표 2 | 메모리 사용량 (한도: 8GB) |
| 월 비용 | ~$5 (크레딧 소진 후 초과분 과금) |
| 업그레이드 경로 | Hobby → Pro ($20/월): 전용 리소스, 팀 시트, SLA |
| 콘솔 URL | https://railway.com/project/0507726f-c835-4bab-9845-7aec822fc7fb |
| 상태 계산 방식 | `/api/health/fastapi` 헬스체크 응답 기반 |

### 3. Supabase

| 필드 | 값 |
|------|----|
| 현재 요금제 | Free |
| 핵심 지표 1 | DB 크기: 500MB 한도 |
| 핵심 지표 2 | 월간 활성 사용자 (MAU): 50,000 한도 |
| 월 비용 | $0 |
| 업그레이드 경로 | Free → Pro ($25/월): 8GB DB, 무제한 MAU, PITR, 일일 백업 |
| 콘솔 URL | https://supabase.com/dashboard/project/yrsubnienyaygghfvsks |
| 상태 계산 방식 | Supabase Management API (DB 사용량 폴링) — 초기엔 정적 |

### 4. Anthropic Claude API

| 필드 | 값 |
|------|----|
| 현재 요금제 | Pay-as-you-go |
| 핵심 지표 1 | 이번 달 토큰 사용량 (input + output) |
| 핵심 지표 2 | 이번 달 청구 금액 ($) |
| 월 비용 | 변동 (사용량 기반) |
| 업그레이드 경로 | 사용량 증가 시 Tier 상향 (Rate Limit 해제): Tier 1→2→3→4 |
| 티어 한도 | Tier 1: $100/월 한도, Tier 2: $500/월, Tier 3: $1,000/월 |
| 콘솔 URL | https://console.anthropic.com/settings/billing |
| 상태 계산 방식 | 월 한도 대비 현재 청구액 비율 (환경변수로 한도 설정) |

### 5. OpenAI API

| 필드 | 값 |
|------|----|
| 현재 요금제 | Pay-as-you-go (선택적 사용) |
| 핵심 지표 1 | 이번 달 토큰 사용량 |
| 핵심 지표 2 | 이번 달 청구 금액 ($) |
| 월 비용 | 변동 (사용량 기반) / 미사용 시 $0 |
| 업그레이드 경로 | 사용량에 따른 Rate Limit Tier 자동 상향 |
| 콘솔 URL | https://platform.openai.com/usage |
| 상태 계산 방식 | 월 소프트 한도 대비 비율 (미설정 시 "안정" 고정) |

### 6. Resend

| 필드 | 값 |
|------|----|
| 현재 요금제 | Free |
| 핵심 지표 1 | 월간 발송 이메일 수: 3,000통 한도 |
| 핵심 지표 2 | 일간 발송 수: 100통 한도 |
| 월 비용 | $0 |
| 업그레이드 경로 | Free → Pro ($20/월): 50,000통/월, 사용자 정의 도메인 무제한 |
| 콘솔 URL | https://resend.com/overview |
| 상태 계산 방식 | Resend API `/emails` 카운트 (초기엔 정적) |

### 7. Sentry

| 필드 | 값 |
|------|----|
| 현재 요금제 | Developer (Free) |
| 핵심 지표 1 | 월간 에러 이벤트 수: 5,000 한도 |
| 핵심 지표 2 | 월간 성능 트랜잭션: 10,000 한도 |
| 월 비용 | $0 |
| 업그레이드 경로 | Developer → Team ($26/월): 50,000 에러, 무제한 프로젝트, 7일 보존 |
| 콘솔 URL | https://sentry.io/settings/ |
| 상태 계산 방식 | 정적 (Sentry API 통합은 Phase 후속) |

### 8. Google Drive (MCP)

| 필드 | 값 |
|------|----|
| 현재 요금제 | Google One 개인 (15GB Free 또는 구독) |
| 핵심 지표 1 | 저장 용량 사용량 (파이프라인 산출물) |
| 핵심 지표 2 | Drive API 쿼터: 1,000,000,000 쿼리/일 |
| 월 비용 | $0 (무료 15GB 범위 내) |
| 업그레이드 경로 | 15GB 초과 시 Google One 100GB ($2.99/월) |
| 콘솔 URL | https://drive.google.com/settings/storage |
| 상태 계산 방식 | 정적 ("안정" 고정 표시) |

---

## 사용자 플로우

1. 사용자가 설정 페이지 진입
2. "인프라" 탭 클릭
3. 상단 헤더: 총 예상 비용 + 설명 텍스트 확인
4. 서비스 카드 그리드에서 각 서비스 상태 배지 스캔
5. "주의" 이상 서비스 카드에서 업그레이드 경로 확인
6. "콘솔 바로가기" 링크로 해당 서비스 관리 페이지 이동
7. "새로고침" 버튼으로 상태 데이터 수동 갱신

---

## 완료 기준 (Acceptance Criteria)

- [ ] 설정 페이지에 "인프라" 탭이 추가되고, 기존 프로필/보안/시스템 탭이 그대로 동작한다
- [ ] 8개 서비스 카드가 모두 렌더링된다
- [ ] 각 카드에 요금제, 사용량, 비용, 상태 배지, 업그레이드 경로, 콘솔 링크가 표시된다
- [ ] 5단계 상태 배지가 색상 + 텍스트 레이블 모두 표시된다 (색맹 대응)
- [ ] 상단 헤더에 총 예상 비용이 USD 기준으로 표시된다
- [ ] TypeScript strict 모드에서 빌드 오류가 없다
- [ ] ESLint 위반이 없다
- [ ] 모바일(375px)에서 1열, 데스크탑(768px+)에서 2열 레이아웃이 동작한다

---

## 다음 단계

- TEAM_H 보안 검토: BFF API Route 설계의 시크릿 마스킹 검증
- TEAM_A 티켓 발행: `INFRA-01` — 인프라 대시보드 구현
- TEAM_B 구현: settings/page.tsx + 신규 컴포넌트 작성
- MEMORY/MEMORY.md 업데이트 완료
