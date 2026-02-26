-- =============================================================================
-- Migration: Create MCP Connections, Secret Vault
-- The Master OS — External Integration & Security Tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: secret_vault
-- NOTE: secret_vault must be created BEFORE mcp_connections due to FK reference
-- -----------------------------------------------------------------------------
CREATE TABLE secret_vault (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    encrypted_value TEXT NOT NULL,
    iv              TEXT NOT NULL,
    auth_tag        TEXT NOT NULL,
    key_version     INTEGER NOT NULL DEFAULT 1,
    category        TEXT NOT NULL DEFAULT 'api_key'
                    CHECK (category IN (
                        'api_key', 'oauth_token', 'password',
                        'certificate', 'webhook_secret', 'other'
                    )),
    service_name    TEXT,
    description     TEXT,
    expires_at      TIMESTAMPTZ,
    last_rotated_at TIMESTAMPTZ,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_sv_workspace ON secret_vault(workspace_id);
CREATE UNIQUE INDEX idx_sv_workspace_name ON secret_vault(workspace_id, name)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_sv_expires ON secret_vault(expires_at)
    WHERE expires_at IS NOT NULL;

-- Auto-update updated_at
CREATE TRIGGER trg_secret_vault_updated_at
    BEFORE UPDATE ON secret_vault
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Table: mcp_connections
-- -----------------------------------------------------------------------------
CREATE TABLE mcp_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    service_name    TEXT NOT NULL,
    service_type    TEXT NOT NULL DEFAULT 'external'
                    CHECK (service_type IN ('external', 'internal', 'custom')),
    provider        TEXT NOT NULL
                    CHECK (provider IN (
                        'firecrawl', 'paddleocr', 'google_drive',
                        'figma', 'slack', 'custom'
                    )),
    endpoint_url    TEXT NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    auth_method     TEXT NOT NULL DEFAULT 'api_key'
                    CHECK (auth_method IN ('api_key', 'oauth2', 'basic', 'none')),
    secret_ref      UUID REFERENCES secret_vault(id),
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'error')),
    health_status   TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (health_status IN ('healthy', 'degraded', 'down', 'unknown')),
    last_health_check TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT uq_mcp_workspace_slug UNIQUE(workspace_id, slug)
);

-- Indexes
CREATE INDEX idx_mcp_workspace ON mcp_connections(workspace_id);
CREATE INDEX idx_mcp_provider ON mcp_connections(provider);
CREATE INDEX idx_mcp_service_workspace ON mcp_connections(service_name, workspace_id);

-- Auto-update updated_at
CREATE TRIGGER trg_mcp_connections_updated_at
    BEFORE UPDATE ON mcp_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
