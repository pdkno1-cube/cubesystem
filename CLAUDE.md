# 이 프로젝트 Claude Code 운영 시스템 v4.0

## 세션 시작 시 반드시 읽을 파일 순서
1. GUIDE.md  → CEO 가이드 (최우선)
2. AGENTS.md → 전체 팀 구조
3. PRIME.md  → CTO 철학 & 프로토콜

## 팀 구조 (8개 팀 / 19개 에이전트)
TEAM_G: 🏗️ 설계 & PRD      TEAM_H: 🔐 보안
TEAM_A: 🧭 PM & 기획        TEAM_B: 🎨 프론트엔드
TEAM_C: ⚙️ 백엔드           TEAM_D: 🔍 QA & 배포
TEAM_E: 🗂️ 팀 관리          TEAM_F: 🧰 스킬 & AI

## 핵심 규칙
- 설계(TEAM_G) 없이 개발 시작 금지
- 보안(TEAM_H) 승인 없이 배포 금지
- console.log 단독 에러 처리 금지
- 캐싱 없는 중복 API 호출 금지

## 기술 스택
Frontend: Next.js 14 + TypeScript + Tailwind + Zustand
Backend: Next.js API Routes + Supabase + Redis
Deploy: Vercel + Cloudflare | Monitor: Sentry + GA4

## 명령어
npm run dev | npm run build | npm run test | npm run lint
