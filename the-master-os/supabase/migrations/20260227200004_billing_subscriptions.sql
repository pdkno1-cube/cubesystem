-- =============================================================================
-- Migration: Billing Subscriptions + Budget Alerts
-- The Master OS — Stripe 결제 인터페이스, 예산 알림, 자동 정지 기반 테이블
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. subscription_plans — 구독 플랜 정의
-- ---------------------------------------------------------------------------

CREATE TABLE subscription_plans (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    slug             TEXT NOT NULL UNIQUE,
    credits_per_month INTEGER NOT NULL DEFAULT 0,
    price_usd        DECIMAL(10,2) NOT NULL DEFAULT 0,
    features         JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscription_plans_slug ON subscription_plans(slug);
CREATE INDEX idx_subscription_plans_active ON subscription_plans(is_active);

-- ---------------------------------------------------------------------------
-- 2. workspace_subscriptions — 워크스페이스별 구독 상태
-- ---------------------------------------------------------------------------

CREATE TABLE workspace_subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id            UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    plan_id                 UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_workspace_subscriptions_workspace UNIQUE(workspace_id)
);

CREATE INDEX idx_workspace_subscriptions_workspace ON workspace_subscriptions(workspace_id);
CREATE INDEX idx_workspace_subscriptions_status ON workspace_subscriptions(status);
CREATE INDEX idx_workspace_subscriptions_stripe ON workspace_subscriptions(stripe_subscription_id);

-- Auto-update updated_at
CREATE TRIGGER trg_workspace_subscriptions_updated_at
    BEFORE UPDATE ON workspace_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. budget_alerts — 예산 알림 설정
-- ---------------------------------------------------------------------------

CREATE TABLE budget_alerts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    threshold_percent INTEGER NOT NULL DEFAULT 80
                      CHECK (threshold_percent >= 1 AND threshold_percent <= 100),
    alert_type        TEXT NOT NULL DEFAULT 'email'
                      CHECK (alert_type IN ('email', 'slack', 'both')),
    is_enabled        BOOLEAN NOT NULL DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_budget_alerts_workspace UNIQUE(workspace_id)
);

CREATE INDEX idx_budget_alerts_workspace ON budget_alerts(workspace_id);
CREATE INDEX idx_budget_alerts_enabled ON budget_alerts(is_enabled);

-- ---------------------------------------------------------------------------
-- 4. Seed: 3개 기본 플랜 (Free / Pro / Enterprise)
-- ---------------------------------------------------------------------------

INSERT INTO subscription_plans (name, slug, credits_per_month, price_usd, features, is_active)
VALUES
    (
        'Free',
        'free',
        1000,
        0.00,
        '["1,000 크레딧/월", "기본 에이전트 5개", "커뮤니티 지원", "기본 분석"]'::jsonb,
        true
    ),
    (
        'Pro',
        'pro',
        10000,
        29.00,
        '["10,000 크레딧/월", "무제한 에이전트", "우선 지원", "고급 분석", "커스텀 파이프라인", "API 접근"]'::jsonb,
        true
    ),
    (
        'Enterprise',
        'enterprise',
        -1,
        99.00,
        '["무제한 크레딧", "무제한 에이전트", "전담 지원", "고급 분석", "커스텀 파이프라인", "API 접근", "SSO", "감사 로그", "SLA 보장"]'::jsonb,
        true
    );
