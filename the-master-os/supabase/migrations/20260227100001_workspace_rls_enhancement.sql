-- =============================================================================
-- Migration: Workspace RLS Enhancement + Marketing Table User Policies
-- The Master OS — F-02: Workspace RLS Auto-Trigger + CRUD Enhancement
-- =============================================================================
-- Summary:
--   1. Add user-facing RLS policies for marketing tables (newsletter_subscribers,
--      content_schedules, content_metrics) so authenticated workspace members
--      can read their own workspace data (service_role policies already exist).
--   2. Validate auto-owner trigger exists (already in migration 002).
--   3. Ensure workspace status column consistency.
-- =============================================================================

-- =============================================================================
-- 1. User-facing RLS policies for marketing tables
--    (service_role policies were added in migration 009; these add workspace-
--     member-scoped SELECT/INSERT/UPDATE for the authenticated role)
-- =============================================================================

-- ── newsletter_subscribers ──────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'ns_workspace_select'
          AND tablename = 'newsletter_subscribers'
    ) THEN
        EXECUTE 'CREATE POLICY ns_workspace_select ON newsletter_subscribers
            FOR SELECT
            USING (workspace_id IN (SELECT public.user_workspace_ids()))';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'ns_workspace_insert'
          AND tablename = 'newsletter_subscribers'
    ) THEN
        EXECUTE 'CREATE POLICY ns_workspace_insert ON newsletter_subscribers
            FOR INSERT
            WITH CHECK (workspace_id IN (SELECT public.user_admin_workspace_ids()))';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'ns_workspace_update'
          AND tablename = 'newsletter_subscribers'
    ) THEN
        EXECUTE 'CREATE POLICY ns_workspace_update ON newsletter_subscribers
            FOR UPDATE
            USING (workspace_id IN (SELECT public.user_admin_workspace_ids()))
            WITH CHECK (workspace_id IN (SELECT public.user_admin_workspace_ids()))';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'ns_workspace_delete'
          AND tablename = 'newsletter_subscribers'
    ) THEN
        EXECUTE 'CREATE POLICY ns_workspace_delete ON newsletter_subscribers
            FOR DELETE
            USING (workspace_id IN (SELECT public.user_owner_workspace_ids()))';
    END IF;
END $$;

-- ── content_schedules ───────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'cs_workspace_select'
          AND tablename = 'content_schedules'
    ) THEN
        EXECUTE 'CREATE POLICY cs_workspace_select ON content_schedules
            FOR SELECT
            USING (workspace_id IN (SELECT public.user_workspace_ids()))';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'cs_workspace_insert'
          AND tablename = 'content_schedules'
    ) THEN
        EXECUTE 'CREATE POLICY cs_workspace_insert ON content_schedules
            FOR INSERT
            WITH CHECK (
                workspace_id IN (SELECT public.user_workspace_ids())
                AND created_by = auth.uid()
            )';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'cs_workspace_update'
          AND tablename = 'content_schedules'
    ) THEN
        EXECUTE 'CREATE POLICY cs_workspace_update ON content_schedules
            FOR UPDATE
            USING (workspace_id IN (SELECT public.user_admin_workspace_ids()))
            WITH CHECK (workspace_id IN (SELECT public.user_admin_workspace_ids()))';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'cs_workspace_delete'
          AND tablename = 'content_schedules'
    ) THEN
        EXECUTE 'CREATE POLICY cs_workspace_delete ON content_schedules
            FOR DELETE
            USING (workspace_id IN (SELECT public.user_owner_workspace_ids()))';
    END IF;
END $$;

-- ── content_metrics ─────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'cm_workspace_select'
          AND tablename = 'content_metrics'
    ) THEN
        EXECUTE 'CREATE POLICY cm_workspace_select ON content_metrics
            FOR SELECT
            USING (workspace_id IN (SELECT public.user_workspace_ids()))';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'cm_workspace_insert'
          AND tablename = 'content_metrics'
    ) THEN
        EXECUTE 'CREATE POLICY cm_workspace_insert ON content_metrics
            FOR INSERT
            WITH CHECK (workspace_id IN (SELECT public.user_admin_workspace_ids()))';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'cm_workspace_update'
          AND tablename = 'content_metrics'
    ) THEN
        EXECUTE 'CREATE POLICY cm_workspace_update ON content_metrics
            FOR UPDATE
            USING (workspace_id IN (SELECT public.user_admin_workspace_ids()))
            WITH CHECK (workspace_id IN (SELECT public.user_admin_workspace_ids()))';
    END IF;
END $$;

-- =============================================================================
-- 2. Validate auto_add_workspace_owner trigger exists (idempotent)
--    Originally created in migration 002 — this is a safety net.
-- =============================================================================
CREATE OR REPLACE FUNCTION auto_add_workspace_owner()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
    VALUES (NEW.id, NEW.owner_id, 'owner', now())
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists (DROP + CREATE is idempotent)
DROP TRIGGER IF EXISTS trg_workspace_auto_owner ON workspaces;
CREATE TRIGGER trg_workspace_auto_owner
    AFTER INSERT ON workspaces
    FOR EACH ROW EXECUTE FUNCTION auto_add_workspace_owner();

-- =============================================================================
-- 3. Add index for workspace status queries (if not exists)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_workspaces_status
    ON workspaces(status) WHERE status = 'active';

-- =============================================================================
-- 4. Helper view: workspace member counts (for efficient listing)
-- =============================================================================
CREATE OR REPLACE VIEW workspace_member_counts AS
SELECT
    workspace_id,
    COUNT(*) FILTER (WHERE deleted_at IS NULL) AS member_count
FROM workspace_members
GROUP BY workspace_id;
