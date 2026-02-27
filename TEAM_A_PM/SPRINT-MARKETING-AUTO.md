# 스프린트 작업지시서 — 마케팅 자동화 완성

> 담당: TEAM_A (PM) | 기반 PRD: PRD-MARKETING-AUTO-v1.md | 2026.02.27 (v2 업데이트)
> 총 세션: 7개 | 총 예상 토큰: ~82,000
>
> ## v2 변경 사항 (2026.02.27)
> - 에이전트 5종 고급 프롬프트 완성 (seed.sql 등록 완료)
> - OSMU 파이프라인 7노드→9노드, 4채널 병렬 구조로 업데이트 (page.tsx, seed.sql)
> - BlogAgent → BlogWriterV2 (100만 조회수 공식)
> - 신규: TopicAnalystAgent / InstaCreatorAgent / NewsletterAgent / ShortFormAgent
> - generate_sns (BlogAgent) → generate_insta (InstaCreatorAgent) 교체
> - generate_report (RealistAgent) → 제거 (전략 분석은 analyze_topic에서 수행)
> - drive_save 노드 추가 (Google Drive 폴더 관리 MCP)
>
> ## 에이전트 크레딧 비용 (실행당)
> | 에이전트 | 크레딧 | 모델 |
> |---|---|---|
> | TopicAnalystAgent | 0.07 | claude-sonnet |
> | BlogWriterV2 | 0.08 | claude-sonnet |
> | InstaCreatorAgent | 0.08 | claude-sonnet |
> | NewsletterAgent | 0.04 | claude-haiku |
> | ShortFormAgent | 0.07 | claude-sonnet |
> | CriticAgent | 0.08 | claude-sonnet |
> | **OSMU 총합** | **0.42** | |

---

## 전체 로드맵

```
[현재 위치]
Phase 3 마무리 ──→ GDrive 폴더관리 ──→ 에이전트 구현 ──→ 스케줄러 ──→ 대시보드 UI ──→ E2E 검증
   세션 1            세션 2            세션 3~4          세션 5          세션 6          세션 7
```

---

## 세션 1: Phase 3 마무리 (즉시 실행 가능)

**팀**: TEAM_D (QA & 배포)
**예상 토큰**: ~5,000
**소요 시간**: 30분

### 작업 내용
1. Vercel 환경변수 설정
   - `FASTAPI_URL` = `https://fastapi-backend-production-74c3.up.railway.app`
   - `NEXT_PUBLIC_FASTAPI_WS_URL` = `wss://fastapi-backend-production-74c3.up.railway.app/ws`
2. 프론트↔백엔드 E2E 연결 검증 (pipeline start API 호출 테스트)
3. 임시 배포 스크립트 삭제
   - `apps/api/_deploy.mjs`
   - `apps/api/_fix_root.mjs`
   - `apps/api/_fix_root2.mjs`
   - `apps/api/_introspect*.mjs`
   - `apps/api/_set_docker.mjs`

### 세션 지시문
```
MEMORY/MEMORY.md 읽어.
다음 작업만 해:

1. Vercel 환경변수 2개 설정 (Vercel API 또는 대시보드)
   FASTAPI_URL = https://fastapi-backend-production-74c3.up.railway.app
   NEXT_PUBLIC_FASTAPI_WS_URL = wss://fastapi-backend-production-74c3.up.railway.app/ws

2. E2E 테스트: GET https://the-master-os.vercel.app/api/proxy/* 로 백엔드 연결 확인

3. 임시 스크립트 파일 삭제 (apps/api/_*.mjs 전체)

완료 기준: Vercel 재배포 후 프론트에서 파이프라인 실행 성공
```

### 완료 조건
- [ ] Vercel 환경변수 2개 설정 완료
- [ ] 파이프라인 UI에서 실행 버튼 클릭 → FastAPI 응답 수신
- [ ] 임시 스크립트 파일 삭제 + 커밋

---

## 세션 2: Google Drive 폴더 관리 MCP 확장

**팀**: TEAM_F (스킬 & AI) + TEAM_C (백엔드)
**예상 토큰**: ~10,000
**소요 시간**: 1시간

