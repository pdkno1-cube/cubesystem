# 🏢 프로그램 개발팀 멀티 에이전트 시스템

> **⚠️ 이 파일을 가장 먼저 읽으세요 — 모든 에이전트의 헌법입니다.**
> 버전: v4.0 | 최종 수정: 2026.02.24

---

## 📐 전체 시스템 구조

```
GUIDE.md    ← ★★★ 모든 대화의 1순위 (CEO 가이드 & 총괄)
AGENTS.md   ← ★★  시스템 헌법 (이 파일)
PRIME.md    ← ★   CTO 오케스트레이터 철학 & 프로토콜
│
├── TEAM_G_DESIGN/    ← 🏗️ ARCHITECT · 📋 PRD_MASTER     (설계)
├── TEAM_H_SECURITY/  ← 🛡️ SEC_ARCHITECT · 🔍 PENTESTER · 🔒 COMPLIANCE  (보안)  ★ NEW
├── TEAM_A_PM/        ← ✍️ POET · 📢 VIRAL                (기획)
├── TEAM_B_FRONTEND/  ← ⚙️ FE_LOGIC · 🎨 FE_VISUAL · ⚡ PERF_HACKER       (프론트)
├── TEAM_C_BACKEND/   ← 🛡️ BE_SYSTEM · 🗄️ DB_MASTER · 📊 DATA_OPS · 💰 FIN_OPS  (백엔드)
├── TEAM_D_QA/        ← 🌐 SRE_MASTER · 🕵️ SHERLOCK · 💰 FIN_OPS(인프라)  (QA/배포)
├── TEAM_E_MGMT/      ← 팀 관리 & 운영
├── TEAM_F_SKILLS/    ← 🔮 ALCHEMIST · 스킬 라이브러리
│
└── SHARED/
    ├── CONVENTIONS.md
    ├── STACK.md
    ├── TEAM_STATUS.md
    └── SKILL_REGISTRY.md
```

---

## 🤖 전체 팀 구성 (8개 팀 / 19개 에이전트)

| 우선순위 | 팀 코드 | 팀명 | 내장 에이전트 | 터미널 |
|---|---|---|---|---|
| **0** | `GUIDE` | **CEO 가이드 & 총괄** | 전체 시스템 인지, CEO 코칭 | **모든 대화** |
| 1 | `TEAM_G_DESIGN` | 시스템 설계 & PRD | 🏛️ ARCHITECT · 📋 PRD_MASTER | T-7 |
| 2 | `TEAM_H_SECURITY` | **보안 전문가** | 🛡️ SEC_ARCHITECT · 🔍 PENTESTER · 🔒 COMPLIANCE | T-8 |
| 3 | `TEAM_A_PM` | PM & 기획팀 | ✍️ POET · 📢 VIRAL | T-1 |
| 4 | `TEAM_B_FRONTEND` | 프론트엔드팀 | ⚙️ FE_LOGIC · 🎨 FE_VISUAL · ⚡ PERF_HACKER | T-2 |
| 5 | `TEAM_C_BACKEND` | 백엔드팀 | 🛡️ BE_SYSTEM · 🗄️ DB_MASTER · 📊 DATA_OPS · 💰 FIN_OPS | T-3 |
| 6 | `TEAM_D_QA` | QA & 배포팀 | 🌐 SRE_MASTER · 🕵️ SHERLOCK · 💰 FIN_OPS(인프라) | T-4 |
| 7 | `TEAM_E_MGMT` | 팀 관리 & 운영 | 전체 조율 & 현황 추적 | T-5 |
| 8 | `TEAM_F_SKILLS` | 스킬 & AI | 🔮 ALCHEMIST · 스킬 라이브러리 | T-6 |

---

## 🔗 전체 오케스트레이션 흐름 (v4.0)

```
CEO 아이디어 / 요청
      │
      ▼
  🧭 GUIDE  ←── 모든 대화 최우선 인식
  의도파악 → 팀배정 → 지시문생성 → CEO코칭
      │
      ▼
  👑 PRIME (배후 CTO — PRIME.md)
      │
      ├──→ 🏗️ T-7 TEAM_G  [설계 & PRD]  ← 프로젝트 시작점
      │          ↓ 설계서 인계
      ├──→ 🔐 T-8 TEAM_H  [보안 검토]   ← 설계 단계부터 보안
      │          ↓ 보안 요구사항 추가
      ├──→ 🧭 T-1 TEAM_A  [기획 & 티켓]
      │          ↓ 티켓 발행
      ├──→ 🎨 T-2 TEAM_B  [프론트엔드 개발]  ┐ 병렬
      ├──→ ⚙️ T-3 TEAM_C  [백엔드 개발]      ┘ 개발
      │          ↓ 개발 완료
      ├──→ 🔐 T-8 TEAM_H  [배포 전 보안 게이트]  ← 보안 승인 필수
      ├──→ 🔍 T-4 TEAM_D  [테스트 & 배포]
      ├──→ 🗂️ T-5 TEAM_E  [상시: 전체 조율]
      └──→ 🧰 T-6 TEAM_F  [상시: 스킬 & AI]
```

---

## 📋 공통 규칙 (모든 에이전트 필수 준수)

### 1. 파일 읽기 순서
```
1순위: GUIDE.md              ← ★ 모든 대화 최우선
2순위: AGENTS.md             ← 전체 구조 (이 파일)
3순위: PRIME.md              ← CTO 철학 & 프로토콜
4순위: 자신의 AGENT.md       ← 팀 역할
5순위: SHARED/CONVENTIONS.md ← 코딩 규약
6순위: 작업 지시 수행
```

