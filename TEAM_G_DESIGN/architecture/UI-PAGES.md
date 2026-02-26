# The Master OS — UI 페이지 구조 & 컴포넌트 인벤토리

## 페이지 총괄 맵

| # | 페이지명 | URL 경로 | 설명 |
|---|---------|----------|------|
| 1 | 로그인 / 인증 | `/login` | 회장 단일 사용자 인증 |
| 2 | God Mode 대시보드 | `/dashboard` | 전체 법인 현황 조감도 |
| 3 | 법인 워크스페이스 관리 | `/workspaces`, `/workspaces/:id` | 법인 CRUD 및 상세 뷰 |
| 4 | 에이전트 풀 관리 | `/agents` | 에이전트 대기열 및 Drag & Drop 할당 |
| 5 | 파이프라인 모니터 | `/pipelines` | 4대 핵심 파이프라인 실행 현황 |
| 6 | 크레딧/과금 대시보드 | `/billing` | 토큰 소모량 및 비용 차트 |
| 7 | 시크릿 볼트 관리 | `/vault` | API 키, 자격증명 관리 |
| 8 | 감사 로그 | `/audit-logs` | 전체 시스템 액션 로그 |
| 9 | 설정 | `/settings` | 시스템 전역 설정 |

---

## 1. 로그인 / 인증

**URL**: `/login`

### 핵심 컴포넌트
| 컴포넌트 | 설명 |
|----------|------|
| `LoginForm` | 이메일/비밀번호 입력 폼 |
| `MFAVerification` | TOTP 2단계 인증 입력 |
| `SessionGuard` | 인증 상태 체크 래퍼 (비인증 시 리다이렉트) |

### 사용 라이브러리
- `@supabase/supabase-js` — Supabase Auth
- `framer-motion` — 로그인 전환 애니메이션

### API 엔드포인트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/auth/login` | 로그인 요청 |
| POST | `/api/auth/mfa/verify` | MFA 검증 |
| POST | `/api/auth/logout` | 세션 종료 |

---

## 2. God Mode 대시보드

**URL**: `/dashboard`

### 핵심 컴포넌트
| 컴포넌트 | 설명 |
|----------|------|
| `GodModeCanvas` | React Flow 기반 전체 법인 조감도 캔버스 |
| `WorkspaceCard` | 법인별 요약 카드 (매출, 에이전트 수, 파이프라인 상태) |
| `SystemHealthBar` | 시스템 전체 헬스 상태 바 |
| `QuickActionPanel` | 빠른 작업 패널 (법인 생성, 에이전트 할당 등) |
| `GlobalKPIStrip` | 상단 KPI 스트립 (총 매출, 에이전트 가동률, 크레딧 잔여) |
| `AlertFeed` | 실시간 알림 피드 (Slack 연동) |

### 사용 라이브러리
- `@xyflow/react` (React Flow) — 법인 노드 조감도 렌더링, 줌인/아웃
- `framer-motion` — 카드 전환 애니메이션
- `@tanstack/react-query` — 서버 상태 캐싱
- `zustand` — 대시보드 필터/뷰 상태

### API 엔드포인트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/dashboard/overview` | 전체 법인 요약 데이터 |
| GET | `/api/dashboard/kpi` | 글로벌 KPI 수치 |
| GET | `/api/dashboard/alerts` | 실시간 알림 목록 |

---

## 3. 법인 워크스페이스 관리

**URL**: `/workspaces` (목록), `/workspaces/:id` (상세)

### 핵심 컴포넌트
| 컴포넌트 | 설명 |
|----------|------|
| `WorkspaceList` | 법인 목록 (카드/테이블 토글 뷰) |
| `WorkspaceCreateModal` | 신규 법인 생성 모달 (이름, 업종, 초기 설정) |
| `WorkspaceDetail` | 법인 상세 뷰 레이아웃 |
| `AssignedAgentGrid` | 해당 법인에 할당된 에이전트 그리드 |
| `PipelineStatusPanel` | 법인 내 파이프라인 가동 현황 |
| `WorkspaceSettings` | 법인별 설정 (RLS 정책, 데이터 격리 확인) |