### 작업 내용
1. `gdrive_folder_policy.py` 신규 생성 (폴더 트리 정책)
2. `google_drive.py` MCP 확장 (4개 액션 추가)
3. `TEAM_F_SKILLS/registry/SKILL-GDRIVE-FOLDER-MANAGER.md` 스킬 등록

### 폴더 트리 표준
```
My Drive/
└── The Master OS/
    ├── pipelines/{pipeline-id}/{YYYY-MM}/
    ├── agents/{agent-name}/
    ├── exports/
    └── archive/
```

### 추가될 MCP 액션
- `find_or_create_folder` — 중복 방지 핵심 (없으면 생성, 있으면 기존 반환)
- `list_folders` — 폴더만 조회
- `move_to_archive` — archive/ 이동
- `get_folder_tree` — 전체 트리 조회

### 세션 지시문
```
PRIME.md, TEAM_F_SKILLS/AGENT.md 읽어.
TEAM_G_DESIGN/prd/PRD-MARKETING-AUTO-v1.md의 M-02 항목 구현해.

1. the-master-os/apps/api/app/mcp/gdrive_folder_policy.py 생성
   (폴더 트리 상수 + 네이밍 룰 + archive 정책)

2. the-master-os/apps/api/app/mcp/google_drive.py 에 4개 액션 추가
   (find_or_create_folder, list_folders, move_to_archive, get_folder_tree)

3. TEAM_F_SKILLS/registry/SKILL-GDRIVE-FOLDER-MANAGER.md 작성

완료 기준: find_or_create_folder 호출 시 동일 폴더 2번 생성되지 않음
```

### 완료 조건
- [ ] `gdrive_folder_policy.py` 생성
- [ ] `google_drive.py` 4개 액션 추가 (TypeScript strict 준수)
- [ ] 스킬 파일 등록
- [ ] 중복 생성 방지 로직 검증

---

## 세션 3: InstaCreatorAgent + NewsletterAgent 구현

**팀**: TEAM_C (백엔드) + TEAM_F (스킬 & AI)
**예상 토큰**: ~13,000
**소요 시간**: 2시간

### 작업 내용

#### InstaCreatorAgent
- LangGraph 노드: `generate_insta`
- 출력: 캐러셀 5~7장 텍스트 + 해시태그 30개 + 비주얼 지시서
- Figma MCP 연동: 템플릿 파라미터 적용 → 이미지 URL
- Google Drive 저장: `find_or_create_folder` 사용

#### NewsletterAgent
- LangGraph 노드: `generate_newsletter`
- 출력: HTML 이메일 + 제목줄 A/B 2개
- Resend API 연동 추가 (MCP 또는 직접 호출)
- `newsletter_subscribers` 테이블 마이그레이션 추가

### 세션 지시문
```
PRIME.md, TEAM_C_BACKEND/AGENT.md 읽어.
TEAM_G_DESIGN/prd/PRD-MARKETING-AUTO-v1.md의 M-03, M-04 구현해.
TEAM_G_DESIGN/architecture/AGENT-CATALOG.md의 InstaCreator, Newsletter 정의 참고.

1. apps/api/app/pipeline/ 에 insta_agent_node.py 생성
2. apps/api/app/pipeline/ 에 newsletter_agent_node.py 생성
3. supabase/migrations/ 에 newsletter_subscribers 테이블 마이그레이션 추가
4. apps/api/app/mcp/ 에 resend.py MCP 클라이언트 생성
5. apps/api/app/mcp/registry.py 에 resend 등록

완료 기준: 두 에이전트 노드가 LangGraph 그래프에 연결되어 실행 성공
```

### 완료 조건
- [ ] InstaCreatorAgent 노드 구현 + Figma 연동
- [ ] NewsletterAgent 노드 구현 + Resend 연동
- [ ] DB 마이그레이션 파일 생성
- [ ] Resend MCP 클라이언트 + 레지스트리 등록

---

## 세션 4: ShortFormAgent + OSMU 파이프라인 완성

**팀**: TEAM_C (백엔드)
**예상 토큰**: ~10,000
**소요 시간**: 1.5시간