### 2. 프로젝트 진행 필수 순서
```
TEAM_G 설계 → TEAM_H 보안검토 → TEAM_A 기획
→ TEAM_B+C 개발 → TEAM_H 보안게이트 → TEAM_D 배포

★ TEAM_H 보안 승인 없이 프로덕션 배포 절대 불가
★ TEAM_G 설계 없이 개발 시작 절대 불가
```

### 3. 팀 간 소통 프로토콜

| 방향 | 파일 경로 |
|---|---|
| TEAM_G → TEAM_A (설계 인계) | `TEAM_G_DESIGN/prd/PRD-*.md` + `architecture/ARCH-*.md` |
| TEAM_H → 각팀 (취약점) | `TEAM_H_SECURITY/reports/VULN-NNN-TEAM_X.md` |
| TEAM_A → 각팀 (티켓) | `TEAM_A_PM/tickets/TICKET-NNN-TEAM_X.md` |
| TEAM_D → 각팀 (버그) | `TEAM_D_QA/bugs/BUG-NNN-TEAM_X.md` |
| 각팀 → TEAM_F (스킬) | `TEAM_F_SKILLS/requests/SKILL-REQ-NNN.md` |

### 4. 명령어 (모든 터미널 공통)

| 명령어 | 동작 |
|---|---|
| `/guide [요청]` | GUIDE: 요청 분석 + 팀 배정 + 지시문 생성 |
| `/design [아이디어]` | TEAM_G: PRD + 아키텍처 설계 |
| `/security [대상]` | TEAM_H: 보안 검토 요청 |
| `/build [목표]` | 전체 Squad: Production-ready 코드 |
| `/audit` | TEAM_H + TEAM_D: 보안·속도·비용·SEO 진단 |
| `/scale` | TEAM_C + TEAM_D: 대규모 트래픽 리팩토링 |
| `/skill [이름]` | TEAM_F: 스킬 조회·개발 요청 |
| `/status` | TEAM_E: 전체 팀 현황 |

---

## 🚀 터미널 시작 명령어 (v4.0)

```bash
# ★ GUIDE.md를 맨 앞에 로드하는 것이 핵심

# 모든 터미널 공통 형식:
# claude --system-prompt "$(cat GUIDE.md) $(cat PRIME.md) $(cat TEAM_X/AGENT.md)"

# 실제 명령어:
claude --system-prompt "$(cat GUIDE.md) $(cat PRIME.md) $(cat TEAM_A_PM/AGENT.md)"       # T-1
claude --system-prompt "$(cat GUIDE.md) $(cat PRIME.md) $(cat TEAM_B_FRONTEND/AGENT.md)" # T-2
claude --system-prompt "$(cat GUIDE.md) $(cat PRIME.md) $(cat TEAM_C_BACKEND/AGENT.md)"  # T-3
claude --system-prompt "$(cat GUIDE.md) $(cat PRIME.md) $(cat TEAM_D_QA/AGENT.md)"       # T-4
claude --system-prompt "$(cat GUIDE.md) $(cat PRIME.md) $(cat TEAM_E_MGMT/AGENT.md)"     # T-5
claude --system-prompt "$(cat GUIDE.md) $(cat PRIME.md) $(cat TEAM_F_SKILLS/AGENT.md)"   # T-6
claude --system-prompt "$(cat GUIDE.md) $(cat PRIME.md) $(cat TEAM_G_DESIGN/AGENT.md)"   # T-7
claude --system-prompt "$(cat GUIDE.md) $(cat PRIME.md) $(cat TEAM_H_SECURITY/AGENT.md)" # T-8
```

> 💡 **로드 순서**: GUIDE.md → PRIME.md → TEAM AGENT.md
> GUIDE가 맨 앞에 있어야 모든 대화에서 첫 번째로 인식됩니다.

---

## 📁 전체 디렉토리 구조 (v4.0)

```
project-root/
├── GUIDE.md                          ← ★★★ 모든 대화 최우선 로드
├── AGENTS.md                         ← ★★  시스템 헌법
├── PRIME.md                          ← ★   CTO 프로토콜
│
├── SHARED/
│   ├── CONVENTIONS.md
│   ├── STACK.md
│   ├── TEAM_STATUS.md
│   └── SKILL_REGISTRY.md
│
├── TEAM_G_DESIGN/
│   ├── AGENT.md, TASKS.md
│   ├── architecture/  (ARCH-*.md)
│   └── prd/           (PRD-*.md)
│
├── TEAM_H_SECURITY/                  ← ★ NEW
│   ├── AGENT.md, TASKS.md
│   ├── architecture/  (SEC-ARCH-*.md, THREAT-MODEL-*.md)
│   └── reports/       (VULN-NNN-TEAM_X.md, PENTEST-*.md)
│
├── TEAM_A_PM/
│   ├── AGENT.md, TASKS.md
│   ├── requirements/
│   └── tickets/
│
├── TEAM_B_FRONTEND/  (AGENT.md, TASKS.md, src/)
├── TEAM_C_BACKEND/   (AGENT.md, TASKS.md, src/)
│
├── TEAM_D_QA/
│   ├── AGENT.md, TASKS.md
│   ├── bugs/, tests/, deploy/
│
├── TEAM_E_MGMT/
│   ├── AGENT.md, TASKS.md
│   ├── TEAM_ROSTER.md, WORK_LOG.md
│   └── MEETING_NOTES/
│
└── TEAM_F_SKILLS/
    ├── AGENT.md, TASKS.md
    ├── registry/ (INDEX.md, SKILL-*.md)
    ├── requests/
    └── deprecated/
```

---

*버전: v4.0 | 최종 수정: 2026.02.24 | 팀: 8개 | 에이전트: 19개*
