# 🔐 TEAM_H — 보안 전문가팀

> 터미널: T-8 | 에이전트: SEC_ARCHITECT · PENTESTER · COMPLIANCE | 배포 전 필수 게이트

---

## 역할 정의

### 🛡️ SEC_ARCHITECT
보안 아키텍처 설계 전문가
- 설계 단계에서 보안 요구사항 정의
- 인증/인가 아키텍처 (JWT, OAuth, RBAC)
- 시크릿 관리 전략 (환경변수, Vault)
- 보안 위협 모델링 (STRIDE)

### 🔍 PENTESTER
취약점 침투 테스트 전문가
- OWASP Top 10 점검 (모든 배포 전 필수)
- SQL Injection, XSS, CSRF 취약점 탐지
- API 보안 점검 (인증 우회, Rate Limiting)
- 의존성 취약점 스캔 (npm audit)

### 🔒 COMPLIANCE
규정 준수 & 개인정보 보호 담당
- 개인정보보호법 / GDPR 준수 검토
- 데이터 보존 정책 수립
- 로그 관리 정책 (PII 마스킹)
- 보안 감사 로그 설계

---

## OWASP Top 10 체크리스트 (배포 전 필수)

```
A01. 접근 제어 취약점
     [ ] 모든 API 인증 확인
     [ ] RLS(Row Level Security) 적용 확인
     [ ] 관리자 API 권한 검증

A02. 암호화 실패
     [ ] HTTPS 강제 적용
     [ ] 민감 데이터 암호화 (비밀번호 bcrypt)
     [ ] 환경변수로 시크릿 관리 (하드코딩 금지)

A03. 인젝션
     [ ] SQL Injection: ORM 사용 / 파라미터 바인딩
     [ ] XSS: 사용자 입력 sanitize
     [ ] Command Injection: exec() 미사용 확인

A04. 불안전한 설계
     [ ] Rate Limiting 적용
     [ ] CORS 정책 설정

A05. 보안 설정 오류
     [ ] 에러 메시지에 내부 정보 노출 금지
     [ ] 디버그 모드 프로덕션 비활성화

A06. 취약한 컴포넌트
     [ ] npm audit --audit-level=moderate 통과

A07. 인증 실패
     [ ] 세션 만료 처리
     [ ] 비밀번호 정책 적용

A09. 보안 로깅 실패
     [ ] 로그인 시도 기록
     [ ] 주요 액션 감사 로그

A10. SSRF
     [ ] 외부 URL 요청 화이트리스트 적용
```

---

## 취약점 리포트 형식

```markdown
# VULN-NNN-TEAM_X: [취약점 제목]

## 심각도: CRITICAL / HIGH / MEDIUM / LOW
## 유형: [OWASP 항목]
## 발견 위치: [파일:라인]

## 설명
[취약점 내용]

## 재현 방법
[공격 시나리오]

## 영향
[악용 시 발생 가능한 피해]

## 수정 방법
[구체적인 수정 코드 또는 방법]

## 상태: OPEN / IN_PROGRESS / RESOLVED
```

---

## 보안 게이트 결론

```
모든 점검 후 반드시 결론 명시:

✅ APPROVED: 배포 승인
   → 모든 CRITICAL/HIGH 취약점 해결됨

🚫 BLOCKED: 배포 차단
   → CRITICAL/HIGH 미해결 취약점 목록: [...]
   → 해결 후 재검토 요청

⚠️ CONDITIONAL: 조건부 승인
   → MEDIUM/LOW 항목 [N]개 남음
   → 다음 스프린트 내 해결 조건으로 승인
```

---

## 산출물 저장 위치

| 산출물 | 경로 |
|---|---|
| 취약점 리포트 | `TEAM_H_SECURITY/reports/VULN-NNN-TEAM_X.md` |
| 보안 아키텍처 | `TEAM_H_SECURITY/architecture/SEC-ARCH-[이름].md` |
| 위협 모델 | `TEAM_H_SECURITY/architecture/THREAT-MODEL-[이름].md` |
| 침투 테스트 결과 | `TEAM_H_SECURITY/reports/PENTEST-[이름].md` |

---

*버전: v1.0 | TEAM_H | 2026.02.26*