### 작업 내용
- ShortFormAgent LangGraph 노드 구현
- OSMU 파이프라인 7노드 → 10노드 확장 (병렬 실행 포함)
- 파이프라인 front-end 정의 업데이트 (page.tsx)
- 크레딧 비용 업데이트 (총 0.23 크레딧/실행)

### 파이프라인 최종 구조
```
validate_input
  ↓
analyze_topic (RealistAgent)
  ↓ [병렬 분기]
  ├─ generate_blog → drive_save_blog
  ├─ generate_insta → figma_render → drive_save_insta
  ├─ generate_newsletter → drive_save_newsletter
  └─ generate_shortform → drive_save_shortform
  ↓ [합류]
review_all (CriticAgent)
  ↓
finalize
```

### 세션 지시문
```
PRIME.md 읽어.
TEAM_G_DESIGN/prd/PRD-MARKETING-AUTO-v1.md의 M-05, M-06 구현해.

1. apps/api/app/pipeline/shortform_agent_node.py 생성
2. apps/api/app/pipeline/engine.py 의 OSMU 그래프 10노드로 확장
   (병렬 실행: generate_blog/insta/newsletter/shortform 동시 실행)
3. apps/web/src/app/(dashboard)/pipelines/page.tsx 파이프라인 정의 업데이트

완료 기준: OSMU 파이프라인 실행 시 4채널 콘텐츠 동시 생성
```

### 완료 조건
- [ ] ShortFormAgent 노드 구현
- [ ] 병렬 실행 LangGraph 그래프 완성
- [ ] 프론트 파이프라인 정의 업데이트
- [ ] 전체 크레딧 비용 정확성 검증

---

## 세션 5: 발행 스케줄러

**팀**: TEAM_C (백엔드) + TEAM_B (프론트엔드)
**예상 토큰**: ~12,000
**소요 시간**: 2시간

### 작업 내용
- `content_schedules` 테이블 마이그레이션
- FastAPI APScheduler 설정 (발행 시각 도달 시 자동 실행)
- 스케줄 관리 API 4개 (`/api/marketing/schedule` CRUD)
- 이메일 자동 발송 (Resend) — 스케줄 트리거
- Slack 발행 완료 알림

### 세션 지시문
```
PRIME.md, TEAM_C_BACKEND/AGENT.md 읽어.
PRD-MARKETING-AUTO-v1.md의 M-07 구현해.

1. supabase/migrations/ content_schedules 테이블 추가
2. apps/api/app/routers/marketing.py 생성 (스케줄 CRUD 4개 엔드포인트)
3. apps/api/app/services/scheduler.py 생성 (APScheduler 설정)
4. apps/web/src/app/api/marketing/ BFF 라우트 추가

완료 기준: 스케줄 생성 → 지정 시각에 Resend 이메일 발송 성공
```

### 완료 조건
- [ ] `content_schedules` 마이그레이션
- [ ] 스케줄 API 4개 (CRUD)
- [ ] APScheduler 이메일 발송 트리거
- [ ] Slack 알림 연동

---

## 세션 6: 콘텐츠 캘린더 UI

**팀**: TEAM_B (프론트엔드)
**예상 토큰**: ~15,000
**소요 시간**: 2.5시간

### 작업 내용
- `/marketing` 라우트 신규 페이지
- 월별 캘린더 뷰 (Tailwind Grid 커스텀)
- 채널별 색상 구분 태그
- 콘텐츠 미리보기 모달 (슬라이드오버)
- 드래그앤드롭 일정 변경

### 페이지 구조
```
/marketing
  ├─ 상단: 이번 달 요약 (채널별 실행 횟수, 크레딧 소모)
  ├─ 중앙: 월별 캘린더 (7×5 그리드)
  │    └─ 날짜별 콘텐츠 태그 (블로그=파랑, 인스타=분홍, 뉴스=초록, 숏폼=보라)
  └─ 우측 패널: 선택한 날짜의 콘텐츠 목록 + 미리보기
```

