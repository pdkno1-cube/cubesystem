# The Master OS — 환경변수 & 설정 목록

> 모든 환경변수는 `.env` 파일에 정의하고, Vault에서 런타임 주입한다.
> 형식: `VARIABLE_NAME=설명 | 기본값 | 필수여부`

---

## 1. Supabase

```bash
# Supabase 연결
SUPABASE_URL=Supabase 프로젝트 URL | http://localhost:54321 | 필수
SUPABASE_ANON_KEY=Supabase 익명(공개) 키 | (로컬 자동 생성) | 필수
SUPABASE_SERVICE_ROLE_KEY=Supabase 서비스 롤 키 (서버 전용, RLS 우회) | (로컬 자동 생성) | 필수
SUPABASE_JWT_SECRET=Supabase JWT 서명 키 | (로컬 자동 생성) | 필수
SUPABASE_DB_URL=PostgreSQL 직접 연결 URL | postgresql://postgres:postgres@localhost:54322/postgres | 선택
```

---

## 2. FastAPI

```bash
# FastAPI 서버 설정
API_HOST=FastAPI 바인드 호스트 | 0.0.0.0 | 필수
API_PORT=FastAPI 포트 | 8000 | 필수
API_ENV=실행 환경 (development/staging/production) | development | 필수
API_DEBUG=디버그 모드 | true | 선택
API_CORS_ORIGINS=허용 CORS 오리진 (콤마 구분) | http://localhost:3000 | 필수
API_SECRET_KEY=세션/CSRF 시크릿 키 | (랜덤 생성) | 필수
API_RATE_LIMIT_PER_MINUTE=분당 API 요청 제한 | 100 | 선택
API_WORKERS=Uvicorn 워커 수 | 4 | 선택
```

---

## 3. Next.js 프론트엔드

```bash
# Next.js 퍼블릭 환경변수 (NEXT_PUBLIC_ 접두사)
NEXT_PUBLIC_SUPABASE_URL=브라우저용 Supabase URL | http://localhost:54321 | 필수
NEXT_PUBLIC_SUPABASE_ANON_KEY=브라우저용 Supabase 익명 키 | (로컬 자동 생성) | 필수
NEXT_PUBLIC_API_BASE_URL=FastAPI 베이스 URL | http://localhost:8000 | 필수
NEXT_PUBLIC_APP_NAME=애플리케이션 이름 | The Master OS | 선택
NEXT_PUBLIC_MIXPANEL_TOKEN=Mixpanel 프로젝트 토큰 | (없음) | 선택
```

---

## 4. LangGraph / AI 모델

```bash
# LangGraph 설정
LANGGRAPH_WORKER_COUNT=동시 워크플로우 실행 수 | 4 | 선택
LANGGRAPH_MAX_STEPS=워크플로우 최대 실행 스텝 | 50 | 선택
LANGGRAPH_TIMEOUT_SECONDS=워크플로우 타임아웃 (초) | 300 | 선택

# AI 모델 API 키
ANTHROPIC_API_KEY=Anthropic (Claude) API 키 | (없음) | 필수
OPENAI_API_KEY=OpenAI (GPT) API 키 (폴백/보조용) | (없음) | 선택

# 모델 기본값
DEFAULT_MODEL_OPUS=기본 Opus 모델 ID | claude-opus-4-6 | 선택
DEFAULT_MODEL_SONNET=기본 Sonnet 모델 ID | claude-sonnet-4-6 | 선택
DEFAULT_MODEL_HAIKU=기본 Haiku 모델 ID | claude-haiku-4-5-20251001 | 선택
```

---

## 5. 외부 서비스 API 키

```bash
# FireCrawl — 웹 스크래핑
FIRECRAWL_API_KEY=FireCrawl API 키 | (없음) | 필수
FIRECRAWL_BASE_URL=FireCrawl API 베이스 URL | https://api.firecrawl.dev | 선택

# PaddleOCR — 서류 판독
PADDLEOCR_API_URL=PaddleOCR 서비스 URL | http://localhost:8080 | 필수
PADDLEOCR_SERVICE_TOKEN=PaddleOCR 내부 서비스 토큰 | (없음) | 선택

# Google Drive — 문서 입출력
GOOGLE_SERVICE_ACCOUNT_JSON=Google 서비스 계정 키 JSON (Base64 인코딩) | (없음) | 필수
GOOGLE_DRIVE_ROOT_FOLDER_ID=루트 폴더 ID | (없음) | 필수

# Figma — 이미지 렌더링
FIGMA_API_KEY=Figma Personal Access Token | (없음) | 필수
FIGMA_TEAM_ID=Figma 팀 ID | (없음) | 선택

# Slack — 결재/보고
SLACK_BOT_TOKEN=Slack Bot OAuth Token (xoxb-...) | (없음) | 필수
SLACK_SIGNING_SECRET=Slack 요청 서명 시크릿 | (없음) | 필수
SLACK_WEBHOOK_URL=Slack Incoming Webhook URL | (없음) | 선택
SLACK_CHANNEL_ALERTS=장애 알림 채널 ID | (없음) | 필수
SLACK_CHANNEL_APPROVALS=결재 요청 채널 ID | (없음) | 필수
SLACK_CHANNEL_REPORTS=보고서 채널 ID | (없음) | 필수
```

