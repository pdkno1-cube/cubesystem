#!/bin/bash
# ============================================================
# 🚀 Claude Code 멀티 에이전트 시스템 자동 설치 스크립트
# 실행: bash setup.sh [프로젝트경로]
# 예시: bash setup.sh ~/my-project
# ============================================================

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
info() { echo -e "${CYAN}ℹ️  $1${NC}"; }
step() { echo -e "\n${BLUE}${BOLD}── $1 ──────────────────────────${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$(pwd)}"

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║  Claude Code 멀티 에이전트 시스템 v4.0 셋업  ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"
info "소스: $SCRIPT_DIR"
info "대상: $TARGET"

# ── Step 1: 폴더 준비 ──────────────────────────────
step "Step 1: 프로젝트 폴더 준비"
mkdir -p "$TARGET"
cd "$TARGET"
log "작업 디렉토리: $(pwd)"

# ── Step 2: 시스템 파일 복사 ───────────────────────
step "Step 2: 시스템 파일 복사"

FILES=(
  "GUIDE.md" "AGENTS.md" "PRIME.md" "운영매뉴얼.md"
  "TEAM_A_PM/AGENT.md" "TEAM_A_PM/TASKS.md"
  "TEAM_B_FRONTEND/AGENT.md" "TEAM_B_FRONTEND/TASKS.md"
  "TEAM_C_BACKEND/AGENT.md" "TEAM_C_BACKEND/TASKS.md"
  "TEAM_D_QA/AGENT.md" "TEAM_D_QA/TASKS.md"
  "TEAM_E_MGMT/AGENT.md" "TEAM_E_MGMT/TASKS.md"
  "TEAM_E_MGMT/TEAM_ROSTER.md" "TEAM_E_MGMT/WORK_LOG.md"
  "TEAM_F_SKILLS/AGENT.md" "TEAM_F_SKILLS/TASKS.md"
  "TEAM_F_SKILLS/registry/INDEX.md"
  "TEAM_G_DESIGN/AGENT.md" "TEAM_G_DESIGN/TASKS.md"
  "TEAM_H_SECURITY/AGENT.md" "TEAM_H_SECURITY/TASKS.md"
  "SHARED/CONVENTIONS.md" "SHARED/STACK.md"
  "SHARED/TEAM_STATUS.md" "SHARED/SKILL_REGISTRY.md"
)

for f in "${FILES[@]}"; do
  src="$SCRIPT_DIR/$f"
  dst="$TARGET/$f"
  if [ "$src" = "$dst" ]; then
    log "이미 존재(스킵): $f"
  elif [ -f "$src" ]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    log "복사: $f"
  else
    warn "없음(스킵): $f"
  fi
done

# 빈 폴더 생성
for d in \
  "TEAM_A_PM/tickets" "TEAM_A_PM/requirements" \
  "TEAM_B_FRONTEND/src" "TEAM_C_BACKEND/src" \
  "TEAM_D_QA/bugs" "TEAM_D_QA/tests" "TEAM_D_QA/deploy" \
  "TEAM_E_MGMT/MEETING_NOTES" \
  "TEAM_F_SKILLS/requests" "TEAM_F_SKILLS/deprecated" \
  "TEAM_G_DESIGN/architecture" "TEAM_G_DESIGN/prd" \
  "TEAM_H_SECURITY/architecture" "TEAM_H_SECURITY/reports"
do
  mkdir -p "$TARGET/$d"
done
log "하위 폴더 생성 완료"

# ── Step 3: CLAUDE.md 생성 ─────────────────────────
step "Step 3: CLAUDE.md 생성"

cat > "$TARGET/CLAUDE.md" << 'CEOF'
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
CEOF
log "CLAUDE.md 생성"

# ── Step 4: .claude 설정 ───────────────────────────
step "Step 4: .claude 설정 폴더"
mkdir -p "$TARGET/.claude/commands" "$TARGET/.claude/agents"

cat > "$TARGET/.claude/settings.json" << 'SEOF'
{
  "permissions": {
    "allow": [
      "Bash(npm run *)", "Bash(git status)", "Bash(git diff *)",
      "Bash(git log *)", "Bash(git add *)", "Bash(git commit *)",
      "Bash(git checkout *)", "Bash(git branch *)", "Bash(git stash *)",
      "Bash(cat *)", "Bash(ls *)", "Bash(mkdir -p *)",
      "Bash(cp *)", "Bash(mv *)", "Bash(grep *)", "Bash(find *)", "Bash(echo *)"
    ],
    "deny": [
      "Bash(rm -rf *)", "Bash(sudo *)",
      "Read(.env)", "Read(.env.*)", "Write(.env)", "Write(.env.*)"
    ]
  },
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "echo '🚀 시스템 v4.0 | GUIDE.md → AGENTS.md → PRIME.md 읽기 권장' && git status 2>/dev/null | head -3",
        "timeout": 5
      }]
    }]
  }
}
SEOF
log "settings.json 생성"

