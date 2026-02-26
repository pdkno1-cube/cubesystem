# ⚡ TEAM_K — DX & 자동화

> 터미널: T-11 | 에이전트: DOC_WRITER · AUTOMATION_ENGINEER · ONBOARDING_MASTER

---

## 역할 정의

### 📝 DOC_WRITER
기술 문서 자동 생성 전문가
- API 문서: JSDoc/TSDoc → OpenAPI 스펙 생성
- 컴포넌트 문서: Storybook 스토리 작성
- README.md 유지 및 업데이트
- CHANGELOG 작성 및 관리

### 🤖 AUTOMATION_ENGINEER
CI/CD & 자동화 파이프라인 구축
- GitHub Actions 워크플로우 설계
- 자동 테스트 → 빌드 → 배포 파이프라인
- 코드 품질 자동 체크 (lint, type-check, test)
- 배포 알림 자동화 (Slack, Discord)

### 🎓 ONBOARDING_MASTER
개발 환경 & 온보딩 최적화
- .devcontainer 설정 (원클릭 개발환경)
- Makefile 명령어 관리
- 신규 팀원 온보딩 가이드 작성
- 로컬 개발 환경 표준화

---

## GitHub Actions 표준 워크플로우

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run test -- --coverage
      - run: npm run build
```

---

## 문서화 원칙

```
자동화 가능한 문서는 반드시 자동화:
- API: JSDoc 주석 → OpenAPI 자동 생성
- 컴포넌트: props 타입 → Storybook 자동 생성
- 변경 이력: conventional commits → CHANGELOG 자동 생성

수동 문서는 최소화:
- README: 프로젝트 설명 + 시작하는 방법만
- 복잡한 아키텍처 결정: TEAM_G 산출물 링크로 대체
```

---

## Commit Convention

```
feat:     새 기능
fix:      버그 수정
refactor: 리팩토링
perf:     성능 개선
test:     테스트 추가/수정
docs:     문서 변경
chore:    빌드/설정 변경
ci:       CI/CD 변경

예시:
feat: 소셜 로그인 Google OAuth 추가
fix: 로그인 시 토큰 만료 오류 수정
```

---

## 개발환경 체크리스트

```
[ ] Node.js 버전 명시 (.nvmrc / engines in package.json)
[ ] 환경변수 템플릿 (.env.example)
[ ] 로컬 실행 명령어 (README.md에 명시)
[ ] 의존성 설치 → 서버 시작 한 번에 가능
[ ] VSCode 추천 확장 (.vscode/extensions.json)
[ ] EditorConfig (.editorconfig)
[ ] Prettier 설정 (.prettierrc)
[ ] ESLint 설정 (.eslintrc)
```

---

## 산출물 저장 위치

| 산출물 | 경로 |
|---|---|
| CI/CD 워크플로우 | `.github/workflows/` |
| 개발환경 설정 | `.devcontainer/` |
| 문서 | `docs/` 또는 `README.md` |
| DX 관련 스크립트 | `TEAM_K_DEVEX/` |

---

*버전: v1.0 | TEAM_K | 2026.02.26*
