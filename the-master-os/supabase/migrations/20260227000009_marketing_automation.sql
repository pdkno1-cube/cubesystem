-- =============================================================================
-- Migration: Marketing Automation Tables + Agent Seeds
-- The Master OS — Phase 4 OSMU Marketing Pipeline
-- PRD ref: TEAM_G_DESIGN/prd/PRD-MARKETING-AUTO-v1.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: newsletter_subscribers
-- -----------------------------------------------------------------------------
CREATE TABLE newsletter_subscribers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    name            TEXT,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'unsubscribed', 'bounced', 'complained')),
    tags            JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    source          TEXT DEFAULT 'manual',   -- 'manual', 'api', 'import', 'landing_page'
    subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    unsubscribed_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE (email, workspace_id)
);

CREATE INDEX idx_ns_workspace   ON newsletter_subscribers(workspace_id);
CREATE INDEX idx_ns_status      ON newsletter_subscribers(status) WHERE status = 'active';
CREATE INDEX idx_ns_email       ON newsletter_subscribers(email);
CREATE INDEX idx_ns_tags        ON newsletter_subscribers USING gin(tags);

CREATE TRIGGER trg_newsletter_subscribers_updated_at
    BEFORE UPDATE ON newsletter_subscribers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Table: content_schedules
-- Content items scheduled for multi-channel publishing.
-- -----------------------------------------------------------------------------
CREATE TABLE content_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    pipeline_id     UUID REFERENCES pipeline_runs(id) ON DELETE SET NULL,
    channel         TEXT NOT NULL
                    CHECK (channel IN (
                        'instagram', 'newsletter', 'twitter', 'linkedin', 'blog'
                    )),
    title           TEXT NOT NULL,
    content         JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    scheduled_at    TIMESTAMPTZ NOT NULL,
    published_at    TIMESTAMPTZ,
    recurrence      TEXT NOT NULL DEFAULT 'none'
                    CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
    tags            JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message   TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_cs_workspace   ON content_schedules(workspace_id);
CREATE INDEX idx_cs_channel     ON content_schedules(channel);
CREATE INDEX idx_cs_status      ON content_schedules(status) WHERE status = 'pending';
CREATE INDEX idx_cs_scheduled   ON content_schedules(scheduled_at)
                                   WHERE status = 'pending' AND deleted_at IS NULL;
CREATE INDEX idx_cs_pipeline    ON content_schedules(pipeline_id) WHERE pipeline_id IS NOT NULL;

CREATE TRIGGER trg_content_schedules_updated_at
    BEFORE UPDATE ON content_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Table: content_metrics
-- Performance KPIs per published content item (M-08 in PRD).
-- -----------------------------------------------------------------------------
CREATE TABLE content_metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    schedule_id     UUID REFERENCES content_schedules(id) ON DELETE SET NULL,
    channel         TEXT NOT NULL,
    metric_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    impressions     BIGINT NOT NULL DEFAULT 0,
    clicks          BIGINT NOT NULL DEFAULT 0,
    likes           BIGINT NOT NULL DEFAULT 0,
    shares          BIGINT NOT NULL DEFAULT 0,
    comments        BIGINT NOT NULL DEFAULT 0,
    opens           BIGINT NOT NULL DEFAULT 0,   -- for newsletter
    unsubscribes    BIGINT NOT NULL DEFAULT 0,   -- for newsletter
    raw_data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (schedule_id, metric_date)
);

CREATE INDEX idx_cm_workspace   ON content_metrics(workspace_id);
CREATE INDEX idx_cm_channel     ON content_metrics(channel);
CREATE INDEX idx_cm_date        ON content_metrics(metric_date);

CREATE TRIGGER trg_content_metrics_updated_at
    BEFORE UPDATE ON content_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- RLS Policies (mirror pattern from create_rls_policies.sql)
-- -----------------------------------------------------------------------------