### 사용 라이브러리
- `@xyflow/react` — 법인 내부 에이전트 배치도
- `framer-motion` — 모달/카드 전환
- `@radix-ui` — 모달, 드롭다운, 탭 UI

### API 엔드포인트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/workspaces` | 법인 목록 조회 |
| POST | `/api/workspaces` | 신규 법인 생성 |
| GET | `/api/workspaces/:id` | 법인 상세 조회 |
| PUT | `/api/workspaces/:id` | 법인 정보 수정 |
| DELETE | `/api/workspaces/:id` | 법인 삭제 |
| GET | `/api/workspaces/:id/agents` | 법인별 할당 에이전트 조회 |

---

## 4. 에이전트 풀 관리

**URL**: `/agents`

### 핵심 컴포넌트
| 컴포넌트 | 설명 |
|----------|------|
| `AgentPoolSidebar` | 대기열 에이전트 목록 (카테고리별 필터) |
| `AgentCard` | 에이전트 카드 (이름, 역할, 상태, 사용 모델) |
| `DragDropCanvas` | Drag & Drop 할당 캔버스 (에이전트 → 법인 구역) |
| `AgentDetailDrawer` | 에이전트 상세 정보 드로어 |
| `SwarmConfigPanel` | 스웜 구성 패널 (에이전트 그룹 편성) |
| `AgentStatusBadge` | 에이전트 상태 배지 (idle/active/error) |

### 사용 라이브러리
- `@xyflow/react` — Drag & Drop 캔버스, 에이전트-법인 연결선
- `framer-motion` — 드래그 애니메이션
- `@dnd-kit/core` — 드래그 앤 드롭 기능
- `zustand` — 에이전트 할당 상태 관리

### API 엔드포인트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/agents` | 전체 에이전트 목록 |
| GET | `/api/agents/:id` | 에이전트 상세 |
| POST | `/api/agents/:id/assign` | 에이전트를 법인에 할당 |
| POST | `/api/agents/:id/unassign` | 에이전트 할당 해제 |
| GET | `/api/agents/pool` | 대기열 에이전트 조회 |
| PUT | `/api/agents/:id/config` | 에이전트 설정 변경 |

---

## 5. 파이프라인 모니터

**URL**: `/pipelines`

### 핵심 컴포넌트
| 컴포넌트 | 설명 |
|----------|------|
| `PipelineOverview` | 4대 핵심 파이프라인 카드 뷰 |
| `GrantFactoryMonitor` | 정부지원사업/조달 입찰 팩토리 현황 |
| `DocumentVerifyMonitor` | 행정/B2B 서류 검증 파이프라인 현황 |
| `OSMUMarketingMonitor` | OSMU 마케팅 스웜 현황 |
| `AutoHealingMonitor` | AI 119 자율 유지보수 현황 |
| `PipelineStepTimeline` | 파이프라인 단계별 타임라인 (진행률 바) |
| `ExecutionLogPanel` | 실행 로그 패널 (스트리밍) |

### 사용 라이브러리
- `@xyflow/react` — 파이프라인 플로우 다이어그램
- `framer-motion` — 진행률 애니메이션
- `recharts` — 파이프라인 성과 차트

### API 엔드포인트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/pipelines` | 전체 파이프라인 상태 |
| GET | `/api/pipelines/:type` | 특정 파이프라인 상세 (grant/document/osmu/healing) |
| GET | `/api/pipelines/:type/logs` | 파이프라인 실행 로그 |
| POST | `/api/pipelines/:type/trigger` | 파이프라인 수동 실행 |
| POST | `/api/pipelines/:type/stop` | 파이프라인 중단 |

---

## 6. 크레딧/과금 대시보드

**URL**: `/billing`

### 핵심 컴포넌트
| 컴포넌트 | 설명 |
|----------|------|
| `CreditOverview` | 마스터 크레딧 잔액 및 소모 추이 |
| `TokenUsageChart` | 모델별/법인별 토큰 사용량 차트 |
| `CostBreakdownTable` | 비용 항목 상세 테이블 |
| `BillingAlertConfig` | 과금 알림 임계값 설정 |
| `UsageHeatmap` | 시간대별 사용량 히트맵 |

