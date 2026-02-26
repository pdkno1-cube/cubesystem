-- =============================================================================
-- Migration: Row Level Security (RLS) Policies
-- The Master OS — Access Control
-- =============================================================================
-- Security review references applied:
--   RLS-01: audit_logs operator precedence fix (Critical)
--   RLS-02: agents table RLS (High)
--   RLS-03: pipelines table RLS (High)
--   RLS-04: pipeline_steps table RLS (High)
--   RLS-06: workspace_members self-reference consideration
--   RLS-07: workspace owner auto-insert trigger (applied in migration 002)
-- =============================================================================

-- =============================================================================
-- Enable RLS on ALL tables
-- =============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Helper function: Get workspace IDs the current user belongs to
-- SECURITY DEFINER + STABLE for RLS performance
-- =============================================================================
CREATE OR REPLACE FUNCTION public.user_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT workspace_id
    FROM workspace_members
    WHERE user_id = auth.uid()
    AND deleted_at IS NULL;
$$;

-- Helper: Get workspace IDs where user has owner or admin role
CREATE OR REPLACE FUNCTION public.user_admin_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT workspace_id
    FROM workspace_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND deleted_at IS NULL;
$$;

-- Helper: Get workspace IDs where user has owner role
CREATE OR REPLACE FUNCTION public.user_owner_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT workspace_id
    FROM workspace_members
    WHERE user_id = auth.uid()
    AND role = 'owner'
    AND deleted_at IS NULL;
$$;

-- =============================================================================
-- 1. users — Self access only
-- =============================================================================
CREATE POLICY users_select_self ON users
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY users_update_self ON users
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- =============================================================================
-- 2. workspaces — Owner + members via workspace_members
-- =============================================================================
-- SELECT: owner or any workspace member
CREATE POLICY workspaces_select ON workspaces
    FOR SELECT
    USING (
        owner_id = auth.uid()
        OR id IN (SELECT public.user_workspace_ids())
    );

-- INSERT: any authenticated user can create a workspace
CREATE POLICY workspaces_insert ON workspaces
    FOR INSERT
    WITH CHECK (owner_id = auth.uid());

-- UPDATE: owner only
CREATE POLICY workspaces_update ON workspaces
    FOR UPDATE
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- DELETE (soft): owner only
CREATE POLICY workspaces_delete ON workspaces
    FOR DELETE
    USING (owner_id = auth.uid());

-- =============================================================================
-- 3. workspace_members — Members of the same workspace
-- =============================================================================
-- SELECT: members can see other members in their workspaces
CREATE POLICY wm_select ON workspace_members
    FOR SELECT
    USING (
        workspace_id IN (SELECT public.user_workspace_ids())
    );

-- INSERT: owner/admin of the workspace can add members
CREATE POLICY wm_insert ON workspace_members
    FOR INSERT
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

-- UPDATE: owner/admin can update member roles
CREATE POLICY wm_update ON workspace_members
    FOR UPDATE
    USING (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    )
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

-- DELETE: owner only can remove members
CREATE POLICY wm_delete ON workspace_members
    FOR DELETE
    USING (
        workspace_id IN (SELECT public.user_owner_workspace_ids())
    );

-- =============================================================================
-- 4. agents — System agents visible to all, custom agents by creator/workspace
-- (Security review RLS-02: agents table RLS)
-- =============================================================================
-- SELECT: system agents are public; non-system agents visible to authenticated users
-- In Phase 0 (single-tenant), all agents are readable by authenticated users.
-- For B2B multi-tenant, restrict custom agents to their creator's workspaces.
CREATE POLICY agents_select ON agents
    FOR SELECT
    USING (
        is_system = true
        OR created_by = auth.uid()
        OR auth.uid() IS NOT NULL  -- Phase 0: all authenticated users see all agents
    );

-- INSERT: any authenticated user can create custom agents
CREATE POLICY agents_insert ON agents
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND created_by = auth.uid()
    );