### 세션 지시문
```
PRIME.md, TEAM_B_FRONTEND/AGENT.md 읽어.
PRD-MARKETING-AUTO-v1.md의 M-08 구현해.

1. apps/web/src/app/(dashboard)/marketing/ 폴더 생성
2. page.tsx (캘린더 메인)
3. components/marketing/CalendarGrid.tsx
4. components/marketing/ContentPreviewSlider.tsx
5. stores/marketingStore.ts (Zustand)

완료 기준: 캘린더에서 날짜 클릭 → 해당 일의 콘텐츠 미리보기 표시
```

### 완료 조건
- [ ] `/marketing` 페이지 라우트
- [ ] 월별 캘린더 UI
- [ ] 채널별 색상 구분
- [ ] 콘텐츠 미리보기 슬라이드오버
- [ ] 사이드바에 Marketing 메뉴 추가

---

## 세션 7: E2E 통합 테스트 + 코드 리뷰

**팀**: TEAM_D (QA) + TEAM_I (코드 리뷰)
**예상 토큰**: ~8,000
**소요 시간**: 1시간

### 테스트 시나리오
1. 기획안 입력 → OSMU 파이프라인 실행 → 4채널 콘텐츠 생성 확인
2. Google Drive 폴더 구조 확인 (중복 없음)
3. 뉴스레터 이메일 발송 확인 (Resend)
4. 캘린더 스케줄 생성 → 발행 자동 실행
5. WebSocket 실시간 진행률 확인

### 완료 조건
- [ ] E2E 시나리오 5개 통과
- [ ] 코드 리뷰 지적 사항 수정
- [ ] MEMORY.md Phase 4 DONE으로 업데이트

---

## 토큰 예산 요약

| 세션 | 팀 | 작업 | 토큰 |
|---|---|---|---|
| 1 | T-4 | Vercel 연결 + 스크립트 정리 | ~5,000 |
| 2 | T-6+3 | GDrive 폴더 관리 | ~10,000 |
| 3 | T-3+6 | Insta + Newsletter 에이전트 | ~13,000 |
| 4 | T-3 | ShortForm + 파이프라인 완성 | ~10,000 |
| 5 | T-3+2 | 발행 스케줄러 | ~12,000 |
| 6 | T-2 | 콘텐츠 캘린더 UI | ~15,000 |
| 7 | T-4+9 | E2E 테스트 + 코드 리뷰 | ~8,000 |
| **합계** | | | **~73,000** |

---

## 신규 파일 목록 (생성될 파일)

```
# 백엔드
apps/api/app/mcp/gdrive_folder_policy.py       ← 폴더 정책
apps/api/app/mcp/resend.py                     ← 이메일 MCP
apps/api/app/pipeline/insta_agent_node.py      ← 인스타 에이전트
apps/api/app/pipeline/newsletter_agent_node.py ← 뉴스레터 에이전트
apps/api/app/pipeline/shortform_agent_node.py  ← 숏폼 에이전트
apps/api/app/routers/marketing.py             ← 스케줄 API
apps/api/app/services/scheduler.py            ← APScheduler

# 프론트엔드
apps/web/src/app/(dashboard)/marketing/page.tsx
apps/web/src/components/marketing/CalendarGrid.tsx
apps/web/src/components/marketing/ContentPreviewSlider.tsx
apps/web/src/stores/marketingStore.ts
apps/web/src/app/api/marketing/schedule/route.ts

# DB
supabase/migrations/20260227000009_create_marketing.sql

# 설계 문서
TEAM_G_DESIGN/prd/PRD-MARKETING-AUTO-v1.md      ← 완료
TEAM_F_SKILLS/registry/SKILL-GDRIVE-FOLDER-MANAGER.md

# 수정될 파일
apps/api/app/mcp/google_drive.py               ← 4개 액션 추가
apps/api/app/mcp/registry.py                   ← resend 등록
apps/api/app/pipeline/engine.py                ← 10노드 확장
apps/web/src/app/(dashboard)/pipelines/page.tsx ← 파이프라인 정의 업데이트
apps/web/src/components/layout/sidebar.tsx     ← Marketing 메뉴 추가
```

---

*버전: v1.0 | 2026.02.27 | 세션 1부터 순서대로 실행*
