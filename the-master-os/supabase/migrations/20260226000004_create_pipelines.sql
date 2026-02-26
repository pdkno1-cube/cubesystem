-- =============================================================================
-- Migration: Create Pipelines, Pipeline Executions, Pipeline Steps
-- The Master OS — Workflow Pipeline Tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: pipelines
-- -----------------------------------------------------------------------------
CREATE TABLE pipelines (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    slug              TEXT NOT NULL UNIQUE,
    description       TEXT,
    category          TEXT NOT NULL
                      CHECK (category IN (
                          'grant_factory', 'document_verification',
                          'osmu_marketing', 'auto_healing', 'custom'
                      )),
    graph_definition  JSONB NOT NULL,
    required_agents   JSONB NOT NULL DEFAULT '[]'::jsonb,
    required_mcps     JSONB NOT NULL DEFAULT '[]'::jsonb,
    default_config    JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_system_default BOOLEAN NOT NULL DEFAULT false,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    version           INTEGER NOT NULL DEFAULT 1,
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ
);

-- Indexes
CREATE UNIQUE INDEX idx_pipelines_slug ON pipelines(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_pipelines_category ON pipelines(category);

-- Auto-update updated_at
CREATE TRIGGER trg_pipelines_updated_at
    BEFORE UPDATE ON pipelines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Table: pipeline_executions
-- -----------------------------------------------------------------------------
CREATE TABLE pipeline_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id     UUID NOT NULL REFERENCES pipelines(id),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id),
    triggered_by    UUID NOT NULL REFERENCES users(id),
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                        'pending', 'running', 'completed',
                        'failed', 'cancelled', 'paused'
                    )),
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    input_params    JSONB NOT NULL DEFAULT '{}'::jsonb,
    result          JSONB,
    output_result   JSONB,
    error_message   TEXT,
    total_credits   DECIMAL(10,4) NOT NULL DEFAULT 0.0,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_pe_workspace ON pipeline_executions(workspace_id);
CREATE INDEX idx_pe_pipeline ON pipeline_executions(pipeline_id);
CREATE INDEX idx_pe_status ON pipeline_executions(status)
    WHERE status IN ('pending', 'running');
CREATE INDEX idx_pe_workspace_created ON pipeline_executions(workspace_id, created_at DESC);

-- Auto-update updated_at
CREATE TRIGGER trg_pipeline_executions_updated_at
    BEFORE UPDATE ON pipeline_executions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Table: pipeline_steps
-- -----------------------------------------------------------------------------
CREATE TABLE pipeline_steps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id    UUID NOT NULL REFERENCES pipeline_executions(id) ON DELETE CASCADE,
    step_name       TEXT NOT NULL,
    step_order      INTEGER NOT NULL,
    agent_id        UUID REFERENCES agents(id),
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                        'pending', 'running', 'completed',
                        'failed', 'skipped', 'retrying'
                    )),
    input_data      JSONB,
    output_data     JSONB,
    error_message   TEXT,
    credits_used    DECIMAL(10,4) NOT NULL DEFAULT 0.0,
    retry_count     INTEGER NOT NULL DEFAULT 0,
    max_retries     INTEGER NOT NULL DEFAULT 3,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ps_execution ON pipeline_steps(execution_id);
CREATE INDEX idx_ps_execution_order ON pipeline_steps(execution_id, step_order);
CREATE INDEX idx_ps_status ON pipeline_steps(status)
    WHERE status IN ('pending', 'running');

-- Auto-update updated_at
CREATE TRIGGER trg_pipeline_steps_updated_at
    BEFORE UPDATE ON pipeline_steps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
