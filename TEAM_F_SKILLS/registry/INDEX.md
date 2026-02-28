# 📖 스킬 레지스트리 INDEX

> 관리: TEAM_F (ALCHEMIST) | 마지막 업데이트: 2026.02.28

---

## 등록된 스킬

| ID | 스킬명 | 카테고리 | 버전 | 파일 |
|---|---|---|---|---|
| S-001 | SKILL-NEWSLETTER-AGENT | ai / integration | v1.0 | SKILL-NEWSLETTER-AGENT.md |
| S-002 | SKILL-SHORTFORM-AGENT | ai / text | v1.0 | SKILL-SHORTFORM-AGENT.md |
| S-003 | PROMPT-CATALOG (22 에이전트) | ai / automation | v1.0 | PROMPT-CATALOG-v1.md |

## 에이전트 프롬프트 카탈로그

> **PROMPT-CATALOG-v1.md** — The Master OS 앱 내 22개 에이전트 시스템 프롬프트 전체 정의

| 카테고리 | 에이전트 | slug | 모델 |
|---|---|---|---|
| 토론 스웜 | OptimistAgent | optimist-agent | opus |
| 토론 스웜 | CriticAgent | critic-agent | opus |
| 토론 스웜 | RealistAgent | realist-agent | opus |
| 사업계획서 | MarketAnalystAgent | market-analyst | sonnet |
| 사업계획서 | PlanWriterAgent | plan-writer | opus |
| 사업계획서 | FinancialModelerAgent | financial-modeler | sonnet |
| OSMU 마케팅 | TopicAnalystAgent | topic-analyst-agent | sonnet |
| OSMU 마케팅 | BlogWriterAgentV2 | blog-writer-v2 | sonnet |
| OSMU 마케팅 | InstaCreatorAgent | insta-creator-agent | sonnet |
| OSMU 마케팅 | NewsletterAgent | newsletter-writer | haiku |
| OSMU 마케팅 | ShortFormAgent | shortform-scriptwriter | sonnet |
| 감사/행정 | OCRScannerAgent | ocr-scanner | sonnet |
| 감사/행정 | BidAuditorAgent | bid-auditor | opus |
| 감사/행정 | DataValidatorAgent | data-validator | haiku |
| 감사/행정 | DocArchiverAgent | doc-archiver | haiku |
| DevOps | SystemMonitorAgent | system-monitor | haiku |
| DevOps | HotfixAgent | hotfix-agent | sonnet |
| DevOps | ProxyManagerAgent | proxy-manager | haiku |
| 지주회사 | COOAgent | coo-agent | opus |
| 지주회사 | CFOAgent | cfo-agent | sonnet |
| 지주회사 | ThinkTankAgent | think-tank | opus |
| 지주회사 | SOPCenterAgent | sop-center | sonnet |

---

## 스킬 등록 방법

1. `TEAM_F_SKILLS/registry/SKILL-[이름].md` 파일 생성
2. 이 INDEX.md에 항목 추가
3. `SHARED/SKILL_REGISTRY.md` 동기화

---

## 카테고리

- `ai` — AI/LLM 관련
- `text` — 텍스트 처리
- `search` — 검색 & RAG
- `data` — 데이터 처리
- `integration` — 외부 서비스 연동
- `automation` — 자동화

---

*스킬 추가 시 반드시 이 파일 업데이트*
