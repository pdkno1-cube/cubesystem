-- =============================================================================
-- Migration: Create Credit Limits
-- The Master OS — Per-workspace credit limit settings
-- =============================================================================

CREATE TABLE credit_limits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    monthly_limit   DECIMAL(18,6) NOT NULL DEFAULT 0,
    auto_stop       BOOLEAN NOT NULL DEFAULT false,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_credit_limits_workspace UNIQUE(workspace_id)
);

CREATE INDEX idx_credit_limits_workspace ON credit_limits(workspace_id);

-- Auto-update updated_at
CREATE TRIGGER trg_credit_limits_updated_at
    BEFORE UPDATE ON credit_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