-- UPDATE: creator or system admin (owner role)
CREATE POLICY agents_update ON agents
    FOR UPDATE
    USING (
        created_by = auth.uid()
        OR auth.uid() IN (SELECT id FROM users WHERE role = 'owner' AND deleted_at IS NULL)
    )
    WITH CHECK (
        created_by = auth.uid()
        OR auth.uid() IN (SELECT id FROM users WHERE role = 'owner' AND deleted_at IS NULL)
    );

-- DELETE: creator or system admin (owner role)
CREATE POLICY agents_delete ON agents
    FOR DELETE
    USING (
        created_by = auth.uid()
        OR auth.uid() IN (SELECT id FROM users WHERE role = 'owner' AND deleted_at IS NULL)
    );

-- =============================================================================
-- 5. agent_assignments — Workspace members
-- =============================================================================
-- SELECT: workspace members
CREATE POLICY aa_select ON agent_assignments
    FOR SELECT
    USING (
        workspace_id IN (SELECT public.user_workspace_ids())
    );

-- INSERT: owner/admin/member can assign agents
CREATE POLICY aa_insert ON agent_assignments
    FOR INSERT
    WITH CHECK (
        workspace_id IN (SELECT public.user_workspace_ids())
        AND assigned_by = auth.uid()
    );

-- UPDATE: owner/admin can update assignments
CREATE POLICY aa_update ON agent_assignments
    FOR UPDATE
    USING (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    )
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

-- DELETE: owner/admin can remove assignments
CREATE POLICY aa_delete ON agent_assignments
    FOR DELETE
    USING (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

-- =============================================================================
-- 6. pipelines — System pipelines visible to all, custom by creator
-- (Security review RLS-03: pipelines table RLS)
-- =============================================================================
CREATE POLICY pipelines_select ON pipelines
    FOR SELECT
    USING (
        is_system_default = true
        OR created_by = auth.uid()
        OR auth.uid() IS NOT NULL  -- Phase 0: all authenticated users
    );

CREATE POLICY pipelines_insert ON pipelines
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND created_by = auth.uid()
    );

CREATE POLICY pipelines_update ON pipelines
    FOR UPDATE
    USING (
        created_by = auth.uid()
        OR auth.uid() IN (SELECT id FROM users WHERE role = 'owner' AND deleted_at IS NULL)
    )
    WITH CHECK (
        created_by = auth.uid()
        OR auth.uid() IN (SELECT id FROM users WHERE role = 'owner' AND deleted_at IS NULL)
    );

CREATE POLICY pipelines_delete ON pipelines
    FOR DELETE
    USING (
        created_by = auth.uid()
        OR auth.uid() IN (SELECT id FROM users WHERE role = 'owner' AND deleted_at IS NULL)
    );

-- =============================================================================
-- 7. pipeline_executions — Workspace members
-- =============================================================================
CREATE POLICY pe_select ON pipeline_executions
    FOR SELECT
    USING (
        workspace_id IN (SELECT public.user_workspace_ids())
    );

CREATE POLICY pe_insert ON pipeline_executions
    FOR INSERT
    WITH CHECK (
        workspace_id IN (SELECT public.user_workspace_ids())
        AND triggered_by = auth.uid()
    );

CREATE POLICY pe_update ON pipeline_executions
    FOR UPDATE
    USING (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    )
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

-- =============================================================================
-- 8. pipeline_steps — Via pipeline_executions workspace access
-- (Security review RLS-04: pipeline_steps table RLS)
-- =============================================================================
CREATE POLICY ps_select ON pipeline_steps
    FOR SELECT
    USING (
        execution_id IN (
            SELECT id FROM pipeline_executions
            WHERE workspace_id IN (SELECT public.user_workspace_ids())
        )
    );

CREATE POLICY ps_insert ON pipeline_steps
    FOR INSERT
    WITH CHECK (
        execution_id IN (
            SELECT id FROM pipeline_executions
            WHERE workspace_id IN (SELECT public.user_workspace_ids())
        )
    );

