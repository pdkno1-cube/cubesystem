# PRD-MCP-HUB-v1: MCP Integration Hub

> 작성: TEAM_G (ARCHITECT + PRD_MASTER) | 버전: v1.0 | 2026-02-27

---

## 개요

Vault 페이지(`/vault`) 하단에 MCP 프로바이더 연동 허브를 추가하여, 저장된 API 키(시크릿)를
외부 서비스(Resend, Google Drive, Slack, FireCrawl)에 1-click으로 연결하고
연결 상태를 실시간으로 확인할 수 있는 UI 및 백엔드 API를 구현한다.

---

## 배경 & 목적

현재 상태:
- `secret_vault` 테이블에 API 키를 암호화 저장 가능
- `mcp_connections` 테이블이 스키마에 존재하나, UI에서 레코드를 생성/관리하는 수단이 없음
- FastAPI `MCPRegistry`는 `mcp_connections.secret_ref` FK를 통해 키를 조회하나,
  해당 레코드를 만드는 진입점이 없어 실제 에이전트 파이프라인에서 MCP 툴 호출 불가

목적:
1. Vault UI에서 시크릿 → MCP 프로바이더 연결을 완성하여 파이프라인 실행 블로커 해소
2. 연결 상태 / 마지막 테스트 시각을 노출하여 운영자가 단일 화면에서 통합 상태 관리
3. 연결 테스트(health check) 기능으로 유효하지 않은 키를 배포 전에 조기 식별

---

## 사용자 스토리

- As a **워크스페이스 관리자**, I want **MCP 프로바이더를 Vault 시크릿에 연결**하고 싶다,
  So that **에이전트 파이프라인이 외부 도구를 즉시 사용**할 수 있다.

- As a **워크스페이스 관리자**, I want **연결 상태를 한눈에 확인**하고 싶다,
  So that **운영 중 끊어진 연결을 빠르게 인지하고 대응**할 수 있다.

- As a **워크스페이스 관리자**, I want **"테스트" 버튼 하나로 연결 유효성 검증**하고 싶다,
  So that **배포 전 잘못된 API 키 문제를 선제적으로 차단**할 수 있다.

---

## 기능 요구사항

### 필수 (Must Have)

#### UI (`/vault` 페이지 하단 추가 섹션)
- [ ] MCP 프로바이더 섹션 헤더 ("MCP 프로바이더 연동")
- [ ] 프로바이더 카드 4종: Resend, Google Drive, Slack, FireCrawl
  - 각 카드: 프로바이더 아이콘 + 이름 + 설명 + 연동 상태 배지 (연결됨 / 미연결)
  - 연결됨 상태: 연결된 시크릿 slug 표시 + 마지막 테스트 시각
  - 미연결 상태: "연결" 버튼
  - 연결됨 상태: "테스트" 버튼 + "연결 해제" 버튼
- [ ] "연결" 클릭 시 ConnectProviderModal 표시
  - 워크스페이스 선택
  - 기존 시크릿 slug 드롭다운 (해당 workspace의 api_key 카테고리 필터)
  - 선택 후 "연결" 클릭 → POST /api/mcp/connections
- [ ] "테스트" 클릭 시 연결 검증 후 결과 Toast 표시 (성공 / 실패 + 에러 메시지)
- [ ] "연결 해제" 클릭 시 확인 다이얼로그 → DELETE /api/mcp/connections/{id}
- [ ] Optimistic UI: 테스트 버튼 즉시 로딩 상태 전환

#### Backend (FastAPI)
- [ ] `GET /orchestrate/mcp/providers` — 사용 가능한 프로바이더 목록 + 현재 workspace 연결 상태
- [ ] `POST /orchestrate/mcp/connections` — mcp_connections 레코드 생성
- [ ] `DELETE /orchestrate/mcp/connections/{connection_id}` — 연결 비활성화 (soft delete)
- [ ] `POST /orchestrate/mcp/test/{provider}` — 연결 테스트 (health_check 호출)

