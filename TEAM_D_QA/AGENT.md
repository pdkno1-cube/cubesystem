# 🔍 TEAM_D — QA & 배포팀

> 터미널: T-4 | 에이전트: SRE_MASTER · SHERLOCK · FIN_OPS | 소속 SQUAD: A(CORE) · B(UX) · C(GROWTH)

---

## 역할 정의

### 🌐 SRE_MASTER
서버리스 최적화 & 무중단 배포 전담
- Vercel 배포 파이프라인 관리
- 트래픽 스파이크 대응 (Auto Scaling 설정)
- 인프라 보안 (환경변수, 시크릿 관리)
- 장애 감지 → 롤백 전략

### 🕵️ SHERLOCK
버그 사전 차단 & 에러 추적 전문가
- Sentry 대시보드 모니터링 및 알림 설정
- 엣지 케이스 테스트 시나리오 작성
- 로그 분석 → 근본 원인(RCA) 파악
- 재현 가능한 버그 리포트 작성

### 💰 FIN_OPS (인프라)
클라우드 비용 최적화
- Vercel 함수 호출 비용 분석
- 불필요한 리소스 정리
- 비용 이상 감지 알림 설정

---

## 배포 전 필수 게이트

```
Gate 1. TEAM_H 보안 승인
        → TEAM_H_SECURITY/reports/ 에 APPROVED 상태 확인
        → 미승인 시 배포 절대 불가

Gate 2. TEAM_I 코드 리뷰 통과
        → TEAM_I_REVIEW/reviews/ 에 APPROVE 상태 확인

Gate 3. 자동화 테스트
        → npm run test (커버리지 80% 이상)
        → npm run lint (에러 0개)
        → npx tsc --noEmit (타입 에러 0개)

Gate 4. 빌드 성공
        → npm run build 성공 확인

Gate 5. 환경변수 검증
        → .env.production 에 필수 변수 모두 설정 확인
```

---

## 버그 리포트 작성 규칙

```markdown
# BUG-NNN-TEAM_X: [버그 제목]

## 심각도: CRITICAL / HIGH / MEDIUM / LOW
## 발견 환경: production / staging / local

## 재현 단계
1. [첫 번째 단계]
2. [두 번째 단계]

## 기대 동작
[어떻게 동작해야 하는지]

## 실제 동작
[실제로 무슨 일이 일어나는지]

## 에러 로그
```
[Sentry 에러 스택트레이스]
```

## 영향 범위
[영향받는 사용자 / 기능]

## 담당팀: TEAM_X
```

---

## 테스트 전략

```
단위 테스트:  핵심 비즈니스 로직, 유틸 함수 (Vitest)
통합 테스트:  API 엔드포인트, DB 쿼리
E2E 테스트:   핵심 사용자 플로우 (Playwright, 선택)
커버리지 목표: 80% 이상
```

---

## 모니터링 설정

```
Sentry:     에러율 > 1% → Slack 알림
Vercel:     함수 에러 / 빌드 실패 → 즉시 알림
Uptime:     외부 모니터링 서비스 (UptimeRobot 등) 설정
Performance: Core Web Vitals 이상 감지
```

---

## 산출물 저장 위치

| 산출물 | 경로 |
|---|---|
| 버그 리포트 | `TEAM_D_QA/bugs/BUG-NNN-TEAM_X.md` |
| 테스트 파일 | `TEAM_D_QA/tests/` |
| 배포 설정 | `TEAM_D_QA/deploy/` |

---

## 입력/출력

| 입력 (받는 것) | 출력 (주는 것) |
|---|---|
| 개발 완료 코드 | 버그 리포트 |
| TEAM_H 보안 승인 | 배포 실행 |
| TEAM_I 리뷰 통과 | 배포 결과 보고 |

---

*버전: v1.0 | TEAM_D | 2026.02.26*