# ── Step 5: 슬래시 명령어 ──────────────────────────
step "Step 5: 슬래시 명령어"
CMD="$TARGET/.claude/commands"

echo 'GUIDE.md, AGENTS.md를 읽고 분석해:
$ARGUMENTS
형식: 📌의도 / 📋작업순서 / 📨지시문 / 💡코칭' > "$CMD/guide.md"

echo 'GUIDE.md, AGENTS.md, PRIME.md, TEAM_G_DESIGN/AGENT.md 읽어.
TEAM_G로서 설계: $ARGUMENTS
산출: TEAM_G_DESIGN/prd/PRD-v1.md + TEAM_G_DESIGN/architecture/ARCH-v1.md' > "$CMD/design.md"

echo 'AGENTS.md, TEAM_H_SECURITY/AGENT.md 읽어.
TEAM_H로서 보안 점검: $ARGUMENTS
OWASP Top 10 기준, 취약점 → TEAM_H_SECURITY/reports/VULN-NNN-TEAM_X.md 생성' > "$CMD/security.md"

echo 'GUIDE.md, AGENTS.md, PRIME.md 읽어.
ZERO-LATENCY 5대 규칙 + COMMERCIALIZATION 3대 표준 자동 적용해서 Production-ready 코드:
$ARGUMENTS' > "$CMD/build.md"

echo 'AGENTS.md, TEAM_H_SECURITY/AGENT.md, TEAM_D_QA/AGENT.md 읽어.
4가지 기준으로 전체 진단 (심각도 CRITICAL/HIGH/MEDIUM/LOW):
🔐 보안(OWASP Top 10) / ⚡ 성능(Core Web Vitals) / 💰 비용(캐싱/API) / 🔍 품질(에러/타입)' > "$CMD/audit.md"

echo 'AGENTS.md, TEAM_E_MGMT/AGENT.md, SHARED/TEAM_STATUS.md 읽어.
TEAM_E 관리자로서 전체 팀 현황 보고: 진행중/블로킹/완료/다음액션' > "$CMD/status.md"

log "슬래시 명령어 6개 생성: /guide /design /security /build /audit /status"

# ── Step 6: 서브에이전트 ───────────────────────────
step "Step 6: 서브에이전트"
AG="$TARGET/.claude/agents"

cat > "$AG/team-g-design.md" << 'EOF'
---
name: team-g-design
description: 시스템 설계 & PRD. 키워드: 설계, PRD, 아키텍처, 요구사항, 새로 만들고 싶어
---
GUIDE.md, AGENTS.md, PRIME.md, TEAM_G_DESIGN/AGENT.md 읽고 ARCHITECT+PRD_MASTER로 작업.
EOF

cat > "$AG/team-h-security.md" << 'EOF'
---
name: team-h-security
description: 보안 전문가. 키워드: 보안, 취약점, 인증, 권한, OWASP
---
GUIDE.md, AGENTS.md, PRIME.md, TEAM_H_SECURITY/AGENT.md 읽고 SEC_ARCHITECT+PENTESTER+COMPLIANCE로 작업.
EOF

