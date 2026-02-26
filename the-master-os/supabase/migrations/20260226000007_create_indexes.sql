-- =============================================================================
-- Migration: Create Additional Indexes
-- The Master OS — Performance Optimization Indexes
-- =============================================================================
-- This migration consolidates supplementary indexes beyond those already
-- created inline with each table. Indexes already defined in prior migrations
-- are listed as comments for reference; only net-new indexes are created here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- workspaces
-- -----------------------------------------------------------------------------
-- ALREADY EXISTS: idx_workspaces_owner (owner_id)
-- ALREADY EXISTS: idx_workspaces_slug (slug, partial unique WHERE deleted_at IS NULL)
-- ALREADY EXISTS: idx_workspaces_deleted_at (deleted_at WHERE NOT NULL)

-- Status-based filtering
CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);

-- -----------------------------------------------------------------------------
-- workspace_members
-- -----------------------------------------------------------------------------
-- ALREADY EXISTS: uq_workspace_members (workspace_id, user_id) unique constraint
-- ALREADY EXISTS: idx_wm_workspace (workspace_id)
-- ALREADY EXISTS: idx_wm_user (user_id)

-- Role-based filtering within workspace
CREATE INDEX IF NOT EXISTS idx_wm_role ON workspace_members(workspace_id, role)
    WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- agent_assignments
-- -----------------------------------------------------------------------------
-- ALREADY EXISTS: idx_aa_workspace (workspace_id)
-- ALREADY EXISTS: idx_aa_agent (agent_id)
-- ALREADY EXISTS: idx_aa_unique_active (agent_id, workspace_id) WHERE released_at IS NULL
-- ALREADY EXISTS: idx_aa_status (status) WHERE status = 'running'

-- Active assignments per agent (for finding free agents)
CREATE INDEX IF NOT EXISTS idx_aa_agent_active ON agent_assignments(agent_id)
    WHERE released_at IS NULL AND deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- pipeline_executions
-- -----------------------------------------------------------------------------
-- ALREADY EXISTS: idx_pe_workspace (workspace_id)
-- ALREADY EXISTS: idx_pe_pipeline (pipeline_id)
-- ALREADY EXISTS: idx_pe_status (status) WHERE status IN ('pending', 'running')
-- ALREADY EXISTS: idx_pe_workspace_created (workspace_id, created_at DESC)

-- Composite for dashboard queries: recent executions by workspace+status
CREATE INDEX IF NOT EXISTS idx_pe_workspace_status ON pipeline_executions(workspace_id, status);

-- triggered_by for user activity tracking
CREATE INDEX IF NOT EXISTS idx_pe_triggered_by ON pipeline_executions(triggered_by);

-- -----------------------------------------------------------------------------
-- pipeline_steps
-- -----------------------------------------------------------------------------
-- ALREADY EXISTS: idx_ps_execution (execution_id)
-- ALREADY EXISTS: idx_ps_execution_order (execution_id, step_order)
-- ALREADY EXISTS: idx_ps_status (status) WHERE status IN ('pending', 'running')

-- Agent performance tracking
CREATE INDEX IF NOT EXISTS idx_ps_agent ON pipeline_steps(agent_id)
    WHERE agent_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- mcp_connections
-- -----------------------------------------------------------------------------
-- ALREADY EXISTS: idx_mcp_workspace (workspace_id)
-- ALREADY EXISTS: idx_mcp_provider (provider)
-- ALREADY EXISTS: idx_mcp_service_workspace (service_name, workspace_id)

-- Health monitoring queries
CREATE INDEX IF NOT EXISTS idx_mcp_health ON mcp_connections(health_status)
    WHERE is_active = true;

-- -----------------------------------------------------------------------------
-- secret_vault
-- -----------------------------------------------------------------------------
-- ALREADY EXISTS: idx_sv_workspace (workspace_id)
-- ALREADY EXISTS: idx_sv_workspace_name (workspace_id, name) unique WHERE deleted_at IS NULL
-- ALREADY EXISTS: idx_sv_expires (expires_at) WHERE expires_at IS NOT NULL

-- Key version tracking for rotation
CREATE INDEX IF NOT EXISTS idx_sv_key_version ON secret_vault(key_version);

-- -----------------------------------------------------------------------------
-- credits
-- -----------------------------------------------------------------------------
-- ALREADY EXISTS: idx_credits_workspace (workspace_id)
-- ALREADY EXISTS: idx_credits_workspace_created (workspace_id, created_at DESC)
-- ALREADY EXISTS: idx_credits_ref (reference_type, reference_id)

-- Transaction type filtering
CREATE INDEX IF NOT EXISTS idx_credits_type ON credits(workspace_id, transaction_type);

-- Agent cost tracking
CREATE INDEX IF NOT EXISTS idx_credits_agent ON credits(agent_id)
    WHERE agent_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- audit_logs
-- -----------------------------------------------------------------------------
-- ALREADY EXISTS: idx_al_workspace (workspace_id) WHERE workspace_id IS NOT NULL
-- ALREADY EXISTS: idx_al_user (user_id) WHERE user_id IS NOT NULL
-- ALREADY EXISTS: idx_al_action (action)
-- ALREADY EXISTS: idx_al_category (category)
-- ALREADY EXISTS: idx_al_workspace_created (workspace_id, created_at DESC)
-- ALREADY EXISTS: idx_al_severity (severity) WHERE severity IN ('error', 'critical')

-- Resource lookup
CREATE INDEX IF NOT EXISTS idx_al_resource ON audit_logs(resource_type, resource_id)
    WHERE resource_id IS NOT NULL;

-- Time-based global queries
CREATE INDEX IF NOT EXISTS idx_al_created ON audit_logs(created_at DESC);
