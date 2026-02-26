-- =============================================================================
-- Migration: Create Credits, Audit Logs
-- The Master OS — Financial & Audit Tracking Tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: credits
-- INSERT-only ledger table (no UPDATE by design)
-- -----------------------------------------------------------------------------
CREATE TABLE credits (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    agent_id          UUID REFERENCES agents(id),
    transaction_type  TEXT NOT NULL
                      CHECK (transaction_type IN (
                          'usage', 'allocation', 'refund', 'adjustment',
                          'charge', 'bonus'
                      )),
    amount            DECIMAL(18,6) NOT NULL,
    balance_after     DECIMAL(18,6) NOT NULL,
    description       TEXT,
    reference_type    TEXT,
    reference_id      UUID,
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes (INSERT-only table, no updated_at needed)
CREATE INDEX idx_credits_workspace ON credits(workspace_id);
CREATE INDEX idx_credits_workspace_created ON credits(workspace_id, created_at DESC);
CREATE INDEX idx_credits_ref ON credits(reference_type, reference_id)
    WHERE reference_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Table: audit_logs
-- INSERT-only immutable audit trail
-- -----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID REFERENCES workspaces(id),
    user_id         UUID REFERENCES users(id),
    agent_id        UUID REFERENCES agents(id),
    action          VARCHAR NOT NULL,
    category        VARCHAR NOT NULL,
    resource_type   VARCHAR,
    resource_id     UUID,
    details         JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address      INET,
    user_agent      TEXT,
    severity        TEXT NOT NULL DEFAULT 'info'
                    CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_al_workspace ON audit_logs(workspace_id)
    WHERE workspace_id IS NOT NULL;
CREATE INDEX idx_al_user ON audit_logs(user_id)
    WHERE user_id IS NOT NULL;
CREATE INDEX idx_al_action ON audit_logs(action);
CREATE INDEX idx_al_category ON audit_logs(category);
CREATE INDEX idx_al_workspace_created ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX idx_al_severity ON audit_logs(severity)
    WHERE severity IN ('error', 'critical');

-- -----------------------------------------------------------------------------
-- Security: Prevent UPDATE/DELETE on audit_logs (AUDIT-01 from security review)
-- Ensures immutability of the audit trail at DB level
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs modification is prohibited: % operation attempted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_modify_audit_logs
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
