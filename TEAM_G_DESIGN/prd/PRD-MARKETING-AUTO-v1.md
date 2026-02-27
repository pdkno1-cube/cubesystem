# PRD-MARKETING-AUTO-v1: 마케팅 자동화 완성 (OSMU Full Stack)

> 작성: TEAM_G (ARCHITECT + PRD_MASTER) | 버전: v1.0 | 2026.02.27
> 상위 PRD: PRD-MASTEROS-v1.md (F-04 항목 구체화)

---

## 개요

OSMU(One Source Multi Use) 마케팅 파이프라인을 **완전 자동화**한다.
기획안 1개 입력 → 블로그 / 인스타그램 / 뉴스레터 / 숏폼 4채널 콘텐츠 동시 생성 →
Google Drive 자동 저장 → 채널별 발행 스케줄링까지 인간 개입 없이 실행된다.

---

## 현재 구현 상태 (2026-02-27 기준)

### 완료 ✅
| 항목 | 파일 위치 |
|---|---|
| 파이프라인 엔진 (LangGraph) | apps/api/app/pipeline/engine.py |
| OSMU 파이프라인 정의 (7노드) | apps/web/src/app/(dashboard)/pipelines/page.tsx |
| BlogAgent (블로그 + SNS 초안) | apps/api/app/routers/agents.py |
| 파이프라인 실행 UI | apps/web/src/app/(dashboard)/pipelines/ |
| WebSocket 실시간 모니터링 | apps/api/app/ws/ |
| FastAPI Railway 배포 | https://fastapi-backend-production-74c3.up.railway.app |
| MCP Registry (구조) | apps/api/app/mcp/registry.py |
| Google Drive MCP (기초) | apps/api/app/mcp/google_drive.py (upload/download/list) |

### 미완성 ❌ (이번 PRD 범위)
| 항목 | 우선순위 |
|---|---|
| Vercel 환경변수 미설정 (프론트↔백 단절) | P0 즉시 |
| Google Drive 폴더 정책 없음 (무분별 폴더 생성) | P1 |
| InstaCreatorAgent 미구현 (Figma 연동) | P1 |
| NewsletterAgent 미구현 (이메일 발송 포함) | P1 |
| ShortFormAgent 미구현 | P1 |
| 발행 스케줄러 없음 | P2 |
| 콘텐츠 캘린더 UI 없음 | P2 |
| 마케팅 성과 대시보드 없음 | P3 |

---

## 사용자 스토리

### US-M01: OSMU 원클릭 실행
As a 총괄 회장,
I want 마케팅 기획안 텍스트 1개를 붙여넣고 [실행] 버튼을 누르면,
So that 10분 내로 블로그/인스타/뉴스레터/숏폼 4개 콘텐츠가 Google Drive에 저장된다.

### US-M02: 채널별 맞춤 품질
As a 총괄 회장,
I want 각 채널의 톤&매너가 자동으로 맞춰진 콘텐츠를 받고,
So that 별도 편집 없이 바로 사용할 수 있는 퀄리티가 보장된다.
- 블로그: SEO 최적화, 2,000자 이상, 소제목+CTA 포함
- 인스타: 캐러셀 5~7장, 해시태그 30개, 비주얼 지시서
- 뉴스레터: HTML 템플릿, 제목줄(A/B 2개), 프리헤더, CTA 버튼
- 숏폼: 씬별 스크립트, BGM 추천, 자막 텍스트

### US-M03: Google Drive 자동 정리
As a 총괄 회장,
I want 생성된 콘텐츠가 정해진 폴더 구조에 자동 저장되고,
So that 날짜/채널별로 콘텐츠를 쉽게 찾을 수 있다.

### US-M04: 발행 스케줄링
As a 총괄 회장,
I want 생성된 콘텐츠의 발행 일시를 캘린더에서 지정하면,
So that 지정 시간에 자동으로 발행(이메일 발송/SNS 포스팅)된다.

### US-M05: 성과 트래킹
As a 총괄 회장,
I want 채널별 콘텐츠 성과(조회수, 오픈율, 클릭률)를 대시보드에서 확인하고,
So that 어떤 콘텐츠 유형이 효과적인지 데이터 기반으로 판단할 수 있다.

---

## 기능 요구사항

### 필수 (Must Have) — 세션 1~4

#### M-01: Vercel↔Railway 연결 완성
- [ ] FASTAPI_URL 환경변수 설정
- [ ] NEXT_PUBLIC_FASTAPI_WS_URL 환경변수 설정
- [ ] E2E 파이프라인 실행 검증

#### M-02: Google Drive 폴더 관리
- [ ] `find_or_create_folder` 액션 (중복 방지 핵심)
- [ ] `list_folders` 액션
- [ ] `move_to_archive` 액션 (90일 후)
- [ ] 폴더 정책 파일 (gdrive_folder_policy.py)
- [ ] 표준 폴더 트리:
  ```
  The Master OS/
  ├── pipelines/{pipeline-id}/{YYYY-MM}/
  ├── agents/{agent-name}/
  ├── exports/
  └── archive/
  ```

#### M-03: InstaCreatorAgent 구현
- [ ] LangGraph 노드: `generate_insta`
- [ ] 캐러셀 5~7장 텍스트 생성 (슬라이드별 분리)
- [ ] 해시태그 30개 자동 생성
- [ ] 비주얼 지시서 (Figma 템플릿 파라미터)
- [ ] Figma MCP 연동 (템플릿 적용 → 이미지 URL 반환)
- [ ] Google Drive 저장 (find_or_create_folder 사용)

