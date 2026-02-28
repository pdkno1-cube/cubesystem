# ARCH-INFRA-COST-DASHBOARD-v1: 인프라 비용 대시보드 아키텍처

> 팀: TEAM_G (ARCHITECT) | 버전: v1.0 | 날짜: 2026-02-27

---

## 시스템 구성도

```
설정 페이지 (settings/page.tsx)
  └── Tabs ["profile", "security", "system", "infra"] ← 새 탭 추가
        └── TabsContent value="infra"
              └── InfraSection (새 컴포넌트)
                    ├── InfraHeader (총 비용 헤더)
                    └── InfraServiceGrid
                          └── ServiceCard × 8
                                ├── StatusBadge (5단계)
                                ├── UsageMeter (사용량 바)
                                └── UpgradePath (업그레이드 안내)

데이터 흐름:
Client (InfraSection)
  → fetch("/api/settings/infra-status")     [BFF API Route]
    → 정적 config + 환경변수 마스킹 처리
    → JSON 응답 반환
  → Zustand 없음 (useState로 충분, 단순 읽기 전용)
```

---

## 컴포넌트 파일 목록

```
apps/web/src/
├── app/
│   ├── (dashboard)/settings/page.tsx          [기존 수정] — "인프라" 탭 추가
│   └── api/settings/infra-status/route.ts     [신규] — BFF API
│
└── components/
    └── settings/
        ├── InfraSection.tsx                   [신규] — 인프라 탭 메인
        ├── InfraHeader.tsx                    [신규] — 총 비용 헤더 카드
        ├── ServiceCard.tsx                    [신규] — 개별 서비스 카드
        ├── StatusBadge.tsx                    [신규] — 5단계 상태 배지
        ├── UsageMeter.tsx                     [신규] — 사용량 Progress Bar
        └── infra-service-config.ts            [신규] — 서비스 정적 설정
```

---

## 타입 정의

```typescript
// types/infra.ts 또는 infra-service-config.ts 내부

export type ServiceStatus =
  | "stable"    // 안정   0~50%   green-500
  | "good"      // 양호   51~70%  blue-400
  | "caution"   // 주의   71~85%  yellow-500
  | "warning"   // 위험   86~95%  orange-500
  | "critical"; // 폭발직전 96~100% red-600

export interface UsageMetric {
  label: string;        // "DB 크기"
  current: number;      // 실제 사용량 (숫자)
  limit: number;        // 한도
  unit: string;         // "MB", "통", "회", "$"
  usagePercent: number; // 0~100 (current/limit * 100)
}

export interface UpgradePath {
  nextPlan: string;          // "Pro"
  nextPlanCost: string;      // "$25/월"
  keyBenefit: string;        // "8GB DB, 일일 백업, PITR"
  consoleUrl: string;        // "https://..."
}

export interface ServiceData {
  id: string;                // "supabase"
  name: string;              // "Supabase"
  category: "hosting" | "database" | "ai" | "email" | "monitoring" | "storage";
  currentPlan: string;       // "Free"
  monthlyCostUsd: number;    // 0 | 5 | 25 ...
  costLabel: string;         // "Free" | "$5/월" | "변동"
  status: ServiceStatus;
  metrics: UsageMetric[];    // 최대 2개
  upgrade: UpgradePath;
  isVariableCost: boolean;   // true면 비용이 사용량 기반
}

export interface InfraStatusResponse {
  services: ServiceData[];
  totalEstimatedUsd: number;
  generatedAt: string;       // ISO timestamp
}
```

---

## API 엔드포인트

| Method | Path | 설명 | Auth |
|--------|------|------|------|
| GET | /api/settings/infra-status | 전체 서비스 현황 + 비용 반환 | 필요 (세션 쿠키) |

### 응답 예시

```json
{
  "services": [
    {
      "id": "vercel",
      "name": "Vercel",
      "category": "hosting",
      "currentPlan": "Hobby",
      "monthlyCostUsd": 0,
      "costLabel": "Free",
      "status": "stable",
      "metrics": [
        {
          "label": "서버리스 실행 시간",
          "current": 12,
          "limit": 100,
          "unit": "GB-Hrs",
          "usagePercent": 12
        }
      ],
      "upgrade": {
        "nextPlan": "Pro",
        "nextPlanCost": "$20/월",
        "keyBenefit": "팀 협업, 사용량 초과 허용, 암호화 헤더",
        "consoleUrl": "https://vercel.com/dashboard"
      },
      "isVariableCost": false
    }
  ],
  "totalEstimatedUsd": 5,
  "generatedAt": "2026-02-27T00:00:00.000Z"
}
```

---

## BFF API Route 구현 전략

