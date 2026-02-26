-- =============================================================================
-- Migration: Create Agents, Agent Assignments
-- The Master OS — AI Agent Management Tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: agents
-- -----------------------------------------------------------------------------
CREATE TABLE agents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    description     TEXT,
    icon            TEXT,
    category        TEXT NOT NULL
                    CHECK (category IN (
                        'planning', 'writing', 'marketing',
                        'audit', 'devops', 'ocr', 'scraping',
                        'analytics', 'finance', 'general'
                    )),
    role_description TEXT,
    model_provider  TEXT NOT NULL DEFAULT 'openai'
                    CHECK (model_provider IN ('openai', 'anthropic', 'google', 'local')),
    model           TEXT NOT NULL DEFAULT 'gpt-4o',
    system_prompt   TEXT NOT NULL,
    capabilities    JSONB NOT NULL DEFAULT '[]'::jsonb,
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    parameters      JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_system       BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    cost_per_run    DECIMAL(10,4) NOT NULL DEFAULT 0.0,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'deprecated')),
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- Indexes
CREATE UNIQUE INDEX idx_agents_slug ON agents(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_category ON agents(category);
CREATE INDEX idx_agents_active ON agents(is_active) WHERE is_active = true;

-- Auto-update updated_at
CREATE TRIGGER trg_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Table: agent_assignments
-- -----------------------------------------------------------------------------
CREATE TABLE agent_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    assigned_by     UUID NOT NULL REFERENCES users(id),
    position_x      FLOAT,
    position_y      FLOAT,
    config_override JSONB DEFAULT '{}'::jsonb,
    status          TEXT NOT NULL DEFAULT 'idle'
                    CHECK (status IN ('idle', 'running', 'paused', 'error')),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- Unique constraint: one active assignment per agent+workspace (where not released)
CREATE UNIQUE INDEX idx_aa_unique_active ON agent_assignments(agent_id, workspace_id)
    WHERE released_at IS NULL;

-- Indexes
CREATE INDEX idx_aa_workspace ON agent_assignments(workspace_id);
CREATE INDEX idx_aa_agent ON agent_assignments(agent_id);
CREATE INDEX idx_aa_status ON agent_assignments(status) WHERE status = 'running';

-- Auto-update updated_at
CREATE TRIGGER trg_agent_assignments_updated_at
    BEFORE UPDATE ON agent_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