CREATE POLICY ps_update ON pipeline_steps
    FOR UPDATE
    USING (
        execution_id IN (
            SELECT id FROM pipeline_executions
            WHERE workspace_id IN (SELECT public.user_admin_workspace_ids())
        )
    )
    WITH CHECK (
        execution_id IN (
            SELECT id FROM pipeline_executions
            WHERE workspace_id IN (SELECT public.user_admin_workspace_ids())
        )
    );

-- =============================================================================
-- 9. mcp_connections — Workspace members (read), owner/admin (write)
-- =============================================================================
CREATE POLICY mcp_select ON mcp_connections
    FOR SELECT
    USING (
        workspace_id IN (SELECT public.user_workspace_ids())
    );

CREATE POLICY mcp_insert ON mcp_connections
    FOR INSERT
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

CREATE POLICY mcp_update ON mcp_connections
    FOR UPDATE
    USING (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    )
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

CREATE POLICY mcp_delete ON mcp_connections
    FOR DELETE
    USING (
        workspace_id IN (SELECT public.user_owner_workspace_ids())
    );

-- =============================================================================
-- 10. secret_vault — RESTRICTED ACCESS
-- encrypted_value NEVER returned to client; name-only listing for owner/admin
-- Full access via service_role (server-side only)
-- =============================================================================
-- SELECT: owner/admin can see metadata (name, category, etc.) but NOT encrypted_value
-- NOTE: encrypted_value exclusion is enforced at the API layer (BFF/FastAPI),
-- not at the RLS level. RLS controls row-level access; column-level is app logic.
CREATE POLICY sv_select ON secret_vault
    FOR SELECT
    USING (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

CREATE POLICY sv_insert ON secret_vault
    FOR INSERT
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
        AND created_by = auth.uid()
    );

CREATE POLICY sv_update ON secret_vault
    FOR UPDATE
    USING (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    )
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

CREATE POLICY sv_delete ON secret_vault
    FOR DELETE
    USING (
        workspace_id IN (SELECT public.user_owner_workspace_ids())
    );

-- =============================================================================
-- 11. credits — Workspace members (read), system/admin (write)
-- =============================================================================
CREATE POLICY credits_select ON credits
    FOR SELECT
    USING (
        workspace_id IN (SELECT public.user_workspace_ids())
    );

-- INSERT: owner/admin for manual adjustments; system for automated usage
CREATE POLICY credits_insert ON credits
    FOR INSERT
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

-- No UPDATE/DELETE policies — credits is an immutable ledger

-- =============================================================================
-- 12. audit_logs — SECURITY CRITICAL
-- =============================================================================
-- FIX for RLS-01 (Critical): Operator precedence bug in original ARCH design.
-- Original had: workspace_id IS NULL AND ... OR workspace_id IN (...)
-- SQL evaluates AND before OR, causing viewer access to workspace audit logs.
--
-- Solution: Split into two separate policies with explicit parentheses.
-- Only owner/admin can read audit logs. Viewer access is blocked.
-- =============================================================================

-- SELECT policy for system-level events (workspace_id IS NULL)
-- Only users with global 'owner' role can see system events
CREATE POLICY al_system_access ON audit_logs
    FOR SELECT
    USING (
        workspace_id IS NULL
        AND auth.uid() IN (
            SELECT id FROM users
            WHERE role = 'owner'
            AND deleted_at IS NULL
        )
    );

-- SELECT policy for workspace-level events
-- Only workspace owner/admin can view (viewer explicitly blocked per security review)
CREATE POLICY al_workspace_access ON audit_logs
    FOR SELECT
    USING (
        workspace_id IS NOT NULL
        AND workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

-- INSERT: any authenticated user can create audit log entries
-- (In production, prefer service_role for system-generated logs)
CREATE POLICY al_insert ON audit_logs
    FOR INSERT
    WITH CHECK (true);

-- No UPDATE/DELETE policies — audit_logs is immutable
-- (Enforced additionally by the prevent_audit_modification trigger)