-- newsletter_subscribers: workspace-scoped service-role access
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "newsletter_subscribers_service_role"
    ON newsletter_subscribers
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- content_schedules: workspace-scoped service-role access
ALTER TABLE content_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_schedules_service_role"
    ON content_schedules
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- content_metrics: workspace-scoped service-role access
ALTER TABLE content_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_metrics_service_role"
    ON content_metrics
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- Seed: InstaCreatorAgent
-- OSMU pipeline node: transforms research → Instagram caption + hashtags
-- =============================================================================
INSERT INTO agents (
    name,
    display_name,
    slug,
    description,
    icon,
    category,
    role_description,
    model_provider,
    model,
    system_prompt,
    capabilities,
    config,
    is_system,
    cost_per_run,
    status
)
VALUES (
    'InstaCreatorAgent',
    '인스타그램 콘텐츠 제작 에이전트',
    'insta-creator',
    'OSMU 파이프라인 노드: 리서치 결과를 인스타그램 캡션 + 해시태그로 변환합니다. '
    '트렌디한 어조, 최대 2,200자, 해시태그 20개 이내.',
    '📸',
    'marketing',
    '인스타그램 콘텐츠를 생성하는 마케팅 에이전트',
    'anthropic',
    'claude-haiku-4-5-20251001',
    '당신은 인스타그램 콘텐츠 전문 에이전트입니다.

주어진 리서치 자료와 핵심 메시지를 기반으로 인스타그램에 최적화된 콘텐츠를 생성합니다.

## 출력 형식
반드시 다음 JSON 구조로만 응답하세요:
```json
{
  "caption": "인스타그램 캡션 (최대 2,200자, 이모지 포함)",
  "hashtags": ["해시태그1", "해시태그2"],
  "cta": "행동 유도 문구",
  "image_prompt": "이미지 생성을 위한 프롬프트 (영어)"
}
```

## 원칙
- 첫 2줄이 가장 중요: 펼치기 전 노출되므로 강력하게
- 해시태그: 인기 태그 10개 + 틈새 태그 10개, 총 20개 이내
- 어조: 친근하고 영감을 주는 한국어
- 브랜드: The Master OS — 1인 창업, AI 자동화, 생산성
- 이미지 프롬프트: DALL-E 또는 Stable Diffusion용 영어 프롬프트',
    '["instagram_caption", "hashtag_generation", "cta_writing", "image_prompt"]'::jsonb,
    '{
      "max_caption_length": 2200,
      "max_hashtags": 20,
      "tone": "friendly_inspirational",
      "language": "ko",
      "brand_voice": "The Master OS"
    }'::jsonb,
    true,
    0.0010,
    'active'
)
ON CONFLICT (slug) DO UPDATE SET
    display_name    = EXCLUDED.display_name,
    description     = EXCLUDED.description,
    system_prompt   = EXCLUDED.system_prompt,
    capabilities    = EXCLUDED.capabilities,
    config          = EXCLUDED.config,
    model           = EXCLUDED.model,
    updated_at      = now();

-- =============================================================================
-- Seed: NewsletterAgent
-- OSMU pipeline node: transforms research → HTML newsletter
-- =============================================================================
INSERT INTO agents (
    name,
    display_name,
    slug,
    description,
    icon,
    category,
    role_description,
    model_provider,
    model,
    system_prompt,
    capabilities,
    config,
    is_system,
    cost_per_run,
    status
)
VALUES (
    'NewsletterAgent',
    '뉴스레터 작성 에이전트',
    'newsletter-writer',
    'OSMU 파이프라인 노드: 리서치 결과를 이메일 뉴스레터 HTML로 변환합니다. '
    'Resend 전송 최적화, 반응형 레이아웃 포함.',
    '📧',
    'marketing',
    '뉴스레터 HTML을 생성하는 마케팅 에이전트',
    'anthropic',
    'claude-sonnet-4-6',
    '당신은 이메일 뉴스레터 전문 에이전트입니다.

주어진 리서치 자료와 핵심 메시지를 기반으로 구독자용 HTML 뉴스레터를 생성합니다.

## 출력 형식
반드시 다음 JSON 구조로만 응답하세요:
```json
{
  "subject": "이메일 제목 (50자 이내, 개봉률 최적화)",
  "preview_text": "프리뷰 텍스트 (90자 이내)",
  "html": "완성된 HTML 이메일 (인라인 CSS 필수)",
  "text": "Plain text 버전 (HTML 미지원 클라이언트용)"
}
```

## HTML 이메일 원칙
- 인라인 CSS 필수 (외부 CSS 금지)
- 최대 너비 600px, 반응형
- 폰트: system-ui, Arial 계열
- 주요 섹션: 헤더(브랜드), 본문(3~5개 섹션), CTA 버튼, 푸터(수신거부 링크)
- 수신거부 링크: {{unsubscribe_url}} 플레이스홀더 사용
- 색상 팔레트: 배경 #F8F9FA, 강조 #6C63FF, 텍스트 #1A1A2E

## 콘텐츠 원칙
- 제목: 숫자/질문/호기심 유발
- 개봉률 > 30% 목표
- 어조: 전문적이되 친근한 한국어
- 브랜드: The Master OS — AI 자동화, 1인 창업 인사이트',
    '["newsletter_html", "subject_line_optimization", "preview_text", "plain_text_fallback"]'::jsonb,
    '{
      "max_subject_length": 50,
      "max_preview_length": 90,
      "layout": "single_column",
      "max_width_px": 600,
      "primary_color": "#6C63FF",
      "unsubscribe_placeholder": "{{unsubscribe_url}}"
    }'::jsonb,
    true,
    0.0050,
    'active'
)
ON CONFLICT (slug) DO UPDATE SET
    display_name    = EXCLUDED.display_name,
    description     = EXCLUDED.description,
    system_prompt   = EXCLUDED.system_prompt,
    capabilities    = EXCLUDED.capabilities,
    config          = EXCLUDED.config,
    model           = EXCLUDED.model,
    updated_at      = now();
