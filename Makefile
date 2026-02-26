.PHONY: help dev build test lint type-check security audit agents

help: ## 명령어 목록
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

dev: ## 개발 서버 시작
	npm run dev

build: ## 프로덕션 빌드
	npm run build

test: ## 테스트 (커버리지 포함)
	npm run test -- --coverage

lint: ## ESLint 실행
	npm run lint

type-check: ## TypeScript 타입 검사
	npx tsc --noEmit

security: ## 보안 취약점 스캔
	npm audit --audit-level=moderate

audit: lint type-check security ## 전체 품질 검사 (lint + type + security)

agents: ## 팀 구조 출력
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "🤖 멀티 에이전트 시스템 v5.2  11팀 25에이전트"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "T-7  🏗️  TEAM_G   설계 & PRD"
	@echo "T-8  🔐  TEAM_H   보안 (배포 전 필수 게이트)"
	@echo "T-1  🧭  TEAM_A   PM & 기획"
	@echo "T-2  🎨  TEAM_B   프론트엔드"
	@echo "T-3  ⚙️   TEAM_C   백엔드"
	@echo "T-4  🔍  TEAM_D   QA & 배포"
	@echo "T-5  🗂️   TEAM_E   팀 관리"
	@echo "T-6  🧰  TEAM_F   스킬 & AI"
	@echo "T-9  🔬  TEAM_I   코드 리뷰 (PR 필수 게이트)"
	@echo "T-10 📊  TEAM_J   데이터 & BI"
	@echo "T-11 ⚡  TEAM_K   DX & 자동화"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