---

## 6. 보안

```bash
# 암호화
VAULT_ENCRYPTION_KEY=AES-256 마스터 암호화 키 (32 bytes, Base64) | (없음) | 필수
VAULT_KEY_ROTATION_DAYS=키 자동 로테이션 주기 (일) | 90 | 선택

# JWT 인증
JWT_SECRET_KEY=JWT 서명 시크릿 키 | (없음) | 필수
JWT_ALGORITHM=JWT 알고리즘 | HS256 | 선택
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=액세스 토큰 만료 (분) | 30 | 선택
JWT_REFRESH_TOKEN_EXPIRE_DAYS=리프레시 토큰 만료 (일) | 7 | 선택

# MFA
MFA_ISSUER=TOTP 발급자 이름 | TheMasterOS | 선택
MFA_ENABLED=MFA 강제 여부 | true | 선택
```

---

## 7. ChromaDB (벡터DB)

```bash
# ChromaDB 연결
CHROMA_HOST=ChromaDB 호스트 | localhost | 필수
CHROMA_PORT=ChromaDB 포트 | 8001 | 필수
CHROMA_COLLECTION_PREFIX=컬렉션 접두사 | masteros_ | 선택

# 임베딩 설정
EMBEDDING_MODEL=임베딩 모델 | text-embedding-3-small | 선택
EMBEDDING_DIMENSION=임베딩 벡터 차원 | 1536 | 선택
```

---

## 8. 모니터링 & 로깅

```bash
# Sentry — 에러 추적
SENTRY_DSN=Sentry DSN URL | (없음) | 필수 (production)
SENTRY_ENVIRONMENT=Sentry 환경 태그 | development | 선택
SENTRY_TRACES_SAMPLE_RATE=트레이스 샘플링 비율 (0.0~1.0) | 0.1 | 선택

# Mixpanel — 사용자 분석
MIXPANEL_TOKEN=Mixpanel 프로젝트 토큰 | (없음) | 선택
MIXPANEL_API_SECRET=Mixpanel API 시크릿 | (없음) | 선택

# 로깅
LOG_LEVEL=로그 레벨 (DEBUG/INFO/WARNING/ERROR) | INFO | 선택
LOG_FORMAT=로그 포맷 (json/text) | json | 선택
```

---

## 9. 인프라 & 배포

```bash
# Cloudflare Tunnel
CLOUDFLARE_TUNNEL_TOKEN=Cloudflare Tunnel 토큰 | (없음) | 필수 (production)
CLOUDFLARE_TUNNEL_ID=Tunnel ID | (없음) | 필수 (production)

# Docker
COMPOSE_PROJECT_NAME=Docker Compose 프로젝트명 | the-master-os | 선택

# Vercel (프론트엔드 배포 시)
VERCEL_TOKEN=Vercel 배포 토큰 | (없음) | 선택
```

---

## 환경별 필수 변수 체크리스트

| 변수 그룹 | Development | Staging | Production |
|-----------|:-----------:|:-------:|:----------:|
| Supabase | ✅ (로컬) | ✅ | ✅ |
| FastAPI | ✅ | ✅ | ✅ |
| Next.js Public | ✅ | ✅ | ✅ |
| LangGraph | ✅ | ✅ | ✅ |
| Anthropic API | ✅ | ✅ | ✅ |
| 외부 서비스 키 | 선택 | ✅ | ✅ |
| 보안 (Vault, JWT) | ✅ | ✅ | ✅ |
| ChromaDB | ✅ (로컬) | ✅ | ✅ |
| Sentry | ❌ | ✅ | ✅ |
| Cloudflare | ❌ | ❌ | ✅ |