#### M-04: NewsletterAgent 구현
- [ ] LangGraph 노드: `generate_newsletter`
- [ ] HTML 이메일 템플릿 생성
- [ ] 제목줄 A/B 버전 2개
- [ ] Resend API 연동 (이메일 발송)
- [ ] 구독자 리스트 Supabase 테이블

#### M-05: ShortFormAgent 구현
- [ ] LangGraph 노드: `generate_shortform`
- [ ] 씬별 나레이션 스크립트 (30~60초)
- [ ] 화면 지시서 + BGM 추천
- [ ] 자막 텍스트 파일 (.srt 형식)
- [ ] Google Drive 저장

#### M-06: OSMU 파이프라인 완성 (7→10노드)
```
validate_input
  ↓
analyze_topic (RealistAgent)
  ↓
generate_blog (BlogAgent) ──→ drive_save
generate_insta (InstaCreatorAgent) ──→ figma_render → drive_save
generate_newsletter (NewsletterAgent) ──→ drive_save
generate_shortform (ShortFormAgent) ──→ drive_save
  ↓ [병렬 실행]
review_all (CriticAgent)
  ↓
finalize (결과 집계 + 알림)
```

### 권장 (Should Have) — 세션 5~6

#### M-07: 발행 스케줄러
- [ ] `content_schedules` Supabase 테이블
- [ ] 채널별 발행 일시 설정 UI (캘린더)
- [ ] 스케줄 실행 워커 (APScheduler 또는 Supabase Edge Function)
- [ ] 이메일 자동 발송 (Resend) — 지정 시각
- [ ] Slack 발행 알림

#### M-08: 콘텐츠 캘린더 UI
- [ ] 월별 캘린더 뷰 (FullCalendar 또는 커스텀)
- [ ] 채널별 색상 구분 (블로그/인스타/뉴스레터/숏폼)
- [ ] 드래그앤드롭 일정 변경
- [ ] 콘텐츠 미리보기 모달

### 선택 (Nice to Have) — 세션 7

#### M-09: 성과 대시보드
- [ ] 채널별 실행 횟수 / 크레딧 소모 추적
- [ ] 이메일 오픈율 (Resend Webhook)
- [ ] Google Drive 파일 접근 로그

---

## DB 스키마 추가 (신규 테이블)

```sql
-- 콘텐츠 스케줄
CREATE TABLE content_schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id),
  execution_id uuid REFERENCES pipeline_executions(id),
  channel     text CHECK (channel IN ('blog','instagram','newsletter','shortform')),
  scheduled_at timestamptz NOT NULL,
  published_at timestamptz,
  status      text DEFAULT 'pending' CHECK (status IN ('pending','published','failed')),
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

-- 뉴스레터 구독자
CREATE TABLE newsletter_subscribers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id),
  email       text NOT NULL,
  name        text,
  status      text DEFAULT 'active' CHECK (status IN ('active','unsubscribed')),
  subscribed_at timestamptz DEFAULT now()
);

-- 콘텐츠 성과
CREATE TABLE content_metrics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id   uuid REFERENCES content_schedules(id),
  metric_type   text, -- 'email_open', 'email_click', 'drive_access'
  value         numeric DEFAULT 0,
  recorded_at   timestamptz DEFAULT now()
);
```

---

## API 엔드포인트 추가

```
# 스케줄 관리
POST   /api/marketing/schedule          콘텐츠 발행 스케줄 생성
GET    /api/marketing/schedule          스케줄 목록 (캘린더용)
PATCH  /api/marketing/schedule/:id      스케줄 수정
DELETE /api/marketing/schedule/:id      스케줄 취소

# 뉴스레터
POST   /api/marketing/newsletter/send   즉시 발송
GET    /api/marketing/subscribers       구독자 목록
POST   /api/marketing/subscribers       구독자 추가
```

---

## 기술 스택 추가

| 용도 | 기술 | 이유 |
|---|---|---|
| 이메일 발송 | Resend API | 개발자 친화, Next.js 공식 파트너 |
| 스케줄 실행 | APScheduler (FastAPI) | 이미 Python 환경 |
| 캘린더 UI | 커스텀 (Tailwind Grid) | 의존성 최소화 |
| Figma 렌더링 | Figma REST API | MCP-INTEGRATION.md 이미 설계됨 |

---

## 완료 기준 (Acceptance Criteria)

- [ ] 기획안 텍스트 입력 → 10분 내 4채널 콘텐츠 생성
- [ ] Google Drive `The Master OS/pipelines/{id}/{YYYY-MM}/` 에 파일 저장됨
- [ ] 같은 파이프라인 재실행 시 폴더 중복 생성 없음
- [ ] 뉴스레터 이메일 발송 성공 (Resend)
- [ ] 파이프라인 실행 중 실시간 진행률 WebSocket 수신
- [ ] 크레딧 차감 정확 (BlogAgent 0.06 + InstaAgent 0.08 + Newsletter 0.03 + Shortform 0.06)

---

## 보안 요구사항

- Figma API Key → Secret Vault 저장 (plain text 금지)
- Resend API Key → Secret Vault 저장
- 구독자 이메일 → RLS 적용 (workspace_id 격리)
- Google Drive 서비스 계정 → 최소 권한 (특정 폴더만 접근)

---

*다음 단계: TEAM_H 보안 검토 → TEAM_A 스프린트 티켓 발행 → TEAM_B+C 병렬 구현*