cat > "$AG/team-a-pm.md" << 'EOF'
---
name: team-a-pm
description: PM & 기획. 키워드: 기획, 티켓, 우선순위, SEO, 카피
---
GUIDE.md, AGENTS.md, PRIME.md, TEAM_A_PM/AGENT.md 읽고 POET+VIRAL 포함 PM으로 작업.
EOF

cat > "$AG/team-b-frontend.md" << 'EOF'
---
name: team-b-frontend
description: 프론트엔드. 키워드: 화면, UI, 버튼, 컴포넌트, 프론트
---
GUIDE.md, AGENTS.md, PRIME.md, TEAM_B_FRONTEND/AGENT.md 읽고 FE_LOGIC+FE_VISUAL+PERF_HACKER로 작업.
EOF

cat > "$AG/team-c-backend.md" << 'EOF'
---
name: team-c-backend
description: 백엔드. 키워드: API, DB, 서버, 데이터, 백엔드
---
GUIDE.md, AGENTS.md, PRIME.md, TEAM_C_BACKEND/AGENT.md 읽고 BE_SYSTEM+DB_MASTER+DATA_OPS+FIN_OPS로 작업.
EOF

cat > "$AG/team-d-qa.md" << 'EOF'
---
name: team-d-qa
description: QA & 배포. 키워드: 배포, 테스트, 버그, 오류
---
GUIDE.md, AGENTS.md, PRIME.md, TEAM_D_QA/AGENT.md 읽고 SRE_MASTER+SHERLOCK+FIN_OPS로 작업.
EOF

cat > "$AG/team-e-mgmt.md" << 'EOF'
---
name: team-e-mgmt
description: 팀 관리. 키워드: 현황, 상태, 진행, 관리
---
GUIDE.md, AGENTS.md, PRIME.md, TEAM_E_MGMT/AGENT.md 읽고 팀 관리자로 작업.
EOF

cat > "$AG/team-f-skills.md" << 'EOF'
---
name: team-f-skills
description: 스킬 & AI. 키워드: AI, LLM, 프롬프트, 챗봇, RAG
---
GUIDE.md, AGENTS.md, PRIME.md, TEAM_F_SKILLS/AGENT.md 읽고 ALCHEMIST로 작업.
EOF

log "서브에이전트 8개 생성"

# ── Step 7: 전역 설정 ──────────────────────────────
step "Step 7: 전역 설정"
mkdir -p ~/.claude

if [ ! -f ~/.claude/CLAUDE.md ]; then
  echo '# 전역 원칙
- TypeScript strict 항상 사용
- 에러: Sentry급 추적 (console.log 단독 금지)
- 결론부터, 코드는 즉시 실행 가능한 완성 형태' > ~/.claude/CLAUDE.md
  log "~/.claude/CLAUDE.md 생성"
else
  warn "~/.claude/CLAUDE.md 존재 (스킵)"
fi

if [ ! -f ~/.claude/settings.json ]; then
  echo '{"permissions":{"allow":["Bash(git *)","Bash(npm run *)","Bash(ls *)","Bash(cat *)"]}}' > ~/.claude/settings.json
  log "~/.claude/settings.json 생성"
else
  warn "~/.claude/settings.json 존재 (스킵)"
fi

# ── 완료 ───────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║            ✅ 설치 완료!                      ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "${CYAN}다음 단계:${NC}"
echo ""
echo "  1. cd $TARGET"
echo "  2. claude"
echo "  3. CLAUDE.md 읽고 준비됐으면 알려줘"
echo "  4. /guide 로그인 기능 만들고 싶어  (테스트)"
echo ""
echo -e "${YELLOW}alias 등록 (~/.zshrc):${NC}"
echo "  alias cc-design='cd $TARGET && claude --append-system-prompt \"\$(cat GUIDE.md) \$(cat PRIME.md) \$(cat TEAM_G_DESIGN/AGENT.md)\"'"
echo "  alias cc-back='cd $TARGET && claude --append-system-prompt \"\$(cat GUIDE.md) \$(cat PRIME.md) \$(cat TEAM_C_BACKEND/AGENT.md)\"'"
echo ""
echo "  [전체 alias는 CLI_적용가이드.md PART 8 참조]"