### 사용 라이브러리
- `recharts` — 차트, 히트맵
- `@tanstack/react-table` — 비용 테이블
- `date-fns` — 날짜 범위 처리

### API 엔드포인트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/billing/overview` | 크레딧 요약 |
| GET | `/api/billing/usage` | 토큰 사용량 (기간, 법인, 모델 필터) |
| GET | `/api/billing/cost-breakdown` | 비용 상세 |
| PUT | `/api/billing/alerts` | 알림 임계값 설정 |

---

## 7. 시크릿 볼트 관리

**URL**: `/vault`

### 핵심 컴포넌트
| 컴포넌트 | 설명 |
|----------|------|
| `VaultKeyList` | 등록된 시크릿 키 목록 (마스킹 표시) |
| `SecretCreateForm` | 새 시크릿 등록 폼 (이름, 값, 만료일) |
| `KeyRotationSchedule` | API 키 로테이션 스케줄 뷰 |
| `VaultAccessLog` | 시크릿 접근 이력 로그 |
| `EncryptionStatusBadge` | AES-256 암호화 상태 표시 |

### 사용 라이브러리
- `@radix-ui` — 모달, 토글, 폼 컴포넌트
- `lucide-react` — 아이콘 (자물쇠, 키 등)

### API 엔드포인트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/vault/secrets` | 시크릿 목록 (값 마스킹) |
| POST | `/api/vault/secrets` | 시크릿 등록 |
| PUT | `/api/vault/secrets/:id` | 시크릿 수정 |
| DELETE | `/api/vault/secrets/:id` | 시크릿 삭제 |
| POST | `/api/vault/secrets/:id/rotate` | 키 로테이션 실행 |
| GET | `/api/vault/access-log` | 접근 이력 조회 |

---

## 8. 감사 로그

**URL**: `/audit-logs`

### 핵심 컴포넌트
| 컴포넌트 | 설명 |
|----------|------|
| `AuditLogTable` | 전체 액션 로그 테이블 (필터, 검색, 페이지네이션) |
| `LogFilterBar` | 필터 바 (날짜, 액터, 액션 유형, 법인) |
| `LogDetailDrawer` | 로그 상세 드로어 (요청/응답 페이로드) |
| `ExportButton` | CSV/JSON 내보내기 버튼 |

### 사용 라이브러리
- `@tanstack/react-table` — 고성능 테이블
- `@radix-ui` — 필터 드롭다운, 드로어
- `date-fns` — 날짜 필터 처리

### API 엔드포인트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/audit-logs` | 감사 로그 목록 (필터, 페이지네이션) |
| GET | `/api/audit-logs/:id` | 로그 상세 |
| GET | `/api/audit-logs/export` | CSV/JSON 내보내기 |

---

## 9. 설정

**URL**: `/settings`

### 핵심 컴포넌트
| 컴포넌트 | 설명 |
|----------|------|
| `SettingsTabs` | 설정 탭 네비게이션 (일반, 보안, 알림, 연동) |
| `GeneralSettings` | 시스템 이름, 타임존, 언어 설정 |
| `SecuritySettings` | MFA 설정, 세션 타임아웃, 비밀번호 정책 |
| `NotificationSettings` | Slack 웹훅, 이메일 알림 설정 |
| `IntegrationSettings` | MCP 서버 연결 상태 및 설정 |

### 사용 라이브러리
- `@radix-ui` — 탭, 스위치, 폼 컴포넌트
- `react-hook-form` + `zod` — 폼 유효성 검증

### API 엔드포인트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/settings` | 전체 설정 조회 |
| PUT | `/api/settings/general` | 일반 설정 저장 |
| PUT | `/api/settings/security` | 보안 설정 저장 |
| PUT | `/api/settings/notifications` | 알림 설정 저장 |
| PUT | `/api/settings/integrations` | 연동 설정 저장 |