```typescript
// /api/settings/infra-status/route.ts

// 1. 세션 검증 (supabase auth)
// 2. 정적 serviceConfig 배열에서 기본 데이터 로드
// 3. 환경변수에서 변동 비용 읽기 (서버사이드 only):
//    - ANTHROPIC_MONTHLY_BUDGET_USD (기본값 50)
//    - OPENAI_MONTHLY_BUDGET_USD (기본값 20)
//    - RAILWAY_CURRENT_USAGE_USD (기본값 5)
// 4. 상태 계산: usagePercent → ServiceStatus 매핑
// 5. 총 비용 합산 후 반환
// 6. 외부 API 호출 없음 (초기 버전) → 순수 정적 + 환경변수

// 캐시 전략: no-store (수동 새로고침 기준)
```

---

## 상태 계산 로직

```typescript
function calcStatus(usagePercent: number): ServiceStatus {
  if (usagePercent <= 50) return "stable";
  if (usagePercent <= 70) return "good";
  if (usagePercent <= 85) return "caution";
  if (usagePercent <= 95) return "warning";
  return "critical";
}

// 상태 → UI 매핑
const STATUS_UI: Record<ServiceStatus, { label: string; color: string; bg: string }> = {
  stable:   { label: "안정",     color: "text-green-700",  bg: "bg-green-100" },
  good:     { label: "양호",     color: "text-blue-700",   bg: "bg-blue-100"  },
  caution:  { label: "주의",     color: "text-yellow-700", bg: "bg-yellow-100"},
  warning:  { label: "위험",     color: "text-orange-700", bg: "bg-orange-100"},
  critical: { label: "폭발직전", color: "text-red-700",    bg: "bg-red-100"   },
};
```

---

## 데이터 흐름 (상세)

```
1. InfraSection 마운트
   └── useEffect → fetch("/api/settings/infra-status")

2. BFF API Route
   └── getServerSession() 검증
   └── buildServiceData() — 정적 config 병합
   └── calcStatus() 각 서비스에 적용
   └── sumTotalCost() 합산
   └── NextResponse.json(InfraStatusResponse)

3. InfraSection
   └── useState<InfraStatusResponse | null>
   └── isLoading → skeleton 표시
   └── error → Sentry.captureException + 에러 UI
   └── 성공 → InfraHeader + InfraServiceGrid 렌더링

4. ServiceCard
   └── props: ServiceData
   └── StatusBadge(status) — 색상 + 텍스트
   └── UsageMeter(metrics[0]) — Progress bar
   └── UpgradePath 섹션
   └── ExternalLink → 콘솔 URL
```

---

## 설정 페이지 수정 범위 (settings/page.tsx)

```tsx
// 추가할 import
import { Server } from "lucide-react";
import { InfraSection } from "@/components/settings/InfraSection";

// TabsList에 추가
<TabsTrigger value="infra" className="flex items-center gap-2">
  <Server className="h-4 w-4" />
  인프라
</TabsTrigger>

// TabsContent 추가
<TabsContent value="infra">
  <InfraSection />
</TabsContent>
```

---

## 보안 고려사항

| 항목 | 처리 방식 |
|------|-----------|
| API 키 / 시크릿 | 절대 클라이언트 응답에 포함 금지 |
| 월 예산 한도 | 서버사이드 환경변수 (`ANTHROPIC_MONTHLY_BUDGET_USD`) |
| Railway 프로젝트 ID | BFF 내부에서만 사용, 응답에 미포함 |
| Supabase Ref | 공개 도메인 URL만 표시, ref 값 마스킹 |
| 인증 | `/api/settings/infra-status` — 세션 미존재 시 401 반환 |

---

## 확장성 고려사항

| 시나리오 | 대응 방안 |
|---------|-----------|
| 서비스 추가 | `infra-service-config.ts`에 배열 항목 추가만으로 완료 |
| 실시간 사용량 | 각 서비스 API 연동 레이어를 BFF에 추가 (초기엔 정적) |
| 알림 기능 | "위험" 이상 서비스 감지 → Resend 이메일 알림 훅 추가 |
| 비용 히스토리 | `infra_cost_snapshots` 테이블 신설 + 라인 차트 추가 |
| 다국통화 | USD 고정 → KRW 환율 변환 레이어 추가 |

---

## 환경변수 추가 목록

```bash
# .env.local (서버사이드 only)
ANTHROPIC_MONTHLY_BUDGET_USD=50      # Claude API 월 소프트 한도
OPENAI_MONTHLY_BUDGET_USD=20         # OpenAI API 월 소프트 한도
RAILWAY_CURRENT_USAGE_USD=5          # Railway 현재 월 예상 사용량
```

---

## 구현 우선순위

```
Phase 1 (이번 세션 구현 범위):
  1. infra-service-config.ts — 정적 config 정의
  2. /api/settings/infra-status/route.ts — BFF
  3. StatusBadge.tsx + UsageMeter.tsx — 공통 컴포넌트
  4. ServiceCard.tsx — 서비스 카드
  5. InfraHeader.tsx — 헤더 카드
  6. InfraSection.tsx — 통합 섹션
  7. settings/page.tsx — 탭 추가

Phase 2 (후속):
  - Supabase Management API 연동 (실제 DB 크기)
  - Resend API 연동 (실제 발송 수)
  - Sentry API 연동 (실제 이벤트 수)
  - 비용 히스토리 DB 저장 + 라인 차트
```
