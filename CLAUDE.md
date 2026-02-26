# 🧭 멀티 에이전트 시스템 v5.2 — 세션 메모리

## ⚠️ 세션 시작 시 읽을 파일 순서
1. GUIDE.md          → CEO 가이드 + 토큰 최적화 총괄 (★ 최우선)
2. AGENTS.md         → 전체 팀 구조 & 규칙
3. PRIME.md          → CTO 4중 프로토콜
4. MEMORY/MEMORY.md  → 현재 프로젝트 컨텍스트

## 팀 구조 (11개 팀 / 25개 에이전트)
T-7  🏗️  TEAM_G  설계 & PRD
T-8  🔐  TEAM_H  보안 (배포 전 필수 게이트)
T-1  🧭  TEAM_A  PM & 기획
T-2  🎨  TEAM_B  프론트엔드
T-3  ⚙️  TEAM_C  백엔드
T-4  🔍  TEAM_D  QA & 배포
T-5  🗂️  TEAM_E  팀 관리
T-6  🧰  TEAM_F  스킬 & AI
T-9  🔬  TEAM_I  코드 리뷰 (PR 필수 게이트)
T-10 📊  TEAM_J  데이터 & BI
T-11 ⚡  TEAM_K  DX & 자동화

## PRIME 4중 프로토콜 (항상 자동 적용)
1. ZERO-LATENCY: Optimistic UI / Upload First / Background Submit / Presigned URL / Client Compress
2. COMMERCIALIZATION: Observability / Actionable Data / Cost Efficiency
3. SECURITY BY DESIGN: 설계→보안검토→개발→리뷰→보안게이트→배포
4. CODE QUALITY: SRP / DRY / TypeSafe / Test80% / DebtTracking

## 절대 원칙
- 설계(T-7) 없이 개발 금지
- 코드리뷰(T-9) 없이 PR 머지 금지
- 보안승인(T-8) 없이 프로덕션 배포 금지
- console.log 단독 에러 처리 금지 / any 타입 금지
- 작업 완료 시 MEMORY/MEMORY.md 업데이트

## 토큰 원칙 (GUIDE.md 판단 로직 요약)
- 파일 1개 추가 로드 = 600~1,200 토큰 고정 소모
- 작업에 필요한 파일만 로드 (팀 작업 시 PRIME + 해당팀 AGENT.md만)
- 기능 1개 완료 → 새 세션 시작
- 20,000 토큰 초과 예상 작업 → 반드시 세션 분할

## 명령어
/guide /design /security /review /data /docs /sprint /build /audit /scale /skill /status

## 프로젝트 정보 (직접 수정하세요)
- 프로젝트명: [프로젝트명]
- 스택: Next.js 14 + TypeScript + Tailwind + Supabase + Vercel
- 개발: npm run dev  | 빌드: npm run build
- 테스트: npm run test | 린트: npm run lint
