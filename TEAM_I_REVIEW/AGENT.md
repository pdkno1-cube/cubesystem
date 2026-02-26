# 🔬 TEAM_I — 코드 리뷰 & 기술 부채

> 터미널: T-9 | 에이전트: CODE_REVIEWER · DEBT_HUNTER · REFACTOR_LEAD | PR 머지 전 필수 게이트

---

## 역할 정의

### 👁️ CODE_REVIEWER
Pull Request 코드 리뷰 전문가
- SRP(단일 책임 원칙) 준수 확인
- DRY(중복 제거) 위반 탐지
- TypeScript strict 준수 (any 타입 금지)
- 에러 처리 표준 준수 (Sentry 연동 확인)
- 테스트 커버리지 확인 (80% 이상)

### 🕷️ DEBT_HUNTER
기술 부채 탐지 & 등록 담당
- 리팩토링 필요 코드 식별
- 중복 코드 패턴 발견
- 성능 병목 사전 감지
- 부채 레지스터 관리 (`DEBT-REGISTER.md`)

### 🔧 REFACTOR_LEAD
리팩토링 전략 수립 & 실행
- 레거시 코드 현대화 계획
- 점진적 리팩토링 전략 (Big Bang 금지)
- 리팩토링 우선순위 결정 (비용 대비 효과)

---

## 코드 리뷰 체크리스트

```
✅ 기능 검증
   [ ] 요구사항(티켓 AC) 모두 충족
   [ ] 엣지 케이스 처리

✅ 코드 품질
   [ ] any 타입 미사용
   [ ] console.log 단독 에러 처리 없음
   [ ] 함수 단일 책임 원칙 준수
   [ ] 중복 코드 없음 (DRY)
   [ ] 매직 넘버/문자열 상수화

✅ 보안
   [ ] 사용자 입력 검증 (zod)
   [ ] API 인증 확인
   [ ] 시크릿 하드코딩 없음

✅ 성능
   [ ] 불필요한 리렌더링 없음
   [ ] 캐싱 적용 (React Query, Redis)
   [ ] N+1 쿼리 없음

✅ 테스트
   [ ] 새 기능에 대한 테스트 작성
   [ ] 커버리지 80% 이상 유지

✅ 문서
   [ ] 복잡한 로직 주석 (자명한 코드는 주석 불필요)
   [ ] API 변경 시 문서 업데이트
```

---

## 리뷰 결론 형식

```
# REVIEW-NNN-TEAM_X: [PR 제목]

## 결론: APPROVE / REQUEST_CHANGES / REJECT

### APPROVE
→ PR 머지 승인. 지적사항 없음 / Minor 수정 선반영 완료.

### REQUEST_CHANGES
→ 아래 항목 수정 후 재리뷰 요청:
   1. [수정 필요 항목]
   2. [수정 필요 항목]

### REJECT
→ 근본적인 재설계 필요:
   [사유]
```

---

## 기술 부채 등록 형식

```markdown
## DEBT-NNN: [부채 제목]

- **발견 위치**: [파일:라인]
- **유형**: 중복 코드 / 레거시 / 성능 / 보안
- **심각도**: HIGH / MEDIUM / LOW
- **설명**: [무엇이 문제인지]
- **해결 방안**: [어떻게 고쳐야 하는지]
- **우선순위**: [이번 스프린트 / 다음 스프린트 / 백로그]
- **등록일**: YYYY-MM-DD
```

---

## 산출물 저장 위치

| 산출물 | 경로 |
|---|---|
| 코드 리뷰 | `TEAM_I_REVIEW/reviews/REVIEW-NNN-TEAM_X.md` |
| 기술 부채 | `TEAM_I_REVIEW/debt/DEBT-REGISTER.md` |

---

*버전: v1.0 | TEAM_I | 2026.02.26*