#### Next.js API Routes
- [ ] `GET /api/mcp/providers` → FastAPI 프록시
- [ ] `POST /api/mcp/connections` → FastAPI 프록시
- [ ] `DELETE /api/mcp/connections/[id]` → FastAPI 프록시
- [ ] `POST /api/mcp/test/[provider]` → FastAPI 프록시

#### DB
- [ ] `mcp_connections.provider` CHECK 제약에 `'resend'` 추가 (현재 누락)
- [ ] `mcp_connections.last_tested_at` 컬럼 추가
- [ ] `mcp_connections.test_result` JSONB 컬럼 추가 (최근 테스트 결과 저장)

### 선택 (Nice to Have)
- [ ] 연결 성공 시 프로바이더 별 사용 통계 카드 내 노출 (총 호출 수 / 이번 달)
- [ ] 시크릿 만료 임박(7일 이내) 시 카드에 경고 배지 표시
- [ ] 자동 주기적 health check (Cron 또는 요청 시 lazy check)

---

## 비기능 요구사항

- **성능**: 테스트 API 응답 30초 이내 (외부 API timeout 기준), UI는 즉시 로딩 상태 표시
- **보안**:
  - API 키 값은 응답에 절대 포함 금지 (slug, id만 반환)
  - 모든 엔드포인트 `get_current_user` 인증 필수
  - workspace_id RLS: 본인 workspace만 접근 가능
  - SSRF Guard 미들웨어 적용 (endpoint_url 검증)
- **접근성**: WCAG 2.1 AA, 배지 색상 대비 충족
- **에러 처리**: 외부 API 실패를 사용자 친화적 메시지로 변환 (console.log 단독 금지)

---

## 사용자 플로우

### Happy Path — 신규 연결

1. 사용자가 `/vault` 페이지 접속
2. 하단 "MCP 프로바이더 연동" 섹션에서 Resend 카드 확인 (상태: 미연결)
3. "연결" 버튼 클릭 → ConnectProviderModal 오픈
4. 워크스페이스 선택 + 기존 시크릿 "Resend API Key" 선택
5. "연결" 클릭 → POST /api/mcp/connections 호출
6. Optimistic UI: 카드 즉시 "연결됨" 상태로 전환
7. 서버 응답 수신 → Toast "Resend 연결 완료"
8. "테스트" 버튼 클릭 → 연결 검증 → Toast "연결 정상 (Resend API 응답 200)"

### Edge Case — 유효하지 않은 키

1. "테스트" 클릭 → POST /api/mcp/test/resend
2. Resend API 401 반환
3. Toast "연결 실패: API 키 인증 오류. Vault에서 키를 확인해주세요."
4. 카드 상태: "연결됨 (테스트 실패)" 상태 배지로 변경

### Edge Case — 시크릿 삭제 후 MCP 연결 잔존

- secret_vault 소프트 삭제 시 연결된 mcp_connections의 health_status → 'down' 자동 업데이트
- 카드 UI에 "연결된 시크릿이 삭제됨" 경고 표시

---

## 완료 기준 (Acceptance Criteria)

- [ ] `/vault` 페이지에서 4개 MCP 프로바이더 카드가 렌더링된다
- [ ] 각 카드가 해당 workspace의 mcp_connections 테이블 상태를 정확히 반영한다
- [ ] "연결" 모달에서 vault 시크릿 선택 후 저장하면 mcp_connections 레코드가 생성된다
- [ ] "테스트" 버튼이 FastAPI health_check를 호출하고 결과를 Toast로 표시한다
- [ ] "연결 해제" 버튼이 mcp_connections.is_active = false로 설정한다
- [ ] API 응답에 암호화된 시크릿 값이 포함되지 않는다
- [ ] TypeScript strict 모드 + any 타입 0개
- [ ] 신규 API 라우트에 인증 미들웨어 적용 확인

---

## 다음 단계

- TEAM_H 보안 검토 요청 (SSRF, Secret 노출 벡터 검토)
- TEAM_A 티켓 발행 (FE 구현 1티켓, BE 구현 1티켓, DB 마이그레이션 1티켓)
- Phase 5 Session 2: 파이프라인 내 MCP 툴 호출 실행 검증
